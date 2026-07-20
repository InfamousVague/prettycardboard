# PrettyCardboard

A multiplayer, freeform **Magic: The Gathering** tabletop. Play *pretend
cardboard*: a shared 2–6 seat table with drag-anywhere cards, a fanned hand, zone
piles, guided combat, and premium 2.5D foil visuals — manual play with
conveniences, no rules engine getting in your way. The server is authoritative;
the same React bundle runs on the web and as a desktop app.

**Live at [prettycardboard.com](https://prettycardboard.com).**

## Stack

- **Client** — React 19 + TypeScript + Vite, styled with the vendored
  [Glacier UI](https://github.com/InfamousVague/GlacierUI) kit. Packaged for
  desktop with Tauri v2.
- **Server** — Rust (axum + tokio), SQLite (rusqlite). Server-authoritative
  realtime rooms over WebSocket.

## Quick start

```sh
# server (:8787)
cd server && cargo run

# client (http://localhost:5240)
npm install
npm run dev
```

Register in the app to get the four Final Fantasy Commander precons, then create
a table and share the join link.

Desktop:

```sh
npm run tauri:dev     # run the desktop window
npm run tauri:build   # produce an installer
```

## Documentation

- **[DEVELOPER.md](./DEVELOPER.md)** — start here: setup, architecture, everyday
  commands, testing, deploy, conventions.
- **[docs/server.md](./docs/server.md)** — backend: the action pipeline, combat
  v3, persistence, bots.
- **[docs/client.md](./docs/client.md)** — frontend: stores, the net layer,
  message routing, preferences.
- **[docs/table.md](./docs/table.md)** — the game table components.
- **[docs/testing.md](./docs/testing.md)** — the playtest protocol harness.
- **[PROTOCOL.md](./PROTOCOL.md)** — the client/server message contract.

## Testing

```sh
cd server && cargo run          # a server must be running
cd playtest && node run-all.js  # the scripted protocol suite
```
