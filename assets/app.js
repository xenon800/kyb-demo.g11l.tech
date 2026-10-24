// UI for the OTC onboarding prototype. All decisions come from engine.js;
// this file only renders them and records what people do in the audit log.

import {
  evaluate,
  clientMessage,
  applyScenario,
  setParameter,
  diffValues,
  nextLabVersion,
  validateRuleset,
  RulesetError,
  OUTCOME_LABELS,
  STATUS_LABELS,
  COUNTRY_NAMES,
  SCENARIO_DEFAULTS,
} from './engine.js';
import { AuditLog, verifyChain } from './audit.js';
import { renderMarkdown } from './markdown.js';

// ---------------------------------------------------------------------------
// Constants

const VIEWS = [
  ['client', 'Client view'],
  ['compliance', 'Compliance view'],
  ['lab', 'Rule Lab'],
  ['ruleset', 'Ruleset'],
  ['docs', 'Docs'],
];

const STEPS = [
  { id: 'overview', title: 'Before you start' },
  { id: 'account', title: 'Account' },
  { id: 'company', title: 'Company' },
  { id: 'ownership', title: 'Ownership' },
  { id: 'activity', title: 'Expected activity' },
  { id: 'documents', title: 'Documents' },
  { id: 'review', title: 'Review and submit' },
];

const CHECK_REQUEST = {
  C2: 'POST /kyb/registry/lookup',
  C7: 'ownership.resolve()',
  C1: 'POST /kyc/applicants/verify',
  C3: 'POST /aml/screening',
  C4: 'POST /aml/adverse-media',
  C5: 'POST /kyt/addresses/screen',
  C6: 'documents.completeness()',
};

const ACTORS = {
  system: 'system',
  client: 'client:applicant',
  analyst: 'analyst:demo-analyst',
  mlro: 'mlro:demo-mlro',
  editor: 'ops:demo-ruleset-editor',
  approver: 'compliance:demo-second-approver',
};

const OUTCOME_CLASS = {
  approve: 's-approve',
  review: 's-review',
  escalate: 's-escalate',
  reject: 's-reject',
  pending_information: 's-pending',
};

const STATUS_CLASS = {
  not_submitted: 's-pending',
  awaiting_confirmation: 's-approve',
  approved: 's-approve',
  in_review: 's-review',
  edd: 's-escalate',
  pending_mlro_decision: 's-reject',
  awaiting_client: 's-pending',
  rejected: 's-reject',
};

// How far a case has been routed. Once a human route is taken, new
// information can make it stricter but never send it back to automation.
const STATUS_RANK = { approved: 0, awaiting_confirmation: 1, in_review: 2, edd: 3, pending_mlro_decision: 4 };

const ACTIONS = {
  confirm_approval: {
    label: (c) => (c.status === 'awaiting_confirmation' ? 'Confirm approval' : 'Approve'),
    roles: ['analyst', 'mlro'],
    from: ['awaiting_confirmation', 'in_review'],
    to: 'approved',
    style: 'btn',
  },
  request_info: {
    label: () => 'Request information from the client',
    roles: ['analyst', 'mlro'],
    from: ['awaiting_confirmation', 'in_review', 'edd'],
    to: 'awaiting_client',
    style: 'btn btn-secondary',
  },
  escalate: {
    label: () => 'Escalate to MLRO',
    roles: ['analyst'],
    from: ['awaiting_confirmation', 'in_review'],
    to: 'edd',
    style: 'btn btn-secondary',
  },
  recommend_approval: {
    label: () => 'Recommend approval to MLRO',
    roles: ['analyst'],
    from: ['edd'],
    to: 'edd',
    style: 'btn btn-secondary',
    recommendsApproval: true,
  },
  recommend_reject: {
    label: () => 'Recommend rejection to MLRO',
    roles: ['analyst'],
    from: ['in_review', 'edd'],
    to: 'pending_mlro_decision',
    style: 'btn btn-danger',
  },
  approve_edd: {
    label: () => 'Approve after enhanced due diligence',
    roles: ['mlro'],
    from: ['edd'],
    to: 'approved',
    style: 'btn',
    needsSeniorApproval: true,
  },
  return_to_review: {
    label: () => 'Send back to analyst review',
    roles: ['mlro'],
    from: ['pending_mlro_decision'],
    to: 'in_review',
    style: 'btn btn-secondary',
  },
  reject: {
    label: () => 'Reject client',
    roles: ['mlro'],
    from: ['pending_mlro_decision', 'edd', 'in_review'],
    to: 'rejected',
    style: 'btn btn-danger',
  },
};

const SCENARIO_CONTROLS = [
  {
    key: 'holding',
    label: 'Ownership structure',
    options: [
      ['asis', 'As submitted'],
      ['none', 'Owned directly, no holding'],
      ['CA', 'Holding in Canada'],
      ['AE', 'Holding in the UAE'],
      ['CH', 'Holding in Switzerland'],
      ['KY', 'Holding in the Cayman Islands'],
      ['VG', 'Holding in the British Virgin Islands'],
      ['IR', 'Holding in Iran (prohibited list)'],
    ],
  },
  { key: 'pep', label: 'Politically exposed person', options: [['asis', 'As submitted'], ['yes', 'A director is a PEP'], ['no', 'No PEP']] },
  {
    key: 'volume',
    label: 'Expected monthly volume',
    options: [
      ['asis', 'As submitted'],
      ['60000', 'USD 60,000'],
      ['450000', 'USD 450,000'],
      ['4500000', 'USD 4,500,000'],
    ],
  },
  {
    key: 'sanctions',
    label: 'Sanctions screening',
    options: [['asis', 'As submitted'], ['clear', 'Clear'], ['potential_match', 'Potential match'], ['confirmed_match', 'Confirmed match']],
  },
  { key: 'adverse_media', label: 'Adverse media', options: [['asis', 'As submitted'], ['clear', 'Clear'], ['hit', 'Hit found']] },
  { key: 'kyt', label: 'Wallet screening', options: [['asis', 'As submitted'], ['low', 'Low risk'], ['medium', 'Medium risk'], ['high', 'High risk']] },
  {
    key: 'documents',
    label: 'Documents',
    options: [['as_submitted', 'As submitted'], ['all', 'All required documents provided'], ['missing_one', 'One document missing']],
  },
  { key: 'industry', label: 'Industry', options: [['asis', 'As submitted'], ['standard', 'Standard risk'], ['high', 'High risk, e.g. money service business']] },
  { key: 'nominee', label: 'Nominee directors or bearer shares', options: [['asis', 'As submitted'], ['no', 'No'], ['yes', 'Yes']] },
];

const PARAM_CONTROLS = [
  { path: 'parameters.pep_outcome', label: 'Outcome when a PEP is found', type: 'select' },
  { path: 'parameters.auto_approve_mode', label: 'Approval of low-risk cases', type: 'select' },
  { path: 'parameters.ubo_ownership_threshold_pct', label: 'Verify owners from (% ownership)', type: 'number', min: 1, max: 100 },
  { path: 'parameters.ubo_ownership_threshold_high_risk_pct', label: 'Verify owners from, higher-risk structures (%)', type: 'number', min: 1, max: 100 },
  { path: 'parameters.volume_tiers_usd_monthly.0.max', label: 'First volume tier ends at (USD per month)', type: 'number', min: 1 },
  { path: 'parameters.volume_tiers_usd_monthly.1.max', label: 'Second volume tier ends at (USD per month)', type: 'number', min: 1 },
  { path: 'parameters.risk_score_bands.low_max', label: 'Low risk band up to (points)', type: 'number', min: 0 },
  { path: 'parameters.risk_score_bands.medium_max', label: 'Medium risk band up to (points)', type: 'number', min: 1 },
  { path: 'jurisdictions.high_risk_fatf_increased_monitoring', label: 'FATF increased monitoring list (ISO codes)', type: 'list' },
];

const DOC_PAGES = [
  ['justification', 'Justification', 'JUSTIFICATION.md'],
  ['tools', 'Tools and AI use', 'TOOLS.md'],
  ['process', 'How I built this', 'PROCESS.md'],
  ['changelog', 'Changelog', 'CHANGELOG.md'],
  ['readme', 'About the repository', 'README.md'],
];

// ---------------------------------------------------------------------------
// State

const state = {
  feedOpen: !window.matchMedia('(max-width: 1180px)').matches,
  ruleset: null,
  baseRuleset: null,
  rulesetLog: null,
  clients: null,
  caseKey: 'A',
  view: 'client',
  role: 'analyst',
  cases: {},
  lab: { scenario: { ...SCENARIO_DEFAULTS }, draft: null, pending: null, reason: '', error: null, verify: null },
  docs: { page: 'justification', cache: {} },
};

const el = {
  sidebar: document.getElementById('sidebar'),
  tabs: document.getElementById('tabs'),
  view: document.getElementById('view'),
};

// ---------------------------------------------------------------------------
// Helpers

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const usd = (n) => 'USD ' + Number(n).toLocaleString('en-US');
const clone = (o) => JSON.parse(JSON.stringify(o));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
// Times are shown in UTC everywhere, like the audit trail.
const clock = (d) => d.toISOString().slice(11, 19) + 'Z';
const cur = () => state.cases[state.caseKey];
const country = (code) => COUNTRY_NAMES[code] || code;
const getPath = (obj, path) => path.split('.').reduce((n, k) => (n == null ? n : n[k]), obj);
// The rule engine is real; only external providers are simulated.
const providerLabel = (p) => (p === 'Rule engine' ? p : `${p}, simulated`);

const MODE_LABELS = {
  shadow: 'Shadow: an analyst confirms every approval',
  sample: 'Sample: automatic, a share is reviewed afterwards',
  full: 'Full: automatic, periodic QA only',
};

