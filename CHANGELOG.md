# Changelog

All notable changes to this prototype are recorded here, including anything changed after submission, so reviewers can see exactly what differs from the version they first opened.

Format follows [Keep a Changelog](https://keepachangelog.com/). Every push to `main` goes live, so every push with changes gets its own version: patch for fixes and wording, minor for new features or changed behaviour. The site version and the ruleset version (`ruleset.json`) are counted separately; ruleset changes are listed with the ruleset version they produce.

## [Unreleased]

## [1.1.0] - 2026-10-24

Changes from my own review of the rules and the workflow.

### Added
- **Client account step.** The application now starts with creating an account (name, role, work email, consent to the terms of use and privacy notice). The same account is where the client later sends requested documents, follows the status and trades. Account creation, email verification and consents are written to the audit trail, and the status page shows who is signed in. No password field on purpose; production would use an email link plus two-factor authentication. See decision 4.10.
- **Rule for documents that cannot be accepted:** one automated email with the reason; if the second upload still does not fit, a business developer calls the client. Shown to the client on the documents step and in the ruleset tab. Based on my experience at Relai Business, where outdated documents were the biggest delay. See decision 4.11.
- `ruleset.json` **1.1.0**: new `client_account` section and `documents.resubmission` rule.

### Changed
- The stepper fits seven steps at desktop width without cutting off the last one.
- `JUSTIFICATION.md` mentions the account step, the resubmission rule and the account events in the audit trail.
- Audit snapshots in `audit/` regenerated with ruleset 1.1.0; they now start with the account events (19 and 18 events).

## [1.0.3] - 2026-10-23

### Added
- "Path to production" section in `README.md`: what carries over unchanged to a live system (ruleset, engine, audit chain, tests) and what has to be added (backend for API keys, Sumsub and blockchain analytics adapters, webhooks, storage, sign-in, data protection, ruleset changes through pull requests). Reasoning noted as decision 4.9 in `PROCESS.md`.

## [1.0.2] - 2026-10-23

### Changed
- `TOOLS.md` now lists the manual testing I did myself: both clients, as client and in the compliance view, on desktop and mobile, in several browsers and operating systems. The automated tests only cover the engine; how the site behaves on real devices was checked by hand.

## [1.0.1] - 2026-10-23

Changes after the first build, all live on the site.

### Added
- `CLAUDE.md` with working rules for this repo: changelog and process log for every change, tests and audit snapshots before committing, ruleset versioning and the guardrails that must not be weakened.
- `wrangler.jsonc` and `.assetsignore` for deployment as a static Cloudflare Worker. The first deploy failed because Wrangler's auto-setup installed `node_modules` into the build folder and tried to upload them as website files.

### Changed
- Closed the last open question in `PROCESS.md` (excluded jurisdictions). Lunar Rails' public Terms of Use refer to restricted jurisdictions and sanctions lists but name no countries, so the jurisdiction lists in the ruleset stay a proposal for Compliance to replace. Noted as decision 4.8. The ruleset itself is unchanged (still 1.0.0).
- Versioning: every push that changes the site, the rules or the documents is released as its own version, because every push to `main` goes live. `[Unreleased]` only holds changes that have not been pushed yet.

## [1.0.0] - 2026-10-23

First complete version.

### Added
- **Client view:** six-step application with a document checklist shown up front, simulated checks that run as each step is completed, and an honest status page telling the client what happens next.
- **Compliance view:** decision path showing which rule decided and why, risk score breakdown, checks, people in scope, documents, analyst and MLRO actions with mandatory reasons, and a hash-chained audit trail with verification, tamper test and JSON export.
- **Rule Lab:** what-if scenarios on Client A or B and editable ruleset parameters, compared side by side with the baseline; ruleset changes need a second approver, create a new version and re-evaluate open cases.
- **Ruleset tab** rendering the active rules, and a **Docs tab** with the justification, tools and AI use, process log, changelog and README.
- `ruleset.json` **1.0.0**: hard rules H1–H7, risk bands, approval preconditions A1–A2, 11 risk factors, document requirements, jurisdiction lists, guardrails.
- `assets/engine.js` (pure decision engine with ruleset guardrails) and `assets/audit.js` (append-only, hash-chained log).
- Mock clients A (Canada) and B (UAE with BVI holding and PEP director) in `data/clients.json`.
- `scripts/test-engine.mjs` (35 checks, including a sweep of 442,368 what-if combinations), `scripts/generate-audit.mjs` and `scripts/verify-audit.mjs`; example audit trails in `audit/`.
- `JUSTIFICATION.md`, `TOOLS.md`, `PROCESS.md`, `README.md`.
- `noindex` via meta tag, `X-Robots-Tag` and `robots.txt`; strict security headers in `_headers`; self-hosted fonts, no external requests.
