# 보픽 Claude Code 공통 환경

팀 전원이 같은 에이전트·커맨드·룰·스킬 위에서 작업하기 위한 설치 패키지입니다.

## 설치 (직원용)

```bash
git clone <이 저장소 주소> ~/bopick-claude-setup
cd ~/bopick-claude-setup
bash bootstrap.sh
```

끝나면 **Claude Code 를 재시작**하세요. 무엇이 바뀌는지 먼저 보고 싶으면:

```bash
bash bootstrap.sh --dry-run
```

### 사전 요구사항

| 도구 | 최소 버전 | 확인 |
|---|---|---|
| Node.js | 18+ | `node -v` |
| git | — | `git -v` |
| Claude Code | — | `claude --version` |

## 설치되는 것

| 구성 | 내용 | 출처 |
|---|---|---|
| ECC 프레임워크 | 에이전트 67 · 커맨드 92 · 룰 114 · 훅 · 스크립트 146 | `affaan-m/ECC` (공개) |
| insane-search | 차단된 사이트 접근 (X, 레딧, 네이버, 쿠팡 등) | gptaku-plugins |
| last30days | 최근 30일 여론·시장 리서치 | last30days-skill |
| marketing-skills | 마케팅 스킬 60여 종 | marketingskills |
| competitor-ux-teardown | 경쟁사 화면별 UI/UX 뜯어보기 | 사내 제작 |
| ui-ux-pro-max | UI/UX 디자인 인텔리전스 DB | 번들 |
| settings.json | 훅 13종 · statusline · 모델 기본값 | 사내 표준 |

## 주의

**MCP 키는 각자 발급받으세요.** `bootstrap.sh` 마지막에 명령어가 출력됩니다.
팀 공용 키를 돌려쓰면 한 명이 크레딧을 소진했을 때 전원이 멈춥니다.

**기존 설정은 백업됩니다.** `~/.claude/settings.json` 이 이미 있으면
`~/.claude/backups/settings.json.<타임스탬프>` 로 복사한 뒤 덮어씁니다.
개인 훅을 추가했다면 설치 후 백업본에서 다시 옮기세요.

## 관리자 메모

- 스킬을 고쳤으면 `skills/` 아래에 반영해 커밋 → 직원은 `git pull && bash bootstrap.sh`
- `bootstrap.sh` 는 멱등합니다. 여러 번 실행해도 안전합니다.
- `settings.template.json` 의 `__HOME__` · `__PYTHON312__` 는 설치 시 치환되는
  플레이스홀더입니다. 절대 실제 경로로 바꿔서 커밋하지 마세요.
- 이 저장소에 API 키·토큰을 커밋하지 마세요. 배포 전 아래로 확인:

  ```bash
  grep -rEi '(sk-|sk_|xoxb-|ghp_)[A-Za-z0-9_-]{16,}' . --exclude-dir=.git
  ```

## 포함하지 않은 것

- `agent-observatory` 훅 — `localhost:4000` 로컬 관제 서버 전용
- 부동산 제안서 · 아이 그림책 영상 스킬 — 보픽 업무 범위 밖
- ElevenLabs API 키 — 개인 발급
