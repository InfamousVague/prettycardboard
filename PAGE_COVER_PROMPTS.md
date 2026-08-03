# PrettyCardboard — page cover art prompts

Cover art for each page, plus a background symbol in the top-left corner.

Every prompt is **self-contained** — paste one into an image generator with
nothing else. The shared rules are repeated in each rather than referenced,
because you are pasting them one at a time.

---

## Two pieces per page

Each page gets **two** images, generated separately:

1. **The cover** — a wide banner behind the page heading.
2. **The corner symbol** — a single emblem that sits behind the top-left of the
   page, oversized and very faint, like a maker's mark on the paper.

They are separate files because they behave differently: the cover is cropped
hard at small widths, and the symbol has to stay a symbol at any size. Baking
the symbol into the cover means it slides off the left edge on a phone, which
is the one place it is meant to be.

## Output spec

| | Cover | Corner symbol |
|---|---|---|
| Aspect | 16:5 (wide banner) | 1:1 |
| Generate at | 2560×800 | 1024×1024 |
| Ship at | 1920×600, WebP | 512×512, WebP (or SVG if your tool emits it) |
| Lives in | `public/covers/<id>.webp` | `public/covers/<id>-mark.webp` |

```bash
sips -s format png -z 600 1920 ~/Downloads/raw.png --out /tmp/c.png && cwebp -q 82 /tmp/c.png -o public/covers/<id>.webp
```

## The two rules that make these work

**The cover's left third must stay quiet.** The page heading sits there. Detail
and light belong on the right two-thirds; the left fades to near-flat so type
reads over it without a scrim.

**The symbol is a silhouette, not a picture.** One shape, flat, no scene, no
background, no gradient — it will be tinted by the app and dropped to ~6%
opacity. Anything with internal shading turns to grey mud at that opacity.

## House style

All twelve share one look so the app reads as one app: **deep indigo-to-black
ground, thin luminous cyan line work, a sense of depth behind glass.** Think
technical illustration lit from within rather than painted. This is stated in
every prompt below — don't drop it, it is the only thing holding the set
together.

---

# Covers

## `home` — Home

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: an exploded isometric diagram of a card
> table seen from above, its zones drawn as thin wireframe rectangles floating
> apart at different depths, faint contour lines connecting them, a scatter of
> small hexagonal nodes and measurement ticks around the edges. Cool cyan and
> pale blue only, with one small warm amber accent. The left third fades to an
> almost flat dark field with only the faintest residual grid, because a page
> heading sits there and must read without anything behind it. No text, no
> letters, no numerals, no logos, no watermark, no signature, no user-interface
> elements, no card faces or card art.

## `play` — Play

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: two opposing wireframe arcs sweeping
> toward each other like the opening of a duel, with thin trajectory lines and
> angle markings between them, small nodes where they would meet, and a faint
> radial burst at the point of contact. Cool cyan and pale blue only, with one
> small warm amber accent at the meeting point. The left third fades to an
> almost flat dark field with only the faintest residual grid, because a page
> heading sits there and must read without anything behind it. No text, no
> letters, no numerals, no logos, no watermark, no signature, no user-interface
> elements, no card faces or card art.

## `decks` — Decks

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: a stack of thin wireframe rectangles
> seen in steep perspective, fanning apart into a shallow arc, each outlined in
> a single hairline with faint depth shadows between them, and thin leader
> lines with tick marks measuring the stack's height. Cool cyan and pale blue
> only, with one small warm amber accent. The left third fades to an almost
> flat dark field with only the faintest residual grid, because a page heading
> sits there and must read without anything behind it. No text, no letters, no
> numerals, no logos, no watermark, no signature, no user-interface elements,
> no card faces or card art.

