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
| `node scripts/stage-server-sidecar.mjs` | Build the game server and stage it as the desktop sidecar (required before any `tauri build`/`tauri dev`; `--universal` for macOS release bundles). |

### Local play (desktop)

The desktop app bundles `prettycardboard-server` as a Tauri sidecar
(`bundle.externalBin`). Settings → Account → **Local play** spawns it on a
loopback port (scanned from 8790) with its SQLite data in the app-data dir,
switches the client's server origin to it, and scopes the signed-in identity
to a separate `pc.identity.local` key so the online account is untouched. The
same binary that runs production runs locally, so AI bot matches work fully
offline. The sidecar is killed when the app window closes or the toggle turns
off. `release:mac` and the desktop CI workflow stage the binary automatically;
for a dev build run the staging script once by hand.

## Testing

`playtest/` drives the *real* protocol over WebSocket — the closest thing to an
integration test. Keep it green.

```sh
cd playtest
node run-all.js          # seed + commander-pod + standard-duel + chaos-monkey + locked-combat
npm run aimatch          # a full autonomous AI-vs-AI match (dev feature)
```

For an eyeball test of the bots, Settings → General → Developer has
**Start a bot 1v1**: it spins up a two-bot exhibition table and drops you in
as a spectator. Bots pace themselves — each turn starts with a short
"thinking" beat (≥500ms) so the match is watchable.

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

### Releasing the desktop app

One command bumps the version, tags it, builds all three desktop platforms, and
publishes the OTA manifest:

```sh
npm run bump-n-distribute -- --dry-run   # print the plan, change nothing
npm run bump-n-distribute                # patch bump (0.5.3 -> 0.5.4)
npm run bump-n-distribute -- minor       # 0.5.3 -> 0.6.0
npm run bump-n-distribute -- 1.0.0       # explicit version
```

With `npm run`, flags MUST follow `--` or npm swallows them (`npm run
bump-n-distribute --dry-run` would perform a real release; the script rejects
unknown flags to catch exactly that). `yarn bump-n-distribute --dry-run` works
without the separator.

What it does, and why it is shaped this way: pushing the `v*` tag starts
`.github/workflows/desktop-build.yml`, which builds **Windows + Linux** on
native runners. **macOS is built locally** by the same command, because Apple
notarization does not run reliably on hosted runners. Both halves upload to the
same release; the script then waits for CI and rebuilds `latest.json` so the
OTA updater offers every platform.

It refuses to run when it should: not on `main`, dirty tree, tag already exists,
version not newer than the current one, no push access, or a failing typecheck.
Each has an escape hatch (`--allow-branch`, `--allow-dirty`, `--allow-downgrade`,
`--skip-checks`). Useful extras: `--skip-mac` (not on a Mac), `--skip-ci` (don't
wait), `--notes "…"`, `--yes`, `--help`.

By default only `package.json` and `src-tauri/tauri.conf.json` are committed —
unrelated work in the tree is never folded into a release commit unless you pass
`--allow-dirty`. If a step after the push fails, the script says exactly which
one and how to finish it by hand, and exits non-zero.

macOS signing needs a gitignored `.env.apple`; see
[scripts/release-mac.mjs](./scripts/release-mac.mjs) for the required keys.

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