function compactUsd(n) {
  if (n >= 1e6) return `USD ${+(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `USD ${+(n / 1e3).toFixed(1)}k`;
  return `USD ${n}`;
}

function tierDescription(tier, ruleset) {
  const tiers = ruleset.parameters.volume_tiers_usd_monthly;
  const i = tiers.findIndex((t) => t.id === tier.id);
  if (i === 0) return `below ${compactUsd(tier.max)} a month`;
  if (tier.max === null) return `${compactUsd(tiers[i - 1].max)} a month or more`;
  return `${compactUsd(tiers[i - 1].max)} to ${compactUsd(tier.max)} a month`;
}

function badge(text, cls = 's-pending', extra = '') {
  return `<span class="badge ${cls} ${extra}">${esc(text)}</span>`;
}
const outcomeBadge = (o, extra = '') => badge(OUTCOME_LABELS[o] || o, OUTCOME_CLASS[o], extra);
const statusBadge = (s, extra = '') => badge(STATUS_LABELS[s] || s, STATUS_CLASS[s], extra);

function decidedByText(d) {
  if (d.outcome === 'approve') {
    if (d.decided_by === 'shadow') return 'System recommends, an analyst confirms before the first trade';
    if (d.decided_by === 'sample') return d.qa_sampled ? 'Automatic, selected for the post-approval QA sample' : 'Automatic, eligible for QA sampling';
    return 'Automatic';
  }
  if (d.outcome === 'pending_information') return 'System asks the client for the missing items';
  if (d.outcome === 'escalate') return 'MLRO decides after enhanced due diligence';
  if (d.outcome === 'reject') return 'Recommendation only: the MLRO decides';
  return 'An analyst decides';
}

function inputsFor(checkId, data) {
  switch (checkId) {
    case 'C2':
      return { company: data.company, holdings: data.ownership.holdings };
    case 'C5':
      return data.activity.wallets;
    case 'C6':
      return data.documents;
    default:
      return data.ownership;
  }
}

async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

// ---------------------------------------------------------------------------
// Case lifecycle

function newCase(key) {
  const data = clone(state.clients[key]);
  return {
    key,
    data,
    step: 0,
    started: false,
    submitted: false,
    running: false,
    declared: false,
    consented: false,
    account: null,
    status: 'not_submitted',
    evaluation: null,
    log: new AuditLog(data.case_id),
    feed: [],
    clientRequest: null,
    final: null,
    reasonDraft: '',
    signOff: { name: '', role: '', date: new Date().toISOString().slice(0, 10), reference: '' },
    requestItems: [],
    actionError: null,
    verify: null,
    humanRouted: false,
  };
}

function reevaluate(c) {
  c.evaluation = evaluate(c.data, state.ruleset);
  return c.evaluation;
}

async function logEvent(c, entry) {
  return c.log.append({ ruleset_version: state.ruleset.version, ...entry });
}

async function createAccount(c, { fast = false } = {}) {
  if (c.account) return;
  const a = state.ruleset.client_account;
  const contact = c.data.contact;
  c.running = true;
  render();
  const entry = { id: 'account', req: 'POST /accounts', provider: 'Platform', status: 'running', summary: 'Creating account…', at: new Date() };
  c.feed.push(entry);
  renderFeed();
  await sleep(fast || reduceMotion ? 60 : 400);
  await logEvent(c, {
    actor: ACTORS.client,
    action: 'account.created',
    result: 'created',
    reason: `${contact.name}, ${contact.role}`,
    details: { sign_in: a.sign_in },
    inputs: { contact },
  });
  await logEvent(c, { actor: ACTORS.client, action: 'account.email_verified', result: 'verified', reason: 'Verification link opened (simulated)' });
  await logEvent(c, {
    actor: ACTORS.client,
    action: 'account.consents_accepted',
    result: 'accepted',
    reason: a.consents.map((x) => `${x.label} ${x.version}`).join(', '),
    details: { consents: a.consents },
  });
  entry.status = 'pass';
  entry.summary = `Account created, email verified, ${a.consents.length} consents recorded`;
  renderFeed();
  c.account = { email: contact.email, name: contact.name };
  c.running = false;
}

async function startApplication(c) {
  if (c.started) return;
  c.started = true;
  await logEvent(c, {
    actor: ACTORS.client,
    action: 'application.started',
    result: 'started',
    reason: `${c.data.label}: ${c.data.company.legal_name}`,
    inputs: { company: c.data.company },
  });
}

async function runStep(c, stepId, { fast = false } = {}) {
  c.running = true;
  render();
  const ev = reevaluate(c);
  const checks = ev.checks.filter((k) => k.step === stepId);
  for (const k of checks) {
    const entry = { id: k.id, req: CHECK_REQUEST[k.id], provider: k.provider, status: 'running', summary: 'Waiting for response…', at: new Date() };
    c.feed.push(entry);
    renderFeed();
    await sleep(fast || reduceMotion ? 60 : 420 + Math.random() * 380);
    entry.status = k.status;
    entry.summary = k.summary;
    await logEvent(c, {
      actor: ACTORS.system,
      action: `check.${k.id}`,
      result: k.status,
      reason: k.summary,
      details: { check: k.name, provider: providerLabel(k.provider), items: k.items },
      inputs: inputsFor(k.id, c.data),
    });
    renderFeed();
  }
  c.running = false;
}

async function submitApplication(c, { fast = false } = {}) {
  c.running = true;
  render();
  await logEvent(c, { actor: ACTORS.client, action: 'application.submitted', result: 'submitted', inputs: c.data });
  const ev = reevaluate(c);
  const wait = () => sleep(fast || reduceMotion ? 60 : 350);

  const steps = [
    {
      req: 'risk.score()',
      summary: `${ev.risk.score} points, ${ev.risk.band} band`,
      status: 'pass',
      log: {
        action: 'risk.scored',
        result: `${ev.risk.score} (${ev.risk.band})`,
        reason: ev.risk.factors.filter((f) => f.matched).map((f) => `${f.id} +${f.points}`).join(', ') || 'No risk factors',
        details: { factors: ev.risk.factors.filter((f) => f.matched) },
      },
    },
    {
      req: 'rules.evaluate()',
      summary: `${OUTCOME_LABELS[ev.decision.outcome]} via ${ev.decision.rule_id}`,
      status: ev.decision.outcome === 'approve' ? 'pass' : 'flag',
      log: {
        action: 'rules.evaluated',
        result: ev.decision.outcome,
        reason: `${ev.decision.rule_id}: ${ev.decision.rule_text}`,
        details: {
          hard_rule_matches: ev.hard_rule_matches.map((r) => r.id),
          precondition_matches: ev.precondition_matches.map((r) => r.id),
          decided_by: ev.decision.decided_by,
          automated_final: ev.decision.automated_final,
        },
      },
    },
    {
      req: 'case.route()',
      summary: `${STATUS_LABELS[ev.decision.status]}, queue: ${ev.decision.queue}`,
      status: 'pass',
      log: { action: 'case.routed', result: ev.decision.status, reason: `Queue: ${ev.decision.queue}` },
    },
  ];
  for (const s of steps) {
    const entry = { id: s.req, req: s.req, provider: 'Rule engine', status: 'running', summary: 'Evaluating…', at: new Date() };
    c.feed.push(entry);
    renderFeed();
    await wait();
    entry.status = s.status;
    entry.summary = s.summary;
    await logEvent(c, { actor: ACTORS.system, inputs: c.data, ...s.log });
    renderFeed();
  }

  c.status = ev.decision.status;
  c.submitted = true;
  if (ev.decision.automated_final) {
    await logEvent(c, { actor: ACTORS.system, action: 'trading.enabled', result: 'OTC trading enabled', reason: decidedByText(ev.decision) });
    c.final = { by: 'system', status: 'approved' };
  }
  await notifyClient(c);
  c.step = STEPS.length;
  c.running = false;
}

function currentClientMessage(c) {
  if (c.status === 'awaiting_client' && c.clientRequest) {
    return {
      tone: 'action',
      title: 'We need a few more items',
      body: 'Please provide the items below so we can continue with your application.',
      items: c.clientRequest.items.map((i) => i.label),
    };
  }
  return clientMessage(c.evaluation, state.ruleset, c.status);
}

async function notifyClient(c) {
  const m = currentClientMessage(c);
  await logEvent(c, {
    actor: ACTORS.system,
    action: 'client.notified',
    result: m.title,
    reason: 'Template message; no screening results or rule IDs are shared with the client',
    details: { template: c.status, items: m.items },
  });
}

async function runWholeJourney(c) {
  if (c.running) return;
  c.consented = true;
  await createAccount(c, { fast: true });
  await startApplication(c);
  for (const [i, s] of STEPS.entries()) {
    if (!['company', 'ownership', 'activity', 'documents'].includes(s.id)) continue;
    if (c.step > i) continue;
    c.step = i;
    await runStep(c, s.id, { fast: true });
    c.step = i + 1;
  }
  c.declared = true;
  await submitApplication(c, { fast: true });
  render();
}

async function performAction(actionId) {
  const c = cur();
  const a = ACTIONS[actionId];
  if (!a || !a.from.includes(c.status) || !a.roles.includes(state.role) || c.running) return;
  const reason = c.reasonDraft.trim();
  if (reason.length < 15) {
    c.actionError = 'Add a reason of at least 15 characters. It is stored in the audit trail.';
    return renderView();
  }
  const ha = state.ruleset.decision_rules.human_approval || {};
  const missing = c.evaluation.missing_documents || [];
  if ((a.to === 'approved' || a.recommendsApproval) && ha.requires_complete_documents && missing.length) {
    c.actionError = `An approval, or a recommendation to approve, needs all required documents. Missing: ${missing.map((d) => d.label).join('; ')}. Request them from the client first.`;
    return renderView();
  }
  const so = c.signOff;
  const soFields = ha.senior_management_sign_off?.fields || [];
  if (a.needsSeniorApproval && soFields.some((f) => !String(so[f] || '').trim())) {
    c.actionError = 'Enter the senior management sign-off (name, role, date and reference of the approval) before approving an EDD case.';
    return renderView();
  }
  const options = requestOptions(c);
  const items = options.filter((o) => c.requestItems.includes(o.key));
  if (actionId === 'request_info' && !items.length) {
    c.actionError = 'Select at least one item to request.';
    return renderView();
  }

  c.running = true;
  const from = c.status;
  await logEvent(c, {
    actor: state.role === 'mlro' ? ACTORS.mlro : ACTORS.analyst,
    action: `decision.${actionId}`,
    result: actionId === 'request_info' ? 'awaiting_client' : a.to,
    reason,
    details: {
      from_status: from,
      to_status: a.to,
      system_recommendation: c.evaluation.decision.outcome,
      deciding_rule: c.evaluation.decision.rule_id,
      senior_management_sign_off: a.needsSeniorApproval ? Object.fromEntries(soFields.map((f) => [f, String(so[f]).trim()])) : undefined,
      requested_items: actionId === 'request_info' ? items.map((i) => i.label) : undefined,
      note: a.recommendsApproval ? 'Recommendation only; the MLRO decides' : undefined,
    },
  });
  if (a.recommendsApproval) c.recommendation = { outcome: 'approve', reason };
  c.status = a.to;
  c.humanRouted = true;
  if (actionId === 'request_info') c.clientRequest = { items, returnTo: from };
  if (a.to === 'approved') {
    await logEvent(c, { actor: ACTORS.system, action: 'trading.enabled', result: 'OTC trading enabled', reason: `Approved by ${state.role === 'mlro' ? 'MLRO' : 'analyst'}` });
    c.final = { by: state.role, status: 'approved' };
  }
  if (a.to === 'rejected') c.final = { by: 'mlro', status: 'rejected' };
  if (a.to !== from) await notifyClient(c);
  c.reasonDraft = '';
  c.signOff = { name: '', role: '', date: new Date().toISOString().slice(0, 10), reference: '' };
  c.requestItems = [];
  c.actionError = null;
  c.verify = null;
  c.running = false;
  render();
}

function requestOptions(c) {
  const ev = c.evaluation;
  if (!ev) return [];
  const catalog = state.ruleset.documents.catalog;
  const opts = ev.missing_documents.map((d) => ({ key: d.key, label: d.label }));
  state.ruleset.parameters.edd_documents.forEach((doc) => {
    if (!opts.some((o) => o.key === doc) && c.data.documents?.[doc] !== 'provided') opts.push({ key: doc, label: catalog[doc] });
  });
  opts.push({ key: 'other:purpose', label: 'Clarification of the purpose of the account' });
  return opts;
}

/** Documents the client can still send: missing required ones, plus EDD documents while in EDD. */
function outstandingDocs(c) {
  const ev = c.evaluation || reevaluate(c);
  const list = ev.missing_documents.map((d) => ({ key: d.key, label: d.label }));
  if (c.status === 'edd') {
    const cat = state.ruleset.documents.catalog;
    for (const doc of state.ruleset.parameters.edd_documents) {
      const provided = ev.documents.some((d) => d.doc === doc && d.status === 'provided') || c.data.documents[doc] === 'provided';
      if (!provided && !list.some((x) => x.key === doc)) list.push({ key: doc, label: cat[doc] || doc });
    }
  }
  return list;
}

/** The client uploads what is outstanding at any time until the case is closed. */
async function uploadOutstanding() {
  const c = cur();
  if (c.running || c.final) return;
  if (c.clientRequest) {
    for (const d of outstandingDocs(c)) if (!c.clientRequest.items.some((i) => i.key === d.key)) c.clientRequest.items.push(d);
    return provideRequestedItems();
  }
  const docs = outstandingDocs(c);
  if (!docs.length) return;
  c.running = true;
  for (const d of docs) {
    c.data.documents[d.key] = 'provided';
    await logEvent(c, { actor: ACTORS.client, action: 'document.received', result: 'provided', reason: d.label, inputs: { document: d.key } });
  }
  const from = c.status;
  const ev = reevaluate(c);
  await logEvent(c, { actor: ACTORS.system, action: 'rules.re_evaluated', result: ev.decision.outcome, reason: `${ev.decision.rule_id}: ${ev.decision.rule_text}`, inputs: c.data });
  let next = from;
  if (from === 'awaiting_client' && !c.humanRouted) next = ev.decision.status;
  else if ((STATUS_RANK[ev.decision.status] ?? 0) > (STATUS_RANK[from] ?? 0)) next = ev.decision.status;
  c.status = next;
  await logEvent(c, {
    actor: ACTORS.system,
    action: 'case.routed',
    result: next,
    reason: next === from ? 'Documents received; the case stays with the person handling it' : 'Documents received; case moves on',
  });
  if (next !== from && !c.humanRouted && ev.decision.automated_final) {
    await logEvent(c, { actor: ACTORS.system, action: 'trading.enabled', result: 'OTC trading enabled', reason: decidedByText(ev.decision) });
    c.final = { by: 'system', status: 'approved' };
  }
  await notifyClient(c);
  c.running = false;
  render();
}

async function provideRequestedItems() {
  const c = cur();
  if (!c.clientRequest || c.running) return;
  c.running = true;
  for (const item of c.clientRequest.items) {
    if (!item.key.startsWith('other:')) c.data.documents[item.key] = 'provided';
    await logEvent(c, { actor: ACTORS.client, action: 'document.received', result: 'provided', reason: item.label, inputs: { item: item.key } });
  }
  const ev = reevaluate(c);
  await logEvent(c, {
    actor: ACTORS.system,
    action: 'rules.re_evaluated',
    result: ev.decision.outcome,
    reason: `${ev.decision.rule_id}: ${ev.decision.rule_text}`,
    inputs: c.data,
  });
  const back = c.clientRequest.returnTo;
  let next = back;
  if (ev.decision.status === 'awaiting_client') next = 'awaiting_client';
  else if ((STATUS_RANK[ev.decision.status] ?? 0) > (STATUS_RANK[back] ?? 0)) next = ev.decision.status;
  c.clientRequest = null;
  c.status = next;
  await logEvent(c, { actor: ACTORS.system, action: 'case.routed', result: next, reason: 'Items received from client; case returns to its queue' });
  await notifyClient(c);
  c.running = false;
  render();
}

async function attachDocument(key) {
  const c = cur();
  if (c.running || c.submitted) return;
  c.data.documents[key] = 'provided';
  const doc = reevaluate(c).documents.find((d) => d.key === key);
  await logEvent(c, { actor: ACTORS.client, action: 'document.received', result: 'provided', reason: doc?.label || key, inputs: { document: key } });
  renderView();
}

// ---------------------------------------------------------------------------
// Ruleset governance (Rule Lab)

function labDraftDiff() {
  const strip = (rs) => ({ parameters: rs.parameters, jurisdictions: rs.jurisdictions });
  return diffValues(strip(state.ruleset), strip(state.lab.draft));
}

async function proposeChange() {
  const errors = validateRuleset(state.lab.draft);
  const diff = labDraftDiff();
  if (errors.length) {
    state.lab.error = errors.join(' ');
    return renderView();
  }
  if (!diff.length) {
    state.lab.error = 'The draft is the same as the active ruleset. Change a parameter first.';
    return renderView();
  }
  if (state.lab.reason.trim().length < 15) {
    state.lab.error = 'Add a reason of at least 15 characters. Ruleset changes are audited like decisions.';
    return renderView();
  }
  state.lab.pending = { draft: clone(state.lab.draft), diff, reason: state.lab.reason.trim() };
  await state.rulesetLog.append({
    actor: ACTORS.editor,
    action: 'ruleset.change_proposed',
    result: `${diff.length} change(s) proposed to ${state.ruleset.version}`,
    reason: state.lab.pending.reason,
    details: { diff },
    inputs: state.lab.pending.draft,
    ruleset_version: state.ruleset.version,
  });
  state.lab.error = null;
  renderView();
}

async function approveChange() {
  const p = state.lab.pending;
  if (!p) return;
  const previous = state.ruleset.version;
  const next = { ...clone(p.draft), version: nextLabVersion(previous), effective_from: new Date().toISOString().slice(0, 10), status: 'lab version created in this demo session; not a real policy change' };
  await state.rulesetLog.append({
    actor: ACTORS.approver,
    action: 'ruleset.change_approved',
    result: `version ${next.version} active`,
    reason: 'Second approver reviewed the diff',
    details: { previous_version: previous, diff: p.diff },
    inputs: next,
    ruleset_version: next.version,
  });
  state.ruleset = next;
  state.lab.draft = clone(next);
  state.lab.pending = null;
  state.lab.reason = '';
  state.lab.verify = null;

  for (const c of Object.values(state.cases)) {
    if (!c.submitted) continue;
    const before = c.evaluation.decision;
    const ev = reevaluate(c);
    const isFinal = c.status === 'approved' || c.status === 'rejected';
    const waiting = c.status === 'awaiting_client';
    let note;
    if (isFinal) note = 'Final decision unchanged; in production this triggers a periodic review';
    else if (waiting) note = 'Case is waiting for the client; new routing applies once items arrive';
    else if (c.humanRouted) {
      // A person has already routed this case: new rules can make it stricter, never looser.
      const stricter = (STATUS_RANK[ev.decision.status] ?? 0) > (STATUS_RANK[c.status] ?? 0);
      if (stricter) c.status = ev.decision.status;
      note = stricter ? `Re-routed under ${next.version}` : `Kept with the person handling it under ${next.version}`;
    } else {
      c.status = ev.decision.status;
      note = `Re-routed under ${next.version}`;
    }
    await logEvent(c, {
      actor: ACTORS.system,
      action: 'rules.re_evaluated',
      result: ev.decision.outcome,
      reason: `${note}. Before: ${before.outcome} (${before.rule_id}); now: ${ev.decision.outcome} (${ev.decision.rule_id})`,
      inputs: c.data,
    });
    if (!isFinal && !waiting && !c.humanRouted && ev.decision.automated_final) {
      await logEvent(c, { actor: ACTORS.system, action: 'trading.enabled', result: 'OTC trading enabled', reason: decidedByText(ev.decision) });
      c.final = { by: 'system', status: 'approved' };
    }
  }
  render();
}

async function discardChange() {
  if (!state.lab.pending) return;
  await state.rulesetLog.append({
    actor: ACTORS.approver,
    action: 'ruleset.change_discarded',
    result: 'not approved',
    reason: 'Discarded by the second approver',
    ruleset_version: state.ruleset.version,
  });
  state.lab.pending = null;
  renderView();
}

// ---------------------------------------------------------------------------
// Rendering: frame

function render() {
  renderSidebar();
  renderTabs();
  renderView();
  syncHash();
}

function renderSidebar() {
  const items = ['A', 'B']
    .map((k) => {
      const c = state.cases[k];
      return `<li><button class="case" data-action="select-case" data-key="${k}" aria-current="${state.caseKey === k}">
        <span class="case-label">${esc(c.data.label)}</span>
        <span class="case-name">${esc(c.data.company.legal_name)}</span>
        ${c.status === 'not_submitted' && c.started ? badge('Application in progress', 's-pending') : statusBadge(c.status)}
      </button></li>`;
    })
    .join('');
  el.sidebar.innerHTML = `
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="22" height="24" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 12h10M9 17h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="23" r="6" fill="var(--approve)"/><path d="M21.4 23.1l1.8 1.8 3.4-3.6" fill="none" stroke="var(--sheet)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <div><strong>Onboarding desk</strong><span>Corporate OTC onboarding prototype</span></div>
    </div>
    <div>
      <h2 class="side-h">Cases</h2>
      <ul class="caselist">${items}</ul>
    </div>
    <div class="side-meta">
      <div class="row"><span>Active ruleset</span><code>${esc(state.ruleset.version)}</code></div>
      <div class="row"><button class="btn-quiet btn" data-action="goto" data-view="ruleset">Read the rules</button><button class="btn-quiet btn" data-action="reset">Reset demo</button></div>
    </div>`;
}

function renderTabs() {
  el.tabs.innerHTML = VIEWS.map(
    ([id, label]) => `<button class="tab" data-action="goto" data-view="${id}" ${state.view === id ? 'aria-current="page"' : ''}>${label}</button>`,
  ).join('');
}

function renderView() {
  const fn = { client: viewClient, compliance: viewCompliance, lab: viewLab, ruleset: viewRuleset, docs: viewDocs }[state.view];
  el.view.innerHTML = fn();
  applyDynamicStyles();
  if (state.view === 'docs') loadDoc();
  if (state.view === 'lab') updateLabMarks();
  scrollFeedToEnd();
}

function applyDynamicStyles() {
  el.view.querySelectorAll('[data-w]').forEach((n) => (n.style.width = `${n.dataset.w}%`));
  el.view.querySelectorAll('[data-left]').forEach((n) => (n.style.left = `${n.dataset.left}%`));
}

function scrollFeedToEnd() {
  const f = document.getElementById('feed');
  if (f) f.scrollTop = f.scrollHeight;
}

function syncHash() {
  const part = state.view === 'docs' ? `docs/${state.docs.page}` : ['ruleset'].includes(state.view) ? state.view : `${state.view}/${state.caseKey}`;
  if (location.hash.slice(1) !== part) history.replaceState(null, '', `#${part}`);
}

