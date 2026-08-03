# PrettyCardboard — playmat prompts

A fresh playmat set, replacing the current `public/mats/` catalog. Twenty mats in
four families: ink/line work, iconic-relic oil paintings, Secret-Lair-style
stylistic takeovers, and a unified five-land cycle.

Every prompt below is **self-contained** — paste one into an image generator with
nothing else and it will produce a usable mat. Reference images are optional and
noted per family.

---

## The one rule that makes a playmat work

Look at any mat in the current set and the same thing is true: **the middle is
empty and dark, and everything interesting is around the edge.**

That is not a style choice. Cards, the hand fan, the zone rail, the turn HUD and
the floating glass panels all sit over the center of this image. A mat with a
subject in the middle fights the game for attention and makes card art unreadable.

So: **detail and light at the edges, quiet and dark in the middle.** Every prompt
below states this explicitly, and you should not remove that sentence when you
paste it.

## Output spec

| | |
|---|---|
| Aspect | 16:9 landscape |
| Generate at | 2048×1152 or larger — upscale to 2731×1536 |
| Ship at | **2731×1536**, WebP |
| Lives in | `public/mats/<id>.webp` |
| Filename | exactly the `id` in each heading |

After generating, resize and convert:

```bash
sips -s format png -z 1536 2731 ~/Downloads/raw.png --out /tmp/mat.png && cwebp -q 82 /tmp/mat.png -o public/mats/<id>.webp
```

Check the result at 82 quality; drop to 75 for the flat/graphic mats (families A
and C compress much harder than the painted ones) and raise to 88 for the oil
paintings if you see banding in the dark center.

## Reference images (optional)

Every prompt works with no reference. If your generator takes them:

- **Family A** — attach `public/backs/old-school-woodcut.jpg` and
  `public/backs/rubber-hose-1928.jpg`. They already carry the ink language.
- **Family B** — attach the real cards you want to evoke (Black Lotus, Time Walk,
  Ancestral Recall, Lightning Bolt, the Mox cycle). Use them for **palette, brush
  economy and era**, not for composition — the prompts restage each subject as a
  wide table surface, which no card art is.
- **Family C** — attach whichever Secret Lair drop you like the look of. One drop
  per mat; mixing two dilutes the takeover.
- **Family D** — attach any full-art basic land for palette only.

A note on B and C: card art and Secret Lair drops are the property of Wizards of
the Coast and the individual artists, so these prompts describe **original
compositions that evoke a subject and an era** rather than reproductions, and the
mat names avoid card and product names. If you would rather ship the literal card
names as mat names, that is your call — say so and I will rename them.

---

# Family A — Ink & Line

Five mats built from ink: engraving, wash, and cartoon. Flat, graphic, high
contrast at the edges, and they stay legible when the app blurs them behind glass
panels. These are the cheapest to compress and the most forgiving of a bad
generation.

## `ink-woodcut` — "Woodcut Grimoire"

> A 16th-century European woodcut print filling a wide landscape frame. Dense
> black ink linework on aged laid paper the color of weak tea, with visible chain
> lines and deckled fiber. A broad ornamental border of interlaced knotwork,
> acanthus scrollwork, and small engraved emblems — a crescent moon, a serpent, a
> pair of scales, a burning candle — runs around the outside of the frame and
> thickens in the four corners. The border dissolves inward into sparse hatching
> and then into bare, softly foxed paper. Hand-cut relief printing texture, slight
> ink over-inking at the line ends, faint plate impression. Composition: 16:9
> landscape, and the middle 60% of the frame stays visually quiet — no subject,
> almost no linework, low contrast, and darker than the edges, because playing
> cards and interface panels sit there. All detail, texture and light lives in the
> outer band and the corners. No horizon line across the middle. No text, letters,
> numerals, logos, watermarks, signatures, card frames or user-interface elements
> anywhere in the image.

## `ink-copperplate` — "Copperplate Orrery"

