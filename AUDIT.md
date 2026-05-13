## Richard's Stage 3 Review — 2026-05-13

---

### SECTION 1 — DEAD CODE AUDIT

#### Unused Imports
None. Every import in every file is consumed. Clean sweep.

#### Unused Components
None. All components defined in each file are rendered within that file.
Note: `VinylPlaceholder` is independently defined in both `src/app/page.tsx` and
`src/app/record/[id]/page.tsx` (slightly different circle counts). Not unused, but duplicated.
Flagged in Section 5.

#### Unused Functions

| File | Function | Evidence of death |
|------|----------|-------------------|
| `src/lib/api.ts:85–87` | `api.logout()` | Never called. Logout in `page.tsx` uses `window.location.href = '/api/auth/logout'` directly (line 554). |
| `src/app/api/album/[id]/route.ts:3–16` | `parseDuration()`, `formatRuntime()` | Both exist solely to compute `runtime: formatRuntime(totalSeconds)` on line 63 of the route response. `getRecord()` in `api.ts` destructures the album API response but does not read `runtime`. The `AlbumRecord` interface has no `runtime` field. The computation runs and the value is returned in JSON — then silently discarded on every album detail request. |

#### Commented-out Code Blocks
None found anywhere in the codebase.

#### Console Statements
Two `console.error` calls exist server-side:
- `src/app/api/auth/discogs/route.ts:64` — `console.error('Discogs request_token failed:', res.status, body)`
- `src/app/api/auth/discogs/callback/route.ts:78` — `console.error('Discogs access_token failed:', accessRes.status)`

Both are server-side (Vercel logs), triggered only on OAuth failure. These are legitimate diagnostic
logs, not debug spam. No action required.

---

### SECTION 2 — FINAL TYPE SAFETY PASS

#### New `any` types
No explicit `any` annotations introduced.

#### `@ts-ignore` / `@ts-expect-error`
None found anywhere.

#### Type Assertions Without Runtime Validation

Multiple unvalidated casts sit at the Discogs API boundary:

| File | Line(s) | Cast | Risk |
|------|---------|------|------|
| `src/app/api/sync/route.ts` | 65–67 | `data.releases as Record<string, unknown>[]`, `data.pagination as { pages: number }` | `response.json()` is untyped. If Discogs changes shape, `totalPages` is `undefined` → infinite loop or NaN. |
| `src/app/api/sync/route.ts` | 72–76 | `item.basic_information as Record<string, unknown>`, `info.artists as Array<{name:string}>`, etc. | Silently produce empty strings / nulls on schema change; no crash, but records corrupt silently. |
| `src/app/api/album/[id]/route.ts` | 43, 53–58 | `data.tracklist as Array<Record<string,unknown>>`, `data.labels as Array<{name:string}>`, `data.year as number`, `data.genres as string[]` | Same boundary, same risk. |
| `src/context/NowPlayingContext.tsx` | 41 | `JSON.parse(raw) as Array<Omit<AlbumRecord,'playCount'>>` | localStorage can be corrupted or hand-edited. Cast gives no type narrowing at runtime; a malformed queue silently produces `AlbumRecord` objects with missing fields. |

The localStorage cast is the only one that hits client-side. The queue is consumed
by NowPlayingBar and queue/page — a malformed entry won't crash but will render
blank title/artist. The Discogs casts are all server-side; a Discogs API change
produces silent data corruption, not a 500.

All are flagged in Section 5 (post-launch) because adding Zod or manual guards
here is not a trivial pre-ship change.

---

### SECTION 3 — FINAL RN MIGRATION BLOCKER PASS

*(No Stage 2 review exists in context; this section documents the current state.)*

#### iOS WebView Auth — Status: BEHAVIOR CHANGED, WORKING

The `CLAUDE.md` documents an iOS auth flow via `needledrop://` deep links and `nd_token` URL
param. **That flow no longer exists in the current web app.**

The new `handleLogin()` in `page.tsx` calls `fetch('/api/auth/discogs')` with no
`redirect_uri`, so the server takes the web-cookie path in the callback. The WKWebView
receives the `discogs_session` cookie and subsequent API calls are cookie-authenticated.
This is correct and functional — WKWebView persists cookies across app restarts.

Consequence: The Swift code in `NeedleDropApp.swift` (`onOpenURL` / `pendingToken`) and
the token-delivery block in `ContentView.swift:updateUIView` are now dead.
The `nd_token` URL param processing no longer exists in the web app and can never be
triggered through the current auth initiation flow. Flagged in Section 5.