## `collection` — Collection

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: a dense honeycomb of small wireframe
> rectangles laid out as a catalogue grid receding into depth, some cells
> filled with a faint solid tint and most left as outlines, with fine index
> ticks running along two edges like a filing system. Cool cyan and pale blue
> only, with one small warm amber accent on a single filled cell. The left
> third fades to an almost flat dark field with only the faintest residual
> grid, because a page heading sits there and must read without anything behind
> it. No text, no letters, no numerals, no logos, no watermark, no signature,
> no user-interface elements, no card faces or card art.

## `browse` — Browse

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: a wireframe compass rose overlaid on a
> faint contour map, with thin search radii sweeping out from its centre,
> small circular nodes marking points of interest, and fine bearing marks
> around the rim. Cool cyan and pale blue only, with one small warm amber
> accent on the needle. The left third fades to an almost flat dark field with
> only the faintest residual grid, because a page heading sits there and must
> read without anything behind it. No text, no letters, no numerals, no logos,
> no watermark, no signature, no user-interface elements, no card faces or card
> art.

## `boosters` — Open Packs

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: a wireframe foil wrapper caught at the
> instant of tearing, its seam splitting into a bright rift with thin cards
> spilling out as outlined rectangles on arcing trajectory lines, motion ticks
> tracing their paths, and a faint burst of light escaping the tear. Cool cyan
> and pale blue only, with one small warm amber accent inside the rift. The
> left third fades to an almost flat dark field with only the faintest residual
> grid, because a page heading sits there and must read without anything behind
> it. No text, no letters, no numerals, no logos, no watermark, no signature,
> no user-interface elements, no card faces or card art.

## `leaderboard` — Leaderboard

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: an ascending flight of wireframe
> platforms drawn in isometric projection, each higher than the last, with thin
> elevation lines and height ticks measuring the climb, and a faint laurel arc
> outlined around the topmost step. Cool cyan and pale blue only, with one
> small warm amber accent on the highest platform. The left third fades to an
> almost flat dark field with only the faintest residual grid, because a page
> heading sits there and must read without anything behind it. No text, no
> letters, no numerals, no logos, no watermark, no signature, no user-interface
> elements, no card faces or card art.

## `friends` — Friends

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: a constellation of circular wireframe
> nodes joined by thin luminous edges into a social graph, some nodes ringed
> twice to mark them out, the connections drawn as gentle catenary curves
> rather than straight lines, with faint orbit rings behind the whole cluster.
> Cool cyan and pale blue only, with one small warm amber accent on a single
> node. The left third fades to an almost flat dark field with only the
> faintest residual grid, because a page heading sits there and must read
> without anything behind it. No text, no letters, no numerals, no logos, no
> watermark, no signature, no user-interface elements, no card faces or card
> art.

## `profile` — Profile

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: a wireframe portrait medallion — a
> circular frame with a faceted crest behind it — surrounded by thin concentric
> progress arcs at different radii, small tick marks counting along them, and a
> faint heraldic wreath outlined at the base. Cool cyan and pale blue only,
> with one small warm amber accent on the innermost arc. The left third fades
> to an almost flat dark field with only the faintest residual grid, because a
> page heading sits there and must read without anything behind it. No text, no
> letters, no numerals, no logos, no watermark, no signature, no user-interface
> elements, no card faces or card art.

## `settings` — Settings

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: an exploded wireframe mechanism of
> interlocking gears, sliders and detent tracks drawn as a precision schematic,
> with fine dimension lines, arc arrows showing travel, and small numbered
> calibration ticks along each track. Cool cyan and pale blue only, with one
> small warm amber accent on a single slider. The left third fades to an almost
> flat dark field with only the faintest residual grid, because a page heading
> sits there and must read without anything behind it. No text, no letters, no
> numerals, no logos, no watermark, no signature, no user-interface elements,
> no card faces or card art.

## `customize` — Customize

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: a wireframe swatch fan opened like a
> paint deck, each blade an outlined rectangle at a slightly different angle,
> a few of them filled with flat washes of colour while the rest stay as
> outlines, with thin registration crosses and colour-bar ticks alongside. Cool
> cyan and pale blue for the line work, and the filled blades in muted teal,
> amber and violet. The left third fades to an almost flat dark field with only
> the faintest residual grid, because a page heading sits there and must read
> without anything behind it. No text, no letters, no numerals, no logos, no
> watermark, no signature, no user-interface elements, no card faces or card
> art.

