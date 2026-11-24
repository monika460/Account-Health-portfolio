// Reads the latest result of a saved Redash query, server-side only.
// The API key comes from the REDASH_API_KEY environment variable and never reaches the browser.

const CACHE_MS = 5 * 60 * 1000; // reuse a fetched result for 5 minutes per server instance
let cache = null;

export async function fetchQueryResult() {
  const base = (process.env.REDASH_URL || 'https://redashv3.getpowerplay.in').replace(/\/+$/, '');
  const queryId = process.env.REDASH_QUERY_ID || '1455';
  const key = process.env.REDASH_API_KEY;
  if (!key) throw new Error('REDASH_API_KEY is not set. Add it in Vercel → Project → Settings → Environment Variables.');

  if (cache && cache.queryId === queryId && Date.now() - cache.at < CACHE_MS) return cache.result;

  const res = await fetch(`${base}/api/queries/${encodeURIComponent(queryId)}/results.json`, {
    headers: { Authorization: `Key ${key}` },
    cache: 'no-store'
  });
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 || res.status === 404
      ? ' Check that REDASH_API_KEY is valid for this query (or is a user API key) and REDASH_QUERY_ID is right.'
      : '';
    throw new Error(`Redash answered ${res.status} ${res.statusText}.${hint}`);
  }
  const body = await res.json();
  const qr = body && body.query_result;
  if (!qr || !qr.data || !Array.isArray(qr.data.rows)) throw new Error('Redash returned no rows for this query.');

  const result = { rows: qr.data.rows, retrievedAt: qr.retrieved_at || null, queryId };
  cache = { at: Date.now(), queryId, result };
  return result;
}
