# Process Log: OTC Onboarding Prototype

How this prototype was built, step by step, including the open questions and the decisions that changed along the way. This is a working log, not a polished write-up.

Built by Gerrit Schnell as a technical assessment for Lunar Rails. Mock data only.

---

## 1. The brief (23 Oct 2026)

Get a corporate OTC client trading-ready in 24 hours instead of up to 3 weeks. Two mock clients:

- **Client A:** Canadian company, simple ownership, normal volumes.
- **Client B:** UAE company held through an offshore holding, one PEP director, high volumes.

My first read: the two clients are a deliberate contrast. Client A is the case that should go through fast. Client B tests whether I know when *not* to automate. A good result is A trading within hours and B routed into enhanced due diligence, not B forced through in 24 hours.

## 2. First thoughts on the rules (my raw notes)

Before writing any rules, I listed what actually drives risk in KYB onboarding from my experience reviewing B2B onboardings at Relai:

- Not all corporate clients are equal. Some are simple (single UBO, low risk, normal volumes, clean company documents). Others are complex: holding structures, and depending on the jurisdiction they need different documents.
- **Which documents are required is a Compliance decision, not mine.** My job is to translate that policy into system logic.
- Complex cases can be pre-processed automatically, but a human always signs off.
- PEPs: many firms don't onboard them at all. *(Open question, see below.)*
- High volumes need proper checks of bank statements and tax declarations.
- Up to an agreed volume, smaller companies could be onboarded automatically, with EDD only above a threshold. *(To be agreed with Compliance.)*
- With multiple UBOs, documentation must be complete for all of them. *(Open question: all UBOs or only above an ownership threshold?)*
- Some jurisdictions can't be onboarded at all. *(Check whether Lunar Rails publishes excluded jurisdictions.)*

## 3. Open questions to resolve

- [x] PEP: reject by default, or escalate to EDD with senior approval? → see 4.1
- [x] UBO threshold: which owners must be fully verified? → see 4.2
- [x] Volume thresholds: where does automatic approval stop? → see 4.3
- [x] Excluded jurisdictions: is there a published Lunar Rails list? → see 4.8
- [x] Client A: fully automatic approval, or a light human check before trading? → see 4.6

## 4. Decisions

### 4.1 PEP → escalate, not reject
A PEP is not a prohibition under FATF standards. It triggers enhanced due diligence: source of funds and wealth, plus senior management approval. Some firms decide not to onboard PEPs at all, which is a valid risk-appetite choice. That is exactly why it lives in the ruleset as a single configurable outcome: `escalate` by default, switchable to `reject` if Compliance decides so.

### 4.2 UBO threshold → 25 % or control
Every natural person holding 25 % or more, or exercising control by other means, is fully verified, plus directors and authorised signatories. If nobody reaches 25 %, the senior managing official is verified instead. The threshold is a ruleset parameter.

### 4.3 Volume → tiers, not a single cutoff
My starting point was: bank statements from 100k monthly volume. I checked whether there is a regulatory figure for this. There isn't: regulators require a risk-based approach and leave the thresholds to the firm's risk appetite. So the numbers below are my proposal, to be set by Compliance:

| Expected monthly volume | Requirement |
|---|---|
| < 100k | Standard KYB documents |
| 100k to 1M | + bank statements, source of funds declaration |
| > 1M | + financial statements, source of wealth, manual review |

Combined with other risk factors (PEP, offshore holding, high-risk jurisdiction), a high volume escalates the case.

### 4.4 The ruleset is configuration, not code
If thresholds and outcomes must be adjustable, the rules have to live in one versioned ruleset that the flow reads. Every decision records the ruleset version it was made under, so an auditor can reconstruct why a client was approved even after the rules changed. A rule change itself should need a second approver (four-eyes).

### 4.5 No fabricated documents
The prototype does not generate fake certificates, POAs or registry extracts. Uploads are simulated: a file name and a simulated check result, clearly marked as mock. Realistic-looking fake company documents would be the wrong thing to build, even for a demo.

