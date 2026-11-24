# Portfolio health checkup

A password-protected dashboard that turns Redash query 1455 ("Farid accounts health") into a KAM's portfolio health view: money summary, four action groups, a money-vs-risk chart, renewals by window, a ranked call list with next actions, and accounts ready to grow. Built with Next.js, ready for Vercel.

## How it works

```
Browser ──(password)──► Vercel: /api/portfolio ──(API key, server-side)──► Redash query 1455 latest result
                         scores every account (lib/scoring.js) and returns only the fields the page needs
```

- The Redash API key stays on the server. The browser never sees it, and phone numbers, emails and the heavy per-user arrays in query 1455 are never sent to the browser.
- Data is as fresh as the query's last run in Redash (it is scheduled every 6 hours). The page shows when Redash last refreshed it. **Reload** fetches again.
- Days to renewal and days since last contact are worked out for today's date in India, so the "overdue" and "next 90 days" groups stay right between Redash refreshes.
- Pick any KAM from the dropdown, or link straight to one: `https://your-app.vercel.app/?kam=Prerna` (`?kam=All` for everyone).

## Deploy to Vercel (about 10 minutes)

1. **Put the code on GitHub.** Create a new *private* repository and upload this folder (everything except `node_modules` and `.next`). Or from a terminal:
   ```bash
   cd portfolio-health
   git init && git add . && git commit -m "Portfolio health dashboard"
   git branch -M main
   git remote add origin https://github.com/<your-org>/portfolio-health.git
   git push -u origin main
   ```
2. **Import it in Vercel.** vercel.com → Add New → Project → pick the repository. Vercel detects Next.js; keep the default settings.
3. **Add environment variables** (Project → Settings → Environment Variables, or on the import screen):

   | Name | Value |
   |---|---|
   | `REDASH_API_KEY` | The API key for query 1455 (Redash → query → ⋮ → Show API Key), or your user API key |
   | `DASHBOARD_PASSWORD` | A password for the dashboard |
   | `DASHBOARD_USER` | Optional, defaults to `powerplay` |
   | `DEFAULT_KAM` | Optional, defaults to `Monika` |
   | `REDASH_URL` | Optional, defaults to `https://redashv3.getpowerplay.in` |
   | `REDASH_QUERY_ID` | Optional, defaults to `1455` |

4. **Deploy.** Open the URL Vercel gives you and sign in with the username and password. If you change a variable later, redeploy (Deployments → ⋯ → Redeploy) for it to take effect.

Alternative with the Vercel CLI: `npm i -g vercel`, then `vercel` in this folder, add the variables with `vercel env add REDASH_API_KEY` etc., and `vercel --prod`.

## Run it on your computer

```bash
npm install
cp .env.example .env.local   # then fill in REDASH_API_KEY and DASHBOARD_PASSWORD
npm run dev                  # http://localhost:3000
```

## Make it faster (optional)

Query 1455 builds large per-user and per-project arrays the dashboard doesn't use, so it takes minutes to run and returns a big result. `sql/portfolio_health_slim.sql` uses the same tables and definitions but returns only the ~35 columns the dashboard needs, with the same column names. To use it: create a new query in Redash with that SQL, schedule it (e.g. every hour), and set `REDASH_QUERY_ID` to its id and `REDASH_API_KEY` to that query's API key. Check its numbers against query 1455 once before switching.

## Change the scoring

All thresholds and weights are in `RULES` at the top of `lib/scoring.js` (big-account line, at-risk score, status points, urgency multipliers…). The "How accounts are prioritised" section at the bottom of the page explains the logic in plain words. Keep the two in step if you change the rules.

## Security notes

- The dashboard shows customer names and revenue: keep `DASHBOARD_PASSWORD` set (the app refuses to serve anything without it). On a Vercel Pro team you can also turn on Vercel Authentication under Settings → Deployment Protection.
- Use a query API key rather than a personal user key where possible: it can only read that one query's results.
- If an API key has been pasted into a chat, email or ticket, regenerate it in Redash and update `REDASH_API_KEY`.

## Files

| Path | What it does |
|---|---|
| `app/api/portfolio/route.js` | Reads Redash, filters paying accounts and the chosen KAM, scores, returns JSON |
| `lib/redash.js` | Redash API client (5-minute in-memory cache per server instance) |
| `lib/scoring.js` | Usage, risk, growth, priority, groups, next actions, totals |
| `components/Dashboard.jsx`, `components/Charts.jsx` | The page and its two charts |
| `proxy.js` | Password check on every page and API call |
| `sql/portfolio_health_slim.sql` | Optional faster Redash query |
