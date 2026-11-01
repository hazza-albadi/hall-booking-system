# Hall Booking System

A simple system for booking a single hall between committees and teams. Users sign in with Google, and bookings are confirmed instantly.

| | |
|---|---|
| **Frontend** | HTML + CSS + JavaScript (ES Modules) + Bootstrap 5 (RTL) |
| **Calendar** | FullCalendar 6 |
| **Database & Auth** | Supabase (PostgreSQL + Auth + Realtime) |
| **Hosting** | Vercel (static site with a tiny build step that injects environment variables) |

---

## Business rules

- **Who can book?** Only team leads and senior management, using the emails the admins add.
- **Bookings** are confirmed instantly and last from 30 minutes up to **3 hours**.
- **No overlaps:** two overlapping bookings are impossible, even if two people press "Book" at the same moment.
- **Team leads:**
  - Book on behalf of their own team.
  - Cancel their own team's bookings before they end.
- **Senior management (admins):**
  - Book on behalf of any team.
  - Cancel any booking. A reason is required when cancelling another team's booking.
  - Manage the member list.
- **Cancelling never deletes a booking.** It stays in the history with who cancelled it and why.

> All of these rules are enforced inside the database (`supabase/schema.sql`), not just in the browser.

---

## Setup

### 1) Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project. Pick a nearby region.
2. In the sidebar, open **SQL Editor** → **New query**.
3. Paste the full contents of `supabase/schema.sql` and click **Run**.
4. **Add yourself as the first admin.** At the end of the file there are two commented-out lines. Copy them, change the email to your Google email, and run them:

```sql
insert into public.members (email, full_name, team_id, role)
select 'your.email@gmail.com', 'Your Name', id, 'admin' from public.teams where name = 'الإدارة العليا';
```

> The team names are stored in Arabic. Keep `'الإدارة العليا'` (Senior Management) exactly as written.

### 2) Enable Google sign-in

**In Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):

1. Create a project, then open **APIs & Services**.
2. Under **OAuth consent screen**:
   - Choose **External**.
   - Enter the app name and a support email.
