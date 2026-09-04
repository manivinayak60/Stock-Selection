# SwingSignal: manual Vercel + Supabase deployment

This deployment keeps the app private behind a Supabase email/password login. Supabase stores user state, the NSE universe, EOD history, dated fundamentals, indicator state, and reproducible scan results. Vercel runs the Next.js app and the weekday EOD job.

## 1. Put the web app in GitHub

Create a private GitHub repository and push the contents of this `webapp` folder. The folder itself is already the Git repository root.

If GitHub shows setup commands for an existing repository, use those commands from this folder. Do not commit `.env.local` or any Supabase secret.

## 2. Create the Supabase project

1. Sign in at https://supabase.com and create a free project.
2. Save the database password in a password manager.
3. Wait until the project status is healthy.
4. Open **Project Settings -> API** (or the project's **Connect** dialog) and copy:
   - Project URL
   - Publishable key
   - Service-role key (server-only)

The publishable key is intentionally used by the browser. The service-role key is used only by server routes and local ingestion scripts. Never prefix it with `NEXT_PUBLIC_`, commit it, or paste it into client code.

## 3. Apply the migration stored in this repository

The migrations are:

`supabase/migrations/202609040001_initial_swing_signal_schema.sql`

`supabase/migrations/202609040002_market_pipeline.sql`

From the `webapp` folder, run:

```powershell
npx supabase@latest login
npx supabase@latest init
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push --dry-run
npx supabase@latest db push
```

`YOUR_PROJECT_REF` is the first part of the Supabase URL: `https://YOUR_PROJECT_REF.supabase.co`.

The dry run should list every migration not already applied. The final command creates the user tables, market-data pipeline, Row Level Security, and atomic paper-trade risk function. Add future changes as new migrations; do not edit one that has already been applied.

## 4. Create the only login account

1. In Supabase, open **Authentication -> Users**.
2. Choose **Add user -> Create new user**.
3. Enter your email and a strong unique password; mark the email as confirmed if that option is shown.
4. In **Authentication settings**, turn off new user signups after your account exists.

The app intentionally has no sign-up screen. Only an administrator-created Supabase user can log in.

## 5. Test locally (recommended)

Copy `.env.example` to `.env.local` and replace the placeholders:

```text
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
CRON_SECRET=GENERATE_A_LONG_RANDOM_VALUE
```

Then run:

```powershell
npm install
npm test
npm run dev
```

Open `http://localhost:3000`, sign in, change one setting, refresh, and confirm it remains saved.

## 6. Deploy the app to Vercel

1. Sign in at https://vercel.com with GitHub.
2. Select **Add New -> Project** and import the private GitHub repository.
3. Vercel should detect **Next.js** automatically.
4. Leave the build command as `npm run build` and output directory blank.
5. Select Node.js 22 in the project settings if Vercel does not infer it from `package.json`.
6. Add these environment variables for **Production**, **Preview**, and **Development**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `CRON_SECRET`
7. Click **Deploy**.

If the environment variables are added after the first deployment, trigger a redeploy so the Next.js build receives them.

## 7. Load the initial 260-session history

The daily job appends one session; indicators need a one-time history load first. Run this locally with `.env.local` configured:

```powershell
npm run data:backfill
```

This downloads official NSE Nifty 500 constituents, equity bhavcopies, and Nifty 500 index snapshots. It validates each file, stores the EOD rows, builds rolling indicator state, and creates the latest scan. It can take several minutes because it processes approximately one trading year.

## 8. Import dated fundamentals

Copy `data/fundamentals-template.csv` to `data/fundamentals.csv` and populate it from a source you are licensed to use. `market_cap_cr` is in crore rupees; percentages are entered as numbers such as `18.5`, not `0.185`. Keep the filing/snapshot date and source on every row.

```powershell
npm run data:fundamentals -- data/fundamentals.csv
```

The scanner intentionally leaves a stock at **Watch** when required fundamentals are missing, stale, or fail the quality gates. Run the normal scan again after importing.

## 9. Daily schedule

`vercel.json` schedules `/api/pipeline/run` at 17:00 UTC (22:30 IST), Monday–Friday. Vercel sends `Authorization: Bearer <CRON_SECRET>`. A signed-in user can also run the same job from **Refresh NSE scan**.

The 9:00 AM view therefore uses the most recently completed NSE session. If the latest scan is old or incomplete, the UI marks it stale/review instead of silently substituting sample data.

## 10. Final verification

Open the Vercel URL in a private/incognito window and verify:

1. You are redirected to `/login`.
2. Incorrect credentials are rejected.
3. Your Supabase account opens the dashboard.
4. A watchlist change persists after refresh.
5. Saving risk settings persists after refresh.
6. A paper trade is blocked when it would exceed the configured hard-risk ceiling.
7. Data health shows real universe, received, and validated counts.
8. Clicking the avatar signs you out and returns to `/login`.

## Free-tier operational notes

- The scanner fails closed when NSE data is unavailable; it never falls back to fabricated or bundled prices.
- Keep Kite disabled until a later Kite Connect integration is added and subscribed.
- Supabase free projects may pause after inactivity; if the app stops loading saved data, check the Supabase project status first.
- This is a research and paper-trading tool, not an automatic order-placement system or a guarantee of returns.
