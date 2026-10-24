// Command-line tests for the decision engine and the audit chain.
// Run: node scripts/test-engine.mjs   (no dependencies)

import { readFileSync } from 'node:fs';
import {
  evaluate,
  validateRuleset,
  applyScenario,
  setParameter,
  personsInScope,
  RulesetError,
} from '../assets/engine.js';
import { AuditLog, verifyChain, verifyExport } from '../assets/audit.js';

const root = new URL('..', import.meta.url);
const ruleset = JSON.parse(readFileSync(new URL('ruleset.json', root), 'utf8'));
const clients = JSON.parse(readFileSync(new URL('data/clients.json', root), 'utf8'));

let passed = 0;
let failed = 0;
function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? `  (${detail})` : ''}`);
  }
}

console.log('\nRuleset');
check(`ruleset v${ruleset.version} passes all guardrails`, validateRuleset(ruleset).length === 0, validateRuleset(ruleset).join('; '));

console.log('\nClient A: Canadian company, simple ownership, normal volumes');
const a = evaluate(clients.A, ruleset);
check('risk score 0, band low', a.risk.score === 0 && a.risk.band === 'low', `${a.risk.score}/${a.risk.band}`);
check('decided by the risk band (no hard rule matched)', a.decision.rule_id === 'BAND:low' && a.hard_rule_matches.length === 0);
check('outcome approve', a.decision.outcome === 'approve');
check('shadow mode: awaiting analyst confirmation, not final', a.decision.status === 'awaiting_confirmation' && !a.decision.automated_final);
check('volume tier V1', a.volume_tier.id === 'V1');
check('all 8 documents provided (including the sanctions questionnaire)', a.documents.length === 8 && a.missing_documents.length === 0);
check('one person in scope', a.persons_in_scope.length === 1);
check('client is told: trading within 24 hours', a.client_message.body.includes('within 24 hours'));

console.log('\nClient B: UAE company, BVI holding, PEP director, high volumes');
const b = evaluate(clients.B, ruleset);
check('decided by H4 (PEP)', b.decision.rule_id === 'H4', b.decision.rule_id);
check('outcome escalate → EDD with the MLRO', b.decision.outcome === 'escalate' && b.decision.status === 'edd' && b.decision.queue === 'MLRO');
check('risk score 90, band high', b.risk.score === 90 && b.risk.band === 'high', `${b.risk.score}/${b.risk.band}`);
check('missing: financial statements + source of wealth', b.missing_documents.map((d) => d.doc).sort().join() === 'financial_statements,source_of_wealth');
check('…requested from the client alongside the EDD, not blocking it', b.client_message.items.some((i) => i.startsWith('Latest annual financial statements')) && b.client_message.items.some((i) => i.startsWith('Source of wealth')));
check('three persons in scope (70% UBO, 30% UBO, PEP director)', b.persons_in_scope.length === 3);
check('effective ownership through the holding: 70 / 30', b.ownership.effective.persons.P1 === 70 && b.ownership.effective.persons.P2 === 30);
check('holding registry needs manual verification', b.checks.find((c) => c.id === 'C2').status === 'manual');

const bNoPep = evaluate(applyScenario(clients.B, { pep: 'no' }, ruleset), ruleset);
check('without the PEP: score 60, still high → escalate', bNoPep.risk.score === 60 && bNoPep.risk.band === 'high' && bNoPep.decision.outcome === 'escalate');

console.log('\nApproval preconditions and bands (what-if on Client A)');
const aKyt = evaluate(applyScenario(clients.A, { kyt: 'medium' }, ruleset), ruleset);
check('medium wallet risk: still low band, but A1 sends it to review', aKyt.risk.band === 'low' && aKyt.decision.rule_id === 'A1' && aKyt.decision.outcome === 'review');
const aDoc = evaluate(applyScenario(clients.A, { documents: 'missing_one' }, ruleset), ruleset);
check('one document missing: A2 asks the client (pending information)', aDoc.decision.rule_id === 'A2' && aDoc.decision.status === 'awaiting_client');
check('…and names the missing document', aDoc.client_message.items.some((i) => i.startsWith('Commercial registry extract')));
const aVg = evaluate(applyScenario(clients.A, { holding: 'VG', documents: 'all' }, ruleset), ruleset);
check('BVI holding added: 35 points, medium band → review', aVg.risk.score === 35 && aVg.decision.outcome === 'review');
const aV2 = evaluate(applyScenario(clients.A, { volume: 450000 }, ruleset), ruleset);
check('volume raised to V2: bank statements + SoF requested before approval', aV2.decision.rule_id === 'A2' && aV2.missing_documents.length === 2);
const aIr = evaluate(applyScenario(clients.A, { holding: 'IR', documents: 'all' }, ruleset), ruleset);
check('holding in a prohibited jurisdiction: H1, reject recommended to the MLRO only', aIr.decision.rule_id === 'H1' && aIr.decision.status === 'pending_mlro_decision');

console.log('\nRuleset changes');
const rsReject = setParameter(ruleset, 'parameters.pep_outcome', 'reject');
const bReject = evaluate(clients.B, rsReject);
check('pep_outcome = reject → Client B recommendation becomes reject', bReject.decision.outcome === 'reject');
check('…but it is never final without the MLRO', bReject.decision.status === 'pending_mlro_decision' && !bReject.decision.automated_final);
const rs50 = setParameter(setParameter(ruleset, 'parameters.ubo_ownership_threshold_pct', 50), 'parameters.ubo_ownership_threshold_high_risk_pct', 50);
check('UBO threshold 50% → the 30% owner drops out of scope', personsInScope(clients.B, rs50).filter((p) => p.in_scope).length === 2);
const rsFull = setParameter(ruleset, 'parameters.auto_approve_mode', 'full');
const aFull = evaluate(clients.A, rsFull);
check('auto_approve_mode = full → Client A approved without a human', aFull.decision.status === 'approved' && aFull.decision.automated_final);
const broken = JSON.parse(JSON.stringify(ruleset));
broken.decision_rules.hard_rules[0].decided_by = 'system';
check('guardrail: a ruleset with an automatic rejection is refused', validateRuleset(broken).length > 0);
let threw = false;
try {
  evaluate(clients.A, broken);
} catch (e) {
  threw = e instanceof RulesetError;
}
check('…and the engine will not run with it', threw);
const brokenBand = JSON.parse(JSON.stringify(ruleset));
brokenBand.decision_rules.band_rules[2].outcome = 'reject';
check('guardrail: a risk score alone can never reject', validateRuleset(brokenBand).length > 0);

console.log('\nExhaustive what-if sweep');
const options = {
  holding: ['asis', 'none', 'CA', 'AE', 'CH', 'KY', 'VG', 'IR'],
  pep: ['asis', 'yes', 'no'],
  volume: ['asis', 60000, 450000, 4500000],
  sanctions: ['asis', 'clear', 'potential_match', 'confirmed_match'],
  adverse_media: ['asis', 'clear', 'hit'],
  kyt: ['asis', 'low', 'medium', 'high'],
  documents: ['as_submitted', 'all', 'missing_one'],
  industry: ['asis', 'high'],
  nominee: ['asis', 'yes'],
};
const variants = [ruleset, rsReject, rsFull, setParameter(ruleset, 'parameters.auto_approve_mode', 'sample')];
const keys = Object.keys(options);
let combos = 0;
const violations = [];
const leakWords = /\b(H\d|R\d+|PEP|sanction|screening|politically|adverse|reject)/i;
function sweep(i, scenario) {
  if (i === keys.length) {
    for (const base of ['A', 'B']) {
      for (const rs of variants) {
        combos++;
        const r = evaluate(applyScenario(clients[base], scenario, rs), rs);
        const d = r.decision;
        if (d.outcome === 'reject' && d.automated_final) violations.push(['automatic rejection', base, scenario]);
        if (d.outcome === 'reject' && !['H1', 'H2', 'H4'].includes(d.rule_id)) violations.push(['reject from unexpected rule', base, scenario]);
        if (d.outcome === 'approve' && r.risk.band !== 'low') violations.push(['approve outside the low band', base, scenario]);
        if (d.outcome === 'approve' && (r.missing_documents.length || r.checks.some((k) => k.status !== 'pass')))
          violations.push(['approve without all-green checks and complete documents', base, scenario]);
        if (d.automated_final && d.outcome !== 'approve') violations.push(['automated final decision that is not an approval', base, scenario]);
        const m = r.client_message;
        if (leakWords.test(`${m.title} ${m.body} ${m.items.join(' ')}`)) violations.push(['client message leaks internal detail', base, scenario, m]);
      }
    }
    return;
  }
  for (const v of options[keys[i]]) sweep(i + 1, { ...scenario, [keys[i]]: v });
}
sweep(0, {});
check(`${combos.toLocaleString('en')} combinations evaluated without a guardrail violation`, violations.length === 0, violations.length ? JSON.stringify(violations[0]) : '');

console.log('\nAudit chain');
let t = Date.parse('2026-10-23T10:00:00Z');
const log = new AuditLog('TEST', { clock: () => new Date((t += 1000)) });
await log.append({ actor: 'system', action: 'case.created', result: 'submitted', ruleset_version: '1.0.0', inputs: clients.A });
await log.append({ actor: 'system', action: 'rules.evaluated', result: 'approve', reason: 'BAND:low', ruleset_version: '1.0.0' });
await log.append({ actor: 'analyst:demo', action: 'decision.confirmed', result: 'approved', reason: 'All checks clear', ruleset_version: '1.0.0' });
check('a fresh chain verifies', (await verifyChain(log.events)).ok);
const tampered = JSON.parse(JSON.stringify(log.events));
tampered[1].result = 'escalate';
const v1 = await verifyChain(tampered);
check('editing an event breaks verification at that event', !v1.ok && v1.broken_at === 'evt_000002', JSON.stringify(v1));
const removed = JSON.parse(JSON.stringify(log.events)).filter((_, i) => i !== 1);
const v2 = await verifyChain(removed);
check('deleting an event breaks the chain', !v2.ok, JSON.stringify(v2));
const exported = await log.export();
check('an untouched export verifies with count and head hash', (await verifyExport(exported)).ok);
const truncated = JSON.parse(JSON.stringify(exported));
truncated.events = truncated.events.slice(0, -1);
const v3 = await verifyExport(truncated);
check('removing the last event of an export is detected', !v3.ok, JSON.stringify(v3));
const lyingCount = JSON.parse(JSON.stringify(truncated));
lyingCount.event_count = lyingCount.events.length;
const v4 = await verifyExport(lyingCount);
check('a truncated export with a corrected count still fails on the head hash', !v4.ok, JSON.stringify(v4));

console.log('\nRuleset 1.2 rules');
const aV3 = evaluate(applyScenario(clients.A, { volume: 2500000, documents: 'all' }, ruleset), ruleset);
check('Client A at USD 2.5M a month goes to a human review via A3, not an approval', aV3.decision.outcome === 'review' && aV3.decision.rule_id === 'A3', `${aV3.decision.outcome} ${aV3.decision.rule_id}`);
const aV3Doc = evaluate(applyScenario(clients.A, { volume: 2500000, documents: 'missing_one' }, ruleset), ruleset);
check('a missing document does not delay the V3 review (A3 before A2)', aV3Doc.decision.rule_id === 'A3', aV3Doc.decision.rule_id);
const aExactly1M = evaluate(applyScenario(clients.A, { volume: 1000000, documents: 'all' }, ruleset), ruleset);
check('exactly USD 1M a month counts as V3 ("USD 1M or more")', aExactly1M.volume_tier.id === 'V3', aExactly1M.volume_tier.id);

console.log('\nRuleset 1.3 rules');
const olderOwner = JSON.parse(JSON.stringify(clients.A));
olderOwner.ownership.persons[0].date_of_birth = '1962-03-01';
const aOld = evaluate(olderOwner, ruleset);
check('a single owner aged 60 or older goes to a review via A4 (call by the account manager)', aOld.decision.outcome === 'review' && aOld.decision.rule_id === 'A4', `${aOld.decision.outcome} ${aOld.decision.rule_id}`);
const justUnder = JSON.parse(JSON.stringify(clients.A));
justUnder.ownership.persons[0].date_of_birth = '1966-12-01';
check('a single owner aged 59 is not affected', evaluate(justUnder, ruleset).decision.rule_id !== 'A4');
const bOld = JSON.parse(JSON.stringify(clients.B));
bOld.ownership.persons.forEach((p) => (p.date_of_birth = '1950-01-01'));
check('A4 only applies with a single owner (Client B has two)', !evaluate(bOld, ruleset).precondition_matches.some((m) => m.id === 'A4'));
check('age alone never escalates or rejects', ['review'].includes(aOld.decision.outcome));

console.log('\nRuleset 1.4 rules');
check('Client A uses the standard 25% ownership threshold', a.ubo_threshold.pct === 25 && !a.ubo_threshold.high_risk);
check('Client B uses the 10% threshold (BVI holding and PEP)', b.ubo_threshold.pct === 10 && b.ubo_threshold.reasons.length === 2, JSON.stringify(b.ubo_threshold));
const aSyria = JSON.parse(JSON.stringify(clients.A));
aSyria.ownership.persons[0].residence = 'SY';
const evSyria = evaluate(aSyria, ruleset);
check('Syria is no longer prohibited: a Syria-resident owner is escalated to EDD, not rejected', evSyria.decision.outcome === 'escalate' && !evSyria.hard_rule_matches.some((m) => m.id === 'H1'), `${evSyria.decision.outcome} ${evSyria.decision.rule_id}`);
check('a high-risk jurisdiction also lowers the ownership threshold to 10%', evSyria.ubo_threshold.pct === 10);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
