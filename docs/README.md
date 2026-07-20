# PrettyCardboard docs

Start with **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the comprehensive, current
map of the whole system (client shell & routing, state + network, the Rust
server, the multi-game registry & card data, the in-game table UI, deck
building & the data pipeline, and the build/test/deploy workflow). It is
generated from a fresh read of the codebase and is the source of truth.

## Topic docs

These predate ARCHITECTURE.md and go deeper on a single area. Where they
disagree, ARCHITECTURE.md wins.

- [server.md](./server.md) — the Rust server up close (action pipeline, combat, persistence).
- [client.md](./client.md) — client structure and conventions.
- [table.md](./table.md) — the in-game table.
- [testing.md](./testing.md) — the `playtest/` scenario harness.

## The verify loop

Before shipping, run the checks that match what you touched:

```bash
npm run typecheck          # tsc, the client
npm run build              # tsc + vite production build
cd server && cargo build   # the Rust server
cd playtest && node run-all.js   # E2E scenarios against a local server (port 8787)
```

Deploy is `npm run redeploy` (or `redeploy:web` / `redeploy:api`) — see the
"Build, Test & Deploy Workflow" section of ARCHITECTURE.md. The VPS password
lives only in a gitignored `.env` and is never echoed.
