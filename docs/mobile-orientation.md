# Mobile flow: the playmat is landscape-only, everything else works both ways

Decided 2026-07-31, from a five-part audit of the running app at 375x812 and
812x375. This is the record of *what was chosen and why*, so a later change that
contradicts it is a deliberate reversal rather than an accident.

## The governing rule

**The playmat may be landscape-only. Every menu, sheet, modal, drawer, overlay
and page must work in both orientations.**

Nobody in the shipped market does what this app did before today. The two viable
models are lock-everything-landscape (Hearthstone, Master Duel - you never see a
rotate nag because portrait is never rendered) or support-both-everywhere (Marvel
Snap). MTG Arena ships the split we had - landscape gameplay, deck editing
unavailable in landscape - and documents it as a limitation, not a feature.

## What was actually broken

Measured, not inferred. Rank order is by how badly it hurts a real player.

1. **The whole non-table app was dead in landscape.** `App.tsx:505` mounted a
   fixed `inset:0`, 94%-opaque, pointer-catching cover over every route outside a
   room. Probing 12 points at 812x375 on `#/home`, every one returned
   `.rotateOverlay` except the pack pill. Kit modals portal at z-100/120, so
   Settings and CardPopup *survive* a rotation - they just cannot be *opened*,
   because every trigger sits under the cover.
2. **Portrait at a started table trapped the player.** The table's cover is z-65;
   `.boardTools` is z-8, `.mobileTurnDock` z-42, the sheet handle z-44. No leave,
   no concede, no settings, no life. The comment at `app.css:1546` claims the
   cover sits below the dock so Leave stays usable - but only an *already open*
   sheet is z-70, its handle is z-44. True in the lobby, false on the mat.
3. **Primary nav was broken in portrait**, the app's own preferred orientation.
   Nine destinations plus Settings need 449px and get 346px: Friends 31px past
   the viewport, Profile fully off-screen, Settings painted on top of Collection.
   Only 4 of 9 were tappable.
4. **The pack pill covered End turn and Attack.** Proven A/B:
   `elementFromPoint(764,340)` returned "Open the pack dock"; with the dock
   dismissed the identical point returned "End turn".
5. **The toast covered the decision it announced.** Mulligan and Keep hand both
   sit entirely inside the event toast's box at 812x375.
6. **The card menu pinned to the top edge on every long-press in landscape.**
   `top: Math.max(8, Math.min(menu.y, window.innerHeight - 440))` - at 375px tall
   the inner term is -65, so the expression is the constant 8. Four sibling menus
   use four different unrelated constants, all against `window.innerHeight`
   rather than the visual viewport.
7. **Settings lost two sections and its footer** in landscape: panel scrollHeight
   461 vs clientHeight 373, nothing in the chain scrolls, Done painted over the
   section rows.
8. **Life totals** live only inside a sheet that is unreachable in portrait and
   ~128px tall in landscape.

## The decisions

| # | Decision | Chosen |
| --- | --- | --- |
| 1 | The rotate-to-portrait cover | **Delete it entirely.** Every page renders in landscape; the bugs it was hiding get fixed instead. |
| 2 | Portrait at a started table | **Portrait companion view** - life steppers, turn, log, chat, roster, Leave/Concede, with "rotate to play" as the headline. |
| 3 | Landscape nav chrome | **Vertical rail on the leading edge.** 58px of abundant width instead of 85px of scarce height. |
| 4 | Nav item set | **Five plus a You sheet.** |
| 5 | Panel menus in landscape | **Trailing-edge side sheet**, full height, `min(26rem, 42vw)`. |
| 6 | A menu open during rotation | **Stays open and reflows.** Presentation is a CSS decision; nothing unmounts. |
| 7 | Card actions | **Finger-anchored preview** - press-and-hold gives a card preview plus an action column at the touch point. |
| 8 | The hand in landscape | **Tap-to-open drawer** - a peek strip that opens to a readable hand. |
| 9 | The zone strip | **Tap opens the zones, the deck face draws.** Matches the aria-label it already advertises. |
| 10 | Settings in landscape | **Two-pane rail plus detail** - stop applying the phone collapse when the viewport is short-but-wide. |
| 11 | Deck builder on a phone | **Sticky search plus a virtualized list**, hero collapses on scroll. |
| 12 | Pregame lobby | **Landscape-first, two column.** No rotation between picking a deck and playing. |
| 13 | The pack dock | **Docked into the nav** as a real destination; the floating pill goes away. |
| 14 | Touch targets | **Invisible 44px hit padding** on `pointer: coarse`; the 36px visuals stay. |
| 15 | Manifest | **Ship one, `orientation: any`.** There is no manifest today at all. |
| 16 | Nav slots, after 13 | **Home / Play / Decks / Packs / You.** Browse moves under You. |

## Consequences worth remembering

- Decisions 13 and 4 collided: docking packs needs a slot in a bar that was
  already two items over budget. Browse lost the slot because it is a catalog you
  visit occasionally and Packs is a repeat habit.
- Decision 6 rules out per-orientation component swaps for panels. If a surface
  needs genuinely different composition per orientation, that is a reversal of 6
  and needs saying out loud.
- Decision 1 removes the thing that was hiding every landscape bug, so it must
  land *with* the fixes, not before them.
- There is no web manifest and no `apple-mobile-web-app-capable` meta today, so
  `@media (display-mode: standalone)` cannot currently match. Any code reasoning
  about standalone mode is inert until decision 15 lands.
