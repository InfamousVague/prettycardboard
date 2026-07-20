# Client architecture

The client is a **React 19 + TypeScript** SPA built with **Vite**, styled with
the vendored **Glacier** design kit (`@glacier/react`, `@glacier/icons`,
`@glacier/tokens`). The same bundle runs on the web and, wrapped by **Tauri**,
as the desktop app.

Run it with `npm run dev` (Vite dev server). `npm run build` type-checks
(`tsc --noEmit`) then bundles. `npm run typecheck` is the fast inner loop.

## Folder map (`src/app/`)

| Path | What lives there |
|------|------------------|
| `App.tsx` | The shell: routing, the app frame (rail + sidebar + content), and the app-level modals. Holds `preferences` state and passes it down. |
| `main.tsx` (`src/`) | Vite entry; mounts `<App/>`. |
| `router.ts` | Hash-based route parsing (`#/play`, `#/decks`, …). |
| `preferences.ts` | The look-and-feel + behavior knobs (`Preferences`), persistence to `localStorage`, and `applyPreferences` which stamps token attributes on `:root` and broadcasts `pc:preferences`. |
| `i18n.ts` | The translation dictionary (en/es/fr/ar) and the `useT()` hook. |
| `state/` | Zustand stores — the client's source of truth. |
| `net/` | The server boundary: WebSocket client, REST client, and the shared protocol types. |
| `data/` | Card/deck data helpers: image resolution, catalog, Moxfield import, playmats, card backs. |
| `hooks/` | Reusable hooks (`useLongPress`, `usePreference`). |
| `components/` | Cross-page presentational pieces (`GameCard`, `CardPopup`, `Spotlight`, skeletons, …). |
| `pages/` | One file per route (`HomePage`, `PlayPage`, `DecksPage`, `FriendsPage`, `TablePage`, …). |
| `pages/table/` | The live game table, broken into board/seat/overlay/combat pieces. See [table.md](./table.md). |
| `pages/deckbuilder/` | The deck editor and its search/import/curve pieces. |
| `SettingsModal.tsx`, `CustomizeModal.tsx`, `RouteSidebar.tsx` | App-shell surfaces rendered by `App`. |

## State: the three stores (`state/`)

Zustand, one store per concern. Components subscribe with selectors.

- **`appStore`** — identity/auth (`identity`, `bootstrap`, `signOut`), the
  connection flag, friends, and decks. This is the "am I logged in, who am I,
  what do I own" store.
- **`gameStore`** — everything about the table you're at: the current `room`
  snapshot, `spectating`, chat, log, combat popups, and the actions that send
  WS messages (`join`, `leave`, `act`, …). See the message routing below.
- **`uiStore`** — ephemeral UI bits (selected deck, pending invite code).

`accent.ts` is a small helper store for the live accent preview.

## The network boundary (`net/`)

- **`ws.ts`** — a single reconnecting WebSocket. `send()` posts a `ClientMessage`;
  `onMessage()` delivers a `ServerMessage`; `onStatus()` tracks connectivity.
  `gameStore` wires its handlers here.
- **`api.ts`** — `fetch` wrapper for the REST endpoints, attaches the bearer
  token, and surfaces 401s so `appStore` can drop to the auth screen.
- **`types.ts`** — the protocol types shared with the server (`RoomState`,
  `ClientMessage`, `ServerMessage`, `GameAction`, …). This file is the client's
  half of `PROTOCOL.md`.

## Message routing (the important gameStore detail)

The server streams events for **every** table you're a member of (you can be
seated at several persistent tables at once). `gameStore`'s WS handler therefore
scopes strictly to the table you are **actively viewing** (`joinedRoomId`):

- `room.state` for the joined room replaces `room`; for any other room it only
  bumps an `activity` counter (so the Play page can show "turns are happening"
  without yanking you into that table).
- `log`, `chat`, `room.event`, `combat.results`, `cmd.choice`, `library.cards`
  are each applied **only** when `message.roomId === joinedRoomId`. Every one of
  these carries a `roomId` (the server stamps it). Without this guard, a play at
  another table would leak into the viewed table's log or combat popup.

When adding a new room-scoped server message, give it a `roomId` on the server
and gate it here the same way.

## Preferences & theming

`Preferences` (in `preferences.ts`) is the single settings object. Editing flows
through `App`'s `onPreferencesChange(patch)`, which merges, persists, and calls
`applyPreferences`. That function stamps `data-*` attributes and CSS variables on
`:root` (the Glacier tokens key off them) and fires a `pc:preferences` window
event carrying the full object.

`usePreference('key')` (in `hooks/`) reads one preference reactively from
anywhere without prop-drilling — it seeds from the persisted value and updates on
that event. Use it for deep surfaces (e.g. the table gating the AI control on
`aiOpponents`).

Deep surfaces also open the app-level modals via window events the shell listens
for: `pc:open-settings`, `pc:open-customize`. The table's Settings button uses
`pc:open-settings` so you don't have to leave the table.

## Web vs desktop

`tauri.ts` (`isTauri()`) branches the few places that differ. `api.ts` targets a
same-origin API on the web and the live server (`https://prettycardboard.com`)
under Tauri. `updater.ts` drives the desktop self-update (a no-op on web). Keep
platform branches behind these helpers rather than sprinkling `isTauri()`.
