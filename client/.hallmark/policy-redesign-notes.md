# Public policy redesign — 2026-09-19

## Scope and direction

The four public policy routes share the existing `PublicInfoPage` component:
`/terms`, `/privacy`, `/disclaimer`, and `/accessibility`. This redesign changes
their presentation while retaining the user-approved four-page selector and
matching the accepted landing/About identity.

- Macrostructure: Index-First, adapted as a persistent policy index beside a
  document reading pane.
- Theme: studied-DNA, using the existing cool charcoal, restrained blue, regular
  Rubik typography, spacing tokens, and fine section rules.
- Navigation: N9 edge-aligned header, plus the four clearly labelled policy links.
- Footer: Ft2 inline-rule treatment, reusing the existing `LaunchFooter`.
- Enrichment and motion: none. All content is immediately available.
- Theme rotation is intentionally suspended because the user requested the
  established site identity. No new `design.md` or token variants were introduced.

## Text preservation

`src/pages/info-content.ts` is unchanged. All four titles and descriptions, all
11 section headings and paragraphs, the category text, draft notice, navigation
labels, and footer text are retained. No legal content was authored or revised.
Decorative section numbers and the shield icon were removed from the presentation.

Content-source SHA-256:
`c47fe8d16923d9c70f2297b066e4ab0901857603688929f57ec61786b68ae4fc`

## Implementation

The existing route owner and About branch remain in place. `PublicInfoPage.css`
now contains only policy styles, all scoped beneath `.arcel-policy`. The page
imports `LandingPage.css` for the shared system and no longer imports the legacy
`ComingSoonPage.css`. No production files were deleted. Landing and About source
files and shared design tokens were not modified in this pass.

On desktop, the four-page selector stays beside the reading pane as the document
scrolls. The page header is not sticky, so the selector does not overlap it. On
tablets the selector becomes a two-column list; phones show four full-width rows.
The selected page retains `aria-current="page"`, a visible surface and border,
and the shared blue accent. Footer links also identify the current page.

Text sections use a 65ch reading measure and responsive heading sizes. Every
policy link is at least 56px high; shared navigation/footer links are at least
44px. Native links preserve keyboard and browser navigation behavior.

## Verification

- Production TypeScript/Vite build and full ESLint pass.
- 28 browser layout checks: each route at 320, 375, 414, 768, 960, 1280, and
  1920 pixels. No horizontal overflow, out-of-bounds main content, undersized
  links, or wrapping navigation labels.
- Correct selected-page link and section counts on every route: 3 / 3 / 3 / 2.
- Visual checks: Terms desktop opening and scrolled document/footer; Accessibility
  at 320px; Fitness Disclaimer at 375px and its reading pane at 414px; Privacy at
  768px. Desktop selector remains at a 32px top offset during scroll.
- Keyboard navigation between policies works; focus is an immediate 2px blue ring.
- Independent content and code review confirms exact copy preservation, semantic
  headings, current-page semantics, and isolation from the other page styles.
- Browser logs contain no warnings or errors.
- No new animation. Existing shared reduced-motion handling remains in effect.
- Shared contrast pairs were previously verified: ink/canvas 17.01:1,
  muted/canvas 8.92:1, warning/surface 10.06:1, accent/canvas 11.76:1.
- Hallmark review: no invented claims, fake chrome, image/heading overflow, italic
  display type, raw palette overrides, or decorative feature-card grid.

Pre-emit critique: Philosophy 5, Hierarchy 5, Execution 4, Specificity 4,
Restraint 5, Variety 4.
