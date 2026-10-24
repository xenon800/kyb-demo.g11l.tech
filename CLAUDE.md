# Working on this repo

OTC onboarding prototype for the Lunar Rails technical assessment, by Gerrit Schnell. Static site, no build step, no dependencies. Every push to `main` deploys live to https://kyb-demo.g11l.tech (Cloudflare Worker, static assets). Treat `main` as production.

## Every change

1. **Changelog first-class.** Add an entry under `## [Unreleased]` in `CHANGELOG.md` for every change that affects the site, the rules or the documents, in plain English: what changed and why. Every push to `main` goes live, so every push with such changes is released as its own dated version (patch for fixes and wording, minor for new features or changed behaviour); move the entries from `[Unreleased]` into it before pushing and leave `[Unreleased]` empty. The site version is separate from the ruleset version. Reviewers use this to see what changed after submission.
2. **Decisions go into `PROCESS.md`.** If a change reflects a new decision or a lesson learned (not just a typo), add a short note to the log. Never rewrite earlier entries; append, or mark them as superseded.
3. **Run the tests before committing:** `node scripts/test-engine.mjs` must pass (no failures).
4. **If `ruleset.json`, `assets/engine.js` or `data/clients.json` changed:** run `node scripts/generate-audit.mjs`, then `node scripts/verify-audit.mjs audit/client-a.json audit/client-b.json`, and commit the regenerated snapshots.
5. **Keep documents consistent.** Rules described in `JUSTIFICATION.md`, the ruleset tab and `ruleset.json` must match. `JUSTIFICATION.md` stays at one page.
6. Commit messages explain why, not only what.

## Rules about the rules

- `ruleset.json` is the only place policy lives (thresholds, points, outcomes, order, lists). Never hard-code a rule in the UI.
- Any change to `ruleset.json` bumps its `version` (patch for wording, minor for behaviour) and gets a changelog line naming the new version.
- Guardrails that must never be weakened: no automatic rejection; only the MLRO rejects or approves EDD/PEP cases; client messages never reveal screening results or rule IDs. The engine and the tests enforce this; do not remove those checks.

## Hard constraints

- Mock data only. No real people or companies, no realistic fake documents (certificates, registry extracts, POAs).
- Lunar Rails look, not Lunar Rails branding (decision 4.13 in `PROCESS.md`): the colours are inspired by their public website, as Gerrit decided. Never add their logo, product names as branding, their licensed fonts (for example Blenko) or their illustrations; the rails pattern in `assets/rails.svg` is original. The prototype banner stays visible on every page, so the site is clearly Gerrit's prototype "prepared for" Lunar Rails.
- No external requests: no CDNs, trackers, analytics or remote fonts. The Content Security Policy in `_headers` only allows the site's own files; keep it that way.
- Keep `noindex` in all three places: meta tag in `index.html`, `X-Robots-Tag` in `_headers`, `robots.txt`.
- Keep `wrangler.jsonc` and `.assetsignore`. Without them, Cloudflare's auto-setup uploads `node_modules` and the deploy fails. New non-website files go into `.assetsignore`.

## Style

- Site and documents in English, plain and specific, sentence case. Avoid template chrome (ALL-CAPS labels, decorative middle dots, arrow-suffixed links).
- Monospace only for machine data: rule IDs, hashes, timestamps, API requests.
- The theme is fixed dark (no light mode). Test layout changes at desktop and phone width (no horizontal scroll at 390 px).
