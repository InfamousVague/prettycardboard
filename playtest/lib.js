// PlaytestClient: REST + WS wrapper for the PrettyCardboard protocol
// (PROTOCOL.md incl. the Gameplay v2 addendum). Supports N clients per script.
import WebSocket from 'ws';

export const BASE = process.env.PC_BASE || 'http://127.0.0.1:8787';
export const WS_URL = BASE.replace(/^http/, 'ws') + '/api/ws';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- assertions

export class Assert {
  constructor(name) {
    this.name = name;
    this.passed = 0;
    this.failed = 0;
    this.failures = [];
    this.started = Date.now();
  }

  ok(cond, label, detail) {
    if (cond) {
      this.passed++;
      console.log(`  PASS  ${label}`);
    } else {
      this.failed++;
      this.failures.push(label);
      console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
    return !!cond;
  }

  eq(got, want, label) {
    const same = JSON.stringify(got) === JSON.stringify(want);
    return this.ok(same, label, same ? '' : `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }

  /// Quiet variant for high-volume loops: only failures produce output.
  check(cond, label, detail) {
    if (cond) {
      this.passed++;
    } else {
      this.failed++;
      this.failures.push(label);
      console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
    }
    return !!cond;
  }

  finish() {
    const durationMs = Date.now() - this.started;
    const result = { name: this.name, passed: this.passed, failed: this.failed, durationMs };
    console.log(`\n${this.name}: ${this.passed} passed, ${this.failed} failed (${(durationMs / 1000).toFixed(1)}s)`);
    if (this.failures.length) {
      console.log('failures:');
      for (const f of this.failures) console.log(`  - ${f}`);
    }
    console.log(`##RESULT## ${JSON.stringify(result)}`);
    return result;
  }
}

// ------------------------------------------------------------------- client

export class PlaytestClient {
  constructor(username, { password = 'playtest1', base = BASE, assert = null } = {}) {
    this.username = username;
    this.password = password;
    this.base = base;
    this.t = assert; // optional Assert; expect* helpers record into it when set
    this.token = null;
    this.userId = null;
    this.ws = null;
    this.roomId = null; // room this client currently cares about (filters room.state)
    this.messages = []; // every parsed WS message, in arrival order
    this.waiters = []; // {pred, resolve, since}
  }

  // ---- REST ----

  async api(method, path, body) {
    const res = await fetch(this.base + path, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try {
      json = res.status === 204 ? null : await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  }

  /// Register-or-login. Idempotent.
  async ensureUser() {
    const reg = await this.api('POST', '/api/register', {
      username: this.username,
      password: this.password,
    });
    if (reg.status === 201) {
      this.token = reg.json.token;
      this.userId = reg.json.userId;
      return this;
    }
    if (reg.status !== 409) {
      throw new Error(`register ${this.username}: unexpected ${reg.status} ${JSON.stringify(reg.json)}`);
    }
    const login = await this.api('POST', '/api/login', {
      username: this.username,
      password: this.password,
    });
    if (login.status !== 200) {
      throw new Error(`login ${this.username}: ${login.status} ${JSON.stringify(login.json)}`);
    }
    this.token = login.json.token;
    this.userId = login.json.userId;
    return this;
  }

  // ---- WS ----

  connect(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`${WS_URL}?token=${this.token}`);
      const timer = setTimeout(() => reject(new Error(`${this.username}: WS connect timeout`)), timeoutMs);
      ws.on('message', (data) => {
        let msg;
        try {
          msg = JSON.parse(data.toString());
        } catch {
          return;
        }
        this.messages.push(msg);
        for (let i = this.waiters.length - 1; i >= 0; i--) {
          const w = this.waiters[i];
          if (this.messages.length - 1 >= w.since && w.pred(msg)) {
            this.waiters.splice(i, 1);
            w.resolve(msg);
          }
        }
        if (msg.type === 'welcome') {
          clearTimeout(timer);
          resolve(this);
        }
      });
      ws.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      this.ws = ws;
    });
  }

  send(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  act(action) {
    this.send({ type: 'game.action', action });
  }

  joinRoom(roomId, deckId) {
    this.roomId = roomId;
    this.send({ type: 'room.join', roomId, ...(deckId ? { deckId } : {}) });
  }

  /// Re-joining the room you are seated in is a cheap server-side no-op that
  /// broadcasts a fresh per-viewer room.state to every player — used to
  /// observe state after actions that do not resync on their own (tap, pos,
  /// dice, ...).
  requestResync() {
    this.send({ type: 'room.join', roomId: this.roomId });
  }

  /// Cursor into the message log: pass to expect*/assertNever as `since` so
  /// only messages received after this point count.
  mark() {
    return this.messages.length;
  }

  /// Latest room.state for the current room already received (or null).
  lastState() {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.type === 'room.state' && (!this.roomId || m.state.roomId === this.roomId)) return m.state;
    }
    return null;
  }

