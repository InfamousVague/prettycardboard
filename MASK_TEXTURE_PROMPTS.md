# Micro-texture masks — 15 assets

Black-and-white textures used as **masks**, not as pictures. The texture never
ships as a visible image: it decides *where* a colour, gradient or glass panel
shows through. Change the fill, keep the texture.

All 15 prompts are self-contained — paste any one into an image generator with
nothing else.

---

## What every one of these does

Two things, and both are what make it read as texture rather than as a gradient
with a pattern printed on it:

**The elements change size across the frame.** Large and open at the dense end,
down to pinpricks at the thin end. A pattern whose elements are all one size
reads as a screen laid over the image; one whose elements grow and shrink reads
as the image itself having depth.

**They dither away rather than fading away.** The thin end does not ramp
smoothly to nothing — individual elements start **dropping out at random**, a
few at first and then most, so the pattern dissolves into scattered specks and
finally into nothing. The boundary between pattern and empty is ragged and
noisy, never a clean edge and never a smooth blend.

That second one is the part a generator will quietly ignore unless you insist,
which is why every prompt below says it twice and in two different ways.

## Polarity: white shows, black hides

Generated **pure white marks on a pure black ground**, which is the direction
CSS reads:

```css
.panel {
  background: var(--glacier-accent-solid);   /* whatever colour you want */
  mask-image: url('/textures/halftone-tl.webp');
  mask-mode: luminance;      /* white = opaque, black = cut away */
  mask-size: cover;
}
```

`mask-mode: luminance` is load-bearing. The default is `alpha`, and these files
are fully opaque, so on the default every one of them masks *nothing* and you
get a flat rectangle of colour.

