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
