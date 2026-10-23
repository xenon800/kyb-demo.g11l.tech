# Changelog

All notable changes to this prototype are recorded here, including anything changed after submission, so reviewers can see exactly what differs from the version they first opened.

Format follows [Keep a Changelog](https://keepachangelog.com/). Ruleset changes are listed with the ruleset version they produce.

## [Unreleased]

### Added
- `wrangler.jsonc` and `.assetsignore` for deployment as a static Cloudflare Worker. The first deploy failed because Wrangler's auto-setup installed `node_modules` into the build folder and tried to upload them as website files.

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
