# Arcel landing redesign

September 18, 2026. Scope: the public landing page at `/`.

## Design decisions

The [Grove study](../../docs/design-studies/2026-09-18-superpower-the-grove.md) informed the sequence: an atmospheric opening, a focused thesis, a concrete product demonstration, consistent walkthrough rows, real people, and practical questions. The user explicitly retained Arcel’s dark identity. This is an adaptation of the reference’s structure, not a copy of its assets or proprietary typeface.

- Narrative Workflow with an original photographic hero, N9 edge-aligned navigation, and Ft5 statement close.
- Cool charcoal surfaces, restrained blue interaction accents, regular-weight Rubik. The locally licensed font is registered under a landing-specific alias to avoid changing the information pages.
- The signature interaction uses explicit controls: one illustrative week, one added sport commitment, and a moved strength session. Completed records remain identical in every state. Mobile keeps the same interaction without a long pinned scroll section.
- Sample profile and workout data are illustrative, not production training recommendations or live application data. Automatic adjustments and launch availability remain clearly described as in development.
- The existing public routes, shared footer component, and information-page styles remain in place. No new dependencies or external services were added.

## Verification

- Production TypeScript/Vite build and ESLint passed.
- Browser layout inspected at 320, 375, 414, 768, and 1280 CSS pixels; wide hero also inspected at 1920 pixels.
- Geometry checks at 320, 375, 414, 768, 960, 1280, and 1920 found no document overflow or clipped button, link, disclosure, or table content. Preview buttons remain 44px tall.
- Pointer and keyboard activation change the calendar scenario. The two completed records and component height remain unchanged; measured page scroll position remains unchanged on state change.
- Native FAQ disclosures work with Enter and keep one answer open at a time. Focus rings are visible.
- About, Terms, Privacy Policy, Disclaimer, and Accessibility routes all load their original headings and content.
- No browser console warnings or errors were observed on the final page.
- Token contrast calculations: ink/canvas 17.01:1; muted/canvas 8.92:1; faint/surface 5.93:1; muted/raised 7.45:1; accent text/accent fill 11.13:1; success/surface 10.36:1; warning/surface 10.06:1; focus accent/canvas 11.76:1. Photograph overlays were visually checked; these numeric ratios describe solid token pairs.
- Reduced-motion CSS removes animation/transitions and native smooth scrolling. This was checked in source, not by changing the host’s accessibility preferences. Physical-device and screen-reader testing were not performed.

Hallmark review: no unresolved visual, content, or responsive blocker. Deliberate exceptions to generic catalog guidance: studied narrative structure, a single licensed brand family, and an image-led hero. No fabricated metrics, customer testimonials, or redrawn device chrome.

## Hero asset provenance

Final asset: [`src/assets/training-hero.webp`](../src/assets/training-hero.webp), 1672 × 941 pixels, 106,162 bytes. Created with the built-in image-generation tool, then encoded as WebP. No source-site photography was reused. The subject is a generated editorial figure, not a founder or customer.

Final generation prompt:

> Use case: photorealistic-natural.
> Asset type: original landscape 16:9 hero photograph for a polished dark strength-and-conditioning website; the photograph itself contains no text or interface.
> Scene: a quiet, credible industrial training gym in early morning, matte concrete walls, rubber floor and restrained gym equipment. An athletic adult stands in the right half of the frame, viewed from the back after training, resting hands naturally on hips. They wear modest dark charcoal training shirt and shorts, ordinary training shoes. Show the whole body or knees up. A realistic barbell rests on the floor nearby, with correctly shaped round plates and a continuous straight shaft.
> Composition: wide editorial environmental portrait, eye-level camera, natural 35mm lens perspective. Keep the left 45% as dark, low-detail negative space suitable for white website copy. Place the athlete center-right, discernible within shadows. The setting should feel lived in and calm, with no staged glamour. Soft side daylight from a high window on the right falls on the athlete, with deep but readable shadow on the left.
> Palette and texture: cool neutral charcoal, graphite, concrete gray, small natural skin tones; subtle film grain, real cloth and concrete texture. Atmospheric, grounded and quietly confident.
> Constraints: anatomically plausible person and hands, physically credible gym and equipment. No logos, no text, no watermark, no UI, no smartphone, no dramatic smoke, no artificial gradients, no orange/teal cinematic effect, no direct imitation of existing campaign photography. Render one high quality original photographic image.
