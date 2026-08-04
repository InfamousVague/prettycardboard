#!/usr/bin/env node
/**
 * Point every icon import in the app at the backfilled wrapper.
 *
 * Run after `gen-backfilled-icons.mjs`, and run BOTH after adding icons. An
 * import left on '@glacier/icons' or 'icons/cards.ts' renders a bare outline in
 * a UI where everything around it is filled, which is more conspicuous than if
 * none of it were - and that is exactly what happened to the three files a
 * concurrent session added while the first sweep was already done.
 *
 * Type-only imports are left alone: the wrapper exports components, and
 * IconProps still lives on the package.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src', 'app');
const TARGET = join(SRC, 'icons', 'backfilled.tsx');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const SOURCES = /from\s*'(?:@glacier\/icons|[^']*icons\/cards\.ts)'/;
let changed = 0;

for (const file of walk(SRC)) {
  if (!/\.tsx?$/.test(file)) continue;
  if (file === TARGET || file.endsWith(join('icons', 'cards.ts'))) continue;
  let source = readFileSync(file, 'utf8');
  if (!SOURCES.test(source)) continue;

  let spec = relative(dirname(file), TARGET).split('\\').join('/');
  if (!spec.startsWith('.')) spec = `./${spec}`;

  const before = source;
  source = source.replace(
    /import\s*\{([^}]+)\}\s*from\s*'(?:@glacier\/icons|[^']*icons\/cards\.ts)';/gs,
    (match, names) => {
      // IconProps is a type and CARD_ICONS is a raw map; neither is wrapped.
      if (/\bIconProps\b|\bCARD_ICONS\b/.test(names) || match.startsWith('import type')) return match;
      return `import {${names}} from '${spec}';`;
    },
  );

  // Collapse the duplicates that leaves: a file importing from both sources
  // ends up with two statements pulling from one module.
  const pattern = new RegExp(`import\\s*\\{([^}]+)\\}\\s*from\\s*'${spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';\\n`, 'gs');
  const hits = [...source.matchAll(pattern)];
  if (hits.length > 1) {
    const names = [...new Set(hits.flatMap((hit) => hit[1].split(',').map((n) => n.trim()).filter(Boolean)))].sort();
    const merged = `import {\n${names.map((n) => `  ${n},\n`).join('')}} from '${spec}';\n`;
    source = source.slice(0, hits[0].index) + merged + source.slice(hits[0].index + hits[0][0].length).replace(pattern, '');
  }

  if (source !== before) {
    writeFileSync(file, source);
    changed += 1;
  }
}
console.log(`rewrote icon imports in ${changed} file(s)`);
