# SwingSignal: manual Vercel + Supabase deployment

This deployment keeps the app private behind a Supabase email/password login. Supabase stores settings, the watchlist, paper trades, and scan history. Vercel runs the Next.js web app and its API routes.

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

The publishable key is intentionally used by the browser. Do not use or expose the `service_role`/secret key in this app.

## 3. Apply the migration stored in this repository

The complete migration is:

`supabase/migrations/202609040001_initial_swing_signal_schema.sql`

From the `webapp` folder, run:

```powershell
npx supabase@latest login
npx supabase@latest init
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push --dry-run
npx supabase@latest db push
```

`YOUR_PROJECT_REF` is the first part of the Supabase URL: `https://YOUR_PROJECT_REF.supabase.co`.

The dry run should list one migration. The final command creates all four tables, indexes, checks, and Row Level Security policies. Future database changes should be added as new files in `supabase/migrations` and applied with `db push`; do not edit an already-applied migration.

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
```

Then run:

```powershell
npm install
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
7. Click **Deploy**.

If the environment variables are added after the first deployment, trigger a redeploy so the Next.js build receives them.

## 7. Final verification

Open the Vercel URL in a private/incognito window and verify:

1. You are redirected to `/login`.
2. Incorrect credentials are rejected.
3. Your Supabase account opens the dashboard.
4. A watchlist change persists after refresh.
5. Saving risk settings persists after refresh.
6. A paper trade is blocked when it would exceed the configured hard-risk ceiling.
7. Clicking the `MV` avatar signs you out and returns to `/login`.

## Free-tier operational notes

- The current scanner uses free end-of-day market data and can fall back to its bundled snapshot if the upstream source is temporarily unavailable.
- Keep Kite disabled until a later Kite Connect integration is added and subscribed.
- Supabase free projects may pause after inactivity; if the app stops loading saved data, check the Supabase project status first.
- This is a research and paper-trading tool, not an automatic order-placement system or a guarantee of returns.