function readHash() {
  const [view, sub] = location.hash.replace(/^#\/?/, '').split('/');
  if (VIEWS.some(([id]) => id === view)) state.view = view;
  if (view === 'docs' && DOC_PAGES.some(([id]) => id === sub)) state.docs.page = sub;
  else if (sub === 'A' || sub === 'B') state.caseKey = sub;
}

// ---------------------------------------------------------------------------
// Client view

function viewClient() {
  const c = cur();
  const done = c.step >= STEPS.length;
  const stepper = STEPS.map((s, i) => `<li class="${i < c.step || done ? 'done' : i === c.step ? 'current' : ''}">${s.title}</li>`).join('');
  const body = done ? clientStatus(c) : clientStep(c, STEPS[c.step]);
  return `
    <div class="view-head client-hero">
      <div>
        <h1>Open a corporate OTC account</h1>
        <p>The client fills in the application. The internal panel shows what our systems do at the same time; the client never sees it.</p>
      </div>
    </div>
    <div class="client-grid">
      <section class="sheet client-sheet" aria-label="What the client sees">
        <p class="pane-label">What the client sees</p>
        <ol class="stepper">${stepper}</ol>
        <div class="step-body">${body}</div>
      </section>
      ${feedPanel(c)}
    </div>`;
}

function feedPanel(c) {
  return `<details class="sheet feed-panel internal" data-feed ${state.feedOpen ? 'open' : ''}>
    <summary>
      <span class="pane-label">Internal</span>
      <span class="feed-head"><span class="feed-title">Automated checks</span><span class="feed-count" id="feed-count">${esc(feedSummary(c))}</span></span>
    </summary>
    <p>Simulated provider responses, logged to the audit trail as they arrive.</p>
    <ol class="feed" id="feed" aria-live="polite">${feedItems(c)}</ol>
  </details>`;
}

function feedSummary(c) {
  if (!c.feed.length) return 'Not started';
  const running = c.feed.filter((f) => f.status === 'running').length;
  const attention = c.feed.filter((f) => ['flag', 'fail', 'manual'].includes(f.status)).length;
  if (running) return `${c.feed.length - running} done, ${running} running`;
  if (attention) return `${c.feed.length} done, ${attention} need a look`;
  return `${c.feed.length} done, all clear`;
}

function feedItems(c) {
  if (!c.feed.length) return '<li class="feed-empty">Checks run as the applicant completes each step.</li>';
  return c.feed
    .map(
      (f) => `<li>
      <span class="glyph ${f.status}" aria-hidden="true"></span>
      <span class="req">${esc(f.req)}</span>
      <span class="prov">${esc(providerLabel(f.provider))}, ${clock(f.at)}</span>
      <span class="res">${esc(f.summary)}</span>
    </li>`,
    )
    .join('');
}

function renderFeed() {
  const f = document.getElementById('feed');
  if (f) {
    f.innerHTML = feedItems(cur());
    scrollFeedToEnd();
  }
  const n = document.getElementById('feed-count');
  if (n) n.textContent = feedSummary(cur());
  renderSidebar();
}

function stepNav(c, { next = 'Continue', back = true, disabled = false } = {}) {
  return `<div class="step-actions">
    ${back && c.step > 0 ? `<button class="btn btn-quiet" data-action="back" ${c.running ? 'disabled' : ''}>Back</button>` : '<span></span>'}
    <button class="btn" data-action="next" ${c.running || disabled ? 'disabled' : ''}>${c.running ? 'Checking…' : next}</button>
  </div>`;
}

function clientStep(c, step) {
  const d = c.data;
  const rs = state.ruleset;
  const ev = reevaluate(c);
  switch (step.id) {
    case 'overview': {
      const docs = rs.documents.base.map((k) => `<li>${esc(rs.documents.catalog[k])}</li>`).join('');
      return `
        <h2>Before you start</h2>
        <p class="muted">Most low-risk companies are ready to trade within 24 hours. Here is everything we may ask for, so you can have it ready.</p>
        <h3>Company documents</h3>
        <ul class="checklist">${docs}</ul>
        <h3 class="mt">People</h3>
        <ul class="checklist">
          <li>An ID document and a short selfie video for everyone who owns ${rs.parameters.ubo_ownership_threshold_pct}% or more${rs.parameters.ubo_ownership_threshold_high_risk_pct != null ? ` (${rs.parameters.ubo_ownership_threshold_high_risk_pct}% or more for some ownership structures)` : ''}, every director and every authorised signatory</li>
        </ul>
        <h3 class="mt">Only if they apply to you</h3>
        <ul class="checklist">
          <li>If another company owns yours: its certificate of incorporation and registers of members and directors</li>
          <li>For expected volumes of ${compactUsd(rs.parameters.volume_tiers_usd_monthly[0].max)} a month or more: recent bank statements and a source of funds declaration</li>
          <li>For ${compactUsd(rs.parameters.volume_tiers_usd_monthly[1].max)} a month or more, also: financial statements and evidence of the owners' source of wealth</li>
        </ul>
        ${stepNav(c, { next: 'Start application', back: false })}
        <div class="demo-note mt"><p>The form is prefilled with mock data for ${esc(d.label)}, ${esc(d.summary)}. It is read-only; to try other scenarios, use the <a href="#lab/${c.key}">Rule Lab</a>.</p>
        <p>In a hurry? <button class="btn btn-quiet" data-action="autorun" ${c.running ? 'disabled' : ''}>Run the whole application in one go</button></p></div>`;
    }
    case 'account': {
      const a = rs.client_account;
      const contact = d.contact;
      const consents = a.consents.map((x) => `the ${x.label.toLowerCase()} (version ${esc(x.version)})`).join(' and ');
      return `
        <h2>Create your account</h2>
        <p class="muted">You use this account to continue your application, send us anything we ask for later and, once approved, to trade.</p>
        <dl class="fields">
          ${field('Name', contact.name)}
          ${field('Role', contact.role)}
          ${field('Work email', contact.email)}
        </dl>
        <p class="muted mt">You sign in with a link sent to this email and a one-time code from your authenticator app.</p>
        <label class="checkline mt"><input type="checkbox" data-bind="consent" ${c.consented ? 'checked' : ''}> I accept ${consents}.</label>
        ${stepError(c)}
        ${stepNav(c, { next: c.account ? 'Continue' : 'Create account' })}
        <div class="demo-note mt"><p>There is no password field on purpose, so nobody types a real password into a prototype.</p></div>`;
    }
    case 'company':
      return `
        <h2>Company</h2>
        <p class="muted">We check these details against the official company registry as soon as you continue.</p>
        <dl class="fields">
          ${field('Legal name', d.company.legal_name)}
          ${field('Country of incorporation', d.company.jurisdiction_name)}
          ${field('Registration number', d.company.registration_number)}
          ${field('Date of incorporation', d.company.incorporated)}
          ${field('Registered address', d.company.registered_address)}
          ${field('Industry', d.company.industry)}
          ${field('Website', d.company.website)}
        </dl>
        ${stepNav(c)}`;
    case 'ownership':
      return `
        <h2>Ownership</h2>
        <p class="muted">We verify everyone who owns ${ev.ubo_threshold.pct}% or more, directly or through other companies, plus all directors and authorised signatories.</p>
        ${structureDiagram(d, ev)}
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Person</th><th>Role</th><th>Effective ownership</th><th>Verification</th><th>PEP declared</th></tr></thead>
          <tbody>${ev.persons
            .map(
              (p) => `<tr>
              <td>${esc(p.name)}<br><span class="faint">${esc(country(p.nationality))}, lives in ${esc(country(p.residence))}</span></td>
              <td>${esc(cap((p.roles || []).map((r) => r.replace('_', ' ')).join(', ') || 'shareholder'))}</td>
              <td class="num">${p.effective_pct}%</td>
              <td>${p.in_scope ? 'ID and selfie video' : '<span class="faint">Not required</span>'}</td>
              <td>${p.pep_declared ? 'Yes' : 'No'}</td>
            </tr>`,
            )
            .join('')}</tbody>
        </table></div>
        ${stepNav(c)}`;
    case 'activity':
      return `
        <h2>Expected activity</h2>
        <p class="muted">This tells us which documents we need and how we monitor your account.</p>
        <dl class="fields">
          ${field('Expected volume per month', usd(d.activity.expected_monthly_volume_usd))}
          ${field('Typical trade size', `USD ${d.activity.typical_trade_usd}`)}
          ${field('How often you expect to trade', d.activity.frequency)}
          ${field('Assets', d.activity.assets.join(', '))}
          ${field('Fiat currencies', d.activity.fiat.join(', '))}
          ${field('Purpose of the account', d.activity.purpose)}
          ${field('Source of funds', d.activity.source_of_funds)}
          ${field('Settlement wallets', d.activity.wallets.map((w) => `${w.asset}: ${w.address}`).join('; '))}
        </dl>
        ${stepNav(c)}`;
    case 'documents':
      return clientDocuments(c, ev);
    case 'review':
      return `
        <h2>Review and submit</h2>
        <p class="muted">Check the summary, then submit. You will see right away what happens next.</p>
        <dl class="fields">
          ${field('Company', `${d.company.legal_name}, ${d.company.jurisdiction_name}`)}
          ${field('People to verify', `${ev.persons_in_scope.length}`)}
          ${field('Expected volume', `${usd(d.activity.expected_monthly_volume_usd)} per month`)}
          ${field('Documents', `${ev.documents.length - ev.missing_documents.length} of ${ev.documents.length} provided`)}
        </dl>
        ${ev.missing_documents.length ? `<p class="hint mt">You can submit now. We will ask for the ${ev.missing_documents.length} outstanding document(s) as part of the review.</p>` : ''}
        <label class="checkline mt"><input type="checkbox" data-bind="declare" ${c.declared ? 'checked' : ''}> I confirm the information is complete and accurate, and that I am authorised to act for the company.</label>
        ${stepError(c)}
        ${stepNav(c, { next: 'Submit application' })}`;
    default:
      return '';
  }
}

function stepError(c) {
  return c.stepError ? `<p class="error mt-s" role="alert">${esc(c.stepError)}</p>` : '';
}

function field(label, value) {
  return `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`;
}

function structureDiagram(d, ev) {
  const owners = (entity) =>
    ev.persons
      .filter((p) => (p.owns || []).some((o) => o.entity === entity))
      .map((p) => `<div class="node-box"><strong>${esc(p.name)}</strong>${(p.owns.find((o) => o.entity === entity) || {}).pct}% of ${entity === 'client' ? 'the company' : 'the holding'}</div>`)
      .join('');
  const holdings = d.ownership.holdings || [];
  let html = `<div class="structure">`;
  if (holdings.length) {
    const h = holdings[0];
    html += `<div class="owners">${owners(h.id)}</div>
      <div class="link"><span>own</span></div>
      <div class="node-box"><strong>${esc(h.name)}</strong>Holding, ${esc(h.jurisdiction_name || country(h.jurisdiction))}</div>
      <div class="link"><span>${h.owns[0].pct}%</span></div>`;
  } else {
    html += `<div class="owners">${owners('client')}</div><div class="link"><span>own</span></div>`;
  }
  html += `<div class="node-box client-box"><strong>${esc(d.company.legal_name)}</strong>Applicant, ${esc(d.company.jurisdiction_name)}</div></div>`;
  return html;
}

const isForm = (doc) => (state.ruleset.documents.forms || []).includes(doc);

function clientDocuments(c, ev) {
  const groups = [
    ['company', 'Company documents', ''],
    ['holding', 'Holding company documents', `Because ${esc(c.data.ownership.holdings[0]?.name || 'a holding company')} owns your company.`],
    ['volume', 'Because of your expected volume', `You expect ${esc(usd(c.data.activity.expected_monthly_volume_usd))} a month, which is ${esc(tierDescription(ev.volume_tier, state.ruleset))}.`],
  ];
  const html = groups
    .map(([id, title, note]) => {
      const docs = ev.documents.filter((d) => d.group === id);
      if (!docs.length) return '';
      return `<div class="doc-group"><h3>${title}</h3>${note ? `<p>${note}</p>` : ''}<ul class="doclist">${docs
        .map(
          (d) => `<li>
          <span>${esc(d.label)}${d.status === 'provided' && !isForm(d.doc) ? `<br><span class="file">${esc(d.doc.replace(/_/g, '-'))}.pdf, mock file</span>` : ''}</span>
          ${d.status === 'provided' ? badge(isForm(d.doc) ? 'Completed' : 'Uploaded', 's-approve') : `<button class="btn btn-secondary btn-small" data-action="attach" data-key="${esc(d.key)}" ${c.running ? 'disabled' : ''}>${isForm(d.doc) ? 'Fill in (mock)' : 'Attach mock file'}</button>`}
        </li>`,
        )
        .join('')}</ul></div>`;
    })
    .join('');
  return `
    <h2>Documents</h2>
    <p class="muted">Only what applies to your company. Missing something? You can still continue; we will ask for it later.</p>
    ${html}
    ${resubmissionHint()}
    ${stepNav(c)}`;
}

function resubmissionHint() {
  const r = state.ruleset.documents.resubmission;
  if (!r) return '';
  return `<p class="hint mt">If we cannot accept a document, for example a proof of address older than 90 days, we email you once and tell you why. If the next one still does not fit, your account manager calls you to sort it out together.</p>`;
}

function clientStatus(c) {
  const m = currentClientMessage(c);
  const tone = { success: 's-approve', progress: 'tone-progress', action: 's-review', neutral: 's-pending' }[m.tone] || 's-pending';
  const tl = clientTimeline(c.status)
    .map((t) => `<li class="${t.cls}"><span class="dot" aria-hidden="true"></span><span><span class="label">${esc(t.label)}</span>${t.sub ? `<br><span class="sub">${esc(cap(t.sub))}</span>` : ''}</span></li>`)
    .join('');
  return `
    ${c.account ? `<p class="faint">Signed in as ${esc(c.account.email)}</p>` : ''}
    <div class="status-card ${tone}" role="status">
      <h2>${esc(m.title)}</h2>
      <p>${esc(m.body)}</p>
      ${m.items?.length ? `<ul>${m.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
      ${!c.final && (c.clientRequest || outstandingDocs(c).length) ? `<div class="btn-row mt"><button class="btn" data-action="provide" ${c.running ? 'disabled' : ''}>${c.running ? 'Uploading…' : 'Upload these documents (mock)'}</button></div>` : ''}
    </div>
    <ol class="timeline">${tl}</ol>
    <div class="demo-note mt"><p>The client never sees screening results or rule IDs. To see why the case went this way, open the <a href="#compliance/${c.key}">compliance view</a>.</p></div>`;
}

function clientTimeline(status) {
  const done = (label, sub) => ({ cls: 'done', label, sub });
  const now = (label, sub) => ({ cls: 'now', label, sub });
  const next = (label, sub) => ({ cls: '', label, sub });
  const p = state.ruleset.parameters.client_eta;
  const head = [done('Application submitted'), done('Automated checks', 'Completed in minutes')];
  switch (status) {
    case 'awaiting_confirmation':
      return [...head, now('Final confirmation by our onboarding team', p.awaiting_confirmation), next('Ready to trade')];
    case 'approved':
      return [...head, done('Approved'), done('Ready to trade')];
    case 'edd':
      return [...head, now('Enhanced review by our compliance team', p.edd), next('Approval'), next('Ready to trade')];
    case 'awaiting_client':
      return [...head, now('Waiting for your items'), next('Review'), next('Ready to trade')];
    case 'rejected':
      return [...head, done('Review'), { cls: 'stop', label: 'Not approved' }];
    default:
      return [...head, now('Review by our onboarding team', p.in_review), next('Decision')];
  }
}

// ---------------------------------------------------------------------------
// Compliance view

function viewCompliance() {
  const c = cur();
  const d = c.data;
  if (!c.submitted) {
    return `
      <div class="case-head"><div><h1>${esc(d.company.legal_name)}</h1><p class="meta">${esc(d.label)}, ${esc(d.company.jurisdiction_name)}. Case <code>${esc(d.case_id)}</code>.</p></div>
      <div class="right">${statusBadge('not_submitted', 'badge-lg')}</div></div>
      <div class="client-grid">
        <section class="sheet">
          <h2>Not submitted yet</h2>
          <p class="muted mt-s">The compliance view fills in once the application is submitted. Complete it in the client view, or run the whole application here in a few seconds.</p>
          <div class="btn-row mt"><button class="btn" data-action="autorun" ${c.running ? 'disabled' : ''}>${c.running ? 'Running…' : 'Run the application now'}</button>
          <button class="btn btn-secondary" data-action="goto" data-view="client">Go to the client view</button></div>
        </section>
        ${feedPanel(c)}
      </div>`;
  }
  const ev = c.evaluation;
  const rs = state.ruleset;
  return `
    <div class="case-head">
      <div>
        <h1>${esc(d.company.legal_name)}</h1>
        <p class="meta">${esc(d.label)}, ${esc(d.company.jurisdiction_name)}. Case <code>${esc(d.case_id)}</code>, evaluated under ruleset <code>${esc(ev.ruleset_version)}</code>.</p>
      </div>
      <div class="right">
        ${statusBadge(c.status, 'badge-lg')}
        <span class="faint">Queue: ${esc(queueFor(c))}</span>
      </div>
    </div>
    <div class="comp-grid">
      <section class="sheet c-path">
        <h2>Decision path</h2>
        ${decisionPath(ev, rs)}
        ${whyBlock(c, ev)}
      </section>
      <div class="comp-side c-side">
        ${actionsSection(c)}
        ${auditSection(c.log, c.verify, 'case', 'Audit trail')}
      </div>
      <div class="c-details">
        ${riskSection(ev)}
        ${checksSection(ev)}
        ${peopleSection(ev)}
        ${documentsSection(ev)}
      </div>
    </div>`;
}

function queueFor(c) {
  return (
    {
      awaiting_confirmation: 'Onboarding analyst',
      in_review: 'Onboarding analyst',
      edd: 'MLRO',
      pending_mlro_decision: 'MLRO',
      awaiting_client: 'Client',
      approved: c.evaluation?.decision.qa_sampled && c.final?.by === 'system' ? 'Post-approval QA sample' : 'None, case closed',
      rejected: 'None, case closed',
    }[c.status] || '–'
  );
}

function decisionPath(ev, rs, { compact = false } = {}) {
  const d = ev.decision;
  const hardMatched = new Map(ev.hard_rule_matches.map((m) => [m.id, m]));
  const preMatched = new Map(ev.precondition_matches.map((m) => [m.id, m]));
  const rows = [];
  let passedDecider = false;
  const terminal = () =>
    `<div class="terminal">${outcomeBadge(d.outcome)}${compact ? '' : `<span class="muted">${esc(decidedByText(d))}</span>`}</div>`;
  const row = (cls, id, text, small, stateText, outcome, isDecider) =>
    `<li class="${cls} ${outcome ? OUTCOME_CLASS[outcome] : ''}">
      <span class="node" aria-hidden="true"></span>
      <span class="rid">${esc(id)}</span>
      <span class="rtext">${esc(text)}${small && !compact ? `<small>${esc(small)}</small>` : ''}</span>
      <span class="rstate">${esc(stateText)}</span>
      ${isDecider ? terminal() : ''}
    </li>`;

  for (const r of rs.decision_rules.hard_rules) {
    const m = hardMatched.get(r.id);
    const isDecider = d.source === 'hard_rule' && d.rule_id === r.id;
    const outcomeLabel = m ? OUTCOME_LABELS[m.outcome] : null;
    let cls = m ? (isDecider ? 'decides' : 'also') : 'clear';
    if (passedDecider) cls += ' after';
    rows.push(row(cls, r.id, r.if, null, isDecider ? `Matched: ${outcomeLabel}` : m ? `Also matched: ${outcomeLabel}` : 'No match', m?.outcome, isDecider));
    if (isDecider) passedDecider = true;
  }

  const band = ev.risk.band;
  const bandRule = rs.decision_rules.band_rules.find((b) => b.band === band);
  const bandDecides = d.source === 'risk_band';
  const bandNote = `Low up to ${ev.risk.bands.low_max}, medium up to ${ev.risk.bands.medium_max}, high above`;
  if (d.source === 'hard_rule') {
    rows.push(row('na after', 'Score', `Risk score ${ev.risk.score}, ${band} band`, bandNote, 'Not needed', null, false));
  } else {
    rows.push(
      row(
        bandDecides ? 'decides' : 'clear',
        'Score',
        `Risk score ${ev.risk.score}, ${band} band`,
        bandNote,
        bandDecides ? `${OUTCOME_LABELS[bandRule.outcome]}` : `${OUTCOME_LABELS[bandRule.outcome]}, if preconditions pass`,
        bandDecides ? bandRule.outcome : null,
        bandDecides,
      ),
    );
  }

  const approvalPossible = d.source === 'approval_precondition' || (d.source === 'risk_band' && d.outcome === 'approve');
  for (const r of rs.decision_rules.approval_preconditions || []) {
    const m = preMatched.get(r.id);
    const isDecider = d.source === 'approval_precondition' && d.rule_id === r.id;
    if (!approvalPossible) {
      rows.push(row('na after', r.id, r.if, null, compact ? 'Not checked' : 'Only checked before an approval', null, false));
      continue;
    }
    let cls = m ? (isDecider ? 'decides' : 'also') : 'clear';
    if (passedDecider) cls += ' after';
    rows.push(row(cls, r.id, r.if, null, isDecider ? `Blocks approval: ${OUTCOME_LABELS[r.outcome]}` : m ? 'Also matched' : 'Passed', m ? r.outcome : null, isDecider));
    if (isDecider) passedDecider = true;
  }
  return `<ol class="path${compact ? ' compact' : ''}" aria-label="Decision path">${rows.join('')}</ol>`;
}

function whyBlock(c, ev) {
  const d = ev.decision;
  const others = ev.hard_rule_matches.filter((m) => m.id !== d.rule_id);
  const pep = ev.pep_persons.map((p) => `${p.name}${p.detail ? `, ${p.detail.charAt(0).toLowerCase()}${p.detail.slice(1)}` : ''}`).join('; ');
  const nextStep =
    {
      awaiting_confirmation: 'An analyst confirms the approval before the first trade. Target: within 24 hours of submission.',
      in_review: 'An analyst reviews the flagged items and approves, requests information or escalates.',
      edd: `The MLRO runs enhanced due diligence: source of funds and wealth, ownership${(c.data.ownership.holdings || []).length ? ` through ${c.data.ownership.holdings[0].name}` : ''}, and adverse information${pep ? `, with a PEP review of ${pep}` : ''}. Approval needs recorded senior management sign-off.`,
      pending_mlro_decision: 'The system recommends rejection. Only the MLRO can reject or send the case back for review.',
      awaiting_client: 'The client has been asked for the outstanding items. The case continues once they arrive.',
      approved: 'Trading is enabled. The account moves to ongoing monitoring.',
      rejected: 'Closed. The decision and its reason are in the audit trail.',
    }[c.status] || '';
  return `<div class="why">
    <p><strong>${d.rule_id.startsWith('BAND:') ? 'Risk band' : esc(d.rule_id)}</strong>: ${esc(d.rule_text)}.${d.note ? ` ${esc(d.note)}` : ''}</p>
    ${d.would_have_been ? `<p class="muted">Without this precondition the result would be: ${esc(d.would_have_been)}.</p>` : ''}
    ${others.length ? `<p class="muted">Also matched: ${others.map((o) => `${esc(o.id)} (${esc(OUTCOME_LABELS[o.outcome])})`).join(', ')}. These are handled in the same review.</p>` : ''}
    ${ev.missing_documents.length ? `<p class="muted">Outstanding documents: ${ev.missing_documents.map((m) => esc(m.label)).join('; ')}.</p>` : ''}
    <p><strong>Next:</strong> ${esc(nextStep)}</p>
    <p class="muted">The client sees: “${esc(currentClientMessage(c).title)}”.</p>
  </div>`;
}

function riskSection(ev) {
  const r = ev.risk;
  const max = Math.max(100, Math.ceil((r.score + 10) / 10) * 10);
  const wLow = ((r.bands.low_max + 1) / max) * 100;
  const wMed = ((r.bands.medium_max - r.bands.low_max) / max) * 100;
  const pos = Math.min(100, (r.score / max) * 100);
  return `<section class="sheet">
    <div class="section-title"><h2>Risk score</h2>${badge(`${r.score} points, ${r.band}`, { low: 's-approve', medium: 's-review', high: 's-escalate' }[r.band])}</div>
    <div class="riskwrap">
      <span class="riskmarker" data-left="${pos.toFixed(2)}">${r.score}</span>
      <div class="riskbar" aria-hidden="true"><span class="z-low" data-w="${wLow.toFixed(2)}"></span><span class="z-medium" data-w="${wMed.toFixed(2)}"></span><span class="z-high" data-w="${(100 - wLow - wMed).toFixed(2)}"></span></div>
    </div>
    <div class="riskscale"><span>0</span><span>Low up to ${r.bands.low_max}, medium up to ${r.bands.medium_max}</span><span>${max}</span></div>
    ${factorTable(r.factors.filter((f) => f.matched), 'No risk factor applies to this case.')}
    <details class="mt-s"><summary class="muted">Factors that do not apply (${r.factors.filter((f) => !f.matched).length})</summary>
      ${factorTable(r.factors.filter((f) => !f.matched), '')}
    </details>
  </section>`;
}

function factorTable(rows, empty) {
  if (!rows.length) return empty ? `<p class="muted">${esc(empty)}</p>` : '';
  return `<div class="table-wrap"><table class="table"><tbody>${rows
    .map(
      (f) => `<tr class="${f.matched ? '' : 'unmatched'}"><td class="nowrap"><code>${esc(f.id)}</code></td><td>${esc(f.factor)}${f.units > 1 ? ` (${f.units} layers)` : ''}</td><td class="num">${f.matched ? `+${f.points}` : f.points_defined}</td></tr>`,
    )
    .join('')}</tbody></table></div>`;
}

function checkGlyph(status) {
  const label = { pass: 'Passed', flag: 'Flagged', manual: 'Manual step', fail: 'Failed' }[status] || status;
  return `<span class="chk"><span class="glyph ${status}" aria-hidden="true"></span>${label}</span>`;
}

function checksSection(ev) {
  return `<section class="sheet">
    <h2>Automated checks</h2>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Check</th><th>Result</th><th>Details</th></tr></thead>
      <tbody>${ev.checks
        .map(
          (k) => `<tr><td><code>${esc(k.id)}</code> ${esc(k.name)}<br><span class="faint">${esc(providerLabel(k.provider))}</span></td><td class="nowrap">${checkGlyph(k.status)}</td><td>${esc(k.summary)}</td></tr>`,
        )
        .join('')}</tbody>
    </table></div>
  </section>`;
}

function peopleSection(ev) {
  return `<section class="sheet">
    <h2>People</h2>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Name</th><th>Why in scope</th><th>Effective</th><th>Screening</th></tr></thead>
      <tbody>${ev.persons
        .map((p) => {
          const pep = ev.pep_persons.find((x) => x.id === p.id);
          return `<tr><td>${esc(p.name)}<br><span class="faint">${p.date_of_birth ? `Born ${esc(p.date_of_birth.slice(0, 4))}, ` : ''}${esc(country(p.nationality))}, lives in ${esc(country(p.residence))}</span></td>
            <td>${p.in_scope ? esc(p.scope_reasons.join(', ')) : '<span class="faint">Not in scope</span>'}</td>
            <td class="num">${p.effective_pct}%</td>
            <td>${p.in_scope ? (pep ? badge('PEP', 's-escalate') + (pep.detail ? `<br><span class="faint">${esc(pep.detail)}</span>` : '') : 'Clear') : '<span class="faint">–</span>'}</td></tr>`;
        })
        .join('')}</tbody>
    </table></div>
  </section>`;
}

function documentsSection(ev) {
  return `<section class="sheet">
    <div class="section-title"><h2>Documents</h2><span class="muted">${ev.documents.length - ev.missing_documents.length} of ${ev.documents.length} provided</span></div>
    <div class="table-wrap"><table class="table"><tbody>${ev.documents
      .map((d) => `<tr><td>${esc(d.label)}</td><td class="nowrap">${d.status === 'provided' ? badge('Provided', 's-approve') : badge('Missing', 's-review')}</td></tr>`)
      .join('')}</tbody></table></div>
  </section>`;
}

function actionsSection(c) {
  const roleToggle = `<div class="role-toggle" role="group" aria-label="Act as">
    <button data-action="role" data-role="analyst" aria-pressed="${state.role === 'analyst'}">Analyst</button>
    <button data-action="role" data-role="mlro" aria-pressed="${state.role === 'mlro'}">MLRO</button>
  </div>`;

  if (c.status === 'approved' || c.status === 'rejected') {
    const by = c.final?.by === 'system' ? 'the system (automatic approval mode)' : c.final?.by === 'mlro' ? 'the MLRO' : 'an analyst';
    return `<section class="sheet ${STATUS_CLASS[c.status]}"><h2>Decision</h2>
      <p class="final-note">${esc(STATUS_LABELS[c.status])}. Recorded by ${esc(by)}. The reason is in the audit trail.</p></section>`;
  }
  if (c.status === 'awaiting_client') {
    return `<section class="sheet"><h2>Decision</h2>
      <p class="muted">Waiting for the client to provide the requested items. Switch to the client view to provide them as the applicant.</p>
      <div class="btn-row mt"><button class="btn btn-secondary" data-action="goto" data-view="client">Open the client view</button></div></section>`;
  }

  const available = Object.entries(ACTIONS).filter(([, a]) => a.from.includes(c.status) && a.roles.includes(state.role));
  const otherRole = state.role === 'analyst' ? 'MLRO' : 'analyst';
  const hidden = Object.entries(ACTIONS).filter(([, a]) => a.from.includes(c.status) && !a.roles.includes(state.role));
  const options = requestOptions(c);
  return `<section class="sheet">
    <h2>Decision</h2>
    ${c.recommendation && c.status === 'edd' ? `<p class="hint">The analyst recommends approval: “${esc(c.recommendation.reason)}” The MLRO decides.</p>` : ''}
    <p class="muted">Act as</p>
    ${roleToggle}
    <label class="field">Reason (required, stored in the audit trail)
      <textarea data-bind="reason" placeholder="What did you check, and why this decision?">${esc(c.reasonDraft)}</textarea>
    </label>
    ${
      available.some(([id]) => id === 'request_info')
        ? `<details class="mt-s"><summary class="muted">Items to request from the client</summary><div class="request-items">${options
            .map((o) => `<label class="checkline"><input type="checkbox" data-bind="request-item" value="${esc(o.key)}" ${c.requestItems.includes(o.key) ? 'checked' : ''}> ${esc(o.label)}</label>`)
            .join('')}</div></details>`
        : ''
    }
    ${
      available.some(([id]) => id === 'approve_edd')
        ? `<fieldset class="signoff mt-s"><legend>Senior management sign-off (required to approve)</legend>
            <label class="field">Name<input type="text" data-bind="so" data-key="name" value="${esc(c.signOff.name)}" placeholder="Who approved"></label>
            <label class="field">Role<input type="text" data-bind="so" data-key="role" value="${esc(c.signOff.role)}" placeholder="For example Chief Executive Officer"></label>
            <label class="field">Date<input type="date" data-bind="so" data-key="date" value="${esc(c.signOff.date)}"></label>
            <label class="field">Reference<input type="text" data-bind="so" data-key="reference" value="${esc(c.signOff.reference)}" placeholder="Minutes or approval ID"></label>
          </fieldset>`
        : ''
    }
    ${c.actionError ? `<p class="error mt-s" role="alert">${esc(c.actionError)}</p>` : ''}
    <div class="action-list">${available
      .map(([id, a]) => `<button class="${a.style}" data-action="act" data-id="${id}" ${c.running ? 'disabled' : ''}>${esc(a.label(c))}</button>`)
      .join('')}</div>
    ${hidden.length ? `<p class="faint mt-s">Only the ${otherRole} can: ${hidden.map(([, a]) => esc(a.label(c).charAt(0).toLowerCase() + a.label(c).slice(1))).join(', ')}.</p>` : ''}
  </section>`;
}

function auditSection(log, verify, kind, title) {
  const items = log.events
    .map(
      (e) => `<li><details><summary>
        <span class="a-action">${esc(e.action)}</span><span class="a-time">${esc(e.timestamp_utc.slice(11, 19))}Z</span>
        <span class="a-result">${esc(String(e.result))}${e.reason ? `<br><span class="faint">${esc(e.reason)}</span>` : ''}</span>
        <span class="a-actor">${esc(e.actor)}</span><span class="a-hash" title="${esc(e.hash)}">${esc(e.hash.slice(7, 17))}</span>
      </summary><pre>${esc(JSON.stringify(e, null, 2))}</pre></details></li>`,
    )
    .join('');
  const v = verify
    ? `<p class="verify ${verify.ok ? 'ok' : 'bad'}" role="status">${esc(verify.message)}</p>`
    : '';
  return `<section class="sheet">
    <div class="section-title"><h2>${esc(title)}</h2><span class="muted">${log.events.length} events, hash-chained</span></div>
    <ol class="audit" id="audit-${kind}">${items || '<li class="feed-empty">No events yet.</li>'}</ol>
    <div class="btn-row mt-s">
      <button class="btn btn-secondary btn-small" data-action="verify" data-log="${kind}">Verify chain</button>
      <button class="btn btn-secondary btn-small" data-action="tamper" data-log="${kind}">Run tamper test</button>
      <button class="btn btn-secondary btn-small" data-action="export" data-log="${kind}">Export JSON</button>
    </div>
    ${v}
  </section>`;
}

function logFor(kind) {
  return kind === 'ruleset' ? state.rulesetLog : cur().log;
}
function setVerify(kind, result) {
  if (kind === 'ruleset') state.lab.verify = result;
  else cur().verify = result;
}

async function verifyLog(kind) {
  const log = logFor(kind);
  const r = await verifyChain(log.events);
  setVerify(kind, {
    ok: r.ok,
    message: r.ok
      ? `Chain intact: all ${r.count} events recomputed and linked. Head ${r.head_hash.slice(7, 19)}…`
      : `Chain broken at ${r.broken_at}: ${r.reason}.`,
  });
  renderView();
}

async function tamperTest(kind) {
  const log = logFor(kind);
  if (log.events.length < 2) {
    setVerify(kind, { ok: false, message: 'Add a few events first, then run the tamper test.' });
    return renderView();
  }
  const copy = clone(log.events);
  const i = Math.floor(copy.length / 2);
  copy[i].result = `${copy[i].result} (edited)`;
  const r = await verifyChain(copy);
  setVerify(kind, {
    ok: false,
    message: `Tamper test on a copy: changed the result of ${copy[i].event_id}. Verification fails at ${r.broken_at}: ${r.reason}. The real log is untouched.`,
  });
  renderView();
}

async function exportLog(kind) {
  const log = logFor(kind);
  const data = await log.export();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${log.caseId}-audit-trail.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------------------
// Rule Lab

function viewLab() {
  const c = cur();
  const draft = state.lab.draft;
  const scenario = SCENARIO_CONTROLS.map(
    (s) => `<label class="field" data-ctl="s:${s.key}">${esc(s.label)}
      <select data-scenario="${s.key}">${s.options
        .map(([v, l]) => `<option value="${esc(v)}" ${String(state.lab.scenario[s.key]) === v ? 'selected' : ''}>${esc(l)}</option>`)
        .join('')}</select></label>`,
  ).join('');

  const params = PARAM_CONTROLS.map((p) => {
    const v = getPath(draft, p.path);
    let input;
    if (p.type === 'select') {
      const opts =
        p.path === 'parameters.pep_outcome'
          ? draft.parameters.pep_outcome_options.map((o) => [o, cap(o)])
          : Object.keys(draft.parameters.auto_approve_mode_options).map((k) => [k, MODE_LABELS[k] || k]);
      input = `<select data-param="${p.path}">${opts.map(([o, l]) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    } else if (p.type === 'list') {
      input = `<input type="text" data-param="${p.path}" value="${esc((v || []).join(', '))}" placeholder="e.g. VG, PA" autocomplete="off">`;
    } else {
      input = `<input type="number" data-param="${p.path}" value="${esc(v)}" ${p.min != null ? `min="${p.min}"` : ''} ${p.max != null ? `max="${p.max}"` : ''}>`;
    }
    return `<label class="field" data-ctl="p:${p.path}">${esc(p.label)}${input}</label>`;
  }).join('');

  return `
    <div class="view-head">
      <div>
        <h1>Rule Lab</h1>
        <p>Change a fact about the case or a parameter of the ruleset and see the decision change. Scenario changes are hypothetical and are not written to the case. Ruleset changes need a second approver and are audited.</p>
      </div>
      <div class="seg" role="group" aria-label="Start from">
        ${['A', 'B'].map((k) => `<button data-action="select-case" data-key="${k}" aria-pressed="${state.caseKey === k}">Start from ${esc(state.cases[k].data.label)}</button>`).join('')}
      </div>
    </div>
    <div class="lab-grid">
      <div class="controls">
        <section class="sheet">
          <fieldset><legend>What if the case looked different?</legend>${scenario}
          <div class="btn-row"><button class="btn btn-quiet" data-action="lab-reset-scenario">Reset scenario</button></div></fieldset>
        </section>
        <section class="sheet">
          <fieldset><legend>Ruleset parameters</legend>
          <p class="help">Draft based on ruleset ${esc(state.ruleset.version)}. Changes preview on the right at once.</p>
          ${params}
          <div class="btn-row"><button class="btn btn-quiet" data-action="lab-reset-params">Reset to the active ruleset</button></div></fieldset>
        </section>
        <section class="sheet" id="lab-governance">${labGovernance()}</section>
      </div>
      <div id="lab-results">${labResults(c)}</div>
    </div>`;
}

function labGovernance() {
  const p = state.lab.pending;
  if (p) {
    return `<h3>Change waiting for approval</h3>
      <div class="pending-change mt-s">
        <ul class="diff">${p.diff.map((x) => `<li><code>${esc(x.path)}</code>: ${esc(JSON.stringify(x.from))} to ${esc(JSON.stringify(x.to))}</li>`).join('')}</ul>
        <p class="muted">Reason: ${esc(p.reason)}</p>
        <p class="faint">You now act as the second approver. In production the proposer cannot approve their own change.</p>
        <div class="btn-row"><button class="btn" data-action="lab-approve">Approve as second approver</button><button class="btn btn-secondary" data-action="lab-discard">Discard</button></div>
      </div>`;
  }
  return `<h3>Make it the active ruleset</h3>
    <p class="help mt-s">Proposing creates a new version once a second person approves it. Every open case is then re-evaluated and the change is logged.</p>
    <label class="field mt-s">Reason for the change
      <textarea data-bind="rs-reason" placeholder="Why should the policy change?">${esc(state.lab.reason)}</textarea></label>
    ${state.lab.error ? `<p class="error mt-s" role="alert">${esc(state.lab.error)}</p>` : ''}
    <div class="btn-row mt-s"><button class="btn" data-action="lab-propose">Propose change</button></div>`;
}

function labResults(c) {
  let base;
  let wi;
  let err = null;
  try {
    base = evaluate(c.data, state.ruleset);
  } catch (e) {
    return `<p class="error">${esc(e.message)}</p>`;
  }
  try {
    wi = evaluate(applyScenario(c.data, state.lab.scenario, state.lab.draft), state.lab.draft);
  } catch (e) {
    err = e instanceof RulesetError ? e.errors : [e.message];
  }
  const card = (title, sub, ev, rs, other) => {
    const diffCls = (a, b) => (other && a !== b ? ' class="changed"' : '');
    const o = other;
    return `<section class="sheet">
      <h3>${esc(title)}</h3><p class="sub">${esc(sub)}</p>
      <dl class="kv">
        <dt>Outcome</dt><dd${diffCls(ev.decision.outcome, o?.decision.outcome)}>${outcomeBadge(ev.decision.outcome)}</dd>
        <dt>Deciding rule</dt><dd${diffCls(ev.decision.rule_id, o?.decision.rule_id)}><code>${esc(ev.decision.rule_id)}</code></dd>
        <dt>Risk score</dt><dd${diffCls(ev.risk.score, o?.risk.score)}>${ev.risk.score} points, ${esc(ev.risk.band)}</dd>
        <dt>Status</dt><dd${diffCls(ev.decision.status, o?.decision.status)}>${esc(STATUS_LABELS[ev.decision.status])}</dd>
        <dt>Who decides</dt><dd>${esc(decidedByText(ev.decision))}</dd>
        <dt>Client sees</dt><dd${diffCls(ev.client_message.title, o?.client_message.title)}>${esc(ev.client_message.title)}</dd>
      </dl>
      ${decisionPath(ev, rs, { compact: true })}
    </section>`;
  };
  const summary = err
    ? `<p class="verify bad">The draft ruleset is refused by the guardrails: ${esc(err.join(' '))}</p>`
    : base.decision.outcome === wi.decision.outcome && base.decision.rule_id === wi.decision.rule_id && base.risk.score === wi.risk.score
      ? '<p class="lab-summary same">Same result as the baseline. Change a scenario or a parameter on the left.</p>'
      : `<p class="lab-summary">Changed: ${esc(OUTCOME_LABELS[base.decision.outcome])} via <code>${esc(base.decision.rule_id)}</code> becomes ${esc(OUTCOME_LABELS[wi.decision.outcome])} via <code>${esc(wi.decision.rule_id)}</code>.${base.risk.score !== wi.risk.score ? ` Risk score ${base.risk.score} becomes ${wi.risk.score}.` : ` Risk score unchanged at ${wi.risk.score}.`}</p>`;
  return `${summary}
    <div class="compare mt-s">
      ${card('Baseline', `${c.data.label} as in the case file, ruleset ${state.ruleset.version}`, base, state.ruleset, wi)}
      ${err ? '<section class="sheet"><h3>What-if</h3><p class="error">No result: fix the ruleset parameters.</p></section>' : card('What-if', 'Your scenario and draft parameters', wi, state.lab.draft, base)}
    </div>`;
}

function updateLab() {
  const r = document.getElementById('lab-results');
  if (r) r.innerHTML = labResults(cur());
  updateLabMarks();
}

function updateLabMarks() {
  document.querySelectorAll('[data-ctl]').forEach((n) => {
    const [kind, key] = n.dataset.ctl.split(/:(.+)/);
    const changed =
      kind === 's'
        ? String(state.lab.scenario[key]) !== String(SCENARIO_DEFAULTS[key])
        : JSON.stringify(getPath(state.lab.draft, key)) !== JSON.stringify(getPath(state.ruleset, key));
    n.classList.toggle('changed', changed);
  });
}

// ---------------------------------------------------------------------------
// Ruleset view

function viewRuleset() {
  const rs = state.ruleset;
  const p = rs.parameters;
  const cat = rs.documents.catalog;
  const tiers = p.volume_tiers_usd_monthly;
  const decided = (r) => {
    const by = r.decided_by.startsWith('param:') ? `${r.decided_by.slice(6)} (${p[r.decided_by.slice(6)]})` : r.decided_by;
    return esc(by);
  };
  const outcome = (o) => (o.startsWith('param:') ? `${outcomeBadge(p[o.slice(6)])} <span class="faint">set by ${esc(o.slice(6))}</span>` : outcomeBadge(o));
  const ruleRows = (list) =>
    list
      .map((r) => ({ ...r, note: r.note_by_outcome?.[r.outcome.startsWith('param:') ? p[r.outcome.slice(6)] : r.outcome] ?? r.note }))
      .map((r) => `<tr><td class="nowrap"><code>${esc(r.id)}</code></td><td>${esc(r.if)}${r.note ? `<br><span class="faint">${esc(r.note)}</span>` : ''}</td><td class="nowrap">${outcome(r.outcome)}</td><td>${decided(r)}</td></tr>`)
      .join('');

  return `
    <div class="view-head">
      <div>
        <h1>Ruleset ${esc(rs.version)}</h1>
        <div class="rs-meta"><span>Effective from ${esc(rs.effective_from)}</span><span>Status: ${esc(rs.status)}</span></div>
        <p>${esc(rs.owner)}</p>
      </div>
      <a class="btn btn-secondary" href="ruleset.json" target="_blank" rel="noopener">Open ruleset.json (version ${esc(state.baseRuleset.version)})</a>
    </div>
    <div class="rs-grid">
      <section class="sheet">
        <h2>How a decision is made</h2>
        <ol class="plain-list">
          <li>Automated checks collect the facts (below). Rules never call a provider; they only read check results.</li>
          <li>Hard rules are checked top to bottom. The first match decides; every match is shown.</li>
          <li>If no hard rule matches, the risk score decides: low ${esc('≤')} ${p.risk_score_bands.low_max}, medium ${esc('≤')} ${p.risk_score_bands.medium_max}, high above.</li>
          <li>An approval must also pass the approval preconditions. Missing items never block a human review; they are requested alongside it.</li>
        </ol>
      </section>
      <section class="sheet"><h2>Automated checks</h2><p class="muted">Checks collect the facts, rules decide.</p><div class="table-wrap"><table class="table"><thead><tr><th>Check</th><th>What it checks</th><th>Source</th></tr></thead><tbody>${rs.checks
        .map((k) => `<tr><td class="nowrap"><code>${esc(k.id)}</code></td><td>${esc(k.name)}${k.manual_step ? `<br><span class="faint">Manual step: ${esc(k.manual_step)}</span>` : ''}</td><td>${esc(providerLabel(k.simulated_provider))}</td></tr>`)
        .join('')}</tbody></table></div></section>
      <section class="sheet"><h2>Hard rules</h2><div class="table-wrap"><table class="table"><thead><tr><th>Rule</th><th>If</th><th>Outcome</th><th>Decided by</th></tr></thead><tbody>${ruleRows(rs.decision_rules.hard_rules)}</tbody></table></div></section>
      <section class="sheet"><h2>Risk bands</h2><div class="table-wrap"><table class="table"><thead><tr><th>Band</th><th>Score</th><th>Outcome</th><th>Decided by</th></tr></thead><tbody>${rs.decision_rules.band_rules
        .map(
          (b) =>
            `<tr><td>${esc(cap(b.band))}</td><td class="num">${b.band === 'low' ? `0–${p.risk_score_bands.low_max}` : b.band === 'medium' ? `${p.risk_score_bands.low_max + 1}–${p.risk_score_bands.medium_max}` : `${p.risk_score_bands.medium_max + 1} and above`}</td><td>${outcomeBadge(b.outcome)}${b.note ? `<br><span class="faint">${esc(b.note)}</span>` : ''}</td><td>${decided(b)}</td></tr>`,
        )
        .join('')}</tbody></table></div></section>
      <section class="sheet"><h2>Approval preconditions</h2><div class="table-wrap"><table class="table"><thead><tr><th>Rule</th><th>If</th><th>Outcome</th><th>Decided by</th></tr></thead><tbody>${ruleRows(rs.decision_rules.approval_preconditions)}</tbody></table></div></section>
      ${rs.decision_rules.human_approval ? `<section class="sheet"><h2>When a person approves</h2><ul class="plain-list">
        ${rs.decision_rules.human_approval.requires_complete_documents ? '<li>Nobody approves a case while required documents are missing; they are requested from the client first.</li>' : ''}
        ${rs.decision_rules.human_approval.senior_management_sign_off ? `<li>Approving an EDD case records the senior management sign-off: ${esc(rs.decision_rules.human_approval.senior_management_sign_off.fields.join(', '))}.</li>` : ''}
      </ul></section>` : ''}
      <section class="sheet"><h2>Risk factors</h2><div class="table-wrap"><table class="table"><thead><tr><th>Factor</th><th></th><th>Points</th></tr></thead><tbody>${rs.risk_factors
        .map((f) => `<tr><td class="nowrap"><code>${esc(f.id)}</code></td><td>${esc(f.factor)}${f.per ? ` <span class="faint">(per ${esc(f.per)}, max ${f.max})</span>` : ''}</td><td class="num">${f.points}</td></tr>`)
        .join('')}</tbody></table></div></section>
      <section class="sheet"><h2>Parameters</h2><div class="table-wrap"><table class="table"><tbody>
        <tr><td>Verify owners from</td><td>${p.ubo_ownership_threshold_pct}% effective ownership, or control by other means${p.ubo_ownership_threshold_high_risk_pct != null ? `; ${p.ubo_ownership_threshold_high_risk_pct}% when the structure is higher risk (holding in a low-transparency jurisdiction, high-risk jurisdiction or PEP involved)` : ''}</td></tr>
        <tr><td>Approval of low-risk cases</td><td><code>${esc(p.auto_approve_mode)}</code>: ${esc(p.auto_approve_mode_options[p.auto_approve_mode])}</td></tr>
        <tr><td>QA sample rate</td><td>${p.qa_sample_rate_pct}% (used in sample mode)</td></tr>
        <tr><td>When a PEP is found</td><td><code>${esc(p.pep_outcome)}</code> (options: ${esc(p.pep_outcome_options.join(', '))})</td></tr>
        ${tiers.map((t) => `<tr><td>Volume tier ${esc(t.id)}</td><td>${esc(tierDescription(t, rs))}: ${t.additional_documents.length ? esc(t.additional_documents.map((x) => cat[x]).join('; ')) : 'no additional documents'}</td></tr>`).join('')}
      </tbody></table></div></section>
      <section class="sheet"><h2>Documents</h2>
        <p class="muted">Every client</p><ul class="plain-list">${rs.documents.base.map((x) => `<li>${esc(cat[x])}</li>`).join('')}</ul>
        <p class="muted mt">Per holding company</p><ul class="plain-list">${rs.documents.per_holding.map((x) => `<li>${esc(cat[x])}</li>`).join('')}</ul>
        <p class="muted mt">Requested in enhanced due diligence</p><ul class="plain-list">${p.edd_documents.map((x) => `<li>${esc(cat[x])}</li>`).join('')}</ul>
        ${rs.documents.resubmission ? `<p class="muted mt">When a document cannot be accepted</p><ul class="plain-list"><li>${esc(rs.documents.resubmission.automated_requests === 1 ? 'One automated email' : `${rs.documents.resubmission.automated_requests} automated emails`)} asking for the right document, with the reason</li><li>If it still cannot be accepted: ${esc(rs.documents.resubmission.then.charAt(0).toLowerCase() + rs.documents.resubmission.then.slice(1))}</li><li>Typical cases: ${esc(rs.documents.resubmission.examples.join('; '))}</li></ul>` : ''}
      </section>
      ${rs.client_account ? `<section class="sheet"><h2>Client account</h2><div class="table-wrap"><table class="table"><tbody>
        <tr><td>Created</td><td>Before the application; the same account is used for later uploads, status and trading</td></tr>
        <tr><td>Sign-in</td><td>${esc(rs.client_account.sign_in)}</td></tr>
        <tr><td>Consents recorded</td><td>${esc(rs.client_account.consents.map((x) => `${x.label} ${x.version}`).join(', '))}</td></tr>
      </tbody></table></div></section>` : ''}
      <section class="sheet"><h2>Jurisdictions</h2>
        <div class="table-wrap"><table class="table"><tbody>
          <tr><td>Prohibited</td><td>${esc(rs.jurisdictions.prohibited.map(country).join(', '))}</td></tr>
          <tr><td>High-risk (EU list, FATF increased monitoring): EDD</td><td>${rs.jurisdictions.high_risk_fatf_increased_monitoring.length ? esc(rs.jurisdictions.high_risk_fatf_increased_monitoring.map(country).join(', ')) : '<span class="faint">Empty on purpose, see note</span>'}</td></tr>
          <tr><td>Low-transparency holding locations</td><td>${esc(rs.jurisdictions.low_transparency_holding.map(country).join(', '))}</td></tr>
        </tbody></table></div>
        <p class="faint mt-s">${esc(rs.jurisdictions._note)} ${esc(rs.jurisdictions._note_increased_monitoring)}</p>
      </section>
      <section class="sheet"><h2>Guardrails</h2><ul class="plain-list">${rs.guardrails.map((g) => `<li>${esc(g)}</li>`).join('')}</ul>
        <h3 class="mt">Never automated</h3><ul class="plain-list mt-s">${rs.never_automated.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></section>
      ${auditSection(state.rulesetLog, state.lab.verify, 'ruleset', 'Ruleset change history')}
    </div>`;
}

// ---------------------------------------------------------------------------
// Docs view

function viewDocs() {
  const nav = DOC_PAGES.map(
    ([id, label]) => `<button data-action="doc" data-page="${id}" aria-current="${state.docs.page === id}">${esc(label)}</button>`,
  ).join('');
  return `<div class="docs-layout">
    <nav class="docs-nav" aria-label="Documents">${nav}</nav>
    <article class="sheet prose" id="doc-body">${state.docs.cache[state.docs.page] || '<p class="muted">Loading…</p>'}</article>
  </div>`;
}

async function loadDoc() {
  const page = state.docs.page;
  if (state.docs.cache[page]) return;
  const file = DOC_PAGES.find(([id]) => id === page)[2];
  try {
    state.docs.cache[page] = renderMarkdown(await fetchText(file));
  } catch (e) {
    state.docs.cache[page] = `<p class="error">Could not load ${esc(file)}: ${esc(e.message)}</p>`;
  }
  if (state.view === 'docs' && state.docs.page === page) {
    const body = document.getElementById('doc-body');
    if (body) body.innerHTML = state.docs.cache[page];
  }
}

// ---------------------------------------------------------------------------
// Events

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-action]');
  if (!t || t.disabled) return;
  const c = cur();
  switch (t.dataset.action) {
    case 'goto':
      state.view = t.dataset.view;
      render();
      el.view.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
      break;
    case 'select-case':
      state.caseKey = t.dataset.key;
      render();
      break;
    case 'reset':
      if (confirm('Reset the demo? This clears both cases, their audit trails and any ruleset changes.')) location.reload();
      break;
    case 'next': {
      if (c.running) return;
      const step = STEPS[c.step];
      if (step.id === 'account') {
        if (!c.consented) {
          c.stepError = 'Please accept the terms of use and the privacy notice to create your account.';
          renderView();
          return;
        }
        await createAccount(c);
        await startApplication(c);
      }
      if (['company', 'ownership', 'activity', 'documents'].includes(step.id)) await runStep(c, step.id);
      if (step.id === 'review') {
        if (!c.declared) {
          c.stepError = 'Please confirm the declaration above to submit your application.';
          renderView();
          return;
        }
        await submitApplication(c);
      } else {
        c.stepError = null;
        c.step += 1;
      }
      render();
      break;
    }
    case 'back':
      c.stepError = null;
      if (!c.running && c.step > 0) c.step -= 1;
      renderView();
      break;
    case 'autorun':
      await runWholeJourney(c);
      break;
    case 'attach':
      await attachDocument(t.dataset.key);
      break;
    case 'provide':
      await uploadOutstanding();
      break;
    case 'role':
      state.role = t.dataset.role;
      c.actionError = null;
      renderView();
      break;
    case 'act':
      await performAction(t.dataset.id);
      break;
    case 'verify':
      await verifyLog(t.dataset.log);
      break;
    case 'tamper':
      await tamperTest(t.dataset.log);
      break;
    case 'export':
      await exportLog(t.dataset.log);
      break;
    case 'lab-reset-scenario':
      state.lab.scenario = { ...SCENARIO_DEFAULTS };
      renderView();
      break;
    case 'lab-reset-params':
      state.lab.draft = clone(state.ruleset);
      state.lab.error = null;
      renderView();
      break;
    case 'lab-propose':
      await proposeChange();
      break;
    case 'lab-approve':
      await approveChange();
      break;
    case 'lab-discard':
      await discardChange();
      break;
    case 'doc':
      state.docs.page = t.dataset.page;
      renderView();
      syncHash();
      break;
    default:
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  const c = cur();
  if (t.dataset.bind === 'reason') c.reasonDraft = t.value;
  if (t.dataset.bind === 'so') c.signOff[t.dataset.key] = t.value;
  if (t.dataset.bind === 'rs-reason') state.lab.reason = t.value;
});

