# Micro-texture masks — 15 assets

Black-and-white textures used as **masks**, not as pictures. The texture never
ships as a visible image: it decides *where* a colour, gradient or glass panel
shows through. Change the fill, keep the texture.

All 15 prompts are self-contained — paste any one into an image generator with
nothing else.

---

## Polarity: white shows, black hides

Every texture below is generated **pure white marks on a pure black ground**,
and that is not arbitrary — it is the direction CSS reads:

```css
.panel {
  background: var(--glacier-accent-solid);   /* whatever colour you want */
  mask-image: url('/textures/halftone-tl.webp');
  mask-mode: luminance;      /* white = opaque, black = cut away */
  mask-size: cover;          /* or a tile size, for the seamless set */
}
```

`mask-mode: luminance` is the load-bearing line. The default is `alpha`, and
these files are fully opaque, so on the default every one of them would mask
nothing at all and you would see a flat rectangle of colour. If you would
rather not think about modes, run each file through a one-off alpha conversion
instead and drop the `mask-mode`.

To invert any texture (hide where it currently shows), don't regenerate it —
`filter: invert(1)` on the mask source, or swap the two colour words in the
prompt.

## Two families, and the difference matters

**Seamless** (assets 1–8) repeat forever. Use `mask-size: 24px` or whatever
tile size suits; the texture has no centre and no direction. Every one of these
prompts demands the edges wrap.

**Directional** (assets 9–15) are full-frame with a density ramp — they have a
corner or a centre, and tiling them shows the seam immediately. Use
`mask-size: cover` and one copy.

Generating a directional texture and then tiling it is the one mistake that
looks like a broken asset rather than a wrong choice.

## Output spec

| | |
|---|---|
| Generate at | 2048×2048 |
| Ship at | 1024×1024 (seamless) · 2048×2048 (directional) |
| Format | WebP, or PNG if your pipeline prefers lossless |
| Lives in | `public/textures/<id>.webp` |

```bash
sips -s format png -Z 1024 ~/Downloads/raw.png --out /tmp/t.png && cwebp -q 90 /tmp/t.png -o public/textures/<id>.webp
```

Quality 90, higher than for artwork: a mask's job is its edges, and WebP's
usual ringing around hard black/white boundaries shows up as grey fringing that
the mask then paints as a half-visible halo.

---

# Seamless — tile forever

## `hatch-diagonal`

> A seamless tileable texture, 2048×2048: fine parallel diagonal lines at 45
> degrees, pure white on a pure black background, evenly spaced with about
> three times as much black as white between them, each line crisp and of
> uniform width. Perfectly tileable - the pattern must continue without a
> visible seam when the image is repeated edge to edge in every direction, so
> every line leaving one edge meets its continuation on the opposite edge.
> Pure white and pure black only, no greys beyond the anti-aliasing on the line
> edges, no colour, no gradient, no vignette, no lighting, no texture or grain,
> no border, no frame. No text, no letters, no numerals, no logos, no
> watermark, no signature.

## `hatch-cross`

> A seamless tileable texture, 2048×2048: a fine crosshatch of two sets of thin
> parallel lines running at plus and minus 45 degrees and crossing each other,
> pure white on a pure black background, evenly spaced so the open black
> diamonds between them are several times the line width. Perfectly tileable -
> the pattern must continue without a visible seam when the image is repeated
> edge to edge in every direction, so every line leaving one edge meets its
> continuation on the opposite edge. Pure white and pure black only, no greys
> beyond the anti-aliasing on the line edges, no colour, no gradient, no
> vignette, no lighting, no grain, no border, no frame. No text, no letters, no
> numerals, no logos, no watermark, no signature.

## `blueprint-grid`

> A seamless tileable texture, 2048×2048: an engineering blueprint grid drawn
> as thin white lines on a pure black background, with a fine minor grid and a
> heavier major line every fifth division, the major lines about twice the
> weight of the minor ones. All lines crisp, straight and of uniform width
> within their class. Perfectly tileable - the grid must continue without a
> visible seam when the image is repeated edge to edge in every direction, with
> the major lines landing so their spacing stays regular across the join. Pure
> white and pure black only, no greys beyond the anti-aliasing on the line
> edges, no colour, no gradient, no vignette, no lighting, no paper texture, no
> grain, no border, no frame. No text, no letters, no numerals, no dimension
> labels, no logos, no watermark, no signature.

## `blueprint-iso`