> A copperplate engraving from an 18th-century book of astronomy, filling a wide
> landscape frame. Fine cross-hatched burin lines in warm sepia-black on ivory
> rag paper. Around the outer edges: a sectioned brass orrery, an armillary
> sphere, dividers and a sector rule, a rolled star chart, and engraved zodiac
> figures, all rendered in tight parallel hatching that gets sparser toward the
> center until only bare paper and the faintest constellation stipple remain.
> Precise, cold, scientific line quality; no painterly shading, no color beyond
> the ink and the paper. Composition: 16:9 landscape, and the middle 60% of the
> frame stays visually quiet — no subject, almost no linework, low contrast, and
> darker than the edges, because playing cards and interface panels sit there. All
> detail lives in the outer band and the corners. No horizon line across the
> middle. No text, letters, numerals, logos, watermarks, signatures, card frames or
> user-interface elements anywhere in the image.

## `ink-sumi` — "Sumi Storm"

> A Japanese sumi-e ink wash painting on unsized rice paper, filling a wide
> landscape frame. Enormous empty center. Around the edges, a few decisive
> brushstrokes: wind-bent pine boughs entering from the upper corners, a suggestion
> of storm cloud along the top edge in a wet grey wash that bleeds and feathers
> into the paper, sparse reeds at the lower corners, and one long dry-brush sweep
> along the bottom. Black ink in four values only, from bone-dry scratch to
> saturated pool, with the natural bloom and backrun of wet-on-wet. Warm off-white
> paper with visible long fibers. Composition: 16:9 landscape, and the middle 60%
> of the frame stays visually quiet — no subject, no brushwork, low contrast, and
> tonally deeper than the edges, because playing cards and interface panels sit
> there. All gesture and detail lives in the outer band and the corners. No horizon
> line across the middle. No text, letters, calligraphy, seals, logos, watermarks,
> signatures, card frames or user-interface elements anywhere in the image.

## `ink-rubberhose` — "Rubber Hose 1928"

> A 1928 rubber-hose cartoon animation cel background, filling a wide landscape
> frame. Bold black ink outlines of uniform weight, bouncy noodle-limbed shapes,
> pie-cut eyes, and cheerful anthropomorphic props — a grinning crescent moon, a
> top-hatted mushroom, marching bottles, a smiling pocket watch — crowded around
> the outside edges and piled up in the corners. Everything drawn on cream animation
> paper with visible grain, dust specks, tramline scratches and the soft flicker of
> old nitrate film. Limited palette: black ink, cream paper, and one muted spot
> color. The characters all face inward and lean out of frame; the middle is bare
> paper. Composition: 16:9 landscape, and the middle 60% of the frame stays
> visually quiet — no characters, no props, no linework, low contrast, and darker
> than the edges, because playing cards and interface panels sit there. All
> character and detail lives in the outer band and the corners. No horizon line
> across the middle. No text, letters, numerals, speech bubbles, logos, watermarks,
> signatures, card frames or user-interface elements anywhere in the image.

## `ink-cyanotype` — "Cyanotype Arcana"

> A cyanotype blueprint photogram, filling a wide landscape frame. Deep Prussian
> blue ground with white and pale-cyan figures burned into it. Around the outer
> edges: the exploded technical schematic of an impossible machine — gear trains,
> lens assemblies, a segmented armature, coiled tubing — drawn as thin white
> construction lines with dimension arcs and register marks, overlapping with the
> ghostly white silhouettes of pressed ferns and feathers laid directly on the
> paper. Uneven brush-coated emulsion with a ragged edge, chemical mottling,
> lighter blue blooms and darker pooling. Toward the center the schematic thins to
> nothing and only flat, deep, evenly-exposed blue remains. Composition: 16:9
> landscape, and the middle 60% of the frame stays visually quiet — no subject, no
> linework, low contrast, and darker than the edges, because playing cards and
> interface panels sit there. All detail lives in the outer band and the corners.
> No horizon line across the middle. No text, letters, numerals, dimension labels,
> logos, watermarks, signatures, card frames or user-interface elements anywhere in
> the image.

---

# Family B — Relics

Five oil paintings in the visual language of early-1990s fantasy trading-card
illustration: painted on board, muted and earthy, warm key light against cool
shadow, brushwork left visible, no line art and no digital gloss. Each takes the
*subject* of a famous artifact and restages it as a table surface seen from above
— which is what a playmat is and what no card art ever is.