#### Active RN Migration Blockers (if a React Native port were planned)

| Blocker | File | Mitigation needed |
|---------|------|-------------------|
| `localStorage` for queue persistence | `NowPlayingContext.tsx:29–45` | Replace with AsyncStorage |
| `window.location.href` redirect for logout | `page.tsx:554` | Replace with navigation |
| `requestAnimationFrame` + direct DOM mutation for vinyl spin | `now-playing/page.tsx:35–59` | Replace with Animated API |
| CSS keyframe animations (waveform, card-enter, skeleton) | `globals.css`, JSX inline styles | Replace with Animated / Reanimated |
| `backdropFilter: blur()` | multiple files | Not supported in RN; remove or approximate |
| `useRouter` / Next.js navigation | all pages | Replace with React Navigation |

These are architectural, not bugs. Listed for completeness; not blocking current web/iOS ship.

---

### SECTION 4 — SAFE CLEANUP LIST

Items that can be removed with zero behavior change:

**1. Dead function: `api.logout()`**
- File: `src/lib/api.ts`, lines 85–87
- Remove the entire `logout()` method. No caller exists.
- `clearCache()` used by `sync()` is unaffected (different method).

**2. Dead computation: `parseDuration`, `formatRuntime`, `runtime` response field**
- File: `src/app/api/album/[id]/route.ts`, lines 3–16, 51, 57, 63
- Remove both helper functions and the `runtime` field from the return object.
- `getRecord()` in `api.ts` destructures the response with a known type and never
  reads `runtime`. `AlbumRecord` has no `runtime` field. The only consumer of this
  route ignores the field.

**3. Dead context state: `isLoggingPlay`**
- File: `src/context/NowPlayingContext.tsx`, lines 13, 52, 81–82, 90–91, 153
- Zero components destructure `isLoggingPlay` from `useNowPlaying()`.
- It causes two extra re-renders per play (setIsLoggingPlay(true) on start, false on
  finish). Remove the state, remove it from the interface, remove it from the value.

**4. Trivial no-op wrapper: `handleNext`**
- File: `src/app/now-playing/page.tsx`, lines 70–72
- `const handleNext = () => { playNext(); }` — one-line passthrough with no guard or
  side effect. Replace `onClick={handleNext}` with `onClick={playNext}` directly and
  delete the function.

**Summary:** 4 safe cleanup items. All are removals with no observable behavior change.

---

### SECTION 5 — FLAG-FOR-POST-LAUNCH LIST

**1. iOS dead code in Swift**
- Files: `ios/Sources/App/NeedleDropApp.swift:12–23`, `ios/Sources/App/ContentView.swift:37–45`
- What: `onOpenURL` deep-link handler and `updateUIView` token-delivery block.
- Why risky now: Removing them requires an Xcode build + TestFlight submission cycle.
  The dead code is inert — it's unreachable because no current auth path produces a
  `needledrop://` callback. Removing it now would delay ship.
- When: Next iOS release after confirming the cookie auth path is stable in production.

**2. Unvalidated Discogs API response casts**
- Files: `sync/route.ts:65–76`, `album/[id]/route.ts:43,53–58`
- What: `response.json() as ...` casts with no shape validation.
- Why risky now: Adding Zod or manual guard code changes route behavior (new error
  paths). Any typo introduces a regression. Discogs hasn't changed their API; this
  is a latent risk, not an active failure.
- When: Add a Zod schema for the Discogs collection and release API responses in a
  dedicated PR after ship.

**3. `playNext` duplicates `playRecord` logic**
- File: `src/context/NowPlayingContext.tsx:127–144`
- What: `playNext` inlines the optimistic-increment + `api.logPlay` + rollback pattern
  instead of calling `playRecord`. If `playRecord` gains new behavior (analytics, rate
  limiting, etc.), `playNext` silently diverges.
- Why risky now: Refactoring requires careful state sequencing (the queue pop has to
  happen before the play is logged). Changing this pre-ship is a behavior-risk.
- When: Refactor `playRecord` to accept an optional "already dequeued" flag so
  `playNext` can delegate to it cleanly.

**4. Duplicate `VinylPlaceholder` definitions**
- Files: `src/app/page.tsx:18–33`, `src/app/record/[id]/page.tsx:8–18`
- What: Near-identical SVG components defined twice. The record-detail version
  omits the middle `r=8` circle (3 rings vs 4). May be intentional; may be a
  copy-paste that drifted.
