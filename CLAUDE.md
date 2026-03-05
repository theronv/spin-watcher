# NeedleDrop — Claude Brain File

Personal vinyl collection tracker with Discogs sync and play-count logging.
Web app (Next.js on Vercel) + iPad companion app (SwiftUI WebView shell).

**Live:** https://needle-drop.com
**Repo dir:** `/Users/theron/spin-watcher`
**iOS project:** `ios/` — build with `xcodegen generate` then `xcodebuild`

---

## Stack at a Glance

| Layer | Tech |
|---|---|
| Framework | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS v4, inline styles (no CSS modules) |
| Database | Turso / libSQL (cloud SQLite) via `@libsql/client` |
| Auth | Discogs OAuth 1.0a (HMAC-SHA1) via `oauth-1.0a` |
| Images | Sharp — server-side proxy resize at `/api/image` |
| Grid | `react-window` FixedSizeList (virtualized) |
| Icons | `lucide-react` |
| iOS | SwiftUI + WKWebView, iOS 17+, iPad-only |
| iOS build | XcodeGen (`ios/project.yml`) |
| Deploy | Vercel (auto on `main` push) |

---

## Critical Architecture Decisions

### 1. Single-file SPA
`src/app/page.tsx` (~1,700 lines) is intentionally one file. All browse, now-playing, state, and data fetching live here. **Do not split into multiple components without a strong reason** — the coupling is deliberate for a small app.

### 2. Play counts as event rows, not a counter column
`plays` table stores one row per play event. Counts are `COUNT(*)`, last played is `MAX(played_at)`. This is intentional — preserves history and gives accurate timestamps. Don't refactor to a counter column.

### 3. Multi-tenant by `username` column
Every SQL query must filter `WHERE username = ?`. The username comes from the session. **Never write a query without this filter** — it would leak data across users.

### 4. Image proxy is mandatory
Discogs CDN blocks cross-origin requests. All album art must go through `/api/image?url=<discogs-url>&size=<px>`. Never reference Discogs image URLs directly in `<img src>`.

### 5. `apiFetch` instead of `fetch` for all API calls
All API calls in `page.tsx` go through the `apiFetch()` helper (defined just above `parseRecords`). It automatically injects `Authorization: Bearer <token>` from `localStorage` key `nd_bearer_token` for the iOS WebView flow. **Always use `apiFetch`, never raw `fetch`, for `/api/` calls.**

### 6. iOS is a WebView shell — no native networking
The iOS app loads `https://needle-drop.com` in a WKWebView. There is no native API layer. Auth tokens flow via: Discogs OAuth → `needledrop://?token=X` deep link → Swift `onOpenURL` → WebView navigates to `/?nd_token=X` → page.tsx reads `?nd_token=`, stores in localStorage, strips URL.

### 7. DB URL is hardcoded
`src/lib/db.ts` has `libsql://spin-watcher-theronv.aws-us-west-2.turso.io` hardcoded. `TURSO_AUTH_TOKEN` is the only env var needed for DB. This is a known tech debt item.

---

## Environment Variables

| Variable | Required | Notes |
|---|---|---|
| `DISCOGS_CONSUMER_KEY` | Yes | From discogs.com/settings/developers |
| `DISCOGS_CONSUMER_SECRET` | Yes | |
| `TURSO_AUTH_TOKEN` | Yes | Turso DB auth |
| `SESSION_SECRET` | Yes | HMAC-SHA256 key for mobile Bearer tokens. Generate: `openssl rand -hex 32` |
| `DISCOGS_TOKEN` | No | Personal token fallback for demo/single-user mode |
| `DISCOGS_USER` | No | Username for demo mode |

All must be set in Vercel project settings for production. `.env.local` for local dev.

---

## File Map

```
src/
  app/
    page.tsx                    — entire SPA (~1,450 lines)
    layout.tsx                  — fonts (Playfair Display, Space Mono), metadata
    globals.css                 — CSS variables, keyframes, utility classes
    api/
      auth/
        discogs/route.ts        — OAuth initiation (request token + redirect)
        discogs/callback/route.ts — token exchange, session cookie or mobile Bearer
        session/route.ts        — auth check (Bearer → cookie → env fallback)
        logout/route.ts         — clear cookie
      records/route.ts          — GET collection from DB
      sync/route.ts             — fetch Discogs, upsert DB
      plays/route.ts            — GET / POST / PATCH play counts
      album/[id]/route.ts       — release details + tracklist from Discogs
      image/route.ts            — image proxy + Sharp resize
      init/route.ts             — create/migrate DB tables (idempotent)
  lib/
    db.ts                       — Turso client + toRows() helper
    session.ts                  — createMobileToken, verifyMobileToken, getSession
  components/
    GridErrorBoundary.tsx       — catches react-window render errors

ios/
  project.yml                   — XcodeGen config (bundle ID, signing, URL scheme, ATS)
  Sources/App/
    NeedleDropApp.swift         — @main, onOpenURL deep-link handler
    ContentView.swift           — WKWebView wrapper, token delivery via ?nd_token=
```

