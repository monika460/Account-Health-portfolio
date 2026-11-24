'use client';

import { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { healthColor, money, moneyAcct, date } from '../lib/format.js';

function useWidth(ref) {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

function placeTip(tip, el, ev, dy) {
  const [px, py] = d3.pointer(ev, el);
  const tw = tip.node().offsetWidth;
  tip.style('left', `${Math.max(0, Math.min(px + 12, el.clientWidth - tw - 4))}px`).style('top', `${Math.max(py - dy, 0)}px`);
}

// Money vs risk: each dot is an account.
export function RiskScatter({ accounts, selected, onSelect, bigAccountArr = 150000, atRiskScore = 50 }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  useEffect(() => {
    const el = ref.current;
    if (!el || !width) return;
    const root = d3.select(el);
    root.selectAll('*').remove();
    const rows = [...accounts].sort((a, b) => (a.org_id === selected) - (b.org_id === selected));
    const W = Math.max(width, 280), H = 340;
    const m = { top: 32, right: 14, bottom: 40, left: 40 };
    const maxArr = d3.max(rows, (r) => r.arr) || 1;
    const x = d3.scaleLinear().domain([0, Math.max(Math.ceil(maxArr / 50000) * 50000, bigAccountArr * 1.2)]).range([m.left, W - m.right]);
    const y = d3.scaleLinear().domain([0, 100]).range([H - m.bottom, m.top]);
    const svg = root.append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', 'Each account as a dot: ARR across, risk score up. Dashed lines split the four groups.');
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', m.left).attr('x2', W - m.right).attr('y1', y).attr('y2', y);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.bottom})`)
      .call(d3.axisBottom(x).ticks(Math.max(2, Math.floor((W - m.left - m.right) / 80))).tickFormat((v) => `${(v / 1e5).toFixed(1)} L`));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5));
    svg.append('text').attr('x', W - m.right).attr('y', H - 6).attr('text-anchor', 'end').text('ARR (₹) →');
    svg.append('text').attr('x', 2).attr('y', 12).text('Risk ↑');
    svg.append('line').attr('class', 'ref').attr('x1', x(bigAccountArr)).attr('x2', x(bigAccountArr)).attr('y1', m.top).attr('y2', H - m.bottom);
    svg.append('line').attr('class', 'ref').attr('x1', m.left).attr('x2', W - m.right).attr('y1', y(atRiskScore)).attr('y2', y(atRiskScore));
    const ql = [['Save now', W - m.right - 4, m.top + 12, 'end'], ['Fix with playbook', m.left + 6, m.top + 12, 'start'],
      ['Grow', W - m.right - 4, H - m.bottom - 8, 'end'], ['Nurture', m.left + 6, H - m.bottom - 8, 'start']];
    svg.append('g').selectAll('text').data(ql).join('text').attr('class', 'qlabel')
      .attr('x', (q) => q[1]).attr('y', (q) => q[2]).attr('text-anchor', (q) => q[3]).text((q) => q[0]);
    const tip = root.append('div').attr('class', 'tip').style('display', 'none');
    const sel = (r) => r.org_id === selected;
    svg.append('g').selectAll('circle').data(rows).join('circle')
      .attr('cx', (r) => x(r.arr)).attr('cy', (r) => y(r.risk_score)).attr('r', (r) => (sel(r) ? 9 : 6))
      .attr('tabindex', 0).attr('aria-label', (r) => `${r.account}, ARR ${moneyAcct(r.arr_lakh)}, risk ${r.risk_score}`)
      .style('fill', (r) => healthColor(r.health)).style('fill-opacity', (r) => (sel(r) ? 1 : 0.7))
      .style('stroke', (r) => (sel(r) ? 'var(--fg)' : 'var(--bg)')).style('stroke-width', (r) => (sel(r) ? 2.5 : 1))
      .on('pointerenter pointermove', (ev, r) => {
        tip.style('display', 'block').selectAll('*').remove();
        tip.append('div').attr('class', 't').text(r.account);
        tip.append('div').attr('class', 'm').text(`${moneyAcct(r.arr_lakh)} · risk ${r.risk_score} · ${r.health}`);
        tip.append('div').attr('class', 'm').text(`Renews ${date(r.renewal_date)} (${r.days_to_renewal} days) · ${r.renewal_status}`);
        tip.append('div').attr('class', 'm').text(`#${r.rank} on call list · click to open`);
        placeTip(tip, el, ev, 80);
      })
      .on('pointerleave', () => tip.style('display', 'none'))
      .on('click', (ev, r) => { tip.style('display', 'none'); onSelect(r.org_id); })
      .on('keydown', (ev, r) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); onSelect(r.org_id); } });
  }, [accounts, selected, width, onSelect, bigAccountArr, atRiskScore]);
  return <div className="chartbox" ref={ref} />;
}

