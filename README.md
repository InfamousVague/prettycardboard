# PrettyCardboard

A desktop app skeleton built with [Glacier UI](https://github.com/InfamousVague/GlacierUI),
scaffolded by `create-glacier-app`.

## Develop

```sh
npm install
npm run dev        # web app on http://localhost:5240
```

Everything under `src/app` is yours to replace: the sidebar navigation, the
window title bar, the settings, the modal, and the toast system are all worked
examples composed from Glacier components. The kit is vendored under
`vendor/@glacier/*`, so the app installs and runs with no extra setup.

## Desktop (Tauri)

When you scaffolded with the Tauri backend, `src-tauri/` holds a Tauri v2 Rust
crate with a sample `greet` command wired to the About page:

```sh
npm run tauri:dev     # run the desktop window
npm run tauri:build   # produce an installer
```

Requires the [Rust toolchain](https://www.rust-lang.org/tools/install) and the
[Tauri prerequisites](https://v2.tauri.app/start/prerequisites/).