---

## Design System Tokens

### Colors (CSS variables in `globals.css`, also used inline)

| Token | Value | Usage |
|---|---|---|
| `--background` / `#0c0a07` | Near-black | Page background, WebView background |
| `--foreground` / `#f5f0e8` | Warm off-white | Primary text |
| `--gold` / `#C9A84C` | Gold | CTAs, now-playing accents, waveform bars |
| `--gold-dim` / `#7a6228` | Dim gold | Secondary gold use |
| `--gold-glow` / `rgba(201,168,76,0.15)` | Gold glow | Hover shadows |
| `--surface` / `rgba(18,14,9,0.92)` | Dark surface | Overlays, panels |
| `#9a8055` | Warm tan | Artist names, year/label text |
| `#8a7050` | Muted gold-brown | Secondary labels (PLAYS, EDIT, style pills) |
| `#7a6240` | Dim brown | Tertiary UI (search icon, track positions, runtime, sync icons) |
| `#6a5530` | Very dim | Placeholder text ("TAP A RECORD TO BEGIN") |
| `rgba(255,255,255,0.06)` | — | Default card border |

### Typography

| Variable | Font | Usage |
|---|---|---|
| `var(--font-playfair)` | Playfair Display (400, 700, 900) | Headings, app name |
| `var(--font-mono)` | Space Mono (400, 700) | UI labels, metadata, all body text |

**Rule:** UI text is almost always Space Mono. Playfair is only for the NeedleDrop wordmark and major headings.

### Spacing / Layout Constants (defined in `page.tsx`)

```typescript
const HGAP          = 10;   // horizontal gap between grid cards
const PAD           = 14;   // grid horizontal padding
const TEXT_HEIGHT   = 64;   // card text area height (title + artist + genre)
const NP_BAR_HEIGHT = 82;   // now-playing persistent bar height (subtracted from grid)
```

### Grid Layout Strategy

Grid dimensions are measured via `ResizeObserver` on the grid container (`containerDims`), not CSS media queries — required for `react-window`.

**Portrait** (width-driven):
- Columns: 2 (`< 600px`), 3 (`600–1199px`), 4 (`≥ 1200px`)
- `cardWidth` = `(containerWidth - PAD*2 - HGAP*(cols-1)) / cols`
- `artHeight = cardWidth` (square art)

**Landscape** (`containerWidth > containerHeight * 1.1`, height-driven):
- `targetRows` = 1 (small screens, height < 320px) or 2 (iPad)
- `artHeight` = `(listHeight - HGAP*(rows-1)) / rows - TEXT_HEIGHT`
- `colCount` = how many square cards fit across
- Rows are center-justified (`justifyContent: "center"`)

This ensures art is never cropped and fills the visible space proportionally.

### Animation Constants

```typescript
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
const WAVE_DURATIONS = [0.7, 0.5, 0.9, 0.6, 0.8, 0.55, 0.75, 0.95, 0.6, 0.85, 0.7, 0.5, 0.9, 0.65, 0.8, 0.55];
```

Key keyframes in `globals.css`:
- `card-enter` — 0.2s staggered entrance (15ms per card, max 250ms)
- `vinyl-spin` — keyframe definition only (the CSS `.vinyl-spin` class is NOT used on the Now Playing disc — RAF drives it directly)
- `pulse-dot` — 1.4s now-playing dot pulse
- `waveform-bar` — 0.85s base, per-bar durations from `WAVE_DURATIONS`
- `skeleton-pulse` — 1.6s loading skeleton
- Film-grain overlay on `body::after` (SVG noise, opacity 0.038, z-index 9999)

### Special CSS Classes (globals.css)
- `.scrollbar-hide` — hide scrollbars cross-browser
- `.pt-safe` / `.pb-safe` — `env(safe-area-inset-*)` aware padding
- `.vinyl-disc` — size-only class for the Now Playing disc; orientation media queries set `clamp()` sizes (portrait: 160–260px, landscape: 200–460px)
- `.vinyl-spin` — CSS animation class (not used on NP disc; exists for potential other uses)
- `.now-playing-dot` — pulsing indicator
- `.album-card` — hover triggers child `.album-art-wrap` gold glow + `.album-art-img` scale(1.06)
- `.album-hover-play` — play icon overlay, visible on hover
- `.wave-bar` — individual waveform bar
- `.skeleton-card > div` — skeleton loading pulse

