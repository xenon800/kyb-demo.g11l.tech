# Justification

The three weeks are lost in manual evidence collection and manual checks, not in the decisions themselves. So I automate collection, checks, scoring and routing, and keep people on the decisions that need judgment. Low-risk clients can trade within 24 hours and medium-risk clients after a review within one business day; high-risk clients go to enhanced due diligence by design.

## Rules: approve, review, escalate, reject

One versioned ruleset (`ruleset.json`) is evaluated in a fixed order:

1. **Hard rules**, top to bottom. The first match decides.
2. **Risk score** from eleven weighted factors, such as holding layers, PEP, volume, industry and wallet risk.
3. **Approval preconditions**: an approval also needs all-green checks and complete documents; from USD 1M a month, or with a single owner aged 60 or older, a person always reviews. Missing items are requested alongside any review; nobody approves without them.

| Outcome | When | Who decides |
|---|---|---|
| **Approve** | Score 0–29, all checks green, documents complete | System recommends, an analyst confirms (target: within 24 h) |
| **Review** | Score 30–59, USD 1M or more a month, a single owner aged 60 or older (fraud-protection call), potential sanctions match, registry or ID mismatch, adverse media, any flagged check | Analyst, within 1 business day |
| **Escalate** | PEP (including family members and close associates), score 60 or more, high-risk wallet | MLRO runs EDD; approval needs a recorded senior management sign-off |
| **Reject** | Prohibited jurisdiction, confirmed sanctions match | MLRO only, never automatic; required reports are made, the client is not told why |

**Client A** scores 0 and is approved once an analyst confirms. **Client B** escalates through the PEP rule; without the PEP it still scores 60 (BVI holding, one ownership layer, USD 1M or more a month).

## What I automated and what I would never automate

**Automated:** a document checklist shown before the client starts and tailored to their structure and volume; account creation with recorded consents; registry lookup; ID and liveness; sanctions, PEP and adverse media screening; wallet screening; effective ownership through holdings; scoring; routing; client messages, including one automated request for a corrected document (if the next upload still does not fit, the account manager calls).

**Never automated:** rejecting a client, deciding whether a sanctions match is real, approving a PEP or EDD case, overriding a rule or a score, and changing the ruleset.

Auto-approval is earned, not switched on. It starts in shadow mode, where an analyst confirms every approval, moves to sampling once system and analysts agree consistently on real cases, and only then to full automation. One parameter controls this.

## How each decision is recorded

Every account step (creation, email verification, consents), check, rule evaluation, routing step, human decision (with a mandatory reason and, for EDD, the senior management sign-off) and ruleset change is appended to a hash-chained log with timestamp, actor, ruleset version, result, reason and a fingerprint of the input data. Editing or deleting an event breaks the chain, and verification shows where. Exports state their event count and last hash, so removed trailing events are caught too; in production that hash is anchored outside the log. A ruleset change needs a second approver and creates a new version, so every decision can be traced to the rules that applied at the time. Client messages never reveal screening results or rule IDs.

## Assumptions

Thresholds, weights and jurisdiction lists are my proposal for Compliance to set. In production the checks would run through Sumsub and a blockchain analytics provider; the prototype simulates their responses. Travel Rule checks and proof of wallet ownership come before the first transfer, not during onboarding.