  /// My own player entry in a state.
  me(state) {
    return state.players.find((p) => p.userId === this.userId) || null;
  }

  /// Core wait: resolves with the first message (at index >= since) matching
  /// pred; scans history first, then live messages. Null on timeout.
  waitFor(pred, { since = 0, timeoutMs = 5000 } = {}) {
    for (let i = since; i < this.messages.length; i++) {
      if (pred(this.messages[i])) return Promise.resolve(this.messages[i]);
    }
    return new Promise((resolve) => {
      const w = { pred, since, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        const idx = this.waiters.indexOf(w);
        if (idx >= 0) {
          this.waiters.splice(idx, 1);
          resolve(null);
        }
      }, timeoutMs);
    });
  }

  /// Await a room.state (for the current room) whose state satisfies pred.
  /// Records pass/fail into the attached Assert. Returns the state or null.
  async expectState(predicate, label, timeoutMs = 5000, { since = 0 } = {}) {
    const msg = await this.waitFor(
      (m) => m.type === 'room.state' && (!this.roomId || m.state.roomId === this.roomId) && predicate(m.state),
      { since, timeoutMs },
    );
    this.t?.ok(msg, `[${this.username}] ${label}`, msg ? '' : `timeout ${timeoutMs}ms waiting for state`);
    return msg ? msg.state : null;
  }

  /// Await a log line matching regex. Returns the log message or null.
  async expectLog(regex, label, { since = 0, timeoutMs = 5000 } = {}) {
    const msg = await this.waitFor((m) => m.type === 'log' && regex.test(m.text), { since, timeoutMs });
    this.t?.ok(msg, `[${this.username}] ${label}`, msg ? '' : `timeout waiting for log ${regex}`);
    return msg;
  }

  /// Await a room.event matching pred.
  async expectEvent(pred, label, { since = 0, timeoutMs = 5000 } = {}) {
    const msg = await this.waitFor((m) => m.type === 'room.event' && pred(m), { since, timeoutMs });
    this.t?.ok(msg, `[${this.username}] ${label}`, msg ? '' : 'timeout waiting for event');
    return msg;
  }

  /// Await a per-viewer private message of the given type (library.cards, cmd.choice).
  async expectPrivate(type, label, { since = 0, timeoutMs = 5000 } = {}) {
    const msg = await this.waitFor((m) => m.type === type, { since, timeoutMs });
    this.t?.ok(msg, `[${this.username}] ${label}`, msg ? '' : `timeout waiting for private ${type}`);
    return msg;
  }

  /// Privacy check: assert that NO message of the given type arrives within
  /// windowMs (counted from `since`, default = now).
  async assertNever(type, label, windowMs = 1200, { since = this.messages.length } = {}) {
    await sleep(windowMs);
    const leaked = this.messages.slice(since).filter((m) => m.type === type);
    this.t?.ok(leaked.length === 0, `[${this.username}] ${label}`, leaked.length ? `received ${leaked.length}x ${type}` : '');
    return leaked.length === 0;
  }

  /// All error frames received at/after `since`.
  errorsSince(since = 0) {
    return this.messages.slice(since).filter((m) => m.type === 'error');
  }

  /// Graceful close (keeps the message log; connect() again to resume).
  async close() {
    if (!this.ws) return;
    const ws = this.ws;
    this.ws = null;
    await new Promise((resolve) => {
      ws.on('close', resolve);
      try {
        ws.close();
      } catch {
        resolve();
      }
      setTimeout(resolve, 1500);
    });
  }
}

// ------------------------------------------------------------ shared setup

/// Deterministic PRNG for reproducible chaos runs.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/// Create N ready clients (registered/logged-in + connected), with decks
/// already seeded (delegates to seed.js's ensureSeed).
export async function connectAll(clients) {
  for (const c of clients) {
    await c.ensureUser();
    await c.connect();
  }
  return clients;
}

/// Find the caller's deck id by name via REST.
export async function deckIdByName(client, name) {
  const res = await client.api('GET', '/api/decks');
  if (res.status !== 200) throw new Error(`GET /api/decks: ${res.status}`);
  const deck = res.json.find((d) => d.name === name);
  if (!deck) throw new Error(`${client.username}: deck "${name}" not found — run seed.js first`);
  return deck.id;
}

/// Best-effort room teardown (host deletes; ignores failures).
export async function deleteRoom(host, roomId) {
  try {
    await host.api('DELETE', `/api/rooms/${roomId}`);
  } catch {
    /* ignore */
  }
}