---

## State Management Pattern

All state lives in the `Home()` component in `page.tsx`. No external store (no Redux, no Zustand).

### Render Phases (controlled by state combos)

```
authChecked=false                     → null (blank, prevents flash)
authChecked=true, session=null        → Login screen
authChecked=true, session set,
  loading=true                        → Skeleton grid
authChecked=true, session set,
  loading=false, mode="browse"        → Browse grid
authChecked=true, session set,
  loading=false, mode="now-playing"   → Now Playing panel
```

### Key State Dependencies

- `records` is the source of truth for the collection; `plays` is a separate lookup map keyed by `discogs_id`
- `displayed` is a `useMemo` over `records` applying `filter`, `selectedGenres`, and `sort` — **never mutate `records` for filtering**
- `editingId` being set prevents card click-through (check `isEditing` before calling `onOpen`)
- `viewingRecord` holds the record open in now-playing; `nowPlayingId` holds the *actively spinning* record — these can differ (you can view details without "playing")
- `albumDetails` is fetched lazily when `mode === "now-playing"` and `viewingRecord` changes
- `isScratching` is React state (drives visual gold glow); actual scratch logic uses refs only (`isScratchingRef`, `vinylRotRef`) for performance — no re-renders during drag

### Now Playing — Responsive Layout

Both sub-panels (detail view and playing view) use `className="flex flex-col md:flex-row"` for portrait/landscape switching at the 768px Tailwind `md:` breakpoint.

**Detail view** (`!isPlaying`):
- Left column (`md:w-[44%]`): album art + title + artist + play count + genre pills + Mark as Playing button (portrait only)
- Right column (`flex: 1`): Mark as Playing button (landscape only, `hidden md:flex`) + scrollable tracklist
- Both columns vertically centered via `justify-center` (left) and flex spacers `hidden md:block` (right)

**Playing view** (`isPlaying`):
- Left column (`md:w-1/2 md:h-full`): spinning vinyl disc (scratch-enabled)
- Right column (`flex: 1`): NOW PLAYING label + waveform + title + artist + play count pill

**Critical:** Never add `flexDirection` or `display` to the outer container's inline `style` — it overrides Tailwind's `md:flex-row` class. Layout direction must be Tailwind-only.

### Vinyl Scratch Feature

The Now Playing disc uses `requestAnimationFrame` (not CSS animation) for rotation, enabling real-time scratch control.

**Refs:**
```typescript
vinylRef        // HTMLDivElement — RAF writes transform directly
vinylRotRef     // current rotation in degrees
rafRef          // animation frame ID
lastFrameRef    // timestamp of previous frame
isScratchingRef // true while pointer held (ref, not state — no re-renders)
lastPtrAngleRef // angle of last pointer event (for delta calculation)
audioCtxRef     // Web Audio AudioContext (created once on first scratch)
scratchGainRef  // GainNode — volume driven by angular velocity
scratchBpRef    // BiquadFilterNode — bandpass; frequency shifts by direction
```

**RAF loop** (effect on `isPlaying`): auto-increments `vinylRotRef` at `360°/4000ms`; skips increment when `isScratchingRef.current` is true. Writes directly to `vinylRef.current.style.transform`.

**Scratch mechanics:** `setPointerCapture` keeps drag active outside the element. Delta angle handles ±180° wrap. Volume = `min(0.3, |delta| * 0.18)`. Filter frequency: 1800 Hz forward / 900 Hz backward.

**Audio init:** deferred to first `pointerdown` (browsers require user gesture before creating AudioContext). AudioContext is never closed — reused across all scratches.

### Data Flow on Mount

```
1. Check ?nd_token= in URL → store in localStorage as 'nd_bearer_token' → strip URL
2. apiFetch /api/auth/session
3. If logged in:
   a. apiFetch /api/init
   b. apiFetch /api/records
   c. Check localStorage 'last_sync_at_{username}'
      - if stale (>24h) or empty → apiFetch /api/sync (upserts DB, returns updated records)
   d. apiFetch /api/plays → build plays map
```

---

## API Patterns & Gotchas

### Auth — Session Resolution Order
`getSession(request)` in `src/lib/session.ts` checks in order:
1. `Authorization: Bearer <token>` header (mobile)
2. `discogs_session` httpOnly cookie (web)
3. Returns null (fallback to env var happens in individual routes, not in getSession)

