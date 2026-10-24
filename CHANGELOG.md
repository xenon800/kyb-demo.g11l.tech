# Changelog

All notable changes to this prototype are recorded here, including anything changed after submission, so reviewers can see exactly what differs from the version they first opened.

Format follows [Keep a Changelog](https://keepachangelog.com/). Every push to `main` goes live, so every push with changes gets its own version: patch for fixes and wording, minor for new features or changed behaviour. The site version and the ruleset version (`ruleset.json`) are counted separately; ruleset changes are listed with the ruleset version they produce.

## [Unreleased]

## [1.11.0] - 2026-10-24

### Added
- **Ruleset tab lists the automated checks C1 to C7** (what each checks and its source, simulated provider or rule engine), before the hard rules, so the whole chain from facts to decision is in one place. Before, the checks were only visible in the compliance view and in `ruleset.json`, although the changelog and the rules refer to them by ID.

## [1.10.1] - 2026-10-24

### Changed
- The sanctions questionnaire is shown as a form the client completes in the application, not as an uploaded PDF: "Completed" instead of a mock file name, "Fill in (mock)" instead of "Attach mock file".
- `ruleset.json` **1.4.1** (wording): label "Sanctions questionnaire (completed in the application)" and a new `forms` list with a note on what the questionnaire asks.

## [1.10.0] - 2026-10-24

### Changed
- `ruleset.json` **1.4.0**:
  - **Syria moved from the prohibited list to the high-risk list.** Its comprehensive US and EU sanctions have been lifted, but it remains an EU high-risk third country and under FATF increased monitoring. The prohibited list is now North Korea, Iran, Myanmar and Cuba.
  - **R8** covers the EU high-risk list and FATF increased monitoring and now scores 60 points, so a jurisdiction on it always leads to enhanced due diligence, as EU law requires.
  - **Risk-based ownership threshold:** owners are verified from 10% when the structure is higher risk (holding in a low-transparency jurisdiction, high-risk jurisdiction or PEP involved), otherwise from 25%. New parameter `ubo_ownership_threshold_high_risk_pct`, also editable in the Rule Lab.
  - **C3** is now "Sanctions, terrorist-list and PEP screening".
  - **Sanctions questionnaire** added to the documents every client provides.
- Client view, Ruleset tab and `JUSTIFICATION.md` show the 10% threshold, the terrorist-list screening and the high-risk jurisdictions.
- Mock data: both clients have the sanctions questionnaire, so their outcomes are unchanged.
- Four new tests (49 in total); audit snapshots regenerated with ruleset 1.4.0.

## [1.9.0] - 2026-10-24

### Changed
- The header of the client view now uses a subtle pattern of overlapping circles that fades out to the right, closer to the header of the public Lunar Rails website. The pattern (`assets/circles.svg`) is drawn here from the public-domain "flower of life" motif; no file was copied from their site. The rails pattern (`assets/rails.svg`) is removed. See decision 4.18.

## [1.8.1] - 2026-10-24

### Changed
- `JUSTIFICATION.md`: the summary of the approval preconditions now names all four, including the review for a single owner aged 60 or older (A4), which was only listed in the table.

## [1.8.0] - 2026-10-24

### Added
- **The client can upload outstanding documents at any time until the case is closed**, not only after an analyst asks. The status page shows "Upload these documents (mock)" whenever something is missing, including the documents the client is asked to prepare for an enhanced review. A case being handled by a person stays with that person; a case that was only waiting for the client moves on. Every upload and the re-evaluation are written to the audit trail. See decision 4.17.

### Fixed
- When the system (not an analyst) was waiting for a missing document, the client had no way to upload it.

## [1.7.0] - 2026-10-24

### Added
- **Analyst can recommend approval of an EDD case to the MLRO**, not only rejection. The recommendation needs a reason and complete documents, is written to the audit trail and shown to the MLRO; the case stays with the MLRO, who still makes the decision. The client is not notified again, because nothing changes for them. See decision 4.16.

## [1.6.0] - 2026-10-24

### Added
- `ruleset.json` **1.3.0**: new approval precondition **A4**. A company with a single beneficial owner aged 60 or older always gets a human review: the account manager calls the owner alone to confirm they know what the company will trade, where the money comes from and that nobody else is directing them. Fraud protection, not a judgement on age; age alone never escalates or rejects. See decision 4.15.
- Mock persons now have a date of birth (Client A and B are unaffected), and the compliance view shows the birth year in the people table.
- Four new tests for A4 (45 in total).

### Changed
- **Phone layout:** the main tabs wrap onto a second line instead of being cut off, the docs navigation is a single scrollable line, the case cards in the sidebar can no longer push the page wider than the screen, and long inline code in the docs wraps. No view scrolls sideways at 390 px.
- `JUSTIFICATION.md` lists A4 under review and stays at one page.
- Audit snapshots regenerated with ruleset 1.3.0.

## [1.5.0] - 2026-10-24

Second set of fixes from the independent review: wording, terms and small behaviour.

### Changed
- **One name per role:** "account manager" for the person who calls the client (replaces "business developer" and "coverage contact"), "onboarding team" for the analyst review and "compliance team" for the enhanced review, in client messages, the status timeline, the ruleset and `JUSTIFICATION.md`. "Natural people" is now "natural persons", as in the ruleset.
- **Times in UTC everywhere:** the checks panel now shows UTC like the audit trail, so one event no longer has two different times on the same page.
- **Account and submit steps:** clicking on without ticking the box now shows a short message instead of a disabled button with no explanation.
- **Ruleset tab and compliance view:** when the PEP outcome is set to reject, H4 shows a matching note (the system recommends rejection, the MLRO decides) instead of the EDD note.
- `ruleset.json` **1.2.1** (wording only): "Proof of registered address (max. 90 days old)", so the age limit the client hint mentions is visible in the checklist; account manager wording in the resubmission rule; outcome-specific note for H4.
- README notes that Cloudflare adds its own error reporting headers, while the page itself makes no requests to other domains.
- Audit snapshots regenerated with ruleset 1.2.1.

## [1.4.0] - 2026-10-24

Fixes from an independent review of the rules and the audit trail (see decision 4.14).

### Changed
- `ruleset.json` **1.2.0**:
  - New approval precondition **A3**: an expected volume of USD 1M or more a month always goes to a human review, even with a low risk score. It comes before A2, so a missing document never delays the review.
  - New `human_approval` section: nobody approves a case while required documents are missing, and an EDD approval needs a senior management sign-off with name, role, date and reference.
  - H4 and R3 now cover family members and close associates of PEPs.
  - H2 note: after a confirmed sanctions match no account is opened, required reports are made and the client is not told the reason.
  - Volume tiers are labelled "Under USD 100k", "USD 100k to under USD 1M" and "USD 1M or more", matching how the engine treats the boundaries.
- **Compliance view:** approving is blocked while documents are missing, with a message naming them. The senior management checkbox is replaced by four fields (name, role, date, reference) that are written to the audit event. The list of actions for the other role no longer lowercases "MLRO".
- **Ruleset tab:** new section "When a person approves".
- **Audit:** exports now include `head_hash`; `verify-audit.mjs` checks the declared event count and head hash, so events removed from the end of a file are detected. Three new tests, plus three tests for A3 and the USD 1M boundary (41 in total).
- **Wording:** README and `JUSTIFICATION.md` now say low risk within 24 hours and medium risk within one business day. The justification also covers A3, the PEP scope, the sign-off, the sanctions handling, the corrected audit claim, and that Travel Rule checks happen before the first deposit or withdrawal.
- `TOOLS.md`: added the cross-checks with ChatGPT and Gemini and the independent review by a second agent.
- Audit snapshots regenerated with ruleset 1.2.0.

## [1.3.0] - 2026-10-24

### Changed
- **New look inspired by the public Lunar Rails website:** fixed dark theme (near-black background, white text in shades), Bitcoin orange for buttons and links, new status colours to match. Light mode is removed because the look is fixed. See decision 4.13.
- The client view opens with a band showing an original line pattern of rails running to the horizon (`assets/rails.svg`). Their logo, licensed display font and hero illustration are not used.
- Favicon and browser theme colour updated to the dark look.
- `CLAUDE.md`: the branding rule now allows the colours but still excludes the logo, licensed fonts and illustrations; layout checks no longer include dark mode.

## [1.2.1] - 2026-10-24

### Changed
- The checks panel is labelled "Internal" instead of "Internal, never shown to the client", because the same panel also appears in the compliance view, where everything is internal. The client view's introduction now says that the client never sees this panel.

## [1.2.0] - 2026-10-24

### Changed
- **Client view split into what the client sees and what runs internally.** The application is labelled "What the client sees". The checks panel is labelled "Internal, never shown to the client", has its own dashed style and can be collapsed; its header shows a live summary (for example "4 done, all clear"). On phones and narrow screens it starts collapsed below the form, so the client part comes first. See decision 4.12.
- Notes meant for reviewers (mock data, the "run in one go" shortcut, why there is no password field, where to see the reasons for a decision) are now marked as "Prototype note" and kept apart from the client's text.
- The account step tells the client how sign-in works (email link and a one-time code); the explanation for reviewers moved into a prototype note.

## [1.1.1] - 2026-10-24

### Changed
- `PROCESS.md` 4.11: more precise wording of the Relai Business example. Outdated bills were typically more than three months old, sometimes one or two years.

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
