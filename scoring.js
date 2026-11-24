// Portfolio health scoring.
// Turns rows of Redash query 1455 ("Farid accounts health") into scored accounts:
// usage (adoption), renewal risk, growth (expansion), priority, group, health and next actions.
// Every threshold lives in RULES so it can be tuned in one place.

export const RULES = {
  bigAccountArr: 150000,        // "big" account: ARR of ₹1.5 L or more
  atRiskScore: 50,              // health "At risk" from this risk score
  watchScore: 35,               // health "Watch" from this risk score
  medianArr: 118000,            // size factor = √(ARR ÷ this)
  statusRisk: { 'Churned': 40, 'May Not Pay': 35, 'TBD': 15, 'May Pay': 12, 'Will Pay': 5, 'Paid': 0, 'Active': 0 },
  unknownStatusRisk: 15,
  gracePeriodRisk: 25,
  lowUsageWeight: 0.35,         // × (100 − usage score)
  inactiveNearRenewalRisk: 10,  // no usage in 7 days and renewal within 90 days
  usageDropRisk: 5,             // usage down more than 30% week on week
  noContact30Risk: 8,
  noContact60Risk: 15,
  backlogRisk: 5,               // 8+ overdue tasks or 20+ open DIB/BRB/PSTD
  urgency: [[0, 1.6], [30, 1.45], [60, 1.3], [90, 1.15]], // [max days to renewal, multiplier]
  financeStatuses: ['Active', 'Grace Period']
};

const num = (v) => (v == null || v === '' ? 0 : Number(v) || 0);

// Round half to even (matches the original Python analysis).
const rnd = (x, d = 0) => {
  const f = 10 ** d, y = x * f, r = Math.round(y);
  return (Math.abs(y % 1) === 0.5 ? (r % 2 === 0 ? r : r - 1) : r) / f;
};

