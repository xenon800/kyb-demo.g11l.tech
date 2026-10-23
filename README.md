# KYB onboarding prototype for an OTC desk

A working prototype of a corporate onboarding flow for an OTC desk, built by Gerrit Schnell for the Lunar Rails technical assessment: get a low- or medium-risk client trading-ready within 24 hours instead of up to 3 weeks. Mock data only.

Live: https://kyb-demo.g11l.tech

## A three-minute tour

1. **Client view.** Go through Client A's application. Each step triggers the simulated checks on the right, and the last screen tells the client what happens next.
2. **Compliance view.** See the decision path (which rule decided and why), the risk score, the checks, the people in scope and the hash-chained audit trail. Act as analyst or MLRO; every decision needs a reason.
3. **Client B.** Switch case and run the application in one go. It escalates to enhanced due diligence because of the PEP director.
4. **Rule Lab.** Change the case (holding jurisdiction, PEP, volume, screening results) or the ruleset (PEP outcome, approval mode, thresholds) and compare the decision side by side. Ruleset changes need a second approver and are audited.
5. **Ruleset** shows the active rules. **Docs** has the justification, tools and AI use, the process log and the changelog.

Direct links work too, for example `#compliance/B` or `#docs/justification`.

## What is where

| Path | Contents |
|---|---|
| `index.html`, `assets/` | The site: `app.js` (interface), `engine.js` (decisions), `audit.js` (hash chain), `markdown.js`, `styles.css`, self-hosted fonts |
| `ruleset.json` | Rules, thresholds, documents and jurisdiction lists. The only place policy lives |
| `data/clients.json` | Mock clients A and B, including the simulated provider responses |
| `audit/` | Example audit trails for both clients and the audit log design |
| `scripts/` | Engine tests, audit snapshot generator and verifier |
| `JUSTIFICATION.md`, `TOOLS.md` | The written deliverables |
| `PROCESS.md`, `CHANGELOG.md` | Working log and change history |

## Run it locally

There are no dependencies. Serve the folder with any static server, for example:

```
python3 -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` straight from disk does not work, because browsers block JavaScript modules and data files on `file://`.

## Tests and audit tools (Node.js 20 or newer)

```
npm test                                         # engine tests, incl. a sweep of 442,368 what-if combinations
npm run audit:generate                           # regenerate audit/client-a.json and audit/client-b.json
node scripts/verify-audit.mjs <exported.json>    # verify any audit trail exported from the site
```

## Deploy on Cloudflare

The site runs as a static Cloudflare Worker connected to this repository; every push to `main` deploys. `wrangler.jsonc` serves the repository root as static assets, and `.assetsignore` keeps non-website files (scripts, `package.json`, `node_modules`) out of the upload. `_headers` sets the response headers. The custom domain `kyb-demo.g11l.tech` is attached to the Worker. After a deploy, check the headers with `curl -I https://kyb-demo.g11l.tech`.

## Keeping it out of search engines

- `<meta name="robots" content="noindex, nofollow, noarchive">` in `index.html`
- `X-Robots-Tag: noindex, nofollow, noarchive` for every path in `_headers`
- `robots.txt` disallows all crawling

A crawler that respects `robots.txt` never fetches the page, so it never sees the two noindex signals. They are there for crawlers that ignore `robots.txt` or find the URL elsewhere. Together they keep the prototype out of search results.

## Security and privacy

- All companies, people, registration numbers and wallet addresses are fictional.
- No uploads, no external API calls, no analytics. Everything runs in the browser and is gone on reload.
- `_headers` sets a strict Content Security Policy (only the site's own files), `no-referrer`, `nosniff`, frame blocking and a restrictive permissions policy.
- Fonts: Archivo and IBM Plex Mono, both under the SIL Open Font License (licences in `assets/fonts/`).
