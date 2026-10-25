# Arcel public website

This Vite/React client serves the landing page, About page, and public policies.
The training application lives in `../mobile`; this site does not authenticate
users or call the backend. No environment variables are required.

Run commands from this directory:

```sh
npm ci
npm run dev
npm run lint
npm run build
```

`src/main.tsx` mounts `src/launch/PublicApp.tsx`. Public routes are defined in
`src/routing.ts`; unknown paths fall back to the landing page. Components and
styles live in `src/launch`, with shared design tokens in `tokens.css` and page
copy in `src/pages/info-content.ts`.

The calendar and phone previews use illustrative local data. The calendar's
three scenarios share session data rather than calculating a live training plan.
Scroll reveals have separate reveal/reset boundaries to allow replay without
flickering. They respect reduced motion and keep content readable if observation
is unavailable.

ESLint limits each function to a cyclomatic complexity of 8. Prefer removing
redundant branches and modeling fixed variants as data over splitting conditions
into unrelated helpers just to pass the limit.