These are the expensive ones. Generate at the highest resolution you can and
expect to run each two or three times.

## `relic-lotus` — "Jeweled Bloom"

> An oil painting on board in the style of early-1990s fantasy trading-card
> illustration: muted earth palette, warm key light against cool shadow, visible
> brushwork, no line art, no digital gloss. A wide landscape view looking down at
> a black lacquered table. Resting near the lower-left, a single five-petalled
> lotus carved from black stone, each petal edge catching a different colored
> highlight — white, blue, black-violet, red, green — with a faint mana shimmer
> lifting off it. Around the outer edges of the table: tarnished silver leaf, a
> spill of dark polished stones, a heavy iron ring, cut flower stems, and a shallow
> pool of still black water in the upper-right corner reflecting nothing. Dust
> motes in the raking light. Toward the middle the table surface is bare, unlit,
> and nearly black. Composition: 16:9 landscape, and the middle 60% of the frame
> stays visually quiet — no subject, no props, low contrast, and darker than the
> edges, because playing cards and interface panels sit there. All objects, detail
> and light live in the outer band and the corners. No horizon line across the
> middle. No text, letters, numerals, logos, watermarks, signatures, card frames or
> user-interface elements anywhere in the image.

## `relic-sundial` — "Borrowed Hour"

> An oil painting on board in the style of early-1990s fantasy trading-card
> illustration: muted earth palette, warm key light against cool shadow, visible
> brushwork, no line art, no digital gloss. A wide landscape view looking down at a
> weathered stone terrace at late afternoon. In the upper-left corner, a bronze
> sundial green with verdigris, casting **two** shadows at different angles across
> the stone — one sharp, one faint and lagging. Around the outer edges: cracked
> flagstones with moss in the joints, a fallen hourglass with its sand halted
> mid-fall, scattered brass gnomon fragments, and creeping ivy along the bottom
> edge. The long doubled shadows stretch inward and dissolve into deep shade before
> reaching the middle. Toward the center the stone is unlit, flat and nearly black.
> Composition: 16:9 landscape, and the middle 60% of the frame stays visually
> quiet — no subject, no props, low contrast, and darker than the edges, because
> playing cards and interface panels sit there. All objects, detail and light live
> in the outer band and the corners. No horizon line across the middle. No text,
> letters, numerals, logos, watermarks, signatures, card frames or user-interface
> elements anywhere in the image.

## `relic-pool` — "Ancestral Pool"

> An oil painting on board in the style of early-1990s fantasy trading-card
> illustration: muted earth palette, warm key light against cool shadow, visible
> brushwork, no line art, no digital gloss. A wide landscape view looking straight
> down into a still, ink-dark scrying pool set in a carved basin. Three concentric
> ripple rings spread from a point near the upper-right edge, each ring catching a
> thin cold blue highlight, the outermost breaking against the basin lip. Around
> the outer edges: wet carved stone, submerged silver coins, a drowned
> candelabrum, drifting pale roots, and the blurred suggestion of three faces
> under the water at the left edge — indistinct, more shadow than portrait. Toward
> the middle the water is perfectly flat, unlit, and nearly black. Composition:
> 16:9 landscape, and the middle 60% of the frame stays visually quiet — no
> subject, no ripples, low contrast, and darker than the edges, because playing
> cards and interface panels sit there. All detail and light lives in the outer
> band and the corners. No horizon line across the middle. No text, letters,
> numerals, logos, watermarks, signatures, card frames or user-interface elements
> anywhere in the image.

## `relic-fulgurite` — "Fulgurite Scar"