### 4.6 Auto-approval is earned, not switched on
I would never release an automation into production that I haven't tested against real cases. So low-risk approvals start with a human confirming every system decision. This is manual work at first, but it is exactly where the errors in the rules show up.

The rollout is staged and controlled by one ruleset setting:

| Mode | What happens on a low-risk "approve" | Move on when |
|---|---|---|
| `shadow` (default) | System decides, an analyst confirms before trading | System and analyst agree consistently over an agreed number of cases |
| `sample` | Auto-approved, a share of cases is reviewed afterwards | Sample reviews keep finding no errors |
| `full` | Auto-approved, periodic QA only | n/a |

The 24-hour target still holds in `shadow` mode: the checks run in minutes, and confirming a clean low-risk case takes an analyst a few minutes within the same day. Full automation is the goal, but not straight after the first build.

### 4.7 Audit trail: JSON export, no demo database
A static page can't write live into the GitHub repo, and I deliberately did not set up a separate SQL or Notion database just to show that I can connect one. I also considered a shared Google Sheet as a stand-in and rejected it: a sheet is editable, so it is not an audit store, and writing to it from a public page would mean exposing a write endpoint anyone could call. That would demonstrate the opposite of auditability.

What the prototype does instead: the audit trail of each session is shown live in the compliance view, hash-chained, and exportable as JSON. Example logs for both clients are in `audit/`. In production, the same events go to append-only storage (see `audit/README.md`).

### 4.8 Excluded jurisdictions: no public list, so the list is a proposal (added 23 Oct 2026)
I checked Lunar Rails' public website and Terms of Use. The terms only say that clients, their beneficial owners and directors must not be located in a jurisdiction where the services are restricted, and must not be on any sanctions list. No countries are named. So the prohibited list in the ruleset (North Korea, Iran, Myanmar, Cuba, Syria) and the low-transparency list are my proposal: the FATF call-for-action countries (North Korea, Iran, Myanmar) plus Cuba and Syria, which crypto firms commonly exclude because of sanctions exposure. Compliance replaces them with the internal list; it is one change in `ruleset.json`, with no code change.

### 4.9 Path to production documented, not built (added 23 Oct 2026)
I want this process to be something I can take live and extend, not a throwaway demo. I considered connecting the Sumsub sandbox now and decided against it for the submission: a prototype holding real API keys and handling real identity data would be a risk, not a feature. Instead the README describes the path to production: what is reused unchanged (ruleset, engine, audit chain, tests) and what has to be added (backend for secrets, provider adapters, webhooks, storage, sign-in, data protection, ruleset changes through pull requests). I can build a first version myself; before real client data goes through it, I would pair with an engineer.

### 4.10 The client needs an account first (added 24 Oct 2026)
Found in my own review of the workflow: the client never created an account. In a real flow the account comes first. It is how the client continues an application, sends documents we ask for later, follows the status and, once approved, trades. It also matters for the audit: who submitted, with which email, and which version of the terms they accepted. The client view now starts with an account step after the checklist, and account creation, email verification and consents are logged. There is deliberately no password field: on a public prototype someone would type a real password. In production: sign-in by email link plus two-factor authentication. We missed this in the build because we focused on the decision logic; the review caught it, which is the point of reviewing before trusting a build.