- Why risky now: Consolidating into a shared component is safe but requires deciding
  which variant is canonical. Not worth the file churn pre-ship.
- When: Extract to `src/components/VinylPlaceholder.tsx` post-launch.

**5. `_cachedPlays` coherence asymmetry**
- File: `src/lib/api.ts`
- What: `getRecords()` and `getRecord()` use `_cachedPlays` for play count display.
  `getPlays()` (called by `fetchPlayCounts` in NowPlayingContext) bypasses the cache
  entirely. After logging a play, calling `getRecords()` again returns stale play
  counts from the cache. In practice this doesn't surface visually because `playCounts`
  in the context (sourced from `getPlays()`) overrides `record.playCount` in the
  collection grid (`playCounts[record.id] ?? record.playCount`). But it's a logic trap
  for anyone reading the code.
- Why risky now: Fixing it requires deciding whether to invalidate the plays cache on
  `logPlay` or remove plays from the record-level cache entirely. Either path is a
  multi-point change.
- When: Address as part of any future caching rework.

**6. `createMobileToken` naming**
- File: `src/lib/session.ts`
- What: `createMobileToken` and `verifyMobileToken` are used for both the web cookie
  (`discogs_session`) and the iOS Bearer token. The "mobile" name is misleading — they
  are now the sole session token mechanism for all clients.
- Why risky now: A rename with no logic change is safe, but it touches the session lib
  and both auth routes. Zero upside before ship.
- When: Rename to `createSessionToken` / `verifySessionToken` in a dedicated cleanup PR.

---

### SECTION 6 — RICHARD'S VERDICT

The codebase is clean enough to ship. Dead code is minor and inert — one unused function,
one unused computation, one unused context state field, one trivial wrapper function.
No commented-out blocks, no `@ts-ignore`, no `any` sprawl in client code. The iOS auth
works; it just works differently than the documentation describes (cookies, not Bearer
tokens) which will confuse the next person who reads `CLAUDE.md`. The thing Richard is
most uncomfortable leaving in is `playNext` being a hand-rolled duplicate of `playRecord`'s
play-logging logic — it's the kind of code that looks fine until you add one line to
`playRecord` and then spend an afternoon debugging why the queue behaves differently from
a direct play. But it's not a ship blocker. Ship it.

---

*Safe cleanup items: 4 | Flag-for-post-launch: 6 | Verdict: SHIP*

---

## Gilfoyle's Stage 3 Full Security Audit — 2026-05-13

---

### SECTION 1 — THREAT MODEL

