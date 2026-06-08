# Daily Brief

Daily Brief is a "Family Chief of Staff" app that creates and sends a daily morning briefing using:

- **Next.js + Tailwind CSS**
- **Supabase** for data storage
- **Google OAuth** for Calendar + Gmail access
- **Anthropic Claude API** (`claude-sonnet-4-20250514`) for briefing generation

## Core Features

- Connect Google Calendar + Gmail through OAuth on first load
- Pull today's events, recent emails, and flagged tasks
- Generate a concise action-first briefing with:
  - Schedule overview
  - Time-sensitive reminders (birthdays, appointments, pickups, travel)
  - Household task list
  - Email watchlist
- Auto-draft two short texts:
  - One to spouse/partner
  - One to caregiver/au pair
- Send briefing by email on a configurable schedule (default **4:00 AM**)
- Dashboard preview + manual **Regenerate** trigger
- Settings page for family members, send time, account connection

## 1) Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
ANTHROPIC_API_KEY=
CRON_SECRET=your-random-secret
```

## 2) Supabase Schema

Run `supabase/schema.sql` in the Supabase SQL editor.

## 3) Google OAuth configuration

In Google Cloud Console:

1. Enable Gmail API and Google Calendar API.
2. Create OAuth client credentials.
3. Add redirect URI:
   - `http://localhost:3000/api/auth/google/callback` (local)
   - `https://<your-domain>/api/auth/google/callback` (production)

## 4) Run the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## 5) Scheduled delivery

A cron endpoint is available at:

- `GET /api/cron/send-briefings`

It requires:

- `Authorization: Bearer <CRON_SECRET>`

`vercel.json` includes a minute-by-minute cron to check whether any household is due right now.

## Manual regenerate

From the dashboard, press **Regenerate** to force a new briefing for today.