document.addEventListener(
  'toggle',
  (e) => {
    if (e.target.matches?.('[data-feed]')) state.feedOpen = e.target.open;
  },
  true,
);

document.addEventListener('change', (e) => {
  const t = e.target;
  const c = cur();
  if (t.dataset.bind === 'declare') {
    c.declared = t.checked;
    c.stepError = null;
    renderView();
  } else if (t.dataset.bind === 'consent') {
    c.consented = t.checked;
    c.stepError = null;
    renderView();
  } else if (t.dataset.bind === 'request-item') {
    c.requestItems = t.checked ? [...new Set([...c.requestItems, t.value])] : c.requestItems.filter((k) => k !== t.value);
  } else if (t.dataset.scenario) {
    state.lab.scenario[t.dataset.scenario] = t.value;
    updateLab();
  } else if (t.dataset.param) {
    const path = t.dataset.param;
    let value;
    if (t.type === 'number') value = t.value === '' ? NaN : Number(t.value);
    else if (t.type === 'text')
      value = t.value
        .split(/[\s,;]+/)
        .map((x) => x.trim().toUpperCase())
        .filter((x) => /^[A-Z]{2}$/.test(x));
    else value = t.value;
    state.lab.draft = setParameter(state.lab.draft, path, value);
    state.lab.error = null;
    updateLab();
  }
});

window.addEventListener('hashchange', () => {
  readHash();
  render();
});

// ---------------------------------------------------------------------------
// Start

async function init() {
  try {
    const [rs, clients] = await Promise.all([fetchText('ruleset.json').then(JSON.parse), fetchText('data/clients.json').then(JSON.parse)]);
    const errors = validateRuleset(rs);
    if (errors.length) throw new RulesetError(errors);
    state.baseRuleset = rs;
    state.ruleset = clone(rs);
    state.clients = clients;
    state.lab.draft = clone(rs);
    state.rulesetLog = new AuditLog('RULESET');
    await state.rulesetLog.append({
      actor: ACTORS.system,
      action: 'ruleset.loaded',
      result: `version ${rs.version} active`,
      reason: rs.status,
      inputs: rs,
      ruleset_version: rs.version,
    });
    state.cases.A = newCase('A');
    state.cases.B = newCase('B');
    readHash();
    render();
  } catch (e) {
    el.view.innerHTML = `<div class="sheet"><h2>The prototype could not start</h2><p class="error mt-s">${esc(e.message)}</p><p class="muted mt-s">If you opened index.html directly from disk, serve the folder instead, for example with <code>python3 -m http.server</code>.</p></div>`;
  }
}

init();
