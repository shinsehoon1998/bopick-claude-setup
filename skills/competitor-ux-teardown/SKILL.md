---
name: competitor-ux-teardown
description: Take a competitor's URL and produce a screen-by-screen teardown - browse the service, capture every meaningful screen at mobile/tablet/desktop, inventory its features from the live DOM, score its UI/UX against usability rules, and write a report with what to copy and what to avoid. Use when the user wants to analyze, benchmark, or tear down another product's web UI. Korean triggers: 경쟁사 분석, 경쟁사 UI 뜯어보기, 벤치마킹, 서비스 분석해줘, UX 감사, 화면별 캡처 분석, 레퍼런스 분석. English triggers: competitor teardown, competitive UX audit, analyze this site's UX, benchmark this product, UI teardown.
---

# Competitor UX Teardown

Turn a link into an evidence-backed teardown. The user gives a URL; you come back with
screenshots, a feature inventory pulled from the live DOM, scored UX findings, and a
short list of what is worth stealing.

## Ground rules - read before touching a browser

These are not style preferences. Breaking them turns research into an incident.

1. **Read-only. Always.** Navigate and scroll. Never click submit, never type into a
   form on their site, never create an account, never upload anything. You are looking
   at someone else's production system with their real customers in it.
2. **No auth bypass.** Only ever see what the user's own legitimate account can see. If
   a screen needs a login the user does not have, that screen is out of scope - say so
   and move on. Never probe, enumerate, or guess.
3. **Public evidence only in the report.** If a logged-in screen shows real customer
   names, phone numbers, or claim data, do not screenshot it. If it is already captured,
   delete the file. Note the pattern in prose instead.
4. **Be a polite visitor.** Default 1.5s between pages, a handful of screens per run.
   The script honours `robots.txt` by default; `--ignore-robots` exists for pages the
   user has a clear right to inspect, not as the default.
5. **Attribute, don't launder.** The report says "Competitor X does this"; it never
   pastes their copy or assets into the user's product as if it were original.

If the user asks for something outside these lines, say which line and offer the nearest
legitimate version.

## Phase 0 - Scope (one question, not five)

You need three things: the URL, whether logged-in screens are in scope, and what
decision this feeds. Usually the URL is given and the rest is inferable. Ask at most
one consolidated question, then start:

> 로그인 뒤 화면까지 볼까요, 공개 페이지만 볼까요? (로그인 필요하면 형이 크롬에
> 이미 로그인해 둔 세션을 씁니다.) 그리고 이번 분석은 뭘 정하려는 건가요 - 온보딩
> 개선 / 가격 정책 / 특정 화면 리디자인?

If the user just says "이 링크 분석해줘" with no other context, assume public pages,
whole-service scope, and get moving. Do not stall on scoping.

## Phase 1 - Discover: what screens exist

Never guess at a site map. Pull it.

```bash
SKILL=~/.claude/skills/competitor-ux-teardown
node "$SKILL/scripts/capture.mjs" discover https://competitor.example --limit 40
```

Returns same-origin links from nav / footer / body, plus up to 200 URLs from
`sitemap.xml`. From that list, pick the screens that carry the product story - typically
6 to 12:

- Home / landing (the pitch)
- Pricing (the business model, stated in public)
- The core product page or feature pages (what they think matters)
- Signup / login entry (the front door; capture it, never submit it)
- Anything that names a job the user's product also does

Skip blog posts, press pages, and legal pages unless the user asked. Show the user the
chosen list before capturing - it is cheap to correct now and expensive later.

## Phase 2 - Capture: pick the right browser

| Situation | Tool | Why |
|---|---|---|
| Public pages, responsive sweep | `scripts/capture.mjs` | Headless, parallel widths, structured DOM dump, no login |
| Logged-in screens | `claude-in-chrome` MCP tools | Reuses the user's real Chrome session; no credential handling |
| Motion / transitions matter | `capture.mjs --video` | A WebM scroll-through shows what a PNG cannot |

### Public capture

```bash
node "$SKILL/scripts/capture.mjs" capture \
  https://competitor.example/ \
  https://competitor.example/pricing \
  --out ./competitor-teardown/<slug>/<YYYY-MM-DD>/screens \
  --widths 320,768,1440 --dark
```

Per screen you get:

