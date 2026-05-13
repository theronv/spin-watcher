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
