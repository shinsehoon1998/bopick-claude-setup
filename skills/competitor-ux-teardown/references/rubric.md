# Teardown Rubric

Read this before writing findings. It exists so two runs on two competitors produce
comparable output instead of two essays.

## Per-screen sheet

Fill this for every captured screen. Evidence column is mandatory - a finding without a
file path, a measured number, or a quoted DOM string is an impression, and impressions go
in one clearly-labelled paragraph at the end, not in the table.

| Axis | Question | Evidence source |
|---|---|---|
| Job | What is this screen for, in one sentence? | `inventory.json` headings + primary CTA |
| Actions | What can a user actually do here? | `inventory.json.interactive`, `.forms` |
| Data model | What do they ask for, and what is required? | `.forms[].fields`, `.required`, select `options` |
| Hierarchy | What does the eye hit first, second, third? | `fold-1440.png` |
| Density | Generous, dense, or cramped? For whom? | `fold-*.png` across widths |
| Mobile | Overflow? Tap targets? Legible? | `mobile-audit.json` |
| Accessibility | Landmarks, alt text, labels, focus | `.landmarks`, `.media.missingAlt`, `.interactive[].ariaLabel` |
| Performance | LCP, CLS, images without dimensions | `.vitals`, `.media.noDimensions` |
| Health | Console errors, failed requests | `manifest.json` |
| Motion | Do transitions clarify or decorate? | `walk-*.webm`, `.prefersReducedMotionRespected` |

## Scoring

Score each axis 1-5 and say what a 5 would look like for that axis on that screen.
Anchor the numbers so they mean something across screens:

- **5** - a reference implementation; you would screenshot it for a design review
- **4** - solid, nothing a user would complain about
- **3** - works, but a competitor could beat it without trying
- **2** - a real user hits friction here
- **1** - broken, inaccessible, or actively misleading

Priority when findings conflict, from `ui-ux-pro-max`: accessibility > touch and
interaction > performance > style consistency > layout > typography and color >
animation > forms > navigation > charts. A gorgeous screen that fails contrast is not a 4.

## The funnel pass

Screens in isolation miss the story. After the per-screen sheets, walk the sequence a
real user walks - landing to signup to first value - and answer:

1. How many screens and how many required fields before a user sees anything useful?
2. What is asked for before value is delivered? Card up front? Phone verification?
3. Where would a user quit, and what did the competitor do to stop them?
4. What is the fastest path to the "aha", and did they design for it or leave it to luck?

Count the steps and the fields. "Their signup is 3 screens and 11 required fields" is a
finding; "their onboarding feels heavy" is not.

## Design system extraction

`inventory.json.tokens` is their CSS custom properties, i.e. their design system in their
own words. Pull out and tabulate:

- Color roles: what is semantic (`--color-danger`) vs decorative (`--blue-500`)
- Spacing scale: is it a real scale or arbitrary numbers?
- Radii and shadows: consistent, or per-component drift?
- Type scale: `typography.fontFamilies` - two families or seven?

A competitor with 341 tokens and a coherent naming scheme has a design system. One with
12 has a stylesheet. That difference predicts how fast they can ship UI.

## What to actually extract

The report is useless if it stops at description. Every teardown ends with three lists,
and each item names the screen it came from:

- **Steal** - specific, transferable, and better than what the user has today
- **Avoid** - things they did that visibly cost them, with the evidence
- **Ignore** - things that look impressive but serve a constraint the user does not have
  (their scale, their pricing model, their compliance regime)

The Ignore list is the one that keeps a teardown from turning into cargo-culting.