| File | What it carries |
|---|---|
| `fold-{320,768,1440}.png` | Above-the-fold at each width - hierarchy and density |
| `full-{widest}.png` | Whole page - narrative order and section rhythm |
| `dark-1440.png` | With `--dark`, whether dark mode is real or an afterthought |
| `walk-1440.webm` | With `--video`, scroll-driven motion and lazy-load behaviour |
| `inventory.json` | Every interactive element, forms, headings, landmarks, design tokens, fonts, colors, media, LCP/CLS |
| `mobile-audit.json` | Measured at the NARROWEST width: horizontal overflow, tap targets under 44px, sub-12px text |

`manifest.json` at the root lists every screen with console errors and failed requests.

The script blocks non-GET document requests outright, so a form cannot be submitted even
by accident. `--strict-readonly` blocks every non-GET including XHR - use it when the
target is sensitive, accepting that some SPA content will not render.

### Logged-in capture

Load the browser tools in ONE call, then drive the user's own Chrome:

```
ToolSearch: select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__tabs_close_mcp
```

Open a NEW tab (never hijack the user's current one), navigate, screenshot with
`computer`, read structure with `read_page`. Same read-only rule: no clicking anything
that writes. Avoid buttons that trigger confirm dialogs - a modal freezes the extension.

## Phase 3 - Analyze

Read `references/rubric.md` before writing any finding. It carries the per-screen scoring
sheet, the funnel pass, and the "what to actually extract" checklist.

The short version, per screen:

1. **Read `inventory.json` first, screenshots second.** The DOM tells you what is there;
   the screenshot tells you how it feels. Guessing feature lists from pixels is how
   teardowns get things wrong.
2. **Feature inventory** - what can a user actually do here? Forms, their required
   fields, and select options reveal their data model better than any marketing page.
3. **Design system extraction** - `inventory.json.tokens` holds their CSS custom
   properties. That is their palette, spacing scale, and radii, stated in their own
   words. `typography` holds the real font stack, not the one on their brand page.
4. **Score with the rules, not vibes.** Query the shared UX rule base:

```bash
python3 ~/.claude/skills/ui-ux-pro-max/scripts/search.py "onboarding form" --domain ux -n 5
```

   Priority order is accessibility > touch/interaction > performance > style > layout.
5. **Mobile findings come from `mobile-audit.json`**, never from eyeballing the 1440px
   shot. Horizontal overflow at 320px and sub-44px tap targets are the two findings that
   are always concrete and always true.
6. **Health signals** - `manifest.json` console errors and failed requests. A competitor
   shipping console errors on their pricing page is a real datum about their bar.

If a claim cannot point at a file, a measured number, or a quoted DOM string, it is an
impression - label it as one or drop it.

## Phase 4 - Report

Write to `competitor-teardown/<slug>/<YYYY-MM-DD>/report.md` next to the screens, using
`references/report-template.md`. Keep raw captures - re-running later against the same
path gives a dated diff of how the competitor changed.

Offer, in one line, to publish the report as an Artifact when the user will share it with
anyone. Do not publish captures of logged-in screens.

## Gotchas

1. **`node_modules` must exist.** The skill vendors Playwright. If `import 'playwright'`
   fails: `npm --prefix ~/.claude/skills/competitor-ux-teardown install` then
   `npx --prefix ~/.claude/skills/competitor-ux-teardown playwright install chromium`.
2. **Headless gets blocked.** Cloudflare, Datadome, and friends will serve a challenge
   page. The tell is a 403 status or a near-empty `inventory.json`. Fall back to
   `claude-in-chrome` - a real browser with a real session usually passes. Do not add
   evasion; that is the line between research and abuse.
3. **SPA routes need settle time.** Client-rendered dashboards often finish after
   `networkidle`. Raise `--settle 5000` when `inventory.json` comes back thin.
4. **Cookie banners eat the fold.** The first screenshot is often 60% consent modal. Note
   it, and read the full-page shot for hierarchy instead. Dismissing the banner means
   clicking - allowed only when the user asks and the click writes nothing but a
   cookie preference.
5. **Tap targets measured at desktop width are meaningless.** This is why the audit runs
   at the narrowest width. Do not re-derive them from the 1440px inventory.
6. **Cross-origin CSS hides tokens.** `tokens` is null when their stylesheet is served
   from another origin. Absence is not evidence they lack a design system.
7. **One run is a snapshot.** Never write "they are moving toward X" from a single
   capture. Say what is true on this date, and re-run later for the trend.
