# NeedleDrop — Developer Guide

> End-to-end architecture reference for the web app + iOS companion.
> Read this before shipping to the App Store.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Environment Variables](#environment-variables)
3. [Authentication Flows](#authentication-flows)
4. [Database Schema & Multi-Tenancy](#database-schema--multi-tenancy)
5. [API Reference](#api-reference)
6. [Frontend (Next.js)](#frontend-nextjs)
7. [iOS App](#ios-app)
8. [Known Issues & Pre-Release Checklist](#known-issues--pre-release-checklist)

---

## Architecture Overview

```
┌─────────────────────────────────────┐     ┌──────────────────────────┐
│         iOS App (SwiftUI)           │     │    Discogs API           │
│   WKWebView → needle-drop.com       │     │  api.discogs.com         │
│   Deep-link: needledrop://          │     │  OAuth 1.0a / HMAC-SHA1  │
└──────────┬──────────────────────────┘     └────────────┬─────────────┘
           │ HTTPS + Bearer token                        │ OAuth / REST
           ▼                                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│               Next.js 16 on Vercel (needle-drop.com)                │
│                                                                     │
│  /api/auth/discogs          – initiate OAuth                        │
│  /api/auth/discogs/callback – exchange token, set session           │
│  /api/auth/session          – return current user                   │
│  /api/auth/logout           – clear cookie                          │
│  /api/init                  – create/migrate DB tables              │
│  /api/sync                  – fetch collection from Discogs, upsert │
│  /api/records               – return user's records from DB         │
│  /api/plays                 – GET / POST / PATCH play counts        │
│  /api/album/[id]            – release details + tracklist           │
│  /api/image                 – image proxy + Sharp resize            │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ libSQL (Turso)
                                 ▼
                    ┌────────────────────────┐
                    │  Turso (SQLite, edge)  │
                    │  spin-watcher-theronv  │
                    │  .aws-us-west-2        │
                    │  .turso.io             │
                    └────────────────────────┘
```

**Tech stack:**
- Next.js 16, React 19, Tailwind CSS v4
- Turso / libSQL (cloud SQLite at edge)
- Discogs OAuth 1.0a (HMAC-SHA1)
- Sharp for server-side image resizing
- react-window for virtualized album grid
- SwiftUI + WKWebView (iOS 17+, iPad-only)

---

## Environment Variables

Set in `.env.local` locally; add to Vercel project settings for production.

| Variable | Required | Purpose |
|---|---|---|
| `DISCOGS_CONSUMER_KEY` | Yes | OAuth consumer key from discogs.com/settings/developers |
| `DISCOGS_CONSUMER_SECRET` | Yes | OAuth consumer secret |
| `TURSO_AUTH_TOKEN` | Yes | Auth token for Turso DB |
| `SESSION_SECRET` | **Yes (mobile auth)** | HMAC-SHA256 signing key for Bearer tokens |
| `DISCOGS_TOKEN` | No | Personal token for single-user / demo mode |
| `DISCOGS_USER` | No | Username for demo mode |

> **Note:** `SESSION_SECRET` is **missing from `.env.example`** — add it before onboarding another developer. Generate with `openssl rand -hex 32`.

The Turso database URL is hardcoded in `src/lib/db.ts`:
```
libsql://spin-watcher-theronv.aws-us-west-2.turso.io
```
Move this to an env var (`TURSO_URL`) before open-sourcing or adding contributors.

---

## Authentication Flows

### Web Browser Flow

```
Browser                   Next.js                      Discogs
  │                          │                             │
  │  GET /api/auth/discogs   │                             │
  │─────────────────────────►│                             │
  │                          │  POST /oauth/request_token  │
  │                          │────────────────────────────►│
  │                          │◄────────────────────────────│
  │                          │  (stores secret in cookie)  │
  │◄─────────────────────────│                             │
  │  redirect → discogs.com  │                             │
  │                          │                             │
  │  (user authorizes)       │                             │
  │                          │                             │
  │  GET /api/auth/discogs/callback?oauth_token=X&oauth_verifier=Y
  │─────────────────────────►│                             │
  │                          │  POST /oauth/access_token   │
  │                          │────────────────────────────►│
  │                          │◄────────────────────────────│
  │                          │  GET /oauth/identity        │
  │                          │────────────────────────────►│
  │                          │◄────────────────────────────│
  │                          │  Set-Cookie: discogs_session │
  │◄─────────────────────────│  (httpOnly, 30 days, lax)   │
  │  redirect → /            │                             │
```

**Session cookie** (`discogs_session`) stores:
```json
{
  "username": "...",
  "avatar_url": "...",
  "access_token": "...",
  "access_token_secret": "..."
}
```

### Mobile (iOS) Flow

Same as web, with two differences:

1. The web app adds `?redirect_uri=needledrop://` when starting OAuth:
   `GET /api/auth/discogs?redirect_uri=needledrop://`

2. The callback handler detects the `discogs_redirect_uri` cookie and — instead of setting a cookie — creates a **signed Bearer token** and redirects to the deep link:
   `needledrop://?token=<signed-token>`

**Token format** (`src/lib/session.ts`):
```
<base64url(JSON payload)>.<HMAC-SHA256 signature>
```
Payload fields: `u` (username), `a` (avatar_url), `t` (access_token), `s` (access_token_secret), `iat` (issued-at unix seconds).

Verified on every API call by `verifyMobileToken()` before falling back to cookie check.

> **Security note:** Tokens have no expiry. Rotation requires re-login. Consider adding an `exp` claim and a token refresh flow before GA.

### Session Resolution Order

`GET /api/auth/session` (and every protected route) resolves auth in this order:

1. `Authorization: Bearer <token>` header → `verifyMobileToken()`
2. `discogs_session` httpOnly cookie → JSON parse
3. `DISCOGS_TOKEN` + `DISCOGS_USER` env vars → demo mode session

---

## Database Schema & Multi-Tenancy

Every table has a `username` column. Every query filters `WHERE username = ?`. This is how multiple Discogs users can share one database without seeing each other's data.

### `records` table

```sql
CREATE TABLE records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL DEFAULT '',
  discogs_id TEXT NOT NULL,
  title      TEXT NOT NULL,
  artist     TEXT NOT NULL,
  cover_url  TEXT,
  added_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  genres     TEXT NOT NULL DEFAULT '[]',   -- JSON array stored as text
  styles     TEXT NOT NULL DEFAULT '[]',   -- JSON array stored as text
  year       INTEGER,
  label      TEXT,
  format     TEXT,
  UNIQUE(username, discogs_id)             -- prevents duplicate on re-sync
);
```

### `plays` table

```sql
CREATE TABLE plays (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT NOT NULL DEFAULT '',
  discogs_id TEXT NOT NULL,
  played_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

One row per play event (not a counter column). This gives accurate `last_played` timestamps and a full history. Counts are derived with `COUNT(*)`.

### Schema Migrations

`GET /api/init` is called on every page load after auth. It is idempotent and handles:
- Creating both tables if they don't exist
- Adding `username` column to legacy tables (rebuilds with new UNIQUE constraint)
- Adding missing columns: `genres`, `styles`, `year`, `label`, `format`

---

## API Reference

All routes except `/api/auth/*` require authentication.

### Auth

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/discogs` | Start OAuth. Optional `?redirect_uri=needledrop://` for mobile |
| GET | `/api/auth/discogs/callback` | Exchange callback tokens; sets cookie or redirects with Bearer token |
| GET | `/api/auth/session` | Returns `{ is_logged_in, username, avatar_url, user }` |
| GET | `/api/auth/logout` | Clears cookie, redirects to `/` |

### Records & Sync

| Method | Path | Description |
|---|---|---|
| GET | `/api/records` | All user records from DB, ordered by `added_at DESC` |
| GET | `/api/sync` | Fetch full collection from Discogs, upsert to DB, return updated records |
| GET | `/api/init` | Create/migrate DB tables (idempotent) |

**Sync behavior:**
- Paginates Discogs at 100 releases/page until `pages` exhausted
- Uses `ON CONFLICT(username, discogs_id) DO UPDATE SET ...` — never drops existing play data
- Frontend caches last-sync timestamp in `localStorage` as `last_sync_at_{username}`; auto-syncs if >24 hours stale

### Plays

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/plays` | — | `[{ discogs_id, play_count, last_played }]` for all user records |
| POST | `/api/plays` | `{ discogs_id }` | Append one play event; returns updated count |
| PATCH | `/api/plays` | `{ discogs_id, count }` | Overwrite count (0–9999); deletes all rows, re-inserts N via recursive CTE |

### Album Details

| Method | Path | Description |
|---|---|---|
| GET | `/api/album/[id]` | Discogs release details: `{ year, label, genres, styles, tracklist, runtime }` |

Response cached for 7 days (`Cache-Control: max-age=604800`). Uses `DISCOGS_TOKEN` (personal token) for the Discogs REST API call.

### Image Proxy

| Method | Path | Description |
|---|---|---|
| GET | `/api/image?url=<img-url>&size=<px>` | Proxy + Sharp-resize Discogs image to JPEG. Size clamped 64–800px (default 500) |

Required because Discogs images block cross-origin requests. Response cached 7 days.

---

## Frontend (Next.js)

`src/app/page.tsx` is a single-page React app (~1,435 lines) with two modes.

### Data Loading Sequence

```
mount
 └─ GET /api/auth/session
     ├─ not logged in → render login screen
     └─ logged in
         ├─ GET /api/init          (create/migrate tables)
         ├─ GET /api/records       (load collection)
         ├─ GET /api/plays         (load play counts)
         └─ check localStorage last_sync_at_{username}
             └─ if stale (>24h) → GET /api/sync (auto-sync)
```

### Browse Mode

- **Virtualized grid** via `react-window` `FixedSizeList`
- **Columns:** 2 (mobile) / 3 (tablet) / 4 (desktop) — measured with `ResizeObserver`
- **Filtering:** client-side over `records` array; searches artist, title, year, label, genres
- **Genre filters:** multi-select pills derived from all genres in collection
- **Sort options:** date added, artist, title, most played, recently played, year ↑/↓, genre, format
- **Album card:** cover image, title, artist, genres, play count badge (tap to edit), now-playing dot

### Now Playing Mode

Two sub-states controlled by `isPlaying: boolean`:

**Detail view** (`isPlaying = false`)
- Large album art, metadata pills, tracklist table
- Inline play count editor
- "Mark as Playing" button → logs play via `POST /api/plays`, sets `isPlaying = true`

**Playing view** (`isPlaying = true`)
- Spinning vinyl animation (4s CSS rotation)
- Animated waveform bars (16 bars, 0.5–0.95s staggered durations)
- "STOP" button → clears `nowPlayingId`, returns to browse

### Key State

| State | Type | Purpose |
|---|---|---|
| `session` | `Session \| null` | Logged-in user |
| `mode` | `"browse" \| "now-playing"` | Top-level view |
| `records` | `RecordData[]` | Full collection |
| `plays` | `Record<string, PlayData>` | `discogs_id → { play_count, last_played }` |
| `filter` | `string` | Search query |
| `selectedGenres` | `Set<string>` | Active genre filter |
| `sort` | `SortKey` | Current sort |
| `nowPlayingId` | `string \| null` | Active record |
| `isPlaying` | `boolean` | Vinyl spinning |
| `editingId` | `string \| null` | Record with open count editor |
| `albumDetails` | `AlbumDetails \| null` | Tracklist fetched from Discogs |

---

## iOS App

`ios/Sources/App/` — SwiftUI, iOS 17+, iPad-only.

### Architecture

The app is a **WebView shell**: a `WKWebView` that loads the production web app. There is no separate native network layer or local data store — all logic runs in the web app loaded in the webview.

### Key Files

| File | Purpose |
|---|---|
| `NeedleDropApp.swift` | `@main` entry point, launches `ContentView` |
| `ContentView.swift` | Renders `WebView` full-screen |
| `project.yml` | XcodeGen config — bundle ID, deployment target, plist settings |

### WebView Configuration

```swift
config.allowsInlineMediaPlayback = true
config.mediaTypesRequiringUserActionForPlayback = []
prefs.allowsContentJavaScript = true
webView.allowsBackForwardNavigationGestures = true
webView.scrollView.contentInsetAdjustmentBehavior = .never
webView.isOpaque = false
webView.backgroundColor = UIColor(red: 0.047, green: 0.039, blue: 0.027, alpha: 1)
```

Error page is injected via `loadHTMLString` if the server URL is unreachable.

### OAuth Deep Link Flow (Mobile)

The web app navigates to `/api/auth/discogs?redirect_uri=needledrop://`. After Discogs authorizes, the server redirects to `needledrop://?token=<signed-token>`.

**Critical gap:** The `needledrop://` URL scheme is not yet registered in `project.yml`, and `NeedleDropApp.swift` has no `.onOpenURL` handler to capture the token. See [Known Issues](#known-issues--pre-release-checklist).

---

## Known Issues & Pre-Release Checklist

### Blockers for App Store Submission

#### 1. iOS server URL hardcoded to local dev IP

**File:** `ios/Sources/App/ContentView.swift:7`
```swift
private let serverURL = "http://192.168.68.87:3000"   // ← MUST CHANGE
```
**Fix:** Change to `https://needle-drop.com` before building the release IPA.

---

#### 2. `needledrop://` URL scheme not registered

The OAuth callback redirects to `needledrop://?token=...`, but `project.yml` has no `CFBundleURLTypes` entry. iOS will not route this URL back to the app.

**Fix:** Add to `project.yml` under `targets.NeedleDrop.info.properties`:
```yaml
CFBundleURLTypes:
  - CFBundleURLSchemes:
      - needledrop
    CFBundleURLName: com.needledrop.app
```
Then add an `.onOpenURL` handler in `NeedleDropApp.swift` to receive the token and inject it into the WebView's JavaScript context (e.g., `window.postMessage`), or store it in `UserDefaults` / Keychain so the WebView JS can read it via a custom `WKScriptMessageHandler`.

---

#### 3. No deep-link handler in the Swift layer

Even after registering the URL scheme, `NeedleDropApp.swift` has no handler. The token from the OAuth redirect will be swallowed.

**Minimal fix pattern:**
```swift
WindowGroup {
    ContentView()
        .ignoresSafeArea()
        .onOpenURL { url in
            // Extract token from url.query, pass to WebView via JS bridge
        }
}
```

---

#### 4. `NSAllowsArbitraryLoads: true` will fail App Store review

**File:** `ios/project.yml:37`

Apple App Store review flags `NSAllowsArbitraryLoads: true`. Replace with domain-specific exceptions:
```yaml
NSAppTransportSecurity:
  NSAllowsLocalNetworking: true
  NSExceptionDomains:
    needle-drop.com:
      NSIncludesSubdomains: true
      NSExceptionAllowsInsecureHTTPLoads: false
      NSExceptionRequiresForwardSecrecy: false
    api.discogs.com:
      NSIncludesSubdomains: true
      NSExceptionRequiresForwardSecrecy: false
    img.discogs.com:
      NSIncludesSubdomains: true
      NSExceptionRequiresForwardSecrecy: false
```

---

#### 5. `SESSION_SECRET` missing from `.env.example`

Mobile Bearer token signing will silently fail if this is unset (Node.js `process.env.SESSION_SECRET!` will be `undefined`, causing `createHmac` to throw or produce garbage).

**Fix:** Add to `.env.example`:
```
# Required for mobile Bearer token signing (generate: openssl rand -hex 32)
SESSION_SECRET=
```
And verify it's set in Vercel environment variables.

---

#### 6. `SESSION_SECRET` missing from Vercel env vars

Double-check the Vercel project dashboard. If `SESSION_SECRET` is not set in production, all iOS logins will fail.

---

### Non-Blocking but Recommended

#### 7. Turso URL hardcoded in `src/lib/db.ts`

Move to `TURSO_URL` env var for better operational flexibility.

#### 8. Bearer tokens never expire

The signed token has an `iat` field but no `exp`. A compromised token is valid forever until `SESSION_SECRET` is rotated. Add an `exp` claim (e.g., 90 days) and handle `401` responses in the WebView JS by re-initiating OAuth.

#### 9. PATCH `/api/plays` `last_played` is inaccurate

When overwriting a count via PATCH, the response returns `new Date().toISOString()` (server time), but no real `played_at` rows are inserted with accurate timestamps — they all get `CURRENT_TIMESTAMP` at insert time (same moment). This is fine for UX, but worth noting.

#### 10. iPad-only, but orientation is unrestricted

`TARGETED_DEVICE_FAMILY: "2"` means iPad-only. All four orientations are supported. No issues here, just confirm the web app layout looks correct in portrait on smaller iPads (iPad mini).

---

### Pre-Release Checklist

- [ ] Change `serverURL` in `ContentView.swift` to `https://needle-drop.com`
- [ ] Register `needledrop://` URL scheme in `project.yml`
- [ ] Add `.onOpenURL` handler in `NeedleDropApp.swift` to capture OAuth token
- [ ] Implement JS bridge to pass token from native → WebView
- [ ] Remove `NSAllowsArbitraryLoads: true`; add domain-specific exceptions
- [ ] Add `SESSION_SECRET` to `.env.example`
- [ ] Verify `SESSION_SECRET` is set in Vercel production env vars
- [ ] Verify Discogs OAuth app callback URL is set to `https://needle-drop.com/api/auth/discogs/callback`
- [ ] Set `CFBundleShortVersionString` and `CFBundleVersion` to release values in `project.yml`
- [ ] Test full OAuth flow on a physical iPad (device, not simulator) against production URL
- [ ] Test sync, play count increment, and play count edit end-to-end on iPad
- [ ] Run `xcodebuild archive` and validate the IPA in TestFlight before submitting
