#!/usr/bin/env node
/**
 * Publish a folder of processed card art into the global alt-art catalog.
 *
 * Alt arts are CURATED GLOBAL CONTENT, not user uploads: there is no upload
 * endpoint. Ops runs this script, which writes images plus a catalog.json into
 * the server's data/alt-art directory; the server serves both read-only and
 * every player sees the same extra printings in the art picker.
 *
 * Arts key off Scryfall's `oracle_id` rather than a printing id, so one
 * published art covers every printing of that card - whichever copy of Liliana
 * Vess a player happens to own, our art shows up as an option on it.
 *
 * Image filenames carry a content hash so the server can serve them
 * `immutable`: republishing a card's art produces a new filename instead of
 * poisoning caches with a stale image.
 *
 * Usage:
 *   node scripts/publish-alt-art.mjs ~/Downloads/LilianaDeck/processed --set "Goth Mommy"
 *   node scripts/publish-alt-art.mjs <dir> --artist "Matt" --prune
 *   node scripts/publish-alt-art.mjs <dir> --dry-run
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRYFALL = 'https://api.scryfall.com';
const BATCH = 75;
const BATCH_GAP_MS = 100;
// Scryfall rejects requests carrying an HTTP library's default User-Agent
// (subcode `generic_user_agent`), so identify the tool explicitly.
const UA = 'PrettyCardboard-AltArtPublisher/1.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const args = { _: [], set: 'Alt Art', artist: undefined, out: join(ROOT, 'server/data/alt-art'), prune: false, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--set') args.set = argv[++i];
    else if (a === '--artist') args.artist = argv[++i];
    else if (a === '--out') args.out = resolve(argv[++i]);
    else if (a === '--prune') args.prune = true;
    else if (a === '--dry-run') args.dry = true;
    else args._.push(a);
  }
  return args;
}

/** Layouts with a real hidden back face you can physically flip to. Split,
 *  adventure and flip cards print both halves on one face, so they are not DFCs
 *  for our purposes - the same rule the client's faces.ts applies. */
const DFC_LAYOUTS = new Set(['transform', 'modal_dfc']);

/** Resolve exact card names to their Scryfall identity, batched politely. */
async function resolveOracleIds(names) {
  const oracle = new Map(); // lowercased name -> {oracleId, name, dfc, frontName, backName}
  const missing = [];
  for (let start = 0; start < names.length; start += BATCH) {
    if (start > 0) await sleep(BATCH_GAP_MS);
    const slice = names.slice(start, start + BATCH);
    const response = await fetch(`${SCRYFALL}/cards/collection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ identifiers: slice.map((name) => ({ name })) }),
    });
    if (!response.ok) throw new Error(`Scryfall collection failed (${response.status})`);
    const body = await response.json();
    for (const card of body.data ?? []) {
      if (!card.oracle_id) continue;
      const dfc = DFC_LAYOUTS.has(card.layout) && (card.card_faces?.length ?? 0) >= 2;
      const info = {
        oracleId: card.oracle_id,
        name: card.name,
        dfc,
        frontName: dfc ? card.card_faces[0].name : card.name,
        backName: dfc ? card.card_faces[1].name : undefined,
      };
      // Index under the full name AND each face name, so a decklist that names
      // the back face of a transforming card ("Liliana, Defiant Necromancer")
      // still lands on the right oracle identity.
      for (const key of [card.name, ...card.name.split(' // ')]) {
        oracle.set(key.toLowerCase(), info);
      }
    }
    for (const miss of body.not_found ?? []) if (miss?.name) missing.push(miss.name);
  }
  return { oracle, missing };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = args._[0];
  if (!dir) {
    console.error('usage: publish-alt-art.mjs <processed-dir> [--set NAME] [--artist NAME] [--out DIR] [--prune] [--dry-run]');
    process.exit(1);
  }
  const processed = resolve(dir);
  const manifestPath = join(processed, 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`no manifest.json in ${processed} — run process_cards.py first`);
    process.exit(1);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const cards = manifest.cards ?? [];
  // `normal` (488x680) is what the table and picker render; large is a bonus.
  const usable = cards.filter((c) => c.outputs?.normal);
  if (!usable.length) {
    console.error('manifest has no `normal` derivatives — reprocess with --sizes normal');
    process.exit(1);
  }
  console.log(`${usable.length} art(s) from ${processed}`);

  const names = [...new Set(usable.map((c) => c.name))];
  console.log(`resolving ${names.length} card name(s) against Scryfall…`);
  const { oracle, missing } = await resolveOracleIds(names);
  if (missing.length) console.warn(`  unresolved (skipped): ${missing.join(', ')}`);

  const arts = [];
  const skipped = [];
  const files = new Set();
  if (!args.dry) mkdirSync(args.out, { recursive: true });

  for (const card of usable) {
    const hit = oracle.get(card.name.toLowerCase());
    if (!hit) {
      skipped.push(card.name);
      continue;
    }
    const srcPath = join(processed, card.outputs.normal);
    const bytes = readFileSync(srcPath);
    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 8);
    const ext = srcPath.split('.').pop();
    const file = `${card.slug}.${hash}.${ext}`;
    files.add(file);
    if (!args.dry) copyFileSync(srcPath, join(args.out, file));
    arts.push({
      // `pc-` cannot collide with a Scryfall UUID, so this id rides through the
      // existing deck/room protocol in the same field with no schema change.
      id: `pc-${card.slug}`,
      oracleId: hit.oracleId,
      name: hit.name,
      // The label distinguishes multiple arts of one card (the six Swamps).
      setName: card.label ? `${args.set} · ${card.label}` : args.set,
      artist: args.artist,
      file,
    });
  }

  if (skipped.length) console.warn(`  skipped ${skipped.length} unresolved: ${skipped.slice(0, 5).join(', ')}${skipped.length > 5 ? '…' : ''}`);

  const catalog = { arts: arts.sort((a, b) => a.name.localeCompare(b.name)) };
  if (args.dry) {
    console.log(`\n--dry-run, nothing written. ${arts.length} art(s) would publish to ${args.out}`);
    for (const a of arts.slice(0, 8)) console.log(`  ${a.id.padEnd(34)} ${a.name}`);
    if (arts.length > 8) console.log(`  … ${arts.length - 8} more`);
    return;
  }

  writeFileSync(join(args.out, 'catalog.json'), JSON.stringify(catalog, null, 2));

  if (args.prune) {
    // Content-hashed names mean a re-publish leaves the previous image orphaned.
    let removed = 0;
    for (const existing of readdirSync(args.out)) {
      if (existing === 'catalog.json' || files.has(existing)) continue;
      rmSync(join(args.out, existing));
      removed++;
    }
    if (removed) console.log(`pruned ${removed} orphaned file(s)`);
  }

  const bytes = arts.reduce((sum, a) => sum + readFileSync(join(args.out, a.file)).length, 0);
  console.log(`\npublished ${arts.length} art(s) → ${args.out}`);
  console.log(`catalog:  ${join(args.out, 'catalog.json')}`);
  console.log(`payload:  ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
