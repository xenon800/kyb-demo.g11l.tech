// Append-only, hash-chained audit log.
//
// Every event stores the SHA-256 hash of the event before it. Changing or
// deleting any past event breaks the chain from that point on, and
// verifyChain() reports exactly where. Works in the browser and in Node 20+
// (both provide crypto.subtle).

export const GENESIS_HASH = 'sha256:' + '0'.repeat(64);
export const EXPORT_FORMAT = 'kyb-demo-audit/1';

/** Stable JSON: sorted keys, so the same content always hashes the same. */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

export async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class AuditLog {
  /**
   * @param {string} caseId
   * @param {{clock?: () => Date}} [options] clock is injectable so snapshots are reproducible
   */
  constructor(caseId, { clock = () => new Date() } = {}) {
    this.caseId = caseId;
    this.clock = clock;
    this.events = [];
    this._queue = Promise.resolve();
  }

  /** Appends are serialised, so events can never be written out of order. */
  append(entry) {
    const run = this._queue.then(() => this._append(entry));
    this._queue = run.catch(() => {});
    return run;
  }

  async _append({ actor, action, result, reason = null, details = null, inputs, ruleset_version }) {
    const prev = this.events[this.events.length - 1];
    const event = {
      event_id: 'evt_' + String(this.events.length + 1).padStart(6, '0'),
      timestamp_utc: this.clock().toISOString(),
      case_id: this.caseId,
      ruleset_version: ruleset_version ?? null,
      actor,
      action,
      // Only a fingerprint of the input data is stored, not the data itself.
      inputs_hash: inputs === undefined ? null : await sha256(canonical(inputs)),
      result,
      reason,
      details,
      prev_event_hash: prev ? prev.hash : GENESIS_HASH,
    };
    event.hash = await sha256(canonical(event));
    this.events.push(event);
    return event;
  }

  async export() {
    return {
      format: EXPORT_FORMAT,
      case_id: this.caseId,
      exported_at: this.clock().toISOString(),
      event_count: this.events.length,
      verification: await verifyChain(this.events),
      events: this.events,
    };
  }
}

/** Recompute every hash and every link. */
export async function verifyChain(events) {
  let prev = GENESIS_HASH;
  for (let i = 0; i < events.length; i++) {
    const { hash, ...rest } = events[i];
    if (rest.prev_event_hash !== prev) {
      return { ok: false, count: events.length, broken_at: rest.event_id, index: i, reason: 'Link to the previous event is broken' };
    }
    const recomputed = await sha256(canonical(rest));
    if (recomputed !== hash) {
      return { ok: false, count: events.length, broken_at: rest.event_id, index: i, reason: 'Event content does not match its hash' };
    }
    prev = hash;
  }
  return { ok: true, count: events.length, head_hash: prev };
}
