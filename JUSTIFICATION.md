# Justification

The three weeks are lost in manual evidence collection and manual checks, not in the decisions themselves. So I automate collection, checks, scoring and routing, and keep people on the decisions that need judgment. Low- and medium-risk clients can trade within 24 hours; high-risk clients go to enhanced due diligence by design.

## Rules: approve, review, escalate, reject

One versioned ruleset (`ruleset.json`) is evaluated in a fixed order:

1. **Hard rules**, top to bottom. The first match decides.
2. **Risk score** from weighted factors: holding layers, low-transparency holding, PEP, volume tier, industry, company age, nominee structures, wallet risk.
3. **Approval preconditions**: an approval also needs all-green checks and complete documents. Missing items never block a human review; they are requested alongside it.

| Outcome | When | Who decides |
|---|---|---|
| **Approve** | Score 0–29, all checks green, documents complete | System recommends, an analyst confirms (target: within 24 h) |
| **Review** | Score 30–59, potential sanctions match, registry or ID mismatch, adverse media, any flagged check | Analyst, within 1 business day |
| **Escalate** | PEP, score 60 or more, high-risk wallet | MLRO runs EDD; a PEP also needs senior management approval |
| **Reject** | Prohibited jurisdiction, confirmed sanctions match | MLRO only, never automatic |

**Client A** scores 0 and is approved once an analyst confirms. **Client B** escalates through the PEP rule. Even without the PEP it scores 60 (BVI holding, one ownership layer, more than USD 1M a month) and would still escalate.

## What I automated and what I would never automate

**Automated:** a document checklist tailored to the client's structure and volume, shown before they start; registry lookup; ID and liveness; sanctions, PEP and adverse media screening; wallet screening; effective ownership through holdings; scoring; routing; client messages.

**Never automated:** rejecting a client, deciding whether a sanctions match is real, approving a PEP or EDD case, overriding a rule or a score, and changing the ruleset.

Auto-approval is earned, not switched on. It starts in shadow mode, where an analyst confirms every approval, moves to sampling once system and analysts agree consistently on real cases, and only then to full automation. One parameter controls this.

## How each decision is recorded

Every check, rule evaluation, routing step, human decision (with a mandatory reason) and ruleset change is appended to a hash-chained log with timestamp, actor, ruleset version, result, reason and a fingerprint of the input data. Editing or deleting any event breaks the chain, and verification shows exactly where. Logs export as JSON; in production they go to append-only storage. A ruleset change needs a second approver and creates a new version, so every decision can be traced to the rules that applied at the time. Client messages never reveal screening results or rule IDs.

## Assumptions

Thresholds, weights and jurisdiction lists are my proposal for Compliance to set. In production the checks would run through Sumsub and a blockchain analytics provider; the prototype simulates their responses.