### 4.11 Wrong documents: one automated email, then a person (added 24 Oct 2026)
From my time at Relai Business, the biggest time sink in business onboarding was wrong or outdated documents. However well we explained the requirements, with examples, a request for a bill no older than 90 days often brought one that was more than three months old, sometimes one or two years. Repeated automated emails do not fix that. The rule is now in the ruleset: when a document cannot be accepted, the client gets one automated email with the reason; if the second upload still does not fit, a business developer calls the client. The prototype shows this as a hint to the client and in the ruleset; it does not simulate wrong uploads. In production, document reading (for example Sumsub's automated company document reading) would catch the date at upload.

### 4.12 Separate what the client sees from what we see (added 24 Oct 2026)
Good onboarding flows keep text to a minimum, so I looked at where mine felt text-heavy. Going through the client view, the client's own text was already short; what made it look text-heavy was everything around it: the internal checks panel next to the form and notes meant for reviewers inside the form. So instead of cutting content the client needs (the document checklist stays fully visible, because wrong and missing documents are the biggest delay), the view now separates the two: the form is labelled as what the client sees, the checks panel as internal and collapsible (collapsed by default on phones), and reviewer notes are marked as prototype notes.

### 4.13 Lunar Rails colours instead of a neutral design (added 24 Oct 2026, supersedes the earlier rule of no Lunar Rails colours)
At the start I kept the prototype in a neutral design on purpose, so that a public onboarding form would not look like a real Lunar Rails page. On reflection, a prototype that already looks like it belongs to Lunar Rails makes it easier to picture it in their product, so I changed this: the site now uses a fixed dark theme with colours taken from their public website (near-black background, white text, Bitcoin orange for actions). What I did not take over: the logo, their display font (a licensed font) and the hero illustration (an animation built on a licensed stock graphic). The client view has an original line pattern of rails running to the horizon instead. The banner on every page still says that this is my prototype with fictional data, and the light and dark modes are gone because the look is fixed.

### 4.14 Independent review: what it found and what I changed (added 24 Oct 2026)
I had the finished prototype reviewed by a second AI agent (Hermes) that had not seen it, with a fixed brief: consistency, walkthrough of both clients, rule critique, client experience, style and layout. Two findings were real weaknesses, not cosmetics:

- **A person could approve an EDD case with documents still missing**, and the senior management approval was only a checkbox. My approval preconditions only stopped the automated path. Now nobody approves while required documents are missing, and an EDD approval records who in senior management signed off, in which role, when, and the reference.
- **The audit claim was too strong.** Deleting events from the end of an export left a valid, shorter chain. Exports now carry their event count and head hash, the verifier checks both, and the justification says plainly that a fully rewritten file is only caught against an anchored copy of the head hash.

Further decisions from the review:
- **USD 1M or more a month always gets a human review** (new precondition A3), as I had intended from the start (see 4.3); before, a client with no other risk factors stayed in the low band. A3 sits before A2 so that a missing document never delays that review.
- **PEP scope includes family members and close associates.**
- **Confirmed sanctions match:** during onboarding there are no client funds to freeze; the account is simply not opened. What still applies is reporting where the law requires it and not telling the client why. One sentence in the rule, no new process.
- **Travel Rule and proof of wallet ownership** belong before the first deposit or withdrawal, not into onboarding. Mentioned, not built.
- **Not changed:** nominee directors and bearer shares stay a 30-point risk factor. In practice they come with holding structures that already push a case into review or EDD, and a separate hard rule would be engineering for its own sake.
- **Corrected the headline:** low risk trades within 24 hours, medium risk after a review within one business day. Before, the text promised 24 hours for both.

### 4.15 A single owner aged 60 or older gets a call (added 24 Oct 2026)
From Relai, where it was a big topic: older people are often the ones used in fraud, talked into fronting a company or an account through romance or investment scams, or directed by someone in the background. For a corporate client the signal is weaker than for a private client, so the rule is proportionate: a company with a single beneficial owner aged 60 or older always gets a human review, in which the account manager calls the owner alone and confirms they know what the company will trade, where the money comes from and that nobody else is directing them. Concerns go to the MLRO. Age alone never leads to an escalation or a rejection; that would be unequal treatment without a reason. The rule is approval precondition A4, so it can only stop an approval, never make a case stricter than review.

This is also where I stop adding rules for now. The prototype has grown with each review, and the point of the assessment is a clear set of rules, not the longest one.

### 4.16 The analyst can recommend approval, not only rejection (added 24 Oct 2026)
Going through an EDD case as analyst, I noticed the only recommendation on offer was rejection. That is lopsided: in practice the analyst prepares the enhanced due diligence (source of funds and wealth, ownership, a short memo) and recommends either way, and the MLRO decides. The analyst can now also recommend approval with a written reason. The case stays with the MLRO, the recommendation is logged and shown to the MLRO, and it needs complete documents like an approval does. Only the MLRO approves an EDD case, as before.

### 4.17 The client can send outstanding documents at any time (added 24 Oct 2026)
The status page asked the client to prepare items for the enhanced review but only offered an upload once an analyst had requested something. When the system itself was waiting for a missing document, there was no upload at all. That contradicts the point of showing the checklist up front. Now the client can upload whatever is outstanding at any time until the case is closed. The case stays with the person handling it; if it was only waiting for the client, it moves on, and the upload is logged like every other step.

### 4.18 Circle pattern instead of the rails pattern (added 24 Oct 2026, replaces the rails pattern from 4.13)
The header of the client view used my own pattern of rails running to the horizon, which looked quite different from the header of the Lunar Rails website. Their background is the classic "flower of life", overlapping circles on a triangular grid, a centuries-old geometric motif. I drew that motif myself as a small repeating tile instead of copying their file, so the client view now matches their look while every asset on the site is still my own.

### 4.19 Sharper sanctions and jurisdiction rules (added 24 Oct 2026, corrects the Syria part of 4.8)
Going through the rules again with a sanctions and AML lens, I changed four things:

- **Syria is no longer prohibited.** The comprehensive US and EU sanctions were lifted in 2025 and 2026, so my reasoning in 4.8 was out of date. Syria is still on the EU list of high-risk third countries and under FATF increased monitoring, where enhanced due diligence is required. It now sits on that list, and a jurisdiction on it scores 60 points, so it always leads to EDD (before, 25 points would have left it in the low band). Remaining targeted sanctions on individuals are caught by screening.
- **Owners are verified from 10% in higher-risk structures** (a holding in a low-transparency jurisdiction, a high-risk jurisdiction, or a PEP involved), otherwise from 25%. The lower threshold depends only on facts known before scoping, so it cannot change itself. Client B already uses it; its outcome is unchanged because its owners hold 70% and 30%.
- **Screening explicitly covers terrorist lists**, not only sanctions and PEP lists.
- **A sanctions questionnaire is required from every client**, because sanctions evasion is one of the main risks for an OTC desk.

What I considered and left out: a fourth "extreme" risk rating, with the UBO's age as a severe red flag. The extreme tier already exists as the hard rules that lead to a rejection recommendation, and I treat age as a reason for a protective call (4.15), not as a severe risk on its own.

## 5. Build plan (written before any UI code)

Deciding structure, screens and acceptance criteria up front, so the first build is close to final and later iterations are fine-tuning rather than rework. Rebuilding a UI because the structure was wrong is the most expensive kind of change, in time and in AI usage.

### Architecture
- Static site, plain HTML/CSS/JS, no build step. Hosted on Cloudflare at `kyb-demo.g11l.tech`.
- `ruleset.json` is loaded at runtime. Nothing about rules is hard-coded in the UI.
- `engine.js` is a pure function: `evaluate(case, ruleset) → decision + full trace`. The UI, the compliance view and the audit snapshot script all use the same engine, so they can't drift apart.
- The engine is tested from the command line against both mock clients before any UI exists.

### Screens
1. **Header:** prototype banner (mock data, built by Gerrit Schnell for Lunar Rails), case selector: Client A, Client B, or an editable custom case (later dropped, see below).
2. **Client view:** stepper (Company, Ownership & UBOs, Expected activity, Documents, Review & submit), then a status page that tells the client honestly what happens next: trading within 24h, or which extra information is needed and why.
3. **Live checks panel:** each input triggers the matching simulated check (Sumsub, registry, screening, KYT), clearly labelled as simulated.
4. **Compliance view:** case summary, risk score breakdown, which rule decided and why, analyst actions (confirm, request info, escalate, reject) with a mandatory reason, audit trail with hash-chain verification and JSON export.
5. **Ruleset tab & Rule Lab:** the active ruleset rendered as tables, with its version, plus the what-if toggles and editable parameters described below.
6. **"How I built this" tab:** this log, rendered.

### Decision: "What-if" panel instead of a free custom case
I considered letting reviewers create their own application. I dropped it: with no real Sumsub or screening connected, a free-form case with uploads would invite people to enter real names and documents, and a simulated "clear" result would make the whole flow look staged. Instead, the compliance view gets a **Rule Lab**: structured toggles on top of Client A or B (holding jurisdiction, PEP yes/no, volume tier, ownership layers, sanctions hit yes/no) plus editable ruleset parameters. It tests the rules, not a screening vendor, and every change is written to the audit trail.

### Non-functional
- `noindex` three ways: meta tag, `robots.txt`, `X-Robots-Tag` header.
- Works on mobile. No real personal data, no external API calls, no trackers.

### Acceptance criteria (checked before submission)
- Client A → `approve`, awaiting analyst confirmation (`shadow` mode), inside 24h.
- Client B → `escalate` via the PEP rule (H4); risk score high even without the PEP.
- Switching `pep_outcome` to `reject` changes Client B's recommendation, and the change is audited.
- No path leads to an automatic rejection.
- Audit chain verifies; editing an exported event breaks verification.
- Ruleset, compliance view and justification state the same rules.

## 6. What changed while building

The plan held. These are the places where building it taught me something:

- **Missing documents must not block a human review.** The first engine test failed on Client B with the PEP removed: it stopped at "documents missing" instead of escalating, because the document rule came first. That is the wrong priority: a high-risk case should reach the MLRO straight away and the documents should be requested alongside it. The document check became an *approval precondition* (A2): it can only stop an approval, never delay a review.
- **Approval only on all-green checks.** A medium-risk wallet adds 15 points, which on its own keeps a clean client in the low band. Approving that automatically would be wrong, so a second precondition (A1) sends any flagged check to an analyst, even in the low band.
- **What-if scenarios are not case history.** In the plan, every Rule Lab change was going to be written to the audit trail. While building it became clear that a hypothetical scenario does not belong in a client's case file. Scenario toggles are previews only; ruleset changes go through propose → second approver → new version, and every open case is re-evaluated and logged.
- **Once a person routes a case, new rules can only make it stricter.** If an analyst escalated a case and a ruleset change would now approve it automatically, the case stays with the person handling it.
- **Client messages are tested, not just written carefully.** A test sweeps 442,368 combinations of scenario and ruleset settings and checks that no rejection is ever automatic, nothing is approved outside the low band or without all-green checks, and no client message mentions screening, PEPs or rule IDs.
- **No external requests at all.** Fonts are self-hosted and the security headers only allow the site's own files, so the "nothing leaves your browser" promise in the banner is enforced, not just stated.

## 7. Acceptance check (23 Oct 2026)

- [x] Client A → `approve` via the low risk band, awaiting analyst confirmation in `shadow` mode. Checks finish in seconds; the 24-hour target only depends on the analyst confirmation.
- [x] Client B → `escalate` via H4 (PEP), score 90. Without the PEP: score 60, still `escalate`.
- [x] `pep_outcome = reject` turns Client B into a reject *recommendation* that waits for the MLRO; the change is logged as proposed and approved, and open cases are re-evaluated.
- [x] No automatic rejection in 442,368 tested combinations; the engine refuses a ruleset that would allow one.
- [x] Audit chains verify in the browser and on the command line; the tamper test and an edited export both fail verification at the edited event.
- [x] Ruleset tab, compliance view and `JUSTIFICATION.md` describe the same rules (all rendered from or checked against `ruleset.json`).