> An oil painting on board in the style of early-1990s fantasy trading-card
> illustration: muted earth palette, warm key light against cool shadow, visible
> brushwork, no line art, no digital gloss. A wide landscape view looking down at a
> vast slab of dark slate split by a lightning strike. A branching fulgurite scar —
> glass fused into the rock, still glowing dull orange deep in the fissures — enters
> from the upper-right corner and forks outward toward the edges, thinning and
> cooling to black before it reaches the middle. Around the outer edges: shattered
> slate flakes, scorch bloom, a curl of smoke at the top edge, iron filings drawn
> into arcs, and a heat shimmer distorting the far corners. Toward the center the
> slate is cold, unlit, unbroken and nearly black. Composition: 16:9 landscape, and
> the middle 60% of the frame stays visually quiet — no subject, no cracks, no
> glow, low contrast, and darker than the edges, because playing cards and
> interface panels sit there. All detail and light lives in the outer band and the
> corners. No horizon line across the middle. No text, letters, numerals, logos,
> watermarks, signatures, card frames or user-interface elements anywhere in the
> image.

## `relic-moxen` — "Jeweler's Tray"

> An oil painting on board in the style of early-1990s fantasy trading-card
> illustration: muted earth palette, warm key light against cool shadow, visible
> brushwork, no line art, no digital gloss. A wide landscape view looking down at a
> jeweler's workbench draped in deep oxblood velvet. Along the bottom edge and
> curling up the left side, five large cabochon gemstones seated in worn felt
> recesses — pearl white, sapphire, jet black, ruby, emerald — each throwing a
> small pool of its own colored light onto the velvet. Around the remaining edges:
> loupe and tweezers, a brass balance scale, gold wire, a spill of uncut stones,
> and a lit oil lamp in the upper-right corner. The velvet nap catches the light at
> the edges and swallows it toward the middle, where the cloth is bare, unlit and
> nearly black. Composition: 16:9 landscape, and the middle 60% of the frame stays
> visually quiet — no gems, no tools, no colored light, low contrast, and darker
> than the edges, because playing cards and interface panels sit there. All objects
> and light live in the outer band and the corners. No horizon line across the
> middle. No text, letters, numerals, logos, watermarks, signatures, card frames or
> user-interface elements anywhere in the image.

---

# Family C — Drops

Five stylistic takeovers, in the spirit of a Secret Lair drop: one loud,
committed art direction per mat, nothing blended. These are the mats that make
the table look like a different app. Generate each at low quality first to check
the style landed before committing.

## `drop-sticker` — "Sticker Sheet"

> A die-cut vinyl sticker sheet photographed flat, filling a wide landscape frame.
> Thick white keyline borders around every sticker, flat bold saturated color, no
> gradients, chunky 2010s skate-art illustration: grinning skulls, lightning
> bolts, googly-eyed potions, winking moons, banana peels, disembodied cartoon
> hands throwing shapes. The stickers crowd the outer edges of the sheet three and
> four deep and pile into the corners, overlapping and slightly peeling at the
> tabs, with soft drop shadows and a glossy vinyl sheen. Toward the middle the
> stickers stop entirely and only the matte backing paper remains — a plain deep
> slate-grey sheet with faint die-cut kiss-lines and a soft even shadow. Composition:
> 16:9 landscape, and the middle 60% of the frame stays visually quiet — no
> stickers, no color, no shine, low contrast, and darker than the edges, because
> playing cards and interface panels sit there. All stickers and detail live in the
> outer band and the corners. No text, letters, numerals, logos, watermarks,
> signatures, card frames or user-interface elements anywhere in the image.

## `drop-pixel` — "Pixel Realm"

> A 16-bit pixel-art scene in the style of a early-90s console role-playing game
> world map, filling a wide landscape frame. Hard-edged pixels on a strict grid, a
> limited 32-color palette, ordered dithering for every gradient, no anti-aliasing
> and no blur anywhere. Around the outer edges: tiled castle battlements along the
> top, a pixel forest canopy down the left, a sprite-art dragon curled in the
> lower-right corner, treasure chests, torches with two-frame flame shapes, and a
> dithered water border along the bottom. The tiles thin out toward the middle and
> resolve into a large flat field of a single dark indigo, broken only by a very
> sparse dither of one shade lighter. Composition: 16:9 landscape, and the middle
> 60% of the frame stays visually quiet — no tiles, no sprites, no pattern, low
> contrast, and darker than the edges, because playing cards and interface panels
> sit there. All tiles and sprites live in the outer band and the corners. No
> horizon line across the middle. No text, letters, numerals, health bars, dialogue
> boxes, logos, watermarks, signatures, card frames or user-interface elements
> anywhere in the image.