> A seamless tileable texture, 2048×2048: an isometric drafting grid of thin
> white lines on a pure black background - three sets of parallel lines, one
> vertical and two at thirty degrees either side of horizontal, crossing to
> form a lattice of equilateral triangles. All lines crisp and of uniform
> width. Perfectly tileable - the lattice must continue without a visible seam
> when the image is repeated edge to edge in every direction. Pure white and
> pure black only, no greys beyond the anti-aliasing on the line edges, no
> colour, no gradient, no vignette, no lighting, no grain, no border, no frame.
> No text, no letters, no numerals, no logos, no watermark, no signature.

## `dots-uniform`

> A seamless tileable texture, 2048×2048: a regular grid of small solid white
> circles of identical size on a pure black background, evenly spaced with
> clear black gaps between them roughly twice each dot's diameter, arranged on
> a straight square lattice. Every dot the same size and perfectly round.
> Perfectly tileable - the lattice must continue without a visible seam when
> the image is repeated edge to edge in every direction, with dots at the edges
> completing correctly against the opposite side. Pure white and pure black
> only, no greys beyond the anti-aliasing on the dot edges, no colour, no
> gradient, no vignette, no lighting, no grain, no border, no frame. No text,
> no letters, no numerals, no logos, no watermark, no signature.

## `dots-hex`

> A seamless tileable texture, 2048×2048: small solid white circles of
> identical size on a pure black background, arranged on a hexagonal
> close-packed lattice so each dot is ringed by six others at equal distance,
> with clear black gaps between them. Every dot the same size and perfectly
> round. Perfectly tileable - the lattice must continue without a visible seam
> when the image is repeated edge to edge in every direction. Pure white and
> pure black only, no greys beyond the anti-aliasing on the dot edges, no
> colour, no gradient, no vignette, no lighting, no grain, no border, no frame.
> No text, no letters, no numerals, no logos, no watermark, no signature.

## `weave-linen`

> A seamless tileable texture, 2048×2048: a plain over-under woven fabric
> structure rendered as pure white threads on a pure black background, the warp
> and weft crossing at right angles in a regular basket interlace, each thread a
> flat white band of uniform width with black showing in the gaps. Flat and
> graphic - the over-under is described by which band is unbroken at each
> crossing, not by shading. Perfectly tileable - the weave must continue without
> a visible seam when the image is repeated edge to edge in every direction.
> Pure white and pure black only, no greys beyond the anti-aliasing on the
> edges, no colour, no gradient, no vignette, no lighting, no fibre detail, no
> border, no frame. No text, no letters, no numerals, no logos, no watermark,
> no signature.

## `chevron-micro`

> A seamless tileable texture, 2048×2048: a dense field of small white chevrons
> on a pure black background, all pointing the same way, arranged in offset rows
> so each row's chevrons sit between those of the row above, like a carbon-fibre
> or herringbone weave. Every chevron identical, flat white, with clear black
> separation between neighbours. Perfectly tileable - the field must continue
> without a visible seam when the image is repeated edge to edge in every
> direction. Pure white and pure black only, no greys beyond the anti-aliasing
> on the edges, no colour, no gradient, no vignette, no lighting, no grain, no
> border, no frame. No text, no letters, no numerals, no logos, no watermark, no
> signature.

---

# Directional — one copy, `mask-size: cover`

## `halftone-tl`

> A full-frame halftone gradient, 2048×2048, NOT tileable: solid white dots on a
> pure black background arranged on a regular grid, where the dots are large and
> nearly touching in the TOP-LEFT corner and shrink smoothly along the diagonal
> until they vanish entirely in the bottom-right, leaving that corner pure
> black. The grid spacing stays constant across the whole frame - only the dot
> SIZE changes, which is what makes it read as a printed halftone rather than as
> scattered dots. Every dot perfectly round. Pure white and pure black only, no
> greys beyond the anti-aliasing on the dot edges, no colour, no lighting, no
> grain, no border, no frame. No text, no letters, no numerals, no logos, no
> watermark, no signature.

## `halftone-tr`

> A full-frame halftone gradient, 2048×2048, NOT tileable: solid white dots on a
> pure black background arranged on a regular grid, where the dots are large and
> nearly touching in the TOP-RIGHT corner and shrink smoothly along the diagonal
> until they vanish entirely in the bottom-left, leaving that corner pure black.
> The grid spacing stays constant across the whole frame - only the dot SIZE
> changes, which is what makes it read as a printed halftone rather than as
> scattered dots. Every dot perfectly round. Pure white and pure black only, no
> greys beyond the anti-aliasing on the dot edges, no colour, no lighting, no
> grain, no border, no frame. No text, no letters, no numerals, no logos, no
> watermark, no signature.

