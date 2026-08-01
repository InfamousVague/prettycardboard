# Game marks

One SVG per game, keyed by its registry id (`src/app/data/games.ts`). Rendered
by `GameMark.tsx` as a CSS **mask**, not an `<img>` — so the file supplies the
silhouette only and the app paints it with that game's accent. Two consequences
when you replace one of these:

- **Fill colour in the file is ignored.** Anything opaque becomes mark, anything
  transparent becomes background. Flatten strokes to filled paths.
- **Keep it a tight square viewBox.** The mask is `contain`-fitted and centred,
  so generous internal padding makes the mark render small in its box.

| file | source |
|---|---|
| `mtg.svg` | the planeswalker symbol, copied from the bundled Scryfall symbology (`public/symbols/PW.svg`) |
| `yugioh.svg` | authored here — the Millennium Eye |
| `cyberpunk.svg` | authored here — Cyberpunk TCG is our own WIP game |

To use official brand art instead, drop it in under the same filename. Note that
publisher logos are trademarks: Wizards' Fan Content Policy and Konami's terms
govern what a fan project may ship, which is why nothing here is a wordmark.