## `drop-airbrush` — "Airbrush Chrome"

> A 1985 airbrushed van-mural illustration, filling a wide landscape frame. Soft
> gradient airbrush rendering, hot magenta into cyan into deep violet, liquid chrome
> surfaces with hard specular hits and mirrored gradients, thin neon rimlight on
> every edge. Around the outer edges: a chrome wireframe grid receding into the
> upper corners, a chrome skull and chrome palm fronds at the left, a rising
> gradient sun with hard horizontal cut-lines at the top edge, floating chrome
> spheres, and lens flares with visible star points in the corners. Everything is
> lacquered, glossy, and lit from beyond the frame. Toward the middle the chrome
> and neon fall away entirely to a deep flat matte violet-black with a fine airbrush
> speckle. Composition: 16:9 landscape, and the middle 60% of the frame stays
> visually quiet — no chrome, no neon, no grid, no flares, low contrast, and much
> darker than the edges, because playing cards and interface panels sit there. All
> chrome, light and detail lives in the outer band and the corners. No horizon line
> across the middle. No text, letters, numerals, logos, watermarks, signatures, card
> frames or user-interface elements anywhere in the image.

## `drop-botanical` — "Botanical Plate"

> A hand-tinted botanical illustration plate from a 19th-century natural-history
> folio, filling a wide landscape frame. Precise stipple-engraved outlines filled
> with delicate watercolor washes in sage, ochre, dusty rose and oxblood on heavy
> cream rag paper with visible tooth and foxing spots. Around the outer edges:
> specimen studies of impossible plants — a bell-flower with a keyhole throat, a
> seed pod split to show clockwork, a thorned vine bearing small closed eyes, a
> mushroom with gilled underside rendered in cutaway, dissected stamens and a root
> system — arranged as a collector would pin them, each with its own fine
> cross-section detail and pin shadow. Toward the middle the specimens stop and
> only the aged paper remains, deepened and shadowed as if the folio is lying open
> under a low lamp. Composition: 16:9 landscape, and the middle 60% of the frame
> stays visually quiet — no specimens, no linework, no color, low contrast, and
> darker than the edges, because playing cards and interface panels sit there. All
> specimens and detail live in the outer band and the corners. No horizon line
> across the middle. No text, letters, numerals, specimen labels, handwriting,
> logos, watermarks, signatures, card frames or user-interface elements anywhere in
> the image.

## `drop-noir` — "Noir Panel"

> A high-contrast black-and-white crime-comic page in the style of 1950s newsprint,
> filling a wide landscape frame. Brush-inked blacks with no midtones, benday
> halftone dots for every grey, slight off-register print and ink bleed into
> yellowed pulp paper. Around the outer edges: hard-angled venetian blind shadows
> raking in from the upper-left, a rain-slick fire escape down the right side, a
> fedora and a smoking revolver in the lower-left corner, a streetlamp cone at the
> top edge, cigarette smoke curling in solid black shapes, and heavy speed-lines in
> the corners. Toward the middle the shadows close over everything and the page
> becomes a solid, flat, unbroken field of brush-inked black with only the faintest
> paper grain showing through. Composition: 16:9 landscape, and the middle 60% of
> the frame stays visually quiet — no shadows, no objects, no halftone, no
> contrast, and much darker than the edges, because playing cards and interface
> panels sit there. All detail and contrast lives in the outer band and the corners.
> No horizon line across the middle. No panel borders, gutters, text, letters,
> numerals, speech balloons, sound effects, logos, watermarks, signatures, card
> frames or user-interface elements anywhere in the image.

---

# Family D — The Five Lands

One art direction across five mats so they read as a cycle: a high aerial view at
dusk, painterly and mist-veiled, low saturation, each land identified by its
palette and one silhouette rather than by any detail. The shared sentences are
deliberately identical across all five — that is what makes them a set. Generate
all five in one session so the model's interpretation of the shared language
stays consistent.

## `land-plains` — "Plains"

