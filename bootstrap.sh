#!/usr/bin/env bash
# 보픽 Claude Code 환경 설치 스크립트
#
#   bash bootstrap.sh            설치 / 갱신 (여러 번 실행해도 안전)
#   bash bootstrap.sh --dry-run  무엇이 바뀔지만 출력
#
# 기존 ~/.claude/settings.json 은 덮어쓰기 전에 항상 백업합니다.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
ECC_DIR="${ECC_DIR:-$HOME/ecc}"
ECC_REPO="https://github.com/affaan-m/ECC.git"
STAMP="$(date +%Y%m%d-%H%M%S)"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
run()  { if [ "$DRY_RUN" = 1 ]; then printf '  [dry-run] %s\n' "$*"; else eval "$@"; fi; }

# ── 0. 사전 요구사항 ────────────────────────────────────────────────
bold "[0/6] 사전 요구사항 확인"
for cmd in git node npm claude; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd 가 없습니다. 먼저 설치하세요."
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node 18 이상이 필요합니다 (현재 v$NODE_MAJOR)."
ok "git / node v$NODE_MAJOR / npm / claude 확인"

# ── 1. ECC 프레임워크 ───────────────────────────────────────────────
bold "[1/6] ECC 프레임워크 (에이전트 67 · 커맨드 92 · 룰 114)"
if [ -d "$ECC_DIR/.git" ]; then
  run "git -C '$ECC_DIR' pull --ff-only" && ok "ECC 갱신: $ECC_DIR"
else
  run "git clone --depth 1 '$ECC_REPO' '$ECC_DIR'" && ok "ECC 클론: $ECC_DIR"
fi
run "(cd '$ECC_DIR' && ./install.sh --profile full)"
ok "ECC 설치 완료"

# ── 2. 플러그인 마켓플레이스 ────────────────────────────────────────
bold "[2/6] 플러그인"
add_marketplace() {  # $1=source
  if claude plugin marketplace list 2>/dev/null | grep -q "$2"; then
    ok "마켓플레이스 이미 등록: $2"
  else
    run "claude plugin marketplace add '$1'" && ok "마켓플레이스 추가: $2"
  fi
}
add_marketplace "https://github.com/fivetaku/gptaku_plugins.git" "gptaku-plugins"
add_marketplace "mvanhorn/last30days-skill"                      "last30days-skill"
add_marketplace "coreyhaines31/marketingskills"                  "marketingskills"

for p in "insane-search@gptaku-plugins" "last30days@last30days-skill" "marketing-skills@marketingskills"; do
  if claude plugin list 2>/dev/null | grep -q "${p%%@*}"; then
    ok "이미 설치됨: ${p%%@*}"
  else
    run "claude plugin install '$p'" && ok "설치: ${p%%@*}"
  fi
done

# ── 3. 사내 스킬 ────────────────────────────────────────────────────
bold "[3/6] 사내 스킬"
run "mkdir -p '$CLAUDE_DIR/skills'"
for s in "$REPO_DIR"/skills/*/; do
  name="$(basename "$s")"
  run "rsync -a --delete --exclude node_modules '$s' '$CLAUDE_DIR/skills/$name/'"
  ok "스킬: $name"
  if [ -f "$CLAUDE_DIR/skills/$name/package.json" ]; then
    run "(cd '$CLAUDE_DIR/skills/$name' && npm install --silent --no-audit --no-fund)"
    ok "  └ npm 의존성 설치"
  fi
done
if [ -d "$CLAUDE_DIR/skills/competitor-ux-teardown/node_modules/playwright" ] && [ "$DRY_RUN" = 0 ]; then
  (cd "$CLAUDE_DIR/skills/competitor-ux-teardown" && npx playwright install chromium) >/dev/null 2>&1 \
    && ok "  └ Playwright Chromium 준비" || warn "  └ Playwright 브라우저 설치 실패 (수동: npx playwright install chromium)"
fi

# ── 4. 훅 · 스테이터스라인 ──────────────────────────────────────────
bold "[4/6] 훅 · 스테이터스라인"
run "mkdir -p '$CLAUDE_DIR/hooks'"
run "cp '$REPO_DIR/hooks/review-verify-reminder.sh' '$CLAUDE_DIR/hooks/'"
run "chmod +x '$CLAUDE_DIR/hooks/review-verify-reminder.sh'"
ok "훅 설치"
run "cp '$REPO_DIR/config/statusline-combined.js' '$CLAUDE_DIR/'"
ok "스테이터스라인 설치"
if command -v ccusage >/dev/null 2>&1; then
  ok "ccusage 이미 설치됨"
else
  run "npm install -g ccusage" && ok "ccusage 설치 (스테이터스라인 사용량 표시용)"
fi

# ── 5. settings.json ────────────────────────────────────────────────
bold "[5/6] settings.json"
PY312="$(command -v python3.12 || command -v python3 || echo python3)"
if [ -f "$CLAUDE_DIR/settings.json" ]; then
  run "mkdir -p '$CLAUDE_DIR/backups'"
  run "cp '$CLAUDE_DIR/settings.json' '$CLAUDE_DIR/backups/settings.json.$STAMP'"
  warn "기존 settings.json 백업 → backups/settings.json.$STAMP"
fi
if [ "$DRY_RUN" = 0 ]; then
  sed -e "s|__HOME__|$HOME|g" -e "s|__PYTHON312__|$PY312|g" \
      "$REPO_DIR/config/settings.template.json" > "$CLAUDE_DIR/settings.json"
  node -e "JSON.parse(require('fs').readFileSync('$CLAUDE_DIR/settings.json','utf8'))" \
    || die "settings.json 이 유효한 JSON 이 아닙니다. 백업본을 되돌리세요."
  ok "settings.json 설치 (python: $PY312)"
else
  printf '  [dry-run] settings.template.json → ~/.claude/settings.json (__HOME__=%s)\n' "$HOME"
fi

# ── 6. MCP 안내 ─────────────────────────────────────────────────────
bold "[6/6] MCP 서버 (수동 — 각자 키 필요)"
cat <<'MCPHELP'
  MCP 는 개인 API 키가 필요해서 자동 설치하지 않습니다.

    playwright  (키 불필요)
      claude mcp add playwright -- npx @playwright/mcp@latest

    elevenlabs  (개인 키 필요 — elevenlabs.io 에서 발급)
      claude mcp add elevenlabs -e ELEVENLABS_API_KEY=발급받은키 -- uvx elevenlabs-mcp

  ※ 팀 공용 키를 돌려쓰지 마세요. 한 명이 크레딧을 소진하면 전원이 멈춥니다.
  ※ Supabase · Solapi · 토스페이먼츠 MCP 는 프로젝트 저장소의 .mcp.json 에
     들어 있어 해당 저장소를 클론하면 자동으로 붙습니다.
MCPHELP

echo
bold "설치 완료 — Claude Code 를 재시작하면 적용됩니다."
[ "$DRY_RUN" = 1 ] && bold "(dry-run 이었습니다. 실제 변경 없음)"
exit 0