// Money up for renewal, by window and health.
export function RenewalBars({ windows, onPick }) {
  const ref = useRef(null);
  const width = useWidth(ref);
  useEffect(() => {
    const el = ref.current;
    if (!el || !width) return;
    const root = d3.select(el);
    root.selectAll('*').remove();
    const keys = [['at_risk_lakh', 'At risk', 'var(--bad)'], ['watch_lakh', 'Watch', 'var(--warn)'], ['healthy_lakh', 'Healthy', 'var(--ok)']];
    const W = Math.max(width, 280), H = 300;
    const m = { top: 24, right: 6, bottom: 40, left: 40 };
    const total = (r) => r.at_risk_lakh + r.watch_lakh + r.healthy_lakh;
    const short = (t) => t.replace('Overdue (grace)', 'Overdue').replace(' days', 'd');
    const x = d3.scaleBand().domain(windows.map((r) => r.window)).range([m.left, W - m.right]).padding(0.22);
    const y = d3.scaleLinear().domain([0, (d3.max(windows, total) || 1) * 1.12]).nice().range([H - m.bottom, m.top]);
    const svg = root.append('svg').attr('width', '100%').attr('height', H).attr('viewBox', `0 0 ${W} ${H}`)
      .attr('role', 'img').attr('aria-label', 'ARR renewing in each period, split into at risk, watch and healthy');
    svg.append('g').attr('class', 'grid').selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', m.left).attr('x2', W - m.right).attr('y1', y).attr('y2', y);
    svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${H - m.bottom})`).call(d3.axisBottom(x).tickSizeOuter(0).tickFormat(short));
    svg.append('g').attr('class', 'axis').attr('transform', `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${v} L`));
    svg.append('text').attr('x', 2).attr('y', m.top - 10).text('ARR (₹)');
    const tip = root.append('div').attr('class', 'tip').style('display', 'none');
    d3.stack().keys(keys.map((k) => k[0]))(windows).forEach((layer, li) => {
      svg.append('g').selectAll('rect').data(layer).join('rect').attr('class', 'bar')
        .attr('x', (s) => x(s.data.window)).attr('width', x.bandwidth())
        .attr('y', (s) => y(s[1])).attr('height', (s) => Math.max(0, y(s[0]) - y(s[1])))
        .style('fill', keys[li][2])
        .on('pointerenter pointermove', (ev, s) => {
          const r = s.data;
          tip.style('display', 'block').selectAll('*').remove();
          tip.append('div').attr('class', 't').text(`${r.window}: ${r.accounts} accounts`);
          keys.forEach((k) => tip.append('div').attr('class', 'm').text(`${k[1]}: ${money(r[k[0]])}`));
          tip.append('div').attr('class', 'm').text('Click to list these accounts');
          placeTip(tip, el, ev, 80);
        })
        .on('pointerleave', () => tip.style('display', 'none'))
        .on('click', (ev, s) => { tip.style('display', 'none'); onPick(s.data.window); });
    });
    svg.append('g').selectAll('text').data(windows).join('text')
      .attr('x', (r) => x(r.window) + x.bandwidth() / 2).attr('y', (r) => y(total(r)) - 6)
      .attr('text-anchor', 'middle').text((r) => money(total(r)));
  }, [windows, width, onPick]);
  return <div className="chartbox short" ref={ref} />;
}