To invert (hide where it currently shows), don't regenerate — `filter:
invert(1)` on the mask source, or swap the two colour words in the prompt.

## These are not tiles

Every texture here has a direction and a density ramp, so it is used as **one
copy at `mask-size: cover`**. Tiling one repeats the dense corner in a grid and
looks like a broken asset rather than a wrong choice. If you later want a
uniform repeating screen as well, that is a different set and I will write it.

## Output spec

| | |
|---|---|
| Generate at | 2048×2048 |
| Ship at | 2048×2048 |
| Format | WebP, or PNG if your pipeline prefers lossless |
| Lives in | `public/textures/<id>.webp` |

```bash
sips -s format png -Z 2048 ~/Downloads/raw.png --out /tmp/t.png && cwebp -q 90 /tmp/t.png -o public/textures/<id>.webp
```

Quality 90, higher than for artwork: a mask's job is its edges, and WebP's
usual ringing around hard black/white boundaries paints as a half-visible halo.

---

# Halftone dissolves

> **The six halftones are now generated, not prompted.** Glacier's
> `halftoneSvg` / `halftoneDataUri` (`@glacier/logic`, GlacierUI de9b77d)
> compute the field: dots on a fixed grid, radius riding a positional ramp,
> dissolving by hashed dropout. An even lattice of smoothly varying dots is a
> computation, and asking a generator for one gets dots that wander off the
> lattice - which is what was wrong with the first batch.
>
> ```ts
> import { halftoneDataUri } from '@glacier/logic';
> element.style.maskImage = halftoneDataUri({ origin: 'top-left', cells: 48 });
> ```
>
> Ten origins are available - four corners, centre, edges, four sides - so the
> prompts below are kept only as a record of the intent. Generate them if you
> want raster copies; otherwise use the function, which is exact, tiny, scales
> without resampling, and needs no files.

## `halftone-tl`

> A full-frame halftone dissolve, 2048×2048, on a pure black background with
> pure white dots. In the TOP-LEFT corner the dots are large, fat and almost
> touching each other; travelling along the diagonal toward the bottom-right
> they get steadily smaller until they are fine pinpricks. As they shrink they
> also begin to DISAPPEAR AT RANDOM - a scattering of missing dots at first,
> then more gone than present, until only sparse isolated specks remain and
> finally nothing at all, leaving the bottom-right corner pure black. The fade
> is a dissolve, not a blend: no dot is ever grey or semi-transparent, each one
> is either fully white or absent, and the boundary between pattern and empty
> is ragged, speckled and irregular rather than a clean edge or a smooth
> gradient. The grid the dots sit on stays regular throughout - it is their SIZE
> and their SURVIVAL that change, not their spacing. Every dot perfectly round.
> Pure white and pure black only, no greys beyond the anti-aliasing on the dot
> edges, no colour, no lighting, no glow, no border, no frame. No text, no
> letters, no numerals, no logos, no watermark, no signature.

## `halftone-tr`

> A full-frame halftone dissolve, 2048×2048, on a pure black background with
> pure white dots. In the TOP-RIGHT corner the dots are large, fat and almost
> touching each other; travelling along the diagonal toward the bottom-left they
> get steadily smaller until they are fine pinpricks. As they shrink they also
> begin to DISAPPEAR AT RANDOM - a scattering of missing dots at first, then
> more gone than present, until only sparse isolated specks remain and finally
> nothing at all, leaving the bottom-left corner pure black. The fade is a
> dissolve, not a blend: no dot is ever grey or semi-transparent, each one is
> either fully white or absent, and the boundary between pattern and empty is
> ragged, speckled and irregular rather than a clean edge or a smooth gradient.
> The grid the dots sit on stays regular throughout - it is their SIZE and their
> SURVIVAL that change, not their spacing. Every dot perfectly round. Pure white
> and pure black only, no greys beyond the anti-aliasing on the dot edges, no
> colour, no lighting, no glow, no border, no frame. No text, no letters, no
> numerals, no logos, no watermark, no signature.

## `halftone-bl`

> A full-frame halftone dissolve, 2048×2048, on a pure black background with
> pure white dots. In the BOTTOM-LEFT corner the dots are large, fat and almost
> touching each other; travelling along the diagonal toward the top-right they
> get steadily smaller until they are fine pinpricks. As they shrink they also
> begin to DISAPPEAR AT RANDOM - a scattering of missing dots at first, then
> more gone than present, until only sparse isolated specks remain and finally
> nothing at all, leaving the top-right corner pure black. The fade is a
> dissolve, not a blend: no dot is ever grey or semi-transparent, each one is
> either fully white or absent, and the boundary between pattern and empty is
> ragged, speckled and irregular rather than a clean edge or a smooth gradient.
> The grid the dots sit on stays regular throughout - it is their SIZE and their
> SURVIVAL that change, not their spacing. Every dot perfectly round. Pure white
> and pure black only, no greys beyond the anti-aliasing on the dot edges, no
> colour, no lighting, no glow, no border, no frame. No text, no letters, no
> numerals, no logos, no watermark, no signature.

> **On the corners.** All four are transforms of one another - `tr` is `tl`
> mirrored horizontally, `bl` is `tl` mirrored vertically, `br` is `tl` turned
> 180 degrees - so strictly, one file plus a flip would do:
>
> ```bash
> magick halftone-tl.png -flop halftone-tr.png      # top-right
> magick halftone-tl.png -flip halftone-bl.png      # bottom-left
> magick halftone-tl.png -rotate 180 halftone-br.png
> ```
>
> Three are written out anyway because a dissolve is RANDOM, and three
> independent generations give three genuinely different scatters, where three
> flips of one file give the same scatter reflected - which is visible if two of
> them ever appear on the same screen. Bottom-right is the one left to the flip,
> to keep the set at fifteen; derive it, or paste `halftone-tl` and swap
> TOP-LEFT for BOTTOM-RIGHT and bottom-right for top-left.

## `halftone-radial`

> A full-frame halftone dissolve, 2048×2048, on a pure black background with
> pure white dots. At the exact CENTRE of the frame the dots are large, fat and
> almost touching each other; travelling outward in every direction they get
> steadily smaller until they are fine pinpricks. As they shrink they also begin
> to DISAPPEAR AT RANDOM - a scattering of missing dots at first, then more gone
> than present, until only sparse isolated specks remain and finally nothing at
> all, leaving the whole border of the frame pure black. The fade is a dissolve,
> not a blend: no dot is ever grey or semi-transparent, each one is either fully
> white or absent, and the boundary between pattern and empty is ragged,
> speckled and irregular rather than a clean ring or a smooth gradient. The grid
> the dots sit on stays regular throughout - it is their SIZE and their SURVIVAL
> that change, not their spacing. Every dot perfectly round, the falloff evenly
> radial. Pure white and pure black only, no greys beyond the anti-aliasing on
> the dot edges, no colour, no lighting, no glow, no border, no frame. No text,
> no letters, no numerals, no logos, no watermark, no signature.

## `halftone-inset`

> A full-frame halftone dissolve, 2048×2048, on a pure black background with
> pure white dots, running the opposite way to a vignette. Around all four EDGES
> of the frame the dots are large, fat and almost touching each other;
> travelling inward toward the centre they get steadily smaller until they are
> fine pinpricks. As they shrink they also begin to DISAPPEAR AT RANDOM - a
> scattering of missing dots at first, then more gone than present, until only
> sparse isolated specks remain and finally nothing at all, leaving the middle
> of the frame pure black. The fade is a dissolve, not a blend: no dot is ever
> grey or semi-transparent, each one is either fully white or absent, and the
> boundary between pattern and empty is ragged, speckled and irregular rather
> than a clean edge or a smooth gradient. The grid the dots sit on stays regular
> throughout - it is their SIZE and their SURVIVAL that change, not their
> spacing. Every dot perfectly round, the falloff even on all four sides. Pure
> white and pure black only, no greys beyond the anti-aliasing on the dot edges,
> no colour, no lighting, no glow, no border, no frame. No text, no letters, no
> numerals, no logos, no watermark, no signature.

---

# Line dissolves

## `hatch-diagonal`

> A full-frame line dissolve, 2048×2048, on a pure black background with pure
> white lines. Along the LEFT edge, thick bold white lines run diagonally at 45
> degrees, close together and heavy; travelling right across the frame they get
> steadily thinner until they are hairlines. As they thin they also begin to
> BREAK UP AT RANDOM - first into long dashes with occasional gaps, then into
> short broken fragments, then into scattered isolated specks, and finally
> nothing at all, leaving the right edge pure black. The fade is a dissolve, not
> a blend: no part of a line is ever grey or semi-transparent, every point is
> either fully white or absent, and the boundary between pattern and empty is
> ragged and speckled rather than a clean edge or a smooth gradient. The line
> spacing and the 45-degree angle stay constant throughout - it is their WEIGHT
> and their SURVIVAL that change. Pure white and pure black only, no greys
> beyond the anti-aliasing on the line edges, no colour, no lighting, no glow,
> no border, no frame. No text, no letters, no numerals, no logos, no watermark,
> no signature.

## `hatch-cross`

> A full-frame crosshatch dissolve, 2048×2048, on a pure black background with
> pure white lines. In the TOP-LEFT corner a dense crosshatch of thick white
> lines runs at plus and minus 45 degrees, heavy and close together; travelling
> toward the bottom-right the lines get steadily thinner until they are
> hairlines. As they thin they also begin to BREAK UP AT RANDOM - first into
> dashes, then into short fragments, then into scattered isolated specks, and
> finally nothing at all, leaving the bottom-right corner pure black. The two
> sets of lines break up independently, so in the middle ground one direction
> often survives where the other has already gone. The fade is a dissolve, not a
> blend: every point is either fully white or absent, never grey, and the
> boundary between pattern and empty is ragged and speckled rather than a clean
> edge or a smooth gradient. The line spacing and the angles stay constant
> throughout - it is their WEIGHT and their SURVIVAL that change. Pure white and
> pure black only, no greys beyond the anti-aliasing on the line edges, no
> colour, no lighting, no glow, no border, no frame. No text, no letters, no
> numerals, no logos, no watermark, no signature.

## `scanlines`

> A full-frame scanline dissolve, 2048×2048, on a pure black background with
> pure white lines. Along the TOP edge, thick bold white horizontal lines run
> across the frame like a coarse CRT raster; travelling down the frame they get
> steadily thinner until they are hairlines. As they thin they also begin to
> BREAK UP AT RANDOM - first into long dashes, then into short broken segments,
> then into scattered isolated specks, and finally nothing at all, leaving the
> bottom edge pure black. The fade is a dissolve, not a blend: every point is
> either fully white or absent, never grey or semi-transparent, and the boundary
> between pattern and empty is ragged and speckled rather than a clean edge or a
> smooth gradient. The line spacing stays constant down the whole frame - it is
> their WEIGHT and their SURVIVAL that change, so the raster thins and shatters
> rather than spreading apart. Lines perfectly horizontal. Pure white and pure
> black only, no greys beyond the anti-aliasing on the line edges, no colour, no
> bloom, no glow, no border, no frame. No text, no letters, no numerals, no
> logos, no watermark, no signature.

## `contours`

> A full-frame topographic dissolve, 2048×2048, on a pure black background with
> pure white lines. Concentric irregular contour lines, like the height rings on
> a survey map, are thick and widely spaced near the BOTTOM-LEFT corner and
> become thinner and more tightly packed travelling toward the top-right. As
> they thin they also begin to BREAK UP AT RANDOM - first into dashes, then into
> short fragments, then into scattered isolated specks, and finally nothing at
> all, leaving the top-right corner pure black. The fade is a dissolve, not a
> blend: every point is either fully white or absent, never grey, and the
> boundary between pattern and empty is ragged and speckled rather than a clean
> edge or a smooth gradient. The rings are smooth, closed and organic in shape,
> nested inside one another and never crossing. Pure white and pure black only,
> no greys beyond the anti-aliasing on the line edges, no colour, no lighting,
> no glow, no border, no frame. No text, no letters, no numerals, no elevation
> labels, no logos, no watermark, no signature.

---

# Grid dissolves

## `blueprint`

> A full-frame blueprint dissolve, 2048×2048, on a pure black background with
> pure white lines. In the TOP-LEFT corner a drafting grid is drawn in thick
> bold white lines with wide squares and a heavier major line every fifth
> division; travelling toward the bottom-right the whole grid gets finer - the
> lines thinner and the squares smaller - until it is a hairline mesh. As it
> thins it also begins to ERODE AT RANDOM - individual grid segments simply
> missing, a few at first and then most, so the mesh falls apart into
> disconnected fragments, then into scattered isolated specks, and finally
> nothing at all, leaving the bottom-right corner pure black. The fade is a
> dissolve, not a blend: every point is either fully white or absent, never
> grey, and the boundary between pattern and empty is ragged and speckled rather
> than a clean edge or a smooth gradient. Lines crisp, straight and axis-aligned
> throughout. Pure white and pure black only, no greys beyond the anti-aliasing
> on the line edges, no colour, no lighting, no glow, no paper texture, no
> border, no frame. No text, no letters, no numerals, no dimension labels, no
> logos, no watermark, no signature.

## `blueprint-iso`

> A full-frame isometric-grid dissolve, 2048×2048, on a pure black background
> with pure white lines. In the BOTTOM-LEFT corner an isometric drafting lattice
> is drawn in thick bold white lines - one set vertical and two at thirty
> degrees either side of horizontal, crossing into equilateral triangles - with
> wide spacing; travelling toward the top-right the lattice gets finer, the
> lines thinner and the triangles smaller, until it is a hairline mesh. As it
> thins it also begins to ERODE AT RANDOM - individual lattice segments simply
> missing, a few at first and then most, so the mesh falls apart into
> disconnected fragments, then into scattered isolated specks, and finally
> nothing at all, leaving the top-right corner pure black. The fade is a
> dissolve, not a blend: every point is either fully white or absent, never
> grey, and the boundary between pattern and empty is ragged and speckled rather
> than a clean edge or a smooth gradient. Lines crisp and straight throughout.
> Pure white and pure black only, no greys beyond the anti-aliasing on the line
> edges, no colour, no lighting, no glow, no border, no frame. No text, no
> letters, no numerals, no logos, no watermark, no signature.

## `weave`

> A full-frame weave dissolve, 2048×2048, on a pure black background with pure
> white threads. Along the BOTTOM edge a plain over-under woven basket
> structure is drawn in thick bold white bands crossing at right angles;
> travelling up the frame the weave gets finer - the bands narrower and the
> interlace tighter - until it is a hairline mesh. As it thins it also begins to
> COME APART AT RANDOM - individual bands simply missing from the interlace, a
> few at first and then most, so the cloth unravels into disconnected threads,
> then into scattered isolated specks, and finally nothing at all, leaving the
> top edge pure black. Flat and graphic - the over-under is described by which
> band is unbroken at each crossing, never by shading. The fade is a dissolve,
> not a blend: every point is either fully white or absent, never grey, and the
> boundary between pattern and empty is ragged and speckled rather than a clean
> edge or a smooth gradient. Pure white and pure black only, no greys beyond the
> anti-aliasing on the edges, no colour, no lighting, no glow, no fibre detail,
> no border, no frame. No text, no letters, no numerals, no logos, no watermark,
> no signature.

---

# Particle dissolves

## `chevrons`

> A full-frame chevron dissolve, 2048×2048, on a pure black background with pure
> white chevrons. In the TOP-RIGHT corner the chevrons are large and bold,
> packed in tight offset rows like a herringbone weave, all pointing the same
> way; travelling toward the bottom-left they get steadily smaller until they
> are tiny marks. As they shrink they also begin to DISAPPEAR AT RANDOM - a
> scattering of missing chevrons at first, then more gone than present, until
> only sparse isolated marks remain and finally nothing at all, leaving the
> bottom-left corner pure black. The fade is a dissolve, not a blend: each
> chevron is either fully white or absent, never grey or semi-transparent, and
> the boundary between pattern and empty is ragged and speckled rather than a
> clean edge or a smooth gradient. The rows stay regular throughout - it is the
> chevrons' SIZE and their SURVIVAL that change, not their spacing. Pure white
> and pure black only, no greys beyond the anti-aliasing on the edges, no
> colour, no lighting, no glow, no border, no frame. No text, no letters, no
> numerals, no logos, no watermark, no signature.

## `speckle`

> A full-frame speckle dissolve, 2048×2048, on a pure black background with pure
> white specks. Along the LEFT edge the frame is crowded with white specks of
> widely MIXED sizes - some fat blobs, many medium, a great many tiny - packed
> densely and scattered irregularly rather than sitting on any grid; travelling
> right across the frame both the sizes and the count fall away, the fat blobs
> disappearing first and the fine specks thinning out last, until only a sparse
> dusting remains and finally nothing at all, leaving the right edge pure black.
> The thinning is stochastic and uneven - clumps and bare patches, never a
> smooth ramp - and every speck is either fully white or absent, never grey or
> semi-transparent, so the boundary between pattern and empty is ragged and
> noisy rather than a clean edge. Specks irregular and organic in outline. Pure
> white and pure black only, no greys beyond the anti-aliasing on the edges, no
> colour, no lighting, no glow, no border, no frame. No text, no letters, no
> numerals, no logos, no watermark, no signature.

## `dither-ramp`

> A full-frame ordered-dither ramp, 2048×2048, pure white on a pure black
> background, of the kind used to fake shading on early computer displays.
> Solid white along the TOP edge, and travelling down the frame it breaks into a
> Bayer dither of ever-sparser white pixels - first a dense checker, then
> widening open patterns, then a thin scatter - until it reaches pure black at
> the bottom edge. This one is an ORDERED dither rather than a random dissolve -
> the pattern is a strict repeating Bayer matrix, so the thinning is regular and
> mechanical rather than speckled. That is the point of having it in the set: it
> is the one texture here that reads as a machine rendering a gradient rather
> than as a pattern coming apart.
> The dither cells are coarse and clearly visible at full size,
> and they get FINER as the pattern thins, so the top of the ramp is built from
> chunky blocks and the bottom from single scattered pixels. Pixel-crisp with NO
> anti-aliasing and NO blur whatsoever - every pixel is either fully white or
> fully black, never an intermediate grey, and there must be no smooth gradient
> anywhere in the image. No colour, no lighting, no glow, no border, no frame.
> No text, no letters, no numerals, no logos, no watermark, no signature.

---

## Checking one before you generate the other fourteen

**The dissolve is the thing that gets ignored.** A generator will happily give
you the size ramp and then fade it with opacity, which produces a pattern of
grey dots — useless as a mask, because grey is "half showing" and the whole
thin end becomes a haze instead of a scatter. Check the histogram is genuinely
bimodal at the two ends rather than piled in the middle:

```bash
magick tex.png -format "min=%[min] max=%[max] mean=%[mean]" info:
```

Want the minimum at 0 and the maximum at 65535 (255 at 8-bit). If you see a
fat middle, the generator faded instead of dissolving — say "no dot is ever
grey, each is either fully white or absent" again and regenerate.

**Then look at the thin end at 100%.** It should be scattered specks with
visible gaps and clumps, not an even mist. An even mist means it dithered the
*brightness* rather than dropping elements, which reads as noise rather than as
the pattern breaking up.