> A painterly high aerial view at dusk, mist-veiled and low in saturation, oil on
> board with visible brushwork and no line art, filling a wide landscape frame.
> Endless wheat plains under a heavy overcast: pale gold and bone-white fields
> divided by low stone walls, with the silhouette of a single chapel spire at the
> upper-left edge. Thin ground mist lies in the furrows. Warm sunlight breaks
> through the cloud only along the outer edges of the frame; everything inward
> falls into cool blue shadow. Around the outer band: hedgerows, a cart track, a
> stand of poplars, a low drystone wall in the lower corners. Toward the middle the
> fields flatten into unbroken shadowed ground, unlit and nearly black.
> Composition: 16:9 landscape, and the middle 60% of the frame stays visually quiet
> — no landmarks, no texture, no light, low contrast, and much darker than the
> edges, because playing cards and interface panels sit there. All landmarks,
> texture and light live in the outer band and the corners. No horizon line across
> the middle. No text, letters, numerals, logos, watermarks, signatures, card frames
> or user-interface elements anywhere in the image.

## `land-island` — "Island"

> A painterly high aerial view at dusk, mist-veiled and low in saturation, oil on
> board with visible brushwork and no line art, filling a wide landscape frame.
> Deep cold ocean around a scatter of dark rock: slate blue and pale sea-green
> water, foam breaking white against the stone, with the silhouette of a lone
> lighthouse on a spit at the upper-right edge. Sea fog lies in banks across the
> water. Fading daylight catches the swell only along the outer edges of the frame;
> everything inward falls into deep blue-black. Around the outer band: kelp beds, a
> half-sunk hull, wave-cut shelves, gull specks in the corners. Toward the middle
> the water flattens into unbroken deep shadow, unlit and nearly black. Composition:
> 16:9 landscape, and the middle 60% of the frame stays visually quiet — no
> landmarks, no waves, no texture, no light, low contrast, and much darker than the
> edges, because playing cards and interface panels sit there. All landmarks,
> texture and light live in the outer band and the corners. No horizon line across
> the middle. No text, letters, numerals, logos, watermarks, signatures, card frames
> or user-interface elements anywhere in the image.

## `land-swamp` — "Swamp"

> A painterly high aerial view at dusk, mist-veiled and low in saturation, oil on
> board with visible brushwork and no line art, filling a wide landscape frame.
> Black standing water threaded through drowned forest: bruised violet and sickly
> ochre, dead trees rising as bare silhouettes, with a ruined stone arch half sunk
> at the lower-left edge. Heavy miasma lies over the water in sheets. The last
> greenish light catches the reeds only along the outer edges of the frame;
> everything inward falls into flat black. Around the outer band: cypress knees,
> floating scum, a rotted boardwalk, pale bones in the shallows at the corners.
> Toward the middle the water flattens into unbroken depthless black, unlit and
> featureless. Composition: 16:9 landscape, and the middle 60% of the frame stays
> visually quiet — no landmarks, no trees, no texture, no light, low contrast, and
> much darker than the edges, because playing cards and interface panels sit there.
> All landmarks, texture and light live in the outer band and the corners. No
> horizon line across the middle. No text, letters, numerals, logos, watermarks,
> signatures, card frames or user-interface elements anywhere in the image.

## `land-mountain` — "Mountain"

> A painterly high aerial view at dusk, mist-veiled and low in saturation, oil on
> board with visible brushwork and no line art, filling a wide landscape frame.
> A shattered volcanic range: rust red and iron grey scree, dull orange fissures
> venting deep in the rock, with the silhouette of a broken caldera rim at the
> upper edge. Ash haze drifts through the passes. Firelight from the fissures
> catches the crags only along the outer edges of the frame; everything inward
> falls into cold ash-black. Around the outer band: boulder fields, a lava tube
> mouth, twisted iron scaffolding, drifting embers in the corners. Toward the middle
> the scree flattens into unbroken shadowed ground, unlit and nearly black.
> Composition: 16:9 landscape, and the middle 60% of the frame stays visually quiet
> — no landmarks, no fissures, no embers, no texture, no light, low contrast, and
> much darker than the edges, because playing cards and interface panels sit there.
> All landmarks, texture and light live in the outer band and the corners. No
> horizon line across the middle. No text, letters, numerals, logos, watermarks,
> signatures, card frames or user-interface elements anywhere in the image.

