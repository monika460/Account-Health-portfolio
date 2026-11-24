import { fetchQueryResult } from '../../../lib/redash.js';
import { RULES, mapRow, scoreAccounts, summarize } from '../../../lib/scoring.js';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Reporting day in India (UTC midnight of today's IST date).
function todayIST() {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

export async function GET(request) {
  try {
    const { rows, retrievedAt, queryId } = await fetchQueryResult();
    const today = todayIST();
    const t0 = today.getTime();

    // Paying accounts only (Active or in grace period), with days to renewal worked out for today.
    const mapped = rows
      .filter((r) => RULES.financeStatuses.includes(r.org_status_finance))
      .map(mapRow)
      .map((r) => (r.renewal_date ? { ...r, days_to_renewal: Math.round((Date.parse(r.renewal_date + 'T00:00:00Z') - t0) / 864e5) } : r));

    // KAM list for the picker.
    const counts = new Map();
    for (const r of mapped) counts.set(r.kam_name, (counts.get(r.kam_name) || 0) + 1);
    const kams = [...counts.entries()].map(([name, accounts]) => ({ name, accounts }))
      .sort((a, b) => (a.name === '(unassigned)') - (b.name === '(unassigned)') || a.name.localeCompare(b.name));

    const wanted = request.nextUrl.searchParams.get('kam') || process.env.DEFAULT_KAM || 'Monika';
    const kam = wanted === 'All' || counts.has(wanted) ? wanted : (kams[0] ? kams[0].name : 'All');
    const mine = kam === 'All' ? mapped : mapped.filter((r) => r.kam_name === kam);

    const accounts = scoreAccounts(mine, today);
    return Response.json(
      {
        kam, kams,
        totalAccounts: mapped.length,
        queryId, retrievedAt,
        asOf: today.toISOString().slice(0, 10),
        rules: { bigAccountArr: RULES.bigAccountArr, atRiskScore: RULES.atRiskScore, watchScore: RULES.watchScore, medianArr: RULES.medianArr },
        summary: summarize(accounts),
        accounts
      },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    return Response.json({ error: String(err && err.message ? err.message : err) }, { status: 502 });
  }
}