3. Under **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**:
   - Under **Authorized JavaScript origins**, add:
     ```
     http://localhost:5500
     https://your-site.vercel.app
     ```
   - Under **Authorized redirect URIs**, add (you'll find it in Supabase under the Google provider settings):
     ```
     https://<PROJECT-REF>.supabase.co/auth/v1/callback
     ```
4. Copy the **Client ID** and **Client Secret**.

**In Supabase:**

1. Open **Authentication** → **Providers** (or Sign In / Providers) → **Google**.
2. Enable it and paste the Client ID and Client Secret.
3. **Recommended:** disable the **Email** provider on the same page. The system only accepts Google accounts anyway.
4. Open **Authentication** → **URL Configuration** and set:
   - **Site URL:** your Vercel URL.
   - **Redirect URLs:** add your Vercel URL and `http://localhost:5500`.

### 3) Connect the site to your project (environment variables)

No keys are stored in the code or on GitHub. The build script (`scripts/build.mjs`) reads two environment variables and generates `assets/js/env.js`, which is git-ignored.

| Variable | Where to find it (Supabase → Project Settings → API) |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | anon / publishable key |

> ⚠️ **Never use the `service_role` / secret key.** The build refuses it automatically, because anything in `env.js` is visible in the browser.
> The anon key is public by design; Row Level Security is what protects the data.

### 4) Run it locally

Requires [Node.js](https://nodejs.org) 18 or newer.

1. Copy `.env.example` to `.env` and fill in the two values:
   ```
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
2. Start the site:
   ```
   npm run dev
   ```
   This generates `env.js` and serves the site at `http://localhost:5500`.

Prefer VS Code's **Live Server**? Run `npm run env` once (and again whenever `.env` changes), then open `index.html` with Live Server on port 5500.

> `.env` is git-ignored and never leaves your machine.

### 5) Deploy to Vercel

1. Push the project to GitHub.
2. On [vercel.com](https://vercel.com), choose **Add New** → **Project** and import the repository.
   Build settings are already in `vercel.json` (`npm run build` → `dist/`), so leave them as they are.
3. Before deploying, open **Environment Variables** and add `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
4. Click **Deploy**.
5. Copy the site URL and add it to:
   - Google Cloud (Authorized JavaScript origins).
   - Supabase (URL Configuration).

From then on, every `git push` deploys automatically.
If a variable is missing, the Vercel build fails with a clear message instead of publishing a broken site.
After changing a variable in Vercel, redeploy for it to take effect.

### 6) Publish the Google app (so anyone you add can sign in)

While the Google app is in **Testing**, only emails listed under **Audience → Test users** in Google Cloud can sign in, so every member would have to be added twice. Publishing removes that: Google lets any account through, and the site's own member list decides who gets in.

1. In Google Cloud → **Google Auth Platform** → **Branding**, fill in:
   - **Application home page:** `https://your-site.vercel.app`
   - **Application privacy policy link:** `https://your-site.vercel.app/privacy`
   - **Authorized domains:** `your-site.vercel.app`
   - Leave the **logo empty**. Uploading one triggers Google's verification review.
2. **Audience** → **Publish app** → **Confirm**.
3. In **Clients** → your web client, add `https://your-site.vercel.app` to **Authorized JavaScript origins**.
4. In Supabase → **Authentication** → **URL Configuration**, set **Site URL** to `https://your-site.vercel.app` and add it to **Redirect URLs** (keep `http://localhost:5500` for local testing).

The app only requests name, email, and profile picture, so publishing does not require a Google review.

### 7) Add team leads

Sign in with your account → **الإدارة** (Admin) → **إضافة عضو** (Add member), and enter:

- Their Google email
- Their team
- Their role

They can sign in right away.

---

## Project structure

```
hall-booking/
├── index.html                 Single page: all screens and dialogs
├── privacy.html               Privacy policy (Arabic + English), needed to publish the Google app
├── package.json               npm scripts: dev, env, build
├── .env.example               Template for local environment variables
├── vercel.json                Build settings, security headers (CSP, etc.) and caching
├── scripts/
│   └── build.mjs              Generates env.js from environment variables; builds dist/
├── supabase/
│   └── schema.sql             Database: tables, rules, permissions
├── assets/
│   ├── css/app.css            Branding and styles
│   ├── fonts/                 Thmanyah font
│   ├── img/                   Logo
│   └── js/
│       ├── config.js          App settings (reads Supabase values from env.js)
│       ├── env.js             Generated by the build; git-ignored
│       ├── supabase.js        Creates the Supabase client
│       ├── api.js             All database access + error translation
│       ├── state.js           Shared app state
│       ├── utils.js           Helpers: XSS protection, date formatting, toasts
│       ├── app.js             Entry point: sign-in and navigation
│       └── views/
│           ├── calendar.js        Calendar
│           ├── booking-modal.js   Booking dialog
│           ├── details-modal.js   Booking details and cancellation
│           ├── booking-card.js    Booking card component
│           ├── my-bookings.js     My team's bookings
│           └── admin.js           Admin panel
└── vendor/                    Libraries bundled locally (Bootstrap, FullCalendar, Supabase)
```

### Design decisions

| Decision | Why |
|---|---|
| **PostgreSQL exclusion constraint** to prevent overlaps | A browser-side check isn't enough: two people booking at the same moment would both succeed. The constraint makes conflicts impossible. |
| **Row Level Security** on every table | The frontend is visible to anyone, so permissions must live on the server. |
| **Writes go through functions (`create_booking`, `cancel_booking`)**, not directly to the table | One place to validate every rule, with clear error messages. |
| **Cancelling = changing the status, not deleting** | A complete history: who booked, who cancelled, and why. |
| **Email allowlist** (`members`) | Only people added by an admin can sign in, even if they have a Google account. |
| **Separate `api.js` layer** | The rest of the code doesn't know about Supabase, which makes it easier to extend and test. |
| **`esc()` before any text goes into HTML** | Protection against code injection (XSS). |
| **Keys in environment variables, not in Git** | `.env` locally, Vercel Environment Variables in production; the build rejects secret keys. |
| **Libraries bundled in `vendor/`** | No dependency on external servers, and a strict CSP (`script-src 'self'`). |
| **`rooms` table** | Ready for more halls or other bookable resources without changing the structure. |

---

## Extending it later

- **Add a hall:** insert a row into `rooms`. The functions already accept `p_room_id`; what's left is a room picker in the UI.
- **Add a new screen:**
  1. Create a file in `views/`.
  2. Add a section in `index.html`.
  3. Register the route in `ROUTES` inside `app.js`.
- **Change the maximum duration:** the `max_minutes` column in `rooms`. The UI follows it automatically.
- **Calendar hours and first day of the week:** `CALENDAR` in `config.js`.
- **Email notifications:** can be added with Supabase Edge Functions or Database Webhooks.
- **Custom Supabase domain:** if you use a domain other than `*.supabase.co`, add it to `connect-src` in `vercel.json`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Google says the app is in testing / "access blocked" | The email isn't a Google **test user**. Add it in Audience → Test users, or publish the app (step 6). |
| "الإعداد غير مكتمل" (Setup incomplete) appears | Locally: fill in `.env`, then run `npm run env`. On Vercel: add the environment variables and redeploy. |
| Vercel build fails with "Missing environment variables" | Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in Vercel → Settings → Environment Variables, then redeploy. |
| After Google sign-in: "حسابك غير مسجّل" (Account not registered) | The email isn't in `members`. Add it from the admin panel or with SQL. |
| `redirect_uri_mismatch` error from Google | The callback URL in Google Cloud doesn't match the one in Supabase. |
| You land on an error page after signing in | Add the site URL in Supabase → URL Configuration → Redirect URLs. |
| Blank page when opening `index.html` directly | Run it with `npm run dev` (step 4). |
| Bookings don't update in real time | Make sure the last steps of `schema.sql` ran (Realtime), or refresh the page. |
