# Audit log

Every action in an onboarding case is written as an event: automated checks, rule evaluations, analyst decisions and ruleset changes. The goal is that anyone can reconstruct, months later, why a client was approved, held or escalated, and under which version of the rules.

## Event schema

| Field | Example | Why |
|---|---|---|
| `event_id` | `evt_000014` | Unique, sequential per case |
| `timestamp_utc` | `2026-10-23T13:05:12Z` | When it happened |
| `case_id` | `CASE-A-0001` | Which onboarding |
| `ruleset_version` | `1.0.0` | Which rules applied at that moment |
| `actor` | `system` / `analyst:demo-analyst` | Who acted: the system or a named person |
| `action` | `check.C3`, `decision.confirm_approval` | What happened |
| `inputs_hash` | `sha256:…` | Fingerprint of the data the decision was based on |
| `result` | `flag`, `approved` | Outcome |
| `reason` | `H3: Potential sanctions match` | Rule, or the person's mandatory written reason |
| `details` | `{ "requested_items": [...] }` | Structured context: check items, risk factors, requested documents |
| `prev_event_hash` | `sha256:…` | Links to the previous event (tamper evidence) |
| `hash` | `sha256:…` | Hash of this whole event, including the previous hash |

## Tamper evidence

Events are append-only and hash-chained: each event includes the hash of the one before it. Editing or deleting any past event breaks the chain from that point on, which a verification step detects.

## What is stored in this repo

The files in this folder are **demo snapshots** generated from the mock clients by `scripts/generate-audit.mjs`, with a fixed clock so they are reproducible:

- `client-a.json`: account created with consents, automated checks, approval recommended, confirmed by an analyst, trading enabled.
- `client-b.json`: account created with consents, automated checks, escalated to EDD by the PEP rule, MLRO requests financial statements and source of wealth.

In the live prototype, the audit trail of a session is shown in the compliance view and can be exported as JSON. Any export can be checked with `node scripts/verify-audit.mjs <file>`; changing a single character in an event makes verification fail at that event. Each export also states its event count and last (head) hash, and the verifier checks both, so removing events from the end is detected as well. Someone who rewrites the whole file, header included, can only be caught against a copy of the head hash kept elsewhere; that is what the external anchor below is for.

## In production

A static repo is not an audit database. In production the same events would go to append-only storage, for example:

- a Postgres table with insert-only permissions (no update or delete grants) and periodic hash anchoring, or WORM object storage
- synced to Notion or another internal tool for readable case views, with the append-only store remaining the source of truth
- retained according to the applicable record-keeping period