**Gotcha:** Demo mode (`DISCOGS_TOKEN` + `DISCOGS_USER`) is only checked in `session/route.ts` and `sync/route.ts`, NOT in `getSession()`. Other protected routes will return 401 in demo mode unless the env token is used differently.

### Sync — Don't Drop Play Data
`/api/sync` uses `ON CONFLICT(username, discogs_id) DO UPDATE SET ...` — it only updates metadata columns, never touches `plays`. The play history is preserved across all syncs.

### Plays — PATCH Uses Recursive CTE
PATCH `/api/plays` deletes all existing play rows then re-inserts N rows using:
```sql
WITH RECURSIVE counter(i) AS (
  SELECT 1 UNION ALL SELECT i + 1 FROM counter WHERE i < ?
)
INSERT INTO plays (username, discogs_id) SELECT ?, ? FROM counter
```
The `last_played` in the PATCH response is `new Date().toISOString()` (server time at insert), not a real timestamp. All inserted rows get `CURRENT_TIMESTAMP` at the same moment.

### Image Proxy — Sharp on Vercel
`/api/image` uses Sharp which requires native binaries. This works on Vercel (Linux x64) but **will not work on Vercel Edge Runtime** — the route must remain on Node.js runtime (default, no `export const runtime = 'edge'`).

### Album Details — Requires `DISCOGS_TOKEN`
`/api/album/[id]` uses the personal `DISCOGS_TOKEN` env var, not the user's OAuth token. If `DISCOGS_TOKEN` is not set, it returns `400`. This is a separate credential from `DISCOGS_CONSUMER_KEY/SECRET`.

### `toRows()` Helper
`src/lib/db.ts` exports `toRows(ResultSet)` which converts Turso's column-array format to plain JS objects. Always use this — never access `result.rows[n][i]` directly.

### `DISCOGS_USER` Env Var Sanitization
`sync/route.ts` and `session/route.ts` strip curly quotes from `DISCOGS_USER`:
```typescript
.replace(/[\u201C\u201D"]/g, '').trim()
```
This was added because copy-pasting the username from certain sources added smart quotes.

---

## iOS App Details

### Bundle ID
`com.theron.needledrop`

### Signing
- Team: `4E2Y3L2X79` (Theron Vickery — paid Apple Developer Program)
- Style: Automatic
- Signing cert: `Apple Development: Theron Vickery (N4QA64M2NU)` (in Keychain)

### Build Commands
```bash
cd ios
xcodegen generate          # regenerate xcodeproj after editing project.yml
xcodebuild \
  -project NeedleDrop.xcodeproj \
  -scheme NeedleDrop \
  -destination 'generic/platform=iOS' \
  -configuration Release \
  CODE_SIGN_STYLE=Automatic \
  DEVELOPMENT_TEAM=4E2Y3L2X79 \
  -allowProvisioningUpdates \
  -archivePath /tmp/NeedleDrop.xcarchive \
  clean archive
```
Then open Xcode Organizer → Distribute App → TestFlight & App Store Connect.

### OAuth Token Flow (Mobile)
```
1. Web app detects WKWebView via window.webkit
2. Login href → /api/auth/discogs?redirect_uri=needledrop%3A%2F%2F
3. Server stores redirect URI in cookie, proceeds with Discogs OAuth
4. Callback: detects needledrop:// cookie → creates signed Bearer token
5. Redirects to needledrop://?token=<signed-token>
6. WKWebView can't load needledrop:// → triggers onOpenURL in NeedleDropApp.swift
7. Swift extracts token, sets pendingToken state
8. ContentView.updateUIView fires → webView.load(URL("https://needle-drop.com/?nd_token=<token>"))
9. page.tsx mount: reads ?nd_token=, stores as localStorage 'nd_bearer_token', strips URL
10. apiFetch adds Authorization: Bearer header to all subsequent API calls
```

### ATS (App Transport Security)
No `NSAllowsArbitraryLoads`. Domain exceptions are set for:
- `needle-drop.com` (HTTPS only)
- `api.discogs.com` (HTTPS)
- `img.discogs.com` (HTTPS)
- `i.discogs.com` (HTTPS)

### project.yml Gotcha
After editing `project.yml`, always run `xcodegen generate` — the `.xcodeproj` is generated and should not be hand-edited.

---

## Deploy Checklist