**What the app does and what data it holds:**
NeedleDrop is a multi-user personal vinyl collection tracker. It authenticates via Discogs OAuth 1.0a, stores per-user play history in a cloud SQLite database (Turso), and proxies Discogs album art through a Sharp-based image resizer. Session state is held in a custom HMAC-SHA256 signed token stored either as an httpOnly cookie (web) or a localStorage Bearer token (iOS WKWebView). The database holds usernames, Discogs OAuth access tokens (which grant read/write access to the user's Discogs account), and play counts. The signing key (`SESSION_SECRET`) is the root of trust for all sessions.

**Top 3 attack surfaces:**

1. **Image proxy (`/api/image`)** — Unauthenticated, accepts any URL, makes server-side HTTP requests. Classic SSRF. On Vercel/AWS infrastructure this can reach cloud metadata endpoints.
2. **Session token signing** — A single HMAC key (`SESSION_SECRET`) is the root of trust for all sessions on all clients. No token expiry, no revocation. Compromise of the key or the token = permanent account takeover.
3. **Auth endpoints (`/api/auth/discogs`, `/api/init`)** — No rate limiting, no auth guard on init. OAuth initiation makes real outbound calls to Discogs; spamming it can exhaust the consumer key's rate quota.

---

### SECTION 2 — SECRETS & CONFIGURATION

**Finding S-1 — Production credentials in `.env.local`**
File: `.env.local`
The local development file contains real, live production credentials: Discogs consumer key/secret, the Turso auth JWT (a signed credential granting database write access), and the `SESSION_SECRET` used to sign all session tokens. These are the same credentials deployed on Vercel — there is no dev/prod environment separation. The file is correctly gitignored (`.env*` pattern in `.gitignore`), so no credentials are in version history. However, because `db.ts` hardcodes the production Turso URL (`libsql://spin-watcher-theronv.aws-us-west-2.turso.io`), local `npm run dev` connects directly to the production database. Any local testing runs against live user data.
Severity: MEDIUM (credentials not in repo; risk is developer machine compromise or accidental local DB mutation)
Remediation: Create a separate Turso database for development. Move the DB URL to an env var (`TURSO_DB_URL`). Use separate Discogs consumer credentials for dev.

**Finding S-2 — Hardcoded production database URL**
File: `src/lib/db.ts:4`
The Turso database URL is a compile-time constant. There is no mechanism to point the application at a different database without a code change. Dev = prod.
Severity: LOW (described as known tech debt; no secret is hardcoded, only the URL)
Remediation: `url: process.env.TURSO_DB_URL!`

**Finding S-3 — `SESSION_SECRET` not validated at startup**
File: `src/lib/session.ts`
`process.env.SESSION_SECRET!` is accessed with a non-null assertion but never validated. If the variable is missing, `createHmac('sha256', undefined!)` will silently produce a predictable HMAC keyed on the string `"undefined"`. All sessions signed under a missing secret will have identical, forgeable signatures.
Severity: HIGH
Remediation: Add a startup check: `if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET not configured')`

**Finding S-4 — Two conflicting Next.js config files**
Files: `next.config.js`, `next.config.ts`
Both files exist with slightly different content (`next.config.js` includes `swcMinify: false` and a comment; `next.config.ts` does not). Next.js will load one and silently ignore the other. The active config and the intended config may diverge silently.
Severity: LOW
Remediation: Delete `next.config.js`; keep `next.config.ts`.

---

### SECTION 3 — AUTHENTICATION & AUTHORIZATION

**Token structure:**
All sessions — web cookie and iOS Bearer — use the same token format: `base64url(payload).base64url(HMAC-SHA256)`. The payload contains username, Discogs OAuth tokens, avatar URL, and `iat`. The cookie sets `maxAge: 30 days`; the token itself has no `exp` claim.

**Finding A-1 — Bearer tokens never expire**
File: `src/lib/session.ts:38–53`
`verifyMobileToken` reads `iat` from the payload but performs no expiry check. A session token is cryptographically valid forever. If a user's cookie or Bearer token is exfiltrated (XSS, device theft, network interception on HTTP), the attacker has permanent access to the Discogs OAuth credentials embedded in the token. There is no revocation path short of rotating `SESSION_SECRET` (which invalidates every active session).
Severity: HIGH
Remediation: Add `exp: Math.floor(Date.now() / 1000) + (30 * 86400)` to the payload at creation. In `verifyMobileToken`, check `if (!data.exp || Date.now() / 1000 > data.exp) return null`. This invalidates all existing tokens on deploy; that's acceptable for a small user base.

**Finding A-2 — HMAC signature comparison is not constant-time**
File: `src/lib/session.ts:38`
```
if (sig !== expected) return null;
```
JavaScript string equality (`!==`) is not constant-time. An attacker who can send many requests and measure response time can use this as a timing oracle to recover the expected HMAC value for a chosen payload, allowing session token forgery. In practice, network jitter makes this extremely difficult over the internet, but it is a textbook cryptographic implementation error that violates the security contract of HMAC.
Severity: MEDIUM
Remediation: `if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;`

**Finding A-3 — Row-level data isolation**
Verified: Every SQL query that accesses `records` or `plays` filters on `WHERE username = ?` with the session-derived username. User A cannot read or write User B's data. Multi-tenant isolation is correctly implemented.

**Finding A-4 — `/api/records` enforces auth; `/api/init` does not**
The init route (`src/app/api/init/route.ts`) is an unauthenticated GET that executes CREATE TABLE, DROP TABLE, and ALTER TABLE statements against the production database. Detailed in Section 4.

**Finding A-5 — No token revocation mechanism**
There is no token blacklist, no session table, and no way to revoke a specific user's session without rotating `SESSION_SECRET`. This affects the "compromised device" scenario: if a user loses their iPad, there is no way to invalidate their session.
Severity: MEDIUM (personal app with small user base; operational workaround is `SESSION_SECRET` rotation)
Remediation: Post-launch. Add a `sessions` table or use Discogs token rotation.

---

### SECTION 4 — DATABASE SECURITY & INTEGRITY

**Finding D-1 — `/api/init` is unauthenticated DDL**
File: `src/app/api/init/route.ts:4`
`export async function GET()` — no `request` parameter, no session check. Any unauthenticated HTTP GET to `https://needle-drop.com/api/init` triggers 8+ database operations: three `CREATE TABLE IF NOT EXISTS`, a `PRAGMA table_info`, five `ALTER TABLE` attempts, and potentially a `DROP TABLE` + rename if the migration guard condition triggers. The DROP TABLE guard (`if (!recordsCols.includes('username'))`) is safe in the current state (migration has run), but the route should never have been publicly accessible. It is also called by the client on every page load, generating repeated DDL chatter.
Severity: HIGH
Remediation: Add `const session = await getSession(request); if (!session) return NextResponse.json({error:'Unauthorized'},{status:401})` before any DB operation. Accept `request: Request` as a parameter.

**Finding D-2 — All queries are parameterized**
Verified: Every `db.execute` and `db.batch` call uses `{ sql: '...?...', args: [...] }` form. No string concatenation of user input into SQL. No SQL injection risk found.

**Finding D-3 — No plays index on (username, discogs_id)**
File: `src/app/api/init/route.ts` (table creation)
The `plays` table has no index. `GET /api/plays` runs `SELECT ... FROM plays WHERE username = ? GROUP BY discogs_id` against an unindexed table. For a user with thousands of plays, this becomes a full table scan. Turso is SQLite-backed; this is a correctness-under-scale issue, not a security one.
Severity: LOW (performance)
Remediation: `CREATE INDEX IF NOT EXISTS plays_username_idx ON plays (username, discogs_id);`

**Finding D-4 — Sync loop has no page limit guard**
File: `src/app/api/sync/route.ts:54–69`
The `do/while` loop paginating Discogs releases has no maximum page count. If `data.pagination` is absent, `.pages` access throws a TypeError (500). If Discogs returns `pages: 10000` (unlikely but possible for a malformed response), the route makes 10,000 sequential API calls before timing out. Vercel serverless functions have a 10–30 second limit; the function will time out and leave the sync half-complete.
Severity: LOW
Remediation: Add `const MAX_PAGES = 200; do { ... } while (page <= totalPages && page <= MAX_PAGES);`

**Finding D-5 — `oauth_state` table cleanup is event-driven, not scheduled**
Expired nonce rows are pruned only when a new OAuth flow is initiated. If no new logins occur, expired rows accumulate indefinitely. For a personal app this is benign; at scale it's a slow memory leak.
Severity: LOW

---

### SECTION 5 — API SECURITY

**Finding API-1 — CRITICAL: Open SSRF in image proxy**
File: `src/app/api/image/route.ts`
```typescript
const imageUrl = searchParams.get("url");
const response = await fetch(imageUrl);  // no validation
```
The image proxy accepts any URL string, requires no authentication, and makes an outbound HTTP request from the Vercel/AWS serverless runtime to whatever is specified. Attack vectors:

- **Cloud metadata**: `GET /api/image?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/` — the AWS IMDSv1 endpoint. If Vercel's Lambda runtime has IMDSv1 accessible (not guaranteed but possible), this returns AWS IAM credentials for the underlying execution role.
- **Internal network probe**: `GET /api/image?url=http://10.0.0.1/` — maps internal infrastructure. Even failed connections leak timing info about what's alive.
- **Redirects**: If Discogs CDN returns a redirect to an internal IP, the proxy follows it.
- **Large response amplification**: No response size limit. A request to an attacker-controlled server returning 500MB of data will be buffered into Sharp, consuming function memory.
- The route is entirely unauthenticated — no session required.

The Sharp image processing will fail for non-image content and return 500, but the network request is still made and completed before Sharp runs.
Severity: CRITICAL
Exploitability: Now — zero authentication required
Remediation:
1. Add session auth: require a valid session to call this endpoint.
2. Enforce a domain allowlist: only permit URLs matching `*.discogs.com` or `img.discogs.com` / `i.discogs.com`.
3. Add response size limit: abort if `Content-Length > 5MB` or if buffer exceeds threshold.

Example allowlist check:
```typescript
const allowed = /^https:\/\/(img|i|api)\.discogs\.com\//;
if (!allowed.test(imageUrl)) {
  return new Response('Forbidden', { status: 403 });
}
```

**Finding API-2 — No security headers**
Files: `next.config.js`, `next.config.ts` — no `headers()` export. No `vercel.json`.
The application sends no security headers:
- No `Content-Security-Policy` — XSS has no second line of defense
- No `X-Frame-Options` or `frame-ancestors` CSP directive — clickjacking possible
- No `X-Content-Type-Options: nosniff` — MIME sniffing attacks possible
- No `Strict-Transport-Security` — no HTTPS pinning on repeat visits
- No `Permissions-Policy` — unnecessary browser APIs not restricted

For a WKWebView-primarily accessed app the attack surface is lower, but the app is a live HTTPS URL accessible to any browser.
Severity: MEDIUM
Remediation: Add to `next.config.ts`:
```typescript
async headers() {
  return [{
    source: '/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ],
  }];
}
```

**Finding API-3 — No rate limiting on any endpoint**
There is no middleware, no Vercel Edge rate limit config, and no application-level rate limiting. Of particular concern:
- `GET /api/auth/discogs` — each call makes a real outbound POST to `api.discogs.com/oauth/request_token`. Spamming this burns your Discogs consumer key's rate quota (60 requests/min per OAuth app) and pollutes the `oauth_state` table. A burst of 60 requests drains the per-minute Discogs limit.
- `POST /api/plays` — an authenticated user can log unlimited plays in rapid succession, inflating play counts and generating unbounded DB writes.
- `GET /api/sync` — each call pages through the full Discogs collection. For a large collection (500+ records), each sync is ~5 API calls. An attacker with valid credentials could trigger continuous syncs.
Severity: MEDIUM
Remediation: Use Vercel's built-in rate limiting (available on Pro/Enterprise) or add a simple in-memory rate limiter (e.g., `lru-cache` based) for the OAuth initiation endpoint at minimum.

**Finding API-4 — `discogs_id` accepted without ownership validation in plays**
File: `src/app/api/plays/route.ts:46–47`
`POST /api/plays` and `PATCH /api/plays` accept any `discogs_id` string from an authenticated user without verifying that the record exists in `records WHERE username = session.username`. An authenticated user can log plays for arbitrary Discogs IDs not in their collection, or for IDs that belong to other users' collections (no cross-user leak — the play row is always scoped to the caller's username, but the DB integrity is polluted).
Severity: LOW (no cross-user data exposure; affects only own data integrity)
Remediation: Add a validation query: `SELECT 1 FROM records WHERE username = ? AND discogs_id = ?` before inserting.

