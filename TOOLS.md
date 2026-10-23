# Tools and AI use

## What it is built with

- Plain HTML, CSS and JavaScript. No framework, no build step, no dependencies.
- The decision engine and the hash-chained audit log are small JavaScript modules shared by the site and the command-line scripts, so the website, the tests and the audit snapshots always use the same logic.
- Node.js for the tests (`npm test`) and to generate and verify the audit snapshots.
- Hosted on Cloudflare Pages on a subdomain of my company domain, with `noindex` set three ways and strict security headers. Fonts are self-hosted, so the page makes no external requests and has no trackers.
- GitHub for the code, with a changelog for every change after submission.

## What I did myself

- Defined the approach: automate collection, checks and routing; keep judgment with people.
- Set the core rules from my KYB and transaction monitoring work at Relai and Binance: tiered onboarding by complexity; Compliance owns which documents are required; complex cases always get a human review; a PEP escalates rather than being rejected outright, and that choice stays configurable; volume-based document requirements starting at USD 100k a month; and a configurable ruleset so policy can change without code.
- Decided that auto-approval has to be earned (shadow, then sample, then full) before it is trusted.
- Decided against a demo database (an honest JSON export beats a database nobody uses) and against a free-form test case with uploads (without real integrations it would look staged), and chose the noindex subdomain and the changelog.
- Reviewed the rules, tested both clients and the edge cases in the Rule Lab, and deployed the site.

## What I used AI for

I worked with Claude (Anthropic) as a sparring partner and developer:

- **Challenging my rules.** It pushed back on my first draft, for example that a PEP calls for enhanced due diligence rather than a ban, that owners are usually verified from 25%, and that jurisdictions need tiers. I adopted these where I agreed.
- **Proposals I reviewed.** The risk-factor weights, the approval preconditions and the hash-chained audit log started as AI suggestions that I checked and adopted. The weights in particular are a starting point I would calibrate with Compliance against real cases.
- **Writing the code:** the engine, the site, the scripts and the tests, including a sweep of 442,368 scenario combinations showing that nothing is ever rejected automatically.
- **First drafts of the documents**, written from my decisions and edited by me.

The full working log, including the decisions that changed along the way, is in `PROCESS.md`.