## `halftone-bl`

> A full-frame halftone gradient, 2048×2048, NOT tileable: solid white dots on a
> pure black background arranged on a regular grid, where the dots are large and
> nearly touching in the BOTTOM-LEFT corner and shrink smoothly along the
> diagonal until they vanish entirely in the top-right, leaving that corner pure
> black. The grid spacing stays constant across the whole frame - only the dot
> SIZE changes, which is what makes it read as a printed halftone rather than as
> scattered dots. Every dot perfectly round. Pure white and pure black only, no
> greys beyond the anti-aliasing on the dot edges, no colour, no lighting, no
> grain, no border, no frame. No text, no letters, no numerals, no logos, no
> watermark, no signature.

## `halftone-radial`

> A full-frame halftone gradient, 2048×2048, NOT tileable: solid white dots on a
> pure black background arranged on a regular grid, where the dots are large and
> nearly touching at the exact CENTRE of the frame and shrink smoothly outward
> in every direction until they vanish entirely before reaching the edges,
> leaving the whole border pure black. The grid spacing stays constant across
> the frame - only the dot SIZE changes with distance from the centre. Every dot
> perfectly round, the falloff even and radially symmetric. Pure white and pure
> black only, no greys beyond the anti-aliasing on the dot edges, no colour, no
> lighting, no grain, no border, no frame. No text, no letters, no numerals, no
> logos, no watermark, no signature.

## `dither-bayer`

> A full-frame ordered-dither gradient, 2048×2048, NOT tileable: a hard
> black-and-white Bayer dither ramp of the kind used to fake shading on
> early computer displays, fully white at the top edge and fully black at the
> bottom, with the intermediate tones built purely from the characteristic
> regular checkerboard-like dither cells rather than from any smooth blend.
> Pixel-crisp with NO anti-aliasing and no blur - every pixel is either fully
> white or fully black, and the dither pattern must stay visible as discrete
> square cells at full size. No colour, no lighting, no grain, no border, no
> frame. No text, no letters, no numerals, no logos, no watermark, no signature.

## `scanlines-fade`

> A full-frame scanline gradient, 2048×2048, NOT tileable: fine horizontal white
> lines of uniform width and spacing across a pure black background, like a CRT
> raster, at full brightness along the top edge and fading smoothly to nothing
> by the bottom edge, which is left pure black. The line spacing stays constant
> down the whole frame - only their brightness falls away, so the fade reads as
> the raster dimming rather than as the lines spreading apart. Lines crisp and
> perfectly horizontal. White-to-black only, no colour, no bloom, no glow, no
> grain, no border, no frame. No text, no letters, no numerals, no logos, no
> watermark, no signature.

## `grain-vignette`

> A full-frame noise vignette, 2048×2048, NOT tileable: fine random
> monochrome film grain, dense and bright white at the outer edges and thinning
> smoothly toward the centre of the frame, which is left almost pure black. The
> grain is fine and evenly random with no visible clumping, banding, streaks or
> repeating pattern, and the falloff from edge to centre is smooth and even on
> all four sides. White grain on a pure black background, no colour, no
> lighting, no border, no frame. No text, no letters, no numerals, no logos, no
> watermark, no signature.

---

## Checking one before you generate the other fourteen

Two failures are common and neither is obvious in a thumbnail:

**A "seamless" texture that isn't.** Tile it four-up before shipping. Generators
routinely produce a plausible-looking pattern with a hard line down the join.

```bash
magick montage tex.png tex.png tex.png tex.png -tile 2x2 -geometry +0+0 check.png
```

**Grey where you wanted black.** A mask reads luminance, so a "black"
background at 4% grey lifts the whole texture and the masked colour bleeds
through everywhere it should be cut away. Check the histogram is genuinely
bimodal at the two ends rather than sitting in the middle:

```bash
magick tex.png -format "min=%[min] max=%[max] mean=%[mean]" info:
```

Want the black at 0 and the white at 65535 (or 255 at 8-bit), with the mean
telling you roughly what fraction is showing. If the minimum is not 0, run
`-level 5%,95%` before shipping.