**Finding API-5 — Error responses from auth routes may leak status**
Files: `src/app/api/auth/discogs/route.ts:65`, `src/app/api/auth/discogs/callback/route.ts:79`
Both routes return `console.error` output server-side (Vercel logs only — not exposed to client). The client-facing error responses are generic (`{ error: 'Failed to get request token from Discogs' }`). No information leakage to external callers. No issue found.

---

### SECTION 6 — DEPENDENCY AUDIT

`npm audit` as of 2026-05-13: 5 vulnerabilities (3 HIGH, 2 MODERATE). 0 CRITICAL.

**Finding DEP-1 — HIGH: Next.js 16.1.6 has multiple CVEs; fixed in 16.2.6**
Current version: `16.1.6`. Fixed version: `16.2.6` (same major, non-breaking).
CVEs of direct concern to this deployment:
- **GHSA-ggv3-7p47-pfv8**: HTTP request smuggling via rewrites — applicable if Vercel uses proxy rewrites
- **GHSA-mq59-m269-xvcx**: Null origin bypasses Server Actions CSRF checks
- **GHSA-jcc7-9wpm-mj36**: Null origin bypasses dev HMR CSRF checks
- **GHSA-c4j6-fc7j-m34r**: SSRF via WebSocket upgrades
- **GHSA-492v-c6pp-mqqv**, **GHSA-267c-6grr-h53f**, **GHSA-26hh-7cqf-hhc6**: Middleware/proxy bypass via route injection (multiple variants)
- **GHSA-vfv6-92ff-j949**, **GHSA-wfc6-r584-vfw7**: Cache poisoning in React Server Component responses

