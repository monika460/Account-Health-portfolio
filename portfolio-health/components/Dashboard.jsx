'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RiskScatter, RenewalBars } from './Charts.jsx';
import { money, moneyAcct, date, dateTime, healthClass } from '../lib/format.js';

const SEGMENTS = [
  { key: 'Save now', cls: 'q-save', who: 'Big accounts · at risk', play: "Call them yourself this week. Talk to the owner about renewal, fix what's blocking usage, push open issues." },
  { key: 'Fix with playbook', cls: 'q-fix', who: 'Smaller accounts · at risk', play: 'Use the standard rescue: trainer re-activation, clear overdue tasks, renewal reminders.' },
  { key: 'Grow', cls: 'q-grow', who: 'Big accounts · healthy', play: 'Protect and expand: review meetings, more users and modules, early renewal.' },
  { key: 'Nurture', cls: 'q-nurture', who: 'Smaller accounts · healthy', play: 'Keep in touch on a schedule: monthly check-ins, usage nudges, group trainings.' }
];
const WINDOWS = ['Overdue (grace)', '0-30 days', '31-60 days', '61-90 days', '91-180 days', '180+ days'];
const NO_FILTERS = { seg: '', win: '', health: '' };

export default function Dashboard() {
  const [kam, setKam] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ ...NO_FILTERS, top: '25' });
  const [selected, setSelected] = useState(null);
  const listRef = useRef(null);
  const detailRef = useRef(null);

  const load = useCallback(async (k) => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/portfolio${k ? `?kam=${encodeURIComponent(k)}` : ''}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok || body.error) throw new Error(body.error || `Request failed (${res.status})`);
      setData(body);
      setKam(body.kam);
      const url = new URL(window.location.href);
      url.searchParams.set('kam', body.kam);
      window.history.replaceState(null, '', url);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(new URLSearchParams(window.location.search).get('kam')); }, [load]);

  const accounts = data ? data.accounts : [];
  const s = data ? data.summary : null;
  const rules = data ? data.rules : { bigAccountArr: 150000, atRiskScore: 50, watchScore: 35, medianArr: 118000 };

  const matching = useMemo(() => {
    const inWin = (r) => !filters.win || (filters.win === 'next90' ? r.days_to_renewal > 0 && r.days_to_renewal <= 90 : r.renewal_window === filters.win);
    return accounts.filter((r) => (!filters.seg || r.segment === filters.seg) && inWin(r) && (!filters.health || r.health === filters.health));
  }, [accounts, filters]);
  const shown = filters.top === 'all' ? matching : matching.slice(0, Number(filters.top));
  const growth = useMemo(() => accounts.filter((r) => r.health === 'Healthy' && r.growth_score >= 50)
    .sort((a, b) => b.growth_score - a.growth_score || b.arr - a.arr).slice(0, 12), [accounts]);
  const current = accounts.find((r) => r.org_id === selected) || null;

  const goToList = () => setTimeout(() => listRef.current && listRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  const applyFilters = (f, top = 'all') => { setFilters({ ...NO_FILTERS, ...f, top }); goToList(); };
  const select = useCallback((id) => {
    setSelected((cur) => (cur === id ? null : id));
    if (id) setTimeout(() => detailRef.current && detailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }, []);
  const pickWindow = useCallback((w) => applyFilters({ win: w }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const isOn = (f) => Object.keys(NO_FILTERS).every((k) => (f[k] || '') === filters[k]);

  const downloadCsv = () => {
    const cols = ['rank', 'account', 'kam', 'segment', 'health', 'arr', 'renewal_date', 'days_to_renewal', 'renewal_status',
      'risk_score', 'usage_score', 'growth_score', 'priority_score', 'active_users_l7', 'total_users', 'last_successful_contact',
      'overdue_tasks', 'open_dib_brb_pstd', 'next_actions', 'org_id'];
    const esc = (v) => { const t = Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const csv = [cols.join(','), ...matching.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `call-list-${(kam || 'all').replace(/\W+/g, '-')}-${data ? data.asOf : ''}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const filterText = [filters.seg && `group "${filters.seg}"`,
    filters.win && (filters.win === 'next90' ? 'renewing in the next 90 days' : `renewing "${filters.win}"`),
    filters.health && `health "${filters.health}"`].filter(Boolean);

  return (
    <div className="ph">
      <header className="top" id="top">
        <div>
          <h1>Portfolio health checkup</h1>
          <p className="sub">
            {data ? `${kam === 'All' ? 'All KAMs' : kam} · ${data.summary.kpis.accounts} active and grace-period accounts · Redash query ${data.queryId}, refreshed ${dateTime(data.retrievedAt)} · amounts in ₹ lakh (L) and crore (Cr), 1 Cr = 100 L` : 'Loading…'}
          </p>
          {s && (
            <p className="lede">
              <b>{money(s.kpis.at_risk_lakh)}</b> of <b>{money(s.kpis.arr_lakh)}</b> ARR is at risk, across <b>{s.kpis.at_risk_accounts}</b> accounts.{' '}
              <b>{money(s.kpis.grace_lakh)}</b> from <b>{s.kpis.grace_accounts}</b> accounts is already past its renewal date.
            </p>
          )}
        </div>
        <div className="controls">
          <label className="f">KAM
            <select value={kam || ''} onChange={(e) => { setSelected(null); setFilters({ ...NO_FILTERS, top: '25' }); load(e.target.value); }} aria-label="KAM">
              {data && <option value="All">All KAMs ({data.totalAccounts})</option>}
              {data && data.kams.map((k) => <option key={k.name} value={k.name}>{k.name} ({k.accounts})</option>)}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => load(kam)} disabled={loading}>{loading ? 'Loading…' : 'Reload'}</button>
        </div>
      </header>

      {error && <div className="card error">Couldn't load the data: {error}</div>}
      {!data && !error && <div className="state">Fetching the latest Redash results…</div>}

      {s && (
        <>
          <section className="card guide" id="how-to-read">
            <h2>How to read this page</h2>
            <ol>
              <li><b>Money summary (the 5 boxes).</b> How much ARR you have, how much is at risk, and how much is due soon. Click any box to see those accounts in the list.</li>
              <li><b>What to do with each group (the 4 coloured boxes).</b> Every account sits in one group based on how much it pays and how likely it is to leave. Click a group to see its accounts.</li>
              <li><b>Two charts.</b> On the left, each dot is one account: further right means more money, higher up means more risk. On the right, each bar shows how much money renews in that period. Click a dot to open that account, or a bar to list the accounts renewing then.</li>
              <li><b>Call list.</b> Work from the top down: #1 needs you most. Click any row to see why it's there and what to do.</li>
            </ol>
            <div className="colors">
              <span><span className="dot bad" />Red = at risk: act this week</span>
              <span><span className="dot warn" />Amber = watch: check in soon</span>
              <span><span className="dot ok" />Green = healthy: keep it that way</span>
            </div>
          </section>

          <section id="kpis">
            <h2><span className="step">1</span>Money summary</h2>
            <div className="tiles">
              {[
                { f: {}, top: '25', lbl: 'Total ARR', val: money(s.kpis.arr_lakh), foot: `${s.kpis.accounts} accounts`, go: 'Show all accounts' },
                { f: { health: 'At risk' }, cls: 'bad', lbl: 'ARR at risk', val: money(s.kpis.at_risk_lakh), foot: `${s.kpis.at_risk_pct}% of your ARR`, go: 'Show at-risk accounts' },
                { f: { win: 'Overdue (grace)' }, cls: 'bad', lbl: 'Renewal overdue', val: money(s.kpis.grace_lakh), foot: `${s.kpis.grace_accounts} accounts not yet paid`, go: 'Show overdue accounts' },
                { f: { win: 'next90' }, lbl: 'Renewing in next 90 days', val: money(s.kpis.next90_lakh), foot: `${s.kpis.next90_accounts} accounts`, go: 'Show these renewals' },
                { f: { health: 'Healthy' }, cls: 'ok', lbl: 'Healthy share of ARR', val: `${s.kpis.healthy_pct}%`, foot: 'accounts in good shape', go: 'Show healthy accounts' }
              ].map((t) => (
                <button type="button" key={t.lbl} className={`card tile${Object.keys(t.f).length && isOn(t.f) ? ' on' : ''}`}
                  onClick={() => applyFilters(t.f, t.top || 'all')}>
                  <span className="lbl">{t.lbl}</span>
                  <span className={`val ${t.cls || ''}`}>{t.val}</span>
                  <span className="foot">{t.foot}</span>
                  <span className="go">{t.go} →</span>
                </button>
              ))}
            </div>
          </section>

          <section id="groups">
            <h2><span className="step">2</span>What to do with each group</h2>
            <p className="note">Big accounts are those paying {money(rules.bigAccountArr / 1e5)} or more a year. An account is "at risk" when its risk score is {rules.atRiskScore} or more out of 100.</p>
            <div className="quads">
              {SEGMENTS.map((g) => {
                const row = s.segments.find((x) => x.segment === g.key) || { accounts: 0, arr_lakh: 0 };
                return (
                  <button type="button" key={g.key} className={`card quad ${g.cls}${isOn({ seg: g.key }) ? ' on' : ''}`} onClick={() => applyFilters({ seg: g.key })}>
                    <span className="h">{g.key}</span>
                    <span className="who">{g.who}</span>
                    <span className="nums"><b>{row.accounts}</b> accounts · {money(row.arr_lakh)}</span>
                    <span className="play">{g.play}</span>
                    <span className="go">See these accounts →</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section id="charts">
            <h2><span className="step">3</span>Where the risk is</h2>
            <div className="two">
              <div className="card">
                <h2>Money vs risk</h2>
                <p className="note">Each dot is one account. Right = pays more. Up = more likely to leave. Top-right dots matter most. Click a dot to open it.</p>
                <RiskScatter accounts={accounts} selected={selected} onSelect={select} bigAccountArr={rules.bigAccountArr} atRiskScore={rules.atRiskScore} />
              </div>
              <div className="card">
                <h2>Money up for renewal, by when</h2>
                <p className="note">Each bar is the ARR renewing in that period; the red part is at risk. Click a bar to list those accounts.</p>
                <RenewalBars windows={s.windows} onPick={pickWindow} />
              </div>
            </div>
          </section>

          <section id="call-list" ref={listRef}>
            <h2><span className="step">4</span>Call list: who to work on first</h2>
            <p className="note">#1 needs you most. Priority = risk score × size of the account × how close the renewal is (details at the bottom of the page). Click any row for the full picture.</p>

            <div ref={detailRef}>{current && <Detail r={current} big={rules.bigAccountArr} onClose={() => setSelected(null)} />}</div>

            <div className="controls">
              <label className="f">Group
                <select value={filters.seg} onChange={(e) => setFilters({ ...filters, seg: e.target.value })}>
                  <option value="">All groups</option>
                  {SEGMENTS.map((g) => <option key={g.key}>{g.key}</option>)}
                </select>
              </label>
              <label className="f">Renews
                <select value={filters.win} onChange={(e) => setFilters({ ...filters, win: e.target.value })}>
                  <option value="">Any time</option>
                  <option value="Overdue (grace)">Overdue (grace)</option>
                  <option value="next90">Next 90 days</option>
                  {WINDOWS.slice(1).map((w) => <option key={w}>{w}</option>)}
                </select>
              </label>
              <label className="f">Health
                <select value={filters.health} onChange={(e) => setFilters({ ...filters, health: e.target.value })}>
                  <option value="">All</option><option>At risk</option><option>Watch</option><option>Healthy</option>
                </select>
              </label>
              <label className="f">Show
                <select value={filters.top} onChange={(e) => setFilters({ ...filters, top: e.target.value })}>
                  <option value="25">Top 25</option><option value="50">Top 50</option><option value="all">All</option>
                </select>
              </label>
              <button type="button" className="btn" onClick={() => setFilters({ ...NO_FILTERS, top: '25' })}>Clear filters</button>
              <button type="button" className="btn" onClick={downloadCsv}>Download CSV</button>
            </div>
            <p className="showing">Showing {shown.length} of {matching.length} accounts{filterText.length ? ` · filtered by ${filterText.join(', ')}` : ' · no filters'}.</p>

            <div className="tblwrap">
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th><th>Account</th><th className="num">ARR</th><th className="num">Renews in (days)</th>
                    <th>Renewal status</th><th className="num">Risk (0–100)</th><th className="num">Usage (0–100)</th><th>What to do</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.org_id} tabIndex={0} className={`click${r.org_id === selected ? ' on' : ''}`}
                      onClick={() => select(r.org_id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.org_id); } }}>
                      <td className="num">{r.rank}</td>
                      <td className="acct">{r.account}<span className="s">{r.segment} · {r.days_to_renewal <= 0 ? 'renewal overdue' : 'active'} · usage {r.activity.toLowerCase()}{kam === 'All' ? ` · ${r.kam}` : ''}</span></td>
                      <td className="num">{moneyAcct(r.arr_lakh)}</td>
                      <td className="num">{r.days_to_renewal}</td>
                      <td>{r.renewal_status}</td>
                      <td className="num"><span className={`pill ${healthClass(r.health)}`}>{r.risk_score}</span></td>
                      <td className="num">{r.usage_score}</td>
                      <td className="acts"><ul>{r.next_actions.slice(0, 2).map((t) => <li key={t}>{t}</li>)}</ul></td>
                    </tr>
                  ))}
                  {!shown.length && <tr><td colSpan={8}>No accounts match these filters. Click "Clear filters".</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section id="expansion">
            <h2>Accounts ready to grow</h2>
            <p className="note">Healthy accounts with strong, rising usage: the best ones to pitch more users, more modules or an early renewal. Click a row for details.</p>
            <div className="tblwrap">
              <table>
                <thead>
                  <tr>
                    <th>Account</th><th className="num">ARR</th><th className="num">Growth score (0–100)</th><th className="num">Active users this week</th>
                    <th className="num">Licensed users</th><th className="num">Active projects</th><th>Usage trend</th><th className="num">Renews in (days)</th>
                  </tr>
                </thead>
                <tbody>
                  {growth.map((r) => (
                    <tr key={r.org_id} tabIndex={0} className={`click${r.org_id === selected ? ' on' : ''}`}
                      onClick={() => { select(r.org_id); }} onKeyDown={(e) => { if (e.key === 'Enter') select(r.org_id); }}>
                      <td className="acct">{r.account}</td>
                      <td className="num">{moneyAcct(r.arr_lakh)}</td>
                      <td className="num">{r.growth_score}</td>
                      <td className="num">{r.active_users_l7}</td>
                      <td className="num">{r.total_users}</td>
                      <td className="num">{r.active_projects_l30}</td>
                      <td>{r.activity_trend}</td>
                      <td className="num">{r.days_to_renewal}</td>
                    </tr>
                  ))}
                  {!growth.length && <tr><td colSpan={8}>No healthy accounts with a growth score of 50 or more right now.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <Method rules={rules} />
          <p className="foot-note">Data: Redash query {data.queryId}, last refreshed in Redash {dateTime(data.retrievedAt)}. Scores worked out for {date(data.asOf)}.</p>
        </>
      )}
    </div>
  );
}

function Detail({ r, big, onClose }) {
  const reasons = [];
  if (r.days_to_renewal <= 0) reasons.push(`Renewal is ${-r.days_to_renewal} days overdue and not yet paid.`);
  else if (r.days_to_renewal <= 90) reasons.push(`Renews in ${r.days_to_renewal} days.`);
  if (['Churned', 'May Not Pay'].includes(r.renewal_status)) reasons.push(`Renewal status is "${r.renewal_status}".`);
  if (r.activity === 'Inactive') reasons.push('Nobody used the product in the last 7 days.');
  else if (r.activity_trend === 'Decreased') reasons.push(`Usage is falling (${r.events_prev_l7} → ${r.events_l7} events week on week).`);
  else if (r.activity === 'Good') reasons.push('Usage is good.');
  if (r.days_since_contact == null) reasons.push('No successful contact on record.');
  else if (r.days_since_contact > 30) reasons.push(`No successful contact in ${r.days_since_contact} days.`);
  if (r.overdue_tasks >= 5) reasons.push(`${r.overdue_tasks} tasks are overdue.`);
  if (r.open_dib_brb_pstd >= 10) reasons.push(`${r.open_dib_brb_pstd} DIB/BRB/PSTD items are open.`);
  if (r.arr >= big) reasons.push(`It is one of your bigger accounts (${money(big / 1e5)} or more).`);
  if (!reasons.length) reasons.push('No warning signs right now.');
  const facts = [
    ['ARR', moneyAcct(r.arr_lakh)], ['Renewal date', date(r.renewal_date)], ['Days to renewal', r.days_to_renewal],
    ['Renewal status', r.renewal_status], ['Usage score', r.usage_score], ['Growth score', r.growth_score],
    ['Active users this week', `${r.active_users_l7} of ${r.total_users}`], ['Active projects (30 days)', r.active_projects_l30],
    ['Events this week vs last', `${r.events_l7} vs ${r.events_prev_l7}`], ['Modules trained', `${r.modules_trained} of ${r.modules}`],
    ['Last successful contact', r.last_successful_contact ? `${date(r.last_successful_contact)} (${r.days_since_contact} days ago)` : 'None recorded'],
    ['Overdue tasks', r.overdue_tasks], ['Open DIB/BRB/PSTD', r.open_dib_brb_pstd], ['KAM', r.kam]
  ];
  return (
    <div className="card detail">
      <div className="dtop">
        <div>
          <div className="name">#{r.rank} {r.account}</div>
          <div className="meta">{r.segment} · {r.subscription} · {r.finance_status} · {r.org_id}</div>
        </div>
        <div>
          <span className={`pill ${healthClass(r.health)}`}>{r.health} · risk {r.risk_score}</span>{' '}
          <button type="button" className="btn" onClick={onClose}>Close ✕</button>
        </div>
      </div>
      <div className="facts">{facts.map(([k, v]) => <div key={k}>{k}<b>{v}</b></div>)}</div>
      <div className="cols">
        <div><h3>Why it is here</h3><ul>{reasons.map((t) => <li key={t}>{t}</li>)}</ul></div>
        <div><h3>What to do</h3><ul>{r.next_actions.map((t) => <li key={t}>{t}</li>)}</ul></div>
      </div>
    </div>
  );
}

function Method({ rules }) {
  return (
    <details id="method">
      <summary>How accounts are prioritised</summary>
      <p>Every account gets a <b>priority score</b>. The call list is sorted by it, highest first.</p>
      <p><b>Priority = Risk score × Size factor × Urgency</b></p>
      <ul>
        <li><b>Risk score (0–100)</b>: how likely the account is to not renew. Points are added for: renewal status (Churned 40, May Not Pay 35, TBD 15, May Pay 12, Will Pay 5, Paid or Active 0); renewal already overdue (+25); low usage (0.35 × (100 − usage score), so up to +35); no usage in the last 7 days with renewal within 90 days (+10); usage down more than 30% week on week (+5); no successful contact in 30 days (+8) or 60 days (+15); 8+ overdue tasks or 20+ open DIB/BRB/PSTD items (+5). Capped at 100.</li>
        <li><b>Size factor</b>: √(account ARR ÷ {moneyAcct(rules.medianArr / 1e5)}). A {moneyAcct(rules.medianArr / 1e5)} account counts 1×, one four times bigger counts 2×. Big accounts count more without drowning out the smaller ones.</li>
        <li><b>Urgency</b>: 1.6× if the renewal is overdue, 1.45× within 30 days, 1.3× within 60, 1.15× within 90, otherwise 1×.</li>
        <li><b>Usage score (0–100)</b>: activity status (good 40, low 20, inactive 0) + share of licensed users active this week (up to 25, full at 50%) + usage trend (rising 15, flat 7) + active projects in 30 days (up to 10, full at 5) + events this week (up to 10, full at 200).</li>
        <li><b>Groups</b>: big means ARR of {money(rules.bigAccountArr / 1e5)} or more, at risk means a risk score of {rules.atRiskScore} or more. Health: at risk {rules.atRiskScore}+, watch {rules.watchScore}–{rules.atRiskScore - 1}, healthy below {rules.watchScore}.</li>
        <li><b>Growth score (0–100)</b>: half the usage score + 15 for rising usage + 15 for 10+ active projects + 10 for 10+ active users this week + 10 if half or more of licensed users are active; halved for at-risk accounts.</li>
        <li><b>ARR</b>: what the account pays per year now; for accounts past their renewal date, what the expiring term was worth.</li>
        <li><b>Accounts included</b>: finance status Active or Grace Period in Redash query 1455.</li>
      </ul>
    </details>
  );
}