## `new` — New Table

> A wide 16:5 banner in deep indigo fading to near-black, drawn as luminous
> cyan technical line work on a dark ground, as if etched into glass and lit
> from behind. On the right two-thirds: an architect's plan of an empty round
> table drawn in wireframe, seats marked as outlined arcs around its rim, thin
> construction lines and radius marks radiating from the centre, and one seat
> picked out with a brighter double outline as if just reserved. Cool cyan and
> pale blue only, with one small warm amber accent on that seat. The left third
> fades to an almost flat dark field with only the faintest residual grid,
> because a page heading sits there and must read without anything behind it.
> No text, no letters, no numerals, no logos, no watermark, no signature, no
> user-interface elements, no card faces or card art.

---

# Corner symbols

One emblem each, for the faint oversized mark behind the top-left of the page.

**The shared tail** — append this to every symbol prompt below, verbatim:

> Rendered as a single flat silhouette in pure white on a pure black square
> background, centred with generous margin, 1:1. One connected shape or a small
> number of clearly separated shapes — no scene, no perspective, no shading, no
> gradient, no outline-plus-fill mixing, no texture. It will be recoloured and
> dropped to about six percent opacity, so anything with internal detail turns
> to an indistinct grey blob. Bold, closed, poster-like forms only. No text, no
> letters, no numerals, no logos, no watermark, no signature.

| id | Prompt (prepend to the shared tail) |
|---|---|
| `home-mark` | A stylised card table seen from above as a simple rounded rectangle with four seat arcs around it. |
| `play-mark` | Two crossed swords with broad flat blades. |
| `decks-mark` | Three stacked cards fanned into a shallow arc. |
| `collection-mark` | A tight honeycomb cluster of seven hexagons. |
| `browse-mark` | A compass rose with four broad cardinal points. |
| `boosters-mark` | A sealed pack silhouette with a torn top edge. |
| `leaderboard-mark` | A three-step podium with a laurel crown above the tallest step. |
| `friends-mark` | Three overlapping circles arranged as a triangle, joined into one shape. |
| `profile-mark` | A shield crest with a simple bust silhouette inside it. |
| `settings-mark` | A six-toothed gear with a solid hexagonal core. |
| `customize-mark` | A paint-swatch fan of five blades opening from one pivot. |
| `new-mark` | A circle with a bold plus sign cut out of its centre. |

---

## Wiring them up

The covers and marks are static assets keyed by page id, so a page needs no
props — the id it already has is the lookup:

```ts
/** Cover art per page. A page with no entry renders no cover, which is the
 *  correct behaviour while the set is still being generated. */
export const PAGE_COVERS: Record<string, boolean> = {
  home: true, play: true, decks: true, collection: true, browse: true,
  boosters: true, leaderboard: true, friends: true, profile: true,
  settings: true, customize: true, new: true,
};

export function coverUrl(id: string): string | null {
  return PAGE_COVERS[id] ? assetUrl(`${import.meta.env.BASE_URL}covers/${id}.webp`) : null;
}
export function markUrl(id: string): string | null {
  return PAGE_COVERS[id] ? assetUrl(`${import.meta.env.BASE_URL}covers/${id}-mark.webp`) : null;
}
```

Two things worth getting right when you place them:

- **The mark is decoration, so it must be `aria-hidden` and `pointer-events:
  none`.** It sits behind the heading at low opacity; a screen reader
  announcing an unlabelled image there, or a click landing on it instead of the
  heading, are both regressions.
- **Ship them incrementally.** `coverUrl` returning null for a missing entry is
  deliberate: add ids to `PAGE_COVERS` as the files land, rather than
  registering all twelve and serving eleven 404s.