This app does not use Server Actions, Middleware, or WebSocket upgrades — but the HTTP smuggling, null-origin CSRF, and cache poisoning CVEs are infrastructure-level and apply regardless.
Severity: HIGH
Remediation: `npm install next@16.2.6` — straightforward patch upgrade, no API changes.

**Finding DEP-2 — HIGH: `flatted` prototype pollution and DoS**
- **GHSA-25h7-pfq9-p65f**: Unbounded recursion DoS in `flatted@parse()`
- **GHSA-rf6f-7fwh-wjgh**: Prototype Pollution via `flatted@parse()`
`flatted` is a transitive dependency. `npm audit` shows a fix is available.
Severity: HIGH (transitive, not directly called by app code; exploitability depends on where it's invoked in the toolchain)
Remediation: Covered by upgrading next to 16.2.6 (which updates the dependency tree).

**Finding DEP-3 — HIGH: `picomatch` ReDoS and method injection**
- **GHSA-3v7f-55p6-f55p**: Method injection via POSIX character classes
- **GHSA-c2c7-rc m5-vvqj**: ReDoS via extglob quantifiers
Transitive build-tooling dependency. Not reachable at runtime in a deployed Vercel function. ReDoS affects glob matching during build/dev.
Severity: MEDIUM in this context (build-time only); fix available.
Remediation: `npm audit fix`

**Direct dependencies — no issues found:**
- `@libsql/client@0.17.0`: current; no known CVEs
- `oauth-1.0a@2.2.6`: current; no known CVEs
- `sharp@0.34.5`: current; no known CVEs
- `react@19.2.3`, `react-dom@19.2.3`: current

**No unnecessary production dependencies** — the dependency list is minimal and correct. No devDependencies appear to be leaking into production bundle.

---

### SECTION 7 — INFRASTRUCTURE & DEPLOYMENT

**Finding INF-1 — No environment separation**
`src/lib/db.ts` hardcodes the production Turso URL. The `TURSO_AUTH_TOKEN` env var is the only variable needed to access the database. Local `npm run dev` connects to the production database with the same credentials deployed on Vercel. A mistake in a local test (e.g., running the sync route locally) writes to production data.
Severity: MEDIUM (operational risk; not a direct attack vector)
Remediation: Create a separate Turso branch/database for development. Add `TURSO_DB_URL` env var.

**Finding INF-2 — No `vercel.json`; no Vercel-level security controls**
There is no `vercel.json`. This means:
- No Vercel WAF rules or rate limiting configured
- No custom response headers at the CDN layer
- Vercel's default caching behavior applies to all routes (all API routes use `export const dynamic = 'force-dynamic'` which correctly opts out of caching — verified)
- No protection against the Next.js middleware bypass CVEs at the infrastructure layer
Severity: MEDIUM (mitigated partially by `force-dynamic` exports on all routes)
Remediation: Create `vercel.json` with security headers and rate limiting rules. At minimum, add the security headers listed in API-2 here rather than in `next.config.ts` to apply them at CDN edge.

**Finding INF-3 — `reactStrictMode: false`**
File: `next.config.js`
React Strict Mode is disabled with the comment "avoid double-renders on slow hardware." Strict Mode in development double-invokes render functions to surface side effects. Disabling it means certain classes of bugs (effects that fire once but should be idempotent) go undetected in development. Not a production security issue.
Severity: LOW
Remediation: Re-enable. If double-renders cause actual problems, investigate the specific component rather than disabling globally.

**Finding INF-4 — iOS ATS `NSExceptionRequiresForwardSecrecy: false` for all domains**
File: `ios/project.yml`, `ios/Sources/Info.plist`
All four ATS domain exceptions (`needle-drop.com`, `api.discogs.com`, `img.discogs.com`, `i.discogs.com`) set `NSExceptionRequiresForwardSecrecy: false`. This permits non-forward-secret TLS cipher suites (those without (EC)DHE key exchange). In practice, all these domains negotiate modern TLS with PFS by default on iOS 17. The exception is wider than necessary and would permit degraded ciphers if a server were ever misconfigured.
Severity: LOW
Remediation: Remove `NSExceptionRequiresForwardSecrecy: false` from all domains. If Discogs CDN requires it (some CDNs still use RSA key exchange), keep only for the Discogs CDN domains.

**Sentry:** Not configured. No error tracking on either web or iOS. Not a security issue but a reliability gap. Post-launch.

---

### SECTION 8 — FINDINGS REGISTER

| # | Severity | Location | Vulnerability | Exploitability | Remediation |
|---|----------|----------|---------------|----------------|-------------|
| 1 | CRITICAL | `src/app/api/image/route.ts` | SSRF — unauthenticated image proxy accepts any URL; can reach cloud metadata, internal services, and amplify large responses | **Now** — zero auth required | Add session auth + domain allowlist (`*.discogs.com`) + response size cap |
| 2 | HIGH | `src/lib/session.ts` | `SESSION_SECRET` not validated at startup; missing key silently keys HMAC on `"undefined"`, making all tokens forgeable | **Now** if env var missing in any deployment | Throw at startup if env var absent or < 32 chars |
| 3 | HIGH | `src/app/api/init/route.ts` | Unauthenticated DDL — any internet user can trigger CREATE/DROP/ALTER against production DB | **Now** | Add session guard; accept `request: Request` |
| 4 | HIGH | `package.json` next@16.1.6 | Multiple CVEs: HTTP smuggling, null-origin CSRF bypass, middleware/proxy bypass, cache poisoning, DoS | Realistic (HTTP smuggling, CSRF bypass) | `npm install next@16.2.6` |
| 5 | HIGH | `src/lib/session.ts:18–29` | Bearer/session tokens contain no `exp` claim; valid forever; no revocation path | **Realistic** after any token exfiltration | Add `exp` to payload; validate on verify |
| 6 | MEDIUM | `src/lib/session.ts:38` | HMAC signature comparison uses `!==` (non-constant-time); timing oracle allows signature forgery with sufficient measurement | Theoretical (requires ~800K requests + sub-ms precision) | Replace with `crypto.timingSafeEqual()` |
| 7 | MEDIUM | `next.config.ts` | No security headers (CSP, X-Frame-Options, HSTS, X-Content-Type-Options) | Increases XSS/clickjacking attack surface | Add `headers()` in next.config.ts |
| 8 | MEDIUM | No middleware | No rate limiting on any endpoint; auth initiation can exhaust Discogs consumer key quota | **Realistic** for targeted DoS/quota exhaustion | Vercel rate limiting or in-app limiter on auth routes |
| 9 | MEDIUM | `src/lib/db.ts:4` | Production DB URL hardcoded; no dev/prod separation; `npm run dev` writes to production DB | **Now** (operational; not an attack vector) | Move URL to `TURSO_DB_URL` env var; create dev DB |
| 10 | MEDIUM | `ios/project.yml` | `NSExceptionRequiresForwardSecrecy: false` for all ATS domains widens cipher suite permissiveness | Low — all domains use modern TLS in practice | Remove the exception from ATS config |
| 11 | LOW | `src/app/api/plays/route.ts` | Authenticated users can log plays for any `discogs_id` not in their collection | **Now** — own data only; no cross-user impact | Validate discogs_id exists in user's records before insert |
| 12 | LOW | `src/app/api/init/route.ts` | No index on `plays(username, discogs_id)`; full-table scans on every GET /api/plays | Performance only | Add index at table creation |
| 13 | LOW | `src/app/api/sync/route.ts:54–69` | No max-pages guard on Discogs pagination loop; malformed response can trigger timeout or thousands of API calls | Low — requires Discogs API to misbehave | Add `&& page <= 200` guard |
| 14 | LOW | `next.config.js` vs `next.config.ts` | Two conflicting Next.js config files with different content | Causes silent config divergence | Delete `next.config.js` |

---

### SECTION 9 — GILFOYLE'S LAUNCH CLEARANCE

**LAUNCH CLEARANCE: WITHHELD.**

There is one CRITICAL finding that cannot ship: the image proxy at `/api/image` is an unauthenticated open SSRF endpoint that accepts arbitrary URLs and makes server-side HTTP requests from your Vercel infrastructure. An unauthenticated attacker can use it to probe cloud metadata endpoints, enumerate internal network topology, and amplify large-payload responses — right now, with no credentials. The fix is ten lines: add a session check and a domain allowlist. That is a thirty-minute change. After that, there are three HIGH findings: an unvalidated `SESSION_SECRET` env var that can make all tokens forgeable on misconfigured deploy, an unauthenticated DDL route that exposes your production schema manipulation to the internet, and a Next.js version sitting on multiple CVEs including HTTP smuggling and CSRF bypass that upgrades cleanly to 16.2.6. Bearer tokens that never expire are uncomfortable but not acute for a personal app; fix them after launch. The rest of the findings are operational quality and hardening. The CRITICAL and all three HIGHs must be resolved before this goes to the App Store. Everything else can follow in the first post-launch patch cycle.

---

*CRITICAL: 1 | HIGH: 4 | MEDIUM: 5 | LOW: 5 | LAUNCH CLEARANCE: WITHHELD*
