// Decision engine for the OTC onboarding prototype.
//
// Pure functions only: the same case and the same ruleset always give the same
// result. The client view, the compliance view, the Rule Lab and the audit
// snapshot script all call this file, so they cannot drift apart.
//
// What lives where:
// - ruleset.json decides thresholds, points, outcomes, order and who decides.
// - This file only implements the named tests ("is a PEP present?") that the
//   ruleset refers to, plus guardrails that no ruleset can switch off.

export const OUTCOME_LABELS = {
  approve: 'Approve',
  review: 'Review',
  escalate: 'Escalate',
  reject: 'Reject',
  pending_information: 'Pending information',
};

export const STATUS_LABELS = {
  not_submitted: 'Not submitted',
  awaiting_confirmation: 'Awaiting analyst confirmation',
  approved: 'Approved, trading enabled',
  in_review: 'Manual review',
  edd: 'Enhanced due diligence',
  pending_mlro_decision: 'MLRO decision required',
  awaiting_client: 'Waiting for client',
  rejected: 'Rejected by MLRO',
};

export const COUNTRY_NAMES = {
  AE: 'United Arab Emirates', BZ: 'Belize', CA: 'Canada', CH: 'Switzerland', CU: 'Cuba',
  GB: 'United Kingdom', IN: 'India', IR: 'Iran', IT: 'Italy', KP: 'North Korea',
  KY: 'Cayman Islands', MM: 'Myanmar', PA: 'Panama', SC: 'Seychelles', SY: 'Syria',
  VG: 'British Virgin Islands',
};

const KNOWN_OUTCOMES = Object.keys(OUTCOME_LABELS);

// ---------------------------------------------------------------------------
// Small helpers

const round2 = (n) => Math.round(n * 100) / 100;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const clone = (o) => JSON.parse(JSON.stringify(o));

function monthsBetween(fromIso, toIso) {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  let m = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) m -= 1;
  return m;
}

