# NeedleDrop

A personal vinyl collection tracker that pulls your Discogs library into a warm, minimal browsing interface. Log plays, filter by genre, view tracklists, and watch the waveform pulse.

Live at **[needle-drop.com](https://needle-drop.com)**

---

## What it does

- **OAuth login** — connect your Discogs account once; NeedleDrop syncs your full collection automatically
- **Virtualized grid** — renders hundreds of records without slowing down, sorted and filtered client-side
- **Genre / sort filters** — filter by genre pill, sort by date added, artist, year, play count, and more
- **Now Playing** — tap a record to view tracklist, runtime, and label info; mark it as playing and watch the waveform
- **Play tracking** — play counts and last-played timestamps stored in a persistent database
- **Auto-sync** — re-fetches from Discogs if your last sync was more than 24 hours ago

---

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4, CSS-only animations |
| Database | [Turso](https://turso.tech) (libSQL / SQLite at the edge) |
| Auth | Discogs OAuth 1.0a via `oauth-1.0a` |
| Images | In-app proxy (`/api/image`) using `sharp` |
| Deployment | Vercel |

---

## Running locally

**1. Clone and install**

```bash
git clone https://github.com/theronv/spin-watcher
cd spin-watcher
npm install
```

**2. Create `.env.local`**

```bash
cp .env.example .env.local
```

Fill in the values (see [Environment variables](#environment-variables) below).

**3. Register a Discogs OAuth app**

Go to [discogs.com/settings/developers](https://www.discogs.com/settings/developers), create an application, and set the callback URL to:

```
http://localhost:3000/api/auth/discogs/callback
```

Copy the consumer key and secret into `.env.local`.

**4. Create a Turso database**

```bash
# Install the Turso CLI
brew install tursodatabase/tap/turso

# Create a database and get credentials
turso db create needledrop
turso db tokens create needledrop
```

Add `TURSO_AUTH_TOKEN` to `.env.local`. The database URL is hardcoded in `src/lib/db.ts` — update it to point to your database.

**5. Start the dev server**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Log in with Discogs and your collection syncs automatically.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `DISCOGS_CONSUMER_KEY` | Yes | OAuth consumer key from Discogs developer settings |
| `DISCOGS_CONSUMER_SECRET` | Yes | OAuth consumer secret from Discogs developer settings |
| `TURSO_AUTH_TOKEN` | Yes | Auth token for your Turso database |
| `DISCOGS_TOKEN` | No | Personal access token — enables sync without OAuth (demo/fallback mode) |
| `DISCOGS_USER` | No | Discogs username — required if using `DISCOGS_TOKEN` fallback |

See `.env.example` for a copy-paste template.

---

## Deploying to Vercel

**1. Push to GitHub** (if not already done)

**2. Import the repo** at [vercel.com/new](https://vercel.com/new)

**3. Add environment variables** in Vercel → Settings → Environment Variables:

```
DISCOGS_CONSUMER_KEY
DISCOGS_CONSUMER_SECRET
TURSO_AUTH_TOKEN
```

**4. Update your Discogs app callback URL** to your production domain:

```
https://your-domain.com/api/auth/discogs/callback
```

**5. Deploy.** Vercel picks up pushes to `main` automatically after the initial import.

---

## How sync works

1. On first login, or if the last sync was more than 24 hours ago, `GET /api/sync` is called automatically
2. The sync route reads OAuth credentials from the session cookie and paginates through `GET /users/{username}/collection/folders/0/releases?per_page=100` until all pages are fetched
3. Records are upserted into Turso in a single batch write — existing play counts are untouched
4. Subsequent page loads read from the database directly (`GET /api/records`) and skip the Discogs round-trip

The last sync timestamp is stored in `localStorage` keyed by username (`last_sync_at_{username}`). Clicking the sync icon (↺) in the header forces an immediate re-fetch.

---

## API routes

| Route | Description |
|---|---|
| `GET /api/records` | All records from the database |
| `GET /api/sync` | Fetch collection from Discogs, upsert to DB |
| `GET /api/plays` | Play counts and last-played timestamps |
| `POST /api/plays` | Increment play count for a record |
| `PATCH /api/plays` | Set play count to an explicit value |
| `GET /api/album/[id]` | Tracklist + metadata for a release |
| `GET /api/image` | Image proxy with `sharp` resizing |
| `GET /api/init` | Create tables if they don't exist |
| `GET /api/auth/discogs` | Initiate Discogs OAuth flow |
| `GET /api/auth/discogs/callback` | Exchange verifier for access token |
| `GET /api/auth/logout` | Clear session cookie |
| `GET /api/auth/session` | Current session info (username, avatar) |