const KEEP = new Set(['LLP', 'EPC', 'YSM', 'AMG', 'RRA', 'JSV', 'GNV', 'RBS', 'RKB', 'TMK', 'VJR', 'GTC-KCNC', 'KCNC', 'MMM', 'TN', 'UK', 'H&A', 'DS', 'P', 'R', 'K', 'A', 'C', 'B', 'S', 'M/S', 'V', 'D', 'G', 'VKP', 'ECC']);
export function prettyName(name) {
  let s = String(name || '').replace(/\s+/g, ' ').trim().replace(/\.$/, '').replace(/\(\s*TN\s*\)/, '(TN)');
  if (s && (s === s.toUpperCase() || s === s.toLowerCase())) {
    s = s.split(' ').map((w) => (KEEP.has(w.toUpperCase()) ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join(' ');
  }
  s = s.replace(/\b(private|prevate) limited\b/gi, 'Pvt Ltd').replace(/\(p\) limited/gi, 'Pvt Ltd').replace(/\bpvt ltd\b/gi, 'Pvt Ltd');
  return s.replace('Bengaluru)', '(Bengaluru)').replace('(tn)', '(TN)').replace('(india)', '(India)')
    .replace(/\bLlp\b/g, 'LLP').replace('(uk)', '(UK)').replace('Q2builders', 'Q2 Builders');
}

const cleanDate = (d) => {
  if (!d) return null;
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !s.startsWith('1970') ? s : null;
};

// One Redash 1455 row -> the fields the scoring needs.
export function mapRow(r) {
  const modules = [1, 2, 3, 4, 5, 6].filter((i) => r[`v${i}_module`]).length;
  const trained = [1, 2, 3, 4, 5, 6].filter((i) => r[`v${i}_training_stage`] === 'Done').length;
  const activity = String(r.activity_status || '').startsWith('Good') ? 'Good'
    : String(r.activity_status || '').startsWith('Low') ? 'Low' : 'Inactive';
  const finance = r.org_status_finance;
  return {
    org_id: r.org_id,
    org_name: r.org_name || r.portal_name || r.org_id,
    kam_name: (r.kam_name || '').trim() || '(unassigned)',
    finance_status: finance,
    renewal_status: r.org_status_actual || '—',
    renewal_date: cleanDate(r.renewal_date),
    days_to_renewal: num(r.days_to_renewal),
    arr: Math.round(finance === 'Active' ? num(r.active_ten_arr) : num(r.latest_ten_arr)),
    total_users: num(r.total_users),
    active_users_l7: num(r.l7_active_user),
    active_projects_l30: num(r.l30_active_project),
    events_l7: num(r.new_l7_ig),
    events_prev_l7: num(r.prev_l7_ig),
    activity,
    activity_trend: ['Increased', 'Decreased'].includes(r.activity_comparison) ? r.activity_comparison : 'Unchanged',
    modules,
    modules_trained: trained,
    last_successful_contact: cleanDate(r.latest_successful_contact_date),
    overdue_tasks: num(r.overdue_tasks_count),
    open_dib_brb_pstd: num(r.dib_open) + num(r.brb_open) + num(r.pstd_open),
    subscription: r.subs_type || ''
  };
}

// Scores mapped rows. `today` is a Date (UTC midnight of the reporting day).
export function scoreAccounts(raw, today = new Date(), R = RULES) {
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysSince = (d) => (d ? Math.round((t0 - Date.parse(d + 'T00:00:00Z')) / 864e5) : null);

  const rows = raw.map((r) => {
    const grace = r.finance_status === 'Grace Period';
    const { arr, total_users: users, active_users_l7: l7u, active_projects_l30: proj, events_l7: ev, events_prev_l7: pev,
      days_to_renewal: dtr, activity: act, activity_trend: trend } = r;
    const since = daysSince(r.last_successful_contact);
    const sinceV = since == null ? 999 : since;

    // Usage score 0–100
    let usage = { Good: 40, Low: 20, Inactive: 0 }[act] || 0;
    usage += Math.min(l7u / Math.max(users, 1) / 0.5, 1) * 25;
    usage += trend === 'Increased' ? 15 : trend === 'Unchanged' && act !== 'Inactive' ? 7 : 0;
    usage += Math.min(proj / 5, 1) * 10;
    usage += Math.min(ev / 200, 1) * 10;
    usage = rnd(usage);

    // Risk score 0–100
    let risk = R.statusRisk[r.renewal_status] ?? R.unknownStatusRisk;
    if (grace) risk += R.gracePeriodRisk;
    risk += (100 - usage) * R.lowUsageWeight;
    if (act === 'Inactive' && dtr <= 90) risk += R.inactiveNearRenewalRisk;
    const dropping = trend === 'Decreased' && ev < pev * 0.7;
    if (dropping) risk += R.usageDropRisk;
    risk += sinceV > 60 ? R.noContact60Risk : sinceV > 30 ? R.noContact30Risk : 0;
    if (r.overdue_tasks >= 8 || r.open_dib_brb_pstd >= 20) risk += R.backlogRisk;
    risk = rnd(Math.min(risk, 100));

    // Growth score 0–100
    let growth = usage * 0.5;
    if (trend === 'Increased') growth += 15;
    if (proj >= 10) growth += 15;
    if (l7u >= 10) growth += 10;
    if (users && l7u / users >= 0.5) growth += 10;
    if (risk >= R.atRiskScore) growth *= 0.5;
    growth = rnd(Math.min(growth, 100));

    const window = dtr <= 0 ? 'Overdue (grace)' : dtr <= 30 ? '0-30 days' : dtr <= 60 ? '31-60 days'
      : dtr <= 90 ? '61-90 days' : dtr <= 180 ? '91-180 days' : '180+ days';
    const big = arr >= R.bigAccountArr, atRisk = risk >= R.atRiskScore;
    const segment = big && atRisk ? 'Save now' : big ? 'Grow' : atRisk ? 'Fix with playbook' : 'Nurture';
    const health = risk >= R.atRiskScore ? 'At risk' : risk >= R.watchScore ? 'Watch' : 'Healthy';
    const urg = (R.urgency.find(([d]) => dtr <= d) || [0, 1])[1];
    const priority = rnd(risk * Math.sqrt(Math.max(arr, 0) / R.medianArr) * urg, 1);

    const acts = [];
    if (grace) acts.push(`Collect renewal: ${-dtr} days past due`);
    else if (dtr <= 60 && ['TBD', 'May Pay', 'May Not Pay', 'Churned'].includes(r.renewal_status)) acts.push(`Lock renewal: ${dtr} days left, status ${r.renewal_status}`);
    if (act === 'Inactive') acts.push('Re-activation call: no usage last 7 days');
    else if (dropping) acts.push(`Usage dropping: ${pev}→${ev} events`);
    if (sinceV > 45) acts.push(sinceV === 999 ? 'No successful contact on record' : `No successful contact in ${sinceV} days`);
    if (r.overdue_tasks >= 5) acts.push(`Clear ${r.overdue_tasks} overdue tasks`);
    if (r.open_dib_brb_pstd >= 15) acts.push(`Escalate ${r.open_dib_brb_pstd} open DIB/BRB/PSTD`);
    if (r.modules && r.modules_trained === 0 && act !== 'Good') acts.push('Book module training');
    if (!acts.length && segment === 'Grow' && growth >= 50) acts.push('Upsell: more users / modules');
    if (!acts.length) acts.push('Routine check-in');

    return {
      org_id: r.org_id, account: prettyName(r.org_name), kam: r.kam_name, segment, health,
      renewal_status: r.renewal_status, finance_status: grace ? 'Grace period' : 'Active',
      renewal_date: r.renewal_date, days_to_renewal: dtr, renewal_window: window,
      arr, arr_lakh: Math.round(arr / 1e3) / 100,
      usage_score: usage, risk_score: risk, growth_score: growth, priority_score: priority,
      total_users: users, active_users_l7: l7u, active_projects_l30: proj, events_l7: ev, events_prev_l7: pev,
      activity: act, activity_trend: trend, modules: r.modules, modules_trained: r.modules_trained,
      last_successful_contact: r.last_successful_contact, days_since_contact: since,
      overdue_tasks: r.overdue_tasks, open_dib_brb_pstd: r.open_dib_brb_pstd, subscription: r.subscription,
      next_actions: acts
    };
  });
  rows.sort((a, b) => b.priority_score - a.priority_score || a.days_to_renewal - b.days_to_renewal);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows;
}

const lakh = (v) => Math.round(v / 1e4) / 10;

// Portfolio totals, group totals and renewal windows for the summary sections.
export function summarize(accounts) {
  const sum = (rows) => rows.reduce((s, r) => s + r.arr, 0);
  const total = sum(accounts);
  const risk = accounts.filter((r) => r.health === 'At risk');
  const grace = accounts.filter((r) => r.finance_status === 'Grace period');
  const n90 = accounts.filter((r) => r.days_to_renewal > 0 && r.days_to_renewal <= 90);
  const healthy = accounts.filter((r) => r.health === 'Healthy');
  const kpis = {
    accounts: accounts.length,
    arr_lakh: lakh(total),
    at_risk_lakh: lakh(sum(risk)), at_risk_accounts: risk.length,
    at_risk_pct: total ? Math.round(sum(risk) / total * 100) : 0,
    grace_lakh: lakh(sum(grace)), grace_accounts: grace.length,
    next90_lakh: lakh(sum(n90)), next90_accounts: n90.length,
    healthy_pct: total ? Math.round(sum(healthy) / total * 100) : 0
  };
  const segments = ['Save now', 'Fix with playbook', 'Grow', 'Nurture'].map((segment) => {
    const g = accounts.filter((r) => r.segment === segment);
    return { segment, accounts: g.length, arr_lakh: lakh(sum(g)) };
  });
  const windows = ['Overdue (grace)', '0-30 days', '31-60 days', '61-90 days', '91-180 days', '180+ days'].map((window) => {
    const g = accounts.filter((r) => r.renewal_window === window);
    const by = (h) => lakh(sum(g.filter((r) => r.health === h)));
    return { window, accounts: g.length, at_risk_lakh: by('At risk'), watch_lakh: by('Watch'), healthy_lakh: by('Healthy') };
  });
  return { kpis, segments, windows };
}
