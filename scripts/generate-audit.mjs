// Generates the example audit trails in audit/ from the same engine and audit
// code the site uses. Timestamps come from a fixed clock, so the output is
// reproducible: running this twice produces identical files.
// Run: node scripts/generate-audit.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { evaluate, clientMessage, OUTCOME_LABELS } from '../assets/engine.js';
import { AuditLog } from '../assets/audit.js';

const root = new URL('..', import.meta.url);
const ruleset = JSON.parse(readFileSync(new URL('ruleset.json', root), 'utf8'));
const clients = JSON.parse(readFileSync(new URL('data/clients.json', root), 'utf8'));
const V = ruleset.version;

function fixedClock(startIso) {
  let t = Date.parse(startIso);
  return {
    now: () => new Date(t),
    advance: (seconds) => (t += seconds * 1000),
  };
}

const STEP_ORDER = ['company', 'ownership', 'activity', 'documents'];
const providerLabel = (p) => (p === 'Rule engine' ? p : `${p}, simulated`);

async function automatedPart(caseData, log, clk) {
  const ev = evaluate(caseData, ruleset);
  await log.append({ actor: 'client:applicant', action: 'application.started', result: 'started', reason: `${caseData.label}: ${caseData.company.legal_name}`, inputs: { company: caseData.company }, ruleset_version: V });
  for (const step of STEP_ORDER) {
    clk.advance(90);
    for (const k of ev.checks.filter((c) => c.step === step)) {
      clk.advance(3);
      await log.append({ actor: 'system', action: `check.${k.id}`, result: k.status, reason: k.summary, details: { check: k.name, provider: providerLabel(k.provider), items: k.items }, inputs: caseData, ruleset_version: V });
    }
  }
  clk.advance(60);
  await log.append({ actor: 'client:applicant', action: 'application.submitted', result: 'submitted', inputs: caseData, ruleset_version: V });
  clk.advance(1);
  await log.append({
    actor: 'system',
    action: 'risk.scored',
    result: `${ev.risk.score} (${ev.risk.band})`,
    reason: ev.risk.factors.filter((f) => f.matched).map((f) => `${f.id} +${f.points}`).join(', ') || 'No risk factors',
    details: { factors: ev.risk.factors.filter((f) => f.matched) },
    inputs: caseData,
    ruleset_version: V,
  });
  clk.advance(1);
  await log.append({
    actor: 'system',
    action: 'rules.evaluated',
    result: ev.decision.outcome,
    reason: `${ev.decision.rule_id}: ${ev.decision.rule_text}`,
    details: {
      hard_rule_matches: ev.hard_rule_matches.map((r) => r.id),
      precondition_matches: ev.precondition_matches.map((r) => r.id),
      decided_by: ev.decision.decided_by,
      automated_final: ev.decision.automated_final,
    },
    inputs: caseData,
    ruleset_version: V,
  });
  clk.advance(1);
  await log.append({ actor: 'system', action: 'case.routed', result: ev.decision.status, reason: `Queue: ${ev.decision.queue}`, inputs: caseData, ruleset_version: V });
  const m = clientMessage(ev, ruleset);
  await log.append({ actor: 'system', action: 'client.notified', result: m.title, reason: 'Template message; no screening results or rule IDs are shared with the client', details: { template: ev.decision.status, items: m.items }, ruleset_version: V });
  return ev;
}

async function clientA() {
  const clk = fixedClock('2026-10-23T08:00:00Z');
  const log = new AuditLog(clients.A.case_id, { clock: clk.now });
  const ev = await automatedPart(clients.A, log, clk);
  clk.advance(2 * 3600 + 14 * 60); // analyst picks it up about two hours later
  await log.append({
    actor: 'analyst:demo-analyst',
    action: 'decision.confirm_approval',
    result: 'approved',
    reason: 'All checks green, registry data matches, single UBO verified. Approving for trading.',
    details: { from_status: ev.decision.status, to_status: 'approved', system_recommendation: ev.decision.outcome, deciding_rule: ev.decision.rule_id },
    ruleset_version: V,
  });
  await log.append({ actor: 'system', action: 'trading.enabled', result: 'OTC trading enabled', reason: 'Approved by analyst', ruleset_version: V });
  await log.append({ actor: 'system', action: 'client.notified', result: 'You are ready to trade', reason: 'Template message; no screening results or rule IDs are shared with the client', details: { template: 'approved', items: [] }, ruleset_version: V });
  return { log, summary: `${OUTCOME_LABELS[ev.decision.outcome]} via ${ev.decision.rule_id}, confirmed by an analyst about 2 h 20 min after the application started` };
}

async function clientB() {
  const clk = fixedClock('2026-10-23T08:00:00Z');
  const log = new AuditLog(clients.B.case_id, { clock: clk.now });
  const ev = await automatedPart(clients.B, log, clk);
  clk.advance(55 * 60);
  const items = ['Latest annual financial statements', 'Source of wealth evidence for the beneficial owners'];
  await log.append({
    actor: 'mlro:demo-mlro',
    action: 'decision.request_info',
    result: 'awaiting_client',
    reason: 'EDD opened for PEP director and BVI holding. Requesting financial statements and source of wealth before review.',
    details: { from_status: ev.decision.status, to_status: 'awaiting_client', system_recommendation: ev.decision.outcome, deciding_rule: ev.decision.rule_id, requested_items: items },
    ruleset_version: V,
  });
  await log.append({ actor: 'system', action: 'client.notified', result: 'We need a few more items', reason: 'Template message; no screening results or rule IDs are shared with the client', details: { template: 'awaiting_client', items }, ruleset_version: V });
  return { log, summary: `${OUTCOME_LABELS[ev.decision.outcome]} via ${ev.decision.rule_id}; MLRO opened EDD and requested documents` };
}

for (const [name, fn] of [
  ['client-a', clientA],
  ['client-b', clientB],
]) {
  const { log, summary } = await fn();
  const data = await log.export();
  data.exported_at = log.events[log.events.length - 1].timestamp_utc;
  data.note = `Demo snapshot generated by scripts/generate-audit.mjs with ruleset ${V}. Mock data only.`;
  writeFileSync(new URL(`audit/${name}.json`, root), JSON.stringify(data, null, 2) + '\n');
  console.log(`audit/${name}.json  ${data.event_count} events, chain ${data.verification.ok ? 'verified' : 'BROKEN'}  (${summary})`);
}
