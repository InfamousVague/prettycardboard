import de, { useState as pe, useLayoutEffect as ys, createContext as _a, useMemo as Bt, useContext as Gn, useCallback as at, useRef as ee, useEffect as xe, cloneElement as Xs, useId as Ee, Fragment as Zl, forwardRef as Ed, createElement as Ar } from "react";
import { jsx as c, jsxs as P, Fragment as vs } from "react/jsx-runtime";
import { useReducedMotion as Re, motion as $e, AnimatePresence as zi, useIsPresent as Yh } from "motion/react";
import { createPortal as yn } from "react-dom";
function o(e) {
  return `$${e}`;
}
const Dn = ["sm", "md", "lg"], Lo = ["sm", "md"], Vh = {
  sm: o("control-height-sm"),
  md: o("control-height-md"),
  lg: o("control-height-lg")
}, Gh = {
  sm: o("font-size-xs"),
  md: o("font-size-sm"),
  lg: o("font-size-md")
};
function tt(e, t = {}) {
  return {
    name: e,
    height: Vh[e],
    fontSize: Gh[e],
    ...t
  };
}
const Wd = ["neutral", "accent", "success", "warning", "danger", "info"], Kh = {
  neutral: "The default, low-emphasis gray family.",
  accent: "The brand accent family, for primary emphasis.",
  success: "Positive or complete states.",
  warning: "Caution states that still let the user proceed.",
  danger: "Errors and destructive states.",
  info: "Neutral-informational callouts."
};
function ro(e = Wd) {
  return e.map((t) => ({ name: t, description: Kh[t] }));
}
var gn = /* @__PURE__ */ ((e) => (e.XSmall = "xs", e.Small = "sm", e.Medium = "md", e.Large = "lg", e.XLarge = "xl", e))(gn || {}), Id = /* @__PURE__ */ ((e) => (e.Neutral = "neutral", e.Accent = "accent", e.Success = "success", e.Warning = "warning", e.Danger = "danger", e.Info = "info", e.Note = "note", e.Auto = "auto", e.Subtle = "subtle", e.Inherit = "inherit", e))(Id || {}), ti = /* @__PURE__ */ ((e) => (e.Default = "default", e.Muted = "muted", e.Subtle = "subtle", e.Accent = "accent", e.Danger = "danger", e.Success = "success", e.Warning = "warning", e))(ti || {}), Ba = /* @__PURE__ */ ((e) => (e.Solid = "solid", e.Soft = "soft", e.Outline = "outline", e.Ghost = "ghost", e.Glass = "glass", e.Danger = "danger", e))(Ba || {}), De = /* @__PURE__ */ ((e) => (e.Text = "text", e.Rect = "rect", e.Circle = "circle", e))(De || {}), Rd = /* @__PURE__ */ ((e) => (e.Subtle = "subtle", e.Default = "default", e.Accent = "accent", e))(Rd || {});
const Uh = {
  name: "AppShell",
  id: "app-shell",
  category: "organism",
  status: "stable",
  summary: "The app frame: a sticky sidebar beside a scrollable main column, with an optional mobile mode that uses an off-canvas drawer.",
  element: "div",
  anatomy: [
    { name: "sidebar", description: "The persistent side navigation landmark; sticky in desktop mode and an off-canvas drawer in mobile mode.", required: !0 },
    { name: "backdrop", description: "The scrim rendered behind the open mobile drawer; clicking it closes the drawer." },
    { name: "main", description: "The main column: header stacked above scrollable content." },
    { name: "header", description: "Sticky top bar holding the responsive sidebar toggle and optional header content." },
    { name: "menuButton", description: "The built-in IconButton that collapses the desktop sidebar or opens the mobile drawer." },
    { name: "closeButton", description: "The explicit X button inside the expanded mobile drawer." },
    { name: "resizer", description: `Optional role="separator" drag strip on the sidebar's inline-end edge with a centered grip; rendered only when resizable is set, desktop only.` },
    { name: "headerContent", description: "Wrapper for the caller-supplied header slot, placed right of the menu button." },
    { name: "content", description: "The scrollable region that renders children." },
    { name: "bottomNav", description: "Optional primary navigation pinned below mobile content and at the bottom of the desktop sidebar." }
  ],
  props: [
    { name: "sidebar", type: "node", required: !0, description: "The persistent side navigation content." },
    { name: "header", type: "node", description: "Optional top bar content, placed to the right of the mobile menu button." },
    { name: "bottomNav", type: "node", description: "Optional primary navigation shown below mobile content and at the bottom of the desktop sidebar." },
    { name: "sidebarWidth", type: "string", default: "16rem", description: "Sidebar width on desktop, set on the --shell-sidebar custom property." },
    { name: "sidebarLabel", type: "string", default: "Navigation", description: "Accessible name for the sidebar landmark." },
    { name: "floating", type: "boolean", default: !1, description: "Detaches the sidebar, header, and mobile bottom navigation into rounded cards with a gutter." },
    { name: "isMobile", type: "boolean", description: "Forces the mobile or desktop layout. When omitted, follows the lg viewport breakpoint." },
    { name: "resizable", type: "boolean", default: !1, description: "Lets the user drag the divider (or arrow-key it) to resize the sidebar." },
    { name: "onSidebarWidthChange", type: "handler", description: "Called with the next sidebar width (a px string) while resizing." },
    { name: "minSidebarWidth", type: "number", default: 200, description: "Lower clamp for the resize drag, in pixels." },
    { name: "maxSidebarWidth", type: "number", default: 460, description: "Upper clamp for the resize drag, in pixels." },
    { name: "children", type: "node", description: "The main content rendered in the scrollable column." }
  ],
  defaults: { sidebarWidth: "16rem", sidebarLabel: "Navigation", floating: !1, resizable: !1, minSidebarWidth: 200, maxSidebarWidth: 460 },
  // grid gutter for the floating variant; the sidebar and header share the space-4 gutter
  dimensions: {
    gap: o("space-3"),
    padding: o("space-2"),
    gutter: o("space-4"),
    radius: o("radius-xl"),
    border: o("hairline")
  },
  states: [
    { name: "open", description: "The mobile drawer is open: the sidebar slides in, gains a shadow, and the backdrop appears.", tokens: { shadow: o("shadow-5"), scrim: o("overlay") } },
    { name: "sidebar-collapsed", description: "The desktop sidebar, resizer, and sidebar bottom navigation are hidden while the main column fills the frame.", behavioral: !0 },
    {
      name: "sticky",
      description: "The sidebar and header stick to the top of the viewport as the content scrolls (position: sticky, top 0). Pure positioning with zero paint of its own - their constant surface and glass-thin paints are bound on the component tokens.",
      behavioral: !0
    },
    { name: "floating", description: "The sidebar and header detach into rounded, shadowed cards inset by the gutter.", tokens: { background: o("surface"), border: o("glass-border"), radius: o("radius-xl"), shadow: o("shadow-3") } },
    {
      name: "empty-header",
      description: "With no header content the mobile header strips its chrome to literals; on desktop the header remains visible so the sidebar toggle stays available.",
      behavioral: !0
    },
    {
      name: "resizer-hover",
      description: "Hovering or focusing the resize divider recolors its grip from border-strong to accent-solid and grows it from space-6 to space-8 tall; the divider itself suppresses its focus outline (outline: none) in favor of the grip highlight.",
      tokens: { grip: o("accent-solid"), "grip-rest": o("border-strong") }
    }
  ],
  // the sidebar and main children paint
  paint: {},
  transition: { duration: o("duration-normal"), ease: o("ease-out") },
  tokens: [
    "space-2",
    "space-3",
    "space-4",
    "space-6",
    "space-8",
    "radius-xl",
    "radius-full",
    "hairline",
    "surface",
    "glass-thin",
    "glass-border",
    "glass-saturate",
    "overlay",
    "blur-sm",
    "blur-md",
    "shadow-3",
    "shadow-5",
    "border-strong",
    "accent-solid",
    "duration-fast",
    "duration-normal",
    "ease-out"
  ],
  a11y: {
    role: "complementary",
    focusable: !1,
    keyboard: [
      { keys: "Escape", action: "Closes the open drawer." },
      { keys: "ArrowLeft, ArrowRight", action: "On the focused resizer, moves the divider by 16px steps toward or away from the sidebar (direction-aware in RTL)." },
      { keys: "Home, End", action: "On the focused resizer, jumps the sidebar to its minimum or maximum width." }
    ],
    notes: [
      'The sidebar is an aside landmark named by sidebarLabel (default "Navigation").',
      "The built-in responsive toggle carries aria-expanded and a state-aware Open navigation or Close navigation label.",
      "In mobile mode, the explicit X button, backdrop, or any link or button inside the sidebar closes the drawer.",
      "The drawer is not a focus trap and does not use dialog semantics; it is a persistent aside that becomes off-canvas.",
      `The optional resizer is a keyboard-reachable role="separator" (aria-orientation="vertical") labeled from the kit's translatable Resize sidebar message; it is hidden below the lg breakpoint.`
    ]
  },
  motion: {
    description: "In mobile mode the drawer slides in and out via a transform transition; it respects reduced motion.",
    transition: { speed: "normal", ease: "out" }
  }
}, ec = ["neutral", "accent", "success", "warning", "danger", "info"], Xh = {
  neutral: { paint: { background: o("hover"), border: o("border-subtle"), text: o("text-muted") } },
  accent: { paint: { background: o("accent-soft"), border: o("accent-border"), text: o("text-muted") } },
  success: { paint: { background: o("success-soft"), border: o("success-border"), text: o("text-muted") } },
  warning: { paint: { background: o("warning-soft"), border: o("warning-border"), text: o("text-muted") } },
  danger: { paint: { background: o("danger-soft"), border: o("danger-border"), text: o("text-muted") } },
  info: { paint: { background: o("info-soft"), border: o("info-border"), text: o("text-muted") } }
}, Jh = {
  name: "Announcements",
  id: "announcements",
  category: "atom",
  status: "stable",
  summary: "A compact application-chrome ticker that displays one short update at a time, sliding through a supplied update list with manual previous, next, and pause controls.",
  element: "section",
  anatomy: [
    { name: "viewport", description: "Clipped flexible area containing the current announcement message.", required: !0 },
    { name: "label", description: "Optional short category preceding the announcement content." },
    { name: "content", description: "The current announcement message, single-line truncated when needed.", required: !0 },
    { name: "controls", description: "Previous, position, pause/resume, and next controls when more than one update exists." }
  ],
  props: [
    {
      name: "items",
      type: "array",
      required: !0,
      description: "Ordered updates to display. At least one item is required.",
      item: {
        type: "object",
        description: "One announcement update.",
        fields: [
          { name: "id", type: "string", required: !0, description: "Stable identity used for the current-item transition and position." },
          { name: "label", type: "node", description: "Optional short category displayed before the content." },
          { name: "content", type: "node", required: !0, description: "Announcement message content." }
        ]
      }
    },
    { name: "tone", type: "enum", values: [...ec], default: "info", description: "Semantic color family for the soft strip surface and border." },
    { name: "index", type: "number", description: "Controlled zero-based index of the visible update." },
    { name: "defaultIndex", type: "number", default: 0, description: "Initially visible zero-based index in uncontrolled use." },
    { name: "onIndexChange", type: "handler", description: "Called with the next zero-based index after automatic or manual navigation." },
    { name: "autoPlay", type: "boolean", default: !0, description: "Rotates updates automatically until paused or the user interacts with the strip." },
    { name: "interval", type: "number", default: 7e3, description: "Milliseconds between automatic updates." },
    { name: "aria-label", type: "string", default: "Announcements", description: "Accessible name for the announcements region." }
  ],
  tones: ro(ec).map((e) => ({ ...e, ...Xh[e.name] ?? {} })),
  defaults: { tone: "info", defaultIndex: 0, autoPlay: !0, interval: 7e3, "aria-label": "Announcements" },
  dimensions: {
    minHeight: o("control-height-md"),
    radius: o("radius-lg"),
    gap: o("space-3"),
    border: o("hairline"),
    paddingInlineStart: o("space-4"),
    paddingInlineEnd: o("space-3"),
    paddingBlock: o("space-2"),
    viewportPaddingInline: o("space-1"),
    controlSize: o("control-height-sm")
  },
  states: [
    { name: "default", description: "Current update rests in a soft tone surface with its short label emphasized over muted message text." },
    { name: "rotating", description: "A new update slides in from inline-end and fades up after each interval.", behavioral: !0 },
    { name: "paused", description: "Automatic rotation stops and the control switches from pause to resume.", behavioral: !0 },
    { name: "interacting", description: "Automatic rotation pauses while the region is hovered or contains focus.", behavioral: !0 }
  ],
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-normal"), ease: o("ease-out") },
  tokens: [
    "control-height-md",
    "control-height-sm",
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "hairline",
    "radius-lg",
    "radius-md",
    "font-sans",
    "font-size-sm",
    "font-weight-semibold",
    "leading-md",
    "text",
    "text-muted",
    "text-subtle",
    "hover",
    "focus-ring",
    "duration-normal",
    "ease-out",
    "border-subtle",
    "accent-soft",
    "accent-border",
    "success-soft",
    "success-border",
    "warning-soft",
    "warning-border",
    "danger-soft",
    "danger-border",
    "info-soft",
    "info-border"
  ],
  a11y: {
    role: "region",
    focusable: !1,
    keyboard: [
      { keys: "Enter, Space", action: "Activates the focused previous, next, or pause/resume control." }
    ],
    notes: [
      'The strip is a labelled region, and the update content is aria-live="off" so automatic rotation does not interrupt assistive technology.',
      "The position text is a polite live region, announcing the current position after a user moves through the updates.",
      "Automatic movement pauses on hover and focus. A pause/resume control remains available whenever there is more than one update.",
      "Keep update content short and self-contained; the message is visually truncated to a single line on narrow layouts."
    ]
  },
  motion: {
    description: "Each changed update fades and slides in from inline-end over the normal duration. The transition is removed under reduced motion.",
    transition: { speed: "normal", ease: "out" }
  }
}, Qh = ["sm", "md", "lg", "xl"], Zh = ["circle", "rounded"], em = {
  name: "Avatar",
  id: "avatar",
  category: "atom",
  status: "stable",
  summary: "A square profile image that falls back to initials, then a blank placeholder, in four sizes and two shapes.",
  element: "span",
  anatomy: [
    { name: "image", description: "The src image, object-fit cover, shown when src is set and has not errored." },
    { name: "initials", description: "Up to two uppercased word-initials of name, shown when there is no image." },
    { name: "placeholder", description: "A blank sunken fill, shown when there is neither image nor name." }
  ],
  props: [
    { name: "src", type: "string", description: "Image URL; falls back to initials then placeholder on error." },
    { name: "alt", type: "string", description: "Image alt text; defaults to name then empty string." },
    { name: "name", type: "string", description: "Person name; source of the up-to-two-letter initials fallback." },
    { name: "size", type: "enum", values: Qh, default: "md", description: "Size step." },
    { name: "shape", type: "enum", values: Zh, default: "circle", description: "Circle or rounded-square." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." }
  ],
  sizes: [
    { name: "sm", diameter: o("size-xl"), fontSize: o("font-size-xs") },
    { name: "md", diameter: o("size-2xl"), fontSize: o("font-size-sm") },
    { name: "lg", diameter: o("size-3xl"), fontSize: o("font-size-md") },
    { name: "xl", diameter: o("size-4xl"), fontSize: o("font-size-lg") }
  ],
  defaults: { size: "md", shape: "circle", skeleton: !1, glass: !1 },
  dimensions: { radius: o("radius-full") },
  states: [
    { name: "image", description: "src present and not errored; the img covers the base sunken fill (object-fit cover), which shows while the image loads.", paint: { background: o("surface-sunken") } },
    // a branch switch only: onError re-renders as the initials or placeholder state, which carry the paint
    { name: "errored", description: "img onError falls the component through to the initials or placeholder branch.", behavioral: !0 },
    { name: "initials", description: "No image but a name; renders up to two uppercased initials on an accent-soft fill.", paint: { background: o("accent-soft"), text: o("accent-text") } },
    { name: "placeholder", description: "Neither image nor name; a blank sunken fill, aria-hidden.", paint: { background: o("surface-sunken") } }
  ],
  paint: { background: "$surface-sunken" },
  tokens: [
    "surface-sunken",
    "accent-soft",
    "accent-text",
    "radius-full",
    "radius-md",
    "font-sans",
    "font-weight-semibold",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "font-size-lg"
  ],
  a11y: {
    focusable: !1,
    notes: [
      "The initials wrapper carries aria-label={name}; the initials text itself is presentational.",
      "The blank placeholder is aria-hidden.",
      "A rounded shape uses radius-md; the default circle uses radius-full."
    ]
  }
}, tc = ["neutral", "accent", "success", "warning", "danger", "info"], tm = {
  neutral: {
    paint: { background: o("hover"), border: o("border-subtle"), text: o("text-muted") },
    tokens: { icon: o("text-muted") }
  },
  accent: {
    paint: { background: o("accent-soft"), border: o("accent-border"), text: o("text-muted") },
    tokens: { icon: o("accent-text"), dismissHover: o("accent-soft-hover") }
  },
  success: {
    paint: { background: o("success-soft"), border: o("success-border"), text: o("text-muted") },
    tokens: { icon: o("success-text"), dismissHover: o("success-soft-hover") }
  },
  warning: {
    paint: { background: o("warning-soft"), border: o("warning-border"), text: o("text-muted") },
    tokens: { icon: o("warning-text"), dismissHover: o("warning-soft-hover") }
  },
  danger: {
    paint: { background: o("danger-soft"), border: o("danger-border"), text: o("text-muted") },
    tokens: { icon: o("danger-text"), dismissHover: o("danger-soft-hover") }
  },
  info: {
    paint: { background: o("info-soft"), border: o("info-border"), text: o("text-muted") },
    tokens: { icon: o("info-text"), dismissHover: o("info-soft-hover") }
  }
}, nm = {
  name: "Banner",
  id: "banner",
  category: "atom",
  status: "stable",
  summary: "A full-width inline alert strip in every tone, laying a leading icon, a flexible message, and a trailing action or dismiss control across one horizontal row on a soft tone surface.",
  element: "div",
  anatomy: [
    { name: "icon", description: "Optional leading glyph, vertically centered with the message and tinted by the tone." },
    { name: "message", description: "The message content, flexing to fill the remaining width and clipping its own overflow.", required: !0 },
    { name: "action", description: "Optional trailing slot for a Button or link, sitting to the right of the message." },
    { name: "dismiss", description: "Optional trailing close control, a small ghost IconButton shown only when onDismiss is set." }
  ],
  props: [
    { name: "tone", type: "enum", values: [...tc], default: "info", description: "Semantic color family; warning and danger also switch the ARIA role to alert." },
    { name: "icon", type: "node", description: "Leading glyph, rendered in the icon slot and tinted by the tone." },
    { name: "action", type: "node", description: "Trailing slot for a Button or link, rendered after the message." },
    { name: "onDismiss", type: "handler", description: 'When set, renders a trailing close IconButton (aria-label "Dismiss") that calls this on press.' },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a full-width placeholder with the banner geometry instead of content." },
    { name: "children", type: "node", description: "Banner message content, placed in the message slot." }
  ],
  tones: ro(tc).map((e) => ({ ...e, ...tm[e.name] ?? {} })),
  defaults: { tone: "info", skeleton: !1 },
  dimensions: {
    radius: o("radius-lg"),
    gap: o("space-3"),
    border: o("hairline"),
    paddingInline: o("space-4"),
    paddingBlock: o("space-3"),
    dismissOffset: o("space-1"),
    fontSize: o("font-size-sm")
  },
  states: [
    { name: "default", description: "Resting strip: a soft tone-tinted surface behind a hairline tone border, message text in the secondary color." },
    { name: "skeleton", description: "Loading placeholder: a full-width, 3rem-tall block at radius-lg standing in for the strip, replacing all content." }
  ],
  tokens: [
    "space-1",
    "space-3",
    "space-4",
    "hairline",
    "radius-lg",
    "font-sans",
    "font-size-sm",
    "leading-md",
    "hover",
    "text-muted",
    "border-subtle",
    "accent-soft",
    "accent-soft-hover",
    "accent-border",
    "accent-text",
    "success-soft",
    "success-soft-hover",
    "success-border",
    "success-text",
    "warning-soft",
    "warning-soft-hover",
    "warning-border",
    "warning-text",
    "danger-soft",
    "danger-soft-hover",
    "danger-border",
    "danger-text",
    "info-soft",
    "info-soft-hover",
    "info-border",
    "info-text"
  ],
  a11y: {
    role: "status",
    focusable: !1,
    keyboard: [
      { keys: "Enter, Space", action: "Activates the trailing dismiss control when it holds focus, matching a pointer press." }
    ],
    notes: [
      'A warning or danger banner uses role="alert" (assertive live region); all other tones use role="status" (polite live region).',
      "The banner strip itself is not focusable; only the trailing dismiss control and any action content take focus.",
      'When onDismiss is set, the close control is a ghost IconButton carrying aria-label="Dismiss".',
      "Do not rely on tone color alone to carry meaning; the message text should state it on its own."
    ]
  },
  motion: {
    description: "The banner strip does not animate; only the trailing dismiss IconButton presses inward (scale 0.94 on tap), and that press is suppressed under reduced motion.",
    press: !0,
    transition: { speed: "fast", ease: "out" }
  }
}, am = ["solid", "soft", "outline", "ghost", "glass", "danger"], om = {
  name: "Button",
  id: "button",
  category: "atom",
  status: "stable",
  summary: "The primary action control: a labelled, optionally icon-led button in six variants and three sizes.",
  element: "button",
  anatomy: [
    { name: "leadingIcon", description: "Optional icon before the label, passed as part of children." },
    { name: "spinner", description: "A leading Spinner shown before the label while loading." },
    { name: "label", description: "The button text or icon content.", required: !0 },
    { name: "trailingIcon", description: "Optional icon after the label, passed as part of children." }
  ],
  props: [
    { name: "variant", type: "enum", values: am, default: "solid", description: "Visual style family." },
    { name: "size", type: "enum", values: Dn, default: "md", description: "Control size step." },
    { name: "loading", type: "boolean", default: !1, description: "Shows a spinner and blocks interaction." },
    { name: "fullWidth", type: "boolean", default: !1, description: "Stretches to the container width." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the button and blocks interaction." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "children", type: "node", required: !0, description: "Button label, and any leading or trailing icon." }
  ],
  variants: [
    { name: "solid", description: "Filled with the accent, for the primary action.", paint: { background: o("accent-solid"), text: o("accent-contrast") }, tokens: { hover: o("accent-solid-hover") } },
    { name: "soft", description: "Tinted accent, for a secondary emphasis.", paint: { background: o("accent-soft"), text: o("accent-text") }, tokens: { hover: o("accent-soft-hover") } },
    { name: "outline", description: "Hairline border on a transparent fill.", paint: { border: o("border-strong"), text: o("text") }, tokens: { hover: o("hover") } },
    { name: "ghost", description: "No fill until hovered, for low-emphasis actions.", paint: { text: o("text") }, tokens: { hover: o("hover") } },
    { name: "glass", description: "Frosted glass material for chrome over content.", paint: { background: o("glass-regular"), border: o("glass-border"), text: o("text") }, tokens: { hover: o("glass-thick") } },
    { name: "danger", description: "Filled with the danger color for destructive actions.", paint: { background: o("danger-solid"), text: o("danger-contrast") }, tokens: { hover: o("danger-solid-hover") } }
  ],
  sizes: [
    tt("sm", { paddingInline: o("space-4") }),
    tt("md", { paddingInline: o("space-5") }),
    tt("lg", { paddingInline: o("space-6") })
  ],
  defaults: { variant: "solid", size: "md", loading: !1, fullWidth: !1, disabled: !1, skeleton: !1 },
  dimensions: { radius: o("control-radius"), gap: o("space-2"), border: o("hairline") },
  states: [
    {
      name: "hover",
      description: "Background lifts to the variant hover token.",
      tokens: {
        solid: o("accent-solid-hover"),
        soft: o("accent-soft-hover"),
        outline: o("hover"),
        ghost: o("hover"),
        glass: o("glass-thick"),
        danger: o("danger-solid-hover")
      }
    },
    { name: "active", description: "Ghost presses to the active token; others rely on the tap scale.", tokens: { ghost: o("active") } },
    { name: "focus-visible", description: "A 2px accent focus ring blooms outward.", tokens: { ring: o("focus-ring") } },
    { name: "disabled", description: "Halved opacity and not-allowed cursor." },
    { name: "loading", description: "A leading spinner shows and pointer input is blocked." }
  ],
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-2",
    "space-4",
    "space-5",
    "space-6",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "control-radius",
    "hairline",
    "font-sans",
    "font-weight-medium",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "accent-solid",
    "accent-solid-hover",
    "accent-contrast",
    "accent-soft",
    "accent-soft-hover",
    "accent-text",
    "border-strong",
    "text",
    "hover",
    "active",
    "danger-solid",
    "danger-solid-hover",
    "danger-contrast",
    "glass-regular",
    "glass-thick",
    "glass-border",
    "glass-highlight",
    "blur-sm",
    "glass-saturate",
    "shadow-1",
    "shadow-2",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "button",
    focusable: !0,
    keyboard: [{ keys: "Enter, Space", action: "Activates the button." }],
    notes: ["A disabled or loading button is removed from the tab order and blocks activation."]
  },
  motion: {
    description: "Presses inward on tap and eases its colors on hover; both respect reduced motion.",
    press: !0,
    transition: { speed: "fast", ease: "out" }
  }
}, sm = ["note", "info", "success", "warning", "danger"], im = {
  name: "Callout",
  id: "callout",
  category: "atom",
  status: "stable",
  summary: "A bordered message block in five tones, with an optional leading icon and bold title.",
  element: "div",
  anatomy: [
    { name: "icon", description: "Optional leading glyph, top-aligned with the first line." },
    { name: "title", description: "Optional bold heading above the body." },
    { name: "body", description: "The message content.", required: !0 }
  ],
  props: [
    { name: "tone", type: "enum", values: sm, default: "note", description: "Semantic color family." },
    { name: "title", type: "node", description: "Bold heading above the body." },
    { name: "icon", type: "node", description: "Leading glyph." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "children", type: "node", description: "Callout body content." }
  ],
  tones: [
    // body text stays text-muted in every tone; the title and icon carry the tone color
    { name: "note", description: "Neutral, sunken surface, the default.", paint: { background: o("surface-sunken"), border: o("border-subtle"), text: o("text-muted") }, tokens: { title: o("text"), icon: o("text-muted") } },
    { name: "info", description: "Neutral-informational tint.", paint: { background: o("info-soft"), border: o("info-border"), text: o("text-muted") }, tokens: { title: o("info-text"), icon: o("info-text") } },
    { name: "success", description: "Positive or complete states.", paint: { background: o("success-soft"), border: o("success-border"), text: o("text-muted") }, tokens: { title: o("success-text"), icon: o("success-text") } },
    { name: "warning", description: "Caution states, rendered as an alert.", paint: { background: o("warning-soft"), border: o("warning-border"), text: o("text-muted") }, tokens: { title: o("warning-text"), icon: o("warning-text") } },
    { name: "danger", description: "Errors and destructive states, rendered as an alert.", paint: { background: o("danger-soft"), border: o("danger-border"), text: o("text-muted") }, tokens: { title: o("danger-text"), icon: o("danger-text") } }
  ],
  defaults: { tone: "note", skeleton: !1, glass: !1 },
  dimensions: {
    radius: o("radius-lg"),
    gap: o("space-3"),
    border: o("hairline"),
    paddingInline: o("space-5"),
    paddingBlock: o("space-4"),
    bodyGap: o("space-1"),
    fontSize: o("font-size-sm")
  },
  tokens: [
    "space-1",
    "space-3",
    "space-4",
    "space-5",
    "hairline",
    "radius-lg",
    "border-subtle",
    "surface-sunken",
    "font-sans",
    "font-size-sm",
    "leading-md",
    "font-weight-semibold",
    "text",
    "text-muted",
    "info-soft",
    "info-border",
    "info-text",
    "success-soft",
    "success-border",
    "success-text",
    "warning-soft",
    "warning-border",
    "warning-text",
    "danger-soft",
    "danger-border",
    "danger-text"
  ],
  a11y: {
    role: "note",
    focusable: !1,
    notes: ['A warning or danger callout uses role="alert"; other tones use role="note".']
  }
}, rm = ["solid", "glass"], lm = [0, 1, 2, 3, 4, 5], cm = {
  name: "Card",
  id: "card",
  category: "atom",
  status: "stable",
  summary: "A raised surface panel with six elevation steps, an optional glass material, and an interactive lift.",
  element: "div",
  props: [
    { name: "elevation", type: "enum", values: lm.map(String), default: 1, description: "Shadow depth, 0 through 5." },
    { name: "interactive", type: "boolean", default: !1, description: "Adds a hover lift and shadow bump for clickable cards." },
    { name: "variant", type: "enum", values: rm, default: "solid", description: "Surface material; glass renders a translucent blurred pane." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "children", type: "node", description: "Card content." }
  ],
  variants: [
    { name: "solid", description: "Opaque raised surface with a subtle hairline border.", paint: { background: o("surface-raised"), border: o("border-subtle"), text: o("text") } },
    { name: "glass", description: "Translucent blurred material for chrome over content.", paint: { background: o("glass-regular"), border: o("glass-border"), text: o("text") }, tokens: { highlight: o("glass-highlight") } }
  ],
  defaults: { elevation: 1, interactive: !1, variant: "solid", skeleton: !1 },
  dimensions: { radius: o("radius-xl"), padding: o("space-6"), border: o("hairline") },
  states: [
    { name: "elevation-0", description: "Flat, no shadow.", tokens: { shadow: o("shadow-0") } },
    { name: "elevation-1", description: "The default resting depth.", tokens: { shadow: o("shadow-1") } },
    { name: "elevation-2", description: "Raised.", tokens: { shadow: o("shadow-2") } },
    { name: "elevation-3", description: "Floating.", tokens: { shadow: o("shadow-3") } },
    { name: "elevation-4", description: "Overlay depth.", tokens: { shadow: o("shadow-4") } },
    { name: "elevation-5", description: "Top layer.", tokens: { shadow: o("shadow-5") } },
    {
      name: "hover",
      description: "When interactive, the shadow bumps one step and the card lifts 2px.",
      // keyed by resting elevation: the shadow each step hovers to
      tokens: {
        "elevation-0": o("shadow-1"),
        "elevation-1": o("shadow-2"),
        "elevation-2": o("shadow-3"),
        "elevation-3": o("shadow-4"),
        "elevation-4": o("shadow-5"),
        "elevation-5": o("shadow-5")
      }
    }
  ],
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "surface-raised",
    "hairline",
    "border-subtle",
    "radius-xl",
    "space-6",
    "space-2",
    "font-sans",
    "text",
    "duration-fast",
    "ease-out",
    "glass-regular",
    "glass-border",
    "glass-highlight",
    "blur-md",
    "glass-saturate",
    "shadow-0",
    "shadow-1",
    "shadow-2",
    "shadow-3",
    "shadow-4",
    "shadow-5",
    "elevation-overlay-0",
    "elevation-overlay-1",
    "elevation-overlay-2",
    "elevation-overlay-3",
    "elevation-overlay-4",
    "elevation-overlay-5"
  ],
  a11y: {
    focusable: !1,
    notes: ["A plain container with no implicit role; wire up role and keyboard handling when used as an interactive card."]
  },
  motion: {
    description: "When interactive, lifts on hover and presses inward on tap, and eases its shadow; both respect reduced motion.",
    press: !0,
    transition: { speed: "fast", ease: "out" }
  }
}, dm = {
  name: "Checkbox",
  id: "checkbox",
  category: "atom",
  status: "stable",
  summary: "A binary checkbox: a native input with a custom square box and an animated check, plus an optional label.",
  element: "label",
  anatomy: [
    { name: "input", description: "Visually hidden native checkbox input that carries state and focus.", required: !0 },
    { name: "box", description: "The square indicator that fills on check and holds the checkmark.", required: !0 },
    { name: "label", description: "Optional text beside the box." }
  ],
  props: [
    { name: "label", type: "node", description: "Text or content shown beside the box." },
    { name: "checked", type: "boolean", description: "Controlled checked state." },
    { name: "defaultChecked", type: "boolean", default: !1, description: "Initial checked state when uncontrolled." },
    { name: "onCheckedChange", type: "handler", description: "Fires with the next checked value on change." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the control and blocks interaction." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." }
  ],
  defaults: { defaultChecked: !1, skeleton: !1, glass: !1 },
  dimensions: { radius: o("radius-sm"), gap: o("space-2"), border: o("hairline"), size: "1.375rem", iconSize: "0.875rem" },
  states: [
    { name: "checked", description: "Box fills with the accent and shows the check.", paint: { background: o("accent-solid"), border: o("accent-solid") }, tokens: { check: o("accent-contrast") } },
    { name: "focus-visible", description: "A 2px accent focus ring rings the box.", tokens: { ring: o("focus-ring") } },
    { name: "disabled", description: "Halved opacity and not-allowed cursor." }
  ],
  paint: { background: "$surface", border: "$border-strong" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-2",
    "font-sans",
    "font-size-sm",
    "text",
    "hairline",
    "border-strong",
    "duration-fast",
    "ease-out",
    "focus-ring",
    "radius-sm",
    "surface",
    "accent-contrast",
    "accent-solid"
  ],
  a11y: {
    role: "checkbox",
    focusable: !0,
    keyboard: [{ keys: "Space", action: "Toggles the checkbox." }],
    notes: [
      "The native input carries the role, state, and focus; the box is aria-hidden.",
      "A disabled checkbox is removed from the tab order and blocks toggling."
    ]
  },
  motion: {
    description: "The checkmark draws its path in on check; the box eases its fill and border. Both respect reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, um = {
  name: "CodeBlock",
  id: "code-block",
  category: "atom",
  status: "stable",
  summary: "A framed, scrollable code panel with an optional header carrying a filename, language, and copy button.",
  element: "div",
  anatomy: [
    { name: "header", description: "Optional top bar; renders when copy is on or a filename or language is set." },
    { name: "filename", description: "Monospace filename in the header, truncated with an ellipsis when it overflows." },
    { name: "language", description: "Uppercase monospace language label in the header." },
    { name: "copy", description: 'A button that copies the code and flips to "Copied" for 1.5s.' },
    { name: "pre", description: "The scrollable monospace code area, holding either the plain source or the highlighted markup.", required: !0 },
    { name: "gutter", description: "Optional line-number column, one number per line via CSS counters on the line spans." }
  ],
  props: [
    { name: "code", type: "string", required: !0, description: "The source text: the accessible content, what copy copies, and the plain fallback." },
    { name: "children", type: "node", description: "Pre-highlighted markup for the code, supplied by the app; the kit ships no highlighter. Falls back to plain code when absent." },
    { name: "language", type: "string", description: "Language label shown in the header." },
    { name: "filename", type: "string", description: "Filename shown in the header." },
    { name: "showCopy", type: "boolean", default: !0, description: "Shows the copy button in the header." },
    { name: "lineNumbers", type: "boolean", default: !1, description: "Renders a line-number gutter down the left edge." },
    { name: "attached", type: "boolean", default: !1, description: "Drops the top border and top corners so the block docks beneath the element above it." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." }
  ],
  defaults: { showCopy: !0, lineNumbers: !1, attached: !1, skeleton: !1, glass: !1 },
  dimensions: {
    radius: o("radius-lg"),
    gap: o("space-3"),
    border: o("hairline"),
    headerPaddingBlock: o("space-2"),
    headerPaddingInline: o("space-3"),
    prePadding: o("space-4"),
    copyRadius: o("radius-sm"),
    copyPaddingBlock: o("space-1"),
    copyPaddingInline: o("space-2")
  },
  states: [
    { name: "copy-hover", description: "The copy button fills with the hover token.", tokens: { background: o("hover") } },
    // a label swap on a 1.5s timer; the button's paint does not change
    { name: "copied", description: 'After a successful copy the button reads "Copied" for 1.5s, then resets to "Copy".', behavioral: !0 }
  ],
  paint: { background: "$surface-sunken", border: "$border-subtle" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "hairline",
    "radius-lg",
    "radius-sm",
    "surface-sunken",
    "border-subtle",
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "font-sans",
    "font-mono",
    "font-size-xs",
    "leading-md",
    "text",
    "text-muted",
    "text-subtle",
    "hover",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    focusable: !1,
    keyboard: [{ keys: "Enter, Space", action: "Activates the copy button when it holds focus." }],
    notes: ["The copy button is the only focusable part; the code itself is static text."]
  },
  motion: {
    description: "The copy button eases its background on hover; respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, hm = ["danger", "accent", "neutral", "success"], mm = {
  name: "CounterBadge",
  id: "counter-badge",
  category: "atom",
  status: "stable",
  summary: "A small numeric badge for unread or attention counts on nav icons and tabs, pill-shaped with tabular figures.",
  element: "span",
  anatomy: [{ name: "count", description: "The count label, capped at `${max}+`; hidden from assistive tech via the status label." }],
  props: [
    { name: "count", type: "number", required: !0, description: "The number to display; the badge renders nothing when count is 0 or less." },
    { name: "max", type: "number", default: 99, description: "Renders `${max}+` when count is greater than max." },
    { name: "tone", type: "enum", values: hm, default: "danger", description: "Semantic color family." },
    { name: "dot", type: "boolean", default: !1, description: "Renders a small dot with no number, for presence or attention." },
    { name: "size", type: "enum", values: Lo, default: "md", description: "Compact size step." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "aria-label", type: "string", description: "Overrides the status label; defaults to `${count} items`, or `New activity` in dot mode." }
  ],
  tones: [
    { name: "danger", description: "Errors and destructive states, the default.", paint: { background: o("danger-solid"), text: o("danger-contrast") } },
    { name: "accent", description: "The brand accent family, for primary emphasis.", paint: { background: o("accent-solid"), text: o("accent-contrast") } },
    { name: "neutral", description: "The default, low-emphasis gray family.", paint: { background: o("gray-9"), text: o("accent-contrast") } },
    { name: "success", description: "Positive or complete states.", paint: { background: o("success-solid"), text: o("success-contrast") } }
  ],
  sizes: [
    { name: "sm", height: o("size-sm"), paddingInline: o("space-1"), fontSize: o("font-size-xs"), diameter: o("size-2xs") },
    { name: "md", height: o("size-md"), paddingInline: o("space-2"), fontSize: o("font-size-xs"), diameter: o("size-xs") }
  ],
  defaults: { max: 99, tone: "danger", dot: !1, size: "md", skeleton: !1, glass: !1 },
  dimensions: { radius: o("radius-full") },
  tokens: [
    "radius-full",
    "font-sans",
    "font-weight-semibold",
    "space-1",
    "space-2",
    "font-size-xs",
    "danger-solid",
    "danger-contrast",
    "accent-solid",
    "accent-contrast",
    "gray-9",
    "success-solid",
    "success-contrast"
  ],
  a11y: {
    role: "status",
    focusable: !1,
    notes: [
      'Sets role="status" and an aria-label so the count is announced; the visible digits are aria-hidden.',
      'In dot mode the label defaults to "New activity"; otherwise to "${count} items".'
    ]
  }
}, pm = ["horizontal", "vertical"], fm = {
  name: "Divider",
  id: "divider",
  category: "atom",
  status: "stable",
  summary: "A hairline rule that separates content, horizontal or vertical, with an optional centered label.",
  element: "hr",
  anatomy: [{ name: "label", description: "Optional centered text; switches the rule to a labelled separator." }],
  props: [
    { name: "orientation", type: "enum", values: pm, default: "horizontal", description: "Rule direction." },
    { name: "label", type: "node", description: "Centered label; renders a div separator with a rule on each side." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." }
  ],
  defaults: { orientation: "horizontal", skeleton: !1 },
  dimensions: { thickness: o("hairline"), gap: o("space-3") },
  paint: { background: "$border-subtle" },
  tokens: ["hairline", "border-subtle", "space-3", "font-family-sans", "font-size-xs", "text-subtle"],
  a11y: {
    role: "separator",
    focusable: !1,
    notes: ['A vertical divider sets aria-orientation="vertical".']
  }
}, gm = {
  name: "EmptyState",
  id: "empty-state",
  category: "atom",
  status: "stable",
  summary: "A centered placeholder for an empty, filtered, or not-yet-created view. Stacks an optional icon disc, a title, a muted description, and an action, centered on both axes so it reads as a calm, deliberate stop rather than a broken screen.",
  element: "div",
  anatomy: [
    { name: "disc", description: "Optional round, sunken disc framing a decorative glyph above the title. Omitted when no icon is passed." },
    { name: "title", description: "Short heading naming what is empty or missing; renders as an h2.", required: !0 },
    { name: "description", description: "Optional muted sentence with more context, capped at 28rem and centered." },
    { name: "action", description: "Optional call-to-action row (typically a Button) pulled a touch closer to the text." },
    { name: "extra", description: "Any children passed after the action, rendered below it for custom content." }
  ],
  props: [
    { name: "icon", type: "node", description: "Decorative glyph rendered inside the leading disc; the disc is omitted when unset." },
    { name: "title", type: "node", required: !0, description: "Heading naming what is empty; the accessible label for the view, rendered as an h2." },
    { name: "description", type: "node", description: "Muted supporting sentence, centered and capped at 28rem." },
    { name: "action", type: "node", description: "Call-to-action node, e.g. a Button, rendered below the text." },
    { name: "children", type: "node", description: "Extra content rendered below the action." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry: a disc plus two text lines." }
  ],
  defaults: { skeleton: !1 },
  dimensions: {
    gap: o("space-4"),
    discSize: "4rem",
    discRadius: o("radius-full"),
    iconSize: o("font-size-2xl"),
    paddingBlock: o("space-8"),
    paddingInline: o("space-6"),
    descriptionMaxWidth: "28rem",
    titleFontSize: o("font-size-lg"),
    descriptionFontSize: o("font-size-sm"),
    actionGap: o("space-3"),
    actionOffset: o("space-2")
  },
  states: [
    { name: "default", description: "A centered column: the sunken icon disc, an h2 title in the primary text color, a secondary-text description, then the action." },
    { name: "skeleton", description: "Replaces the content with a 4rem circle placeholder and two text-line placeholders sized to the title (lg) and description (sm), holding the same vertical rhythm." }
  ],
  paint: { text: "$text-muted" },
  tokens: [
    "space-2",
    "space-3",
    "space-4",
    "space-6",
    "space-8",
    "radius-full",
    "surface-sunken",
    "font-sans",
    "font-size-sm",
    "font-size-lg",
    "font-size-2xl",
    "font-weight-semibold",
    "leading-md",
    "text",
    "text-muted"
  ],
  a11y: {
    focusable: !1,
    notes: [
      "The title is the accessible label for the empty view; keep it a short, literal phrase.",
      "The title renders as an h2, so it joins the document outline; place the EmptyState where an h2 fits the surrounding heading hierarchy.",
      "The icon disc is decorative and marked aria-hidden, so it is not announced.",
      "The container is not focusable; provide a real action (a button or link) when the user can resolve the empty state so keyboard users have a next step."
    ]
  },
  motion: {
    description: "The component itself is static and does not animate. In skeleton mode the placeholders inherit the shared Skeleton shimmer, which softens to an opacity pulse under reduced motion."
  }
}, bm = {
  name: "Field",
  id: "field",
  category: "molecule",
  status: "stable",
  summary: "A form-control wrapper that stacks a label, a control, and a hint or error, and wires their aria.",
  element: "div",
  anatomy: [
    { name: "label", description: "The field label, rendered as a native label tied to the control by htmlFor." },
    { name: "required", description: "A red asterisk appended after the label when required is set; aria-hidden." },
    { name: "control", description: "The wrapped form control; reads its id and aria wiring from Field context.", required: !0 },
    { name: "meta", description: "The reserved line below the control that holds the hint or error." },
    { name: "hint", description: "Muted helper text; fades in." },
    { name: "error", description: "Danger-colored message that replaces the hint and shakes in; role alert." }
  ],
  props: [
    { name: "label", type: "node", description: "The field label." },
    { name: "hint", type: "node", description: "Muted helper text below the control." },
    { name: "error", type: "node", description: "Error message; when set it replaces the hint, shakes in, and marks the field invalid." },
    { name: "required", type: "boolean", description: "Appends a required asterisk after the label." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the field geometry." },
    { name: "className", type: "string", description: "Extra class on the field wrapper." },
    { name: "children", type: "node", required: !0, description: "The form control to wrap." }
  ],
  defaults: { skeleton: !1 },
  // vertical stack; the meta line reserves height so a hint-to-error swap does not jump
  dimensions: { gap: o("space-2") },
  states: [
    {
      name: "invalid",
      description: "error is set: the field carries data-invalid and shows the error in place of the hint.",
      tokens: { text: o("danger-text") }
    },
    {
      name: "required",
      description: "Shows the danger-colored asterisk after the label.",
      tokens: { marker: o("danger-text") }
    },
    { name: "skeleton", description: "Swaps the label and hint for placeholder blocks; the control renders its own skeleton." }
  ],
  // the label, control, and message children paint
  paint: {},
  tokens: [
    "space-2",
    "font-sans",
    "font-size-sm",
    "font-size-xs",
    "font-weight-medium",
    "leading-sm",
    "leading-xs",
    "text",
    "text-muted",
    "danger-text"
  ],
  a11y: {
    notes: [
      "Provides a FieldContext with a generated id, the meta describedBy id, and the invalid flag; the wrapped control reads them for htmlFor, aria-describedby, and aria-invalid.",
      "The meta line gets that describedBy id so the hint or error is announced with the control.",
      "The error message renders with role alert so it is announced when it appears.",
      "The required asterisk is aria-hidden; convey requiredness on the control itself."
    ]
  },
  motion: {
    description: "The hint fades in; the error fades in and shakes; both collapse to no motion under reduced motion.",
    transition: { speed: "fast" }
  }
}, ym = {
  name: "Heading",
  id: "heading",
  category: "atom",
  status: "stable",
  summary: "A semantic h1 through h6 whose visual size follows its level, with an optional visual override.",
  element: "h2",
  props: [
    { name: "level", type: "enum", values: ["1", "2", "3", "4", "5", "6"], default: 2, description: "Semantic heading level h1 through h6; also sets the visual size." },
    { name: "visualLevel", type: "enum", values: ["1", "2", "3", "4", "5", "6"], description: "Visual size override when the semantic level and the looks need to differ." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "noMargin", type: "boolean", default: !1, description: "Removes the heading margin for compact layouts." },
    { name: "children", type: "node", description: "Heading content." }
  ],
  sizes: [
    { name: "h1", fontSize: o("font-size-3xl") },
    { name: "h2", fontSize: o("font-size-2xl") },
    { name: "h3", fontSize: o("font-size-xl") },
    { name: "h4", fontSize: o("font-size-lg") },
    { name: "h5", fontSize: o("font-size-md") },
    { name: "h6", fontSize: o("font-size-sm") }
  ],
  defaults: { level: 2, skeleton: !1 },
  paint: { text: "$text" },
  tokens: [
    "font-sans",
    "font-weight-semibold",
    "font-weight-bold",
    "text",
    "text-subtle",
    "font-size-3xl",
    "font-size-2xl",
    "font-size-xl",
    "font-size-lg",
    "font-size-md",
    "font-size-sm",
    "leading-3xl",
    "leading-2xl",
    "leading-xl",
    "leading-lg",
    "leading-md",
    "leading-sm",
    "tracking-3xl",
    "tracking-2xl",
    "tracking-xl"
  ],
  a11y: {
    role: "heading",
    focusable: !1,
    notes: [
      "Renders the h element matching level, so the accessible heading level tracks the document outline.",
      "visualLevel changes only the size, never the rendered element or the semantic level.",
      "h6 is uppercased with tracked letter-spacing and painted in the subtle text color."
    ]
  }
}, vm = ["solid", "soft", "outline", "ghost", "glass", "danger"], wm = {
  name: "IconButton",
  id: "icon-button",
  category: "atom",
  status: "stable",
  summary: "A square, icon-only button in six variants and three sizes; ghost by default and always labelled.",
  element: "button",
  anatomy: [{ name: "icon", description: "The single centered glyph; the control has no visible text.", required: !0 }],
  props: [
    { name: "aria-label", type: "string", required: !0, description: "Accessible name; required since there is no visible text." },
    { name: "variant", type: "enum", values: vm, default: "ghost", description: "Visual style family." },
    { name: "size", type: "enum", values: Dn, default: "md", description: "Control size step." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the button and blocks interaction." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "children", type: "node", required: !0, description: "The icon glyph." }
  ],
  variants: [
    { name: "solid", description: "Filled with the accent, for the primary action.", paint: { background: o("accent-solid"), text: o("accent-contrast") }, tokens: { hover: o("accent-solid-hover") } },
    { name: "soft", description: "Tinted accent, for a secondary emphasis.", paint: { background: o("accent-soft"), text: o("accent-text") }, tokens: { hover: o("accent-soft-hover") } },
    { name: "outline", description: "Hairline border on a transparent fill.", paint: { border: o("border-strong"), text: o("text") }, tokens: { hover: o("hover") } },
    { name: "ghost", description: "No fill until hovered, for low-emphasis actions.", paint: { text: o("text") }, tokens: { hover: o("hover") } },
    { name: "glass", description: "Frosted glass material for chrome over content.", paint: { background: o("glass-regular"), border: o("glass-border"), text: o("text") }, tokens: { hover: o("glass-thick") } },
    { name: "danger", description: "Filled with the danger color for destructive actions.", paint: { background: o("danger-solid"), text: o("danger-contrast") }, tokens: { hover: o("danger-solid-hover") } }
  ],
  sizes: [
    { name: "sm", height: o("control-height-sm"), diameter: o("control-height-sm"), fontSize: o("font-size-xs"), paddingInline: "0" },
    { name: "md", height: o("control-height-md"), diameter: o("control-height-md"), fontSize: o("font-size-sm"), paddingInline: "0" },
    { name: "lg", height: o("control-height-lg"), diameter: o("control-height-lg"), fontSize: o("font-size-md"), paddingInline: "0" }
  ],
  defaults: { variant: "ghost", size: "md", disabled: !1, skeleton: !1 },
  dimensions: { radius: o("control-radius"), gap: o("space-2"), border: o("hairline") },
  states: [
    {
      name: "hover",
      description: "Background lifts to the variant hover token.",
      tokens: {
        solid: o("accent-solid-hover"),
        soft: o("accent-soft-hover"),
        outline: o("hover"),
        ghost: o("hover"),
        glass: o("glass-thick"),
        danger: o("danger-solid-hover")
      }
    },
    { name: "active", description: "Ghost presses to the active token; others rely on the tap scale.", tokens: { ghost: o("active") } },
    { name: "focus-visible", description: "A 2px accent focus ring blooms outward.", tokens: { ring: o("focus-ring") } },
    { name: "disabled", description: "Halved opacity and not-allowed cursor." }
  ],
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-2",
    "space-4",
    "space-5",
    "space-6",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "control-radius",
    "hairline",
    "font-sans",
    "font-weight-medium",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "accent-solid",
    "accent-solid-hover",
    "accent-contrast",
    "accent-soft",
    "accent-soft-hover",
    "accent-text",
    "border-strong",
    "text",
    "hover",
    "active",
    "danger-solid",
    "danger-solid-hover",
    "danger-contrast",
    "glass-regular",
    "glass-thick",
    "glass-border",
    "glass-highlight",
    "blur-sm",
    "glass-saturate",
    "shadow-1",
    "shadow-2",
    "focus-ring",
    "duration-fast",
    "duration-normal",
    "ease-out"
  ],
  a11y: {
    role: "button",
    focusable: !0,
    keyboard: [{ keys: "Enter, Space", action: "Activates the button." }],
    notes: [
      "aria-label is required; the icon carries no accessible name on its own.",
      "A disabled button is removed from the tab order and blocks activation."
    ]
  },
  motion: {
    description: "Presses inward to 0.94 on tap and eases its colors on hover; both respect reduced motion.",
    press: !0,
    transition: { speed: "fast", ease: "out" }
  }
}, km = {
  name: "Input",
  id: "input",
  category: "atom",
  status: "stable",
  summary: "A single-line text field in three control sizes, wired to the surrounding Field for id, description, and validity.",
  element: "input",
  anatomy: [
    { name: "leadingIcon", description: "Optional icon or adornment pinned to the leading edge." },
    { name: "input", description: "The text field itself.", required: !0 },
    { name: "trailingIcon", description: "Optional icon or adornment pinned to the trailing edge." }
  ],
  props: [
    { name: "size", type: "enum", values: Dn, default: "md", description: "Control size step." },
    { name: "leadingIcon", type: "node", description: "Icon or adornment pinned to the leading edge; the text pads clear of it." },
    { name: "trailingIcon", type: "node", description: "Icon or adornment pinned to the trailing edge, such as a clear button." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the field and blocks input (native input attribute)." },
    { name: "id", type: "string", description: "Field id; falls back to the id from the surrounding Field." },
    { name: "className", type: "string", description: "Extra class names merged onto the input." }
  ],
  sizes: [
    tt("sm", { paddingInline: o("space-3") }),
    tt("md", { paddingInline: o("space-4") }),
    tt("lg", { paddingInline: o("space-5") })
  ],
  defaults: { size: "md", skeleton: !1, glass: !1, disabled: !1 },
  dimensions: { radius: o("radius-lg"), border: o("hairline") },
  states: [
    { name: "hover", description: "Border strengthens when not focused or disabled.", paint: { border: o("border-strong") } },
    { name: "focus", description: "Border shifts to the focus ring color with a 3px accent-soft glow.", paint: { border: o("focus-ring") }, tokens: { ring: o("accent-soft") } },
    { name: "disabled", description: "Halved opacity, sunken surface, not-allowed cursor.", paint: { background: o("surface-sunken") } },
    { name: "invalid", description: "aria-invalid recolors the border to danger; on focus the ring turns danger.", paint: { border: o("danger-border") }, tokens: { ring: o("danger-soft") } }
  ],
  // a 3px accent-soft glow hugging the border, which itself turns focus-ring
  paint: { background: "$surface", text: "$text", border: "$border" },
  focusRing: { ring: o("accent-soft"), offset: "0" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "hairline",
    "border",
    "border-strong",
    "radius-lg",
    "surface",
    "surface-sunken",
    "text",
    "text-subtle",
    "font-sans",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "space-3",
    "space-4",
    "space-5",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "focus-ring",
    "accent-soft",
    "danger-border",
    "danger-solid",
    "danger-soft",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "textbox",
    focusable: !0,
    notes: [
      "Reads its id, aria-describedby, and aria-invalid from the surrounding Field when present.",
      "A native disabled input is removed from the tab order."
    ]
  },
  motion: {
    description: "Eases border, box-shadow, and background color on state change; respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, _m = {
  name: "Kbd",
  id: "kbd",
  category: "atom",
  status: "stable",
  summary: "A monospace key cap that renders a keyboard key or shortcut inline with a raised bottom edge.",
  element: "kbd",
  anatomy: [{ name: "label", description: "The key text or shortcut, kept to one line.", required: !0 }],
  props: [
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "children", type: "node", required: !0, description: "Key label or shortcut text." }
  ],
  defaults: { skeleton: !1, glass: !1 },
  dimensions: {
    radius: o("radius-sm"),
    border: o("hairline"),
    borderBottom: "2px",
    fontSize: "0.8em",
    paddingBlock: "0.25em",
    paddingInline: "0.5em"
  },
  paint: { background: "$surface-sunken", text: "$text-muted", border: "$border" },
  tokens: ["font-mono", "text-muted", "surface-sunken", "hairline", "border", "radius-sm"],
  a11y: {
    focusable: !1,
    notes: ["Semantic kbd element; the key text carries the meaning."]
  }
}, xm = {
  name: "Label",
  id: "label",
  category: "atom",
  status: "stable",
  summary: "A form field label with an optional required marker.",
  element: "label",
  anatomy: [
    { name: "text", description: "The label content.", required: !0 },
    { name: "required", description: "A red asterisk appended after the text when required is set." }
  ],
  props: [
    { name: "required", type: "boolean", default: !1, description: "Appends a required marker after the label text." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the component exact geometry." },
    { name: "children", type: "node", description: "Label text." }
  ],
  defaults: { required: !1, skeleton: !1 },
  dimensions: { fontSize: o("font-size-sm"), lineHeight: o("leading-sm") },
  paint: { text: "$text" },
  tokens: ["font-sans", "font-size-sm", "leading-sm", "font-weight-medium", "text", "danger-text"],
  a11y: {
    focusable: !1,
    notes: [
      "Renders a native label element; pair it with a control via htmlFor.",
      "The required asterisk is aria-hidden; convey requiredness on the control itself."
    ]
  }
}, Sm = {
  name: "Link",
  id: "link",
  category: "atom",
  status: "stable",
  summary: "An inline anchor in the accent color that underlines on hover and shows a focus ring.",
  element: "a",
  anatomy: [{ name: "label", description: "The link text or inline content.", required: !0 }],
  props: [
    { name: "skeleton", type: "boolean", default: !1, description: "Renders an 8ch text placeholder in place of the link." },
    { name: "children", type: "node", description: "Link content." }
  ],
  defaults: { skeleton: !1 },
  dimensions: { radius: o("radius-xs") },
  states: [
    // the underline is text-decoration in currentColor, i.e. the link's own accent-text
    { name: "hover", description: "Text underline appears in the link color (currentColor); underline offset is 0.2em.", tokens: { underline: o("accent-text") } },
    { name: "focus-visible", description: "A 2px accent outline at 2px offset.", tokens: { ring: o("focus-ring") } }
  ],
  paint: { text: "$accent-text" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "accent-text",
    "font-weight-medium",
    "radius-xs",
    "duration-fast",
    "ease-out",
    "focus-ring"
  ],
  a11y: {
    role: "link",
    focusable: !0,
    keyboard: [{ keys: "Enter", action: "Follows the link." }],
    notes: [
      "Renders a native anchor; passes through href, target, rel, and other anchor attributes.",
      "Hover underline is not the only affordance since the accent color already distinguishes the link."
    ]
  },
  motion: {
    description: "Eases its color on hover; respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, Mm = ["auto", "accent", "success", "warning", "danger"], $m = {
  name: "Meter",
  id: "meter",
  category: "atom",
  status: "stable",
  summary: "A segmented level indicator: discrete pips that fill from the left to show how full or good something currently is.",
  element: "div",
  anatomy: [{ name: "segment", description: "One discrete pip; fills when its index is below the filled count.", required: !0 }],
  props: [
    { name: "value", type: "number", required: !0, description: "Current level, 0 to max." },
    { name: "max", type: "number", description: "Upper bound. Defaults to the segment count, so value maps 1:1 to segments." },
    { name: "segments", type: "number", default: 4, description: "Number of discrete segments." },
    { name: "tone", type: "enum", values: Mm, default: "auto", description: "Fill color. 'auto' grades by level: bottom third danger, middle warning, top success." },
    { name: "size", type: "enum", values: Lo, default: "md", description: "Compact size step." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "aria-label", type: "string", description: "Accessible name for the meter." }
  ],
  tones: [
    // each tone's paint is the filled-segment fill; empty segments always paint the track
    {
      name: "auto",
      description: "Grades by level, so it has no single rest fill: the bottom third paints danger, the middle third warning, the top third success.",
      paint: {},
      tokens: { "low-background": o("danger-solid"), "mid-background": o("warning-solid"), "high-background": o("success-solid") }
    },
    { name: "accent", description: "The brand accent family.", paint: { background: o("accent-solid") } },
    { name: "success", description: "Positive or complete states.", paint: { background: o("success-solid") } },
    { name: "warning", description: "Caution states.", paint: { background: o("warning-solid") } },
    { name: "danger", description: "Errors and low states.", paint: { background: o("danger-solid") } }
  ],
  sizes: [
    { name: "sm", height: "0.25rem" },
    { name: "md", height: "0.375rem" }
  ],
  defaults: { segments: 4, tone: "auto", size: "md", skeleton: !1 },
  dimensions: { radius: o("radius-full"), gap: o("space-1") },
  states: [
    { name: "filled", description: "A segment below the filled count paints with the resolved tone solid.", tokens: { background: o("accent-solid") } },
    { name: "empty", description: "A segment at or above the filled count paints the track.", tokens: { background: o("segment-track") } }
  ],
  transition: { duration: o("duration-normal"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "radius-full",
    "segment-track",
    "accent-solid",
    "danger-solid",
    "warning-solid",
    "success-solid",
    "duration-normal",
    "ease-out"
  ],
  a11y: {
    role: "meter",
    focusable: !1,
    notes: [
      "Sets aria-valuemin=0, aria-valuemax to the bound, and aria-valuenow to the clamped value.",
      "Pass aria-label to name the meter."
    ]
  },
  motion: {
    description: "Each segment eases its fill color when the level changes; respects reduced motion.",
    transition: { speed: "normal", ease: "out" }
  }
}, Tm = ["sm", "md", "lg", "xl"], Cm = {
  name: "Modal",
  id: "modal",
  category: "organism",
  status: "stable",
  summary: "A glass dialog rendered in a portal: springs open, traps focus, locks scroll, and dismisses on Escape or overlay press.",
  element: "div",
  anatomy: [
    { name: "overlay", description: "The fixed, blurred backdrop that centers the panel; clicking it closes the modal." },
    { name: "panel", description: "The glass dialog surface holding the header, body, and footer.", required: !0 },
    { name: "close", description: "A small IconButton pinned to the top-right corner that closes the modal." },
    { name: "header", description: "Wraps the title and description; rendered only when either is supplied." },
    { name: "title", description: "A level-2 Heading, labelling the dialog via aria-labelledby." },
    { name: "description", description: "A muted Text line, describing the dialog via aria-describedby." },
    { name: "body", description: "The children slot, the main dialog content." },
    { name: "footer", description: "End-aligned action row, rendered only when footer content is supplied." }
  ],
  props: [
    { name: "open", type: "boolean", required: !0, description: "Whether the modal is mounted and shown; renders nothing when false." },
    { name: "onClose", type: "handler", required: !0, description: "Called when the user dismisses via Escape, the close button, or an overlay press." },
    { name: "title", type: "node", description: "Heading text shown in the header and used as the dialog label." },
    { name: "description", type: "node", description: "Supporting text shown under the title and used as the dialog description." },
    { name: "size", type: "enum", values: Tm, default: "md", description: "Panel max-width step." },
    { name: "footer", type: "node", description: "Action row content pinned to the panel bottom, end-aligned." },
    { name: "children", type: "node", description: "The dialog body content." }
  ],
  sizes: [
    { name: "sm", diameter: "22rem" },
    { name: "md", diameter: "28rem" },
    { name: "lg", diameter: "36rem" },
    { name: "xl", diameter: "48rem" }
  ],
  defaults: { size: "md" },
  // panel padding, radius, and the internal gaps; sizes only vary the max-width
  dimensions: {
    radius: o("radius-2xl"),
    border: o("hairline"),
    overlayPadding: o("space-6"),
    panelPadding: o("space-6"),
    headerGap: o("space-2"),
    headerMargin: o("space-6"),
    footerGap: o("space-3"),
    footerMargin: o("space-6")
  },
  states: [
    { name: "open", description: "Overlay fades in and the panel springs up from scale 0.95, y 12; body scroll is locked and focus moves into the panel.", tokens: { overlay: o("overlay"), background: o("glass-thick") } },
    {
      name: "overlay-hover",
      description: "Pressing the backdrop anywhere outside the panel calls onClose. The overlay paint is constant while open - the CSS declares no hover rule, so there is no repaint.",
      behavioral: !0
    }
  ],
  // The panel suppresses its own outline (.panel:focus-visible { outline: none };
  // focus is managed on open). The ring belongs to the interior controls - the
  // close IconButton and footer actions draw the kit-wide 2px focus-ring outline
  // at a 2px offset.
  paint: { background: "$glass-thick", text: "$text", border: "$glass-border" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  tokens: [
    "space-2",
    "space-3",
    "space-4",
    "space-6",
    "space-10",
    "space-16",
    "overlay",
    "blur-sm",
    "blur-lg",
    "glass-thick",
    "glass-border",
    "glass-highlight",
    "glass-saturate",
    "hairline",
    "radius-2xl",
    "shadow-5",
    "text",
    "font-sans",
    "focus-ring"
  ],
  a11y: {
    role: "dialog",
    focusable: !0,
    keyboard: [
      { keys: "Escape", action: "Closes the modal." },
      { keys: "Tab, Shift+Tab", action: "Cycles focus within the panel, wrapping at the first and last focusable elements." }
    ],
    notes: [
      'The panel sets aria-modal="true" and role="dialog".',
      "aria-labelledby points to the title and aria-describedby to the description, each only when supplied.",
      "Rendered into document.body via a portal.",
      "Tab focus is trapped inside the panel; the panel itself takes focus on open.",
      "Body scroll is locked while open and focus is restored to the opener on close.",
      'The close button carries aria-label="Close".'
    ]
  },
  motion: {
    description: "The panel springs up on a snappy spring while the overlay fades over 150ms; closing is instant. Both respect reduced motion.",
    transition: { spring: "snappy" }
  }
}, Nm = {
  name: "NumberInput",
  id: "number-input",
  category: "atom",
  status: "stable",
  summary: "A numeric stepper: a minus button, a centered tabular number field, and a plus button in a bordered group.",
  element: "div",
  anatomy: [
    { name: "decrement", description: "The minus step button; disables at min.", required: !0 },
    { name: "input", description: "The centered native number input with tabular figures.", required: !0 },
    { name: "increment", description: "The plus step button; disables at max.", required: !0 }
  ],
  props: [
    { name: "value", type: "number", description: "Controlled value." },
    { name: "defaultValue", type: "number", default: 0, description: "Initial value in uncontrolled mode." },
    { name: "min", type: "number", description: "Lower bound; results clamp to it and decrement disables at it." },
    { name: "max", type: "number", description: "Upper bound; results clamp to it and increment disables at it." },
    { name: "step", type: "number", default: 1, description: "Amount added or subtracted per button press." },
    { name: "onValueChange", type: "handler", description: "Fires with the clamped value on every change." },
    { name: "size", type: "enum", values: Dn, default: "md", description: "Control size step." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the group and blocks interaction." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "aria-label", type: "string", description: "Accessible label for the number input." }
  ],
  sizes: [
    tt("sm", { paddingInline: o("space-2") }),
    tt("md", { paddingInline: o("space-3") }),
    tt("lg", { paddingInline: o("space-4") })
  ],
  defaults: { defaultValue: 0, step: 1, size: "md", disabled: !1, skeleton: !1, glass: !1 },
  dimensions: { radius: o("radius-lg"), border: o("hairline") },
  states: [
    { name: "hover", description: "Border strengthens to border-strong when not focused or disabled.", tokens: { border: o("border-strong") } },
    { name: "focus-within", description: "Border switches to the focus ring with a 3px accent-soft bloom.", tokens: { border: o("focus-ring"), ring: o("accent-soft") } },
    { name: "disabled", description: "Halved opacity on a sunken surface; both step buttons and the input are blocked.", tokens: { background: o("surface-sunken") } },
    { name: "at-min", description: "The decrement button disables when the value reaches min: its glyph dims to the subtle text color and the cursor turns not-allowed.", paint: { text: o("text-subtle") } },
    { name: "at-max", description: "The increment button disables when the value reaches max: its glyph dims to the subtle text color and the cursor turns not-allowed.", paint: { text: o("text-subtle") } },
    { name: "holding", description: "Pressing and holding a step button steps once, pauses, then auto-repeats on an accelerating interval until release or a bound.", behavioral: !0 },
    { name: "haptic", description: 'Every committed step fires a selection tick, whether from a button tap, each hold-repeat step, or ArrowUp/ArrowDown in the field, all riding the existing step amount; a step that clamps at min or max bumps medium once (re-armed after leaving the bound); typed digits are silent and their blur-commit fires one light; data-haptic="none" opts the stepper out.', behavioral: !0 }
  ],
  // a 3px accent-soft glow hugging the group border, which itself turns focus-ring on :focus-within
  paint: { background: "$surface", text: "$text", border: "$border" },
  focusRing: { ring: o("accent-soft"), offset: "0" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "hairline",
    "border",
    "border-strong",
    "radius-lg",
    "surface",
    "surface-sunken",
    "text",
    "text-muted",
    "text-subtle",
    "font-sans",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "font-size-lg",
    "font-size-xl",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "space-2",
    "space-3",
    "space-4",
    "focus-ring",
    "accent-soft",
    "hover",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    focusable: !0,
    keyboard: [
      { keys: "Up, Down", action: "Increments or decrements the native number input by step." },
      { keys: "Enter, Space", action: "Activates the focused minus or plus button." }
    ],
    notes: [
      "The step buttons carry Decrease and Increase aria-labels; their glyphs are aria-hidden.",
      "The input takes aria-label, and inherits id, aria-describedby, and aria-invalid from an enclosing field."
    ]
  },
  motion: {
    description: "Border color and box shadow ease on hover and focus; step button backgrounds ease on hover.",
    transition: { speed: "fast", ease: "out" }
  }
}, Kr = [
  "top",
  "top-start",
  "top-center",
  "top-end",
  "bottom",
  "bottom-start",
  "bottom-center",
  "bottom-end",
  "left",
  "left-start",
  "left-center",
  "left-end",
  "right",
  "right-start",
  "right-center",
  "right-end",
  "inline-start",
  "inline-start-start",
  "inline-start-center",
  "inline-start-end",
  "inline-end",
  "inline-end-start",
  "inline-end-center",
  "inline-end-end"
], Dm = {
  name: "Popover",
  id: "popover",
  category: "organism",
  status: "stable",
  summary: "A floating glass panel anchored to a trigger; it portals to the body, flips and clamps on screen, and closes on outside press or Escape.",
  element: "div",
  anatomy: [
    {
      name: "arrow",
      description: "A small rotated-square pointer wearing the panel material, poking out of the edge that faces the trigger and following the resolved placement, including start and end alignments.",
      required: !0
    },
    { name: "trigger", description: "The element that toggles the panel. Its ref and click are wired up, and it gains aria-haspopup, aria-expanded, and aria-controls.", required: !0 },
    { name: "panel", description: "The portalled floating dialog holding the popover content.", required: !0 },
    { name: "content", description: "The children rendered inside the panel." }
  ],
  props: [
    { name: "trigger", type: "element", required: !0, description: "The element that toggles the popover; its ref and click are wired up." },
    { name: "placement", type: "enum", values: Kr, default: "bottom-start", description: "Where to place the panel relative to the trigger before flipping and clamping." },
    { name: "open", type: "boolean", description: "Controlled open state; pair with onOpenChange." },
    { name: "defaultOpen", type: "boolean", default: !1, description: "Initial open state when uncontrolled." },
    { name: "onOpenChange", type: "handler", description: "Fires with the next open state on toggle, outside press, or Escape." },
    { name: "aria-label", type: "string", description: "Accessible label for the panel when it has no heading." },
    { name: "className", type: "string", description: "Extra class names merged onto the panel." },
    { name: "children", type: "node", description: "The panel content." }
  ],
  defaults: { placement: "bottom-start", defaultOpen: !1 },
  // fixed panel metrics; size does not vary
  dimensions: {
    minWidth: "12rem",
    maxWidth: "min(24rem, calc(100vw - 2rem))",
    padding: o("space-3"),
    radius: o("radius-lg"),
    border: o("hairline"),
    offset: "12px"
  },
  states: [
    {
      name: "open",
      description: "Panel mounts, portals to the body, animates in, and takes focus; the one-piece glass surface (panel plus arrow) paints glass-thick behind the content with a glass-border hairline stroke.",
      tokens: { background: o("glass-thick"), border: o("glass-border") }
    },
    {
      name: "closed",
      description: "Panel animates out (motion-driven opacity and scale, no token repaint) and unmounts on animation complete.",
      behavioral: !0
    },
    {
      name: "focus-visible",
      description: "The focused panel suppresses its outline (.positioner:focus-visible { outline: none }); focus is managed, not ringed - zero paint delta.",
      behavioral: !0
    }
  ],
  // The panel itself never rings: its outline is suppressed and focus is
  // managed on open. The ring belongs to the trigger and to any focusable
  // content inside, which draw the kit-wide 2px focus-ring outline at a 2px
  // offset.
  paint: { background: "$glass-regular", text: "$text", border: "$glass-border" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  tokens: [
    "space-3",
    "hairline",
    "glass-border",
    "radius-lg",
    "glass-thick",
    "blur-lg",
    "glass-saturate",
    "text",
    "font-sans",
    "focus-ring"
  ],
  a11y: {
    role: "dialog",
    focusable: !0,
    keyboard: [{ keys: "Escape", action: "Closes the panel and returns focus to the trigger." }],
    notes: [
      'The panel portals to document.body and renders as role="dialog" with tabIndex -1.',
      'The trigger gains aria-haspopup="dialog", aria-expanded, and aria-controls pointing at the panel while open.',
      "Give the panel an aria-label when it has no visible heading.",
      "On open the panel receives focus; on Escape or outside pointer press it closes and focus returns to the trigger.",
      "Not a focus trap: focus can leave the panel, which does not close it."
    ]
  },
  motion: {
    description: "Panel fades and scales up from the trigger-anchored transform origin on open and reverses on close; respects reduced motion by fading only.",
    transition: { speed: "Fast", ease: "Out" }
  }
}, zm = {
  name: "Menu",
  id: "menu",
  category: "organism",
  status: "stable",
  summary: "A dropdown list of actions anchored to a trigger: keyboard-navigable menu items with optional icons, shortcuts, separators, section labels, flyout submenus, and a pointer-summoned context-menu form, on a glass panel.",
  element: "div",
  anatomy: [
    { name: "trigger", description: 'The element that toggles the menu; it gains aria-haspopup="menu", aria-expanded, and aria-controls.', required: !0 },
    { name: "menu", description: 'The portalled role="menu" panel that flips and clamps on screen.', required: !0 },
    { name: "item", description: 'A role="menuitem" action row with an optional leading icon and trailing shortcut.' },
    { name: "separator", description: 'A role="separator" divider between groups of items.' },
    { name: "label", description: "A non-interactive section heading." },
    { name: "submenu", description: 'A MenuSub row - a menuitem with aria-haspopup="menu", aria-expanded, and a trailing chevron - whose child panel flies out right-start of the row and flips to left-start near the viewport edge. Submenus nest.' },
    { name: "context-target", description: "The ContextMenu wrapper (no box of its own) around arbitrary content; right-click or a touch long-press summons the same menu panel at the pointer coordinates via a zero-size virtual anchor." }
  ],
  props: [
    { name: "trigger", type: "node", required: !0, description: "Element that opens the menu; its ref and click are wired up." },
    { name: "placement", type: "enum", values: Kr, default: "bottom-start", description: "Menu position relative to the trigger." },
    { name: "open", type: "boolean", description: "Controlled open state." },
    { name: "defaultOpen", type: "boolean", default: !1, description: "Initial open state when uncontrolled." },
    { name: "onOpenChange", type: "handler", description: "Called with the next open state." },
    { name: "aria-label", type: "string", description: "Accessible name for the menu." }
  ],
  defaults: { placement: "bottom-start", defaultOpen: !1 },
  dimensions: {
    radius: o("radius-lg"),
    gap: o("space-1")
  },
  states: [
    { name: "open", description: "The panel scales and fades in: a glass-thick surface with a glass border, glass highlight, and shadow-4.", tokens: { background: o("glass-thick"), border: o("glass-border"), highlight: o("glass-highlight"), shadow: o("shadow-4") } },
    { name: "hover", description: "A hovered enabled item fills with the hover wash.", tokens: { background: o("hover") } },
    { name: "focus-visible", description: "The keyboard-focused item fills with the same hover wash instead of drawing an outline ring.", tokens: { background: o("hover") } },
    { name: "danger", description: "A danger item recolors its text and icon; its hover and focus fill turns danger-soft.", paint: { text: o("danger-text") }, tokens: { hover: o("danger-soft") } },
    { name: "submenu-open", description: "A MenuSub row keeps the hover fill while its flyout is open (aria-expanded).", tokens: { background: o("hover") } },
    { name: "disabled", description: "Halved opacity, not-allowed cursor, and skipped by arrow navigation." }
  ],
  // keyboard focus paints the item with the hover fill; there is no outline
  // ring inside the panel (the menu suppresses its own outline)
  paint: { background: "$glass-thick", text: "$text", border: "$glass-border" },
  focusRing: { ring: o("hover"), offset: "0" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  a11y: {
    role: "menu",
    focusable: !0,
    keyboard: [
      { keys: "ArrowDown, ArrowUp", action: "Moves focus between items, wrapping around the ends." },
      { keys: "Home, End", action: "Jumps to the first or last item." },
      { keys: "Enter, Space", action: "Activates the focused item and closes the menu; on a submenu row, opens the flyout and focuses its first item." },
      { keys: "ArrowRight", action: "On a submenu row, opens the flyout and focuses its first item." },
      { keys: "ArrowLeft", action: "Inside a flyout, closes it and returns focus to its parent row." },
      { keys: "Escape", action: "Closes the menu - the whole stack when flyouts are open - and returns focus to the trigger (or, for a context menu, to the element focused before it opened)." }
    ],
    notes: [
      'Opens as a role="menu" of role="menuitem" rows; the first enabled item is focused on open.',
      "Disabled items carry aria-disabled and are skipped by arrow navigation.",
      "ContextMenu opens the same panel at the pointer coordinates on contextmenu (default prevented) or a ~500ms touch long-press, cancelled when the pointer lifts or moves more than 8px. It dismisses on Escape, outside press, or scrolling away, and restores focus on close.",
      'A submenu row carries aria-haspopup="menu" and aria-expanded, and opens on hover with an intent delay (~120ms), plus a close delay so diagonal travel into the flyout does not shut it.'
    ]
  },
  motion: {
    description: "The panel scales and fades in from the trigger edge; flyout panels do the same from the row edge; respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, Pm = ["soft", "solid", "outline"], Am = {
  neutral: {
    paint: { background: o("hover"), text: o("text-muted") },
    tokens: { "solid-background": o("gray-9"), "solid-text": o("accent-contrast"), "outline-border": o("border-strong") }
  },
  accent: {
    paint: { background: o("accent-soft"), text: o("accent-text") },
    tokens: { "solid-background": o("accent-solid"), "solid-text": o("accent-contrast"), "outline-border": o("accent-border") }
  },
  success: {
    paint: { background: o("success-soft"), text: o("success-text") },
    tokens: { "solid-background": o("success-solid"), "solid-text": o("success-contrast"), "outline-border": o("success-border") }
  },
  warning: {
    paint: { background: o("warning-soft"), text: o("warning-text") },
    tokens: { "solid-background": o("warning-solid"), "solid-text": o("warning-contrast"), "outline-border": o("warning-border") }
  },
  danger: {
    paint: { background: o("danger-soft"), text: o("danger-text") },
    tokens: { "solid-background": o("danger-solid"), "solid-text": o("danger-contrast"), "outline-border": o("danger-border") }
  },
  info: {
    paint: { background: o("info-soft"), text: o("info-text") },
    tokens: { "solid-background": o("info-solid"), "solid-text": o("info-contrast"), "outline-border": o("info-border") }
  }
}, Om = {
  name: "Pill",
  id: "pill",
  category: "atom",
  status: "stable",
  summary: "A compact capsule label in three variants and every tone - for tags, statuses, and counts - with an optional leading icon and an optional remove button that turns it into a dismissible tag.",
  element: "span",
  anatomy: [
    { name: "icon", description: "Optional leading glyph, hidden from assistive tech." },
    { name: "label", description: "The pill content, kept to one line.", required: !0 },
    { name: "remove", description: "Optional trailing remove button, shown when onRemove is set." }
  ],
  props: [
    { name: "tone", type: "enum", values: [...ro().map((e) => e.name)], default: "neutral", description: "Semantic color family." },
    { name: "variant", type: "enum", values: Pm, default: "soft", description: "Fill treatment." },
    { name: "size", type: "enum", values: Lo, default: "md", description: "Compact size step." },
    { name: "icon", type: "node", description: "Leading glyph, hidden from assistive tech." },
    { name: "onRemove", type: "handler", description: "When set, renders a trailing remove button that calls this on click, turning the pill into a removable tag." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "children", type: "node", required: !0, description: "Pill label." }
  ],
  variants: [
    // each variant's paint is its rendering at the default neutral tone
    { name: "soft", description: "Tinted fill, the default.", paint: { background: o("hover"), text: o("text-muted") } },
    { name: "solid", description: "Filled with the tone color.", paint: { background: o("gray-9"), text: o("accent-contrast") } },
    { name: "outline", description: "Hairline border on a transparent fill.", paint: { border: o("border-strong"), text: o("text-muted") } }
  ],
  tones: ro().map((e) => ({ ...e, ...Am[e.name] ?? {} })),
  sizes: [
    { name: "sm", height: "1.375rem", paddingInline: o("space-2"), fontSize: o("font-size-xs") },
    { name: "md", height: "1.75rem", paddingInline: o("space-3"), fontSize: o("font-size-sm") }
  ],
  defaults: { tone: "neutral", variant: "soft", size: "md", skeleton: !1, glass: !1 },
  dimensions: { radius: o("radius-full"), gap: o("space-1"), border: o("hairline") },
  // the ring belongs to the remove control, the pill itself never takes focus
  focusRing: { ring: o("focus-ring"), offset: "1px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "radius-full",
    "hairline",
    "font-sans",
    "font-weight-medium",
    "font-size-xs",
    "font-size-sm",
    "hover",
    "text-muted",
    "border-strong",
    "gray-9",
    "accent-contrast",
    "accent-soft",
    "accent-text",
    "accent-solid",
    "accent-border",
    "success-soft",
    "success-text",
    "success-solid",
    "success-contrast",
    "success-border",
    "warning-soft",
    "warning-text",
    "warning-solid",
    "warning-contrast",
    "warning-border",
    "danger-soft",
    "danger-text",
    "danger-solid",
    "danger-contrast",
    "danger-border",
    "info-soft",
    "info-text",
    "info-solid",
    "info-contrast",
    "info-border",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    notes: [
      "Decorative by default; the pill text carries the meaning.",
      "When onRemove is set the remove button is labeled from the kit’s translatable Dismiss message and is keyboard reachable."
    ]
  }
}, Em = ["sm", "md"], Wm = ["accent", "success", "warning", "danger"], Im = {
  name: "ProgressBar",
  id: "progress-bar",
  category: "atom",
  status: "stable",
  summary: "A horizontal track with a tone-filled bar, for determinate progress or an indeterminate sweep.",
  element: "div",
  anatomy: [
    { name: "track", description: "The full-width rounded rail the fill sits in.", required: !0 },
    { name: "fill", description: "The tone-colored bar, sized to the value or swept when indeterminate.", required: !0 }
  ],
  props: [
    { name: "value", type: "number", description: "0 to max. Omit for an unknown duration." },
    { name: "max", type: "number", default: 100, description: "Upper bound of the value range." },
    { name: "indeterminate", type: "boolean", default: !1, description: "Sweeps continuously for an unknown duration." },
    { name: "size", type: "enum", values: Em, default: "md", description: "Track thickness step." },
    { name: "tone", type: "enum", values: Wm, default: "accent", description: "Fill color family." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "aria-label", type: "string", description: "Accessible name for the bar." }
  ],
  tones: [
    // each tone's paint is the fill; the track always paints segment-track
    { name: "accent", description: "The brand accent family, for primary emphasis.", paint: { background: o("accent-solid") } },
    { name: "success", description: "Positive or complete states.", paint: { background: o("success-solid") } },
    { name: "warning", description: "Caution states that still let the user proceed.", paint: { background: o("warning-solid") } },
    { name: "danger", description: "Errors and destructive states.", paint: { background: o("danger-solid") } }
  ],
  sizes: [
    { name: "sm", height: "0.375rem" },
    { name: "md", height: "0.625rem" }
  ],
  defaults: { max: 100, indeterminate: !1, size: "md", tone: "accent", skeleton: !1 },
  dimensions: { radius: o("radius-full") },
  states: [
    { name: "determinate", description: "Fill width is (clamped value / max) as a percentage, eased on change; the width is geometry, not a repaint, and aria-valuenow announces the value.", behavioral: !0 },
    { name: "indeterminate", description: "A 40%-wide fill sweeps left to right on a 1.4s loop; value and aria-valuenow are omitted. The sweep keeps the fill paint and animates position only.", tokens: { ease: o("ease-in-out") } }
  ],
  transition: { duration: o("duration-normal"), ease: o("ease-out") },
  tokens: [
    "radius-full",
    "segment-track",
    "accent-solid",
    "success-solid",
    "warning-solid",
    "danger-solid",
    "duration-normal",
    "ease-out",
    "ease-in-out"
  ],
  a11y: {
    role: "progressbar",
    focusable: !1,
    notes: [
      "Sets aria-valuemin=0, aria-valuemax=max, and aria-valuenow to the clamped value.",
      "Omits aria-valuenow when indeterminate or value is undefined.",
      "Supply aria-label to name the bar."
    ]
  },
  motion: {
    description: "Determinate fill eases its width on change; the indeterminate bar sweeps on a loop. Both fall back to an opacity pulse under reduced motion.",
    transition: { speed: "normal", ease: "out" }
  }
}, Rm = ["accent", "success", "warning", "danger"], Lm = {
  name: "ProgressRing",
  id: "progress-ring",
  category: "atom",
  status: "stable",
  summary: "A circular progress indicator: a track ring with a toned arc filling from the top, optionally centered with a label or percentage.",
  element: "div",
  anatomy: [
    { name: "track", description: "The full background circle stroked with the track color." },
    { name: "arc", description: "The foreground arc stroked in the tone color, its length set by value/max." },
    { name: "center", description: "Optional centered content: a label node or the rounded percentage." }
  ],
  props: [
    { name: "value", type: "number", required: !0, description: "0 to max, clamped into range." },
    { name: "max", type: "number", default: 100, description: "Upper bound of the value range." },
    { name: "size", type: "number", default: 48, description: "Pixel diameter of the ring." },
    { name: "thickness", type: "number", default: 4, description: "Stroke width of the track and arc in pixels." },
    { name: "tone", type: "enum", values: Rm, default: "accent", description: "Semantic color family for the arc." },
    { name: "label", type: "node", description: "Centered content; takes priority over showValue." },
    { name: "showValue", type: "boolean", default: !1, description: "With no label, renders the rounded percentage in the center." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a circular placeholder with the exact geometry." },
    { name: "aria-label", type: "string", description: "Accessible name for the ring." }
  ],
  tones: [
    // the tone paints the arc: background here is the arc's SVG stroke color,
    // while the track circle always strokes segment-track
    { name: "accent", description: "The brand accent family, for primary emphasis.", paint: { background: o("accent-solid") }, tokens: { stroke: o("accent-solid") } },
    { name: "success", description: "Positive or complete states.", paint: { background: o("success-solid") }, tokens: { stroke: o("success-solid") } },
    { name: "warning", description: "Caution states that still let the user proceed.", paint: { background: o("warning-solid") }, tokens: { stroke: o("warning-solid") } },
    { name: "danger", description: "Errors and destructive states.", paint: { background: o("danger-solid") }, tokens: { stroke: o("danger-solid") } }
  ],
  defaults: { max: 100, size: 48, thickness: 4, tone: "accent", showValue: !1, skeleton: !1 },
  dimensions: { fontSize: o("font-size-sm") },
  transition: { duration: o("duration-normal"), ease: o("ease-out") },
  tokens: [
    "segment-track",
    "accent-solid",
    "success-solid",
    "warning-solid",
    "danger-solid",
    "text",
    "font-size-sm",
    "duration-normal",
    "ease-out"
  ],
  a11y: {
    role: "progressbar",
    focusable: !1,
    notes: [
      "Sets aria-valuemin=0, aria-valuemax=max, and aria-valuenow to the clamped value.",
      "Pass aria-label for an accessible name; the centered percentage is aria-hidden."
    ]
  },
  motion: {
    description: "The arc eases its length when the value changes; respects reduced motion.",
    transition: { speed: "normal", ease: "out" }
  }
}, qm = {
  name: "Radio",
  id: "radio",
  category: "atom",
  status: "stable",
  summary: "A single radio button with an optional inline label; group by shared name for a one-of-many choice.",
  element: "label",
  anatomy: [
    { name: "indicator", description: "The round dot control: a hairline ring that fills with an accent dot when checked.", required: !0 },
    { name: "label", description: "Optional inline text trailing the indicator." }
  ],
  props: [
    { name: "label", type: "node", description: "Inline label trailing the indicator." },
    { name: "checked", type: "boolean", description: "Controlled selected state; when set, the dot pop is animated." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the control and blocks interaction." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." }
  ],
  defaults: { disabled: !1, skeleton: !1, glass: !1 },
  dimensions: {
    diameter: "1.375rem",
    dotSize: "0.5rem",
    radius: o("radius-full"),
    gap: o("space-2"),
    border: o("hairline")
  },
  states: [
    { name: "checked", description: "Border shifts to accent and the inner dot scales in.", paint: { border: o("accent-solid") }, tokens: { dot: o("accent-solid") } },
    { name: "focus-visible", description: "A 2px accent focus ring blooms outward from the indicator.", tokens: { ring: o("focus-ring") } },
    { name: "disabled", description: "Halved opacity and not-allowed cursor." }
  ],
  paint: { background: "$surface", border: "$border-strong" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-2",
    "font-sans",
    "font-size-sm",
    "text",
    "hairline",
    "border-strong",
    "surface",
    "radius-full",
    "accent-solid",
    "focus-ring",
    "duration-fast",
    "ease-out",
    "ease-spring"
  ],
  a11y: {
    role: "radio",
    focusable: !0,
    keyboard: [
      { keys: "Space", action: "Selects the focused radio." },
      { keys: "Arrow keys", action: "Moves selection within the shared-name group (native)." }
    ],
    notes: [
      "Wraps a visually hidden native radio input; the label element makes the whole control clickable.",
      "The indicator is aria-hidden; the native input carries the accessible state."
    ]
  },
  motion: {
    description: "The inner dot springs in on check and fades out on uncheck; respects reduced motion. Controlled radios animate via Motion, uncontrolled via CSS on the input state.",
    transition: { speed: "fast", ease: "spring" }
  }
}, Fm = {
  name: "RadioCard",
  id: "radio-card",
  category: "atom",
  status: "stable",
  summary: "A selectable card with radio semantics: a preview tile with a title, description, and icon that checks as one of a group. Works controlled or uncontrolled; group cards by shared name for a one-of-many choice.",
  element: "label",
  anatomy: [
    { name: "icon", description: "Optional leading glyph or preview swatch above the title, tinted with accent-text and marked aria-hidden." },
    { name: "title", description: "The card heading, the primary label of the choice.", required: !0 },
    { name: "description", description: "Optional secondary line under the title, in muted secondary text." },
    { name: "children", description: "Optional extra content below the description, e.g. a preview or a nested control." },
    { name: "indicator", description: "The corner check mark that scales in when the card is selected; aria-hidden.", required: !0 }
  ],
  props: [
    { name: "title", type: "node", required: !0, description: "The card heading, the primary label." },
    { name: "description", type: "node", description: "Secondary line under the title." },
    { name: "icon", type: "node", description: "Leading glyph or preview swatch above the title." },
    { name: "checked", type: "boolean", description: "Controlled selected state." },
    { name: "defaultChecked", type: "boolean", default: !1, description: "Initial selected state when uncontrolled." },
    { name: "onCheckedChange", type: "handler", description: "Called with the next checked state when the card is selected." },
    { name: "value", type: "string", description: "The native radio value submitted with the form." },
    { name: "name", type: "string", description: "Groups cards into one radio set; only one card per name is selected." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the card and blocks interaction." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "children", type: "node", description: "Extra content rendered below the description." }
  ],
  defaults: { defaultChecked: !1, disabled: !1, skeleton: !1 },
  dimensions: {
    radius: o("radius-lg"),
    padding: o("space-4"),
    gap: o("space-2"),
    border: o("hairline"),
    titleSize: o("font-size-sm"),
    descriptionSize: o("font-size-xs"),
    iconSize: o("font-size-md"),
    bodyGap: o("space-1"),
    bodyInset: o("space-5"),
    indicatorInset: o("space-3"),
    indicator: "1.25rem"
  },
  states: [
    {
      name: "checked",
      description: "Border shifts to the accent solid, the surface takes an accent-soft tint, and the corner check scales in. Driven by the hidden input via :has() when uncontrolled and by a checked class when controlled.",
      tokens: { border: o("accent-solid"), background: o("accent-soft"), indicator: o("accent-solid") }
    },
    {
      name: "hover",
      description: "The subtle hairline border strengthens to hint at interactivity; a checked card keeps its accent border.",
      tokens: { border: o("border-strong") }
    },
    {
      name: "focus-visible",
      description: "Keyboard focus on the hidden input draws a 2px focus ring around the whole card with a 2px offset.",
      tokens: { ring: o("focus-ring") }
    },
    { name: "disabled", description: "Halved opacity and a not-allowed cursor; the native input is disabled so it cannot be selected." }
  ],
  paint: { background: "$surface-raised", text: "$text", border: "$border-subtle" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "hairline",
    "radius-lg",
    "radius-full",
    "font-sans",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "font-weight-semibold",
    "leading-md",
    "text",
    "text-muted",
    "surface-raised",
    "border-subtle",
    "border-strong",
    "accent-soft",
    "accent-solid",
    "accent-text",
    "accent-contrast",
    "focus-ring",
    "duration-fast",
    "ease-out",
    "ease-spring"
  ],
  a11y: {
    role: "radio",
    focusable: !0,
    keyboard: [
      { keys: "Space", action: "Selects the focused card." },
      { keys: "Arrow keys", action: "Moves selection within the shared-name group (native)." }
    ],
    notes: [
      "Wraps a visually hidden native radio input; the label element makes the whole card clickable.",
      "The icon and check indicator are aria-hidden; the native input carries the accessible role and checked state.",
      "Group cards with a shared name so the browser and assistive technology treat them as one radio set."
    ]
  },
  motion: {
    description: "The corner check springs in on select and fades out on deselect; respects reduced motion (motion collapses to an instant swap). Controlled cards animate the scale and opacity via Motion; uncontrolled cards use a CSS transition driven off the hidden input state.",
    transition: { speed: "fast", ease: "spring" }
  }
}, Bm = {
  name: "SearchField",
  id: "search-field",
  category: "atom",
  status: "stable",
  summary: "A search input with a leading magnifier, a clear button that appears once typed, and an optional trailing shortcut slot.",
  element: "div",
  anatomy: [
    { name: "icon", description: "Leading magnifier glyph, absolutely inset from the left, decorative." },
    { name: "input", description: 'The type="search" text field.', required: !0 },
    { name: "clear", description: "Trailing button that clears the value; rendered only when the value is non-empty." },
    { name: "shortcut", description: "Right-aligned slot for a keyboard shortcut hint, e.g. a Kbd." }
  ],
  props: [
    { name: "value", type: "string", description: "Controlled value." },
    { name: "defaultValue", type: "string", default: "", description: "Initial value in uncontrolled mode." },
    { name: "onValueChange", type: "handler", description: "Called with the new string on input and on clear." },
    { name: "placeholder", type: "string", default: "Search", description: "Placeholder text." },
    { name: "size", type: "enum", values: Dn, default: "md", description: "Control size step." },
    { name: "shortcut", type: "node", description: "Right-aligned slot for a keyboard shortcut hint." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." }
  ],
  sizes: [
    tt("sm", { paddingInline: o("space-8") }),
    tt("md", { paddingInline: o("space-8") }),
    tt("lg", { paddingInline: o("space-10") })
  ],
  defaults: { defaultValue: "", placeholder: "Search", size: "md", skeleton: !1, glass: !1 },
  dimensions: { radius: o("radius-lg"), border: o("hairline") },
  states: [
    { name: "hover", description: "Border strengthens when not focused or disabled.", paint: { border: o("border-strong") } },
    { name: "focus", description: "Border switches to the focus ring and a 3px accent-soft ring blooms.", paint: { border: o("focus-ring") }, tokens: { ring: o("accent-soft") } },
    { name: "disabled", description: "Halved opacity, sunken surface, not-allowed cursor.", paint: { background: o("surface-sunken") } },
    { name: "invalid", description: "aria-invalid paints a danger border; on focus a danger ring.", paint: { border: o("danger-border") }, tokens: { ring: o("danger-soft") } }
  ],
  // a 3px accent-soft glow hugging the border, which itself turns focus-ring
  paint: { background: "$surface", text: "$text", border: "$border" },
  focusRing: { ring: o("accent-soft"), offset: "0" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-2",
    "space-3",
    "space-4",
    "space-8",
    "space-10",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "radius-lg",
    "radius-full",
    "hairline",
    "font-sans",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "surface",
    "surface-sunken",
    "text",
    "text-subtle",
    "border",
    "border-strong",
    "focus-ring",
    "accent-soft",
    "danger-border",
    "danger-solid",
    "danger-soft",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "searchbox",
    focusable: !0,
    keyboard: [{ keys: "Escape", action: "Clears via the browser's native search field, or use the clear button." }],
    notes: [
      "Reads its id, aria-describedby, and aria-invalid from a surrounding Field when present.",
      'The clear button is labelled "Clear search"; the magnifier icon is aria-hidden.'
    ]
  },
  motion: {
    description: "Border, box-shadow, and background cross-fade on hover and focus; the clear button eases its color and background.",
    transition: { speed: "fast", ease: "out" }
  }
}, Hm = ["sm", "md"], jm = {
  name: "SegmentedBar",
  id: "segmented-bar",
  category: "atom",
  status: "stable",
  summary: "A single proportional bar split into slices sized by share of the total, for a parts-of-a-whole breakdown.",
  element: "div",
  anatomy: [
    { name: "track", description: "The bar container that clips its slices and paints the empty remainder.", required: !0 },
    { name: "slice", description: "One proportional slice, width set to its share of the total and filled by its tone." }
  ],
  props: [
    { name: "data", type: "node", required: !0, description: "Slices, each a value plus optional tone and label; sized by proportion of the total. Zero-value slices are omitted." },
    { name: "size", type: "enum", values: Hm, default: "md", description: "Bar thickness step." },
    { name: "rounded", type: "boolean", default: !0, description: "Rounds the bar ends with a full radius." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "aria-label", type: "string", description: "Accessible name for the bar. Falls back to a generated percentage breakdown." }
  ],
  tones: [
    { name: "accent", description: "The brand accent family.", paint: { background: o("accent-solid") } },
    { name: "success", description: "Positive or complete states.", paint: { background: o("success-solid") } },
    { name: "warning", description: "Caution states.", paint: { background: o("warning-solid") } },
    { name: "danger", description: "Errors and low states.", paint: { background: o("danger-solid") } },
    { name: "neutral", description: "Unclassified slices; paints the track color, indistinct from the empty remainder.", paint: { background: o("segment-track") } }
  ],
  sizes: [
    { name: "sm", height: "0.375rem" },
    { name: "md", height: "0.625rem" }
  ],
  defaults: { size: "md", rounded: !0, skeleton: !1 },
  dimensions: { radius: o("radius-full"), gap: o("space-1"), sliceRadius: "2px" },
  states: [
    { name: "empty", description: "The uncovered remainder of the track paints the segment-track color.", tokens: { background: o("segment-track") } }
  ],
  tokens: [
    "space-1",
    "radius-full",
    "segment-track",
    "accent-solid",
    "success-solid",
    "warning-solid",
    "danger-solid"
  ],
  a11y: {
    role: "img",
    focusable: !1,
    notes: [
      "The whole bar is one img with a text alt; individual slices are decorative.",
      "Pass aria-label to name the bar, or let it fall back to a comma-joined percentage breakdown."
    ]
  }
}, Ym = Dn, Vm = ["snappy", "smooth", "bouncy"], Gm = {
  name: "SegmentedControl",
  id: "segmented-control",
  category: "molecule",
  status: "stable",
  summary: "An iOS-style segmented toggle for a one-of-many choice; the selected thumb springs between segments.",
  element: "div",
  anatomy: [
    { name: "track", description: "The glass container that holds the segments and clips the thumb.", required: !0 },
    { name: "segment", description: "One option: a label wrapping a visually hidden radio input.", required: !0 },
    { name: "thumb", description: "The shared layout element that slides under the selected segment." },
    { name: "label", description: "The option content shown above the thumb.", required: !0 }
  ],
  props: [
    { name: "options", type: "node", required: !0, description: "The choices, each a value plus a label node and optional disabled flag." },
    { name: "value", type: "string", description: "Controlled selected value." },
    { name: "defaultValue", type: "string", description: "Initial selected value when uncontrolled; falls back to the first enabled option." },
    { name: "onValueChange", type: "handler", description: "Fires with the new value when the selection changes." },
    { name: "size", type: "enum", values: Ym, default: "md", description: "Control size step." },
    { name: "fullWidth", type: "boolean", default: !1, description: "Stretches the track to the container width with equal-width segments." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "spring", type: "enum", values: Vm, default: "snappy", description: "Spring preset for the thumb." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims every segment and blocks interaction." },
    { name: "aria-label", type: "string", description: "Accessible name for the radio group." },
    { name: "className", type: "string", description: "Extra class on the track." }
  ],
  sizes: [
    { name: "sm", height: "calc(var(--glacier-control-height-sm) - 0.375rem)", paddingInline: o("space-3"), fontSize: o("font-size-xs") },
    { name: "md", height: "calc(var(--glacier-control-height-md) - 0.375rem)", paddingInline: o("space-4"), fontSize: o("font-size-sm") },
    { name: "lg", height: "calc(var(--glacier-control-height-lg) - 0.375rem)", paddingInline: o("space-5"), fontSize: o("font-size-md") }
  ],
  defaults: { size: "md", fullWidth: !1, skeleton: !1, spring: "snappy", disabled: !1 },
  // track padding is an off-scale 0.1875rem so the segment plus padding equals the control height
  dimensions: { radius: o("control-radius"), padding: "0.1875rem", gap: o("space-2"), border: o("hairline") },
  states: [
    { name: "selected", description: "The thumb slides under the segment and its label goes to full text weight and color.", tokens: { thumb: o("segment-thumb"), text: o("text") } },
    { name: "active", description: "The pressed segment label scales down to 0.96, easing its transform on the fast/out pair; no repaint.", tokens: { duration: o("duration-fast"), ease: o("ease-out") } },
    { name: "focus-visible", description: "A 2px accent ring outlines the focused segment label.", tokens: { ring: o("focus-ring") } },
    { name: "disabled", description: "Muted label color and a not-allowed cursor; the input is blocked.", tokens: { text: o("text-disabled") } }
  ],
  // a 2px focus-ring outline drawn by the label's ::after, offset 1px
  paint: { background: "$segment-track", border: "$glass-border" },
  focusRing: { ring: o("focus-ring"), offset: "1px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "control-radius",
    "hairline",
    "font-sans",
    "font-weight-medium",
    "font-weight-semibold",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "segment-track",
    "segment-thumb",
    "glass-border",
    "glass-highlight",
    "glass-saturate",
    "blur-sm",
    "shadow-2",
    "text",
    "text-muted",
    "text-disabled",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "radiogroup",
    focusable: !0,
    keyboard: [
      { keys: "Arrow keys", action: "Moves selection to the adjacent segment (native radio behavior)." },
      { keys: "Space", action: "Selects the focused segment." },
      { keys: "Tab", action: "Enters the group at the selected segment and leaves it." }
    ],
    notes: [
      "The track is a radiogroup; each segment is a label wrapping a visually hidden native radio input that carries the accessible state.",
      "The thumb is aria-hidden and purely decorative.",
      "Pass aria-label to name the group; the skeleton track is aria-hidden."
    ]
  },
  motion: {
    description: "The selected thumb is a shared Motion layout element, so it springs between segments instead of jumping; reduced motion collapses the spring to an instant move. Pressing a segment scales its label down.",
    press: !0,
    transition: { spring: "snappy" }
  }
}, Km = Dn, Um = {
  name: "Select",
  id: "select",
  category: "molecule",
  status: "stable",
  summary: "A styled replacement for the native select: an Input-metric trigger and a portaled glass listbox that animates open.",
  element: "div",
  anatomy: [
    { name: "root", description: "Relative wrapper that anchors the portaled menu to the trigger." },
    { name: "trigger", description: "The button that shows the current value and toggles the menu.", required: !0 },
    { name: "value", description: "The selected option label, or the placeholder when nothing is chosen." },
    { name: "chevrons", description: "The trailing up/down chevron glyph." },
    { name: "menu", description: "The portaled listbox of options, positioned above or below the trigger." },
    { name: "option", description: "A single selectable row with a leading check slot." },
    { name: "check", description: "Leading indicator that marks the selected option." },
    { name: "hiddenInput", description: "A hidden input that submits the value with forms when name is set." }
  ],
  props: [
    { name: "options", type: "node", required: !0, description: "The list of { value, label, disabled } options to choose from." },
    { name: "value", type: "string", description: "Controlled selected value." },
    { name: "defaultValue", type: "string", description: "Uncontrolled initial value." },
    { name: "onValueChange", type: "handler", description: "Fires with the new value when a selection is committed." },
    { name: "placeholder", type: "string", default: "Select…", description: "Shown on the trigger when no option is selected." },
    { name: "size", type: "enum", values: Km, default: "md", description: "Control size step." },
    { name: "fullWidth", type: "boolean", default: !1, description: "Stretches the trigger to the container width." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the trigger and blocks opening the menu." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material on the trigger instead of a solid surface." },
    { name: "name", type: "string", description: "Submitted with forms via a hidden input when set." },
    { name: "id", type: "string", description: "Id for the trigger; falls back to the field context id." },
    { name: "aria-label", type: "string", description: "Accessible name for the trigger and listbox." },
    { name: "className", type: "string", description: "Extra class names on the root." }
  ],
  sizes: [
    tt("sm", { paddingInline: o("space-3") }),
    tt("md", { paddingInline: o("space-4") }),
    tt("lg", { paddingInline: o("space-5") })
  ],
  defaults: { placeholder: "Select…", size: "md", fullWidth: !1, disabled: !1, skeleton: !1, glass: !1 },
  // trigger radius and menu geometry that do not vary with control size
  dimensions: {
    radius: o("radius-lg"),
    optionRadius: o("radius-md"),
    gap: o("space-3"),
    border: o("hairline"),
    menuPadding: o("space-1")
  },
  states: [
    { name: "hover", description: "Trigger border strengthens on hover.", tokens: { border: o("border-strong") } },
    {
      name: "open",
      description: "Trigger border turns to the focus ring with a soft accent glow while the menu is open.",
      tokens: { border: o("focus-ring"), ring: o("accent-soft") }
    },
    {
      name: "focus-visible",
      description: "Keyboard focus paints the same accent ring as the open state.",
      tokens: { border: o("focus-ring"), ring: o("accent-soft") }
    },
    { name: "disabled", description: "Halved opacity, sunken fill, and not-allowed cursor.", tokens: { background: o("surface-sunken") } },
    { name: "invalid", description: "Danger border when the field context reports an error.", tokens: { border: o("danger-border") } },
    { name: "placeholder", description: "The value text dims when no option is selected.", tokens: { text: o("text-subtle") } },
    { name: "active", description: "The highlighted option (hovered or arrow-navigated) fills with the accent.", tokens: { background: o("accent-solid"), text: o("accent-contrast") } },
    { name: "selected", description: "The chosen option shows a leading check that inherits the option text color (accent-contrast while the option is active).", tokens: { check: o("text") } },
    { name: "option-disabled", description: "A non-selectable option dims and shows a not-allowed cursor.", tokens: { text: o("text-disabled") } }
  ],
  // a 3px accent-soft glow hugging the trigger border, which itself turns focus-ring (shared by focus-visible and open)
  paint: { background: "$surface", text: "$text", border: "$border" },
  focusRing: { ring: o("accent-soft"), offset: "0" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "font-sans",
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "leading-sm",
    "radius-md",
    "radius-lg",
    "hairline",
    "border",
    "border-strong",
    "focus-ring",
    "danger-border",
    "surface",
    "surface-sunken",
    "text",
    "text-subtle",
    "text-disabled",
    "accent-solid",
    "accent-soft",
    "accent-contrast",
    "glass-regular",
    "glass-thick",
    "glass-border",
    "glass-highlight",
    "glass-saturate",
    "blur-sm",
    "blur-lg",
    "shadow-4",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "listbox",
    focusable: !0,
    keyboard: [
      { keys: "ArrowDown, ArrowUp", action: "Opens the menu from the trigger, or moves the active option when open." },
      { keys: "Home, End", action: "Moves to the first or last enabled option." },
      { keys: "Enter, Space", action: "Selects the active option and closes the menu." },
      { keys: "Escape", action: "Closes the menu and returns focus to the trigger." },
      { keys: "Tab", action: "Closes the menu without refocusing the trigger." }
    ],
    notes: [
      "Trigger is a button with aria-haspopup=listbox and aria-expanded.",
      "Follows the WAI-ARIA listbox pattern with aria-activedescendant; the listbox itself holds focus while open.",
      "The menu portals to document.body with fixed positioning to escape overflow-clipping ancestors and stacking contexts.",
      "Selected option carries aria-selected; disabled options carry aria-disabled and are skipped by keyboard navigation.",
      "Outside pointer presses close the menu; aria-describedby and aria-invalid come from the surrounding field context."
    ]
  },
  motion: {
    description: "The menu fades and scales in from the trigger edge on open and closes instantly; respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, Xm = ["snappy", "smooth", "bouncy"], Jm = {
  name: "Sidebar",
  id: "sidebar",
  category: "structure",
  status: "stable",
  summary: "The bones of a side navigation: an optional pinned header, a scrollable body of sections, and an optional pinned footer.",
  element: "div",
  anatomy: [
    { name: "header", description: "Pinned region at the top, for a brand or a search field. Adds a bottom hairline." },
    { name: "body", description: "The scrollable middle that holds SidebarSection groups.", required: !0 },
    { name: "footer", description: "Pinned region at the bottom, for a profile or settings link. Adds a top hairline." },
    { name: "section", description: "SidebarSection: a titled group of items with an optional uppercase heading." },
    { name: "item", description: "SidebarItem: a navigation row with an icon, label, and optional trailing slot." },
    { name: "indicator", description: "The active pill: one layout element that slides between items behind the row content." }
  ],
  props: [
    { name: "header", type: "node", description: "Pinned region at the top, for a brand or a search field." },
    { name: "footer", type: "node", description: "Pinned region at the bottom, for a profile or settings link." },
    {
      name: "spring",
      type: "enum",
      values: Xm,
      default: "snappy",
      description: "Spring preset for the active pill as it slides between items."
    },
    { name: "children", type: "node", description: "The scrollable body, filled with SidebarSection and SidebarItem." }
  ],
  defaults: { spring: "snappy" },
  // regions padded on every side; the body scrolls and stacks its sections
  dimensions: {
    regionPadding: o("space-4"),
    bodyGap: o("space-5"),
    itemGap: o("space-2"),
    itemPaddingBlock: o("space-2"),
    itemPaddingInline: o("space-3"),
    itemRadius: o("radius-md"),
    border: o("hairline")
  },
  states: [
    {
      name: "hover",
      description: "A non-active item washes to the hover background; active items keep the pill instead.",
      tokens: { background: o("hover"), text: o("text") }
    },
    {
      name: "focus-visible",
      description: "A 2px inset accent ring outlines the focused item.",
      tokens: { ring: o("focus-ring") }
    },
    {
      name: "active",
      description: "The current row shows the soft accent pill and accent text; aria-current is page.",
      tokens: { background: o("accent-soft"), text: o("accent-text") }
    },
    { name: "disabled", description: "Halved opacity, not-allowed cursor, and hover suppressed." }
  ],
  // the section headings and items paint
  paint: {},
  tokens: [
    "font-sans",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "hairline",
    "border-subtle",
    "radius-md",
    "font-size-xs",
    "font-size-sm",
    "font-weight-medium",
    "font-weight-semibold",
    "text",
    "text-muted",
    "text-subtle",
    "hover",
    "accent-soft",
    "accent-text",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    notes: [
      "The Sidebar is a plain container; give it a nav landmark and an aria-label at the call site.",
      'SidebarItem renders a button by default, or an anchor when given as="a" with an href.',
      'The active item sets aria-current="page"; a disabled item sets aria-disabled and drops the hover wash.',
      "The active pill is aria-hidden; provide an aria-label for an icon-only item."
    ]
  },
  motion: {
    description: "The active pill is a shared layout element that slides between items on the chosen spring; item colors ease on hover. Both respect reduced motion.",
    transition: { spring: "snappy" }
  }
}, Qm = ["text", "rect", "circle"], Zm = {
  name: "Skeleton",
  id: "skeleton",
  category: "atom",
  status: "stable",
  summary: "The kit's loading placeholder primitive: a shimmering box in three shapes that every component renders through its skeleton prop.",
  element: "span",
  props: [
    { name: "variant", type: "enum", values: Qm, default: "rect", description: "Shape: text is a 1em line, rect a rounded block, circle a disc." },
    { name: "width", type: "string", description: "Box width, a CSS length or number of pixels." },
    { name: "height", type: "string", description: "Box height; defaults to the width for circle, otherwise unset." },
    { name: "radius", type: "string", description: "Corner radius override, e.g. var(--glacier-control-radius)." }
  ],
  // every shape shares the same wash: a hover-token base swept by an active-token highlight band
  variants: [
    { name: "text", description: "A 1em-tall line with a small radius, for placeholder text.", paint: { background: o("hover") }, tokens: { highlight: o("active") } },
    { name: "rect", description: "A rounded block, the default, for images and cards.", paint: { background: o("hover") }, tokens: { highlight: o("active") } },
    { name: "circle", description: "A full-radius disc; height falls back to width.", paint: { background: o("hover") }, tokens: { highlight: o("active") } }
  ],
  defaults: { variant: "rect" },
  dimensions: {
    textHeight: "1em",
    textRadius: o("radius-sm"),
    rectRadius: o("radius-md"),
    circleRadius: o("radius-full")
  },
  tokens: ["hover", "active", "radius-sm", "radius-md", "radius-full"],
  a11y: {
    focusable: !1,
    notes: [
      'Decorative: sets aria-hidden="true".',
      "Mark the loading region with aria-busy at the app level; the skeleton itself carries no semantics."
    ]
  },
  motion: {
    description: "A viewport-fixed highlight band sweeps across every on-screen skeleton at 1.8s linear. Under prefers-reduced-motion it becomes a 1.6s ease-in-out opacity pulse."
  }
}, ep = {
  name: "Slider",
  id: "slider",
  category: "atom",
  status: "stable",
  summary: "A styled native range input with a filled leading track and an iOS-style thumb.",
  element: "input",
  anatomy: [
    { name: "track", description: "The full-width rail; the leading portion up to the value paints in the accent, the rest in the segment track." },
    { name: "thumb", description: "The round draggable handle.", required: !0 }
  ],
  props: [
    { name: "value", type: "number", description: "Controlled value." },
    { name: "defaultValue", type: "number", description: "Initial value when uncontrolled; falls back to min." },
    { name: "min", type: "number", default: 0, description: "Lower bound." },
    { name: "max", type: "number", default: 100, description: "Upper bound." },
    { name: "step", type: "number", default: 1, description: "Increment between stops." },
    { name: "onValueChange", type: "handler", description: "Called with the new number as the user drags or keys." },
    { name: "orientation", type: "enum", values: ["horizontal", "vertical"], default: "horizontal", description: "Vertical stands the rail up and fills bottom-to-top; set the length with the --slider-length custom property." },
    { name: "hapticStep", type: "number", default: 10, description: "Percent of the min-max range between haptic ticks: a selection tick fires when the value crosses a bucket boundary during drags or arrow keys, and a medium bump fires once on landing at min or max. 0 or less disables the ticks." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the slider and blocks interaction." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." }
  ],
  defaults: { min: 0, max: 100, step: 1, orientation: "horizontal", hapticStep: 10, disabled: !1, skeleton: !1 },
  dimensions: {
    height: "1.375rem",
    trackHeight: "0.375rem",
    thumbDiameter: "1.25rem",
    verticalLength: "8rem",
    radius: o("radius-full")
  },
  states: [
    { name: "active", description: "The thumb scales to 1.1 while pressed, springing there on the fast duration.", tokens: { duration: o("duration-fast"), ease: o("ease-spring") } },
    { name: "haptic", description: 'While the user drags or keys, a selection tick fires each time the value crosses a hapticStep-percent bucket boundary and a medium bump fires once on landing at min or max (re-armed after leaving the edge); data-haptic="none" opts the slider out.', behavioral: !0 },
    { name: "focus-visible", description: "The thumb gains a 3px soft accent halo with a 1px focus ring hugging its outside edge.", tokens: { halo: o("accent-soft"), ring: o("focus-ring") } },
    { name: "disabled", description: "Halved opacity and not-allowed cursor." }
  ],
  // a 3px accent-soft halo around the thumb, edged by a 1px focus-ring line (box-shadow layers at 3px and 4px)
  // the track, fill, and thumb children carry the paint
  paint: {},
  focusRing: { ring: o("focus-ring"), offset: "3px" },
  transition: { duration: o("duration-fast"), ease: o("ease-spring") },
  tokens: [
    "radius-full",
    "accent-solid",
    "accent-soft",
    "segment-track",
    "slider-thumb",
    "hairline",
    "glass-highlight",
    "shadow-2",
    "focus-ring",
    "duration-fast",
    "ease-spring"
  ],
  a11y: {
    role: "slider",
    focusable: !0,
    keyboard: [
      { keys: "ArrowLeft, ArrowDown", action: "Decreases the value by one step." },
      { keys: "ArrowRight, ArrowUp", action: "Increases the value by one step." },
      { keys: "Home", action: "Jumps to min." },
      { keys: "End", action: "Jumps to max." }
    ],
    notes: [
      "Native range semantics: screen readers announce the value, min, and max.",
      "Reads its id and aria-describedby from a surrounding Field when present.",
      'orientation="vertical" sets aria-orientation and fills from the bottom up; Arrow Up/Down still nudge the value.'
    ]
  },
  motion: {
    description: "The thumb springs to a larger scale on press; respects reduced motion.",
    press: !0,
    transition: { speed: "fast", ease: "spring" }
  }
}, tp = ["subtle", "accent", "inherit"], np = {
  name: "Spinner",
  id: "spinner",
  category: "atom",
  status: "stable",
  summary: "An indeterminate loading indicator: a spinning ring in three sizes and three tones.",
  element: "span",
  props: [
    { name: "size", type: "enum", values: Dn, default: "md", description: "Ring size; sm tracks the surrounding font size (1em), md and lg are fixed." },
    { name: "tone", type: "enum", values: tp, default: "subtle", description: "Ring color family." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "aria-label", type: "string", default: "Loading", description: "Accessible name; pass an empty string when a parent already announces loading." }
  ],
  tones: [
    // the ring is a currentColor border, so each tone paints via the text role
    { name: "subtle", description: "The default, low-emphasis gray ring.", paint: { text: o("text-subtle") }, tokens: { color: o("text-subtle") } },
    { name: "accent", description: "The brand accent ring, for primary emphasis.", paint: { text: o("accent-solid") }, tokens: { color: o("accent-solid") } },
    { name: "inherit", description: "Takes the current text color; paints no token of its own (color: currentColor).", paint: {} }
  ],
  sizes: [
    { name: "sm", diameter: "1em", border: "2px" },
    { name: "md", diameter: o("size-md"), border: "2px" },
    { name: "lg", diameter: "1.875rem", border: "3px" }
  ],
  defaults: { size: "md", tone: "subtle", skeleton: !1, "aria-label": "Loading" },
  dimensions: { radius: o("radius-full"), border: "2px" },
  tokens: ["radius-full", "text-subtle", "accent-solid", "size-md"],
  a11y: {
    role: "status",
    focusable: !1,
    notes: [
      'Defaults to aria-label="Loading"; an empty aria-label drops the label and sets aria-hidden so a parent can announce loading instead.'
    ]
  },
  motion: {
    description: "Rotates a ring with a transparent bottom edge continuously; reduced motion swaps to an opacity pulse.",
    transition: { speed: "0.8s", ease: "linear" }
  }
}, ap = {
  neutral: { background: o("text-subtle") },
  accent: { background: o("accent-solid") },
  success: { background: o("success-solid") },
  warning: { background: o("warning-solid") },
  danger: { background: o("danger-solid") },
  info: { background: o("info-solid") }
}, op = {
  name: "StatusDot",
  id: "status-dot",
  category: "atom",
  status: "stable",
  summary: "A small colored dot for presence and status, optionally pulsing for live states.",
  element: "span",
  props: [
    { name: "tone", type: "enum", values: [...ro().map((e) => e.name)], default: "neutral", description: "Semantic color family." },
    { name: "size", type: "enum", values: Lo, default: "md", description: "Compact size step." },
    { name: "pulse", type: "boolean", default: !1, description: "Adds an expanding ring for live states." },
    { name: "label", type: "string", description: "Accessible name; when set the dot becomes a status region, otherwise it is decorative." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." }
  ],
  tones: ro().map((e) => ({ ...e, paint: ap[e.name] })),
  sizes: [
    { name: "sm", diameter: o("size-2xs") },
    { name: "md", diameter: o("size-xs") }
  ],
  defaults: { tone: "neutral", size: "md", pulse: !1, skeleton: !1 },
  dimensions: { radius: o("radius-full") },
  states: [
    {
      name: "pulse",
      description: "An expanding, fading ring loops while pulse is set: a ::after in the dot color (background: inherit) scales 1 to 2.6 and fades 0.55 to 0 over 1.6s ease-out.",
      // keyed by tone: the ring inherits the dot fill, so it takes the tone's background token
      tokens: {
        "neutral-ring": o("text-subtle"),
        "accent-ring": o("accent-solid"),
        "success-ring": o("success-solid"),
        "warning-ring": o("warning-solid"),
        "danger-ring": o("danger-solid"),
        "info-ring": o("info-solid")
      }
    }
  ],
  tokens: [
    "radius-full",
    "text-subtle",
    "accent-solid",
    "success-solid",
    "warning-solid",
    "danger-solid",
    "info-solid"
  ],
  a11y: {
    notes: [
      'With a label the dot is role="status"; without one it is aria-hidden and decorative.',
      "The pulse ring is disabled under reduced motion."
    ]
  },
  motion: { description: "A looping expand-and-fade ring while pulse is set; disabled under reduced motion." }
}, sp = ["accent", "success", "warning", "danger", "neutral", "info"], ip = ["dots", "connected"], rp = ["sm", "md"], lp = {
  name: "Steps",
  id: "steps",
  category: "atom",
  status: "stable",
  summary: "A row of step markers for tours, wizards, and quizzes: compact dots, or connected circles joined by lines with checks on completed steps and optional numbering.",
  element: "div",
  anatomy: [
    { name: "track", description: "The inline-flex dot row, centered on its cross axis and laid out with a size-scaled gap.", required: !0 },
    { name: "dot", description: "One step marker; painted completed, current, or upcoming by its index relative to active.", required: !0 },
    { name: "marker", description: "In the connected variant, the circular step marker holding a check, a number, or the current dot." },
    { name: "connector", description: "In the connected variant, the line joining neighboring markers; filled in the tone once the step before it completes." },
    { name: "check", description: "The check glyph inside a completed connected marker, hidden from assistive tech." },
    { name: "skeleton", description: "In the skeleton branch, the track holds one circular Skeleton placeholder per step at the exact dot diameter, plus connector bones in the connected variant." }
  ],
  props: [
    { name: "variant", type: "enum", values: ip, default: "dots", description: "dots renders the compact dot row; connected renders larger circular markers joined by connector lines, with a check on each completed step." },
    { name: "numbered", type: "boolean", default: !1, description: "Numbers the connected markers from 1; completed markers keep the check. Ignored by the dots variant." },
    { name: "count", type: "number", required: !0, description: "Total number of steps; renders this many dots. Coerced with floor and clamped to at least zero." },
    { name: "active", type: "number", default: 0, description: "Zero-based index of the current step. Earlier dots read as completed, later ones as upcoming; the value is clamped into the [0, count - 1] range." },
    { name: "tone", type: "enum", values: [...ro(sp).map((e) => e.name)], default: "accent", description: "Semantic color family for completed and current dots; upcoming dots are tone-agnostic." },
    { name: "size", type: "enum", values: rp, default: "md", description: "Compact size step; sets dot diameter and the gap between dots." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders an aria-hidden placeholder row of circular skeletons with the component's exact geometry." }
  ],
  variants: [
    // each variant's paint is its rest (upcoming) marker rendering; completed
    // and current markers repaint per tone (see tones and states)
    { name: "dots", description: "The compact dot row, the default. An upcoming dot sits hollow on the surface with an inset hairline border.", paint: { background: o("surface"), border: o("border") } },
    {
      name: "connected",
      description: "Circular markers joined by connector lines, with checks on completed steps. An upcoming marker sits hollow on the surface with an inset hairline border and subtle text; connectors rest in the border color.",
      paint: { background: o("surface"), text: o("text-subtle"), border: o("border") },
      tokens: { "connector-background": o("border") }
    }
  ],
  tones: [
    // tone.paint is the completed/current dot fill under the default dots
    // variant; the connected variant's marker and connector renderings ride
    // along in each tone's tokens map
    {
      name: "accent",
      description: "The brand accent family, for primary emphasis.",
      paint: { background: o("accent-solid") },
      tokens: { "connected-done-background": o("accent-solid"), "connected-done-text": o("accent-contrast"), "connected-now-ring": o("accent-solid"), "connected-now-text": o("accent-text"), "connected-connector-background": o("accent-solid") }
    },
    {
      name: "success",
      description: "Positive or complete states.",
      paint: { background: o("success-solid") },
      tokens: { "connected-done-background": o("success-solid"), "connected-done-text": o("success-contrast"), "connected-now-ring": o("success-solid"), "connected-now-text": o("success-text"), "connected-connector-background": o("success-solid") }
    },
    {
      name: "warning",
      description: "Caution states that still let the user proceed.",
      paint: { background: o("warning-solid") },
      tokens: { "connected-done-background": o("warning-solid"), "connected-done-text": o("warning-contrast"), "connected-now-ring": o("warning-solid"), "connected-now-text": o("warning-text"), "connected-connector-background": o("warning-solid") }
    },
    {
      name: "danger",
      description: "Errors and destructive states.",
      paint: { background: o("danger-solid") },
      tokens: { "connected-done-background": o("danger-solid"), "connected-done-text": o("danger-contrast"), "connected-now-ring": o("danger-solid"), "connected-now-text": o("danger-text"), "connected-connector-background": o("danger-solid") }
    },
    {
      name: "neutral",
      description: "The default, low-emphasis gray family; fills with the subtle text color, and the current connected marker rings in the strong border color instead.",
      paint: { background: o("text-subtle") },
      tokens: { "connected-done-background": o("text-subtle"), "connected-done-text": o("surface"), "connected-now-ring": o("border-strong"), "connected-now-text": o("text"), "connected-connector-background": o("text-subtle") }
    },
    {
      name: "info",
      description: "Neutral-informational callouts.",
      paint: { background: o("info-solid") },
      tokens: { "connected-done-background": o("info-solid"), "connected-done-text": o("info-contrast"), "connected-now-ring": o("info-solid"), "connected-now-text": o("info-text"), "connected-connector-background": o("info-solid") }
    }
  ],
  sizes: [
    { name: "sm", diameter: "0.375rem", gap: o("space-1") },
    { name: "md", diameter: "0.5rem", gap: o("space-2") }
  ],
  defaults: { variant: "dots", numbered: !1, active: 0, tone: "accent", size: "md", skeleton: !1 },
  dimensions: { radius: o("radius-full"), border: o("hairline"), currentScale: "1.5", markerSm: "1.25rem", markerMd: "1.5rem", connector: "2px", connectorMinWidth: o("space-4") },
  states: [
    { name: "completed", description: "A dot at an index below active, filled solid in the tone (accent by default); neutral falls back to the subtle text color. A completed connected marker draws the check in the tone contrast and fills the connector after it.", tokens: { background: o("accent-solid") } },
    { name: "current", description: "The dot at the clamped active index, filled solid in the tone (accent by default) and enlarged via transform: scale(1.5) so it marks position without shifting its neighbors. The current connected marker instead sits on the surface with an inset 2px ring in the tone and the tone text color.", tokens: { background: o("accent-solid"), "connected-ring": o("accent-solid") } },
    { name: "upcoming", description: "A dot at an index above active, painted on the surface with an inset hairline border and no fill; tone-agnostic.", tokens: { background: o("surface"), border: o("border") } }
  ],
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "radius-full",
    "space-1",
    "space-2",
    "space-4",
    "hairline",
    "border",
    "border-strong",
    "surface",
    "text",
    "accent-solid",
    "success-solid",
    "warning-solid",
    "danger-solid",
    "text-subtle",
    "info-solid",
    "accent-contrast",
    "success-contrast",
    "warning-contrast",
    "danger-contrast",
    "info-contrast",
    "accent-text",
    "success-text",
    "warning-text",
    "danger-text",
    "info-text",
    "font-sans",
    "font-weight-semibold",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "group",
    focusable: !1,
    notes: [
      'The row is a group with an aria-label of "Step {n} of {count}", where n is the clamped current index plus one; individual dots are aria-hidden and decorative.',
      "Position is conveyed by the label text, not color alone, so completed and current dots need no per-dot semantics.",
      "In the skeleton branch the whole track is aria-hidden and carries no group role or label."
    ]
  },
  motion: {
    description: "The current dot eases its enlarging transform in on step change; only transform animates, so neighbors never shift. The transition is removed under reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, cp = ["0", "1", "2", "sunken"], dp = {
  name: "Surface",
  id: "surface",
  category: "atom",
  status: "stable",
  summary: "A plain background plane at one of four elevation levels, the base layer other atoms sit on.",
  element: "div",
  props: [
    {
      name: "level",
      type: "enum",
      values: cp,
      default: "1",
      description: "0 = app background, 1 = surface, 2 = raised, sunken = inset well."
    },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "children", type: "node", description: "Surface content." }
  ],
  // every level paints the primary text color; only the background steps
  variants: [
    { name: "0", description: "App background plane.", paint: { background: o("bg"), text: o("text") } },
    { name: "1", description: "Default surface, one step above the background.", paint: { background: o("surface"), text: o("text") } },
    { name: "2", description: "Raised surface for layered content.", paint: { background: o("surface-raised"), text: o("text") } },
    { name: "sunken", description: "Inset well recessed below the surface.", paint: { background: o("surface-sunken"), text: o("text") } }
  ],
  defaults: { level: "1", skeleton: !1, glass: !1 },
  tokens: ["font-sans", "text", "bg", "surface", "surface-raised", "surface-sunken", "radius-lg"],
  a11y: {
    focusable: !1,
    notes: ["A presentational container with no role of its own; carries whatever role its content sets."]
  }
}, up = Lo, hp = {
  name: "Switch",
  id: "switch",
  category: "atom",
  status: "stable",
  summary: "A toggle switch with a sliding thumb, in two sizes, with an optional trailing label.",
  element: "label",
  anatomy: [
    { name: "track", description: "The pill-shaped rail that tints to accent when on.", required: !0 },
    { name: "thumb", description: "The round knob that slides across the track.", required: !0 },
    { name: "label", description: "Optional trailing text." }
  ],
  props: [
    { name: "label", type: "node", description: "Trailing label rendered beside the track." },
    { name: "checked", type: "boolean", description: "Controlled on/off state." },
    { name: "defaultChecked", type: "boolean", default: !1, description: "Initial state when uncontrolled." },
    { name: "onCheckedChange", type: "handler", description: "Fires with the next boolean state on toggle." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the switch and blocks interaction." },
    { name: "size", type: "enum", values: up, default: "md", description: "Compact size step." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." }
  ],
  sizes: [
    { name: "sm", diameter: "1rem", height: "1.25rem" },
    { name: "md", diameter: "1.375rem", height: "1.625rem" }
  ],
  defaults: { defaultChecked: !1, disabled: !1, size: "md", skeleton: !1, glass: !1 },
  dimensions: {
    radius: o("radius-full"),
    gap: o("space-2"),
    border: o("hairline"),
    trackWidthSm: "2.25rem",
    trackWidthMd: "2.75rem",
    trackPadding: "0.125rem"
  },
  states: [
    { name: "checked", description: "Track fills with accent and the thumb slides to the far edge.", paint: { background: o("accent-solid") }, tokens: { track: o("accent-solid") } },
    { name: "focus-visible", description: "A 2px accent outline rings the track.", tokens: { ring: o("focus-ring") } },
    { name: "disabled", description: "Halved opacity and not-allowed cursor." }
  ],
  paint: { border: "$border-strong" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-2",
    "font-sans",
    "font-size-sm",
    "text",
    "hairline",
    "border-strong",
    "border",
    "radius-full",
    "surface",
    "accent-solid",
    "accent-contrast",
    "glass-highlight",
    "shadow-2",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "switch",
    focusable: !0,
    keyboard: [{ keys: "Space", action: "Toggles the switch." }],
    notes: [
      'A native checkbox input carries the state and role="switch"; the track and thumb are aria-hidden.',
      "A disabled switch blocks interaction."
    ]
  },
  motion: {
    description: "The thumb slides on a snappy spring; the track color eases on toggle. Both respect reduced motion.",
    transition: { spring: "snappy", speed: "fast", ease: "out" }
  }
}, mp = ["snappy", "smooth", "bouncy"], pp = {
  name: "Tabs",
  id: "tabs",
  category: "molecule",
  status: "stable",
  summary: "A tab menu following the WAI-ARIA tabs pattern with automatic activation and a springing underline indicator.",
  element: "div",
  anatomy: [
    { name: "list", description: "The tablist row, underlined by a bottom hairline.", required: !0 },
    { name: "tab", description: "One tab trigger button; carries its label and, when selected, the indicator.", required: !0 },
    { name: "indicator", description: "The springing underline that animates between selected tabs as a shared layout element." },
    { name: "panel", description: "The tabpanel showing the active tab content, cross-faded on change.", required: !0 }
  ],
  props: [
    { name: "tabs", type: "node", required: !0, description: "Ordered tab items, each a value, label, content, and optional disabled flag." },
    { name: "value", type: "string", description: "Controlled selected tab value." },
    { name: "defaultValue", type: "string", description: "Initial selected value when uncontrolled; falls back to the first enabled tab." },
    { name: "onValueChange", type: "handler", description: "Fires with the new value when the selected tab changes." },
    { name: "spring", type: "enum", values: mp, default: "snappy", description: "Spring preset for the underline indicator." },
    { name: "fullWidth", type: "boolean", default: !1, description: "Stretches the tabs to fill the list width." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "aria-label", type: "string", description: "Accessible name for the tab list." },
    { name: "className", type: "string", description: "Extra class on the root wrapper." }
  ],
  defaults: { spring: "snappy", fullWidth: !1, skeleton: !1 },
  // list gap and tab padding are fixed; the underline sits on the list hairline
  dimensions: {
    gap: o("space-1"),
    paddingBlock: o("space-3"),
    paddingInline: o("space-4"),
    radius: o("radius-md"),
    border: o("hairline"),
    indicatorThickness: "2px"
  },
  states: [
    { name: "hover", description: "An enabled unselected tab lifts its label from muted to full text color.", tokens: { text: o("text") } },
    { name: "selected", description: "The active tab takes full text color and mounts the underline indicator.", tokens: { text: o("text"), indicator: o("accent-solid") } },
    { name: "focus-visible", description: "A 2px inset accent ring on the focused tab or panel.", tokens: { ring: o("focus-ring") } },
    { name: "disabled", description: "A disabled tab dims to the disabled text color and blocks activation.", tokens: { text: o("text-disabled") } }
  ],
  // a 2px focus-ring outline inset into the tab (offset -2px); the panel draws
  // the same ring outset 2px
  paint: { border: "$border-subtle" },
  focusRing: { ring: o("focus-ring"), offset: "-2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "hairline",
    "border-subtle",
    "font-sans",
    "font-size-sm",
    "font-weight-medium",
    "radius-sm",
    "radius-md",
    "radius-full",
    "text",
    "text-muted",
    "text-disabled",
    "accent-solid",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "tablist",
    focusable: !0,
    keyboard: [
      { keys: "ArrowRight", action: "Moves to and activates the next enabled tab, wrapping past the end." },
      { keys: "ArrowLeft", action: "Moves to and activates the previous enabled tab, wrapping past the start." },
      { keys: "Home", action: "Activates the first enabled tab." },
      { keys: "End", action: "Activates the last enabled tab." }
    ],
    notes: [
      "Automatic activation: arrow keys move selection and activate in one step, skipping disabled tabs.",
      "Roving tabindex: only the selected tab is in the tab order (tabIndex 0); the rest are -1.",
      "Each tab sets aria-selected and aria-controls; the panel is a focusable tabpanel with aria-labelledby back to its tab.",
      "The indicator is aria-hidden and decorative."
    ]
  },
  motion: {
    description: "The underline springs between tabs as a shared layout element; the panel cross-fades and rises on change. Both are disabled under reduced motion.",
    transition: { spring: "snappy", speed: "fast", ease: "out" }
  }
}, fp = ["p", "span", "div", "strong", "em", "small"], gp = ["xs", "sm", "md", "lg"], bp = ["default", "muted", "subtle", "accent", "danger", "success", "warning"], yp = ["regular", "medium", "semibold", "bold"], vp = ["start", "center", "end", "justify"], wp = {
  name: "Text",
  id: "text",
  category: "atom",
  status: "stable",
  summary: "Body text in four sizes, seven tones, and four weights, with an optional monospace tabular variant.",
  element: "p",
  props: [
    { name: "as", type: "enum", values: fp, default: "p", description: "Rendered host element." },
    { name: "size", type: "enum", values: gp, default: "md", description: "Font-size step, sets size and line height." },
    { name: "tone", type: "enum", values: bp, default: "default", description: "Semantic text color." },
    { name: "weight", type: "enum", values: yp, default: "regular", description: "Font weight." },
    { name: "mono", type: "boolean", default: !1, description: "Monospace family with tabular numerals, for values and measurements." },
    { name: "align", type: "enum", values: vp, description: "Text alignment; inherits when unset." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "children", type: "node", description: "Text content." }
  ],
  // each tone paints only the text color; background and border are never touched
  tones: [
    { name: "default", description: "Primary body color.", paint: { text: o("text") } },
    { name: "muted", description: "Lower-emphasis secondary text.", paint: { text: o("text-muted") } },
    { name: "subtle", description: "Faintest text, for captions and hints.", paint: { text: o("text-subtle") } },
    { name: "accent", description: "Brand accent text.", paint: { text: o("accent-text") } },
    { name: "danger", description: "Error text.", paint: { text: o("danger-text") } },
    { name: "success", description: "Positive text.", paint: { text: o("success-text") } },
    { name: "warning", description: "Caution text.", paint: { text: o("warning-text") } }
  ],
  sizes: [
    { name: "xs", fontSize: o("font-size-xs") },
    { name: "sm", fontSize: o("font-size-sm") },
    { name: "md", fontSize: o("font-size-md") },
    { name: "lg", fontSize: o("font-size-lg") }
  ],
  defaults: { as: "p", size: "md", tone: "default", weight: "regular", mono: !1, skeleton: !1 },
  tokens: [
    "font-sans",
    "font-mono",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "font-size-lg",
    "leading-xs",
    "leading-sm",
    "leading-md",
    "leading-lg",
    "font-weight-regular",
    "font-weight-medium",
    "font-weight-semibold",
    "font-weight-bold",
    "text",
    "text-muted",
    "text-subtle",
    "accent-text",
    "danger-text",
    "success-text",
    "warning-text"
  ],
  a11y: {
    focusable: !1,
    notes: [
      "Renders a paragraph by default; set as to span, div, strong, em, or small to change semantics.",
      "The skeleton placeholder is a text-variant Skeleton 14ch wide at the chosen font size."
    ]
  }
}, kp = {
  name: "Textarea",
  id: "textarea",
  category: "atom",
  status: "stable",
  summary: "A multi-line text field in three sizes, vertically resizable, wired to the surrounding Field for id, description, and validity.",
  element: "textarea",
  props: [
    { name: "size", type: "enum", values: Dn, default: "md", description: "Size step; sets inline padding and font size." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the field and blocks input (native textarea attribute)." },
    { name: "id", type: "string", description: "Field id; falls back to the id from the surrounding Field." },
    { name: "className", type: "string", description: "Extra class names merged onto the textarea." }
  ],
  sizes: [
    { name: "sm", paddingBlock: o("space-3"), paddingInline: o("space-3"), fontSize: o("font-size-xs") },
    { name: "md", paddingBlock: o("space-3"), paddingInline: o("space-4"), fontSize: o("font-size-sm") },
    { name: "lg", paddingBlock: o("space-3"), paddingInline: o("space-5"), fontSize: o("font-size-md") }
  ],
  defaults: { size: "md", skeleton: !1, glass: !1, disabled: !1 },
  dimensions: { radius: o("radius-lg"), border: o("hairline"), minHeight: "5rem" },
  states: [
    { name: "hover", description: "Border strengthens when not focused or disabled.", paint: { border: o("border-strong") } },
    { name: "focus", description: "Border shifts to the focus ring color with a 3px accent-soft glow.", paint: { border: o("focus-ring") }, tokens: { ring: o("accent-soft") } },
    { name: "disabled", description: "Halved opacity, sunken surface, not-allowed cursor.", paint: { background: o("surface-sunken") } },
    { name: "invalid", description: "aria-invalid recolors the border to danger; on focus the ring turns danger.", paint: { border: o("danger-border") }, tokens: { ring: o("danger-soft") } }
  ],
  // a 3px accent-soft glow hugging the border, which itself turns focus-ring
  paint: { background: "$surface", text: "$text", border: "$border" },
  focusRing: { ring: o("accent-soft"), offset: "0" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "hairline",
    "border",
    "border-strong",
    "radius-lg",
    "surface",
    "surface-sunken",
    "text",
    "text-subtle",
    "font-sans",
    "leading-md",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "space-3",
    "space-4",
    "space-5",
    "focus-ring",
    "accent-soft",
    "danger-border",
    "danger-solid",
    "danger-soft",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "textbox",
    focusable: !0,
    notes: [
      "Reads its id, aria-describedby, and aria-invalid from the surrounding Field when present.",
      "Resizes vertically only; a native disabled textarea is removed from the tab order."
    ]
  },
  motion: {
    description: "Eases border, box-shadow, and background color on state change; respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, _p = ["neutral", "info", "success", "warning", "danger"], xp = {
  name: "Toast",
  id: "toast",
  category: "molecule",
  status: "stable",
  summary: "A single-slot, latest-wins notification pill portalled to the bottom center of the document, with a per-tone auto-dismiss timer, an optional leading icon, and an optional dismiss control. The pill can also render standalone as a static notification.",
  element: "div",
  anatomy: [
    { name: "viewport", description: "The fixed, bottom-center region the provider portals the current toast into; it ignores pointer events so only the pill is interactive." },
    { name: "pill", description: "The rounded surface holding the icon, message, and dismiss control; the whole pill is clickable to dismiss.", required: !0 },
    { name: "icon", description: "Optional leading glyph, vertically centered with the message." },
    { name: "message", description: "The notification text; wraps and breaks long words rather than overflowing.", required: !0 },
    { name: "dismiss", description: "An optional trailing close button, shown when the toast is dismissible; carries an accessible label." }
  ],
  props: [
    { name: "tone", type: "enum", values: _p, default: "neutral", description: "Semantic color family; danger announces as an alert, every other tone as a status." },
    { name: "message", type: "node", required: !0, description: "The notification content." },
    { name: "icon", type: "node", description: "Optional leading glyph rendered before the message." },
    { name: "duration", type: "number", description: "Auto-dismiss delay in milliseconds, read by the provider. When omitted it defaults by tone (success 3500, danger 7000, every other tone 4500); 0 disables auto-dismiss so the toast stays until replaced or dismissed." },
    { name: "dismissible", type: "boolean", default: !0, description: "Whether a trailing close control is shown." },
    { name: "onDismiss", type: "handler", description: "Called when the pill or its dismiss control is pressed; the provider wires this to clear the current toast." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact pill geometry instead of content." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of the solid tone surface." }
  ],
  tones: [
    { name: "neutral", description: "The default, low-emphasis raised surface; announces as a status.", paint: { background: o("surface-raised"), border: o("border-subtle"), text: o("text") } },
    { name: "info", description: "Neutral-informational tint; announces as a status.", paint: { background: o("info-soft"), border: o("info-border"), text: o("info-text") } },
    { name: "success", description: "Positive or complete states; announces as a status and auto-dismisses fastest.", paint: { background: o("success-soft"), border: o("success-border"), text: o("success-text") } },
    { name: "warning", description: "Caution states; announces as a status.", paint: { background: o("warning-soft"), border: o("warning-border"), text: o("warning-text") } },
    { name: "danger", description: "Errors and destructive states; announces as an alert and lingers longest before auto-dismiss.", paint: { background: o("danger-soft"), border: o("danger-border"), text: o("danger-text") } }
  ],
  defaults: { tone: "neutral", dismissible: !0, skeleton: !1, glass: !1 },
  dimensions: {
    radius: o("radius-full"),
    gap: o("space-3"),
    border: o("hairline"),
    paddingInline: o("space-5"),
    paddingBlock: o("space-3"),
    dismissGap: o("space-2"),
    dismissSize: "1.25rem",
    viewportInset: o("space-6"),
    viewportPaddingInline: o("space-4"),
    maxWidth: "28rem",
    skeletonWidth: "18rem",
    skeletonHeight: "2.75rem",
    fontSize: o("font-size-sm")
  },
  states: [
    { name: "enter", description: "The pill slides up and fades in from y 12 on a snappy spring when it mounts; motion only, the tone paint never changes.", behavioral: !0 },
    { name: "exit", description: "The pill fades and drops back to y 12 as it is replaced, dismissed, or times out; motion only, the tone paint never changes.", behavioral: !0 },
    { name: "replaced", description: "A new toast takes the single slot immediately; there is no queue, latest wins, and the auto-dismiss timer re-arms for the new pill.", behavioral: !0 },
    { name: "auto-dismiss", description: "After its duration elapses the provider clears the toast unless a newer one already replaced it; a duration of 0 disables the timer.", behavioral: !0 },
    { name: "dismiss-hover", description: "Hovering the dismiss control raises its opacity from 0.6 to 1; the color stays currentColor, so no token repaints.", paint: {} },
    { name: "dismiss-focus", description: "The dismiss button shows a hairline-wide currentColor outline offset 2px on keyboard focus, and its opacity goes to 1.", tokens: { "outline-width": o("hairline") } }
  ],
  tokens: [
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "space-6",
    "hairline",
    "radius-full",
    "shadow-4",
    "font-sans",
    "font-size-sm",
    "leading-md",
    "font-weight-medium",
    "surface-raised",
    "border-subtle",
    "text",
    "glass-regular",
    "glass-border",
    "glass-highlight",
    "glass-saturate",
    "blur-sm",
    "info-soft",
    "info-border",
    "info-text",
    "success-soft",
    "success-border",
    "success-text",
    "warning-soft",
    "warning-border",
    "warning-text",
    "danger-soft",
    "danger-border",
    "danger-text"
  ],
  a11y: {
    role: "status",
    focusable: !1,
    keyboard: [{ keys: "Enter, Space", action: "Activates the dismiss button when it holds focus, clearing the toast; the pill itself is not in the tab order." }],
    notes: [
      'A danger toast uses role="alert" with aria-live="assertive"; every other tone uses role="status" with aria-live="polite".',
      "The pill is portalled to document.body so it escapes any clipping or stacking context.",
      "Only one toast exists at a time; a new toast replaces the current one rather than stacking.",
      "The pill has no tabIndex and is not focusable; the only focusable descendant is the dismiss button, which as a native button activates on Enter or Space.",
      "There is no Escape-to-dismiss handler; dismissal is via the dismiss button, a click anywhere on the pill, the imperative dismiss() control, or the auto-dismiss timer.",
      'The dismiss control carries aria-label="Dismiss"; clicking it stops propagation but still dismisses, and clicking the surrounding pill dismisses as well.',
      "Do not rely on tone color alone to carry meaning; the message text should state it on its own."
    ]
  },
  motion: {
    description: "The pill springs up from y 12 and fades in on entry, then fades and drops back to y 12 on exit, driven by AnimatePresence. Under reduced motion both transitions collapse to a plain opacity fade with no translate and zero duration. There is no press-scale feedback.",
    press: !1,
    transition: { spring: "snappy" }
  }
}, Sp = {
  name: "Toggle",
  id: "toggle",
  category: "atom",
  status: "stable",
  summary: "A press-state button (aria-pressed) for stateful actions, tinting to accent soft when pressed.",
  element: "button",
  anatomy: [{ name: "label", description: "The toggle text or icon content.", required: !0 }],
  props: [
    { name: "pressed", type: "boolean", description: "Controlled pressed state." },
    { name: "defaultPressed", type: "boolean", default: !1, description: "Initial pressed state when uncontrolled." },
    { name: "onPressedChange", type: "handler", description: "Fires with the next pressed value on toggle." },
    { name: "size", type: "enum", values: Dn, default: "md", description: "Control size step." },
    { name: "iconOnly", type: "boolean", default: !1, description: "Square icon-only layout, like IconButton." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "disabled", type: "boolean", description: "Dims the toggle and blocks interaction." },
    { name: "aria-label", type: "string", description: "Required when the content is icon-only." },
    { name: "children", type: "node", description: "Toggle label or icon content." }
  ],
  sizes: [
    tt("sm", { paddingInline: o("space-3") }),
    tt("md", { paddingInline: o("space-4") }),
    tt("lg", { paddingInline: o("space-5") })
  ],
  defaults: { defaultPressed: !1, size: "md", iconOnly: !1, skeleton: !1, glass: !1 },
  dimensions: { radius: o("control-radius"), gap: o("space-2"), border: o("hairline") },
  states: [
    { name: "hover", description: "Unpressed lifts to the hover background and full-strength text.", tokens: { background: o("hover"), text: o("text") } },
    { name: "pressed", description: "aria-pressed=true paints accent soft with an accent border and text.", tokens: { background: o("accent-soft"), border: o("accent-border"), text: o("accent-text") } },
    { name: "pressed-hover", description: "A pressed toggle deepens to the accent soft hover fill.", tokens: { background: o("accent-soft-hover") } },
    { name: "focus-visible", description: "A 2px accent focus ring blooms outward.", tokens: { ring: o("focus-ring") } },
    { name: "disabled", description: "Halved opacity and not-allowed cursor." }
  ],
  paint: { text: "$text-muted" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "control-radius",
    "hairline",
    "font-sans",
    "font-weight-medium",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "text-muted",
    "text",
    "hover",
    "accent-soft",
    "accent-soft-hover",
    "accent-border",
    "accent-text",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "button",
    focusable: !0,
    keyboard: [{ keys: "Enter, Space", action: "Toggles the pressed state." }],
    notes: [
      "Sets aria-pressed to the current pressed state.",
      "Icon-only toggles need an aria-label for their accessible name."
    ]
  },
  motion: {
    description: "Presses inward on tap and eases its colors on hover; both respect reduced motion.",
    press: !0,
    transition: { speed: "fast", ease: "out" }
  }
}, Mp = {
  name: "Toolbar",
  id: "toolbar",
  category: "structure",
  status: "stable",
  summary: "A horizontal bar with a start slot, a flexible middle, and an end slot, for app and page headers.",
  element: "div",
  anatomy: [
    { name: "start", description: "Leading slot, such as a menu button or title." },
    { name: "content", description: "The flexible middle; it grows so the end slot hugs the trailing edge." },
    { name: "end", description: "Trailing slot, such as actions." }
  ],
  props: [
    { name: "start", type: "node", description: "Content pinned to the start." },
    { name: "end", type: "node", description: "Content pinned to the end." },
    { name: "sticky", type: "boolean", default: !1, description: "Stick to the top of the scroll container." },
    { name: "border", type: "boolean", default: !1, description: "Add a bottom hairline." },
    { name: "surface", type: "boolean", default: !1, description: "Add the translucent glass background." },
    { name: "children", type: "node", description: "The middle content." }
  ],
  defaults: { sticky: !1, border: !1, surface: !1 },
  // even padding on every side; the middle grows so no slot needs a margin
  dimensions: { padding: o("space-3"), gap: o("space-3") },
  states: [
    { name: "sticky", description: "Pins to the top of the scroll container (position: sticky, top 0, z-index 20). Pure positioning with zero paint of its own - pair it with surface so content scrolling under it stays legible.", behavioral: !0 },
    { name: "border", description: "Adds a hairline border-subtle bottom rule.", paint: { border: o("border-subtle") } },
    { name: "surface", description: "Adds the translucent glass-thin background with a blur-md, glass-saturate backdrop filter.", paint: { background: o("glass-thin") }, tokens: { blur: o("blur-md"), saturate: o("glass-saturate") } }
  ],
  // the slotted content paints
  paint: {},
  tokens: ["space-3", "font-sans", "hairline", "border-subtle", "glass-thin", "blur-md", "glass-saturate"],
  a11y: {
    notes: ["Give an icon-only control in the start or end slot an aria-label; the toolbar adds no labels of its own."]
  }
}, $p = [
  "top",
  "top-start",
  "top-center",
  "top-end",
  "bottom",
  "bottom-start",
  "bottom-center",
  "bottom-end",
  "left",
  "left-start",
  "left-center",
  "left-end",
  "right",
  "right-start",
  "right-center",
  "right-end"
], Tp = {
  name: "Tooltip",
  id: "tooltip",
  category: "molecule",
  status: "stable",
  summary: "A hover and focus label that portals to the body so it escapes overflow clipping; it opens on hover intent after a delay or instantly on focus, flips and clamps on screen, and stays non-interactive.",
  element: "div",
  anatomy: [
    {
      name: "trigger",
      description: "The single child element the tooltip describes. It is cloned so its ref and pointer/focus handlers are wired up without replacing any the caller already passed, and it gains aria-describedby pointing at the bubble while shown. When disabled or skeleton the child is returned untouched with no wiring.",
      required: !0
    },
    {
      name: "arrow",
      description: "A small rotated-square pointer wearing the bubble material, poking out of the edge that faces the trigger. It follows the resolved placement: centered on the edge, or pinned near the leading or trailing corner for start and end alignments.",
      required: !0
    },
    {
      name: "bubble",
      description: 'The portalled role="tooltip" glass surface holding the content, positioned above, below, or beside the trigger. It carries a thick-glass background, hairline border, backdrop blur and saturation, and a soft blurred drop shadow, and is fixed to the viewport with pointer-events disabled so it can never trap the cursor.',
      required: !0
    }
  ],
  props: [
    { name: "content", type: "node", required: !0, description: "The bubble content: a short label, shortcut, or hint. Rendered inside the portalled bubble." },
    { name: "children", type: "element", required: !0, description: "The single element the tooltip describes. It is cloned so its ref and pointer/focus handlers are wired up, preserving any handlers already on the child." },
    { name: "placement", type: "enum", values: $p, default: "top", description: "Preferred side and alignment of the bubble relative to the trigger before flipping to the opposite side and clamping into the viewport." },
    { name: "delay", type: "number", default: 300, description: "Milliseconds of hover intent before the bubble opens. Focus opens instantly regardless; a value of 0 opens on hover instantly too." },
    { name: "disabled", type: "boolean", default: !1, description: "Suppresses the tooltip entirely; the child is returned with no wiring and nothing can open." },
    { name: "skeleton", type: "boolean", default: !1, description: "Returns the child untouched so its own geometry stands in while loading; the tooltip adds no footprint of its own and no hover wiring." },
    { name: "className", type: "string", description: "Extra class names merged onto the bubble." }
  ],
  defaults: { placement: "top", delay: 300, disabled: !1, skeleton: !1 },
  // fixed bubble metrics; the bubble does not vary with size
  dimensions: {
    maxWidth: "min(18rem, calc(100vw - 2rem))",
    paddingInline: o("space-3"),
    paddingBlock: o("space-2"),
    radius: o("radius-md"),
    border: o("hairline"),
    blur: o("blur-md"),
    fontSize: o("font-size-xs"),
    lineHeight: o("leading-xs"),
    offset: "10px"
  },
  states: [
    { name: "shown", description: "Bubble is mounted and portalled to the body, fades and scales up with a small upward drift from the trigger-anchored transform origin, and the trigger carries aria-describedby pointing at it. Motion and announcement only; the bubble paint never changes.", behavioral: !0 },
    { name: "hidden", description: "Bubble fades and scales back down, then unmounts once the exit animation completes; the trigger drops aria-describedby. Motion and announcement only; the bubble paint never changes.", behavioral: !0 }
  ],
  paint: { background: "$glass-regular", text: "$text", border: "$glass-border" },
  tokens: [
    "space-2",
    "space-3",
    "hairline",
    "radius-md",
    "glass-border",
    "glass-thick",
    "glass-saturate",
    "blur-md",
    "text",
    "font-sans",
    "font-size-xs",
    "leading-xs"
  ],
  a11y: {
    role: "tooltip",
    focusable: !1,
    keyboard: [{ keys: "Escape", action: "Hides the bubble while it is shown, via a document-level key handler, without moving focus off the trigger." }],
    notes: [
      'The bubble portals to document.body and renders as role="tooltip" with a stable generated id.',
      "The trigger gains aria-describedby pointing at the bubble only while it is shown, merged with any aria-describedby the child already had, so assistive tech announces the content as a description.",
      "Opens on hover intent after the delay or immediately on keyboard focus; hides on pointer leave, blur, or Escape.",
      "Touch pointers are excluded from the hover-intent path: a tap does not open the bubble, so it never lingers over touch targets.",
      "The Escape handler is a document-level keydown listener registered only while the bubble is mounted, and it hides the bubble without stealing focus from the trigger.",
      "The bubble is non-interactive (pointer-events: none) so it never traps the cursor over the trigger it describes.",
      "A tooltip supplements the trigger; it must not be the only place a control is named or its meaning stated."
    ]
  },
  motion: {
    description: "On show the bubble fades in, scales up from just under full size, and drifts up a couple of pixels, all from the trigger-anchored transform origin; on hide it reverses and unmounts once the exit animation completes. Under reduced motion it crossfades opacity only, with no scale or translate.",
    transition: { speed: "Fast", ease: "Out" }
  }
}, Cp = {
  name: "StatTile",
  id: "stat-tile",
  category: "atom",
  status: "stable",
  summary: "A compact stat micro-card: an optional leading icon, a prominent value, and a muted label, with an optional trailing delta or hint. Built on the card surface tokens so a row or grid of tiles reads as one consistent panel.",
  element: "div",
  anatomy: [
    { name: "icon", description: "Optional leading glyph framed in a muted, sunken disc. Decorative and aria-hidden; omitted when unset." },
    { name: "value", description: "The prominent figure - a number, currency, or short string - in the primary text color.", required: !0 },
    { name: "hint", description: "Optional trailing delta or hint aligned to the value baseline, e.g. a change chip or timeframe." },
    { name: "label", description: "The muted label naming what the value measures.", required: !0 }
  ],
  props: [
    { name: "icon", type: "node", description: "Decorative glyph rendered in the leading disc; the disc is omitted when unset." },
    { name: "value", type: "node", required: !0, description: "The prominent value - a number, currency, or short string." },
    { name: "label", type: "node", required: !0, description: "The muted label naming what the value measures." },
    { name: "hint", type: "node", description: "Optional trailing delta or hint on the value baseline." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid card." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder mirroring the anatomy: icon disc and hint bones follow the icon and hint props, around the value and label lines." }
  ],
  defaults: { glass: !1, skeleton: !1 },
  dimensions: {
    gap: o("space-3"),
    radius: o("radius-lg"),
    border: o("hairline"),
    paddingBlock: o("space-4"),
    paddingInline: o("space-5"),
    iconSize: "2.25rem",
    iconRadius: o("radius-md"),
    valueFontSize: o("font-size-2xl"),
    labelFontSize: o("font-size-sm"),
    hintFontSize: o("font-size-xs")
  },
  states: [
    { name: "default", description: "A row: an optional sunken icon disc, then a column of the value (2xl, semibold, primary text) with an optional trailing hint, and a secondary-text label below." },
    { name: "glass", description: "Swaps the solid raised card for the frosted glass material (blur-sm, glass-saturate) with an inset top highlight.", paint: { background: o("glass-regular"), border: o("glass-border") }, tokens: { highlight: o("glass-highlight") } },
    { name: "skeleton", description: "Replaces the content with two text-line placeholders sized to the value (2xl) and label (sm), holding the same vertical rhythm." }
  ],
  paint: { background: "$surface-raised", text: "$text", border: "$border-subtle" },
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "radius-md",
    "radius-lg",
    "hairline",
    "border-subtle",
    "surface-raised",
    "surface-sunken",
    "glass-regular",
    "glass-border",
    "glass-highlight",
    "glass-saturate",
    "blur-sm",
    "font-sans",
    "font-size-xs",
    "font-size-sm",
    "font-size-lg",
    "font-size-2xl",
    "font-weight-medium",
    "font-weight-semibold",
    "leading-md",
    "text",
    "text-muted"
  ],
  a11y: {
    focusable: !1,
    notes: [
      "A presentational container with no role of its own; the value and label are read in source order, so keep the label a short, literal phrase.",
      "The leading icon disc is decorative and marked aria-hidden, so it is not announced.",
      "When the hint conveys direction (up or down), do not rely on color alone - include a glyph or sign so the change is legible without color."
    ]
  },
  motion: {
    description: "The component is static and does not animate. In skeleton mode the placeholders inherit the shared Skeleton shimmer, which softens to an opacity pulse under reduced motion."
  }
}, Np = ["sm", "md", "lg"], Dp = {
  name: "DeviceFrame",
  id: "device-frame",
  category: "atom",
  status: "stable",
  summary: "A decorative phone bezel with a fixed-aspect, inset screen that hosts arbitrary children - a preview, a screenshot, or an iframe - in three preset widths or an explicit width.",
  element: "div",
  anatomy: [
    { name: "bezel", description: "The decorative outer shell and inner rim; aria-hidden." },
    { name: "notch", description: "The top cutout with speaker and camera dots; aria-hidden and optional." },
    { name: "buttons", description: "Decorative side buttons on the shell; aria-hidden." },
    { name: "screen", description: "The fixed aspect-ratio inset region that clips and hosts the children.", required: !0 },
    { name: "content", description: "The children slot; a single child stretches to fill the screen." }
  ],
  props: [
    { name: "size", type: "enum", values: Np, default: "md", description: "Preset screen width; ignored when width is set." },
    { name: "width", type: "string", description: 'Explicit screen width overriding size, e.g. 320 or "20rem".' },
    { name: "aspect", type: "string", default: "9 / 19.5", description: "Screen aspect ratio as width / height." },
    { name: "hideNotch", type: "boolean", default: !1, description: "Hides the decorative notch for a full-bleed slab." },
    { name: "aria-label", type: "string", description: "Accessible name for the frame region." },
    { name: "children", type: "node", description: "The preview or iframe that fills the screen." }
  ],
  sizes: [
    { name: "sm", diameter: "13.5rem" },
    { name: "md", diameter: "17rem" },
    { name: "lg", diameter: "21rem" }
  ],
  defaults: { size: "md", aspect: "9 / 19.5", hideNotch: !1 },
  dimensions: {
    radius: "14% of frame width",
    screenRadius: "14% of frame width minus the bezel",
    bezel: o("space-2")
  },
  // the bezel is a literal black; the screen inset frames its children
  paint: {},
  tokens: [
    "gray-9",
    "surface-sunken",
    "border",
    "border-strong",
    "hairline",
    "radius-md",
    "radius-full",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "space-6",
    "space-8",
    "shadow-4",
    "font-sans"
  ],
  a11y: {
    role: "group",
    focusable: !1,
    notes: [
      'The frame is a role="group"; give it an aria-label to name what it presents.',
      "The bezel, notch, and side buttons are decorative and marked aria-hidden - only the screen contents carry meaning.",
      "An embedded iframe still needs its own title for assistive tech."
    ]
  }
}, zp = {
  name: "FilterChip",
  id: "filter-chip",
  category: "atom",
  status: "stable",
  summary: "A toggleable filter pill (button, aria-pressed) for faceted filtering: the selected state paints the accent soft tint, with an optional leading icon and trailing count.",
  element: "button",
  anatomy: [
    { name: "icon", description: "An optional leading glyph, hidden from assistive tech." },
    { name: "label", description: "The chip text, kept to one line.", required: !0 },
    { name: "count", description: "An optional trailing count rendered as a CounterBadge." }
  ],
  props: [
    { name: "selected", type: "boolean", description: "Controlled selected state." },
    { name: "defaultSelected", type: "boolean", default: !1, description: "Initial selected state when uncontrolled." },
    { name: "onSelectedChange", type: "handler", description: "Called with the next selected state when the chip is toggled." },
    { name: "icon", type: "node", description: "Leading glyph." },
    { name: "count", type: "number", description: "Trailing count, rendered as a CounterBadge; hidden when 0 or less." },
    { name: "size", type: "enum", values: Lo, default: "md", description: "Compact size step." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims the chip and blocks toggling." },
    { name: "children", type: "node", required: !0, description: "Chip label." }
  ],
  sizes: [
    { name: "sm", height: "1.375rem", paddingInline: o("space-1"), fontSize: o("font-size-xs") },
    { name: "md", height: "1.75rem", paddingInline: o("space-2"), fontSize: o("font-size-sm") }
  ],
  defaults: { defaultSelected: !1, size: "md", disabled: !1 },
  dimensions: { radius: o("radius-full"), gap: o("space-2"), border: o("hairline") },
  states: [
    { name: "hover", description: "An unselected chip lifts to the hover background and full-strength text.", tokens: { background: o("hover"), text: o("text") } },
    {
      name: "selected",
      description: "aria-pressed is true; the chip fills with the accent soft tint and the trailing count switches to the accent tone.",
      tokens: { background: o("accent-soft"), border: o("accent-border"), text: o("accent-text") }
    },
    { name: "selected-hover", description: "A selected chip deepens to the accent soft hover fill.", tokens: { background: o("accent-soft-hover") } },
    { name: "focus-visible", description: "A 2px accent focus ring blooms outward.", tokens: { ring: o("focus-ring") } },
    { name: "disabled", description: "Halved opacity and not-allowed cursor." }
  ],
  paint: { text: "$text-muted", border: "$border-strong" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "space-2",
    "radius-full",
    "hairline",
    "font-sans",
    "font-weight-medium",
    "font-size-xs",
    "font-size-sm",
    "duration-fast",
    "ease-out",
    "border-strong",
    "text-muted",
    "text",
    "hover",
    "accent-soft",
    "accent-soft-hover",
    "accent-border",
    "accent-text",
    "focus-ring"
  ],
  a11y: {
    role: "button",
    focusable: !0,
    keyboard: [
      { keys: "Enter, Space", action: "Toggles the chip between selected and unselected." },
      { keys: "Tab", action: "Moves focus to and from the chip." }
    ],
    notes: [
      "Renders as a button with aria-pressed reflecting the selected state.",
      'The leading icon is aria-hidden; the trailing CounterBadge announces its count via role="status".'
    ]
  },
  motion: {
    description: "The chip scales down slightly on press; respects reduced motion.",
    press: !0,
    transition: { speed: "fast", ease: "out" }
  }
}, Pp = ["vertical", "horizontal"], Ap = ["subtle", "default", "accent"], Op = {
  name: "ScrollArea",
  id: "scroll-area",
  category: "molecule",
  status: "stable",
  summary: "A styled overflow container with a thin themed scrollbar and edge fade masks that appear only when there is more content to scroll in that direction.",
  element: "div",
  anatomy: [
    { name: "root", description: "The wrapper that caps the viewport and carries the data-fade-start/end flags driving the masks.", required: !0 },
    { name: "viewport", description: "The focusable, keyboard-scrollable overflow region holding the content; masked at scrollable edges.", required: !0 },
    { name: "fade", description: "The CSS mask ramp dissolving the content toward a scrollable edge." }
  ],
  props: [
    { name: "maxHeight", type: "string", description: "Caps the viewport along the scroll axis (max-height when vertical, max-width when horizontal); a CSS length or pixel number." },
    { name: "orientation", type: "enum", values: Pp, default: "vertical", description: "Scroll axis; vertical fades top/bottom, horizontal fades left/right." },
    { name: "scrollbarAppearance", type: "enum", values: Ap, default: "default", description: "Visual treatment for the visible scrollbar on web-capable bindings." },
    { name: "showScrollbarTrack", type: "boolean", default: !0, description: "Shows the half-opaque track behind the scrollbar thumb." },
    { name: "hideScrollbar", type: "boolean", default: !1, description: "Hides the scrollbar entirely while every scroll input keeps working; the edge fades still signal the overflow." },
    { name: "children", type: "node", description: "The overflowing content." },
    { name: "className", type: "string", description: "Extra class on the root wrapper." }
  ],
  defaults: { orientation: "vertical", scrollbarAppearance: "default", showScrollbarTrack: !0, hideScrollbar: !1 },
  // fade width and scrollbar thickness are fixed on the space scale
  dimensions: {
    fade: o("space-6"),
    scrollbar: o("space-2"),
    radius: o("radius-full")
  },
  states: [
    // the masks are untinted (a transparent-to-#000 mask-image ramp); their only
    // tokenized value is the fade width on the space scale
    { name: "fade-start", description: "Once scrolled off the start edge, a space-6-wide transparent-to-opaque mask ramp dissolves the leading edge to signal hidden content.", tokens: { fade: o("space-6") } },
    { name: "fade-end", description: "While more content remains, a space-6-wide transparent-to-opaque mask ramp dissolves the trailing edge; it clears at the end.", tokens: { fade: o("space-6") } },
    { name: "focus-visible", description: "A 2px inset accent ring on the keyboard-focused viewport.", tokens: { ring: o("focus-ring") } }
  ],
  // a 2px focus-ring outline inset into the viewport (offset -2px)
  paint: { text: "$text" },
  focusRing: { ring: o("focus-ring"), offset: "-2px" },
  tokens: [
    "space-2",
    "space-6",
    "font-sans",
    "text",
    "border",
    "border-strong",
    "border-subtle",
    "accent-solid",
    "accent-soft",
    "accent-10",
    "radius-sm",
    "radius-full",
    "focus-ring"
  ],
  a11y: {
    role: "group",
    focusable: !0,
    keyboard: [
      { keys: "ArrowUp, ArrowDown", action: "Scrolls a vertical viewport when it holds keyboard focus." },
      { keys: "ArrowLeft, ArrowRight", action: "Scrolls a horizontal viewport when it holds keyboard focus." },
      { keys: "PageUp, PageDown, Home, End", action: "Scrolls by a page or to an end, per the platform default." }
    ],
    notes: [
      'The viewport is a focusable role="group" so keyboard users can scroll it without a pointer.',
      "The edge fades are purely decorative (CSS masks) and expose no content or state to assistive tech."
    ]
  },
  motion: {
    description: "A scroll listener and ResizeObserver toggle the edge masks as content scrolls or the box resizes; there is no timed animation."
  }
}, Ep = {
  name: "Carousel",
  id: "carousel",
  category: "molecule",
  status: "stable",
  summary: "A horizontal snap-scroll strip hosting arbitrary card children, with wheel/drag scroll and optional prev/next controls that appear when the strip overflows.",
  element: "div",
  anatomy: [
    { name: "root", description: "The positioning wrapper that holds the scroller and any overlaid controls.", required: !0 },
    { name: "scroller", description: 'The scroll-snapping role="group" track; each direct child is a snap target.', required: !0 },
    { name: "control", description: "A prev/next IconButton overlaid on the track edge, shown only while overflowing and disabled at the corresponding end." }
  ],
  props: [
    { name: "children", type: "node", required: !0, description: "The card children laid out in the horizontal strip; each becomes a snap target." },
    { name: "showControls", type: "boolean", default: !1, description: "Renders prev/next controls that appear when the strip overflows." },
    { name: "gap", type: "token", default: "$space-4", description: "Space between cards; any CSS length or a space token." },
    { name: "aria-label", type: "string", description: "Accessible name for the scrollable region." },
    { name: "className", type: "string", description: "Extra class on the root wrapper." }
  ],
  defaults: { showControls: !1, gap: "$space-4" },
  dimensions: {
    gap: o("space-4"),
    radius: o("radius-md"),
    controlShadow: o("shadow-3")
  },
  // a 2px focus-ring outline around the scroller, offset 2px
  // the card children paint
  paint: {},
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  // the overlaid control slots ease opacity and visibility as overflow changes
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "space-4",
    "radius-md",
    "shadow-3",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "group",
    focusable: !0,
    keyboard: [
      { keys: "Tab", action: "Moves focus to the scroll region, then into its focusable card children." },
      { keys: "ArrowLeft, ArrowRight", action: "Scrolls the focused region horizontally (native scroll-container behavior)." }
    ],
    notes: [
      'The track is a focusable role="group" so keyboard users can scroll it and reach off-screen cards.',
      "CSS scroll-snap gives tidy per-card stops; the scrollbar is visually hidden but scrolling stays available.",
      "Prev/next controls are aria-labelled IconButtons kept out of the tab order (the scroller itself is the keyboard entry point); they hide when nothing overflows and disable at each end."
    ]
  },
  motion: {
    description: "Paging and snap use smooth native scroll; the overlaid controls cross-fade as overflow appears and disappears.",
    transition: { speed: "fast", ease: "out" }
  }
}, Wp = Dn, Ip = {
  name: "Combobox",
  id: "combobox",
  category: "molecule",
  status: "draft",
  summary: "An editable input that filters and commits one option from a portaled listbox.",
  element: "div",
  anatomy: [
    { name: "input", description: "The editable combobox input that retains focus while options are navigated.", required: !0 },
    { name: "indicator", description: "A decorative trailing chevron that indicates available suggestions." },
    { name: "menu", description: "The portaled listbox of filtered options." },
    { name: "option", description: "A selectable option row with an optional supporting description." },
    { name: "empty", description: "The non-selectable result shown when the current query has no matches." },
    { name: "hiddenInput", description: "A hidden form value rendered when name is set." }
  ],
  props: [
    {
      name: "options",
      type: "array",
      required: !0,
      description: "Options available to filter and select.",
      item: {
        type: "object",
        description: "A selectable combobox option.",
        fields: [
          { name: "value", type: "string", required: !0, description: "Unique submitted value for the option." },
          { name: "label", type: "node", required: !0, description: "Content rendered in the input and option row." },
          { name: "textValue", type: "string", description: "Plain text used for filtering when label is not a string." },
          { name: "description", type: "node", description: "Optional muted supporting content below the label." },
          { name: "disabled", type: "boolean", description: "Prevents the option from being selected." }
        ]
      }
    },
    { name: "value", type: "string", description: "Controlled selected option value." },
    { name: "defaultValue", type: "string", description: "Uncontrolled initial selected option value." },
    { name: "onValueChange", type: "handler", description: "Called when an option is committed." },
    { name: "inputValue", type: "string", description: "Controlled text shown in the editable input." },
    { name: "defaultInputValue", type: "string", description: "Uncontrolled initial text shown in the editable input." },
    { name: "onInputValueChange", type: "handler", description: "Called whenever the editable input text changes." },
    { name: "filter", type: "handler", description: "Custom predicate that decides whether an option matches the current input text." },
    { name: "placeholder", type: "string", description: "Hint shown while the input is empty." },
    { name: "emptyState", type: "node", description: "Content shown when the current query has no matching options." },
    { name: "loading", type: "boolean", default: !1, description: "Marks the listbox busy and shows the localized loading state." },
    { name: "size", type: "enum", values: Wp, default: "md", description: "Control size step." },
    { name: "fullWidth", type: "boolean", default: !1, description: "Stretches the control to its container width." },
    { name: "disabled", type: "boolean", default: !1, description: "Blocks editing and opening the option list." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the control geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Uses the frosted glass material for the input surface." },
    { name: "name", type: "string", description: "Submitted with forms through a hidden input when set." },
    { name: "id", type: "string", description: "Id for the editable input; falls back to the surrounding Field id." },
    { name: "aria-label", type: "string", description: "Accessible name when no surrounding Field label is present." }
  ],
  sizes: [
    tt("sm", { paddingInline: o("space-3") }),
    tt("md", { paddingInline: o("space-4") }),
    tt("lg", { paddingInline: o("space-5") })
  ],
  defaults: { loading: !1, size: "md", fullWidth: !1, disabled: !1, skeleton: !1, glass: !1 },
  dimensions: {
    radius: o("radius-lg"),
    optionRadius: o("radius-md"),
    gap: o("space-3"),
    border: o("hairline"),
    menuPadding: o("space-1")
  },
  states: [
    { name: "hover", description: "The input border strengthens when not focused or disabled.", tokens: { border: o("border-strong") } },
    { name: "focus", description: "The input border turns to the focus ring with an accent-soft ring.", tokens: { border: o("focus-ring"), ring: o("accent-soft") } },
    { name: "open", description: "The portaled listbox fades and scales in from the input edge: a glass-thick panel with a glass border, glass highlight, and shadow-4.", tokens: { background: o("glass-thick"), border: o("glass-border"), highlight: o("glass-highlight"), shadow: o("shadow-4") } },
    { name: "active", description: "The keyboard-active option fills with the accent tone.", tokens: { background: o("accent-solid"), text: o("accent-contrast") } },
    { name: "selected", description: "On reopen the committed option becomes the active row and takes the accent fill; its value is submitted through the hidden input when name is set.", tokens: { background: o("accent-solid"), text: o("accent-contrast") } },
    { name: "empty", description: "A non-selectable localized result appears in the subtle text color when filtering returns no options.", tokens: { text: o("text-subtle") } },
    { name: "loading", description: "The listbox exposes aria-busy while result data is loading." },
    { name: "disabled", description: "The input dims and uses the sunken surface.", tokens: { background: o("surface-sunken") } },
    { name: "invalid", description: "A surrounding Field error paints a danger border.", tokens: { border: o("danger-border") } }
  ],
  // a 3px accent-soft glow hugging the border, which itself turns focus-ring
  paint: { background: "$surface", text: "$text", border: "$border" },
  focusRing: { ring: o("accent-soft"), offset: "0" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "font-sans",
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "space-8",
    "space-10",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "leading-sm",
    "radius-md",
    "radius-lg",
    "hairline",
    "border",
    "border-strong",
    "focus-ring",
    "danger-border",
    "surface",
    "surface-sunken",
    "text",
    "text-muted",
    "text-subtle",
    "text-disabled",
    "accent-solid",
    "accent-soft",
    "accent-contrast",
    "glass-regular",
    "glass-thick",
    "glass-border",
    "glass-highlight",
    "glass-saturate",
    "blur-sm",
    "blur-lg",
    "shadow-4",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "combobox",
    focusable: !0,
    keyboard: [
      { keys: "ArrowDown, ArrowUp", action: "Opens the listbox or moves the active enabled option while focus stays in the input." },
      { keys: "Home, End", action: "Moves the active option to the first or last enabled filtered result." },
      { keys: "Enter", action: "Commits the active option and closes the listbox." },
      { keys: "Escape", action: "Closes the listbox without changing the selected value." },
      { keys: "Tab", action: "Closes the listbox and continues normal tab navigation." }
    ],
    notes: [
      "Follows the WAI-ARIA editable combobox pattern: focus stays on the input and aria-activedescendant identifies the active option.",
      "The listbox portals to document.body, flips and clamps through the shared anchored-position engine, and closes on an outside press.",
      "Reads id, aria-describedby, and aria-invalid from a surrounding Field when present."
    ]
  },
  motion: {
    description: "The suggestion panel fades and scales in from the input edge; motion is disabled when reduced motion is preferred.",
    transition: { speed: "fast", ease: "out" }
  }
}, Rp = Dn, Lp = {
  name: "MultiSelect",
  id: "multi-select",
  category: "molecule",
  status: "draft",
  summary: "An editable multi-value combobox that filters options, renders selected values as removable tags, and submits repeated form values.",
  element: "div",
  anatomy: [
    { name: "control", description: "The input-like shell that contains selected tags, editable input, and indicator.", required: !0 },
    { name: "tag", description: "A selected value rendered as an inline tag." },
    { name: "tagRemove", description: "The button that removes an individual selected tag." },
    { name: "input", description: "The editable combobox input that retains focus while options are navigated.", required: !0 },
    { name: "indicator", description: "A decorative trailing chevron that indicates available suggestions." },
    { name: "menu", description: "The portaled multi-select listbox of filtered options." },
    { name: "option", description: "A selectable option row with optional supporting description and selected check." },
    { name: "empty", description: "The non-selectable result shown when the current query has no matches." },
    { name: "hiddenInput", description: "One hidden form value per selected option when name is set." }
  ],
  props: [
    {
      name: "options",
      type: "array",
      required: !0,
      description: "Options available to filter and toggle.",
      item: {
        type: "object",
        description: "A selectable multi-select option.",
        fields: [
          { name: "value", type: "string", required: !0, description: "Unique submitted value for the option." },
          { name: "label", type: "node", required: !0, description: "Content rendered in the selected tag and option row." },
          { name: "textValue", type: "string", description: "Plain text used for filtering when label is not a string." },
          { name: "description", type: "node", description: "Optional muted supporting content below the option label." },
          { name: "disabled", type: "boolean", description: "Prevents the option from being toggled." }
        ]
      }
    },
    { name: "value", type: "array", item: { type: "string", description: "One controlled selected option value." }, description: "Controlled selected option values." },
    { name: "defaultValue", type: "array", item: { type: "string", description: "One uncontrolled selected option value." }, description: "Uncontrolled initial selected option values." },
    { name: "onValueChange", type: "handler", description: "Called whenever the selected value array changes." },
    { name: "inputValue", type: "string", description: "Controlled text shown in the editable input." },
    { name: "defaultInputValue", type: "string", description: "Uncontrolled initial text shown in the editable input." },
    { name: "onInputValueChange", type: "handler", description: "Called whenever the editable input text changes." },
    { name: "filter", type: "handler", description: "Custom predicate that decides whether an option matches the current input text." },
    { name: "placeholder", type: "string", description: "Hint shown while no selected tags or query are present." },
    { name: "emptyState", type: "node", description: "Content shown when the current query has no matching options." },
    { name: "loading", type: "boolean", default: !1, description: "Marks the listbox busy and shows the localized loading state." },
    { name: "size", type: "enum", values: Rp, default: "md", description: "Control size step." },
    { name: "fullWidth", type: "boolean", default: !1, description: "Stretches the control to its container width." },
    { name: "disabled", type: "boolean", default: !1, description: "Blocks editing, opening, and tag removal." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the control geometry." },
    { name: "glass", type: "boolean", default: !1, description: "Uses the frosted glass material for the control surface." },
    { name: "name", type: "string", description: "Submits one hidden input for each selected value when set." },
    { name: "id", type: "string", description: "Id for the editable input; falls back to the surrounding Field id." },
    { name: "aria-label", type: "string", description: "Accessible name when no surrounding Field label is present." }
  ],
  sizes: [
    tt("sm", { paddingInline: o("space-2") }),
    tt("md", { paddingInline: o("space-3") }),
    tt("lg", { paddingInline: o("space-4") })
  ],
  defaults: { loading: !1, size: "md", fullWidth: !1, disabled: !1, skeleton: !1, glass: !1 },
  dimensions: {
    radius: o("radius-lg"),
    tagRadius: o("radius-full"),
    optionRadius: o("radius-md"),
    gap: o("space-1"),
    border: o("hairline"),
    menuPadding: o("space-1")
  },
  states: [
    { name: "hover", description: "The control border strengthens when not focused or disabled.", tokens: { border: o("border-strong") } },
    { name: "focus", description: "The control border turns to the focus ring with an accent-soft ring.", tokens: { border: o("focus-ring"), ring: o("accent-soft") } },
    { name: "open", description: "The portaled listbox fades and scales in from the control edge: a glass-thick panel with a glass border, glass highlight, and shadow-4.", tokens: { background: o("glass-thick"), border: o("glass-border"), highlight: o("glass-highlight"), shadow: o("shadow-4") } },
    { name: "active", description: "The keyboard-active option fills with the accent tone.", tokens: { background: o("accent-solid"), text: o("accent-contrast") } },
    { name: "selected", description: "A selected option (when not the active row) tints accent-soft and shows an accent check; selected values render as accent-soft tags in the control.", tokens: { background: o("accent-soft"), check: o("accent-solid") } },
    { name: "empty", description: "A non-selectable localized result appears in the subtle text color when filtering returns no options.", tokens: { text: o("text-subtle") } },
    { name: "loading", description: "The listbox exposes aria-busy while result data is loading." },
    { name: "disabled", description: "The control dims, uses the sunken surface, and blocks tag removal.", tokens: { background: o("surface-sunken") } },
    { name: "invalid", description: "A surrounding Field error paints a danger border.", tokens: { border: o("danger-border") } }
  ],
  // a 3px accent-soft glow hugging the control border, which itself turns
  // focus-ring while the inner input holds focus (focus-within)
  paint: { background: "$surface", text: "$text", border: "$border" },
  focusRing: { ring: o("accent-soft"), offset: "0" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "font-sans",
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "space-8",
    "space-10",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "font-size-xs",
    "font-size-sm",
    "font-size-md",
    "leading-sm",
    "radius-md",
    "radius-lg",
    "radius-full",
    "hairline",
    "border",
    "border-strong",
    "focus-ring",
    "danger-border",
    "surface",
    "surface-sunken",
    "text",
    "text-muted",
    "text-subtle",
    "text-disabled",
    "accent-solid",
    "accent-soft",
    "accent-contrast",
    "glass-regular",
    "glass-thick",
    "glass-border",
    "glass-highlight",
    "glass-saturate",
    "blur-sm",
    "blur-lg",
    "shadow-4",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "combobox",
    focusable: !0,
    keyboard: [
      { keys: "ArrowDown, ArrowUp", action: "Opens the listbox or moves the active enabled option while focus stays in the input." },
      { keys: "Home, End", action: "Moves the active option to the first or last enabled filtered result." },
      { keys: "Enter", action: "Toggles the active option without closing the listbox." },
      { keys: "Backspace", action: "Removes the final selected value when the editable query is empty." },
      { keys: "Escape", action: "Closes the listbox without changing selected values." },
      { keys: "Tab", action: "Closes the listbox and continues normal tab navigation." }
    ],
    notes: [
      "Follows the WAI-ARIA editable combobox pattern: focus stays on the input and aria-activedescendant identifies the active option.",
      "The listbox sets aria-multiselectable=true; selected options set aria-selected=true and are also represented as removable tags.",
      "The listbox portals to document.body, flips and clamps through the shared anchored-position engine, and closes on an outside press.",
      "Renders one hidden input per selected value when name is set so a native form preserves multiplicity.",
      "Reads id, aria-describedby, and aria-invalid from a surrounding Field when present."
    ]
  },
  motion: {
    description: "The suggestion panel fades and scales in from the control edge; motion is disabled when reduced motion is preferred.",
    transition: { speed: "fast", ease: "out" }
  }
}, qp = ["sm", "md"], Fp = {
  name: "List",
  id: "list",
  category: "molecule",
  status: "draft",
  summary: "A semantic single-column list container that provides shared density and optional separators for ListItem rows.",
  element: "ul",
  anatomy: [
    { name: "root", description: "Semantic unordered list container.", required: !0 },
    { name: "item", description: "Direct ListItem row child." },
    { name: "divider", description: "Optional hairline separator between direct rows when divided is true." }
  ],
  props: [
    { name: "size", type: "enum", values: qp, default: "md", description: "Shared row density step." },
    { name: "divided", type: "boolean", default: !1, description: "Draws a hairline between direct ListItem children." },
    { name: "children", type: "node", description: "ListItem rows or other semantic list content." }
  ],
  sizes: [
    { name: "sm", height: o("control-height-sm"), paddingInline: o("space-3") },
    { name: "md", height: o("control-height-md"), paddingInline: o("space-4") }
  ],
  defaults: { size: "md", divided: !1 },
  dimensions: { gap: o("space-1"), border: o("hairline"), radius: o("radius-lg") },
  states: [
    { name: "divided", description: "Direct rows are separated by a hairline.", tokens: { border: o("border") } }
  ],
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "control-height-sm",
    "control-height-md",
    "font-sans",
    "font-size-xs",
    "font-size-sm",
    "radius-lg",
    "hairline",
    "border",
    "text"
  ],
  a11y: { role: "list", notes: ["Renders a native unordered list. Use ListItem for native list-item children."] },
  motion: { description: "List itself is static; actionable rows provide native focus feedback.", transition: { speed: "fast", ease: "out" } }
}, Bp = {
  name: "ListItem",
  id: "list-item",
  category: "molecule",
  status: "draft",
  summary: "A semantic list row with leading/trailing slots, optional supporting description, selected state, and native actionable variants.",
  element: "li",
  anatomy: [
    { name: "row", description: "The layout surface, rendered as a div, anchor, or button depending on interaction." },
    { name: "leading", description: "Optional decorative leading icon or visual." },
    { name: "copy", description: "Main title and optional supporting description." },
    { name: "title", description: "Primary row label.", required: !0 },
    { name: "description", description: "Optional muted supporting line." },
    { name: "trailing", description: "Optional trailing metadata, status, or action affordance." }
  ],
  props: [
    { name: "title", type: "node", required: !0, description: "Primary row label." },
    { name: "description", type: "node", description: "Optional supporting content below the title." },
    { name: "leading", type: "node", description: "Optional decorative leading content." },
    { name: "trailing", type: "node", description: "Optional trailing content." },
    { name: "selected", type: "boolean", default: !1, description: "Paints the row with the accent-soft selected treatment." },
    { name: "disabled", type: "boolean", default: !1, description: "Dims content and blocks button-row activation." },
    { name: "href", type: "string", description: "Renders the row content as a native anchor when supplied." },
    { name: "onClick", type: "handler", description: "Renders the row content as a native button when supplied." }
  ],
  defaults: { selected: !1, disabled: !1 },
  dimensions: { gap: o("space-3"), radius: o("radius-lg") },
  states: [
    { name: "hover", description: "Interactive anchor and button rows use the hover surface.", tokens: { background: o("hover") } },
    { name: "focus-visible", description: "Interactive rows receive an accent focus ring.", tokens: { ring: o("focus-ring") } },
    { name: "selected", description: "Selected rows use the accent-soft surface and accent text.", tokens: { background: o("accent-soft"), text: o("accent-text") } },
    { name: "disabled", description: "Disabled rows use the disabled text token and block button activation.", tokens: { text: o("text-disabled") } }
  ],
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "font-size-xs",
    "leading-sm",
    "radius-lg",
    "hover",
    "focus-ring",
    "accent-soft",
    "accent-text",
    "text",
    "text-muted",
    "text-disabled"
  ],
  a11y: {
    role: "listitem",
    notes: [
      "Renders a native li. When href is supplied the row content is a native anchor; when onClick is supplied it is a native button.",
      "Do not place another interactive control in the row title when the whole row is already actionable."
    ]
  },
  motion: { description: "Interactive row colors ease through native hover and focus states.", transition: { speed: "fast", ease: "out" } }
}, Hp = {
  name: "Heatmap",
  id: "heatmap",
  category: "molecule",
  status: "stable",
  summary: "A GitHub-contribution-style intensity grid: values (a 2D array or a flat {date,value} list) are bucketed onto the accent ramp, each cell titled with its value, with an optional less→more legend.",
  element: "div",
  anatomy: [
    { name: "grid", description: "The columns of cells; a 2D array reads across then down, a flat list chunks into columns of `rows` height.", required: !0 },
    { name: "cell", description: "One tile, shaded by its level as a fraction of the data max; carries a title with its date and value.", required: !0 },
    { name: "legend", description: "An optional less→more row of swatches spanning the level scale." }
  ],
  props: [
    { name: "data", type: "node", required: !0, description: "Values to plot: a 2D number[][] grid or a flat { date, value }[] list." },
    { name: "levels", type: "number", default: 5, description: "Number of intensity steps including the empty step 0." },
    { name: "legend", type: "boolean", default: !1, description: "Show a less→more legend under the grid." },
    { name: "rows", type: "number", default: 7, description: "Cells per column when data is a flat list." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders an aria-hidden placeholder: one square Skeleton per cell at the exact cell size and gap, plus legend bones when legend is set." },
    { name: "skeletonColumns", type: "number", default: 12, description: "Columns the skeleton grid renders while there is no data; rows follow the rows prop." },
    { name: "aria-label", type: "string", description: "Accessible name for the grid." }
  ],
  defaults: { levels: 5, legend: !1, rows: 7, skeleton: !1, skeletonColumns: 12 },
  dimensions: {
    radius: o("radius-xs"),
    gap: o("space-1"),
    cell: o("space-4")
  },
  paint: { text: "$text-subtle" },
  tokens: [
    "surface-sunken",
    "border-subtle",
    "accent-9",
    "accent-border",
    "radius-xs",
    "space-1",
    "space-4",
    "hairline",
    "text-subtle"
  ],
  a11y: {
    role: "img",
    focusable: !1,
    notes: [
      'The grid is a single role="img" labelled by aria-label; the legend, when shown, describes it via aria-describedby.',
      "Every cell carries a native title and a visually-hidden text node so its date and value are legible to pointer and assistive tech.",
      "Colour is a redundant channel: the underlying value is always available as text, so intensity is not conveyed by hue alone."
    ]
  }
}, jp = {
  name: "Breadcrumbs",
  id: "breadcrumbs",
  category: "molecule",
  status: "stable",
  summary: "A compact path trail that shows where the current view sits in a hierarchy.",
  element: "nav",
  anatomy: [
    { name: "list", description: "The ordered breadcrumb trail.", required: !0 },
    { name: "item", description: "One crumb in the trail.", required: !0 },
    { name: "current", description: "The active crumb, rendered as the current page.", required: !0 }
  ],
  props: [
    { name: "items", type: "element", required: !0, description: "Breadcrumb entries, each with a label and optional link/current state." },
    { name: "separator", type: "element", default: "/", description: "Separator rendered between items." }
  ],
  defaults: { separator: "/" },
  // the links and separators paint
  paint: {},
  a11y: {
    role: "navigation",
    focusable: !1,
    notes: ["The component renders a nav landmark with an implicit Breadcrumb label."]
  }
}, Yp = {
  name: "Pagination",
  id: "pagination",
  category: "molecule",
  status: "stable",
  summary: "A compact navigator for moving between pages of results or content.",
  element: "nav",
  anatomy: [
    { name: "previous", description: "The previous-page control.", required: !0 },
    { name: "page", description: "A page-number button.", required: !0 },
    { name: "next", description: "The next-page control.", required: !0 }
  ],
  props: [
    { name: "page", type: "number", required: !0, description: "The current page number, one-based." },
    { name: "total", type: "number", required: !0, description: "Total number of rows or items across all pages." },
    { name: "pageSize", type: "number", default: 10, description: "Items shown per page." },
    { name: "onPageChange", type: "handler", required: !0, description: "Invoked with the clicked page number." },
    { name: "siblingCount", type: "number", default: 1, description: "How many pages to show around the active one." },
    { name: "boundaryCount", type: "number", default: 1, description: "How many pages to keep visible at the start and end for very large ranges." }
  ],
  defaults: { pageSize: 10, siblingCount: 1, boundaryCount: 1 },
  // the page buttons paint
  paint: {},
  a11y: {
    role: "navigation",
    focusable: !1,
    notes: ["The pager uses a nav landmark and exposes the current page through aria-current on the active button."]
  }
}, Vp = {
  name: "Accordion",
  id: "accordion",
  category: "molecule",
  status: "stable",
  summary: "A vertically stacked list of disclosure panels that expand to reveal content.",
  element: "div",
  anatomy: [
    { name: "trigger", description: "The header button that toggles an item.", required: !0 },
    { name: "content", description: "The panel shown when an item is open.", required: !0 }
  ],
  props: [
    { name: "items", type: "element", required: !0, description: "Accordion items with title, content, id, and optional disabled state." },
    { name: "defaultOpen", type: "element", description: "The initially open item or items." },
    { name: "allowMultiple", type: "boolean", default: !1, description: "Allows more than one panel to be open at a time." }
  ],
  defaults: { allowMultiple: !1 },
  // the item headers and panels paint
  paint: {},
  a11y: {
    role: "presentation",
    focusable: !1,
    keyboard: [{ keys: "Enter/Space", action: "Toggle the focused accordion item." }],
    notes: ["Each item uses a button trigger and exposes expanded state with aria-expanded."]
  }
}, Gp = {
  name: "Table",
  id: "table",
  category: "organism",
  status: "stable",
  summary: "A simple data table for rows of structured content.",
  element: "table",
  anatomy: [
    { name: "header", description: "The table header row.", required: !0 },
    { name: "row", description: "A table row containing cells.", required: !0 },
    { name: "cell", description: "A table cell.", required: !0 }
  ],
  props: [
    { name: "columns", type: "element", required: !0, description: "Column definitions for the header and cell rendering." },
    { name: "data", type: "element", required: !0, description: "Rows of data to render." },
    { name: "caption", type: "element", description: "Optional caption shown above the table." },
    { name: "emptyState", type: "element", description: "Content shown when there are no rows." }
  ],
  paint: { background: "$surface", text: "$text" },
  a11y: {
    role: "table",
    focusable: !1,
    notes: ["The table uses semantic thead/tbody/tr/th/td elements and a caption when provided."]
  }
}, Kp = ["left", "right", "bottom"], Up = ["sm", "md", "lg"], Xp = {
  name: "Drawer",
  id: "drawer",
  category: "organism",
  status: "draft",
  summary: "A modal sheet that enters from a viewport edge, traps focus, locks scrolling, and optionally dismisses from the backdrop or Escape.",
  element: "div",
  anatomy: [
    { name: "overlay", description: "The fixed, blurred backdrop behind the sheet; optionally dismisses the drawer on press." },
    { name: "panel", description: "The modal sheet surface that enters from the selected edge.", required: !0 },
    { name: "header", description: "Header row containing title/description and optional close action." },
    { name: "title", description: "Heading that labels the dialog via aria-labelledby." },
    { name: "description", description: "Muted supporting text linked through aria-describedby." },
    { name: "close", description: "Optional IconButton that dismisses the drawer." },
    { name: "body", description: "Scrollable main content slot." },
    { name: "footer", description: "Optional end-aligned action row." }
  ],
  props: [
    { name: "open", type: "boolean", required: !0, description: "Whether the drawer is mounted and shown." },
    { name: "onClose", type: "handler", required: !0, description: "Called by permitted dismissal paths and the close action." },
    { name: "title", type: "node", description: "Heading content that names the dialog." },
    { name: "description", type: "node", description: "Supporting content below the title." },
    { name: "side", type: "enum", values: Kp, default: "right", description: "Viewport edge from which the sheet enters." },
    { name: "size", type: "enum", values: Up, default: "md", description: "Maximum width step for left and right sheets." },
    { name: "floating", type: "boolean", description: "Detaches the sheet into a floating card with a gutter on every edge and all corners rounded. Unset, it follows the host layout: a root data-layout='floating' attribute floats every drawer; otherwise the sheet sits flush, edge to edge." },
    { name: "footer", type: "node", description: "Action row shown below the scrollable body." },
    { name: "dismissible", type: "boolean", default: !0, description: "Enables Escape, backdrop press, and the close action." },
    { name: "children", type: "node", description: "Drawer body content." }
  ],
  sizes: [
    { name: "sm", diameter: "22rem" },
    { name: "md", diameter: "28rem" },
    { name: "lg", diameter: "36rem" }
  ],
  defaults: { side: "right", size: "md", dismissible: !0 },
  dimensions: {
    gutter: o("space-3"),
    // floating mode only; the default is edge to edge
    radius: o("radius-2xl"),
    border: o("hairline"),
    headerPadding: o("space-6"),
    bodyPadding: o("space-6"),
    footerPadding: o("space-6"),
    footerGap: o("space-3")
  },
  states: [
    { name: "open", description: "The backdrop fades in and the panel enters from the selected side; body scrolling locks and focus moves into the panel.", tokens: { overlay: o("overlay"), background: o("glass-thick") } },
    {
      name: "dismissible",
      description: "Escape, overlay press, and the close action call onClose. Pure dismissal wiring - the sheet renders identically either way apart from the close button being present.",
      behavioral: !0
    },
    {
      name: "persistent",
      description: "Backdrop press and Escape do not dismiss the drawer and no close action is rendered; nothing repaints.",
      behavioral: !0
    }
  ],
  // The panel suppresses its own outline (.panel:focus-visible { outline: none };
  // focus is managed on open). The ring belongs to the interior controls - the
  // close IconButton and footer actions draw the kit-wide 2px focus-ring outline
  // at a 2px offset.
  paint: { background: "$glass-thick", text: "$text", border: "$glass-border" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  tokens: [
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "space-6",
    "space-8",
    "space-12",
    "overlay",
    "blur-sm",
    "blur-lg",
    "glass-thick",
    "glass-border",
    "glass-highlight",
    "glass-saturate",
    "hairline",
    "radius-2xl",
    "shadow-5",
    "border",
    "text",
    "font-sans",
    "focus-ring"
  ],
  a11y: {
    role: "dialog",
    focusable: !0,
    keyboard: [
      { keys: "Tab, Shift+Tab", action: "Cycles focus within the drawer while it is open." },
      { keys: "Escape", action: "Calls onClose when dismissible is true." }
    ],
    notes: [
      "Sets aria-modal=true and labels/describes itself from supplied title and description.",
      "Renders into document.body, locks body scrolling, restores focus to the opener, and traps Tab focus.",
      "When dismissible is false, Escape and overlay presses do nothing and the close action is omitted."
    ]
  },
  motion: {
    description: "The backdrop fades while the sheet springs from its selected edge; both become instant with reduced motion.",
    transition: { spring: "snappy" }
  }
}, Jp = ["neutral", "danger"], Qp = {
  name: "AlertDialog",
  id: "alert-dialog",
  category: "organism",
  status: "draft",
  summary: "A deliberate confirmation dialog that focuses its cancel action first and defaults to blocking accidental backdrop or Escape dismissal.",
  element: "div",
  anatomy: [
    { name: "overlay", description: "The fixed, blurred backdrop behind the confirmation dialog." },
    { name: "panel", description: "The centered alert dialog surface.", required: !0 },
    { name: "title", description: "Required heading that labels the alert dialog." },
    { name: "description", description: "Optional consequence text linked through aria-describedby." },
    { name: "body", description: "Optional custom supporting content." },
    { name: "cancel", description: "The least destructive action, focused first on open." },
    { name: "action", description: "The explicit confirmation action, optionally styled as dangerous." }
  ],
  props: [
    { name: "open", type: "boolean", required: !0, description: "Whether the alert dialog is mounted and shown." },
    { name: "onClose", type: "handler", required: !0, description: "Called by Cancel and permitted dismissal paths." },
    { name: "title", type: "node", required: !0, description: "Required heading content that names the alert dialog." },
    { name: "description", type: "node", description: "Supporting consequence text below the title." },
    { name: "actionLabel", type: "node", required: !0, description: "Visible label for the explicit confirmation action." },
    { name: "onAction", type: "handler", required: !0, description: "Called when the confirmation action is activated." },
    { name: "cancelLabel", type: "node", description: "Optional visible label for the cancel action." },
    { name: "tone", type: "enum", values: Jp, default: "neutral", description: "Semantic confirmation tone." },
    { name: "actionDisabled", type: "boolean", default: !1, description: "Disables the confirmation action." },
    { name: "actionLoading", type: "boolean", default: !1, description: "Shows a spinner and blocks the confirmation action." },
    { name: "dismissible", type: "boolean", default: !1, description: "Enables Escape and backdrop dismissal." },
    { name: "children", type: "node", description: "Optional content between the description and actions." }
  ],
  // Each tone paints the panel border and, through the Button it selects,
  // the confirmation action: neutral renders a solid Button (accent), danger
  // a danger Button. The action-* keys carry that Button's rendering.
  tones: [
    {
      name: "neutral",
      description: "Uses the standard glass border and a solid primary confirmation action.",
      paint: { border: o("glass-border") },
      tokens: { "action-background": o("accent-solid"), "action-text": o("accent-contrast"), "action-hover": o("accent-solid-hover") }
    },
    {
      name: "danger",
      description: "Uses a danger border and danger confirmation action for irreversible operations.",
      paint: { border: o("danger-border") },
      tokens: { "action-background": o("danger-solid"), "action-text": o("danger-contrast"), "action-hover": o("danger-solid-hover") }
    }
  ],
  defaults: { tone: "neutral", actionDisabled: !1, actionLoading: !1, dismissible: !1 },
  dimensions: {
    radius: o("radius-2xl"),
    border: o("hairline"),
    overlayPadding: o("space-6"),
    panelPadding: o("space-5"),
    footerGap: o("space-3")
  },
  states: [
    { name: "open", description: "The dialog fades and scales in; body scrolling locks and focus moves to Cancel.", tokens: { overlay: o("overlay"), background: o("glass-thick") } },
    { name: "danger", description: "The panel border recolors to danger (.danger { border-color }) and the confirmation action renders as a danger Button.", paint: { border: o("danger-border") }, tokens: { "action-background": o("danger-solid") } },
    {
      name: "action-disabled",
      description: "The confirmation Button dims to half opacity (opacity: 0.5, a literal - no token) with a not-allowed cursor and blocks activation; it is the accent-solid (danger tone: danger-solid) fill that dims.",
      tokens: { "action-background": o("accent-solid"), "danger-action-background": o("danger-solid") }
    },
    {
      name: "action-loading",
      description: "The confirmation Button shows a leading Spinner drawn in the action text color via currentColor and blocks activation.",
      tokens: { spinner: o("accent-contrast"), "danger-spinner": o("danger-contrast") }
    },
    {
      name: "dismissible",
      description: "Escape and overlay press call onClose when explicitly enabled. Pure dismissal wiring - nothing repaints.",
      behavioral: !0
    }
  ],
  // The panel suppresses its own outline (.panel:focus-visible { outline: none };
  // focus is managed onto Cancel on open). The ring belongs to the footer
  // Buttons, which draw the kit-wide 2px focus-ring outline at a 2px offset.
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  tokens: [
    "space-3",
    "space-4",
    "space-5",
    "space-6",
    "space-16",
    "overlay",
    "blur-sm",
    "blur-lg",
    "glass-thick",
    "glass-border",
    "glass-highlight",
    "glass-saturate",
    "hairline",
    "radius-2xl",
    "shadow-5",
    "text",
    "font-sans",
    "focus-ring",
    "accent-solid",
    "accent-solid-hover",
    "accent-contrast",
    "danger-border",
    "danger-solid",
    "danger-solid-hover",
    "danger-contrast"
  ],
  a11y: {
    role: "alertdialog",
    focusable: !0,
    keyboard: [
      { keys: "Tab, Shift+Tab", action: "Cycles focus within the dialog." },
      { keys: "Escape", action: "Calls onClose only when dismissible is true." },
      { keys: "Enter, Space", action: "Activates the focused Cancel or confirmation action." }
    ],
    notes: [
      "Sets role=alertdialog and aria-modal=true, with required title through aria-labelledby.",
      "Focus starts on the Cancel action to avoid accidental destructive confirmation.",
      "Backdrop and Escape dismissal are disabled by default; Cancel remains an explicit escape path.",
      "Renders into document.body, locks body scrolling, traps Tab focus, and restores focus to the opener on close."
    ]
  },
  motion: {
    description: "The overlay fades and the confirmation surface scales in; both become instant with reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, Zp = {
  name: "Spotlight",
  id: "spotlight",
  category: "molecule",
  status: "stable",
  summary: "A guided-tour step: a dimmed full-screen backdrop with a highlighted cutout around a target element, plus an anchored callout with a title, body, step count, and Back/Next/Close controls.",
  element: "div",
  anatomy: [
    { name: "backdrop", description: "The dimmed, full-screen scrim that catches a press to dismiss.", required: !0 },
    { name: "cutout", description: "The click-through highlighted ring punched around the target element.", required: !0 },
    { name: "callout", description: 'The portalled role="dialog" anchored to the target, flipping and clamping on screen.', required: !0 },
    { name: "title", description: "The step heading." },
    { name: "description", description: "The step body copy." },
    { name: "count", description: 'The current step over the total, e.g. "2 / 4".' },
    { name: "actions", description: "The Back and Next controls; a Close button sits in the corner." }
  ],
  props: [
    { name: "open", type: "boolean", required: !0, description: "Whether the tour step is shown." },
    { name: "targetRef", type: "element", required: !0, description: "Ref to the element to highlight; the cutout and callout are positioned against it." },
    { name: "title", type: "node", description: "Step heading." },
    { name: "description", type: "node", description: "Step body copy." },
    { name: "placement", type: "enum", values: Kr, default: "bottom", description: "Callout position relative to the target before flipping." },
    { name: "cutoutPadding", type: "number", default: 8, description: "Padding around the target inside the cutout, in pixels." },
    { name: "step", type: "number", description: "1-based index of this step." },
    { name: "total", type: "number", description: "Total number of steps in the tour." },
    { name: "onNext", type: "handler", description: "Advances to the next step; the Next button is hidden when omitted." },
    { name: "onBack", type: "handler", description: "Returns to the previous step; the Back button is hidden when omitted." },
    { name: "onClose", type: "handler", required: !0, description: "Dismisses the tour, via the close button, Escape, or a backdrop press." }
  ],
  defaults: { placement: "bottom", cutoutPadding: 8 },
  dimensions: {
    radius: o("radius-xl"),
    gap: o("space-2"),
    cutoutRadius: o("radius-lg")
  },
  // the ring belongs to the callout's Button/IconButton controls (2px
  // focus-ring outline, offset 2px); the callout itself takes programmatic
  // focus with its own outline suppressed
  // the portaled backdrop and callout paint
  paint: {},
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  // the cutout ring eases its box as it tracks between steps
  transition: { duration: o("duration-normal"), ease: o("ease-out") },
  a11y: {
    role: "dialog",
    focusable: !0,
    keyboard: [
      { keys: "Tab, Shift+Tab", action: "Cycles focus within the callout controls." },
      { keys: "Escape", action: "Dismisses the tour and restores focus to the opener." }
    ],
    notes: [
      'The callout is a role="dialog" with aria-modal that labels itself from the title and describes itself from the body.',
      'The step count is announced via aria-label, e.g. "Step 2 of 4".',
      "The highlighted target stays interactive: the cutout ring is click-through while the surrounding backdrop dismisses on press."
    ]
  },
  motion: {
    description: "The backdrop fades in and the callout scales and fades from the target edge; the cutout eases as it tracks between steps. Respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, ef = {
  name: "FloatingPanel",
  id: "floating-panel",
  category: "organism",
  status: "stable",
  summary: "A draggable, dismissable non-modal floating glass panel: a header grab-bar with a title and close button that you drag to move, portalled to the body and clamped to the viewport.",
  element: "div",
  anatomy: [
    { name: "panel", description: 'The portalled role="dialog" glass surface, positioned with fixed top/left.', required: !0 },
    { name: "handle", description: "The header grab-bar; a pointer-drag on it moves the panel.", required: !0 },
    { name: "title", description: "The heading shown in the grab-bar; labels the dialog.", required: !0 },
    { name: "close", description: "The trailing close IconButton that dismisses the panel.", required: !0 },
    { name: "body", description: "The scrollable content region beneath the handle." }
  ],
  props: [
    { name: "open", type: "boolean", required: !0, description: "Whether the panel is shown; it unmounts when false." },
    { name: "title", type: "node", required: !0, description: "Title rendered in the drag handle bar; labels the dialog." },
    { name: "onClose", type: "handler", required: !0, description: "Called when dismissed via the close button or Escape." },
    { name: "defaultPosition", type: "token", description: "Initial top-left position in viewport pixels ({ x, y }); defaults to { x: 24, y: 24 }." },
    { name: "className", type: "string", description: "Extra class names merged onto the panel." },
    { name: "children", type: "node", description: "The panel body content." }
  ],
  defaults: {},
  // fixed panel metrics; size does not vary
  dimensions: {
    minWidth: "16rem",
    maxWidth: "min(28rem, calc(100vw - 2rem))",
    maxHeight: "calc(100vh - 2rem)",
    radius: o("radius-lg"),
    border: o("hairline"),
    gap: o("space-3")
  },
  states: [
    {
      name: "open",
      description: "Panel mounts, portals to the body, and animates in at its position: a glass-thick surface with a glass-border hairline, glass-highlight inset, and shadow-4.",
      tokens: { background: o("glass-thick"), border: o("glass-border"), shadow: o("shadow-4") }
    },
    {
      name: "dragging",
      description: "A pointer-drag on the handle moves the panel, its position clamped inside the viewport. The only style delta is the handle cursor swapping grab to grabbing (literal values, .handle:active) - nothing repaints.",
      behavioral: !0
    },
    {
      name: "closed",
      description: "Panel unmounts on close; the page underneath is never blocked. Nothing is painted.",
      behavioral: !0
    }
  ],
  paint: { background: "$glass-thick", text: "$text", border: "$glass-border" },
  tokens: [
    "hairline",
    "glass-border",
    "radius-lg",
    "glass-thick",
    "blur-lg",
    "glass-saturate",
    "glass-highlight",
    "shadow-4",
    "border-subtle",
    "space-2",
    "space-3",
    "space-4",
    "font-size-sm",
    "text",
    "font-sans"
  ],
  a11y: {
    role: "dialog",
    focusable: !1,
    keyboard: [{ keys: "Escape", action: "Closes the panel." }],
    notes: [
      'The panel portals to document.body and renders as role="dialog" labelled by its title via aria-labelledby.',
      "Non-modal by design: it does not use aria-modal, lock body scroll, trap focus, or render an overlay - the page underneath stays interactive.",
      "The grab-bar carries a grab cursor and touch-action:none so pointer-drag works on touch without scrolling the page.",
      "Dragging is pointer-only; keyboard users cannot move the panel, but its position is never load-bearing."
    ]
  },
  motion: {
    description: "Panel fades and scales up on open; respects reduced motion by fading only.",
    transition: { speed: "Fast", ease: "Out" }
  }
}, tf = {
  name: "TabbedPanel",
  id: "tabbed-panel",
  category: "organism",
  status: "stable",
  summary: "A framed panel with a header row of tabs - each optionally carrying a count badge - plus a bounded content body that switches per active tab and an optional end slot for actions.",
  element: "div",
  anatomy: [
    { name: "panel", description: "The bordered, rounded frame wrapping the header and body.", required: !0 },
    { name: "header", description: "The top row holding the tab list and the optional actions slot.", required: !0 },
    { name: "tablist", description: 'The role="tablist" of role="tab" buttons that drive the body.', required: !0 },
    { name: "tab", description: 'A role="tab" button with a label and an optional CounterBadge count.' },
    { name: "actions", description: "An end-aligned slot for controls that act on the panel." },
    { name: "body", description: 'The role="tabpanel" content area for the active tab.', required: !0 }
  ],
  props: [
    { name: "tabs", type: "node", required: !0, description: "The tabs to show: { id, label, count?, content, disabled? }." },
    { name: "value", type: "string", description: "Controlled active tab id." },
    { name: "defaultValue", type: "string", description: "Initial active tab id when uncontrolled; defaults to the first enabled tab." },
    { name: "onValueChange", type: "handler", description: "Called with the id of the newly activated tab." },
    { name: "actions", type: "node", description: "Content rendered in the header end slot, e.g. a Button or Menu." },
    { name: "aria-label", type: "string", description: "Accessible name for the tab list." }
  ],
  defaults: {},
  dimensions: {
    radius: o("radius-xl"),
    gap: o("space-2"),
    border: o("hairline"),
    bodyPadding: o("space-5")
  },
  states: [
    { name: "hover", description: "A hovered, enabled tab strengthens its label from text-muted to text.", paint: { text: o("text") } },
    {
      name: "selected",
      description: "The active tab strengthens its label to text and carries the sliding accent underline (2px tall, a literal) on the header hairline; its count badge flips to the accent tone.",
      paint: { text: o("text") },
      tokens: { indicator: o("accent-solid") }
    },
    { name: "disabled", description: "A disabled tab fades its label to text-disabled with a not-allowed cursor and is skipped by arrow navigation.", paint: { text: o("text-disabled") } }
  ],
  // .tab:focus-visible and .body:focus-visible both draw a 2px focus-ring
  // outline inset by 2px (outline-offset: -2px) so it survives the panel's
  // overflow clipping.
  paint: { background: "$surface-raised", text: "$text", border: "$border-subtle" },
  focusRing: { ring: o("focus-ring"), offset: "-2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "hairline",
    "border-subtle",
    "radius-xl",
    "radius-md",
    "radius-sm",
    "radius-full",
    "surface",
    "surface-raised",
    "shadow-1",
    "text",
    "text-muted",
    "text-disabled",
    "font-sans",
    "font-size-sm",
    "font-weight-medium",
    "accent-solid",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "tablist",
    focusable: !0,
    keyboard: [
      { keys: "ArrowRight, ArrowLeft", action: "Moves to and activates the next or previous tab, wrapping and skipping disabled tabs." },
      { keys: "Home, End", action: "Activates the first or last enabled tab." },
      { keys: "Tab", action: "Moves focus from the active tab into the content body." }
    ],
    notes: [
      "Automatic activation: the panel body switches as focus moves between tabs.",
      "Each tab is aria-controls-linked to its panel, and the panel is aria-labelledby its tab.",
      "A tab count renders as a CounterBadge inside the tab button.",
      "Disabled tabs carry the disabled attribute and are skipped by arrow navigation."
    ]
  },
  motion: {
    description: "The active-tab underline slides between tabs as a shared layout element, and the body content fades and lifts on switch; both respect reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, nf = {
  name: "TabbedModal",
  id: "tabbed-modal",
  category: "organism",
  status: "stable",
  summary: "A settings-style dialog: a fixed left nav rail of sections beside a scrollable right pane that shows the active one. Composes Modal and lays out a vertical tablist and tabpanel.",
  element: "div",
  anatomy: [
    { name: "modal", description: 'The underlying Modal: a portalled role="dialog" with focus trap, scroll lock, and dismiss-on-Escape/overlay.', required: !0 },
    { name: "rail", description: 'The fixed, non-scrolling role="tablist" of section entries down the left edge.', required: !0 },
    { name: "railItem", description: 'A role="tab" entry with an optional leading icon; the selected one carries the sliding pill.' },
    { name: "pane", description: 'The scrollable role="tabpanel" that shows the active section content (overflow: auto).', required: !0 }
  ],
  props: [
    { name: "open", type: "boolean", required: !0, description: "Whether the dialog is shown." },
    { name: "onClose", type: "handler", required: !0, description: "Called when the user dismisses via Escape, the close button, or the overlay." },
    { name: "sections", type: "node", required: !0, description: "The sections { id, label, icon?, content, disabled? } listed in the rail; the active one fills the pane." },
    { name: "value", type: "string", description: "Controlled active section id." },
    { name: "defaultValue", type: "string", description: "Initial active section id when uncontrolled." },
    { name: "onValueChange", type: "handler", description: "Called with the next active section id." },
    { name: "title", type: "node", description: "Heading shown above the two panes." },
    { name: "footer", type: "node", description: "Action row passed through to the underlying Modal, rendered below both panes." }
  ],
  defaults: {},
  dimensions: {
    radius: o("radius-2xl"),
    gap: o("space-6"),
    rail: o("space-4")
  },
  states: [
    { name: "hover", description: "A hovered, enabled, non-active rail item washes with the hover token and strengthens its label from text-muted to text.", paint: { background: o("hover"), text: o("text") } },
    {
      name: "selected",
      description: "The active rail item recolors to accent-text at medium weight and carries the sliding accent-soft pill behind its content.",
      paint: { text: o("accent-text") },
      tokens: { indicator: o("accent-soft") }
    },
    { name: "disabled", description: "A disabled rail item dims to half opacity (opacity: 0.5, a literal - no token) with a not-allowed cursor and is skipped by arrow navigation." }
  ],
  // .railItem:focus-visible draws a 2px focus-ring outline inset by 2px
  // (outline-offset: -2px); the pane rings outward instead
  // (.pane:focus-visible, offset 2px) so its ring clears the scroll box.
  // composed of Modal chrome around a rail and pane
  paint: {},
  focusRing: { ring: o("focus-ring"), offset: "-2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-2",
    "space-3",
    "space-4",
    "space-6",
    "hairline",
    "border-subtle",
    "radius-md",
    "radius-sm",
    "hover",
    "text",
    "text-muted",
    "accent-text",
    "accent-soft",
    "font-sans",
    "font-size-sm",
    "font-weight-medium",
    "leading-sm",
    "leading-md",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "dialog",
    focusable: !0,
    keyboard: [
      { keys: "ArrowDown, ArrowUp", action: "Moves and activates the rail selection, wrapping and skipping disabled sections." },
      { keys: "Home, End", action: "Jumps to the first or last section." },
      { keys: "Tab", action: "Cycles focusable elements within the trapped dialog." },
      { keys: "Escape", action: "Closes the dialog and restores focus to the opener." }
    ],
    notes: [
      'The left rail is a vertical role="tablist" of role="tab" entries; the right pane is the matching role="tabpanel".',
      "Only the selected tab is in the tab order (roving tabindex); arrow keys move between the rest.",
      'Inherits the Modal dialog semantics: role="dialog", aria-modal, labelled by the title, focus trap, and scroll lock.'
    ]
  },
  motion: {
    description: "The dialog springs open via Modal; the rail pill slides between sections and the pane cross-fades on change. Respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, af = {
  name: "TabStrip",
  id: "tab-strip",
  category: "organism",
  status: "stable",
  summary: "A horizontal strip of closable document tabs - like editor or browser tabs - with a springing active indicator, horizontal overflow scrolling, and a per-tab close button.",
  element: "div",
  anatomy: [
    { name: "strip", description: 'The role="tablist" container that scrolls horizontally when its tabs overflow.', required: !0 },
    { name: "tab", description: 'A role="tab" button with an optional leading icon, a label, and a trailing close control.', required: !0 },
    { name: "icon", description: "Optional leading glyph inside a tab." },
    { name: "close", description: "The per-tab close (×) control inside the tab; clicking it reports the tab id to onClose." },
    { name: "indicator", description: "The shared springing underline under the active tab." }
  ],
  props: [
    { name: "tabs", type: "node", required: !0, description: "The tab descriptors: { id, label, icon? }." },
    { name: "value", type: "string", description: "Controlled active tab id." },
    { name: "defaultValue", type: "string", description: "Initial active tab id when uncontrolled; defaults to the first tab." },
    { name: "onValueChange", type: "handler", description: "Called with the id of the tab that becomes active." },
    { name: "onClose", type: "handler", description: "Called with the id of the tab whose close button is pressed." },
    { name: "spring", type: "enum", values: ["snappy", "smooth", "bouncy", "gentle"], default: "snappy", description: "Spring preset for the active indicator." },
    { name: "showScrollbar", type: "boolean", default: !1, description: "Shows the horizontal scrollbar beneath overflowing tabs; hidden by default so the baseline hairline stays flush." },
    { name: "aria-label", type: "string", description: "Accessible name for the strip." }
  ],
  defaults: { spring: "snappy", showScrollbar: !1 },
  dimensions: {
    radius: o("radius-md"),
    gap: o("space-1"),
    paddingInline: o("space-3"),
    paddingBlock: o("space-2")
  },
  states: [
    { name: "hover", description: "A hovered tab washes to the hover background and full text color; the hovered close control washes to the active background.", paint: { background: o("hover"), text: o("text") } },
    { name: "selected", description: "The active tab keeps a transparent fill but takes the full text color, lifts its icon to text-muted, and carries the 2px accent-solid underline indicator.", paint: { text: o("text") }, tokens: { icon: o("text-muted"), indicator: o("accent-solid") } },
    { name: "close-hover", description: "The per-tab close control washes to the active background with full text color on hover.", paint: { background: o("active"), text: o("text") } },
    { name: "overflowing", description: "With showScrollbar, an overflowing strip reserves a space-2 band beneath the tabs, hides its real border-bottom, and repaints the baseline hairline as a border-subtle gradient at the tab baseline; the scrollbar thumb is border, border-strong on hover.", tokens: { baseline: o("border-subtle"), thumb: o("border"), "thumb-hover": o("border-strong") } }
  ],
  // 2px focus-ring outline inset into the tab (outline-offset: -2px)
  paint: { border: "$border-subtle" },
  focusRing: { ring: o("focus-ring"), offset: "-2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "hairline",
    "border-subtle",
    "border",
    "border-strong",
    "font-sans",
    "font-size-sm",
    "font-weight-medium",
    "radius-md",
    "radius-sm",
    "radius-full",
    "text",
    "text-muted",
    "text-subtle",
    "hover",
    "active",
    "accent-solid",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "tablist",
    focusable: !0,
    keyboard: [
      { keys: "ArrowLeft, ArrowRight", action: "Moves the active tab to the previous or next tab, wrapping around the ends." },
      { keys: "Home, End", action: "Activates the first or last tab." },
      { keys: "Delete, Backspace", action: "Closes the focused tab, reporting its id to onClose." }
    ],
    notes: [
      'The strip is a role="tablist" of role="tab" buttons; only the active tab is in the tab order (roving tabindex).',
      'The per-tab close control is a non-focusable role="button" labelled "Close <label>"; its click is stopped from also activating the tab. Keyboard users close the focused tab with Delete or Backspace.',
      "Reordering tabs by drag is out of scope for v1."
    ]
  },
  motion: {
    description: "The active-tab underline is a shared layout element that springs between tabs; respects reduced motion.",
    transition: { spring: "snappy" }
  }
}, of = {
  name: "TreeView",
  id: "tree-view",
  category: "organism",
  status: "stable",
  summary: "A hierarchical list of expandable rows - like a file explorer or a chapter outline - with animated branches, single selection, and full WAI-ARIA tree keyboard navigation.",
  element: "ul",
  anatomy: [
    { name: "tree", description: 'The role="tree" root list that owns the roving tabindex.', required: !0 },
    { name: "row", description: 'A role="treeitem" row: chevron slot, optional icon, label, optional trailing slot; indented by its depth.', required: !0 },
    { name: "chevron", description: "The rotating disclosure glyph on parent rows; leaf rows keep the empty slot so labels align." },
    { name: "icon", description: "Optional leading glyph inside a row." },
    { name: "trailing", description: "Optional trailing content inside a row, such as a counter." },
    { name: "group", description: 'The role="group" branch list a parent expands; animates its height open and closed.' }
  ],
  props: [
    {
      name: "items",
      type: "array",
      required: !0,
      description: "The tree rows, nested via children.",
      item: {
        type: "object",
        description: "One row of the tree.",
        fields: [
          { name: "id", type: "string", required: !0, description: "Unique id for the row, reported by selection and expansion." },
          { name: "label", type: "node", required: !0, description: "Content rendered as the row label." },
          { name: "icon", type: "node", description: "Leading glyph, hidden from assistive tech." },
          { name: "trailing", type: "node", description: "Trailing content such as a counter badge." },
          { name: "disabled", type: "boolean", description: "Skipped by arrow navigation and unselectable." },
          { name: "children", type: "array", description: "Child rows; their presence makes the row an expandable parent.", item: { type: "object", description: "A nested row with the same shape." } }
        ]
      }
    },
    { name: "expandedIds", type: "array", description: "Controlled list of expanded parent ids.", item: { type: "string", description: "An expanded parent id." } },
    { name: "defaultExpandedIds", type: "array", description: "Initially expanded parent ids when uncontrolled.", item: { type: "string", description: "An expanded parent id." } },
    { name: "onExpandedChange", type: "handler", description: "Called with the next full list of expanded ids whenever a parent toggles." },
    { name: "selectedId", type: "string", description: "Controlled selected row id (single-select)." },
    { name: "defaultSelectedId", type: "string", description: "Initially selected row id when uncontrolled." },
    { name: "onSelect", type: "handler", description: "Called with the id of the row that becomes selected." },
    { name: "aria-label", type: "string", required: !0, description: "Accessible name for the tree." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material behind the tree." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the component exact geometry." }
  ],
  defaults: { glass: !1, skeleton: !1 },
  dimensions: {
    radius: o("radius-md"),
    gap: o("space-2"),
    paddingInline: o("space-3"),
    paddingBlock: o("space-1"),
    indent: o("space-4")
  },
  states: [
    { name: "selected", description: "The single selected row wears the accent soft tint with accent text at medium weight; its chevron inherits the accent text color.", paint: { background: o("accent-soft"), text: o("accent-text") }, tokens: { weight: o("font-weight-medium") } },
    { name: "hover", description: "Pointer over an enabled, unselected row washes to the hover background and full text color.", paint: { background: o("hover"), text: o("text") } },
    { name: "disabled", description: "Halved opacity (0.5), not-allowed cursor, skipped by arrow navigation, and unselectable." }
  ],
  // 2px focus-ring outline inset into the row (outline-offset: -2px), painted
  // on the row rather than the whole subtree the li owns
  paint: { text: "$text-muted" },
  focusRing: { ring: o("focus-ring"), offset: "-2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "font-sans",
    "font-size-sm",
    "font-weight-medium",
    "radius-md",
    "radius-lg",
    "hairline",
    "text",
    "text-muted",
    "text-subtle",
    "hover",
    "accent-soft",
    "accent-text",
    "glass-regular",
    "glass-border",
    "glass-highlight",
    "blur-md",
    "glass-saturate",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "tree",
    focusable: !0,
    keyboard: [
      { keys: "ArrowDown, ArrowUp", action: "Moves focus to the next or previous visible row, skipping disabled rows." },
      { keys: "ArrowRight", action: "Expands a collapsed parent; on an expanded parent, moves focus to its first child." },
      { keys: "ArrowLeft", action: "Collapses an expanded parent; otherwise moves focus to the parent row." },
      { keys: "Home, End", action: "Moves focus to the first or last visible row." },
      { keys: "Enter, Space", action: "Selects the focused row; on a parent row, also toggles its expansion." }
    ],
    notes: [
      'The root is a role="tree" list of role="treeitem" rows with role="group" branch lists; parents expose aria-expanded and every row carries aria-level, aria-setsize, and aria-posinset.',
      "One roving tabindex spans the visible rows: exactly one row sits in the tab order, initially the selected row or the first enabled row.",
      "Selection is single-select and reported through aria-selected; disabled rows are dimmed, skipped by arrows, and unselectable.",
      "Clicking a parent row both toggles its branch and selects it."
    ]
  },
  motion: {
    description: "Branches animate their height open and closed and the chevron rotates on a token transition; respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, sf = {
  name: "TitleBar",
  id: "title-bar",
  category: "structure",
  status: "stable",
  summary: "The desktop window bar for Tauri and Electron shells: it owns window dragging, centers a one-line title, and can reserve the macOS traffic-light gutter.",
  element: "header",
  anatomy: [
    { name: "gutter", description: "Optional 88px inline-start inset reserved for the macOS close, minimize, and zoom buttons an overlay window paints there." },
    { name: "start", description: "Leading slot after the gutter, for a back control or an app menu. Its controls stay clickable." },
    { name: "center", description: "The centered middle: the one-line title plus any extra content such as a search field.", required: !0 },
    { name: "end", description: "Trailing slot for window-level actions. Its controls stay clickable." }
  ],
  props: [
    { name: "title", type: "node", description: "One-line centered title, small and muted. It truncates instead of wrapping." },
    { name: "start", type: "node", description: "Content pinned to the start, after the traffic-light gutter." },
    { name: "end", type: "node", description: "Content pinned to the end, such as window-level actions." },
    {
      name: "trafficLightInset",
      type: "boolean",
      default: !1,
      description: "Reserve an 88px inline-start gutter for the macOS window controls that a titleBarStyle Overlay window paints over the bar."
    },
    { name: "surface", type: "boolean", default: !0, description: "The translucent glass background with backdrop blur, like the app header." },
    { name: "border", type: "boolean", default: !0, description: "A bottom hairline separating the bar from the window content." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact bar geometry." },
    { name: "children", type: "node", description: "Extra centered content beside the title, such as a search field." }
  ],
  defaults: { trafficLightInset: !1, surface: !0, border: !0, skeleton: !1 },
  // the height sits off the space scale on purpose: window chrome must not
  // breathe with density, so it is a fixed 3.25rem (52px)
  dimensions: {
    height: "3.25rem",
    paddingInline: o("space-3"),
    gap: o("space-3"),
    slotGap: o("space-2"),
    trafficLightInset: "88px",
    border: o("hairline")
  },
  states: [
    { name: "surface", description: "Paints the translucent glass-thin background with a blur-md, glass-saturate backdrop filter.", paint: { background: o("glass-thin") }, tokens: { blur: o("blur-md"), saturate: o("glass-saturate") } },
    { name: "border", description: "Adds the hairline border-subtle bottom rule.", paint: { border: o("border-subtle") } },
    {
      name: "trafficLightInset",
      description: "Pads the inline start by the fixed 88px gutter (padding-inline-start: 88px) so content clears the macOS window controls. Pure layout - it moves content without repainting anything, so behavioral is the closest schema fit.",
      behavioral: !0
    }
  ],
  // the glass surface paints via a state; the centered title inherits text
  paint: {},
  tokens: [
    "font-sans",
    "font-size-sm",
    "font-weight-medium",
    "text-muted",
    "space-2",
    "space-3",
    "hairline",
    "border-subtle",
    "glass-thin",
    "blur-md",
    "glass-saturate"
  ],
  a11y: {
    role: "banner",
    notes: [
      "The bar is a banner landmark by default; pass a role to override it when the window already has one.",
      "The bar and the title carry data-tauri-drag-region so the window drags from them; slot controls do not, so they keep receiving clicks.",
      "Give an icon-only control in the start or end slot an aria-label; the bar adds no labels of its own.",
      "Text selection is disabled on the bar because it is window chrome; never put body copy in it."
    ]
  }
}, rf = ["horizontal", "vertical"], lf = ["snappy", "smooth", "bouncy"], cf = {
  name: "NavBar",
  id: "nav-bar",
  category: "structure",
  status: "stable",
  summary: "An app-level primary navigation bar: a horizontal row for top navs and tab bars, or a slim vertical icon rail, with a sliding active pill.",
  element: "nav",
  anatomy: [
    {
      name: "items",
      description: "The main run of NavBarItem controls: leading in horizontal orientation, top-aligned in vertical.",
      required: !0
    },
    {
      name: "end",
      description: "Pinned to the far end (the trailing edge when horizontal, the bottom when vertical), for a settings item."
    },
    { name: "item", description: "NavBarItem: an icon-first control with an accessible label, an optional badge, and the active pill." },
    { name: "icon", description: "Required leading glyph, hidden from assistive tech; the label is the accessible name." },
    {
      name: "label",
      description: "The required accessible item label. By default it appears in a tooltip; showLabels renders it beside horizontal icons."
    },
    {
      name: "badge",
      description: "Optional CounterBadge: pinned to the top-right corner of the icon square in vertical, inline after the label in horizontal."
    },
    { name: "indicator", description: "The active pill: one layout element that slides between items behind the item content." }
  ],
  props: [
    {
      name: "orientation",
      type: "enum",
      values: rf,
      default: "horizontal",
      description: "Horizontal row for a top nav or bottom tab bar; vertical for a slim icon rail."
    },
    {
      name: "aria-label",
      type: "string",
      required: !0,
      description: "Accessible name for the nav landmark. Required: apps often render more than one navigation landmark."
    },
    { name: "end", type: "node", description: "Content pinned to the far end: bottom when vertical, trailing edge when horizontal." },
    { name: "showLabels", type: "boolean", default: !1, description: "Shows item labels beside icons in horizontal orientation." },
    {
      name: "spring",
      type: "enum",
      values: lf,
      default: "snappy",
      description: "Spring preset for the active pill as it slides between items."
    },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "children", type: "node", description: "The run of NavBarItem controls." }
  ],
  defaults: { orientation: "horizontal", showLabels: !1, spring: "snappy", skeleton: !1 },
  // the rail is the space-12 step of the scale (the classic slim ~3.5rem rail);
  // items are control-height-md squares in vertical and control-height-md tall in horizontal
  dimensions: {
    railSize: o("space-12"),
    itemSize: o("control-height-md"),
    gap: o("space-1"),
    padding: o("space-2"),
    itemPaddingInline: o("space-3"),
    radius: o("radius-md")
  },
  states: [
    {
      name: "hover",
      description: "A non-active item washes to the hover background and full text color; active items keep the pill instead.",
      paint: { background: o("hover"), text: o("text") }
    },
    {
      name: "focus-visible",
      description: "A 2px inset accent ring outlines the focused item.",
      tokens: { ring: o("focus-ring") }
    },
    {
      name: "active",
      description: "The current item shows the sliding accent-soft pill behind it and takes accent text at medium weight; aria-current is page.",
      paint: { background: o("accent-soft"), text: o("accent-text") },
      tokens: { weight: o("font-weight-medium") }
    },
    { name: "disabled", description: "Halved opacity, not-allowed cursor, and hover suppressed." }
  ],
  // 2px focus-ring outline inset into the item (outline-offset: -2px)
  // the nav items paint
  paint: {},
  focusRing: { ring: o("focus-ring"), offset: "-2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "font-sans",
    "space-1",
    "space-2",
    "space-3",
    "space-12",
    "control-height-md",
    "radius-md",
    "font-size-sm",
    "font-weight-medium",
    "text",
    "text-muted",
    "hover",
    "accent-soft",
    "accent-text",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "navigation",
    focusable: !0,
    notes: [
      "The root is a nav landmark; aria-label is a required prop so multiple navigation landmarks stay distinguishable.",
      'NavBarItem renders a button by default, or an anchor when given as="a" with an href.',
      "Labels are accessible names and tooltip content by default. showLabels renders them visibly beside horizontal icons.",
      'The active item sets aria-current="page"; a disabled item sets aria-disabled and drops the hover wash.',
      "Item icons and the active pill are aria-hidden; the label is always the accessible name."
    ]
  },
  motion: {
    description: "The active pill is a shared layout element that slides between items on the chosen spring; item colors ease on hover. Both respect reduced motion.",
    transition: { spring: "snappy" }
  }
}, df = ["horizontal", "vertical"], uf = {
  name: "ResizableSplitPane",
  id: "resizable-split-pane",
  category: "organism",
  status: "stable",
  summary: "A container that splits into two panes with a draggable divider: horizontal or vertical, min/max clamped, double-click to reset, and a controlled-or-uncontrolled ratio a consumer can persist.",
  element: "div",
  anatomy: [
    { name: "root", description: "The grid container sizing the start pane by a ratio of the whole.", required: !0 },
    { name: "start", description: "The first pane; its size is the ratio.", required: !0 },
    { name: "divider", description: 'The role="separator" drag handle between the panes.', required: !0 },
    { name: "end", description: "The second pane; it fills the remaining space.", required: !0 }
  ],
  props: [
    { name: "children", type: "node", required: !0, description: "Exactly two children: the start pane and the end pane." },
    { name: "orientation", type: "enum", values: df, default: "horizontal", description: "Split direction; horizontal is side by side, vertical is stacked." },
    { name: "ratio", type: "number", description: "Controlled start-pane fraction of the container, 0–1." },
    { name: "defaultRatio", type: "number", default: 0.5, description: "Initial start-pane fraction when uncontrolled." },
    { name: "onRatioChange", type: "handler", description: "Called with the next ratio on drag, keyboard step, or reset." },
    { name: "min", type: "number", default: 0.1, description: "Smallest start-pane fraction the divider can reach." },
    { name: "max", type: "number", default: 0.9, description: "Largest start-pane fraction the divider can reach." },
    { name: "resetRatio", type: "number", description: "Fraction the divider snaps back to on double-click; defaults to defaultRatio." },
    { name: "step", type: "number", default: 0.02, description: "Fraction the divider moves per arrow-key press." },
    { name: "aria-label", type: "string", description: "Accessible name for the divider." }
  ],
  defaults: { orientation: "horizontal", defaultRatio: 0.5, min: 0.1, max: 0.9, step: 0.02 },
  dimensions: {
    radius: o("radius-lg"),
    thickness: o("hairline"),
    gripHeight: o("space-6")
  },
  states: [
    { name: "hover", description: "The hairline divider fills to accent-solid and reveals its grip pill (a white 6px-thick pill, opacity 0 to 1); dragging holds this paint via pointer capture.", paint: { background: o("accent-solid") } },
    { name: "focus-visible", description: "Same accent-solid fill and grip reveal as hover, plus the 2px focus-ring outline offset 1px.", paint: { background: o("accent-solid") }, tokens: { ring: o("focus-ring") } },
    { name: "clamped", description: "During a drag, a medium haptic tick fires once each time the split reaches its min or max clamp and re-arms when it leaves the bound; no paint change.", behavioral: !0 }
  ],
  // 2px focus-ring outline offset 1px around the divider hairline
  paint: { background: "$surface", text: "$text" },
  focusRing: { ring: o("focus-ring"), offset: "1px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "radius-lg",
    "radius-full",
    "hairline",
    "space-1",
    "space-6",
    "surface",
    "text",
    "font-sans",
    "border-subtle",
    "accent-solid",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "separator",
    focusable: !0,
    keyboard: [
      { keys: "ArrowLeft, ArrowRight", action: "Moves a horizontal divider toward the start or end by one step." },
      { keys: "ArrowUp, ArrowDown", action: "Moves a vertical divider toward the start or end by one step." },
      { keys: "Home, End", action: "Jumps the divider to its min or max clamp." }
    ],
    notes: [
      'The divider is a role="separator" with aria-orientation and aria-valuemin/valuemax/valuenow expressed as percentages.',
      "Double-clicking the divider resets the ratio to resetRatio (or defaultRatio).",
      "Sizes are clamped to [min, max] on every drag, keyboard step, and reset.",
      'During a drag, a medium haptic tick fires once each time the split reaches its min or max clamp and re-arms when it leaves the bound; data-haptic="none" on the pane opts out.'
    ]
  },
  motion: {
    description: "The divider and its grip cross-fade on hover and focus; the resize itself is instant. Respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, hf = {
  name: "Icon",
  id: "icon",
  category: "atom",
  status: "stable",
  summary: "A single-glyph SVG drawn on a 24-unit grid that sizes from a pixel prop, strokes at a shared width, and inherits currentColor from the text around it.",
  element: "svg",
  anatomy: [
    {
      name: "glyph",
      description: "The stroked paths of one icon, drawn on the shared 24 by 24 grid.",
      required: !0
    },
    {
      name: "backfill",
      description: "Optional IconBackfill wrapper: a 33%-opacity silhouette of the glyph itself, painted from the resolved icon color."
    }
  ],
  props: [
    { name: "size", type: "number", default: 24, description: "Rendered width and height in pixels; the glyph scales from the 24-unit grid." },
    { name: "color", type: "string", default: "currentColor", description: "Stroke color; the default inherits the surrounding text color." },
    { name: "strokeWidth", type: "number", default: 2, description: "Stroke width in grid units, shared across the set for a consistent weight." },
    { name: "backfill", type: "boolean", default: !1, description: "Wraps the glyph in IconBackfill, adding a 33%-opacity silhouette in the same resolved icon color." },
    {
      name: "absoluteStrokeWidth",
      type: "boolean",
      default: !1,
      description: "Keeps the stroke at its pixel width instead of scaling it with size, so small renders do not thin out."
    },
    { name: "aria-label", type: "string", description: "Accessible name for a meaningful icon; decorative icons should be aria-hidden by the host instead." }
  ],
  sizes: [
    { name: "sm", diameter: "16px" },
    { name: "md", diameter: "20px" },
    { name: "lg", diameter: "24px" }
  ],
  defaults: { size: 24, color: "currentColor", strokeWidth: 2, backfill: !1, absoluteStrokeWidth: !1 },
  dimensions: { strokeWidth: "2px", backfillOpacity: "33%" },
  // strokes currentColor, so it carries no paint of its own
  paint: {},
  tokens: [],
  a11y: {
    focusable: !1,
    notes: [
      "Icons are decorative by default: hosts wrap them in an aria-hidden slot so the label text carries the meaning.",
      'A standalone meaningful icon needs role="img" plus an aria-label.'
    ]
  }
}, mf = ["cover", "contain", "fill", "none", "scale-down"], pf = ["none", "sm", "md", "lg", "xl", "2xl", "full"], ff = {
  name: "Image",
  id: "image",
  category: "atom",
  status: "stable",
  summary: "A framed image with a fixed aspect ratio: it holds its box while loading, fits with object-fit, rounds its corners, and falls back on error.",
  element: "img",
  anatomy: [
    { name: "frame", description: "The aspect-ratio box that clips and rounds the image.", required: !0 },
    { name: "image", description: "The image element itself.", required: !0 },
    { name: "fallback", description: "Shown when the source fails to load." }
  ],
  props: [
    { name: "src", type: "string", required: !0, description: "Image source URL." },
    { name: "alt", type: "string", required: !0, description: "Alternative text; pass an empty string for decorative images." },
    { name: "aspectRatio", type: "string", description: 'Aspect ratio of the frame, e.g. "2 / 3" for a cover or 1 for a square (a number is allowed).' },
    { name: "fit", type: "enum", values: mf, default: "cover", description: "How the image fills its frame (object-fit)." },
    { name: "radius", type: "enum", values: pf, default: "md", description: "Corner radius from the radius scale." },
    { name: "fallback", type: "node", description: "Rendered when the image fails to load; defaults to a muted broken-image glyph." },
    { name: "skeleton", type: "boolean", default: !1, description: "Render a placeholder with the frame geometry." },
    { name: "loading", type: "enum", values: ["lazy", "eager"], default: "lazy", description: "Native lazy/eager loading hint." }
  ],
  defaults: { fit: "cover", radius: "md", skeleton: !1, loading: "lazy" },
  paint: { background: "$surface-sunken" },
  tokens: [
    "surface-sunken",
    "text-subtle",
    "duration-normal",
    "ease-out",
    "radius-none",
    "radius-sm",
    "radius-md",
    "radius-lg",
    "radius-xl",
    "radius-2xl",
    "radius-full"
  ],
  a11y: {
    notes: [
      "alt is required; pass an empty string for purely decorative images.",
      "While the source loads a skeleton holds the frame; on error a muted broken-image glyph replaces it."
    ]
  }
}, gf = Dn, bf = {
  name: "Rating",
  id: "rating",
  category: "atom",
  status: "stable",
  summary: "A star rating: an interactive native radio group by default, or a read-only display that supports fractional fill.",
  element: "span",
  anatomy: [
    { name: "star", description: "One star cell; its filled portion is clipped to the value.", required: !0 }
  ],
  props: [
    { name: "value", type: "number", description: "Controlled rating value, 0 to max." },
    { name: "defaultValue", type: "number", description: "Initial value when uncontrolled." },
    { name: "max", type: "number", default: 5, description: "Number of stars." },
    { name: "onChange", type: "handler", description: "Called with the new value when the user picks a star." },
    { name: "readOnly", type: "boolean", default: !1, description: "Display-only; renders fractional fill and no controls." },
    { name: "disabled", type: "boolean", default: !1, description: "Dim and disable interaction." },
    { name: "size", type: "enum", values: gf, default: "md", description: "Star size step." },
    { name: "skeleton", type: "boolean", default: !1, description: "Render a placeholder: one star-shaped shimmer bone per star, in the live size and gap." },
    { name: "aria-label", type: "string", description: "Accessible name for the rating group." }
  ],
  sizes: [
    { name: "sm", fontSize: "0.9375rem" },
    { name: "md", fontSize: "1.125rem" },
    { name: "lg", fontSize: "1.5rem" }
  ],
  defaults: { max: 5, readOnly: !1, disabled: !1, size: "md", skeleton: !1 },
  dimensions: { gap: "0.1em" },
  states: [
    { name: "active", description: "The pressed star scales to 0.9, easing there on the fast duration.", tokens: { duration: o("duration-fast"), ease: o("ease-out") } },
    { name: "focus-visible", description: "Keyboard focus on a star's hidden radio draws a 2px accent-solid outline around the cell, rounded to radius-sm, with a 2px offset.", tokens: { ring: o("accent-solid"), radius: o("radius-sm") } },
    { name: "haptic", description: 'Scrubbing the pointer across the stars fires a selection tick each time the previewed star changes (the preview falling back to the committed value on pointer leave is silent), committing a value with a click fires light, and keyboard arrows tick selection per change; data-haptic="none" opts the rating out.', behavioral: !0 }
  ],
  // a 2px outline on the focused star cell; it paints accent-solid, not the shared focus-ring token
  paint: { text: "$warning-solid" },
  focusRing: { ring: o("accent-solid"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: ["warning-solid", "border-strong", "accent-solid", "radius-sm", "duration-fast", "ease-out"],
  a11y: {
    role: "radiogroup",
    focusable: !0,
    keyboard: [
      { keys: "ArrowRight / ArrowUp", action: "Move to and select the next star." },
      { keys: "ArrowLeft / ArrowDown", action: "Move to and select the previous star." }
    ],
    notes: [
      "Interactive ratings are a native radio group, so arrow-key selection and form participation come for free.",
      'Provide an aria-label to name the group. Read-only ratings expose role="img" with the value as their label.'
    ]
  }
}, yf = ["numeric", "alphanumeric"], vf = {
  name: "OtpField",
  id: "otp-field",
  category: "atom",
  status: "stable",
  summary: "A one-time passcode entry: a row of character cells driven by one invisible native input, so typing, paste, and platform code autofill behave natively while the caret blinks in the next empty cell.",
  element: "div",
  anatomy: [
    { name: "input", description: 'The real text input stretched invisibly across the cells; it owns focus, editing, and autocomplete="one-time-code".', required: !0 },
    { name: "cells", description: "The visual row of code cells, pinned left-to-right in every locale and hidden from assistive tech.", required: !0 },
    { name: "cell", description: "One character box; the active cell carries the focus ring.", required: !0 },
    { name: "caret", description: "A blinking bar in the next empty cell while the field has focus." },
    { name: "separator", description: "A short dash between digit groups when groupSize is set." }
  ],
  props: [
    { name: "length", type: "number", default: 6, description: "Number of code characters." },
    { name: "value", type: "string", description: "Controlled code value." },
    { name: "defaultValue", type: "string", description: "Initial value when uncontrolled." },
    { name: "onValueChange", type: "handler", description: "Called with the sanitized code on every change." },
    { name: "onComplete", type: "handler", description: "Called with the full code when the last cell fills." },
    { name: "type", type: "enum", values: yf, default: "numeric", description: "Which characters the code accepts; everything else is stripped on entry." },
    { name: "masked", type: "boolean", default: !1, description: "Renders dots instead of the entered characters." },
    { name: "groupSize", type: "number", description: "Draws a separator dash after every N cells, e.g. 3 for a 123-456 code." },
    { name: "size", type: "enum", values: ["sm", "md", "lg"], default: "md", description: "Cell size step." },
    { name: "disabled", type: "boolean", default: !1, description: "Blocks input and dims the cells." },
    { name: "error", type: "boolean", default: !1, description: "Paints the invalid treatment and sets aria-invalid on the input." },
    { name: "autoFocus", type: "boolean", default: !1, description: "Focuses the field on mount." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the frosted glass material instead of a solid surface." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders placeholders with the exact cell geometry." },
    { name: "aria-label", type: "string", description: 'Accessible name for the input; defaults to the localized "One-time code".' }
  ],
  sizes: [
    { name: "sm", height: o("control-height-sm"), fontSize: o("font-size-sm"), gap: o("space-2"), radius: o("radius-md") },
    { name: "md", height: o("control-height-md"), fontSize: o("font-size-md"), gap: o("space-2"), radius: o("radius-md") },
    { name: "lg", height: o("control-height-lg"), fontSize: o("font-size-lg"), gap: o("space-2"), radius: o("radius-md") }
  ],
  defaults: {
    length: 6,
    type: "numeric",
    masked: !1,
    size: "md",
    disabled: !1,
    error: !1,
    autoFocus: !1,
    glass: !1,
    skeleton: !1
  },
  dimensions: { border: o("hairline") },
  states: [
    { name: "hover", description: "Hovering the field strengthens the border of every inactive cell.", paint: { border: o("border-strong") } },
    {
      name: "focus",
      description: "While the real input has focus, the active cell (the next empty one) takes the focus-ring border with a 3px accent-soft glow.",
      tokens: { border: o("focus-ring"), ring: o("accent-soft") }
    },
    { name: "disabled", description: "Cells drop to half opacity on the sunken surface; the input blocks entry with a not-allowed cursor.", paint: { background: o("surface-sunken") } },
    {
      name: "error",
      description: "Every cell border turns danger; the active cell deepens to danger-solid with a 3px danger-soft glow, mirroring the Input aria-invalid treatment.",
      paint: { border: o("danger-border") },
      tokens: { "active-border": o("danger-solid"), "active-ring": o("danger-soft") }
    }
  ],
  // a 3px accent-soft glow hugging the active cell border, which itself turns focus-ring
  paint: { background: "$surface", text: "$text", border: "$border" },
  focusRing: { ring: o("accent-soft"), offset: "0" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "surface",
    "surface-sunken",
    "border",
    "border-strong",
    "hairline",
    "radius-md",
    "radius-full",
    "space-2",
    "font-mono",
    "font-size-sm",
    "font-size-md",
    "font-size-lg",
    "control-height-sm",
    "control-height-md",
    "control-height-lg",
    "text",
    "focus-ring",
    "accent-soft",
    "danger-border",
    "danger-solid",
    "danger-soft",
    "glass-regular",
    "glass-border",
    "blur-sm",
    "glass-saturate",
    "glass-highlight",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    focusable: !0,
    notes: [
      'One real text input carries focus, editing, and autocomplete="one-time-code", so SMS and password-manager code autofill work natively.',
      "The visual cells are aria-hidden presentation; the input value is the single source of truth.",
      'The input is named by aria-label, defaulting to the localized "One-time code"; error mirrors into aria-invalid.',
      'The cell row is pinned dir="ltr" because codes read left to right in every locale.'
    ]
  },
  motion: {
    description: "The caret blinks in the next empty cell; the blink is disabled under reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
};
tt("sm", { paddingInline: o("space-3"), gap: o("space-2") }), tt("md", { paddingInline: o("space-4"), gap: o("space-2") }), tt("lg", { paddingInline: o("space-5"), gap: o("space-2") });
const wf = {
  neutral: { background: o("text-subtle"), text: o("surface") },
  accent: { background: o("accent-solid"), text: o("accent-contrast") },
  success: { background: o("success-solid"), text: o("success-contrast") },
  warning: { background: o("warning-solid"), text: o("warning-contrast") },
  danger: { background: o("danger-solid"), text: o("danger-contrast") },
  info: { background: o("info-solid"), text: o("info-contrast") }
}, kf = {
  name: "Timeline",
  id: "timeline",
  category: "organism",
  status: "stable",
  summary: "A vertical activity feed: a semantic ordered list of events, each with a tone-colored marker on a connector rail and a content column of actor, title, timestamp, description, media, and actions.",
  element: "ol",
  anatomy: [
    { name: "root", description: "The ordered list; its DOM order is the chronology the consumer chooses (newest-first or oldest-first).", required: !0 },
    { name: "item", description: "One event: a list item holding the marker rail and the content column.", required: !0 },
    { name: "rail", description: "The decorative (aria-hidden) leading column holding the marker and connector.", required: !0 },
    { name: "marker", description: "The tone-colored disc: a plain dot by default, or a filled disc holding the icon glyph.", required: !0 },
    { name: "icon", description: "Optional glyph inside the marker, drawn in the tone contrast color." },
    { name: "connector", description: "The hairline rule between markers; the last item draws none below its marker." },
    { name: "header", description: "The event header row: actor, title, then the timestamp hugging the end.", required: !0 },
    { name: "actor", description: "Optional avatar or name slot composed by the consumer, leading the header row." },
    { name: "title", description: "The event headline at medium weight.", required: !0 },
    { name: "timestamp", description: "Optional muted time slot at the end of the header row." },
    { name: "description", description: "Optional muted body copy under the header row." },
    { name: "media", description: "Optional media or preview block under the description, clipped to the medium radius." },
    { name: "actions", description: "Optional action row of small buttons or links under the body." }
  ],
  props: [
    {
      name: "items",
      type: "array",
      required: !0,
      description: "The events, in reading order: the DOM order is the chronology the consumer chooses.",
      item: {
        type: "object",
        description: "One event.",
        fields: [
          { name: "id", type: "string", required: !0, description: "Stable identity (string or number) for the event." },
          { name: "title", type: "node", required: !0, description: "The event headline." },
          { name: "description", type: "node", description: "Body copy under the header row." },
          { name: "timestamp", type: "node", description: "Muted time slot at the end of the header row; a time element carries machine-readable dates." },
          { name: "actor", type: "node", description: "Avatar or name slot composed by the consumer, leading the header row." },
          { name: "icon", type: "node", description: "Glyph inside the marker, hidden from assistive tech; falls back to a plain dot." },
          { name: "tone", type: "enum", values: Wd, description: "Colors the marker; defaults to neutral." },
          { name: "media", type: "node", description: "Media or preview block under the description." },
          { name: "actions", type: "node", description: "Action row of small buttons or links." }
        ]
      }
    },
    { name: "aria-label", type: "string", required: !0, description: "Accessible name for the feed." },
    { name: "density", type: "enum", values: ["comfortable", "compact"], default: "comfortable", description: "Vertical rhythm; compact trims the space between events." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the component exact geometry." },
    { name: "skeletonCount", type: "number", default: 4, description: "How many placeholder rows the skeleton draws." }
  ],
  tones: ro().map((e) => ({ ...e, paint: wf[e.name] })),
  defaults: { density: "comfortable", skeleton: !1, skeletonCount: 4 },
  dimensions: {
    markerSize: o("size-lg"),
    dotSize: o("size-xs"),
    connectorWidth: o("hairline"),
    connectorMinHeight: o("space-3"),
    railGap: o("space-3"),
    headerGap: o("space-2"),
    itemPaddingBlock: o("space-5"),
    compactPaddingBlock: o("space-3"),
    mediaRadius: o("radius-md"),
    // content-column offsets under the header row
    descriptionGap: o("space-1"),
    mediaGap: o("space-2"),
    actionsGap: o("space-2"),
    actionsItemGap: o("space-2")
  },
  states: [
    {
      name: "skeleton",
      description: "Marker discs and text lines stand in with the exact rail geometry; the whole feed is aria-hidden."
    }
  ],
  tokens: [
    "font-sans",
    "font-size-sm",
    "font-size-xs",
    "font-weight-medium",
    "text",
    "text-muted",
    "text-subtle",
    "border",
    "surface",
    "hairline",
    "radius-md",
    "radius-full",
    "size-lg",
    "size-xs",
    "space-1",
    "space-2",
    "space-3",
    "space-5",
    "accent-solid",
    "accent-contrast",
    "success-solid",
    "success-contrast",
    "warning-solid",
    "warning-contrast",
    "danger-solid",
    "danger-contrast",
    "info-solid",
    "info-contrast"
  ],
  a11y: {
    focusable: !1,
    notes: [
      'The host is a native ordered list with a required aria-label and an explicit role="list": WebKit strips list semantics from lists styled with list-style: none, and the role restores them. The DOM order is the reading order, so chronological meaning (newest-first or oldest-first) survives into assistive tech.',
      "The marker rail (dot, icon, and connector) is aria-hidden and purely decorative; every meaning-bearing slot lives in the content column as plain content.",
      "Timestamps are plain text; pass a time element with a datetime attribute for machine-readable dates.",
      "Interactive content in the actions slot keeps its own semantics and tab order; the timeline itself takes no focus.",
      "The skeleton placeholder is aria-hidden; mark the surrounding region aria-busy at the app level while loading."
    ]
  }
}, _f = ["neutral", "accent", "success", "warning", "danger", "info"], xf = {
  name: "TimelineScrubber",
  id: "timeline-scrubber",
  category: "organism",
  status: "draft",
  summary: "A flight-recorder control: a horizontal band over a recorded time window with an activity backdrop, event markers, and a draggable playhead. Scrub to inspect any recorded moment, or pin the playhead to the live edge and let new time stream in.",
  element: "div",
  anatomy: [
    { name: "track", description: "The full recorded window; carries the activity backdrop and receives clicks to jump the playhead.", required: !0 },
    { name: "activity", description: "Optional area silhouette of a normalized series (overall load, event density) so the eye can find the interesting moments before scrubbing to them." },
    { name: "marker", description: "A flagged instant on the track: a thin tone-colored tick, e.g. a spike or an alert." },
    { name: "playhead", description: "The draggable vertical line whose position is the inspected time; its grab handle rides above the track edge, never clipped by it.", required: !0 },
    { name: "time-readout", description: "The formatted time under the playhead while scrubbing." },
    { name: "marker-label", description: "Formatted marker times aligned beneath the track, shown only where an event is marked." }
  ],
  props: [
    { name: "start", type: "number", required: !0, description: "Window start, epoch milliseconds." },
    { name: "end", type: "number", required: !0, description: 'Window end, epoch milliseconds. While live this is "now" and advances as new samples arrive.' },
    { name: "value", type: "number", description: "The inspected time. Omit to pin the playhead to the live edge." },
    {
      name: "onChange",
      type: "handler",
      description: "Called with the scrubbed time (epoch ms) as the playhead moves, or null when the user returns to live."
    },
    {
      name: "activity",
      type: "array",
      item: { type: "number", description: "One normalized 0-1 sample; samples spread evenly from start to end." },
      description: "Optional context series rendered as the track backdrop."
    },
    {
      name: "markers",
      type: "array",
      item: {
        type: "object",
        description: "A flagged instant.",
        fields: [
          { name: "time", type: "number", required: !0, description: "Epoch milliseconds; clamped into the window." },
          { name: "tone", type: "enum", values: _f, description: "Tick color family. Defaults to neutral." },
          { name: "label", type: "string", description: "Accessible description of the event, surfaced as the tick tooltip." }
        ]
      },
      description: "Flagged instants drawn as thin ticks over the track."
    },
    { name: "step", type: "number", default: 1e3, description: "Arrow-key step in milliseconds; PageUp/PageDown move by ten steps." },
    { name: "formatTime", type: "handler", description: "Formats a timestamp for the readout, the ticks, and aria-valuetext. Defaults to a locale time string." },
    { name: "size", type: "enum", values: Lo, default: "md", description: "Track height step. The handle adds its overhang above the track." },
    { name: "glass", type: "boolean", default: !1, description: "Renders the track on the frosted glass material." },
    { name: "disabled", type: "boolean", default: !1, description: "Blocks scrubbing and dims the control." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the exact geometry." },
    { name: "aria-label", type: "string", required: !0, description: 'Accessible name for the scrubber, e.g. "Recorded activity".' }
  ],
  sizes: [
    { name: "sm", height: "2.5rem" },
    { name: "md", height: "3.5rem" }
  ],
  defaults: { step: 1e3, size: "md", glass: !1, disabled: !1, skeleton: !1 },
  dimensions: {
    radius: o("radius-md"),
    border: o("hairline"),
    playheadWidth: "2px",
    markerWidth: "2px",
    handleDiameter: "0.75rem",
    gap: o("space-2"),
    tickFontSize: o("font-size-xs")
  },
  states: [
    { name: "default", description: "Track on the sunken surface, activity backdrop in the text color, playhead line in the accent solid." },
    {
      name: "live",
      description: "The playhead hugs the trailing edge and moves with the advancing window."
    },
    {
      name: "scrubbing",
      description: "While dragging, the playhead thickens its glow and the time readout appears under it.",
      tokens: { readout: o("surface-raised"), "playhead-glow": o("accent-soft") }
    },
    {
      name: "past",
      description: "Scrubbed away from the live edge: the playhead remains on the inspected moment."
    },
    {
      name: "glass",
      description: "The track swaps its solid surface for the frosted material.",
      paint: { background: o("glass-regular"), border: o("glass-border") },
      tokens: { highlight: o("glass-highlight") }
    },
    { name: "disabled", description: "Dims to the disabled text color and ignores pointer and keyboard input." },
    { name: "skeleton", description: "A pulse placeholder with the exact track geometry." }
  ],
  // the track, fill, and handle children paint
  paint: {},
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "surface-sunken",
    "surface-raised",
    "hairline",
    "radius-md",
    "space-2",
    "accent-solid",
    "accent-soft",
    "accent-contrast",
    "accent-text",
    "text-subtle",
    "text-muted",
    "font-size-xs",
    "focus-ring",
    "duration-fast",
    "ease-out",
    "glass-regular",
    "glass-border",
    "glass-highlight",
    "blur-sm",
    "glass-saturate"
  ],
  a11y: {
    role: "slider",
    focusable: !0,
    keyboard: [
      { keys: "ArrowLeft", action: "Steps the playhead back by one step." },
      { keys: "ArrowRight", action: "Steps the playhead forward by one step; at the live edge it pins to live." },
      { keys: "PageUp, PageDown", action: "Moves by ten steps." },
      { keys: "Home", action: "Jumps to the window start." },
      { keys: "End", action: "Returns to the live edge." }
    ],
    notes: [
      "The playhead is the slider: aria-valuemin/max are the window bounds and aria-valuetext speaks the formatted time, or the live label when pinned.",
      "Markers are decorative ticks with tooltips; the flagged events must also exist somewhere textual (a list, a feed) for non-pointer users."
    ]
  },
  motion: {
    description: "The playhead glides to clicked positions and the live edge advances smoothly; both snap instantly under reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, nc = ["accent", "blue", "amber", "purple", "teal", "red", "green", "gray"], Sf = {
  name: "DataGrid",
  id: "data-grid",
  category: "organism",
  status: "stable",
  summary: "A column-driven data grid with client sorting, row selection, loading and empty states, responsive overflow, and a roving-focus keyboard grid - the interactive counterpart to the static Table.",
  element: "table",
  anatomy: [
    { name: "grid", description: 'The role="grid" table that owns the roving tabindex and keyboard model.', required: !0 },
    { name: "header", description: 'The header row of role="columnheader" cells.', required: !0 },
    { name: "sortIndicator", description: "The direction glyph on a sortable header; reflects aria-sort ascending, descending, or none." },
    { name: "selectionColumn", description: "The optional leading column of row checkboxes with a select-all header checkbox." },
    { name: "row", description: 'A role="row" of role="gridcell" cells; carries aria-selected when selectable.', required: !0 },
    { name: "cell", description: 'A role="gridcell"; a single roving-focus stop rendered from the column render or the raw row value.', required: !0 },
    { name: "emptyState", description: "A single spanning cell shown when there are no rows and not loading." },
    { name: "loading", description: "Skeleton rows shown while loading, keeping the header and column widths." }
  ],
  props: [
    {
      name: "columns",
      type: "array",
      required: !0,
      description: "The column definitions that drive the header and cell rendering.",
      item: {
        type: "object",
        description: "One column.",
        fields: [
          { name: "key", type: "string", required: !0, description: "Matches a key on each row and identifies the column for sorting." },
          { name: "header", type: "node", required: !0, description: "Header content." },
          { name: "align", type: "enum", values: ["start", "center", "end"], description: "Cell text alignment; defaults to start." },
          { name: "sortable", type: "boolean", description: "Makes the header an activatable three-state sort control." },
          { name: "width", type: "string", description: "A fixed or minimum column width, e.g. 12rem." },
          { name: "render", type: "handler", description: "Custom cell renderer (row, rowIndex); defaults to String(row[key])." },
          { name: "sortValue", type: "handler", description: "Custom comparable value for sorting; defaults to row[key]." }
        ]
      }
    },
    {
      name: "data",
      type: "array",
      required: !0,
      description: "The rows to render; each must carry a stable id.",
      item: {
        type: "object",
        description: "One row.",
        fields: [
          { name: "id", type: "string", required: !0, description: "Stable row identity (string or number), reported by selection." }
        ]
      }
    },
    { name: "aria-label", type: "string", required: !0, description: "Accessible name for the grid." },
    { name: "sort", type: "object", description: "Controlled active sort: { columnKey, direction }, or null for unsorted.", fields: [
      { name: "columnKey", type: "string", required: !0, description: "The sorted column key." },
      { name: "direction", type: "enum", values: ["asc", "desc"], required: !0, description: "Sort direction." }
    ] },
    { name: "defaultSort", type: "object", description: "Initial sort when uncontrolled, or null.", fields: [
      { name: "columnKey", type: "string", required: !0, description: "The sorted column key." },
      { name: "direction", type: "enum", values: ["asc", "desc"], required: !0, description: "Sort direction." }
    ] },
    { name: "onSortChange", type: "handler", description: "Called with the next sort (or null) when a sortable header cycles." },
    { name: "manualSort", type: "boolean", default: !1, description: "Skip built-in client sorting; report sort changes and render data as given (server sorting)." },
    { name: "selectable", type: "boolean", default: !1, description: "Render a leading checkbox column with select-all in the header." },
    { name: "selectedIds", type: "array", description: "Controlled list of selected row ids.", item: { type: "string", description: "A selected row id (string or number)." } },
    { name: "defaultSelectedIds", type: "array", description: "Initially selected row ids when uncontrolled.", item: { type: "string", description: "A selected row id (string or number)." } },
    { name: "onSelectionChange", type: "handler", description: "Called with the next full list of selected ids whenever selection changes." },
    { name: "loading", type: "boolean", default: !1, description: "Show skeleton rows and mark the grid aria-busy." },
    { name: "loadingRows", type: "number", default: 5, description: "How many skeleton rows to show while loading." },
    { name: "emptyState", type: "node", description: "Content shown when there are no rows and not loading." },
    { name: "density", type: "enum", values: ["comfortable", "compact"], default: "comfortable", description: "Row rhythm; compact trims vertical padding for data-dense views." },
    { name: "stickyHeader", type: "boolean", default: !1, description: "Pin the header row while the body scrolls vertically." },
    { name: "maxHeight", type: "string", description: "Cap the body height and scroll vertically; pairs with stickyHeader." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the component exact geometry." }
  ],
  defaults: {
    manualSort: !1,
    selectable: !1,
    loading: !1,
    loadingRows: 5,
    density: "comfortable",
    stickyHeader: !1,
    skeleton: !1
  },
  dimensions: {
    radius: o("radius-md"),
    border: o("hairline"),
    cellPaddingInline: o("space-4"),
    cellPaddingBlock: o("space-3"),
    compactPaddingBlock: o("space-2"),
    emptyPaddingBlock: o("space-8"),
    headerGap: o("space-2")
  },
  states: [
    { name: "selected", description: "A selected row wears the accent soft tint.", tokens: { background: "$accent-soft" } },
    { name: "sorted", description: "The active sortable header and its indicator take the accent text color.", tokens: { text: "$accent-text" } },
    { name: "hover", description: "Pointer over a sortable header.", tokens: { text: "$accent-text" } },
    { name: "loading", description: "Skeleton rows stand in while data loads; the grid is aria-busy." }
  ],
  paint: { background: "$surface", border: "$border" },
  focusRing: { ring: o("focus-ring"), offset: "-2px" },
  transition: { duration: o("duration-fast"), ease: o("ease-out") },
  tokens: [
    "surface",
    "text",
    "text-muted",
    "text-subtle",
    "border",
    "hairline",
    "radius-md",
    "font-size-sm",
    "space-2",
    "space-3",
    "space-4",
    "space-8",
    "accent-soft",
    "accent-text",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "grid",
    focusable: !0,
    keyboard: [
      { keys: "ArrowRight, ArrowLeft", action: "Moves cell focus one column right or left, clamped to the grid edges." },
      { keys: "ArrowDown, ArrowUp", action: "Moves cell focus one row down or up, including into and out of the header row." },
      { keys: "Home, End", action: "Moves cell focus to the first or last cell in the row." },
      { keys: "Ctrl+Home, Ctrl+End", action: "Moves cell focus to the first cell of the header or the last cell of the last row." },
      { keys: "Enter, Space", action: "On a sortable header cell, cycles its sort ascending, descending, then unsorted." },
      { keys: "Space", action: "On a selection cell, toggles that row; on the select-all header, toggles every row." }
    ],
    notes: [
      'The host is a role="grid" table of role="row" rows with role="columnheader" and role="gridcell" cells; it exposes aria-rowcount, aria-colcount, and per-cell aria-rowindex and aria-colindex.',
      "One roving tabindex spans the cells: exactly one cell sits in the tab order, and arrow keys move it across the header and body.",
      "Sortable headers carry aria-sort (ascending, descending, or none) and cycle three states; sorting is client-side unless manualSort defers it to the parent.",
      "Selection is multi-select through a leading checkbox column; rows report aria-selected and the header checkbox shows an indeterminate dash on a partial selection.",
      "The grid scrolls horizontally for overflow and, with maxHeight, vertically under a sticky header."
    ]
  },
  motion: {
    description: "The sort indicator crossfades its color on a token transition; respects reduced motion.",
    transition: { speed: "fast", ease: "out" }
  }
}, Mf = {
  name: "Wizard",
  id: "wizard",
  category: "organism",
  status: "stable",
  summary: "A stepped flow that breaks a long task into short gated steps - a connected progress header, one labelled panel at a time, and Previous/Next actions where Next runs the step's validation gate before advancing.",
  element: "div",
  anatomy: [
    { name: "progress", description: "The connected, numbered Steps header (count = steps, active = current); announces position as its own group label.", required: !0 },
    { name: "heading", description: 'The active step label as an h2 or h3, prefixed by a visually hidden localized "Step X of Y"; its id labels the panel.', required: !0 },
    { name: "panel", description: 'The role="group" step body, aria-labelledby the heading and tabIndex -1 so committed navigation can move focus into it; hosts the crossfading content.', required: !0 },
    { name: "error", description: 'An always-present polite live region (role="status") under the panel that voices a blocking gate message; one line of height stays reserved so a short message never shoves the footer; a longer wrapped message grows the region.', required: !0 },
    { name: "footer", description: "The action row: Previous on the leading edge, Next/Finish on the trailing edge.", required: !0 },
    { name: "previous", description: "Ghost button: always allowed, never gated, clears any error; disabled on the first step and while an async gate settles.", required: !0 },
    { name: "next", description: "Solid button: runs the active step's validate, then saves and advances - or completes from the last step; wears its loading state while an async gate settles.", required: !0 }
  ],
  props: [
    {
      name: "steps",
      type: "array",
      required: !0,
      description: "The wizard steps, in order.",
      item: {
        type: "object",
        description: "One step.",
        fields: [
          { name: "id", type: "string", required: !0, description: "Stable identity; keys the panel transition." },
          { name: "label", type: "node", required: !0, description: "Step name: shown as the panel heading and used for accessible labelling." },
          { name: "content", type: "node", required: !0, description: "The panel body for this step." },
          {
            name: "validate",
            type: "handler",
            description: "The forward gate, run when Next/Finish is pressed on this step: true passes; false blocks silently (the step's own fields display their errors); a string blocks AND shows that message in the wizard's error live region. May return a Promise of the same: Next shows its loading state and the footer is inert until it settles; a rejection is a silent block and must not leave the footer stuck."
          }
        ]
      }
    },
    { name: "aria-label", type: "string", required: !0, description: "Required accessible name for the wizard region." },
    { name: "activeStep", type: "number", description: "Controlled zero-based index of the active step; clamped into range when rendering." },
    { name: "defaultActiveStep", type: "number", default: 0, description: "Uncontrolled start - the resume point when restoring a saved draft." },
    { name: "onStepChange", type: "handler", description: "Called with the new index on every committed navigation, forward or back." },
    { name: "onSave", type: "handler", description: "Called with the index being left when its gate passes on forward navigation; the parent persists it and resumes via defaultActiveStep." },
    { name: "onComplete", type: "handler", description: "Called when Finish is pressed on the last step and its gate passes." },
    { name: "previousLabel", type: "node", description: "Previous action label; defaults to the localized kit Previous message." },
    { name: "nextLabel", type: "node", description: "Next action label; defaults to the localized kit Next message." },
    { name: "finishLabel", type: "node", description: "Finish action label shown on the last step; defaults to the localized kit Done message." },
    { name: "headingLevel", type: "enum", values: ["2", "3"], default: "2", description: "Heading element for the step label." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the component exact geometry: Steps skeleton, a heading-width line, three content lines, the reserved error line, and two control-height button blocks." }
  ],
  defaults: {
    defaultActiveStep: 0,
    headingLevel: "2",
    skeleton: !1
  },
  dimensions: {
    gap: o("space-5"),
    footerGap: o("space-3"),
    skeletonContentGap: o("space-2"),
    panelRadius: o("radius-md"),
    errorFontSize: o("font-size-sm"),
    // Reserved height of the live region: exactly one line of its own text.
    errorMinHeight: "1lh"
  },
  states: [
    {
      name: "error",
      description: "A gate returned a message: the wizard stays on the step and the polite live region voices the message in danger text.",
      paint: { text: o("danger-text") }
    },
    {
      name: "validating",
      description: "An async gate is settling: the Next button wears its loading spinner, both footer actions are inert, and the panel is aria-busy; resolution advances, rejection blocks silently and re-enables the footer.",
      behavioral: !0
    },
    {
      name: "skeleton",
      description: "Exact-geometry placeholders, aria-hidden: the Steps skeleton, a heading line, three content lines, and two button blocks; nothing shifts when content arrives."
    }
  ],
  // Painted on the panel when navigation moves focus into it, not on the host.
  paint: { text: "$text" },
  focusRing: { ring: o("focus-ring"), offset: "2px" },
  tokens: [
    "text",
    "danger-text",
    "font-size-sm",
    "space-2",
    "space-3",
    "space-5",
    "radius-md",
    "focus-ring",
    "duration-fast",
    "ease-out"
  ],
  a11y: {
    role: "region",
    // The container itself never takes focus; the footer buttons (and the
    // step's own fields) are the tab stops, each with native button focus
    // semantics and the kit focus ring.
    focusable: !1,
    keyboard: [
      { keys: "Tab", action: "Moves through the step's fields and then the footer actions in document order; the wizard adds no roving behavior of its own." },
      { keys: "Enter, Space", action: "Activates the focused Previous or Next/Finish button through native button semantics." }
    ],
    notes: [
      'The root is a labelled role="region"; the active panel is a role="group" aria-labelledby the step heading, which begins with a visually hidden localized "Step X of Y" so the panel name carries position.',
      "After a committed navigation (forward or back) focus moves to the panel (tabIndex -1) so keyboard and screen reader users land at the top of the new step; focus is never stolen on initial mount.",
      'A blocking gate message is announced by an always-present polite live region (role="status"); focus stays where it is.',
      "The footer buttons are native buttons with their own focus rings, loading, and disabled semantics: Previous is disabled on the first step, and both go inert while an async gate settles.",
      "The Steps progress header is numbered and announces position as a group label, so progress never relies on color alone."
    ]
  },
  motion: {
    description: "The panel content crossfades with a small directional x shift - forward enters from the trailing side, back from the leading side - on the fast/out token pair; reduced motion collapses the shift to no transform.",
    transition: { speed: "fast", ease: "out" }
  }
}, $f = ["grid", "list"], Tf = ["sm", "md", "lg"], Cf = ["comfortable", "compact"], Nf = {
  name: "CardGroup",
  id: "card-group",
  category: "layout",
  status: "stable",
  summary: "A layout shelf for repeated card surfaces: a responsive auto-fill grid with a stable minimum card width, or a single-column list, with token-driven gaps and a geometry-preserving skeleton.",
  element: "div",
  anatomy: [
    {
      name: "group",
      description: "The CSS grid container; a plain div with no implicit role.",
      required: !0
    },
    {
      name: "item",
      description: "Implicit: each direct child becomes one grid item. In grid mode items share the auto-fill tracks; in list mode they stack full-width. Every item is floored at min-width 0 so long content cannot blow a track open."
    }
  ],
  props: [
    {
      name: "mode",
      type: "enum",
      values: $f,
      default: "grid",
      description: "Layout mode. grid lays cards on repeat(auto-fill, minmax(...)) columns that keep a stable minimum width and wrap responsively; list stacks them in a single column."
    },
    {
      name: "minItemWidth",
      type: "string",
      default: "16rem",
      description: "The minimum card width in grid mode, as a CSS length. Feeds the --card-group-min custom property; ignored in list mode."
    },
    {
      name: "gap",
      type: "enum",
      values: Tf,
      default: "md",
      description: "Space between cards, from the token scale: sm space-3, md space-4, lg space-6."
    },
    {
      name: "density",
      type: "enum",
      values: Cf,
      default: "comfortable",
      description: "Rhythm control; compact tightens the chosen gap one space step (sm space-2, md space-3, lg space-4)."
    },
    {
      name: "skeleton",
      type: "boolean",
      default: !1,
      description: "Renders skeletonCount rounded placeholder cards in the same tracks, so the grid geometry holds while content loads."
    },
    {
      name: "skeletonCount",
      type: "number",
      default: 6,
      description: "How many placeholder cards the skeleton renders."
    },
    {
      name: "children",
      type: "node",
      description: "The cards, or any repeated surfaces; omitted entirely when the skeleton grid stands in."
    }
  ],
  defaults: {
    mode: "grid",
    minItemWidth: "16rem",
    gap: "md",
    density: "comfortable",
    skeleton: !1,
    skeletonCount: 6
  },
  dimensions: {
    gapSm: o("space-3"),
    gapMd: o("space-4"),
    gapLg: o("space-6"),
    compactGapSm: o("space-2"),
    compactGapMd: o("space-3"),
    compactGapLg: o("space-4"),
    // Geometry values genuinely off the token scale.
    minItemWidth: "16rem",
    skeletonItemHeight: "8rem",
    skeletonItemRadius: o("radius-xl")
  },
  states: [
    {
      name: "grid",
      description: "The default responsive mode: grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--card-group-min)), 1fr)). Every card keeps at least minItemWidth (clamped to the container so nothing overflows a narrow parent), leftover space distributes evenly across the row, and cards wrap to new rows as the container narrows. Pure layout, zero paint of its own.",
      behavioral: !0
    },
    {
      name: "list",
      description: "A single minmax(0, 1fr) column: cards stack full-width in source order with the same token-driven gap. Pure layout, zero paint of its own.",
      behavioral: !0
    },
    {
      name: "skeleton",
      description: "skeletonCount rounded rect placeholders (radius-xl, 8rem tall) fill the same tracks as the live cards, so columns and gaps do not shift when content arrives. The whole group is aria-hidden."
    }
  ],
  // the grouped cards paint
  paint: {},
  tokens: ["space-2", "space-3", "space-4", "space-6", "radius-xl"],
  a11y: {
    focusable: !1,
    notes: [
      "Renders a plain div with no role: it is purely visual layout and adds no semantics over its children.",
      'When the content is semantically a list, the consumer adds role="list" to the group and role="listitem" to each child (or renders list markup inside); CardGroup never assumes it.',
      "Reading order and keyboard order follow source order in both modes; grid mode only wraps rows, it never reorders.",
      "The skeleton branch is aria-hidden; mark the surrounding region aria-busy at the app level while loading."
    ]
  }
}, Df = {
  name: "Section",
  id: "section",
  category: "structure",
  status: "stable",
  summary: "A titled page region: a heading row with description and end-aligned actions, a token-driven rhythm gap before the content, and an optional hairline divider for stacking.",
  element: "section",
  anatomy: [
    {
      name: "header",
      description: "The heading row: title and description stacked at the start, actions at the end; omitted entirely when all three are empty."
    },
    {
      name: "title",
      description: "The section heading (h2 or h3); its generated id labels the section through aria-labelledby."
    },
    { name: "description", description: "A muted supporting line under the title." },
    { name: "actions", description: "End-aligned controls on the heading row; they wrap below the title on narrow widths." },
    { name: "content", description: "The section body, separated from the header by the gap step.", required: !0 }
  ],
  props: [
    {
      name: "title",
      type: "node",
      description: "Section heading; when present the section is labelled by the heading through aria-labelledby."
    },
    { name: "description", type: "node", description: "Muted supporting content under the title." },
    { name: "actions", type: "node", description: "Content aligned to the end of the heading row, such as actions." },
    {
      name: "headingLevel",
      type: "enum",
      values: ["2", "3"],
      default: "2",
      description: "Semantic heading level for the title: h2 for page sections, h3 for sections nested under an h2."
    },
    {
      name: "gap",
      type: "enum",
      values: ["sm", "md", "lg"],
      default: "md",
      description: "Vertical rhythm between the header block and the content: space-3, space-5, or space-8."
    },
    {
      name: "divider",
      type: "boolean",
      default: !1,
      description: "Draws a hairline top rule with a leading offset so stacked sections separate cleanly."
    },
    {
      name: "density",
      type: "enum",
      values: ["comfortable", "compact"],
      default: "comfortable",
      description: "Section rhythm; compact trims every gap step one notch down the space scale."
    },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the component exact geometry." },
    { name: "children", type: "node", required: !0, description: "The section content." }
  ],
  defaults: { headingLevel: "2", gap: "md", divider: !1, density: "comfortable", skeleton: !1 },
  dimensions: {
    // the gap prop steps, comfortable density
    gapSm: o("space-3"),
    gapMd: o("space-5"),
    gapLg: o("space-8"),
    // compact density trims each step one notch down the scale
    compactGapSm: o("space-2"),
    compactGapMd: o("space-3"),
    compactGapLg: o("space-5"),
    // heading row: title block to actions (inline), the row's wrap gap when
    // the actions drop onto their own line (block), title to description,
    // and between actions
    headerGap: o("space-4"),
    headerGapBlock: o("space-2"),
    headerTextGap: o("space-1"),
    actionsGap: o("space-2"),
    // divider rule and its offset before the header
    border: o("hairline"),
    dividerOffset: o("space-6"),
    compactDividerOffset: o("space-4")
  },
  states: [
    {
      name: "divider",
      description: "A hairline border-subtle top rule with a dividerOffset leading padding (compactDividerOffset under compact density), separating stacked sections.",
      paint: { border: o("border-subtle") }
    },
    {
      name: "skeleton",
      description: "Mirrors each provided header slot (title, description, actions) with a placeholder at the same scale and stands text lines in for the content, so nothing shifts on arrival; the whole placeholder is aria-hidden."
    }
  ],
  paint: { text: "$text" },
  tokens: [
    "font-sans",
    "font-size-sm",
    "leading-sm",
    "text",
    "text-muted",
    "hairline",
    "border-subtle",
    "space-1",
    "space-2",
    "space-3",
    "space-4",
    "space-5",
    "space-6",
    "space-8"
  ],
  a11y: {
    focusable: !1,
    notes: [
      "With a title, the section element carries aria-labelledby pointing at the generated heading id, so it is exposed as a named region landmark.",
      "Without a title the section renders no aria-labelledby and is not a named landmark; pass aria-label when an untitled section should still be a named region.",
      "headingLevel only switches between h2 and h3: pick the level that keeps the page outline sequential, and do not skip levels between nested sections.",
      "The divider is decorative separation between stacked sections; it carries no semantics of its own.",
      "Give icon-only controls in the actions slot an aria-label; the section adds no labels to its slots."
    ]
  }
}, zf = {
  name: "PageHeader",
  id: "page-header",
  category: "structure",
  status: "stable",
  summary: "The page masthead: breadcrumbs over an h1/h2 title with a muted description and metadata row, primary actions end-aligned, and an overflow menu of secondary actions behind an ellipsis button.",
  element: "header",
  anatomy: [
    { name: "breadcrumbs", description: "Optional trail above the title; compose the kit Breadcrumbs." },
    { name: "title", required: !0, description: "The page title, a real h1 or h2 per headingLevel, set at the 2xl type step." },
    { name: "description", description: "Muted supporting copy directly under the title." },
    { name: "meta", description: "Inline wrapping metadata row under the title and description: pills, status dots, counts." },
    { name: "actions", description: "Primary actions sharing one wrapping row with the title block; end-aligned on wide layouts, dropping below the title on narrow widths." },
    { name: "overflowMenu", description: "Secondary actions behind a localized ellipsis icon button, rendered as Menu rows; omitted entirely when there are none." }
  ],
  props: [
    { name: "title", type: "node", required: !0, description: "The page title, rendered as an h1 or h2 per headingLevel." },
    { name: "description", type: "node", description: "Muted supporting copy under the title." },
    { name: "breadcrumbs", type: "node", description: "Slot above the title; compose the kit Breadcrumbs." },
    { name: "meta", type: "node", description: "Inline metadata row under the title and description." },
    { name: "actions", type: "node", description: "Primary actions, end-aligned on wide layouts." },
    {
      name: "secondaryActions",
      type: "array",
      description: "Secondary actions collected into an overflow Menu behind a localized ellipsis button; the button is omitted when the list is empty.",
      item: {
        type: "object",
        description: "One overflow menu row.",
        fields: [
          { name: "id", type: "string", required: !0, description: "Stable identity for the row." },
          { name: "label", type: "node", required: !0, description: "The row label." },
          { name: "onSelect", type: "handler", description: "Called when the row is chosen; the menu then closes." },
          { name: "disabled", type: "boolean", description: "Dims the row and ignores selection." }
        ]
      }
    },
    { name: "headingLevel", type: "enum", values: ["1", "2"], default: 1, description: "The heading element used for the title. The visual size stays the same; only the semantics change." },
    { name: "density", type: "enum", values: ["comfortable", "compact"], default: "comfortable", description: "Vertical rhythm; compact trims the block padding and stack gap." },
    { name: "skeleton", type: "boolean", default: !1, description: "Renders a placeholder with the component exact geometry." }
  ],
  defaults: { headingLevel: 1, density: "comfortable", skeleton: !1 },
  dimensions: {
    paddingBlock: o("space-6"),
    compactPaddingBlock: o("space-4"),
    // gap between the breadcrumbs and the title/actions row
    sectionGap: o("space-3"),
    compactSectionGap: o("space-2"),
    // the shared wrapping row: block gap when the actions wrap under the title
    rowGapBlock: o("space-3"),
    rowGapInline: o("space-4"),
    // title block internals and the two inline clusters
    titleGap: o("space-2"),
    metaGap: o("space-2"),
    actionsGap: o("space-2"),
    // flex-basis of the title block: the no-JS wrap threshold for the actions
    // row, deliberately off the space scale like other layout breakpoints
    wrapBasis: "20rem"
  },
  states: [
    {
      name: "skeleton",
      description: "Replaces each provided slot with a Skeleton line in the same container inside an aria-hidden header; the actions collapse to one control-height block."
    }
  ],
  paint: { text: "$text" },
  tokens: [
    "text",
    "text-muted",
    "font-sans",
    "font-size-2xl",
    "leading-2xl",
    "tracking-2xl",
    "font-weight-semibold",
    "font-size-md",
    "leading-md",
    "font-size-sm",
    "leading-sm",
    "space-2",
    "space-3",
    "space-4",
    "space-6",
    "control-height-md",
    "control-radius"
  ],
  a11y: {
    focusable: !1,
    notes: [
      "The host is a header element: a banner landmark at the top of the page, or a plain group when nested inside main, article, or section.",
      "The title renders as a real h1 or h2 per headingLevel so the document outline stays honest; keep one h1 per page and use headingLevel 2 when the page already owns its h1.",
      'The overflow trigger is an icon-only IconButton with a localized "More actions" name; Menu wires its aria-haspopup, aria-expanded, and aria-controls.',
      "Overflow keyboard behavior is inherited from Menu: ArrowUp/ArrowDown rove the rows, Home and End jump to the edges, Enter or Space selects, and Escape closes and restores focus to the trigger.",
      "The header itself is not focusable; focus behavior belongs to the composed controls in the actions slot and the overflow trigger.",
      "The skeleton placeholder is aria-hidden; mark the loading region aria-busy at the app level."
    ]
  }
}, Pf = [
  // text and content
  wp,
  ym,
  xm,
  Sm,
  _m,
  hf,
  um,
  // actions
  om,
  wm,
  Sp,
  // form controls
  km,
  kp,
  Nm,
  Bm,
  dm,
  qm,
  Fm,
  hp,
  ep,
  // status and feedback
  Om,
  mm,
  op,
  em,
  im,
  nm,
  Jh,
  $m,
  Im,
  Lm,
  np,
  lp,
  Zm,
  gm,
  // data viz
  jm,
  // containers
  cm,
  dp,
  fm,
  // molecules
  bm,
  Um,
  Gm,
  pp,
  Tp,
  xp,
  // organisms
  Cm,
  Dm,
  zm,
  Uh,
  // new atoms
  Cp,
  Dp,
  zp,
  ff,
  bf,
  vf,
  // new molecules
  Op,
  Ep,
  Ip,
  Lp,
  Fp,
  Bp,
  Hp,
  jp,
  Yp,
  Vp,
  Gp,
  Xp,
  Qp,
  Zp,
  // new organisms
  ef,
  tf,
  nf,
  af,
  of,
  sf,
  uf,
  // structures
  Jm,
  Mp,
  cf,
  zf,
  Df,
  Nf,
  // data workflows
  Sf,
  kf,
  xf,
  Mf
];
Object.fromEntries(Pf.map((e) => [e.id, e]));
function bn(e) {
  if (e) {
    const t = e.closest("[dir]");
    if (t) {
      const a = t.getAttribute("dir")?.toLowerCase();
      if (a === "rtl" || a === "ltr") return a;
    }
    if (typeof getComputedStyle < "u") {
      const a = getComputedStyle(e).direction;
      if (a === "rtl" || a === "ltr") return a;
    }
  }
  return typeof document < "u" && document.documentElement.dir.toLowerCase() === "rtl" ? "rtl" : "ltr";
}
function ia(e) {
  const [t, a] = pe("ltr");
  return ys(() => {
    const n = () => a(bn(e.current));
    if (n(), typeof MutationObserver > "u") return;
    const s = new MutationObserver(n);
    return s.observe(document.documentElement, { attributes: !0, attributeFilter: ["dir"] }), () => s.disconnect();
  }, [e]), t;
}
const ac = 20, Af = 96, As = (e) => Math.round(e * 1e4) / 1e4;
function Of(e, t) {
  if (e === t)
    return { min: e, max: t, clamp: `${As(e)}rem` };
  const a = (t - e) / (Af - ac), n = e - a * ac;
  return {
    min: e,
    max: t,
    clamp: `clamp(${As(e)}rem, ${As(n)}rem + ${As(a * 100)}vw, ${As(t)}rem)`
  };
}
const Ef = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
Object.fromEntries(
  Ef.map((e) => [e, Of(e * 0.25, e * 0.3125)])
);
const Ld = [
  { name: "gray", hue: 260, chroma: 0.012, contrast: "white" },
  { name: "accent", hue: 228, chroma: 0.15, contrast: "white" },
  { name: "red", hue: 25, chroma: 0.19, contrast: "white" },
  { name: "amber", hue: 75, chroma: 0.15, contrast: "black" },
  { name: "green", hue: 150, chroma: 0.14, contrast: "white" },
  { name: "blue", hue: 228, chroma: 0.15, contrast: "white" },
  { name: "purple", hue: 305, chroma: 0.17, contrast: "white" },
  { name: "teal", hue: 190, chroma: 0.12, contrast: "black" }
], Wf = [
  { name: "blue", label: "Blue", ramp: "accent" },
  { name: "green", label: "Green", ramp: "green" },
  { name: "purple", label: "Purple", ramp: "purple" },
  { name: "teal", label: "Teal", ramp: "teal" },
  { name: "amber", label: "Amber", ramp: "amber" },
  { name: "red", label: "Red", ramp: "red" },
  { name: "graphite", label: "Graphite", ramp: "gray" }
], oc = Wf.map(({ name: e, label: t, ramp: a }) => {
  const n = Ld.find((s) => s.name === a);
  if (!n) throw new Error(`accent option "${e}" references unknown ramp "${a}"`);
  return { name: e, label: t, hue: n.hue, chroma: n.chroma, contrast: n.contrast };
});
function If(e, t) {
  return qd({ hue: e.hue, chroma: e.chroma, contrast: e.contrast }, t);
}
const Rf = {
  light: [0.993, 0.981, 0.96, 0.936, 0.906, 0.87, 0.822, 0.755, 0.627, 0.578, 0.498, 0.303],
  dark: [0.14, 0.17, 0.21, 0.248, 0.285, 0.33, 0.39, 0.485, 0.64, 0.7, 0.805, 0.935]
}, Lf = {
  light: [0.06, 0.12, 0.25, 0.4, 0.55, 0.7, 0.85, 1, 1, 1, 0.85, 0.55],
  dark: [0.14, 0.2, 0.32, 0.45, 0.58, 0.7, 0.85, 1, 1.08, 1.08, 0.85, 0.42]
}, sc = (e, t) => {
  const a = 10 ** t;
  return Math.round(e * a) / a;
};
function qd(e, t) {
  const a = Rf[t], n = Lf[t];
  return a.map((s, i) => {
    const r = sc(e.chroma * (n[i] ?? 1), 4);
    return `oklch(${sc(s, 3)} ${r} ${e.hue})`;
  });
}
const qf = "oklch(0.995 0 0)", Ff = (e) => `oklch(1 0 0 / ${e})`;
Array.from({ length: 6 }, () => Ff(0));
const Fd = {
  instant: 75,
  fast: 150,
  normal: 250,
  slow: 400,
  slower: 600
}, Bf = {
  out: [0.16, 1, 0.3, 1],
  "in-out": [0.65, 0, 0.35, 1],
  spring: [0.34, 1.56, 0.64, 1],
  exit: [0.4, 0, 1, 1]
}, Hf = Ld.find((e) => e.name === "gray"), jf = {
  dawn: {
    neutral: { name: "gray", hue: 46, chroma: 0.03, contrast: "white" },
    semantic: {
      "surface-raised": "oklch(0.998 0.004 55)",
      overlay: "oklch(0.22 0.025 40 / 0.42)",
      "text-subtle": "oklch(0.49 0.028 42)",
      "segment-track": "oklch(0.92 0.02 50 / 0.72)",
      "segment-thumb": "oklch(0.998 0.004 55)",
      "slider-thumb": "oklch(0.998 0.004 55)"
    },
    glass: {
      "glass-thin": "oklch(0.985 0.012 52 / 0.48)",
      "glass-regular": "oklch(0.985 0.012 52 / 0.68)",
      "glass-thick": "oklch(0.985 0.012 52 / 0.86)",
      "glass-border": "oklch(0.4 0.03 42 / 0.12)",
      "glass-highlight": "oklch(1 0 0 / 0.82)"
    }
  },
  boreal: {
    neutral: { name: "gray", hue: 165, chroma: 0.028, contrast: "white" },
    semantic: {
      "surface-sunken": "oklch(0.105 0.015 165)",
      overlay: "oklch(0.055 0.015 165 / 0.7)",
      "segment-track": "oklch(0.27 0.025 165 / 0.62)",
      "segment-thumb": "oklch(0.56 0.026 165)",
      "slider-thumb": "oklch(0.91 0.014 165)"
    },
    glass: {
      "glass-thin": "oklch(0.22 0.024 165 / 0.44)",
      "glass-regular": "oklch(0.22 0.024 165 / 0.64)",
      "glass-thick": "oklch(0.19 0.022 165 / 0.88)",
      "glass-border": "oklch(0.9 0.025 165 / 0.11)",
      "glass-highlight": "oklch(0.96 0.02 165 / 0.11)"
    }
  },
  ember: {
    neutral: { name: "gray", hue: 48, chroma: 0.03, contrast: "white" },
    semantic: {
      "surface-sunken": "oklch(0.11 0.016 48)",
      overlay: "oklch(0.06 0.016 48 / 0.72)",
      "segment-track": "oklch(0.28 0.027 48 / 0.62)",
      "segment-thumb": "oklch(0.58 0.028 48)",
      "slider-thumb": "oklch(0.92 0.014 48)"
    },
    glass: {
      "glass-thin": "oklch(0.23 0.027 48 / 0.44)",
      "glass-regular": "oklch(0.23 0.027 48 / 0.64)",
      "glass-thick": "oklch(0.2 0.025 48 / 0.88)",
      "glass-border": "oklch(0.94 0.025 48 / 0.11)",
      "glass-highlight": "oklch(0.98 0.018 48 / 0.11)"
    }
  }
};
function Yf(e, t, a = Hf) {
  const n = qd(a, e), s = oc.find((r) => r.name === t) ?? oc[0], i = If(s, e);
  return {
    background: n[0],
    sidebar: n[1],
    surface: e === "light" ? qf : n[2],
    border: n[5],
    text: n[11],
    muted: n[10],
    accent: i[8],
    accentSoft: i[2]
  };
}
const Os = (e, t, a) => ({
  id: e,
  scheme: t,
  accent: a,
  preview: Yf(t, a, jf[e]?.neutral)
});
Os("light", "light", "blue"), Os("dark", "dark", "blue"), Os("dawn", "light", "red"), Os("boreal", "dark", "green"), Os("ember", "dark", "amber");
var Bs = /* @__PURE__ */ ((e) => (e.FadeIn = "fade-in", e.FadeOut = "fade-out", e.ScaleIn = "scale-in", e.ScaleOut = "scale-out", e.SlideUp = "slide-up", e.SlideDown = "slide-down", e.SlideLeft = "slide-left", e.SlideRight = "slide-right", e.Collapse = "collapse", e.Expand = "expand", e.Shake = "shake", e.Pulse = "pulse", e.Bounce = "bounce", e.Shimmer = "shimmer", e))(Bs || {}), Ge = /* @__PURE__ */ ((e) => (e.Instant = "instant", e.Fast = "fast", e.Normal = "normal", e.Slow = "slow", e.Slower = "slower", e))(Ge || {}), nt = /* @__PURE__ */ ((e) => (e.Out = "out", e.InOut = "in-out", e.Spring = "spring", e.Exit = "exit", e))(nt || {}), xa = /* @__PURE__ */ ((e) => (e.Snappy = "snappy", e.Smooth = "smooth", e.Bouncy = "bouncy", e))(xa || {});
const Vf = {
  snappy: { type: "spring", stiffness: 520, damping: 38, mass: 0.9 },
  smooth: { type: "spring", stiffness: 300, damping: 34, mass: 1 },
  bouncy: { type: "spring", stiffness: 460, damping: 26, mass: 1 }
};
function Ya(e = "snappy") {
  return { ...Vf[e] };
}
function Ke(e = "normal", t = "out") {
  return {
    duration: Fd[e] / 1e3,
    ease: [...Bf[t]]
  };
}
function hi(e, t, a) {
  const n = (s, i) => Ke(t ?? s, i);
  switch (e) {
    case "fade-in":
      return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: n(
        "normal",
        "out"
        /* Out */
      ) };
    case "fade-out":
      return { initial: { opacity: 1 }, animate: { opacity: 0 }, transition: n(
        "fast",
        "exit"
        /* Exit */
      ) };
    case "scale-in":
      return {
        initial: { opacity: 0, scale: 0.96 },
        animate: { opacity: 1, scale: 1 },
        exit: { opacity: 0, scale: 0.98 },
        transition: n(
          "fast",
          "out"
          /* Out */
        )
      };
    case "scale-out":
      return { initial: { opacity: 1, scale: 1 }, animate: { opacity: 0, scale: 0.96 }, transition: n(
        "fast",
        "exit"
        /* Exit */
      ) };
    case "slide-up":
      return { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 8 }, transition: n(
        "normal",
        "out"
        /* Out */
      ) };
    case "slide-down":
      return { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: n(
        "normal",
        "out"
        /* Out */
      ) };
    case "slide-left":
      return { initial: { opacity: 0, x: 8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 8 }, transition: n(
        "normal",
        "out"
        /* Out */
      ) };
    case "slide-right":
      return { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -8 }, transition: n(
        "normal",
        "out"
        /* Out */
      ) };
    case "collapse":
      return {
        initial: { height: "auto", opacity: 1 },
        animate: { height: 0, opacity: 0 },
        transition: n(
          "normal",
          "in-out"
          /* InOut */
        ),
        style: { overflow: "hidden" }
      };
    case "expand":
      return {
        initial: { height: 0, opacity: 0 },
        animate: { height: "auto", opacity: 1 },
        exit: { height: 0, opacity: 0 },
        transition: n(
          "normal",
          "in-out"
          /* InOut */
        ),
        style: { overflow: "hidden" }
      };
    case "shake":
      return { animate: { x: [0, -6, 6, -4, 4, 0] }, transition: { duration: Fd.slow / 1e3, ease: "easeInOut" } };
    case "pulse":
      return { animate: { scale: [1, 1.04, 1] }, transition: { duration: 1.2, ease: "easeInOut", repeat: 1 / 0 } };
    case "bounce":
      return { animate: { y: [0, -6, 0] }, transition: { duration: 0.6, ease: "easeOut", repeat: 1 / 0, repeatDelay: 0.4 } };
    case "shimmer":
      return { animate: { opacity: [0.45, 1, 0.45] }, transition: { duration: 1.4, ease: "easeInOut", repeat: 1 / 0 } };
  }
}
const Gf = {
  surface: 0.99,
  control: 0.97,
  chip: 0.96,
  compact: 0.94
};
function ni(e = "control", t = !1) {
  return t ? void 0 : { scale: Gf[e] };
}
Ke(
  "fast",
  "out"
  /* Out */
);
Ke(
  "fast",
  "out"
  /* Out */
);
const I = (...e) => e.filter(Boolean).join(" "), vW = ["en", "es", "fr", "de", "ja", "pt", "zh", "ar"], Kf = "en", Uf = /* @__PURE__ */ new Set(["ar"]);
function wW(e) {
  return Uf.has(e) ? "rtl" : "ltr";
}
function kW(e) {
  return e;
}
function Xf(e, t) {
  return t ? e.replace(
    /\{(\w+)\}/g,
    (a, n) => n in t ? String(t[n]) : a
  ) : e;
}
const Ur = _a({ locale: Kf });
function _W({ locale: e, children: t }) {
  const a = Bt(() => ({ locale: e }), [e]);
  return /* @__PURE__ */ c(Ur.Provider, { value: a, children: t });
}
function Xr() {
  return Gn(Ur).locale;
}
function st() {
  const { locale: e } = Gn(Ur);
  return at((t, a) => Xf(t[e], a), [e]);
}
const _e = {
  dismiss: { en: "Dismiss", es: "Descartar", fr: "Ignorer", de: "Verwerfen", ja: "閉じる", pt: "Descartar", zh: "关闭", ar: "إغلاق" },
  close: { en: "Close", es: "Cerrar", fr: "Fermer", de: "Schließen", ja: "閉じる", pt: "Fechar", zh: "关闭", ar: "إغلاق" },
  cancel: { en: "Cancel", es: "Cancelar", fr: "Annuler", de: "Abbrechen", ja: "キャンセル", pt: "Cancelar", zh: "取消", ar: "إلغاء" },
  closeTour: { en: "Close tour", es: "Cerrar el recorrido", fr: "Fermer la visite", de: "Tour schließen", ja: "ツアーを閉じる", pt: "Fechar tour", zh: "关闭导览", ar: "إغلاق الجولة" },
  previous: { en: "Previous", es: "Anterior", fr: "Précédent", de: "Zurück", ja: "前へ", pt: "Anterior", zh: "上一个", ar: "السابق" },
  next: { en: "Next", es: "Siguiente", fr: "Suivant", de: "Weiter", ja: "次へ", pt: "Próximo", zh: "下一个", ar: "التالي" },
  clearSearch: { en: "Clear search", es: "Borrar búsqueda", fr: "Effacer la recherche", de: "Suche löschen", ja: "検索をクリア", pt: "Limpar pesquisa", zh: "清空搜索", ar: "مسح البحث" },
  oneTimeCode: { en: "One-time code", es: "Código de un solo uso", fr: "Code à usage unique", de: "Einmalcode", ja: "ワンタイムコード", pt: "Código de uso único", zh: "一次性验证码", ar: "رمز لمرة واحدة" },
  decrease: { en: "Decrease", es: "Disminuir", fr: "Diminuer", de: "Verringern", ja: "減らす", pt: "Diminuir", zh: "减少", ar: "تقليل" },
  increase: { en: "Increase", es: "Aumentar", fr: "Augmenter", de: "Erhöhen", ja: "増やす", pt: "Aumentar", zh: "增加", ar: "زيادة" },
  openNavigation: { en: "Open navigation", es: "Abrir navegación", fr: "Ouvrir la navigation", de: "Navigation öffnen", ja: "ナビゲーションを開く", pt: "Abrir navegação", zh: "打开导航", ar: "فتح الملاحة" },
  closeNavigation: { en: "Close navigation", es: "Cerrar navegación", fr: "Fermer la navigation", de: "Navigation schließen", ja: "ナビゲーションを閉じる", pt: "Fechar navegação", zh: "关闭导航", ar: "إغلاق الملاحة" },
  resizeSidebar: { en: "Resize sidebar", es: "Redimensionar la barra lateral", fr: "Redimensionner la barre latérale", de: "Seitenleiste anpassen", ja: "サイドバーのサイズを変更", pt: "Redimensionar barra lateral", zh: "调整侧边栏大小", ar: "تغيير حجم الشريط الجانبي" },
  loading: { en: "Loading", es: "Cargando", fr: "Chargement", de: "Wird geladen", ja: "読み込み中", pt: "Carregando", zh: "加载中", ar: "جاري التحميل" },
  noOptions: { en: "No options", es: "Sin opciones", fr: "Aucune option", de: "Keine Optionen", ja: "選択肢がありません", pt: "Nenhuma opção", zh: "无选项", ar: "لا توجد خيارات" },
  copy: { en: "Copy", es: "Copiar", fr: "Copier", de: "Kopieren", ja: "コピー", pt: "Copiar", zh: "复制", ar: "نسخ" },
  copied: { en: "Copied", es: "Copiado", fr: "Copié", de: "Kopiert", ja: "コピーしました", pt: "Copiado", zh: "已复制", ar: "تم النسخ" },
  back: { en: "Back", es: "Atrás", fr: "Retour", de: "Zurück", ja: "戻る", pt: "Voltar", zh: "返回", ar: "رجوع" },
  done: { en: "Done", es: "Listo", fr: "Terminé", de: "Fertig", ja: "完了", pt: "Concluído", zh: "完成", ar: "تم" },
  less: { en: "Less", es: "Menos", fr: "Moins", de: "Weniger", ja: "少なく", pt: "Menos", zh: "少于", ar: "أقل" },
  more: { en: "More", es: "Más", fr: "Plus", de: "Mehr", ja: "もっと", pt: "Mais", zh: "更多", ar: "أكثر" },
  densityExtraCompact: { en: "Extra Compact", es: "Extracompacta", fr: "Très compacte", de: "Extra kompakt", ja: "超コンパクト", pt: "Extra compacta", zh: "超紧凑", ar: "مضغوط للغاية" },
  densityCompact: { en: "Compact", es: "Compacta", fr: "Compacte", de: "Kompakt", ja: "コンパクト", pt: "Compacta", zh: "紧凑", ar: "مضغوط" },
  densityDefault: { en: "Default", es: "Predeterminado", fr: "Par défaut", de: "Standard", ja: "デフォルト", pt: "Padrão", zh: "默认", ar: "افتراضي" },
  densityComfortable: { en: "Comfortable", es: "Cómoda", fr: "Confortable", de: "Komfortabel", ja: "ゆったり", pt: "Confortável", zh: "宽松", ar: "مريح" },
  densityMoreSpace: { en: "More Space", es: "Más espacio", fr: "Plus d’espace", de: "Mehr Platz", ja: "間隔を広く", pt: "Mais espaço", zh: "更多间距", ar: "مساحة أكبر" },
  /** Parameterized: t(kitMessages.stepOf, { step, total }). */
  stepOf: { en: "Step {step} of {total}", es: "Paso {step} de {total}", fr: "Étape {step} sur {total}", de: "Schritt {step} von {total}", ja: "ステップ {step}/{total}", pt: "Etapa {step} de {total}", zh: "第 {step} 步，共 {total} 步", ar: "الخطوة {step} من {total}" }
}, Jf = "_skeleton_1o0kf_1", Qf = "_shimmer_1o0kf_1", Zf = "_text_1o0kf_20", eg = "_rect_1o0kf_26", tg = "_circle_1o0kf_30", ng = "_skeletonPulse_1o0kf_1", ic = {
  skeleton: Jf,
  shimmer: Qf,
  text: Zf,
  rect: eg,
  circle: tg,
  skeletonPulse: ng
};
function J({
  variant: e = "rect",
  width: t,
  height: a,
  radius: n,
  className: s,
  style: i,
  ...r
}) {
  const l = {
    width: t,
    height: a ?? (e === "circle" ? t : void 0),
    borderRadius: n
  };
  return /* @__PURE__ */ c(
    "span",
    {
      "aria-hidden": "true",
      "data-skeleton": "true",
      className: I(ic.skeleton, ic[e], s),
      style: { ...l, ...i },
      ...r
    }
  );
}
const ag = "_spinner_langt_2", og = "_spin_langt_2", sg = "_accent_langt_14", ig = "_inherit_langt_18", rg = "_spinnerSm_langt_22", lg = "_spinnerMd_langt_27", cg = "_spinnerLg_langt_32", dg = "_spinnerPulse_langt_1", ug = "_track_langt_62", hg = "_trackSm_langt_70", mg = "_trackMd_langt_74", pg = "_fill_langt_78", fg = "_success_langt_85", gg = "_warning_langt_86", bg = "_danger_langt_87", yg = "_indeterminate_langt_89", vg = "_sweep_langt_1", wg = "_indeterminatePulse_langt_1", kg = "_skeletonRing_langt_125", Ra = {
  spinner: ag,
  spin: og,
  accent: sg,
  inherit: ig,
  spinnerSm: rg,
  spinnerMd: lg,
  spinnerLg: cg,
  spinnerPulse: dg,
  track: ug,
  trackSm: hg,
  trackMd: mg,
  fill: pg,
  success: fg,
  warning: gg,
  danger: bg,
  indeterminate: yg,
  sweep: vg,
  indeterminatePulse: wg,
  skeletonRing: kg
}, _g = { sm: "spinnerSm", md: "spinnerMd", lg: "spinnerLg" }, xg = {
  sm: "1em",
  md: "var(--glacier-size-md)",
  lg: "1.875rem"
}, Sg = {
  sm: "2px",
  md: "2px",
  lg: "3px"
};
function Mg({ size: e = "md", tone: t = "subtle", skeleton: a = !1, className: n, ...s }) {
  const i = st(), r = s["aria-label"] ?? i(_e.loading);
  return a ? /* @__PURE__ */ c(
    J,
    {
      variant: De.Circle,
      width: xg[e],
      className: I(Ra.skeletonRing, n),
      style: { "--spinner-thickness": Sg[e] }
    }
  ) : /* @__PURE__ */ c(
    "span",
    {
      role: "status",
      "aria-label": r === "" ? void 0 : r,
      "aria-hidden": r === "" || void 0,
      className: I(Ra.spinner, Ra[_g[e]], t !== "subtle" && Ra[t], n),
      ...s
    }
  );
}
const $g = "_button_106d7_1", Tg = "_bloom_106d7_1", Cg = "_sm_106d7_49", Ng = "_md_106d7_54", Dg = "_lg_106d7_59", zg = "_solid_106d7_66", Pg = "_soft_106d7_74", Ag = "_outline_106d7_82", Og = "_ghost_106d7_91", Eg = "_danger_106d7_102", Wg = "_glass_106d7_110", Ig = "_fullWidth_106d7_127", Rg = "_icon_106d7_132", io = {
  button: $g,
  bloom: Tg,
  sm: Cg,
  md: Ng,
  lg: Dg,
  solid: zg,
  soft: Pg,
  outline: Ag,
  ghost: Og,
  danger: Eg,
  glass: Wg,
  fullWidth: Ig,
  icon: Rg
}, Lg = { sm: "5rem", md: "6.5rem", lg: "8rem" };
function wa({
  variant: e = "solid",
  size: t = "md",
  loading: a = !1,
  skeleton: n = !1,
  fullWidth: s = !1,
  disabled: i,
  className: r,
  children: l,
  ...d
}) {
  const u = Re(), m = i || a;
  return n ? /* @__PURE__ */ c(
    J,
    {
      width: s ? "100%" : Lg[t],
      height: `var(--glacier-control-height-${t})`,
      radius: "var(--glacier-control-radius)",
      className: r
    }
  ) : /* @__PURE__ */ P(
    $e.button,
    {
      type: "button",
      className: I(io.button, io[e], io[t], s && io.fullWidth, r),
      disabled: m,
      "data-loading": a || void 0,
      whileTap: ni("control", u || m),
      transition: Ke(Ge.Fast, nt.Out),
      ...d,
      children: [
        a && /* @__PURE__ */ c(Mg, { size: gn.Small, tone: Id.Inherit, "aria-label": "" }),
        l
      ]
    }
  );
}
function Yn({
  variant: e = "ghost",
  size: t = "md",
  skeleton: a = !1,
  disabled: n,
  className: s,
  children: i,
  ...r
}) {
  const l = Re();
  return a ? /* @__PURE__ */ c(
    J,
    {
      width: `var(--glacier-control-height-${t})`,
      height: `var(--glacier-control-height-${t})`,
      radius: "var(--glacier-control-radius)",
      className: s
    }
  ) : /* @__PURE__ */ c(
    $e.button,
    {
      type: "button",
      className: I(io.button, io.icon, io[e], io[t], s),
      disabled: n,
      whileTap: ni("compact", l || n),
      transition: Ke(Ge.Fast, nt.Out),
      ...r,
      children: i
    }
  );
}
const Bd = _a(null), Sa = () => Gn(Bd), qg = "_input_1ples_1", Fg = "_glass_1ples_43", Bg = "_wrap_1ples_53", Hg = "_leadingIcon_1ples_60", jg = "_trailingIcon_1ples_61", Yg = "_lg_1ples_86", Vg = "_sm_1ples_93", Gg = "_md_1ples_98", ns = {
  input: qg,
  glass: Fg,
  wrap: Bg,
  leadingIcon: Hg,
  trailingIcon: jg,
  lg: Yg,
  sm: Vg,
  md: Gg
};
function xW({
  size: e = "md",
  skeleton: t = !1,
  glass: a = !1,
  leadingIcon: n,
  trailingIcon: s,
  className: i,
  id: r,
  ...l
}) {
  const d = Sa();
  if (t)
    return /* @__PURE__ */ c(
      J,
      {
        width: "100%",
        height: `var(--glacier-control-height-${e})`,
        radius: "var(--glacier-radius-lg)",
        className: i
      }
    );
  const u = /* @__PURE__ */ c(
    "input",
    {
      id: r ?? d?.id,
      "aria-describedby": d?.describedBy,
      "aria-invalid": d?.invalid || void 0,
      className: I(ns.input, ns[e], a && ns.glass, i),
      "data-leading": n ? "" : void 0,
      "data-trailing": s ? "" : void 0,
      ...l
    }
  );
  return !n && !s ? u : /* @__PURE__ */ P("div", { className: ns.wrap, children: [
    n && /* @__PURE__ */ c("span", { className: ns.leadingIcon, children: n }),
    u,
    s && /* @__PURE__ */ c("span", { className: ns.trailingIcon, children: s })
  ] });
}
function He(e, t) {
  const [a, n] = pe(t), s = e !== void 0, i = s ? e : a, r = at(
    (l) => {
      s || n(l);
    },
    [s]
  );
  return [i, r];
}
const Kg = "_control_pxywd_1", Ug = "_disabled_pxywd_13", Xg = "_nativeInput_pxywd_18", Jg = "_box_pxywd_31", Qg = "_dot_pxywd_32", Zg = "_track_pxywd_33", eb = "_dotInner_pxywd_84", tb = "_dotCss_pxywd_92", nb = "_trackSm_pxywd_124", ab = "_thumb_pxywd_133", ob = "_thumbSm_pxywd_143", sb = "_glass_pxywd_151", ot = {
  control: Kg,
  disabled: Ug,
  nativeInput: Xg,
  box: Jg,
  dot: Qg,
  track: Zg,
  dotInner: eb,
  dotCss: tb,
  trackSm: nb,
  thumb: ab,
  thumbSm: ob,
  glass: sb
};
function rc({
  label: e,
  checked: t,
  defaultChecked: a = !1,
  onCheckedChange: n,
  indeterminate: s = !1,
  disabled: i,
  skeleton: r = !1,
  glass: l = !1,
  className: d,
  ...u
}) {
  const [m, h] = He(t, a), f = Re(), b = ee(null), w = s && !m;
  return xe(() => {
    b.current && (b.current.indeterminate = w);
  }, [w]), r ? /* @__PURE__ */ P("span", { className: I(ot.control, d), children: [
    /* @__PURE__ */ c(J, { width: "1.375rem", height: "1.375rem", radius: "var(--glacier-radius-sm)" }),
    e && /* @__PURE__ */ c(J, { variant: De.Text, width: "6rem" })
  ] }) : /* @__PURE__ */ P("label", { className: I(ot.control, i && ot.disabled, d), children: [
    /* @__PURE__ */ c(
      "input",
      {
        ref: b,
        type: "checkbox",
        className: ot.nativeInput,
        checked: m,
        disabled: i,
        "data-haptic": "selection",
        onChange: (S) => {
          h(S.target.checked), n?.(S.target.checked);
        },
        ...u
      }
    ),
    /* @__PURE__ */ c(
      "span",
      {
        className: I(ot.box, l && ot.glass),
        "data-checked": m || w || void 0,
        "aria-hidden": "true",
        children: /* @__PURE__ */ P("svg", { viewBox: "0 0 12 12", fill: "none", children: [
          /* @__PURE__ */ c(
            $e.path,
            {
              d: "M2.5 6.5 L5 8.75 L9.5 3.5",
              stroke: "currentColor",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round",
              initial: !1,
              animate: { pathLength: m ? 1 : 0, opacity: m ? 1 : 0 },
              transition: f ? { duration: 0 } : Ke(Ge.Fast, nt.Out)
            }
          ),
          /* @__PURE__ */ c(
            $e.path,
            {
              d: "M3 6 H9",
              stroke: "currentColor",
              strokeWidth: 2,
              strokeLinecap: "round",
              initial: !1,
              animate: { pathLength: w ? 1 : 0, opacity: w ? 1 : 0 },
              transition: f ? { duration: 0 } : Ke(Ge.Fast, nt.Out)
            }
          )
        ] })
      }
    ),
    e && /* @__PURE__ */ c("span", { children: e })
  ] });
}
function SW({
  label: e,
  disabled: t = !1,
  skeleton: a = !1,
  glass: n = !1,
  className: s,
  ...i
}) {
  return a ? /* @__PURE__ */ P("span", { className: I(ot.control, s), children: [
    /* @__PURE__ */ c(J, { variant: De.Circle, width: "1.375rem" }),
    e && /* @__PURE__ */ c(J, { variant: De.Text, width: "6rem" })
  ] }) : /* @__PURE__ */ P("label", { className: I(ot.control, t && ot.disabled, s), children: [
    /* @__PURE__ */ c("input", { type: "radio", className: ot.nativeInput, disabled: t, "data-haptic": "selection", ...i }),
    /* @__PURE__ */ c(ib, { checked: i.checked ?? void 0, glass: n }),
    e && /* @__PURE__ */ c("span", { children: e })
  ] });
}
function ib({ checked: e, glass: t }) {
  const a = Re();
  return e === void 0 ? /* @__PURE__ */ c("span", { className: I(ot.dot, t && ot.glass), "aria-hidden": "true", children: /* @__PURE__ */ c("span", { className: I(ot.dotInner, ot.dotCss) }) }) : /* @__PURE__ */ c(
    "span",
    {
      className: I(ot.dot, t && ot.glass),
      "data-checked": e || void 0,
      "aria-hidden": "true",
      children: /* @__PURE__ */ c(
        $e.span,
        {
          className: ot.dotInner,
          initial: !1,
          animate: { scale: e ? 1 : 0, opacity: e ? 1 : 0 },
          transition: a ? { duration: 0 } : Ke(Ge.Fast, nt.Spring)
        }
      )
    }
  );
}
const rb = { sm: 16, md: 18 }, lb = { sm: "2.25rem", md: "2.75rem" }, cb = { sm: "1.25rem", md: "1.625rem" };
function MW({
  label: e,
  checked: t,
  defaultChecked: a = !1,
  onCheckedChange: n,
  disabled: s,
  size: i = "md",
  skeleton: r = !1,
  glass: l = !1,
  className: d,
  ...u
}) {
  const [m, h] = He(t, a), f = Re();
  return r ? /* @__PURE__ */ P("span", { className: I(ot.control, d), children: [
    /* @__PURE__ */ c(
      J,
      {
        width: lb[i],
        height: cb[i],
        radius: "var(--glacier-radius-full)"
      }
    ),
    e && /* @__PURE__ */ c(J, { variant: De.Text, width: "6rem" })
  ] }) : /* @__PURE__ */ P("label", { className: I(ot.control, s && ot.disabled, d), children: [
    /* @__PURE__ */ c(
      "input",
      {
        type: "checkbox",
        role: "switch",
        className: ot.nativeInput,
        checked: m,
        disabled: s,
        "data-haptic": "selection",
        onChange: (b) => {
          h(b.target.checked), n?.(b.target.checked);
        },
        ...u
      }
    ),
    /* @__PURE__ */ c(
      "span",
      {
        className: I(ot.track, i === "sm" && ot.trackSm, l && ot.glass),
        "data-checked": m || void 0,
        "aria-hidden": "true",
        children: /* @__PURE__ */ c(
          $e.span,
          {
            className: I(ot.thumb, i === "sm" && ot.thumbSm),
            initial: !1,
            animate: { x: m ? rb[i] : 0 },
            transition: f ? { duration: 0 } : Ya(xa.Snappy)
          }
        )
      }
    ),
    e && /* @__PURE__ */ c("span", { children: e })
  ] });
}
const db = "_surface_l9qpk_1", ub = "_card_l9qpk_11", hb = "_glass_l9qpk_21", mb = "_interactive_l9qpk_63", Ao = {
  surface: db,
  card: ub,
  glass: hb,
  interactive: mb
};
function $W({
  elevation: e = 1,
  interactive: t = !1,
  variant: a = "solid",
  skeleton: n = !1,
  className: s,
  children: i,
  ...r
}) {
  const l = Re();
  return n ? /* @__PURE__ */ c(
    "div",
    {
      className: I(Ao.card, a === "glass" && Ao.glass, s),
      "data-elevation": e,
      children: /* @__PURE__ */ P("span", { style: { display: "grid", gap: "var(--glacier-space-2)" }, children: [
        /* @__PURE__ */ c(J, { variant: De.Text, width: "40%" }),
        /* @__PURE__ */ c(J, { variant: De.Text, width: "100%" }),
        /* @__PURE__ */ c(J, { variant: De.Text, width: "85%" })
      ] })
    }
  ) : /* @__PURE__ */ c(
    $e.div,
    {
      className: I(Ao.card, a === "glass" && Ao.glass, t && Ao.interactive, s),
      "data-elevation": e,
      whileHover: t && !l ? { y: -2 } : void 0,
      whileTap: ni("surface", l || !t),
      transition: Ke(Ge.Fast, nt.Out),
      ...r,
      children: i
    }
  );
}
function TW({ level: e = 1, skeleton: t = !1, glass: a = !1, className: n, children: s, ...i }) {
  return t ? /* @__PURE__ */ c(J, { width: "100%", height: "6rem", radius: "var(--glacier-radius-lg)", className: n }) : /* @__PURE__ */ c("div", { className: I(Ao.surface, a && Ao.glass, n), "data-level": e, ...i, children: s });
}
const pb = "_text_15dye_2", fb = "_xs_15dye_7", gb = "_sm_15dye_12", bb = "_md_15dye_17", yb = "_lg_15dye_22", vb = "_mono_15dye_75", wb = "_heading_15dye_98", kb = "_noMargin_15dye_105", _b = "_h1_15dye_109", xb = "_h2_15dye_116", Sb = "_h3_15dye_122", Mb = "_h4_15dye_128", $b = "_h5_15dye_133", Tb = "_h6_15dye_138", Cb = "_label_15dye_147", Nb = "_labelRequired_15dye_156", Db = "_link_15dye_161", zb = "_kbd_15dye_180", Pb = "_glass_15dye_193", tn = {
  text: pb,
  xs: fb,
  sm: gb,
  md: bb,
  lg: yb,
  "tone-default": "_tone-default_15dye_31",
  "tone-muted": "_tone-muted_15dye_35",
  "tone-subtle": "_tone-subtle_15dye_39",
  "tone-accent": "_tone-accent_15dye_43",
  "tone-danger": "_tone-danger_15dye_47",
  "tone-success": "_tone-success_15dye_51",
  "tone-warning": "_tone-warning_15dye_55",
  "weight-regular": "_weight-regular_15dye_59",
  "weight-medium": "_weight-medium_15dye_63",
  "weight-semibold": "_weight-semibold_15dye_67",
  "weight-bold": "_weight-bold_15dye_71",
  mono: vb,
  "align-start": "_align-start_15dye_81",
  "align-center": "_align-center_15dye_85",
  "align-end": "_align-end_15dye_89",
  "align-justify": "_align-justify_15dye_93",
  heading: wb,
  noMargin: kb,
  h1: _b,
  h2: xb,
  h3: Sb,
  h4: Mb,
  h5: $b,
  h6: Tb,
  label: Cb,
  labelRequired: Nb,
  link: Db,
  kbd: zb,
  glass: Pb
};
function Pi({
  as: e = "p",
  size: t = "md",
  tone: a = "default",
  weight: n = "regular",
  mono: s = !1,
  align: i,
  skeleton: r = !1,
  className: l,
  children: d,
  ...u
}) {
  return r ? /* @__PURE__ */ c(
    "span",
    {
      className: l,
      style: {
        display: "flex",
        alignItems: "center",
        height: `calc(var(--glacier-leading-${t}) * var(--glacier-font-size-${t}))`
      },
      children: /* @__PURE__ */ c(J, { variant: De.Text, width: "14ch", style: { fontSize: `var(--glacier-font-size-${t})` } })
    }
  ) : /* @__PURE__ */ c(
    e,
    {
      className: I(
        tn.text,
        tn[t],
        tn[`tone-${a}`],
        tn[`weight-${n}`],
        s && tn.mono,
        i && tn[`align-${i}`],
        l
      ),
      ...u,
      children: d
    }
  );
}
const Ab = {
  1: "var(--glacier-font-size-3xl)",
  2: "var(--glacier-font-size-2xl)",
  3: "var(--glacier-font-size-xl)",
  4: "var(--glacier-font-size-lg)",
  5: "var(--glacier-font-size-md)",
  6: "var(--glacier-font-size-sm)"
};
function sa({
  level: e = 2,
  visualLevel: t,
  align: a,
  noMargin: n = !1,
  skeleton: s = !1,
  className: i,
  children: r,
  ...l
}) {
  if (s)
    return /* @__PURE__ */ c(
      J,
      {
        variant: De.Text,
        width: "10ch",
        className: i,
        style: { fontSize: Ab[t ?? e] }
      }
    );
  const d = `h${e}`;
  return /* @__PURE__ */ c(
    d,
    {
      className: I(
        tn.heading,
        tn[`h${t ?? e}`],
        a && tn[`align-${a}`],
        n && tn.noMargin,
        i
      ),
      ...l,
      children: r
    }
  );
}
function CW({ required: e = !1, skeleton: t = !1, className: a, children: n, ...s }) {
  return t ? /* @__PURE__ */ c(
    J,
    {
      variant: De.Text,
      width: "6ch",
      className: a,
      style: { fontSize: "var(--glacier-font-size-sm)" }
    }
  ) : /* @__PURE__ */ P("label", { className: I(tn.label, a), ...s, children: [
    n,
    e && /* @__PURE__ */ P("span", { className: tn.labelRequired, "aria-hidden": "true", children: [
      " ",
      "*"
    ] })
  ] });
}
function NW({ skeleton: e = !1, className: t, children: a, ...n }) {
  return e ? /* @__PURE__ */ c(J, { variant: De.Text, width: "8ch", className: t }) : /* @__PURE__ */ c("a", { className: I(tn.link, t), ...n, children: a });
}
function DW({ skeleton: e = !1, glass: t = !1, className: a, children: n, ...s }) {
  return e ? /* @__PURE__ */ c(
    J,
    {
      width: "2.25rem",
      height: "1.375rem",
      radius: "var(--glacier-radius-sm)",
      className: a
    }
  ) : /* @__PURE__ */ c("kbd", { className: I(tn.kbd, t && tn.glass, a), ...s, children: n });
}
const Ob = "_pill_fdx4n_1", Eb = "_sm_fdx4n_13", Wb = "_md_fdx4n_19", Ib = "_icon_fdx4n_26", Rb = "_remove_fdx4n_35", Lb = "_soft_fdx4n_66", qb = "_neutral_fdx4n_66", Fb = "_accent_fdx4n_67", Bb = "_success_fdx4n_68", Hb = "_warning_fdx4n_69", jb = "_danger_fdx4n_70", Yb = "_info_fdx4n_71", Vb = "_solid_fdx4n_74", Gb = "_outline_fdx4n_82", Kb = "_glass_fdx4n_90", yo = {
  pill: Ob,
  sm: Eb,
  md: Wb,
  icon: Ib,
  remove: Rb,
  soft: Lb,
  neutral: qb,
  accent: Fb,
  success: Bb,
  warning: Hb,
  danger: jb,
  info: Yb,
  solid: Vb,
  outline: Gb,
  glass: Kb
}, lc = {
  sm: { width: "3.5rem", height: "1.375rem" },
  md: { width: "4.5rem", height: "1.75rem" }
};
function zW({
  tone: e = "neutral",
  variant: t = "soft",
  size: a = "md",
  icon: n,
  onRemove: s,
  skeleton: i = !1,
  glass: r = !1,
  className: l,
  children: d,
  ...u
}) {
  const m = st();
  return i ? /* @__PURE__ */ c(
    J,
    {
      width: lc[a].width,
      height: lc[a].height,
      radius: "var(--glacier-radius-full)",
      className: l
    }
  ) : /* @__PURE__ */ P("span", { className: I(yo.pill, yo[t], yo[e], yo[a], r && yo.glass, l), ...u, children: [
    n != null && /* @__PURE__ */ c("span", { className: yo.icon, "aria-hidden": "true", children: n }),
    d,
    s && /* @__PURE__ */ c("button", { type: "button", className: yo.remove, "aria-label": m(_e.dismiss), onClick: s, children: /* @__PURE__ */ c("svg", { width: "10", height: "10", viewBox: "0 0 10 10", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M2 2l6 6M8 2l-6 6", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }) }) })
  ] });
}
const Ub = "_horizontal_kv2e8_1", Xb = "_vertical_kv2e8_9", Jb = "_labeled_kv2e8_17", fr = {
  horizontal: Ub,
  vertical: Xb,
  labeled: Jb
};
function cc({
  orientation: e = "horizontal",
  label: t,
  skeleton: a = !1,
  className: n,
  ...s
}) {
  return a ? e === "vertical" ? /* @__PURE__ */ c(J, { width: "var(--glacier-hairline)", height: "1.5rem", className: n }) : /* @__PURE__ */ c(J, { width: "100%", height: "var(--glacier-hairline)", className: n }) : t ? /* @__PURE__ */ c("div", { role: "separator", className: I(fr.labeled, n), children: t }) : e === "vertical" ? /* @__PURE__ */ c("div", { role: "separator", "aria-orientation": "vertical", className: I(fr.vertical, n) }) : /* @__PURE__ */ c("hr", { className: I(fr.horizontal, n), ...s });
}
const Qb = "_root_141da_1", Zb = "_backfill_141da_14", dc = {
  root: Qb,
  backfill: Zb
};
function PW({ children: e, color: t, size: a, className: n, style: s, ...i }) {
  const r = t ?? e.props.color, l = a ?? e.props.size, d = r ? Xs(e, { color: r }) : e, u = Xs(e, {
    "aria-hidden": !0,
    "data-icon-backfill": !0,
    className: dc.backfill,
    color: r,
    fill: "currentColor",
    stroke: "currentColor",
    strokeWidth: 4
  });
  return /* @__PURE__ */ P(
    "span",
    {
      ...i,
      className: I(dc.root, n),
      style: { color: r, fontSize: l, ...s },
      children: [
        u,
        d
      ]
    }
  );
}
const ey = { sm: "trackSm", md: "trackMd" }, ty = { sm: "0.375rem", md: "0.625rem" };
function AW({
  value: e,
  max: t = 100,
  indeterminate: a = !1,
  size: n = "md",
  tone: s = "accent",
  skeleton: i = !1,
  className: r,
  ...l
}) {
  const d = a || e === void 0, u = d ? 0 : Math.min(Math.max(e, 0), t);
  return i ? /* @__PURE__ */ c(
    J,
    {
      width: "100%",
      height: ty[n],
      radius: "var(--glacier-radius-full)",
      className: r
    }
  ) : /* @__PURE__ */ c(
    "div",
    {
      role: "progressbar",
      "aria-valuemin": 0,
      "aria-valuemax": t,
      "aria-valuenow": d ? void 0 : u,
      className: I(Ra.track, Ra[ey[n]], d && Ra.indeterminate, r),
      ...l,
      children: /* @__PURE__ */ c(
        "div",
        {
          className: I(Ra.fill, s !== "accent" && Ra[s]),
          style: d ? void 0 : { width: `${u / t * 100}%` }
        }
      )
    }
  );
}
const Or = /* @__PURE__ */ new Set();
function ny(e) {
  return Or.add(e), () => {
    Or.delete(e);
  };
}
function Hd(e) {
  for (const t of Or) t(e);
}
const ay = 'button, [role="button"], a[href], summary, [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], [role="option"], [data-haptic]';
function jd(e) {
  const t = e?.closest(ay);
  if (!t || t.hasAttribute("disabled") || t.getAttribute("aria-disabled") === "true") return null;
  const a = t.dataset.haptic;
  return a === "none" ? null : a || "light";
}
const oy = {
  selection: 8,
  light: 10,
  medium: 18,
  heavy: 26,
  success: [12, 40, 14],
  warning: [16, 60, 16],
  error: [22, 40, 22, 40, 22]
};
let Jr = !1;
function uc(e) {
  Jr = e;
}
function OW() {
  return Jr;
}
const sy = () => typeof navigator < "u" && typeof navigator.vibrate == "function";
let vo = null;
function iy() {
  if (!(typeof document > "u")) {
    if (!vo) {
      const e = document.createElement("label");
      e.setAttribute("aria-hidden", "true"), e.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;opacity:0;pointer-events:none;", vo = document.createElement("input"), vo.type = "checkbox", vo.setAttribute("switch", ""), e.appendChild(vo), document.body.appendChild(e);
    }
    vo.checked = !vo.checked;
  }
}
function Qr(e = "light") {
  if (Jr) {
    if (sy()) {
      navigator.vibrate(oy[e]);
      return;
    }
    iy();
  }
}
function EW(e = "light") {
  Qr(e), Hd({ kind: e });
}
const Yd = _a(Qr), Ai = () => Gn(Yd);
function WW({ enabled: e = !1, impl: t, children: a }) {
  const n = t ?? Qr, s = Bt(
    () => (i) => {
      n(i), Hd({ kind: i ?? "light" });
    },
    [n]
  );
  return xe(() => {
    if (uc(e), !e) return;
    const i = (r) => {
      if (r.pointerType !== "touch") return;
      const l = jd(r.target);
      l !== null && n(l);
    };
    return document.addEventListener("pointerdown", i, { capture: !0, passive: !0 }), () => {
      document.removeEventListener("pointerdown", i, { capture: !0 }), uc(!1);
    };
  }, [e, n]), /* @__PURE__ */ c(Yd.Provider, { value: s, children: a });
}
const ry = "_slider_rn1lp_1", ly = "_vertical_rn1lp_21", cy = "_skeletonWrap_rn1lp_137", dy = "_skeletonThumb_rn1lp_151", mi = {
  slider: ry,
  vertical: ly,
  skeletonWrap: cy,
  skeletonThumb: dy
};
function IW({
  value: e,
  defaultValue: t,
  min: a = 0,
  max: n = 100,
  step: s = 1,
  onValueChange: i,
  orientation: r = "horizontal",
  hapticStep: l = 10,
  skeleton: d = !1,
  disabled: u,
  className: m,
  style: h,
  id: f,
  ...b
}) {
  const w = Sa(), S = Ai(), [$, N] = He(e, t ?? a), y = n === a ? 0 : ($ - a) / (n - a) * 100, v = r === "vertical", _ = ee(null), k = ee(!1), M = (A) => {
    if (b["data-haptic"] === "none") return;
    const F = n - a;
    if (F <= 0) return;
    const L = (j) => l > 0 ? Math.floor((j - a) / F * 100 / l) : null;
    if (A === a || A === n) {
      _.current = L(A), k.current || (k.current = !0, S("medium"));
      return;
    }
    if (k.current = !1, l <= 0) return;
    const q = L(A);
    _.current === null && (_.current = L($)), q !== _.current && (_.current = q, S("selection"));
  };
  if (d)
    return /* @__PURE__ */ P(
      "span",
      {
        className: I(mi.skeletonWrap, m),
        "data-vertical": v || void 0,
        style: h,
        "aria-hidden": "true",
        children: [
          /* @__PURE__ */ c(
            J,
            {
              width: v ? "0.375rem" : "100%",
              height: v ? "100%" : "0.375rem",
              radius: "var(--glacier-radius-full)"
            }
          ),
          /* @__PURE__ */ c(J, { variant: De.Circle, width: "1.25rem", className: mi.skeletonThumb })
        ]
      }
    );
  const T = /* @__PURE__ */ c(
    "input",
    {
      type: "range",
      id: f ?? w?.id,
      "aria-describedby": w?.describedBy,
      "aria-orientation": v ? "vertical" : void 0,
      min: a,
      max: n,
      step: s,
      value: $,
      disabled: u,
      onChange: (A) => {
        const F = Number(A.target.value);
        M(F), N(F), i?.(F);
      },
      className: I(mi.slider, !v && m),
      style: { "--slider-fill": `${y}%`, ...v ? void 0 : h },
      ...b
    }
  );
  return v ? /* @__PURE__ */ c("span", { className: I(mi.vertical, m), style: h, children: T }) : T;
}
const uy = "_toggle_fygfw_1", hy = "_glass_fygfw_38", my = "_sm_fygfw_62", py = "_md_fygfw_67", fy = "_lg_fygfw_72", gy = "_iconOnly_fygfw_78", pi = {
  toggle: uy,
  glass: hy,
  sm: my,
  md: py,
  lg: fy,
  iconOnly: gy
}, by = { sm: "4.5rem", md: "5.5rem", lg: "6.5rem" };
function RW({
  pressed: e,
  defaultPressed: t = !1,
  onPressedChange: a,
  size: n = "md",
  iconOnly: s = !1,
  skeleton: i = !1,
  glass: r = !1,
  disabled: l,
  className: d,
  children: u,
  onClick: m,
  ...h
}) {
  const [f, b] = He(e, t), w = Re();
  return i ? /* @__PURE__ */ c(
    J,
    {
      width: s ? `var(--glacier-control-height-${n})` : by[n],
      height: `var(--glacier-control-height-${n})`,
      radius: "var(--glacier-control-radius)",
      className: d
    }
  ) : /* @__PURE__ */ c(
    $e.button,
    {
      type: "button",
      "aria-pressed": f,
      className: I(pi.toggle, pi[n], s && pi.iconOnly, r && pi.glass, d),
      disabled: l,
      whileTap: ni("compact", w || l),
      transition: Ke(Ge.Fast, nt.Out),
      "data-haptic": "selection",
      onClick: (S) => {
        b(!f), a?.(!f), m?.(S);
      },
      ...h,
      children: u
    }
  );
}
const yy = "_meter_qjfoa_1", vy = "_segment_qjfoa_8", wy = "_sm_qjfoa_15", ky = "_md_qjfoa_19", _y = "_danger_qjfoa_27", xy = "_warning_qjfoa_31", Sy = "_success_qjfoa_35", Es = {
  meter: yy,
  segment: vy,
  sm: wy,
  md: ky,
  danger: _y,
  warning: xy,
  success: Sy
}, My = { sm: "0.25rem", md: "0.375rem" };
function $y(e) {
  return e <= 1 / 3 ? "danger" : e <= 2 / 3 ? "warning" : "success";
}
function LW({
  value: e,
  max: t,
  segments: a = 4,
  tone: n = "auto",
  size: s = "md",
  skeleton: i = !1,
  className: r,
  ...l
}) {
  if (i)
    return /* @__PURE__ */ c("div", { className: I(Es.meter, r), children: Array.from({ length: a }, (f, b) => /* @__PURE__ */ c(
      J,
      {
        height: My[s],
        radius: "var(--glacier-radius-full)",
        style: { flex: 1 }
      },
      b
    )) });
  const d = t ?? a, u = Math.min(Math.max(e, 0), d), m = Math.round(u / d * a), h = n === "auto" ? $y(u / d) : n;
  return /* @__PURE__ */ c(
    "div",
    {
      role: "meter",
      "aria-valuemin": 0,
      "aria-valuemax": d,
      "aria-valuenow": u,
      className: I(
        Es.meter,
        Es[s],
        h !== "accent" && Es[h],
        r
      ),
      ...l,
      children: Array.from({ length: a }, (f, b) => /* @__PURE__ */ c("span", { className: Es.segment, "data-filled": b < m || void 0 }, b))
    }
  );
}
const Ty = "_textarea_1sv6q_1", Cy = "_sm_1sv6q_46", Ny = "_md_1sv6q_51", Dy = "_lg_1sv6q_56", zy = "_glass_1sv6q_62", gr = {
  textarea: Ty,
  sm: Cy,
  md: Ny,
  lg: Dy,
  glass: zy
};
function qW({
  size: e = "md",
  skeleton: t = !1,
  glass: a = !1,
  className: n,
  id: s,
  ...i
}) {
  const r = Sa();
  return t ? /* @__PURE__ */ c(
    J,
    {
      width: "100%",
      height: "5.5rem",
      radius: "var(--glacier-radius-lg)",
      className: n
    }
  ) : /* @__PURE__ */ c(
    "textarea",
    {
      id: s ?? r?.id,
      "aria-describedby": r?.describedBy,
      "aria-invalid": r?.invalid || void 0,
      className: I(gr.textarea, gr[e], a && gr.glass, n),
      ...i
    }
  );
}
const Py = "_wrap_34d6c_1", Ay = "_icon_34d6c_8", Oy = "_input_34d6c_17", Ey = "_clear_34d6c_67", Wy = "_shortcut_34d6c_103", Iy = "_sm_34d6c_113", Ry = "_md_34d6c_122", Ly = "_lg_34d6c_128", qy = "_glass_34d6c_139", wo = {
  wrap: Py,
  icon: Ay,
  input: Oy,
  clear: Ey,
  shortcut: Wy,
  sm: Iy,
  md: Ry,
  lg: Ly,
  glass: qy
};
function FW({
  value: e,
  defaultValue: t = "",
  onValueChange: a,
  placeholder: n = "Search",
  size: s = "md",
  shortcut: i,
  skeleton: r = !1,
  glass: l = !1,
  className: d,
  id: u,
  ...m
}) {
  const h = st(), f = Sa(), [b, w] = He(e, t);
  return r ? /* @__PURE__ */ c(
    J,
    {
      width: "100%",
      height: `var(--glacier-control-height-${s})`,
      radius: "var(--glacier-radius-lg)",
      className: d
    }
  ) : /* @__PURE__ */ P("div", { className: I(wo.wrap, wo[s], l && wo.glass, d), children: [
    /* @__PURE__ */ P(
      "svg",
      {
        className: wo.icon,
        "aria-hidden": "true",
        viewBox: "0 0 16 16",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        children: [
          /* @__PURE__ */ c("circle", { cx: "7", cy: "7", r: "4.5", stroke: "currentColor", strokeWidth: "1.5" }),
          /* @__PURE__ */ c("path", { d: "m11 11 3.5 3.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" })
        ]
      }
    ),
    /* @__PURE__ */ c(
      "input",
      {
        id: u ?? f?.id,
        type: "search",
        "aria-describedby": f?.describedBy,
        "aria-invalid": f?.invalid || void 0,
        placeholder: n,
        value: b,
        onChange: (S) => {
          w(S.target.value), a?.(S.target.value);
        },
        className: wo.input,
        ...m
      }
    ),
    b ? /* @__PURE__ */ c(
      "button",
      {
        type: "button",
        className: wo.clear,
        "aria-label": h(_e.clearSearch),
        onClick: () => {
          w(""), a?.("");
        },
        children: /* @__PURE__ */ P(
          "svg",
          {
            "aria-hidden": "true",
            viewBox: "0 0 16 16",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "1.5",
            strokeLinecap: "round",
            xmlns: "http://www.w3.org/2000/svg",
            children: [
              /* @__PURE__ */ c("path", { d: "m3.5 3.5 9 9" }),
              /* @__PURE__ */ c("path", { d: "m12.5 3.5-9 9" })
            ]
          }
        )
      }
    ) : i ? /* @__PURE__ */ c("span", { className: wo.shortcut, children: i }) : null
  ] });
}
const Fy = "_group_1tavo_1", By = "_disabled_1tavo_14", Hy = "_glass_1tavo_28", jy = "_step_1tavo_37", Yy = "_input_1tavo_70", Vy = "_sm_1tavo_100", Gy = "_md_1tavo_112", Ky = "_lg_1tavo_124", ko = {
  group: Fy,
  disabled: By,
  glass: Hy,
  step: jy,
  input: Yy,
  sm: Vy,
  md: Gy,
  lg: Ky
}, Uy = 400, Xy = 240, Jy = 40, Qy = 0.82;
function BW({
  value: e,
  defaultValue: t,
  min: a,
  max: n,
  step: s = 1,
  onValueChange: i,
  size: r = "md",
  disabled: l = !1,
  skeleton: d = !1,
  glass: u = !1,
  className: m,
  id: h,
  "aria-label": f,
  onKeyDown: b,
  onBlur: w,
  ...S
}) {
  const $ = st(), N = Sa(), y = Ai(), [v, _] = He(e, t ?? 0), k = ee(v), M = ee(null), T = ee(!1), A = ee(!1), F = ee(!1);
  if (M.current === null && (k.current = v), xe(
    () => () => {
      M.current && clearTimeout(M.current);
    },
    []
  ), d)
    return /* @__PURE__ */ c(
      J,
      {
        width: "8rem",
        height: `var(--glacier-control-height-${r})`,
        radius: "var(--glacier-radius-lg)",
        className: m
      }
    );
  const L = (z) => {
    let R = z;
    return a !== void 0 && R < a && (R = a), n !== void 0 && R > n && (R = n), R;
  }, O = (z) => a !== void 0 && z <= a || n !== void 0 && z >= n, q = S["data-haptic"] === "none", j = (z) => {
    q || y(z);
  }, D = () => {
    T.current || (T.current = !0, j("medium"));
  }, H = (z) => {
    const R = L(z);
    O(R) || (T.current = !1), k.current = R, _(R), i?.(R);
  }, K = (z) => {
    const R = k.current + z * s, X = L(R);
    return X === k.current ? (D(), !1) : (k.current = X, _(X), i?.(X), X !== R ? D() : (O(X) || (T.current = !1), j("selection")), !0);
  }, Y = () => {
    M.current !== null && (clearTimeout(M.current), M.current = null);
  }, se = (z) => {
    if (Y(), !K(z)) return;
    let R = Xy;
    const X = () => {
      if (!K(z)) {
        Y();
        return;
      }
      R = Math.max(Jy, R * Qy), M.current = setTimeout(X, R);
    };
    M.current = setTimeout(X, Uy);
  }, te = (z) => {
    if (b?.(z), z.defaultPrevented) return;
    const R = z.key === "ArrowUp" ? 1 : z.key === "ArrowDown" ? -1 : 0;
    if (R === 0) {
      A.current = !1;
      return;
    }
    const X = k.current + R * s, le = L(X);
    if (le === k.current) {
      D();
      return;
    }
    A.current = !0, le !== X ? D() : (O(le) || (T.current = !1), j("selection"));
  }, ne = a !== void 0 && v <= a, U = n !== void 0 && v >= n;
  return /* @__PURE__ */ P("div", { className: I(ko.group, ko[r], u && ko.glass, l && ko.disabled, m), children: [
    /* @__PURE__ */ c(
      "button",
      {
        type: "button",
        "aria-label": $(_e.decrease),
        className: ko.step,
        disabled: l || ne,
        "data-haptic": "none",
        onPointerDown: (z) => {
          z.button || se(-1);
        },
        onPointerUp: Y,
        onPointerLeave: Y,
        onPointerCancel: Y,
        onClick: (z) => {
          z.detail === 0 && K(-1);
        },
        children: /* @__PURE__ */ c("span", { "aria-hidden": "true", children: "-" })
      }
    ),
    /* @__PURE__ */ c(
      "input",
      {
        type: "number",
        inputMode: "numeric",
        id: h ?? N?.id,
        "aria-label": f,
        "aria-describedby": N?.describedBy,
        "aria-invalid": N?.invalid || void 0,
        className: ko.input,
        value: v,
        min: a,
        max: n,
        step: s,
        disabled: l,
        onChange: (z) => {
          A.current ? A.current = !1 : F.current = !0, H(Number(z.target.value));
        },
        onKeyDown: te,
        onBlur: (z) => {
          w?.(z), F.current && (F.current = !1, j("light"));
        },
        ...S
      }
    ),
    /* @__PURE__ */ c(
      "button",
      {
        type: "button",
        "aria-label": $(_e.increase),
        className: ko.step,
        disabled: l || U,
        "data-haptic": "none",
        onPointerDown: (z) => {
          z.button || se(1);
        },
        onPointerUp: Y,
        onPointerLeave: Y,
        onPointerCancel: Y,
        onClick: (z) => {
          z.detail === 0 && K(1);
        },
        children: /* @__PURE__ */ c("span", { "aria-hidden": "true", children: "+" })
      }
    )
  ] });
}
const Zy = "_root_otabm_1", ev = "_svg_otabm_9", tv = "_track_otabm_14", nv = "_arc_otabm_19", av = "_success_otabm_26", ov = "_warning_otabm_27", sv = "_danger_otabm_28", iv = "_center_otabm_30", rv = "_value_otabm_39", lv = "_skeletonWrap_otabm_54", cv = "_skeletonRing_otabm_61", ha = {
  root: Zy,
  svg: ev,
  track: tv,
  arc: nv,
  success: av,
  warning: ov,
  danger: sv,
  center: iv,
  value: rv,
  skeletonWrap: lv,
  skeletonRing: cv
};
function HW({
  value: e,
  max: t = 100,
  size: a = 48,
  thickness: n = 4,
  tone: s = "accent",
  label: i,
  showValue: r = !1,
  skeleton: l = !1,
  className: d,
  ...u
}) {
  if (l)
    return /* @__PURE__ */ P("span", { className: I(ha.skeletonWrap, d), style: { width: a, height: a }, children: [
      /* @__PURE__ */ c(
        J,
        {
          variant: De.Circle,
          width: a,
          className: ha.skeletonRing,
          style: { "--ring-thickness": `${n}px` }
        }
      ),
      /* @__PURE__ */ c(
        J,
        {
          variant: De.Text,
          width: Math.round(a * 0.42),
          height: Math.max(5, Math.round(a * 0.12))
        }
      )
    ] });
  const m = Math.min(Math.max(e, 0), t), h = (a - n) / 2, f = 2 * Math.PI * h, b = f * (1 - m / t), w = a / 2, S = Math.round(m / t * 100), $ = i != null, N = !$ && r;
  return /* @__PURE__ */ P(
    "div",
    {
      role: "progressbar",
      "aria-valuemin": 0,
      "aria-valuemax": t,
      "aria-valuenow": m,
      className: I(ha.root, d),
      ...u,
      children: [
        /* @__PURE__ */ P("svg", { width: a, height: a, viewBox: `0 0 ${a} ${a}`, className: ha.svg, children: [
          /* @__PURE__ */ c(
            "circle",
            {
              className: ha.track,
              cx: w,
              cy: w,
              r: h,
              strokeWidth: n
            }
          ),
          /* @__PURE__ */ c(
            "circle",
            {
              className: I(ha.arc, s !== "accent" && ha[s]),
              cx: w,
              cy: w,
              r: h,
              strokeWidth: n,
              strokeDasharray: f,
              strokeDashoffset: b
            }
          )
        ] }),
        $ ? /* @__PURE__ */ c("span", { className: ha.center, children: i }) : N ? /* @__PURE__ */ c("span", { className: ha.center, "aria-hidden": "true", children: /* @__PURE__ */ P("span", { className: ha.value, children: [
          S,
          "%"
        ] }) }) : null
      ]
    }
  );
}
const dv = "_avatar_jzisc_1", uv = "_circle_jzisc_14", hv = "_rounded_jzisc_18", mv = "_sm_jzisc_22", pv = "_md_jzisc_28", fv = "_lg_jzisc_34", gv = "_xl_jzisc_40", bv = "_image_jzisc_46", yv = "_initials_jzisc_52", vv = "_placeholder_jzisc_57", wv = "_glass_jzisc_61", Za = {
  avatar: dv,
  circle: uv,
  rounded: hv,
  sm: mv,
  md: pv,
  lg: fv,
  xl: gv,
  image: bv,
  initials: yv,
  placeholder: vv,
  glass: wv
}, kv = {
  sm: "1.75rem",
  md: "2.25rem",
  lg: "3rem",
  xl: "4rem"
};
function _v(e) {
  return e.trim().split(/\s+/).slice(0, 2).map((t) => t[0] ?? "").join("").toUpperCase();
}
function jW({
  src: e,
  alt: t,
  name: a,
  size: n = "md",
  shape: s = "circle",
  skeleton: i = !1,
  glass: r = !1,
  className: l,
  ...d
}) {
  const [u, m] = pe(!1), h = kv[n];
  if (i)
    return /* @__PURE__ */ c(
      J,
      {
        variant: s === "circle" ? "circle" : "rect",
        width: h,
        height: h,
        radius: s === "rounded" ? "var(--glacier-radius-md)" : void 0,
        className: l
      }
    );
  const f = I(Za.avatar, Za[n], Za[s], l);
  if (!!e && !u)
    return /* @__PURE__ */ c("span", { className: f, ...d, children: /* @__PURE__ */ c(
      "img",
      {
        className: Za.image,
        src: e,
        alt: t ?? a ?? "",
        onError: () => m(!0)
      }
    ) });
  const w = a ? _v(a) : "";
  return w ? /* @__PURE__ */ c("span", { className: I(f, Za.initials, r && Za.glass), ...d, children: /* @__PURE__ */ c("span", { "aria-label": a, children: w }) }) : /* @__PURE__ */ c(
    "span",
    {
      className: I(f, Za.placeholder, r && Za.glass),
      "aria-hidden": "true",
      ...d
    }
  );
}
const xv = "_dot_1i8i8_1", Sv = "_sm_1i8i8_9", Mv = "_md_1i8i8_14", $v = "_neutral_1i8i8_19", Tv = "_accent_1i8i8_23", Cv = "_success_1i8i8_27", Nv = "_warning_1i8i8_31", Dv = "_danger_1i8i8_35", zv = "_info_1i8i8_39", Pv = "_pulse_1i8i8_44", Av = "_statusPulse_1i8i8_1", fi = {
  dot: xv,
  sm: Sv,
  md: Mv,
  neutral: $v,
  accent: Tv,
  success: Cv,
  warning: Nv,
  danger: Dv,
  info: zv,
  pulse: Pv,
  statusPulse: Av
}, Ov = {
  sm: "0.5rem",
  md: "0.625rem"
};
function YW({
  tone: e = "neutral",
  pulse: t = !1,
  size: a = "md",
  label: n,
  skeleton: s = !1,
  className: i,
  ...r
}) {
  const l = Ov[a];
  return s ? /* @__PURE__ */ c(J, { variant: De.Circle, width: l, className: i }) : /* @__PURE__ */ c(
    "span",
    {
      className: I(fi.dot, fi[a], fi[e], t && fi.pulse, i),
      role: n ? "status" : void 0,
      "aria-label": n,
      "aria-hidden": n ? void 0 : "true",
      ...r
    }
  );
}
const Ev = "_badge_13eiv_1", Wv = "_sm_13eiv_13", Iv = "_md_13eiv_20", Rv = "_dot_13eiv_27", Lv = "_danger_13eiv_41", qv = "_accent_13eiv_45", Fv = "_neutral_13eiv_49", Bv = "_success_13eiv_53", Hv = "_glass_13eiv_58", Pa = {
  badge: Ev,
  sm: Wv,
  md: Iv,
  dot: Rv,
  danger: Lv,
  accent: qv,
  neutral: Fv,
  success: Bv,
  glass: Hv
};
function Zr({
  count: e,
  max: t = 99,
  tone: a = "danger",
  dot: n = !1,
  size: s = "md",
  skeleton: i = !1,
  glass: r = !1,
  className: l,
  "aria-label": d,
  ...u
}) {
  if (i)
    return /* @__PURE__ */ c(J, { variant: De.Circle, width: "1.25rem", className: l });
  if (n)
    return /* @__PURE__ */ c(
      "span",
      {
        role: "status",
        "aria-label": d ?? "New activity",
        className: I(Pa.badge, Pa.dot, Pa[a], Pa[s], r && Pa.glass, l),
        ...u
      }
    );
  if (e <= 0) return null;
  const m = e > t ? `${t}+` : String(e);
  return /* @__PURE__ */ c(
    "span",
    {
      role: "status",
      "aria-label": d ?? `${e} items`,
      className: I(Pa.badge, Pa[a], Pa[s], r && Pa.glass, l),
      ...u,
      children: /* @__PURE__ */ c("span", { "aria-hidden": "true", children: m })
    }
  );
}
const jv = "_callout_1u7gc_1", Yv = "_icon_1u7gc_13", Vv = "_body_1u7gc_20", Gv = "_title_1u7gc_26", Kv = "_note_1u7gc_32", Uv = "_info_1u7gc_43", Xv = "_success_1u7gc_54", Jv = "_warning_1u7gc_65", Qv = "_danger_1u7gc_76", Zv = "_glass_1u7gc_88", as = {
  callout: jv,
  icon: Yv,
  body: Vv,
  title: Gv,
  note: Kv,
  info: Uv,
  success: Xv,
  warning: Jv,
  danger: Qv,
  glass: Zv
};
function VW({
  tone: e = "note",
  title: t,
  icon: a,
  skeleton: n = !1,
  glass: s = !1,
  className: i,
  children: r,
  ...l
}) {
  return n ? /* @__PURE__ */ c(
    J,
    {
      width: "100%",
      height: "4rem",
      radius: "var(--glacier-radius-lg)",
      className: i
    }
  ) : /* @__PURE__ */ P(
    "div",
    {
      role: e === "warning" || e === "danger" ? "alert" : "note",
      className: I(as.callout, as[e], s && as.glass, i),
      ...l,
      children: [
        a != null && /* @__PURE__ */ c("span", { className: as.icon, children: a }),
        /* @__PURE__ */ P("div", { className: as.body, children: [
          t != null && /* @__PURE__ */ c("span", { className: as.title, children: t }),
          r
        ] })
      ]
    }
  );
}
const ew = "_codeBlock_x6d54_1", tw = "_attached_x6d54_10", nw = "_glass_x6d54_16", aw = "_header_x6d54_25", ow = "_meta_x6d54_37", sw = "_filename_x6d54_44", iw = "_language_x6d54_52", rw = "_copy_x6d54_59", lw = "_pre_x6d54_78", cw = "_numbered_x6d54_115", ma = {
  codeBlock: ew,
  attached: tw,
  glass: nw,
  header: aw,
  meta: ow,
  filename: sw,
  language: iw,
  copy: rw,
  pre: lw,
  numbered: cw
};
function dw(e) {
  return navigator.clipboard?.writeText ? navigator.clipboard.writeText(e).catch(() => hc(e)) : Promise.resolve(hc(e));
}
function hc(e) {
  const t = document.createElement("textarea");
  t.value = e, t.style.position = "fixed", t.style.opacity = "0", document.body.appendChild(t), t.select(), document.execCommand("copy"), t.remove();
}
function GW({
  code: e,
  children: t,
  language: a,
  filename: n,
  showCopy: s = !0,
  lineNumbers: i = !1,
  attached: r = !1,
  skeleton: l = !1,
  glass: d = !1,
  className: u,
  ...m
}) {
  const h = st(), [f, b] = pe(!1);
  if (l)
    return /* @__PURE__ */ c(
      J,
      {
        width: "100%",
        height: "6rem",
        radius: "var(--glacier-radius-lg)",
        className: u
      }
    );
  const w = s || n != null || a != null, S = I(ma.pre, i && ma.numbered);
  return /* @__PURE__ */ P(
    "div",
    {
      className: I(ma.codeBlock, d && ma.glass, r && ma.attached, u),
      ...m,
      children: [
        w && /* @__PURE__ */ P("div", { className: ma.header, children: [
          /* @__PURE__ */ P("span", { className: ma.meta, children: [
            n != null && /* @__PURE__ */ c("span", { className: ma.filename, children: n }),
            a != null && /* @__PURE__ */ c("span", { className: ma.language, children: a })
          ] }),
          s && /* @__PURE__ */ c(
            "button",
            {
              type: "button",
              className: ma.copy,
              onClick: () => {
                dw(e).then(() => {
                  b(!0), setTimeout(() => b(!1), 1500);
                });
              },
              children: h(f ? _e.copied : _e.copy)
            }
          )
        ] }),
        t != null ? (
          // The app supplies the highlighted markup; .pre lays it out, the inner
          // highlighter <pre> is reset to inherit spacing and background. Source
          // code is inherently left-to-right, so the sample is pinned dir=ltr and
          // never bidi-reorders inside an RTL page.
          /* @__PURE__ */ c("div", { className: S, dir: "ltr", children: t })
        ) : /* @__PURE__ */ c("pre", { className: S, dir: "ltr", children: /* @__PURE__ */ c("code", { children: i ? e.split(`
`).map(($, N, y) => /* @__PURE__ */ P("span", { className: "line", children: [
          $,
          N < y.length - 1 ? `
` : ""
        ] }, N)) : e }) })
      ]
    }
  );
}
const uw = "_bar_1qtqr_1", hw = "_sm_1qtqr_9", mw = "_md_1qtqr_13", pw = "_rounded_1qtqr_17", fw = "_slice_1qtqr_21", gw = "_accent_1qtqr_28", bw = "_success_1qtqr_29", yw = "_warning_1qtqr_30", vw = "_danger_1qtqr_31", ww = "_neutral_1qtqr_33", kw = "_skeletonBar_1qtqr_37", eo = {
  bar: uw,
  sm: hw,
  md: mw,
  rounded: pw,
  slice: fw,
  accent: gw,
  success: bw,
  warning: yw,
  danger: vw,
  neutral: ww,
  skeletonBar: kw
};
function _w(e) {
  const t = e.reduce((n, s) => n + Math.max(s.value, 0), 0);
  return t <= 0 ? "Segmented bar" : e.filter((n) => n.value > 0).map((n) => {
    const s = Math.round(n.value / t * 100);
    return n.label ? `${n.label} ${s}%` : `${s}%`;
  }).join(", ");
}
function KW({
  data: e,
  size: t = "md",
  rounded: a = !0,
  skeleton: n = !1,
  className: s,
  "aria-label": i,
  ...r
}) {
  if (n) {
    const d = ["42%", "30%", "18%"];
    return /* @__PURE__ */ c(
      "div",
      {
        className: I(eo.skeletonBar, eo[t], a && eo.rounded, s),
        "aria-hidden": "true",
        children: d.map((u) => /* @__PURE__ */ c(J, { width: u, height: "100%", radius: "2px" }, u))
      }
    );
  }
  const l = e.reduce((d, u) => d + Math.max(u.value, 0), 0);
  return /* @__PURE__ */ c(
    "div",
    {
      role: "img",
      "aria-label": i ?? _w(e),
      className: I(eo.bar, eo[t], a && eo.rounded, s),
      ...r,
      children: l > 0 && e.filter((d) => d.value > 0).map((d, u) => /* @__PURE__ */ c(
        "div",
        {
          className: I(eo.slice, eo[d.tone ?? "accent"]),
          style: { width: `${d.value / l * 100}%` }
        },
        u
      ))
    }
  );
}
const xw = "_banner_oix0d_1", Sw = "_icon_oix0d_15", Mw = "_message_oix0d_22", $w = "_action_oix0d_27", Tw = "_dismiss_oix0d_33", Cw = "_neutral_oix0d_41", Nw = "_accent_oix0d_49", Dw = "_success_oix0d_57", zw = "_warning_oix0d_65", Pw = "_danger_oix0d_73", Aw = "_info_oix0d_81", os = {
  banner: xw,
  icon: Sw,
  message: Mw,
  action: $w,
  dismiss: Tw,
  neutral: Cw,
  accent: Nw,
  success: Dw,
  warning: zw,
  danger: Pw,
  info: Aw
}, Ow = /* @__PURE__ */ c("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M3 3l8 8M11 3l-8 8", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }) });
function UW({
  tone: e = "info",
  icon: t,
  action: a,
  onDismiss: n,
  skeleton: s = !1,
  className: i,
  children: r,
  ...l
}) {
  const d = st();
  return s ? /* @__PURE__ */ c(
    J,
    {
      width: "100%",
      height: "3rem",
      radius: "var(--glacier-radius-lg)",
      className: i
    }
  ) : /* @__PURE__ */ P(
    "div",
    {
      role: e === "warning" || e === "danger" ? "alert" : "status",
      className: I(os.banner, os[e], i),
      ...l,
      children: [
        t != null && /* @__PURE__ */ c("span", { className: os.icon, children: t }),
        /* @__PURE__ */ c("div", { className: os.message, children: r }),
        a != null && /* @__PURE__ */ c("div", { className: os.action, children: a }),
        n != null && /* @__PURE__ */ c("div", { className: os.dismiss, children: /* @__PURE__ */ c(Yn, { "aria-label": d(_e.dismiss), size: gn.Small, onClick: n, children: Ow }) })
      ]
    }
  );
}
const Ew = "_root_1tnge_1", Ww = "_viewport_1tnge_16", Iw = "_message_1tnge_23", Rw = "_enter_1tnge_1", Lw = "_label_1tnge_31", qw = "_content_1tnge_39", Fw = "_controls_1tnge_47", Bw = "_control_1tnge_47", Hw = "_position_1tnge_78", jw = "_neutral_1tnge_85", Yw = "_accent_1tnge_86", Vw = "_success_1tnge_87", Gw = "_warning_1tnge_88", Kw = "_danger_1tnge_89", Uw = "_info_1tnge_90", Xw = "_srOnly_1tnge_101", In = {
  root: Ew,
  viewport: Ww,
  message: Iw,
  enter: Rw,
  label: Lw,
  content: qw,
  controls: Fw,
  control: Bw,
  position: Hw,
  neutral: jw,
  accent: Yw,
  success: Vw,
  warning: Gw,
  danger: Kw,
  info: Uw,
  srOnly: Xw
}, Jw = /* @__PURE__ */ c("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "m8.5 3-4 4 4 4", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }), Qw = /* @__PURE__ */ c("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "m5.5 3 4 4-4 4", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }), Zw = /* @__PURE__ */ c("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M4.5 3.5v7M9.5 3.5v7", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }) }), e1 = /* @__PURE__ */ c("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "m5 3.5 5 3.5-5 3.5v-7Z", fill: "currentColor", stroke: "currentColor", strokeLinejoin: "round" }) });
function t1(e, t) {
  return Math.max(0, Math.min(e, t - 1));
}
function XW({
  items: e,
  tone: t = "info",
  index: a,
  defaultIndex: n = 0,
  onIndexChange: s,
  autoPlay: i = !0,
  interval: r = 7e3,
  className: l,
  "aria-label": d = "Announcements",
  onMouseEnter: u,
  onMouseLeave: m,
  onFocusCapture: h,
  onBlurCapture: f,
  ...b
}) {
  const [w, S] = pe(n), [$, N] = pe(!1), [y, v] = pe(!1), _ = Ee(), k = t1(a ?? w, e.length), M = e[k], T = e.length > 1;
  function A(O) {
    const q = (O % e.length + e.length) % e.length;
    a == null && S(q), s?.(q);
  }
  if (xe(() => {
    if (!i || $ || y || !T) return;
    const O = setInterval(() => A(k + 1), r);
    return () => clearInterval(O);
  }, [i, $, y, T, k, r]), !M) return null;
  function F() {
    v(!0);
  }
  function L(O) {
    O.currentTarget.contains(O.relatedTarget) || v(!1);
  }
  return /* @__PURE__ */ P(
    "section",
    {
      ...b,
      role: "region",
      "aria-label": d,
      className: I(In.root, In[t], l),
      onMouseEnter: (O) => {
        F(), u?.(O);
      },
      onMouseLeave: (O) => {
        v(!1), m?.(O);
      },
      onFocusCapture: (O) => {
        F(), h?.(O);
      },
      onBlurCapture: (O) => {
        L(O), f?.(O);
      },
      children: [
        /* @__PURE__ */ c("span", { id: _, className: In.srOnly, children: "Updates" }),
        /* @__PURE__ */ c("div", { className: In.viewport, "aria-labelledby": _, "aria-live": "off", children: /* @__PURE__ */ P("div", { className: In.message, children: [
          M.label != null && /* @__PURE__ */ c("span", { className: In.label, children: M.label }),
          /* @__PURE__ */ c("span", { className: In.content, children: M.content })
        ] }, M.id) }),
        T && /* @__PURE__ */ P("div", { className: In.controls, "aria-label": "Announcement controls", children: [
          /* @__PURE__ */ c("button", { type: "button", className: In.control, "aria-label": "Previous announcement", onClick: () => A(k - 1), children: Jw }),
          /* @__PURE__ */ P("span", { className: In.position, "aria-live": "polite", "aria-atomic": "true", children: [
            k + 1,
            " of ",
            e.length
          ] }),
          /* @__PURE__ */ c(
            "button",
            {
              type: "button",
              className: In.control,
              "aria-label": $ ? "Resume announcements" : "Pause announcements",
              "aria-pressed": $,
              onClick: () => {
                v(!1), N((O) => !O);
              },
              children: $ ? e1 : Zw
            }
          ),
          /* @__PURE__ */ c("button", { type: "button", className: In.control, "aria-label": "Next announcement", onClick: () => A(k + 1), children: Qw })
        ] })
      ]
    }
  );
}
const n1 = "_emptyState_1cq6x_1", a1 = "_disc_1cq6x_14", o1 = "_title_1cq6x_28", s1 = "_description_1cq6x_36", i1 = "_action_1cq6x_45", _o = {
  emptyState: n1,
  disc: a1,
  title: o1,
  description: s1,
  action: i1
};
function JW({
  icon: e,
  title: t,
  description: a,
  action: n,
  skeleton: s = !1,
  className: i,
  children: r,
  ...l
}) {
  return s ? /* @__PURE__ */ P("div", { className: I(_o.emptyState, i), ...l, children: [
    /* @__PURE__ */ c(J, { variant: De.Circle, width: "4rem", className: _o.disc }),
    /* @__PURE__ */ c(J, { variant: De.Text, width: "12ch", style: { fontSize: "var(--glacier-font-size-lg)" } }),
    /* @__PURE__ */ c(J, { variant: De.Text, width: "24ch", style: { fontSize: "var(--glacier-font-size-sm)" } })
  ] }) : /* @__PURE__ */ P("div", { className: I(_o.emptyState, i), ...l, children: [
    e != null && /* @__PURE__ */ c("span", { className: _o.disc, "aria-hidden": "true", children: e }),
    /* @__PURE__ */ c("h2", { className: _o.title, children: t }),
    a != null && /* @__PURE__ */ c("p", { className: _o.description, children: a }),
    n != null && /* @__PURE__ */ c("div", { className: _o.action, children: n }),
    r
  ] });
}
const r1 = "_track_tw7py_1", l1 = "_sm_tw7py_6", c1 = "_md_tw7py_10", d1 = "_dot_tw7py_14", u1 = "_completed_tw7py_32", h1 = "_current_tw7py_33", m1 = "_accent_tw7py_37", p1 = "_success_tw7py_42", f1 = "_warning_tw7py_47", g1 = "_danger_tw7py_52", b1 = "_info_tw7py_57", y1 = "_neutral_tw7py_62", v1 = "_upcoming_tw7py_73", w1 = "_connectedTrack_tw7py_86", k1 = "_marker_tw7py_90", _1 = "_check_tw7py_117", x1 = "_markerDone_tw7py_128", S1 = "_markerNow_tw7py_136", M1 = "_markerNext_tw7py_147", $1 = "_currentDot_tw7py_154", T1 = "_connector_tw7py_162", C1 = "_connectorDone_tw7py_171", N1 = "_connectorBone_tw7py_179", pt = {
  track: r1,
  sm: l1,
  md: c1,
  dot: d1,
  completed: u1,
  current: h1,
  accent: m1,
  success: p1,
  warning: f1,
  danger: g1,
  info: b1,
  neutral: y1,
  upcoming: v1,
  connectedTrack: w1,
  marker: k1,
  check: _1,
  markerDone: x1,
  markerNow: S1,
  markerNext: M1,
  currentDot: $1,
  connector: T1,
  connectorDone: C1,
  connectorBone: N1
}, D1 = {
  sm: "0.375rem",
  md: "0.5rem"
}, z1 = {
  sm: "1.25rem",
  md: "1.5rem"
}, P1 = /* @__PURE__ */ c("svg", { viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", className: pt.check, children: /* @__PURE__ */ c(
  "path",
  {
    d: "M2.5 6.5 L5 8.75 L9.5 3.5",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }
) });
function mc({
  count: e,
  active: t = 0,
  tone: a = "accent",
  size: n = "md",
  variant: s = "dots",
  numbered: i = !1,
  skeleton: r = !1,
  className: l,
  ...d
}) {
  const u = st(), m = Math.max(0, Math.floor(e)), h = s === "connected";
  if (r) {
    const w = h ? z1[n] : D1[n];
    return /* @__PURE__ */ c(
      "div",
      {
        className: I(pt.track, pt[n], h && pt.connectedTrack, l),
        "aria-hidden": "true",
        children: Array.from({ length: m }, (S, $) => /* @__PURE__ */ P(Zl, { children: [
          /* @__PURE__ */ c(J, { variant: De.Circle, width: w }),
          h && $ < m - 1 && /* @__PURE__ */ c(J, { height: "2px", className: pt.connectorBone })
        ] }, $))
      }
    );
  }
  const f = Math.min(Math.max(t, 0), Math.max(m - 1, 0)), b = u(_e.stepOf, { step: Math.min(f + 1, m), total: m });
  return h ? /* @__PURE__ */ c(
    "div",
    {
      role: "group",
      "aria-label": b,
      className: I(pt.track, pt[n], pt.connectedTrack, l),
      ...d,
      children: Array.from({ length: m }, (w, S) => {
        const $ = S < f ? pt.markerDone : S === f ? pt.markerNow : pt.markerNext;
        return /* @__PURE__ */ P(Zl, { children: [
          /* @__PURE__ */ c("span", { className: I(pt.marker, pt[a], $), "aria-hidden": "true", children: S < f ? P1 : i ? S + 1 : S === f ? /* @__PURE__ */ c("span", { className: pt.currentDot }) : null }),
          S < m - 1 && /* @__PURE__ */ c(
            "span",
            {
              className: I(pt.connector, pt[a], S < f && pt.connectorDone),
              "aria-hidden": "true"
            }
          )
        ] }, S);
      })
    }
  ) : /* @__PURE__ */ c(
    "div",
    {
      role: "group",
      "aria-label": b,
      className: I(pt.track, pt[n], l),
      ...d,
      children: Array.from({ length: m }, (w, S) => {
        const $ = S < f ? pt.completed : S === f ? pt.current : pt.upcoming;
        return /* @__PURE__ */ c("span", { className: I(pt.dot, pt[a], $), "aria-hidden": "true" }, S);
      })
    }
  );
}
const A1 = "_card_h2v0h_1", O1 = "_disabled_h2v0h_25", E1 = "_nativeInput_h2v0h_32", W1 = "_checked_h2v0h_31", I1 = "_icon_h2v0h_60", R1 = "_body_h2v0h_68", L1 = "_title_h2v0h_77", q1 = "_description_h2v0h_84", F1 = "_extra_h2v0h_90", B1 = "_indicator_h2v0h_95", H1 = "_compact_h2v0h_116", j1 = "_indicatorCss_h2v0h_127", Y1 = "_skeleton_h2v0h_140", fn = {
  card: A1,
  disabled: O1,
  nativeInput: E1,
  checked: W1,
  icon: I1,
  body: R1,
  title: L1,
  description: q1,
  extra: F1,
  indicator: B1,
  compact: H1,
  indicatorCss: j1,
  skeleton: Y1
};
function QW({
  title: e,
  description: t,
  icon: a,
  checked: n,
  defaultChecked: s = !1,
  onCheckedChange: i,
  disabled: r = !1,
  skeleton: l = !1,
  children: d,
  className: u,
  ...m
}) {
  const h = Re(), f = n !== void 0, b = t == null && d == null;
  return l ? /* @__PURE__ */ P("span", { className: I(fn.skeleton, u), children: [
    /* @__PURE__ */ c(J, { variant: De.Text, width: "7rem" }),
    /* @__PURE__ */ c(J, { variant: De.Text, width: "10rem" })
  ] }) : /* @__PURE__ */ P(
    "label",
    {
      className: I(
        fn.card,
        b && fn.compact,
        f && n && fn.checked,
        r && fn.disabled,
        u
      ),
      children: [
        /* @__PURE__ */ c(
          "input",
          {
            type: "radio",
            className: fn.nativeInput,
            ...f ? { checked: n } : { defaultChecked: s },
            disabled: r,
            onChange: (w) => i?.(w.target.checked),
            ...m
          }
        ),
        a != null && /* @__PURE__ */ c("span", { className: fn.icon, "aria-hidden": "true", children: a }),
        /* @__PURE__ */ P("span", { className: fn.body, children: [
          /* @__PURE__ */ c("span", { className: fn.title, children: e }),
          t != null && /* @__PURE__ */ c("span", { className: fn.description, children: t }),
          d != null && /* @__PURE__ */ c("span", { className: fn.extra, children: d })
        ] }),
        /* @__PURE__ */ c(V1, { checked: f ? n : void 0, reduce: h })
      ]
    }
  );
}
function V1({ checked: e, reduce: t }) {
  const a = /* @__PURE__ */ c("svg", { viewBox: "0 0 12 12", fill: "none", children: /* @__PURE__ */ c(
    "path",
    {
      d: "M2.5 6.5 L5 8.75 L9.5 3.5",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }
  ) });
  return e === void 0 ? /* @__PURE__ */ c("span", { className: I(fn.indicator, fn.indicatorCss), "aria-hidden": "true", children: a }) : /* @__PURE__ */ c(
    $e.span,
    {
      className: fn.indicator,
      "aria-hidden": "true",
      initial: !1,
      animate: { scale: e ? 1 : 0, opacity: e ? 1 : 0 },
      transition: t ? { duration: 0 } : Ke(Ge.Fast, nt.Spring),
      children: a
    }
  );
}
const G1 = "_tile_qhraq_1", K1 = "_icon_qhraq_19", U1 = "_body_qhraq_35", X1 = "_valueRow_qhraq_42", J1 = "_value_qhraq_42", Q1 = "_hint_qhraq_59", Z1 = "_label_qhraq_67", ek = "_glass_qhraq_74", tk = "_skeletonIcon_qhraq_83", xn = {
  tile: G1,
  icon: K1,
  body: U1,
  valueRow: X1,
  value: J1,
  hint: Q1,
  label: Z1,
  glass: ek,
  skeletonIcon: tk
};
function ZW({
  icon: e,
  value: t,
  label: a,
  hint: n,
  glass: s = !1,
  skeleton: i = !1,
  className: r,
  ...l
}) {
  return i ? /* @__PURE__ */ P("div", { className: I(xn.tile, s && xn.glass, r), ...l, children: [
    e != null && /* @__PURE__ */ c(
      J,
      {
        width: "2.25rem",
        height: "2.25rem",
        radius: "var(--glacier-radius-md)",
        className: xn.skeletonIcon
      }
    ),
    /* @__PURE__ */ P("div", { className: xn.body, children: [
      /* @__PURE__ */ P("div", { className: xn.valueRow, children: [
        /* @__PURE__ */ c(J, { variant: De.Text, width: "6ch", style: { fontSize: "var(--glacier-font-size-2xl)" } }),
        n != null && /* @__PURE__ */ c(J, { variant: De.Text, width: "4ch", style: { fontSize: "var(--glacier-font-size-xs)" } })
      ] }),
      /* @__PURE__ */ c(J, { variant: De.Text, width: "10ch", style: { fontSize: "var(--glacier-font-size-sm)" } })
    ] })
  ] }) : /* @__PURE__ */ P("div", { className: I(xn.tile, s && xn.glass, r), ...l, children: [
    e != null && /* @__PURE__ */ c("span", { className: xn.icon, "aria-hidden": "true", children: e }),
    /* @__PURE__ */ P("div", { className: xn.body, children: [
      /* @__PURE__ */ P("div", { className: xn.valueRow, children: [
        /* @__PURE__ */ c("span", { className: xn.value, children: t }),
        n != null && /* @__PURE__ */ c("span", { className: xn.hint, children: n })
      ] }),
      /* @__PURE__ */ c("span", { className: xn.label, children: a })
    ] })
  ] });
}
const nk = "_frame_1s51v_1", ak = "_bezel_1s51v_25", ok = "_screen_1s51v_33", sk = "_content_1s51v_42", ik = "_notch_1s51v_55", rk = "_speaker_1s51v_74", lk = "_camera_1s51v_81", ck = "_buttonSilence_1s51v_89", dk = "_buttonVolumeUp_1s51v_90", uk = "_buttonVolumeDown_1s51v_91", hk = "_buttonPower_1s51v_92", Jn = {
  frame: nk,
  bezel: ak,
  screen: ok,
  content: sk,
  notch: ik,
  speaker: rk,
  camera: lk,
  buttonSilence: ck,
  buttonVolumeUp: dk,
  buttonVolumeDown: uk,
  buttonPower: hk
}, mk = {
  sm: "13.5rem",
  md: "17rem",
  lg: "21rem"
};
function pk(e) {
  return typeof e == "number" ? `${e}px` : e;
}
function e6({
  size: e = "md",
  width: t,
  aspect: a = "9 / 19.5",
  hideNotch: n = !1,
  className: s,
  style: i,
  children: r,
  ...l
}) {
  const u = {
    "--device-frame-width": t !== void 0 ? pk(t) : mk[e],
    "--device-frame-aspect": String(a)
  };
  return /* @__PURE__ */ P(
    "div",
    {
      role: "group",
      className: I(Jn.frame, s),
      style: { ...u, ...i },
      ...l,
      children: [
        /* @__PURE__ */ c("div", { className: Jn.bezel, "aria-hidden": "true" }),
        /* @__PURE__ */ c("span", { className: Jn.buttonSilence, "aria-hidden": "true" }),
        /* @__PURE__ */ c("span", { className: Jn.buttonVolumeUp, "aria-hidden": "true" }),
        /* @__PURE__ */ c("span", { className: Jn.buttonVolumeDown, "aria-hidden": "true" }),
        /* @__PURE__ */ c("span", { className: Jn.buttonPower, "aria-hidden": "true" }),
        /* @__PURE__ */ P("div", { className: Jn.screen, children: [
          !n && /* @__PURE__ */ P("div", { className: Jn.notch, "aria-hidden": "true", children: [
            /* @__PURE__ */ c("span", { className: Jn.speaker }),
            /* @__PURE__ */ c("span", { className: Jn.camera })
          ] }),
          /* @__PURE__ */ c("div", { className: Jn.content, children: r })
        ] })
      ]
    }
  );
}
const fk = "_chip_1fkxp_1", gk = "_sm_1fkxp_48", bk = "_md_1fkxp_53", yk = "_count_1fkxp_59", vk = "_icon_1fkxp_67", gi = {
  chip: fk,
  sm: gk,
  md: bk,
  count: yk,
  icon: vk
};
function t6({
  selected: e,
  defaultSelected: t = !1,
  onSelectedChange: a,
  icon: n,
  count: s,
  size: i = "md",
  disabled: r,
  className: l,
  children: d,
  onClick: u,
  ...m
}) {
  const [h, f] = He(e, t), b = Re();
  return /* @__PURE__ */ P(
    $e.button,
    {
      type: "button",
      "aria-pressed": h,
      className: I(gi.chip, gi[i], l),
      disabled: r,
      whileTap: ni("chip", b || r),
      transition: Ke(Ge.Fast, nt.Out),
      "data-haptic": "selection",
      onClick: (w) => {
        f(!h), a?.(!h), u?.(w);
      },
      ...m,
      children: [
        n && /* @__PURE__ */ c("span", { className: gi.icon, "aria-hidden": "true", children: n }),
        d,
        s !== void 0 && s > 0 && /* @__PURE__ */ c(Zr, { className: gi.count, count: s, tone: h ? "accent" : "neutral", size: i })
      ]
    }
  );
}
const wk = "_frame_xnjl5_1", kk = "_img_xnjl5_10", _k = "_pending_xnjl5_25", xk = "_fallback_xnjl5_32", xo = {
  frame: wk,
  img: kk,
  pending: _k,
  fallback: xk,
  "radius-none": "_radius-none_xnjl5_41",
  "radius-sm": "_radius-sm_xnjl5_42",
  "radius-md": "_radius-md_xnjl5_43",
  "radius-lg": "_radius-lg_xnjl5_44",
  "radius-xl": "_radius-xl_xnjl5_45",
  "radius-2xl": "_radius-2xl_xnjl5_46",
  "radius-full": "_radius-full_xnjl5_47"
}, Sk = /* @__PURE__ */ P("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
  /* @__PURE__ */ c("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2" }),
  /* @__PURE__ */ c("path", { d: "m21 15-4-4-4 4M3 16l4-4 3 3" }),
  /* @__PURE__ */ c("path", { d: "m2 2 20 20" })
] });
function n6({
  src: e,
  alt: t,
  aspectRatio: a,
  fit: n = "cover",
  radius: s = "md",
  fallback: i,
  skeleton: r = !1,
  loading: l = "lazy",
  className: d,
  style: u,
  ...m
}) {
  const [h, f] = pe("loading"), b = {
    aspectRatio: a != null ? String(a) : void 0,
    ...u
  };
  return r ? /* @__PURE__ */ c("div", { className: I(xo.frame, xo[`radius-${s}`], d), style: b, children: /* @__PURE__ */ c(J, { width: "100%", height: "100%" }) }) : /* @__PURE__ */ P(
    "div",
    {
      className: I(xo.frame, xo[`radius-${s}`], d),
      style: b,
      "data-status": h,
      children: [
        h !== "error" && /* @__PURE__ */ c(
          "img",
          {
            src: e,
            alt: t,
            loading: l,
            className: xo.img,
            style: { objectFit: n },
            onLoad: () => f("loaded"),
            onError: () => f("error"),
            ...m
          }
        ),
        h === "loading" && /* @__PURE__ */ c(J, { className: xo.pending }),
        h === "error" && /* @__PURE__ */ c("span", { className: xo.fallback, children: i ?? Sk })
      ]
    }
  );
}
const Mk = "_rating_1pzzz_1", $k = "_sm_1pzzz_9", Tk = "_md_1pzzz_10", Ck = "_lg_1pzzz_11", Nk = "_disabled_1pzzz_13", Dk = "_star_1pzzz_15", zk = "_readonly_1pzzz_27", Pk = "_input_1pzzz_32", Ak = "_cell_1pzzz_42", Ok = "_starBase_1pzzz_55", Ek = "_starFill_1pzzz_56", Wk = "_fillWrap_1pzzz_75", Ik = "_skeletonStar_1pzzz_89", en = {
  rating: Mk,
  sm: $k,
  md: Tk,
  lg: Ck,
  disabled: Nk,
  star: Dk,
  readonly: zk,
  input: Pk,
  cell: Ak,
  starBase: Ok,
  starFill: Ek,
  fillWrap: Wk,
  skeletonStar: Ik
}, pc = "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z", fc = { strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
function gc({ fill: e }) {
  const t = Math.max(0, Math.min(1, e)) * 100;
  return /* @__PURE__ */ P("span", { className: en.cell, "aria-hidden": "true", children: [
    /* @__PURE__ */ c("svg", { viewBox: "0 0 24 24", className: en.starBase, ...fc, children: /* @__PURE__ */ c("path", { d: pc }) }),
    /* @__PURE__ */ c("span", { className: en.fillWrap, style: { width: `${t}%` }, children: /* @__PURE__ */ c("svg", { viewBox: "0 0 24 24", className: en.starFill, ...fc, children: /* @__PURE__ */ c("path", { d: pc }) }) })
  ] });
}
function a6({
  value: e,
  defaultValue: t,
  max: a = 5,
  onChange: n,
  readOnly: s = !1,
  disabled: i = !1,
  size: r = "md",
  skeleton: l = !1,
  className: d,
  "aria-label": u,
  ...m
}) {
  const [h, f] = He(e, t ?? 0), [b, w] = pe(null), S = Ee(), $ = Ai(), N = ee(!1), y = m["data-haptic"] === "none";
  if (l)
    return /* @__PURE__ */ c("span", { className: I(en.rating, en[r], d), "aria-hidden": "true", children: Array.from({ length: a }, (T, A) => /* @__PURE__ */ c(J, { width: "1em", height: "1em", className: en.skeletonStar }, A)) });
  const v = Array.from({ length: a }, (T, A) => A + 1);
  if (s)
    return /* @__PURE__ */ c(
      "span",
      {
        className: I(en.rating, en[r], en.readonly, d),
        role: "img",
        "aria-label": u ?? `${h} of ${a}`,
        ...m,
        children: v.map((T) => /* @__PURE__ */ c(gc, { fill: h - (T - 1) }, T))
      }
    );
  const _ = (T) => {
    f(T), n?.(T), y || $(N.current ? "light" : "selection");
  }, k = b ?? h, M = (T) => {
    !y && T !== (b ?? h) && $("selection"), w(T);
  };
  return /* @__PURE__ */ c(
    "span",
    {
      className: I(en.rating, en[r], i && en.disabled, d),
      ...m,
      role: "radiogroup",
      "aria-label": u,
      onMouseLeave: () => w(null),
      onPointerDown: () => {
        N.current = !0;
      },
      onKeyDown: () => {
        N.current = !1;
      },
      children: v.map((T) => /* @__PURE__ */ P("label", { className: en.star, onMouseEnter: () => !i && M(T), children: [
        /* @__PURE__ */ c(
          "input",
          {
            type: "radio",
            className: en.input,
            name: S,
            value: T,
            checked: h === T,
            disabled: i,
            "aria-label": String(T),
            onChange: () => _(T),
            onFocus: () => w(T),
            onBlur: () => w(null)
          }
        ),
        /* @__PURE__ */ c(gc, { fill: k >= T ? 1 : 0 })
      ] }, T))
    }
  );
}
const Rk = "_root_1fgvn_1", Lk = "_cells_1fgvn_9", qk = "_cell_1fgvn_9", Fk = "_separator_1fgvn_42", Bk = "_caret_1fgvn_51", Hk = "_input_1fgvn_74", jk = "_sm_1fgvn_111", Yk = "_md_1fgvn_117", Vk = "_lg_1fgvn_123", Gk = "_glass_1fgvn_130", Aa = {
  root: Rk,
  cells: Lk,
  cell: qk,
  separator: Fk,
  caret: Bk,
  "otp-caret-blink": "_otp-caret-blink_1fgvn_1",
  input: Hk,
  sm: jk,
  md: Yk,
  lg: Vk,
  glass: Gk
}, Kk = {
  numeric: /[^0-9]/g,
  alphanumeric: /[^0-9a-zA-Z]/g
}, Uk = "•", Xk = {
  sm: { width: "2rem", height: "var(--glacier-control-height-sm)" },
  md: { width: "2.5rem", height: "var(--glacier-control-height-md)" },
  lg: { width: "3rem", height: "var(--glacier-control-height-lg)" }
};
function o6({
  length: e = 6,
  value: t,
  defaultValue: a,
  onValueChange: n,
  onComplete: s,
  type: i = "numeric",
  masked: r = !1,
  groupSize: l,
  size: d = "md",
  disabled: u = !1,
  error: m = !1,
  autoFocus: h = !1,
  glass: f = !1,
  skeleton: b = !1,
  className: w,
  "aria-label": S,
  ...$
}) {
  const N = st(), y = ee(null), [v, _] = He(t, a ?? ""), [k, M] = pe(!1);
  if (b) {
    const q = Xk[d];
    return /* @__PURE__ */ c("div", { className: I(Aa.cells, w), "aria-hidden": "true", children: Array.from({ length: e }, (j, D) => /* @__PURE__ */ c(J, { width: q.width, height: q.height, radius: "var(--glacier-radius-md)" }, D)) });
  }
  const T = () => {
    const q = y.current;
    q && q.setSelectionRange(q.value.length, q.value.length);
  };
  function A(q) {
    const j = q.target.value.replace(Kk[i], "").slice(0, e);
    j !== v && (_(j), n?.(j), j.length === e && s?.(j));
  }
  function F() {
    M(!0), T();
  }
  function L() {
    M(!1);
  }
  const O = k ? Math.min(v.length, e - 1) : -1;
  return /* @__PURE__ */ P(
    "div",
    {
      ...$,
      className: I(Aa.root, Aa[d], f && Aa.glass, w),
      "data-disabled": u || void 0,
      "data-error": m || void 0,
      children: [
        /* @__PURE__ */ c("div", { className: Aa.cells, dir: "ltr", "aria-hidden": "true", children: Array.from({ length: e }, (q, j) => {
          const D = v[j], H = l != null && l > 0 && (j + 1) % l === 0 && j < e - 1;
          return [
            /* @__PURE__ */ P(
              "span",
              {
                className: Aa.cell,
                "data-cell": "",
                "data-filled": D != null || void 0,
                "data-active": j === O || void 0,
                children: [
                  D != null ? r ? Uk : D : null,
                  j === O && D == null && /* @__PURE__ */ c("span", { className: Aa.caret })
                ]
              },
              `cell-${j}`
            ),
            H ? /* @__PURE__ */ c("span", { className: Aa.separator, "data-separator": "" }, `sep-${j}`) : null
          ];
        }) }),
        /* @__PURE__ */ c(
          "input",
          {
            ref: y,
            className: Aa.input,
            type: "text",
            value: v,
            onChange: A,
            onFocus: F,
            onBlur: L,
            onSelect: T,
            disabled: u,
            autoFocus: h,
            autoComplete: "one-time-code",
            inputMode: i === "numeric" ? "numeric" : "text",
            pattern: i === "numeric" ? "[0-9]*" : void 0,
            maxLength: e,
            spellCheck: !1,
            autoCapitalize: "off",
            "aria-label": S ?? N(_e.oneTimeCode),
            "aria-invalid": m || void 0
          }
        )
      ]
    }
  );
}
const Jk = "_root_x30uo_1", Qk = "_canvas_x30uo_11", Zk = "_sm_x30uo_17", e_ = "_md_x30uo_21", t_ = "_lg_x30uo_25", n_ = "_neutral_x30uo_41", a_ = "_success_x30uo_46", o_ = "_warning_x30uo_51", s_ = "_danger_x30uo_56", i_ = "_info_x30uo_61", r_ = "_glass_x30uo_67", l_ = "_plot_x30uo_77", c_ = "_line_x30uo_85", d_ = "_fill_x30uo_92", u_ = "_bars_x30uo_96", h_ = "_bar_x30uo_96", m_ = "_baseline_x30uo_111", p_ = "_point_x30uo_118", cn = {
  root: Jk,
  canvas: Qk,
  sm: Zk,
  md: e_,
  lg: t_,
  neutral: n_,
  success: a_,
  warning: o_,
  danger: s_,
  info: i_,
  glass: r_,
  plot: l_,
  line: c_,
  fill: d_,
  bars: u_,
  bar: h_,
  baseline: m_,
  point: p_
}, f_ = { sm: "1rem", md: "1.5rem", lg: "2.25rem" };
function g_(e, t, a) {
  const n = a - t || 1, s = Math.max(e.length - 1, 1);
  return e.map((i, r) => ({
    x: r / s * 100,
    y: 100 - (Math.min(Math.max(i, t), a) - t) / n * 100
  }));
}
function s6({
  data: e,
  min: t,
  max: a,
  baseline: n,
  shape: s = "line",
  tone: i = "accent",
  size: r = "md",
  endPoint: l = !1,
  glass: d = !1,
  skeleton: u = !1,
  className: m,
  "aria-label": h,
  ...f
}) {
  if (u)
    return /* @__PURE__ */ c("span", { className: I(cn.root, cn[r], m), ...f, children: /* @__PURE__ */ c(J, { height: f_[r], width: "100%", radius: "var(--glacier-radius-sm)" }) });
  const b = t ?? (e.length ? Math.min(...e) : 0), w = a ?? (e.length ? Math.max(...e) : 1), S = g_(e, b, w), $ = e.length >= 2, N = w - b || 1, y = n !== void 0 && n >= b && n <= w ? 100 - (n - b) / N * 100 : void 0, v = S[S.length - 1], _ = $ ? `M ${S.map((M) => `${M.x} ${M.y}`).join(" L ")}` : "", k = $ ? `${_} L 100 100 L 0 100 Z` : "";
  return /* @__PURE__ */ c(
    "span",
    {
      role: "img",
      "aria-label": h,
      className: I(cn.root, cn[r], cn[i], d && cn.glass, m),
      ...f,
      children: /* @__PURE__ */ P("span", { className: cn.canvas, "aria-hidden": "true", children: [
        $ && s !== "bars" && /* @__PURE__ */ P("svg", { className: cn.plot, viewBox: "0 0 100 100", preserveAspectRatio: "none", children: [
          s === "area" && /* @__PURE__ */ c("path", { className: cn.fill, d: k }),
          /* @__PURE__ */ c("path", { className: cn.line, d: _, vectorEffect: "non-scaling-stroke", fill: "none" })
        ] }),
        $ && s === "bars" && /* @__PURE__ */ c("span", { className: cn.bars, children: S.map((M, T) => /* @__PURE__ */ c("span", { className: cn.bar, style: { height: `${Math.max(100 - M.y, 4)}%` } }, T)) }),
        y !== void 0 && /* @__PURE__ */ c("span", { className: cn.baseline, style: { top: `${y}%` } }),
        $ && l && s !== "bars" && v && /* @__PURE__ */ c("span", { className: cn.point, style: { left: `${v.x}%`, top: `${v.y}%` } })
      ] })
    }
  );
}
const b_ = "_field_1gc6b_1", y_ = "_label_1gc6b_8", v_ = "_req_1gc6b_15", w_ = "_meta_1gc6b_19", k_ = "_hint_1gc6b_25", __ = "_error_1gc6b_29", Oa = {
  field: b_,
  label: y_,
  req: v_,
  meta: w_,
  hint: k_,
  error: __
};
function i6({ label: e, hint: t, error: a, required: n, skeleton: s = !1, className: i, children: r, ...l }) {
  const d = Ee(), u = Re(), m = !!a, h = t || a ? `${d}-meta` : void 0;
  return s ? /* @__PURE__ */ P("div", { ...l, className: I(Oa.field, i), children: [
    e && /* @__PURE__ */ c("span", { className: Oa.label, children: /* @__PURE__ */ c(J, { variant: De.Text, width: "5rem" }) }),
    r,
    /* @__PURE__ */ c("div", { className: Oa.meta, children: t && /* @__PURE__ */ c(J, { variant: De.Text, width: "9rem" }) })
  ] }) : /* @__PURE__ */ P("div", { ...l, className: I(Oa.field, i), "data-invalid": m || void 0, children: [
    e && /* @__PURE__ */ P("label", { htmlFor: d, className: Oa.label, children: [
      e,
      n && /* @__PURE__ */ P("span", { className: Oa.req, "aria-hidden": "true", children: [
        " ",
        "*"
      ] })
    ] }),
    /* @__PURE__ */ c(Bd.Provider, { value: { id: d, describedBy: h, invalid: m }, children: r }),
    /* @__PURE__ */ c("div", { className: Oa.meta, id: h, children: /* @__PURE__ */ c(zi, { mode: "popLayout", initial: !1, children: a ? /* @__PURE__ */ c(
      $e.div,
      {
        className: Oa.error,
        role: "alert",
        initial: { opacity: 0 },
        animate: u ? { opacity: 1 } : { opacity: 1, ...hi(Bs.Shake).animate },
        exit: { opacity: 0 },
        transition: u ? { duration: 0 } : hi(Bs.Shake).transition,
        children: a
      },
      "error"
    ) : t ? /* @__PURE__ */ c(
      $e.div,
      {
        className: Oa.hint,
        ...hi(Bs.FadeIn, Ge.Fast),
        transition: u ? { duration: 0 } : hi(Bs.FadeIn, Ge.Fast).transition,
        children: t
      },
      "hint"
    ) : null }) })
  ] });
}
const x_ = "_fieldset_1ncxy_3", S_ = "_legend_1ncxy_12", M_ = "_description_1ncxy_20", $_ = "_actions_1ncxy_29", T_ = "_content_1ncxy_38", C_ = "_bordered_1ncxy_46", N_ = "_section_1ncxy_71", D_ = "_divider_1ncxy_75", z_ = "_header_1ncxy_79", P_ = "_headerText_1ncxy_86", A_ = "_sectionActions_1ncxy_92", O_ = "_sectionContent_1ncxy_99", ft = {
  fieldset: x_,
  legend: S_,
  description: M_,
  actions: $_,
  content: T_,
  bordered: C_,
  section: N_,
  divider: D_,
  header: z_,
  headerText: P_,
  sectionActions: A_,
  sectionContent: O_
};
function r6({
  legend: e,
  description: t,
  actions: a,
  disabled: n,
  bordered: s = !1,
  skeleton: i = !1,
  className: r,
  children: l,
  "aria-describedby": d,
  ...u
}) {
  const m = Ee(), h = t ? `${m}-description` : void 0;
  return i ? /* @__PURE__ */ P("fieldset", { ...u, className: I(ft.fieldset, s && ft.bordered, r), children: [
    /* @__PURE__ */ c("legend", { className: ft.legend, children: /* @__PURE__ */ c(J, { variant: De.Text, width: "8rem" }) }),
    t && /* @__PURE__ */ c("div", { className: ft.description, children: /* @__PURE__ */ c(J, { variant: De.Text, width: "16rem" }) }),
    /* @__PURE__ */ c("div", { className: ft.content, children: l })
  ] }) : /* @__PURE__ */ P(
    "fieldset",
    {
      ...u,
      disabled: n,
      "aria-describedby": I(d, h) || void 0,
      className: I(ft.fieldset, s && ft.bordered, r),
      children: [
        /* @__PURE__ */ c("legend", { className: ft.legend, children: e }),
        t && /* @__PURE__ */ c("div", { id: h, className: ft.description, children: t }),
        a && /* @__PURE__ */ c("div", { className: ft.actions, children: a }),
        /* @__PURE__ */ c("div", { className: ft.content, children: l })
      ]
    }
  );
}
function l6({
  title: e,
  level: t = 3,
  description: a,
  actions: n,
  divider: s = !1,
  skeleton: i = !1,
  className: r,
  children: l,
  ...d
}) {
  const u = Ee();
  return i ? /* @__PURE__ */ P("section", { ...d, className: I(ft.section, r), children: [
    s && /* @__PURE__ */ c(cc, { className: ft.divider }),
    /* @__PURE__ */ c("div", { className: ft.header, children: /* @__PURE__ */ P("div", { className: ft.headerText, children: [
      /* @__PURE__ */ c(sa, { level: t, noMargin: !0, skeleton: !0 }),
      a && /* @__PURE__ */ c("div", { className: ft.description, children: /* @__PURE__ */ c(J, { variant: De.Text, width: "16rem" }) })
    ] }) }),
    /* @__PURE__ */ c("div", { className: ft.sectionContent, children: l })
  ] }) : /* @__PURE__ */ P("section", { ...d, "aria-labelledby": u, className: I(ft.section, r), children: [
    s && /* @__PURE__ */ c(cc, { className: ft.divider }),
    /* @__PURE__ */ P("div", { className: ft.header, children: [
      /* @__PURE__ */ P("div", { className: ft.headerText, children: [
        /* @__PURE__ */ c(sa, { id: u, level: t, noMargin: !0, children: e }),
        a && /* @__PURE__ */ c("div", { className: ft.description, children: a })
      ] }),
      n && /* @__PURE__ */ c("div", { className: ft.sectionActions, children: n })
    ] }),
    /* @__PURE__ */ c("div", { className: ft.sectionContent, children: l })
  ] });
}
function E_(e, t, a = "long") {
  return new Intl.DateTimeFormat("en-US", {
    // Enforces engine to render the time. Without the option JavaScriptCore omits it.
    hour: "numeric",
    timeZone: e,
    timeZoneName: a
  }).format(t).split(/\s/g).slice(2).join(" ");
}
const W_ = {}, Hs = {};
function La(e, t) {
  try {
    const n = (W_[e] ||= new Intl.DateTimeFormat("en-US", {
      timeZone: e,
      timeZoneName: "longOffset"
    }).format)(t).split("GMT")[1];
    return n in Hs ? Hs[n] : bc(n, n.split(":"));
  } catch {
    if (e in Hs) return Hs[e];
    const a = e?.match(I_);
    return a ? bc(e, a.slice(1)) : NaN;
  }
}
const I_ = /([+-]\d\d):?(\d\d)?/;
function bc(e, t) {
  const a = +(t[0] || 0), n = +(t[1] || 0), s = +(t[2] || 0) / 60;
  return Hs[e] = a * 60 + n > 0 ? a * 60 + n + s : a * 60 - n - s;
}
class ka extends Date {
  //#region static
  constructor(...t) {
    super(), t.length > 1 && typeof t[t.length - 1] == "string" && (this.timeZone = t.pop()), this.internal = /* @__PURE__ */ new Date(), isNaN(La(this.timeZone, this)) ? this.setTime(NaN) : t.length ? typeof t[0] == "number" && (t.length === 1 || t.length === 2 && typeof t[1] != "number") ? this.setTime(t[0]) : typeof t[0] == "string" ? this.setTime(+new Date(t[0])) : t[0] instanceof Date ? this.setTime(+t[0]) : (this.setTime(+new Date(...t)), Vd(this, t)) : this.setTime(Date.now());
  }
  static tz(t, ...a) {
    return a.length ? new ka(...a, t) : new ka(Date.now(), t);
  }
  //#endregion
  //#region time zone
  withTimeZone(t) {
    return new ka(+this, t);
  }
  getTimezoneOffset() {
    const t = -La(this.timeZone, this);
    return t > 0 ? Math.floor(t) : Math.ceil(t);
  }
  //#endregion
  //#region time
  setTime(t) {
    return Date.prototype.setTime.apply(this, arguments), Ti(this), +this;
  }
  //#endregion
  //#region date-fns integration
  [/* @__PURE__ */ Symbol.for("constructDateFrom")](t) {
    return new ka(+new Date(t), this.timeZone);
  }
  //#endregion
}
const yc = /^(get|set)(?!UTC)/;
Object.getOwnPropertyNames(Date.prototype).forEach((e) => {
  if (!yc.test(e)) return;
  const t = e.replace(yc, "$1UTC");
  ka.prototype[t] && (e.startsWith("get") ? ka.prototype[e] = function() {
    return this.internal[t]();
  } : (ka.prototype[e] = function() {
    return Date.prototype[t].apply(this.internal, arguments), R_(this), +this;
  }, ka.prototype[t] = function() {
    return Date.prototype[t].apply(this, arguments), Ti(this), +this;
  }));
});
function Ti(e) {
  e.internal.setTime(+e), e.internal.setUTCSeconds(e.internal.getUTCSeconds() - // Round after converting minutes to seconds to avoid fractional offset
  // precision errors from historical offsets.
  Math.round(-La(e.timeZone, e) * 60));
}
function R_(e) {
  Date.prototype.setFullYear.call(e, e.internal.getUTCFullYear(), e.internal.getUTCMonth(), e.internal.getUTCDate()), Date.prototype.setHours.call(e, e.internal.getUTCHours(), e.internal.getUTCMinutes(), e.internal.getUTCSeconds(), e.internal.getUTCMilliseconds()), Vd(e);
}
function Vd(e, t) {
  const a = Array.isArray(t) ? L_(t) : +e.internal, n = La(e.timeZone, e), s = n > 0 ? Math.floor(n) : Math.ceil(n), i = /* @__PURE__ */ new Date(+e);
  i.setUTCHours(i.getUTCHours() - 1);
  const r = -(/* @__PURE__ */ new Date(+e)).getTimezoneOffset(), l = -(/* @__PURE__ */ new Date(+i)).getTimezoneOffset(), d = r - l;
  let u = r;
  if (d && r !== s) {
    const F = Date.prototype.getHours.apply(e), L = Array.isArray(t) ? t[3] || 0 : e.internal.getUTCHours();
    if (F !== L) {
      const O = /* @__PURE__ */ new Date(+e), q = r - s;
      q && O.setUTCMinutes(O.getUTCMinutes() + q);
      const j = La(e.timeZone, O);
      (j > 0 ? Math.floor(j) : Math.ceil(j)) === s && (u = l);
    }
  }
  const m = u - s;
  m && Date.prototype.setUTCMinutes.call(e, Date.prototype.getUTCMinutes.call(e) + m);
  const h = /* @__PURE__ */ new Date(+e);
  h.setUTCSeconds(0);
  const f = r > 0 ? h.getSeconds() : (h.getSeconds() - 60) % 60, b = Math.round(-(La(e.timeZone, e) * 60)) % 60;
  (b || f) && Date.prototype.setUTCSeconds.call(e, Date.prototype.getUTCSeconds.call(e) + b + f);
  const w = La(e.timeZone, e), S = w > 0 ? Math.floor(w) : Math.ceil(w), N = -(/* @__PURE__ */ new Date(+e)).getTimezoneOffset() - S, y = S !== s, v = N - m, _ = S - s, k = a - S * 60 * 1e3, M = _ > 0 && vc(e) - a === _ * 60 * 1e3 && vc(e, k) !== a;
  if (y && v && !M) {
    Date.prototype.setUTCMinutes.call(e, Date.prototype.getUTCMinutes.call(e) + v);
    const F = La(e.timeZone, e), L = F > 0 ? Math.floor(F) : Math.ceil(F), O = S - L;
    O && v < 0 && Date.prototype.setUTCMinutes.call(e, Date.prototype.getUTCMinutes.call(e) + O);
  }
  Ti(e);
  const A = (t ? a : a + b * 1e3) - +e.internal;
  A && Math.abs(A) < 1800 * 1e3 && (Date.prototype.setTime.call(e, +e + A), Ti(e));
}
function L_(e) {
  return Date.UTC(e[0], e.length > 1 ? e[1] : 0, e.length > 2 ? e[2] : 1, ...e.slice(3));
}
function vc(e, t) {
  const a = new Date(t ?? +e);
  return a.setUTCSeconds(a.getUTCSeconds() - Math.round(-La(e.timeZone, a) * 60)), +a;
}
class Kt extends ka {
  //#region static
  static tz(t, ...a) {
    return a.length ? new Kt(...a, t) : new Kt(Date.now(), t);
  }
  //#endregion
  //#region representation
  toISOString() {
    const [t, a, n] = this.tzComponents(), s = `${t}${a}:${n}`;
    return this.internal.toISOString().slice(0, -1) + s;
  }
  toString() {
    return `${this.toDateString()} ${this.toTimeString()}`;
  }
  toDateString() {
    const [t, a, n, s] = this.internal.toUTCString().split(" ");
    return `${t?.slice(0, -1)} ${n} ${a} ${s}`;
  }
  toTimeString() {
    const t = this.internal.toUTCString().split(" ")[4], [a, n, s] = this.tzComponents();
    return `${t} GMT${a}${n}${s} (${E_(this.timeZone, this)})`;
  }
  toLocaleString(t, a) {
    return Date.prototype.toLocaleString.call(this, t, {
      ...a,
      timeZone: a?.timeZone || this.timeZone
    });
  }
  toLocaleDateString(t, a) {
    return Date.prototype.toLocaleDateString.call(this, t, {
      ...a,
      timeZone: a?.timeZone || this.timeZone
    });
  }
  toLocaleTimeString(t, a) {
    return Date.prototype.toLocaleTimeString.call(this, t, {
      ...a,
      timeZone: a?.timeZone || this.timeZone
    });
  }
  //#endregion
  //#region private
  tzComponents() {
    const t = this.getTimezoneOffset(), a = t > 0 ? "-" : "+", n = String(Math.floor(Math.abs(t) / 60)).padStart(2, "0"), s = String(Math.abs(t) % 60).padStart(2, "0");
    return [a, n, s];
  }
  //#endregion
  withTimeZone(t) {
    return new Kt(+this, t);
  }
  //#region date-fns integration
  [/* @__PURE__ */ Symbol.for("constructDateFrom")](t) {
    return new Kt(+new Date(t), this.timeZone);
  }
  //#endregion
}
const Gd = 6048e5, q_ = 864e5, wc = /* @__PURE__ */ Symbol.for("constructDateFrom");
function $t(e, t) {
  return typeof e == "function" ? e(t) : e && typeof e == "object" && wc in e ? e[wc](t) : e instanceof Date ? new e.constructor(t) : new Date(t);
}
function Qe(e, t) {
  return $t(t || e, e);
}
function Kd(e, t, a) {
  const n = Qe(e, a?.in);
  return isNaN(t) ? $t(e, NaN) : (t && n.setDate(n.getDate() + t), n);
}
function Ud(e, t, a) {
  const n = Qe(e, a?.in);
  if (isNaN(t)) return $t(e, NaN);
  if (!t)
    return n;
  const s = n.getDate(), i = $t(e, n.getTime());
  i.setMonth(n.getMonth() + t + 1, 0);
  const r = i.getDate();
  return s >= r ? i : (n.setFullYear(
    i.getFullYear(),
    i.getMonth(),
    s
  ), n);
}
let F_ = {};
function ai() {
  return F_;
}
function lo(e, t) {
  const a = ai(), n = t?.weekStartsOn ?? t?.locale?.options?.weekStartsOn ?? a.weekStartsOn ?? a.locale?.options?.weekStartsOn ?? 0, s = Qe(e, t?.in), i = s.getDay(), r = (i < n ? 7 : 0) + i - n;
  return s.setDate(s.getDate() - r), s.setHours(0, 0, 0, 0), s;
}
function Js(e, t) {
  return lo(e, { ...t, weekStartsOn: 1 });
}
function Xd(e, t) {
  const a = Qe(e, t?.in), n = a.getFullYear(), s = $t(a, 0);
  s.setFullYear(n + 1, 0, 4), s.setHours(0, 0, 0, 0);
  const i = Js(s), r = $t(a, 0);
  r.setFullYear(n, 0, 4), r.setHours(0, 0, 0, 0);
  const l = Js(r);
  return a.getTime() >= i.getTime() ? n + 1 : a.getTime() >= l.getTime() ? n : n - 1;
}
function kc(e) {
  const t = Qe(e), a = new Date(
    Date.UTC(
      t.getFullYear(),
      t.getMonth(),
      t.getDate(),
      t.getHours(),
      t.getMinutes(),
      t.getSeconds(),
      t.getMilliseconds()
    )
  );
  return a.setUTCFullYear(t.getFullYear()), +e - +a;
}
function qo(e, ...t) {
  const a = $t.bind(
    null,
    e || t.find((n) => typeof n == "object")
  );
  return t.map(a);
}
function Qs(e, t) {
  const a = Qe(e, t?.in);
  return a.setHours(0, 0, 0, 0), a;
}
function el(e, t, a) {
  const [n, s] = qo(
    a?.in,
    e,
    t
  ), i = Qs(n), r = Qs(s), l = +i - kc(i), d = +r - kc(r);
  return Math.round((l - d) / q_);
}
function B_(e, t) {
  const a = Xd(e, t), n = $t(e, 0);
  return n.setFullYear(a, 0, 4), n.setHours(0, 0, 0, 0), Js(n);
}
function H_(e, t, a) {
  return Kd(e, t * 7, a);
}
function j_(e, t, a) {
  return Ud(e, t * 12, a);
}
function Y_(e, t) {
  let a, n = t?.in;
  return e.forEach((s) => {
    !n && typeof s == "object" && (n = $t.bind(null, s));
    const i = Qe(s, n);
    (!a || a < i || isNaN(+i)) && (a = i);
  }), $t(n, a || NaN);
}
function V_(e, t) {
  let a, n = t?.in;
  return e.forEach((s) => {
    !n && typeof s == "object" && (n = $t.bind(null, s));
    const i = Qe(s, n);
    (!a || a > i || isNaN(+i)) && (a = i);
  }), $t(n, a || NaN);
}
function G_(e, t, a) {
  const [n, s] = qo(
    a?.in,
    e,
    t
  );
  return +Qs(n) == +Qs(s);
}
function Jd(e) {
  return e instanceof Date || typeof e == "object" && Object.prototype.toString.call(e) === "[object Date]";
}
function K_(e) {
  return !(!Jd(e) && typeof e != "number" || isNaN(+Qe(e)));
}
function Qd(e, t, a) {
  const [n, s] = qo(
    a?.in,
    e,
    t
  ), i = n.getFullYear() - s.getFullYear(), r = n.getMonth() - s.getMonth();
  return i * 12 + r;
}
function U_(e, t) {
  const a = Qe(e, t?.in), n = a.getMonth();
  return a.setFullYear(a.getFullYear(), n + 1, 0), a.setHours(23, 59, 59, 999), a;
}
function Zd(e, t) {
  const [a, n] = qo(e, t.start, t.end);
  return { start: a, end: n };
}
function X_(e, t) {
  const { start: a, end: n } = Zd(t?.in, e);
  let s = +a > +n;
  const i = s ? +a : +n, r = s ? n : a;
  r.setHours(0, 0, 0, 0), r.setDate(1);
  let l = 1;
  const d = [];
  for (; +r <= i; )
    d.push($t(a, r)), r.setMonth(r.getMonth() + l);
  return s ? d.reverse() : d;
}
function J_(e, t) {
  const a = Qe(e, t?.in);
  return a.setDate(1), a.setHours(0, 0, 0, 0), a;
}
function Q_(e, t) {
  const a = Qe(e, t?.in), n = a.getFullYear();
  return a.setFullYear(n + 1, 0, 0), a.setHours(23, 59, 59, 999), a;
}
function eu(e, t) {
  const a = Qe(e, t?.in);
  return a.setFullYear(a.getFullYear(), 0, 1), a.setHours(0, 0, 0, 0), a;
}
function Z_(e, t) {
  const { start: a, end: n } = Zd(t?.in, e);
  let s = +a > +n;
  const i = s ? +a : +n, r = s ? n : a;
  r.setHours(0, 0, 0, 0), r.setMonth(0, 1);
  let l = 1;
  const d = [];
  for (; +r <= i; )
    d.push($t(a, r)), r.setFullYear(r.getFullYear() + l);
  return s ? d.reverse() : d;
}
function tu(e, t) {
  const a = ai(), n = t?.weekStartsOn ?? t?.locale?.options?.weekStartsOn ?? a.weekStartsOn ?? a.locale?.options?.weekStartsOn ?? 0, s = Qe(e, t?.in), i = s.getDay(), r = (i < n ? -7 : 0) + 6 - (i - n);
  return s.setDate(s.getDate() + r), s.setHours(23, 59, 59, 999), s;
}
function e0(e, t) {
  return tu(e, { ...t, weekStartsOn: 1 });
}
const t0 = {
  lessThanXSeconds: {
    one: "less than a second",
    other: "less than {{count}} seconds"
  },
  xSeconds: {
    one: "1 second",
    other: "{{count}} seconds"
  },
  halfAMinute: "half a minute",
  lessThanXMinutes: {
    one: "less than a minute",
    other: "less than {{count}} minutes"
  },
  xMinutes: {
    one: "1 minute",
    other: "{{count}} minutes"
  },
  aboutXHours: {
    one: "about 1 hour",
    other: "about {{count}} hours"
  },
  xHours: {
    one: "1 hour",
    other: "{{count}} hours"
  },
  xDays: {
    one: "1 day",
    other: "{{count}} days"
  },
  aboutXWeeks: {
    one: "about 1 week",
    other: "about {{count}} weeks"
  },
  xWeeks: {
    one: "1 week",
    other: "{{count}} weeks"
  },
  aboutXMonths: {
    one: "about 1 month",
    other: "about {{count}} months"
  },
  xMonths: {
    one: "1 month",
    other: "{{count}} months"
  },
  aboutXYears: {
    one: "about 1 year",
    other: "about {{count}} years"
  },
  xYears: {
    one: "1 year",
    other: "{{count}} years"
  },
  overXYears: {
    one: "over 1 year",
    other: "over {{count}} years"
  },
  almostXYears: {
    one: "almost 1 year",
    other: "almost {{count}} years"
  }
}, n0 = (e, t, a) => {
  let n;
  const s = t0[e];
  return typeof s == "string" ? n = s : t === 1 ? n = s.one : n = s.other.replace("{{count}}", t.toString()), a?.addSuffix ? a.comparison && a.comparison > 0 ? "in " + n : n + " ago" : n;
};
function gt(e) {
  return (t = {}) => {
    const a = t.width ? String(t.width) : e.defaultWidth;
    return e.formats[a] || e.formats[e.defaultWidth];
  };
}
const a0 = {
  full: "EEEE, MMMM do, y",
  long: "MMMM do, y",
  medium: "MMM d, y",
  short: "MM/dd/yyyy"
}, o0 = {
  full: "h:mm:ss a zzzz",
  long: "h:mm:ss a z",
  medium: "h:mm:ss a",
  short: "h:mm a"
}, s0 = {
  full: "{{date}} 'at' {{time}}",
  long: "{{date}} 'at' {{time}}",
  medium: "{{date}}, {{time}}",
  short: "{{date}}, {{time}}"
}, i0 = {
  date: gt({
    formats: a0,
    defaultWidth: "full"
  }),
  time: gt({
    formats: o0,
    defaultWidth: "full"
  }),
  dateTime: gt({
    formats: s0,
    defaultWidth: "full"
  })
}, r0 = {
  lastWeek: "'last' eeee 'at' p",
  yesterday: "'yesterday at' p",
  today: "'today at' p",
  tomorrow: "'tomorrow at' p",
  nextWeek: "eeee 'at' p",
  other: "P"
}, l0 = (e, t, a, n) => r0[e];
function Te(e) {
  return (t, a) => {
    const n = a?.context ? String(a.context) : "standalone";
    let s;
    if (n === "formatting" && e.formattingValues) {
      const r = e.defaultFormattingWidth || e.defaultWidth, l = a?.width ? String(a.width) : r;
      s = e.formattingValues[l] || e.formattingValues[r];
    } else {
      const r = e.defaultWidth, l = a?.width ? String(a.width) : e.defaultWidth;
      s = e.values[l] || e.values[r];
    }
    const i = e.argumentCallback ? e.argumentCallback(t) : t;
    return s[i];
  };
}
const c0 = {
  narrow: ["B", "A"],
  abbreviated: ["BC", "AD"],
  wide: ["Before Christ", "Anno Domini"]
}, d0 = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["Q1", "Q2", "Q3", "Q4"],
  wide: ["1st quarter", "2nd quarter", "3rd quarter", "4th quarter"]
}, u0 = {
  narrow: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
  abbreviated: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ],
  wide: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ]
}, h0 = {
  narrow: ["S", "M", "T", "W", "T", "F", "S"],
  short: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"],
  abbreviated: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  wide: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ]
}, m0 = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "mi",
    noon: "n",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "midnight",
    noon: "noon",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "midnight",
    noon: "noon",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night"
  }
}, p0 = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "mi",
    noon: "n",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    night: "at night"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "midnight",
    noon: "noon",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    night: "at night"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "midnight",
    noon: "noon",
    morning: "in the morning",
    afternoon: "in the afternoon",
    evening: "in the evening",
    night: "at night"
  }
}, f0 = (e, t) => {
  const a = Number(e), n = a % 100;
  if (n > 20 || n < 10)
    switch (n % 10) {
      case 1:
        return a + "st";
      case 2:
        return a + "nd";
      case 3:
        return a + "rd";
    }
  return a + "th";
}, g0 = {
  ordinalNumber: f0,
  era: Te({
    values: c0,
    defaultWidth: "wide"
  }),
  quarter: Te({
    values: d0,
    defaultWidth: "wide",
    argumentCallback: (e) => e - 1
  }),
  month: Te({
    values: u0,
    defaultWidth: "wide"
  }),
  day: Te({
    values: h0,
    defaultWidth: "wide"
  }),
  dayPeriod: Te({
    values: m0,
    defaultWidth: "wide",
    formattingValues: p0,
    defaultFormattingWidth: "wide"
  })
};
function Ce(e) {
  return (t, a = {}) => {
    const n = a.width, s = n && e.matchPatterns[n] || e.matchPatterns[e.defaultMatchWidth], i = t.match(s);
    if (!i)
      return null;
    const r = i[0], l = n && e.parsePatterns[n] || e.parsePatterns[e.defaultParseWidth], d = Array.isArray(l) ? y0(l, (h) => h.test(r)) : (
      // [TODO] -- I challenge you to fix the type
      b0(l, (h) => h.test(r))
    );
    let u;
    u = e.valueCallback ? e.valueCallback(d) : d, u = a.valueCallback ? (
      // [TODO] -- I challenge you to fix the type
      a.valueCallback(u)
    ) : u;
    const m = t.slice(r.length);
    return { value: u, rest: m };
  };
}
function b0(e, t) {
  for (const a in e)
    if (Object.prototype.hasOwnProperty.call(e, a) && t(e[a]))
      return a;
}
function y0(e, t) {
  for (let a = 0; a < e.length; a++)
    if (t(e[a]))
      return a;
}
function uo(e) {
  return (t, a = {}) => {
    const n = t.match(e.matchPattern);
    if (!n) return null;
    const s = n[0], i = t.match(e.parsePattern);
    if (!i) return null;
    let r = e.valueCallback ? e.valueCallback(i[0]) : i[0];
    r = a.valueCallback ? a.valueCallback(r) : r;
    const l = t.slice(s.length);
    return { value: r, rest: l };
  };
}
const v0 = /^(\d+)(th|st|nd|rd)?/i, w0 = /\d+/i, k0 = {
  narrow: /^(b|a)/i,
  abbreviated: /^(b\.?\s?c\.?|b\.?\s?c\.?\s?e\.?|a\.?\s?d\.?|c\.?\s?e\.?)/i,
  wide: /^(before christ|before common era|anno domini|common era)/i
}, _0 = {
  any: [/^b/i, /^(a|c)/i]
}, x0 = {
  narrow: /^[1234]/i,
  abbreviated: /^q[1234]/i,
  wide: /^[1234](th|st|nd|rd)? quarter/i
}, S0 = {
  any: [/1/i, /2/i, /3/i, /4/i]
}, M0 = {
  narrow: /^[jfmasond]/i,
  abbreviated: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i,
  wide: /^(january|february|march|april|may|june|july|august|september|october|november|december)/i
}, $0 = {
  narrow: [
    /^j/i,
    /^f/i,
    /^m/i,
    /^a/i,
    /^m/i,
    /^j/i,
    /^j/i,
    /^a/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ],
  any: [
    /^ja/i,
    /^f/i,
    /^mar/i,
    /^ap/i,
    /^may/i,
    /^jun/i,
    /^jul/i,
    /^au/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ]
}, T0 = {
  narrow: /^[smtwf]/i,
  short: /^(su|mo|tu|we|th|fr|sa)/i,
  abbreviated: /^(sun|mon|tue|wed|thu|fri|sat)/i,
  wide: /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/i
}, C0 = {
  narrow: [/^s/i, /^m/i, /^t/i, /^w/i, /^t/i, /^f/i, /^s/i],
  any: [/^su/i, /^m/i, /^tu/i, /^w/i, /^th/i, /^f/i, /^sa/i]
}, N0 = {
  narrow: /^(a|p|mi|n|(in the|at) (morning|afternoon|evening|night))/i,
  any: /^([ap]\.?\s?m\.?|midnight|noon|(in the|at) (morning|afternoon|evening|night))/i
}, D0 = {
  any: {
    am: /^a/i,
    pm: /^p/i,
    midnight: /^mi/i,
    noon: /^no/i,
    morning: /morning/i,
    afternoon: /afternoon/i,
    evening: /evening/i,
    night: /night/i
  }
}, z0 = {
  ordinalNumber: uo({
    matchPattern: v0,
    parsePattern: w0,
    valueCallback: (e) => parseInt(e, 10)
  }),
  era: Ce({
    matchPatterns: k0,
    defaultMatchWidth: "wide",
    parsePatterns: _0,
    defaultParseWidth: "any"
  }),
  quarter: Ce({
    matchPatterns: x0,
    defaultMatchWidth: "wide",
    parsePatterns: S0,
    defaultParseWidth: "any",
    valueCallback: (e) => e + 1
  }),
  month: Ce({
    matchPatterns: M0,
    defaultMatchWidth: "wide",
    parsePatterns: $0,
    defaultParseWidth: "any"
  }),
  day: Ce({
    matchPatterns: T0,
    defaultMatchWidth: "wide",
    parsePatterns: C0,
    defaultParseWidth: "any"
  }),
  dayPeriod: Ce({
    matchPatterns: N0,
    defaultMatchWidth: "any",
    parsePatterns: D0,
    defaultParseWidth: "any"
  })
}, Oo = {
  code: "en-US",
  formatDistance: n0,
  formatLong: i0,
  formatRelative: l0,
  localize: g0,
  match: z0,
  options: {
    weekStartsOn: 0,
    firstWeekContainsDate: 1
  }
};
function P0(e, t) {
  const a = Qe(e, t?.in);
  return el(a, eu(a)) + 1;
}
function tl(e, t) {
  const a = Qe(e, t?.in), n = +Js(a) - +B_(a);
  return Math.round(n / Gd) + 1;
}
function nu(e, t) {
  const a = Qe(e, t?.in), n = a.getFullYear(), s = ai(), i = t?.firstWeekContainsDate ?? t?.locale?.options?.firstWeekContainsDate ?? s.firstWeekContainsDate ?? s.locale?.options?.firstWeekContainsDate ?? 1, r = $t(t?.in || e, 0);
  r.setFullYear(n + 1, 0, i), r.setHours(0, 0, 0, 0);
  const l = lo(r, t), d = $t(t?.in || e, 0);
  d.setFullYear(n, 0, i), d.setHours(0, 0, 0, 0);
  const u = lo(d, t);
  return +a >= +l ? n + 1 : +a >= +u ? n : n - 1;
}
function A0(e, t) {
  const a = ai(), n = t?.firstWeekContainsDate ?? t?.locale?.options?.firstWeekContainsDate ?? a.firstWeekContainsDate ?? a.locale?.options?.firstWeekContainsDate ?? 1, s = nu(e, t), i = $t(t?.in || e, 0);
  return i.setFullYear(s, 0, n), i.setHours(0, 0, 0, 0), lo(i, t);
}
function nl(e, t) {
  const a = Qe(e, t?.in), n = +lo(a, t) - +A0(a, t);
  return Math.round(n / Gd) + 1;
}
function Ve(e, t) {
  const a = e < 0 ? "-" : "", n = Math.abs(e).toString().padStart(t, "0");
  return a + n;
}
const to = {
  // Year
  y(e, t) {
    const a = e.getFullYear(), n = a > 0 ? a : 1 - a;
    return Ve(t === "yy" ? n % 100 : n, t.length);
  },
  // Month
  M(e, t) {
    const a = e.getMonth();
    return t === "M" ? String(a + 1) : Ve(a + 1, 2);
  },
  // Day of the month
  d(e, t) {
    return Ve(e.getDate(), t.length);
  },
  // AM or PM
  a(e, t) {
    const a = e.getHours() / 12 >= 1 ? "pm" : "am";
    switch (t) {
      case "a":
      case "aa":
        return a.toUpperCase();
      case "aaa":
        return a;
      case "aaaaa":
        return a[0];
      default:
        return a === "am" ? "a.m." : "p.m.";
    }
  },
  // Hour [1-12]
  h(e, t) {
    return Ve(e.getHours() % 12 || 12, t.length);
  },
  // Hour [0-23]
  H(e, t) {
    return Ve(e.getHours(), t.length);
  },
  // Minute
  m(e, t) {
    return Ve(e.getMinutes(), t.length);
  },
  // Second
  s(e, t) {
    return Ve(e.getSeconds(), t.length);
  },
  // Fraction of second
  S(e, t) {
    const a = t.length, n = e.getMilliseconds(), s = Math.trunc(
      n * Math.pow(10, a - 3)
    );
    return Ve(s, t.length);
  }
}, ss = {
  midnight: "midnight",
  noon: "noon",
  morning: "morning",
  afternoon: "afternoon",
  evening: "evening",
  night: "night"
}, _c = {
  // Era
  G: function(e, t, a) {
    const n = e.getFullYear() > 0 ? 1 : 0;
    switch (t) {
      // AD, BC
      case "G":
      case "GG":
      case "GGG":
        return a.era(n, { width: "abbreviated" });
      // A, B
      case "GGGGG":
        return a.era(n, { width: "narrow" });
      default:
        return a.era(n, { width: "wide" });
    }
  },
  // Year
  y: function(e, t, a) {
    if (t === "yo") {
      const n = e.getFullYear(), s = n > 0 ? n : 1 - n;
      return a.ordinalNumber(s, { unit: "year" });
    }
    return to.y(e, t);
  },
  // Local week-numbering year
  Y: function(e, t, a, n) {
    const s = nu(e, n), i = s > 0 ? s : 1 - s;
    if (t === "YY") {
      const r = i % 100;
      return Ve(r, 2);
    }
    return t === "Yo" ? a.ordinalNumber(i, { unit: "year" }) : Ve(i, t.length);
  },
  // ISO week-numbering year
  R: function(e, t) {
    const a = Xd(e);
    return Ve(a, t.length);
  },
  // Extended year. This is a single number designating the year of this calendar system.
  // The main difference between `y` and `u` localizers are B.C. years:
  // | Year | `y` | `u` |
  // |------|-----|-----|
  // | AC 1 |   1 |   1 |
  // | BC 1 |   1 |   0 |
  // | BC 2 |   2 |  -1 |
  // Also `yy` always returns the last two digits of a year,
  // while `uu` pads single digit years to 2 characters and returns other years unchanged.
  u: function(e, t) {
    const a = e.getFullYear();
    return Ve(a, t.length);
  },
  // Quarter
  Q: function(e, t, a) {
    const n = Math.ceil((e.getMonth() + 1) / 3);
    switch (t) {
      // 1, 2, 3, 4
      case "Q":
        return String(n);
      // 01, 02, 03, 04
      case "QQ":
        return Ve(n, 2);
      // 1st, 2nd, 3rd, 4th
      case "Qo":
        return a.ordinalNumber(n, { unit: "quarter" });
      // Q1, Q2, Q3, Q4
      case "QQQ":
        return a.quarter(n, {
          width: "abbreviated",
          context: "formatting"
        });
      // 1, 2, 3, 4 (narrow quarter; could be not numerical)
      case "QQQQQ":
        return a.quarter(n, {
          width: "narrow",
          context: "formatting"
        });
      default:
        return a.quarter(n, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  // Stand-alone quarter
  q: function(e, t, a) {
    const n = Math.ceil((e.getMonth() + 1) / 3);
    switch (t) {
      // 1, 2, 3, 4
      case "q":
        return String(n);
      // 01, 02, 03, 04
      case "qq":
        return Ve(n, 2);
      // 1st, 2nd, 3rd, 4th
      case "qo":
        return a.ordinalNumber(n, { unit: "quarter" });
      // Q1, Q2, Q3, Q4
      case "qqq":
        return a.quarter(n, {
          width: "abbreviated",
          context: "standalone"
        });
      // 1, 2, 3, 4 (narrow quarter; could be not numerical)
      case "qqqqq":
        return a.quarter(n, {
          width: "narrow",
          context: "standalone"
        });
      default:
        return a.quarter(n, {
          width: "wide",
          context: "standalone"
        });
    }
  },
  // Month
  M: function(e, t, a) {
    const n = e.getMonth();
    switch (t) {
      case "M":
      case "MM":
        return to.M(e, t);
      // 1st, 2nd, ..., 12th
      case "Mo":
        return a.ordinalNumber(n + 1, { unit: "month" });
      // Jan, Feb, ..., Dec
      case "MMM":
        return a.month(n, {
          width: "abbreviated",
          context: "formatting"
        });
      // J, F, ..., D
      case "MMMMM":
        return a.month(n, {
          width: "narrow",
          context: "formatting"
        });
      default:
        return a.month(n, { width: "wide", context: "formatting" });
    }
  },
  // Stand-alone month
  L: function(e, t, a) {
    const n = e.getMonth();
    switch (t) {
      // 1, 2, ..., 12
      case "L":
        return String(n + 1);
      // 01, 02, ..., 12
      case "LL":
        return Ve(n + 1, 2);
      // 1st, 2nd, ..., 12th
      case "Lo":
        return a.ordinalNumber(n + 1, { unit: "month" });
      // Jan, Feb, ..., Dec
      case "LLL":
        return a.month(n, {
          width: "abbreviated",
          context: "standalone"
        });
      // J, F, ..., D
      case "LLLLL":
        return a.month(n, {
          width: "narrow",
          context: "standalone"
        });
      default:
        return a.month(n, { width: "wide", context: "standalone" });
    }
  },
  // Local week of year
  w: function(e, t, a, n) {
    const s = nl(e, n);
    return t === "wo" ? a.ordinalNumber(s, { unit: "week" }) : Ve(s, t.length);
  },
  // ISO week of year
  I: function(e, t, a) {
    const n = tl(e);
    return t === "Io" ? a.ordinalNumber(n, { unit: "week" }) : Ve(n, t.length);
  },
  // Day of the month
  d: function(e, t, a) {
    return t === "do" ? a.ordinalNumber(e.getDate(), { unit: "date" }) : to.d(e, t);
  },
  // Day of year
  D: function(e, t, a) {
    const n = P0(e);
    return t === "Do" ? a.ordinalNumber(n, { unit: "dayOfYear" }) : Ve(n, t.length);
  },
  // Day of week
  E: function(e, t, a) {
    const n = e.getDay();
    switch (t) {
      // Tue
      case "E":
      case "EE":
      case "EEE":
        return a.day(n, {
          width: "abbreviated",
          context: "formatting"
        });
      // T
      case "EEEEE":
        return a.day(n, {
          width: "narrow",
          context: "formatting"
        });
      // Tu
      case "EEEEEE":
        return a.day(n, {
          width: "short",
          context: "formatting"
        });
      default:
        return a.day(n, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  // Local day of week
  e: function(e, t, a, n) {
    const s = e.getDay(), i = (s - n.weekStartsOn + 8) % 7 || 7;
    switch (t) {
      // Numerical value (Nth day of week with current locale or weekStartsOn)
      case "e":
        return String(i);
      // Padded numerical value
      case "ee":
        return Ve(i, 2);
      // 1st, 2nd, ..., 7th
      case "eo":
        return a.ordinalNumber(i, { unit: "day" });
      case "eee":
        return a.day(s, {
          width: "abbreviated",
          context: "formatting"
        });
      // T
      case "eeeee":
        return a.day(s, {
          width: "narrow",
          context: "formatting"
        });
      // Tu
      case "eeeeee":
        return a.day(s, {
          width: "short",
          context: "formatting"
        });
      default:
        return a.day(s, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  // Stand-alone local day of week
  c: function(e, t, a, n) {
    const s = e.getDay(), i = (s - n.weekStartsOn + 8) % 7 || 7;
    switch (t) {
      // Numerical value (same as in `e`)
      case "c":
        return String(i);
      // Padded numerical value
      case "cc":
        return Ve(i, t.length);
      // 1st, 2nd, ..., 7th
      case "co":
        return a.ordinalNumber(i, { unit: "day" });
      case "ccc":
        return a.day(s, {
          width: "abbreviated",
          context: "standalone"
        });
      // T
      case "ccccc":
        return a.day(s, {
          width: "narrow",
          context: "standalone"
        });
      // Tu
      case "cccccc":
        return a.day(s, {
          width: "short",
          context: "standalone"
        });
      default:
        return a.day(s, {
          width: "wide",
          context: "standalone"
        });
    }
  },
  // ISO day of week
  i: function(e, t, a) {
    const n = e.getDay(), s = n === 0 ? 7 : n;
    switch (t) {
      // 2
      case "i":
        return String(s);
      // 02
      case "ii":
        return Ve(s, t.length);
      // 2nd
      case "io":
        return a.ordinalNumber(s, { unit: "day" });
      // Tue
      case "iii":
        return a.day(n, {
          width: "abbreviated",
          context: "formatting"
        });
      // T
      case "iiiii":
        return a.day(n, {
          width: "narrow",
          context: "formatting"
        });
      // Tu
      case "iiiiii":
        return a.day(n, {
          width: "short",
          context: "formatting"
        });
      default:
        return a.day(n, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  // AM or PM
  a: function(e, t, a) {
    const s = e.getHours() / 12 >= 1 ? "pm" : "am";
    switch (t) {
      case "a":
      case "aa":
        return a.dayPeriod(s, {
          width: "abbreviated",
          context: "formatting"
        });
      case "aaa":
        return a.dayPeriod(s, {
          width: "abbreviated",
          context: "formatting"
        }).toLowerCase();
      case "aaaaa":
        return a.dayPeriod(s, {
          width: "narrow",
          context: "formatting"
        });
      default:
        return a.dayPeriod(s, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  // AM, PM, midnight, noon
  b: function(e, t, a) {
    const n = e.getHours();
    let s;
    switch (n === 12 ? s = ss.noon : n === 0 ? s = ss.midnight : s = n / 12 >= 1 ? "pm" : "am", t) {
      case "b":
      case "bb":
        return a.dayPeriod(s, {
          width: "abbreviated",
          context: "formatting"
        });
      case "bbb":
        return a.dayPeriod(s, {
          width: "abbreviated",
          context: "formatting"
        }).toLowerCase();
      case "bbbbb":
        return a.dayPeriod(s, {
          width: "narrow",
          context: "formatting"
        });
      default:
        return a.dayPeriod(s, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  // in the morning, in the afternoon, in the evening, at night
  B: function(e, t, a) {
    const n = e.getHours();
    let s;
    switch (n >= 17 ? s = ss.evening : n >= 12 ? s = ss.afternoon : n >= 4 ? s = ss.morning : s = ss.night, t) {
      case "B":
      case "BB":
      case "BBB":
        return a.dayPeriod(s, {
          width: "abbreviated",
          context: "formatting"
        });
      case "BBBBB":
        return a.dayPeriod(s, {
          width: "narrow",
          context: "formatting"
        });
      default:
        return a.dayPeriod(s, {
          width: "wide",
          context: "formatting"
        });
    }
  },
  // Hour [1-12]
  h: function(e, t, a) {
    if (t === "ho") {
      let n = e.getHours() % 12;
      return n === 0 && (n = 12), a.ordinalNumber(n, { unit: "hour" });
    }
    return to.h(e, t);
  },
  // Hour [0-23]
  H: function(e, t, a) {
    return t === "Ho" ? a.ordinalNumber(e.getHours(), { unit: "hour" }) : to.H(e, t);
  },
  // Hour [0-11]
  K: function(e, t, a) {
    const n = e.getHours() % 12;
    return t === "Ko" ? a.ordinalNumber(n, { unit: "hour" }) : Ve(n, t.length);
  },
  // Hour [1-24]
  k: function(e, t, a) {
    let n = e.getHours();
    return n === 0 && (n = 24), t === "ko" ? a.ordinalNumber(n, { unit: "hour" }) : Ve(n, t.length);
  },
  // Minute
  m: function(e, t, a) {
    return t === "mo" ? a.ordinalNumber(e.getMinutes(), { unit: "minute" }) : to.m(e, t);
  },
  // Second
  s: function(e, t, a) {
    return t === "so" ? a.ordinalNumber(e.getSeconds(), { unit: "second" }) : to.s(e, t);
  },
  // Fraction of second
  S: function(e, t) {
    return to.S(e, t);
  },
  // Timezone (ISO-8601. If offset is 0, output is always `'Z'`)
  X: function(e, t, a) {
    const n = e.getTimezoneOffset();
    if (n === 0)
      return "Z";
    switch (t) {
      // Hours and optional minutes
      case "X":
        return Sc(n);
      // Hours, minutes and optional seconds without `:` delimiter
      // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
      // so this token always has the same output as `XX`
      case "XXXX":
      case "XX":
        return Do(n);
      // Hours and minutes with `:` delimiter
      default:
        return Do(n, ":");
    }
  },
  // Timezone (ISO-8601. If offset is 0, output is `'+00:00'` or equivalent)
  x: function(e, t, a) {
    const n = e.getTimezoneOffset();
    switch (t) {
      // Hours and optional minutes
      case "x":
        return Sc(n);
      // Hours, minutes and optional seconds without `:` delimiter
      // Note: neither ISO-8601 nor JavaScript supports seconds in timezone offsets
      // so this token always has the same output as `xx`
      case "xxxx":
      case "xx":
        return Do(n);
      // Hours and minutes with `:` delimiter
      default:
        return Do(n, ":");
    }
  },
  // Timezone (GMT)
  O: function(e, t, a) {
    const n = e.getTimezoneOffset();
    switch (t) {
      // Short
      case "O":
      case "OO":
      case "OOO":
        return "GMT" + xc(n, ":");
      default:
        return "GMT" + Do(n, ":");
    }
  },
  // Timezone (specific non-location)
  z: function(e, t, a) {
    const n = e.getTimezoneOffset();
    switch (t) {
      // Short
      case "z":
      case "zz":
      case "zzz":
        return "GMT" + xc(n, ":");
      default:
        return "GMT" + Do(n, ":");
    }
  },
  // Seconds timestamp
  t: function(e, t, a) {
    const n = Math.trunc(+e / 1e3);
    return Ve(n, t.length);
  },
  // Milliseconds timestamp
  T: function(e, t, a) {
    return Ve(+e, t.length);
  }
};
function xc(e, t = "") {
  const a = e > 0 ? "-" : "+", n = Math.abs(e), s = Math.trunc(n / 60), i = n % 60;
  return i === 0 ? a + String(s) : a + String(s) + t + Ve(i, 2);
}
function Sc(e, t) {
  return e % 60 === 0 ? (e > 0 ? "-" : "+") + Ve(Math.abs(e) / 60, 2) : Do(e, t);
}
function Do(e, t = "") {
  const a = e > 0 ? "-" : "+", n = Math.abs(e), s = Ve(Math.trunc(n / 60), 2), i = Ve(n % 60, 2);
  return a + s + t + i;
}
const Mc = (e, t) => {
  switch (e) {
    case "P":
      return t.date({ width: "short" });
    case "PP":
      return t.date({ width: "medium" });
    case "PPP":
      return t.date({ width: "long" });
    default:
      return t.date({ width: "full" });
  }
}, au = (e, t) => {
  switch (e) {
    case "p":
      return t.time({ width: "short" });
    case "pp":
      return t.time({ width: "medium" });
    case "ppp":
      return t.time({ width: "long" });
    default:
      return t.time({ width: "full" });
  }
}, O0 = (e, t) => {
  const a = e.match(/(P+)(p+)?/) || [], n = a[1], s = a[2];
  if (!s)
    return Mc(e, t);
  let i;
  switch (n) {
    case "P":
      i = t.dateTime({ width: "short" });
      break;
    case "PP":
      i = t.dateTime({ width: "medium" });
      break;
    case "PPP":
      i = t.dateTime({ width: "long" });
      break;
    default:
      i = t.dateTime({ width: "full" });
      break;
  }
  return i.replace("{{date}}", Mc(n, t)).replace("{{time}}", au(s, t));
}, E0 = {
  p: au,
  P: O0
}, W0 = /^D+$/, I0 = /^Y+$/, R0 = ["D", "DD", "YY", "YYYY"];
function L0(e) {
  return W0.test(e);
}
function q0(e) {
  return I0.test(e);
}
function F0(e, t, a) {
  const n = B0(e, t, a);
  if (console.warn(n), R0.includes(e)) throw new RangeError(n);
}
function B0(e, t, a) {
  const n = e[0] === "Y" ? "years" : "days of the month";
  return `Use \`${e.toLowerCase()}\` instead of \`${e}\` (in \`${t}\`) for formatting ${n} to the input \`${a}\`; see: https://github.com/date-fns/date-fns/blob/master/docs/unicodeTokens.md`;
}
const H0 = /[yYQqMLwIdDecihHKkms]o|(\w)\1*|''|'(''|[^'])+('|$)|./g, j0 = /P+p+|P+|p+|''|'(''|[^'])+('|$)|./g, Y0 = /^'([^]*?)'?$/, V0 = /''/g, G0 = /[a-zA-Z]/;
function us(e, t, a) {
  const n = ai(), s = a?.locale ?? n.locale ?? Oo, i = a?.firstWeekContainsDate ?? a?.locale?.options?.firstWeekContainsDate ?? n.firstWeekContainsDate ?? n.locale?.options?.firstWeekContainsDate ?? 1, r = a?.weekStartsOn ?? a?.locale?.options?.weekStartsOn ?? n.weekStartsOn ?? n.locale?.options?.weekStartsOn ?? 0, l = Qe(e, a?.in);
  if (!K_(l))
    throw new RangeError("Invalid time value");
  let d = t.match(j0).map((m) => {
    const h = m[0];
    if (h === "p" || h === "P") {
      const f = E0[h];
      return f(m, s.formatLong);
    }
    return m;
  }).join("").match(H0).map((m) => {
    if (m === "''")
      return { isToken: !1, value: "'" };
    const h = m[0];
    if (h === "'")
      return { isToken: !1, value: K0(m) };
    if (_c[h])
      return { isToken: !0, value: m };
    if (h.match(G0))
      throw new RangeError(
        "Format string contains an unescaped latin alphabet character `" + h + "`"
      );
    return { isToken: !1, value: m };
  });
  s.localize.preprocessor && (d = s.localize.preprocessor(l, d));
  const u = {
    firstWeekContainsDate: i,
    weekStartsOn: r,
    locale: s
  };
  return d.map((m) => {
    if (!m.isToken) return m.value;
    const h = m.value;
    (!a?.useAdditionalWeekYearTokens && q0(h) || !a?.useAdditionalDayOfYearTokens && L0(h)) && F0(h, t, String(e));
    const f = _c[h[0]];
    return f(l, h, s.localize, u);
  }).join("");
}
function K0(e) {
  const t = e.match(Y0);
  return t ? t[1].replace(V0, "'") : e;
}
function U0(e, t) {
  const a = Qe(e, t?.in), n = a.getFullYear(), s = a.getMonth(), i = $t(a, 0);
  return i.setFullYear(n, s + 1, 0), i.setHours(0, 0, 0, 0), i.getDate();
}
function X0(e, t) {
  return Qe(e, t?.in).getMonth();
}
function J0(e, t) {
  return Qe(e, t?.in).getFullYear();
}
function Q0(e, t) {
  return +Qe(e) > +Qe(t);
}
function Z0(e, t) {
  return +Qe(e) < +Qe(t);
}
function ex(e, t, a) {
  const [n, s] = qo(
    a?.in,
    e,
    t
  );
  return +lo(n, a) == +lo(s, a);
}
function tx(e, t, a) {
  const [n, s] = qo(
    a?.in,
    e,
    t
  );
  return n.getFullYear() === s.getFullYear() && n.getMonth() === s.getMonth();
}
function nx(e, t, a) {
  const [n, s] = qo(
    a?.in,
    e,
    t
  );
  return n.getFullYear() === s.getFullYear();
}
function ax(e, t, a) {
  const n = Qe(e, a?.in), s = n.getFullYear(), i = n.getDate(), r = $t(e, 0);
  r.setFullYear(s, t, 15), r.setHours(0, 0, 0, 0);
  const l = U0(r);
  return n.setMonth(t, Math.min(i, l)), n;
}
function ox(e, t, a) {
  const n = Qe(e, a?.in);
  return isNaN(+n) ? $t(e, NaN) : (n.setFullYear(t), n);
}
const $c = 5, sx = 4;
function ix(e, t) {
  const a = t.startOfMonth(e), n = a.getDay() > 0 ? a.getDay() : 7, s = t.addDays(e, -n + 1), i = t.addDays(s, $c * 7 - 1);
  return t.getMonth(e) === t.getMonth(i) ? $c : sx;
}
function ou(e, t) {
  const a = t.startOfMonth(e), n = a.getDay();
  return n === 1 ? a : n === 0 ? t.addDays(a, -6) : t.addDays(a, -1 * (n - 1));
}
function rx(e, t) {
  const a = ou(e, t), n = ix(e, t);
  return t.addDays(a, n * 7 - 1);
}
const lx = {
  lessThanXSeconds: {
    one: "أقل من ثانية",
    two: "أقل من ثانيتين",
    threeToTen: "أقل من {{count}} ثواني",
    other: "أقل من {{count}} ثانية"
  },
  xSeconds: {
    one: "ثانية واحدة",
    two: "ثانيتان",
    threeToTen: "{{count}} ثواني",
    other: "{{count}} ثانية"
  },
  halfAMinute: "نصف دقيقة",
  lessThanXMinutes: {
    one: "أقل من دقيقة",
    two: "أقل من دقيقتين",
    threeToTen: "أقل من {{count}} دقائق",
    other: "أقل من {{count}} دقيقة"
  },
  xMinutes: {
    one: "دقيقة واحدة",
    two: "دقيقتان",
    threeToTen: "{{count}} دقائق",
    other: "{{count}} دقيقة"
  },
  aboutXHours: {
    one: "ساعة واحدة تقريباً",
    two: "ساعتين تقريبا",
    threeToTen: "{{count}} ساعات تقريباً",
    other: "{{count}} ساعة تقريباً"
  },
  xHours: {
    one: "ساعة واحدة",
    two: "ساعتان",
    threeToTen: "{{count}} ساعات",
    other: "{{count}} ساعة"
  },
  xDays: {
    one: "يوم واحد",
    two: "يومان",
    threeToTen: "{{count}} أيام",
    other: "{{count}} يوم"
  },
  aboutXWeeks: {
    one: "أسبوع واحد تقريبا",
    two: "أسبوعين تقريبا",
    threeToTen: "{{count}} أسابيع تقريبا",
    other: "{{count}} أسبوعا تقريبا"
  },
  xWeeks: {
    one: "أسبوع واحد",
    two: "أسبوعان",
    threeToTen: "{{count}} أسابيع",
    other: "{{count}} أسبوعا"
  },
  aboutXMonths: {
    one: "شهر واحد تقريباً",
    two: "شهرين تقريبا",
    threeToTen: "{{count}} أشهر تقريبا",
    other: "{{count}} شهرا تقريباً"
  },
  xMonths: {
    one: "شهر واحد",
    two: "شهران",
    threeToTen: "{{count}} أشهر",
    other: "{{count}} شهرا"
  },
  aboutXYears: {
    one: "سنة واحدة تقريباً",
    two: "سنتين تقريبا",
    threeToTen: "{{count}} سنوات تقريباً",
    other: "{{count}} سنة تقريباً"
  },
  xYears: {
    one: "سنة واحد",
    two: "سنتان",
    threeToTen: "{{count}} سنوات",
    other: "{{count}} سنة"
  },
  overXYears: {
    one: "أكثر من سنة",
    two: "أكثر من سنتين",
    threeToTen: "أكثر من {{count}} سنوات",
    other: "أكثر من {{count}} سنة"
  },
  almostXYears: {
    one: "ما يقارب سنة واحدة",
    two: "ما يقارب سنتين",
    threeToTen: "ما يقارب {{count}} سنوات",
    other: "ما يقارب {{count}} سنة"
  }
}, cx = (e, t, a) => {
  const n = lx[e];
  let s;
  return typeof n == "string" ? s = n : t === 1 ? s = n.one : t === 2 ? s = n.two : t <= 10 ? s = n.threeToTen.replace("{{count}}", String(t)) : s = n.other.replace("{{count}}", String(t)), a?.addSuffix ? a.comparison && a.comparison > 0 ? "خلال " + s : "منذ " + s : s;
}, dx = {
  full: "EEEE، do MMMM y",
  long: "do MMMM y",
  medium: "d MMM y",
  short: "dd/MM/yyyy"
}, ux = {
  full: "HH:mm:ss",
  long: "HH:mm:ss",
  medium: "HH:mm:ss",
  short: "HH:mm"
}, hx = {
  full: "{{date}} 'عند الساعة' {{time}}",
  long: "{{date}} 'عند الساعة' {{time}}",
  medium: "{{date}}, {{time}}",
  short: "{{date}}, {{time}}"
}, mx = {
  date: gt({
    formats: dx,
    defaultWidth: "full"
  }),
  time: gt({
    formats: ux,
    defaultWidth: "full"
  }),
  dateTime: gt({
    formats: hx,
    defaultWidth: "full"
  })
}, px = {
  lastWeek: "eeee 'الماضي عند الساعة' p",
  yesterday: "'الأمس عند الساعة' p",
  today: "'اليوم عند الساعة' p",
  tomorrow: "'غدا عند الساعة' p",
  nextWeek: "eeee 'القادم عند الساعة' p",
  other: "P"
}, fx = (e) => px[e], gx = {
  narrow: ["ق", "ب"],
  abbreviated: ["ق.م.", "ب.م."],
  wide: ["قبل الميلاد", "بعد الميلاد"]
}, bx = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["ر1", "ر2", "ر3", "ر4"],
  wide: ["الربع الأول", "الربع الثاني", "الربع الثالث", "الربع الرابع"]
}, yx = {
  narrow: ["ي", "ف", "م", "أ", "م", "ي", "ي", "أ", "س", "أ", "ن", "د"],
  abbreviated: [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر"
  ],
  wide: [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر"
  ]
}, vx = {
  narrow: ["ح", "ن", "ث", "ر", "خ", "ج", "س"],
  short: ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"],
  abbreviated: ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"],
  wide: [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت"
  ]
}, wx = {
  narrow: {
    am: "ص",
    pm: "م",
    morning: "الصباح",
    noon: "الظهر",
    afternoon: "بعد الظهر",
    evening: "المساء",
    night: "الليل",
    midnight: "منتصف الليل"
  },
  abbreviated: {
    am: "ص",
    pm: "م",
    morning: "الصباح",
    noon: "الظهر",
    afternoon: "بعد الظهر",
    evening: "المساء",
    night: "الليل",
    midnight: "منتصف الليل"
  },
  wide: {
    am: "ص",
    pm: "م",
    morning: "الصباح",
    noon: "الظهر",
    afternoon: "بعد الظهر",
    evening: "المساء",
    night: "الليل",
    midnight: "منتصف الليل"
  }
}, kx = {
  narrow: {
    am: "ص",
    pm: "م",
    morning: "في الصباح",
    noon: "الظهر",
    afternoon: "بعد الظهر",
    evening: "في المساء",
    night: "في الليل",
    midnight: "منتصف الليل"
  },
  abbreviated: {
    am: "ص",
    pm: "م",
    morning: "في الصباح",
    noon: "الظهر",
    afternoon: "بعد الظهر",
    evening: "في المساء",
    night: "في الليل",
    midnight: "منتصف الليل"
  },
  wide: {
    am: "ص",
    pm: "م",
    morning: "في الصباح",
    noon: "الظهر",
    afternoon: "بعد الظهر",
    evening: "في المساء",
    night: "في الليل",
    midnight: "منتصف الليل"
  }
}, _x = (e) => String(e), xx = {
  ordinalNumber: _x,
  era: Te({
    values: gx,
    defaultWidth: "wide"
  }),
  quarter: Te({
    values: bx,
    defaultWidth: "wide",
    argumentCallback: (e) => e - 1
  }),
  month: Te({
    values: yx,
    defaultWidth: "wide"
  }),
  day: Te({
    values: vx,
    defaultWidth: "wide"
  }),
  dayPeriod: Te({
    values: wx,
    defaultWidth: "wide",
    formattingValues: kx,
    defaultFormattingWidth: "wide"
  })
}, Sx = /^(\d+)(th|st|nd|rd)?/i, Mx = /\d+/i, $x = {
  narrow: /[قب]/,
  abbreviated: /[قب]\.م\./,
  wide: /(قبل|بعد) الميلاد/
}, Tx = {
  any: [/قبل/, /بعد/]
}, Cx = {
  narrow: /^[1234]/i,
  abbreviated: /ر[1234]/,
  wide: /الربع (الأول|الثاني|الثالث|الرابع)/
}, Nx = {
  any: [/1/i, /2/i, /3/i, /4/i]
}, Dx = {
  narrow: /^[أيفمسند]/,
  abbreviated: /^(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)/,
  wide: /^(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)/
}, zx = {
  narrow: [
    /^ي/i,
    /^ف/i,
    /^م/i,
    /^أ/i,
    /^م/i,
    /^ي/i,
    /^ي/i,
    /^أ/i,
    /^س/i,
    /^أ/i,
    /^ن/i,
    /^د/i
  ],
  any: [
    /^يناير/i,
    /^فبراير/i,
    /^مارس/i,
    /^أبريل/i,
    /^مايو/i,
    /^يونيو/i,
    /^يوليو/i,
    /^أغسطس/i,
    /^سبتمبر/i,
    /^أكتوبر/i,
    /^نوفمبر/i,
    /^ديسمبر/i
  ]
}, Px = {
  narrow: /^[حنثرخجس]/i,
  short: /^(أحد|اثنين|ثلاثاء|أربعاء|خميس|جمعة|سبت)/i,
  abbreviated: /^(أحد|اثنين|ثلاثاء|أربعاء|خميس|جمعة|سبت)/i,
  wide: /^(الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة|السبت)/i
}, Ax = {
  narrow: [/^ح/i, /^ن/i, /^ث/i, /^ر/i, /^خ/i, /^ج/i, /^س/i],
  wide: [
    /^الأحد/i,
    /^الاثنين/i,
    /^الثلاثاء/i,
    /^الأربعاء/i,
    /^الخميس/i,
    /^الجمعة/i,
    /^السبت/i
  ],
  any: [/^أح/i, /^اث/i, /^ث/i, /^أر/i, /^خ/i, /^ج/i, /^س/i]
}, Ox = {
  narrow: /^(ص|م|منتصف الليل|الظهر|بعد الظهر|في الصباح|في المساء|في الليل)/,
  any: /^(ص|م|منتصف الليل|الظهر|بعد الظهر|في الصباح|في المساء|في الليل)/
}, Ex = {
  any: {
    am: /^ص/,
    pm: /^م/,
    midnight: /منتصف الليل/,
    noon: /الظهر/,
    afternoon: /بعد الظهر/,
    morning: /في الصباح/,
    evening: /في المساء/,
    night: /في الليل/
  }
}, Wx = {
  ordinalNumber: uo({
    matchPattern: Sx,
    parsePattern: Mx,
    valueCallback: (e) => parseInt(e, 10)
  }),
  era: Ce({
    matchPatterns: $x,
    defaultMatchWidth: "wide",
    parsePatterns: Tx,
    defaultParseWidth: "any"
  }),
  quarter: Ce({
    matchPatterns: Cx,
    defaultMatchWidth: "wide",
    parsePatterns: Nx,
    defaultParseWidth: "any",
    valueCallback: (e) => e + 1
  }),
  month: Ce({
    matchPatterns: Dx,
    defaultMatchWidth: "wide",
    parsePatterns: zx,
    defaultParseWidth: "any"
  }),
  day: Ce({
    matchPatterns: Px,
    defaultMatchWidth: "wide",
    parsePatterns: Ax,
    defaultParseWidth: "any"
  }),
  dayPeriod: Ce({
    matchPatterns: Ox,
    defaultMatchWidth: "any",
    parsePatterns: Ex,
    defaultParseWidth: "any"
  })
}, Ix = {
  code: "ar",
  formatDistance: cx,
  formatLong: mx,
  formatRelative: fx,
  localize: xx,
  match: Wx,
  options: {
    weekStartsOn: 6,
    firstWeekContainsDate: 1
  }
}, Tc = {
  lessThanXSeconds: {
    standalone: {
      one: "weniger als 1 Sekunde",
      other: "weniger als {{count}} Sekunden"
    },
    withPreposition: {
      one: "weniger als 1 Sekunde",
      other: "weniger als {{count}} Sekunden"
    }
  },
  xSeconds: {
    standalone: {
      one: "1 Sekunde",
      other: "{{count}} Sekunden"
    },
    withPreposition: {
      one: "1 Sekunde",
      other: "{{count}} Sekunden"
    }
  },
  halfAMinute: {
    standalone: "eine halbe Minute",
    withPreposition: "einer halben Minute"
  },
  lessThanXMinutes: {
    standalone: {
      one: "weniger als 1 Minute",
      other: "weniger als {{count}} Minuten"
    },
    withPreposition: {
      one: "weniger als 1 Minute",
      other: "weniger als {{count}} Minuten"
    }
  },
  xMinutes: {
    standalone: {
      one: "1 Minute",
      other: "{{count}} Minuten"
    },
    withPreposition: {
      one: "1 Minute",
      other: "{{count}} Minuten"
    }
  },
  aboutXHours: {
    standalone: {
      one: "etwa 1 Stunde",
      other: "etwa {{count}} Stunden"
    },
    withPreposition: {
      one: "etwa 1 Stunde",
      other: "etwa {{count}} Stunden"
    }
  },
  xHours: {
    standalone: {
      one: "1 Stunde",
      other: "{{count}} Stunden"
    },
    withPreposition: {
      one: "1 Stunde",
      other: "{{count}} Stunden"
    }
  },
  xDays: {
    standalone: {
      one: "1 Tag",
      other: "{{count}} Tage"
    },
    withPreposition: {
      one: "1 Tag",
      other: "{{count}} Tagen"
    }
  },
  aboutXWeeks: {
    standalone: {
      one: "etwa 1 Woche",
      other: "etwa {{count}} Wochen"
    },
    withPreposition: {
      one: "etwa 1 Woche",
      other: "etwa {{count}} Wochen"
    }
  },
  xWeeks: {
    standalone: {
      one: "1 Woche",
      other: "{{count}} Wochen"
    },
    withPreposition: {
      one: "1 Woche",
      other: "{{count}} Wochen"
    }
  },
  aboutXMonths: {
    standalone: {
      one: "etwa 1 Monat",
      other: "etwa {{count}} Monate"
    },
    withPreposition: {
      one: "etwa 1 Monat",
      other: "etwa {{count}} Monaten"
    }
  },
  xMonths: {
    standalone: {
      one: "1 Monat",
      other: "{{count}} Monate"
    },
    withPreposition: {
      one: "1 Monat",
      other: "{{count}} Monaten"
    }
  },
  aboutXYears: {
    standalone: {
      one: "etwa 1 Jahr",
      other: "etwa {{count}} Jahre"
    },
    withPreposition: {
      one: "etwa 1 Jahr",
      other: "etwa {{count}} Jahren"
    }
  },
  xYears: {
    standalone: {
      one: "1 Jahr",
      other: "{{count}} Jahre"
    },
    withPreposition: {
      one: "1 Jahr",
      other: "{{count}} Jahren"
    }
  },
  overXYears: {
    standalone: {
      one: "mehr als 1 Jahr",
      other: "mehr als {{count}} Jahre"
    },
    withPreposition: {
      one: "mehr als 1 Jahr",
      other: "mehr als {{count}} Jahren"
    }
  },
  almostXYears: {
    standalone: {
      one: "fast 1 Jahr",
      other: "fast {{count}} Jahre"
    },
    withPreposition: {
      one: "fast 1 Jahr",
      other: "fast {{count}} Jahren"
    }
  }
}, Rx = (e, t, a) => {
  let n;
  const s = a?.addSuffix ? Tc[e].withPreposition : Tc[e].standalone;
  return typeof s == "string" ? n = s : t === 1 ? n = s.one : n = s.other.replace("{{count}}", String(t)), a?.addSuffix ? a.comparison && a.comparison > 0 ? "in " + n : "vor " + n : n;
}, Lx = {
  full: "EEEE, do MMMM y",
  // Montag, 7. Januar 2018
  long: "do MMMM y",
  // 7. Januar 2018
  medium: "do MMM y",
  // 7. Jan. 2018
  short: "dd.MM.y"
  // 07.01.2018
}, qx = {
  full: "HH:mm:ss zzzz",
  long: "HH:mm:ss z",
  medium: "HH:mm:ss",
  short: "HH:mm"
}, Fx = {
  full: "{{date}} 'um' {{time}}",
  long: "{{date}} 'um' {{time}}",
  medium: "{{date}} {{time}}",
  short: "{{date}} {{time}}"
}, Bx = {
  date: gt({
    formats: Lx,
    defaultWidth: "full"
  }),
  time: gt({
    formats: qx,
    defaultWidth: "full"
  }),
  dateTime: gt({
    formats: Fx,
    defaultWidth: "full"
  })
}, Hx = {
  lastWeek: "'letzten' eeee 'um' p",
  yesterday: "'gestern um' p",
  today: "'heute um' p",
  tomorrow: "'morgen um' p",
  nextWeek: "eeee 'um' p",
  other: "P"
}, jx = (e, t, a, n) => Hx[e], Yx = {
  narrow: ["v.Chr.", "n.Chr."],
  abbreviated: ["v.Chr.", "n.Chr."],
  wide: ["vor Christus", "nach Christus"]
}, Vx = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["Q1", "Q2", "Q3", "Q4"],
  wide: ["1. Quartal", "2. Quartal", "3. Quartal", "4. Quartal"]
}, Er = {
  narrow: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
  abbreviated: [
    "Jan",
    "Feb",
    "Mär",
    "Apr",
    "Mai",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Okt",
    "Nov",
    "Dez"
  ],
  wide: [
    "Januar",
    "Februar",
    "März",
    "April",
    "Mai",
    "Juni",
    "Juli",
    "August",
    "September",
    "Oktober",
    "November",
    "Dezember"
  ]
}, Gx = {
  narrow: Er.narrow,
  abbreviated: [
    "Jan.",
    "Feb.",
    "März",
    "Apr.",
    "Mai",
    "Juni",
    "Juli",
    "Aug.",
    "Sep.",
    "Okt.",
    "Nov.",
    "Dez."
  ],
  wide: Er.wide
}, Kx = {
  narrow: ["S", "M", "D", "M", "D", "F", "S"],
  short: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"],
  abbreviated: ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."],
  wide: [
    "Sonntag",
    "Montag",
    "Dienstag",
    "Mittwoch",
    "Donnerstag",
    "Freitag",
    "Samstag"
  ]
}, Ux = {
  narrow: {
    am: "vm.",
    pm: "nm.",
    midnight: "Mitternacht",
    noon: "Mittag",
    morning: "Morgen",
    afternoon: "Nachm.",
    evening: "Abend",
    night: "Nacht"
  },
  abbreviated: {
    am: "vorm.",
    pm: "nachm.",
    midnight: "Mitternacht",
    noon: "Mittag",
    morning: "Morgen",
    afternoon: "Nachmittag",
    evening: "Abend",
    night: "Nacht"
  },
  wide: {
    am: "vormittags",
    pm: "nachmittags",
    midnight: "Mitternacht",
    noon: "Mittag",
    morning: "Morgen",
    afternoon: "Nachmittag",
    evening: "Abend",
    night: "Nacht"
  }
}, Xx = {
  narrow: {
    am: "vm.",
    pm: "nm.",
    midnight: "Mitternacht",
    noon: "Mittag",
    morning: "morgens",
    afternoon: "nachm.",
    evening: "abends",
    night: "nachts"
  },
  abbreviated: {
    am: "vorm.",
    pm: "nachm.",
    midnight: "Mitternacht",
    noon: "Mittag",
    morning: "morgens",
    afternoon: "nachmittags",
    evening: "abends",
    night: "nachts"
  },
  wide: {
    am: "vormittags",
    pm: "nachmittags",
    midnight: "Mitternacht",
    noon: "Mittag",
    morning: "morgens",
    afternoon: "nachmittags",
    evening: "abends",
    night: "nachts"
  }
}, Jx = (e) => Number(e) + ".", Qx = {
  ordinalNumber: Jx,
  era: Te({
    values: Yx,
    defaultWidth: "wide"
  }),
  quarter: Te({
    values: Vx,
    defaultWidth: "wide",
    argumentCallback: (e) => e - 1
  }),
  month: Te({
    values: Er,
    formattingValues: Gx,
    defaultWidth: "wide"
  }),
  day: Te({
    values: Kx,
    defaultWidth: "wide"
  }),
  dayPeriod: Te({
    values: Ux,
    defaultWidth: "wide",
    formattingValues: Xx,
    defaultFormattingWidth: "wide"
  })
}, Zx = /^(\d+)(\.)?/i, eS = /\d+/i, tS = {
  narrow: /^(v\.? ?Chr\.?|n\.? ?Chr\.?)/i,
  abbreviated: /^(v\.? ?Chr\.?|n\.? ?Chr\.?)/i,
  wide: /^(vor Christus|vor unserer Zeitrechnung|nach Christus|unserer Zeitrechnung)/i
}, nS = {
  any: [/^v/i, /^n/i]
}, aS = {
  narrow: /^[1234]/i,
  abbreviated: /^q[1234]/i,
  wide: /^[1234](\.)? Quartal/i
}, oS = {
  any: [/1/i, /2/i, /3/i, /4/i]
}, sS = {
  narrow: /^[jfmasond]/i,
  abbreviated: /^(j[aä]n|feb|mär[z]?|apr|mai|jun[i]?|jul[i]?|aug|sep|okt|nov|dez)\.?/i,
  wide: /^(jänner|januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)/i
}, iS = {
  narrow: [
    /^j/i,
    /^f/i,
    /^m/i,
    /^a/i,
    /^m/i,
    /^j/i,
    /^j/i,
    /^a/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ],
  any: [
    /^j[aä]/i,
    /^f/i,
    /^mär/i,
    /^ap/i,
    /^mai/i,
    /^jun/i,
    /^jul/i,
    /^au/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ]
}, rS = {
  narrow: /^[smdmf]/i,
  short: /^(so|mo|di|mi|do|fr|sa)/i,
  abbreviated: /^(son?|mon?|die?|mit?|don?|fre?|sam?)\.?/i,
  wide: /^(sonntag|montag|dienstag|mittwoch|donnerstag|freitag|samstag)/i
}, lS = {
  any: [/^so/i, /^mo/i, /^di/i, /^mi/i, /^do/i, /^f/i, /^sa/i]
}, cS = {
  narrow: /^(vm\.?|nm\.?|Mitternacht|Mittag|morgens|nachm\.?|abends|nachts)/i,
  abbreviated: /^(vorm\.?|nachm\.?|Mitternacht|Mittag|morgens|nachm\.?|abends|nachts)/i,
  wide: /^(vormittags|nachmittags|Mitternacht|Mittag|morgens|nachmittags|abends|nachts)/i
}, dS = {
  any: {
    am: /^v/i,
    pm: /^n/i,
    midnight: /^Mitte/i,
    noon: /^Mitta/i,
    morning: /morgens/i,
    afternoon: /nachmittags/i,
    // will never be matched. Afternoon is matched by `pm`
    evening: /abends/i,
    night: /nachts/i
    // will never be matched. Night is matched by `pm`
  }
}, uS = {
  ordinalNumber: uo({
    matchPattern: Zx,
    parsePattern: eS,
    valueCallback: (e) => parseInt(e)
  }),
  era: Ce({
    matchPatterns: tS,
    defaultMatchWidth: "wide",
    parsePatterns: nS,
    defaultParseWidth: "any"
  }),
  quarter: Ce({
    matchPatterns: aS,
    defaultMatchWidth: "wide",
    parsePatterns: oS,
    defaultParseWidth: "any",
    valueCallback: (e) => e + 1
  }),
  month: Ce({
    matchPatterns: sS,
    defaultMatchWidth: "wide",
    parsePatterns: iS,
    defaultParseWidth: "any"
  }),
  day: Ce({
    matchPatterns: rS,
    defaultMatchWidth: "wide",
    parsePatterns: lS,
    defaultParseWidth: "any"
  }),
  dayPeriod: Ce({
    matchPatterns: cS,
    defaultMatchWidth: "wide",
    parsePatterns: dS,
    defaultParseWidth: "any"
  })
}, hS = {
  code: "de",
  formatDistance: Rx,
  formatLong: Bx,
  formatRelative: jx,
  localize: Qx,
  match: uS,
  options: {
    weekStartsOn: 1,
    firstWeekContainsDate: 4
  }
}, mS = {
  lessThanXSeconds: {
    one: "menos de un segundo",
    other: "menos de {{count}} segundos"
  },
  xSeconds: {
    one: "1 segundo",
    other: "{{count}} segundos"
  },
  halfAMinute: "medio minuto",
  lessThanXMinutes: {
    one: "menos de un minuto",
    other: "menos de {{count}} minutos"
  },
  xMinutes: {
    one: "1 minuto",
    other: "{{count}} minutos"
  },
  aboutXHours: {
    one: "alrededor de 1 hora",
    other: "alrededor de {{count}} horas"
  },
  xHours: {
    one: "1 hora",
    other: "{{count}} horas"
  },
  xDays: {
    one: "1 día",
    other: "{{count}} días"
  },
  aboutXWeeks: {
    one: "alrededor de 1 semana",
    other: "alrededor de {{count}} semanas"
  },
  xWeeks: {
    one: "1 semana",
    other: "{{count}} semanas"
  },
  aboutXMonths: {
    one: "alrededor de 1 mes",
    other: "alrededor de {{count}} meses"
  },
  xMonths: {
    one: "1 mes",
    other: "{{count}} meses"
  },
  aboutXYears: {
    one: "alrededor de 1 año",
    other: "alrededor de {{count}} años"
  },
  xYears: {
    one: "1 año",
    other: "{{count}} años"
  },
  overXYears: {
    one: "más de 1 año",
    other: "más de {{count}} años"
  },
  almostXYears: {
    one: "casi 1 año",
    other: "casi {{count}} años"
  }
}, pS = (e, t, a) => {
  let n;
  const s = mS[e];
  return typeof s == "string" ? n = s : t === 1 ? n = s.one : n = s.other.replace("{{count}}", t.toString()), a?.addSuffix ? a.comparison && a.comparison > 0 ? "en " + n : "hace " + n : n;
}, fS = {
  full: "EEEE, d 'de' MMMM 'de' y",
  long: "d 'de' MMMM 'de' y",
  medium: "d MMM y",
  short: "dd/MM/y"
}, gS = {
  full: "HH:mm:ss zzzz",
  long: "HH:mm:ss z",
  medium: "HH:mm:ss",
  short: "HH:mm"
}, bS = {
  full: "{{date}} 'a las' {{time}}",
  long: "{{date}} 'a las' {{time}}",
  medium: "{{date}}, {{time}}",
  short: "{{date}}, {{time}}"
}, yS = {
  date: gt({
    formats: fS,
    defaultWidth: "full"
  }),
  time: gt({
    formats: gS,
    defaultWidth: "full"
  }),
  dateTime: gt({
    formats: bS,
    defaultWidth: "full"
  })
}, vS = {
  lastWeek: "'el' eeee 'pasado a la' p",
  yesterday: "'ayer a la' p",
  today: "'hoy a la' p",
  tomorrow: "'mañana a la' p",
  nextWeek: "eeee 'a la' p",
  other: "P"
}, wS = {
  lastWeek: "'el' eeee 'pasado a las' p",
  yesterday: "'ayer a las' p",
  today: "'hoy a las' p",
  tomorrow: "'mañana a las' p",
  nextWeek: "eeee 'a las' p",
  other: "P"
}, kS = (e, t, a, n) => t.getHours() !== 1 ? wS[e] : vS[e], _S = {
  narrow: ["AC", "DC"],
  abbreviated: ["AC", "DC"],
  wide: ["antes de cristo", "después de cristo"]
}, xS = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["T1", "T2", "T3", "T4"],
  wide: ["1º trimestre", "2º trimestre", "3º trimestre", "4º trimestre"]
}, SS = {
  narrow: ["e", "f", "m", "a", "m", "j", "j", "a", "s", "o", "n", "d"],
  abbreviated: [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "oct",
    "nov",
    "dic"
  ],
  wide: [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre"
  ]
}, MS = {
  narrow: ["d", "l", "m", "m", "j", "v", "s"],
  short: ["do", "lu", "ma", "mi", "ju", "vi", "sá"],
  abbreviated: ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"],
  wide: [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado"
  ]
}, $S = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "mn",
    noon: "md",
    morning: "mañana",
    afternoon: "tarde",
    evening: "tarde",
    night: "noche"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "medianoche",
    noon: "mediodia",
    morning: "mañana",
    afternoon: "tarde",
    evening: "tarde",
    night: "noche"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "medianoche",
    noon: "mediodia",
    morning: "mañana",
    afternoon: "tarde",
    evening: "tarde",
    night: "noche"
  }
}, TS = {
  narrow: {
    am: "a",
    pm: "p",
    midnight: "mn",
    noon: "md",
    morning: "de la mañana",
    afternoon: "de la tarde",
    evening: "de la tarde",
    night: "de la noche"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "medianoche",
    noon: "mediodia",
    morning: "de la mañana",
    afternoon: "de la tarde",
    evening: "de la tarde",
    night: "de la noche"
  },
  wide: {
    am: "a.m.",
    pm: "p.m.",
    midnight: "medianoche",
    noon: "mediodia",
    morning: "de la mañana",
    afternoon: "de la tarde",
    evening: "de la tarde",
    night: "de la noche"
  }
}, CS = (e, t) => Number(e) + "º", NS = {
  ordinalNumber: CS,
  era: Te({
    values: _S,
    defaultWidth: "wide"
  }),
  quarter: Te({
    values: xS,
    defaultWidth: "wide",
    argumentCallback: (e) => Number(e) - 1
  }),
  month: Te({
    values: SS,
    defaultWidth: "wide"
  }),
  day: Te({
    values: MS,
    defaultWidth: "wide"
  }),
  dayPeriod: Te({
    values: $S,
    defaultWidth: "wide",
    formattingValues: TS,
    defaultFormattingWidth: "wide"
  })
}, DS = /^(\d+)(º)?/i, zS = /\d+/i, PS = {
  narrow: /^(ac|dc|a|d)/i,
  abbreviated: /^(a\.?\s?c\.?|a\.?\s?e\.?\s?c\.?|d\.?\s?c\.?|e\.?\s?c\.?)/i,
  wide: /^(antes de cristo|antes de la era com[uú]n|despu[eé]s de cristo|era com[uú]n)/i
}, AS = {
  any: [/^ac/i, /^dc/i],
  wide: [
    /^(antes de cristo|antes de la era com[uú]n)/i,
    /^(despu[eé]s de cristo|era com[uú]n)/i
  ]
}, OS = {
  narrow: /^[1234]/i,
  abbreviated: /^T[1234]/i,
  wide: /^[1234](º)? trimestre/i
}, ES = {
  any: [/1/i, /2/i, /3/i, /4/i]
}, WS = {
  narrow: /^[efmajsond]/i,
  abbreviated: /^(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)/i,
  wide: /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i
}, IS = {
  narrow: [
    /^e/i,
    /^f/i,
    /^m/i,
    /^a/i,
    /^m/i,
    /^j/i,
    /^j/i,
    /^a/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ],
  any: [
    /^en/i,
    /^feb/i,
    /^mar/i,
    /^abr/i,
    /^may/i,
    /^jun/i,
    /^jul/i,
    /^ago/i,
    /^sep/i,
    /^oct/i,
    /^nov/i,
    /^dic/i
  ]
}, RS = {
  narrow: /^[dlmjvs]/i,
  short: /^(do|lu|ma|mi|ju|vi|s[áa])/i,
  abbreviated: /^(dom|lun|mar|mi[ée]|jue|vie|s[áa]b)/i,
  wide: /^(domingo|lunes|martes|mi[ée]rcoles|jueves|viernes|s[áa]bado)/i
}, LS = {
  narrow: [/^d/i, /^l/i, /^m/i, /^m/i, /^j/i, /^v/i, /^s/i],
  any: [/^do/i, /^lu/i, /^ma/i, /^mi/i, /^ju/i, /^vi/i, /^sa/i]
}, qS = {
  narrow: /^(a|p|mn|md|(de la|a las) (mañana|tarde|noche))/i,
  any: /^([ap]\.?\s?m\.?|medianoche|mediodia|(de la|a las) (mañana|tarde|noche))/i
}, FS = {
  any: {
    am: /^a/i,
    pm: /^p/i,
    midnight: /^mn/i,
    noon: /^md/i,
    morning: /mañana/i,
    afternoon: /tarde/i,
    evening: /tarde/i,
    night: /noche/i
  }
}, BS = {
  ordinalNumber: uo({
    matchPattern: DS,
    parsePattern: zS,
    valueCallback: function(e) {
      return parseInt(e, 10);
    }
  }),
  era: Ce({
    matchPatterns: PS,
    defaultMatchWidth: "wide",
    parsePatterns: AS,
    defaultParseWidth: "any"
  }),
  quarter: Ce({
    matchPatterns: OS,
    defaultMatchWidth: "wide",
    parsePatterns: ES,
    defaultParseWidth: "any",
    valueCallback: (e) => e + 1
  }),
  month: Ce({
    matchPatterns: WS,
    defaultMatchWidth: "wide",
    parsePatterns: IS,
    defaultParseWidth: "any"
  }),
  day: Ce({
    matchPatterns: RS,
    defaultMatchWidth: "wide",
    parsePatterns: LS,
    defaultParseWidth: "any"
  }),
  dayPeriod: Ce({
    matchPatterns: qS,
    defaultMatchWidth: "any",
    parsePatterns: FS,
    defaultParseWidth: "any"
  })
}, HS = {
  code: "es",
  formatDistance: pS,
  formatLong: yS,
  formatRelative: kS,
  localize: NS,
  match: BS,
  options: {
    weekStartsOn: 1,
    firstWeekContainsDate: 1
  }
}, jS = {
  lessThanXSeconds: {
    one: "moins d’une seconde",
    other: "moins de {{count}} secondes"
  },
  xSeconds: {
    one: "1 seconde",
    other: "{{count}} secondes"
  },
  halfAMinute: "30 secondes",
  lessThanXMinutes: {
    one: "moins d’une minute",
    other: "moins de {{count}} minutes"
  },
  xMinutes: {
    one: "1 minute",
    other: "{{count}} minutes"
  },
  aboutXHours: {
    one: "environ 1 heure",
    other: "environ {{count}} heures"
  },
  xHours: {
    one: "1 heure",
    other: "{{count}} heures"
  },
  xDays: {
    one: "1 jour",
    other: "{{count}} jours"
  },
  aboutXWeeks: {
    one: "environ 1 semaine",
    other: "environ {{count}} semaines"
  },
  xWeeks: {
    one: "1 semaine",
    other: "{{count}} semaines"
  },
  aboutXMonths: {
    one: "environ 1 mois",
    other: "environ {{count}} mois"
  },
  xMonths: {
    one: "1 mois",
    other: "{{count}} mois"
  },
  aboutXYears: {
    one: "environ 1 an",
    other: "environ {{count}} ans"
  },
  xYears: {
    one: "1 an",
    other: "{{count}} ans"
  },
  overXYears: {
    one: "plus d’un an",
    other: "plus de {{count}} ans"
  },
  almostXYears: {
    one: "presqu’un an",
    other: "presque {{count}} ans"
  }
}, YS = (e, t, a) => {
  let n;
  const s = jS[e];
  return typeof s == "string" ? n = s : t === 1 ? n = s.one : n = s.other.replace("{{count}}", String(t)), a?.addSuffix ? a.comparison && a.comparison > 0 ? "dans " + n : "il y a " + n : n;
}, VS = {
  full: "EEEE d MMMM y",
  long: "d MMMM y",
  medium: "d MMM y",
  short: "dd/MM/y"
}, GS = {
  full: "HH:mm:ss zzzz",
  long: "HH:mm:ss z",
  medium: "HH:mm:ss",
  short: "HH:mm"
}, KS = {
  full: "{{date}} 'à' {{time}}",
  long: "{{date}} 'à' {{time}}",
  medium: "{{date}}, {{time}}",
  short: "{{date}}, {{time}}"
}, US = {
  date: gt({
    formats: VS,
    defaultWidth: "full"
  }),
  time: gt({
    formats: GS,
    defaultWidth: "full"
  }),
  dateTime: gt({
    formats: KS,
    defaultWidth: "full"
  })
}, XS = {
  lastWeek: "eeee 'dernier à' p",
  yesterday: "'hier à' p",
  today: "'aujourd’hui à' p",
  tomorrow: "'demain à' p'",
  nextWeek: "eeee 'prochain à' p",
  other: "P"
}, JS = (e, t, a, n) => XS[e], QS = {
  narrow: ["av. J.-C", "ap. J.-C"],
  abbreviated: ["av. J.-C", "ap. J.-C"],
  wide: ["avant Jésus-Christ", "après Jésus-Christ"]
}, ZS = {
  narrow: ["T1", "T2", "T3", "T4"],
  abbreviated: ["1er trim.", "2ème trim.", "3ème trim.", "4ème trim."],
  wide: ["1er trimestre", "2ème trimestre", "3ème trimestre", "4ème trimestre"]
}, e2 = {
  narrow: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
  abbreviated: [
    "janv.",
    "févr.",
    "mars",
    "avr.",
    "mai",
    "juin",
    "juil.",
    "août",
    "sept.",
    "oct.",
    "nov.",
    "déc."
  ],
  wide: [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre"
  ]
}, t2 = {
  narrow: ["D", "L", "M", "M", "J", "V", "S"],
  short: ["di", "lu", "ma", "me", "je", "ve", "sa"],
  abbreviated: ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."],
  wide: [
    "dimanche",
    "lundi",
    "mardi",
    "mercredi",
    "jeudi",
    "vendredi",
    "samedi"
  ]
}, n2 = {
  narrow: {
    am: "AM",
    pm: "PM",
    midnight: "minuit",
    noon: "midi",
    morning: "mat.",
    afternoon: "ap.m.",
    evening: "soir",
    night: "mat."
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "minuit",
    noon: "midi",
    morning: "matin",
    afternoon: "après-midi",
    evening: "soir",
    night: "matin"
  },
  wide: {
    am: "AM",
    pm: "PM",
    midnight: "minuit",
    noon: "midi",
    morning: "du matin",
    afternoon: "de l’après-midi",
    evening: "du soir",
    night: "du matin"
  }
}, a2 = (e, t) => {
  const a = Number(e), n = t?.unit;
  if (a === 0) return "0";
  const s = ["year", "week", "hour", "minute", "second"];
  let i;
  return a === 1 ? i = n && s.includes(n) ? "ère" : "er" : i = "ème", a + i;
}, o2 = ["MMM", "MMMM"], s2 = {
  preprocessor: (e, t) => e.getDate() === 1 || !t.some(
    (n) => n.isToken && o2.includes(n.value)
  ) ? t : t.map(
    (n) => n.isToken && n.value === "do" ? { isToken: !0, value: "d" } : n
  ),
  ordinalNumber: a2,
  era: Te({
    values: QS,
    defaultWidth: "wide"
  }),
  quarter: Te({
    values: ZS,
    defaultWidth: "wide",
    argumentCallback: (e) => e - 1
  }),
  month: Te({
    values: e2,
    defaultWidth: "wide"
  }),
  day: Te({
    values: t2,
    defaultWidth: "wide"
  }),
  dayPeriod: Te({
    values: n2,
    defaultWidth: "wide"
  })
}, i2 = /^(\d+)(ième|ère|ème|er|e)?/i, r2 = /\d+/i, l2 = {
  narrow: /^(av\.J\.C|ap\.J\.C|ap\.J\.-C)/i,
  abbreviated: /^(av\.J\.-C|av\.J-C|apr\.J\.-C|apr\.J-C|ap\.J-C)/i,
  wide: /^(avant Jésus-Christ|après Jésus-Christ)/i
}, c2 = {
  any: [/^av/i, /^ap/i]
}, d2 = {
  narrow: /^T?[1234]/i,
  abbreviated: /^[1234](er|ème|e)? trim\.?/i,
  wide: /^[1234](er|ème|e)? trimestre/i
}, u2 = {
  any: [/1/i, /2/i, /3/i, /4/i]
}, h2 = {
  narrow: /^[jfmasond]/i,
  abbreviated: /^(janv|févr|mars|avr|mai|juin|juill|juil|août|sept|oct|nov|déc)\.?/i,
  wide: /^(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)/i
}, m2 = {
  narrow: [
    /^j/i,
    /^f/i,
    /^m/i,
    /^a/i,
    /^m/i,
    /^j/i,
    /^j/i,
    /^a/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ],
  any: [
    /^ja/i,
    /^f/i,
    /^mar/i,
    /^av/i,
    /^ma/i,
    /^juin/i,
    /^juil/i,
    /^ao/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ]
}, p2 = {
  narrow: /^[lmjvsd]/i,
  short: /^(di|lu|ma|me|je|ve|sa)/i,
  abbreviated: /^(dim|lun|mar|mer|jeu|ven|sam)\.?/i,
  wide: /^(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)/i
}, f2 = {
  narrow: [/^d/i, /^l/i, /^m/i, /^m/i, /^j/i, /^v/i, /^s/i],
  any: [/^di/i, /^lu/i, /^ma/i, /^me/i, /^je/i, /^ve/i, /^sa/i]
}, g2 = {
  narrow: /^(a|p|minuit|midi|mat\.?|ap\.?m\.?|soir|nuit)/i,
  any: /^([ap]\.?\s?m\.?|du matin|de l'après[-\s]midi|du soir|de la nuit)/i
}, b2 = {
  any: {
    am: /^a/i,
    pm: /^p/i,
    midnight: /^min/i,
    noon: /^mid/i,
    morning: /mat/i,
    afternoon: /ap/i,
    evening: /soir/i,
    night: /nuit/i
  }
}, y2 = {
  ordinalNumber: uo({
    matchPattern: i2,
    parsePattern: r2,
    valueCallback: (e) => parseInt(e)
  }),
  era: Ce({
    matchPatterns: l2,
    defaultMatchWidth: "wide",
    parsePatterns: c2,
    defaultParseWidth: "any"
  }),
  quarter: Ce({
    matchPatterns: d2,
    defaultMatchWidth: "wide",
    parsePatterns: u2,
    defaultParseWidth: "any",
    valueCallback: (e) => e + 1
  }),
  month: Ce({
    matchPatterns: h2,
    defaultMatchWidth: "wide",
    parsePatterns: m2,
    defaultParseWidth: "any"
  }),
  day: Ce({
    matchPatterns: p2,
    defaultMatchWidth: "wide",
    parsePatterns: f2,
    defaultParseWidth: "any"
  }),
  dayPeriod: Ce({
    matchPatterns: g2,
    defaultMatchWidth: "any",
    parsePatterns: b2,
    defaultParseWidth: "any"
  })
}, v2 = {
  code: "fr",
  formatDistance: YS,
  formatLong: US,
  formatRelative: JS,
  localize: s2,
  match: y2,
  options: {
    weekStartsOn: 1,
    firstWeekContainsDate: 4
  }
}, w2 = {
  lessThanXSeconds: {
    one: "1秒未満",
    other: "{{count}}秒未満",
    oneWithSuffix: "約1秒",
    otherWithSuffix: "約{{count}}秒"
  },
  xSeconds: {
    one: "1秒",
    other: "{{count}}秒"
  },
  halfAMinute: "30秒",
  lessThanXMinutes: {
    one: "1分未満",
    other: "{{count}}分未満",
    oneWithSuffix: "約1分",
    otherWithSuffix: "約{{count}}分"
  },
  xMinutes: {
    one: "1分",
    other: "{{count}}分"
  },
  aboutXHours: {
    one: "約1時間",
    other: "約{{count}}時間"
  },
  xHours: {
    one: "1時間",
    other: "{{count}}時間"
  },
  xDays: {
    one: "1日",
    other: "{{count}}日"
  },
  aboutXWeeks: {
    one: "約1週間",
    other: "約{{count}}週間"
  },
  xWeeks: {
    one: "1週間",
    other: "{{count}}週間"
  },
  aboutXMonths: {
    one: "約1か月",
    other: "約{{count}}か月"
  },
  xMonths: {
    one: "1か月",
    other: "{{count}}か月"
  },
  aboutXYears: {
    one: "約1年",
    other: "約{{count}}年"
  },
  xYears: {
    one: "1年",
    other: "{{count}}年"
  },
  overXYears: {
    one: "1年以上",
    other: "{{count}}年以上"
  },
  almostXYears: {
    one: "1年近く",
    other: "{{count}}年近く"
  }
}, k2 = (e, t, a) => {
  a = a || {};
  let n;
  const s = w2[e];
  return typeof s == "string" ? n = s : t === 1 ? a.addSuffix && s.oneWithSuffix ? n = s.oneWithSuffix : n = s.one : a.addSuffix && s.otherWithSuffix ? n = s.otherWithSuffix.replace("{{count}}", String(t)) : n = s.other.replace("{{count}}", String(t)), a.addSuffix ? a.comparison && a.comparison > 0 ? n + "後" : n + "前" : n;
}, _2 = {
  full: "y年M月d日EEEE",
  long: "y年M月d日",
  medium: "y/MM/dd",
  short: "y/MM/dd"
}, x2 = {
  full: "H時mm分ss秒 zzzz",
  long: "H:mm:ss z",
  medium: "H:mm:ss",
  short: "H:mm"
}, S2 = {
  full: "{{date}} {{time}}",
  long: "{{date}} {{time}}",
  medium: "{{date}} {{time}}",
  short: "{{date}} {{time}}"
}, M2 = {
  date: gt({
    formats: _2,
    defaultWidth: "full"
  }),
  time: gt({
    formats: x2,
    defaultWidth: "full"
  }),
  dateTime: gt({
    formats: S2,
    defaultWidth: "full"
  })
}, $2 = {
  lastWeek: "先週のeeeeのp",
  yesterday: "昨日のp",
  today: "今日のp",
  tomorrow: "明日のp",
  nextWeek: "翌週のeeeeのp",
  other: "P"
}, T2 = (e, t, a, n) => $2[e], C2 = {
  narrow: ["BC", "AC"],
  abbreviated: ["紀元前", "西暦"],
  wide: ["紀元前", "西暦"]
}, N2 = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["Q1", "Q2", "Q3", "Q4"],
  wide: ["第1四半期", "第2四半期", "第3四半期", "第4四半期"]
}, D2 = {
  narrow: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
  abbreviated: [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月"
  ],
  wide: [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月"
  ]
}, z2 = {
  narrow: ["日", "月", "火", "水", "木", "金", "土"],
  short: ["日", "月", "火", "水", "木", "金", "土"],
  abbreviated: ["日", "月", "火", "水", "木", "金", "土"],
  wide: ["日曜日", "月曜日", "火曜日", "水曜日", "木曜日", "金曜日", "土曜日"]
}, P2 = {
  narrow: {
    am: "午前",
    pm: "午後",
    midnight: "深夜",
    noon: "正午",
    morning: "朝",
    afternoon: "午後",
    evening: "夜",
    night: "深夜"
  },
  abbreviated: {
    am: "午前",
    pm: "午後",
    midnight: "深夜",
    noon: "正午",
    morning: "朝",
    afternoon: "午後",
    evening: "夜",
    night: "深夜"
  },
  wide: {
    am: "午前",
    pm: "午後",
    midnight: "深夜",
    noon: "正午",
    morning: "朝",
    afternoon: "午後",
    evening: "夜",
    night: "深夜"
  }
}, A2 = {
  narrow: {
    am: "午前",
    pm: "午後",
    midnight: "深夜",
    noon: "正午",
    morning: "朝",
    afternoon: "午後",
    evening: "夜",
    night: "深夜"
  },
  abbreviated: {
    am: "午前",
    pm: "午後",
    midnight: "深夜",
    noon: "正午",
    morning: "朝",
    afternoon: "午後",
    evening: "夜",
    night: "深夜"
  },
  wide: {
    am: "午前",
    pm: "午後",
    midnight: "深夜",
    noon: "正午",
    morning: "朝",
    afternoon: "午後",
    evening: "夜",
    night: "深夜"
  }
}, O2 = (e, t) => {
  const a = Number(e);
  switch (String(t?.unit)) {
    case "year":
      return `${a}年`;
    case "quarter":
      return `第${a}四半期`;
    case "month":
      return `${a}月`;
    case "week":
      return `第${a}週`;
    case "date":
      return `${a}日`;
    case "hour":
      return `${a}時`;
    case "minute":
      return `${a}分`;
    case "second":
      return `${a}秒`;
    default:
      return `${a}`;
  }
}, E2 = {
  ordinalNumber: O2,
  era: Te({
    values: C2,
    defaultWidth: "wide"
  }),
  quarter: Te({
    values: N2,
    defaultWidth: "wide",
    argumentCallback: (e) => Number(e) - 1
  }),
  month: Te({
    values: D2,
    defaultWidth: "wide"
  }),
  day: Te({
    values: z2,
    defaultWidth: "wide"
  }),
  dayPeriod: Te({
    values: P2,
    defaultWidth: "wide",
    formattingValues: A2,
    defaultFormattingWidth: "wide"
  })
}, W2 = /^第?\d+(年|四半期|月|週|日|時|分|秒)?/i, I2 = /\d+/i, R2 = {
  narrow: /^(B\.?C\.?|A\.?D\.?)/i,
  abbreviated: /^(紀元[前後]|西暦)/i,
  wide: /^(紀元[前後]|西暦)/i
}, L2 = {
  narrow: [/^B/i, /^A/i],
  any: [/^(紀元前)/i, /^(西暦|紀元後)/i]
}, q2 = {
  narrow: /^[1234]/i,
  abbreviated: /^Q[1234]/i,
  wide: /^第[1234一二三四１２３４]四半期/i
}, F2 = {
  any: [/(1|一|１)/i, /(2|二|２)/i, /(3|三|３)/i, /(4|四|４)/i]
}, B2 = {
  narrow: /^([123456789]|1[012])/,
  abbreviated: /^([123456789]|1[012])月/i,
  wide: /^([123456789]|1[012])月/i
}, H2 = {
  any: [
    /^1\D/,
    /^2/,
    /^3/,
    /^4/,
    /^5/,
    /^6/,
    /^7/,
    /^8/,
    /^9/,
    /^10/,
    /^11/,
    /^12/
  ]
}, j2 = {
  narrow: /^[日月火水木金土]/,
  short: /^[日月火水木金土]/,
  abbreviated: /^[日月火水木金土]/,
  wide: /^[日月火水木金土]曜日/
}, Y2 = {
  any: [/^日/, /^月/, /^火/, /^水/, /^木/, /^金/, /^土/]
}, V2 = {
  any: /^(AM|PM|午前|午後|正午|深夜|真夜中|夜|朝)/i
}, G2 = {
  any: {
    am: /^(A|午前)/i,
    pm: /^(P|午後)/i,
    midnight: /^深夜|真夜中/i,
    noon: /^正午/i,
    morning: /^朝/i,
    afternoon: /^午後/i,
    evening: /^夜/i,
    night: /^深夜/i
  }
}, K2 = {
  ordinalNumber: uo({
    matchPattern: W2,
    parsePattern: I2,
    valueCallback: function(e) {
      return parseInt(e, 10);
    }
  }),
  era: Ce({
    matchPatterns: R2,
    defaultMatchWidth: "wide",
    parsePatterns: L2,
    defaultParseWidth: "any"
  }),
  quarter: Ce({
    matchPatterns: q2,
    defaultMatchWidth: "wide",
    parsePatterns: F2,
    defaultParseWidth: "any",
    valueCallback: (e) => e + 1
  }),
  month: Ce({
    matchPatterns: B2,
    defaultMatchWidth: "wide",
    parsePatterns: H2,
    defaultParseWidth: "any"
  }),
  day: Ce({
    matchPatterns: j2,
    defaultMatchWidth: "wide",
    parsePatterns: Y2,
    defaultParseWidth: "any"
  }),
  dayPeriod: Ce({
    matchPatterns: V2,
    defaultMatchWidth: "any",
    parsePatterns: G2,
    defaultParseWidth: "any"
  })
}, U2 = {
  code: "ja",
  formatDistance: k2,
  formatLong: M2,
  formatRelative: T2,
  localize: E2,
  match: K2,
  options: {
    weekStartsOn: 0,
    firstWeekContainsDate: 1
  }
}, X2 = {
  lessThanXSeconds: {
    one: "menos de um segundo",
    other: "menos de {{count}} segundos"
  },
  xSeconds: {
    one: "1 segundo",
    other: "{{count}} segundos"
  },
  halfAMinute: "meio minuto",
  lessThanXMinutes: {
    one: "menos de um minuto",
    other: "menos de {{count}} minutos"
  },
  xMinutes: {
    one: "1 minuto",
    other: "{{count}} minutos"
  },
  aboutXHours: {
    one: "aproximadamente 1 hora",
    other: "aproximadamente {{count}} horas"
  },
  xHours: {
    one: "1 hora",
    other: "{{count}} horas"
  },
  xDays: {
    one: "1 dia",
    other: "{{count}} dias"
  },
  aboutXWeeks: {
    one: "aproximadamente 1 semana",
    other: "aproximadamente {{count}} semanas"
  },
  xWeeks: {
    one: "1 semana",
    other: "{{count}} semanas"
  },
  aboutXMonths: {
    one: "aproximadamente 1 mês",
    other: "aproximadamente {{count}} meses"
  },
  xMonths: {
    one: "1 mês",
    other: "{{count}} meses"
  },
  aboutXYears: {
    one: "aproximadamente 1 ano",
    other: "aproximadamente {{count}} anos"
  },
  xYears: {
    one: "1 ano",
    other: "{{count}} anos"
  },
  overXYears: {
    one: "mais de 1 ano",
    other: "mais de {{count}} anos"
  },
  almostXYears: {
    one: "quase 1 ano",
    other: "quase {{count}} anos"
  }
}, J2 = (e, t, a) => {
  let n;
  const s = X2[e];
  return typeof s == "string" ? n = s : t === 1 ? n = s.one : n = s.other.replace("{{count}}", String(t)), a?.addSuffix ? a.comparison && a.comparison > 0 ? "daqui a " + n : "há " + n : n;
}, Q2 = {
  full: "EEEE, d 'de' MMMM 'de' y",
  long: "d 'de' MMMM 'de' y",
  medium: "d 'de' MMM 'de' y",
  short: "dd/MM/y"
}, Z2 = {
  full: "HH:mm:ss zzzz",
  long: "HH:mm:ss z",
  medium: "HH:mm:ss",
  short: "HH:mm"
}, eM = {
  full: "{{date}} 'às' {{time}}",
  long: "{{date}} 'às' {{time}}",
  medium: "{{date}}, {{time}}",
  short: "{{date}}, {{time}}"
}, tM = {
  date: gt({
    formats: Q2,
    defaultWidth: "full"
  }),
  time: gt({
    formats: Z2,
    defaultWidth: "full"
  }),
  dateTime: gt({
    formats: eM,
    defaultWidth: "full"
  })
}, nM = {
  lastWeek: (e) => {
    const t = e.getDay();
    return "'" + (t === 0 || t === 6 ? "último" : "última") + "' eeee 'às' p";
  },
  yesterday: "'ontem às' p",
  today: "'hoje às' p",
  tomorrow: "'amanhã às' p",
  nextWeek: "eeee 'às' p",
  other: "P"
}, aM = (e, t, a, n) => {
  const s = nM[e];
  return typeof s == "function" ? s(t) : s;
}, oM = {
  narrow: ["aC", "dC"],
  abbreviated: ["a.C.", "d.C."],
  wide: ["antes de Cristo", "depois de Cristo"]
}, sM = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["T1", "T2", "T3", "T4"],
  wide: ["1º trimestre", "2º trimestre", "3º trimestre", "4º trimestre"]
}, iM = {
  narrow: ["j", "f", "m", "a", "m", "j", "j", "a", "s", "o", "n", "d"],
  abbreviated: [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez"
  ],
  wide: [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro"
  ]
}, rM = {
  narrow: ["d", "s", "t", "q", "q", "s", "s"],
  short: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  abbreviated: ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"],
  wide: [
    "domingo",
    "segunda-feira",
    "terça-feira",
    "quarta-feira",
    "quinta-feira",
    "sexta-feira",
    "sábado"
  ]
}, lM = {
  narrow: {
    am: "AM",
    pm: "PM",
    midnight: "meia-noite",
    noon: "meio-dia",
    morning: "manhã",
    afternoon: "tarde",
    evening: "noite",
    night: "madrugada"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "meia-noite",
    noon: "meio-dia",
    morning: "manhã",
    afternoon: "tarde",
    evening: "noite",
    night: "madrugada"
  },
  wide: {
    am: "AM",
    pm: "PM",
    midnight: "meia-noite",
    noon: "meio-dia",
    morning: "manhã",
    afternoon: "tarde",
    evening: "noite",
    night: "madrugada"
  }
}, cM = {
  narrow: {
    am: "AM",
    pm: "PM",
    midnight: "meia-noite",
    noon: "meio-dia",
    morning: "da manhã",
    afternoon: "da tarde",
    evening: "da noite",
    night: "da madrugada"
  },
  abbreviated: {
    am: "AM",
    pm: "PM",
    midnight: "meia-noite",
    noon: "meio-dia",
    morning: "da manhã",
    afternoon: "da tarde",
    evening: "da noite",
    night: "da madrugada"
  },
  wide: {
    am: "AM",
    pm: "PM",
    midnight: "meia-noite",
    noon: "meio-dia",
    morning: "da manhã",
    afternoon: "da tarde",
    evening: "da noite",
    night: "da madrugada"
  }
}, dM = (e, t) => Number(e) + "º", uM = {
  ordinalNumber: dM,
  era: Te({
    values: oM,
    defaultWidth: "wide"
  }),
  quarter: Te({
    values: sM,
    defaultWidth: "wide",
    argumentCallback: (e) => e - 1
  }),
  month: Te({
    values: iM,
    defaultWidth: "wide"
  }),
  day: Te({
    values: rM,
    defaultWidth: "wide"
  }),
  dayPeriod: Te({
    values: lM,
    defaultWidth: "wide",
    formattingValues: cM,
    defaultFormattingWidth: "wide"
  })
}, hM = /^(\d+)(º|ª)?/i, mM = /\d+/i, pM = {
  narrow: /^(ac|dc|a|d)/i,
  abbreviated: /^(a\.?\s?c\.?|a\.?\s?e\.?\s?c\.?|d\.?\s?c\.?|e\.?\s?c\.?)/i,
  wide: /^(antes de cristo|antes da era comum|depois de cristo|era comum)/i
}, fM = {
  any: [/^ac/i, /^dc/i],
  wide: [
    /^(antes de cristo|antes da era comum)/i,
    /^(depois de cristo|era comum)/i
  ]
}, gM = {
  narrow: /^[1234]/i,
  abbreviated: /^T[1234]/i,
  wide: /^[1234](º|ª)? trimestre/i
}, bM = {
  any: [/1/i, /2/i, /3/i, /4/i]
}, yM = {
  narrow: /^[jfmasond]/i,
  abbreviated: /^(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i,
  wide: /^(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i
}, vM = {
  narrow: [
    /^j/i,
    /^f/i,
    /^m/i,
    /^a/i,
    /^m/i,
    /^j/i,
    /^j/i,
    /^a/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ],
  any: [
    /^ja/i,
    /^f/i,
    /^mar/i,
    /^ab/i,
    /^mai/i,
    /^jun/i,
    /^jul/i,
    /^ag/i,
    /^s/i,
    /^o/i,
    /^n/i,
    /^d/i
  ]
}, wM = {
  narrow: /^[dstq]/i,
  short: /^(dom|seg|ter|qua|qui|sex|s[áa]b)/i,
  abbreviated: /^(dom|seg|ter|qua|qui|sex|s[áa]b)/i,
  wide: /^(domingo|segunda-?\s?feira|terça-?\s?feira|quarta-?\s?feira|quinta-?\s?feira|sexta-?\s?feira|s[áa]bado)/i
}, kM = {
  narrow: [/^d/i, /^s/i, /^t/i, /^q/i, /^q/i, /^s/i, /^s/i],
  any: [/^d/i, /^seg/i, /^t/i, /^qua/i, /^qui/i, /^sex/i, /^s[áa]/i]
}, _M = {
  narrow: /^(a|p|meia-?\s?noite|meio-?\s?dia|(da) (manh[ãa]|tarde|noite|madrugada))/i,
  any: /^([ap]\.?\s?m\.?|meia-?\s?noite|meio-?\s?dia|(da) (manh[ãa]|tarde|noite|madrugada))/i
}, xM = {
  any: {
    am: /^a/i,
    pm: /^p/i,
    midnight: /^meia/i,
    noon: /^meio/i,
    morning: /manh[ãa]/i,
    afternoon: /tarde/i,
    evening: /noite/i,
    night: /madrugada/i
  }
}, SM = {
  ordinalNumber: uo({
    matchPattern: hM,
    parsePattern: mM,
    valueCallback: (e) => parseInt(e, 10)
  }),
  era: Ce({
    matchPatterns: pM,
    defaultMatchWidth: "wide",
    parsePatterns: fM,
    defaultParseWidth: "any"
  }),
  quarter: Ce({
    matchPatterns: gM,
    defaultMatchWidth: "wide",
    parsePatterns: bM,
    defaultParseWidth: "any",
    valueCallback: (e) => e + 1
  }),
  month: Ce({
    matchPatterns: yM,
    defaultMatchWidth: "wide",
    parsePatterns: vM,
    defaultParseWidth: "any"
  }),
  day: Ce({
    matchPatterns: wM,
    defaultMatchWidth: "wide",
    parsePatterns: kM,
    defaultParseWidth: "any"
  }),
  dayPeriod: Ce({
    matchPatterns: _M,
    defaultMatchWidth: "any",
    parsePatterns: xM,
    defaultParseWidth: "any"
  })
}, MM = {
  code: "pt",
  formatDistance: J2,
  formatLong: tM,
  formatRelative: aM,
  localize: uM,
  match: SM,
  options: {
    weekStartsOn: 0,
    firstWeekContainsDate: 4
  }
}, $M = {
  lessThanXSeconds: {
    one: "不到 1 秒",
    other: "不到 {{count}} 秒"
  },
  xSeconds: {
    one: "1 秒",
    other: "{{count}} 秒"
  },
  halfAMinute: "半分钟",
  lessThanXMinutes: {
    one: "不到 1 分钟",
    other: "不到 {{count}} 分钟"
  },
  xMinutes: {
    one: "1 分钟",
    other: "{{count}} 分钟"
  },
  xHours: {
    one: "1 小时",
    other: "{{count}} 小时"
  },
  aboutXHours: {
    one: "大约 1 小时",
    other: "大约 {{count}} 小时"
  },
  xDays: {
    one: "1 天",
    other: "{{count}} 天"
  },
  aboutXWeeks: {
    one: "大约 1 个星期",
    other: "大约 {{count}} 个星期"
  },
  xWeeks: {
    one: "1 个星期",
    other: "{{count}} 个星期"
  },
  aboutXMonths: {
    one: "大约 1 个月",
    other: "大约 {{count}} 个月"
  },
  xMonths: {
    one: "1 个月",
    other: "{{count}} 个月"
  },
  aboutXYears: {
    one: "大约 1 年",
    other: "大约 {{count}} 年"
  },
  xYears: {
    one: "1 年",
    other: "{{count}} 年"
  },
  overXYears: {
    one: "超过 1 年",
    other: "超过 {{count}} 年"
  },
  almostXYears: {
    one: "将近 1 年",
    other: "将近 {{count}} 年"
  }
}, TM = (e, t, a) => {
  let n;
  const s = $M[e];
  return typeof s == "string" ? n = s : t === 1 ? n = s.one : n = s.other.replace("{{count}}", String(t)), a?.addSuffix ? a.comparison && a.comparison > 0 ? n + "内" : n + "前" : n;
}, CM = {
  full: "y'年'M'月'd'日' EEEE",
  long: "y'年'M'月'd'日'",
  medium: "yyyy-MM-dd",
  short: "yy-MM-dd"
}, NM = {
  full: "zzzz a h:mm:ss",
  long: "z a h:mm:ss",
  medium: "a h:mm:ss",
  short: "a h:mm"
}, DM = {
  full: "{{date}} {{time}}",
  long: "{{date}} {{time}}",
  medium: "{{date}} {{time}}",
  short: "{{date}} {{time}}"
}, zM = {
  date: gt({
    formats: CM,
    defaultWidth: "full"
  }),
  time: gt({
    formats: NM,
    defaultWidth: "full"
  }),
  dateTime: gt({
    formats: DM,
    defaultWidth: "full"
  })
};
function Cc(e, t, a) {
  const n = "eeee p";
  return ex(e, t, a) ? n : e.getTime() > t.getTime() ? "'下个'" + n : "'上个'" + n;
}
const PM = {
  lastWeek: Cc,
  // days before yesterday, maybe in this week or last week
  yesterday: "'昨天' p",
  today: "'今天' p",
  tomorrow: "'明天' p",
  nextWeek: Cc,
  // days after tomorrow, maybe in this week or next week
  other: "PP p"
}, AM = (e, t, a, n) => {
  const s = PM[e];
  return typeof s == "function" ? s(t, a, n) : s;
}, OM = {
  narrow: ["前", "公元"],
  abbreviated: ["前", "公元"],
  wide: ["公元前", "公元"]
}, EM = {
  narrow: ["1", "2", "3", "4"],
  abbreviated: ["第一季", "第二季", "第三季", "第四季"],
  wide: ["第一季度", "第二季度", "第三季度", "第四季度"]
}, WM = {
  narrow: [
    "一",
    "二",
    "三",
    "四",
    "五",
    "六",
    "七",
    "八",
    "九",
    "十",
    "十一",
    "十二"
  ],
  abbreviated: [
    "1月",
    "2月",
    "3月",
    "4月",
    "5月",
    "6月",
    "7月",
    "8月",
    "9月",
    "10月",
    "11月",
    "12月"
  ],
  wide: [
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月"
  ]
}, IM = {
  narrow: ["日", "一", "二", "三", "四", "五", "六"],
  short: ["日", "一", "二", "三", "四", "五", "六"],
  abbreviated: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  wide: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"]
}, RM = {
  narrow: {
    am: "上",
    pm: "下",
    midnight: "凌晨",
    noon: "午",
    morning: "早",
    afternoon: "下午",
    evening: "晚",
    night: "夜"
  },
  abbreviated: {
    am: "上午",
    pm: "下午",
    midnight: "凌晨",
    noon: "中午",
    morning: "早晨",
    afternoon: "中午",
    evening: "晚上",
    night: "夜间"
  },
  wide: {
    am: "上午",
    pm: "下午",
    midnight: "凌晨",
    noon: "中午",
    morning: "早晨",
    afternoon: "中午",
    evening: "晚上",
    night: "夜间"
  }
}, LM = {
  narrow: {
    am: "上",
    pm: "下",
    midnight: "凌晨",
    noon: "午",
    morning: "早",
    afternoon: "下午",
    evening: "晚",
    night: "夜"
  },
  abbreviated: {
    am: "上午",
    pm: "下午",
    midnight: "凌晨",
    noon: "中午",
    morning: "早晨",
    afternoon: "中午",
    evening: "晚上",
    night: "夜间"
  },
  wide: {
    am: "上午",
    pm: "下午",
    midnight: "凌晨",
    noon: "中午",
    morning: "早晨",
    afternoon: "中午",
    evening: "晚上",
    night: "夜间"
  }
}, qM = (e, t) => {
  const a = Number(e);
  switch (t?.unit) {
    case "date":
      return a.toString() + "日";
    case "hour":
      return a.toString() + "时";
    case "minute":
      return a.toString() + "分";
    case "second":
      return a.toString() + "秒";
    default:
      return "第 " + a.toString();
  }
}, FM = {
  ordinalNumber: qM,
  era: Te({
    values: OM,
    defaultWidth: "wide"
  }),
  quarter: Te({
    values: EM,
    defaultWidth: "wide",
    argumentCallback: (e) => e - 1
  }),
  month: Te({
    values: WM,
    defaultWidth: "wide"
  }),
  day: Te({
    values: IM,
    defaultWidth: "wide"
  }),
  dayPeriod: Te({
    values: RM,
    defaultWidth: "wide",
    formattingValues: LM,
    defaultFormattingWidth: "wide"
  })
}, BM = /^(第\s*)?\d+(日|时|分|秒)?/i, HM = /\d+/i, jM = {
  narrow: /^(前)/i,
  abbreviated: /^(前)/i,
  wide: /^(公元前|公元)/i
}, YM = {
  any: [/^(前)/i, /^(公元)/i]
}, VM = {
  narrow: /^[1234]/i,
  abbreviated: /^第[一二三四]刻/i,
  wide: /^第[一二三四]刻钟/i
}, GM = {
  any: [/(1|一)/i, /(2|二)/i, /(3|三)/i, /(4|四)/i]
}, KM = {
  narrow: /^(一|二|三|四|五|六|七|八|九|十[二一]?)/i,
  abbreviated: /^(一|二|三|四|五|六|七|八|九|十[二一]?|\d|1[0-2])月/i,
  wide: /^(一|二|三|四|五|六|七|八|九|十[二一]?)月/i
}, UM = {
  narrow: [
    /^一/i,
    /^二/i,
    /^三/i,
    /^四/i,
    /^五/i,
    /^六/i,
    /^七/i,
    /^八/i,
    /^九/i,
    /^十(?!(一|二))/i,
    /^十一/i,
    /^十二/i
  ],
  any: [
    /^(一|1(?!\d))/i,
    /^(二|2)/i,
    /^(三|3)/i,
    /^(四|4)/i,
    /^(五|5)/i,
    /^(六|6)/i,
    /^(七|7)/i,
    /^(八|8)/i,
    /^(九|9)/i,
    /^(十(?!(一|二))|10)/i,
    /^(十一|11)/i,
    /^(十二|12)/i
  ]
}, XM = {
  narrow: /^[一二三四五六日]/i,
  short: /^[一二三四五六日]/i,
  abbreviated: /^周[一二三四五六日]/i,
  wide: /^星期[一二三四五六日]/i
}, JM = {
  any: [/日/i, /一/i, /二/i, /三/i, /四/i, /五/i, /六/i]
}, QM = {
  any: /^(上午?|下午?|午夜|[中正]午|早上?|下午|晚上?|凌晨|)/i
}, ZM = {
  any: {
    am: /^上午?/i,
    pm: /^下午?/i,
    midnight: /^午夜/i,
    noon: /^[中正]午/i,
    morning: /^早上/i,
    afternoon: /^下午/i,
    evening: /^晚上?/i,
    night: /^凌晨/i
  }
}, e$ = {
  ordinalNumber: uo({
    matchPattern: BM,
    parsePattern: HM,
    valueCallback: (e) => parseInt(e, 10)
  }),
  era: Ce({
    matchPatterns: jM,
    defaultMatchWidth: "wide",
    parsePatterns: YM,
    defaultParseWidth: "any"
  }),
  quarter: Ce({
    matchPatterns: VM,
    defaultMatchWidth: "wide",
    parsePatterns: GM,
    defaultParseWidth: "any",
    valueCallback: (e) => e + 1
  }),
  month: Ce({
    matchPatterns: KM,
    defaultMatchWidth: "wide",
    parsePatterns: UM,
    defaultParseWidth: "any"
  }),
  day: Ce({
    matchPatterns: XM,
    defaultMatchWidth: "wide",
    parsePatterns: JM,
    defaultParseWidth: "any"
  }),
  dayPeriod: Ce({
    matchPatterns: QM,
    defaultMatchWidth: "any",
    parsePatterns: ZM,
    defaultParseWidth: "any"
  })
}, t$ = {
  code: "zh-CN",
  formatDistance: TM,
  formatLong: zM,
  formatRelative: AM,
  localize: FM,
  match: e$,
  options: {
    weekStartsOn: 1,
    firstWeekContainsDate: 4
  }
}, su = {
  ...Oo,
  labels: {
    labelDayButton: (e, t, a, n) => {
      let s;
      n && typeof n.format == "function" ? s = n.format.bind(n) : s = (r, l) => us(r, l, { locale: Oo, ...a });
      let i = s(e, "PPPP");
      return t.today && (i = `Today, ${i}`), t.selected && (i = `${i}, selected`), i;
    },
    labelMonthDropdown: "Choose the Month",
    labelNext: "Go to the Next Month",
    labelPrevious: "Go to the Previous Month",
    labelWeekNumber: (e) => `Week ${e}`,
    labelYearDropdown: "Choose the Year",
    labelGrid: (e, t, a) => {
      let n;
      return a && typeof a.format == "function" ? n = a.format.bind(a) : n = (s, i) => us(s, i, { locale: Oo, ...t }), n(e, "LLLL yyyy");
    },
    labelGridcell: (e, t, a, n) => {
      let s;
      n && typeof n.format == "function" ? s = n.format.bind(n) : s = (r, l) => us(r, l, { locale: Oo, ...a });
      let i = s(e, "PPPP");
      return t?.today && (i = `Today, ${i}`), i;
    },
    labelNav: "Navigation bar",
    labelWeekNumberHeader: "Week Number",
    labelWeekday: (e, t, a) => {
      let n;
      return a && typeof a.format == "function" ? n = a.format.bind(a) : n = (s, i) => us(s, i, { locale: Oo, ...t }), n(e, "cccc");
    }
  }
};
class Nn {
  /**
   * Creates an instance of `DateLib`.
   *
   * @param options Configuration options for the date library.
   * @param overrides Custom overrides for the date library functions.
   */
  constructor(t, a) {
    this.today = () => {
      if (this.overrides?.today)
        return this.overrides.today();
      if (this.options.timeZone)
        return Kt.tz(this.options.timeZone);
      const n = this.options.Date ?? Date;
      return new n();
    }, this.newDate = (n, s, i) => this.overrides?.newDate ? this.overrides.newDate(n, s, i) : this.options.timeZone ? new Kt(n, s, i, this.options.timeZone) : new Date(n, s, i), this.addDays = (n, s) => this.overrides?.addDays ? this.overrides.addDays(n, s) : Kd(n, s), this.addMonths = (n, s) => this.overrides?.addMonths ? this.overrides.addMonths(n, s) : Ud(n, s), this.addWeeks = (n, s) => this.overrides?.addWeeks ? this.overrides.addWeeks(n, s) : H_(n, s), this.addYears = (n, s) => this.overrides?.addYears ? this.overrides.addYears(n, s) : j_(n, s), this.differenceInCalendarDays = (n, s) => this.overrides?.differenceInCalendarDays ? this.overrides.differenceInCalendarDays(n, s) : el(n, s), this.differenceInCalendarMonths = (n, s) => this.overrides?.differenceInCalendarMonths ? this.overrides.differenceInCalendarMonths(n, s) : Qd(n, s), this.eachMonthOfInterval = (n) => this.overrides?.eachMonthOfInterval ? this.overrides.eachMonthOfInterval(n) : X_(n), this.eachYearOfInterval = (n) => {
      const s = this.overrides?.eachYearOfInterval ? this.overrides.eachYearOfInterval(n) : Z_(n), i = new Set(s.map((l) => this.getYear(l)));
      if (i.size === s.length)
        return s;
      const r = [];
      return i.forEach((l) => {
        r.push(new Date(l, 0, 1));
      }), r;
    }, this.endOfBroadcastWeek = (n) => this.overrides?.endOfBroadcastWeek ? this.overrides.endOfBroadcastWeek(n) : rx(n, this), this.endOfISOWeek = (n) => this.overrides?.endOfISOWeek ? this.overrides.endOfISOWeek(n) : e0(n), this.endOfMonth = (n) => this.overrides?.endOfMonth ? this.overrides.endOfMonth(n) : U_(n), this.endOfWeek = (n, s) => this.overrides?.endOfWeek ? this.overrides.endOfWeek(n, s) : tu(n, this.options), this.endOfYear = (n) => this.overrides?.endOfYear ? this.overrides.endOfYear(n) : Q_(n), this.format = (n, s, i) => {
      const r = this.overrides?.format ? this.overrides.format(n, s, this.options) : us(n, s, this.options);
      return this.options.numerals && this.options.numerals !== "latn" ? this.replaceDigits(r) : r;
    }, this.getISOWeek = (n) => this.overrides?.getISOWeek ? this.overrides.getISOWeek(n) : tl(n), this.getMonth = (n, s) => this.overrides?.getMonth ? this.overrides.getMonth(n, this.options) : X0(n, this.options), this.getYear = (n, s) => this.overrides?.getYear ? this.overrides.getYear(n, this.options) : J0(n, this.options), this.getWeek = (n, s) => this.overrides?.getWeek ? this.overrides.getWeek(n, this.options) : nl(n, this.options), this.isAfter = (n, s) => this.overrides?.isAfter ? this.overrides.isAfter(n, s) : Q0(n, s), this.isBefore = (n, s) => this.overrides?.isBefore ? this.overrides.isBefore(n, s) : Z0(n, s), this.isDate = (n) => this.overrides?.isDate ? this.overrides.isDate(n) : Jd(n), this.isSameDay = (n, s) => this.overrides?.isSameDay ? this.overrides.isSameDay(n, s) : G_(n, s), this.isSameMonth = (n, s) => this.overrides?.isSameMonth ? this.overrides.isSameMonth(n, s) : tx(n, s), this.isSameYear = (n, s) => this.overrides?.isSameYear ? this.overrides.isSameYear(n, s) : nx(n, s), this.max = (n) => this.overrides?.max ? this.overrides.max(n) : Y_(n), this.min = (n) => this.overrides?.min ? this.overrides.min(n) : V_(n), this.setMonth = (n, s) => this.overrides?.setMonth ? this.overrides.setMonth(n, s) : ax(n, s), this.setYear = (n, s) => this.overrides?.setYear ? this.overrides.setYear(n, s) : ox(n, s), this.startOfBroadcastWeek = (n, s) => this.overrides?.startOfBroadcastWeek ? this.overrides.startOfBroadcastWeek(n, this) : ou(n, this), this.startOfDay = (n) => this.overrides?.startOfDay ? this.overrides.startOfDay(n) : Qs(n), this.startOfISOWeek = (n) => this.overrides?.startOfISOWeek ? this.overrides.startOfISOWeek(n) : Js(n), this.startOfMonth = (n) => this.overrides?.startOfMonth ? this.overrides.startOfMonth(n) : J_(n), this.startOfWeek = (n, s) => this.overrides?.startOfWeek ? this.overrides.startOfWeek(n, this.options) : lo(n, this.options), this.startOfYear = (n) => this.overrides?.startOfYear ? this.overrides.startOfYear(n) : eu(n), this.options = { locale: su, ...t }, this.overrides = a;
  }
  /**
   * Generates a mapping of Arabic digits (0-9) to the target numbering system
   * digits.
   *
   * @since 9.5.0
   * @returns A record mapping Arabic digits to the target numerals.
   */
  getDigitMap() {
    const { numerals: t = "latn" } = this.options, a = new Intl.NumberFormat("en-US", {
      numberingSystem: t
    }), n = {};
    for (let s = 0; s < 10; s++)
      n[s.toString()] = a.format(s);
    return n;
  }
  /**
   * Replaces Arabic digits in a string with the target numbering system digits.
   *
   * @since 9.5.0
   * @param input The string containing Arabic digits.
   * @returns The string with digits replaced.
   */
  replaceDigits(t) {
    const a = this.getDigitMap();
    return t.replace(/\d/g, (n) => a[n] || n);
  }
  /**
   * Formats a number using the configured numbering system.
   *
   * @since 9.5.0
   * @param value The number to format.
   * @returns The formatted number as a string.
   */
  formatNumber(t) {
    return this.replaceDigits(t.toString());
  }
  /**
   * Returns the preferred ordering for month and year labels for the current
   * locale.
   */
  getMonthYearOrder() {
    const t = this.options.locale?.code;
    return t && Nn.yearFirstLocales.has(t) ? "year-first" : "month-first";
  }
  /**
   * Formats the month/year pair respecting locale conventions.
   *
   * @since 9.11.0
   */
  formatMonthYear(t) {
    const { locale: a, timeZone: n, numerals: s } = this.options, i = a?.code;
    if (i && Nn.yearFirstLocales.has(i))
      try {
        return new Intl.DateTimeFormat(i, {
          month: "long",
          year: "numeric",
          timeZone: n,
          numberingSystem: s
        }).format(t);
      } catch {
      }
    const r = this.getMonthYearOrder() === "year-first" ? "y LLLL" : "LLLL y";
    return this.format(t, r);
  }
}
Nn.yearFirstLocales = /* @__PURE__ */ new Set([
  "eu",
  "hu",
  "ja",
  "ja-Hira",
  "ja-JP",
  "ko",
  "ko-KR",
  "lt",
  "lt-LT",
  "lv",
  "lv-LV",
  "mn",
  "mn-MN",
  "zh",
  "zh-CN",
  "zh-HK",
  "zh-TW"
]);
const Ma = new Nn();
class iu {
  constructor(t, a, n = Ma) {
    this.date = t, this.displayMonth = a, this.outside = !!(a && !n.isSameMonth(t, a)), this.dateLib = n, this.isoDate = n.format(t, "yyyy-MM-dd"), this.displayMonthId = n.format(a, "yyyy-MM"), this.dateMonthId = n.format(t, "yyyy-MM");
  }
  /**
   * Checks if this day is equal to another `CalendarDay`, considering both the
   * date and the displayed month.
   *
   * @param day The `CalendarDay` to compare with.
   * @returns `true` if the days are equal, otherwise `false`.
   */
  isEqualTo(t) {
    return this.dateLib.isSameDay(t.date, this.date) && this.dateLib.isSameMonth(t.displayMonth, this.displayMonth);
  }
}
class n$ {
  constructor(t, a) {
    this.date = t, this.weeks = a;
  }
}
class a$ {
  constructor(t, a) {
    this.days = a, this.weekNumber = t;
  }
}
function o$(e) {
  return de.createElement("span", { ...e });
}
function s$(e) {
  const { size: t = 24, orientation: a = "left", className: n, style: s } = e;
  return de.createElement(
    "svg",
    { className: n, style: s, width: t, height: t, viewBox: "0 0 24 24" },
    a === "up" && de.createElement("polygon", { points: "6.77 17 12.5 11.43 18.24 17 20 15.28 12.5 8 5 15.28" }),
    a === "down" && de.createElement("polygon", { points: "6.77 8 12.5 13.57 18.24 8 20 9.72 12.5 17 5 9.72" }),
    a === "left" && de.createElement("polygon", { points: "16 18.112 9.81111111 12 16 5.87733333 14.0888889 4 6 12 14.0888889 20" }),
    a === "right" && de.createElement("polygon", { points: "8 18.112 14.18888889 12 8 5.87733333 9.91111111 4 18 12 9.91111111 20" })
  );
}
function i$(e) {
  const { day: t, modifiers: a, ...n } = e;
  return de.createElement("td", { ...n });
}
function r$(e) {
  const { day: t, modifiers: a, ...n } = e, s = de.useRef(null);
  return de.useEffect(() => {
    a.focused && s.current?.focus();
  }, [a.focused]), de.createElement("button", { ref: s, ...n });
}
var re;
(function(e) {
  e.Root = "root", e.Chevron = "chevron", e.Day = "day", e.DayButton = "day_button", e.CaptionLabel = "caption_label", e.Dropdowns = "dropdowns", e.Dropdown = "dropdown", e.DropdownRoot = "dropdown_root", e.Footer = "footer", e.MonthGrid = "month_grid", e.MonthCaption = "month_caption", e.MonthsDropdown = "months_dropdown", e.Month = "month", e.Months = "months", e.Nav = "nav", e.NextMonthButton = "button_next", e.PreviousMonthButton = "button_previous", e.Week = "week", e.Weeks = "weeks", e.Weekday = "weekday", e.Weekdays = "weekdays", e.WeekNumber = "week_number", e.WeekNumberHeader = "week_number_header", e.YearsDropdown = "years_dropdown";
})(re || (re = {}));
var bt;
(function(e) {
  e.disabled = "disabled", e.hidden = "hidden", e.outside = "outside", e.focused = "focused", e.today = "today";
})(bt || (bt = {}));
var oa;
(function(e) {
  e.range_end = "range_end", e.range_middle = "range_middle", e.range_start = "range_start", e.selected = "selected";
})(oa || (oa = {}));
var Tn;
(function(e) {
  e.weeks_before_enter = "weeks_before_enter", e.weeks_before_exit = "weeks_before_exit", e.weeks_after_enter = "weeks_after_enter", e.weeks_after_exit = "weeks_after_exit", e.caption_after_enter = "caption_after_enter", e.caption_after_exit = "caption_after_exit", e.caption_before_enter = "caption_before_enter", e.caption_before_exit = "caption_before_exit";
})(Tn || (Tn = {}));
const ru = _a(void 0);
function Oi() {
  const e = Gn(ru);
  if (e === void 0)
    throw new Error("useDayPicker() must be used within a custom component.");
  return e;
}
function l$(e) {
  const { options: t, className: a, ...n } = e, { classNames: s, components: i, styles: r } = Oi(), l = [s[re.Dropdown], a].join(" "), d = t?.find(({ value: u }) => u === n.value);
  return de.createElement(
    "span",
    { "data-disabled": n.disabled, className: s[re.DropdownRoot], style: r?.[re.DropdownRoot] },
    de.createElement(i.Select, { className: l, ...n }, t?.map(({ value: u, label: m, disabled: h }) => de.createElement(i.Option, { key: u, value: u, disabled: h }, m))),
    de.createElement(
      "span",
      { className: s[re.CaptionLabel], style: r?.[re.CaptionLabel], "aria-hidden": !0 },
      d?.label,
      de.createElement(i.Chevron, { orientation: "down", size: 18, className: s[re.Chevron], style: r?.[re.Chevron] })
    )
  );
}
function c$(e) {
  return de.createElement("div", { ...e });
}
function d$(e) {
  return de.createElement("div", { ...e });
}
function u$(e) {
  const { calendarMonth: t, displayIndex: a, ...n } = e;
  return de.createElement("div", { ...n }, e.children);
}
function h$(e) {
  const { calendarMonth: t, displayIndex: a, ...n } = e;
  return de.createElement("div", { ...n });
}
function m$(e) {
  return de.createElement("table", { ...e });
}
function p$(e) {
  return de.createElement("div", { ...e });
}
function f$(e) {
  const { components: t } = Oi();
  return de.createElement(t.Dropdown, { ...e });
}
function g$(e) {
  const { onPreviousClick: t, onNextClick: a, previousMonth: n, nextMonth: s, ...i } = e, { components: r, classNames: l, styles: d, labels: { labelPrevious: u, labelNext: m } } = Oi(), h = at((b) => {
    s && a?.(b);
  }, [s, a]), f = at((b) => {
    n && t?.(b);
  }, [n, t]);
  return de.createElement(
    "nav",
    { ...i },
    de.createElement(
      r.PreviousMonthButton,
      { type: "button", className: l[re.PreviousMonthButton], style: d?.[re.PreviousMonthButton], tabIndex: n ? void 0 : -1, "aria-disabled": n ? void 0 : !0, "aria-label": u(n), onClick: f },
      de.createElement(r.Chevron, { disabled: n ? void 0 : !0, className: l[re.Chevron], style: d?.[re.Chevron], orientation: "left" })
    ),
    de.createElement(
      r.NextMonthButton,
      { type: "button", className: l[re.NextMonthButton], style: d?.[re.NextMonthButton], tabIndex: s ? void 0 : -1, "aria-disabled": s ? void 0 : !0, "aria-label": m(s), onClick: h },
      de.createElement(r.Chevron, { disabled: s ? void 0 : !0, orientation: "right", className: l[re.Chevron], style: d?.[re.Chevron] })
    )
  );
}
function b$(e) {
  return de.createElement("button", { ...e });
}
function y$(e) {
  return de.createElement("option", { ...e });
}
function v$(e) {
  return de.createElement("button", { ...e });
}
function w$(e) {
  const { rootRef: t, ...a } = e;
  return de.createElement("div", { ...a, ref: t });
}
function k$(e) {
  return de.createElement("select", { ...e });
}
function _$(e) {
  const { week: t, ...a } = e;
  return de.createElement("tr", { ...a });
}
function x$(e) {
  return de.createElement("th", { ...e });
}
function S$(e) {
  return de.createElement(
    "thead",
    { "aria-hidden": !0 },
    de.createElement("tr", { ...e })
  );
}
function M$(e) {
  const { week: t, ...a } = e;
  return de.createElement("th", { ...a });
}
function $$(e) {
  return de.createElement("th", { ...e });
}
function T$(e) {
  return de.createElement("tbody", { ...e });
}
function C$(e) {
  const { components: t } = Oi();
  return de.createElement(t.Dropdown, { ...e });
}
const N$ = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  CaptionLabel: o$,
  Chevron: s$,
  Day: i$,
  DayButton: r$,
  Dropdown: l$,
  DropdownNav: c$,
  Footer: d$,
  Month: u$,
  MonthCaption: h$,
  MonthGrid: m$,
  Months: p$,
  MonthsDropdown: f$,
  Nav: g$,
  NextMonthButton: b$,
  Option: y$,
  PreviousMonthButton: v$,
  Root: w$,
  Select: k$,
  Week: _$,
  WeekNumber: M$,
  WeekNumberHeader: $$,
  Weekday: x$,
  Weekdays: S$,
  Weeks: T$,
  YearsDropdown: C$
}, Symbol.toStringTag, { value: "Module" }));
function qa(e, t, a = !1, n = Ma) {
  let { from: s, to: i } = e;
  const { differenceInCalendarDays: r, isSameDay: l } = n;
  return s && i ? (r(i, s) < 0 && ([s, i] = [i, s]), r(t, s) >= (a ? 1 : 0) && r(i, t) >= (a ? 1 : 0)) : !a && i ? l(i, t) : !a && s ? l(s, t) : !1;
}
function al(e) {
  return !!(e && typeof e == "object" && "before" in e && "after" in e);
}
function Ei(e) {
  return !!(e && typeof e == "object" && "from" in e);
}
function ol(e) {
  return !!(e && typeof e == "object" && "after" in e);
}
function sl(e) {
  return !!(e && typeof e == "object" && "before" in e);
}
function lu(e) {
  return !!(e && typeof e == "object" && "dayOfWeek" in e);
}
function cu(e, t) {
  return Array.isArray(e) && e.every(t.isDate);
}
function Fa(e, t, a = Ma) {
  const n = Array.isArray(t) ? t : [t], { isSameDay: s, differenceInCalendarDays: i, isAfter: r } = a;
  return n.some((l) => {
    if (typeof l == "boolean")
      return l;
    if (a.isDate(l))
      return s(e, l);
    if (cu(l, a))
      return l.some((d) => s(e, d));
    if (Ei(l))
      return qa(l, e, !1, a);
    if (lu(l))
      return Array.isArray(l.dayOfWeek) ? l.dayOfWeek.includes(e.getDay()) : l.dayOfWeek === e.getDay();
    if (al(l)) {
      const d = i(l.before, e), u = i(l.after, e), m = d > 0, h = u < 0;
      return r(l.before, l.after) ? h && m : m || h;
    }
    return ol(l) ? i(e, l.after) > 0 : sl(l) ? i(l.before, e) > 0 : typeof l == "function" ? l(e) : !1;
  });
}
function D$(e, t, a, n, s) {
  const { disabled: i, hidden: r, modifiers: l, showOutsideDays: d, broadcastCalendar: u, today: m = s.today() } = t, { isSameDay: h, isSameMonth: f, startOfMonth: b, isBefore: w, endOfMonth: S, isAfter: $ } = s, N = a && b(a), y = n && S(n), v = {
    [bt.focused]: [],
    [bt.outside]: [],
    [bt.disabled]: [],
    [bt.hidden]: [],
    [bt.today]: []
  }, _ = {};
  for (const k of e) {
    const { date: M, displayMonth: T } = k, A = !!(T && !f(M, T)), F = !!(N && w(M, N)), L = !!(y && $(M, y)), O = !!(i && Fa(M, i, s)), q = !!(r && Fa(M, r, s)) || F || L || // Broadcast calendar will show outside days as default
    !u && !d && A || u && d === !1 && A, j = h(M, m);
    A && v.outside.push(k), O && v.disabled.push(k), q && v.hidden.push(k), j && v.today.push(k), l && Object.keys(l).forEach((D) => {
      const H = l?.[D];
      H && Fa(M, H, s) && (_[D] ? _[D].push(k) : _[D] = [k]);
    });
  }
  return (k) => {
    const M = {
      [bt.focused]: !1,
      [bt.disabled]: !1,
      [bt.hidden]: !1,
      [bt.outside]: !1,
      [bt.today]: !1
    }, T = {};
    for (const A in v) {
      const F = v[A];
      M[A] = F.some((L) => L === k);
    }
    for (const A in _)
      T[A] = _[A].some((F) => F === k);
    return {
      ...M,
      // custom modifiers should override all the previous ones
      ...T
    };
  };
}
function z$(e, t, a = {}) {
  return Object.entries(e).filter(([, s]) => s === !0).reduce((s, [i]) => (a[i] ? s.push(a[i]) : t[bt[i]] ? s.push(t[bt[i]]) : t[oa[i]] && s.push(t[oa[i]]), s), [t[re.Day]]);
}
function P$(e) {
  return {
    ...N$,
    ...e
  };
}
function A$(e) {
  const t = {
    "data-mode": e.mode ?? void 0,
    "data-required": "required" in e ? e.required : void 0,
    "data-multiple-months": e.numberOfMonths && e.numberOfMonths > 1 || void 0,
    "data-week-numbers": e.showWeekNumber || void 0,
    "data-broadcast-calendar": e.broadcastCalendar || void 0,
    "data-nav-layout": e.navLayout || void 0
  };
  return Object.entries(e).forEach(([a, n]) => {
    a.startsWith("data-") && (t[a] = n);
  }), t;
}
function O$() {
  const e = {};
  for (const t in re)
    e[re[t]] = `rdp-${re[t]}`;
  for (const t in bt)
    e[bt[t]] = `rdp-${bt[t]}`;
  for (const t in oa)
    e[oa[t]] = `rdp-${oa[t]}`;
  for (const t in Tn)
    e[Tn[t]] = `rdp-${Tn[t]}`;
  return e;
}
function E$(e, t, a) {
  return (a ?? new Nn(t)).formatMonthYear(e);
}
function W$(e, t, a) {
  return (a ?? new Nn(t)).format(e, "d");
}
function I$(e, t = Ma) {
  return t.format(e, "LLLL");
}
function R$(e, t, a) {
  return (a ?? new Nn(t)).format(e, "cccccc");
}
function L$(e, t = Ma) {
  return e < 10 ? t.formatNumber(`0${e.toLocaleString()}`) : t.formatNumber(`${e.toLocaleString()}`);
}
function q$() {
  return "";
}
function F$(e, t = Ma) {
  return t.format(e, "yyyy");
}
const B$ = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  formatCaption: E$,
  formatDay: W$,
  formatMonthDropdown: I$,
  formatWeekNumber: L$,
  formatWeekNumberHeader: q$,
  formatWeekdayName: R$,
  formatYearDropdown: F$
}, Symbol.toStringTag, { value: "Module" }));
function H$(e) {
  return {
    ...B$,
    ...e
  };
}
function du(e, t, a, n) {
  let s = (n ?? new Nn(a)).format(e, "PPPP");
  return t.today && (s = `Today, ${s}`), t.selected && (s = `${s}, selected`), s;
}
function uu(e, t, a) {
  return (a ?? new Nn(t)).formatMonthYear(e);
}
function hu(e, t, a, n) {
  let s = (n ?? new Nn(a)).format(e, "PPPP");
  return t?.today && (s = `Today, ${s}`), s;
}
function mu(e) {
  return "Choose the Month";
}
function pu() {
  return "";
}
const j$ = "Go to the Next Month";
function fu(e, t) {
  return j$;
}
function gu(e) {
  return "Go to the Previous Month";
}
function bu(e, t, a) {
  return (a ?? new Nn(t)).format(e, "cccc");
}
function yu(e, t) {
  return `Week ${e}`;
}
function vu(e) {
  return "Week Number";
}
function wu(e) {
  return "Choose the Year";
}
const Y$ = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  labelDayButton: du,
  labelGrid: uu,
  labelGridcell: hu,
  labelMonthDropdown: mu,
  labelNav: pu,
  labelNext: fu,
  labelPrevious: gu,
  labelWeekNumber: yu,
  labelWeekNumberHeader: vu,
  labelWeekday: bu,
  labelYearDropdown: wu
}, Symbol.toStringTag, { value: "Module" })), Qn = (e, t, a) => t || (a ? typeof a == "function" ? a : (...n) => a : e);
function V$(e, t) {
  const a = t.locale?.labels ?? {};
  return {
    ...Y$,
    ...e ?? {},
    labelDayButton: Qn(du, e?.labelDayButton, a.labelDayButton),
    labelMonthDropdown: Qn(mu, e?.labelMonthDropdown, a.labelMonthDropdown),
    labelNext: Qn(fu, e?.labelNext, a.labelNext),
    labelPrevious: Qn(gu, e?.labelPrevious, a.labelPrevious),
    labelWeekNumber: Qn(yu, e?.labelWeekNumber, a.labelWeekNumber),
    labelYearDropdown: Qn(wu, e?.labelYearDropdown, a.labelYearDropdown),
    labelGrid: Qn(uu, e?.labelGrid, a.labelGrid),
    labelGridcell: Qn(hu, e?.labelGridcell, a.labelGridcell),
    labelNav: Qn(pu, e?.labelNav, a.labelNav),
    labelWeekNumberHeader: Qn(vu, e?.labelWeekNumberHeader, a.labelWeekNumberHeader),
    labelWeekday: Qn(bu, e?.labelWeekday, a.labelWeekday)
  };
}
function G$(e, t, a, n, s) {
  const { startOfMonth: i, startOfYear: r, endOfYear: l, eachMonthOfInterval: d, getMonth: u } = s;
  return d({
    start: r(e),
    end: l(e)
  }).map((f) => {
    const b = n.formatMonthDropdown(f, s), w = u(f), S = t && f < i(t) || a && f > i(a) || !1;
    return { value: w, label: b, disabled: S };
  });
}
function K$(e, t = {}, a = {}) {
  let n = { ...t?.[re.Day] };
  return Object.entries(e).filter(([, s]) => s === !0).forEach(([s]) => {
    n = {
      ...n,
      ...a?.[s]
    };
  }), n;
}
function U$(e, t, a, n) {
  const s = n ?? e.today(), i = a ? e.startOfBroadcastWeek(s, e) : t ? e.startOfISOWeek(s) : e.startOfWeek(s), r = [];
  for (let l = 0; l < 7; l++) {
    const d = e.addDays(i, l);
    r.push(d);
  }
  return r;
}
function X$(e, t, a, n, s = !1) {
  if (!e || !t)
    return;
  const { startOfYear: i, endOfYear: r, eachYearOfInterval: l, getYear: d } = n, u = i(e), m = r(t), h = l({ start: u, end: m });
  return s && h.reverse(), h.map((f) => {
    const b = a.formatYearDropdown(f, n);
    return {
      value: d(f),
      label: b,
      disabled: !1
    };
  });
}
function J$(e, t = {}) {
  const { weekStartsOn: a, locale: n } = t, s = a ?? n?.options?.weekStartsOn ?? 0, i = (l) => {
    const d = typeof l == "number" || typeof l == "string" ? new Date(l) : l;
    return new Kt(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, e);
  }, r = (l) => {
    const d = i(l);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  };
  return {
    today: () => i(Kt.tz(e)),
    newDate: (l, d, u) => new Kt(l, d, u, 12, 0, 0, e),
    startOfDay: (l) => i(l),
    startOfWeek: (l, d) => {
      const u = i(l), m = d?.weekStartsOn ?? s, h = (u.getDay() - m + 7) % 7;
      return u.setDate(u.getDate() - h), u;
    },
    startOfISOWeek: (l) => {
      const d = i(l), u = (d.getDay() - 1 + 7) % 7;
      return d.setDate(d.getDate() - u), d;
    },
    startOfMonth: (l) => {
      const d = i(l);
      return d.setDate(1), d;
    },
    startOfYear: (l) => {
      const d = i(l);
      return d.setMonth(0, 1), d;
    },
    endOfWeek: (l, d) => {
      const u = i(l), f = (((d?.weekStartsOn ?? s) + 6) % 7 - u.getDay() + 7) % 7;
      return u.setDate(u.getDate() + f), u;
    },
    endOfISOWeek: (l) => {
      const d = i(l), u = (7 - d.getDay()) % 7;
      return d.setDate(d.getDate() + u), d;
    },
    endOfMonth: (l) => {
      const d = i(l);
      return d.setMonth(d.getMonth() + 1, 0), d;
    },
    endOfYear: (l) => {
      const d = i(l);
      return d.setMonth(11, 31), d;
    },
    eachMonthOfInterval: (l) => {
      const d = i(l.start), u = i(l.end), m = [], h = new Kt(d.getFullYear(), d.getMonth(), 1, 12, 0, 0, e), f = u.getFullYear() * 12 + u.getMonth();
      for (; h.getFullYear() * 12 + h.getMonth() <= f; )
        m.push(new Kt(h, e)), h.setMonth(h.getMonth() + 1, 1);
      return m;
    },
    // Normalize to noon once before arithmetic (avoid DST/midnight edge cases),
    // mutate the same TZDate, and return it.
    addDays: (l, d) => {
      const u = i(l);
      return u.setDate(u.getDate() + d), u;
    },
    addWeeks: (l, d) => {
      const u = i(l);
      return u.setDate(u.getDate() + d * 7), u;
    },
    addMonths: (l, d) => {
      const u = i(l);
      return u.setMonth(u.getMonth() + d), u;
    },
    addYears: (l, d) => {
      const u = i(l);
      return u.setFullYear(u.getFullYear() + d), u;
    },
    eachYearOfInterval: (l) => {
      const d = i(l.start), u = i(l.end), m = [], h = new Kt(d.getFullYear(), 0, 1, 12, 0, 0, e);
      for (; h.getFullYear() <= u.getFullYear(); )
        m.push(new Kt(h, e)), h.setFullYear(h.getFullYear() + 1, 0, 1);
      return m;
    },
    getWeek: (l, d) => {
      const u = r(l);
      return nl(u, {
        weekStartsOn: d?.weekStartsOn ?? s,
        firstWeekContainsDate: d?.firstWeekContainsDate ?? n?.options?.firstWeekContainsDate ?? 1
      });
    },
    getISOWeek: (l) => {
      const d = r(l);
      return tl(d);
    },
    differenceInCalendarDays: (l, d) => {
      const u = r(l), m = r(d);
      return el(u, m);
    },
    differenceInCalendarMonths: (l, d) => {
      const u = r(l), m = r(d);
      return Qd(u, m);
    }
  };
}
const oi = (e) => e instanceof HTMLElement ? e : null, br = (e) => [
  ...e.querySelectorAll("[data-animated-month]") ?? []
], Q$ = (e) => oi(e.querySelector("[data-animated-month]")), yr = (e) => oi(e.querySelector("[data-animated-caption]")), vr = (e) => oi(e.querySelector("[data-animated-weeks]")), Z$ = (e) => oi(e.querySelector("[data-animated-nav]")), eT = (e) => oi(e.querySelector("[data-animated-weekdays]"));
function tT(e, t, { classNames: a, months: n, focused: s, dateLib: i }) {
  const r = ee(null), l = ee(n), d = ee(!1);
  ys(() => {
    const u = l.current;
    if (l.current = n, !t || !e.current || // safety check because the ref can be set to anything by consumers
    !(e.current instanceof HTMLElement) || // validation required for the animation to work as expected
    n.length === 0 || u.length === 0 || n.length !== u.length)
      return;
    const m = i.isSameMonth(n[0].date, u[0].date), h = i.isAfter(n[0].date, u[0].date), f = h ? a[Tn.caption_after_enter] : a[Tn.caption_before_enter], b = h ? a[Tn.weeks_after_enter] : a[Tn.weeks_before_enter], w = r.current, S = e.current.cloneNode(!0);
    if (S instanceof HTMLElement ? (br(S).forEach((v) => {
      if (!(v instanceof HTMLElement))
        return;
      const _ = Q$(v);
      _ && v.contains(_) && v.removeChild(_);
      const k = yr(v);
      k && k.classList.remove(f);
      const M = vr(v);
      M && M.classList.remove(b);
    }), r.current = S) : r.current = null, d.current || m || // skip animation if a day is focused because it can cause issues to the animation and is better for a11y
    s)
      return;
    const $ = w instanceof HTMLElement ? br(w) : [], N = br(e.current);
    if (N?.every((y) => y instanceof HTMLElement) && $?.every((y) => y instanceof HTMLElement)) {
      d.current = !0, e.current.style.isolation = "isolate";
      const y = Z$(e.current);
      y && (y.style.zIndex = "1"), N.forEach((v, _) => {
        const k = $[_];
        if (!k)
          return;
        v.style.position = "relative", v.style.overflow = "hidden";
        const M = yr(v);
        M && M.classList.add(f);
        const T = vr(v);
        T && T.classList.add(b);
        const A = () => {
          d.current = !1, e.current && (e.current.style.isolation = ""), y && (y.style.zIndex = ""), M && M.classList.remove(f), T && T.classList.remove(b), v.style.position = "", v.style.overflow = "", v.contains(k) && v.removeChild(k);
        };
        k.style.pointerEvents = "none", k.style.position = "absolute", k.style.overflow = "hidden", k.setAttribute("aria-hidden", "true");
        const F = eT(k);
        F && (F.style.opacity = "0");
        const L = yr(k);
        L && (L.classList.add(h ? a[Tn.caption_before_exit] : a[Tn.caption_after_exit]), L.addEventListener("animationend", A));
        const O = vr(k);
        O && O.classList.add(h ? a[Tn.weeks_before_exit] : a[Tn.weeks_after_exit]), v.insertBefore(k, v.firstChild);
      });
    }
  });
}
function nT(e, t, a, n) {
  const s = e[0], i = e[e.length - 1], { ISOWeek: r, fixedWeeks: l, broadcastCalendar: d } = a ?? {}, { addDays: u, differenceInCalendarDays: m, differenceInCalendarMonths: h, endOfBroadcastWeek: f, endOfISOWeek: b, endOfMonth: w, endOfWeek: S, isAfter: $, startOfBroadcastWeek: N, startOfISOWeek: y, startOfWeek: v } = n, _ = d ? N(s, n) : r ? y(s) : v(s), k = d ? f(i) : r ? b(w(i)) : S(w(i)), M = t && (d ? f(t) : r ? b(t) : S(t)), T = M && $(k, M) ? M : k, A = m(T, _), F = h(i, s) + 1, L = [];
  for (let j = 0; j <= A; j++) {
    const D = u(_, j);
    L.push(D);
  }
  const q = (d ? 35 : 42) * F;
  if (l && L.length < q) {
    const j = q - L.length;
    for (let D = 0; D < j; D++) {
      const H = u(L[L.length - 1], 1);
      L.push(H);
    }
  }
  return L;
}
function aT(e) {
  const t = [];
  return e.reduce((a, n) => {
    const s = n.weeks.reduce((i, r) => i.concat(r.days.slice()), t.slice());
    return a.concat(s.slice());
  }, t.slice());
}
function oT(e, t, a, n) {
  const { numberOfMonths: s = 1 } = a, i = [];
  for (let r = 0; r < s; r++) {
    const l = n.addMonths(e, r);
    if (t && l > t)
      break;
    i.push(l);
  }
  return i;
}
function Nc(e, t, a, n) {
  const { month: s, defaultMonth: i, today: r = n.today(), numberOfMonths: l = 1 } = e;
  let d = s || i || r;
  const { differenceInCalendarMonths: u, addMonths: m, startOfMonth: h } = n;
  if (a && u(a, d) < l - 1) {
    const f = -1 * (l - 1);
    d = m(a, f);
  }
  return t && u(d, t) < 0 && (d = t), h(d);
}
function sT(e, t, a, n) {
  const { addDays: s, endOfBroadcastWeek: i, endOfISOWeek: r, endOfMonth: l, endOfWeek: d, getISOWeek: u, getWeek: m, startOfBroadcastWeek: h, startOfISOWeek: f, startOfWeek: b } = n, w = e.reduce((S, $) => {
    const N = a.broadcastCalendar ? h($, n) : a.ISOWeek ? f($) : b($), y = a.broadcastCalendar ? i($) : a.ISOWeek ? r(l($)) : d(l($)), v = t.filter((T) => T >= N && T <= y), _ = a.broadcastCalendar ? 35 : 42;
    if (a.fixedWeeks && v.length < _) {
      const T = t.filter((A) => {
        const F = _ - v.length;
        return A > y && A <= s(y, F);
      });
      v.push(...T);
    }
    const k = v.reduce((T, A) => {
      const F = a.ISOWeek ? u(A) : m(A), L = T.find((q) => q.weekNumber === F), O = new iu(A, $, n);
      return L ? L.days.push(O) : T.push(new a$(F, [O])), T;
    }, []), M = new n$($, k);
    return S.push(M), S;
  }, []);
  return a.reverseMonths ? w.reverse() : w;
}
function iT(e, t) {
  let { startMonth: a, endMonth: n } = e;
  const { startOfYear: s, startOfDay: i, startOfMonth: r, endOfMonth: l, addYears: d, endOfYear: u, today: m } = t, h = e.captionLayout === "dropdown" || e.captionLayout === "dropdown-years";
  return a ? a = r(a) : !a && h && (a = s(d(e.today ?? m(), -100))), n ? n = l(n) : !n && h && (n = u(e.today ?? m())), [
    a && i(a),
    n && i(n)
  ];
}
function rT(e, t, a, n) {
  if (a.disableNavigation)
    return;
  const { pagedNavigation: s, numberOfMonths: i = 1 } = a, { startOfMonth: r, addMonths: l, differenceInCalendarMonths: d } = n, u = s ? i : 1, m = r(e);
  if (!t)
    return l(m, u);
  if (!(d(t, e) < i))
    return l(m, u);
}
function lT(e, t, a, n) {
  if (a.disableNavigation)
    return;
  const { pagedNavigation: s, numberOfMonths: i } = a, { startOfMonth: r, addMonths: l, differenceInCalendarMonths: d } = n, u = s ? i ?? 1 : 1, m = r(e);
  if (!t)
    return l(m, -u);
  if (!(d(m, t) <= 0))
    return l(m, -u);
}
function cT(e) {
  const t = [];
  return e.reduce((a, n) => a.concat(n.weeks.slice()), t.slice());
}
function Wi(e, t) {
  const [a, n] = pe(e);
  return [t === void 0 ? a : t, n];
}
function dT(e, t) {
  const [a, n] = iT(e, t), { startOfMonth: s, endOfMonth: i } = t, r = Nc(e, a, n, t), [l, d] = Wi(
    r,
    // initialMonth is always computed from props.month if provided
    e.month ? r : void 0
  );
  xe(() => {
    const _ = Nc(e, a, n, t);
    d(_);
  }, [e.timeZone]);
  const { months: u, weeks: m, days: h, previousMonth: f, nextMonth: b } = Bt(() => {
    const _ = oT(l, n, { numberOfMonths: e.numberOfMonths }, t), k = nT(_, e.endMonth ? i(e.endMonth) : void 0, {
      ISOWeek: e.ISOWeek,
      fixedWeeks: e.fixedWeeks,
      broadcastCalendar: e.broadcastCalendar
    }, t), M = sT(_, k, {
      broadcastCalendar: e.broadcastCalendar,
      fixedWeeks: e.fixedWeeks,
      ISOWeek: e.ISOWeek,
      reverseMonths: e.reverseMonths
    }, t), T = cT(M), A = aT(M), F = lT(l, a, e, t), L = rT(l, n, e, t);
    return {
      months: M,
      weeks: T,
      days: A,
      previousMonth: F,
      nextMonth: L
    };
  }, [
    t,
    l.getTime(),
    n?.getTime(),
    a?.getTime(),
    e.disableNavigation,
    e.broadcastCalendar,
    e.endMonth?.getTime(),
    e.fixedWeeks,
    e.ISOWeek,
    e.numberOfMonths,
    e.pagedNavigation,
    e.reverseMonths
  ]), { disableNavigation: w, onMonthChange: S } = e, $ = (_) => m.some((k) => k.days.some((M) => M.isEqualTo(_))), N = (_) => {
    if (w)
      return;
    let k = s(_);
    a && k < s(a) && (k = s(a)), n && k > s(n) && (k = s(n)), d(k), S?.(k);
  };
  return {
    months: u,
    weeks: m,
    days: h,
    navStart: a,
    navEnd: n,
    previousMonth: f,
    nextMonth: b,
    goToMonth: N,
    goToDay: (_) => {
      $(_) || N(_.date);
    }
  };
}
var ya;
(function(e) {
  e[e.Today = 0] = "Today", e[e.Selected = 1] = "Selected", e[e.LastFocused = 2] = "LastFocused", e[e.FocusedModifier = 3] = "FocusedModifier";
})(ya || (ya = {}));
function Dc(e) {
  return !e[bt.disabled] && !e[bt.hidden] && !e[bt.outside];
}
function uT(e, t, a, n) {
  let s, i = -1;
  for (const r of e) {
    const l = t(r);
    Dc(l) && (l[bt.focused] && i < ya.FocusedModifier ? (s = r, i = ya.FocusedModifier) : n?.isEqualTo(r) && i < ya.LastFocused ? (s = r, i = ya.LastFocused) : a(r.date) && i < ya.Selected ? (s = r, i = ya.Selected) : l[bt.today] && i < ya.Today && (s = r, i = ya.Today));
  }
  return s || (s = e.find((r) => Dc(t(r)))), s;
}
function hT(e, t, a, n, s, i, r) {
  const { ISOWeek: l, broadcastCalendar: d } = i, { addDays: u, addMonths: m, addWeeks: h, addYears: f, endOfBroadcastWeek: b, endOfISOWeek: w, endOfWeek: S, max: $, min: N, startOfBroadcastWeek: y, startOfISOWeek: v, startOfWeek: _ } = r;
  let M = {
    day: u,
    week: h,
    month: m,
    year: f,
    startOfWeek: (T) => d ? y(T, r) : l ? v(T) : _(T),
    endOfWeek: (T) => d ? b(T) : l ? w(T) : S(T)
  }[e](a, t === "after" ? 1 : -1);
  return t === "before" && n ? M = $([n, M]) : t === "after" && s && (M = N([s, M])), M;
}
function ku(e, t, a, n, s, i, r, l = 0) {
  if (l > 365)
    return;
  const d = hT(e, t, a.date, n, s, i, r), u = !!(i.disabled && Fa(d, i.disabled, r)), m = !!(i.hidden && Fa(d, i.hidden, r)), h = d, f = new iu(d, h, r);
  return !u && !m ? f : ku(e, t, f, n, s, i, r, l + 1);
}
function mT(e, t, a, n, s) {
  const { autoFocus: i } = e, [r, l] = pe(), d = uT(t.days, a, n || (() => !1), r), [u, m] = pe(i ? d : void 0);
  return {
    isFocusTarget: (S) => !!d?.isEqualTo(S),
    setFocused: m,
    focused: u,
    blur: () => {
      l(u), m(void 0);
    },
    moveFocus: (S, $) => {
      if (!u)
        return;
      const N = ku(S, $, u, t.navStart, t.navEnd, e, s);
      N && (e.disableNavigation && !t.days.some((v) => v.isEqualTo(N)) || (t.goToDay(N), m(N)));
    }
  };
}
function pT(e, t) {
  const { selected: a, required: n, onSelect: s } = e, [i, r] = Wi(a, s ? a : void 0), l = s ? a : i, { isSameDay: d } = t, u = (b) => l?.some((w) => d(w, b)) ?? !1, { min: m, max: h } = e;
  return {
    selected: l,
    select: (b, w, S) => {
      let $ = [...l ?? []];
      if (u(b)) {
        if (l?.length === m || n && l?.length === 1)
          return;
        $ = l?.filter((N) => !d(N, b));
      } else
        l?.length === h ? $ = [b] : $ = [...$, b];
      return s || r($), s?.($, b, w, S), $;
    },
    isSelected: u
  };
}
function fT(e, t, a = 0, n = 0, s = !1, i = Ma) {
  const { from: r, to: l } = t || {}, { isSameDay: d, isAfter: u, isBefore: m } = i;
  let h;
  if (!r && !l)
    h = { from: e, to: a > 0 ? void 0 : e };
  else if (r && !l)
    d(r, e) ? a === 0 ? h = { from: r, to: e } : s ? h = { from: r, to: void 0 } : h = void 0 : m(e, r) ? h = { from: e, to: r } : h = { from: r, to: e };
  else if (r && l)
    if (d(r, e) && d(l, e))
      s ? h = { from: r, to: l } : h = void 0;
    else if (d(r, e))
      h = { from: r, to: a > 0 ? void 0 : e };
    else if (d(l, e))
      h = { from: e, to: a > 0 ? void 0 : e };
    else if (m(e, r))
      h = { from: e, to: l };
    else if (u(e, r))
      h = { from: r, to: e };
    else if (u(e, l))
      h = { from: r, to: e };
    else
      throw new Error("Invalid range");
  if (h?.from && h?.to) {
    const f = i.differenceInCalendarDays(h.to, h.from);
    n > 0 && f > n ? h = { from: e, to: void 0 } : a > 1 && f < a && (h = { from: e, to: void 0 });
  }
  return h;
}
function gT(e, t, a = Ma) {
  const n = Array.isArray(t) ? t : [t];
  let s = e.from;
  const i = a.differenceInCalendarDays(e.to, e.from), r = Math.min(i, 6);
  for (let l = 0; l <= r; l++) {
    if (n.includes(s.getDay()))
      return !0;
    s = a.addDays(s, 1);
  }
  return !1;
}
function zc(e, t, a = Ma) {
  return qa(e, t.from, !1, a) || qa(e, t.to, !1, a) || qa(t, e.from, !1, a) || qa(t, e.to, !1, a);
}
function bT(e, t, a = Ma) {
  const n = Array.isArray(t) ? t : [t];
  if (n.filter((l) => typeof l != "function").some((l) => typeof l == "boolean" ? l : a.isDate(l) ? qa(e, l, !1, a) : cu(l, a) ? l.some((d) => qa(e, d, !1, a)) : Ei(l) ? l.from && l.to ? zc(e, { from: l.from, to: l.to }, a) : !1 : lu(l) ? gT(e, l.dayOfWeek, a) : al(l) ? a.isAfter(l.before, l.after) ? zc(e, {
    from: a.addDays(l.after, 1),
    to: a.addDays(l.before, -1)
  }, a) : Fa(e.from, l, a) || Fa(e.to, l, a) : ol(l) || sl(l) ? Fa(e.from, l, a) || Fa(e.to, l, a) : !1))
    return !0;
  const r = n.filter((l) => typeof l == "function");
  if (r.length) {
    let l = e.from;
    const d = a.differenceInCalendarDays(e.to, e.from);
    for (let u = 0; u <= d; u++) {
      if (r.some((m) => m(l)))
        return !0;
      l = a.addDays(l, 1);
    }
  }
  return !1;
}
function yT(e, t) {
  const { disabled: a, excludeDisabled: n, resetOnSelect: s, selected: i, required: r, onSelect: l } = e, [d, u] = Wi(i, l ? i : void 0), m = l ? i : d;
  return {
    selected: m,
    select: (b, w, S) => {
      const { min: $, max: N } = e;
      let y;
      if (b) {
        const v = m?.from, _ = m?.to, k = !!v && !!_, M = !!v && !!_ && t.isSameDay(v, _) && t.isSameDay(b, v);
        s && (k || !m?.from) ? !r && M ? y = void 0 : y = { from: b, to: void 0 } : y = fT(b, m, $, N, r, t);
      }
      return n && a && y?.from && y.to && bT({ from: y.from, to: y.to }, a, t) && (y.from = b, y.to = void 0), l || u(y), l?.(y, b, w, S), y;
    },
    isSelected: (b) => m && qa(m, b, !1, t)
  };
}
function vT(e, t) {
  const { selected: a, required: n, onSelect: s } = e, [i, r] = Wi(a, s ? a : void 0), l = s ? a : i, { isSameDay: d } = t;
  return {
    selected: l,
    select: (h, f, b) => {
      let w = h;
      return !n && l && l && d(h, l) && (w = void 0), s || r(w), s?.(w, h, f, b), w;
    },
    isSelected: (h) => l ? d(l, h) : !1
  };
}
function wT(e, t) {
  const a = vT(e, t), n = pT(e, t), s = yT(e, t);
  switch (e.mode) {
    case "single":
      return a;
    case "multiple":
      return n;
    case "range":
      return s;
    default:
      return;
  }
}
function Fn(e, t) {
  return e instanceof Kt && e.timeZone === t ? e : new Kt(e, t);
}
function is(e, t, a) {
  return Fn(e, t);
}
function Pc(e, t, a) {
  return typeof e == "boolean" || typeof e == "function" ? e : e instanceof Date ? is(e, t) : Array.isArray(e) ? e.map((n) => n instanceof Date ? is(n, t) : n) : Ei(e) ? {
    ...e,
    from: e.from ? Fn(e.from, t) : e.from,
    to: e.to ? Fn(e.to, t) : e.to
  } : al(e) ? {
    before: is(e.before, t),
    after: is(e.after, t)
  } : ol(e) ? {
    after: is(e.after, t)
  } : sl(e) ? {
    before: is(e.before, t)
  } : e;
}
function wr(e, t, a) {
  return e && (Array.isArray(e) ? e.map((n) => Pc(n, t)) : Pc(e, t));
}
function Ac(e) {
  let t = e;
  const a = t.timeZone;
  if (a && (t = {
    ...e,
    timeZone: a
  }, t.today && (t.today = Fn(t.today, a)), t.month && (t.month = Fn(t.month, a)), t.defaultMonth && (t.defaultMonth = Fn(t.defaultMonth, a)), t.startMonth && (t.startMonth = Fn(t.startMonth, a)), t.endMonth && (t.endMonth = Fn(t.endMonth, a)), t.mode === "single" && t.selected ? t.selected = Fn(t.selected, a) : t.mode === "multiple" && t.selected ? t.selected = t.selected?.map((be) => Fn(be, a)) : t.mode === "range" && t.selected && (t.selected = {
    from: t.selected.from ? Fn(t.selected.from, a) : t.selected.from,
    to: t.selected.to ? Fn(t.selected.to, a) : t.selected.to
  }), t.disabled !== void 0 && (t.disabled = wr(t.disabled, a)), t.hidden !== void 0 && (t.hidden = wr(t.hidden, a)), t.modifiers)) {
    const be = {};
    Object.keys(t.modifiers).forEach((ye) => {
      be[ye] = wr(t.modifiers?.[ye], a);
    }), t.modifiers = be;
  }
  const { components: n, formatters: s, labels: i, dateLib: r, locale: l, classNames: d } = Bt(() => {
    const be = { ...su, ...t.locale }, ye = t.broadcastCalendar ? 1 : t.weekStartsOn, Me = t.noonSafe && t.timeZone ? J$(t.timeZone, {
      weekStartsOn: ye,
      locale: be
    }) : void 0, rt = t.dateLib && Me ? { ...Me, ...t.dateLib } : t.dateLib ?? Me, Ie = new Nn({
      locale: be,
      weekStartsOn: ye,
      firstWeekContainsDate: t.firstWeekContainsDate,
      useAdditionalWeekYearTokens: t.useAdditionalWeekYearTokens,
      useAdditionalDayOfYearTokens: t.useAdditionalDayOfYearTokens,
      timeZone: t.timeZone,
      numerals: t.numerals
    }, rt);
    return {
      dateLib: Ie,
      components: P$(t.components),
      formatters: H$(t.formatters),
      labels: V$(t.labels, Ie.options),
      locale: be,
      classNames: { ...O$(), ...t.classNames }
    };
  }, [
    t.locale,
    t.broadcastCalendar,
    t.weekStartsOn,
    t.firstWeekContainsDate,
    t.useAdditionalWeekYearTokens,
    t.useAdditionalDayOfYearTokens,
    t.timeZone,
    t.numerals,
    t.dateLib,
    t.noonSafe,
    t.components,
    t.formatters,
    t.labels,
    t.classNames
  ]);
  t.today || (t = { ...t, today: r.today() });
  const { captionLayout: u, mode: m, navLayout: h, numberOfMonths: f = 1, onDayBlur: b, onDayClick: w, onDayFocus: S, onDayKeyDown: $, onDayMouseEnter: N, onDayMouseLeave: y, onNextClick: v, onPrevClick: _, showWeekNumber: k, styles: M } = t, { formatCaption: T, formatDay: A, formatMonthDropdown: F, formatWeekNumber: L, formatWeekNumberHeader: O, formatWeekdayName: q, formatYearDropdown: j } = s, D = dT(t, r), { days: H, months: K, navStart: Y, navEnd: se, previousMonth: te, nextMonth: ne, goToMonth: U } = D, z = D$(H, t, Y, se, r), { isSelected: R, select: X, selected: le } = wT(t, r) ?? {}, { blur: me, focused: ue, isFocusTarget: ze, moveFocus: je, setFocused: Ne } = mT(t, D, z, R ?? (() => !1), r), { labelDayButton: ht, labelGridcell: Tt, labelGrid: it, labelMonthDropdown: Ct, labelNav: Ht, labelPrevious: W, labelNext: G, labelWeekday: ce, labelWeekNumber: Se, labelWeekNumberHeader: ve, labelYearDropdown: on } = i, jt = Bt(() => U$(r, t.ISOWeek, t.broadcastCalendar, t.today), [r, t.ISOWeek, t.broadcastCalendar, t.today]), ra = m !== void 0 || w !== void 0, we = at(() => {
    te && (U(te), _?.(te));
  }, [te, U, _]), ae = at(() => {
    ne && (U(ne), v?.(ne));
  }, [U, ne, v]), Ue = at((be, ye) => (Me) => {
    Me.preventDefault(), Me.stopPropagation(), Ne(be), !ye.disabled && (X?.(be.date, ye, Me), w?.(be.date, ye, Me));
  }, [X, w, Ne]), kt = at((be, ye) => (Me) => {
    Ne(be), S?.(be.date, ye, Me);
  }, [S, Ne]), Ga = at((be, ye) => (Me) => {
    me(), b?.(be.date, ye, Me);
  }, [me, b]), $a = at((be, ye) => (Me) => {
    const rt = {
      ArrowLeft: [
        Me.shiftKey ? "month" : "day",
        t.dir === "rtl" ? "after" : "before"
      ],
      ArrowRight: [
        Me.shiftKey ? "month" : "day",
        t.dir === "rtl" ? "before" : "after"
      ],
      ArrowDown: [Me.shiftKey ? "year" : "week", "after"],
      ArrowUp: [Me.shiftKey ? "year" : "week", "before"],
      PageUp: [Me.shiftKey ? "year" : "month", "before"],
      PageDown: [Me.shiftKey ? "year" : "month", "after"],
      Home: ["startOfWeek", "before"],
      End: ["endOfWeek", "after"]
    };
    if (rt[Me.key]) {
      Me.preventDefault(), Me.stopPropagation();
      const [Ie, An] = rt[Me.key];
      je(Ie, An);
    }
    $?.(be.date, ye, Me);
  }, [je, $, t.dir]), Pn = at((be, ye) => (Me) => {
    N?.(be.date, ye, Me);
  }, [N]), Ta = at((be, ye) => (Me) => {
    y?.(be.date, ye, Me);
  }, [y]), Xt = at((be, ye) => (Me) => {
    const rt = Number(Me.target.value), Ie = r.setMonth(r.startOfMonth(be), rt);
    U(r.addMonths(Ie, -ye));
  }, [r, U]), sn = at((be, ye) => (Me) => {
    const rt = Number(Me.target.value), Ie = r.setYear(r.startOfMonth(be), rt);
    U(r.addMonths(Ie, -ye));
  }, [r, U]), { className: Yt, style: vn } = Bt(() => ({
    className: [d[re.Root], t.className].filter(Boolean).join(" "),
    style: { ...M?.[re.Root], ...t.style }
  }), [d, t.className, t.style, M]), Ms = A$(t), mo = (be) => {
    const ye = M?.[re.Dropdown], Me = M?.[be];
    if (!(!ye && !Me))
      return {
        ...ye,
        ...Me
      };
  }, Ca = ee(null);
  tT(Ca, !!t.animate, {
    classNames: d,
    months: K,
    focused: ue,
    dateLib: r
  });
  const Na = {
    dayPickerProps: t,
    selected: le,
    select: X,
    isSelected: R,
    months: K,
    nextMonth: ne,
    previousMonth: te,
    goToMonth: U,
    getModifiers: z,
    components: n,
    classNames: d,
    styles: M,
    labels: i,
    formatters: s
  };
  return de.createElement(
    ru.Provider,
    { value: Na },
    de.createElement(
      n.Root,
      { rootRef: t.animate ? Ca : void 0, className: Yt, style: vn, dir: t.dir, id: t.id, lang: t.lang ?? l.code, nonce: t.nonce, title: t.title, role: t.role, "aria-label": t["aria-label"], "aria-labelledby": t["aria-labelledby"], ...Ms },
      de.createElement(
        n.Months,
        { className: d[re.Months], style: M?.[re.Months] },
        !t.hideNavigation && !h && de.createElement(n.Nav, { "data-animated-nav": t.animate ? "true" : void 0, className: d[re.Nav], style: M?.[re.Nav], "aria-label": Ht(), onPreviousClick: we, onNextClick: ae, previousMonth: te, nextMonth: ne }),
        K.map((be, ye) => {
          const Me = t.reverseMonths ? K.length - 1 - ye : ye;
          return de.createElement(
            n.Month,
            {
              "data-animated-month": t.animate ? "true" : void 0,
              className: d[re.Month],
              style: M?.[re.Month],
              // biome-ignore lint/suspicious/noArrayIndexKey: breaks animation
              key: ye,
              displayIndex: ye,
              calendarMonth: be
            },
            h === "around" && !t.hideNavigation && ye === 0 && de.createElement(
              n.PreviousMonthButton,
              { type: "button", className: d[re.PreviousMonthButton], style: M?.[re.PreviousMonthButton], tabIndex: te ? void 0 : -1, "aria-disabled": te ? void 0 : !0, "aria-label": W(te), onClick: we, "data-animated-button": t.animate ? "true" : void 0 },
              de.createElement(n.Chevron, { disabled: te ? void 0 : !0, className: d[re.Chevron], style: M?.[re.Chevron], orientation: t.dir === "rtl" ? "right" : "left" })
            ),
            de.createElement(n.MonthCaption, { "data-animated-caption": t.animate ? "true" : void 0, className: d[re.MonthCaption], style: M?.[re.MonthCaption], calendarMonth: be, displayIndex: ye }, u?.startsWith("dropdown") ? de.createElement(
              n.DropdownNav,
              { className: d[re.Dropdowns], style: M?.[re.Dropdowns] },
              (() => {
                const rt = u === "dropdown" || u === "dropdown-months" ? de.createElement(n.MonthsDropdown, { key: "month", className: d[re.MonthsDropdown], "aria-label": Ct(), disabled: !!t.disableNavigation, onChange: Xt(be.date, Me), options: G$(be.date, Y, se, s, r), style: mo(re.MonthsDropdown), value: r.getMonth(be.date) }) : de.createElement("span", { key: "month" }, F(be.date, r)), Ie = u === "dropdown" || u === "dropdown-years" ? de.createElement(n.YearsDropdown, { key: "year", className: d[re.YearsDropdown], "aria-label": on(r.options), disabled: !!t.disableNavigation, onChange: sn(be.date, Me), options: X$(Y, se, s, r, !!t.reverseYears), style: mo(re.YearsDropdown), value: r.getYear(be.date) }) : de.createElement("span", { key: "year" }, j(be.date, r));
                return r.getMonthYearOrder() === "year-first" ? [Ie, rt] : [rt, Ie];
              })(),
              de.createElement("span", { role: "status", "aria-live": "polite", style: {
                border: 0,
                clip: "rect(0 0 0 0)",
                height: "1px",
                margin: "-1px",
                overflow: "hidden",
                padding: 0,
                position: "absolute",
                width: "1px",
                whiteSpace: "nowrap",
                wordWrap: "normal"
              } }, T(be.date, r.options, r))
            ) : de.createElement(n.CaptionLabel, { className: d[re.CaptionLabel], style: M?.[re.CaptionLabel], role: "status", "aria-live": "polite" }, T(be.date, r.options, r))),
            h === "around" && !t.hideNavigation && ye === f - 1 && de.createElement(
              n.NextMonthButton,
              { type: "button", className: d[re.NextMonthButton], style: M?.[re.NextMonthButton], tabIndex: ne ? void 0 : -1, "aria-disabled": ne ? void 0 : !0, "aria-label": G(ne), onClick: ae, "data-animated-button": t.animate ? "true" : void 0 },
              de.createElement(n.Chevron, { disabled: ne ? void 0 : !0, className: d[re.Chevron], style: M?.[re.Chevron], orientation: t.dir === "rtl" ? "left" : "right" })
            ),
            ye === f - 1 && h === "after" && !t.hideNavigation && de.createElement(n.Nav, { "data-animated-nav": t.animate ? "true" : void 0, className: d[re.Nav], style: M?.[re.Nav], "aria-label": Ht(), onPreviousClick: we, onNextClick: ae, previousMonth: te, nextMonth: ne }),
            de.createElement(
              n.MonthGrid,
              { role: "grid", "aria-multiselectable": m === "multiple" || m === "range", "aria-label": it(be.date, r.options, r) || void 0, className: d[re.MonthGrid], style: M?.[re.MonthGrid] },
              !t.hideWeekdays && de.createElement(
                n.Weekdays,
                { "data-animated-weekdays": t.animate ? "true" : void 0, className: d[re.Weekdays], style: M?.[re.Weekdays] },
                k && de.createElement(n.WeekNumberHeader, { "aria-label": ve(r.options), className: d[re.WeekNumberHeader], style: M?.[re.WeekNumberHeader], scope: "col" }, O()),
                jt.map((rt) => de.createElement(n.Weekday, { "aria-label": ce(rt, r.options, r), className: d[re.Weekday], key: String(rt), style: M?.[re.Weekday], scope: "col" }, q(rt, r.options, r)))
              ),
              de.createElement(n.Weeks, { "data-animated-weeks": t.animate ? "true" : void 0, className: d[re.Weeks], style: M?.[re.Weeks] }, be.weeks.map((rt) => de.createElement(
                n.Week,
                { className: d[re.Week], key: rt.weekNumber, style: M?.[re.Week], week: rt },
                k && de.createElement(n.WeekNumber, { week: rt, style: M?.[re.WeekNumber], "aria-label": Se(rt.weekNumber, {
                  locale: l
                }), className: d[re.WeekNumber], scope: "row", role: "rowheader" }, L(rt.weekNumber, r)),
                rt.days.map((Ie) => {
                  const { date: An } = Ie, We = z(Ie);
                  if (We[bt.focused] = !We.hidden && !!ue?.isEqualTo(Ie), We[oa.selected] = R?.(An) || We.selected, Ei(le)) {
                    const { from: _t, to: rn } = le;
                    We[oa.range_start] = !!(_t && rn && r.isSameDay(An, _t)), We[oa.range_end] = !!(_t && rn && r.isSameDay(An, rn)), We[oa.range_middle] = qa(le, An, !0, r);
                  }
                  const Vi = K$(We, M, t.modifiersStyles), Gi = z$(We, d, t.modifiersClassNames), Da = !ra && !We.hidden ? Tt(An, We, r.options, r) : void 0;
                  return de.createElement(n.Day, { key: `${Ie.isoDate}_${Ie.displayMonthId}`, day: Ie, modifiers: We, className: Gi.join(" "), style: Vi, role: "gridcell", "aria-selected": We.selected || void 0, "aria-label": Da, "data-day": Ie.isoDate, "data-month": Ie.outside ? Ie.dateMonthId : void 0, "data-selected": We.selected || void 0, "data-disabled": We.disabled || void 0, "data-hidden": We.hidden || void 0, "data-outside": Ie.outside || void 0, "data-focused": We.focused || void 0, "data-today": We.today || void 0 }, !We.hidden && ra ? de.createElement(n.DayButton, { className: d[re.DayButton], style: M?.[re.DayButton], type: "button", day: Ie, modifiers: We, disabled: !We.focused && We.disabled || void 0, "aria-disabled": We.focused && We.disabled || void 0, tabIndex: ze(Ie) ? 0 : -1, "aria-label": ht(An, We, r.options, r), onClick: Ue(Ie, We), onBlur: Ga(Ie, We), onFocus: kt(Ie, We), onKeyDown: $a(Ie, We), onMouseEnter: Pn(Ie, We), onMouseLeave: Ta(Ie, We) }, A(An, r.options, r)) : !We.hidden && A(Ie.date, r.options, r));
                })
              )))
            )
          );
        })
      ),
      t.footer && de.createElement(n.Footer, { className: d[re.Footer], style: M?.[re.Footer], role: "status", "aria-live": "polite" }, t.footer)
    )
  );
}
const kT = "_calendar_6ha68_6", _T = "_calendarCard_6ha68_14", xT = "_calendarDisabled_6ha68_21", ST = "_calendarRoot_6ha68_25", MT = "_months_6ha68_29", $T = "_nav_6ha68_36", TT = "_navButton_6ha68_45", CT = "_chevron_6ha68_79", NT = "_caption_6ha68_86", DT = "_captionLabel_6ha68_94", zT = "_monthGrid_6ha68_99", PT = "_month_6ha68_29", AT = "_weekdays_6ha68_106", OT = "_weeks_6ha68_107", ET = "_week_6ha68_106", WT = "_dayFocused_6ha68_109", IT = "_dayDisabled_6ha68_113", RT = "_weekday_6ha68_106", LT = "_day_6ha68_109", qT = "_dayButton_6ha68_129", FT = "_dayToday_6ha68_163", BT = "_dayOutside_6ha68_168", HT = "_dayHidden_6ha68_172", jT = "_daySelected_6ha68_176", YT = "_rangeMiddle_6ha68_188", VT = "_rangeStart_6ha68_200", GT = "_rangeEnd_6ha68_201", KT = "_root_6ha68_222", UT = "_fullWidth_6ha68_228", XT = "_trigger_6ha68_233", JT = "_glass_6ha68_279", QT = "_icon_6ha68_288", ZT = "_value_6ha68_293", eC = "_sm_6ha68_308", tC = "_md_6ha68_312", nC = "_lg_6ha68_316", aC = "_panel_6ha68_332", Ae = {
  calendar: kT,
  calendarCard: _T,
  calendarDisabled: xT,
  calendarRoot: ST,
  months: MT,
  nav: $T,
  navButton: TT,
  chevron: CT,
  caption: NT,
  captionLabel: DT,
  monthGrid: zT,
  month: PT,
  weekdays: AT,
  weeks: OT,
  week: ET,
  dayFocused: WT,
  dayDisabled: IT,
  weekday: RT,
  day: LT,
  dayButton: qT,
  dayToday: FT,
  dayOutside: BT,
  dayHidden: HT,
  daySelected: jT,
  rangeMiddle: YT,
  rangeStart: VT,
  rangeEnd: GT,
  root: KT,
  fullWidth: UT,
  trigger: XT,
  glass: JT,
  icon: QT,
  value: ZT,
  sm: eC,
  md: tC,
  lg: nC,
  panel: aC
}, oC = {
  en: Oo,
  es: HS,
  fr: v2,
  de: hS,
  ja: U2,
  pt: MM,
  zh: t$,
  ar: Ix
}, sC = {
  root: Ae.calendarRoot,
  months: Ae.months,
  month: Ae.month,
  nav: Ae.nav,
  button_previous: Ae.navButton,
  button_next: Ae.navButton,
  chevron: Ae.chevron,
  month_caption: Ae.caption,
  caption_label: Ae.captionLabel,
  month_grid: Ae.monthGrid,
  weekdays: Ae.weekdays,
  weekday: Ae.weekday,
  weeks: Ae.weeks,
  week: Ae.week,
  day: Ae.day,
  day_button: Ae.dayButton,
  selected: Ae.daySelected,
  range_start: Ae.rangeStart,
  range_middle: Ae.rangeMiddle,
  range_end: Ae.rangeEnd,
  today: Ae.dayToday,
  outside: Ae.dayOutside,
  disabled: Ae.dayDisabled,
  hidden: Ae.dayHidden,
  focused: Ae.dayFocused
};
function iC({
  mode: e = "single",
  value: t,
  defaultValue: a,
  onValueChange: n,
  rangeValue: s,
  defaultRangeValue: i,
  onRangeChange: r,
  min: l,
  max: d,
  disabledDates: u,
  disabled: m = !1,
  dateFnsLocale: h,
  skeleton: f = !1,
  bare: b = !1,
  className: w,
  "aria-label": S,
  ...$
}) {
  const N = Xr(), [y, v] = He(t, a), [_, k] = He(s, i ?? {});
  if (f)
    return /* @__PURE__ */ c(
      J,
      {
        width: "calc(var(--glacier-space-8) * 7 + var(--glacier-space-4) * 2)",
        height: "calc(var(--glacier-space-8) * 8 + var(--glacier-space-4) * 2)",
        radius: "var(--glacier-radius-lg)",
        className: w
      }
    );
  const M = [];
  m && M.push(!0), l && M.push({ before: l }), d && M.push({ after: d }), u && M.push(u);
  const T = {
    classNames: sC,
    locale: h ?? oC[N],
    disabled: M.length > 0 ? M : void 0,
    disableNavigation: m || void 0,
    startMonth: l,
    endMonth: d,
    "aria-label": S
  };
  return /* @__PURE__ */ c(
    "div",
    {
      ...$,
      className: I(Ae.calendar, !b && Ae.calendarCard, m && Ae.calendarDisabled, w),
      children: e === "range" ? /* @__PURE__ */ c(
        Ac,
        {
          mode: "range",
          selected: _.from || _.to ? _ : void 0,
          defaultMonth: _.from,
          onSelect: (A) => {
            const F = A ?? {};
            k(F), r?.(F);
          },
          ...T
        }
      ) : /* @__PURE__ */ c(
        Ac,
        {
          mode: "single",
          selected: y,
          defaultMonth: y,
          onSelect: (A) => {
            v(A), n?.(A);
          },
          ...T
        }
      )
    }
  );
}
const _u = (...e) => e.filter((t, a, n) => !!t && t.trim() !== "" && n.indexOf(t) === a).join(" ").trim();
const rC = (e) => e.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
const lC = (e) => e.replace(
  /^([A-Z])|[\s-_]+(\w)/g,
  (t, a, n) => n ? n.toUpperCase() : a.toLowerCase()
);
const Oc = (e) => {
  const t = lC(e);
  return t.charAt(0).toUpperCase() + t.slice(1);
};
var kr = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round"
};
const cC = (e) => {
  for (const t in e)
    if (t.startsWith("aria-") || t === "role" || t === "title")
      return !0;
  return !1;
}, dC = _a({}), uC = () => Gn(dC), hC = Ed(
  ({ color: e, size: t, strokeWidth: a, absoluteStrokeWidth: n, className: s = "", children: i, iconNode: r, ...l }, d) => {
    const {
      size: u = 24,
      strokeWidth: m = 2,
      absoluteStrokeWidth: h = !1,
      color: f = "currentColor",
      className: b = ""
    } = uC() ?? {}, w = n ?? h ? Number(a ?? m) * 24 / Number(t ?? u) : a ?? m;
    return Ar(
      "svg",
      {
        ref: d,
        ...kr,
        width: t ?? u ?? kr.width,
        height: t ?? u ?? kr.height,
        stroke: e ?? f,
        strokeWidth: w,
        className: _u("lucide", b, s),
        ...!i && !cC(l) && { "aria-hidden": "true" },
        ...l
      },
      [
        ...r.map(([S, $]) => Ar(S, $)),
        ...Array.isArray(i) ? i : [i]
      ]
    );
  }
);
const Ii = (e, t) => {
  const a = Ed(
    ({ className: n, ...s }, i) => Ar(hC, {
      ref: i,
      iconNode: t,
      className: _u(
        `lucide-${rC(Oc(e))}`,
        `lucide-${e}`,
        n
      ),
      ...s
    })
  );
  return a.displayName = Oc(e), a;
};
const mC = [
  ["path", { d: "M8 2v4", key: "1cmpym" }],
  ["path", { d: "M16 2v4", key: "4m81vk" }],
  ["rect", { width: "18", height: "18", x: "3", y: "4", rx: "2", key: "1hopcy" }],
  ["path", { d: "M3 10h18", key: "8toen8" }],
  ["path", { d: "M8 14h.01", key: "6423bh" }],
  ["path", { d: "M12 14h.01", key: "1etili" }],
  ["path", { d: "M16 14h.01", key: "1gbofw" }],
  ["path", { d: "M8 18h.01", key: "lrp35t" }],
  ["path", { d: "M12 18h.01", key: "mhygvu" }],
  ["path", { d: "M16 18h.01", key: "kzsmim" }]
], pC = Ii("calendar-days", mC);
const fC = [
  [
    "path",
    {
      d: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
      key: "1oefj6"
    }
  ],
  ["path", { d: "M14 2v5a1 1 0 0 0 1 1h5", key: "wfsgrz" }],
  ["path", { d: "M10 9H8", key: "b1mrlr" }],
  ["path", { d: "M16 13H8", key: "t4e002" }],
  ["path", { d: "M16 17H8", key: "z1uh3a" }]
], gC = Ii("file-text", fC);
const bC = [
  ["path", { d: "M12 3v12", key: "1x0j5s" }],
  ["path", { d: "m17 8-5-5-5 5", key: "7q97r8" }],
  ["path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4", key: "ih7n3h" }]
], yC = Ii("upload", bC);
const vC = [
  ["path", { d: "M18 6 6 18", key: "1bl5f8" }],
  ["path", { d: "m6 6 12 12", key: "d8bk6v" }]
], wC = Ii("x", vC), kC = ["inline-start", "inline-end", "bottom", "right", "left", "top"];
function _C(e) {
  for (const t of kC) {
    if (e === t) return { side: t, align: "center" };
    if (e.startsWith(`${t}-`)) return { side: t, align: e.slice(t.length + 1) };
  }
  return { side: "bottom", align: "start" };
}
function xC(e, t, a) {
  const { offset: n, padding: s } = a, i = a.direction === "rtl", r = window.innerWidth, l = window.innerHeight, { side: d, align: u } = _C(a.placement);
  let m = d === "inline-start" ? i ? "right" : "left" : d === "inline-end" ? i ? "left" : "right" : d;
  m === "bottom" && e.bottom + n + t.height > l - s ? e.top - n - t.height > s && (m = "top") : m === "top" && e.top - n - t.height < s ? e.bottom + n + t.height < l - s && (m = "bottom") : m === "right" && e.right + n + t.width > r - s ? e.left - n - t.width > s && (m = "left") : m === "left" && e.left - n - t.width < s && e.right + n + t.width < r - s && (m = "right");
  let h = 0, f = 0;
  const b = m === "top" || m === "bottom";
  m === "bottom" ? h = e.bottom + n : m === "top" ? h = e.top - n - t.height : m === "right" ? f = e.right + n : f = e.left - n - t.width, b ? (u === "center" ? f = e.left + e.width / 2 - t.width / 2 : u === "start" !== i ? f = e.left : f = e.right - t.width, f = Math.max(s, Math.min(f, r - t.width - s))) : (u === "start" ? h = e.top : u === "end" ? h = e.bottom - t.height : h = e.top + e.height / 2 - t.height / 2, h = Math.max(s, Math.min(h, l - t.height - s)));
  const w = m === "bottom" ? "top" : m === "top" ? "bottom" : m === "right" ? "left" : "right";
  return {
    // reports the RESOLVED physical side (post logical resolution and flip),
    // so arrows and data-placement can point at real screen geometry
    placement: u === "center" ? m : `${m}-${u}`,
    style: {
      position: "fixed",
      top: Math.round(h),
      left: Math.round(f),
      transformOrigin: w,
      zIndex: 200
    }
  };
}
function Va(e, t, a, n = {}) {
  const [s, i] = pe(null), r = n.placement ?? "bottom-start", l = n.offset ?? 8, d = n.padding ?? 8, u = n.matchWidth ?? !1, m = ee(null);
  return ys(() => {
    if (!e) {
      i(null), m.current = null;
      return;
    }
    m.current = null;
    const h = () => {
      const b = t.current, w = b?.getBoundingClientRect(), S = a.current;
      if (!w || !S) return;
      const $ = { width: S.offsetWidth, height: S.offsetHeight }, N = bn(b instanceof Element ? b : S), y = xC(w, $, { placement: r, offset: l, padding: d, direction: N });
      S.style.position = "fixed", S.style.top = `${y.style.top}px`, S.style.left = `${y.style.left}px`, S.style.zIndex = "200", S.style.transformOrigin = String(y.style.transformOrigin), u && (S.style.minWidth = `${Math.round(w.width)}px`), y.placement !== m.current && (m.current = y.placement, i({
        placement: y.placement,
        style: { position: "fixed", zIndex: 200, transformOrigin: y.style.transformOrigin }
      }));
    };
    h(), window.addEventListener("resize", h), window.addEventListener("scroll", h, !0);
    const f = typeof ResizeObserver < "u" && a.current ? new ResizeObserver(h) : null;
    return f && a.current && f.observe(a.current), () => {
      window.removeEventListener("resize", h), window.removeEventListener("scroll", h, !0), f?.disconnect();
    };
  }, [e, r, l, d, u, n.key]), s;
}
const Ec = {
  placeholder: {
    en: "Pick a date",
    es: "Elige una fecha",
    fr: "Choisir une date",
    de: "Datum wählen",
    ja: "日付を選択",
    pt: "Escolher uma data",
    zh: "选择日期",
    ar: "اختر تاريخًا"
  },
  calendar: {
    en: "Calendar",
    es: "Calendario",
    fr: "Calendrier",
    de: "Kalender",
    ja: "カレンダー",
    pt: "Calendário",
    zh: "日历",
    ar: "التقويم"
  }
};
function c6({
  value: e,
  defaultValue: t,
  onValueChange: a,
  placeholder: n,
  size: s = "md",
  fullWidth: i = !1,
  disabled: r = !1,
  skeleton: l = !1,
  glass: d = !1,
  min: u,
  max: m,
  disabledDates: h,
  dateFnsLocale: f,
  name: b,
  id: w,
  className: S,
  "aria-label": $,
  ...N
}) {
  const y = st(), v = Xr(), _ = Ee(), k = Sa(), M = Re(), T = ee(null), A = ee(null), F = ee(null), [L, O] = He(e, t), [q, j] = pe(!1), D = ia(A), H = Va(q, A, F, { placement: "bottom-start" }), K = Bt(() => new Intl.DateTimeFormat(v, { dateStyle: "medium" }), [v]);
  function Y(U) {
    j(!1), A.current?.focus();
  }
  function se(U) {
    O(U), a?.(U), U && Y();
  }
  function te(U) {
    U.key === "Escape" && (U.preventDefault(), U.stopPropagation(), Y());
  }
  if (xe(() => {
    if (!q) return;
    F.current?.querySelector('[tabindex="0"]')?.focus();
    const U = (z) => {
      const R = z.target;
      !T.current?.contains(R) && !F.current?.contains(R) && j(!1);
    };
    return document.addEventListener("pointerdown", U), () => document.removeEventListener("pointerdown", U);
  }, [q]), l)
    return /* @__PURE__ */ c(
      J,
      {
        width: i ? "100%" : "11rem",
        height: `var(--glacier-control-height-${s})`,
        radius: "var(--glacier-radius-lg)",
        className: S
      }
    );
  const ne = H?.style ?? { position: "fixed", visibility: "hidden" };
  return /* @__PURE__ */ P("div", { ...N, ref: T, className: I(Ae.root, Ae[s], i && Ae.fullWidth, S), children: [
    /* @__PURE__ */ P(
      "button",
      {
        ref: A,
        type: "button",
        id: w ?? k?.id,
        className: I(Ae.trigger, Ae[s], d && Ae.glass),
        disabled: r,
        "aria-haspopup": "dialog",
        "aria-expanded": q,
        "aria-controls": q ? _ : void 0,
        "aria-describedby": k?.describedBy,
        "aria-invalid": k?.invalid || void 0,
        "aria-label": $,
        "data-placeholder": L ? void 0 : !0,
        onClick: () => q ? Y() : j(!0),
        children: [
          /* @__PURE__ */ c(pC, { className: Ae.icon, size: 16, "aria-hidden": "true" }),
          /* @__PURE__ */ c("span", { className: Ae.value, children: L ? K.format(L) : n ?? y(Ec.placeholder) })
        ]
      }
    ),
    b && /* @__PURE__ */ c("input", { type: "hidden", name: b, value: L ? us(L, "yyyy-MM-dd") : "" }),
    q && yn(
      /* @__PURE__ */ c(
        $e.div,
        {
          ref: F,
          id: _,
          role: "dialog",
          dir: D,
          "aria-label": $ ?? y(Ec.calendar),
          className: Ae.panel,
          style: ne,
          onKeyDown: te,
          initial: M ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 },
          animate: { opacity: 1, scale: 1, y: 0 },
          transition: M ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
          children: /* @__PURE__ */ c(
            iC,
            {
              bare: !0,
              mode: "single",
              value: L,
              onValueChange: se,
              min: u,
              max: m,
              disabledDates: h,
              dateFnsLocale: f,
              "aria-label": $
            }
          )
        }
      ),
      document.body
    )
  ] });
}
const SC = "_root_a2ru2_1", MC = "_zone_a2ru2_9", $C = "_disabled_a2ru2_34", TC = "_input_a2ru2_38", CC = "_invalid_a2ru2_48", NC = "_glass_a2ru2_58", DC = "_icon_a2ru2_83", zC = "_zoneLabel_a2ru2_99", PC = "_hint_a2ru2_104", AC = "_count_a2ru2_110", OC = "_fileList_a2ru2_116", EC = "_fileRow_a2ru2_125", WC = "_fileIcon_a2ru2_138", IC = "_fileName_a2ru2_145", RC = "_fileNameHead_a2ru2_151", LC = "_fileNameTail_a2ru2_158", qC = "_fileSize_a2ru2_163", qt = {
  root: SC,
  zone: MC,
  disabled: $C,
  input: TC,
  invalid: CC,
  glass: NC,
  icon: DC,
  zoneLabel: zC,
  hint: PC,
  count: AC,
  fileList: OC,
  fileRow: EC,
  fileIcon: WC,
  fileName: IC,
  fileNameHead: RC,
  fileNameTail: LC,
  fileSize: qC
}, Ws = {
  label: {
    en: "Choose files or drag and drop",
    es: "Elige archivos o arrástralos aquí",
    fr: "Choisissez des fichiers ou glissez-déposez",
    de: "Dateien auswählen oder hierher ziehen",
    ja: "ファイルを選択するかドラッグ＆ドロップ",
    pt: "Escolha arquivos ou arraste e solte",
    zh: "选择文件或拖放到此处",
    ar: "اختر ملفات أو اسحبها وأفلتها هنا"
  },
  hint: {
    en: "Files stay on your device until the form is sent",
    es: "Los archivos permanecen en tu dispositivo hasta enviar el formulario",
    fr: "Les fichiers restent sur votre appareil jusqu'à l'envoi du formulaire",
    de: "Dateien bleiben auf dem Gerät, bis das Formular gesendet wird",
    ja: "ファイルはフォームを送信するまでデバイスに残ります",
    pt: "Os arquivos ficam no seu dispositivo até o envio do formulário",
    zh: "文件会保留在您的设备上，直到提交表单",
    ar: "تبقى الملفات على جهازك حتى إرسال النموذج"
  },
  removeFile: {
    en: "Remove {name}",
    es: "Quitar {name}",
    fr: "Retirer {name}",
    de: "{name} entfernen",
    ja: "{name} を削除",
    pt: "Remover {name}",
    zh: "移除 {name}",
    ar: "إزالة {name}"
  },
  countSummary: {
    en: "{count} of {max} files",
    es: "{count} de {max} archivos",
    fr: "{count} fichiers sur {max}",
    de: "{count} von {max} Dateien",
    ja: "{count}/{max} 件のファイル",
    pt: "{count} de {max} arquivos",
    zh: "已选 {count}/{max} 个文件",
    ar: "{count} من {max} ملفات"
  },
  fileList: {
    en: "Selected files",
    es: "Archivos seleccionados",
    fr: "Fichiers sélectionnés",
    de: "Ausgewählte Dateien",
    ja: "選択されたファイル",
    pt: "Arquivos selecionados",
    zh: "已选择的文件",
    ar: "الملفات المحددة"
  }
};
function FC(e, t) {
  if (!t) return !0;
  const a = e.name.toLowerCase(), n = e.type.toLowerCase();
  return t.split(",").map((s) => s.trim().toLowerCase()).filter((s) => s.length > 0).some((s) => s.startsWith(".") ? a.endsWith(s) : s.endsWith("/*") ? n.startsWith(s.slice(0, -1)) : n === s);
}
const Wc = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"];
function BC(e, t) {
  let a = e, n = 0;
  for (; a >= 1e3 && n < Wc.length - 1; )
    a /= 1e3, n += 1;
  return new Intl.NumberFormat(t, {
    style: "unit",
    unit: Wc[n],
    unitDisplay: "short",
    maximumFractionDigits: n === 0 || a >= 10 ? 0 : 1
  }).format(a);
}
const _r = 8;
function HC(e) {
  return e.length <= _r * 2 ? [e, ""] : [e.slice(0, e.length - _r), e.slice(-_r)];
}
function d6({
  accept: e,
  maxSize: t,
  maxFiles: a,
  multiple: n = !1,
  disabled: s = !1,
  name: i,
  value: r,
  defaultValue: l,
  onFilesChange: d,
  onReject: u,
  label: m,
  hint: h,
  skeleton: f = !1,
  glass: b = !1,
  id: w,
  className: S,
  "aria-label": $,
  ...N
}) {
  const y = st(), v = Xr(), _ = Sa(), k = ee(null), M = ee(0), [T, A] = He(r, l ?? []), [F, L] = pe(!1), O = _?.invalid ?? !1;
  function q(z) {
    const R = k.current;
    if (R)
      try {
        const X = new DataTransfer();
        for (const le of z) X.items.add(le);
        R.files = X.files;
      } catch {
        R.value = "";
      }
  }
  function j(z) {
    A(z), d?.(z), q(z);
  }
  function D(z) {
    const R = [], X = [], le = n ? a === void 0 ? Number.POSITIVE_INFINITY : Math.max(a - T.length, 0) : 1;
    for (const me of z)
      FC(me, e) ? t !== void 0 && me.size > t ? R.push({ file: me, reason: "size" }) : X.length >= le ? R.push({ file: me, reason: "count" }) : X.push(me) : R.push({ file: me, reason: "type" });
    X.length > 0 ? j(n ? [...T, ...X] : X) : q(T), R.length > 0 && u?.(R);
  }
  function H(z) {
    j(T.filter((R, X) => X !== z));
  }
  function K(z) {
    const R = Array.from(z.currentTarget.files ?? []);
    R.length > 0 && D(R);
  }
  function Y(z) {
    return Array.from(z.dataTransfer?.types ?? []).includes("Files");
  }
  function se(z) {
    z.preventDefault(), !s && (M.current += 1, Y(z) && L(!0));
  }
  function te(z) {
    z.preventDefault();
  }
  function ne() {
    M.current = Math.max(M.current - 1, 0), M.current === 0 && L(!1);
  }
  function U(z) {
    if (z.preventDefault(), M.current = 0, L(!1), s) return;
    const R = Array.from(z.dataTransfer?.files ?? []);
    R.length > 0 && D(R);
  }
  return f ? /* @__PURE__ */ c(
    J,
    {
      width: "100%",
      height: "calc(var(--glacier-space-10) * 3)",
      radius: "var(--glacier-radius-lg)",
      className: S
    }
  ) : /* @__PURE__ */ P("div", { ...N, className: I(qt.root, S), children: [
    /* @__PURE__ */ P(
      "label",
      {
        className: I(
          qt.zone,
          b && qt.glass,
          O && qt.invalid,
          s && qt.disabled
        ),
        "data-dragging": F || void 0,
        onDragEnter: se,
        onDragOver: te,
        onDragLeave: ne,
        onDrop: U,
        children: [
          /* @__PURE__ */ c(
            "input",
            {
              ref: k,
              type: "file",
              className: qt.input,
              id: w ?? _?.id,
              name: i,
              accept: e,
              multiple: n,
              disabled: s,
              "aria-describedby": _?.describedBy,
              "aria-invalid": O || void 0,
              "aria-label": $,
              onChange: K
            }
          ),
          /* @__PURE__ */ c("span", { className: qt.icon, "aria-hidden": "true", children: /* @__PURE__ */ c(yC, { size: 20 }) }),
          /* @__PURE__ */ c("span", { className: qt.zoneLabel, children: m ?? y(Ws.label) }),
          /* @__PURE__ */ c("span", { className: qt.hint, children: h ?? y(Ws.hint) }),
          a !== void 0 && /* @__PURE__ */ c("span", { className: qt.count, children: y(Ws.countSummary, { count: T.length, max: a }) })
        ]
      }
    ),
    T.length > 0 && /* @__PURE__ */ c("ul", { className: qt.fileList, "aria-label": y(Ws.fileList), children: T.map((z, R) => {
      const [X, le] = HC(z.name);
      return /* @__PURE__ */ P("li", { className: qt.fileRow, children: [
        /* @__PURE__ */ c("span", { className: qt.fileIcon, "aria-hidden": "true", children: /* @__PURE__ */ c(gC, { size: 16 }) }),
        /* @__PURE__ */ P("span", { className: qt.fileName, title: z.name, children: [
          /* @__PURE__ */ c("span", { className: qt.fileNameHead, children: X }),
          le.length > 0 && /* @__PURE__ */ c("span", { className: qt.fileNameTail, children: le })
        ] }),
        /* @__PURE__ */ c("span", { className: qt.fileSize, children: BC(z.size, v) }),
        /* @__PURE__ */ c(
          Yn,
          {
            size: "sm",
            disabled: s,
            "aria-label": y(Ws.removeFile, { name: z.name }),
            onClick: () => H(R),
            children: /* @__PURE__ */ c(wC, { size: 14 })
          }
        )
      ] }, `${z.name}-${R}`);
    }) })
  ] });
}
const jC = "_menu_18pz4_1", YC = "_item_18pz4_24", VC = "_icon_18pz4_62", GC = "_label_18pz4_76", KC = "_shortcut_18pz4_84", UC = "_contextTarget_18pz4_94", XC = "_chevron_18pz4_104", JC = "_separator_18pz4_120", QC = "_groupLabel_18pz4_126", jn = {
  menu: jC,
  item: YC,
  icon: VC,
  label: GC,
  shortcut: KC,
  contextTarget: UC,
  chevron: XC,
  separator: JC,
  groupLabel: QC
}, Zs = _a(null);
function xu(e) {
  return Array.from(e?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
}
function Wo(e, t) {
  const a = xu(e);
  if (a.length === 0) {
    e?.focus();
    return;
  }
  const n = (t % a.length + a.length) % a.length;
  a[n]?.focus();
}
function il(e, t) {
  const a = xu(t), n = a.indexOf(document.activeElement);
  switch (e.key) {
    case "ArrowDown":
      return e.preventDefault(), Wo(t, n + 1), !0;
    case "ArrowUp":
      return e.preventDefault(), Wo(t, n - 1), !0;
    case "Home":
      return e.preventDefault(), Wo(t, 0), !0;
    case "End":
      return e.preventDefault(), Wo(t, a.length - 1), !0;
  }
  return !1;
}
function Wr(e, t) {
  return e instanceof Element && e.closest(`[data-menu-stack="${t}"]`) !== null;
}
function rl({
  panelRef: e,
  id: t,
  isOpen: a,
  stackId: n,
  label: s,
  dir: i,
  className: r,
  style: l,
  onKeyDown: d,
  onPointerEnter: u,
  onPointerLeave: m,
  onExitComplete: h,
  children: f
}) {
  const b = Re();
  return yn(
    /* @__PURE__ */ c(
      $e.div,
      {
        ref: e,
        id: t,
        role: "menu",
        "aria-label": s,
        tabIndex: -1,
        dir: i,
        "data-menu-stack": n,
        className: I(jn.menu, r),
        style: l,
        onKeyDown: d,
        onPointerEnter: u,
        onPointerLeave: m,
        initial: b ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 },
        animate: a ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: -2 },
        transition: b ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
        onAnimationComplete: () => {
          a || h();
        },
        children: f
      }
    ),
    document.body
  );
}
function Su({
  trigger: e,
  placement: t = "bottom-start",
  open: a,
  defaultOpen: n = !1,
  onOpenChange: s,
  className: i,
  children: r,
  ...l
}) {
  const d = Ee(), u = ee(null), m = ee(null), [h, f] = He(a, n), [b, w] = pe(h), S = ia(u), $ = Va(b, u, m, { placement: t });
  function N(k) {
    f(k), s?.(k);
  }
  function y() {
    N(!1), u.current?.focus();
  }
  xe(() => {
    h && w(!0);
  }, [h]), xe(() => {
    if (!b) return;
    const k = requestAnimationFrame(() => Wo(m.current, 0)), M = (T) => {
      const A = T.target;
      m.current?.contains(A) || u.current?.contains(A) || Wr(T.target, d) || N(!1);
    };
    return document.addEventListener("pointerdown", M), () => {
      cancelAnimationFrame(k), document.removeEventListener("pointerdown", M);
    };
  }, [b]);
  function v(k) {
    if (!il(k, m.current))
      switch (k.key) {
        case "Escape":
          k.preventDefault(), y();
          break;
        case "Tab":
          N(!1);
          break;
      }
  }
  const _ = Xs(e, {
    ref: u,
    "aria-haspopup": "menu",
    "aria-expanded": h,
    "aria-controls": h ? d : void 0,
    onClick: (k) => {
      e.props.onClick?.(k), N(!h);
    }
  });
  return /* @__PURE__ */ P(Zs.Provider, { value: { close: y, stackId: d, open: h }, children: [
    _,
    b && /* @__PURE__ */ c(
      rl,
      {
        panelRef: m,
        id: d,
        isOpen: h,
        stackId: d,
        label: l["aria-label"],
        dir: S,
        className: i,
        style: $?.style,
        onKeyDown: v,
        onExitComplete: () => w(!1),
        children: r
      }
    )
  ] });
}
const ZC = 500, eN = 8, tN = 2;
function nN(e, t) {
  return { x: e, y: t, top: t, left: e, right: e, bottom: t, width: 0, height: 0, toJSON: () => ({}) };
}
function u6({
  content: e,
  onOpenChange: t,
  menuClassName: a,
  className: n,
  children: s,
  onContextMenu: i,
  onPointerDown: r,
  onPointerMove: l,
  onPointerUp: d,
  onPointerCancel: u,
  "aria-label": m,
  ...h
}) {
  const f = Ee(), b = ee(null), w = ee(null), S = ee(null), $ = ee(null), N = ee(null), [y, v] = pe(!1), [_, k] = pe(!1), [M, T] = pe(null), A = ia(w), F = Va(_, b, S, {
    placement: "bottom-start",
    offset: tN,
    key: M
  });
  function L(D, H) {
    b.current = { getBoundingClientRect: () => nN(D, H) }, $.current = document.activeElement ?? null, T({ x: D, y: H }), v(!0), k(!0), t?.(!0);
  }
  function O(D) {
    v(!1), t?.(!1), D && $.current?.focus();
  }
  function q() {
    N.current !== null && (window.clearTimeout(N.current.timer), N.current = null);
  }
  xe(() => () => q(), []), xe(() => {
    if (!_) return;
    const D = requestAnimationFrame(() => Wo(S.current, 0)), H = (Y) => {
      Wr(Y.target, f) || O(!1);
    }, K = (Y) => {
      Wr(Y.target, f) || O(!1);
    };
    return document.addEventListener("pointerdown", H), window.addEventListener("scroll", K, !0), () => {
      cancelAnimationFrame(D), document.removeEventListener("pointerdown", H), window.removeEventListener("scroll", K, !0);
    };
  }, [_, M]);
  function j(D) {
    if (!il(D, S.current))
      switch (D.key) {
        case "Escape":
          D.preventDefault(), O(!0);
          break;
        case "Tab":
          O(!1);
          break;
      }
  }
  return /* @__PURE__ */ P(Zs.Provider, { value: { close: () => O(!0), stackId: f, open: y }, children: [
    /* @__PURE__ */ c(
      "div",
      {
        ref: w,
        className: I(jn.contextTarget, n),
        onContextMenu: (D) => {
          i?.(D), D.preventDefault(), q(), L(D.clientX, D.clientY);
        },
        onPointerDown: (D) => {
          if (r?.(D), D.pointerType === "mouse") return;
          const { clientX: H, clientY: K } = D;
          q(), N.current = {
            x: H,
            y: K,
            timer: window.setTimeout(() => {
              N.current = null, L(H, K);
            }, ZC)
          };
        },
        onPointerMove: (D) => {
          l?.(D), N.current !== null && Math.hypot(D.clientX - N.current.x, D.clientY - N.current.y) > eN && q();
        },
        onPointerUp: (D) => {
          d?.(D), q();
        },
        onPointerCancel: (D) => {
          u?.(D), q();
        },
        ...h,
        children: s
      }
    ),
    _ && /* @__PURE__ */ c(
      rl,
      {
        panelRef: S,
        id: f,
        isOpen: y,
        stackId: f,
        label: m,
        dir: A,
        className: a,
        style: F?.style,
        onKeyDown: j,
        onExitComplete: () => k(!1),
        children: e
      }
    )
  ] });
}
const aN = 120, oN = 300, sN = 2, iN = /* @__PURE__ */ c("svg", { width: "10", height: "10", viewBox: "0 0 10 10", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M3.5 1.5 7 5 3.5 8.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) });
function pa(e) {
  e.current !== null && (window.clearTimeout(e.current), e.current = null);
}
function h6({
  label: e,
  icon: t,
  disabled: a,
  menuClassName: n,
  className: s,
  children: i,
  onClick: r,
  onKeyDown: l,
  onPointerEnter: d,
  onPointerLeave: u,
  ...m
}) {
  const h = Gn(Zs), f = Ee(), b = ee(null), w = ee(null), [S, $] = pe(!1), [N, y] = pe(!1), v = ee(!1), _ = ee(null), k = ee(null), M = ia(b), T = Va(N, b, w, { placement: "inline-end-start", offset: sN });
  function A(D) {
    pa(_), pa(k), !a && (v.current = D, $(!0), y(!0));
  }
  function F() {
    pa(_), pa(k), $(!1);
  }
  function L() {
    pa(k), k.current = window.setTimeout(() => {
      k.current = null, F();
    }, oN);
  }
  xe(() => () => {
    pa(_), pa(k);
  }, []), xe(() => {
    if (!N || !S || !v.current) return;
    v.current = !1;
    const D = requestAnimationFrame(() => Wo(w.current, 0));
    return () => cancelAnimationFrame(D);
  }, [N, S]);
  const O = h?.open ?? !0;
  xe(() => {
    O || F();
  }, [O]);
  function q(D) {
    if (l?.(D), a) return;
    const H = bn(b.current) === "rtl" ? "ArrowLeft" : "ArrowRight";
    (D.key === H || D.key === "Enter" || D.key === " ") && (D.preventDefault(), D.stopPropagation(), A(!0));
  }
  function j(D) {
    if (il(D, w.current)) {
      D.stopPropagation();
      return;
    }
    const H = bn(b.current) === "rtl" ? "ArrowRight" : "ArrowLeft";
    D.key === H ? (D.preventDefault(), D.stopPropagation(), F(), b.current?.focus()) : D.key === "Escape" && F();
  }
  return /* @__PURE__ */ P(vs, { children: [
    /* @__PURE__ */ P(
      "button",
      {
        type: "button",
        role: "menuitem",
        ref: b,
        tabIndex: -1,
        "aria-haspopup": "menu",
        "aria-expanded": S,
        "aria-controls": S ? f : void 0,
        "aria-disabled": a || void 0,
        className: I(jn.item, s),
        onClick: (D) => {
          r?.(D), !a && A(!0);
        },
        onKeyDown: q,
        onPointerEnter: (D) => {
          d?.(D), !a && (pa(k), !(S || _.current !== null) && (_.current = window.setTimeout(() => {
            _.current = null, A(!1);
          }, aN)));
        },
        onPointerLeave: (D) => {
          u?.(D), pa(_), S && L();
        },
        ...m,
        children: [
          t && /* @__PURE__ */ c("span", { className: jn.icon, children: t }),
          /* @__PURE__ */ c("span", { className: jn.label, children: e }),
          /* @__PURE__ */ c("span", { className: jn.chevron, children: iN })
        ]
      }
    ),
    N && /* @__PURE__ */ c(
      Zs.Provider,
      {
        value: {
          close: h?.close ?? F,
          stackId: h?.stackId ?? f,
          open: O && S
        },
        children: /* @__PURE__ */ c(
          rl,
          {
            panelRef: w,
            id: f,
            isOpen: S,
            stackId: h?.stackId ?? f,
            label: typeof e == "string" ? e : void 0,
            dir: M,
            className: n,
            style: T?.style,
            onKeyDown: j,
            onPointerEnter: () => pa(k),
            onPointerLeave: () => L(),
            onExitComplete: () => y(!1),
            children: i
          }
        )
      }
    )
  ] });
}
function rN({ icon: e, shortcut: t, danger: a, onSelect: n, disabled: s, className: i, children: r, onClick: l, ...d }) {
  const u = Gn(Zs);
  return /* @__PURE__ */ P(
    "button",
    {
      type: "button",
      role: "menuitem",
      tabIndex: -1,
      "aria-disabled": s || void 0,
      "data-danger": a || void 0,
      className: I(jn.item, i),
      onClick: (m) => {
        s || (l?.(m), n?.(), u?.close());
      },
      ...d,
      children: [
        e && /* @__PURE__ */ c("span", { className: jn.icon, children: e }),
        /* @__PURE__ */ c("span", { className: jn.label, children: r }),
        t && /* @__PURE__ */ c("span", { className: jn.shortcut, children: t })
      ]
    }
  );
}
function m6({ className: e }) {
  return /* @__PURE__ */ c("div", { role: "separator", className: I(jn.separator, e) });
}
function p6({ className: e, children: t }) {
  return /* @__PURE__ */ c("div", { role: "presentation", className: I(jn.groupLabel, e), children: t });
}
const lN = "_split_m33l1_5", cN = "_fullWidth_m33l1_10", dN = "_main_m33l1_15", uN = "_more_m33l1_25", hN = "_chevron_m33l1_32", js = {
  split: lN,
  fullWidth: cN,
  main: dN,
  more: uN,
  chevron: hN
}, mN = /* @__PURE__ */ c("svg", { className: js.chevron, width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M2.5 4.5 6 8l3.5-3.5", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) });
function f6({
  children: e,
  onAction: t,
  menu: a,
  menuLabel: n,
  variant: s = "solid",
  size: i = "md",
  disabled: r = !1,
  loading: l = !1,
  fullWidth: d = !1,
  placement: u = "bottom",
  className: m,
  ...h
}) {
  return /* @__PURE__ */ P("span", { className: I(js.split, d && js.fullWidth, m), ...h, children: [
    /* @__PURE__ */ c(
      wa,
      {
        variant: s,
        size: i,
        disabled: r,
        loading: l,
        onClick: t,
        className: js.main,
        children: e
      }
    ),
    /* @__PURE__ */ c(
      Su,
      {
        "aria-label": n,
        placement: u,
        trigger: /* @__PURE__ */ c(wa, { variant: s, size: i, disabled: r, "aria-label": n, className: js.more, children: mN }),
        children: a
      }
    )
  ] });
}
const pN = "_root_6og9h_1", fN = "_fullWidth_6og9h_13", gN = "_segment_6og9h_20", bN = "_label_6og9h_24", yN = "_disabled_6og9h_41", vN = "_nativeInput_6og9h_45", wN = "_thumb_6og9h_57", kN = "_segmentSkeleton_6og9h_68", _N = "_sm_6og9h_113", xN = "_md_6og9h_120", SN = "_lg_6og9h_127", dn = {
  root: pN,
  fullWidth: fN,
  segment: gN,
  label: bN,
  disabled: yN,
  nativeInput: vN,
  thumb: wN,
  segmentSkeleton: kN,
  sm: _N,
  md: xN,
  lg: SN
};
function g6({
  options: e,
  value: t,
  defaultValue: a,
  onValueChange: n,
  size: s = "md",
  fullWidth: i = !1,
  skeleton: r = !1,
  spring: l = xa.Snappy,
  disabled: d = !1,
  className: u,
  "aria-label": m,
  ...h
}) {
  const f = Ee(), b = Re(), w = a ?? e.find((N) => !N.disabled)?.value ?? "", [S, $] = He(t, w);
  return r ? /* @__PURE__ */ c(
    "div",
    {
      ...h,
      "aria-hidden": "true",
      className: I(dn.root, dn[s], i && dn.fullWidth, u),
      children: e.map((N, y) => /* @__PURE__ */ P("span", { className: dn.segment, children: [
        /* @__PURE__ */ c("span", { className: dn.label, style: { color: "transparent" }, children: N.label }),
        /* @__PURE__ */ c(J, { radius: "var(--glacier-radius-full)", className: dn.segmentSkeleton })
      ] }, y))
    }
  ) : /* @__PURE__ */ c(
    "div",
    {
      ...h,
      role: "radiogroup",
      "aria-label": m,
      className: I(dn.root, dn[s], i && dn.fullWidth, u),
      children: e.map((N) => {
        const y = N.value === S, v = d || N.disabled;
        return /* @__PURE__ */ P(
          "label",
          {
            className: I(dn.segment, v && dn.disabled),
            "data-selected": y || void 0,
            children: [
              /* @__PURE__ */ c(
                "input",
                {
                  type: "radio",
                  className: dn.nativeInput,
                  name: f,
                  value: N.value,
                  checked: y,
                  disabled: v,
                  "data-haptic": "selection",
                  onChange: () => {
                    $(N.value), n?.(N.value);
                  }
                }
              ),
              y && /* @__PURE__ */ c(
                $e.span,
                {
                  className: dn.thumb,
                  layoutId: `${f}-thumb`,
                  transition: b ? { duration: 0 } : Ya(l),
                  "aria-hidden": "true"
                }
              ),
              /* @__PURE__ */ c("span", { className: dn.label, children: N.label })
            ]
          },
          N.value
        );
      })
    }
  );
}
const MN = "_root_1j5qy_1", $N = "_viewport_1j5qy_13", TN = "_vertical_1j5qy_35", CN = "_horizontal_1j5qy_43", NN = "_scrollbar_1j5qy_104", DN = "_thumb_1j5qy_126", zN = "_hideScrollbar_1j5qy_174", So = {
  root: MN,
  viewport: $N,
  vertical: TN,
  horizontal: CN,
  scrollbar: NN,
  thumb: DN,
  hideScrollbar: zN
};
function PN({
  maxHeight: e,
  orientation: t = "vertical",
  scrollbarAppearance: a = Rd.Default,
  showScrollbarTrack: n = !0,
  hideScrollbar: s = !1,
  className: i,
  style: r,
  children: l,
  ...d
}) {
  const u = ee(null), [m, h] = pe({ start: !1, end: !1 }), [f, b] = pe({ visible: !1, thumbSize: 100, thumbOffset: 0 }), w = at(() => {
    const y = u.current;
    if (!y) return;
    const v = t === "horizontal", _ = v ? y.scrollWidth : y.scrollHeight, k = v ? y.clientWidth : y.clientHeight, M = Math.max(_ - k, 0), T = Math.min(v ? Math.abs(y.scrollLeft) : Math.max(y.scrollTop, 0), M), A = Math.min(100, Math.max(12, k / Math.max(_, 1) * 100));
    h({ start: T > 1, end: M - T > 1 }), b({
      visible: M > 1,
      thumbSize: A,
      thumbOffset: M > 0 ? T / M * (100 - A) : 0
    });
  }, [t]), S = at((y) => {
    const v = u.current;
    if (!v) return;
    const _ = t === "horizontal", k = y.currentTarget.getBoundingClientRect(), M = _ ? k.width : k.height, T = _ ? y.clientX - k.left : y.clientY - k.top, A = _ ? v.scrollWidth : v.scrollHeight, F = _ ? v.clientWidth : v.clientHeight, L = Math.max(A - F, 0), O = F / Math.max(A, 1), q = Math.max(0, Math.min(1, T / M - O / 2)) * L;
    _ ? v.scrollLeft = getComputedStyle(v).direction === "rtl" ? -q : q : v.scrollTop = q;
  }, [t]);
  ys(() => {
    w();
  }, [w, l]), xe(() => {
    const y = u.current;
    if (!y || typeof ResizeObserver > "u") return;
    const v = new ResizeObserver(() => w());
    v.observe(y);
    for (const _ of Array.from(y.children)) v.observe(_);
    return () => v.disconnect();
  }, [w]);
  const $ = e === void 0 ? {} : t === "horizontal" ? { maxWidth: e } : { maxHeight: e }, N = {
    "--scrollbar-thumb-size": `${f.thumbSize}%`,
    "--scrollbar-thumb-offset": `${f.thumbOffset}%`
  };
  return /* @__PURE__ */ P(
    "div",
    {
      className: I(
        So.root,
        t === "horizontal" ? So.horizontal : So.vertical,
        s && So.hideScrollbar,
        i
      ),
      "data-orientation": t,
      "data-fade-start": m.start || void 0,
      "data-fade-end": m.end || void 0,
      style: r,
      ...d,
      children: [
        /* @__PURE__ */ c(
          "div",
          {
            ref: u,
            className: So.viewport,
            style: $,
            "data-scrollbar-appearance": a,
            tabIndex: 0,
            role: "group",
            onScroll: w,
            children: l
          }
        ),
        !s && f.visible && /* @__PURE__ */ c(
          "div",
          {
            className: So.scrollbar,
            "data-orientation": t,
            "data-scrollbar-appearance": a,
            "data-track-visible": n || void 0,
            style: N,
            "aria-hidden": "true",
            onPointerDown: (y) => {
              y.preventDefault(), y.currentTarget.setPointerCapture(y.pointerId), S(y);
            },
            onPointerMove: (y) => {
              y.currentTarget.hasPointerCapture(y.pointerId) && S(y);
            },
            children: /* @__PURE__ */ c("span", { className: So.thumb })
          }
        )
      ]
    }
  );
}
const AN = "_root_6pd9n_1", ON = "_options_6pd9n_6", EN = "_option_6pd9n_6", WN = "_preview_6pd9n_42", IN = "_chrome_6pd9n_78", RN = "_sidebarControl_6pd9n_88", LN = "_searchControl_6pd9n_89", qN = "_canvas_6pd9n_124", FN = "_line_6pd9n_131", BN = "_title_6pd9n_139", HN = "_body_6pd9n_146", jN = "_bodyShort_6pd9n_147", YN = "_label_6pd9n_176", Ft = {
  root: AN,
  options: ON,
  option: EN,
  preview: WN,
  chrome: IN,
  sidebarControl: RN,
  searchControl: LN,
  canvas: qN,
  line: FN,
  title: BN,
  body: HN,
  bodyShort: jN,
  label: YN
}, Ea = ["extra-compact", "compact", "comfortable", "spacious", "more-space"];
function VN({ mode: e }) {
  return /* @__PURE__ */ P("span", { className: Ft.preview, "data-mode": e, "aria-hidden": "true", children: [
    /* @__PURE__ */ P("span", { className: Ft.chrome, children: [
      /* @__PURE__ */ c("span", { className: Ft.sidebarControl }),
      /* @__PURE__ */ c("span", { className: Ft.searchControl, children: /* @__PURE__ */ c("i", {}) })
    ] }),
    /* @__PURE__ */ P("span", { className: Ft.canvas, children: [
      /* @__PURE__ */ c("i", { className: `${Ft.line} ${Ft.title}` }),
      /* @__PURE__ */ c("i", { className: `${Ft.line} ${Ft.body}` }),
      /* @__PURE__ */ c("i", { className: `${Ft.line} ${Ft.bodyShort}` }),
      /* @__PURE__ */ c("i", { className: `${Ft.line} ${Ft.body}` })
    ] })
  ] });
}
function b6({
  value: e,
  onValueChange: t,
  labels: a,
  disabled: n = !1,
  className: s,
  "aria-label": i,
  ...r
}) {
  const l = st(), d = ee([]), u = Ea.find((b) => b === e) ?? "comfortable", m = {
    "extra-compact": l(_e.densityExtraCompact),
    compact: l(_e.densityCompact),
    comfortable: l(_e.densityDefault),
    spacious: l(_e.densityComfortable),
    "more-space": l(_e.densityMoreSpace)
  }, h = (b, w = !1) => {
    if (n || (t(b), !w)) return;
    const S = d.current[Ea.indexOf(b)];
    S?.focus(), S?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  }, f = (b, w) => {
    const S = Ea.indexOf(w);
    let $;
    if ((b.key === "ArrowRight" || b.key === "ArrowDown") && ($ = (S + 1) % Ea.length), (b.key === "ArrowLeft" || b.key === "ArrowUp") && ($ = (S - 1 + Ea.length) % Ea.length), b.key === "Home" && ($ = 0), b.key === "End" && ($ = Ea.length - 1), $ === void 0) return;
    const N = Ea[$];
    N && (b.preventDefault(), h(N, !0));
  };
  return /* @__PURE__ */ c(
    PN,
    {
      orientation: "horizontal",
      className: I(Ft.root, s),
      role: "radiogroup",
      "aria-label": i,
      "aria-disabled": n || void 0,
      ...r,
      children: /* @__PURE__ */ c("div", { className: Ft.options, children: Ea.map((b, w) => {
        const S = u === b;
        return /* @__PURE__ */ P(
          "button",
          {
            ref: ($) => {
              d.current[w] = $;
            },
            type: "button",
            role: "radio",
            "aria-checked": S,
            tabIndex: S ? 0 : -1,
            className: Ft.option,
            "data-selected": S || void 0,
            "data-haptic": "selection",
            disabled: n,
            onClick: () => h(b),
            onKeyDown: ($) => f($, b),
            children: [
              /* @__PURE__ */ c(VN, { mode: b }),
              /* @__PURE__ */ c("span", { className: Ft.label, children: a?.[b] ?? m[b] })
            ]
          },
          b
        );
      }) })
    }
  );
}
const GN = "_root_gdt5h_1", KN = "_scroller_gdt5h_9", UN = "_controlSlot_gdt5h_44", XN = "_control_gdt5h_44", JN = "_prev_gdt5h_65", QN = "_next_gdt5h_69", ZN = "_chevron_gdt5h_74", va = {
  root: GN,
  scroller: KN,
  controlSlot: UN,
  control: XN,
  prev: JN,
  next: QN,
  chevron: ZN
}, eD = /* @__PURE__ */ c("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", className: va.chevron, children: /* @__PURE__ */ c("path", { d: "M10 3.5 5.5 8l4.5 4.5" }) }), tD = /* @__PURE__ */ c("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", className: va.chevron, children: /* @__PURE__ */ c("path", { d: "M6 3.5 10.5 8 6 12.5" }) });
function y6({
  children: e,
  showControls: t = !1,
  gap: a = "var(--glacier-space-4)",
  className: n,
  style: s,
  "aria-label": i,
  ...r
}) {
  const l = st(), d = ee(null), [u, m] = pe(!1), [h, f] = pe(!0), [b, w] = pe(!1), S = at(() => {
    const v = d.current;
    if (!v) return;
    const _ = v.scrollWidth - v.clientWidth, k = Math.abs(v.scrollLeft);
    m(_ > 1), f(k <= 1), w(k >= _ - 1);
  }, []);
  xe(() => {
    const v = d.current;
    if (!v || (S(), typeof ResizeObserver > "u")) return;
    const _ = new ResizeObserver(S);
    _.observe(v);
    for (const k of Array.from(v.children)) _.observe(k);
    return () => _.disconnect();
  }, [S, e]);
  function $(v) {
    const _ = d.current;
    if (!_ || Math.abs(v.deltaY) <= Math.abs(v.deltaX)) return;
    const k = _.scrollWidth - _.clientWidth;
    if (k <= 0) return;
    const M = bn(_) === "rtl" ? -1 : 1, T = Math.abs(_.scrollLeft);
    (v.deltaY < 0 && T > 0 || v.deltaY > 0 && T < k) && (v.preventDefault(), _.scrollLeft += v.deltaY * M);
  }
  function N(v) {
    const _ = d.current;
    if (!_) return;
    const k = bn(_) === "rtl" ? -1 : 1;
    _.scrollBy({ left: v * k * _.clientWidth * 0.8, behavior: "smooth" });
  }
  const y = { "--carousel-gap": a, ...s };
  return /* @__PURE__ */ P("div", { ...r, className: I(va.root, n), style: y, children: [
    t && /* @__PURE__ */ c("span", { className: I(va.controlSlot, va.prev), "data-hidden": !u || void 0, children: /* @__PURE__ */ c(
      Yn,
      {
        variant: Ba.Soft,
        "aria-label": l(_e.previous),
        className: va.control,
        disabled: h,
        tabIndex: -1,
        onClick: () => N(-1),
        children: eD
      }
    ) }),
    /* @__PURE__ */ c(
      "div",
      {
        ref: d,
        role: "group",
        "aria-label": i,
        className: va.scroller,
        tabIndex: 0,
        onWheel: $,
        onScroll: S,
        children: e
      }
    ),
    t && /* @__PURE__ */ c("span", { className: I(va.controlSlot, va.next), "data-hidden": !u || void 0, children: /* @__PURE__ */ c(
      Yn,
      {
        variant: Ba.Soft,
        "aria-label": l(_e.next),
        className: va.control,
        disabled: b,
        tabIndex: -1,
        onClick: () => N(1),
        children: tD
      }
    ) })
  ] });
}
const nD = "_root_uzzq0_1", aD = "_fullWidth_uzzq0_7", oD = "_control_uzzq0_12", sD = "_input_uzzq0_19", iD = "_glass_uzzq0_56", rD = "_sm_uzzq0_64", lD = "_md_uzzq0_70", cD = "_lg_uzzq0_76", dD = "_indicator_uzzq0_82", uD = "_menu_uzzq0_90", hD = "_option_uzzq0_108", mD = "_message_uzzq0_109", pD = "_optionLabel_uzzq0_134", fD = "_optionDescription_uzzq0_140", un = {
  root: nD,
  fullWidth: aD,
  control: oD,
  input: sD,
  glass: iD,
  sm: rD,
  md: lD,
  lg: cD,
  indicator: dD,
  menu: uD,
  option: hD,
  message: mD,
  optionLabel: pD,
  optionDescription: fD
};
function bi(e) {
  return e ? e.textValue !== void 0 ? e.textValue : typeof e.label == "string" ? e.label : e.value : "";
}
const gD = /* @__PURE__ */ c("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "m3 4.5 3 3 3-3", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) });
function v6({
  options: e,
  value: t,
  defaultValue: a,
  onValueChange: n,
  inputValue: s,
  defaultInputValue: i,
  onInputValueChange: r,
  filter: l,
  placeholder: d,
  emptyState: u,
  loading: m = !1,
  size: h = "md",
  fullWidth: f = !1,
  disabled: b = !1,
  skeleton: w = !1,
  glass: S = !1,
  name: $,
  id: N,
  className: y,
  "aria-label": v,
  ..._
}) {
  const k = st(), M = Ee(), T = Sa(), A = Re(), F = ee(null), L = ee(null), O = ee(null), q = a ?? "", j = e.find((W) => W.value === q), [D, H] = He(t, q), [K, Y] = He(s, i ?? bi(j)), [se, te] = pe(!1), [ne, U] = pe(), z = ia(L), R = Va(se, L, O, { placement: "bottom-start", matchWidth: !0 }), X = e.find((W) => W.value === D);
  function le(W, G) {
    return l ? l(W, G) : bi(W).toLocaleLowerCase().includes(G.trim().toLocaleLowerCase());
  }
  function me(W) {
    return e.flatMap((G, ce) => le(G, W) ? [{ option: G, index: ce }] : []);
  }
  const ue = me(K), ze = ue.find(({ option: W }) => W.value === ne), je = ze ? `${M}-option-${ze.index}` : void 0;
  xe(() => {
    t !== void 0 && s === void 0 && Y(bi(X));
  }, [s, X, Y, t]), xe(() => {
    if (!se) return;
    const W = (G) => {
      const ce = G.target;
      !F.current?.contains(ce) && !O.current?.contains(ce) && te(!1);
    };
    return document.addEventListener("pointerdown", W), () => document.removeEventListener("pointerdown", W);
  }, [se]);
  function Ne(W) {
    return W.find(({ option: G }) => !G.disabled)?.option.value;
  }
  function ht(W = K) {
    if (b) return;
    const G = me(W), ce = G.find(({ option: Se }) => Se.value === D && !Se.disabled)?.option.value;
    U(ce ?? Ne(G)), te(!0);
  }
  function Tt(W) {
    const G = ue.filter(({ option: ve }) => !ve.disabled);
    if (G.length === 0) return;
    const ce = G.findIndex(({ option: ve }) => ve.value === ne), Se = ce === -1 ? W === 1 ? 0 : G.length - 1 : Math.min(Math.max(ce + W, 0), G.length - 1);
    U(G[Se]?.option.value);
  }
  function it(W) {
    if (!W || W.disabled) return;
    H(W.value), n?.(W.value);
    const G = bi(W);
    Y(G), r?.(G), U(W.value), L.current?.focus(), te(!1);
  }
  function Ct(W) {
    switch (W.key) {
      case "ArrowDown":
        W.preventDefault(), se ? Tt(1) : ht();
        break;
      case "ArrowUp":
        W.preventDefault(), se ? Tt(-1) : ht();
        break;
      case "Home":
        se && (W.preventDefault(), U(Ne(ue)));
        break;
      case "End":
        if (se) {
          W.preventDefault();
          const G = ue.filter(({ option: ce }) => !ce.disabled);
          U(G[G.length - 1]?.option.value);
        }
        break;
      case "Enter":
        se && (W.preventDefault(), it(ze?.option));
        break;
      case "Escape":
        se && (W.preventDefault(), te(!1));
        break;
      case "Tab":
        te(!1);
        break;
    }
  }
  if (w)
    return /* @__PURE__ */ c(
      J,
      {
        width: f ? "100%" : "11rem",
        height: `var(--glacier-control-height-${h})`,
        radius: "var(--glacier-radius-lg)",
        className: y
      }
    );
  const Ht = R?.style ?? { position: "fixed", visibility: "hidden" };
  return /* @__PURE__ */ P("div", { ..._, ref: F, className: I(un.root, f && un.fullWidth, y), children: [
    /* @__PURE__ */ P("div", { className: un.control, children: [
      /* @__PURE__ */ c(
        "input",
        {
          ref: L,
          id: N ?? T?.id,
          type: "text",
          role: "combobox",
          autoComplete: "off",
          className: I(un.input, un[h], S && un.glass),
          value: K,
          placeholder: d,
          disabled: b,
          "aria-autocomplete": "list",
          "aria-haspopup": "listbox",
          "aria-expanded": se,
          "aria-controls": se ? M : void 0,
          "aria-activedescendant": se ? je : void 0,
          "aria-describedby": T?.describedBy,
          "aria-invalid": T?.invalid || void 0,
          "aria-label": v,
          onFocus: () => ht(),
          onClick: () => ht(),
          onChange: (W) => {
            const G = W.currentTarget.value;
            Y(G), r?.(G), U(Ne(me(G))), te(!0);
          },
          onKeyDown: Ct
        }
      ),
      /* @__PURE__ */ c("span", { className: un.indicator, children: gD })
    ] }),
    $ && /* @__PURE__ */ c("input", { type: "hidden", name: $, value: D }),
    se && yn(
      /* @__PURE__ */ c(
        $e.ul,
        {
          ref: O,
          id: M,
          role: "listbox",
          dir: z,
          "aria-label": v,
          "aria-busy": m || void 0,
          className: I(un.menu, un[h]),
          style: Ht,
          initial: A ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 },
          animate: { opacity: 1, scale: 1, y: 0 },
          transition: A ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
          children: m ? /* @__PURE__ */ c("li", { role: "presentation", className: un.message, children: k(_e.loading) }) : ue.length === 0 ? /* @__PURE__ */ c("li", { role: "presentation", className: un.message, children: u ?? k(_e.noOptions) }) : ue.map(({ option: W, index: G }) => /* @__PURE__ */ P(
            "li",
            {
              id: `${M}-option-${G}`,
              role: "option",
              "aria-selected": W.value === D,
              "aria-disabled": W.disabled || void 0,
              "data-active": W.value === ne || void 0,
              "data-disabled": W.disabled || void 0,
              className: un.option,
              onMouseEnter: () => !W.disabled && U(W.value),
              onMouseDown: (ce) => ce.preventDefault(),
              onClick: () => it(W),
              children: [
                /* @__PURE__ */ c("span", { className: un.optionLabel, children: W.label }),
                W.description && /* @__PURE__ */ c("span", { className: un.optionDescription, children: W.description })
              ]
            },
            W.value
          ))
        }
      ),
      document.body
    )
  ] });
}
const bD = "_root_kfp60_1", yD = "_fullWidth_kfp60_7", vD = "_control_kfp60_12", wD = "_invalid_kfp60_45", kD = "_glass_kfp60_49", _D = "_sm_kfp60_57", xD = "_md_kfp60_63", SD = "_lg_kfp60_69", MD = "_tags_kfp60_75", $D = "_tag_kfp60_75", TD = "_tagLabel_kfp60_91", CD = "_tagRemove_kfp60_97", ND = "_input_kfp60_121", DD = "_indicator_kfp60_142", zD = "_menu_kfp60_149", PD = "_option_kfp60_167", AD = "_message_kfp60_168", OD = "_optionContent_kfp60_184", ED = "_optionLabel_kfp60_205", WD = "_optionDescription_kfp60_211", ID = "_check_kfp60_221", St = {
  root: bD,
  fullWidth: yD,
  control: vD,
  invalid: wD,
  glass: kD,
  sm: _D,
  md: xD,
  lg: SD,
  tags: MD,
  tag: $D,
  tagLabel: TD,
  tagRemove: CD,
  input: ND,
  indicator: DD,
  menu: zD,
  option: PD,
  message: AD,
  optionContent: OD,
  optionLabel: ED,
  optionDescription: WD,
  check: ID
};
function Ic(e) {
  return e ? e.textValue !== void 0 ? e.textValue : typeof e.label == "string" ? e.label : e.value : "";
}
const RD = /* @__PURE__ */ c("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "m3 4.5 3 3 3-3", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }), LD = /* @__PURE__ */ c("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M2.5 6.5 5 9 9.5 3.5", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) }), qD = /* @__PURE__ */ c("svg", { width: "10", height: "10", viewBox: "0 0 10 10", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M2 2l6 6M8 2l-6 6", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round" }) });
function w6({
  options: e,
  value: t,
  defaultValue: a,
  onValueChange: n,
  inputValue: s,
  defaultInputValue: i,
  onInputValueChange: r,
  filter: l,
  placeholder: d,
  emptyState: u,
  loading: m = !1,
  size: h = "md",
  fullWidth: f = !1,
  disabled: b = !1,
  skeleton: w = !1,
  glass: S = !1,
  name: $,
  id: N,
  className: y,
  "aria-label": v,
  ..._
}) {
  const k = st(), M = Ee(), T = Sa(), A = Re(), F = ee(null), L = ee(null), O = ee(null), [q, j] = He(t, a ?? []), [D, H] = He(s, i ?? ""), [K, Y] = pe(!1), [se, te] = pe(), ne = ia(L), U = Va(K, L, O, { placement: "bottom-start", matchWidth: !0 });
  function z(W, G) {
    return l ? l(W, G) : Ic(W).toLocaleLowerCase().includes(G.trim().toLocaleLowerCase());
  }
  function R(W) {
    return e.flatMap((G, ce) => z(G, W) ? [{ option: G, index: ce }] : []);
  }
  const X = R(D), le = X.find(({ option: W }) => W.value === se), me = le ? `${M}-option-${le.index}` : void 0, ue = q.flatMap((W) => {
    const G = e.find((ce) => ce.value === W);
    return G ? [G] : [];
  });
  xe(() => {
    if (!K) return;
    const W = (G) => {
      const ce = G.target;
      !F.current?.contains(ce) && !O.current?.contains(ce) && Y(!1);
    };
    return document.addEventListener("pointerdown", W), () => document.removeEventListener("pointerdown", W);
  }, [K]);
  function ze(W) {
    return W.find(({ option: G }) => !G.disabled)?.option.value;
  }
  function je(W = D) {
    if (b) return;
    const G = R(W);
    te(ze(G)), Y(!0);
  }
  function Ne(W) {
    const G = X.filter(({ option: ve }) => !ve.disabled);
    if (G.length === 0) return;
    const ce = G.findIndex(({ option: ve }) => ve.value === se), Se = ce === -1 ? W === 1 ? 0 : G.length - 1 : Math.min(Math.max(ce + W, 0), G.length - 1);
    te(G[Se]?.option.value);
  }
  function ht(W) {
    j(W), n?.(W);
  }
  function Tt(W) {
    if (!W || W.disabled) return;
    const G = q.includes(W.value) ? q.filter((ce) => ce !== W.value) : [...q, W.value];
    ht(G), H(""), r?.(""), te(W.value), Y(!0);
  }
  function it(W) {
    ht(q.filter((G) => G !== W)), L.current?.focus();
  }
  function Ct(W) {
    switch (W.key) {
      case "ArrowDown":
        W.preventDefault(), K ? Ne(1) : je();
        break;
      case "ArrowUp":
        W.preventDefault(), K ? Ne(-1) : je();
        break;
      case "Home":
        K && (W.preventDefault(), te(ze(X)));
        break;
      case "End":
        if (K) {
          W.preventDefault();
          const G = X.filter(({ option: ce }) => !ce.disabled);
          te(G[G.length - 1]?.option.value);
        }
        break;
      case "Enter":
        K && (W.preventDefault(), Tt(le?.option));
        break;
      case "Escape":
        K && (W.preventDefault(), Y(!1));
        break;
      case "Backspace": {
        const G = q.length > 0 ? q[q.length - 1] : void 0;
        D === "" && G !== void 0 && (W.preventDefault(), it(G));
        break;
      }
      case "Tab":
        Y(!1);
        break;
    }
  }
  if (w)
    return /* @__PURE__ */ c(
      J,
      {
        width: f ? "100%" : "11rem",
        height: `var(--glacier-control-height-${h})`,
        radius: "var(--glacier-radius-lg)",
        className: y
      }
    );
  const Ht = U?.style ?? { position: "fixed", visibility: "hidden" };
  return /* @__PURE__ */ P("div", { ..._, ref: F, className: I(St.root, f && St.fullWidth, y), children: [
    /* @__PURE__ */ P("div", { className: I(St.control, St[h], S && St.glass, T?.invalid && St.invalid), children: [
      /* @__PURE__ */ c("div", { className: St.tags, role: "list", children: ue.map((W) => /* @__PURE__ */ P("span", { className: St.tag, role: "listitem", children: [
        /* @__PURE__ */ c("span", { className: St.tagLabel, children: W.label }),
        !b && /* @__PURE__ */ c(
          "button",
          {
            type: "button",
            className: St.tagRemove,
            "aria-label": `${k(_e.dismiss)} ${Ic(W)}`,
            onClick: () => it(W.value),
            children: qD
          }
        )
      ] }, W.value)) }),
      /* @__PURE__ */ c(
        "input",
        {
          ref: L,
          id: N ?? T?.id,
          type: "text",
          role: "combobox",
          autoComplete: "off",
          className: St.input,
          value: D,
          placeholder: ue.length === 0 ? d : void 0,
          disabled: b,
          "aria-autocomplete": "list",
          "aria-haspopup": "listbox",
          "aria-expanded": K,
          "aria-controls": K ? M : void 0,
          "aria-activedescendant": K ? me : void 0,
          "aria-describedby": T?.describedBy,
          "aria-invalid": T?.invalid || void 0,
          "aria-label": v,
          onFocus: () => je(),
          onClick: () => je(),
          onChange: (W) => {
            const G = W.currentTarget.value;
            H(G), r?.(G), te(ze(R(G))), Y(!0);
          },
          onKeyDown: Ct
        }
      ),
      /* @__PURE__ */ c("span", { className: St.indicator, children: RD })
    ] }),
    $ && q.map((W) => /* @__PURE__ */ c("input", { type: "hidden", name: $, value: W }, W)),
    K && yn(
      /* @__PURE__ */ c(
        $e.ul,
        {
          ref: O,
          id: M,
          role: "listbox",
          dir: ne,
          "aria-label": v,
          "aria-multiselectable": "true",
          "aria-busy": m || void 0,
          className: St.menu,
          style: Ht,
          initial: A ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 },
          animate: { opacity: 1, scale: 1, y: 0 },
          transition: A ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
          children: m ? /* @__PURE__ */ c("li", { role: "presentation", className: St.message, children: k(_e.loading) }) : X.length === 0 ? /* @__PURE__ */ c("li", { role: "presentation", className: St.message, children: u ?? k(_e.noOptions) }) : X.map(({ option: W, index: G }) => {
            const ce = q.includes(W.value);
            return /* @__PURE__ */ P(
              "li",
              {
                id: `${M}-option-${G}`,
                role: "option",
                "aria-selected": ce,
                "aria-disabled": W.disabled || void 0,
                "data-active": W.value === se || void 0,
                "data-disabled": W.disabled || void 0,
                "data-selected": ce || void 0,
                className: St.option,
                onMouseEnter: () => !W.disabled && te(W.value),
                onMouseDown: (Se) => Se.preventDefault(),
                onClick: () => Tt(W),
                children: [
                  /* @__PURE__ */ P("span", { className: St.optionContent, children: [
                    /* @__PURE__ */ c("span", { className: St.optionLabel, children: W.label }),
                    W.description && /* @__PURE__ */ c("span", { className: St.optionDescription, children: W.description })
                  ] }),
                  ce && /* @__PURE__ */ c("span", { className: St.check, children: LD })
                ]
              },
              W.value
            );
          })
        }
      ),
      document.body
    )
  ] });
}
const FD = "_list_untdt_1", BD = "_divided_untdt_11", HD = "_item_untdt_24", jD = "_row_untdt_29", YD = "_leading_untdt_72", VD = "_copy_untdt_80", GD = "_title_untdt_88", KD = "_description_untdt_89", UD = "_trailing_untdt_109", XD = "_sm_untdt_116", JD = "_md_untdt_122", Bn = {
  list: FD,
  divided: BD,
  item: HD,
  row: jD,
  leading: YD,
  copy: VD,
  title: GD,
  description: KD,
  trailing: UD,
  sm: XD,
  md: JD
};
function k6({ size: e = "md", divided: t = !1, className: a, ...n }) {
  return /* @__PURE__ */ c(
    "ul",
    {
      ...n,
      className: I(Bn.list, Bn[e], t && Bn.divided, a),
      "data-size": e
    }
  );
}
function _6({
  title: e,
  description: t,
  leading: a,
  trailing: n,
  selected: s = !1,
  disabled: i = !1,
  href: r,
  onClick: l,
  className: d,
  ...u
}) {
  const m = /* @__PURE__ */ P(vs, { children: [
    a != null && /* @__PURE__ */ c("span", { className: Bn.leading, "aria-hidden": "true", children: a }),
    /* @__PURE__ */ P("span", { className: Bn.copy, children: [
      /* @__PURE__ */ c("span", { className: Bn.title, children: e }),
      t != null && /* @__PURE__ */ c("span", { className: Bn.description, children: t })
    ] }),
    n != null && /* @__PURE__ */ c("span", { className: Bn.trailing, children: n })
  ] });
  return /* @__PURE__ */ c(
    "li",
    {
      ...u,
      className: I(Bn.item, d),
      "data-glacier-list-item": "",
      "data-selected": s || void 0,
      "data-disabled": i || void 0,
      children: r && !i ? /* @__PURE__ */ c("a", { className: Bn.row, href: r, "aria-current": s ? "page" : void 0, children: m }) : l ? /* @__PURE__ */ c("button", { type: "button", className: Bn.row, disabled: i, onClick: l, "aria-pressed": s || void 0, children: m }) : /* @__PURE__ */ c("div", { className: Bn.row, children: m })
    }
  );
}
const QD = "_heatmap_1yyj3_1", ZD = "_grid_1yyj3_12", ez = "_column_1yyj3_18", tz = "_cell_1yyj3_29", nz = "_srOnly_1yyj3_53", az = "_legend_1yyj3_65", oz = "_legendText_1yyj3_74", sz = "_swatch_1yyj3_78", Sn = {
  heatmap: QD,
  grid: ZD,
  column: ez,
  cell: tz,
  srOnly: nz,
  legend: az,
  legendText: oz,
  swatch: sz
};
function iz(e) {
  return e.length > 0 && !Array.isArray(e[0]);
}
function rz(e, t) {
  if (e.length === 0) return [];
  if (iz(e)) {
    const i = e.map((l) => ({ value: l.value, date: l.date })), r = [];
    for (let l = 0; l < i.length; l += t)
      r.push(i.slice(l, l + t));
    return r;
  }
  const a = e, n = a.reduce((i, r) => Math.max(i, r.length), 0), s = [];
  for (let i = 0; i < n; i += 1) {
    const r = [];
    for (let l = 0; l < a.length; l += 1) {
      const d = a[l]?.[i];
      d !== void 0 && r.push({ value: d });
    }
    s.push(r);
  }
  return s;
}
function lz(e, t, a) {
  if (e <= 0 || t <= 0) return 0;
  const n = a - 1, s = Math.ceil(e / t * n);
  return Math.min(n, Math.max(1, s));
}
function cz({ data: e, levels: t = 5, legend: a = !1, rows: n = 7, skeleton: s = !1, skeletonColumns: i = 12, className: r, "aria-label": l, ...d }) {
  const u = st(), m = Math.max(2, Math.floor(t)), h = rz(e, Math.max(1, Math.floor(n))), f = h.reduce(
    (S, $) => $.reduce((N, y) => Math.max(N, y.value), S),
    0
  ), b = Ee(), w = Array.from({ length: m }, (S, $) => $);
  if (s) {
    const S = h.length > 0 ? h.length : Math.max(1, Math.floor(i)), $ = Math.max(1, Math.floor(n));
    return /* @__PURE__ */ P("div", { className: I(Sn.heatmap, r), "aria-hidden": "true", children: [
      /* @__PURE__ */ c("div", { className: Sn.grid, children: Array.from({ length: S }, (N, y) => /* @__PURE__ */ c("div", { className: Sn.column, children: Array.from({ length: $ }, (v, _) => /* @__PURE__ */ c(
        J,
        {
          width: "var(--glacier-space-4)",
          height: "var(--glacier-space-4)",
          radius: "var(--glacier-radius-xs)"
        },
        _
      )) }, y)) }),
      a && /* @__PURE__ */ P("div", { className: Sn.legend, children: [
        /* @__PURE__ */ c(J, { width: "1.5rem", height: "0.5rem" }),
        w.map((N) => /* @__PURE__ */ c(
          J,
          {
            width: "var(--glacier-space-3)",
            height: "var(--glacier-space-3)",
            radius: "var(--glacier-radius-xs)"
          },
          N
        )),
        /* @__PURE__ */ c(J, { width: "1.75rem", height: "0.5rem" })
      ] })
    ] });
  }
  return /* @__PURE__ */ P(
    "div",
    {
      ...d,
      role: "img",
      "aria-label": l,
      "aria-describedby": a ? b : void 0,
      className: I(Sn.heatmap, r),
      children: [
        /* @__PURE__ */ c("div", { className: Sn.grid, children: h.map((S, $) => /* @__PURE__ */ c("div", { className: Sn.column, children: S.map((N, y) => {
          const v = lz(N.value, f, m), _ = N.date ? `${N.date}: ${N.value}` : `${N.value}`;
          return /* @__PURE__ */ c(
            "div",
            {
              className: Sn.cell,
              "data-level": v,
              style: { "--level": v, "--steps": m - 1 },
              title: _,
              children: /* @__PURE__ */ c("span", { className: Sn.srOnly, children: _ })
            },
            y
          );
        }) }, $)) }),
        a && /* @__PURE__ */ P("div", { id: b, className: Sn.legend, children: [
          /* @__PURE__ */ c("span", { className: Sn.legendText, children: u(_e.less) }),
          w.map((S) => /* @__PURE__ */ c(
            "span",
            {
              className: Sn.swatch,
              "data-level": S,
              style: { "--level": S, "--steps": m - 1 },
              "aria-hidden": "true"
            },
            S
          )),
          /* @__PURE__ */ c("span", { className: Sn.legendText, children: u(_e.more) })
        ] })
      ]
    }
  );
}
cz.displayName = "Heatmap";
const dz = "_root_ad918_1", uz = "_list_ad918_2", hz = "_item_ad918_3", mz = "_link_ad918_4", pz = "_current_ad918_6", fz = "_text_ad918_7", gz = "_separator_ad918_8", Mo = {
  root: dz,
  list: uz,
  item: hz,
  link: mz,
  current: pz,
  text: fz,
  separator: gz
};
function x6({ items: e, separator: t = "/", className: a, ...n }) {
  const s = e.filter((i) => i !== void 0);
  return /* @__PURE__ */ c("nav", { "aria-label": "Breadcrumb", className: I(Mo.root, a), ...n, children: /* @__PURE__ */ c("ol", { className: Mo.list, children: s.map((i, r) => {
    const l = i.current ?? r === s.length - 1, d = r < s.length - 1;
    return /* @__PURE__ */ P("li", { className: Mo.item, children: [
      l ? /* @__PURE__ */ c("span", { className: Mo.current, children: i.label }) : i.href ? /* @__PURE__ */ c("a", { className: Mo.link, href: i.href, children: i.label }) : /* @__PURE__ */ c("span", { className: Mo.text, children: i.label }),
      d && /* @__PURE__ */ c("span", { className: Mo.separator, "aria-hidden": "true", children: t })
    ] }, `${i.label}-${r}`);
  }) }) });
}
const bz = "_root_1xahr_1", yz = "_pages_1xahr_2", vz = "_button_1xahr_3", wz = "_page_1xahr_2", kz = "_current_1xahr_5", _z = "_ellipsis_1xahr_6", $o = {
  root: bz,
  pages: yz,
  button: vz,
  page: wz,
  current: kz,
  ellipsis: _z
};
function xz(e, t) {
  return Math.min(Math.max(e, 1), t);
}
function Sz(e, t, a, n) {
  const s = [], i = /* @__PURE__ */ new Set(), r = (h) => {
    h < 1 || h > t || i.has(h) || (i.add(h), s.push(h));
  };
  if (t <= 7) {
    for (let h = 1; h <= t; h += 1) r(h);
    return s;
  }
  const l = Math.max(1, Math.min(n, t));
  for (let h = 1; h <= l; h += 1) r(h);
  const d = Math.max(2, e - a), u = Math.min(t - 1, e + a);
  d > l + 1 && s.push("ellipsis");
  for (let h = d; h <= u; h += 1) r(h);
  u < t - l && s.push("ellipsis");
  const m = Math.max(t - l + 1, l + 1);
  for (let h = m; h <= t; h += 1) r(h);
  return s;
}
function S6({ page: e, total: t, pageSize: a = 10, onPageChange: n, siblingCount: s = 1, boundaryCount: i = 1, className: r, ...l }) {
  const d = st(), u = Math.max(1, Math.ceil(t / a)), m = xz(e, u), h = Sz(m, u, s, i);
  return /* @__PURE__ */ P("nav", { "aria-label": "Pagination", className: I($o.root, r), ...l, children: [
    /* @__PURE__ */ c("button", { type: "button", className: $o.button, disabled: m <= 1, onClick: () => n(m - 1), children: d(_e.previous) }),
    /* @__PURE__ */ c("div", { className: $o.pages, children: h.map((f, b) => {
      if (f === "ellipsis")
        return /* @__PURE__ */ c("span", { className: $o.ellipsis, "aria-hidden": "true", children: "…" }, `ellipsis-${b}`);
      const w = f === m;
      return /* @__PURE__ */ c(
        "button",
        {
          type: "button",
          className: I($o.page, w && $o.current),
          "aria-current": w ? "page" : void 0,
          onClick: () => n(f),
          children: f
        },
        f
      );
    }) }),
    /* @__PURE__ */ c("button", { type: "button", className: $o.button, disabled: m >= u, onClick: () => n(m + 1), children: d(_e.next) })
  ] });
}
const Mz = "_root_1hvkk_1", $z = "_item_1hvkk_2", Tz = "_header_1hvkk_3", Cz = "_trigger_1hvkk_4", Nz = "_title_1hvkk_22", Dz = "_chevron_1hvkk_29", zz = "_content_1hvkk_30", To = {
  root: Mz,
  item: $z,
  header: Tz,
  trigger: Cz,
  title: Nz,
  chevron: Dz,
  content: zz
};
function Pz(e) {
  return Array.isArray(e) ? e : e ? [e] : [];
}
function M6({ items: e, defaultOpen: t, allowMultiple: a = !1, className: n, ...s }) {
  const [i, r] = pe(() => Pz(t)), l = Bt(() => e ?? [], [e]), d = (u) => {
    r((m) => {
      const h = m.includes(u);
      return a ? h ? m.filter((f) => f !== u) : [...m, u] : h ? [] : [u];
    });
  };
  return /* @__PURE__ */ c("div", { className: I(To.root, n), ...s, children: l.map((u) => {
    const m = i.includes(u.id);
    return /* @__PURE__ */ P("section", { className: To.item, children: [
      /* @__PURE__ */ c("h3", { className: To.header, children: /* @__PURE__ */ P("button", { type: "button", className: To.trigger, "aria-expanded": m, onClick: () => d(u.id), disabled: u.disabled, children: [
        /* @__PURE__ */ c("span", { className: To.title, children: u.title }),
        /* @__PURE__ */ c("span", { className: To.chevron, "aria-hidden": "true", children: m ? "−" : "+" })
      ] }) }),
      m && /* @__PURE__ */ c("div", { className: To.content, children: u.content })
    ] }, u.id);
  }) });
}
const Az = "_root_4z3h9_1", Oz = "_backdrop_4z3h9_7", Ez = "_ring_4z3h9_18", Wz = "_callout_4z3h9_32", Iz = "_close_4z3h9_57", Rz = "_title_4z3h9_63", Lz = "_description_4z3h9_67", qz = "_footer_4z3h9_71", Fz = "_count_4z3h9_79", Bz = "_actions_4z3h9_86", fa = {
  root: Az,
  backdrop: Oz,
  ring: Ez,
  callout: Wz,
  close: Iz,
  title: Rz,
  description: Lz,
  footer: qz,
  count: Fz,
  actions: Bz
}, Hz = /* @__PURE__ */ c("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M3 3l8 8M11 3l-8 8", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }) });
function $6({
  open: e,
  targetRef: t,
  title: a,
  description: n,
  placement: s = "bottom",
  cutoutPadding: i = 8,
  step: r,
  total: l,
  onNext: d,
  onBack: u,
  onClose: m,
  className: h
}) {
  const f = st(), b = Ee(), w = Ee(), S = Re(), $ = ee(null), [N, y] = pe(null), v = Va(e, t, $, { placement: s, offset: 12 }), _ = ia(t);
  xe(() => {
    if (!e) {
      y(null);
      return;
    }
    const A = () => {
      const F = t.current?.getBoundingClientRect();
      F && y({ top: F.top, left: F.left, width: F.width, height: F.height });
    };
    return A(), window.addEventListener("resize", A), window.addEventListener("scroll", A, !0), () => {
      window.removeEventListener("resize", A), window.removeEventListener("scroll", A, !0);
    };
  }, [e, t]), xe(() => {
    if (!e) return;
    const A = document.activeElement, F = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const L = requestAnimationFrame(() => $.current?.focus()), O = (q) => {
      q.key === "Escape" && m();
    };
    return document.addEventListener("keydown", O), () => {
      document.body.style.overflow = F, document.removeEventListener("keydown", O), cancelAnimationFrame(L), A?.focus();
    };
  }, [e, m]);
  function k(A) {
    if (A.key !== "Tab" || !$.current) return;
    const F = [
      ...$.current.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ];
    if (F.length === 0) {
      A.preventDefault();
      return;
    }
    const L = F[0], O = F[F.length - 1];
    A.shiftKey && (document.activeElement === L || document.activeElement === $.current) ? (A.preventDefault(), O.focus()) : !A.shiftKey && document.activeElement === O && (A.preventDefault(), L.focus());
  }
  if (!e) return null;
  const M = i, T = N ? {
    top: N.top - M,
    left: N.left - M,
    width: N.width + M * 2,
    height: N.height + M * 2
  } : null;
  return yn(
    /* @__PURE__ */ P("div", { className: fa.root, children: [
      /* @__PURE__ */ c(
        $e.div,
        {
          className: fa.backdrop,
          onClick: m,
          initial: { opacity: 0 },
          animate: { opacity: 1 },
          transition: S ? { duration: 0 } : { duration: 0.15 },
          children: T && /* @__PURE__ */ c(
            "div",
            {
              className: fa.ring,
              style: {
                top: T.top,
                left: T.left,
                width: T.width,
                height: T.height
              }
            }
          )
        }
      ),
      /* @__PURE__ */ P(
        $e.div,
        {
          ref: $,
          role: "dialog",
          "aria-modal": "true",
          "aria-labelledby": a ? b : void 0,
          "aria-describedby": n ? w : void 0,
          dir: _,
          className: I(fa.callout, h),
          style: v?.style,
          tabIndex: -1,
          onKeyDown: k,
          initial: S ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 4 },
          animate: { opacity: 1, scale: 1, y: 0 },
          transition: S ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
          children: [
            /* @__PURE__ */ c(Yn, { "aria-label": f(_e.closeTour), size: gn.Small, className: fa.close, onClick: m, children: Hz }),
            a && /* @__PURE__ */ c(sa, { level: 2, visualLevel: 4, id: b, className: fa.title, children: a }),
            n && /* @__PURE__ */ c(Pi, { tone: ti.Muted, size: gn.Small, id: w, className: fa.description, children: n }),
            /* @__PURE__ */ P("div", { className: fa.footer, children: [
              r != null && l != null && /* @__PURE__ */ P("span", { className: fa.count, "aria-label": f(_e.stepOf, { step: r, total: l }), children: [
                r,
                " / ",
                l
              ] }),
              /* @__PURE__ */ P("div", { className: fa.actions, children: [
                u && /* @__PURE__ */ c(wa, { variant: Ba.Ghost, size: gn.Small, onClick: u, children: f(_e.back) }),
                d && /* @__PURE__ */ c(wa, { variant: Ba.Solid, size: gn.Small, onClick: d, children: l != null && r === l ? f(_e.done) : f(_e.next) })
              ] })
            ] })
          ]
        }
      )
    ] }),
    document.body
  );
}
const jz = "_root_1hkvh_1", Yz = "_fullWidth_1hkvh_7", Vz = "_trigger_1hkvh_12", Gz = "_glass_1hkvh_61", Kz = "_value_1hkvh_70", Uz = "_chevrons_1hkvh_86", Xz = "_sm_1hkvh_95", Jz = "_md_1hkvh_99", Qz = "_lg_1hkvh_103", Zz = "_menu_1hkvh_119", eP = "_option_1hkvh_139", tP = "_menuSm_1hkvh_155", nP = "_check_1hkvh_169", Ln = {
  root: jz,
  fullWidth: Yz,
  trigger: Vz,
  glass: Gz,
  value: Kz,
  chevrons: Uz,
  sm: Xz,
  md: Jz,
  lg: Qz,
  menu: Zz,
  option: eP,
  menuSm: tP,
  check: nP
}, aP = /* @__PURE__ */ c("svg", { className: Ln.chevrons, width: "10", height: "14", viewBox: "0 0 10 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M1.5 5 5 1.5 8.5 5M1.5 9 5 12.5 8.5 9", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", strokeLinejoin: "round" }) }), oP = /* @__PURE__ */ c("svg", { width: "11", height: "11", viewBox: "0 0 12 12", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M2.5 6.5 5 9 9.5 3.5", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round" }) });
function T6({
  options: e,
  value: t,
  defaultValue: a,
  onValueChange: n,
  placeholder: s = "Select…",
  size: i = "md",
  fullWidth: r = !1,
  disabled: l = !1,
  skeleton: d = !1,
  glass: u = !1,
  name: m,
  id: h,
  className: f,
  "aria-label": b,
  ...w
}) {
  const S = Ee(), $ = Sa(), N = Re(), y = ee(null), v = ee(null), _ = ee(null), [k, M] = He(t, a ?? ""), [T, A] = pe(!1), [F, L] = pe(-1), [O, q] = pe(null), j = ia(_), D = e.find((z) => z.value === k), H = e.map((z, R) => z.disabled ? -1 : R).filter((z) => z >= 0);
  function K() {
    if (l || e.length === 0) return;
    const z = e.findIndex((R) => R.value === k && !R.disabled);
    L(z >= 0 ? z : H[0] ?? -1), A(!0);
  }
  function Y(z) {
    A(!1), z && _.current?.focus();
  }
  function se(z) {
    const R = e[z];
    !R || R.disabled || (M(R.value), n?.(R.value), Y(!0));
  }
  function te(z, R) {
    if (H.length === 0) return -1;
    const X = H.indexOf(z);
    if (X === -1) return R === 1 ? H[0] : H[H.length - 1];
    const le = Math.min(Math.max(X + R, 0), H.length - 1);
    return H[le];
  }
  function ne(z) {
    (z.key === "ArrowDown" || z.key === "ArrowUp") && !T && (z.preventDefault(), K());
  }
  function U(z) {
    switch (z.key) {
      case "ArrowDown":
        z.preventDefault(), L((R) => te(R, 1));
        break;
      case "ArrowUp":
        z.preventDefault(), L((R) => te(R, -1));
        break;
      case "Home":
        z.preventDefault(), L(H[0] ?? -1);
        break;
      case "End":
        z.preventDefault(), L(H[H.length - 1] ?? -1);
        break;
      case "Enter":
      case " ":
        z.preventDefault(), se(F);
        break;
      case "Escape":
        z.preventDefault(), Y(!0);
        break;
      case "Tab":
        Y(!1);
        break;
    }
  }
  return ys(() => {
    if (!T) return;
    function z() {
      const R = _.current?.getBoundingClientRect();
      if (!R) return;
      const X = 8, le = 16, me = window.innerHeight - R.bottom - X - le, ue = R.top - X - le, ze = me < 240 && ue > me, je = Math.max(120, Math.min(416, ze ? ue : me)), ht = bn(_.current) === "rtl" ? { right: Math.max(le, Math.min(window.innerWidth - R.right, window.innerWidth - R.width - le)) } : { left: Math.max(le, Math.min(R.left, window.innerWidth - R.width - le)) };
      q({
        openUp: ze,
        style: {
          position: "fixed",
          ...ht,
          minWidth: R.width,
          maxHeight: je,
          zIndex: 200,
          transformOrigin: ze ? "bottom" : "top",
          ...ze ? { bottom: window.innerHeight - R.top + X } : { top: R.bottom + X }
        }
      });
    }
    return z(), window.addEventListener("resize", z), document.addEventListener("scroll", z, !0), () => {
      window.removeEventListener("resize", z), document.removeEventListener("scroll", z, !0);
    };
  }, [T]), xe(() => {
    if (!T) return;
    v.current?.focus();
    const z = (R) => {
      const X = R.target;
      !y.current?.contains(X) && !v.current?.contains(X) && A(!1);
    };
    return document.addEventListener("pointerdown", z), () => document.removeEventListener("pointerdown", z);
  }, [T]), d ? /* @__PURE__ */ c(
    J,
    {
      width: r ? "100%" : "11rem",
      height: `var(--glacier-control-height-${i})`,
      radius: "var(--glacier-radius-lg)",
      className: f
    }
  ) : /* @__PURE__ */ P("div", { ...w, ref: y, className: I(Ln.root, Ln[i], r && Ln.fullWidth, f), children: [
    /* @__PURE__ */ P(
      "button",
      {
        ref: _,
        type: "button",
        id: h ?? $?.id,
        className: I(Ln.trigger, Ln[i], u && Ln.glass),
        disabled: l,
        "aria-haspopup": "listbox",
        "aria-expanded": T,
        "aria-controls": T ? S : void 0,
        "aria-describedby": $?.describedBy,
        "aria-invalid": $?.invalid || void 0,
        "aria-label": b,
        "data-placeholder": D ? void 0 : !0,
        onClick: () => T ? Y(!0) : K(),
        onKeyDown: ne,
        children: [
          /* @__PURE__ */ c("span", { className: Ln.value, children: D ? D.label : s }),
          aP
        ]
      }
    ),
    m && /* @__PURE__ */ c("input", { type: "hidden", name: m, value: k }),
    T && O && yn(
      /* @__PURE__ */ c(
        $e.ul,
        {
          ref: v,
          id: S,
          role: "listbox",
          dir: j,
          className: I(Ln.menu, i === "sm" && Ln.menuSm),
          style: O.style,
          tabIndex: -1,
          "aria-label": b,
          "aria-activedescendant": F >= 0 ? `${S}-${F}` : void 0,
          onKeyDown: U,
          initial: N ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: O.openUp ? 4 : -4 },
          animate: { opacity: 1, scale: 1, y: 0 },
          transition: N ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
          children: e.map((z, R) => /* @__PURE__ */ P(
            "li",
            {
              id: `${S}-${R}`,
              role: "option",
              className: Ln.option,
              "aria-selected": z.value === k,
              "aria-disabled": z.disabled || void 0,
              "data-active": R === F && !z.disabled || void 0,
              "data-disabled": z.disabled || void 0,
              onMouseEnter: () => !z.disabled && L(R),
              onClick: () => se(R),
              children: [
                /* @__PURE__ */ c("span", { className: Ln.check, children: z.value === k && oP }),
                z.label
              ]
            },
            z.value
          ))
        }
      ),
      document.body
    )
  ] });
}
const sP = "_list_4nha5_1", iP = "_fullWidth_4nha5_7", rP = "_tab_4nha5_7", lP = "_indicator_4nha5_52", cP = "_panel_4nha5_61", no = {
  list: sP,
  fullWidth: iP,
  tab: rP,
  indicator: lP,
  panel: cP
};
function C6({
  tabs: e,
  value: t,
  defaultValue: a,
  onValueChange: n,
  spring: s = xa.Snappy,
  fullWidth: i = !1,
  skeleton: r = !1,
  className: l,
  "aria-label": d,
  ...u
}) {
  const m = Ee(), h = Re(), f = ee(/* @__PURE__ */ new Map()), b = a ?? e.find((k) => !k.disabled)?.value ?? "", [w, S] = He(t, b);
  if (r)
    return /* @__PURE__ */ P("div", { ...u, className: l, children: [
      /* @__PURE__ */ c("div", { className: I(no.list, i && no.fullWidth), children: [0, 1, 2].map((k) => /* @__PURE__ */ c(
        "span",
        {
          style: {
            display: "inline-flex",
            justifyContent: "center",
            flex: i ? 1 : void 0,
            padding: "var(--glacier-space-3) var(--glacier-space-4)"
          },
          children: /* @__PURE__ */ c(J, { variant: De.Text, width: "4rem" })
        },
        k
      )) }),
      /* @__PURE__ */ P("div", { className: no.panel, style: { display: "grid", gap: "var(--glacier-space-2)" }, children: [
        /* @__PURE__ */ c(J, { variant: De.Text, width: "100%" }),
        /* @__PURE__ */ c(J, { variant: De.Text, width: "70%" })
      ] })
    ] });
  const $ = e.findIndex((k) => k.value === w), N = $ >= 0 ? e[$] : void 0, y = e.filter((k) => !k.disabled);
  function v(k, M) {
    S(k.value), n?.(k.value), M && f.current.get(k.value)?.focus();
  }
  function _(k) {
    if (y.length === 0) return;
    const M = y.findIndex((A) => A.value === w), T = bn(k.currentTarget) === "rtl" ? -1 : 1;
    switch (k.key) {
      case "ArrowRight":
        k.preventDefault(), v(y[(M + T + y.length) % y.length], !0);
        break;
      case "ArrowLeft":
        k.preventDefault(), v(y[(M - T + y.length) % y.length], !0);
        break;
      case "Home":
        k.preventDefault(), v(y[0], !0);
        break;
      case "End":
        k.preventDefault(), v(y[y.length - 1], !0);
        break;
    }
  }
  return /* @__PURE__ */ P("div", { ...u, className: l, children: [
    /* @__PURE__ */ c(
      "div",
      {
        role: "tablist",
        "aria-label": d,
        className: I(no.list, i && no.fullWidth),
        onKeyDown: _,
        children: e.map((k, M) => {
          const T = k.value === w;
          return /* @__PURE__ */ P(
            "button",
            {
              ref: (A) => {
                A ? f.current.set(k.value, A) : f.current.delete(k.value);
              },
              type: "button",
              role: "tab",
              id: `${m}-tab-${M}`,
              "aria-selected": T,
              "aria-controls": `${m}-panel-${M}`,
              tabIndex: T ? 0 : -1,
              disabled: k.disabled,
              className: no.tab,
              "data-haptic": "selection",
              onClick: () => v(k, !1),
              children: [
                k.label,
                T && /* @__PURE__ */ c(
                  $e.span,
                  {
                    layoutId: `${m}-indicator`,
                    className: no.indicator,
                    transition: h ? { duration: 0 } : Ya(s),
                    "aria-hidden": "true"
                  }
                )
              ]
            },
            k.value
          );
        })
      }
    ),
    N && /* @__PURE__ */ c(
      $e.div,
      {
        role: "tabpanel",
        id: `${m}-panel-${$}`,
        "aria-labelledby": `${m}-tab-${$}`,
        tabIndex: 0,
        className: no.panel,
        initial: h ? !1 : { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        transition: h ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
        children: N.content
      },
      N.value
    )
  ] });
}
const dP = "_host_ayduc_4", uP = "_shadow_ayduc_14", hP = "_glass_ayduc_23", mP = "_outline_ayduc_32", yi = {
  host: dP,
  shadow: uP,
  glass: hP,
  outline: mP
};
function pP(e) {
  const [t, a] = e.split("-");
  return { side: t, align: a ?? "center" };
}
function fP(e, t, a, n, s, i, r) {
  const { side: l, align: d } = pP(n), u = Math.max(0, Math.min(a, Math.min(e, t) / 2 - 1)), m = ($) => d === "start" ? r + i : d === "end" ? $ - r - i : $ / 2;
  if (l === "top" || l === "bottom") {
    const $ = m(e), N = l === "top" ? { top: 0, left: 0, width: e, height: t + s } : { top: -s, left: 0, width: e, height: t + s }, y = l === "top" ? 0 : s, v = y + t;
    return { d: l === "top" ? (
      // tip on the BOTTOM edge, pointing down
      `M ${u} ${y} H ${e - u} A ${u} ${u} 0 0 1 ${e} ${y + u} V ${v - u} A ${u} ${u} 0 0 1 ${e - u} ${v} H ${$ + i} L ${$} ${v + s} L ${$ - i} ${v} H ${u} A ${u} ${u} 0 0 1 0 ${v - u} V ${y + u} A ${u} ${u} 0 0 1 ${u} ${y} Z`
    ) : (
      // tip on the TOP edge, pointing up
      `M ${u} ${y} H ${$ - i} L ${$} ${y - s} L ${$ + i} ${y} H ${e - u} A ${u} ${u} 0 0 1 ${e} ${y + u} V ${v - u} A ${u} ${u} 0 0 1 ${e - u} ${v} H ${u} A ${u} ${u} 0 0 1 0 ${v - u} V ${y + u} A ${u} ${u} 0 0 1 ${u} ${y} Z`
    ), box: N };
  }
  const h = m(t), f = l === "left" ? { top: 0, left: 0, width: e + s, height: t } : { top: 0, left: -s, width: e + s, height: t }, b = l === "left" ? 0 : s, w = b + e;
  return { d: l === "left" ? (
    // tip on the RIGHT edge, pointing right
    `M ${b + u} 0 H ${w - u} A ${u} ${u} 0 0 1 ${w} ${u} V ${h - i} L ${w + s} ${h} L ${w} ${h + i} V ${t - u} A ${u} ${u} 0 0 1 ${w - u} ${t} H ${b + u} A ${u} ${u} 0 0 1 ${b} ${t - u} V ${u} A ${u} ${u} 0 0 1 ${b + u} 0 Z`
  ) : (
    // tip on the LEFT edge, pointing left
    `M ${b + u} 0 H ${w - u} A ${u} ${u} 0 0 1 ${w} ${u} V ${t - u} A ${u} ${u} 0 0 1 ${w - u} ${t} H ${b + u} A ${u} ${u} 0 0 1 ${b} ${t - u} V ${h + i} L ${b - s} ${h} L ${b} ${h - i} V ${u} A ${u} ${u} 0 0 1 ${b + u} 0 Z`
  ), box: f };
}
function Mu({ placement: e, tip: t = 6, tipHalf: a = 7, tipInset: n = 14 }) {
  const s = ee(null), [i, r] = pe(null);
  ys(() => {
    const u = s.current?.parentElement;
    if (!u || !e) return;
    const m = () => {
      const f = u.offsetWidth, b = u.offsetHeight;
      if (!f || !b) return;
      const w = parseFloat(getComputedStyle(s.current).borderTopLeftRadius) || 0;
      r(fP(f, b, w, e, t, a, n));
    };
    if (m(), typeof ResizeObserver > "u") return;
    const h = new ResizeObserver(m);
    return h.observe(u), () => h.disconnect();
  }, [e, t, a, n]);
  const l = i ? {
    top: i.box.top,
    left: i.box.left,
    width: i.box.width,
    height: i.box.height
  } : void 0, d = i ? { clipPath: `path('${i.d}')` } : void 0;
  return /* @__PURE__ */ c("div", { ref: s, className: yi.host, "aria-hidden": "true", children: i && /* @__PURE__ */ P(vs, { children: [
    /* @__PURE__ */ c("div", { className: yi.shadow, style: { ...l, ...d } }),
    /* @__PURE__ */ c("div", { className: yi.glass, style: { ...l, ...d } }),
    /* @__PURE__ */ c(
      "svg",
      {
        className: yi.outline,
        style: l,
        width: i.box.width,
        height: i.box.height,
        viewBox: `0 0 ${i.box.width} ${i.box.height}`,
        children: /* @__PURE__ */ c("path", { d: i.d, fill: "none" })
      }
    )
  ] }) });
}
const gP = "_positioner_1lluq_1", bP = "_bubble_1lluq_11", Rc = {
  positioner: gP,
  bubble: bP
};
function yP({
  content: e,
  children: t,
  placement: a = "top",
  delay: n = 300,
  disabled: s = !1,
  skeleton: i = !1,
  className: r
}) {
  const l = Ee(), d = Re(), u = ee(null), m = ee(null), h = ee(null), [f, b] = pe(!1), [w, S] = pe(!1), $ = ia(u), N = Va(w, u, m, { placement: a, offset: 10 });
  function y() {
    h.current !== null && (clearTimeout(h.current), h.current = null);
  }
  function v(T) {
    s || (y(), T && n > 0 ? h.current = setTimeout(() => {
      h.current = null, b(!0);
    }, n) : b(!0));
  }
  function _() {
    y(), b(!1);
  }
  if (xe(() => {
    f && S(!0);
  }, [f]), xe(() => y, []), xe(() => {
    if (!w) return;
    const T = (A) => {
      A.key === "Escape" && _();
    };
    return document.addEventListener("keydown", T), () => document.removeEventListener("keydown", T);
  }, [w]), i || s)
    return t;
  const k = t.props, M = Xs(t, {
    ref: u,
    "aria-describedby": I(k["aria-describedby"], f ? l : "") || void 0,
    onPointerEnter: (T) => {
      k.onPointerEnter?.(T), T.pointerType !== "touch" && v(!0);
    },
    onPointerLeave: (T) => {
      k.onPointerLeave?.(T), _();
    },
    onFocus: (T) => {
      k.onFocus?.(T), v(!1);
    },
    onBlur: (T) => {
      k.onBlur?.(T), _();
    }
  });
  return /* @__PURE__ */ P(vs, { children: [
    M,
    w && yn(
      /* @__PURE__ */ P(
        $e.div,
        {
          ref: m,
          id: l,
          role: "tooltip",
          dir: $,
          className: Rc.positioner,
          "data-placement": N?.placement,
          style: N?.style,
          initial: d ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 2 },
          animate: f ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: 1 },
          transition: d ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
          onAnimationComplete: () => {
            f || S(!1);
          },
          children: [
            /* @__PURE__ */ c(Mu, { placement: N?.placement, tip: 5, tipHalf: 6, tipInset: 12 }),
            /* @__PURE__ */ c("div", { className: I(Rc.bubble, r), children: e })
          ]
        }
      ),
      document.body
    )
  ] });
}
const vP = "_viewport_nrgyi_1", wP = "_item_nrgyi_13", kP = "_pill_nrgyi_22", _P = "_icon_nrgyi_42", xP = "_message_nrgyi_48", SP = "_dismiss_nrgyi_53", MP = "_neutral_nrgyi_81", $P = "_info_nrgyi_87", TP = "_success_nrgyi_93", CP = "_warning_nrgyi_99", NP = "_danger_nrgyi_105", DP = "_glass_nrgyi_112", oo = {
  viewport: vP,
  item: wP,
  pill: kP,
  icon: _P,
  message: xP,
  dismiss: SP,
  neutral: MP,
  info: $P,
  success: TP,
  warning: CP,
  danger: NP,
  glass: DP
}, zP = {
  neutral: 4500,
  info: 4500,
  success: 3500,
  warning: 4500,
  danger: 7e3
}, PP = /* @__PURE__ */ c("svg", { width: "12", height: "12", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M3 3l8 8M11 3l-8 8", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }) });
function AP({
  tone: e = "neutral",
  message: t,
  icon: a,
  dismissible: n = !0,
  onDismiss: s,
  glass: i = !1,
  skeleton: r = !1,
  className: l
}) {
  const d = st();
  if (r)
    return /* @__PURE__ */ c(
      J,
      {
        width: "18rem",
        height: "2.75rem",
        radius: "var(--glacier-radius-full)",
        className: l
      }
    );
  const u = e === "danger";
  return /* @__PURE__ */ P(
    "div",
    {
      role: u ? "alert" : "status",
      "aria-live": u ? "assertive" : "polite",
      className: I(oo.pill, oo[e], i && oo.glass, l),
      onClick: s,
      children: [
        a != null && /* @__PURE__ */ c("span", { className: oo.icon, children: a }),
        /* @__PURE__ */ c("span", { className: oo.message, children: t }),
        n && /* @__PURE__ */ c(
          "button",
          {
            type: "button",
            "aria-label": d(_e.dismiss),
            className: oo.dismiss,
            onClick: (m) => {
              m.stopPropagation(), s?.();
            },
            children: PP
          }
        )
      ]
    }
  );
}
const $u = _a(null);
function N6({ children: e }) {
  const [t, a] = pe(null), n = ee(0), s = Re(), i = at(() => a(null), []), r = at((d) => {
    n.current += 1, a({ ...d, id: n.current });
  }, []);
  xe(() => {
    if (!t) return;
    const d = t.tone ?? "neutral", u = t.duration ?? zP[d] ?? 0;
    if (u <= 0) return;
    const m = t.id, h = setTimeout(() => {
      a((f) => f && f.id === m ? null : f);
    }, u);
    return () => clearTimeout(h);
  }, [t]);
  const l = Bt(() => ({ toast: r, dismiss: i }), [r, i]);
  return /* @__PURE__ */ P($u.Provider, { value: l, children: [
    e,
    yn(
      /* @__PURE__ */ c("div", { className: oo.viewport, children: /* @__PURE__ */ c(zi, { children: t && /* @__PURE__ */ c(
        $e.div,
        {
          className: oo.item,
          initial: s ? { opacity: 0 } : { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          exit: s ? { opacity: 0 } : { opacity: 0, y: 12 },
          transition: s ? { duration: 0 } : Ya(xa.Snappy),
          children: /* @__PURE__ */ c(
            AP,
            {
              tone: t.tone,
              message: t.message,
              icon: t.icon,
              dismissible: t.dismissible,
              glass: t.glass,
              onDismiss: i
            }
          )
        },
        t.id
      ) }) }),
      document.body
    )
  ] });
}
function D6() {
  const e = Gn($u);
  if (!e)
    throw new Error("useToast must be used within a ToastProvider");
  return e;
}
function ho(e, t) {
  return e ?? t;
}
const Tu = ["base", "sm", "md", "lg", "xl"], hs = (e) => `var(--glacier-space-${e})`;
function Ia(e, t, a) {
  if (a !== void 0) {
    if (typeof a == "number") {
      e[`--pl-${t}-base`] = hs(a);
      return;
    }
    for (const n of Tu) {
      const s = a[n];
      s !== void 0 && (e[`--pl-${t}-${n}`] = hs(s));
    }
  }
}
function OP(e, t) {
  if (t !== void 0) {
    if (typeof t == "number") {
      e["--pl-cols-base"] = String(t);
      return;
    }
    for (const a of Tu) {
      const n = t[a];
      n !== void 0 && (e[`--pl-cols-${a}`] = String(n));
    }
  }
}
function ws(e) {
  const t = {};
  Ia(t, "pt", e.padding), Ia(t, "pr", e.padding), Ia(t, "pb", e.padding), Ia(t, "pl", e.padding), Ia(t, "pl", e.paddingX), Ia(t, "pr", e.paddingX), Ia(t, "pt", e.paddingY), Ia(t, "pb", e.paddingY), e.paddingTop !== void 0 && (t["--pl-pt-base"] = hs(e.paddingTop)), e.paddingRight !== void 0 && (t["--pl-pr-base"] = hs(e.paddingRight)), e.paddingBottom !== void 0 && (t["--pl-pb-base"] = hs(e.paddingBottom)), e.paddingLeft !== void 0 && (t["--pl-pl-base"] = hs(e.paddingLeft));
  const a = {
    "data-bg": e.background,
    "data-radius": e.radius,
    "data-border": e.border === !0 ? "default" : e.border || void 0,
    "data-elevation": e.elevation !== void 0 ? String(e.elevation) : void 0,
    "data-w": e.width,
    "data-maxw": e.maxWidth,
    "data-h": e.height,
    "data-grow": e.grow ? "" : void 0,
    "data-shrink": e.shrink ? "" : void 0,
    "data-self": e.alignSelf
  };
  return { style: t, attrs: a };
}
function ll(e) {
  const t = {};
  Ia(t, "gap", e.gap);
  const a = {
    "data-align": e.align,
    "data-justify": e.justify
  };
  return { style: t, attrs: a };
}
function ks(e) {
  const {
    padding: t,
    paddingX: a,
    paddingY: n,
    paddingTop: s,
    paddingRight: i,
    paddingBottom: r,
    paddingLeft: l,
    background: d,
    radius: u,
    border: m,
    elevation: h,
    width: f,
    maxWidth: b,
    height: w,
    grow: S,
    shrink: $,
    alignSelf: N,
    ...y
  } = e;
  return {
    box: {
      padding: t,
      paddingX: a,
      paddingY: n,
      paddingTop: s,
      paddingRight: i,
      paddingBottom: r,
      paddingLeft: l,
      background: d,
      radius: u,
      border: m,
      elevation: h,
      width: f,
      maxWidth: b,
      height: w,
      grow: S,
      shrink: $,
      alignSelf: N
    },
    rest: y
  };
}
const EP = "_box_1ufty_13", WP = "_stack_1ufty_86", IP = "_row_1ufty_93", RP = "_grid_1ufty_105", LP = "_center_1ufty_115", qP = "_spacer_1ufty_120", FP = "_container_1ufty_125", Vn = {
  box: EP,
  stack: WP,
  row: IP,
  grid: RP,
  center: LP,
  spacer: qP,
  container: FP
};
function z6({ as: e, className: t, style: a, children: n, ...s }) {
  const { box: i, rest: r } = ks(s), l = ws(i), d = ho(e, "div");
  return /* @__PURE__ */ c(
    d,
    {
      className: I(Vn.box, t),
      style: { ...l.style, ...a },
      ...l.attrs,
      ...r,
      children: n
    }
  );
}
function P6({
  as: e,
  gap: t = 4,
  align: a,
  justify: n,
  className: s,
  style: i,
  children: r,
  ...l
}) {
  const { box: d, rest: u } = ks(l), m = ws(d), h = ll({ gap: t, align: a, justify: n }), f = ho(e, "div");
  return /* @__PURE__ */ c(
    f,
    {
      className: I(Vn.box, Vn.stack, s),
      style: { ...m.style, ...h.style, ...i },
      ...m.attrs,
      ...h.attrs,
      ...u,
      children: r
    }
  );
}
function A6({
  as: e,
  gap: t = 3,
  align: a,
  justify: n,
  wrap: s = !1,
  className: i,
  style: r,
  children: l,
  ...d
}) {
  const { box: u, rest: m } = ks(d), h = ws(u), f = ll({ gap: t, align: a, justify: n }), b = ho(e, "div");
  return /* @__PURE__ */ c(
    b,
    {
      className: I(Vn.box, Vn.row, i),
      style: { ...h.style, ...f.style, ...r },
      "data-wrap": s ? "" : void 0,
      ...h.attrs,
      ...f.attrs,
      ...m,
      children: l
    }
  );
}
function O6({
  as: e,
  gap: t = 4,
  columns: a = 1,
  minChildWidth: n,
  align: s,
  justify: i,
  className: r,
  style: l,
  children: d,
  ...u
}) {
  const { box: m, rest: h } = ks(u), f = ws(m), b = ll({ gap: t, align: s, justify: i }), w = { ...b.style };
  n ? w["--pl-min"] = n : OP(w, a);
  const S = ho(e, "div");
  return /* @__PURE__ */ c(
    S,
    {
      className: I(Vn.box, Vn.grid, r),
      style: { ...f.style, ...w, ...l },
      "data-autofit": n ? "" : void 0,
      ...f.attrs,
      ...b.attrs,
      ...h,
      children: d
    }
  );
}
function E6({ as: e, className: t, style: a, children: n, ...s }) {
  const { box: i, rest: r } = ks(s), l = ws(i), d = ho(e, "div");
  return /* @__PURE__ */ c(
    d,
    {
      className: I(Vn.box, Vn.center, t),
      style: { ...l.style, ...a },
      ...l.attrs,
      ...r,
      children: n
    }
  );
}
function W6({ className: e }) {
  return /* @__PURE__ */ c("div", { "aria-hidden": "true", className: I(Vn.spacer, e) });
}
function I6({ as: e, size: t = "lg", className: a, style: n, children: s, ...i }) {
  const { box: r, rest: l } = ks(i), d = r.padding !== void 0 || r.paddingX !== void 0 || r.paddingLeft !== void 0, u = ws({
    ...r,
    maxWidth: t,
    paddingX: d ? r.paddingX : { base: 4, md: 6 }
  }), m = ho(e, "div");
  return /* @__PURE__ */ c(
    m,
    {
      className: I(Vn.box, Vn.container, a),
      style: { ...u.style, ...n },
      ...u.attrs,
      ...l,
      children: s
    }
  );
}
const BP = "_group_7ubfr_1", HP = "_grid_7ubfr_18", jP = "_list_7ubfr_22", xr = {
  group: BP,
  grid: HP,
  list: jP
};
function R6({
  mode: e = "grid",
  minItemWidth: t = "16rem",
  gap: a = "md",
  density: n = "comfortable",
  skeleton: s = !1,
  skeletonCount: i = 6,
  className: r,
  style: l,
  children: d,
  ...u
}) {
  const m = { "--card-group-min": t }, h = I(xr.group, e === "list" ? xr.list : xr.grid, r);
  return s ? /* @__PURE__ */ c(
    "div",
    {
      className: h,
      "data-gap": a,
      "data-density": n,
      style: { ...m, ...l },
      "aria-hidden": !0,
      ...u,
      children: Array.from({ length: Math.max(1, i) }, (f, b) => /* @__PURE__ */ c(
        J,
        {
          variant: "rect",
          width: "100%",
          height: "8rem",
          radius: "var(--glacier-radius-xl)"
        },
        b
      ))
    }
  ) : /* @__PURE__ */ c(
    "div",
    {
      className: h,
      "data-gap": a,
      "data-density": n,
      style: { ...m, ...l },
      ...u,
      children: d
    }
  );
}
const YP = "_sidebar_js6el_1", VP = "_region_js6el_11", GP = "_regionBordered_js6el_17", KP = "_footer_js6el_21", UP = "_body_js6el_26", XP = "_section_js6el_38", JP = "_sectionTitle_js6el_42", QP = "_sectionItems_js6el_52", ZP = "_item_js6el_58", e3 = "_indicator_js6el_102", t3 = "_itemIcon_js6el_116", n3 = "_itemLabel_js6el_117", a3 = "_itemTrailing_js6el_118", nn = {
  sidebar: YP,
  region: VP,
  regionBordered: GP,
  footer: KP,
  body: UP,
  section: XP,
  sectionTitle: JP,
  sectionItems: QP,
  item: ZP,
  indicator: e3,
  itemIcon: t3,
  itemLabel: n3,
  itemTrailing: a3
}, Cu = _a(null);
function L6({ header: e, footer: t, spring: a = xa.Snappy, className: n, children: s, ...i }) {
  const r = Ee(), l = Re(), d = {
    layoutId: `${r}-active`,
    transition: l ? { duration: 0 } : Ya(a)
  };
  return /* @__PURE__ */ c(Cu.Provider, { value: d, children: /* @__PURE__ */ P("div", { className: I(nn.sidebar, n), ...i, children: [
    e && /* @__PURE__ */ c("div", { className: I(nn.region, nn.regionBordered), children: e }),
    /* @__PURE__ */ c("div", { className: nn.body, children: s }),
    t && /* @__PURE__ */ c("div", { className: I(nn.region, nn.footer), children: t })
  ] }) });
}
function q6({ title: e, className: t, children: a, ...n }) {
  return /* @__PURE__ */ P("div", { className: I(nn.section, t), ...n, children: [
    e && /* @__PURE__ */ c("div", { className: nn.sectionTitle, children: e }),
    /* @__PURE__ */ c("div", { className: nn.sectionItems, children: a })
  ] });
}
function F6({
  as: e,
  icon: t,
  active: a = !1,
  trailing: n,
  disabled: s,
  className: i,
  children: r,
  ...l
}) {
  const d = ho(e, "button"), u = (e ?? "button") === "button" ? { type: "button", disabled: s } : {}, m = Gn(Cu);
  return /* @__PURE__ */ P(
    d,
    {
      className: I(nn.item, i),
      "data-active": a || void 0,
      "aria-current": a ? "page" : void 0,
      "aria-disabled": s || void 0,
      ...u,
      ...l,
      children: [
        a && (m ? /* @__PURE__ */ c(
          $e.span,
          {
            className: nn.indicator,
            layoutId: m.layoutId,
            transition: m.transition,
            "aria-hidden": "true"
          }
        ) : /* @__PURE__ */ c("span", { className: nn.indicator, "aria-hidden": "true" })),
        t && /* @__PURE__ */ c("span", { className: nn.itemIcon, "aria-hidden": "true", children: t }),
        /* @__PURE__ */ c("span", { className: nn.itemLabel, children: r }),
        n && /* @__PURE__ */ c("span", { className: nn.itemTrailing, children: n })
      ]
    }
  );
}
const o3 = "_toolbar_1a2u4_1", s3 = "_content_1a2u4_27", i3 = "_slot_1a2u4_35", vi = {
  toolbar: o3,
  content: s3,
  slot: i3
};
function B6({
  start: e,
  end: t,
  sticky: a = !1,
  border: n = !1,
  surface: s = !1,
  className: i,
  children: r,
  ...l
}) {
  return /* @__PURE__ */ P(
    "div",
    {
      className: I(vi.toolbar, i),
      "data-sticky": a || void 0,
      "data-border": n || void 0,
      "data-surface": s || void 0,
      ...l,
      children: [
        e && /* @__PURE__ */ c("div", { className: vi.slot, children: e }),
        /* @__PURE__ */ c("div", { className: vi.content, children: r }),
        t && /* @__PURE__ */ c("div", { className: vi.slot, children: t })
      ]
    }
  );
}
const r3 = "_bar_15btb_5", l3 = "_slot_15btb_35", c3 = "_endSlot_15btb_43", d3 = "_center_15btb_47", u3 = "_title_15btb_56", Zn = {
  bar: r3,
  slot: l3,
  endSlot: c3,
  center: d3,
  title: u3
};
function H6({
  title: e,
  start: t,
  end: a,
  trafficLightInset: n = !1,
  surface: s = !0,
  border: i = !0,
  skeleton: r = !1,
  role: l = "banner",
  className: d,
  children: u,
  ...m
}) {
  return r ? /* @__PURE__ */ P(
    "header",
    {
      className: I(Zn.bar, d),
      "data-inset": n || void 0,
      "data-surface": s || void 0,
      "data-border": i || void 0,
      "data-tauri-drag-region": "",
      "aria-hidden": "true",
      ...m,
      children: [
        /* @__PURE__ */ c("div", { className: Zn.slot }),
        /* @__PURE__ */ c("div", { className: Zn.center, children: /* @__PURE__ */ c(J, { variant: "text", width: "8rem" }) }),
        /* @__PURE__ */ c("div", { className: I(Zn.slot, Zn.endSlot) })
      ]
    }
  ) : /* @__PURE__ */ P(
    "header",
    {
      className: I(Zn.bar, d),
      role: l,
      "data-inset": n || void 0,
      "data-surface": s || void 0,
      "data-border": i || void 0,
      "data-tauri-drag-region": "",
      ...m,
      children: [
        /* @__PURE__ */ c("div", { className: Zn.slot, children: t }),
        /* @__PURE__ */ P("div", { className: Zn.center, children: [
          e && /* @__PURE__ */ c("div", { className: Zn.title, "data-tauri-drag-region": "", children: e }),
          u
        ] }),
        /* @__PURE__ */ c("div", { className: I(Zn.slot, Zn.endSlot), children: a })
      ]
    }
  );
}
const h3 = "_section_15fkn_1", m3 = "_header_15fkn_47", p3 = "_headerText_15fkn_55", f3 = "_description_15fkn_63", g3 = "_actions_15fkn_69", b3 = "_content_15fkn_76", y3 = "_skeletonLines_15fkn_81", Mn = {
  section: h3,
  header: m3,
  headerText: p3,
  description: f3,
  actions: g3,
  content: b3,
  skeletonLines: y3
};
function j6({
  title: e,
  description: t,
  actions: a,
  headingLevel: n = 2,
  gap: s = "md",
  divider: i = !1,
  density: r = "comfortable",
  skeleton: l = !1,
  className: d,
  children: u,
  ...m
}) {
  const h = Ee(), f = !!(e || t || a);
  return l ? /* @__PURE__ */ P(
    "section",
    {
      "aria-hidden": "true",
      className: I(Mn.section, d),
      "data-gap": s,
      "data-density": r,
      "data-divider": i || void 0,
      ...m,
      children: [
        f && /* @__PURE__ */ P("div", { className: Mn.header, children: [
          (e || t) && /* @__PURE__ */ P("div", { className: Mn.headerText, children: [
            e && /* @__PURE__ */ c(sa, { level: n, noMargin: !0, skeleton: !0 }),
            t && /* @__PURE__ */ c("div", { className: Mn.description, children: /* @__PURE__ */ c(J, { variant: "text", width: "18rem" }) })
          ] }),
          a && /* @__PURE__ */ c("div", { className: Mn.actions, children: /* @__PURE__ */ c(
            J,
            {
              width: "6rem",
              height: "var(--glacier-control-height-md)",
              radius: "var(--glacier-control-radius)"
            }
          ) })
        ] }),
        /* @__PURE__ */ P("div", { className: I(Mn.content, Mn.skeletonLines), children: [
          /* @__PURE__ */ c(J, { variant: "text", width: "100%" }),
          /* @__PURE__ */ c(J, { variant: "text", width: "92%" }),
          /* @__PURE__ */ c(J, { variant: "text", width: "61%" })
        ] })
      ]
    }
  ) : /* @__PURE__ */ P(
    "section",
    {
      "aria-labelledby": e ? h : void 0,
      className: I(Mn.section, d),
      "data-gap": s,
      "data-density": r,
      "data-divider": i || void 0,
      ...m,
      children: [
        f && /* @__PURE__ */ P("div", { className: Mn.header, children: [
          (e || t) && /* @__PURE__ */ P("div", { className: Mn.headerText, children: [
            e && /* @__PURE__ */ c(sa, { id: h, level: n, noMargin: !0, children: e }),
            t && /* @__PURE__ */ c("div", { className: Mn.description, children: t })
          ] }),
          a && /* @__PURE__ */ c("div", { className: Mn.actions, children: a })
        ] }),
        /* @__PURE__ */ c("div", { className: Mn.content, children: u })
      ]
    }
  );
}
const v3 = "_header_79k8c_1", w3 = "_breadcrumbs_79k8c_17", k3 = "_row_79k8c_27", _3 = "_titleBlock_79k8c_34", x3 = "_title_79k8c_34", S3 = "_description_79k8c_56", M3 = "_meta_79k8c_62", $3 = "_actions_79k8c_72", Vt = {
  header: v3,
  breadcrumbs: w3,
  row: k3,
  titleBlock: _3,
  title: x3,
  description: S3,
  meta: M3,
  actions: $3
}, Lc = {
  moreActions: {
    en: "More actions",
    es: "Más acciones",
    fr: "Plus d'actions",
    de: "Weitere Aktionen",
    ja: "その他の操作",
    pt: "Mais ações",
    zh: "更多操作",
    ar: "المزيد من الإجراءات"
  }
}, T3 = /* @__PURE__ */ P("svg", { width: "16", height: "16", viewBox: "0 0 16 16", fill: "currentColor", "aria-hidden": "true", children: [
  /* @__PURE__ */ c("circle", { cx: "3.25", cy: "8", r: "1.25" }),
  /* @__PURE__ */ c("circle", { cx: "8", cy: "8", r: "1.25" }),
  /* @__PURE__ */ c("circle", { cx: "12.75", cy: "8", r: "1.25" })
] });
function Y6({
  title: e,
  description: t,
  breadcrumbs: a,
  meta: n,
  actions: s,
  secondaryActions: i,
  headingLevel: r = 1,
  density: l = "comfortable",
  skeleton: d = !1,
  className: u,
  ...m
}) {
  const h = st(), f = i ?? [], b = f.length > 0, w = (N) => !!N, S = w(s);
  if (d)
    return /* @__PURE__ */ P(
      "header",
      {
        "aria-hidden": "true",
        className: I(Vt.header, u),
        "data-density": l,
        ...m,
        children: [
          w(a) && /* @__PURE__ */ c("div", { className: Vt.breadcrumbs, children: /* @__PURE__ */ c(J, { variant: "text", width: "10rem" }) }),
          /* @__PURE__ */ P("div", { className: Vt.row, children: [
            /* @__PURE__ */ P("div", { className: Vt.titleBlock, children: [
              /* @__PURE__ */ c("div", { className: Vt.title, children: /* @__PURE__ */ c(J, { variant: "text", width: "12rem" }) }),
              w(t) && /* @__PURE__ */ c("div", { className: Vt.description, children: /* @__PURE__ */ c(J, { variant: "text", width: "18rem" }) }),
              w(n) && /* @__PURE__ */ c("div", { className: Vt.meta, children: /* @__PURE__ */ c(J, { variant: "text", width: "8rem" }) })
            ] }),
            (S || b) && /* @__PURE__ */ c("div", { className: Vt.actions, children: /* @__PURE__ */ c(
              J,
              {
                width: "6rem",
                height: "var(--glacier-control-height-md)",
                radius: "var(--glacier-control-radius)"
              }
            ) })
          ] })
        ]
      }
    );
  const $ = r === 1 ? "h1" : "h2";
  return /* @__PURE__ */ P(
    "header",
    {
      className: I(Vt.header, u),
      "data-density": l,
      ...m,
      children: [
        a && /* @__PURE__ */ c("div", { className: Vt.breadcrumbs, children: a }),
        /* @__PURE__ */ P("div", { className: Vt.row, children: [
          /* @__PURE__ */ P("div", { className: Vt.titleBlock, children: [
            /* @__PURE__ */ c($, { className: Vt.title, children: e }),
            t && /* @__PURE__ */ c("div", { className: Vt.description, children: t }),
            n && /* @__PURE__ */ c("div", { className: Vt.meta, children: n })
          ] }),
          (S || b) && /* @__PURE__ */ P("div", { className: Vt.actions, children: [
            s,
            b && /* @__PURE__ */ c(
              Su,
              {
                "aria-label": h(Lc.moreActions),
                placement: "bottom-end",
                trigger: /* @__PURE__ */ c(Yn, { "aria-label": h(Lc.moreActions), children: T3 }),
                children: f.map((N) => /* @__PURE__ */ c(rN, { disabled: N.disabled, onSelect: N.onSelect, children: N.label }, N.id))
              }
            )
          ] })
        ] })
      ]
    }
  );
}
const C3 = "_nav_kwbnn_1", N3 = "_horizontal_kwbnn_7", D3 = "_vertical_kwbnn_16", z3 = "_items_kwbnn_26", P3 = "_end_kwbnn_43", A3 = "_item_kwbnn_26", O3 = "_itemHorizontal_kwbnn_83", E3 = "_itemVertical_kwbnn_89", W3 = "_indicator_kwbnn_122", I3 = "_icon_kwbnn_131", R3 = "_label_kwbnn_132", L3 = "_badge_kwbnn_133", Gt = {
  nav: C3,
  horizontal: N3,
  vertical: D3,
  items: z3,
  end: P3,
  item: A3,
  itemHorizontal: O3,
  itemVertical: E3,
  indicator: W3,
  icon: I3,
  label: R3,
  badge: L3
}, Nu = _a(null), wi = "var(--glacier-control-height-md)", qc = ["5rem", "6rem", "5.5rem", "4.5rem"];
function V6({
  orientation: e = "horizontal",
  end: t,
  showLabels: a = !1,
  spring: n = xa.Snappy,
  skeleton: s = !1,
  className: i,
  children: r,
  "aria-label": l,
  ...d
}) {
  const u = Ee(), m = Re();
  if (s) {
    const f = e === "vertical" || !a ? qc.map(() => wi) : qc;
    return /* @__PURE__ */ P("nav", { ...d, "aria-hidden": "true", className: I(Gt.nav, Gt[e], i), children: [
      /* @__PURE__ */ c("div", { className: Gt.items, children: f.map((b, w) => /* @__PURE__ */ c(J, { width: b, height: wi, radius: "var(--glacier-navbar-item-radius, var(--glacier-radius-md))" }, w)) }),
      /* @__PURE__ */ c("div", { className: Gt.end, children: /* @__PURE__ */ c(J, { width: wi, height: wi, radius: "var(--glacier-navbar-item-radius, var(--glacier-radius-md))" }) })
    ] });
  }
  const h = {
    orientation: e,
    showLabels: a,
    layoutId: `${u}-active`,
    transition: m ? { duration: 0 } : Ya(n)
  };
  return /* @__PURE__ */ c(Nu.Provider, { value: h, children: /* @__PURE__ */ P("nav", { className: I(Gt.nav, Gt[e], i), "aria-label": l, ...d, children: [
    /* @__PURE__ */ c("div", { className: Gt.items, children: r }),
    t && /* @__PURE__ */ c("div", { className: Gt.end, children: t })
  ] }) });
}
function G6({
  as: e,
  icon: t,
  label: a,
  active: n = !1,
  badge: s,
  disabled: i,
  className: r,
  ...l
}) {
  const d = ho(e, "button"), u = (e ?? "button") === "button" ? { type: "button", disabled: i } : {}, m = Gn(Nu), h = m?.orientation === "vertical", f = m ? m.showLabels && !h : !0, b = !f, w = /* @__PURE__ */ P(
    d,
    {
      className: I(Gt.item, b ? Gt.itemVertical : Gt.itemHorizontal, r),
      "data-active": n || void 0,
      "aria-current": n ? "page" : void 0,
      "aria-disabled": i || void 0,
      "aria-label": b ? a : void 0,
      ...u,
      ...l,
      children: [
        n && (m ? /* @__PURE__ */ c(
          $e.span,
          {
            className: Gt.indicator,
            layoutId: m.layoutId,
            transition: m.transition,
            "aria-hidden": "true"
          }
        ) : /* @__PURE__ */ c("span", { className: Gt.indicator, "aria-hidden": "true" })),
        /* @__PURE__ */ c("span", { className: Gt.icon, "aria-hidden": "true", children: t }),
        f && /* @__PURE__ */ c("span", { className: Gt.label, children: a }),
        s !== void 0 && /* @__PURE__ */ c(Zr, { count: s, size: "sm", className: Gt.badge })
      ]
    }
  );
  return b ? /* @__PURE__ */ c(yP, { content: a, placement: h ? "right" : "top", children: w }) : w;
}
const q3 = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
let Is = 0, Fc = "";
function F3(e) {
  return [...e.querySelectorAll(q3)].filter((t) => !t.hasAttribute("disabled"));
}
function cl({
  open: e,
  onClose: t,
  dialogRef: a,
  initialFocusRef: n,
  dismissible: s = !0
}) {
  const i = ee({ onClose: t, dismissible: s, initialFocusRef: n });
  i.current = { onClose: t, dismissible: s, initialFocusRef: n }, xe(() => {
    if (!e) return;
    const r = document.activeElement;
    Is === 0 && (Fc = document.body.style.overflow), Is += 1, document.body.style.overflow = "hidden";
    const l = a.current;
    (i.current.initialFocusRef?.current ?? l)?.focus();
    const d = (u) => {
      if (u.key === "Escape") {
        i.current.dismissible && (u.preventDefault(), i.current.onClose());
        return;
      }
      if (u.key !== "Tab") return;
      const m = a.current;
      if (!m) return;
      const h = F3(m);
      if (h.length === 0) {
        u.preventDefault(), m.focus();
        return;
      }
      const f = h[0], b = h[h.length - 1];
      u.shiftKey && (document.activeElement === f || document.activeElement === m) ? (u.preventDefault(), b.focus()) : !u.shiftKey && (document.activeElement === b || !m.contains(document.activeElement)) && (u.preventDefault(), f.focus());
    };
    return document.addEventListener("keydown", d), () => {
      Is = Math.max(0, Is - 1), Is === 0 && (document.body.style.overflow = Fc), document.removeEventListener("keydown", d), r?.focus();
    };
  }, [a, e]);
}
const B3 = "_overlay_yfagr_1", H3 = "_panel_yfagr_13", j3 = "_sm_yfagr_41", Y3 = "_md_yfagr_42", V3 = "_lg_yfagr_43", G3 = "_xl_yfagr_44", K3 = "_header_yfagr_46", U3 = "_close_yfagr_54", X3 = "_footer_yfagr_60", rs = {
  overlay: B3,
  panel: H3,
  sm: j3,
  md: Y3,
  lg: V3,
  xl: G3,
  header: K3,
  close: U3,
  footer: X3
}, J3 = /* @__PURE__ */ c("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M3 3l8 8M11 3l-8 8", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }) });
function Q3({ open: e, onClose: t, title: a, description: n, size: s = "md", footer: i, children: r }) {
  const l = st(), d = Ee(), u = Ee(), m = ee(null), h = Re();
  return cl({ open: e, onClose: t, dialogRef: m }), e ? yn(
    /* @__PURE__ */ c(
      $e.div,
      {
        className: rs.overlay,
        onClick: t,
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: h ? { duration: 0 } : { duration: 0.15 },
        children: /* @__PURE__ */ P(
          $e.div,
          {
            ref: m,
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": a ? d : void 0,
            "aria-describedby": n ? u : void 0,
            className: I(rs.panel, rs[s]),
            tabIndex: -1,
            onClick: (f) => f.stopPropagation(),
            initial: h ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 12 },
            animate: { opacity: 1, scale: 1, y: 0 },
            transition: h ? { duration: 0 } : Ya(xa.Snappy),
            children: [
              /* @__PURE__ */ c(Yn, { "aria-label": l(_e.close), size: gn.Small, className: rs.close, onClick: t, children: J3 }),
              (a || n) && /* @__PURE__ */ P("header", { className: rs.header, children: [
                a && /* @__PURE__ */ c(sa, { level: 2, visualLevel: 3, id: d, children: a }),
                n && /* @__PURE__ */ c(Pi, { tone: ti.Muted, size: gn.Small, id: u, children: n })
              ] }),
              r,
              i && /* @__PURE__ */ c("footer", { className: rs.footer, children: i })
            ]
          }
        )
      }
    ),
    document.body
  ) : null;
}
const Z3 = "_overlay_1snph_1", eA = "_left_1snph_16", tA = "_right_1snph_21", nA = "_bottom_1snph_34", aA = "_floating_1snph_42", oA = "_panel_1snph_46", sA = "_sm_1snph_102", iA = "_md_1snph_107", rA = "_lg_1snph_112", lA = "_header_1snph_117", cA = "_headerContent_1snph_125", dA = "_body_1snph_132", uA = "_footer_1snph_139", ea = {
  overlay: Z3,
  left: eA,
  right: tA,
  bottom: nA,
  floating: aA,
  panel: oA,
  sm: sA,
  md: iA,
  lg: rA,
  header: lA,
  headerContent: cA,
  body: dA,
  footer: uA
}, hA = /* @__PURE__ */ c("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M3 3l8 8M11 3l-8 8", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }) });
function mA(e, t) {
  const a = t ? "115%" : "100%";
  return e === "left" ? { x: `-${a}` } : e === "right" ? { x: a } : { y: a };
}
function K6({
  open: e,
  onClose: t,
  title: a,
  description: n,
  side: s = "right",
  size: i = "md",
  floating: r,
  footer: l,
  dismissible: d = !0,
  children: u,
  className: m,
  ...h
}) {
  const f = st(), b = Ee(), w = Ee(), S = ee(null), $ = Re();
  if (cl({ open: e, onClose: t, dialogRef: S, dismissible: d }), !e) return null;
  const N = r ?? (typeof document < "u" && document.documentElement.getAttribute("data-layout") === "floating");
  return yn(
    /* @__PURE__ */ c(
      $e.div,
      {
        className: I(ea.overlay, ea[s], N && ea.floating),
        onClick: d ? t : void 0,
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: $ ? { duration: 0 } : { duration: 0.15 },
        children: /* @__PURE__ */ P(
          $e.div,
          {
            ...h,
            ref: S,
            role: "dialog",
            "aria-modal": "true",
            "aria-labelledby": a ? b : void 0,
            "aria-describedby": n ? w : void 0,
            className: I(ea.panel, ea[s], ea[i], N && ea.floating, m),
            tabIndex: -1,
            onClick: (y) => y.stopPropagation(),
            initial: $ ? { opacity: 0 } : { opacity: 0, ...mA(s, N) },
            animate: { opacity: 1, x: 0, y: 0 },
            transition: $ ? { duration: 0 } : Ya(xa.Snappy),
            children: [
              (a || n || d) && /* @__PURE__ */ P("header", { className: ea.header, children: [
                /* @__PURE__ */ P("div", { className: ea.headerContent, children: [
                  a && /* @__PURE__ */ c(sa, { level: 2, visualLevel: 3, id: b, children: a }),
                  n && /* @__PURE__ */ c(Pi, { tone: ti.Muted, size: gn.Small, id: w, children: n })
                ] }),
                d && /* @__PURE__ */ c(Yn, { "aria-label": f(_e.close), size: gn.Small, onClick: t, children: hA })
              ] }),
              /* @__PURE__ */ c("div", { className: ea.body, children: u }),
              l && /* @__PURE__ */ c("footer", { className: ea.footer, children: l })
            ]
          }
        )
      }
    ),
    document.body
  );
}
const pA = "_overlay_1rnuz_1", fA = "_panel_1rnuz_13", gA = "_danger_1rnuz_34", bA = "_description_1rnuz_38", yA = "_body_1rnuz_42", vA = "_footer_1rnuz_46", ls = {
  overlay: pA,
  panel: fA,
  danger: gA,
  description: bA,
  body: yA,
  footer: vA
};
function U6({
  open: e,
  onClose: t,
  title: a,
  description: n,
  actionLabel: s,
  onAction: i,
  cancelLabel: r,
  tone: l = "neutral",
  actionDisabled: d = !1,
  actionLoading: u = !1,
  dismissible: m = !1,
  children: h,
  className: f,
  ...b
}) {
  const w = st(), S = Ee(), $ = Ee(), N = ee(null), y = ee(null), v = Re();
  return cl({ open: e, onClose: t, dialogRef: N, initialFocusRef: y, dismissible: m }), e ? yn(
    /* @__PURE__ */ c(
      $e.div,
      {
        className: ls.overlay,
        onClick: m ? t : void 0,
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: v ? { duration: 0 } : { duration: 0.15 },
        children: /* @__PURE__ */ P(
          $e.div,
          {
            ...b,
            ref: N,
            role: "alertdialog",
            "aria-modal": "true",
            "aria-labelledby": S,
            "aria-describedby": n ? $ : void 0,
            className: I(ls.panel, ls[l], f),
            tabIndex: -1,
            onClick: (_) => _.stopPropagation(),
            initial: v ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 },
            animate: { opacity: 1, scale: 1, y: 0 },
            transition: v ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
            children: [
              /* @__PURE__ */ c(sa, { level: 2, visualLevel: 3, id: S, children: a }),
              n && /* @__PURE__ */ c(Pi, { tone: ti.Muted, id: $, className: ls.description, children: n }),
              h && /* @__PURE__ */ c("div", { className: ls.body, children: h }),
              /* @__PURE__ */ P("footer", { className: ls.footer, children: [
                /* @__PURE__ */ c(wa, { ref: y, variant: "ghost", onClick: t, children: r ?? w(_e.cancel) }),
                /* @__PURE__ */ c(
                  wa,
                  {
                    variant: l === "danger" ? "danger" : "solid",
                    disabled: d,
                    loading: u,
                    onClick: i,
                    children: s
                  }
                )
              ] })
            ]
          }
        )
      }
    ),
    document.body
  ) : null;
}
const wA = "_shell_19zp0_1", kA = "_sidebar_19zp0_8", _A = "_resizer_19zp0_22", xA = "_main_19zp0_63", SA = "_header_19zp0_69", MA = "_headerContent_19zp0_85", $A = "_content_19zp0_92", TA = "_bottomNav_19zp0_97", CA = "_mobileMenuButton_19zp0_105", NA = "_sidebarClose_19zp0_106", DA = "_desktopMenuButton_19zp0_110", zA = "_backdrop_19zp0_114", Rn = {
  shell: wA,
  sidebar: kA,
  resizer: _A,
  main: xA,
  header: SA,
  headerContent: MA,
  content: $A,
  bottomNav: TA,
  mobileMenuButton: CA,
  sidebarClose: NA,
  desktopMenuButton: DA,
  backdrop: zA
}, Bc = /* @__PURE__ */ c("svg", { width: "18", height: "18", viewBox: "0 0 18 18", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M2.5 5h13M2.5 9h13M2.5 13h13", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }) }), PA = /* @__PURE__ */ c("svg", { width: "18", height: "18", viewBox: "0 0 18 18", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M4 4l10 10M14 4L4 14", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }) }), Hc = "(max-width: 1023px)";
function AA() {
  const [e, t] = pe(
    () => typeof window < "u" && typeof window.matchMedia == "function" ? window.matchMedia(Hc).matches : !1
  );
  return xe(() => {
    if (typeof window.matchMedia != "function") return;
    const a = window.matchMedia(Hc), n = () => t(a.matches);
    return n(), a.addEventListener("change", n), () => a.removeEventListener("change", n);
  }, []), e;
}
function X6({
  sidebar: e,
  header: t,
  bottomNav: a,
  sidebarWidth: n = "16rem",
  sidebarLabel: s = "Navigation",
  floating: i = !1,
  isMobile: r,
  resizable: l = !1,
  onSidebarWidthChange: d,
  minSidebarWidth: u = 200,
  maxSidebarWidth: m = 460,
  children: h,
  style: f,
  ...b
}) {
  const w = st(), [S, $] = pe(!1), [N, y] = pe(!1), v = AA(), _ = r ?? v, k = ee(null);
  xe(() => {
    if (!S) return;
    const L = (O) => {
      O.key === "Escape" && $(!1);
    };
    return document.addEventListener("keydown", L), () => document.removeEventListener("keydown", L);
  }, [S]);
  const M = (L) => {
    L.target.closest("a, button") && $(!1);
  }, T = at(
    (L) => {
      const O = Math.round(Math.min(m, Math.max(u, L)));
      d?.(`${O}px`);
    },
    [u, m, d]
  );
  function A(L) {
    if (L.button !== 0) return;
    L.preventDefault();
    const O = L.currentTarget;
    O.setPointerCapture(L.pointerId);
    const q = (D) => {
      const H = k.current;
      if (!H) return;
      const K = H.getBoundingClientRect();
      T(bn(H) === "rtl" ? K.right - D.clientX : D.clientX - K.left);
    }, j = () => {
      O.releasePointerCapture?.(L.pointerId), O.removeEventListener("pointermove", q), O.removeEventListener("pointerup", j), O.removeEventListener("pointercancel", j);
    };
    O.addEventListener("pointermove", q), O.addEventListener("pointerup", j), O.addEventListener("pointercancel", j);
  }
  function F(L) {
    const O = k.current;
    if (!O) return;
    const q = O.getBoundingClientRect().width, j = bn(O) === "rtl" ? -16 : 16;
    switch (L.key) {
      case "ArrowLeft":
        L.preventDefault(), T(q - j);
        break;
      case "ArrowRight":
        L.preventDefault(), T(q + j);
        break;
      case "Home":
        L.preventDefault(), T(u);
        break;
      case "End":
        L.preventDefault(), T(m);
        break;
    }
  }
  return /* @__PURE__ */ P(
    "div",
    {
      ...b,
      className: Rn.shell,
      "data-floating": i ? "" : void 0,
      "data-bottom-nav": a ? "" : void 0,
      "data-sidebar-collapsed": N ? "" : void 0,
      "data-mobile": _ ? "" : void 0,
      "data-desktop": _ ? void 0 : "",
      style: { "--shell-sidebar": n, ...f },
      children: [
        /* @__PURE__ */ P(
          "aside",
          {
            ref: k,
            "aria-label": s,
            className: Rn.sidebar,
            "data-open": S ? "" : void 0,
            onClick: M,
            children: [
              /* @__PURE__ */ c(
                Yn,
                {
                  "aria-label": w(_e.closeNavigation),
                  variant: Ba.Ghost,
                  className: Rn.sidebarClose,
                  onClick: () => $(!1),
                  children: PA
                }
              ),
              e
            ]
          }
        ),
        l && /* @__PURE__ */ c(
          "div",
          {
            role: "separator",
            "aria-orientation": "vertical",
            "aria-label": w(_e.resizeSidebar),
            tabIndex: 0,
            className: Rn.resizer,
            onPointerDown: A,
            onKeyDown: F
          }
        ),
        S && /* @__PURE__ */ c("div", { className: Rn.backdrop, onClick: () => $(!1) }),
        /* @__PURE__ */ P("div", { className: Rn.main, children: [
          /* @__PURE__ */ P("header", { className: I(Rn.header), "data-empty": t ? void 0 : "", children: [
            /* @__PURE__ */ c(
              Yn,
              {
                "aria-label": w(N ? _e.openNavigation : _e.closeNavigation),
                "aria-expanded": !N,
                variant: Ba.Ghost,
                className: Rn.desktopMenuButton,
                onClick: () => y((L) => !L),
                children: Bc
              }
            ),
            /* @__PURE__ */ c(
              Yn,
              {
                "aria-label": w(_e.openNavigation),
                "aria-expanded": S,
                variant: Ba.Ghost,
                className: Rn.mobileMenuButton,
                onClick: () => $(!0),
                children: Bc
              }
            ),
            t && /* @__PURE__ */ c("div", { className: Rn.headerContent, children: t })
          ] }),
          /* @__PURE__ */ c("div", { className: Rn.content, children: h }),
          a && /* @__PURE__ */ c("div", { className: Rn.bottomNav, children: a })
        ] })
      ]
    }
  );
}
const OA = "_positioner_8pkh8_1", EA = "_panel_8pkh8_10", jc = {
  positioner: OA,
  panel: EA
};
function J6({
  trigger: e,
  placement: t = "bottom-start",
  open: a,
  defaultOpen: n = !1,
  onOpenChange: s,
  className: i,
  children: r,
  ...l
}) {
  const d = Ee(), u = Re(), m = ee(null), h = ee(null), [f, b] = He(a, n), [w, S] = pe(f), $ = ia(m), N = Va(w, m, h, { placement: t, offset: 12 });
  function y(k) {
    b(k), s?.(k);
  }
  xe(() => {
    f && S(!0);
  }, [f]), xe(() => {
    if (!w) return;
    h.current?.focus();
    const k = (T) => {
      const A = T.target;
      !h.current?.contains(A) && !m.current?.contains(A) && y(!1);
    }, M = (T) => {
      T.key === "Escape" && (y(!1), m.current?.focus());
    };
    return document.addEventListener("pointerdown", k), document.addEventListener("keydown", M), () => {
      document.removeEventListener("pointerdown", k), document.removeEventListener("keydown", M);
    };
  }, [w]);
  const v = Xs(e, {
    ref: m,
    "aria-haspopup": "dialog",
    "aria-expanded": f,
    "aria-controls": f ? d : void 0,
    onClick: (k) => {
      e.props.onClick?.(k), y(!f);
    }
  });
  function _(k) {
    k.key === "Escape" && (k.preventDefault(), y(!1), m.current?.focus());
  }
  return /* @__PURE__ */ P(vs, { children: [
    v,
    w && yn(
      /* @__PURE__ */ P(
        $e.div,
        {
          ref: h,
          id: d,
          role: "dialog",
          "aria-label": l["aria-label"],
          dir: $,
          tabIndex: -1,
          className: jc.positioner,
          "data-placement": N?.placement,
          style: N?.style,
          onKeyDown: _,
          initial: u ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 },
          animate: f ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.98, y: -2 },
          transition: u ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
          onAnimationComplete: () => {
            f || S(!1);
          },
          children: [
            /* @__PURE__ */ c(Mu, { placement: N?.placement }),
            /* @__PURE__ */ c("div", { className: I(jc.panel, i), children: r })
          ]
        }
      ),
      document.body
    )
  ] });
}
const WA = "_tree_1rlf2_1", IA = "_glass_1rlf2_10", RA = "_item_1rlf2_20", LA = "_row_1rlf2_26", qA = "_chevron_1rlf2_64", FA = "_icon_1rlf2_100", BA = "_label_1rlf2_109", HA = "_trailing_1rlf2_117", jA = "_group_1rlf2_124", hn = {
  tree: WA,
  glass: IA,
  item: RA,
  row: LA,
  chevron: qA,
  icon: FA,
  label: BA,
  trailing: HA,
  group: jA
};
function Du(e, t, a = 1, n, s = []) {
  for (const i of e)
    s.push({ item: i, level: a, parentId: n }), i.children && i.children.length > 0 && t.includes(i.id) && Du(i.children, t, a + 1, i.id, s);
  return s;
}
const YA = /* @__PURE__ */ c("svg", { width: "10", height: "10", viewBox: "0 0 10 10", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c(
  "path",
  {
    d: "M3 1.5 7 5 3 8.5",
    stroke: "currentColor",
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }
) }), VA = [
  { depth: 1, width: "7rem" },
  { depth: 2, width: "9rem" },
  { depth: 2, width: "6rem" },
  { depth: 1, width: "8rem" },
  { depth: 2, width: "7rem" }
];
function Q6({
  items: e,
  expandedIds: t,
  defaultExpandedIds: a,
  onExpandedChange: n,
  selectedId: s,
  defaultSelectedId: i,
  onSelect: r,
  glass: l = !1,
  skeleton: d = !1,
  className: u,
  "aria-label": m,
  ...h
}) {
  const f = Ee(), b = Re(), w = ee(/* @__PURE__ */ new Map()), [S, $] = He(t, a ?? []), [N, y] = He(s, i ?? ""), [v, _] = pe(null), k = Bt(() => Du(e ?? [], S), [e, S]), M = Bt(() => k.filter((D) => !D.item.disabled), [k]);
  if (d)
    return /* @__PURE__ */ c("ul", { ...h, "aria-hidden": "true", className: I(hn.tree, l && hn.glass, u), children: VA.map((D, H) => /* @__PURE__ */ c("li", { className: hn.item, children: /* @__PURE__ */ P("span", { className: hn.row, style: { "--tree-depth": D.depth }, children: [
      /* @__PURE__ */ c("span", { className: hn.chevron }),
      /* @__PURE__ */ c(J, { variant: De.Text, width: D.width })
    ] }) }, H)) });
  const T = v && M.some((D) => D.item.id === v) ? v : M.find((D) => D.item.id === N)?.item.id ?? M[0]?.item.id;
  function A(D) {
    _(D), w.current.get(D)?.focus();
  }
  function F(D) {
    const H = S.includes(D) ? S.filter((K) => K !== D) : [...S, D];
    $(H), n?.(H);
  }
  function L(D) {
    D.disabled || (y(D.id), r?.(D.id));
  }
  function O(D, H) {
    A(D.id), H && F(D.id), L(D);
  }
  function q(D) {
    const H = D.target.closest("[data-id]")?.getAttribute("data-id");
    if (!H) return;
    const K = M.findIndex((U) => U.item.id === H);
    if (K < 0) return;
    const Y = M[K], se = !!Y.item.children && Y.item.children.length > 0, te = se && S.includes(Y.item.id);
    let ne = D.key;
    switch (bn(D.currentTarget) === "rtl" && (ne === "ArrowLeft" ? ne = "ArrowRight" : ne === "ArrowRight" && (ne = "ArrowLeft")), ne) {
      case "ArrowDown": {
        D.preventDefault();
        const U = M[K + 1];
        U && A(U.item.id);
        break;
      }
      case "ArrowUp": {
        D.preventDefault();
        const U = M[K - 1];
        U && A(U.item.id);
        break;
      }
      case "ArrowRight": {
        if (D.preventDefault(), !se) break;
        if (!te) F(Y.item.id);
        else {
          const U = M.find((z) => z.parentId === Y.item.id);
          U && A(U.item.id);
        }
        break;
      }
      case "ArrowLeft": {
        if (D.preventDefault(), te) F(Y.item.id);
        else if (Y.parentId) {
          const U = k.find((z) => z.item.id === Y.parentId);
          U && !U.item.disabled && A(U.item.id);
        }
        break;
      }
      case "Home": {
        D.preventDefault();
        const U = M[0];
        U && A(U.item.id);
        break;
      }
      case "End": {
        D.preventDefault();
        const U = M[M.length - 1];
        U && A(U.item.id);
        break;
      }
      case "Enter":
      case " ": {
        D.preventDefault(), se && F(Y.item.id), L(Y.item);
        break;
      }
    }
  }
  function j(D, H, K, Y) {
    const se = D.children ?? [], te = se.length > 0, ne = te && S.includes(D.id), U = !D.disabled && D.id === N, z = `${f}-label-${D.id}`;
    return /* @__PURE__ */ P(
      "li",
      {
        ref: (R) => {
          R ? w.current.set(D.id, R) : w.current.delete(D.id);
        },
        role: "treeitem",
        "data-id": D.id,
        "aria-labelledby": z,
        "aria-expanded": te ? ne : void 0,
        "aria-selected": D.disabled ? void 0 : U,
        "aria-disabled": D.disabled || void 0,
        "aria-level": H,
        "aria-setsize": Y,
        "aria-posinset": K,
        tabIndex: !D.disabled && D.id === T ? 0 : -1,
        className: hn.item,
        children: [
          /* @__PURE__ */ P(
            "span",
            {
              className: hn.row,
              "data-selected": U || void 0,
              "data-disabled": D.disabled || void 0,
              style: { "--tree-depth": H },
              onClick: D.disabled ? void 0 : () => O(D, te),
              children: [
                /* @__PURE__ */ c("span", { className: hn.chevron, "data-expanded": ne || void 0, "aria-hidden": "true", children: te && YA }),
                D.icon && /* @__PURE__ */ c("span", { className: hn.icon, "aria-hidden": "true", children: D.icon }),
                /* @__PURE__ */ c("span", { id: z, className: hn.label, children: D.label }),
                D.trailing && /* @__PURE__ */ c("span", { className: hn.trailing, children: D.trailing })
              ]
            }
          ),
          te && /* @__PURE__ */ c(zi, { initial: !1, children: ne && /* @__PURE__ */ c(
            $e.ul,
            {
              role: "group",
              className: hn.group,
              initial: b ? !1 : { height: 0, opacity: 0 },
              animate: { height: "auto", opacity: 1 },
              exit: { height: 0, opacity: 0 },
              transition: b ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
              children: se.map((R, X) => j(R, H + 1, X + 1, se.length))
            }
          ) })
        ]
      },
      D.id
    );
  }
  return /* @__PURE__ */ c(
    "ul",
    {
      ...h,
      role: "tree",
      "aria-label": m,
      className: I(hn.tree, l && hn.glass, u),
      onKeyDown: q,
      children: e.map((D, H) => j(D, 1, H + 1, e.length))
    }
  );
}
const GA = "_panel_18hid_1", KA = "_handle_18hid_26", UA = "_title_18hid_45", XA = "_close_18hid_53", JA = "_body_18hid_57", Rs = {
  panel: GA,
  handle: KA,
  title: UA,
  close: XA,
  body: JA
}, QA = /* @__PURE__ */ c("svg", { width: "14", height: "14", viewBox: "0 0 14 14", fill: "none", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M3 3l8 8M11 3l-8 8", stroke: "currentColor", strokeWidth: "1.75", strokeLinecap: "round" }) });
function Yc(e, t, a = 8) {
  const n = Math.max(a, window.innerWidth - t.width - a), s = Math.max(a, window.innerHeight - t.height - a);
  return {
    x: Math.min(Math.max(a, e.x), n),
    y: Math.min(Math.max(a, e.y), s)
  };
}
function Z6({
  open: e,
  title: t,
  onClose: a,
  defaultPosition: n = { x: 24, y: 24 },
  className: s,
  children: i
}) {
  const r = st(), l = Ee(), d = ee(null), u = ee(null), m = Re(), [h, f] = pe(n);
  return xe(() => {
    if (!e) return;
    const b = (w) => {
      w.key === "Escape" && a();
    };
    return document.addEventListener("keydown", b), () => document.removeEventListener("keydown", b);
  }, [e, a]), xe(() => {
    if (!e) return;
    const b = () => {
      const w = d.current;
      w && f((S) => Yc(S, { width: w.offsetWidth, height: w.offsetHeight }));
    };
    return window.addEventListener("resize", b), () => window.removeEventListener("resize", b);
  }, [e]), xe(() => {
    const b = u.current;
    if (!e || !b) return;
    let w = null;
    const S = (v) => w != null && (v.pointerId == null || v.pointerId === w.pointerId), $ = (v) => {
      const _ = d.current;
      if (!w || !S(v) || !_) return;
      const k = { x: v.clientX - w.offsetX, y: v.clientY - w.offsetY };
      f(Yc(k, { width: _.offsetWidth, height: _.offsetHeight }));
    }, N = (v) => {
      S(v) && (w = null, document.removeEventListener("pointermove", $), document.removeEventListener("pointerup", N), document.removeEventListener("pointercancel", N));
    }, y = (v) => {
      if (v.button > 0 || v.target.closest("button")) return;
      const _ = d.current;
      if (!_) return;
      const k = _.getBoundingClientRect();
      w = {
        pointerId: v.pointerId,
        offsetX: v.clientX - k.left,
        offsetY: v.clientY - k.top
      }, document.addEventListener("pointermove", $), document.addEventListener("pointerup", N), document.addEventListener("pointercancel", N);
    };
    return b.addEventListener("pointerdown", y), () => {
      b.removeEventListener("pointerdown", y), document.removeEventListener("pointermove", $), document.removeEventListener("pointerup", N), document.removeEventListener("pointercancel", N);
    };
  }, [e]), e ? yn(
    /* @__PURE__ */ P(
      $e.div,
      {
        ref: d,
        role: "dialog",
        "aria-labelledby": l,
        className: I(Rs.panel, s),
        style: { top: h.y, left: h.x },
        initial: m ? { opacity: 0 } : { opacity: 0, scale: 0.96 },
        animate: { opacity: 1, scale: 1 },
        transition: m ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
        children: [
          /* @__PURE__ */ P("div", { ref: u, className: Rs.handle, "data-glacier-drag-handle": "", children: [
            /* @__PURE__ */ c(sa, { level: 2, visualLevel: 6, id: l, className: Rs.title, children: t }),
            /* @__PURE__ */ c(Yn, { "aria-label": r(_e.close), size: gn.Small, className: Rs.close, onClick: a, children: QA })
          ] }),
          /* @__PURE__ */ c("div", { className: Rs.body, children: i })
        ]
      }
    ),
    document.body
  ) : null;
}
const ZA = "_panel_5g96o_1", e5 = "_header_5g96o_14", t5 = "_list_5g96o_23", n5 = "_tab_5g96o_36", a5 = "_tabLabel_5g96o_75", o5 = "_count_5g96o_79", s5 = "_indicator_5g96o_84", i5 = "_actions_5g96o_93", r5 = "_body_5g96o_101", Wa = {
  panel: ZA,
  header: e5,
  list: t5,
  tab: n5,
  tabLabel: a5,
  count: o5,
  indicator: s5,
  actions: i5,
  body: r5
};
function eI({
  tabs: e,
  value: t,
  defaultValue: a,
  onValueChange: n,
  actions: s,
  className: i,
  "aria-label": r,
  ...l
}) {
  const d = Ee(), u = Re(), m = ee(/* @__PURE__ */ new Map()), h = a ?? e.find((v) => !v.disabled)?.id ?? "", [f, b] = He(t, h), w = e.findIndex((v) => v.id === f), S = w >= 0 ? e[w] : void 0, $ = e.filter((v) => !v.disabled);
  function N(v, _) {
    b(v.id), n?.(v.id), _ && m.current.get(v.id)?.focus();
  }
  function y(v) {
    if ($.length === 0) return;
    const _ = $.findIndex((k) => k.id === f);
    switch (v.key) {
      case "ArrowRight":
        v.preventDefault(), N($[(_ + 1) % $.length], !0);
        break;
      case "ArrowLeft":
        v.preventDefault(), N($[(_ - 1 + $.length) % $.length], !0);
        break;
      case "Home":
        v.preventDefault(), N($[0], !0);
        break;
      case "End":
        v.preventDefault(), N($[$.length - 1], !0);
        break;
    }
  }
  return /* @__PURE__ */ P("div", { ...l, className: I(Wa.panel, i), children: [
    /* @__PURE__ */ P("div", { className: Wa.header, children: [
      /* @__PURE__ */ c(
        "div",
        {
          role: "tablist",
          "aria-label": r,
          className: Wa.list,
          onKeyDown: y,
          children: e.map((v, _) => {
            const k = v.id === f;
            return /* @__PURE__ */ P(
              "button",
              {
                ref: (M) => {
                  M ? m.current.set(v.id, M) : m.current.delete(v.id);
                },
                type: "button",
                role: "tab",
                id: `${d}-tab-${_}`,
                "aria-selected": k,
                "aria-controls": `${d}-panel-${_}`,
                tabIndex: k ? 0 : -1,
                disabled: v.disabled,
                className: Wa.tab,
                onClick: () => N(v, !1),
                children: [
                  /* @__PURE__ */ c("span", { className: Wa.tabLabel, children: v.label }),
                  v.count !== void 0 && v.count > 0 && /* @__PURE__ */ c(
                    Zr,
                    {
                      count: v.count,
                      tone: k ? "accent" : "neutral",
                      size: gn.Small,
                      className: Wa.count
                    }
                  ),
                  k && /* @__PURE__ */ c(
                    $e.span,
                    {
                      layoutId: `${d}-indicator`,
                      className: Wa.indicator,
                      transition: u ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
                      "aria-hidden": "true"
                    }
                  )
                ]
              },
              v.id
            );
          })
        }
      ),
      s && /* @__PURE__ */ c("div", { className: Wa.actions, children: s })
    ] }),
    S && /* @__PURE__ */ c(
      $e.div,
      {
        role: "tabpanel",
        id: `${d}-panel-${w}`,
        "aria-labelledby": `${d}-tab-${w}`,
        tabIndex: 0,
        className: Wa.body,
        initial: u ? !1 : { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        transition: u ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
        children: S.content
      },
      S.id
    )
  ] });
}
const l5 = "_layout_16yez_1", c5 = "_rail_16yez_13", d5 = "_railItem_16yez_23", u5 = "_indicator_16yez_70", h5 = "_railIcon_16yez_78", m5 = "_railLabel_16yez_79", p5 = "_pane_16yez_102", Co = {
  layout: l5,
  rail: c5,
  railItem: d5,
  indicator: u5,
  railIcon: h5,
  railLabel: m5,
  pane: p5
}, Vc = "(max-width: 40rem)";
function f5() {
  const [e, t] = pe(
    () => typeof window < "u" && typeof window.matchMedia == "function" ? window.matchMedia(Vc).matches : !1
  );
  return xe(() => {
    if (typeof window.matchMedia != "function") return;
    const a = window.matchMedia(Vc), n = () => t(a.matches);
    return n(), a.addEventListener("change", n), () => a.removeEventListener("change", n);
  }, []), e;
}
function tI({
  open: e,
  onClose: t,
  sections: a,
  value: n,
  defaultValue: s,
  onValueChange: i,
  title: r,
  footer: l,
  className: d
}) {
  const u = Ee(), m = Re(), h = f5(), f = ee(/* @__PURE__ */ new Map()), b = s ?? a.find((k) => !k.disabled)?.id ?? "", [w, S] = He(n, b), $ = a.findIndex((k) => k.id === w), N = $ >= 0 ? a[$] : void 0, y = a.filter((k) => !k.disabled);
  function v(k, M) {
    S(k.id), i?.(k.id), M && f.current.get(k.id)?.focus();
  }
  function _(k) {
    if (y.length === 0) return;
    const M = y.findIndex((L) => L.id === w), T = getComputedStyle(k.currentTarget).direction === "rtl", A = h ? T ? "ArrowLeft" : "ArrowRight" : "ArrowDown", F = h ? T ? "ArrowRight" : "ArrowLeft" : "ArrowUp";
    switch (k.key) {
      case A:
        k.preventDefault(), v(y[(M + 1) % y.length], !0);
        break;
      case F:
        k.preventDefault(), v(y[(M - 1 + y.length) % y.length], !0);
        break;
      case "Home":
        k.preventDefault(), v(y[0], !0);
        break;
      case "End":
        k.preventDefault(), v(y[y.length - 1], !0);
        break;
    }
  }
  return /* @__PURE__ */ c(Q3, { open: e, onClose: t, title: r, footer: l, size: gn.XLarge, children: /* @__PURE__ */ P("div", { className: I(Co.layout, d), "data-modal-overflow": "contained", children: [
    /* @__PURE__ */ c(
      "div",
      {
        role: "tablist",
        "aria-orientation": h ? "horizontal" : "vertical",
        "aria-label": typeof r == "string" ? r : void 0,
        className: Co.rail,
        onKeyDown: _,
        children: a.map((k, M) => {
          const T = k.id === w;
          return /* @__PURE__ */ P(
            "button",
            {
              ref: (A) => {
                A ? f.current.set(k.id, A) : f.current.delete(k.id);
              },
              type: "button",
              role: "tab",
              id: `${u}-tab-${M}`,
              "aria-selected": T,
              "aria-controls": `${u}-panel-${M}`,
              tabIndex: T ? 0 : -1,
              disabled: k.disabled,
              "data-active": T || void 0,
              className: Co.railItem,
              onClick: () => v(k, !1),
              children: [
                T && /* @__PURE__ */ c(
                  $e.span,
                  {
                    layoutId: `${u}-indicator`,
                    className: Co.indicator,
                    transition: m ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
                    "aria-hidden": "true"
                  }
                ),
                k.icon && /* @__PURE__ */ c("span", { className: Co.railIcon, "aria-hidden": "true", children: k.icon }),
                /* @__PURE__ */ c("span", { className: Co.railLabel, children: k.label })
              ]
            },
            k.id
          );
        })
      }
    ),
    N && /* @__PURE__ */ c(
      $e.div,
      {
        role: "tabpanel",
        id: `${u}-panel-${$}`,
        "aria-labelledby": `${u}-tab-${$}`,
        tabIndex: 0,
        className: Co.pane,
        initial: m ? !1 : { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        transition: m ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
        children: N.content
      },
      N.id
    )
  ] }) });
}
const g5 = "_strip_6tced_1", b5 = "_showScrollbar_6tced_18", y5 = "_tab_6tced_55", v5 = "_icon_6tced_93", w5 = "_label_6tced_107", k5 = "_close_6tced_114", _5 = "_indicator_6tced_138", No = {
  strip: g5,
  showScrollbar: b5,
  tab: y5,
  icon: v5,
  label: w5,
  close: k5,
  indicator: _5
};
function nI({
  tabs: e,
  value: t,
  defaultValue: a,
  onValueChange: n,
  onClose: s,
  spring: i = xa.Snappy,
  showScrollbar: r = !1,
  className: l,
  "aria-label": d,
  ...u
}) {
  const m = Ee(), h = Re(), f = ee(/* @__PURE__ */ new Map()), b = a ?? e[0]?.id ?? "", [w, S] = He(t, b), $ = ee(null), [N, y] = pe(!1), v = at(() => {
    const T = $.current;
    T && y(T.scrollWidth - T.clientWidth > 1);
  }, []);
  xe(() => {
    const T = $.current;
    if (!T || (v(), typeof ResizeObserver > "u")) return;
    const A = new ResizeObserver(v);
    A.observe(T);
    for (const F of Array.from(T.children)) A.observe(F);
    return () => A.disconnect();
  }, [v, e]);
  function _(T, A) {
    S(T), n?.(T), A && f.current.get(T)?.focus();
  }
  function k(T) {
    s?.(T);
  }
  function M(T) {
    if (e.length === 0) return;
    const A = document.activeElement?.dataset?.tabId, F = e.findIndex((O) => O.id === (A ?? w));
    if (F < 0) return;
    const L = bn(T.currentTarget) === "rtl" ? -1 : 1;
    switch (T.key) {
      case "ArrowRight":
        T.preventDefault(), _(e[(F + L + e.length) % e.length].id, !0);
        break;
      case "ArrowLeft":
        T.preventDefault(), _(e[(F - L + e.length) % e.length].id, !0);
        break;
      case "Home":
        T.preventDefault(), _(e[0].id, !0);
        break;
      case "End":
        T.preventDefault(), _(e[e.length - 1].id, !0);
        break;
      case "Delete":
      case "Backspace":
        T.preventDefault(), k(e[F].id);
        break;
    }
  }
  return /* @__PURE__ */ c(
    "div",
    {
      ...u,
      ref: $,
      role: "tablist",
      "aria-label": d,
      "aria-orientation": "horizontal",
      className: I(No.strip, r && No.showScrollbar, l),
      "data-overflowing": N || void 0,
      onKeyDown: M,
      children: e.map((T) => {
        const A = T.id === w, F = typeof T.label == "string" ? T.label : "tab";
        return /* @__PURE__ */ P(
          "button",
          {
            type: "button",
            ref: (L) => {
              L ? f.current.set(T.id, L) : f.current.delete(T.id);
            },
            role: "tab",
            "data-tab-id": T.id,
            "aria-selected": A,
            tabIndex: A ? 0 : -1,
            className: No.tab,
            "data-haptic": "selection",
            onClick: () => _(T.id, !1),
            children: [
              T.icon && /* @__PURE__ */ c("span", { className: No.icon, "aria-hidden": "true", children: T.icon }),
              /* @__PURE__ */ c("span", { className: No.label, children: T.label }),
              /* @__PURE__ */ c(
                "span",
                {
                  role: "button",
                  className: No.close,
                  "aria-label": `Close ${F}`,
                  onClick: (L) => {
                    L.stopPropagation(), k(T.id);
                  },
                  children: /* @__PURE__ */ c("svg", { width: "12", height: "12", viewBox: "0 0 12 12", fill: "none", stroke: "currentColor", strokeWidth: "1.5", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ c("path", { d: "M3 3l6 6M9 3l-6 6" }) })
                }
              ),
              A && /* @__PURE__ */ c(
                $e.span,
                {
                  layoutId: `${m}-indicator`,
                  className: No.indicator,
                  transition: h ? { duration: 0 } : Ya(i),
                  "aria-hidden": "true"
                }
              )
            ]
          },
          T.id
        );
      })
    }
  );
}
const x5 = "_root_5s4nd_1", S5 = "_pane_5s4nd_26", M5 = "_divider_5s4nd_32", $5 = "_grip_5s4nd_82", Ls = {
  root: x5,
  pane: S5,
  divider: M5,
  grip: $5
}, T5 = (e, t, a) => Math.min(a, Math.max(t, e)), ki = (e) => Math.round(e * 1e4) / 1e4;
function aI({
  children: e,
  orientation: t = "horizontal",
  ratio: a,
  defaultRatio: n = 0.5,
  onRatioChange: s,
  min: i = 0.1,
  max: r = 0.9,
  resetRatio: l,
  step: d = 0.02,
  className: u,
  style: m,
  "aria-label": h,
  ...f
}) {
  const b = Ee(), w = ee(null), [S, $] = He(a, n), N = t === "horizontal", [y, v] = e, _ = Ai(), k = f["data-haptic"] === "none", M = ee(null), T = at(
    (q) => {
      const j = ki(T5(q, i, r));
      $(j), s?.(j);
    },
    [i, r, $, s]
  );
  function A(q) {
    if (q.button !== 0) return;
    const j = w.current;
    if (!j) return;
    q.preventDefault();
    const D = q.currentTarget;
    D.setPointerCapture(q.pointerId), M.current = S <= i ? "min" : S >= r ? "max" : null;
    const H = (Y) => {
      const se = j.getBoundingClientRect(), te = N ? se.width : se.height;
      if (te <= 0) return;
      const U = (N ? bn(j) === "rtl" ? se.right - Y.clientX : Y.clientX - se.left : Y.clientY - se.top) / te, z = U <= i ? "min" : U >= r ? "max" : null;
      z !== M.current && (M.current = z, z && !k && _("medium")), T(U);
    }, K = () => {
      D.releasePointerCapture?.(q.pointerId), D.removeEventListener("pointermove", H), D.removeEventListener("pointerup", K), D.removeEventListener("pointercancel", K);
    };
    D.addEventListener("pointermove", H), D.addEventListener("pointerup", K), D.addEventListener("pointercancel", K);
  }
  function F(q) {
    const j = N && bn(q.currentTarget) === "rtl", D = N ? j ? "ArrowRight" : "ArrowLeft" : "ArrowUp", H = N ? j ? "ArrowLeft" : "ArrowRight" : "ArrowDown";
    switch (q.key) {
      case D:
        q.preventDefault(), T(S - d);
        break;
      case H:
        q.preventDefault(), T(S + d);
        break;
      case "Home":
        q.preventDefault(), T(i);
        break;
      case "End":
        q.preventDefault(), T(r);
        break;
    }
  }
  function L() {
    T(l ?? n);
  }
  const O = ki(S * 100);
  return /* @__PURE__ */ P(
    "div",
    {
      ...f,
      ref: w,
      className: I(Ls.root, u),
      "data-orientation": t,
      style: { "--split-start": `${O}%`, ...m },
      children: [
        /* @__PURE__ */ c("span", { id: b, hidden: !0, children: h ?? "Resize panes" }),
        /* @__PURE__ */ c("div", { className: Ls.pane, "data-pane": "start", children: y }),
        /* @__PURE__ */ c(
          "div",
          {
            role: "separator",
            tabIndex: 0,
            "aria-orientation": N ? "vertical" : "horizontal",
            "aria-labelledby": b,
            "aria-valuemin": ki(i * 100),
            "aria-valuemax": ki(r * 100),
            "aria-valuenow": O,
            className: Ls.divider,
            onPointerDown: A,
            onKeyDown: F,
            onDoubleClick: L,
            children: /* @__PURE__ */ c("span", { className: Ls.grip, "aria-hidden": "true" })
          }
        ),
        /* @__PURE__ */ c("div", { className: Ls.pane, "data-pane": "end", children: v })
      ]
    }
  );
}
const C5 = "_wrap_enezs_1", N5 = "_table_enezs_8", D5 = "_caption_enezs_18", z5 = "_headerCell_enezs_26", P5 = "_cell_enezs_33", A5 = "_emptyCell_enezs_38", O5 = "_left_enezs_44", E5 = "_center_enezs_48", W5 = "_right_enezs_52", ao = {
  wrap: C5,
  table: N5,
  caption: D5,
  headerCell: z5,
  cell: P5,
  emptyCell: A5,
  left: O5,
  center: E5,
  right: W5
};
function oI({ columns: e, data: t, caption: a, emptyState: n, className: s, ...i }) {
  return /* @__PURE__ */ c("div", { className: ao.wrap, children: /* @__PURE__ */ P("table", { className: I(ao.table, s), ...i, children: [
    a ? /* @__PURE__ */ c("caption", { className: ao.caption, children: a }) : null,
    /* @__PURE__ */ c("thead", { children: /* @__PURE__ */ c("tr", { children: e.map((r) => /* @__PURE__ */ c("th", { scope: "col", className: I(ao.headerCell, r.align && ao[r.align]), children: r.header }, r.key)) }) }),
    /* @__PURE__ */ c("tbody", { children: t.length === 0 ? /* @__PURE__ */ c("tr", { children: /* @__PURE__ */ c("td", { className: ao.emptyCell, colSpan: e.length, children: n ?? "No rows" }) }) : t.map((r, l) => /* @__PURE__ */ c("tr", { children: e.map((d) => /* @__PURE__ */ c("td", { className: I(ao.cell, d.align && ao[d.align]), children: d.render ? d.render(r, l) : String(r[d.key] ?? "") }, `${d.key}-${l}`)) }, `${l}-${r.id ?? "row"}`)) })
  ] }) });
}
const I5 = "_root_1jldk_1", R5 = "_item_1jldk_12", L5 = "_rail_1jldk_20", q5 = "_marker_1jldk_29", F5 = "_dot_1jldk_79", B5 = "_connector_1jldk_87", H5 = "_connectorSkeleton_1jldk_96", j5 = "_content_1jldk_104", Y5 = "_header_1jldk_115", V5 = "_actor_1jldk_124", G5 = "_title_1jldk_131", K5 = "_timestamp_1jldk_136", U5 = "_description_1jldk_144", X5 = "_media_1jldk_149", J5 = "_actions_1jldk_155", wt = {
  root: I5,
  item: R5,
  rail: L5,
  marker: q5,
  dot: F5,
  connector: B5,
  connectorSkeleton: H5,
  content: j5,
  header: Y5,
  actor: V5,
  title: G5,
  timestamp: K5,
  description: U5,
  media: X5,
  actions: J5
}, Gc = ["45%", "60%", "50%", "70%"];
function sI({
  items: e,
  "aria-label": t,
  density: a = "comfortable",
  skeleton: n = !1,
  skeletonCount: s = 4,
  className: i,
  ...r
}) {
  if (n) {
    const l = Math.max(1, s);
    return /* @__PURE__ */ c("ol", { className: I(wt.root, i), "data-density": a, "aria-hidden": !0, ...r, children: Array.from({ length: l }, (d, u) => {
      const m = u === l - 1;
      return /* @__PURE__ */ P("li", { className: wt.item, "data-last": m || void 0, children: [
        /* @__PURE__ */ P("span", { className: wt.rail, children: [
          /* @__PURE__ */ c("span", { className: wt.marker, children: /* @__PURE__ */ c(J, { variant: "circle", width: "var(--glacier-size-lg)" }) }),
          m ? null : /* @__PURE__ */ c(J, { className: wt.connectorSkeleton, radius: "var(--glacier-radius-full)" })
        ] }),
        /* @__PURE__ */ P("div", { className: wt.content, children: [
          /* @__PURE__ */ c("div", { className: wt.header, children: /* @__PURE__ */ c(J, { variant: "text", width: Gc[u % Gc.length] }) }),
          /* @__PURE__ */ c("div", { className: wt.description, children: /* @__PURE__ */ c(J, { variant: "text", width: "80%" }) })
        ] })
      ] }, u);
    }) });
  }
  return (
    // The explicit role looks redundant on an ol, but WebKit strips list
    // semantics from lists styled with list-style: none; role="list" restores
    // them so VoiceOver still announces the feed as a list.
    /* @__PURE__ */ c("ol", { role: "list", className: I(wt.root, i), "aria-label": t, "data-density": a, ...r, children: e.map((l, d) => {
      const u = d === e.length - 1, m = l.tone ?? "neutral";
      return /* @__PURE__ */ P("li", { className: wt.item, "data-last": u || void 0, children: [
        /* @__PURE__ */ P("span", { className: wt.rail, "aria-hidden": "true", children: [
          /* @__PURE__ */ c(
            "span",
            {
              className: wt.marker,
              "data-tone": m,
              "data-icon": l.icon != null || void 0,
              children: l.icon ?? /* @__PURE__ */ c("span", { className: wt.dot })
            }
          ),
          u ? null : /* @__PURE__ */ c("span", { className: wt.connector })
        ] }),
        /* @__PURE__ */ P("div", { className: wt.content, children: [
          /* @__PURE__ */ P("div", { className: wt.header, children: [
            l.actor != null && /* @__PURE__ */ c("span", { className: wt.actor, children: l.actor }),
            /* @__PURE__ */ c("span", { className: wt.title, children: l.title }),
            l.timestamp != null && /* @__PURE__ */ c("span", { className: wt.timestamp, children: l.timestamp })
          ] }),
          l.description != null && /* @__PURE__ */ c("div", { className: wt.description, children: l.description }),
          l.media != null && /* @__PURE__ */ c("div", { className: wt.media, children: l.media }),
          l.actions != null && /* @__PURE__ */ c("div", { className: wt.actions, children: l.actions })
        ] })
      ] }, l.id);
    }) })
  );
}
const Q5 = "_root_1goqi_1", Z5 = "_track_1goqi_10", e4 = "_sm_1goqi_19", t4 = "_md_1goqi_23", n4 = "_clip_1goqi_33", a4 = "_glass_1goqi_41", o4 = "_activity_1goqi_49", s4 = "_marker_1goqi_60", i4 = "_markerLabels_1goqi_90", r4 = "_markerLabel_1goqi_90", l4 = "_playhead_1goqi_118", c4 = "_handle_1goqi_135", d4 = "_readout_1goqi_169", mn = {
  root: Q5,
  track: Z5,
  sm: e4,
  md: t4,
  clip: n4,
  glass: a4,
  activity: o4,
  marker: s4,
  markerLabels: i4,
  markerLabel: r4,
  playhead: l4,
  handle: c4,
  readout: d4
}, u4 = (e) => new Date(e).toLocaleTimeString(), h4 = 0.995;
function iI({
  start: e,
  end: t,
  value: a,
  onChange: n,
  activity: s,
  markers: i,
  step: r = 1e3,
  formatTime: l = u4,
  size: d = "md",
  glass: u = !1,
  disabled: m = !1,
  skeleton: h = !1,
  className: f,
  "aria-label": b,
  ...w
}) {
  const S = ee(null), [$, N] = pe(!1), y = a === void 0, v = Math.max(t - e, 1), _ = y ? t : Math.min(Math.max(a, e), t), k = (_ - e) / v, M = at(
    (q) => {
      const j = S.current;
      if (!j) return null;
      const D = j.getBoundingClientRect(), H = Math.min(Math.max((q.clientX - D.left) / D.width, 0), 1);
      return H >= h4 ? null : e + H * v;
    },
    [e, v]
  ), T = (q) => {
    if (!m) {
      try {
        q.currentTarget.setPointerCapture(q.pointerId);
      } catch {
      }
      N(!0), n?.(M(q));
    }
  }, A = (q) => {
    m || !$ || n?.(M(q));
  }, F = () => N(!1), L = (q) => {
    if (m) return;
    const D = {
      ArrowLeft: _ - r,
      ArrowRight: _ + r >= t ? null : _ + r,
      PageDown: _ - r * 10,
      PageUp: _ + r * 10 >= t ? null : _ + r * 10,
      Home: e,
      End: null
    }[q.key];
    D !== void 0 && (q.preventDefault(), n?.(D === null ? null : Math.min(Math.max(D, e), t)));
  };
  if (h)
    return /* @__PURE__ */ c("div", { className: I(mn.root, mn[d], f), ...w, children: /* @__PURE__ */ c(J, { height: d === "sm" ? "2.5rem" : "3.5rem", width: "100%", radius: "var(--glacier-radius-md)" }) });
  const O = s && s.length >= 2 ? `M ${s.map((q, j) => `${j / (s.length - 1) * 100} ${100 - Math.min(Math.max(q, 0), 1) * 100}`).join(" L ")} L 100 100 L 0 100 Z` : void 0;
  return /* @__PURE__ */ P(
    "div",
    {
      className: I(mn.root, mn[d], u && mn.glass, f),
      "data-live": y || void 0,
      "data-disabled": m || void 0,
      ...w,
      children: [
        /* @__PURE__ */ P(
          "div",
          {
            ref: S,
            className: mn.track,
            onPointerDown: T,
            onPointerMove: A,
            onPointerUp: F,
            onPointerCancel: F,
            children: [
              /* @__PURE__ */ P("div", { className: mn.clip, "aria-hidden": "true", children: [
                O && /* @__PURE__ */ c("svg", { className: mn.activity, viewBox: "0 0 100 100", preserveAspectRatio: "none", children: /* @__PURE__ */ c("path", { d: O }) }),
                i?.map((q, j) => {
                  const D = Math.min(Math.max((q.time - e) / v, 0), 1);
                  return /* @__PURE__ */ c(
                    "span",
                    {
                      className: mn.marker,
                      "data-tone": q.tone ?? "neutral",
                      style: { left: `${D * 100}%` },
                      title: q.label
                    },
                    j
                  );
                })
              ] }),
              /* @__PURE__ */ P(
                "div",
                {
                  className: mn.playhead,
                  style: { left: `${k * 100}%` },
                  "data-scrubbing": $ || void 0,
                  role: "slider",
                  tabIndex: m ? -1 : 0,
                  "aria-label": b,
                  "aria-valuemin": e,
                  "aria-valuemax": t,
                  "aria-valuenow": _,
                  "aria-valuetext": l(_),
                  "aria-disabled": m || void 0,
                  onKeyDown: L,
                  children: [
                    /* @__PURE__ */ c("span", { className: mn.handle }),
                    $ && !y && /* @__PURE__ */ c("span", { className: mn.readout, children: l(_) })
                  ]
                }
              )
            ]
          }
        ),
        i && i.length > 0 && /* @__PURE__ */ c("div", { className: mn.markerLabels, "aria-hidden": "true", children: i.map((q, j) => {
          const D = Math.min(Math.max((q.time - e) / v, 0), 1), H = D === 0 ? "start" : D === 1 ? "end" : void 0;
          return /* @__PURE__ */ c("span", { className: mn.markerLabel, style: { left: `${D * 100}%` }, "data-edge": H, "data-row": j % 2, children: l(q.time) }, j);
        }) })
      ]
    }
  );
}
const m4 = !0, zt = "u-", p4 = "uplot", f4 = zt + "hz", g4 = zt + "vt", b4 = zt + "title", y4 = zt + "wrap", v4 = zt + "under", w4 = zt + "over", k4 = zt + "axis", Eo = zt + "off", _4 = zt + "select", x4 = zt + "cursor-x", S4 = zt + "cursor-y", M4 = zt + "cursor-pt", $4 = zt + "legend", T4 = zt + "live", C4 = zt + "inline", N4 = zt + "series", D4 = zt + "marker", Kc = zt + "label", z4 = zt + "value", Ys = "width", Vs = "height", qs = "top", Uc = "bottom", cs = "left", Sr = "right", dl = "#000", Xc = dl + "0", Mr = "mousemove", Jc = "mousedown", $r = "mouseup", Qc = "mouseenter", Zc = "mouseleave", ed = "dblclick", P4 = "resize", A4 = "scroll", td = "change", Ci = "dppxchange", ul = "--", _s = typeof window < "u", Ir = _s ? document : null, ms = _s ? window : null, O4 = _s ? navigator : null;
let Be, _i;
function Rr() {
  let e = devicePixelRatio;
  Be != e && (Be = e, _i && qr(td, _i, Rr), _i = matchMedia(`(min-resolution: ${Be - 1e-3}dppx) and (max-resolution: ${Be + 1e-3}dppx)`), Io(td, _i, Rr), ms.dispatchEvent(new CustomEvent(Ci)));
}
function $n(e, t) {
  if (t != null) {
    let a = e.classList;
    !a.contains(t) && a.add(t);
  }
}
function Lr(e, t) {
  let a = e.classList;
  a.contains(t) && a.remove(t);
}
function ut(e, t, a) {
  e.style[t] = a + "px";
}
function ta(e, t, a, n) {
  let s = Ir.createElement(e);
  return t != null && $n(s, t), a?.insertBefore(s, n), s;
}
function qn(e, t) {
  return ta("div", e, t);
}
const nd = /* @__PURE__ */ new WeakMap();
function ga(e, t, a, n, s) {
  let i = "translate(" + t + "px," + a + "px)", r = nd.get(e);
  i != r && (e.style.transform = i, nd.set(e, i), t < 0 || a < 0 || t > n || a > s ? $n(e, Eo) : Lr(e, Eo));
}
const ad = /* @__PURE__ */ new WeakMap();
function od(e, t, a) {
  let n = t + a, s = ad.get(e);
  n != s && (ad.set(e, n), e.style.background = t, e.style.borderColor = a);
}
const sd = /* @__PURE__ */ new WeakMap();
function id(e, t, a, n) {
  let s = t + "" + a, i = sd.get(e);
  s != i && (sd.set(e, s), e.style.height = a + "px", e.style.width = t + "px", e.style.marginLeft = n ? -t / 2 + "px" : 0, e.style.marginTop = n ? -a / 2 + "px" : 0);
}
const hl = { passive: !0 }, E4 = { ...hl, capture: !0 };
function Io(e, t, a, n) {
  t.addEventListener(e, a, n ? E4 : hl);
}
function qr(e, t, a, n) {
  t.removeEventListener(e, a, hl);
}
_s && Rr();
function na(e, t, a, n) {
  let s;
  a = a || 0, n = n || t.length - 1;
  let i = n <= 2147483647;
  for (; n - a > 1; )
    s = i ? a + n >> 1 : Cn((a + n) / 2), t[s] < e ? a = s : n = s;
  return e - t[a] <= t[n] - e ? a : n;
}
function zu(e) {
  return (a, n, s) => {
    let i = -1, r = -1;
    for (let l = n; l <= s; l++)
      if (e(a[l])) {
        i = l;
        break;
      }
    for (let l = s; l >= n; l--)
      if (e(a[l])) {
        r = l;
        break;
      }
    return [i, r];
  };
}
const Pu = (e) => e != null, Au = (e) => e != null && e > 0, Ri = zu(Pu), W4 = zu(Au);
function I4(e, t, a, n = 0, s = !1) {
  let i = s ? W4 : Ri, r = s ? Au : Pu;
  [t, a] = i(e, t, a);
  let l = e[t], d = e[t];
  if (t > -1)
    if (n == 1)
      l = e[t], d = e[a];
    else if (n == -1)
      l = e[a], d = e[t];
    else
      for (let u = t; u <= a; u++) {
        let m = e[u];
        r(m) && (m < l ? l = m : m > d && (d = m));
      }
  return [l ?? Ze, d ?? -Ze];
}
function Li(e, t, a, n) {
  let s = cd(e), i = cd(t);
  e == t && (s == -1 ? (e *= a, t /= a) : (e /= a, t *= a));
  let r = a == 10 ? Ha : Ou, l = s == 1 ? Cn : Hn, d = i == 1 ? Hn : Cn, u = l(r(Dt(e))), m = d(r(Dt(t))), h = ps(a, u), f = ps(a, m);
  return a == 10 && (u < 0 && (h = et(h, -u)), m < 0 && (f = et(f, -m))), n || a == 2 ? (e = h * s, t = f * i) : (e = Ru(e, h), t = qi(t, f)), [e, t];
}
function ml(e, t, a, n) {
  let s = Li(e, t, a, n);
  return e == 0 && (s[0] = 0), t == 0 && (s[1] = 0), s;
}
const pl = 0.1, rd = {
  mode: 3,
  pad: pl
}, Ks = {
  pad: 0,
  soft: null,
  mode: 0
}, R4 = {
  min: Ks,
  max: Ks
};
function Ni(e, t, a, n) {
  return Fi(a) ? ld(e, t, a) : (Ks.pad = a, Ks.soft = n ? 0 : null, Ks.mode = n ? 3 : 0, ld(e, t, R4));
}
function qe(e, t) {
  return e ?? t;
}
function L4(e, t, a) {
  for (t = qe(t, 0), a = qe(a, e.length - 1); t <= a; ) {
    if (e[t] != null)
      return !0;
    t++;
  }
  return !1;
}
function ld(e, t, a) {
  let n = a.min, s = a.max, i = qe(n.pad, 0), r = qe(s.pad, 0), l = qe(n.hard, -Ze), d = qe(s.hard, Ze), u = qe(n.soft, Ze), m = qe(s.soft, -Ze), h = qe(n.mode, 0), f = qe(s.mode, 0), b = t - e, w = Ha(b), S = an(Dt(e), Dt(t)), $ = Ha(S), N = Dt($ - w);
  (b < 1e-24 || N > 10) && (b = 0, (e == 0 || t == 0) && (b = 1e-24, h == 2 && u != Ze && (i = 0), f == 2 && m != -Ze && (r = 0)));
  let y = b || S || 1e3, v = Ha(y), _ = ps(10, Cn(v)), k = y * (b == 0 ? e == 0 ? 0.1 : 1 : i), M = et(Ru(e - k, _ / 10), 24), T = e >= u && (h == 1 || h == 3 && M <= u || h == 2 && M >= u) ? u : Ze, A = an(l, M < T && e >= T ? T : aa(T, M)), F = y * (b == 0 ? t == 0 ? 0.1 : 1 : r), L = et(qi(t + F, _ / 10), 24), O = t <= m && (f == 1 || f == 3 && L >= m || f == 2 && L <= m) ? m : -Ze, q = aa(d, L > O && t <= O ? O : an(O, L));
  return A == q && A == 0 && (q = 100), [A, q];
}
const q4 = new Intl.NumberFormat(_s ? O4.language : "en-US"), fl = (e) => q4.format(e), zn = Math, $i = zn.PI, Dt = zn.abs, Cn = zn.floor, Nt = zn.round, Hn = zn.ceil, aa = zn.min, an = zn.max, ps = zn.pow, cd = zn.sign, Ha = zn.log10, Ou = zn.log2, F4 = (e, t = 1) => zn.sinh(e) * t, Tr = (e, t = 1) => zn.asinh(e / t), Ze = 1 / 0;
function dd(e) {
  return (Ha((e ^ e >> 31) - (e >> 31)) | 0) + 1;
}
function Fr(e, t, a) {
  return aa(an(e, t), a);
}
function Eu(e) {
  return typeof e == "function";
}
function Oe(e) {
  return Eu(e) ? e : () => e;
}
const B4 = () => {
}, Wu = (e) => e, Iu = (e, t) => t, H4 = (e) => null, ud = (e) => !0, hd = (e, t) => e == t, j4 = /\.\d*?(?=9{6,}|0{6,})/gm, Ro = (e) => {
  if (qu(e) || co.has(e))
    return e;
  const t = `${e}`, a = t.match(j4);
  if (a == null)
    return e;
  let n = a[0].length - 1;
  if (t.indexOf("e-") != -1) {
    let [s, i] = t.split("e");
    return +`${Ro(s)}e${i}`;
  }
  return et(e, n);
};
function zo(e, t) {
  return Ro(et(Ro(e / t)) * t);
}
function qi(e, t) {
  return Ro(Hn(Ro(e / t)) * t);
}
function Ru(e, t) {
  return Ro(Cn(Ro(e / t)) * t);
}
function et(e, t = 0) {
  if (qu(e))
    return e;
  let a = 10 ** t, n = e * a * (1 + Number.EPSILON);
  return Nt(n) / a;
}
const co = /* @__PURE__ */ new Map();
function Lu(e) {
  return (("" + e).split(".")[1] || "").length;
}
function ei(e, t, a, n) {
  let s = [], i = n.map(Lu);
  for (let r = t; r < a; r++) {
    let l = Dt(r), d = et(ps(e, r), l);
    for (let u = 0; u < n.length; u++) {
      let m = e == 10 ? +`${n[u]}e${r}` : n[u] * d, h = (r >= 0 ? 0 : l) + (r >= i[u] ? 0 : i[u]), f = e == 10 ? m : et(m, h);
      s.push(f), co.set(f, h);
    }
  }
  return s;
}
const Us = {}, gl = [], fs = [null, null], so = Array.isArray, qu = Number.isInteger, Y4 = (e) => e === void 0;
function md(e) {
  return typeof e == "string";
}
function Fi(e) {
  let t = !1;
  if (e != null) {
    let a = e.constructor;
    t = a == null || a == Object;
  }
  return t;
}
function V4(e) {
  return e != null && typeof e == "object";
}
const G4 = Object.getPrototypeOf(Uint8Array), Fu = "__proto__";
function gs(e, t = Fi) {
  let a;
  if (so(e)) {
    let n = e.find((s) => s != null);
    if (so(n) || t(n)) {
      a = Array(e.length);
      for (let s = 0; s < e.length; s++)
        a[s] = gs(e[s], t);
    } else
      a = e.slice();
  } else if (e instanceof G4)
    a = e.slice();
  else if (t(e)) {
    a = {};
    for (let n in e)
      n != Fu && (a[n] = gs(e[n], t));
  } else
    a = e;
  return a;
}
function Mt(e) {
  let t = arguments;
  for (let a = 1; a < t.length; a++) {
    let n = t[a];
    for (let s in n)
      s != Fu && (Fi(e[s]) ? Mt(e[s], gs(n[s])) : e[s] = gs(n[s]));
  }
  return e;
}
const K4 = 0, U4 = 1, X4 = 2;
function J4(e, t, a) {
  for (let n = 0, s, i = -1; n < t.length; n++) {
    let r = t[n];
    if (r > i) {
      for (s = r - 1; s >= 0 && e[s] == null; )
        e[s--] = null;
      for (s = r + 1; s < a && e[s] == null; )
        e[i = s++] = null;
    }
  }
}
function Q4(e, t) {
  if (tO(e)) {
    let r = e[0].slice();
    for (let l = 1; l < e.length; l++)
      r.push(...e[l].slice(1));
    return nO(r[0]) || (r = eO(r)), r;
  }
  let a = /* @__PURE__ */ new Set();
  for (let r = 0; r < e.length; r++) {
    let d = e[r][0], u = d.length;
    for (let m = 0; m < u; m++)
      a.add(d[m]);
  }
  let n = [Array.from(a).sort((r, l) => r - l)], s = n[0].length, i = /* @__PURE__ */ new Map();
  for (let r = 0; r < s; r++)
    i.set(n[0][r], r);
  for (let r = 0; r < e.length; r++) {
    let l = e[r], d = l[0];
    for (let u = 1; u < l.length; u++) {
      let m = l[u], h = Array(s).fill(void 0), f = t ? t[r][u] : U4, b = [];
      for (let w = 0; w < m.length; w++) {
        let S = m[w], $ = i.get(d[w]);
        S === null ? f != K4 && (h[$] = S, f == X4 && b.push($)) : h[$] = S;
      }
      J4(h, b, s), n.push(h);
    }
  }
  return n;
}
const Z4 = typeof queueMicrotask > "u" ? (e) => Promise.resolve().then(e) : queueMicrotask;
function eO(e) {
  let t = e[0], a = t.length, n = Array(a);
  for (let i = 0; i < n.length; i++)
    n[i] = i;
  n.sort((i, r) => t[i] - t[r]);
  let s = [];
  for (let i = 0; i < e.length; i++) {
    let r = e[i], l = Array(a);
    for (let d = 0; d < a; d++)
      l[d] = r[n[d]];
    s.push(l);
  }
  return s;
}
function tO(e) {
  let t = e[0][0], a = t.length;
  for (let n = 1; n < e.length; n++) {
    let s = e[n][0];
    if (s.length != a)
      return !1;
    if (s != t) {
      for (let i = 0; i < a; i++)
        if (s[i] != t[i])
          return !1;
    }
  }
  return !0;
}
function nO(e, t = 100) {
  const a = e.length;
  if (a <= 1)
    return !0;
  let n = 0, s = a - 1;
  for (; n <= s && e[n] == null; )
    n++;
  for (; s >= n && e[s] == null; )
    s--;
  if (s <= n)
    return !0;
  const i = an(1, Cn((s - n + 1) / t));
  for (let r = e[n], l = n + i; l <= s; l += i) {
    const d = e[l];
    if (d != null) {
      if (d <= r)
        return !1;
      r = d;
    }
  }
  return !0;
}
const Bu = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
], Hu = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];
function ju(e) {
  return e.slice(0, 3);
}
const aO = Hu.map(ju), oO = Bu.map(ju), sO = {
  MMMM: Bu,
  MMM: oO,
  WWWW: Hu,
  WWW: aO
};
function Fs(e) {
  return (e < 10 ? "0" : "") + e;
}
function iO(e) {
  return (e < 10 ? "00" : e < 100 ? "0" : "") + e;
}
const rO = {
  // 2019
  YYYY: (e) => e.getFullYear(),
  // 19
  YY: (e) => (e.getFullYear() + "").slice(2),
  // July
  MMMM: (e, t) => t.MMMM[e.getMonth()],
  // Jul
  MMM: (e, t) => t.MMM[e.getMonth()],
  // 07
  MM: (e) => Fs(e.getMonth() + 1),
  // 7
  M: (e) => e.getMonth() + 1,
  // 09
  DD: (e) => Fs(e.getDate()),
  // 9
  D: (e) => e.getDate(),
  // Monday
  WWWW: (e, t) => t.WWWW[e.getDay()],
  // Mon
  WWW: (e, t) => t.WWW[e.getDay()],
  // 03
  HH: (e) => Fs(e.getHours()),
  // 3
  H: (e) => e.getHours(),
  // 9 (12hr, unpadded)
  h: (e) => {
    let t = e.getHours();
    return t == 0 ? 12 : t > 12 ? t - 12 : t;
  },
  // AM
  AA: (e) => e.getHours() >= 12 ? "PM" : "AM",
  // am
  aa: (e) => e.getHours() >= 12 ? "pm" : "am",
  // a
  a: (e) => e.getHours() >= 12 ? "p" : "a",
  // 09
  mm: (e) => Fs(e.getMinutes()),
  // 9
  m: (e) => e.getMinutes(),
  // 09
  ss: (e) => Fs(e.getSeconds()),
  // 9
  s: (e) => e.getSeconds(),
  // 374
  fff: (e) => iO(e.getMilliseconds())
};
function bl(e, t) {
  t = t || sO;
  let a = [], n = /\{([a-z]+)\}|[^{]+/gi, s;
  for (; s = n.exec(e); )
    a.push(s[0][0] == "{" ? rO[s[1]] : s[0]);
  return (i) => {
    let r = "";
    for (let l = 0; l < a.length; l++)
      r += typeof a[l] == "string" ? a[l] : a[l](i, t);
    return r;
  };
}
const lO = new Intl.DateTimeFormat().resolvedOptions().timeZone;
function cO(e, t) {
  let a;
  return t == "UTC" || t == "Etc/UTC" ? a = new Date(+e + e.getTimezoneOffset() * 6e4) : t == lO ? a = e : (a = new Date(e.toLocaleString("en-US", { timeZone: t })), a.setMilliseconds(e.getMilliseconds())), a;
}
const Yu = (e) => e % 1 == 0, Di = [1, 2, 2.5, 5], dO = ei(10, -32, 0, Di), Vu = ei(10, 0, 32, Di), uO = Vu.filter(Yu), Po = dO.concat(Vu), yl = `
`, Gu = "{YYYY}", pd = yl + Gu, Ku = "{M}/{D}", Gs = yl + Ku, xi = Gs + "/{YY}", Uu = "{aa}", hO = "{h}:{mm}", ds = hO + Uu, fd = yl + ds, gd = ":{ss}", Ye = null;
function Xu(e) {
  let t = e * 1e3, a = t * 60, n = a * 60, s = n * 24, i = s * 30, r = s * 365, d = (e == 1 ? ei(10, 0, 3, Di).filter(Yu) : ei(10, -3, 0, Di)).concat([
    // minute divisors (# of secs)
    t,
    t * 5,
    t * 10,
    t * 15,
    t * 30,
    // hour divisors (# of mins)
    a,
    a * 5,
    a * 10,
    a * 15,
    a * 30,
    // day divisors (# of hrs)
    n,
    n * 2,
    n * 3,
    n * 4,
    n * 6,
    n * 8,
    n * 12,
    // month divisors TODO: need more?
    s,
    s * 2,
    s * 3,
    s * 4,
    s * 5,
    s * 6,
    s * 7,
    s * 8,
    s * 9,
    s * 10,
    s * 15,
    // year divisors (# months, approx)
    i,
    i * 2,
    i * 3,
    i * 4,
    i * 6,
    // century divisors
    r,
    r * 2,
    r * 5,
    r * 10,
    r * 25,
    r * 50,
    r * 100
  ]);
  const u = [
    //   tick incr    default          year                    month   day                   hour    min       sec   mode
    [r, Gu, Ye, Ye, Ye, Ye, Ye, Ye, 1],
    [s * 28, "{MMM}", pd, Ye, Ye, Ye, Ye, Ye, 1],
    [s, Ku, pd, Ye, Ye, Ye, Ye, Ye, 1],
    [n, "{h}" + Uu, xi, Ye, Gs, Ye, Ye, Ye, 1],
    [a, ds, xi, Ye, Gs, Ye, Ye, Ye, 1],
    [t, gd, xi + " " + ds, Ye, Gs + " " + ds, Ye, fd, Ye, 1],
    [e, gd + ".{fff}", xi + " " + ds, Ye, Gs + " " + ds, Ye, fd, Ye, 1]
  ];
  function m(h) {
    return (f, b, w, S, $, N) => {
      let y = [], v = $ >= r, _ = $ >= i && $ < r, k = h(w), M = et(k * e, 3), T = Cr(k.getFullYear(), v ? 0 : k.getMonth(), _ || v ? 1 : k.getDate()), A = et(T * e, 3);
      if (_ || v) {
        let F = _ ? $ / i : 0, L = v ? $ / r : 0, O = M == A ? M : et(Cr(T.getFullYear() + L, T.getMonth() + F, 1) * e, 3), q = new Date(Nt(O / e)), j = q.getFullYear(), D = q.getMonth();
        for (let H = 0; O <= S; H++) {
          let K = Cr(j + L * H, D + F * H, 1), Y = K - h(et(K * e, 3));
          O = et((+K + Y) * e, 3), O <= S && y.push(O);
        }
      } else {
        let F = $ >= s ? s : $, L = Cn(w) - Cn(M), O = A + L + qi(M - A, F);
        y.push(O);
        let q = h(O), j = q.getHours() + q.getMinutes() / a + q.getSeconds() / n, D = $ / n, H = f.axes[b]._space, K = N / H;
        for (; O = et(O + $, e == 1 ? 0 : 3), !(O > S); )
          if (D > 1) {
            let Y = Cn(et(j + D, 6)) % 24, ne = h(O).getHours() - Y;
            ne > 1 && (ne = -1), O -= ne * n, j = (j + D) % 24;
            let U = y[y.length - 1];
            et((O - U) / $, 3) * K >= 0.7 && y.push(O);
          } else
            y.push(O);
      }
      return y;
    };
  }
  return [
    d,
    u,
    m
  ];
}
const [mO, pO, fO] = Xu(1), [gO, bO, yO] = Xu(1e-3);
ei(2, -53, 53, [1]);
function bd(e, t) {
  return e.map((a) => a.map(
    (n, s) => s == 0 || s == 8 || n == null ? n : t(s == 1 || a[8] == 0 ? n : a[1] + n)
  ));
}
function yd(e, t) {
  return (a, n, s, i, r) => {
    let l = t.find((w) => r >= w[0]) || t[t.length - 1], d, u, m, h, f, b;
    return n.map((w) => {
      let S = e(w), $ = S.getFullYear(), N = S.getMonth(), y = S.getDate(), v = S.getHours(), _ = S.getMinutes(), k = S.getSeconds(), M = $ != d && l[2] || N != u && l[3] || y != m && l[4] || v != h && l[5] || _ != f && l[6] || k != b && l[7] || l[1];
      return d = $, u = N, m = y, h = v, f = _, b = k, M(S);
    });
  };
}
function vO(e, t) {
  let a = bl(t);
  return (n, s, i, r, l) => s.map((d) => a(e(d)));
}
function Cr(e, t, a) {
  return new Date(e, t, a);
}
function vd(e, t) {
  return t(e);
}
const wO = "{YYYY}-{MM}-{DD} {h}:{mm}{aa}";
function wd(e, t) {
  return (a, n, s, i) => i == null ? ul : t(e(n));
}
function kO(e, t) {
  let a = e.series[t];
  return a.width ? a.stroke(e, t) : a.points.width ? a.points.stroke(e, t) : null;
}
function _O(e, t) {
  return e.series[t].fill(e, t);
}
const xO = {
  show: !0,
  live: !0,
  isolate: !1,
  mount: B4,
  markers: {
    show: !0,
    width: 2,
    stroke: kO,
    fill: _O,
    dash: "solid"
  },
  idx: null,
  idxs: null,
  values: []
};
function SO(e, t) {
  let a = e.cursor.points, n = qn(), s = a.size(e, t);
  ut(n, Ys, s), ut(n, Vs, s);
  let i = s / -2;
  ut(n, "marginLeft", i), ut(n, "marginTop", i);
  let r = a.width(e, t, s);
  return r && ut(n, "borderWidth", r), n;
}
function MO(e, t) {
  let a = e.series[t].points;
  return a._fill || a._stroke;
}
function $O(e, t) {
  let a = e.series[t].points;
  return a._stroke || a._fill;
}
function TO(e, t) {
  return e.series[t].points.size;
}
const Nr = [0, 0];
function CO(e, t, a) {
  return Nr[0] = t, Nr[1] = a, Nr;
}
function Si(e, t, a, n = !0) {
  return (s) => {
    s.button == 0 && (!n || s.target == t) && a(s);
  };
}
function Dr(e, t, a, n = !0) {
  return (s) => {
    (!n || s.target == t) && a(s);
  };
}
const NO = {
  show: !0,
  x: !0,
  y: !0,
  lock: !1,
  move: CO,
  points: {
    one: !1,
    show: SO,
    size: TO,
    width: 0,
    stroke: $O,
    fill: MO
  },
  bind: {
    mousedown: Si,
    mouseup: Si,
    click: Si,
    // legend clicks, not .u-over clicks
    dblclick: Si,
    mousemove: Dr,
    mouseleave: Dr,
    mouseenter: Dr
  },
  drag: {
    setScale: !0,
    x: !0,
    y: !1,
    dist: 0,
    uni: null,
    click: (e, t) => {
      t.stopPropagation(), t.stopImmediatePropagation();
    },
    _x: !1,
    _y: !1
  },
  focus: {
    dist: (e, t, a, n, s) => n - s,
    prox: -1,
    bias: 0
  },
  hover: {
    skip: [void 0],
    prox: null,
    bias: 0
  },
  left: -10,
  top: -10,
  idx: null,
  dataIdx: null,
  idxs: null,
  event: null
}, Ju = {
  show: !0,
  stroke: "rgba(0,0,0,0.07)",
  width: 2
  //	dash: [],
}, vl = Mt({}, Ju, {
  filter: Iu
}), Qu = Mt({}, vl, {
  size: 10
}), Zu = Mt({}, Ju, {
  show: !1
}), wl = '12px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"', eh = "bold " + wl, th = 1.5, kd = {
  show: !0,
  scale: "x",
  stroke: dl,
  space: 50,
  gap: 5,
  alignTo: 1,
  size: 50,
  labelGap: 0,
  labelSize: 30,
  labelFont: eh,
  side: 2,
  //	class: "x-vals",
  //	incrs: timeIncrs,
  //	values: timeVals,
  //	filter: retArg1,
  grid: vl,
  ticks: Qu,
  border: Zu,
  font: wl,
  lineGap: th,
  rotate: 0
}, DO = "Value", zO = "Time", _d = {
  show: !0,
  scale: "x",
  auto: !1,
  sorted: 1,
  //	label: "Time",
  //	value: v => stamp(new Date(v * 1e3)),
  // internal caches
  min: Ze,
  max: -Ze,
  idxs: []
};
function PO(e, t, a, n, s) {
  return t.map((i) => i == null ? "" : fl(i));
}
function AO(e, t, a, n, s, i, r) {
  let l = [], d = co.get(s) || 0;
  a = r ? a : et(qi(a, s), d);
  for (let u = a; u <= n; u = et(u + s, d))
    l.push(Object.is(u, -0) ? 0 : u);
  return l;
}
function Br(e, t, a, n, s, i, r) {
  const l = [], d = e.scales[e.axes[t].scale].log, u = d == 10 ? Ha : Ou, m = Cn(u(a));
  s = ps(d, m), d == 10 && (s = Po[na(s, Po)]);
  let h = a, f = s * d;
  d == 10 && (f = Po[na(f, Po)]);
  do
    l.push(h), h = h + s, d == 10 && !co.has(h) && (h = et(h, co.get(s))), h >= f && (s = h, f = s * d, d == 10 && (f = Po[na(f, Po)]));
  while (h <= n);
  return l;
}
function OO(e, t, a, n, s, i, r) {
  let d = e.scales[e.axes[t].scale].asinh, u = n > d ? Br(e, t, an(d, a), n, s) : [d], m = n >= 0 && a <= 0 ? [0] : [];
  return (a < -d ? Br(e, t, an(d, -n), -a, s) : [d]).reverse().map((f) => -f).concat(m, u);
}
const nh = /./, EO = /[12357]/, WO = /[125]/, xd = /1/, Hr = (e, t, a, n) => e.map((s, i) => t == 4 && s == 0 || i % n == 0 && a.test(s.toExponential()[s < 0 ? 1 : 0]) ? s : null);
function IO(e, t, a, n, s) {
  let i = e.axes[a], r = i.scale, l = e.scales[r], d = e.valToPos, u = i._space, m = d(10, r), h = d(9, r) - m >= u ? nh : d(7, r) - m >= u ? EO : d(5, r) - m >= u ? WO : xd;
  if (h == xd) {
    let f = Dt(d(1, r) - m);
    if (f < u)
      return Hr(t.slice().reverse(), l.distr, h, Hn(u / f)).reverse();
  }
  return Hr(t, l.distr, h, 1);
}
function RO(e, t, a, n, s) {
  let i = e.axes[a], r = i.scale, l = i._space, d = e.valToPos, u = Dt(d(1, r) - d(2, r));
  return u < l ? Hr(t.slice().reverse(), 3, nh, Hn(l / u)).reverse() : t;
}
function LO(e, t, a, n) {
  return n == null ? ul : t == null ? "" : fl(t);
}
const Sd = {
  show: !0,
  scale: "y",
  stroke: dl,
  space: 30,
  gap: 5,
  alignTo: 1,
  size: 50,
  labelGap: 0,
  labelSize: 30,
  labelFont: eh,
  side: 3,
  //	class: "y-vals",
  //	incrs: numIncrs,
  //	values: (vals, space) => vals,
  //	filter: retArg1,
  grid: vl,
  ticks: Qu,
  border: Zu,
  font: wl,
  lineGap: th,
  rotate: 0
};
function qO(e, t) {
  let a = 3 + (e || 1) * 2;
  return et(a * t, 3);
}
function FO(e, t) {
  let { scale: a, idxs: n } = e.series[0], s = e._data[0], i = e.valToPos(s[n[0]], a, !0), r = e.valToPos(s[n[1]], a, !0), l = Dt(r - i), d = e.series[t], u = l / (d.points.space * Be);
  return n[1] - n[0] <= u;
}
const Md = {
  scale: null,
  auto: !0,
  sorted: 0,
  // internal caches
  min: Ze,
  max: -Ze
}, ah = (e, t, a, n, s) => s, $d = {
  show: !0,
  auto: !0,
  sorted: 0,
  gaps: ah,
  alpha: 1,
  facets: [
    Mt({}, Md, { scale: "x" }),
    Mt({}, Md, { scale: "y" })
  ]
}, Td = {
  scale: "y",
  auto: !0,
  sorted: 0,
  show: !0,
  spanGaps: !1,
  gaps: ah,
  alpha: 1,
  points: {
    show: FO,
    filter: null
    //  paths:
    //	stroke: "#000",
    //	fill: "#fff",
    //	width: 1,
    //	size: 10,
  },
  //	label: "Value",
  //	value: v => v,
  values: null,
  // internal caches
  min: Ze,
  max: -Ze,
  idxs: [],
  path: null,
  clip: null
};
function BO(e, t, a, n, s) {
  return a / 10;
}
const oh = {
  time: m4,
  auto: !0,
  distr: 1,
  log: 10,
  asinh: 1,
  min: null,
  max: null,
  dir: 1,
  ori: 0
}, HO = Mt({}, oh, {
  time: !1,
  ori: 1
}), Cd = {};
function sh(e, t) {
  let a = Cd[e];
  return a || (a = {
    key: e,
    plots: [],
    sub(n) {
      a.plots.push(n);
    },
    unsub(n) {
      a.plots = a.plots.filter((s) => s != n);
    },
    pub(n, s, i, r, l, d, u) {
      for (let m = 0; m < a.plots.length; m++)
        a.plots[m] != s && a.plots[m].pub(n, s, i, r, l, d, u);
    }
  }, e != null && (Cd[e] = a)), a;
}
const bs = 1, jr = 2;
function Fo(e, t, a) {
  const n = e.mode, s = e.series[t], i = n == 2 ? e._data[t] : e._data, r = e.scales, l = e.bbox;
  let d = i[0], u = n == 2 ? i[1] : i[t], m = n == 2 ? r[s.facets[0].scale] : r[e.series[0].scale], h = n == 2 ? r[s.facets[1].scale] : r[s.scale], f = l.left, b = l.top, w = l.width, S = l.height, $ = e.valToPosH, N = e.valToPosV;
  return m.ori == 0 ? a(
    s,
    d,
    u,
    m,
    h,
    $,
    N,
    f,
    b,
    w,
    S,
    Hi,
    xs,
    Yi,
    rh,
    ch
  ) : a(
    s,
    d,
    u,
    m,
    h,
    N,
    $,
    b,
    f,
    S,
    w,
    ji,
    Ss,
    xl,
    lh,
    dh
  );
}
function kl(e, t) {
  let a = 0, n = 0, s = qe(e.bands, gl);
  for (let i = 0; i < s.length; i++) {
    let r = s[i];
    r.series[0] == t ? a = r.dir : r.series[1] == t && (r.dir == 1 ? n |= 1 : n |= 2);
  }
  return [
    a,
    n == 1 ? -1 : (
      // neg only
      n == 2 ? 1 : (
        // pos only
        n == 3 ? 2 : (
          // both
          0
        )
      )
    )
  ];
}
function jO(e, t, a, n, s) {
  let i = e.mode, r = e.series[t], l = i == 2 ? r.facets[1].scale : r.scale, d = e.scales[l];
  return s == -1 ? d.min : s == 1 ? d.max : d.distr == 3 ? d.dir == 1 ? d.min : d.max : 0;
}
function ja(e, t, a, n, s, i) {
  return Fo(e, t, (r, l, d, u, m, h, f, b, w, S, $) => {
    let N = r.pxRound;
    const y = u.dir * (u.ori == 0 ? 1 : -1), v = u.ori == 0 ? xs : Ss;
    let _, k;
    y == 1 ? (_ = a, k = n) : (_ = n, k = a);
    let M = N(h(l[_], u, S, b)), T = N(f(d[_], m, $, w)), A = N(h(l[k], u, S, b)), F = N(f(i == 1 ? m.max : m.min, m, $, w)), L = new Path2D(s);
    return v(L, A, F), v(L, M, F), v(L, M, T), L;
  });
}
function Bi(e, t, a, n, s, i) {
  let r = null;
  if (e.length > 0) {
    r = new Path2D();
    const l = t == 0 ? Yi : xl;
    let d = a;
    for (let h = 0; h < e.length; h++) {
      let f = e[h];
      if (f[1] > f[0]) {
        let b = f[0] - d;
        b > 0 && l(r, d, n, b, n + i), d = f[1];
      }
    }
    let u = a + s - d, m = 10;
    u > 0 && l(r, d, n - m / 2, u, n + i + m);
  }
  return r;
}
function YO(e, t, a) {
  let n = e[e.length - 1];
  n && n[0] == t ? n[1] = a : e.push([t, a]);
}
function _l(e, t, a, n, s, i, r) {
  let l = [], d = e.length;
  for (let u = s == 1 ? a : n; u >= a && u <= n; u += s)
    if (t[u] === null) {
      let h = u, f = u;
      if (s == 1)
        for (; ++u <= n && t[u] === null; )
          f = u;
      else
        for (; --u >= a && t[u] === null; )
          f = u;
      let b = i(e[h]), w = f == h ? b : i(e[f]), S = h - s;
      b = r <= 0 && S >= 0 && S < d ? i(e[S]) : b;
      let N = f + s;
      w = r >= 0 && N >= 0 && N < d ? i(e[N]) : w, w >= b && l.push([b, w]);
    }
  return l;
}
function Nd(e) {
  return e == 0 ? Wu : e == 1 ? Nt : (t) => zo(t, e);
}
function ih(e) {
  let t = e == 0 ? Hi : ji, a = e == 0 ? (s, i, r, l, d, u) => {
    s.arcTo(i, r, l, d, u);
  } : (s, i, r, l, d, u) => {
    s.arcTo(r, i, d, l, u);
  }, n = e == 0 ? (s, i, r, l, d) => {
    s.rect(i, r, l, d);
  } : (s, i, r, l, d) => {
    s.rect(r, i, d, l);
  };
  return (s, i, r, l, d, u = 0, m = 0) => {
    u == 0 && m == 0 ? n(s, i, r, l, d) : (u = aa(u, l / 2, d / 2), m = aa(m, l / 2, d / 2), t(s, i + u, r), a(s, i + l, r, i + l, r + d, u), a(s, i + l, r + d, i, r + d, m), a(s, i, r + d, i, r, m), a(s, i, r, i + l, r, u), s.closePath());
  };
}
const Hi = (e, t, a) => {
  e.moveTo(t, a);
}, ji = (e, t, a) => {
  e.moveTo(a, t);
}, xs = (e, t, a) => {
  e.lineTo(t, a);
}, Ss = (e, t, a) => {
  e.lineTo(a, t);
}, Yi = ih(0), xl = ih(1), rh = (e, t, a, n, s, i) => {
  e.arc(t, a, n, s, i);
}, lh = (e, t, a, n, s, i) => {
  e.arc(a, t, n, s, i);
}, ch = (e, t, a, n, s, i, r) => {
  e.bezierCurveTo(t, a, n, s, i, r);
}, dh = (e, t, a, n, s, i, r) => {
  e.bezierCurveTo(a, t, s, n, r, i);
};
function uh(e) {
  return (t, a, n, s, i) => Fo(t, a, (r, l, d, u, m, h, f, b, w, S, $) => {
    let { pxRound: N, points: y } = r, v, _;
    u.ori == 0 ? (v = Hi, _ = rh) : (v = ji, _ = lh);
    const k = et(y.width * Be, 3);
    let M = (y.size - y.width) / 2 * Be, T = et(M * 2, 3), A = new Path2D(), F = new Path2D(), { left: L, top: O, width: q, height: j } = t.bbox;
    Yi(
      F,
      L - T,
      O - T,
      q + T * 2,
      j + T * 2
    );
    const D = (H) => {
      if (d[H] != null) {
        let K = N(h(l[H], u, S, b)), Y = N(f(d[H], m, $, w));
        v(A, K + M, Y), _(A, K, Y, M, 0, $i * 2);
      }
    };
    if (i)
      i.forEach(D);
    else
      for (let H = n; H <= s; H++)
        D(H);
    return {
      stroke: k > 0 ? A : null,
      fill: A,
      clip: F,
      flags: bs | jr
    };
  });
}
function hh(e) {
  return (t, a, n, s, i, r) => {
    n != s && (i != n && r != n && e(t, a, n), i != s && r != s && e(t, a, s), e(t, a, r));
  };
}
const VO = hh(xs), GO = hh(Ss);
function mh(e) {
  const t = qe(e?.alignGaps, 0);
  return (a, n, s, i) => Fo(a, n, (r, l, d, u, m, h, f, b, w, S, $) => {
    [s, i] = Ri(d, s, i);
    let N = r.pxRound, y = (j) => N(h(j, u, S, b)), v = (j) => N(f(j, m, $, w)), _, k;
    u.ori == 0 ? (_ = xs, k = VO) : (_ = Ss, k = GO);
    const M = u.dir * (u.ori == 0 ? 1 : -1), T = { stroke: new Path2D(), fill: null, clip: null, band: null, gaps: null, flags: bs }, A = T.stroke;
    let F = !1;
    if (i - s >= S * 4) {
      let j = (R) => a.posToVal(R, u.key, !0), D = null, H = null, K, Y, se, te = y(l[M == 1 ? s : i]), ne = y(l[s]), U = y(l[i]), z = j(M == 1 ? ne + 1 : U - 1);
      for (let R = M == 1 ? s : i; R >= s && R <= i; R += M) {
        let X = l[R], me = (M == 1 ? X < z : X > z) ? te : y(X), ue = d[R];
        me == te ? ue != null ? (Y = ue, D == null ? (_(A, me, v(Y)), K = D = H = Y) : Y < D ? D = Y : Y > H && (H = Y)) : ue === null && (F = !0) : (D != null && k(A, te, v(D), v(H), v(K), v(Y)), ue != null ? (Y = ue, _(A, me, v(Y)), D = H = K = Y) : (D = H = null, ue === null && (F = !0)), te = me, z = j(te + M));
      }
      D != null && D != H && se != te && k(A, te, v(D), v(H), v(K), v(Y));
    } else
      for (let j = M == 1 ? s : i; j >= s && j <= i; j += M) {
        let D = d[j];
        D === null ? F = !0 : D != null && _(A, y(l[j]), v(D));
      }
    let [O, q] = kl(a, n);
    if (r.fill != null || O != 0) {
      let j = T.fill = new Path2D(A), D = r.fillTo(a, n, r.min, r.max, O), H = v(D), K = y(l[s]), Y = y(l[i]);
      M == -1 && ([Y, K] = [K, Y]), _(j, Y, H), _(j, K, H);
    }
    if (!r.spanGaps) {
      let j = [];
      F && j.push(..._l(l, d, s, i, M, y, t)), T.gaps = j = r.gaps(a, n, s, i, j), T.clip = Bi(j, u.ori, b, w, S, $);
    }
    return q != 0 && (T.band = q == 2 ? [
      ja(a, n, s, i, A, -1),
      ja(a, n, s, i, A, 1)
    ] : ja(a, n, s, i, A, q)), T;
  });
}
function KO(e) {
  const t = qe(e.align, 1), a = qe(e.ascDesc, !1), n = qe(e.alignGaps, 0), s = qe(e.extend, !1);
  return (i, r, l, d) => Fo(i, r, (u, m, h, f, b, w, S, $, N, y, v) => {
    [l, d] = Ri(h, l, d);
    let _ = u.pxRound, { left: k, width: M } = i.bbox, T = (ne) => _(w(ne, f, y, $)), A = (ne) => _(S(ne, b, v, N)), F = f.ori == 0 ? xs : Ss;
    const L = { stroke: new Path2D(), fill: null, clip: null, band: null, gaps: null, flags: bs }, O = L.stroke, q = f.dir * (f.ori == 0 ? 1 : -1);
    let j = A(h[q == 1 ? l : d]), D = T(m[q == 1 ? l : d]), H = D, K = D;
    s && t == -1 && (K = k, F(O, K, j)), F(O, D, j);
    for (let ne = q == 1 ? l : d; ne >= l && ne <= d; ne += q) {
      let U = h[ne];
      if (U == null)
        continue;
      let z = T(m[ne]), R = A(U);
      t == 1 ? F(O, z, j) : F(O, H, R), F(O, z, R), j = R, H = z;
    }
    let Y = H;
    s && t == 1 && (Y = k + M, F(O, Y, j));
    let [se, te] = kl(i, r);
    if (u.fill != null || se != 0) {
      let ne = L.fill = new Path2D(O), U = u.fillTo(i, r, u.min, u.max, se), z = A(U);
      F(ne, Y, z), F(ne, K, z);
    }
    if (!u.spanGaps) {
      let ne = [];
      ne.push(..._l(m, h, l, d, q, T, n));
      let U = u.width * Be / 2, z = a || t == 1 ? U : -U, R = a || t == -1 ? -U : U;
      ne.forEach((X) => {
        X[0] += z, X[1] += R;
      }), L.gaps = ne = u.gaps(i, r, l, d, ne), L.clip = Bi(ne, f.ori, $, N, y, v);
    }
    return te != 0 && (L.band = te == 2 ? [
      ja(i, r, l, d, O, -1),
      ja(i, r, l, d, O, 1)
    ] : ja(i, r, l, d, O, te)), L;
  });
}
function Dd(e, t, a, n, s, i, r = Ze) {
  if (e.length > 1) {
    let l = null;
    for (let d = 0, u = 1 / 0; d < e.length; d++)
      if (t[d] !== void 0) {
        if (l != null) {
          let m = Dt(e[d] - e[l]);
          m < u && (u = m, r = Dt(a(e[d], n, s, i) - a(e[l], n, s, i)));
        }
        l = d;
      }
  }
  return r;
}
function UO(e) {
  e = e || Us;
  const t = qe(e.size, [0.6, Ze, 1]), a = e.align || 0, n = e.gap || 0;
  let s = e.radius;
  s = // [valueRadius, baselineRadius]
  s == null ? [0, 0] : typeof s == "number" ? [s, 0] : s;
  const i = Oe(s), r = 1 - t[0], l = qe(t[1], Ze), d = qe(t[2], 1), u = qe(e.disp, Us), m = qe(e.each, (b) => {
  }), { fill: h, stroke: f } = u;
  return (b, w, S, $) => Fo(b, w, (N, y, v, _, k, M, T, A, F, L, O) => {
    let q = N.pxRound, j = a, D = n * Be, H = l * Be, K = d * Be, Y, se;
    _.ori == 0 ? [Y, se] = i(b, w) : [se, Y] = i(b, w);
    const te = _.dir * (_.ori == 0 ? 1 : -1);
    let ne = _.ori == 0 ? Yi : xl, U = _.ori == 0 ? m : (ae, Ue, kt, Ga, $a, Pn, Ta) => {
      m(ae, Ue, kt, $a, Ga, Ta, Pn);
    }, z = qe(b.bands, gl).find((ae) => ae.series[0] == w), R = z != null ? z.dir : 0, X = N.fillTo(b, w, N.min, N.max, R), le = q(T(X, k, O, F)), me, ue, ze, je = L, Ne = q(N.width * Be), ht = !1, Tt = null, it = null, Ct = null, Ht = null;
    h != null && (Ne == 0 || f != null) && (ht = !0, Tt = h.values(b, w, S, $), it = /* @__PURE__ */ new Map(), new Set(Tt).forEach((ae) => {
      ae != null && it.set(ae, new Path2D());
    }), Ne > 0 && (Ct = f.values(b, w, S, $), Ht = /* @__PURE__ */ new Map(), new Set(Ct).forEach((ae) => {
      ae != null && Ht.set(ae, new Path2D());
    })));
    let { x0: W, size: G } = u;
    if (W != null && G != null) {
      j = 1, y = W.values(b, w, S, $), W.unit == 2 && (y = y.map((kt) => b.posToVal(A + kt * L, _.key, !0)));
      let ae = G.values(b, w, S, $);
      G.unit == 2 ? ue = ae[0] * L : ue = M(ae[0], _, L, A) - M(0, _, L, A), je = Dd(y, v, M, _, L, A, je), ze = je - ue + D;
    } else
      je = Dd(y, v, M, _, L, A, je), ze = je * r + D, ue = je - ze;
    ze < 1 && (ze = 0), Ne >= ue / 2 && (Ne = 0), ze < 5 && (q = Wu);
    let ce = ze > 0, Se = je - ze - (ce ? Ne : 0);
    ue = q(Fr(Se, K, H)), me = (j == 0 ? ue / 2 : j == te ? 0 : ue) - j * te * ((j == 0 ? D / 2 : 0) + (ce ? Ne / 2 : 0));
    const ve = { stroke: null, fill: null, clip: null, band: null, gaps: null, flags: 0 }, on = ht ? null : new Path2D();
    let jt = null;
    if (z != null)
      jt = b.data[z.series[1]];
    else {
      let { y0: ae, y1: Ue } = u;
      ae != null && Ue != null && (v = Ue.values(b, w, S, $), jt = ae.values(b, w, S, $));
    }
    let ra = Y * ue, we = se * ue;
    for (let ae = te == 1 ? S : $; ae >= S && ae <= $; ae += te) {
      let Ue = v[ae];
      if (Ue == null)
        continue;
      if (jt != null) {
        let Yt = jt[ae] ?? 0;
        if (Ue - Yt == 0)
          continue;
        le = T(Yt, k, O, F);
      }
      let kt = _.distr != 2 || u != null ? y[ae] : ae, Ga = M(kt, _, L, A), $a = T(qe(Ue, X), k, O, F), Pn = q(Ga - me), Ta = q(an($a, le)), Xt = q(aa($a, le)), sn = Ta - Xt;
      if (Ue != null) {
        let Yt = Ue < 0 ? we : ra, vn = Ue < 0 ? ra : we;
        ht ? (Ne > 0 && Ct[ae] != null && ne(Ht.get(Ct[ae]), Pn, Xt + Cn(Ne / 2), ue, an(0, sn - Ne), Yt, vn), Tt[ae] != null && ne(it.get(Tt[ae]), Pn, Xt + Cn(Ne / 2), ue, an(0, sn - Ne), Yt, vn)) : ne(on, Pn, Xt + Cn(Ne / 2), ue, an(0, sn - Ne), Yt, vn), U(
          b,
          w,
          ae,
          Pn - Ne / 2,
          Xt,
          ue + Ne,
          sn
        );
      }
    }
    return Ne > 0 ? ve.stroke = ht ? Ht : on : ht || (ve._fill = N.width == 0 ? N._fill : N._stroke ?? N._fill, ve.width = 0), ve.fill = ht ? it : on, ve;
  });
}
function XO(e, t) {
  const a = qe(t?.alignGaps, 0);
  return (n, s, i, r) => Fo(n, s, (l, d, u, m, h, f, b, w, S, $, N) => {
    [i, r] = Ri(u, i, r);
    let y = l.pxRound, v = (Y) => y(f(Y, m, $, w)), _ = (Y) => y(b(Y, h, N, S)), k, M, T;
    m.ori == 0 ? (k = Hi, T = xs, M = ch) : (k = ji, T = Ss, M = dh);
    const A = m.dir * (m.ori == 0 ? 1 : -1);
    let F = v(d[A == 1 ? i : r]), L = F, O = [], q = [];
    for (let Y = A == 1 ? i : r; Y >= i && Y <= r; Y += A)
      if (u[Y] != null) {
        let te = d[Y], ne = v(te);
        O.push(L = ne), q.push(_(u[Y]));
      }
    const j = { stroke: e(O, q, k, T, M, y), fill: null, clip: null, band: null, gaps: null, flags: bs }, D = j.stroke;
    let [H, K] = kl(n, s);
    if (l.fill != null || H != 0) {
      let Y = j.fill = new Path2D(D), se = l.fillTo(n, s, l.min, l.max, H), te = _(se);
      T(Y, L, te), T(Y, F, te);
    }
    if (!l.spanGaps) {
      let Y = [];
      Y.push(..._l(d, u, i, r, A, v, a)), j.gaps = Y = l.gaps(n, s, i, r, Y), j.clip = Bi(Y, m.ori, w, S, $, N);
    }
    return K != 0 && (j.band = K == 2 ? [
      ja(n, s, i, r, D, -1),
      ja(n, s, i, r, D, 1)
    ] : ja(n, s, i, r, D, K)), j;
  });
}
function JO(e) {
  return XO(QO, e);
}
function QO(e, t, a, n, s, i) {
  const r = e.length;
  if (r < 2)
    return null;
  const l = new Path2D();
  if (a(l, e[0], t[0]), r == 2)
    n(l, e[1], t[1]);
  else {
    let d = Array(r), u = Array(r - 1), m = Array(r - 1), h = Array(r - 1);
    for (let f = 0; f < r - 1; f++)
      m[f] = t[f + 1] - t[f], h[f] = e[f + 1] - e[f], u[f] = m[f] / h[f];
    d[0] = u[0];
    for (let f = 1; f < r - 1; f++)
      u[f] === 0 || u[f - 1] === 0 || u[f - 1] > 0 != u[f] > 0 ? d[f] = 0 : (d[f] = 3 * (h[f - 1] + h[f]) / ((2 * h[f] + h[f - 1]) / u[f - 1] + (h[f] + 2 * h[f - 1]) / u[f]), isFinite(d[f]) || (d[f] = 0));
    d[r - 1] = u[r - 2];
    for (let f = 0; f < r - 1; f++)
      s(
        l,
        e[f] + h[f] / 3,
        t[f] + d[f] * h[f] / 3,
        e[f + 1] - h[f] / 3,
        t[f + 1] - d[f + 1] * h[f] / 3,
        e[f + 1],
        t[f + 1]
      );
  }
  return l;
}
const Yr = /* @__PURE__ */ new Set();
function zd() {
  for (let e of Yr)
    e.syncRect(!0);
}
_s && (Io(P4, ms, zd), Io(A4, ms, zd, !0), Io(Ci, ms, () => {
  Ut.pxRatio = Be;
}));
const ZO = mh(), eE = uh();
function Pd(e, t, a, n) {
  return (n ? [e[0], e[1]].concat(e.slice(2)) : [e[0]].concat(e.slice(1))).map((i, r) => Vr(i, r, t, a));
}
function tE(e, t) {
  return e.map((a, n) => n == 0 ? {} : Mt({}, t, a));
}
function Vr(e, t, a, n) {
  return Mt({}, t == 0 ? a : n, e);
}
function ph(e, t, a) {
  return t == null ? fs : [t, a];
}
const nE = ph;
function aE(e, t, a) {
  return t == null ? fs : Ni(t, a, pl, !0);
}
function fh(e, t, a, n) {
  return t == null ? fs : Li(t, a, e.scales[n].log, !1);
}
const oE = fh;
function gh(e, t, a, n) {
  return t == null ? fs : ml(t, a, e.scales[n].log, !1);
}
const sE = gh;
function iE(e, t, a, n, s) {
  let i = an(dd(e), dd(t)), r = t - e, l = na(s / n * r, a);
  do {
    let d = a[l], u = n * d / r;
    if (u >= s && i + (d < 5 ? co.get(d) : 0) <= 17)
      return [d, u];
  } while (++l < a.length);
  return [0, 0];
}
function Ad(e) {
  let t, a;
  return e = e.replace(/(\d+)px/, (n, s) => (t = Nt((a = +s) * Be)) + "px"), [e, t, a];
}
function rE(e) {
  e.show && [e.font, e.labelFont].forEach((t) => {
    let a = et(t[2] * Be, 1);
    t[0] = t[0].replace(/[0-9.]+px/, a + "px"), t[1] = a;
  });
}
function Ut(e, t, a) {
  const n = {
    mode: qe(e.mode, 1)
  }, s = n.mode;
  function i(p, g, x, C) {
    let E = g.valToPct(p);
    return C + x * (g.dir == -1 ? 1 - E : E);
  }
  function r(p, g, x, C) {
    let E = g.valToPct(p);
    return C + x * (g.dir == -1 ? E : 1 - E);
  }
  function l(p, g, x, C) {
    return g.ori == 0 ? i(p, g, x, C) : r(p, g, x, C);
  }
  n.valToPosH = i, n.valToPosV = r;
  let d = !1;
  n.status = 0;
  const u = n.root = qn(p4);
  if (e.id != null && (u.id = e.id), $n(u, e.class), e.title) {
    let p = qn(b4, u);
    p.textContent = e.title;
  }
  const m = ta("canvas"), h = n.ctx = m.getContext("2d"), f = qn(y4, u);
  Io("click", f, (p) => {
    p.target === w && (lt != Jo || mt != Qo) && Lt.click(n, p);
  }, !0);
  const b = n.under = qn(v4, f);
  f.appendChild(m);
  const w = n.over = qn(w4, f);
  e = gs(e);
  const S = +qe(e.pxAlign, 1), $ = Nd(S);
  (e.plugins || []).forEach((p) => {
    p.opts && (e = p.opts(n, e) || e);
  });
  const N = e.ms || 1e-3, y = n.series = s == 1 ? Pd(e.series || [], _d, Td, !1) : tE(e.series || [null], $d), v = n.axes = Pd(e.axes || [], kd, Sd, !0), _ = n.scales = {}, k = n.bands = e.bands || [];
  k.forEach((p) => {
    p.fill = Oe(p.fill || null), p.dir = qe(p.dir, -1);
  });
  const M = s == 2 ? y[1].facets[0].scale : y[0].scale, T = {
    axes: Dh,
    series: Mh
  }, A = (e.drawOrder || ["axes", "series"]).map((p) => T[p]);
  function F(p) {
    const g = p.distr == 3 ? (x) => Ha(x > 0 ? x : p.clamp(n, x, p.min, p.max, p.key)) : p.distr == 4 ? (x) => Tr(x, p.asinh) : p.distr == 100 ? (x) => p.fwd(x) : (x) => x;
    return (x) => {
      let C = g(x), { _min: E, _max: B } = p, V = B - E;
      return (C - E) / V;
    };
  }
  function L(p) {
    let g = _[p];
    if (g == null) {
      let x = (e.scales || Us)[p] || Us;
      if (x.from != null) {
        L(x.from);
        let C = Mt({}, _[x.from], x, { key: p });
        C.valToPct = F(C), _[p] = C;
      } else {
        g = _[p] = Mt({}, p == M ? oh : HO, x), g.key = p;
        let C = g.time, E = g.range, B = so(E);
        if ((p != M || s == 2 && !C) && (B && (E[0] == null || E[1] == null) && (E = {
          min: E[0] == null ? rd : {
            mode: 1,
            hard: E[0],
            soft: E[0]
          },
          max: E[1] == null ? rd : {
            mode: 1,
            hard: E[1],
            soft: E[1]
          }
        }, B = !1), !B && Fi(E))) {
          let V = E;
          E = (Q, Z, oe) => Z == null ? fs : Ni(Z, oe, V);
        }
        g.range = Oe(E || (C ? nE : p == M ? g.distr == 3 ? oE : g.distr == 4 ? sE : ph : g.distr == 3 ? fh : g.distr == 4 ? gh : aE)), g.auto = Oe(B ? !1 : g.auto), g.clamp = Oe(g.clamp || BO), g._min = g._max = null, g.valToPct = F(g);
      }
    }
  }
  L("x"), L("y"), s == 1 && y.forEach((p) => {
    L(p.scale);
  }), v.forEach((p) => {
    L(p.scale);
  });
  for (let p in e.scales)
    L(p);
  const O = _[M], q = O.distr;
  let j, D;
  O.ori == 0 ? ($n(u, f4), j = i, D = r) : ($n(u, g4), j = r, D = i);
  const H = {};
  for (let p in _) {
    let g = _[p];
    (g.min != null || g.max != null) && (H[p] = { min: g.min, max: g.max }, g.min = g.max = null);
  }
  const K = e.tzDate || ((p) => new Date(Nt(p / N))), Y = e.fmtDate || bl, se = N == 1 ? fO(K) : yO(K), te = yd(K, bd(N == 1 ? pO : bO, Y)), ne = wd(K, vd(wO, Y)), U = [], z = n.legend = Mt({}, xO, e.legend), R = n.cursor = Mt({}, NO, { drag: { y: s == 2 } }, e.cursor), X = z.show, le = R.show, me = z.markers;
  z.idxs = U, me.width = Oe(me.width), me.dash = Oe(me.dash), me.stroke = Oe(me.stroke), me.fill = Oe(me.fill);
  let ue, ze, je, Ne = [], ht = [], Tt, it = !1, Ct = {};
  if (z.live) {
    const p = y[1] ? y[1].values : null;
    it = p != null, Tt = it ? p(n, 1, 0) : { _: 0 };
    for (let g in Tt)
      Ct[g] = ul;
  }
  if (X)
    if (ue = ta("table", $4, u), je = ta("tbody", null, ue), z.mount(n, ue), it) {
      ze = ta("thead", null, ue, je);
      let p = ta("tr", null, ze);
      ta("th", null, p);
      for (var Ht in Tt)
        ta("th", Kc, p).textContent = Ht;
    } else
      $n(ue, C4), z.live && $n(ue, T4);
  const W = { show: !0 }, G = { show: !1 };
  function ce(p, g) {
    if (g == 0 && (it || !z.live || s == 2))
      return fs;
    let x = [], C = ta("tr", N4, je, je.childNodes[g]);
    $n(C, p.class), p.show || $n(C, Eo);
    let E = ta("th", null, C);
    if (me.show) {
      let Q = qn(D4, E);
      if (g > 0) {
        let Z = me.width(n, g);
        Z && (Q.style.border = Z + "px " + me.dash(n, g) + " " + me.stroke(n, g)), Q.style.background = me.fill(n, g);
      }
    }
    let B = qn(Kc, E);
    p.label instanceof HTMLElement ? B.appendChild(p.label) : B.textContent = p.label, g > 0 && (me.show || (B.style.color = p.width > 0 ? me.stroke(n, g) : me.fill(n, g)), ve("click", E, (Q) => {
      if (R._lock)
        return;
      Da(Q);
      let Z = y.indexOf(p);
      if ((Q.ctrlKey || Q.metaKey) != z.isolate) {
        let oe = y.some((ie, he) => he > 0 && he != Z && ie.show);
        y.forEach((ie, he) => {
          he > 0 && la(he, oe ? he == Z ? W : G : W, !0, xt.setSeries);
        });
      } else
        la(Z, { show: !p.show }, !0, xt.setSeries);
    }, !1), Bo && ve(Qc, E, (Q) => {
      R._lock || (Da(Q), la(y.indexOf(p), es, !0, xt.setSeries));
    }, !1));
    for (var V in Tt) {
      let Q = ta("td", z4, C);
      Q.textContent = "--", x.push(Q);
    }
    return [C, x];
  }
  const Se = /* @__PURE__ */ new Map();
  function ve(p, g, x, C = !0) {
    const E = Se.get(g) || {}, B = R.bind[p](n, g, x, C);
    B && (Io(p, g, E[p] = B), Se.set(g, E));
  }
  function on(p, g, x) {
    const C = Se.get(g) || {};
    for (let E in C)
      (p == null || E == p) && (qr(E, g, C[E]), delete C[E]);
    p == null && Se.delete(g);
  }
  let jt = 0, ra = 0, we = 0, ae = 0, Ue = 0, kt = 0, Ga = Ue, $a = kt, Pn = we, Ta = ae, Xt = 0, sn = 0, Yt = 0, vn = 0;
  n.bbox = {};
  let Ms = !1, mo = !1, Ca = !1, Na = !1, be = !1, ye = !1;
  function Me(p, g, x) {
    (x || p != n.width || g != n.height) && rt(p, g), Go(!1), Ca = !0, mo = !0, Ko();
  }
  function rt(p, g) {
    n.width = jt = we = p, n.height = ra = ae = g, Ue = kt = 0, Vi(), Gi();
    let x = n.bbox;
    Xt = x.left = zo(Ue * Be, 0.5), sn = x.top = zo(kt * Be, 0.5), Yt = x.width = zo(we * Be, 0.5), vn = x.height = zo(ae * Be, 0.5);
  }
  const Ie = 3;
  function An() {
    let p = !1, g = 0;
    for (; !p; ) {
      g++;
      let x = Ch(g), C = Nh(g);
      p = g == Ie || x && C, p || (rt(n.width, n.height), mo = !0);
    }
  }
  function We({ width: p, height: g }) {
    Me(p, g);
  }
  n.setSize = We;
  function Vi() {
    let p = !1, g = !1, x = !1, C = !1;
    v.forEach((E, B) => {
      if (E.show && E._show) {
        let { side: V, _size: Q } = E, Z = V % 2, oe = E.label != null ? E.labelSize : 0, ie = Q + oe;
        ie > 0 && (Z ? (we -= ie, V == 3 ? (Ue += ie, C = !0) : x = !0) : (ae -= ie, V == 0 ? (kt += ie, p = !0) : g = !0));
      }
    }), po[0] = p, po[1] = x, po[2] = g, po[3] = C, we -= Ka[1] + Ka[3], Ue += Ka[3], ae -= Ka[2] + Ka[0], kt += Ka[0];
  }
  function Gi() {
    let p = Ue + we, g = kt + ae, x = Ue, C = kt;
    function E(B, V) {
      switch (B) {
        case 1:
          return p += V, p - V;
        case 2:
          return g += V, g - V;
        case 3:
          return x -= V, x + V;
        case 0:
          return C -= V, C + V;
      }
    }
    v.forEach((B, V) => {
      if (B.show && B._show) {
        let Q = B.side;
        B._pos = E(Q, B._size), B.label != null && (B._lpos = E(Q, B.labelSize));
      }
    });
  }
  if (R.dataIdx == null) {
    let p = R.hover, g = p.skip = new Set(p.skip ?? []);
    g.add(void 0);
    let x = p.prox = Oe(p.prox), C = p.bias ??= 0;
    R.dataIdx = (E, B, V, Q) => {
      if (B == 0)
        return V;
      let Z = V, oe = x(E, B, V, Q) ?? Ze, ie = oe >= 0 && oe < Ze, he = O.ori == 0 ? we : ae, ke = R.left, Fe = t[0], Le = t[B];
      if (g.has(Le[V])) {
        Z = null;
        let Pe = null, ge = null, fe;
        if (C == 0 || C == -1)
          for (fe = V; Pe == null && fe-- > 0; )
            g.has(Le[fe]) || (Pe = fe);
        if (C == 0 || C == 1)
          for (fe = V; ge == null && fe++ < Le.length; )
            g.has(Le[fe]) || (ge = fe);
        if (Pe != null || ge != null)
          if (ie) {
            let dt = Pe == null ? -1 / 0 : j(Fe[Pe], O, he, 0), yt = ge == null ? 1 / 0 : j(Fe[ge], O, he, 0), It = ke - dt, Xe = yt - ke;
            It <= Xe ? It <= oe && (Z = Pe) : Xe <= oe && (Z = ge);
          } else
            Z = ge == null ? Pe : Pe == null ? ge : V - Pe <= ge - V ? Pe : ge;
      } else ie && Dt(ke - j(Fe[V], O, he, 0)) > oe && (Z = null);
      return Z;
    };
  }
  const Da = (p) => {
    R.event = p;
  };
  R.idxs = U, R._lock = !1;
  let _t = R.points;
  _t.show = Oe(_t.show), _t.size = Oe(_t.size), _t.stroke = Oe(_t.stroke), _t.width = Oe(_t.width), _t.fill = Oe(_t.fill);
  const rn = n.focus = Mt({}, e.focus || { alpha: 0.3 }, R.focus), Bo = rn.prox >= 0, Ho = Bo && _t.one;
  let On = [], jo = [], Yo = [];
  function Sl(p, g) {
    let x = _t.show(n, g);
    if (x instanceof HTMLElement)
      return $n(x, M4), $n(x, p.class), ga(x, -10, -10, we, ae), w.insertBefore(x, On[g]), x;
  }
  function Ml(p, g) {
    if (s == 1 || g > 0) {
      let x = s == 1 && _[p.scale].time, C = p.value;
      p.value = x ? md(C) ? wd(K, vd(C, Y)) : C || ne : C || LO, p.label = p.label || (x ? zO : DO);
    }
    if (Ho || g > 0) {
      p.width = p.width == null ? 1 : p.width, p.paths = p.paths || ZO || H4, p.fillTo = Oe(p.fillTo || jO), p.pxAlign = +qe(p.pxAlign, S), p.pxRound = Nd(p.pxAlign), p.stroke = Oe(p.stroke || null), p.fill = Oe(p.fill || null), p._stroke = p._fill = p._paths = p._focus = null;
      let x = qO(an(1, p.width), 1), C = p.points = Mt({}, {
        size: x,
        width: an(1, x * 0.2),
        stroke: p.stroke,
        space: x * 2,
        paths: eE,
        _stroke: null,
        _fill: null
      }, p.points);
      C.show = Oe(C.show), C.filter = Oe(C.filter), C.fill = Oe(C.fill), C.stroke = Oe(C.stroke), C.paths = Oe(C.paths), C.pxAlign = p.pxAlign;
    }
    if (X) {
      let x = ce(p, g);
      Ne.splice(g, 0, x[0]), ht.splice(g, 0, x[1]), z.values.push(null);
    }
    if (le) {
      U.splice(g, 0, null);
      let x = null;
      Ho ? g == 0 && (x = Sl(p, g)) : g > 0 && (x = Sl(p, g)), On.splice(g, 0, x), jo.splice(g, 0, 0), Yo.splice(g, 0, 0);
    }
    Wt("addSeries", g);
  }
  function wh(p, g) {
    g = g ?? y.length, p = s == 1 ? Vr(p, g, _d, Td) : Vr(p, g, {}, $d), y.splice(g, 0, p), Ml(y[g], g);
  }
  n.addSeries = wh;
  function kh(p) {
    if (y.splice(p, 1), X) {
      z.values.splice(p, 1), ht.splice(p, 1);
      let g = Ne.splice(p, 1)[0];
      on(null, g.firstChild), g.remove();
    }
    le && (U.splice(p, 1), On.splice(p, 1)[0].remove(), jo.splice(p, 1), Yo.splice(p, 1)), Wt("delSeries", p);
  }
  n.delSeries = kh;
  const po = [!1, !1, !1, !1];
  function _h(p, g) {
    if (p._show = p.show, p.show) {
      let x = p.side % 2, C = _[p.scale];
      C == null && (p.scale = x ? y[1].scale : M, C = _[p.scale]);
      let E = C.time;
      p.size = Oe(p.size), p.space = Oe(p.space), p.rotate = Oe(p.rotate), so(p.incrs) && p.incrs.forEach((V) => {
        !co.has(V) && co.set(V, Lu(V));
      }), p.incrs = Oe(p.incrs || (C.distr == 2 ? uO : E ? N == 1 ? mO : gO : Po)), p.splits = Oe(p.splits || (E && C.distr == 1 ? se : C.distr == 3 ? Br : C.distr == 4 ? OO : AO)), p.stroke = Oe(p.stroke), p.grid.stroke = Oe(p.grid.stroke), p.ticks.stroke = Oe(p.ticks.stroke), p.border.stroke = Oe(p.border.stroke);
      let B = p.values;
      p.values = // static array of tick values
      so(B) && !so(B[0]) ? Oe(B) : (
        // temporal
        E ? (
          // config array of fmtDate string tpls
          so(B) ? yd(K, bd(B, Y)) : (
            // fmtDate string tpl
            md(B) ? vO(K, B) : B || te
          )
        ) : B || PO
      ), p.filter = Oe(p.filter || (C.distr >= 3 && C.log == 10 ? IO : C.distr == 3 && C.log == 2 ? RO : Iu)), p.font = Ad(p.font), p.labelFont = Ad(p.labelFont), p._size = p.size(n, null, g, 0), p._space = p._rotate = p._incrs = p._found = // foundIncrSpace
      p._splits = p._values = null, p._size > 0 && (po[g] = !0, p._el = qn(k4, f));
    }
  }
  function $s(p, g, x, C) {
    let [E, B, V, Q] = x, Z = g % 2, oe = 0;
    return Z == 0 && (Q || B) && (oe = g == 0 && !E || g == 2 && !V ? Nt(kd.size / 3) : 0), Z == 1 && (E || V) && (oe = g == 1 && !B || g == 3 && !Q ? Nt(Sd.size / 2) : 0), oe;
  }
  const $l = n.padding = (e.padding || [$s, $s, $s, $s]).map((p) => Oe(qe(p, $s))), Ka = n._padding = $l.map((p, g) => p(n, g, po, 0));
  let Rt, Pt = null, At = null;
  const si = s == 1 ? y[0].idxs : null;
  let Kn = null, Ts = !1;
  function Tl(p, g) {
    if (t = p ?? [], n.data = n._data = t, s == 2) {
      Rt = 0;
      for (let x = 1; x < y.length; x++)
        Rt += t[x][0].length;
    } else {
      t.length == 0 && (n.data = n._data = t = [[]]), Kn = t[0], Rt = Kn.length;
      let x = t;
      if (q == 2) {
        x = t.slice();
        let C = x[0] = Array(Rt);
        for (let E = 0; E < Rt; E++)
          C[E] = E;
      }
      n._data = t = x;
    }
    if (Go(!0), Wt("setData"), q == 2 && (Ca = !0), g !== !1) {
      let x = O;
      x.auto(n, Ts) ? Ki() : Xa(M, x.min, x.max), Na = Na || R.left >= 0, ye = !0, Ko();
    }
  }
  n.setData = Tl;
  function Ki() {
    Ts = !0;
    let p, g;
    s == 1 && (Rt > 0 ? (Pt = si[0] = 0, At = si[1] = Rt - 1, p = t[0][Pt], g = t[0][At], q == 2 ? (p = Pt, g = At) : p == g && (q == 3 ? [p, g] = Li(p, p, O.log, !1) : q == 4 ? [p, g] = ml(p, p, O.log, !1) : O.time ? g = p + Nt(86400 / N) : [p, g] = Ni(p, g, pl, !0))) : (Pt = si[0] = p = null, At = si[1] = g = null)), Xa(M, p, g);
  }
  let ii, Vo, Ui, Xi, Ji, Qi, Zi, er, tr, ln;
  function Cl(p, g, x, C, E, B) {
    p ??= Xc, x ??= gl, C ??= "butt", E ??= Xc, B ??= "round", p != ii && (h.strokeStyle = ii = p), E != Vo && (h.fillStyle = Vo = E), g != Ui && (h.lineWidth = Ui = g), B != Ji && (h.lineJoin = Ji = B), C != Qi && (h.lineCap = Qi = C), x != Xi && h.setLineDash(Xi = x);
  }
  function Nl(p, g, x, C) {
    g != Vo && (h.fillStyle = Vo = g), p != Zi && (h.font = Zi = p), x != er && (h.textAlign = er = x), C != tr && (h.textBaseline = tr = C);
  }
  function nr(p, g, x, C, E = 0) {
    if (C.length > 0 && p.auto(n, Ts) && (g == null || g.min == null)) {
      let B = qe(Pt, 0), V = qe(At, C.length - 1), Q = x.min == null ? I4(C, B, V, E, p.distr == 3) : [x.min, x.max];
      p.min = aa(p.min, x.min = Q[0]), p.max = an(p.max, x.max = Q[1]);
    }
  }
  const Dl = { min: null, max: null };
  function xh() {
    for (let C in _) {
      let E = _[C];
      H[C] == null && // scales that have never been set (on init)
      (E.min == null || // or auto scales when the x scale was explicitly set
      H[M] != null && E.auto(n, Ts)) && (H[C] = Dl);
    }
    for (let C in _) {
      let E = _[C];
      H[C] == null && E.from != null && H[E.from] != null && (H[C] = Dl);
    }
    H[M] != null && Go(!0);
    let p = {};
    for (let C in H) {
      let E = H[C];
      if (E != null) {
        let B = p[C] = gs(_[C], V4);
        if (E.min != null)
          Mt(B, E);
        else if (C != M || s == 2)
          if (Rt == 0 && B.from == null) {
            let V = B.range(n, null, null, C);
            B.min = V[0], B.max = V[1];
          } else
            B.min = Ze, B.max = -Ze;
      }
    }
    if (Rt > 0) {
      y.forEach((C, E) => {
        if (s == 1) {
          let B = C.scale, V = H[B];
          if (V == null)
            return;
          let Q = p[B];
          if (E == 0) {
            let Z = Q.range(n, Q.min, Q.max, B);
            Q.min = Z[0], Q.max = Z[1], Pt = na(Q.min, t[0]), At = na(Q.max, t[0]), At - Pt > 1 && (t[0][Pt] < Q.min && Pt++, t[0][At] > Q.max && At--), C.min = Kn[Pt], C.max = Kn[At];
          } else C.show && C.auto && nr(Q, V, C, t[E], C.sorted);
          C.idxs[0] = Pt, C.idxs[1] = At;
        } else if (E > 0 && C.show && C.auto) {
          let [B, V] = C.facets, Q = B.scale, Z = V.scale, [oe, ie] = t[E], he = p[Q], ke = p[Z];
          he != null && nr(he, H[Q], B, oe, B.sorted), ke != null && nr(ke, H[Z], V, ie, V.sorted), C.min = V.min, C.max = V.max;
        }
      });
      for (let C in p) {
        let E = p[C], B = H[C];
        if (E.from == null && (B == null || B.min == null)) {
          let V = E.range(
            n,
            E.min == Ze ? null : E.min,
            E.max == -Ze ? null : E.max,
            C
          );
          E.min = V[0], E.max = V[1];
        }
      }
    }
    for (let C in p) {
      let E = p[C];
      if (E.from != null) {
        let B = p[E.from];
        if (B.min == null)
          E.min = E.max = null;
        else {
          let V = E.range(n, B.min, B.max, C);
          E.min = V[0], E.max = V[1];
        }
      }
    }
    let g = {}, x = !1;
    for (let C in p) {
      let E = p[C], B = _[C];
      if (B.min != E.min || B.max != E.max) {
        B.min = E.min, B.max = E.max;
        let V = B.distr;
        B._min = V == 3 ? Ha(B.min) : V == 4 ? Tr(B.min, B.asinh) : V == 100 ? B.fwd(B.min) : B.min, B._max = V == 3 ? Ha(B.max) : V == 4 ? Tr(B.max, B.asinh) : V == 100 ? B.fwd(B.max) : B.max, g[C] = x = !0;
      }
    }
    if (x) {
      y.forEach((C, E) => {
        s == 2 ? E > 0 && g.y && (C._paths = null) : g[C.scale] && (C._paths = null);
      });
      for (let C in g)
        Ca = !0, Wt("setScale", C);
      le && R.left >= 0 && (Na = ye = !0);
    }
    for (let C in H)
      H[C] = null;
  }
  function Sh(p) {
    let g = Fr(Pt - 1, 0, Rt - 1), x = Fr(At + 1, 0, Rt - 1);
    for (; p[g] == null && g > 0; )
      g--;
    for (; p[x] == null && x < Rt - 1; )
      x++;
    return [g, x];
  }
  function Mh() {
    if (Rt > 0) {
      let p = y.some((g) => g._focus) && ln != rn.alpha;
      p && (h.globalAlpha = ln = rn.alpha), y.forEach((g, x) => {
        if (x > 0 && g.show && (zl(x, !1), zl(x, !0), g._paths == null)) {
          let C = ln;
          ln != g.alpha && (h.globalAlpha = ln = g.alpha);
          let E = s == 2 ? [0, t[x][0].length - 1] : Sh(t[x]);
          g._paths = g.paths(n, x, E[0], E[1]), ln != C && (h.globalAlpha = ln = C);
        }
      }), y.forEach((g, x) => {
        if (x > 0 && g.show) {
          let C = ln;
          ln != g.alpha && (h.globalAlpha = ln = g.alpha), g._paths != null && Pl(x, !1);
          {
            let E = g._paths != null ? g._paths.gaps : null, B = g.points.show(n, x, Pt, At, E), V = g.points.filter(n, x, B, E);
            (B || V) && (g.points._paths = g.points.paths(n, x, Pt, At, V), Pl(x, !0));
          }
          ln != C && (h.globalAlpha = ln = C), Wt("drawSeries", x);
        }
      }), p && (h.globalAlpha = ln = 1);
    }
  }
  function zl(p, g) {
    let x = g ? y[p].points : y[p];
    x._stroke = x.stroke(n, p), x._fill = x.fill(n, p);
  }
  function Pl(p, g) {
    let x = g ? y[p].points : y[p], {
      stroke: C,
      fill: E,
      clip: B,
      flags: V,
      _stroke: Q = x._stroke,
      _fill: Z = x._fill,
      _width: oe = x.width
    } = x._paths;
    oe = et(oe * Be, 3);
    let ie = null, he = oe % 2 / 2;
    g && Z == null && (Z = oe > 0 ? "#fff" : Q);
    let ke = x.pxAlign == 1 && he > 0;
    if (ke && h.translate(he, he), !g) {
      let Fe = Xt - oe / 2, Le = sn - oe / 2, Pe = Yt + oe, ge = vn + oe;
      ie = new Path2D(), ie.rect(Fe, Le, Pe, ge);
    }
    g ? ar(Q, oe, x.dash, x.cap, Z, C, E, V, B) : $h(p, Q, oe, x.dash, x.cap, Z, C, E, V, ie, B), ke && h.translate(-he, -he);
  }
  function $h(p, g, x, C, E, B, V, Q, Z, oe, ie) {
    let he = !1;
    Z != 0 && k.forEach((ke, Fe) => {
      if (ke.series[0] == p) {
        let Le = y[ke.series[1]], Pe = t[ke.series[1]], ge = (Le._paths || Us).band;
        so(ge) && (ge = ke.dir == 1 ? ge[0] : ge[1]);
        let fe, dt = null;
        Le.show && ge && L4(Pe, Pt, At) ? (dt = ke.fill(n, Fe) || B, fe = Le._paths.clip) : ge = null, ar(g, x, C, E, dt, V, Q, Z, oe, ie, fe, ge), he = !0;
      }
    }), he || ar(g, x, C, E, B, V, Q, Z, oe, ie);
  }
  const Al = bs | jr;
  function ar(p, g, x, C, E, B, V, Q, Z, oe, ie, he) {
    Cl(p, g, x, C, E), (Z || oe || he) && (h.save(), Z && h.clip(Z), oe && h.clip(oe)), he ? (Q & Al) == Al ? (h.clip(he), ie && h.clip(ie), li(E, V), ri(p, B, g)) : Q & jr ? (li(E, V), h.clip(he), ri(p, B, g)) : Q & bs && (h.save(), h.clip(he), ie && h.clip(ie), li(E, V), h.restore(), ri(p, B, g)) : (li(E, V), ri(p, B, g)), (Z || oe || he) && h.restore();
  }
  function ri(p, g, x) {
    x > 0 && (g instanceof Map ? g.forEach((C, E) => {
      h.strokeStyle = ii = E, h.stroke(C);
    }) : g != null && p && h.stroke(g));
  }
  function li(p, g) {
    g instanceof Map ? g.forEach((x, C) => {
      h.fillStyle = Vo = C, h.fill(x);
    }) : g != null && p && h.fill(g);
  }
  function Th(p, g, x, C) {
    let E = v[p], B;
    if (C <= 0)
      B = [0, 0];
    else {
      let V = E._space = E.space(n, p, g, x, C), Q = E._incrs = E.incrs(n, p, g, x, C, V);
      B = iE(g, x, Q, C, V);
    }
    return E._found = B;
  }
  function or(p, g, x, C, E, B, V, Q, Z, oe) {
    let ie = V % 2 / 2;
    S == 1 && h.translate(ie, ie), Cl(Q, V, Z, oe, Q), h.beginPath();
    let he, ke, Fe, Le, Pe = E + (C == 0 || C == 3 ? -B : B);
    x == 0 ? (ke = E, Le = Pe) : (he = E, Fe = Pe);
    for (let ge = 0; ge < p.length; ge++)
      g[ge] != null && (x == 0 ? he = Fe = p[ge] : ke = Le = p[ge], h.moveTo(he, ke), h.lineTo(Fe, Le));
    h.stroke(), S == 1 && h.translate(-ie, -ie);
  }
  function Ch(p) {
    let g = !0;
    return v.forEach((x, C) => {
      if (!x.show)
        return;
      let E = _[x.scale];
      if (E.min == null) {
        x._show && (g = !1, x._show = !1, Go(!1));
        return;
      } else
        x._show || (g = !1, x._show = !0, Go(!1));
      let B = x.side, V = B % 2, { min: Q, max: Z } = E, [oe, ie] = Th(C, Q, Z, V == 0 ? we : ae);
      if (ie == 0)
        return;
      let he = E.distr == 2, ke = x._splits = x.splits(n, C, Q, Z, oe, ie, he), Fe = E.distr == 2 ? ke.map((fe) => Kn[fe]) : ke, Le = E.distr == 2 ? Kn[ke[1]] - Kn[ke[0]] : oe, Pe = x._values = x.values(n, x.filter(n, Fe, C, ie, Le), C, ie, Le);
      x._rotate = B == 2 ? x.rotate(n, Pe, C, ie) : 0;
      let ge = x._size;
      x._size = Hn(x.size(n, Pe, C, p)), ge != null && x._size != ge && (g = !1);
    }), g;
  }
  function Nh(p) {
    let g = !0;
    return $l.forEach((x, C) => {
      let E = x(n, C, po, p);
      E != Ka[C] && (g = !1), Ka[C] = E;
    }), g;
  }
  function Dh() {
    for (let p = 0; p < v.length; p++) {
      let g = v[p];
      if (!g.show || !g._show)
        continue;
      let x = g.side, C = x % 2, E, B, V = g.stroke(n, p), Q = x == 0 || x == 3 ? -1 : 1, [Z, oe] = g._found;
      if (g.label != null) {
        let Qt = g.labelGap * Q, _n = Nt((g._lpos + Qt) * Be);
        Nl(g.labelFont[0], V, "center", x == 2 ? qs : Uc), h.save(), C == 1 ? (E = B = 0, h.translate(
          _n,
          Nt(sn + vn / 2)
        ), h.rotate((x == 3 ? -$i : $i) / 2)) : (E = Nt(Xt + Yt / 2), B = _n);
        let bo = Eu(g.label) ? g.label(n, p, Z, oe) : g.label;
        h.fillText(bo, E, B), h.restore();
      }
      if (oe == 0)
        continue;
      let ie = _[g.scale], he = C == 0 ? Yt : vn, ke = C == 0 ? Xt : sn, Fe = g._splits, Le = ie.distr == 2 ? Fe.map((Qt) => Kn[Qt]) : Fe, Pe = ie.distr == 2 ? Kn[Fe[1]] - Kn[Fe[0]] : Z, ge = g.ticks, fe = g.border, dt = ge.show ? ge.size : 0, yt = Nt(dt * Be), It = Nt((g.alignTo == 2 ? g._size - dt - g.gap : g.gap) * Be), Xe = g._rotate * -$i / 180, vt = $(g._pos * Be), wn = (yt + It) * Q, Jt = vt + wn;
      B = C == 0 ? Jt : 0, E = C == 1 ? Jt : 0;
      let En = g.font[0], Un = g.align == 1 ? cs : g.align == 2 ? Sr : Xe > 0 ? cs : Xe < 0 ? Sr : C == 0 ? "center" : x == 3 ? Sr : cs, da = Xe || C == 1 ? "middle" : x == 2 ? qs : Uc;
      Nl(En, V, Un, da);
      let kn = g.font[1] * g.lineGap, Wn = Fe.map((Qt) => $(l(Qt, ie, he, ke))), Xn = g._values;
      for (let Qt = 0; Qt < Xn.length; Qt++) {
        let _n = Xn[Qt];
        if (_n != null) {
          C == 0 ? E = Wn[Qt] : B = Wn[Qt], _n = "" + _n;
          let bo = _n.indexOf(`
`) == -1 ? [_n] : _n.split(/\n/gm);
          for (let Zt = 0; Zt < bo.length; Zt++) {
            let Ql = bo[Zt];
            Xe ? (h.save(), h.translate(E, B + Zt * kn), h.rotate(Xe), h.fillText(Ql, 0, 0), h.restore()) : h.fillText(Ql, E, B + Zt * kn);
          }
        }
      }
      ge.show && or(
        Wn,
        ge.filter(n, Le, p, oe, Pe),
        C,
        x,
        vt,
        yt,
        et(ge.width * Be, 3),
        ge.stroke(n, p),
        ge.dash,
        ge.cap
      );
      let ua = g.grid;
      ua.show && or(
        Wn,
        ua.filter(n, Le, p, oe, Pe),
        C,
        C == 0 ? 2 : 1,
        C == 0 ? sn : Xt,
        C == 0 ? vn : Yt,
        et(ua.width * Be, 3),
        ua.stroke(n, p),
        ua.dash,
        ua.cap
      ), fe.show && or(
        [vt],
        [1],
        C == 0 ? 1 : 0,
        C == 0 ? 1 : 2,
        C == 1 ? sn : Xt,
        C == 1 ? vn : Yt,
        et(fe.width * Be, 3),
        fe.stroke(n, p),
        fe.dash,
        fe.cap
      );
    }
    Wt("drawAxes");
  }
  function Go(p) {
    y.forEach((g, x) => {
      x > 0 && (g._paths = null, p && (s == 1 ? (g.min = null, g.max = null) : g.facets.forEach((C) => {
        C.min = null, C.max = null;
      })));
    });
  }
  let ci = !1, sr = !1, Cs = [];
  function zh() {
    sr = !1;
    for (let p = 0; p < Cs.length; p++)
      Wt(...Cs[p]);
    Cs.length = 0;
  }
  function Ko() {
    ci || (Z4(Ol), ci = !0);
  }
  function Ph(p, g = !1) {
    ci = !0, sr = g, p(n), Ol(), g && Cs.length > 0 && queueMicrotask(zh);
  }
  n.batch = Ph;
  function Ol() {
    if (Ms && (xh(), Ms = !1), Ca && (An(), Ca = !1), mo) {
      if (ut(b, cs, Ue), ut(b, qs, kt), ut(b, Ys, we), ut(b, Vs, ae), ut(w, cs, Ue), ut(w, qs, kt), ut(w, Ys, we), ut(w, Vs, ae), ut(f, Ys, jt), ut(f, Vs, ra), m.width = Nt(jt * Be), m.height = Nt(ra * Be), v.forEach(({ _el: p, _show: g, _size: x, _pos: C, side: E }) => {
        if (p != null)
          if (g) {
            let B = E === 3 || E === 0 ? x : 0, V = E % 2 == 1;
            ut(p, V ? "left" : "top", C - B), ut(p, V ? "width" : "height", x), ut(p, V ? "top" : "left", V ? kt : Ue), ut(p, V ? "height" : "width", V ? ae : we), Lr(p, Eo);
          } else
            $n(p, Eo);
      }), ii = Vo = Ui = Ji = Qi = Zi = er = tr = Xi = null, ln = 1, zs(!0), Ue != Ga || kt != $a || we != Pn || ae != Ta) {
        Go(!1);
        let p = we / Pn, g = ae / Ta;
        if (le && !Na && R.left >= 0) {
          R.left *= p, R.top *= g, Uo && ga(Uo, Nt(R.left), 0, we, ae), Xo && ga(Xo, 0, Nt(R.top), we, ae);
          for (let x = 0; x < On.length; x++) {
            let C = On[x];
            C != null && (jo[x] *= p, Yo[x] *= g, ga(C, Hn(jo[x]), Hn(Yo[x]), we, ae));
          }
        }
        if (ct.show && !be && ct.left >= 0 && ct.width > 0) {
          ct.left *= p, ct.width *= p, ct.top *= g, ct.height *= g;
          for (let x in ur)
            ut(Zo, x, ct[x]);
        }
        Ga = Ue, $a = kt, Pn = we, Ta = ae;
      }
      Wt("setSize"), mo = !1;
    }
    jt > 0 && ra > 0 && (h.clearRect(0, 0, m.width, m.height), Wt("drawClear"), A.forEach((p) => p()), Wt("draw")), ct.show && be && (di(ct), be = !1), le && Na && (go(null, !0, !1), Na = !1), z.show && z.live && ye && (cr(), ye = !1), d || (d = !0, n.status = 1, Wt("ready")), Ts = !1, ci = !1;
  }
  n.redraw = (p, g) => {
    Ca = g || !1, p !== !1 ? Xa(M, O.min, O.max) : Ko();
  };
  function ir(p, g) {
    let x = _[p];
    if (x.from == null) {
      if (Rt == 0) {
        let C = x.range(n, g.min, g.max, p);
        g.min = C[0], g.max = C[1];
      }
      if (g.min > g.max) {
        let C = g.min;
        g.min = g.max, g.max = C;
      }
      if (Rt > 1 && g.min != null && g.max != null && g.max - g.min < 1e-16)
        return;
      p == M && x.distr == 2 && Rt > 0 && (g.min = na(g.min, t[0]), g.max = na(g.max, t[0]), g.min == g.max && g.max++), H[p] = g, Ms = !0, Ko();
    }
  }
  n.setScale = ir;
  let rr, lr, Uo, Xo, El, Wl, Jo, Qo, Il, Rl, lt, mt, Ua = !1;
  const Lt = R.drag;
  let Ot = Lt.x, Et = Lt.y;
  le && (R.x && (rr = qn(x4, w)), R.y && (lr = qn(S4, w)), O.ori == 0 ? (Uo = rr, Xo = lr) : (Uo = lr, Xo = rr), lt = R.left, mt = R.top);
  const ct = n.select = Mt({
    show: !0,
    over: !0,
    left: 0,
    width: 0,
    top: 0,
    height: 0
  }, e.select), Zo = ct.show ? qn(_4, ct.over ? w : b) : null;
  function di(p, g) {
    if (ct.show) {
      for (let x in p)
        ct[x] = p[x], x in ur && ut(Zo, x, p[x]);
      g !== !1 && Wt("setSelect");
    }
  }
  n.setSelect = di;
  function Ah(p) {
    if (y[p].show)
      X && Lr(Ne[p], Eo);
    else if (X && $n(Ne[p], Eo), le) {
      let x = Ho ? On[0] : On[p];
      x != null && ga(x, -10, -10, we, ae);
    }
  }
  function Xa(p, g, x) {
    ir(p, { min: g, max: x });
  }
  function la(p, g, x, C) {
    g.focus != null && Rh(p), g.show != null && y.forEach((E, B) => {
      B > 0 && (p == B || p == null) && (E.show = g.show, Ah(B), s == 2 ? (Xa(E.facets[0].scale, null, null), Xa(E.facets[1].scale, null, null)) : Xa(E.scale, null, null), Ko());
    }), x !== !1 && Wt("setSeries", p, g), C && Ps("setSeries", n, p, g);
  }
  n.setSeries = la;
  function Oh(p, g) {
    Mt(k[p], g);
  }
  function Eh(p, g) {
    p.fill = Oe(p.fill || null), p.dir = qe(p.dir, -1), g = g ?? k.length, k.splice(g, 0, p);
  }
  function Wh(p) {
    p == null ? k.length = 0 : k.splice(p, 1);
  }
  n.addBand = Eh, n.setBand = Oh, n.delBand = Wh;
  function Ih(p, g) {
    y[p].alpha = g, le && On[p] != null && (On[p].style.opacity = g), X && Ne[p] && (Ne[p].style.opacity = g);
  }
  let za, Ja, fo;
  const es = { focus: !0 };
  function Rh(p) {
    if (p != fo) {
      let g = p == null, x = rn.alpha != 1;
      y.forEach((C, E) => {
        if (s == 1 || E > 0) {
          let B = g || E == 0 || E == p;
          C._focus = g ? null : B, x && Ih(E, B ? 1 : rn.alpha);
        }
      }), fo = p, x && Ko();
    }
  }
  X && Bo && ve(Zc, ue, (p) => {
    R._lock || (Da(p), fo != null && la(null, es, !0, xt.setSeries));
  });
  function ca(p, g, x) {
    let C = _[g];
    x && (p = p / Be - (C.ori == 1 ? kt : Ue));
    let E = we;
    C.ori == 1 && (E = ae, p = E - p), C.dir == -1 && (p = E - p);
    let B = C._min, V = C._max, Q = p / E, Z = B + (V - B) * Q, oe = C.distr;
    return oe == 3 ? ps(10, Z) : oe == 4 ? F4(Z, C.asinh) : oe == 100 ? C.bwd(Z) : Z;
  }
  function Lh(p, g) {
    let x = ca(p, M, g);
    return na(x, t[0], Pt, At);
  }
  n.valToIdx = (p) => na(p, t[0]), n.posToIdx = Lh, n.posToVal = ca, n.valToPos = (p, g, x) => _[g].ori == 0 ? i(
    p,
    _[g],
    x ? Yt : we,
    x ? Xt : 0
  ) : r(
    p,
    _[g],
    x ? vn : ae,
    x ? sn : 0
  ), n.setCursor = (p, g, x) => {
    lt = p.left, mt = p.top, go(null, g, x);
  };
  function Ll(p, g) {
    ut(Zo, cs, ct.left = p), ut(Zo, Ys, ct.width = g);
  }
  function ql(p, g) {
    ut(Zo, qs, ct.top = p), ut(Zo, Vs, ct.height = g);
  }
  let Ns = O.ori == 0 ? Ll : ql, Ds = O.ori == 1 ? Ll : ql;
  function qh() {
    if (X && z.live)
      for (let p = s == 2 ? 1 : 0; p < y.length; p++) {
        if (p == 0 && it)
          continue;
        let g = z.values[p], x = 0;
        for (let C in g)
          ht[p][x++].firstChild.nodeValue = g[C];
      }
  }
  function cr(p, g) {
    if (p != null && (p.idxs ? p.idxs.forEach((x, C) => {
      U[C] = x;
    }) : Y4(p.idx) || U.fill(p.idx), z.idx = U[0]), X && z.live) {
      for (let x = 0; x < y.length; x++)
        (x > 0 || s == 1 && !it) && Fh(x, U[x]);
      qh();
    }
    ye = !1, g !== !1 && Wt("setLegend");
  }
  n.setLegend = cr;
  function Fh(p, g) {
    let x = y[p], C = p == 0 && q == 2 ? Kn : t[p], E;
    it ? E = x.values(n, p, g) ?? Ct : (E = x.value(n, g == null ? null : C[g], p, g), E = E == null ? Ct : { _: E }), z.values[p] = E;
  }
  function go(p, g, x) {
    Il = lt, Rl = mt, [lt, mt] = R.move(n, lt, mt), R.left = lt, R.top = mt, le && (Uo && ga(Uo, Nt(lt), 0, we, ae), Xo && ga(Xo, 0, Nt(mt), we, ae));
    let C, E = Pt > At;
    za = Ze, Ja = null;
    let B = O.ori == 0 ? we : ae, V = O.ori == 1 ? we : ae;
    if (lt < 0 || Rt == 0 || E) {
      C = R.idx = null;
      for (let Q = 0; Q < y.length; Q++) {
        let Z = On[Q];
        Z != null && ga(Z, -10, -10, we, ae);
      }
      Bo && la(null, es, !0, p == null && xt.setSeries), z.live && (U.fill(C), ye = !0);
    } else {
      let Q, Z, oe;
      s == 1 && (Q = O.ori == 0 ? lt : mt, Z = ca(Q, M), C = R.idx = na(Z, t[0], Pt, At), oe = j(t[0][C], O, B, 0));
      let ie = -10, he = -10, ke = 0, Fe = 0, Le = !0, Pe = "", ge = "";
      for (let fe = s == 2 ? 1 : 0; fe < y.length; fe++) {
        let dt = y[fe], yt = U[fe], It = yt == null ? null : s == 1 ? t[fe][yt] : t[fe][1][yt], Xe = R.dataIdx(n, fe, C, Z), vt = Xe == null ? null : s == 1 ? t[fe][Xe] : t[fe][1][Xe];
        if (ye = ye || vt != It || Xe != yt, U[fe] = Xe, fe > 0 && dt.show) {
          let wn = Xe == null ? -10 : Xe == C ? oe : j(s == 1 ? t[0][Xe] : t[fe][0][Xe], O, B, 0), Jt = vt == null ? -10 : D(vt, s == 1 ? _[dt.scale] : _[dt.facets[1].scale], V, 0);
          if (Bo && vt != null) {
            let En = O.ori == 1 ? lt : mt, Un = Dt(rn.dist(n, fe, Xe, Jt, En));
            if (Un < za) {
              let da = rn.bias;
              if (da != 0) {
                let kn = ca(En, dt.scale), Wn = vt >= 0 ? 1 : -1, Xn = kn >= 0 ? 1 : -1;
                Xn == Wn && (Xn == 1 ? da == 1 ? vt >= kn : vt <= kn : (
                  // >= 0
                  da == 1 ? vt <= kn : vt >= kn
                )) && (za = Un, Ja = fe);
              } else
                za = Un, Ja = fe;
            }
          }
          if (ye || Ho) {
            let En, Un;
            O.ori == 0 ? (En = wn, Un = Jt) : (En = Jt, Un = wn);
            let da, kn, Wn, Xn, ua, Qt, _n = !0, bo = _t.bbox;
            if (bo != null) {
              _n = !1;
              let Zt = bo(n, fe);
              Wn = Zt.left, Xn = Zt.top, da = Zt.width, kn = Zt.height;
            } else
              Wn = En, Xn = Un, da = kn = _t.size(n, fe);
            if (Qt = _t.fill(n, fe), ua = _t.stroke(n, fe), Ho)
              fe == Ja && za <= rn.prox && (ie = Wn, he = Xn, ke = da, Fe = kn, Le = _n, Pe = Qt, ge = ua);
            else {
              let Zt = On[fe];
              Zt != null && (jo[fe] = Wn, Yo[fe] = Xn, id(Zt, da, kn, _n), od(Zt, Qt, ua), ga(Zt, Hn(Wn), Hn(Xn), we, ae));
            }
          }
        }
      }
      if (Ho) {
        let fe = rn.prox, dt = fo == null ? za <= fe : za > fe || Ja != fo;
        if (ye || dt) {
          let yt = On[0];
          yt != null && (jo[0] = ie, Yo[0] = he, id(yt, ke, Fe, Le), od(yt, Pe, ge), ga(yt, Hn(ie), Hn(he), we, ae));
        }
      }
    }
    if (ct.show && Ua)
      if (p != null) {
        let [Q, Z] = xt.scales, [oe, ie] = xt.match, [he, ke] = p.cursor.sync.scales, Fe = p.cursor.drag;
        if (Ot = Fe._x, Et = Fe._y, Ot || Et) {
          let { left: Le, top: Pe, width: ge, height: fe } = p.select, dt = p.scales[he].ori, yt = p.posToVal, It, Xe, vt, wn, Jt, En = Q != null && oe(Q, he), Un = Z != null && ie(Z, ke);
          En && Ot ? (dt == 0 ? (It = Le, Xe = ge) : (It = Pe, Xe = fe), vt = _[Q], wn = j(yt(It, he), vt, B, 0), Jt = j(yt(It + Xe, he), vt, B, 0), Ns(aa(wn, Jt), Dt(Jt - wn))) : Ns(0, B), Un && Et ? (dt == 1 ? (It = Le, Xe = ge) : (It = Pe, Xe = fe), vt = _[Z], wn = D(yt(It, ke), vt, V, 0), Jt = D(yt(It + Xe, ke), vt, V, 0), Ds(aa(wn, Jt), Dt(Jt - wn))) : Ds(0, V);
        } else
          hr();
      } else {
        let Q = Dt(Il - El), Z = Dt(Rl - Wl);
        if (O.ori == 1) {
          let ke = Q;
          Q = Z, Z = ke;
        }
        Ot = Lt.x && Q >= Lt.dist, Et = Lt.y && Z >= Lt.dist;
        let oe = Lt.uni;
        oe != null ? Ot && Et && (Ot = Q >= oe, Et = Z >= oe, !Ot && !Et && (Z > Q ? Et = !0 : Ot = !0)) : Lt.x && Lt.y && (Ot || Et) && (Ot = Et = !0);
        let ie, he;
        Ot && (O.ori == 0 ? (ie = Jo, he = lt) : (ie = Qo, he = mt), Ns(aa(ie, he), Dt(he - ie)), Et || Ds(0, V)), Et && (O.ori == 1 ? (ie = Jo, he = lt) : (ie = Qo, he = mt), Ds(aa(ie, he), Dt(he - ie)), Ot || Ns(0, B)), !Ot && !Et && (Ns(0, 0), Ds(0, 0));
      }
    if (Lt._x = Ot, Lt._y = Et, p == null) {
      if (x) {
        if (Jl != null) {
          let [Q, Z] = xt.scales;
          xt.values[0] = Q != null ? ca(O.ori == 0 ? lt : mt, Q) : null, xt.values[1] = Z != null ? ca(O.ori == 1 ? lt : mt, Z) : null;
        }
        Ps(Mr, n, lt, mt, we, ae, C);
      }
      if (Bo) {
        let Q = x && xt.setSeries, Z = rn.prox;
        fo == null ? za <= Z && la(Ja, es, !0, Q) : za > Z ? la(null, es, !0, Q) : Ja != fo && la(Ja, es, !0, Q);
      }
    }
    ye && (z.idx = C, cr()), g !== !1 && Wt("setCursor");
  }
  let Qa = null;
  Object.defineProperty(n, "rect", {
    get() {
      return Qa == null && zs(!1), Qa;
    }
  });
  function zs(p = !1) {
    p ? Qa = null : (Qa = w.getBoundingClientRect(), Wt("syncRect", Qa));
  }
  function Fl(p, g, x, C, E, B, V) {
    R._lock || Ua && p != null && p.movementX == 0 && p.movementY == 0 || (dr(p, g, x, C, E, B, V, !1, p != null), p != null ? go(null, !0, !0) : go(g, !0, !1));
  }
  function dr(p, g, x, C, E, B, V, Q, Z) {
    if (Qa == null && zs(!1), Da(p), p != null)
      x = p.clientX - Qa.left, C = p.clientY - Qa.top;
    else {
      if (x < 0 || C < 0) {
        lt = -10, mt = -10;
        return;
      }
      let [oe, ie] = xt.scales, he = g.cursor.sync, [ke, Fe] = he.values, [Le, Pe] = he.scales, [ge, fe] = xt.match, dt = g.axes[0].side % 2 == 1, yt = O.ori == 0 ? we : ae, It = O.ori == 1 ? we : ae, Xe = dt ? B : E, vt = dt ? E : B, wn = dt ? C : x, Jt = dt ? x : C;
      if (Le != null ? x = ge(oe, Le) ? l(ke, _[oe], yt, 0) : -10 : x = yt * (wn / Xe), Pe != null ? C = fe(ie, Pe) ? l(Fe, _[ie], It, 0) : -10 : C = It * (Jt / vt), O.ori == 1) {
        let En = x;
        x = C, C = En;
      }
    }
    Z && (g == null || g.cursor.event.type == Mr) && ((x <= 1 || x >= we - 1) && (x = zo(x, we)), (C <= 1 || C >= ae - 1) && (C = zo(C, ae))), Q ? (El = x, Wl = C, [Jo, Qo] = R.move(n, x, C)) : (lt = x, mt = C);
  }
  const ur = {
    width: 0,
    height: 0,
    left: 0,
    top: 0
  };
  function hr() {
    di(ur, !1);
  }
  let Bl, Hl, jl, Yl;
  function Vl(p, g, x, C, E, B, V) {
    Ua = !0, Ot = Et = Lt._x = Lt._y = !1, dr(p, g, x, C, E, B, V, !0, !1), p != null && (ve($r, Ir, Gl, !1), Ps(Jc, n, Jo, Qo, we, ae, null));
    let { left: Q, top: Z, width: oe, height: ie } = ct;
    Bl = Q, Hl = Z, jl = oe, Yl = ie;
  }
  function Gl(p, g, x, C, E, B, V) {
    Ua = Lt._x = Lt._y = !1, dr(p, g, x, C, E, B, V, !1, !0);
    let { left: Q, top: Z, width: oe, height: ie } = ct, he = oe > 0 || ie > 0, ke = Bl != Q || Hl != Z || jl != oe || Yl != ie;
    if (he && ke && di(ct), Lt.setScale && he && ke) {
      let Fe = Q, Le = oe, Pe = Z, ge = ie;
      if (O.ori == 1 && (Fe = Z, Le = ie, Pe = Q, ge = oe), Ot && Xa(
        M,
        ca(Fe, M),
        ca(Fe + Le, M)
      ), Et)
        for (let fe in _) {
          let dt = _[fe];
          fe != M && dt.from == null && dt.min != Ze && Xa(
            fe,
            ca(Pe + ge, fe),
            ca(Pe, fe)
          );
        }
      hr();
    } else R.lock && (R._lock = !R._lock, go(g, !0, p != null));
    p != null && (on($r, Ir), Ps($r, n, lt, mt, we, ae, null));
  }
  function Bh(p, g, x, C, E, B, V) {
    if (R._lock)
      return;
    Da(p);
    let Q = Ua;
    if (Ua) {
      let Z = !0, oe = !0, ie = 10, he, ke;
      O.ori == 0 ? (he = Ot, ke = Et) : (he = Et, ke = Ot), he && ke && (Z = lt <= ie || lt >= we - ie, oe = mt <= ie || mt >= ae - ie), he && Z && (lt = lt < Jo ? 0 : we), ke && oe && (mt = mt < Qo ? 0 : ae), go(null, !0, !0), Ua = !1;
    }
    lt = -10, mt = -10, U.fill(null), go(null, !0, !0), Q && (Ua = Q);
  }
  function Kl(p, g, x, C, E, B, V) {
    R._lock || (Da(p), Ki(), hr(), p != null && Ps(ed, n, lt, mt, we, ae, null));
  }
  function Ul() {
    v.forEach(rE), Me(n.width, n.height, !0);
  }
  Io(Ci, ms, Ul);
  const ts = {};
  ts.mousedown = Vl, ts.mousemove = Fl, ts.mouseup = Gl, ts.dblclick = Kl, ts.setSeries = (p, g, x, C) => {
    let E = xt.match[2];
    x = E(n, g, x), x != -1 && la(x, C, !0, !1);
  }, le && (ve(Jc, w, Vl), ve(Mr, w, Fl), ve(Qc, w, (p) => {
    Da(p), zs(!1);
  }), ve(Zc, w, Bh), ve(ed, w, Kl), Yr.add(n), n.syncRect = zs);
  const ui = n.hooks = e.hooks || {};
  function Wt(p, g, x) {
    sr ? Cs.push([p, g, x]) : p in ui && ui[p].forEach((C) => {
      C.call(null, n, g, x);
    });
  }
  (e.plugins || []).forEach((p) => {
    for (let g in p.hooks)
      ui[g] = (ui[g] || []).concat(p.hooks[g]);
  });
  const Xl = (p, g, x) => x, xt = Mt({
    key: null,
    setSeries: !1,
    filters: {
      pub: ud,
      sub: ud
    },
    scales: [M, y[1] ? y[1].scale : null],
    match: [hd, hd, Xl],
    values: [null, null]
  }, R.sync);
  xt.match.length == 2 && xt.match.push(Xl), R.sync = xt;
  const Jl = xt.key, mr = sh(Jl);
  function Ps(p, g, x, C, E, B, V) {
    xt.filters.pub(p, g, x, C, E, B, V) && mr.pub(p, g, x, C, E, B, V);
  }
  mr.sub(n);
  function Hh(p, g, x, C, E, B, V) {
    xt.filters.sub(p, g, x, C, E, B, V) && ts[p](null, g, x, C, E, B, V);
  }
  n.pub = Hh;
  function jh() {
    mr.unsub(n), Yr.delete(n), Se.clear(), qr(Ci, ms, Ul), u.remove(), ue?.remove(), Wt("destroy");
  }
  n.destroy = jh;
  function pr() {
    Wt("init", e, t), Tl(t || e.data, !1), H[M] ? ir(M, H[M]) : Ki(), be = ct.show && (ct.width > 0 || ct.height > 0), Na = ye = !0, Me(e.width, e.height);
  }
  return y.forEach(Ml), v.forEach(_h), a ? a instanceof HTMLElement ? (a.appendChild(u), pr()) : a(n, pr) : pr(), n;
}
Ut.assign = Mt;
Ut.fmtNum = fl;
Ut.rangeNum = Ni;
Ut.rangeLog = Li;
Ut.rangeAsinh = ml;
Ut.orient = Fo;
Ut.pxRatio = Be;
Ut.join = Q4;
Ut.fmtDate = bl, Ut.tzDate = cO;
Ut.sync = sh;
{
  Ut.addGap = YO, Ut.clipGaps = Bi;
  let e = Ut.paths = {
    points: uh
  };
  e.linear = mh, e.stepped = KO, e.bars = UO, e.spline = JO;
}
const lE = "_root_ig74f_1", cE = "_header_ig74f_8", dE = "_readout_ig74f_16", uE = "_readoutTime_ig74f_32", hE = "_readoutEntry_ig74f_37", mE = "_legend_ig74f_49", pE = "_legendEntry_ig74f_56", fE = "_swatch_ig74f_83", gE = "_plot_ig74f_123", bE = "_host_ig74f_128", yE = "_glass_ig74f_134", vE = "_empty_ig74f_149", pn = {
  root: lE,
  header: cE,
  readout: dE,
  readoutTime: uE,
  readoutEntry: hE,
  legend: mE,
  legendEntry: pE,
  swatch: fE,
  plot: gE,
  host: bE,
  glass: yE,
  empty: vE
}, Gr = {
  accent: ["--glacier-accent-solid", "--glacier-accent-soft"],
  blue: ["--glacier-blue-9", "--glacier-blue-4"],
  amber: ["--glacier-amber-9", "--glacier-amber-4"],
  purple: ["--glacier-purple-9", "--glacier-purple-4"],
  teal: ["--glacier-teal-9", "--glacier-teal-4"],
  red: ["--glacier-red-9", "--glacier-red-4"],
  green: ["--glacier-green-9", "--glacier-green-4"],
  gray: ["--glacier-gray-9", "--glacier-gray-4"]
};
let Mi;
function wE() {
  if (Mi === void 0)
    try {
      Mi = document.createElement("canvas").getContext("2d") != null;
    } catch {
      Mi = !1;
    }
  return Mi;
}
const kE = (e) => Math.abs(e) >= 1e3 ? Intl.NumberFormat(void 0, { notation: "compact" }).format(e) : String(Math.round(e * 10) / 10), _E = (e) => new Date(e).toLocaleTimeString(void 0, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: !1 });
function xE(e, t, a) {
  const n = t - e;
  if (!(n > 0)) return [e];
  const s = n / a, i = Math.pow(10, Math.floor(Math.log10(s))), r = s / i, l = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * i, d = [], u = Math.ceil(e / l) * l;
  for (let m = u; m <= t + l * 1e-6; m += l) d.push(Math.round(m * 1e6) / 1e6);
  return d.length >= 2 ? d : [e, t];
}
function SE(e, t) {
  if (e <= 1) return e === 1 ? [0] : [];
  const a = Math.max(2, Math.min(t, e)), n = [];
  for (let s = 0; s < a; s += 1)
    n.push(Math.round(s / (a - 1) * (e - 1)));
  return Array.from(new Set(n));
}
function ME(e) {
  const t = getComputedStyle(e), a = (n, s) => t.getPropertyValue(n).trim() || s;
  return {
    grid: a("--glacier-border", "#e5e5e5"),
    axis: a("--glacier-text-muted", "#8a8a8a"),
    font: `11px ${t.fontFamily || "sans-serif"}`,
    tone: (n) => [
      a(Gr[n][0], "#4a6da7"),
      a(Gr[n][1], "rgba(74,109,167,0.2)")
    ]
  };
}
function rI({
  times: e,
  series: t,
  shape: a = "line",
  min: n,
  max: s,
  formatValue: i = kE,
  formatTime: r = _E,
  showLegend: l = !0,
  height: d = "12rem",
  emptyLabel: u = "No samples yet",
  glass: m = !1,
  skeleton: h = !1,
  className: f,
  "aria-label": b,
  ...w
}) {
  const S = ee(null), $ = ee(null), N = ee(null), [y, v] = pe(null), [_, k] = pe(() => /* @__PURE__ */ new Set()), [M, T] = pe(0), [A, F] = pe(nc), L = ee({ xSplits: [], ySplits: [], yMin: 0, yMax: 1 });
  xe(() => {
    const z = S.current;
    if (!z) return;
    const R = getComputedStyle(z), X = (me) => R.getPropertyValue(Gr[me][0]).trim(), le = X("accent");
    le && F(nc.filter((me) => me === "accent" || X(me) !== le));
  }, [M]);
  const O = Bt(
    () => t.map((z, R) => z.tone ?? A[R % A.length]),
    [t, A]
  ), q = Bt(
    () => [e.map((z) => z / 1e3), ...t.map((z) => z.values)],
    [e, t]
  ), j = t.flatMap((z) => z.values.filter((R) => R != null)), D = j.length ? Math.max(...j) : 1, H = n ?? 0, K = s ?? Math.max(D, 1), Y = xE(H, K, 4).filter((z) => z >= H - 1e-6 && z <= K + 1e-6), se = SE(e.length, 4).map((z) => (e[z] ?? 0) / 1e3);
  L.current = { xSplits: se, ySplits: Y, yMin: H, yMax: K }, xe(() => {
    const z = document.documentElement, R = new MutationObserver(() => T((X) => X + 1));
    return R.observe(z, { attributes: !0, attributeFilter: ["data-theme", "class", "style"] }), () => R.disconnect();
  }, []);
  const te = Bt(
    () => JSON.stringify({ ids: t.map((z) => z.id), tones: O, shape: a, min: n, max: s, themeEpoch: M }),
    [t, O, a, n, s, M]
  );
  xe(() => {
    const z = $.current;
    if (!z || e.length === 0 || !wE()) return;
    const R = ME(z);
    let X;
    try {
      X = new Ut(
        {
          width: z.clientWidth || 300,
          height: z.clientHeight || 200,
          padding: [8, 8, 0, 0],
          legend: { show: !1 },
          cursor: {
            y: !1,
            points: { size: 6 }
          },
          scales: {
            x: { time: !0 },
            y: {
              range: () => [L.current.yMin, L.current.yMax]
            }
          },
          axes: [
            {
              stroke: R.axis,
              grid: { show: !1 },
              ticks: { show: !1 },
              font: R.font,
              // sparse labels: never let timestamps run into each other
              space: 88,
              splits: () => L.current.xSplits,
              values: (me, ue) => ue.map((ze) => r(ze * 1e3))
            },
            {
              stroke: R.axis,
              grid: { stroke: R.grid, width: 1 },
              ticks: { show: !1 },
              font: R.font,
              size: 56,
              splits: () => L.current.ySplits,
              values: (me, ue) => ue.map((ze) => i(ze))
            }
          ],
          series: [
            {},
            ...t.map((me, ue) => {
              const [ze, je] = R.tone(O[ue] ?? "accent");
              return {
                label: me.label,
                stroke: ze,
                width: 2,
                fill: a === "area" ? je : void 0,
                points: { show: !1 },
                show: !_.has(me.id)
              };
            })
          ],
          hooks: {
            setCursor: [
              (me) => {
                const ue = me.cursor.idx;
                v(typeof ue == "number" ? ue : null);
              }
            ]
          }
        },
        q,
        z
      );
    } catch {
      return;
    }
    N.current = X;
    const le = new ResizeObserver(() => {
      X.setSize({ width: z.clientWidth, height: z.clientHeight });
    });
    return le.observe(z), () => {
      le.disconnect(), N.current = null, X.destroy();
    };
  }, [te, e.length === 0]), xe(() => {
    N.current?.setData(q);
  }, [q]);
  const ne = (z) => {
    k((X) => {
      const le = new Set(X);
      return le.has(z) ? le.delete(z) : le.add(z), le;
    });
    const R = t.findIndex((X) => X.id === z);
    R >= 0 && N.current?.setSeries(R + 1, { show: _.has(z) });
  };
  if (h)
    return /* @__PURE__ */ c("div", { className: I(pn.root, f), ...w, children: /* @__PURE__ */ c(J, { height: d, width: "100%", radius: "var(--glacier-radius-md)" }) });
  const U = y !== null && y < e.length ? y : null;
  return /* @__PURE__ */ P("div", { ref: S, className: I(pn.root, f), ...w, children: [
    /* @__PURE__ */ P("div", { className: pn.header, children: [
      /* @__PURE__ */ c("div", { className: pn.readout, "data-active": U !== null || void 0, "aria-hidden": "true", children: U !== null && /* @__PURE__ */ P(vs, { children: [
        /* @__PURE__ */ c("span", { className: pn.readoutTime, children: r(e[U] ?? 0) }),
        t.map(
          (z, R) => !_.has(z.id) && /* @__PURE__ */ P("span", { className: pn.readoutEntry, children: [
            /* @__PURE__ */ c("span", { className: pn.swatch, "data-tone": O[R] }),
            z.label,
            " ",
            /* @__PURE__ */ c("strong", { children: z.values[U] == null ? "–" : i(z.values[U]) })
          ] }, z.id)
        )
      ] }) }),
      l && t.length >= 2 && /* @__PURE__ */ c("div", { className: pn.legend, children: t.map((z, R) => /* @__PURE__ */ P(
        "button",
        {
          type: "button",
          className: pn.legendEntry,
          "aria-pressed": !_.has(z.id),
          "data-hidden": _.has(z.id) || void 0,
          onClick: () => ne(z.id),
          children: [
            /* @__PURE__ */ c("span", { className: pn.swatch, "data-tone": O[R] }),
            z.label
          ]
        },
        z.id
      )) })
    ] }),
    /* @__PURE__ */ c("div", { role: "img", "aria-label": b, className: I(pn.plot, m && pn.glass), style: { height: d }, children: e.length === 0 ? /* @__PURE__ */ c("div", { className: pn.empty, children: u }) : /* @__PURE__ */ c("div", { ref: $, className: pn.host }) })
  ] });
}
const $E = "_wrap_wvops_1", TE = "_table_wvops_8", CE = "_selectColumn_wvops_19", NE = "_head_wvops_23", DE = "_sticky_wvops_27", zE = "_headerCell_wvops_33", PE = "_headerInner_wvops_43", AE = "_sortable_wvops_49", OE = "_sortIcon_wvops_64", EE = "_cell_wvops_75", WE = "_selectCell_wvops_81", IE = "_selectedRow_wvops_89", RE = "_emptyCell_wvops_93", LE = "_left_wvops_99", qE = "_start_wvops_100", FE = "_center_wvops_104", BE = "_right_wvops_108", HE = "_end_wvops_109", Je = {
  wrap: $E,
  table: TE,
  selectColumn: CE,
  head: NE,
  sticky: DE,
  headerCell: zE,
  headerInner: PE,
  sortable: AE,
  sortIcon: OE,
  cell: EE,
  selectCell: WE,
  selectedRow: IE,
  emptyCell: RE,
  left: LE,
  start: qE,
  center: FE,
  right: BE,
  end: HE
}, zr = {
  selectAll: {
    en: "Select all rows",
    es: "Seleccionar todas las filas",
    fr: "Tout sélectionner",
    de: "Alle Zeilen auswählen",
    ja: "すべての行を選択",
    pt: "Selecionar todas as linhas",
    zh: "全选所有行",
    ar: "تحديد كل الصفوف"
  },
  selectRow: {
    en: "Select row",
    es: "Seleccionar fila",
    fr: "Sélectionner la ligne",
    de: "Zeile auswählen",
    ja: "行を選択",
    pt: "Selecionar linha",
    zh: "选择行",
    ar: "تحديد الصف"
  },
  noResults: {
    en: "No results",
    es: "Sin resultados",
    fr: "Aucun résultat",
    de: "Keine Ergebnisse",
    ja: "結果なし",
    pt: "Sem resultados",
    zh: "无结果",
    ar: "لا نتائج"
  }
};
function jE(e, t) {
  return typeof e == "number" && typeof t == "number" ? e - t : String(e).localeCompare(String(t));
}
function lI({
  columns: e,
  data: t,
  "aria-label": a,
  sort: n,
  defaultSort: s = null,
  onSortChange: i,
  manualSort: r = !1,
  selectable: l = !1,
  selectedIds: d,
  defaultSelectedIds: u = [],
  onSelectionChange: m,
  loading: h = !1,
  loadingRows: f = 5,
  emptyState: b,
  density: w = "comfortable",
  stickyHeader: S = !1,
  maxHeight: $,
  skeleton: N = !1,
  className: y,
  style: v,
  ..._
}) {
  const k = st(), [M, T] = He(n, s), [A, F] = He(d, u), L = ee(null), [O, q] = pe({ r: 0, c: 0 }), j = l ? 1 : 0, D = e.length + j, H = Bt(() => {
    if (r || !M) return t;
    const W = e.find((Se) => Se.key === M.columnKey);
    if (!W) return t;
    const G = W.sortValue ?? ((Se) => Se[W.key]), ce = M.direction === "asc" ? 1 : -1;
    return [...t].sort((Se, ve) => jE(G(Se), G(ve)) * ce);
  }, [t, M, r, e]), se = 1 + (!h && H.length > 0 ? H.length : 0), te = h ? Math.max(1, f) : H.length || 1, ne = Math.min(Math.max(O.r, 0), se - 1), U = Math.min(Math.max(O.c, 0), D - 1), z = Bt(() => new Set(A), [A]), R = Bt(() => H.map((W) => W.id), [H]), X = R.length > 0 && R.every((W) => z.has(W)), le = !X && R.some((W) => z.has(W)), me = e.every((W) => W.width != null) ? `calc(${[
    ...l ? ["var(--glacier-space-4) + var(--glacier-space-4) + 1.375rem"] : [],
    ...e.map((W) => W.width)
  ].join(" + ")})` : void 0;
  function ue(W) {
    F(W), m?.(W);
  }
  function ze() {
    if (X) {
      const W = new Set(R);
      ue(A.filter((G) => !W.has(G)));
    } else {
      const W = A.slice();
      for (const G of R) z.has(G) || W.push(G);
      ue(W);
    }
  }
  function je(W) {
    ue(z.has(W) ? A.filter((G) => G !== W) : [...A, W]);
  }
  function Ne(W) {
    if (!e.find((Se) => Se.key === W)?.sortable) return;
    let ce;
    !M || M.columnKey !== W ? ce = { columnKey: W, direction: "asc" } : M.direction === "asc" ? ce = { columnKey: W, direction: "desc" } : ce = null, T(ce), i?.(ce);
  }
  function ht(W, G) {
    L.current?.querySelector(`[data-r="${W}"][data-c="${G}"]`)?.focus();
  }
  function Tt(W) {
    const G = ne, ce = U;
    let Se = G, ve = ce;
    switch (W.key) {
      case "ArrowRight":
        ve = Math.min(ce + 1, D - 1);
        break;
      case "ArrowLeft":
        ve = Math.max(ce - 1, 0);
        break;
      case "ArrowDown":
        Se = Math.min(G + 1, se - 1);
        break;
      case "ArrowUp":
        Se = Math.max(G - 1, 0);
        break;
      case "Home":
        W.ctrlKey && (Se = 0), ve = 0;
        break;
      case "End":
        W.ctrlKey && (Se = se - 1), ve = D - 1;
        break;
      default:
        return;
    }
    W.preventDefault(), (Se !== G || ve !== ce) && (q({ r: Se, c: ve }), ht(Se, ve));
  }
  const it = (W, G) => ne === W && U === G ? 0 : -1, Ct = (W, G) => () => {
    (O.r !== W || O.c !== G) && q({ r: W, c: G });
  }, Ht = { ...v, maxHeight: $ };
  if (N) {
    const W = Math.max(1, f);
    return /* @__PURE__ */ c("div", { className: I(Je.wrap, y), "data-density": w, style: Ht, "aria-hidden": !0, ..._, children: /* @__PURE__ */ P("table", { className: Je.table, style: me ? { width: me } : void 0, children: [
      /* @__PURE__ */ P("colgroup", { children: [
        l ? /* @__PURE__ */ c("col", { className: Je.selectColumn }) : null,
        e.map((G) => /* @__PURE__ */ c("col", { style: G.width ? { width: G.width } : void 0 }, G.key))
      ] }),
      /* @__PURE__ */ c("thead", { className: I(Je.head, S && Je.sticky), children: /* @__PURE__ */ P("tr", { children: [
        l ? /* @__PURE__ */ c("th", { className: Je.selectCell, children: /* @__PURE__ */ c(J, { variant: "rect", width: "1.1rem", height: "1.1rem" }) }) : null,
        e.map((G) => /* @__PURE__ */ c("th", { className: Je.headerCell, children: /* @__PURE__ */ c(J, { variant: "text", width: "60%" }) }, G.key))
      ] }) }),
      /* @__PURE__ */ c("tbody", { children: Array.from({ length: W }, (G, ce) => /* @__PURE__ */ P("tr", { children: [
        l ? /* @__PURE__ */ c("td", { className: Je.selectCell, children: /* @__PURE__ */ c(J, { variant: "rect", width: "1.1rem", height: "1.1rem" }) }) : null,
        e.map((Se) => /* @__PURE__ */ c("td", { className: Je.cell, children: /* @__PURE__ */ c(J, { variant: "text", width: "70%" }) }, Se.key))
      ] }, ce)) })
    ] }) });
  }
  return /* @__PURE__ */ c("div", { className: I(Je.wrap, y), "data-density": w, style: Ht, ..._, children: /* @__PURE__ */ P(
    "table",
    {
      ref: L,
      role: "grid",
      "aria-label": a,
      "aria-rowcount": 1 + te,
      "aria-colcount": D,
      "aria-multiselectable": l || void 0,
      "aria-busy": h || void 0,
      className: Je.table,
      style: me ? { width: me } : void 0,
      onKeyDown: Tt,
      children: [
        /* @__PURE__ */ P("colgroup", { children: [
          l ? /* @__PURE__ */ c("col", { className: Je.selectColumn }) : null,
          e.map((W) => /* @__PURE__ */ c("col", { style: W.width ? { width: W.width } : void 0 }, W.key))
        ] }),
        /* @__PURE__ */ c("thead", { className: I(Je.head, S && Je.sticky), children: /* @__PURE__ */ P("tr", { role: "row", "aria-rowindex": 1, children: [
          l ? /* @__PURE__ */ c(
            "th",
            {
              role: "columnheader",
              "aria-colindex": 1,
              "data-r": 0,
              "data-c": 0,
              tabIndex: it(0, 0),
              onFocus: Ct(0, 0),
              className: I(Je.headerCell, Je.selectCell),
              onKeyDown: (W) => {
                (W.key === " " || W.key === "Enter") && (W.preventDefault(), ze());
              },
              children: /* @__PURE__ */ c(
                rc,
                {
                  tabIndex: -1,
                  checked: X,
                  indeterminate: le,
                  onCheckedChange: ze,
                  "aria-label": k(zr.selectAll)
                }
              )
            }
          ) : null,
          e.map((W, G) => {
            const ce = G + j, Se = M?.columnKey === W.key, ve = W.sortable ? Se ? M?.direction === "asc" ? "ascending" : "descending" : "none" : void 0;
            return /* @__PURE__ */ c(
              "th",
              {
                role: "columnheader",
                "aria-colindex": ce + 1,
                "aria-sort": ve,
                "data-r": 0,
                "data-c": ce,
                tabIndex: it(0, ce),
                onFocus: Ct(0, ce),
                style: W.width ? { width: W.width } : void 0,
                className: I(Je.headerCell, W.align && Je[W.align], W.sortable && Je.sortable),
                onClick: W.sortable ? () => Ne(W.key) : void 0,
                onKeyDown: W.sortable ? (on) => {
                  (on.key === " " || on.key === "Enter") && (on.preventDefault(), Ne(W.key));
                } : void 0,
                children: /* @__PURE__ */ P("span", { className: Je.headerInner, children: [
                  W.header,
                  W.sortable ? /* @__PURE__ */ c(YE, { direction: Se ? M?.direction : void 0 }) : null
                ] })
              },
              W.key
            );
          })
        ] }) }),
        /* @__PURE__ */ c("tbody", { children: h ? Array.from({ length: Math.max(1, f) }, (W, G) => /* @__PURE__ */ P("tr", { role: "row", children: [
          l ? /* @__PURE__ */ c("td", { className: Je.selectCell, children: /* @__PURE__ */ c(J, { variant: "rect", width: "1.1rem", height: "1.1rem" }) }) : null,
          e.map((ce) => /* @__PURE__ */ c("td", { className: Je.cell, children: /* @__PURE__ */ c(J, { variant: "text", width: "70%" }) }, ce.key))
        ] }, G)) : H.length === 0 ? /* @__PURE__ */ c("tr", { role: "row", children: /* @__PURE__ */ c("td", { role: "gridcell", colSpan: D, className: Je.emptyCell, children: b ?? k(zr.noResults) }) }) : H.map((W, G) => {
          const ce = G + 1, Se = z.has(W.id);
          return /* @__PURE__ */ P("tr", { role: "row", "aria-rowindex": ce + 1, "aria-selected": l ? Se : void 0, className: I(Se && Je.selectedRow), children: [
            l ? /* @__PURE__ */ c(
              "td",
              {
                role: "gridcell",
                "aria-colindex": 1,
                "data-r": ce,
                "data-c": 0,
                tabIndex: it(ce, 0),
                onFocus: Ct(ce, 0),
                className: Je.selectCell,
                onKeyDown: (ve) => {
                  ve.key === " " && (ve.preventDefault(), je(W.id));
                },
                children: /* @__PURE__ */ c(
                  rc,
                  {
                    tabIndex: -1,
                    checked: Se,
                    onCheckedChange: () => je(W.id),
                    "aria-label": k(zr.selectRow)
                  }
                )
              }
            ) : null,
            e.map((ve, on) => {
              const jt = on + j;
              return /* @__PURE__ */ c(
                "td",
                {
                  role: "gridcell",
                  "aria-colindex": jt + 1,
                  "data-r": ce,
                  "data-c": jt,
                  tabIndex: it(ce, jt),
                  onFocus: Ct(ce, jt),
                  className: I(Je.cell, ve.align && Je[ve.align]),
                  children: ve.render ? ve.render(W, G) : String(W[ve.key] ?? "")
                },
                ve.key
              );
            })
          ] }, W.id);
        }) })
      ]
    }
  ) });
}
function YE({ direction: e }) {
  return /* @__PURE__ */ c(
    "svg",
    {
      className: Je.sortIcon,
      "data-direction": e ?? "none",
      viewBox: "0 0 16 16",
      width: "14",
      height: "14",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": !0,
      children: e === "desc" ? /* @__PURE__ */ c("path", { d: "M8 3.5v9M4.5 9 8 12.5 11.5 9" }) : /* @__PURE__ */ c("path", { d: "M8 12.5v-9M4.5 7 8 3.5 11.5 7" })
    }
  );
}
const VE = "_wizard_y22n3_1", GE = "_srOnly_y22n3_9", KE = "_panel_y22n3_23", UE = "_error_y22n3_35", XE = "_footer_y22n3_41", JE = "_contentBones_y22n3_49", ba = {
  wizard: VE,
  srOnly: GE,
  panel: KE,
  error: UE,
  footer: XE,
  contentBones: JE
};
function QE(e) {
  return typeof e == "object" && e !== null && typeof e.then == "function";
}
const ZE = 12;
function eW({ children: e }) {
  const t = Yh();
  return /* @__PURE__ */ c("div", { inert: t ? void 0 : !0, "aria-hidden": t ? void 0 : !0, children: e });
}
function cI({
  steps: e,
  "aria-label": t,
  activeStep: a,
  defaultActiveStep: n = 0,
  onStepChange: s,
  onSave: i,
  onComplete: r,
  previousLabel: l,
  nextLabel: d,
  finishLabel: u,
  headingLevel: m = 2,
  skeleton: h = !1,
  className: f,
  ...b
}) {
  const w = st(), S = Re(), $ = Ee(), [N, y] = He(a, n), [v, _] = pe(null), [k, M] = pe(!1), [T, A] = pe(1), F = ee(null), L = ee(null), O = ee(null), q = ee(!1), j = ia(F) === "rtl" ? -1 : 1, D = e.length, H = Math.min(Math.max(N, 0), Math.max(D - 1, 0)), K = e[H], Y = H === D - 1, se = ee({ index: H, count: D });
  se.current = { index: H, count: D }, xe(() => {
    if (_(null), O.current !== null) {
      const X = O.current;
      O.current = null, X === H && F.current?.focus();
    }
  }, [H]), xe(() => {
    !k && q.current && (q.current = !1, document.activeElement === document.body && L.current?.querySelectorAll("button")[1]?.focus());
  }, [k]);
  function te(X, le) {
    A(le), O.current = X, y(X), s?.(X);
  }
  function ne() {
    H === 0 || k || (_(null), te(H - 1, -1));
  }
  async function U() {
    if (k || !K) return;
    const X = H;
    let le = !0, me = !1;
    if (K.validate)
      try {
        const ue = K.validate();
        QE(ue) ? (me = !0, M(!0), le = await ue) : le = ue;
      } catch {
        le = !1;
      } finally {
        M(!1);
      }
    if (se.current.index === X)
      if (le === !0)
        _(null), i?.(X), X >= se.current.count - 1 ? r?.() : te(X + 1, 1);
      else {
        const ue = typeof le == "string" ? le : null;
        _((ze) => ue === null ? null : { text: ue, nonce: (ze?.nonce ?? 0) + 1 }), me && (q.current = !0);
      }
  }
  if (h)
    return /* @__PURE__ */ P("div", { className: I(ba.wizard, f), "aria-hidden": "true", ...b, children: [
      /* @__PURE__ */ c(mc, { count: D, variant: "connected", numbered: !0, skeleton: !0 }),
      /* @__PURE__ */ c(sa, { level: m, skeleton: !0 }),
      /* @__PURE__ */ c("div", { className: ba.panel, children: /* @__PURE__ */ P("div", { className: ba.contentBones, children: [
        /* @__PURE__ */ c(J, { variant: De.Text, width: "100%" }),
        /* @__PURE__ */ c(J, { variant: De.Text, width: "92%" }),
        /* @__PURE__ */ c(J, { variant: De.Text, width: "61%" })
      ] }) }),
      /* @__PURE__ */ c("div", { className: ba.error }),
      /* @__PURE__ */ P("div", { className: ba.footer, children: [
        /* @__PURE__ */ c(wa, { skeleton: !0 }),
        /* @__PURE__ */ c(wa, { skeleton: !0 })
      ] })
    ] });
  const z = S ? 0 : ZE, R = {
    enter: (X) => ({ opacity: 0, x: X * z * j }),
    center: { opacity: 1, x: 0 },
    exit: (X) => ({ opacity: 0, x: X * -z * j })
  };
  return /* @__PURE__ */ P("div", { role: "region", "aria-label": t, className: I(ba.wizard, f), ...b, children: [
    /* @__PURE__ */ c(mc, { count: D, active: H, variant: "connected", numbered: !0 }),
    /* @__PURE__ */ P(sa, { level: m, noMargin: !0, id: $, children: [
      /* @__PURE__ */ c("span", { className: ba.srOnly, children: w(_e.stepOf, { step: H + 1, total: D }) }),
      K?.label
    ] }),
    /* @__PURE__ */ c(
      "div",
      {
        ref: F,
        role: "group",
        "aria-labelledby": $,
        "aria-busy": k || void 0,
        tabIndex: -1,
        className: ba.panel,
        children: /* @__PURE__ */ c(zi, { mode: "popLayout", initial: !1, custom: T, children: /* @__PURE__ */ c(
          $e.div,
          {
            custom: T,
            variants: R,
            initial: "enter",
            animate: "center",
            exit: "exit",
            transition: S ? { duration: 0 } : Ke(Ge.Fast, nt.Out),
            children: /* @__PURE__ */ c(eW, { children: K?.content })
          },
          K?.id ?? H
        ) })
      }
    ),
    /* @__PURE__ */ c("div", { role: "status", "aria-live": "polite", className: ba.error, children: v && /* @__PURE__ */ c("span", { children: v.text }, v.nonce) }),
    /* @__PURE__ */ P("div", { ref: L, className: ba.footer, children: [
      /* @__PURE__ */ c(
        wa,
        {
          variant: Ba.Ghost,
          disabled: H === 0 || k,
          onClick: ne,
          children: l ?? w(_e.previous)
        }
      ),
      /* @__PURE__ */ c(wa, { loading: k, onClick: U, children: Y ? u ?? w(_e.done) : d ?? w(_e.next) })
    ] })
  ] });
}
const tW = "_overlay_7hf4e_7", nW = "_shockwave_7hf4e_19", aW = "_fbShockwave_7hf4e_1", oW = "_pulse_7hf4e_45", sW = "_fbPulse_7hf4e_1", iW = "_glow_7hf4e_69", rW = "_fbGlow_7hf4e_1", lW = "_nudgeHost_7hf4e_92", cW = "_fbFade_7hf4e_1", Pr = {
  overlay: tW,
  shockwave: nW,
  fbShockwave: aW,
  pulse: oW,
  fbPulse: sW,
  glow: iW,
  fbGlow: rW,
  nudgeHost: lW,
  fbFade: cW
}, dW = {
  selection: "accent",
  light: "accent",
  medium: "accent",
  heavy: "accent",
  success: "success",
  warning: "warning",
  error: "danger"
}, bh = {
  selection: 0.68,
  light: 0.82,
  medium: 1,
  heavy: 1.3,
  success: 1.05,
  warning: 1.12,
  error: 1.28
}, yh = {
  subtle: { size: 150, opacity: 0.16, nudge: 2 },
  normal: { size: 230, opacity: 0.28, nudge: 3.5 },
  strong: { size: 340, opacity: 0.42, nudge: 6 }
}, uW = 150, hW = 55, mW = 900, Od = 6, vh = _a(() => {
}), dI = () => Gn(vh);
function uI({
  enabled: e = !1,
  variant: t = "shockwave",
  intensity: a = "subtle",
  children: n
}) {
  const i = Re() && t === "nudge" ? "glow" : t, [r, l] = pe([]), d = ee(null), u = ee(0), m = ee(-1 / 0), h = ee(-1 / 0), f = ee(null), b = ee(/* @__PURE__ */ new Set()), w = at((y) => {
    l((v) => v.filter((_) => _.id !== y));
  }, []), S = at((y) => {
    const v = d.current;
    if (!v || typeof v.animate != "function") return;
    const _ = yh[a].nudge * bh[y];
    v.animate(
      [
        { transform: "translateY(0)" },
        { transform: `translateY(-${_}px)`, offset: 0.35 },
        { transform: "translateY(0)" }
      ],
      { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
    );
  }, [a]), $ = at(
    (y = "light", v) => {
      if (i === "nudge") {
        S(y);
        return;
      }
      const _ = v?.x ?? f.current?.x ?? window.innerWidth / 2, k = v?.y ?? f.current?.y ?? window.innerHeight / 2, M = ++u.current;
      l((A) => {
        const F = [...A, { id: M, kind: y, x: _, y: k }];
        return F.length > Od ? F.slice(F.length - Od) : F;
      });
      const T = setTimeout(() => {
        w(M), b.current.delete(T);
      }, mW);
      b.current.add(T);
    },
    [i, S, w]
  );
  xe(() => {
    if (!e) return;
    const y = (_) => {
      f.current = { x: _.clientX, y: _.clientY };
    }, v = (_) => {
      y(_);
      const k = jd(_.target);
      k !== null && (m.current = performance.now(), $(k, { x: _.clientX, y: _.clientY }));
    };
    return document.addEventListener("pointerdown", v, { capture: !0, passive: !0 }), document.addEventListener("pointermove", y, { capture: !0, passive: !0 }), () => {
      document.removeEventListener("pointerdown", v, { capture: !0 }), document.removeEventListener("pointermove", y, { capture: !0 });
    };
  }, [e, $]), xe(() => {
    if (e)
      return ny((y) => {
        const v = performance.now();
        v - m.current < uW || v - h.current < hW || (h.current = v, $(y.kind, y.x != null && y.y != null ? { x: y.x, y: y.y } : void 0));
      });
  }, [e, $]), xe(() => {
    const y = b.current;
    return () => {
      for (const v of y) clearTimeout(v);
      y.clear();
    };
  }, []);
  const N = e && i !== "nudge" && r.length > 0 && typeof document < "u" ? yn(
    /* @__PURE__ */ c("div", { className: Pr.overlay, "aria-hidden": "true", children: r.map((y) => /* @__PURE__ */ c(
      "span",
      {
        className: Pr[i],
        "data-kind": y.kind,
        style: pW(y, i, a),
        onAnimationEnd: () => w(y.id)
      },
      y.id
    )) }),
    document.body
  ) : null;
  return /* @__PURE__ */ P(vh.Provider, { value: $, children: [
    /* @__PURE__ */ c("div", { ref: d, className: I(i === "nudge" && Pr.nudgeHost), children: n }),
    N
  ] });
}
function pW(e, t, a) {
  const n = bh[e.kind], s = yh[a], i = {
    "--fb-color": `var(--glacier-${dW[e.kind]}-solid)`,
    "--fb-size": `${Math.round(s.size * n)}px`,
    "--fb-opacity": `${Math.min(s.opacity * n, 0.9)}`,
    "--fb-x": `${e.x}px`,
    "--fb-y": `${e.y}px`
  };
  return t === "shockwave" && (i.left = `${e.x}px`, i.top = `${e.y}px`), i;
}
export {
  M6 as Accordion,
  U6 as AlertDialog,
  XW as Announcements,
  X6 as AppShell,
  jW as Avatar,
  UW as Banner,
  z6 as Box,
  x6 as Breadcrumbs,
  wa as Button,
  iC as Calendar,
  VW as Callout,
  $W as Card,
  R6 as CardGroup,
  y6 as Carousel,
  E6 as Center,
  rc as Checkbox,
  GW as CodeBlock,
  v6 as Combobox,
  I6 as Container,
  u6 as ContextMenu,
  Zr as CounterBadge,
  Kf as DEFAULT_LOCALE,
  lI as DataGrid,
  c6 as DatePicker,
  b6 as DensitySelector,
  e6 as DeviceFrame,
  cc as Divider,
  K6 as Drawer,
  JW as EmptyState,
  i6 as Field,
  r6 as Fieldset,
  d6 as FileUpload,
  t6 as FilterChip,
  Z6 as FloatingPanel,
  l6 as FormSection,
  O6 as Grid,
  WW as HapticsProvider,
  sa as Heading,
  cz as Heatmap,
  PW as IconBackfill,
  Yn as IconButton,
  n6 as Image,
  xW as Input,
  DW as Kbd,
  CW as Label,
  NW as Link,
  k6 as List,
  _6 as ListItem,
  _W as LocaleProvider,
  Su as Menu,
  rN as MenuItem,
  p6 as MenuLabel,
  m6 as MenuSeparator,
  h6 as MenuSub,
  LW as Meter,
  Q3 as Modal,
  w6 as MultiSelect,
  V6 as NavBar,
  G6 as NavBarItem,
  BW as NumberInput,
  o6 as OtpField,
  Y6 as PageHeader,
  S6 as Pagination,
  zW as Pill,
  J6 as Popover,
  AW as ProgressBar,
  HW as ProgressRing,
  SW as Radio,
  QW as RadioCard,
  a6 as Rating,
  aI as ResizableSplitPane,
  A6 as Row,
  PN as ScrollArea,
  Rd as ScrollbarAppearance,
  FW as SearchField,
  j6 as Section,
  KW as SegmentedBar,
  g6 as SegmentedControl,
  T6 as Select,
  L6 as Sidebar,
  F6 as SidebarItem,
  q6 as SidebarSection,
  gn as Size,
  J as Skeleton,
  De as SkeletonVariant,
  IW as Slider,
  W6 as Spacer,
  s6 as Sparkline,
  Mg as Spinner,
  f6 as SplitButton,
  $6 as Spotlight,
  P6 as Stack,
  ZW as StatTile,
  YW as StatusDot,
  mc as Steps,
  TW as Surface,
  MW as Switch,
  nI as TabStrip,
  tI as TabbedModal,
  eI as TabbedPanel,
  oI as Table,
  C6 as Tabs,
  Pi as Text,
  ti as TextTone,
  qW as Textarea,
  rI as TimeSeriesChart,
  sI as Timeline,
  iI as TimelineScrubber,
  H6 as TitleBar,
  AP as Toast,
  N6 as ToastProvider,
  RW as Toggle,
  Id as Tone,
  B6 as Toolbar,
  yP as Tooltip,
  Q6 as TreeView,
  Ba as Variant,
  uI as VisualFeedbackProvider,
  cI as Wizard,
  kW as defineMessages,
  Ea as densityModes,
  wW as direction,
  Hd as emitFeedback,
  Xf as format,
  EW as haptic,
  OW as hapticsEnabled,
  _e as kitMessages,
  vW as locales,
  bn as resolveDirection,
  Uf as rtlLocales,
  uc as setHapticsEnabled,
  ny as subscribeFeedback,
  ia as useDirection,
  Sa as useField,
  Ai as useHaptics,
  Xr as useLocale,
  st as useT,
  D6 as useToast,
  dI as useVisualFeedback
};
