# Audit log

Every action in an onboarding case is written as an event: automated checks, rule evaluations, analyst decisions and ruleset changes. The goal is that anyone can reconstruct, months later, why a client was approved, held or escalated, and under which version of the rules.

## Event schema

| Field | Example | Why |
|---|---|---|
| `event_id` | `evt_000014` | Unique, sequential per case |
| `timestamp_utc` | `2026-10-23T13:05:12Z` | When it happened |
| `case_id` | `CASE-A-0001` | Which onboarding |
| `ruleset_version` | `1.0.0` | Which rules applied at that moment |
| `actor` | `system` / `analyst:jdoe` | Who decided: system or a named person |
| `action` | `check.sanctions_screening` | What happened |
| `inputs_hash` | `sha256:…` | Fingerprint of the data the decision was based on |
| `result` | `potential_match` | Outcome |
| `reason` | `H3` | Rule or free-text justification |
| `prev_event_hash` | `sha256:…` | Links to the previous event (tamper evidence) |

## Tamper evidence

Events are append-only and hash-chained: each event includes the hash of the one before it. Editing or deleting any past event breaks the chain from that point on, which a verification step detects.

## What is stored in this repo

The files in this folder are **demo snapshots** generated from the mock clients in the prototype. In the live prototype, the audit trail of a session is shown in the compliance view and can be exported as JSON.

## In production

A static repo is not an audit database. In production the same events would go to append-only storage, for example:

- a Postgres table with insert-only permissions (no update or delete grants) and periodic hash anchoring, or WORM object storage
- synced to Notion or another internal tool for readable case views, with the append-only store remaining the source of truth
- retained according to the applicable record-keeping period
