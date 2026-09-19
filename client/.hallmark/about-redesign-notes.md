# About page redesign — 2026-09-19

## Direction

The accepted landing page is the design reference: dark charcoal, restrained blue,
regular Rubik, generous space, hairline rules, minimal edge-aligned navigation, and
a statement close. The Grove study remains the source of the underlying rhythm.
Existing `tokens.css` and `LandingPage.css` supply the shared system; no new fonts,
dependencies, generated imagery, or palette values were added.

The page adapts Long Document into open heading-and-prose rows, an existing-team
portrait gallery, and a readable architecture sequence. It retains all original
sections in order. The user explicitly requested both continuity with the landing
page and preservation of the existing About ideas; theme/nav/footer rotation is
therefore intentionally suspended.

## Content retained

- The original opening description, with a lightly rephrased headline.
- All four programming headings and their complete body text, rendered directly
  from `pageContent.about.sections` without editing the content source.
- The visible disclosure that rolling programming and automatic adjustments are
  still in development and the mobile planning screens are previews.
- All three team members, original roles, existing portraits, and LinkedIn links.
- All five architecture stages, their named technologies, and the original
  explanation distinguishing chat retrieval from workout-planning generation.
- All six technology groups and their complete original descriptions.
- iPhone development and planned App Store release. Replaced the indefinite
  “soon” with “An App Store release is planned,” consistent with the landing FAQ.
- Home and policy navigation. The four policy pages retain their rendering and copy.

The former decorative washes, icon cards, and ordinal section labels were replaced
with type, rules, and section background changes. Technical content stays visible
without expansion controls. There are no new product or performance claims.

## Implementation

`PublicInfoPage` remains the route owner and renders the additive `AboutPage` for
`/about`. Policies retain their existing branch and styles. About-specific styles
normalize legacy footer sizing so it matches the landing footer. Shared landing
styles and global styles were not modified.

## Verification

- Production TypeScript/Vite build and project ESLint pass.
- Browser widths: 320, 375, 414, 768, 960, 1280, and 1920 pixels. No horizontal
  overflow or out-of-bounds main content; all ordinary links are at least 44px high.
- Visual inspection of desktop opening, principles, team, architecture, and stack;
  phone opening, portraits, and vertical architecture; tablet team and architecture.
- Native anchor navigation activates from keyboard; focus uses an immediate 2px
  blue outline with 5px offset. Link labels remain on one line.
- Existing reduced-motion rules cover shared interactions; the About page adds no
  animation or scroll reveal. Architecture arrow rotation is static layout.
- All portraits load; browser reports no warnings or errors.
- Independent review confirms preservation of original content and section order.
- Contrast uses previously verified shared pairs: ink/canvas 17.01:1,
  muted/canvas 8.92:1, faint/surface 5.93:1, and accent/canvas 11.76:1.
- Hallmark review: no fabricated metrics, decorative graphics, fake UI chrome,
  token overrides, italic headings, or inaccessible custom controls. The compact
  editorial opening fits the 1280×800 fold. Reading measures are capped at 75ch.

Pre-emit critique: Philosophy 5, Hierarchy 5, Execution 4, Specificity 5,
Restraint 5, Variety 4. The intentional shared identity takes precedence over
cross-project diversification.
