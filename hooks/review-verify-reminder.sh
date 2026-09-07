#!/usr/bin/env bash
# Stop 훅: 커밋 전 코드 변경이 있으면 "코드리뷰 + 유저테스트 세트"를 상기시킨다.
# 루프 방지: 세션별 센티넬로 한 번 리마인드 → 다음 stop 은 통과(교대).
# 어떤 경우에도 세션을 막지 않도록 실패 시 조용히 통과(exit 0).
set +e
payload="$(cat)"
sid="$(printf '%s' "$payload" | jq -r '.session_id // "x"' 2>/dev/null)"
cwd="$(printf '%s' "$payload" | jq -r '.cwd // "."' 2>/dev/null)"
s="/tmp/claude-rv-${sid}"

# 직전에 이미 리마인드했으면 이번엔 통과하고 센티넬 제거
if [ -f "$s" ]; then rm -f "$s"; exit 0; fi

cd "$cwd" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# 커밋 안 된 코드 파일 변경이 있는가?
if git status --porcelain 2>/dev/null | grep -qiE '\.(ts|tsx|js|jsx|sql|py|go|rs|css)$'; then
  touch "$s"
  printf '%s' '{"decision":"block","reason":"커밋 전 코드 변경이 남아 있어요. 마무리 전에 두 가지를 한 세트로 했는지 확인하세요 — ① /code-review 로 현재 diff 리뷰(버그·문제점), ② verify(또는 dev 서버+브라우저)로 해당 역할 유저처럼 실제 흐름 테스트. 이미 했거나 단순 비코드 변경이면 그대로 마무리해도 됩니다."}'
fi
exit 0