### Web (Vercel)
- [ ] All 4 env vars set in Vercel dashboard: `DISCOGS_CONSUMER_KEY`, `DISCOGS_CONSUMER_SECRET`, `TURSO_AUTH_TOKEN`, `SESSION_SECRET`
- [ ] `DISCOGS_TOKEN` set (needed for `/api/album/[id]`)
- [ ] Discogs app callback URL = `https://needle-drop.com/api/auth/discogs/callback`
- [ ] Push to `main` → Vercel auto-deploys

### iOS (TestFlight / App Store)
- [ ] `serverURL` in `ContentView.swift` = `https://needle-drop.com` (not a local IP)
- [ ] `SESSION_SECRET` set in Vercel (mobile auth fails silently without it)
- [ ] `CFBundleVersion` bumped in `project.yml` (App Store Connect rejects duplicate build numbers)
- [ ] `xcodegen generate` run after any `project.yml` changes
- [ ] Archive succeeds with no errors (`xcodebuild ... archive`)
- [ ] Distribute via Xcode Organizer → TestFlight & App Store Connect → Automatic signing
- [ ] Test OAuth on physical iPad (not simulator): login → sync → play count → logout

---

## Known Gotchas

1. **`window.webkit` detection for WebView** — the login button in `page.tsx` checks `!!(window as {webkit?:unknown}).webkit` to decide whether to add `redirect_uri=needledrop://`. This is evaluated at render time (client-only, `"use client"` file). No SSR issue.

2. **`react-window` and `loading` state** — the `ResizeObserver` `useEffect` depends on `[loading]` to re-run after the grid div mounts. If you change the loading flow, ensure the grid container ref is in the DOM before the ResizeObserver attaches.

3. **`authChecked` prevents flash** — the component renders `null` until `authChecked=true`. This prevents a brief login-screen flash on page load for logged-in users.

4. **`genres` and `styles` are JSON strings in DB** — stored as `TEXT` (e.g., `'["Rock","Electronic"]'`). `parseRecords()` in `page.tsx` calls `JSON.parse()` on them. Always stringify before insert, parse after read.

5. **Album details are not in the DB** — tracklist, runtime, and detailed metadata are fetched live from Discogs on demand in `/api/album/[id]`, cached 7 days by Next.js (`next: { revalidate: 604800 }`). They are not stored in Turso.

6. **Sync is additive only** — records deleted from a Discogs collection are NOT removed from the NeedleDrop DB on sync. The sync only upserts. Manual cleanup requires direct DB access.

7. **Card animation delay cap** — stagger delay is `Math.min(globalIndex * 0.015, 0.25)`. This caps at 250ms so cards at the bottom of a large collection don't animate in too late.

8. **Image proxy returns 500 on invalid URLs** — the `/api/image` route catches all errors and returns `500 "Error processing image"`. This is expected when an image URL is expired or invalid; the frontend falls back to `VinylPlaceholder`.

9. **`PATCH /api/plays` last_played inaccuracy** — the response timestamp is `new Date().toISOString()` at the moment of the API call, but all inserted play rows share the same `CURRENT_TIMESTAMP`. Not a bug, just a known approximation.

10. **SourceKit errors in Swift files** — the editor shows UIKit/WKWebView errors when viewing `.swift` files outside Xcode. These are editor-only artifacts; the code compiles correctly with `xcodebuild`.

11. **Discogs OAuth uses `sameSite: 'lax'`** — the session cookie uses `lax` (not `strict`) because the OAuth callback is a cross-origin redirect. `strict` would drop the cookie on the Discogs → NeedleDrop redirect.

12. **`init/route.ts` runs on every load** — it's called immediately after auth on every page mount. It's idempotent (uses `IF NOT EXISTS` and tries column adds safely), so this is fine, but it does add a round-trip to every cold start.

13. **RAF vinyl vs CSS animation** — the Now Playing disc uses a `requestAnimationFrame` loop that writes `style.transform` directly, not the `vinyl-spin` CSS animation. The `@keyframes vinyl-spin` definition and `.vinyl-spin` CSS class still exist in `globals.css` but are not applied to the disc. Do not re-add `animation: "vinyl-spin..."` to the vinyl div style — it would fight with the RAF loop.

14. **Inline style vs Tailwind breakpoint classes** — inline `style={{ flexDirection }}` or `style={{ display }}` always wins over Tailwind `md:flex-row` / `hidden md:flex` because inline styles have higher CSS specificity. All responsive flex direction must live in `className`, never in `style`.

15. **`viewport-fit=cover` required for safe area insets** — `layout.tsx` exports a `Viewport` with `viewportFit: "cover"`. Without this, `env(safe-area-inset-top)` returns `0` inside WKWebView when `.ignoresSafeArea()` is used in Swift, causing the header to overlap the iOS status bar.
