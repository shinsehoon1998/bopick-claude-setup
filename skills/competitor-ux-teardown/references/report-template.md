# Report Template

Write to `competitor-teardown/<slug>/<YYYY-MM-DD>/report.md`. Match the user's language.
Keep it scannable: a reader should get the answer from the first screen of text.

```markdown
# {Competitor} UX Teardown - {YYYY-MM-DD}

**분석 목적:** {what decision this feeds}
**범위:** {N} screens, {widths}, {public only | includes logged-in}
**캡처:** ./screens/manifest.json

## 한 줄 결론

{The single most useful sentence. What they are actually good at, and where the opening is.}

## 그들이 파는 것

{Positioning in their own words - the h1, the primary CTA, the pricing model. Quote the
DOM, do not paraphrase from memory.}

## 화면별 분석

### {Screen name} - `{path}`

![fold](./screens/{slug}/fold-1440.png)

- **역할:** {one sentence}
- **할 수 있는 것:** {actions from inventory.json}
- **묻는 것:** {form fields, which are required}
- **잘한 것:** {finding} — `{evidence}`
- **약한 것:** {finding} — `{evidence}`
- **점수:** 접근성 {n}/5 · 모바일 {n}/5 · 성능 {n}/5 · 위계 {n}/5

{Repeat per screen. Keep each to roughly this length - if one screen needs three times
the space, that is itself the finding.}

## 퍼널

{Steps and required fields from landing to first value. Table if more than 3 steps.}

| 단계 | 화면 | 필수 입력 | 이탈 위험 |
|---|---|---|---|

## 디자인 시스템

{Token count, color role naming, spacing scale, type pairing. What it predicts about
their shipping speed.}

## 측정값

| 항목 | 값 | 출처 |
|---|---|---|
| LCP | | inventory.json.vitals |
| CLS | | inventory.json.vitals |
| 320px 가로 오버플로우 | | mobile-audit.json |
| 44px 미만 터치 타깃 | | mobile-audit.json |
| alt 없는 이미지 | | inventory.json.media |
| 콘솔 에러 | | manifest.json |

## 가져올 것 / 피할 것 / 무시할 것

**가져올 것**
1. {specific, transferable} — {which screen, why it beats ours}

**피할 것**
1. {what visibly cost them} — {evidence}

**무시할 것**
1. {impressive but serves a constraint we do not have} — {which constraint}

## 확실하지 않은 것

{Everything that was an impression rather than a measurement. Anything blocked by login,
bot protection, or a cookie wall. Name what a second pass would need to resolve it.}
```

## Rules

- Every screen section carries at least one image reference and at least one quoted piece
  of evidence.
- Numbers come from the JSON files, never from looking at a picture.
- No screenshots of real customer data. If a logged-in screen showed PII, describe the
  pattern in prose and delete the capture.
- Date it and keep the raw captures. Re-running the same path later gives a diff of how
  the competitor changed, which is worth more than any single teardown.
