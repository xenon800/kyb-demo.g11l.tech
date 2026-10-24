# KYB onboarding prototype for an OTC desk

A working prototype of a corporate onboarding flow for an OTC desk, built by Gerrit Schnell for the Lunar Rails technical assessment: get a low-risk client trading-ready within 24 hours and a medium-risk client within one business day, instead of up to 3 weeks. Mock data only.

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
- No uploads, no external API calls, no analytics. Everything runs in the browser and is gone on reload. Cloudflare adds its own network error reporting headers (`report-to`, `nel`) to responses; the page itself makes no requests to other domains.
- `_headers` sets a strict Content Security Policy (only the site's own files), `no-referrer`, `nosniff`, frame blocking and a restrictive permissions policy.
- Fonts: Archivo and IBM Plex Mono, both under the SIL Open Font License (licences in `assets/fonts/`).
- Look: colours inspired by the public Lunar Rails website; no logo, licensed fonts or illustrations. The circle pattern in `assets/circles.svg` is drawn here from the public-domain "flower of life" motif; no file was copied from their site.

## Path to production

The prototype is built so the decision logic can be reused as it is. What changes for a live system is everything around it.

**Reused without changes**
- `ruleset.json` and `assets/engine.js`. The engine is a pure function: case data and ruleset in, decision and full trace out. It already runs outside the browser (the tests run it in Node.js), so it can run on a server unchanged.
- `assets/audit.js`. The hash chain works the same on a server.
- The tests, so the guardrails (no automatic rejection, no screening details in client messages) stay enforced as the system grows.

**Added for a live system**
1. **Backend.** Provider API keys must never reach the browser. A small server holds them as secrets, for example a Cloudflare Worker next to the current site, or a service in the existing stack.
2. **Provider adapters.** Today the results of checks C1 to C7 come from `data/clients.json`. A live adapter maps the provider responses into the same format: Sumsub for company registry, ID, liveness, sanctions, PEP and adverse media screening; a blockchain analytics provider such as Chainalysis for wallet risk. The engine does not change.
3. **Webhooks.** Verification results arrive asynchronously. A case waits for them and is re-evaluated when they arrive; the re-evaluation already exists, only the trigger is new.
4. **Storage.** Cases in a database; audit events in append-only storage, so an event can be added but never changed or deleted.
5. **Sign-in and roles.** Real accounts for analysts and the MLRO, so the second approver for a ruleset change is provably a different person.
6. **Data protection.** Retention periods, hosting region and access logs for personal data and documents.
7. **Ruleset changes through pull requests.** A change to `ruleset.json` is proposed as a pull request, approved by a second person and deployed as a new version, replacing the session-only lab versions.

**How I would build it.** I can build a first version myself with AI support, starting with the Sumsub sandbox. Before it handles real client data, I would pair with an engineer on the security review, the data model and how it fits into the existing systems. In practice the rules and the engine would most likely move into the platform Lunar Rails already runs, rather than this prototype going live on its own.