// FNV-1a, used only to pick QA samples deterministically.
function bucket100(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

function resolveParam(value, params) {
  if (typeof value === 'string' && value.startsWith('param:')) return params[value.slice(6)];
  return value;
}

// ---------------------------------------------------------------------------
// Derived facts

/** Effective ownership of the client, multiplied through every holding layer. */
export function effectiveOwnership(caseData) {
  const holdings = caseData.ownership.holdings || [];
  const byId = Object.fromEntries(holdings.map((h) => [h.id, h]));
  const memo = { client: 100 };
  const visiting = new Set();

  function stake(entityId) {
    if (entityId in memo) return memo[entityId];
    const h = byId[entityId];
    if (!h || visiting.has(entityId)) return 0; // unknown entity or a loop
    visiting.add(entityId);
    const v = (h.owns || []).reduce((s, o) => s + (o.pct / 100) * stake(o.entity), 0);
    visiting.delete(entityId);
    memo[entityId] = v;
    return v;
  }

  const holdingStakes = Object.fromEntries(holdings.map((h) => [h.id, round2(stake(h.id))]));
  const personStakes = Object.fromEntries(
    caseData.ownership.persons.map((p) => [
      p.id,
      round2((p.owns || []).reduce((s, o) => s + (o.pct / 100) * stake(o.entity), 0)),
    ]),
  );
  return { holdings: holdingStakes, persons: personStakes };
}

/** Number of holding layers between the client and the people who own it. */
export function ownershipDepth(caseData) {
  const holdings = caseData.ownership.holdings || [];
  const byId = Object.fromEntries(holdings.map((h) => [h.id, h]));
  const memo = {};
  function depth(id, seen = new Set()) {
    if (id in memo) return memo[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const h = byId[id];
    const parents = (h?.owns || []).map((o) => (o.entity === 'client' ? 1 : 1 + depth(o.entity, seen)));
    memo[id] = parents.length ? Math.max(...parents) : 0;
    return memo[id];
  }
  return holdings.length ? Math.max(...holdings.map((h) => depth(h.id))) : 0;
}

/** Does every entity (client and holdings) have declared owners adding up to 100%? */
export function ownershipResolution(caseData) {
  const holdings = caseData.ownership.holdings || [];
  const entities = ['client', ...holdings.map((h) => h.id)];
  const declared = Object.fromEntries(entities.map((e) => [e, 0]));
  for (const owner of [...holdings, ...caseData.ownership.persons]) {
    for (const o of owner.owns || []) if (o.entity in declared) declared[o.entity] += o.pct;
  }
  const gaps = entities
    .filter((e) => declared[e] < 99.99)
    .map((e) => ({
      entity: e,
      name: e === 'client' ? caseData.company.legal_name : holdings.find((h) => h.id === e)?.name,
      unresolved_pct: round2(100 - declared[e]),
    }));
  return { resolved: gaps.length === 0, gaps };
}

/** Everyone who must pass ID, liveness and screening, with the reason why. */
/**
 * The ownership threshold from which owners are verified: the standard one, or the lower one
 * when the structure is higher risk (low-transparency holding, high-risk jurisdiction, PEP involved).
 * Based only on facts known before scoping, so it never depends on who ends up in scope.
 */
export function uboThreshold(caseData, ruleset) {
  const p = ruleset.parameters;
  const j = ruleset.jurisdictions;
  const standard = { pct: p.ubo_ownership_threshold_pct, high_risk: false, reasons: [] };
  if (p.ubo_ownership_threshold_high_risk_pct == null) return standard;
  const holdings = caseData.ownership.holdings || [];
  const listed = j.high_risk_fatf_increased_monitoring || [];
  const persons = caseData.ownership.persons || [];
  const pepHits = new Set(caseData.provider_responses?.pep_hits || []);
  const reasons = [];
  if (holdings.some((h) => (j.low_transparency_holding || []).includes(h.jurisdiction))) reasons.push('holding in a low-transparency jurisdiction');
  const places = [caseData.company.jurisdiction, ...holdings.map((h) => h.jurisdiction), ...persons.map((x) => x.residence)];
  if (places.some((c) => listed.includes(c))) reasons.push('high-risk jurisdiction involved');
  if (persons.some((x) => x.pep_declared || pepHits.has(x.id))) reasons.push('PEP involved');
  return reasons.length ? { pct: p.ubo_ownership_threshold_high_risk_pct, high_risk: true, reasons } : standard;
}

export function personsInScope(caseData, ruleset) {
  const threshold = uboThreshold(caseData, ruleset).pct;
  const eff = effectiveOwnership(caseData).persons;
  const people = caseData.ownership.persons.map((p) => {
    const pct = eff[p.id] ?? 0;
    const reasons = [];
    const isUbo = pct >= threshold || !!p.control;
    if (pct >= threshold) reasons.push(`Beneficial owner (${pct}%)`);
    if (p.control) reasons.push('Control by other means');
    if ((p.roles || []).includes('director')) reasons.push('Director');
    if ((p.roles || []).includes('authorised_signatory')) reasons.push('Authorised signatory');
    return { ...p, effective_pct: pct, is_ubo: isUbo, scope_reasons: reasons, in_scope: reasons.length > 0 };
  });
  if (!people.some((p) => p.is_ubo)) {
    const smo = people.find((p) => (p.roles || []).includes('director'));
    if (smo) {
      smo.scope_reasons.unshift('Senior managing official (no owner at or above the threshold)');
      smo.in_scope = true;
    }
  }
  return people;
}

export function volumeTier(volumeUsd, ruleset) {
  return ruleset.parameters.volume_tiers_usd_monthly.find((t) => t.max === null || volumeUsd < t.max);
}

/** The documents this specific client has to provide, and which are missing. */
export function requiredDocuments(caseData, ruleset) {
  const d = ruleset.documents;
  const tier = volumeTier(caseData.activity.expected_monthly_volume_usd, ruleset);
  const list = [];
  d.base.forEach((doc) => list.push({ key: doc, doc, group: 'company' }));
  (caseData.ownership.holdings || []).forEach((h) =>
    d.per_holding.forEach((doc) => list.push({ key: `${doc}#${h.id}`, doc, group: 'holding', holding_name: h.name })),
  );
  tier.additional_documents.forEach((doc) => list.push({ key: doc, doc, group: 'volume', tier: tier.id }));
  return list.map((r) => ({
    ...r,
    label: d.catalog[r.doc] || r.doc,
    status: caseData.documents?.[r.key] === 'provided' ? 'provided' : 'missing',
  }));
}

function involvedJurisdictions(caseData, inScope) {
  const set = new Set([caseData.company.jurisdiction]);
  (caseData.ownership.holdings || []).forEach((h) => set.add(h.jurisdiction));
  inScope.forEach((p) => p.residence && set.add(p.residence));
  return [...set];
}

// ---------------------------------------------------------------------------
// Named tests the ruleset can refer to. Each returns a number of units
// (0 = no match). Booleans count as 0 or 1.

const TESTS = {
  prohibited_jurisdiction: (c) => c.jurisdictions.some((j) => c.rs.jurisdictions.prohibited.includes(j)),
  sanctions_confirmed: (c) => c.provider.sanctions === 'confirmed_match',
  sanctions_potential: (c) => c.provider.sanctions === 'potential_match',
  pep_present: (c) => c.pepPersons.length > 0,
  kyt_high: (c) => c.provider.kyt === 'high',
  kyt_medium: (c) => c.provider.kyt === 'medium',
  verification_failed: (c) =>
    c.provider.registry?.client === 'mismatch' ||
    c.inScope.some((p) => (c.provider.id_liveness?.[p.id] ?? 'pass') === 'fail'),
  adverse_media_hit: (c) => c.provider.adverse_media === 'hit',
  documents_incomplete: (c) => c.missingDocs.length > 0 || !c.resolution.resolved,
  // Screening and verification checks only; documents and ownership are covered by documents_incomplete.
  checks_need_attention: (c) => c.checks.some((k) => ['C1', 'C2', 'C3', 'C4', 'C5'].includes(k.id) && k.status !== 'pass'),
  ownership_layers: (c) => c.depth,
  holding_low_transparency: (c) =>
    (c.caseData.ownership.holdings || []).some((h) => c.rs.jurisdictions.low_transparency_holding.includes(h.jurisdiction)),
  volume_tier: (c, f) => c.tier.id === f.tier,
  industry_high_risk: (c) => c.caseData.company.industry_risk === 'high',
  company_younger_than_months: (c, f) => monthsBetween(c.caseData.company.incorporated, c.asOf) < f.months,
  increased_monitoring_jurisdiction: (c) =>
    c.jurisdictions.some((j) => c.rs.jurisdictions.high_risk_fatf_increased_monitoring.includes(j)),
  nominee_or_bearer: (c) => !!c.caseData.ownership.nominee_or_bearer,
  // A single beneficial owner at or above an age (fraud protection: a call with the owner, never an escalation by itself).
  sole_ubo_aged_at_least: (c, f) => {
    const ubos = c.persons.filter((p) => p.is_ubo);
    if (ubos.length !== 1 || !ubos[0].date_of_birth) return false;
    return Math.floor(monthsBetween(ubos[0].date_of_birth, c.asOf) / 12) >= f.years;
  },
};

export const KNOWN_TESTS = Object.keys(TESTS);

// ---------------------------------------------------------------------------
// Ruleset validation: guardrails that hold no matter how the file is edited.

export function validateRuleset(rs) {
  const e = [];
  const p = rs?.parameters;
  if (!p) return ['Ruleset has no parameters.'];

  if (p.ubo_ownership_threshold_high_risk_pct != null && !(p.ubo_ownership_threshold_high_risk_pct >= 1 && p.ubo_ownership_threshold_high_risk_pct <= p.ubo_ownership_threshold_pct))
    e.push('The higher-risk UBO threshold must be between 1 percent and the standard threshold.');
  if (!(p.ubo_ownership_threshold_pct >= 1 && p.ubo_ownership_threshold_pct <= 100))
    e.push('UBO ownership threshold must be between 1 and 100 percent.');
  if (!Object.keys(p.auto_approve_mode_options || {}).includes(p.auto_approve_mode))
    e.push(`Auto-approve mode "${p.auto_approve_mode}" is not one of the allowed modes.`);
  if (!(p.pep_outcome_options || []).includes(p.pep_outcome))
    e.push(`PEP outcome "${p.pep_outcome}" is not one of the allowed options.`);
  if (!(p.qa_sample_rate_pct >= 0 && p.qa_sample_rate_pct <= 100)) e.push('QA sample rate must be between 0 and 100.');

  const tiers = p.volume_tiers_usd_monthly || [];
  if (!tiers.length || tiers[tiers.length - 1].max !== null) e.push('The last volume tier must be open-ended (max: null).');
  for (let i = 1; i < tiers.length - 1; i++) {
    if (!(tiers[i].max > tiers[i - 1].max)) e.push(`Volume tier ${tiers[i].id} must start above ${tiers[i - 1].id}.`);
  }
  if (tiers.slice(0, -1).some((t) => !(t.max > 0))) e.push('Volume tier limits must be positive numbers.');

  const b = p.risk_score_bands || {};
  if (!(b.low_max >= 0 && b.medium_max > b.low_max)) e.push('Risk bands must satisfy 0 ≤ low max < medium max.');

  for (const f of rs.risk_factors || []) {
    if (!KNOWN_TESTS.includes(f.test)) e.push(`Risk factor ${f.id} uses an unknown test "${f.test}".`);
    if (!(f.points >= 0)) e.push(`Risk factor ${f.id} must have zero or positive points.`);
  }

  for (const r of [...(rs.decision_rules?.hard_rules || []), ...(rs.decision_rules?.approval_preconditions || [])]) {
    if (!KNOWN_TESTS.includes(r.test)) e.push(`Rule ${r.id} uses an unknown test "${r.test}".`);
    const possible = r.outcome === 'param:pep_outcome' ? p.pep_outcome_options || [] : [resolveParam(r.outcome, p)];
    possible.forEach((o) => {
      if (!KNOWN_OUTCOMES.includes(o)) e.push(`Rule ${r.id} has an unknown outcome "${o}".`);
    });
    if (possible.some((o) => o !== 'pending_information') && r.decided_by !== 'human')
      e.push(`Rule ${r.id} can lead to "${possible.join('/')}" and must be decided by a human.`);
  }

  for (const br of rs.decision_rules?.band_rules || []) {
    if (br.outcome === 'reject') e.push(`Band "${br.band}" must not reject: a risk score alone never rejects a client.`);
    if (br.decided_by === 'param:auto_approve_mode' && br.outcome !== 'approve')
      e.push(`Only an approve outcome may follow the auto-approve mode (band "${br.band}").`);
    if (br.decided_by !== 'human' && br.decided_by !== 'param:auto_approve_mode')
      e.push(`Band "${br.band}" must be decided by a human or by the auto-approve mode.`);
  }
  return e;
}

export class RulesetError extends Error {
  constructor(errors) {
    super(`Ruleset rejected by guardrails:\n- ${errors.join('\n- ')}`);
    this.errors = errors;
  }
}

// ---------------------------------------------------------------------------
// Checks: how the (simulated) provider responses are interpreted.

function buildChecks(c) {
  const byId = Object.fromEntries(c.rs.checks.map((k) => [k.id, k]));
  const meta = (id) => ({ id, name: byId[id].name, provider: byId[id].simulated_provider, step: byId[id].step });
  const p = c.provider;
  const checks = [];

  // C2 registry
  const reg = p.registry || {};
  const regItems = [{ label: c.caseData.company.legal_name, result: reg.client || 'match' }];
  (c.caseData.ownership.holdings || []).forEach((h) => regItems.push({ label: h.name, result: reg[h.id] || 'match' }));
  const regStatus = regItems.some((i) => i.result === 'mismatch')
    ? 'fail'
    : regItems.some((i) => i.result === 'limited')
      ? 'manual'
      : 'pass';
  checks.push({
    ...meta('C2'),
    status: regStatus,
    summary:
      regStatus === 'pass'
        ? 'Registry data matches the application'
        : regStatus === 'manual'
          ? 'Limited public registry data for a holding: analyst verifies the submitted register'
          : 'Registry data does not match the application',
    items: regItems,
  });

  // C7 ownership resolution
  checks.push({
    ...meta('C7'),
    status: c.resolution.resolved ? 'pass' : 'flag',
    summary: c.resolution.resolved
      ? `Resolved to ${plural(c.persons.filter((x) => x.effective_pct > 0).length, 'natural person', 'natural persons')}; ${plural(c.inScope.length, 'person', 'people')} in scope`
      : `Ownership not fully resolved: ${c.resolution.gaps.map((g) => `${g.unresolved_pct}% of ${g.name}`).join(', ')}`,
    items: c.persons
      .filter((x) => x.effective_pct > 0)
      .map((x) => ({ label: x.name, result: `${x.effective_pct}% effective` })),
  });

  // C1 ID + liveness
  const idItems = c.inScope.map((x) => ({ label: x.name, result: p.id_liveness?.[x.id] ?? 'pass' }));
  checks.push({
    ...meta('C1'),
    status: idItems.some((i) => i.result === 'fail') ? 'fail' : 'pass',
    summary: idItems.some((i) => i.result === 'fail')
      ? 'ID or liveness check failed for at least one person'
      : `${plural(idItems.length, 'person', 'people')} verified`,
    items: idItems,
  });

  // C3 sanctions + PEP
  const sanctions = p.sanctions || 'clear';
  const pepNames = c.pepPersons.map((x) => x.name);
  let c3status = 'pass';
  if (sanctions === 'confirmed_match') c3status = 'fail';
  else if (sanctions === 'potential_match' || pepNames.length) c3status = 'flag';
  const c3parts = [];
  if (sanctions === 'confirmed_match') c3parts.push('Confirmed sanctions match');
  if (sanctions === 'potential_match') c3parts.push('Potential sanctions match: analyst to dispose');
  if (pepNames.length) c3parts.push(`PEP: ${pepNames.join(', ')}`);
  checks.push({
    ...meta('C3'),
    status: c3status,
    summary: c3parts.length ? c3parts.join('; ') : 'No sanctions or PEP matches',
    items: [
      { label: 'Company and holdings', result: sanctions === 'clear' ? 'clear' : sanctions.replace('_', ' ') },
      ...c.inScope.map((x) => ({
        label: x.name,
        result: c.pepPersons.some((q) => q.id === x.id) ? 'PEP' : 'clear',
      })),
    ],
  });

  // C4 adverse media
  checks.push({
    ...meta('C4'),
    status: p.adverse_media === 'hit' ? 'flag' : 'pass',
    summary: p.adverse_media === 'hit' ? 'Adverse media hit to be reviewed' : 'No relevant adverse media',
    items: [],
  });

  // C5 wallets
  const kyt = p.kyt || 'low';
  checks.push({
    ...meta('C5'),
    status: kyt === 'high' ? 'fail' : kyt === 'medium' ? 'flag' : 'pass',
    summary: `${plural(c.caseData.activity.wallets.length, 'address', 'addresses')} screened, ${kyt} risk exposure`,
    items: c.caseData.activity.wallets.map((w) => ({ label: `${w.asset} ${w.address}`, result: `${kyt} risk` })),
  });

  // C6 documents
  checks.push({
    ...meta('C6'),
    status: c.missingDocs.length ? 'flag' : 'pass',
    summary: c.missingDocs.length
      ? `${c.missingDocs.length} of ${c.docs.length} required documents missing`
      : `All ${c.docs.length} required documents provided`,
    items: c.docs.map((dd) => ({ label: dd.label, result: dd.status })),
  });

  const order = ['C2', 'C7', 'C1', 'C3', 'C4', 'C5', 'C6'];
  return checks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

// ---------------------------------------------------------------------------
// Main entry point

export function evaluate(caseData, ruleset) {
  const errors = validateRuleset(ruleset);
  if (errors.length) throw new RulesetError(errors);

  const rs = ruleset;
  const params = rs.parameters;
  const persons = personsInScope(caseData, rs);
  const inScope = persons.filter((x) => x.in_scope);
  const provider = caseData.provider_responses || {};
  const pepHits = new Set(provider.pep_hits || []);
  const pepPersons = inScope.filter((x) => x.pep_declared || pepHits.has(x.id));
  const tier = volumeTier(caseData.activity.expected_monthly_volume_usd, rs);
  const docs = requiredDocuments(caseData, rs);
  const missingDocs = docs.filter((d) => d.status === 'missing');
  const resolution = ownershipResolution(caseData);

  const ctx = {
    caseData,
    rs,
    provider,
    persons,
    inScope,
    pepPersons,
    tier,
    docs,
    missingDocs,
    resolution,
    depth: ownershipDepth(caseData),
    jurisdictions: involvedJurisdictions(caseData, inScope),
    asOf: caseData.submitted_at,
  };
  ctx.checks = buildChecks(ctx);

  // Risk score
  const factors = rs.risk_factors.map((f) => {
    const units = Number(TESTS[f.test](ctx, f)) || 0;
    const points = units ? (f.per ? Math.min(units * f.points, f.max ?? Infinity) : f.points) : 0;
    return { id: f.id, factor: f.factor, points_defined: f.points, units, points, matched: points > 0 };
  });
  const score = factors.reduce((s, f) => s + f.points, 0);
  const bands = params.risk_score_bands;
  const band = score <= bands.low_max ? 'low' : score <= bands.medium_max ? 'medium' : 'high';

  // Decision: hard rules first (first match decides), then the risk band.
  const hardMatches = rs.decision_rules.hard_rules
    .filter((r) => TESTS[r.test](ctx, r))
    .map((r) => {
      const outcome = resolveParam(r.outcome, params);
      // A rule can carry a different note per outcome (for example H4 when the PEP outcome is set to reject).
      return { id: r.id, if: r.if, outcome, decided_by: r.decided_by, note: r.note_by_outcome?.[outcome] ?? r.note };
    });

  let decision;
  if (hardMatches.length) {
    const r = hardMatches[0];
    decision = { source: 'hard_rule', rule_id: r.id, rule_text: r.if, outcome: r.outcome, decided_by: r.decided_by, note: r.note };
  } else {
    const br = rs.decision_rules.band_rules.find((x) => x.band === band);
    decision = {
      source: 'risk_band',
      rule_id: `BAND:${band}`,
      rule_text: `Risk score ${score} is in the ${band} band`,
      outcome: br.outcome,
      decided_by: resolveParam(br.decided_by, params),
      note: br.note,
    };
  }

  // An approval must also pass the approval preconditions.
  const preconditionMatches = (rs.decision_rules.approval_preconditions || [])
    .filter((r) => TESTS[r.test](ctx, r))
    .map((r) => ({ id: r.id, if: r.if, outcome: r.outcome, decided_by: r.decided_by, note: r.note }));
  if (decision.outcome === 'approve' && preconditionMatches.length) {
    const r = preconditionMatches[0];
    decision = {
      source: 'approval_precondition',
      rule_id: r.id,
      rule_text: r.if,
      outcome: r.outcome,
      decided_by: r.decided_by,
      note: r.note,
      would_have_been: `Approve (risk score ${score}, ${band} band)`,
    };
  }

  // Routing and status
  let status;
  let queue;
  let automatedFinal = false;
  let qaSampled = false;
  switch (decision.outcome) {
    case 'approve':
      if (decision.decided_by === 'shadow') {
        status = 'awaiting_confirmation';
        queue = 'Onboarding analyst';
      } else {
        status = 'approved';
        automatedFinal = true;
        qaSampled = decision.decided_by === 'sample' && bucket100(caseData.case_id) < params.qa_sample_rate_pct;
        queue = qaSampled ? 'Post-approval QA sample' : 'None';
      }
      break;
    case 'review':
      status = 'in_review';
      queue = 'Onboarding analyst';
      break;
    case 'escalate':
      status = 'edd';
      queue = 'MLRO';
      break;
    case 'reject':
      status = 'pending_mlro_decision';
      queue = 'MLRO';
      break;
    default:
      status = 'awaiting_client';
      queue = 'Client';
  }
  // Guardrail: a rejection is never final without a human.
  if (decision.outcome === 'reject') automatedFinal = false;

  const result = {
    case_id: caseData.case_id,
    ruleset_version: rs.version,
    as_of: ctx.asOf,
    volume_tier: tier,
    persons,
    persons_in_scope: inScope,
    ubo_threshold: uboThreshold(caseData, rs),
    pep_persons: pepPersons.map((x) => ({ id: x.id, name: x.name, detail: x.pep_detail || null })),
    documents: docs,
    missing_documents: missingDocs,
    ownership: { depth: ctx.depth, resolution, effective: effectiveOwnership(caseData) },
    checks: ctx.checks,
    risk: { score, band, bands, factors },
    hard_rule_matches: hardMatches,
    precondition_matches: preconditionMatches,
    decision: { ...decision, status, queue, automated_final: automatedFinal, qa_sampled: qaSampled },
  };
  result.client_message = clientMessage(result, rs);
  return result;
}

// ---------------------------------------------------------------------------
// What the client sees. Deliberately generic: no screening results, no rule
// IDs, no hint that a rejection is being considered (tipping-off risk).

export function clientMessage(result, ruleset, statusOverride) {
  const p = ruleset.parameters;
  const status = statusOverride || result.decision.status;
  const missing = result.missing_documents.map((d) => d.label);
  if (!result.ownership.resolution.resolved) missing.push('Ownership details down to the individuals who own the company');
  const catalog = ruleset.documents.catalog;
  const eddOutstanding = [
    ...new Set([
      ...missing,
      ...p.edd_documents
        .filter((doc) => !result.documents.some((d) => d.doc === doc && d.status === 'provided'))
        .map((doc) => catalog[doc]),
    ]),
  ];

  switch (status) {
    case 'awaiting_confirmation':
      return {
        tone: 'progress',
        title: 'Almost there',
        body: 'All automated checks are complete. Our onboarding team is doing a final confirmation, and your account will be ready to trade ' + p.client_eta.awaiting_confirmation + '.',
        items: [],
        eta: p.client_eta.awaiting_confirmation,
      };
    case 'approved':
      return {
        tone: 'success',
        title: 'You are ready to trade',
        body: 'Your OTC account is active. Your account manager will reach out to set up your first trade and confirm your settlement details.',
        items: [],
        eta: 'now',
      };
    case 'edd':
      return {
        tone: 'progress',
        title: 'Your application needs an enhanced review',
        body:
          'Based on the information provided, our compliance team will review your application. This usually takes ' +
          p.client_eta.edd +
          (eddOutstanding.length ? '. You can speed it up by preparing the items below.' : '. We will contact you if we need anything else.'),
        items: eddOutstanding,
        eta: p.client_eta.edd,
      };
    case 'awaiting_client':
      return {
        tone: 'action',
        title: 'We need a few more items',
        body: 'Please provide the items below. We continue ' + p.client_eta.awaiting_client + '.',
        items: missing,
        eta: p.client_eta.awaiting_client,
      };
    case 'rejected':
      return {
        tone: 'neutral',
        title: 'We are unable to offer an account',
        body: 'After careful review, we are unable to onboard your company at this time.',
        items: [],
        eta: null,
      };
    case 'in_review':
      return {
        tone: 'progress',
        title: 'Your application is in review',
        body:
          'Our onboarding team is reviewing your application. We will get back to you ' +
          p.client_eta.in_review +
          (missing.length ? '. In the meantime, please provide the items below.' : ' and tell you right away if we need anything.'),
        items: missing,
        eta: p.client_eta.in_review,
      };
    case 'pending_mlro_decision':
    default:
      return {
        tone: 'progress',
        title: 'Your application is in review',
        body: 'Our onboarding team is reviewing your application. We will get back to you ' + p.client_eta.in_review + ' and tell you right away if we need anything.',
        items: [],
        eta: p.client_eta.in_review,
      };
  }
}

// ---------------------------------------------------------------------------
// Rule Lab: build a what-if variant of a case. Pure, never touches the input.

export const SCENARIO_DEFAULTS = {
  holding: 'asis',
  pep: 'asis',
  volume: 'asis',
  sanctions: 'asis',
  adverse_media: 'asis',
  kyt: 'asis',
  documents: 'as_submitted',
  industry: 'asis',
  nominee: 'asis',
};

export function applyScenario(baseCase, scenario, ruleset) {
  const s = { ...SCENARIO_DEFAULTS, ...scenario };
  const c = clone(baseCase);
  const pr = (c.provider_responses = c.provider_responses || {});
  pr.registry = pr.registry || {};
  const lowTransparency = ruleset.jurisdictions.low_transparency_holding;

  if (s.holding === 'none') {
    const eff = effectiveOwnership(c).persons;
    c.ownership.holdings = [];
    c.ownership.persons.forEach((p) => {
      p.owns = eff[p.id] > 0 ? [{ entity: 'client', pct: eff[p.id] }] : [];
    });
  } else if (s.holding !== 'asis') {
    const code = s.holding;
    if (c.ownership.holdings.length) {
      const h = c.ownership.holdings[0];
      h.jurisdiction = code;
      h.jurisdiction_name = COUNTRY_NAMES[code] || code;
      pr.registry[h.id] = lowTransparency.includes(code) ? 'limited' : 'match';
    } else {
      c.ownership.holdings = [
        { id: 'H1', name: 'Example Holding Ltd. (what-if)', jurisdiction: code, jurisdiction_name: COUNTRY_NAMES[code] || code, owns: [{ entity: 'client', pct: 100 }] },
      ];
      c.ownership.persons.forEach((p) => {
        p.owns = (p.owns || []).map((o) => (o.entity === 'client' ? { entity: 'H1', pct: o.pct } : o));
      });
      pr.registry.H1 = lowTransparency.includes(code) ? 'limited' : 'match';
    }
  }

  if (s.pep === 'no') {
    c.ownership.persons.forEach((p) => {
      p.pep_declared = false;
      delete p.pep_detail;
    });
    pr.pep_hits = [];
  } else if (s.pep === 'yes') {
    const already = c.ownership.persons.some((p) => p.pep_declared || (pr.pep_hits || []).includes(p.id));
    if (!already) {
      const target = c.ownership.persons.find((p) => (p.roles || []).includes('director')) || c.ownership.persons[0];
      target.pep_declared = true;
      target.pep_detail = 'What-if: politically exposed person';
      pr.pep_hits = [...(pr.pep_hits || []), target.id];
    }
  }

  if (s.volume !== 'asis') c.activity.expected_monthly_volume_usd = Number(s.volume);
  if (s.sanctions !== 'asis') pr.sanctions = s.sanctions;
  if (s.adverse_media !== 'asis') pr.adverse_media = s.adverse_media;
  if (s.kyt !== 'asis') pr.kyt = s.kyt;
  if (s.industry !== 'asis') c.company.industry_risk = s.industry;
  if (s.nominee !== 'asis') c.ownership.nominee_or_bearer = s.nominee === 'yes';

  if (s.documents === 'all' || s.documents === 'missing_one') {
    c.documents = c.documents || {};
    requiredDocuments(c, ruleset).forEach((d) => (c.documents[d.key] = 'provided'));
    if (s.documents === 'missing_one') c.documents.registry_extract = 'missing';
  }
  return c;
}

// ---------------------------------------------------------------------------
// Ruleset governance helpers (used by the Rule Lab and its audit trail)

export function setParameter(ruleset, path, value) {
  const rs = clone(ruleset);
  let node = rs;
  const parts = path.split('.');
  parts.slice(0, -1).forEach((k) => (node = node[k]));
  node[parts[parts.length - 1]] = value;
  return rs;
}

export function diffValues(before, after, base = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(before) && isObj(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].flatMap((k) => diffValues(before[k], after[k], base ? `${base}.${k}` : k));
  }
  if (Array.isArray(before) && Array.isArray(after) && before.length === after.length && before.every((v) => isObj(v))) {
    return before.flatMap((v, i) => diffValues(v, after[i], `${base}[${i}]`));
  }
  return [{ path: base, from: before, to: after }];
}

export function nextLabVersion(version) {
  const [core] = version.split('-');
  const [maj, min] = core.split('.').map(Number);
  return `${maj}.${min + 1}.0-lab`;
}