## `land-forest` — "Forest"

> A painterly high aerial view at dusk, mist-veiled and low in saturation, oil on
> board with visible brushwork and no line art, filling a wide landscape frame.
> Old-growth canopy without a break: deep moss green and wet bark brown, immense
> crowns crowding together, with the silhouette of one bare dead giant standing
> above the canopy at the right edge. Low mist pools between the trunks. The last
> gold light rakes across the treetops only along the outer edges of the frame;
> everything inward falls into deep green-black. Around the outer band: a fallen
> trunk bridging a gully, a ring of pale mushrooms, exposed root systems, a stream
> glinting in the corners. Toward the middle the canopy flattens into unbroken
> shadow, unlit and nearly black. Composition: 16:9 landscape, and the middle 60%
> of the frame stays visually quiet — no landmarks, no canopy detail, no texture,
> no light, low contrast, and much darker than the edges, because playing cards and
> interface panels sit there. All landmarks, texture and light live in the outer
> band and the corners. No horizon line across the middle. No text, letters,
> numerals, logos, watermarks, signatures, card frames or user-interface elements
> anywhere in the image.

---

## Registering them

Once the WebP files are in `public/mats/`, replace `IMAGE_PLAYMATS` in
`src/app/data/playmats.ts` with:

```ts
const IMAGE_PLAYMATS: Playmat[] = [
  // Ink & Line
  { id: 'ink-woodcut', name: 'Woodcut Grimoire', theme: 'generic' },
  { id: 'ink-copperplate', name: 'Copperplate Orrery', theme: 'generic' },
  { id: 'ink-sumi', name: 'Sumi Storm', theme: 'generic' },
  { id: 'ink-rubberhose', name: 'Rubber Hose 1928', theme: 'generic' },
  { id: 'ink-cyanotype', name: 'Cyanotype Arcana', theme: 'generic' },
  // Relics
  { id: 'relic-lotus', name: 'Jeweled Bloom', theme: 'magic' },
  { id: 'relic-sundial', name: 'Borrowed Hour', theme: 'magic' },
  { id: 'relic-pool', name: 'Ancestral Pool', theme: 'magic' },
  { id: 'relic-fulgurite', name: 'Fulgurite Scar', theme: 'magic' },
  { id: 'relic-moxen', name: "Jeweler's Tray", theme: 'magic' },
  // Drops
  { id: 'drop-sticker', name: 'Sticker Sheet', theme: 'generic' },
  { id: 'drop-pixel', name: 'Pixel Realm', theme: 'generic' },
  { id: 'drop-airbrush', name: 'Airbrush Chrome', theme: 'generic' },
  { id: 'drop-botanical', name: 'Botanical Plate', theme: 'generic' },
  { id: 'drop-noir', name: 'Noir Panel', theme: 'generic' },
  // The Five Lands
  { id: 'land-plains', name: 'Plains', theme: 'magic' },
  { id: 'land-island', name: 'Island', theme: 'magic' },
  { id: 'land-swamp', name: 'Swamp', theme: 'magic' },
  { id: 'land-mountain', name: 'Mountain', theme: 'magic' },
  { id: 'land-forest', name: 'Forest', theme: 'magic' },
];

export const DEFAULT_PLAYMAT = 'ink-woodcut';
```

Two things that are load-bearing when you swap the catalog:

- **`DEFAULT_PLAYMAT` must be an id that exists.** `playmatUrl` falls back to it
  for any unknown id, so if it points at a deleted mat every fallback 404s.
- **Existing players have the old id in their saved preferences.** `playmatUrl`
  already handles that — an unrecognised id resolves to the default — so nobody
  gets a broken table, they just get moved to the new default mat once.

The Cyberpunk mats (`neon-grid`, `back-alley`, `corporate-arcology`,
`neon-megacity`, `rain-ramen`, `the-net`) are a separate game's set and are not
part of this replacement; keep those rows. The ten `COLOR_PLAYMATS` are generated
from tokens and need nothing.

You can also ship these incrementally — add rows as the files land rather than
swapping all twenty at once, since a missing file is a 404 and a blank table.
