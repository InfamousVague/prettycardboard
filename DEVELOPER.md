# Developer guide

PrettyCardboard is a multiplayer, freeform Magic: The Gathering tabletop — a
server-authoritative game of *pretend cardboard*. It is manual play with
conveniences (no rules engine forcing legality); the server owns state, clients
render it. Web + desktop (Tauri) share one React bundle; a Rust backend holds the
game.

This guide gets a new developer productive. Deeper per-area docs live in
[`docs/`](./docs).

## Prerequisites

- **Node** 20+ and **npm** (the web/desktop client).
- **Rust** stable + Cargo (the server).
- Optional for desktop: the Tauri toolchain. For deploys: `sshpass`, `rsync`,
  `zig`, `cargo-zigbuild`, and the `x86_64-unknown-linux-gnu` Rust target.

## First run

Two processes: the Rust server and the Vite client.

```sh
# 1. server (terminal A) — listens on :8787
cd server
cargo run

# 2. client (terminal B) — web app on http://localhost:5240
npm install
npm run dev
```

Register a username + password in the app; that seeds you the four Final Fantasy
Commander precons and drops you on the home page. Create a table, open a second
browser (or the desktop app) as another user, and join via the share link.

> Tip: two browser tabs on `localhost` share `localStorage`, so they can't be two
> different users. Use a private window, a second browser, or the Node playtest
> clients for multi-user testing.

## The shape of the codebase

```
src/                 React client (Vite + Glacier UI)
  app/               all app code — see docs/client.md
  app/pages/table/   the live game table — see docs/table.md
server/src/          Rust backend (axum + tokio + rusqlite) — see docs/server.md
playtest/            Node protocol harness — see docs/testing.md
PROTOCOL.md          the client/server contract (source of truth)
docs/                per-area architecture guides
```

The one idea to internalize: **the server is authoritative**. A client action is
a *request*. It travels over WebSocket to `ws::dispatch_action`, which calls
`game::apply` (the rules engine), which mutates the room and returns everything
to broadcast. Nothing is true until the server says so and echoes it back. Read
[docs/server.md](./docs/server.md) → "The action pipeline" first.

## Everyday commands

| Command | What it does |
|---------|--------------|
| `npm run dev` | Vite dev server (web client). |
| `npm run typecheck` | `tsc --noEmit` — the fast client inner loop. |
| `npm run build` | Type-check + production bundle. |
| `cargo run` (in `server/`) | Run the backend. |
| `cargo build` (in `server/`) | Compile-check the backend. |
| `node playtest/run-all.js` | Run the scripted protocol tests (see below). |
| `npm run redeploy` | Build + ship web and API to production. |

## Testing

`playtest/` drives the *real* protocol over WebSocket — the closest thing to an
integration test. Keep it green.

```sh
cd playtest
node run-all.js          # seed + commander-pod + standard-duel + chaos-monkey + locked-combat
npm run aimatch          # a full autonomous AI-vs-AI match (dev feature)
```

Against a scratch server on another port: `PC_BASE=http://127.0.0.1:8798 node run-all.js`.
Details and how to write a scenario: [docs/testing.md](./docs/testing.md).

## Deploying

Production is a Vultr VPS behind Caddy (auto-TLS) at
**https://prettycardboard.com**. Credentials live in the gitignored root `.env`
(`PC_DEPLOY_HOST` / `PC_DEPLOY_USER` / `PC_DEPLOY_PASS`).

```sh
npm run redeploy          # web + API
npm run redeploy -- web   # web only
npm run redeploy -- api   # API only (cross-compiles the Rust binary, restarts systemd)
```

The script builds a same-origin web bundle, rsyncs `dist/` to the box, cross-
compiles the server to Linux, ships the binary, restarts the service, and smoke-
checks the site. The SQLite data dir on the box is never touched, so rooms and
accounts survive a deploy.

## Conventions

- **Protocol first.** Any new client/server message goes in `PROTOCOL.md` and the
  shared types (`src/app/net/types.ts` + the Rust `Action`/message enums) before
  the feature.
- **Room-scoped messages carry `roomId`** and the client gates them on the viewed
  table (see docs/client.md → message routing). Don't add a room event without it.
- **One rules path.** Humans and bots both go through `game::apply`. Never add a
  second implementation of a rule.
- **No em dashes in user-facing app copy** (a house style rule). Code comments and
  docs are fine.
- Feature flags for experimental things live in `Preferences` and are read with
  `usePreference(...)`; the AI opponents toggle (Settings → Developer) is the
  reference example.

## Where things are (quick index)

| I want to change… | Look at |
|--------------------|---------|
| A game rule / what an action does | `server/src/game.rs` (`apply`) |
| Combat resolution | `server/src/game/combat.rs` |
| Turn order / the clock | `server/src/game/turns.rs` |
| How events reach clients | `server/src/ws.rs` (`dispatch_action`) |
| The AI | `server/src/bot.rs` |
| The board UI | `src/app/pages/table/` (docs/table.md) |
| Client state | `src/app/state/*` |
| Settings / preferences | `src/app/SettingsModal.tsx`, `src/app/preferences.ts` |
| REST endpoints | `server/src/api.rs` |
| DB schema | `server/src/db.rs` |
