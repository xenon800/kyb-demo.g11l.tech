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
- [ ] Excluded jurisdictions: is there a published Lunar Rails list?
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
