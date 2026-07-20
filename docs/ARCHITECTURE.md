# PrettyCardboard — Architecture

> A multiplayer, freeform card-game tabletop for **Magic: The Gathering** and the official **Cyberpunk TCG**. React 19 + Vite + a vendored **Glacier** design kit on the front, a **Rust** (axum + rusqlite) server behind it, shipped as a web app and a **Tauri v2** desktop app. Live at https://prettycardboard.com.

This is the orientation map for a new contributor. It is organized by subsystem; each section covers what it is for, the files that matter, how it works, the data/control flow, the non-obvious gotchas, and how to make a common change. For focused topics see the sibling docs in `docs/`.

## Contents

1. [App Shell, Hash Routing & Code-Splitting](#app-shell-hash-routing-code-splitting)
2. [Client State Stores & the Network Layer](#client-state-stores-the-network-layer)
3. [The Rust Server](#the-rust-server)
4. [Multi-Game Registry & Card Data](#multi-game-registry-card-data)
5. [In-Game Table / Gameplay UI](#in-game-table-gameplay-ui)
6. [Deck Building, Browse, and the Card-Data Pipeline](#deck-building-browse-and-the-card-data-pipeline)
7. [Build, Test & Deploy Workflow](#build-test-deploy-workflow)

---

## App Shell, Hash Routing & Code-Splitting

The top-level React shell that boots the app, gates everything behind a player identity, routes between pages via the URL hash, lets a live game table take over the whole window, and keeps the initial download tiny through React.lazy route-splitting and a Vite vendor-chunk split. It is one codebase that runs as a plain web app and as a Tauri v2 desktop window.

**Key files**

- `index.html` — HTML entry; sets data-theme=dark, paints a pre-token background to avoid a white flash, mounts #root, loads /src/main.tsx as a module
- `src/main.tsx` — JS entry; imports the Glacier token CSS (fonts, tokens), styles.css and app/app.css, then createRoot(...).render(<StrictMode><App/></StrictMode>)
- `src/app/App.tsx` — Root component: the auth gate (Shell vs OnboardingPage), the route→page switch, live-table takeover, all React.lazy route/modal declarations, the modal latch, and global providers
- `src/app/router.ts` — The hash router: ROUTES tuple, Route type, fromHash(), and the useRoute() hook that reads/writes window.location.hash
- `src/app/RouteSidebar.tsx` — Contextual left sidebar; renders a different live panel per route and lazy-loads BrowseSidebarNav only on the Browse route
- `src/app/BrowseSidebarNav.tsx` — Browse-only catalog jump-nav; split into its own chunk because it reads the ~700KB bundled catalog
- `src/app/preferences.ts` — Preferences type + defaults, localStorage load/save (versioned), and applyPreferences() which stamps data-* attributes and CSS vars on documentElement to drive the Glacier token look
- `src/app/tauri.ts` — Dependency-free Tauri bridge: isTauri() detects the webview; importApi() loads @tauri-apps/api via a vite-ignored computed specifier and no-ops in the browser
- `src/app/data/pendingJoin.ts` — Deep-link helpers: parse #/join/CODE, stash the code in sessionStorage across the auth gate, and build shareable invite URLs
- `vite.config.ts` — base './' for Tauri custom-protocol serving; manualChunks vendor split (vendor-motion/-glacier/-react/vendor); dev server on port 5240

#### Boot sequence

`index.html` mounts an empty `#root` and loads `/src/main.tsx`. `main.tsx` pulls in the CSS layers in order (Glacier `fonts.css` then `tokens.css`, then `styles.css`, then `app/app.css`) and renders `<App/>` inside React `StrictMode`. Everything visual is defined by CSS custom properties from the token layer; `index.html` also inlines a tiny `html { background: #0f0f10 }` rule so the very first frame is dark, not a white flash, before tokens load.

#### The auth gate: Shell vs OnboardingPage

`App()` (App.tsx) owns three pieces of top-level state read from `useApp` (the Zustand app store): `bootstrapped`, `identity`, and the `bootstrap` action, which it fires once in an effect. The render is a three-way gate:

- `!bootstrapped` → render `null` (blank) while `bootstrap()` restores any saved identity from `localStorage` and connects the websocket.
- `identity` present → render `<Shell/>` plus the always-on global layers: a lazy `<Spotlight/>` command palette, `<Notifier/>`, and `<InvitePopup/>`.
- otherwise → render the lazy `<OnboardingPage/>` (sign up / log in).

`bootstrap` guards against StrictMode's double-invoke with `if (get().bootstrapped) return`. The whole tree is wrapped in Glacier providers (`LocaleProvider`, `MotionConfig`, `HapticsProvider`, `VisualFeedbackProvider`, `ToastProvider`, `CardPopupProvider`) plus `HoverCardLayer`, all driven by the current `preferences`.

#### The hash router

`router.ts` defines `ROUTES = ['home','play','decks','browse','friends','profile','download']` and the derived `Route` type. `fromHash()` strips a leading `#/` off `window.location.hash` and validates it against `ROUTES`, falling back to `DEFAULT_ROUTE` ('home'). `useRoute()` seeds `useState` from `fromHash`, subscribes to the window `hashchange` event, and returns `[route, navigate]`; `navigate(next)` both sets `window.location.hash = '/' + next` and updates local state. Hash routing (rather than history routing) is deliberate — it means any static deploy or Tauri custom-protocol origin works with no server rewrite rules, which is also why invite links are `<origin>/#/join/CODE`.

`Shell` calls `useRoute()` and translates the route into a page via a chain of ternaries, but two conditions preempt the route entirely (see next section). The far-left `AppRail` and the `RouteSidebar` both call `navigate` / set `window.location.hash` to move between routes.

#### Live-table takeover

The live game table is intentionally NOT a route — it is a takeover. `Shell` reads `inRoom = useGame((s) => s.room !== null)` and `pendingJoin = useUi((s) => s.pendingJoin)`. The page selection is:

1. `inRoom` → `<TablePage/>` (seated or spectating; the game owns the shell body).
2. else `pendingJoin` → `<JoinTablePage code={pendingJoin}/>` (arrived via a share link).
3. else → the route's page (`HomePage`, `PlayPage`, `DecksPage`, `BrowsePage`, `FriendsPage`, `DownloadPage`, or `ProfilePage`).

When `inRoom`, the shell strips its chrome: `AppRail`, the `appSidebar`, and the `DownloadBanner` are all hidden, `appContent` gets `data-full-bleed`, and `collapsed` is forced true (`collapsed = (DESKTOP && preferences.sidebarCollapsed) || inRoom`). Only the desktop `TitleBar` survives, because that is OS window chrome, not app UI. The `<main>` uses `motion.div` keyed on `inRoom ? 'table' : route`, so every route change (and entering/leaving the table) remounts with a short enter animation; there is deliberately no exit choreography, so navigation can never block on an unfinished animation.

#### Deep-link (#/join/CODE) flow

`data/pendingJoin.ts` parses `#/join/CODE` with `joinCodeFromHash`. At module-evaluation time (top of App.tsx, before any render) a `bootCode` is captured and stashed with `rememberPendingJoin` into `sessionStorage`, so an invite opened cold survives the auth gate and any reload auth triggers. A separate effect in `App()` re-syncs on every `hashchange`, calling `useUi.getState().setPendingJoin(code)` so a link pasted while the app is already running is honored too. sessionStorage keeps the pending code per-tab, so two invites in two tabs never cross wires.

#### React.lazy route-splitting + Suspense + the modal latch

Every page and both modals are declared with `React.lazy` at the top of App.tsx. Because these modules use named exports and `lazy` requires a default, each loader adapts it: `lazy(() => import('./pages/HomePage.tsx').then((m) => ({ default: m.HomePage })))`. Route pages render inside a `<Suspense fallback={<PageFallback/>}>` (a centered `Spinner` that fills the content area so the shell never collapses mid-stream). Global overlays like `Spotlight` use `fallback={null}`.

The two modals (`SettingsModal`, `CustomizeModal`) use a **latch** so their chunks don't load until first opened, yet stay mounted afterwards so their close animation can play. Each has a `useRef` seen-flag updated with `settingsSeen.current ||= settingsOpen`. The JSX guards on `settingsSeen.current && (...)` — the key point is that not rendering the component at all is what actually defers importing its lazy chunk; once opened, the flag stays true forever and the modal is only toggled via its own `open` prop. The Customize modal auto-opens on first launch (`localStorage` key `pc.customized`), and both modals can also be opened from deep in the table UI via the window events `pc:open-customize` / `pc:open-settings`, avoiding prop-drilling through the entire table tree.

`RouteSidebar` applies the same idea one level down: `BrowseSidebarNav` is lazy because it reads the ~700KB bundled catalog, so that data only downloads when a user actually visits the Browse route.

#### Preferences → token look

`preferences.ts` holds the app-wide look-and-feel knobs (theme, density, accent, fonts, radius/blur scales, locale, motion/haptics, card back, playmat, table-play options). `App()` seeds state from `loadPreferences()` (versioned localStorage read, with a v1→v2 migration for `radiusScale`), and an effect calls `applyPreferences()` + `savePreferences()` on every change. `applyPreferences` reflects each value onto `document.documentElement`: it stamps `data-theme`, `data-density`, `data-accent`, `data-font`, `data-mono`, and sets CSS vars like `--glacier-radius-scale`, `--glacier-glass-blur-scale`, `--pc-card-back`, `--pc-playmat`. Notably, any value equal to its default *clears* the attribute so the token `:root` defaults win, and it dispatches a `pc:preferences` window event so live surfaces (the table felt) can react.

#### Tauri vs web

`tauri.ts` is a dependency-free bridge. `isTauri()` checks for `'__TAURI_INTERNALS__' in window`. App.tsx computes `const DESKTOP = isTauri()` once and uses it to conditionally render the `TitleBar` (traffic lights + drag region) and to toggle drag-region attributes. Window controls (`minimizeWindow`, etc.) and the `greet` Rust command load `@tauri-apps/api` lazily through `importApi`, which imports a *computed* specifier with `/* @vite-ignore */` so neither the bundler nor the type checker tries to resolve a package that only exists in the full-Tauri scaffold; when absent, calls simply no-op. This is why the same build runs as a browser app, a Tauri window, and a backend-less static build.

#### Vite vendor split

`vite.config.ts` sets `base: './'` so the built app works when Tauri serves it from a custom protocol (not the server root). `build.rollupOptions.output.manualChunks(id)` splits `node_modules` into cacheable vendor chunks so an app code change doesn't invalidate React/motion/Glacier. **Order matters**: `motion`/`framer-motion` and `@glacier/*` are matched before the `react`/`react-dom`/`scheduler` rule because their paths also contain the substring "react". Everything else falls through to a generic `vendor` chunk. `chunkSizeWarningLimit` is raised to 900 because the vendor chunks are intentionally large — the meaningful budget is the app entry plus per-route chunks, which the React.lazy split keeps small.

**Flow**

index.html mounts #root and loads main.tsx → main.tsx imports token/style CSS and renders <StrictMode><App/></StrictMode> → App fires bootstrap() (restore identity + connect ws) → gate: !bootstrapped ⇒ null; no identity ⇒ lazy OnboardingPage; identity ⇒ Shell → Shell computes page: inRoom ⇒ TablePage (chrome stripped) ▸ else pendingJoin ⇒ JoinTablePage ▸ else useRoute() (hash) ⇒ route page → page rendered inside <Suspense> as a React.lazy chunk → navigation writes window.location.hash → hashchange event → useRoute setState re-renders → separate hashchange listener parses #/join/CODE into pendingJoin. Preferences flow in parallel: loadPreferences → applyPreferences stamps data-* + CSS vars on <html> → Glacier tokens repaint.

**Gotchas**

- The live table is NOT in the ROUTES list — it is a takeover triggered by useGame().room !== null. Adding it as a route would break the inRoom chrome-stripping logic. Same for the join screen (driven by uiStore.pendingJoin).
- The route→page mapping in App.tsx (the ternary chain) and the ROUTES tuple in router.ts are separate sources of truth. Adding a route means editing BOTH, plus SIDEBAR_LABEL in App.tsx (typed Record<Route,...>, so TypeScript will flag a missing key) and usually RouteSidebar's per-route panel.
- React.lazy requires a default export but the pages/modals use named exports, so every lazy() must adapt via .then((m) => ({ default: m.Named })). Forgetting the adapter yields an 'undefined component' runtime error.
- The modal latch (settingsSeen/customizeSeen refs with ||=) is load-bearing: it is the guard `seen.current && (...)` — not the modal's open prop — that defers loading the modal chunk. Always-rendering the modal would pull its chunk into the initial load and defeat the split.
- manualChunks order is fragile: motion and @glacier paths contain the substring 'react', so their rules MUST come before the react/react-dom rule or they'd be misclassified into vendor-react.
- base must stay './' (relative) — Tauri serves the build from a custom protocol, not the server root; an absolute base breaks asset URLs on desktop.
- The pending-join code is captured at module-eval time (top-of-file block in App.tsx) BEFORE React renders, so a cold-opened invite survives the auth gate. Moving that capture into a component/effect would lose codes on the auth reload.
- applyPreferences clears a data-* attribute when a value equals its default (so :root token defaults win). If you add a preference, follow the same 'default ⇒ removeAttribute' pattern or the default state won't match the token defaults.
- isTauri() relies on window.__TAURI_INTERNALS__ existing at call time; @tauri-apps/api is imported through a /* @vite-ignore */ computed specifier so the bundler never resolves it — do not convert those to static imports or the web/static builds will fail to bundle.
- DownloadBanner, AppRail, and appSidebar all self-hide when inRoom; the desktop TitleBar intentionally does NOT, because it is window chrome. Don't 'fix' the title bar showing during a game.

**Making a change here**

#### Add a new top-level route (e.g. 'store')

1. **`src/app/router.ts`** — add the id to the `ROUTES` tuple. The `Route` union and `fromHash` validation update automatically.
2. **`src/app/App.tsx`** —
   - Declare the page as a lazy chunk: `const StorePage = lazy(() => import('./pages/StorePage.tsx').then((m) => ({ default: m.StorePage })));`
   - Add a branch to the `page` ternary chain in `Shell` (before the `ProfilePage` fallback).
   - Add a `NavBarItem` in `AppRail` (icon from `@glacier/icons`, `active={route === 'store'}`, `onClick={() => onNavigate('store')}`).
   - Add a `SIDEBAR_LABEL['store']` entry — it is a typed `Record<Route, ...>`, so TypeScript will error until you do. Point it at an existing i18n sidebar-title key or add a new one.
3. **`src/app/RouteSidebar.tsx`** — add a `route === 'store'` branch returning the contextual `SidebarSection`(s) for that page, or let it fall through to the default profile-style panel.
4. **i18n** — add any new label keys used above to `src/app/i18n.ts`.

The page will code-split automatically (it is lazy) and render inside the existing `<Suspense fallback={<PageFallback/>}>` with the standard enter animation. No Vite config change is needed — a new page module becomes its own route chunk under the existing manualChunks/React.lazy setup.

#### Add a new modal opened from anywhere

Follow the `SettingsModal` pattern in App.tsx: declare it lazy, add a `const [open, setOpen] = useState(false)` and a `seen = useRef(false)` latch (`seen.current ||= open`), render it under `{seen.current && <Suspense fallback={null}>...}`, and if deep surfaces must open it, add a `window` event (like `pc:open-settings`) wired up in the existing `useEffect`.

#### Add a preference

Extend the `Preferences` interface and `DEFAULT_PREFERENCES` in `preferences.ts`, then teach `applyPreferences` how to reflect it (following the 'clear the attribute/var when it equals the default' convention). Bump `PREFS_VERSION` only if you need a migration in `loadPreferences`. Consume it wherever needed via the `preferences` prop threaded from `App` → `Shell` → modals, or listen for the `pc:preferences` window event on live surfaces.

---

## Client State Stores & the Network Layer

The client half of PrettyCardboard's authoritative-server model: four Zustand stores hold all client state (identity/social/decks, the live table, ephemeral cross-page UI, and table-local presentation), and a thin net layer (`api.ts` REST + `ws.ts` WebSocket) is the only thing that talks to the Rust/axum server. The server owns the truth; the client renders snapshots and applies deltas optimistically in between.

**Key files**

- `src/app/net/types.ts` — Single source of shared protocol types: Identity, Deck/DeckCard, RoomState, TablePlayer, CardInst, the GameAction / GameActionV2 unions, and the ServerMessage discriminated union (every server→client frame).
- `src/app/net/api.ts` — REST client. Resolves SERVER_URL, holds the module-level bearer token (setToken), and exposes one typed function per endpoint via the request<T> helper; throws ApiError on non-2xx.
- `src/app/net/ws.ts` — The single realtime WebSocket. Owns connect/disconnect, reconnect backoff, the ClientMessage union, send/sendAction, and the onMessage/onStatus pub-sub that the stores subscribe to.
- `src/app/state/appStore.ts` — useApp: identity + bearer token (persisted to localStorage), social graph (friends/invites/presence), and the deck list; drives sign-in/out, one-time deck seeding, and going online.
- `src/app/state/gameStore.ts` — useGame: the live table. Holds the authoritative RoomState plus chat/log/timeline/undo/replay, routes every room-scoped ServerMessage, and applies room.event deltas via applyEvent().
- `src/app/state/uiStore.ts` — useUi: tiny ephemeral cross-page UI state that must outlive a page remount — selected deck, pending join code, and the 'new deck' intent flag.
- `src/app/pages/table/tableUi.ts` — useTableUi: purely presentational table-local UI — board layout mode + card scale (persisted per user), combat/blocker selection, library/pile viewers, and the client-only floating-mana pool.
- `src/app/state/boardModes.ts` — localStorage-backed load/save + clamp helpers for the per-user board mode and card-scale values that useTableUi hydrates.
- `src/app/data/pendingJoin.ts` — sessionStorage stash for a share-link table code so it survives the auth gate/reload; useUi seeds pendingJoin from peekPendingJoin().
- `PROTOCOL.md` — The REST + WebSocket contract the server implements and the client mirrors. Mostly current, but stale in two spots noted in Gotchas (identity is now password-based; a rewindTo typo).

#### The shape of it

There are two layers. The **net layer** (`api.ts`, `ws.ts`) is a pair of dumb, store-agnostic modules that know how to reach the server. The **store layer** (four Zustand stores) holds all client state and subscribes to the net layer. Stores import the net modules; the net modules import nothing from the stores. Data flows *into* stores through `ws.onMessage` callbacks and awaited REST calls, and *out* through `ws.send` / `api.*` calls made inside store actions.

#### REST client (`api.ts`)

`SERVER_URL` is resolved once at module load: an explicit `VITE_PC_SERVER` wins (web prod sets `''` = same-origin); otherwise a Tauri desktop build points at the live `https://prettycardboard.com` (so installed desktop shares accounts with the web app); otherwise browser dev uses `http://127.0.0.1:8787`. A module-level `authToken` is set via `setToken(token)` and injected as `Authorization: Bearer <token>` by the private `request<T>(method, path, body?)` helper, which also sets the JSON content-type, parses the body, and on any non-2xx throws an `ApiError(status, code, message)` (decoded from the server's `{code, message}` error body). Every public function (`register`, `login`, `me`, `getFriends`, `listDecks`, `createDeck`, `createRoom`, `endorsePlayer`, `moxfieldDeck`, …) is a one-liner over `request`.

#### WebSocket lifecycle (`ws.ts`)

One socket for everything realtime — presence, invites, chat, and the whole game room. State is module-level singletons (`socket`, `currentToken`, `retryDelay`, `closedByUs`) plus two listener `Set`s. `connect(token)` is **idempotent**: a live socket for the same token is kept, a socket for a different token is torn down first (this is what makes React StrictMode double-effects and repeated sign-ins safe). `open()` builds the URL via `wsUrl()` — `ws(s)://…/api/ws?token=<token>` derived from `SERVER_URL` or, for same-origin builds, from `window.location`. Handlers: `onopen` resets backoff and fires `onStatus(true)`; `onmessage` JSON-parses the frame (silently dropping garbage) and fans it out to every `onMessage` listener; `onclose` fires `onStatus(false)` and, unless `closedByUs`, schedules a reconnect with exponential backoff (500 ms, doubling, capped at 8000 ms); `onerror` just closes so the `onclose` path runs. `disconnect()` sets `closedByUs` and drops the socket for good. The socket **replays nothing** on reconnect — recovery is entirely by fresh snapshot (see below). `send()` no-ops unless the socket is `OPEN`; `sendAction(action)` is sugar for `send({type:'game.action', action})`. `onMessage`/`onStatus` return unsubscribe functions.

#### The protocol shape (`types.ts`)

`ClientMessage` (declared in `ws.ts`) is the client→server union: `room.join`/`spectate`/`leave`/`start`, `chat.send`, `invite.send`, `replay.seek`, cosmetic setters, and the catch-all `game.action` carrying a `GameAction | GameActionV2`. `GameAction` is freeform v1 table ops (`card.move`, `card.tap`, `draw`, `life.add`, `cmd.damage`, …); `GameActionV2` adds turns/phases/combat/stack/library-tools/undo (`turn.pass`, `combat.attack`, `stack.push`, `library.peek`, `undo`, `redo`, `rewindTo`, `concede`, …). `ServerMessage` is the server→client discriminated union keyed on `type`: global/social frames (`welcome`, `presence`, `invite`, `friend.request`, `friend.accepted`, `decks.changed`) and room-scoped frames that all carry a `roomId` (`room.state`, `room.event`, `chat`, `log`, `cmd.choice`, `library.cards`, `undo.state`, `timeline`, `replay.frame`, `room.closed`, `error`). The keystone is **`room.state` — a full per-viewer `RoomState` snapshot with hidden info (opponents' hands/libraries) filtered server-side**; it is sent on join/spectate/resync and simply *replaces* the client's `room`.

#### appStore (`useApp`) — identity, social, decks

Holds `identity` (userId+username+bearer token), `connected`, `friends`, `decks`, `invites`, and a `bootstrapped` guard. On store creation it wires `ws.onStatus` → `connected` and `ws.onMessage` → `handleMessage`, which reacts to the social frames: `presence` patches a friend's online/room inline; `friend.request`/`friend.accepted` trigger `refreshFriends()`; `decks.changed` (multi-device edit) triggers `refreshDecks()`; `invite` appends a de-duped `InviteToast`. `bootstrap()` loads a persisted identity from localStorage (`pc.identity`), validates the token with `api.me()` — a 401 drops to the auth screen, a network error stays signed-in and lets WS keep reconnecting — then `goOnline()` (sets the token, `ws.connect`, refreshes friends+decks). `register`/`login` hit REST then run the shared `adopt()` tail: persist identity, set the token, seed the Final Fantasy precon decks once per new account (guarded by the `pc.seeded` localStorage key, lazy-imported because the decklists are ~850 KB), go online, and seed Cyberpunk starters if the server shows none (server-truth check, so it reaches existing accounts and never double-seeds across devices). `signOut()` clears storage, token, socket, and state.

#### gameStore (`useGame`) — the live table

The biggest store. It subscribes to `ws.onStatus` — **on reconnect, if we hold a `room`, it re-sends `room.join`/`room.spectate` to pull a fresh authoritative snapshot** (the server held the seat while the socket was down). Its `ws.onMessage` handler is a big switch over `ServerMessage.type`. Two ideas govern it: (1) **`room.state` replaces, `room.event` patches.** A snapshot for the actively-viewed room overwrites `room`; a snapshot for any *other* subscribed room (e.g. a table you left) only bumps an `activity[roomId]` counter so the Play page can show 'turns are happening' without yanking you back. A `room.event` is applied locally through `applyEvent()` for latency-free updates between snapshots. (2) **`joinedRoomId` gating.** The server streams events for every table you're still a member of, so *every* room-scoped handler (`room.event`, `chat`, `log`, `cmd.choice`, `library.cards`, `undo.state`, `timeline`, `replay.frame`) checks `message.roomId === get().joinedRoomId` before touching state — without this, a play at another table would leak into this one's log/board. `applyEvent()` is a pure reducer that rebuilds `RoomState.players`, patching only the actor's own zones (via `patchCard`/`withZone`/`zoneList`) for the action kinds it understands; anything involving hidden information (`shuffle`, `mulligan`, a draw with no card details) is a deliberate no-op that the next snapshot reconciles. Store actions map 1:1 onto `ws.send`: `join`/`spectate`/`leave`, `start`, `act` (blocked while a replay is active), `redo`, `rewindTo`, `replaySeek`/`replayExit` (replay is viewer-local and read-only — `replay.frame` replaces the board only while `replay.active`), `sendChat`, `answerCmdChoice`. `room.closed` resets the table and stamps `closedRoomId` for the page to toast once and `ackClosed`.

#### uiStore & tableUi — the two UI stores

`useUi` is deliberately tiny: cross-page state that must survive a page remount — `selectedDeckId`, `pendingJoin` (a share-link code seeded from the sessionStorage stash so a cold-opened invite resumes after auth), and `newDeckIntent` (a flag the Decks page consumes to open the wizard after a cross-navigation). `useTableUi` is *table-local presentational glue* — 'server truth stays in gameStore; this is purely presentational.' It holds `boardMode` and `cardScale` (both hydrated from and saved to localStorage per user via `boardModes.ts`), `blockerIid` (combat selection), `libIntent`/`pileView` (which zone viewer is open), and the **floating-mana pool** (`mana: Record<ManaColor, number>` over WUBRG+C). The mana pool is intentionally *not* persisted and *not* server-synced: it is high-frequency and empties between phases, so restoring a stale pool would be actively wrong.

**Flow**

Outbound (user acts): component → store action (e.g. `useGame.act(action)`) → `ws.sendAction` → `ws.send` → server. REST outbound: store action → `api.*` → `request()` (adds Bearer) → server. Inbound (server pushes): server → WS frame → `ws.onmessage` JSON-parses → fans out to every `onMessage` listener → `useApp.handleMessage` (social frames) and `useGame`'s switch (room frames) → `set(...)` → React re-renders. Authoritative sync: `room.state` snapshot → `useGame` replaces `room` wholesale; between snapshots `room.event` → `applyEvent()` patches optimistically. Recovery: socket drops → `onStatus(false)` → backoff reconnect → `onStatus(true)` → `useGame` re-sends `room.join` → server replies with a fresh `room.state` (nothing is replayed).

**Gotchas**

- The server is authoritative and `room.event` handling is best-effort. `applyEvent()` only patches the actor's own player and only for kinds it recognizes; hidden-info churn (`shuffle`, `mulligan`, count-only draws) is a no-op by design and reconciled by the next `room.state`. Never treat the optimistic board as truth.
- Room-scoped message leakage: the server streams events for EVERY room you still hold a seat in. Every room-scoped handler in `useGame` MUST gate on `message.roomId === get().joinedRoomId` or a play at another table corrupts this one's log/board. `room.state` for a non-joined room must bump `activity`, not replace `room`.
- The WebSocket replays nothing on reconnect — resync is 100% snapshot-based. `useGame`'s `ws.onStatus` re-sends `room.join`/`room.spectate` to trigger a fresh `room.state`. If you add per-connection server state, it must survive this or be re-fetched here.
- `ws.connect(token)` is idempotent on purpose (StrictMode double-effects, repeat sign-ins). Don't 'simplify' it to always reopen — you'll stack sockets. Same for `useApp.bootstrap`'s `bootstrapped` guard.
- The bearer token is module-level global state in `api.ts` (`authToken`). Any authed REST call before `setToken()` runs will 401. The token is also passed in the WS URL query string (`?token=`), which is the server's handshake design — don't route other user data through URLs.
- PROTOCOL.md is stale on identity: it says 'username-only, no passwords', but `api.register`/`api.login` (and `useApp.register`/`login`) take and send a `password`. Trust the code.
- PROTOCOL.md documents a `rewintTo` (sic) typo; the wire kind is actually `rewindTo`, which is what `useGame.rewindTo` sends. Match the code, not the doc's typo callout.
- `act()` and `redo()` short-circuit while `replay.active` (the board is a past frame), but `rewindTo` deliberately is NOT blocked — it's a host action launched from the replay scrubber that exits replay right after.
- The floating-mana pool in `useTableUi` is intentionally client-only: not persisted, not server-synced. Don't 'fix' it by syncing — a restored stale pool is wrong because mana empties between phases.
- chat/log arrays are trimmed on every append (`slice(-199)` / `slice(-299)`); don't assume the client holds the full history — the server/timeline is the record.
- Two different seeding guards in `useApp.adopt`: precons use the `pc.seeded` localStorage key (per-device, register-only), Cyberpunk starters use a server-truth check ('no cyberpunk decks yet') so they reach existing accounts and are cross-device safe. They are not interchangeable.

**Making a change here**

#### Add a new server→client message
1. Add the variant to the `ServerMessage` union in `src/app/net/types.ts` (room-scoped frames must carry `roomId`). 2. Handle it in the right store's `ws.onMessage`: global/social frames go in `useApp.handleMessage`; anything about the live table goes in `useGame`'s switch — and if it's room-scoped, copy the existing `if (message.roomId === get().joinedRoomId)` gate. 3. Add any new state slice to the store's interface + initial value.

#### Add a new client→server message (top-level)
Add the variant to the `ClientMessage` union in `src/app/net/ws.ts`, then call `ws.send({ type: 'your.msg', … })` from a store action (see `useGame.replaySeek` for the pattern of a non-`game.action` top-level message).

#### Add a new game action
1. Add the `{ kind: '…' }` object to `GameAction` (freeform v1) or `GameActionV2` (turns/phases/combat/tools) in `types.ts`. 2. Dispatch it with `useGame.act(action)` (auto-blocked during replay) or a dedicated store action that calls `ws.sendAction`. 3. Optional: add an optimistic branch in `applyEvent()` in `gameStore.ts` for a latency-free local update — if you skip it, the action still works and the board simply snaps to the next `room.state`. Keep the branch a pure `TablePlayer` transform and no-op on any hidden info you don't hold.

#### Add a REST endpoint
Add a one-line typed function to `api.ts` returning `request<T>(method, path, body?)`; the bearer token and error handling are automatic. Add response/request types to `types.ts`. Call it from a store action (usually setting the result into state, e.g. the `refreshDecks`/`refreshFriends` pattern).

#### Add table-local UI state
Put purely presentational, per-table state in `useTableUi`; decide up front whether it persists (wire load/save helpers into `boardModes.ts` and hydrate on seat-known, like `cardScale`) or is ephemeral like the mana pool. Cross-page-but-non-table UI goes in `useUi`.

---

## The Rust Server

A single authoritative Rust binary (crate `prettycardboard-server`) on axum + tokio with rusqlite persistence. Clients never mutate game state directly: they send intents over REST/WebSocket, the server validates and applies them, then fans the results back out. It listens on `PC_PORT` (default 8787) and stores everything in SQLite under `PC_DATA_DIR` (default `server/data`).

**Key files**

- `server/src/main.rs` — Process entry: builds the shared `App` state, opens the DB, restores persisted rooms, mounts the axum router, spawns the room sweeper. Reads `PC_PORT`.
- `server/src/api.rs` — REST surface + bearer-token auth middleware: register/login, decks, friends, rooms list/create/delete (returns a share `code`), match history, endorsements.
- `server/src/ws.rs` — WebSocket surface and the fan-out pipeline. `dispatch_action` is the single choke point every game action flows through; also membership/presence/join/leave/spectate and `build_zones` on deal.
- `server/src/game.rs` — The rules engine: the `Action` enum (the gameplay protocol), the authoritative `apply()` dispatcher, snapshot history for undo/redo/replay, and zone/turn helpers.
- `server/src/game/turns.rs` — Turn order, the per-seat turn clock, and auto-turn (untap + draw) bookkeeping.
- `server/src/rooms.rs` — The `Room`/`Player`/`Card`/`Combat` data model, per-viewer projection (`state_for`), write-behind persistence, `build_zones` (game-aware), and the expiry `sweeper`.
- `server/src/db.rs` — SQLite schema + queries: users, decks (with `game`), friends, rooms, match_history (with `game`), endorsements.

#### The action pipeline (understand this first)

Every gameplay mutation — dragging a card, adding life, passing the turn, resolving combat — flows through **one** function, `ws::dispatch_action`, which calls `game::apply(&mut Room, actor, action)`. `apply` is a mostly-pure dispatcher: it validates the `Action`, mutates the room, and returns an `Applied` struct describing everything that must be sent:

- `for_actor` / `for_others` — the per-viewer `room.event` delta (hidden info such as hand contents is already filtered per recipient).
- `log` / `extra_logs` — human-readable log lines.
- `extra_broadcasts` — whole-room messages (e.g. `combat.results`).
- `private` — per-user messages (e.g. `library.cards`, `cmd.choice`).
- `resync` — when set, everyone also gets a fresh, per-viewer `room.state`.

`dispatch_action` then delivers each of those. **Every room-scoped message is stamped with `roomId`** so a client seated at several tables only applies the events for the table it is currently viewing.

#### State ownership & concurrency

`App` (main.rs) holds the shared in-memory state behind `DashMap`s: `rooms` (id → Room), `codes` (share code → roomId), `conns` (userId → live sockets), and `user_rooms` (who is seated where). A room is locked individually with `rooms.get_mut(id)`. **Never hold a DashMap reference across an `.await`** — that is the classic deadlock footgun here.

#### Persistence & restore

Rooms are persisted with a **2-second write-behind**: mutating a room marks its id dirty, and a flush task drains the dirty set every ~2s and writes the full board JSON to SQLite. On boot, `main.rs` restores every persisted room and rebuilds the `codes`/`user_rooms` indexes, so seats and in-progress games survive a server restart. The `sweeper` expires idle rooms (quick rooms a day after everyone leaves; persistent lobbies after ~30 idle days). The match timeline (snapshot history) is persisted too, so undo works across restarts.

#### Per-viewer projection (privacy)

Clients never receive another player's hidden information. `rooms::state_for(viewer)` produces the snapshot each recipient is allowed to see — your own hand and library are yours; opponents see only counts and public zones. This is enforced server-side, so a tampered client cannot reveal a hidden card.

#### Multi-game

The server is game-aware without a rules engine per game. `build_zones(cards, flag_commanders, game)` lays a deck into the fixed six zone slots and stamps the right cached image path per game (`mtg` | `cyberpunk`); starting resources (life/Gigs, etc.) and the log prose are chosen from the room's `game`. The board itself is freeform — the server tracks positions and zones, not legality — so a new game is mostly data (a GameDef on the client + a branch in `build_zones`).

#### Snapshot history & combat

`game.rs` keeps a per-room snapshot stack driving undo/redo/rewind and replay scrub. Combat is a small declare → lock → respond → resolve state machine on `Combat`; the resolving step applies life loss, blocker trades, and deaths, then broadcasts `combat.results`. Invariant: a **locked** combat resolves server-side exactly once — do not also stash it for the legacy un-locked path, or damage double-applies.

**Flow**

client WS `game.action` → `ws::game_action` → `dispatch_action` → `game::apply(&mut Room, actor, action)` → `Applied {for_actor, for_others, log, broadcasts, private, resync}` → fan-out to each viewer (roomId-stamped) → per-viewer `room.event` / `room.state`. REST calls (`api.rs`) go token-auth middleware → handler → SQLite.

**Gotchas**

- Never hold a `DashMap` ref (`rooms.get_mut`) across an `.await` — deadlock risk.
- Every room-scoped WS message must be stamped with `roomId`; a client can be in several rooms and filters by it.
- Hidden info is filtered only in `state_for`/the per-viewer deltas — never send raw hand/library to `for_others`.
- Write-behind is ~2s, so an unclean crash can lose up to a couple seconds of the most recent state.
- A locked combat resolves server-side once; the legacy un-locked flow is the only one that stashes `last_combat`.
- Bots/AI were removed (task #18) — there is no `bot.rs`; every action comes from a human client.

**Making a change here**

To add a **gameplay action**: add a variant to the `Action` enum in `game.rs`, handle it in `apply()` (mutate the room, return an `Applied`), and call it from the client via `net/ws.ts` (`act({kind: ...})`). To add a **REST endpoint**: add a handler in `api.rs` and a route in `main.rs`, then a wrapper in `net/api.ts`. To add a **game**: extend `build_zones` (zone layout + image path) and starting resources server-side, and add a `GameDef` on the client (`data/games.ts`). Verify with the `playtest/` harness (it speaks the real WS/REST protocol).

---

## Multi-Game Registry & Card Data

A single client-side registry (`GameDef` per game) that layers Magic: The Gathering and Cyberpunk TCG onto one freeform, game-agnostic server, plus the bundled card catalogs and image-resolution helpers that feed every deck, table, and browse surface. The server only shuffles cards between fixed zones and never judges legality, so a "game" is almost entirely presentation + defaults defined here.

**Key files**

- `src/app/data/games.ts` — The registry itself: the GameDef type, the MTG and CYBERPUNK entries, and the getGame/resolveCardImage/zoneLabel accessors the whole client reads.
- `src/app/data/cards.ts` — LIGHT, always-loaded half of MTG data: card-image/art-crop resolution (bundled cache vs Scryfall CDN) driven by the tiny precon-ids manifest; also color-order constants and PreconCard/Precon type shapes.
- `src/app/data/precons.ts` — HEAVY, lazy-only half of MTG data: the full ~850KB Final Fantasy Commander precon decklists (precons.json) plus preconDeckCards() to convert one to the protocol's DeckCard[].
- `src/app/data/catalog.ts` — The MTG Browse catalog: every Commander precon since 2020 (catalog.json), grouped-by-year/featured helpers, and catalogDeckCards() — art is NOT bundled, it resolves through Scryfall at view time.
- `src/app/data/cyberpunk.ts` — The Cyberpunk card set (cyberpunk-cards.json), bundled-art resolution, and the procedural mono-color starter-deck builder (cyberpunkCatalog/cyberpunkStarters) that respects the Legends/RAM deck rules.
- `src/app/data/deckCover.ts` — Game-aware deck cover/art resolution (deckSummaryCover/deckSummaryArt): MTG Scryfall URL vs Cyberpunk coverCardId→bundled art.
- `src/app/net/types.ts` — Protocol contract the registry targets: the fixed 6-slot Zone union, the 3-value Board union, DeckCard, and the game?: string field on RoomState/Deck/DeckSummary.
- `src/data/precon-ids.json` — 13KB manifest ({ids, commanderIds}) of which printings ship in public/cache — the light key that lets cards.ts choose local cache without loading the 850KB decklists.
- `scripts/sync-precons.mjs` — Build-time pipeline: pulls MTGJSON precons through Scryfall, writes precons.json + precon-ids.json, and downloads faces/art into public/cache/cards + public/cache/art.
- `scripts/sync-cyberpunk.mjs` — Build-time pipeline: pulls the Netdeck.gg Cyberpunk API, downloads signed-CDN images to public/cache/cyberpunk/*.webp, and writes cyberpunk-cards.json with only local paths.

#### The GameDef abstraction

The server (`server/`, protocol in `PROTOCOL.md`) is a *freeform* engine. It moves card instances between a fixed set of six zones — `Zone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'command'` — and stores decks with a fixed three-value `Board = 'commander' | 'main' | 'side'` (both from `src/app/net/types.ts`). It never enforces rules. Everything that makes a table *feel* like Magic or like Cyberpunk lives in one client-side object per game: the `GameDef` in `src/app/data/games.ts`.

A `GameDef` declares:
- `zones: GameZoneDef[]` — the rail zones, each mapping a human `label` onto one of the six physical `slot`s, with optional `hidden` (private pile shown as a count, like a library) and `unused` flags. MTG labels `library→"Library"`, `graveyard→"Graveyard"`, etc.; Cyberpunk *relabels the same slots*: `library→"Deck"`, `command→"Legend"`, `exile→"Eddies"`, `graveyard→"Trash"`. No server change is needed — a game just renames and hides slots.
- `resources: GameResourceDef[]` — the player vitals. MTG has `life` (primary; `start` is a function of format: 40 for commander, 20 otherwise) and `poison`. Cyberpunk has `net` (primary) and `ram`. Exactly one is flagged `primary` (rendered large).
- `phases` — the turn-phase ribbon. MTG lists seven (`upkeep…end`); Cyberpunk's is empty `[]`, meaning freeform turn passing with no ribbon.
- `stats: GameStatDef[]` — which card stats appear on badges/popups (MTG: `mana`, `pt`; Cyberpunk: `cost`, `power`, `ram`).
- `deck: GameDeckRules` — `size`, `singleton`, `startingHand`, and an optional `anchor` that maps a special card group onto the `commander` board slot. MTG's anchor is `{board:'commander', label:'Commander', count:1}`; Cyberpunk's is `{board:'commander', label:'Legend', count:3}`.
- `formats`, `tapping`, `accent` (brand hex, deliberately distinct so the two game tags read apart), plus `resolveImage(cardId)` — the function that turns a card id into a face-image URL, wired to `cardImage` (MTG) or `cyberpunkImage` (Cyberpunk).

Both games are exported in `GAMES: Record<GameId, GameDef>` and `GAME_LIST`. `DEFAULT_GAME = 'mtg'`.

#### How the client reads the registry

The client never hard-codes Magic. It calls `getGame(room.game)` (or `getGame(deck.game)`) and reads fields off the returned `GameDef`. `getGame` is defensive: any unknown/absent id falls back to `DEFAULT_GAME`, so pre-multigame snapshots (whose `RoomState.game` is `undefined`) transparently render as MTG. Representative consumers:

- **Vitals** (`src/app/pages/table/Vitals.tsx`) reads `gdef.resources` to label the big primary number and the secondary tracker (`Life`/`Poison` vs `Net`/`RAM`), and swaps the poison Skull icon for a Cpu. The floating-mana pad (`ManaBar`) *self-gates on the registry*: it renders only when `getGame(room.game).stats.some(s => s.id === 'mana')`, so Cyberpunk never sees it.
- **PhaseRibbon** (`src/app/pages/table/PhaseRibbon.tsx`) returns `null` when `getGame(room.game).phases.length === 0`, hiding the strip for Cyberpunk.
- **Deck builder** — `NewDeckWizard.tsx` renders one tile per `GAME_LIST` entry, then `getGame(game)` to drive labels; `DeckEditor.tsx` calls `resolveCardImage(deck.game, id)` for every preview and enforces copy limits from the deck rules. Legends drop into the `command`/anchor slot.
- **Labels/art everywhere else**: `zoneLabel(gameId, slot)` (rail captions), `resolveCardImage(gameId, cardId)` (game-aware face routing), `GameTag`/`GameBadge` (`src/app/components/GameTag.tsx`, which keeps the React icon glyphs since those can't live in the data module), and `deckCover.ts` for tile covers.

#### Bundled card data and the light/heavy split

The MTG precon data is deliberately split for bundle size. The whole app calls image resolution during render, so `cards.ts` must ship in the initial payload — but it needs only the **13KB** `precon-ids.json` manifest (`{ids, commanderIds}`) to decide bundled-cache-vs-CDN. The **850KB** decklists in `precons.ts`/`precons.json` are import-only from lazy routes or `await import(...)` (e.g. account seeding in `appStore.ts`, the card-detail popup). `catalog.ts` holds the far larger Browse catalog (712KB `catalog.json`, every Commander precon since 2020) whose card **art is not bundled at all** — only deck data ships; images resolve through Scryfall at view time.

Cyberpunk's data is a single file, `cyberpunk-cards.json` (~90KB) loaded by `cyberpunk.ts`; every rendered face *is* bundled under `public/cache/cyberpunk/`, so Cyberpunk play is fully offline-capable. Card identity is the Netdeck UUID, stored in the same `DeckCard.scryfallId` slot MTG uses for its Scryfall id (the field name is legacy; treat it as a generic card id).

#### Image resolution (bundled cache vs CDN)

`cardImage(scryfallId)` in `cards.ts` checks the manifest: bundled printings return `${BASE}cache/cards/{id}.jpg` (local), everything else returns a sharded Scryfall CDN URL built from the id's first two hex chars (`cards.scryfall.io/normal/front/{a}/{b}/{id}.jpg`). `artCrop`/`commanderArt` do the same for wide crops, but only commander art is bundled (`commanderIds`). `cyberpunkImage(id)` returns `${BASE}cache/cyberpunk/{id}.webp` for known ids, `''` otherwise. `resolveImage`/`resolveCardImage` route between the two by game — which is essential, because calling `cardImage` on a Cyberpunk UUID would fabricate a bogus Scryfall URL.

**Flow**

Build time: `scripts/sync-precons.mjs` (MTGJSON→Scryfall) writes `precons.json` + `precon-ids.json` and downloads faces/art to `public/cache/{cards,art}`; `scripts/sync-cyberpunk.mjs` (Netdeck.gg API) downloads signed-CDN images to `public/cache/cyberpunk/*.webp` and writes `cyberpunk-cards.json` (local paths only); `scripts/sync-catalog.mjs` writes `catalog.json` (no images). → Runtime import: `cards.ts` loads only the 13KB `precon-ids.json`; the heavy `precons.json` (via `precons.ts`) is loaded lazily/dynamically. → Registry lookup: a component takes `room.game`/`deck.game` (a string on `RoomState`/`Deck`/`DeckSummary`) → `getGame(id)` → a `GameDef` (defaulting to MTG). → The component reads `zones`/`resources`/`phases`/`stats`/`deck` off the def to render labels, vitals, phase ribbon, gating (e.g. mana pad, Legend anchor). → Face art: `resolveCardImage(game, cardId)` → `cardImage`(bundled cache OR Scryfall CDN) for MTG, or `cyberpunkImage`(bundled webp) for Cyberpunk. → Deck→server: `preconDeckCards`/`catalogDeckCards`/`cyberpunkDeckCard`/`cyberpunkStarters` convert bundled data into `DeckCard[]` (anchor→`board:'commander'`, rest→`'main'`) and `api.createDeck(name, format, cards, cover, game)` persists it, seeded on first sign-in in `appStore.ts`.

**Gotchas**

- The server has exactly six zones and three boards and never changes; a new game can only RELABEL/hide slots and map its anchor group onto the `commander` board. You cannot add a genuinely new zone without a server/protocol change.
- `DeckCard.scryfallId` is a legacy field name reused as a generic card id — it holds a Netdeck UUID for Cyberpunk cards. Don't assume it's a Scryfall id.
- Never call `cardImage()` directly on a Cyberpunk id: it builds a Scryfall CDN URL from the id's first two chars and would 404. Always go through `resolveCardImage(game, id)` / `resolveImage`, which route by game.
- `getGame(undefined|unknown)` silently returns the MTG def (DEFAULT_GAME). This is intentional for pre-multigame snapshots but means a typo'd game id renders as Magic instead of erroring.
- The light/heavy split is load-bearing for bundle size: `cards.ts` must stay dependency-light (manifest only). Importing `precons.ts` from an always-loaded module would pull the 850KB `precons.json` into the initial payload. Import it only from lazy routes or via `await import(...)`.
- `catalog.json` ships deck data but NOT artwork — those cards fetch from the Scryfall CDN at view time, so Browse needs network for images even though deck contents are offline. `precons`/`cyberpunk` faces, by contrast, are fully bundled.
- Image extensions differ by source: MTG cache is `.jpg` (`cache/cards`, `cache/art`), Cyberpunk cache is `.webp` (`cache/cyberpunk`). All paths are prefixed with `import.meta.env.BASE_URL`.
- Cyberpunk resource rules (Net = win metric, RAM = per-turn pool) are freeform trackers with rules marked TBD in the code — the server enforces nothing; players adjust vitals manually.
- Cyberpunk starter decks are generated PROCEDURALLY at runtime by `buildColorDeck` in `cyberpunk.ts` (not stored as JSON). They rely on the real deck-building rules — three unique-named Legends set a per-color RAM budget; `pickLegends` skips Legends with null RAM (e.g. Rebecca can't anchor a deck) — so changes to the bundled card pool can change what decks are produced.
- Zone labels have two fallback layers: `zoneLabel` first checks the game's `zones` list, then a hard-coded slot→name map for slots a game doesn't relabel (notably `hand`/`battlefield`, which are the play areas and aren't in the rail `zones` array).

**Making a change here**

#### Adding a new card game

1. **Add the id and a `GameDef`** in `src/app/data/games.ts`: extend the `GameId` union, write a const like `MTG`/`CYBERPUNK`, and register it in `GAMES` and `GAME_LIST`. Decide how your zones map onto the six fixed slots (`library/hand/battlefield/graveyard/exile/command`), which resource is `primary`, whether you have `phases` (empty = freeform turns, no ribbon), your `stats`, `deck` rules (with an optional `anchor` mapped to the `commander` board), `formats`, `accent`, and a `resolveImage`.
2. **Bundle the card data.** Write a `scripts/sync-<game>.mjs` that fetches the set, downloads faces into `public/cache/<game>/`, and writes `src/data/<game>-cards.json` with *local* image paths. Add a `src/app/data/<game>.ts` (model of `cyberpunk.ts`) exposing the card list, a `by-id` map, a `<game>Image(id)` resolver, and `DeckCard`-conversion helpers. Wire `resolveImage` in the GameDef to your resolver.
3. **Add the React glyph** in `src/app/components/GameTag.tsx`'s `ICONS` map (icons can't live in the data module).
4. **Seed starter decks** (optional) in `src/app/state/appStore.ts`, following the `cyberpunkStarters()` block — call `api.createDeck(name, format, cards, cover, '<game>')`.

Because every table/deck/browse surface already reads through `getGame`, `zoneLabel`, `resolveCardImage`, and the resource/phase/stat/deck fields, most UI needs no per-game branching — it inherits from the registry. Add explicit `if (game === '<id>')` gating only for genuinely game-specific widgets (as Vitals does for the mana pad and token picker).

#### Common smaller changes

- **Relabel a zone / change a vital / add a phase**: edit the relevant `GameDef` field in `games.ts`; the rail, Vitals, and PhaseRibbon pick it up automatically.
- **Refresh bundled cards/art**: re-run the matching `scripts/sync-*.mjs`. For MTG this rewrites both `precons.json` and `precon-ids.json` (keep them in sync — the manifest is what `cards.ts` consults to choose cache vs CDN) and repopulates `public/cache/{cards,art}`.
- **Add a featured Browse deck (MTG)**: add its id to `FEATURED_IDS` in `catalog.ts`.

---

## In-Game Table / Gameplay UI

The live match screen: a server-authoritative, freeform 2.5D tabletop where one board is staged at a time (the active or pinned seat), the rest shrink to rail minis. It renders the battlefield, fanned hand, zone piles, vitals, combat affordances, and all the table overlays, and translates player gestures into game actions sent over the websocket. It is game-agnostic (MTG + Cyberpunk) via the GameDef registry.

**Key files**

- `src/app/pages/TablePage.tsx` — Shell: stages ONE board, frames the rest, hosts the top bar/PhaseRibbon, right SidePanel (Vitals+Timeline+Players+log), the shared card context menu (CardMenu), and mounts every overlay. Also owns the Space/T hotkeys and preference-mirroring.
- `src/app/pages/table/MyBoard.tsx` — My side: free-placement battlefield, the whole pointer drag engine (v2: arm-threshold, tilt, ghost, snap-on-drop, local droppedPos/zOrder), fanned hand, board-mode + dice/marker toolbars, board right-click menu, token picker. Still large; mid-refactor (Vitals + HandCard already split out).
- `src/app/pages/table/Vitals.tsx` — Right-rail personal cluster: life stepper, draw/untap/shuffle/token/settings row, token form, the MTG-only floating-mana pad (ManaBar), and the commander-damage + poison tracker. All actions target `me`.
- `src/app/pages/table/HandCard.tsx` — One fan card with macOS-Dock magnification driven by motion values off a shared `handX`; shared by MyBoard and OpponentHand.
- `src/app/pages/table/bits.tsx` — Battlefield/zone building blocks: groupAttachments, the 3D LibraryStack, ZonePiles (deck/graveyard/exile/command with draw/peek/search menus + drag-out), CounterBadges, AttackBadge, BlockCluster, TaxBadge, CmdCard.
- `src/app/pages/table/overlays.tsx` — Modal moments: LibraryViewer (peek reorder), PileViewer (public graveyard/exile browser), MulliganOverlay (deal + bottom-N), CmdChoiceDialog (commander-return prompt), RollBanner (dice/damage banner).
- `src/app/pages/table/boardModes.ts` — Layout modes (free/assist/rows/grid) + drop math: snapDrop, hostUnderPoint, tidyPositions, card classification (isLand/isCreature/typeLine), effectivePT/ptLabel, card-scale + board-mode localStorage persistence.
- `src/app/pages/table/juice.ts` — Feel primitives: restTilt, dragTilt, juicePulse, SETTLE_EASE, and the flight-anchor registry (setFlightAnchor/flightAnchor) + flyCard/flyToAnchor/flyFromAnchor WAAPI clone arcs. Fire-and-forget, never blocks input, degrades under reduced-motion.
- `src/app/pages/table/SeatFrame.tsx` — An opponent's seat: header vitals, their battlefield at raw coords, public piles; big when staged. Owns the defender combat flow (click an attacker aimed at you → blocker picker).
- `src/app/pages/table/OpponentHand.tsx` — The staged opponent's hand at screen level: same fan/peek/hide as mine but shows backs unless revealed, flips 180° in mirror mode.
- `src/app/pages/table/tableUi.ts` — Zustand store for table-local UI: boardMode, cardScale, blockerIid, libIntent, pileView, and the ephemeral floating-mana pool. Presentational glue only; server truth is in gameStore.
- `src/app/pages/table/TimelineCard.tsx` — Undo/redo + the event-strip scrubber; seeking enters read-only replay, host can rewind the table to a past stop.
- `src/app/pages/table/PhaseRibbon.tsx / TurnCue.tsx / StackTray.tsx` — Turn chrome (marker chips, turn clock, End-Turn/combat cluster; per-phase strip parked behind `false`), the your-turn pill, and the shared center stack tray.
- `src/app/pages/table/shims.ts` — Client-side contract patch: re-inserts freshly minted tokens the store reducer misses on token.create/token.clone v1 events, deduped by iid.
- `src/app/components/CardPopup.tsx` — Universal card lightbox (click any card): flip-in over a blurred backdrop, full-size foil/tilt, details from bundled precon data then a cached Scryfall fetch (Cyberpunk details ship offline).
- `src/app/components/HoverCard.tsx` — Global hover-zoom layer: rests on any GameCard's `data-preview-src`/`data-preview-name` and floats a larger copy after a 400ms delay. Mouse-only; touch keeps tap→CardPopup.
- `src/app/components/GameCard.tsx` — The one card renderer: pointer-tracked 3D tilt, moving glare, holo-foil, tap-rotate; emits the hover-zoom data attributes. Memoized (heaviest leaf).
- `src/app/state/gameStore.ts` — Server-authoritative room state + `act()` (which just forwards to ws.sendAction, frozen during replay); replay/undo/timeline plumbing.

#### The staging model

`TablePage` is a thin shell over the game store. It reads `room` — normally the live authoritative `useGame(state => state.room)`, but **while scrubbing a replay it renders `replay.frame` instead**, so the whole table becomes a read-only past snapshot. Everything downstream just consumes `room`.

Once a match starts, exactly **one board owns the stage**: `stagedSeat = room.started ? (pinnedSeat ?? room.activeSeat) : null`. If that seat is me, `MyBoard` renders; otherwise TablePage renders that opponent's `SeatFrame` with `stage`, plus their `OpponentHand` at the screen bottom and a floating "View my board" cue. A manual pin (clicking a `PlayersCard` row or the mini rail) overrides `activeSeat` but is cleared whenever the turn moves on or combat begins (see the `useEffect`s keyed on `activeSeatNow`/`combatOn`). Opponents that aren't staged show as compact `SeatFrame`s in the pre-start grid or the right rail. Combat always stages the active/attacker seat.

#### MyBoard: the drag engine

`MyBoard` is where most of the complexity lives. The battlefield (`.myField`) is free-placement: each card's normalized `x`/`y` (0–1 field fractions) come from the server, and `renderFieldCard` positions it with `left/top` percentages. Cards get a deterministic `restTilt(iid)` wobble unless the `verticalCards` preference is on.

Pointer handling is centralized on the `.myBoard` container (`onPointerMove=moveDrag`, `onPointerUp=endDrag`); individual cards and piles call `beginDrag`. A drag only becomes "real" once the pointer travels 6px (`dragOrigin.current.armed`) — below that it's a click/tap (preview, or double-click-to-tap on the field via `clickFieldCard`'s 230ms timer). Two families of drag exist:

- **Battlefield drags** move the card in place; `beginDrag` records a *grab offset* so the card tracks the point you grabbed, not its center.
- **Hand / pile / library drags** ride a pointer-following `.dragGhost`; the real card only moves on drop.

`endDrag` is the router: it computes the release position (`fieldPos` → `snapDrop` by board mode), then decides between `pileUnderPoint`, `inHandZone`, `inReservedBand`, and assist-mode `hostUnderPoint` (attach). Library drags dispatch `library.play` (the client never holds the hidden deck, so it drags a face-down placeholder and the server plays the real top card). Crucially, **the final position is committed once on drop** via `act({kind:'card.pos'...})` — dragging is fully local until release (an earlier version streamed positions every frame). To hide the network round-trip, the dropped position is held in local `droppedPos` state until the server echo catches up, and `zOrder`/`bumpZ` give the newest-placed card the top z-index locally.

#### Vitals, mana, and the game registry

`Vitals` (in the `SidePanel`) is the personal cluster and only renders for the seated player. Labels are game-driven: `getGame(room.game).resources` relabels life/poison as Net/RAM for Cyberpunk. The **floating-mana pad** (`ManaBar`) self-gates on `getGame(room.game).stats.some(s => s.id === 'mana')` (MTG only). It is a pure client aid — freeform play has no rules engine feeding a mana pool — and its state lives in `useTableUi.mana`, deliberately **never persisted and never server-synced** (it's cleared on each fresh deal in TablePage's start effect). Left-tap adds a pip, right-click/minus-badge/hold spends, the Pill's `onRemove` empties the pool.

#### Zones, overlays, and flight

`ZonePiles` (bits.tsx) renders deck/graveyard/exile/command. The library is a 3D `LibraryStack` whose thickness tracks card count; left-click draws, right-click/long-press opens the peek/search/reveal/shuffle/mulligan menu. Piles register **flight anchors** — keyed strings like `lib:${userId}`, `grave:${userId}`, `hand:mine`, `field:mine`, `stack` — via `setFlightAnchor`, storing live DOM elements so any action anywhere can arc a card clone between zones (`flyCard`/`flyFromAnchor`/`flyToAnchor` in juice.ts) without prop-drilling refs. The context menu's `moveWithArc` uses these to garnish zone moves.

`overlays.tsx` holds the modal moments. Note the split: the library **peek** intent opens the `LibraryViewer` reorder modal, but the **search** intent (`libIntent === 'search'`) makes LibraryViewer bail and lets `LibrarySidebar` (a drag-to-play side panel) handle it instead. Overlays are suppressed during replay because `room` is then a historical frame.

#### Two card viewers

There are two distinct "look at a card" affordances, both app-wide, both wired through `GameCard`. **CardPopup** is the click lightbox (flip-in, full details). **HoverCardLayer** is the passive mouse-only hover-zoom that floats a bigger copy after a 400ms rest — it works with zero per-site wiring because `GameCard` emits `data-preview-src`/`data-preview-name` and HoverCard listens globally. Touch skips the hover path (tap → CardPopup is the right gesture).

**Flow**

User gesture on a card (click/drag/menu) → optimistic local feedback (droppedPos + zOrder + juice flight clone) → `act(action)` → `gameStore.act` (no-op if `replay.active`) → `ws.sendAction` → server (authoritative game engine) → broadcasts `room.event` / `room.state` → gameStore reducer updates `useGame.room` (+ `log`, `timeline`, `undoState`) → components re-render from the new room → local `droppedPos`/`zOrder` overrides self-clear once the server x/y matches. Replay branch: TimelineCard `replaySeek(index)` → `replay.seek` message → server returns a historical frame → `replay.frame` replaces the live room everywhere until `replayExit`.

**Gotchas**

- MyBoard is still the big file and is mid-refactor: Vitals and HandCard have been extracted but the whole drag engine, board menus, token picker, and hand fan still live inline. Prefer extracting further over adding to it.
- Board layout modes (free/assist/rows/grid) only shape where YOUR OWN drops land — they rewrite the x/y you send. Every other player's cards always render at raw server coordinates. `snapDrop`/`hostUnderPoint` are client-only heuristics; the server never classifies cards.
- `act()` is frozen while `replay.active` (gameStore returns early). Any new interactive control must tolerate being on a read-only historical frame, and TablePage already gates the interactive overlays behind `!replay.active`.
- The floating-mana pool is intentionally NOT persisted and NOT server-synced, and is wiped on each new deal. Don't 'fix' this by saving it — a restored pool would be wrong.
- Card positions are committed only on drop, not streamed during the drag. The local `droppedPos` map masks the network round-trip; if you bypass it you'll reintroduce the release 'jitter' (task #13).
- Flight anchors are a global mutable Map of live DOM elements keyed by string (often including userId). `flightAnchor` returns null if the element is unmounted/`!isConnected`; anchors must be registered via ref callbacks and are order/lifetime sensitive.
- shims.ts patches a live-server contract mismatch (token.create/token.clone rebroadcast the token under action.card while the reducer expects action.token). It relies on running AFTER the store's own ws listener (insertion order) and dedupes by iid. Fixing the server or store could make it double-place if not removed together.
- Combat is deliberately inform-first and manual: no attack/block arrows, and taking damage / creature deaths are manual (the 'take damage' button subtracts unblocked power; you drag dead creatures to the graveyard). There are two block entry points — a legacy blocker-first pairing (blockerIid on my board) and the defender flow (SeatFrame's blockPick).
- HoverCard fires on a delayed timer and can run against a node that was played/moved out from under a still pointer; it guards on `isConnected` and zero-size rects. The per-phase PhaseRibbon strip is parked behind `false &&` — flip the guard to bring it back.
- MyBoard renders only when `(!room.started || stagedIsMe)`; viewing an opponent's board hides your hand/deck/piles entirely. Don't assume MyBoard is always mounted during a match.

**Making a change here**

**Add a new card action (context menu):** the per-card menu is `CardMenu` inside `TablePage.tsx`, branched by `menu.zone` (battlefield/hand/graveyard/exile/command). Add an `item(label, action, anchorKey?)` — passing an `anchorKey` (a flight-anchor string) makes it arc a clone via `moveWithArc`. The action object must be a valid `GameAction`/`GameActionV2` from `net/types.ts`; it flows straight through `act()` to the server, so the server engine must also handle the new `kind`.

**Add a board layout mode:** extend `BoardMode` and `BOARD_MODES` in `boardModes.ts`, add a case to `snapDrop` (and `tidyPositions`/`hostUnderPoint` if relevant), then add the option to the `SegmentedControl` in `MyBoard`'s `boardTools`. Modes are persisted per user in localStorage via `saveBoardMode`, hydrated in TablePage.

**Add a zone-flight garnish to an existing action:** register the source/target element with `setFlightAnchor('yourkey', el)` in a ref callback, then call `flyFromAnchor`/`flyToAnchor`/`flyCard` (juice.ts) around the `act(...)`. It's pure garnish — never gate real state on it.

**Add a table overlay/modal:** create it in `overlays.tsx` (or its own file), drive its open/close off either `useTableUi` (for UI-only state like `pileView`/`libIntent`) or `useGame` (for server-driven state like `mulligan`/`cmdChoice`), and mount it in TablePage's overlay block — remember to gate it with `!replay.active` if it's interactive.

**Add a right-rail vitals control:** put it in `Vitals.tsx`; game-specific controls should self-gate on the `getGame(room.game)` registry (resources/stats/phases) the way `ManaBar` does, rather than hard-checking `room.game === 'cyberpunk'`.

---

## Deck Building, Browse, and the Card-Data Pipeline

The deck-building surface (a game-aware editor with search, live mana-curve/identity stats, and text/Moxfield import), the shared cross-game "discover" Browse layout, the Scryfall network client plus its client-side card-metadata registry, and the three offline sync scripts that bake bundled card data + artwork into the repo. The server stores only skeletal decklists (id + name + quantity + board), so all rich card knowledge lives on the client — learned at runtime for MTG and shipped in-bundle for Cyberpunk.

**Key files**

- `src/app/pages/deckbuilder/DeckEditor.tsx` — The deck editor page: hero header, stats strip (curve/identity/size/bracket/analytics), game-aware search bar, grouped decklist, debounced autosave; ~1000 lines and the hub that wires everything together.
- `src/app/pages/deckbuilder/CardSearch.tsx` — MTG search pane — debounced live full-text Scryfall search; rows add to main deck, crown seats a legendary creature as commander.
- `src/app/pages/deckbuilder/CyberpunkCardSearch.tsx` — Cyberpunk search pane — pure local filter (query + color + type chips) over the bundled 91-card catalog, no network.
- `src/app/pages/deckbuilder/shared.tsx` — Shared deck-builder pieces: TypeBucket enum, TYPE_ORDER/TYPE_LABEL, typeBucket() type-line classifier, and the ManaPips/ColorPips symbol renderers.
- `src/app/pages/deckbuilder/ImportDialog.tsx` — Import modal — paste a text decklist (parseDecklist + resolvePrintings) or pull a Moxfield URL (fetchMoxfieldDeck); both land in api.createDeck.
- `src/app/components/BrowseCatalog.tsx` — The game-agnostic discover layout: defines BrowseDeck/BrowseFacet, renders the toolbar (search + facet chips + sort + group), featured shelf, grouped tile grids, and the add-to-my-decks BrowseTile.
- `src/app/pages/BrowsePage.tsx` — Browse page shell: game switcher + per-game adapters that map CATALOG (MTG precons) and cyberpunkCatalog() into the common BrowseDeck shape and pass facet/group config into BrowseCatalog.
- `src/app/data/scryfall.ts` — Scryfall client (searchCards / resolveNames / resolvePrintings / hydrateCardMeta / fetchPrintings) plus the module-level KNOWN metadata registry seeded from bundled precons.
- `src/app/data/cards.ts` — Image resolution (cardImage/artCrop): reads the tiny precon-ids.json manifest to pick bundled cache vs Scryfall CDN without loading the 850KB decklists; also PreconCard/Precon types + COLOR_ORDER.
- `src/app/data/games.ts` — The GameDef registry (MTG, Cyberpunk): zones, resources/vitals, phases, deck rules, and resolveImage; resolveCardImage() routes a card id to the right game's image source.
- `src/app/data/cyberpunk.ts` — Bundled Cyberpunk card set + BY_ID lookup + cyberpunkImage(), and the deterministic starter-deck builder (cyberpunkCatalog/cyberpunkStarters) enforcing the 3-Legend RAM-budget rules.
- `src/app/data/catalog.ts` — Bundled MTG precon catalog helpers: CATALOG list, featuredDecks(), catalogDeckCards()/catalogIdentity()/catalogCardCount() adapters.
- `src/app/data/formats.ts` — DeckFormat table (Commander/Brawl/Standard/…/Freeform) with size, copy-limit, hasCommander, brackets rules; formatFor() defaults unknown strings to Freeform.
- `scripts/sync-precons.mjs` — Syncs the 4 bundled Final Fantasy precons (MTGJSON + Scryfall): writes src/data/precons.json, downloads card images + commander art to public/cache/, and emits the src/data/precon-ids.json manifest.
- `scripts/sync-catalog.mjs` — Syncs every Commander precon since 2020 (MTGJSON) into src/data/catalog.json as compact [sid,name,qty] rows — data only, art via CDN at view time.
- `scripts/sync-cyberpunk.mjs` — Syncs the Cyberpunk TCG set from Netdeck.gg into src/data/cyberpunk-cards.json and downloads every card face to public/cache/cyberpunk/ (signed CDN URLs are never persisted).

#### The metadata problem this subsystem solves

The axum server persists a deck as a list of bare `DeckCard`s: `{ scryfallId, name, quantity, board }` (see `src/app/net/types.ts`). It knows nothing about type lines, mana costs, or color identity. Yet the editor needs all of that to group the decklist, draw a mana curve, and flag commander color-identity violations. The design answer is a **client-side, ephemeral metadata registry** in `src/app/data/scryfall.ts`: a module-level `Map<string, CardMeta>` called `KNOWN`, keyed by Scryfall id.

`KNOWN` is seeded at import time from the four bundled precons (`for (const precon of PRECONS)`), so a brand-new account's starter decks are fully known with zero network. Beyond that it fills in opportunistically: every Scryfall payload that passes through — `searchCards`, `resolveNames`, `resolvePrintings`, `hydrateCardMeta` — is folded in via `rememberCard()`, which takes the front face for double-faced cards. `getCardMeta(id)` returns `undefined` for cards the session has never seen, and **every consumer treats unknown as "skip"** rather than erroring. This is why the editor degrades gracefully on a half-loaded imported deck.

#### The deck editor (`DeckEditor.tsx`)

Loaded by id. On mount it fetches the deck via `api.getDeck`, then calls `hydrateCardMeta(ids)` to learn any unknown cards over the network; when that resolves it bumps a `metaVersion` counter to force the derived-stats `useMemo` to recompute. That `useMemo` (the `derived` object) is the analytical heart: it splits cards by `board` (`commander`/`main`/`side`), buckets mains by `typeBucket()` for the grouped decklist, builds an 8-slot mana `curve` (0..7+, lands excluded), computes commander color identity and the set of identity **violations** and copy-limit **copyWarnings**, tallies per-type counts, average mana value, land count, and the Commander **bracket** (`estimateBracket`). All of it recomputes only when `deck` or `metaVersion` changes.

Editing is funnelled through `mutate(fn)` → sets the new deck and flips `saveState` to `'dirty'`. A debounced effect (`AUTOSAVE_MS = 800`) then persists via `api.updateDeck` and refreshes the sidebar; a `saveSeq` ref guards against out-of-order saves, and a separate unmount effect flushes any still-dirty deck so edits typed in the last 800ms survive a back-navigation. Key card ops: `addCard` (stack in main), `setCommander`/`addCyberCard` (seat an anchor in the `commander` board, demoting the previous one back to main), `changeQuantity` (filters out zero-quantity), and `changeArtwork` — which calls `aliasCardMeta(oldId, newId)` so the chosen printing inherits the old printing's metadata, keeping grouping/curve/identity intact across an art swap.

The editor is **game-aware** via one flag: `const cyber = deck.game === 'cyberpunk'`. Cyberpunk reuses the MTG "standard" format shell but hides the mana curve, color identity, and bracket, and swaps the search pane: `{cyber ? <CyberpunkCardSearch onAdd={addCyberCard}/> : <CardSearch onAdd={addCard} onSetCommander={setCommander} allowCommander={fmt.hasCommander}/>}`. Card faces everywhere resolve through `resolveCardImage(deck.game, id)` so the same JSX renders Scryfall CDN art or the bundled Cyberpunk cache. Import lives in the sibling `ImportDialog.tsx`: the text tab runs `parseDecklist` → `resolvePrintings` (honoring exact set+collector when the line named one, else by name), the Moxfield tab runs `fetchMoxfieldDeck`; both call `api.createDeck` and open the new deck.

#### Search: two very different panes

`CardSearch` (MTG) debounces the query 300ms, requires ≥2 chars, and calls `searchCards` — an online Scryfall full-text search (`/cards/search`), capped at 20, cached per normalized query, with a 404 treated as "no matches". A `searchSeq` ref discards stale responses. Each result row uses `getCardMeta` for its pips/type line and shows a crown action only when `allowCommander && canBeCommander(meta)` (legendary creature). `CyberpunkCardSearch` is the opposite: a synchronous `useMemo` filter over the in-bundle `CYBERPUNK_CARDS` array with color/type `FilterChip`s — no network, no debounce.

#### The shared Browse layout (`BrowseCatalog.tsx` + `BrowsePage.tsx`)

`BrowseCatalog` is a **single layout both games share**. It renders a toolbar (search, facet chips, sort segmented control, optional group-by control), a featured shelf, and grids grouped by the active group-mode; each tile's "Add" calls `api.createDeck` and jumps to `/decks`. It knows nothing game-specific — it operates entirely on the normalized `BrowseDeck` shape (name, cover, art, badge, `identity` node, `facets[]`, `groups{}`, `sortDate`, `cards`, `game`, `format`). `BrowsePage` is the adapter layer: a `SegmentedControl` game switcher (persisted in `sessionStorage['pc_browse_game']`) picks a catalog, then two `useMemo`s map `CATALOG` (MTG precons, grouped by year/set, faceted by WUBRG) and `cyberpunkCatalog()` (per-Legend decks, grouped/faceted by color) into `BrowseDeck[]`, passing game-appropriate `facet` and `groupModes` config into the same component.

#### Image resolution & the manifest split

`cardImage`/`artCrop` in `cards.ts` are called during render across the whole app, so they must stay in the initial payload — but the full precon decklists (`precons.ts`, ~850KB) must not. The compromise: `sync-precons.mjs` emits a tiny `precon-ids.json` (`{ ids, commanderIds }`) that `cards.ts` imports eagerly to decide **bundled cache vs CDN** per id, while `precons.ts` is imported lazily elsewhere. `resolveCardImage(game, id)` in `games.ts` is the game-aware wrapper, dispatching to `cardImage` (MTG) or `cyberpunkImage` (Cyberpunk) through each `GameDef.resolveImage`.

#### The three sync scripts

All three are offline, run-by-hand Node scripts that bake data into `src/data/` (committed) and images into `public/cache/` (committed). **`sync-precons.mjs`** fetches 4 named Final Fantasy Commander decks from MTGJSON, resolves every printing through Scryfall's `/cards/collection` (batched 75), writes the full `precons.json`, downloads each card image + each commander art-crop to disk with a small worker pool, and crucially **also emits `precon-ids.json`** — the manifest `cards.ts` reads. **`sync-catalog.mjs`** walks MTGJSON's `DeckList.json`, keeps every `Commander Deck` released since 2020-01-01, and writes compact `[sid, name, qty]` rows into `catalog.json` — **data only, art via CDN** — so 130+ decks cost ~1MB, not gigabytes. **`sync-cyberpunk.mjs`** pages Netdeck.gg's public API, downloads every rendered card face into `public/cache/cyberpunk/` in the same run (CDN URLs are signed + short-lived), and writes `cyberpunk-cards.json` storing only **local** paths, never the expiring signed URLs.

**Flow**

Build-time (manual): sync-precons.mjs → precons.json + precon-ids.json + public/cache/{cards,art}; sync-catalog.mjs → catalog.json; sync-cyberpunk.mjs → cyberpunk-cards.json + public/cache/cyberpunk. — Runtime seed: precons.ts feeds the KNOWN registry in scryfall.ts; precon-ids.json feeds cardImage/artCrop; cyberpunk-cards.json feeds CYBERPUNK_CARDS. — Browse: BrowsePage adapts CATALOG / cyberpunkCatalog() → BrowseDeck[] → BrowseCatalog tiles → api.createDeck → open in DeckEditor. — Editor: api.getDeck → hydrateCardMeta (Scryfall /cards/collection) → metaVersion bump → derived useMemo (typeBucket grouping + curve + identity/copy warnings + bracket) → render. — Edit: mutate() → saveState 'dirty' → 800ms debounce → api.updateDeck → refreshDecks. — Search add: CardSearch(searchCards→Scryfall)/CyberpunkCardSearch(local filter) → onAdd/onSetCommander → editCards. — Import: paste/URL → parseDecklist/fetchMoxfieldDeck → resolvePrintings → api.createDeck.

**Gotchas**

- Card metadata is per-session and ephemeral — the server never stores type line/mana/identity. Any feature reading getCardMeta MUST tolerate undefined; unknown cards are silently skipped from curves/grouping/identity so a half-hydrated deck never reports fake stats.
- precon-ids.json is a generated artifact of sync-precons.mjs, NOT hand-edited. cards.ts imports it eagerly to keep the initial bundle small; the full precons.ts (~850KB) is lazy. Editing decklists without regenerating the manifest desyncs which images resolve to bundled cache vs CDN.
- cardImage() hardcodes a .jpg extension for bundled ids, while sync-precons.mjs actually writes .jpg OR .webp depending on the source URL. Bundled cards whose Scryfall image was webp can 404 through cardImage — a latent mismatch to watch when adding precons.
- changeArtwork must call aliasCardMeta(old,new) BEFORE swapping the id, or the new printing has no metadata and the card drops out of its type group / curve / identity check until a hydrate happens.
- aliasCardMeta only copies metadata if the target id is not already in KNOWN (it won't overwrite). resolvePrintings strips ★/† from collector numbers when keying bySet — imported foil/special printings match on the cleaned number.
- BrowseCatalog's 'owned' detection is by lowercased deck NAME (ownedNames set), not id — renaming a library deck breaks the owned checkmark, and two catalog decks with the same name collide.
- Cyberpunk decks masquerade as MTG format 'standard' (deck.game distinguishes them, not the format). The editor gates all MTG-only stats on `cyber = deck.game === 'cyberpunk'`; forgetting that flag on a new stat leaks a meaningless mana curve into Cyberpunk decks.
- cyberpunkCatalog()/cyberpunkStarters() are deterministic builders, not stored data — they derive mono-color starter decks from CYBERPUNK_CARDS at call time using the RAM-budget rules. Re-syncing the card set can change the picked Legends/pool.
- The sync scripts are manual (npm run sync:*) and network-dependent; they are not in CI. Cyberpunk art URLs are signed and expire, so images MUST be downloaded in the same run as the listing fetch — you cannot persist the URLs and download later.
- Scryfall etiquette is enforced in-code: searches debounced by callers and cached per query; /cards/collection batched 75 with a 100ms gap (BATCH/BATCH_GAP_MS). Don't add un-batched or un-debounced Scryfall calls.

**Making a change here**

#### Add a new card game to Browse + the deck builder

1. **Bundle its data.** Write a `scripts/sync-<game>.mjs` modeled on `sync-cyberpunk.mjs`: fetch the card set, download faces into `public/cache/<game>/`, and write `src/data/<game>-cards.json` storing only local image paths. Add a `data/<game>.ts` module exposing the typed card array, a `BY_ID` map, and a `<game>Image(id)` resolver (mirror `cyberpunk.ts`).

2. **Register the game.** Add a `GameDef` to `GAMES`/`GAME_LIST` in `data/games.ts` — its `zones` (mapped onto the six fixed server slots), `resources` (vitals), `phases`, `deck` rules, `formats`, and `resolveImage: (id) => <game>Image(id)`. `resolveCardImage` and the whole table UI pick it up automatically.

3. **Give it a Browse view.** In `BrowsePage.tsx`, add a `useMemo` that maps your catalog into `BrowseDeck[]` (fill `facets`, `groups`, `sortDate`, `cards`, `format`, `game`), add the game to the switcher's `GAME_LIST`, and render a `<BrowseCatalog>` branch with your `facet` + `groupModes`. You write zero new layout code.

4. **Give it a search pane.** If cards ship in-bundle, copy `CyberpunkCardSearch.tsx` (local `useMemo` filter). If they come from a network API, copy `CardSearch.tsx`'s debounce+seq pattern. Wire it in `DeckEditor.tsx` next to the existing `cyber ?` branch and add an `add<Game>Card` handler that seats the game's anchor card in the `commander` board.

#### Add a new MTG deck format
Append a row to `FORMATS` in `data/formats.ts` (size, maxCopies, hasCommander, brackets). The editor's format `Select`, size/target ProgressBar, copy-limit warnings, and bracket panel all read from it — `formatFor` defaults anything unrecognized to Freeform, so old decks keep working.

#### Change what stats the editor shows
Extend the `derived` useMemo in `DeckEditor.tsx` (it already exposes curve, violations, copyWarnings, typeCounts, avgMv, landCount, bracket) and render the new value in the `deckStats` strip. Remember to gate MTG-only stats behind `!cyber`, and read card facts through `getCardMeta` with an undefined-safe fallback.

#### Re-sync bundled data
`node scripts/sync-precons.mjs` (regenerates precons.json + precon-ids.json + images), `sync-catalog.mjs` (catalog.json), `sync-cyberpunk.mjs [--force]` (cyberpunk-cards.json + faces). After a precon sync, the emitted precon-ids.json is what keeps image resolution correct — commit it alongside precons.json.

---

## Build, Test & Deploy Workflow

How PrettyCardboard is built, verified, and shipped: the Vite/tsc web build and Rust/cargo server build, the Tauri desktop lifecycle, the one-shot `redeploy.mjs` that ships the web bundle (dist/) and cross-compiled API to a Caddy-fronted VPS, and the Node `playtest/` harness that drives real REST+WebSocket scenarios against the local server on :8787 for end-to-end verification.

**Key files**

- `package.json` — Root npm scripts: dev, build (tsc+vite), typecheck, tauri/tauri:dev/tauri:build, redeploy[:web|:api], release:mac, release:manifest, sync:* data pipelines.
- `vite.config.ts` — Vite config: base './' for Tauri, port 5240 strictPort, manualChunks vendor-splitting (react/motion/glacier).
- `tsconfig.json` — Strict TS config (noEmit, ES2022, noUncheckedIndexedAccess); the target of `npm run typecheck`.
- `src-tauri/tauri.conf.json` — Desktop config: beforeDevCommand=dev-server.mjs, beforeBuildCommand=npm run build, frontendDist=../dist, OTA updater plugin.
- `scripts/dev-server.mjs` — Tauri beforeDevCommand: start Vite on 5240 or reuse an already-running one by probing the port.
- `scripts/redeploy.mjs` — The production deploy: builds same-origin web + rsyncs dist/ to Caddy docroot; zigbuild-cross-compiles the API and restarts systemd; smoke-checks.
- `scripts/release-mac.mjs` — Local macOS build + Developer-ID sign + notarize + upload OTA artifacts to the GitHub release (CI can't do mac signing reliably).
- `scripts/build-updater-manifest.mjs` — Assembles the Tauri OTA `latest.json` from a release's per-platform .sig/artifact pairs.
- `.github/workflows/desktop-build.yml` — CI: matrix-builds Linux+Windows desktop bundles on tag push (v*); macOS only on manual dispatch (10x cost).
- `server/Cargo.toml` — The deployed backend crate (axum/tokio/rusqlite/argon2); `cargo build` here is the verify-loop backend check.
- `playtest/README.md` — Playtest harness overview: what each scenario proves, how to run, PC_BASE override, the requestResync trick.
- `playtest/lib.js` — The protocol client: PlaytestClient (REST+WS), Assert with expect*/assertNever helpers, requestResync, mulberry32, connectAll/deckIdByName/deleteRoom.
- `playtest/seed.js` — Idempotent seeding of pt_alice/bob/carol/dana + their FF precon decks from src/data/precons.json.
- `playtest/run-all.js` — Runs seed + the 4 green scenarios sequentially, parses ##RESULT## lines into a summary table, exits nonzero on failure.
- `DEVELOPER.md` — New-dev onboarding: prerequisites, first run, everyday commands table, testing, deploying, conventions, where-things-are index.

#### Build, test, and deploy

PrettyCardboard is one React/Vite bundle (web + Tauri desktop) plus a standalone Rust/axum server. Build and deploy scripts live in `package.json` (root) and `scripts/*.mjs`; the integration test suite is the Node `playtest/` harness that drives the real REST+WebSocket protocol.

##### Dev + build commands (`package.json`)

- `npm run dev` → `vite` (dev server on :5240, pinned via `strictPort` in `vite.config.ts`).
- `npm run typecheck` → `tsc --noEmit`. This is the fast client inner loop.
- `npm run build` → `tsc --noEmit && vite build`. The type-check gates the bundle, then Vite emits `dist/`. `vite.config.ts` sets `base: './'` (so Tauri can serve from a custom protocol) and hand-rolls `manualChunks` to split React / motion / `@glacier` into cacheable vendor chunks.
- `npm run preview` → serve the built bundle.
- The server is built/run separately: `cargo run` / `cargo build` inside `server/` (axum + tokio + rusqlite, listening on :8787). `DEVELOPER.md` documents the two-terminal first-run.

`tsconfig.json` is strict (`strict`, `noUncheckedIndexedAccess`, `isolatedModules`, `noEmit`), targets ES2022, and includes `src` + `vite.config.ts`.

##### Tauri (desktop) commands

`npm run tauri` proxies the Tauri CLI; `npm run tauri:dev` and `npm run tauri:build` are the shortcuts. `src-tauri/tauri.conf.json` wires the build lifecycle: `beforeDevCommand` runs `node scripts/dev-server.mjs` (which starts Vite on 5240, or reuses an already-serving one by probing the port), and `beforeBuildCommand` runs `npm run build` so the desktop bundle always wraps a fresh web build. `frontendDist` points at `../dist`. The config also declares the OTA `updater` plugin (minisign pubkey + a GitHub `latest/download/latest.json` endpoint). CI (`.github/workflows/desktop-build.yml`) matrix-builds Linux + Windows on tag push; macOS is signed/notarized locally via `npm run release:mac` (`scripts/release-mac.mjs`) and the OTA manifest is assembled by `scripts/build-updater-manifest.mjs` (`npm run release:manifest`).

##### Production redeploy (`scripts/redeploy.mjs`)

Production is a Vultr VPS behind Caddy (auto-TLS) at prettycardboard.com. `npm run redeploy` does web + API; `npm run redeploy -- web` or `-- api` narrows it. Credentials come from the gitignored root `.env` (`PC_DEPLOY_HOST` / `PC_DEPLOY_USER` / `PC_DEPLOY_PASS`; see `.env.example`). The script:

1. **Preflights** the tools it needs (`rsync`, `sshpass`, `curl`, plus `cargo-zigbuild`+`zig` for API), then proves SSH auth with a `whoami` before spending time on a build.
2. **web** (`deployWeb`): runs `npm run build` with `VITE_PC_SERVER=''` so the client hits the same origin, then `rsync -az --delete dist/ → /var/www/prettycardboard` (Caddy's docroot, a clean mirror) and `chown -R caddy:caddy`.
3. **api** (`deployApi`): `cargo zigbuild --release --target x86_64-unknown-linux-gnu.2.35` (the box has no cargo; glibc is pinned to 2.35 for compatibility), `scp`s the binary next to the live one, then `systemctl stop && mv && start prettycardboard` under a brief stop so the running ELF isn't "text file busy". The SQLite `data/` dir is never touched, so rooms/accounts survive.
4. **verify**: curls the site, two static assets, and (for API) `/api/me` expecting `401` (unauth = up). Any mismatch fails the whole run.

##### The playtest harness (`playtest/`)

This is the closest thing to an integration test: real Node clients speaking the actual protocol (`PROTOCOL.md` + the Gameplay v2 addendum) over REST + WebSocket to `http://127.0.0.1:8787` (override with `PC_BASE`). It never wipes the DB — `seed.js` idempotently registers four throwaway users `pt_alice/bob/carol/dana` (password `playtest1`) and uploads the four Final Fantasy Commander precons from `src/data/precons.json` as their decks; every scenario creates and deletes its own room.

`lib.js` is the protocol client. `PlaytestClient` wraps REST (`api()`, `ensureUser()` = register-or-login) and WS: `connect()` opens `ws://…/api/ws?token=…`, logs every parsed frame into `this.messages`, and resolves waiters. Assertions are timeout-based helpers recorded into an `Assert` object: `expectState` (awaits a `room.state` for the current room satisfying a predicate), `expectLog`, `expectEvent`, `expectPrivate` (per-viewer frames like `library.cards` / `cmd.choice`), and `assertNever` (privacy check — asserts a frame type does NOT arrive). Because taps/moves/dice don't self-resync, `requestResync()` re-joins your own seat (a server no-op that rebroadcasts per-viewer `room.state`) so you can observe post-action state. `mulberry32` gives a seeded PRNG for reproducible chaos runs. Each scenario ends by calling `Assert.finish()`, which prints a `##RESULT## {json}` line.

`run-all.js` spawns `seed` + the four green scenarios sequentially, tees their output, parses the `##RESULT##` lines into a summary table, and exits nonzero if any failed. `restart-resume` is deliberately not in the batch (it kills the local server).

**Flow**

Dev loop: `npm run dev` (Vite :5240) + `cargo run` in server/ (axum :8787). Client actions → WS → server `game::apply` → broadcast back (server is authoritative). ── Verify loop: `npm run typecheck` (tsc --noEmit) → `cargo build` in server/ → start local server (:8787) → `node playtest/run-all.js` (seed → commander-pod → standard-duel → chaos-monkey → locked-combat, each a REST+WS client via lib.js) → `npm run build` (tsc + vite). ── Web deploy: `npm run redeploy [web]` → `npm run build` with `VITE_PC_SERVER=''` (same-origin) → `rsync -az --delete dist/ → /var/www/prettycardboard` (Caddy docroot) → chown caddy:caddy → curl smoke checks. ── API deploy: `npm run redeploy -- api` → `cargo zigbuild --release --target x86_64-unknown-linux-gnu.2.35` → scp binary to /opt/prettycardboard/bin → `systemctl stop && mv && start prettycardboard` (SQLite data/ untouched) → verify `/api/me`→401. ── Desktop: `npm run tauri:build` runs `beforeBuildCommand: npm run build` then bundles; tag push `v*` triggers .github/workflows/desktop-build.yml (Linux+Windows) while `npm run release:mac` builds/signs/notarizes macOS locally; `latest.json` OTA manifest via build-updater-manifest.mjs.

**Gotchas**

- `npm run build` is `tsc --noEmit && vite build` — the type-check gates the bundle, so a type error fails the build. `npm run typecheck` is the same tsc pass alone for a faster loop.
- The web deploy MUST build with `VITE_PC_SERVER=''` (defined-but-empty) so the client talks to the same origin. `redeploy.mjs` sets this in `deployWeb`. Building without it leaves the client pointed at `http://127.0.0.1:8787` and breaks production — never `npm run build` by hand and rsync the result.
- `rsync` uses `--delete`: `dist/` is mirrored to `/var/www/prettycardboard` exactly, so anything not in the fresh build is removed on the box.
- The API deploy cross-compiles with `cargo zigbuild` (the VPS has no cargo) targeting `x86_64-unknown-linux-gnu.2.35` — a glibc version pin. It needs `zig`, `cargo-zigbuild`, and the `x86_64-unknown-linux-gnu` rustup target locally; `redeploy.mjs` preflights these and prints a `brew install` hint if missing.
- `redeploy.mjs api` briefly `systemctl stop`s the service to swap the binary (avoids ELF 'text file busy'), so live games drop for a moment; the SQLite `data/` dir is never touched so persisted rooms/accounts reload on boot. It aborts if `systemctl is-active` isn't `active` afterward.
- Secrets ride in the environment (`SSHPASS`), never in argv. `sshpass` must wrap `ssh` as rsync's `-e` transport, not wrap rsync itself, or the password never reaches the ssh grandchild — see the comment in `deployWeb`.
- `playtest/run-all.js` intentionally excludes `restart-resume.js` because it SIGTERMs and relaunches your local `cargo run` server. `restart-resume` also SKIPS politely (not fails) when it can't find a local `target/debug/prettycardboard-server` via pgrep.
- The playtest harness does NOT wipe the DB — it registers idempotent `pt_alice/bob/carol/dana` (password `playtest1`) and each scenario creates+deletes its own room. Two browser tabs on localhost share localStorage so they can't be two users; use the Node clients or a private window for multi-user testing.
- `playtest/README.md` claims the server's serde_json lacks the `float_roundtrip` feature (causing 1-ULP battlefield-coordinate drift across restarts) — but `server/Cargo.toml` now enables `serde_json` with `features = ["float_roundtrip"]`. That doc note is stale relative to the Cargo manifest; `restart-resume.js` still compares floats at 1e-9 tolerance regardless.
- Two separate Rust crates exist: `server/` (the axum backend, deployed by redeploy) and `src-tauri/` (the desktop shell). They have independent Cargo.toml/Cargo.lock. `cargo build` for the verify loop means the one in `server/`.
- Some newer scenarios (`cyberpunk-table.js`, `timeline-persist.js`) spawn their OWN scratch `--release` server on an alternate `PC_PORT`/`PC_DATA_DIR` and require `cargo build --release` to have produced `server/target/release/prettycardboard-server` first. `PC_BASE` overrides the base URL (default `http://127.0.0.1:8787`) for pointing the harness at a scratch server.

**Making a change here**

**Run the standard verify loop before any deploy.** The DEVELOPER.md "Everyday commands" table is the canonical list. In order:

1. `npm run typecheck` — `tsc --noEmit` over `src/` and `vite.config.ts`. This is the fast client inner loop.
2. `cd server && cargo build` — compile-check the Rust backend (no run needed for a pure type check; `cargo run` to actually serve on :8787).
3. Start a local server (`cd server && cargo run`), then `cd playtest && node run-all.js`. This seeds the four `pt_*` users and runs the four green scenarios against `127.0.0.1:8787`. Exit code is nonzero if any assertion fails; a `SUMMARY` table prints per-scenario pass/fail. `run-all.js` deliberately omits `restart-resume` (it kills your server) — run that one by hand with `npm run restart`.
4. `npm run build` — `tsc --noEmit && vite build`. Produces `dist/`.

**To add a new playtest scenario:** create `playtest/scenarios/<name>.js`. Import `PlaytestClient`, `Assert`, and helpers from `../lib.js` and `ensureSeed`/`PASSWORD` from `../seed.js`. Construct clients with an attached `Assert` (`new PlaytestClient('pt_alice', { password: PASSWORD, assert: t })`), `await c.ensureUser()` then `await c.connect()`, create a room via `POST /api/rooms`, join with `c.joinRoom(roomId, deckId)`, drive the game with `c.act({ kind: '...', ... })`, and assert with `expectState` / `expectLog` / `expectEvent` / `expectPrivate` / `assertNever`. Because most in-game actions don't push a fresh `room.state`, call `c.requestResync()` (re-joins your own seat, a server no-op that rebroadcasts per-viewer state) before an `expectState`. End with `t.finish()` — it emits the `##RESULT## {json}` line that `run-all.js` parses. Add a `"<name>"` script to `playtest/package.json`, and (if it should run in CI-style batch) an entry to the `STEPS` array in `playtest/run-all.js`. Always create + `deleteRoom()` your own room so the shared dev DB isn't mutated.

**To change the deploy target:** edit `.env` (copy from `.env.example`) — `PC_DEPLOY_HOST` / `PC_DEPLOY_USER` / `PC_DEPLOY_PASS`. Remote paths (`/var/www/prettycardboard`, `/opt/prettycardboard/bin`, systemd unit `prettycardboard`) are hardcoded constants near the top of `scripts/redeploy.mjs`.

**To cut a desktop release:** bump `version` in `src-tauri/tauri.conf.json`, push a `v*` tag (CI builds Linux+Windows), then run `npm run release:mac` locally to add the signed/notarized macOS artifacts and refresh `latest.json`.

---

