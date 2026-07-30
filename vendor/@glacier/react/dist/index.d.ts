import * as react from 'react';
import { RefObject, ComponentProps, ReactNode, ReactElement, SVGProps, CSSProperties, MouseEventHandler, ElementType } from 'react';
import { motion } from 'motion/react';
import { DayPickerLocale } from 'react-day-picker';

/**
 * Shared design vocabulary.
 *
 * These are the names and conventions that repeat across components: the size
 * steps, the semantic tones, and the fixed mapping from a control size to its
 * height and font size. They live here, once, so both the specs and the React
 * kit consume the same source instead of each component redeclaring the same
 * `'sm' | 'md' | 'lg'` union and the same tone list.
 */

/** The three-step control size, used by buttons, inputs, selects, and friends. */
declare const controlSizes: readonly ["sm", "md", "lg"];
/** The semantic color families shared by pills, badges, dots, callouts, meters. */
declare const tones: readonly ["neutral", "accent", "success", "warning", "danger", "info"];

/**
 * Enum vocabulary — named constants for the loose string props, so components
 * read `size={Size.Large}` / `tone={Tone.Accent}` / `tone={TextTone.Muted}`
 * instead of `size="lg"` / `tone="accent"` / `tone="muted"`. Mirrors the
 * `@glacier/motion` enum pattern (Motion, Speed, Ease, Spring).
 *
 * Each value equals the underlying vocab string, so an enum member is accepted
 * anywhere the existing spec-derived union is (a string-enum member is
 * assignable to its literal value), while an out-of-range member is still
 * rejected by that per-component union. Adopting the enum is therefore additive
 * and never breaks an existing `size="lg"` string.
 */
/** Every size step in the kit. A component's own union restricts which apply. */
declare enum Size {
    XSmall = "xs",
    Small = "sm",
    Medium = "md",
    Large = "lg",
    XLarge = "xl"
}
/**
 * Status / semantic tones shared by badges, callouts, meters, steps, spinners,
 * progress, and friends. Note/Auto/Subtle/Inherit cover the component-specific
 * one-offs (Callout note, Meter auto, Spinner subtle/inherit).
 */
declare enum Tone {
    Neutral = "neutral",
    Accent = "accent",
    Success = "success",
    Warning = "warning",
    Danger = "danger",
    Info = "info",
    Note = "note",
    Auto = "auto",
    Subtle = "subtle",
    Inherit = "inherit"
}
/** The Text component's emphasis tones (its own scale, distinct from status). */
declare enum TextTone {
    Default = "default",
    Muted = "muted",
    Subtle = "subtle",
    Accent = "accent",
    Danger = "danger",
    Success = "success",
    Warning = "warning"
}
/** Visual style variants for Button, IconButton, Card, and Pill. */
declare enum Variant {
    Solid = "solid",
    Soft = "soft",
    Outline = "outline",
    Ghost = "ghost",
    Glass = "glass",
    Danger = "danger"
}
/** The Skeleton placeholder's shape variants (its own axis, not a visual style). */
declare enum SkeletonVariant$1 {
    Text = "text",
    Rect = "rect",
    Circle = "circle"
}
/** Visual treatments available to ScrollArea's visible web scrollbar. */
declare enum ScrollbarAppearance {
    Subtle = "subtle",
    Default = "default",
    Accent = "accent"
}

/** Tone families, exported so every framework binding derives the same union. */
declare const announcementTones: readonly ["neutral", "accent", "success", "warning", "danger", "info"];

/** Size steps, exported so the React kit derives its union from here. */
declare const avatarSizes: readonly ["sm", "md", "lg", "xl"];
/** Shapes, exported so the React kit derives its union from here. */
declare const avatarShapes: readonly ["circle", "rounded"];

/** Tone families, exported so the React kit derives its union from here. */
declare const bannerTones: readonly ["neutral", "accent", "success", "warning", "danger", "info"];

/** Visual style families, exported so the React kit derives its union from here. */
declare const buttonVariants: readonly ["solid", "soft", "outline", "ghost", "glass", "danger"];

/** Tone families, exported so the React kit derives its union from here. */
declare const calloutTones: readonly ["note", "info", "success", "warning", "danger"];

/** Visual materials, exported so the React kit derives its union from here. */
declare const cardVariants: readonly ["solid", "glass"];
/** The elevation steps, one per shadow token. Exported for a binding's union. */
declare const cardElevations: readonly [0, 1, 2, 3, 4, 5];

/** Semantic color families the badge supports, exported so the React kit derives its union from here. */
declare const counterBadgeTones: readonly ["danger", "accent", "neutral", "success"];

/** Orientations, exported so the React kit derives its union from here. */
declare const dividerOrientations: readonly ["horizontal", "vertical"];

/** Fill tones, exported so the React kit derives its union from here. */
declare const meterTones: readonly ["auto", "accent", "success", "warning", "danger"];

declare const pillVariants: readonly ["soft", "solid", "outline"];

/** Size steps, exported so the React kit derives its union from here. */
declare const progressBarSizes: readonly ["sm", "md"];
/** Tones a ProgressBar accepts (a subset of the shared tone families). */
declare const progressBarTones: readonly ["accent", "success", "warning", "danger"];

/** Tone families the ring arc supports, a subset of the shared tones. */
declare const progressRingTones: readonly ["accent", "success", "warning", "danger"];

/** Bar thickness steps, exported so the React kit derives its union from here. */
declare const segmentedBarSizes: readonly ["sm", "md"];
/** Slice fill tones, exported so the React kit derives its union from here. */
declare const segmentedBarTones: readonly ["accent", "success", "warning", "danger", "neutral"];

/** Shape families, exported so the React kit derives its union from here. */
declare const skeletonVariants: readonly ["text", "rect", "circle"];

/** Mark shapes, exported so the React kit derives its union from here. */
declare const sparklineShapes: readonly ["line", "area", "bars"];
/** Ink tones, exported so the React kit derives its union from here. */
declare const sparklineTones: readonly ["accent", "neutral", "success", "warning", "danger", "info"];

/** Tone families, exported so the React kit derives its union from here. */
declare const spinnerTones: readonly ["subtle", "accent", "inherit"];

/** Dot tones, exported so the React kit derives its union from here. */
declare const stepsTones: readonly ["accent", "success", "warning", "danger", "neutral", "info"];
/** Visual treatments, exported so the React kit derives its union from here. */
declare const stepsVariants: readonly ["dots", "connected"];
/** Dot size steps, exported so the React kit derives its union from here. */
declare const stepsSizes: readonly ["sm", "md"];

/** Rendered elements, exported so the React kit derives its `as` union from here. */
declare const textElements: readonly ["p", "span", "div", "strong", "em", "small"];
/** Size steps, exported so bindings share the same font-scale union. */
declare const textSizes: readonly ["xs", "sm", "md", "lg"];
/** Semantic text tones, exported so bindings share the union. */
declare const textTones: readonly ["default", "muted", "subtle", "accent", "danger", "success", "warning"];
/** Font weights, exported so bindings share the union. */
declare const textWeights: readonly ["regular", "medium", "semibold", "bold"];
/** Text alignment options, exported so bindings share the union. */
declare const textAligns: readonly ["start", "center", "end", "justify"];

/** Size steps, exported so the React kit derives its union from here. */
declare const textareaSizes: readonly ["sm", "md", "lg"];

/** Tone families, exported so the React kit derives its union from here. */
declare const toastTones: readonly ["neutral", "info", "success", "warning", "danger"];

/** Size steps, exported so the React kit derives its union from here. */
declare const deviceFrameSizes: readonly ["sm", "md", "lg"];

/** Visual treatments for the scrollbar on web-capable bindings. */
declare const scrollbarAppearances: readonly ["subtle", "default", "accent"];

declare const drawerSides: readonly ["left", "right", "bottom"];
declare const drawerSizes: readonly ["sm", "md", "lg"];

declare const alertDialogTones: readonly ["neutral", "danger"];

/** Orientations, exported so the React kit derives its union from here. */
declare const navBarOrientations: readonly ["horizontal", "vertical"];

/** Character sets the code accepts. Exported so React derives its union. */
declare const otpFieldTypes: readonly ["numeric", "alphanumeric"];

/** Marker tones, exported so the React kit derives its union from here. */
declare const timelineScrubberMarkerTones: readonly ["neutral", "accent", "success", "warning", "danger", "info"];

/**
 * The fixed categorical order for chart series inks, exported so the React kit
 * derives its union from here. Series take colors in this order (never cycled,
 * never re-ranked when a series is hidden): the accent leads, then hues chosen
 * for maximum adjacent-pair separation on the kit ramps. `gray` is reserved
 * for "other" roll-ups.
 */
declare const chartSeriesTones: readonly ["accent", "blue", "amber", "purple", "teal", "red", "green", "gray"];
/** Chart mark shapes, exported so the React kit derives its union from here. */
declare const timeSeriesChartShapes: readonly ["line", "area"];

/** Layout modes, exported so bindings derive their union from the contract. */
declare const cardGroupModes: readonly ["grid", "list"];
/** Gap steps, exported so bindings derive their union from the contract. */
declare const cardGroupGaps: readonly ["sm", "md", "lg"];
/** Density steps, exported so bindings derive their union from the contract. */
declare const cardGroupDensities: readonly ["comfortable", "compact"];

type Direction = 'ltr' | 'rtl';
/**
 * The writing direction in effect at a node. The nearest dir attribute wins
 * (matching how the attribute cascades), then the computed style, then the
 * document element, defaulting to ltr. Call it at event or measure time - a
 * live read can never go stale, unlike a render-time snapshot.
 */
declare function resolveDirection(node: Element | null | undefined): Direction;
/**
 * Render-time direction for a ref, kept in sync with dir flips on the document
 * element (the docs preference toggles it live). Prefer resolveDirection inside
 * event handlers; reach for this only when the render output itself must
 * differ, e.g. choosing which chevron glyph to draw.
 */
declare function useDirection(ref: RefObject<Element | null>): Direction;

type ButtonVariant = (typeof buttonVariants)[number];
type ControlSize = (typeof controlSizes)[number];
interface ButtonProps extends Omit<ComponentProps<typeof motion.button>, 'children'> {
    variant?: ButtonVariant;
    size?: ControlSize;
    loading?: boolean;
    /** Renders a placeholder with the button's exact geometry. */
    skeleton?: boolean;
    fullWidth?: boolean;
    children?: ReactNode;
}
declare function Button({ variant, size, loading, skeleton, fullWidth, disabled, className, children, ...rest }: ButtonProps): react.JSX.Element;

interface IconButtonProps extends Omit<ComponentProps<typeof motion.button>, 'children'> {
    /** Required: icon-only controls have no visible text. */
    'aria-label': string;
    variant?: ButtonVariant;
    size?: ControlSize;
    /** Renders a placeholder with the control's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
declare function IconButton({ variant, size, skeleton, disabled, className, children, ...rest }: IconButtonProps): react.JSX.Element;

interface InputProps extends Omit<ComponentProps<'input'>, 'size'> {
    size?: ControlSize;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
    /** Icon or adornment pinned to the leading edge; the text pads clear of it. */
    leadingIcon?: ReactNode;
    /** Icon or adornment pinned to the trailing edge, such as a clear button. */
    trailingIcon?: ReactNode;
}
declare function Input({ size, skeleton, glass, leadingIcon, trailingIcon, className, id, ...rest }: InputProps): react.JSX.Element;

interface CheckboxProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'checked' | 'defaultChecked'> {
    label?: ReactNode;
    checked?: boolean;
    defaultChecked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    /** Mixed state: shows a dash and reports aria-checked="mixed" while unchecked. */
    indeterminate?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
}
declare function Checkbox({ label, checked, defaultChecked, onCheckedChange, indeterminate, disabled, skeleton, glass, className, ...rest }: CheckboxProps): react.JSX.Element;

interface RadioProps extends Omit<ComponentProps<'input'>, 'type'> {
    label?: ReactNode;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
}
/** Uncontrolled-friendly: group radios by `name` as usual. */
declare function Radio({ label, disabled, skeleton, glass, className, ...rest }: RadioProps): react.JSX.Element;

interface SwitchProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'checked' | 'defaultChecked' | 'size'> {
    label?: ReactNode;
    checked?: boolean;
    defaultChecked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
    size?: 'sm' | 'md';
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
}
declare function Switch({ label, checked, defaultChecked, onCheckedChange, disabled, size, skeleton, glass, className, ...rest }: SwitchProps): react.JSX.Element;

type Elevation = (typeof cardElevations)[number];
type CardVariant = (typeof cardVariants)[number];
interface CardProps extends Omit<ComponentProps<typeof motion.div>, 'children'> {
    elevation?: Elevation;
    /** Adds hover lift + shadow bump for clickable cards. */
    interactive?: boolean;
    /** 'glass' renders a translucent blurred material. */
    variant?: CardVariant;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
declare function Card({ elevation, interactive, variant, skeleton, className, children, ...rest }: CardProps): react.JSX.Element;

type SurfaceLevel = 0 | 1 | 2 | 'sunken';
interface SurfaceProps extends ComponentProps<'div'> {
    /** 0 = app background, 1 = surface, 2 = raised, 'sunken' = inset wells. */
    level?: SurfaceLevel;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
}
declare function Surface({ level, skeleton, glass, className, children, ...rest }: SurfaceProps): react.JSX.Element;

type TextToneName = (typeof textTones)[number];
type TextSize = (typeof textSizes)[number];
type TextElement = (typeof textElements)[number];
type TextWeight = (typeof textWeights)[number];
type TextAlign = (typeof textAligns)[number];
interface TextProps extends Omit<ComponentProps<'p'>, 'children'> {
    /** Rendered element. Defaults to a paragraph. */
    as?: TextElement;
    size?: TextSize;
    tone?: TextToneName;
    weight?: TextWeight;
    /** Monospace with tabular numerals, for values and measurements. */
    mono?: boolean;
    /** Text alignment; inherits when unset. */
    align?: TextAlign;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
declare function Text({ as, size, tone, weight, mono, align, skeleton, className, children, ...rest }: TextProps): react.JSX.Element;

interface HeadingProps extends Omit<ComponentProps<'h2'>, 'children'> {
    /** Semantic heading level, h1 through h6. Also sets the visual size. */
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    /** Visual size override when semantics and looks need to differ. */
    visualLevel?: 1 | 2 | 3 | 4 | 5 | 6;
    /** Text alignment; inherits when unset. */
    align?: 'start' | 'center' | 'end' | 'justify';
    /** Removes the heading's outer margin so it can fit inside compact layouts. */
    noMargin?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
declare function Heading({ level, visualLevel, align, noMargin, skeleton, className, children, ...rest }: HeadingProps): react.JSX.Element;

interface LabelProps extends Omit<ComponentProps<'label'>, 'children'> {
    /** Appends a required marker after the label text. */
    required?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
declare function Label({ required, skeleton, className, children, ...rest }: LabelProps): react.JSX.Element;

interface LinkProps extends Omit<ComponentProps<'a'>, 'children'> {
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
declare function Link({ skeleton, className, children, ...rest }: LinkProps): react.JSX.Element;

interface KbdProps extends Omit<ComponentProps<'kbd'>, 'children'> {
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
    children?: ReactNode;
}
declare function Kbd({ skeleton, glass, className, children, ...rest }: KbdProps): react.JSX.Element;

type PillTone = (typeof tones)[number];
type PillVariant = (typeof pillVariants)[number];
interface PillProps extends Omit<ComponentProps<'span'>, 'children'> {
    tone?: PillTone;
    variant?: PillVariant;
    size?: 'sm' | 'md';
    /** Leading glyph, hidden from assistive tech. */
    icon?: ReactNode;
    /** When set, renders a trailing remove button that calls this on click, turning the pill into a removable tag. */
    onRemove?: () => void;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
    children?: ReactNode;
}
declare function Pill({ tone, variant, size, icon, onRemove, skeleton, glass, className, children, ...rest }: PillProps): react.JSX.Element;

type DividerOrientation = (typeof dividerOrientations)[number];
interface DividerProps extends Omit<ComponentProps<'hr'>, 'children'> {
    orientation?: DividerOrientation;
    /** Optional centered label; renders a div separator instead of an hr. */
    label?: ReactNode;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
}
declare function Divider({ orientation, label, skeleton, className, ...rest }: DividerProps): react.JSX.Element;

type IconElement = ReactElement<SVGProps<SVGSVGElement> & {
    color?: string;
    size?: number | string;
    'data-icon-backfill'?: boolean;
}>;
interface IconBackfillProps extends ComponentProps<'span'> {
    /** One outline icon. Its explicit color is reused for the backfill. */
    children: IconElement;
    /** Overrides the glyph and backfill color. Defaults to the icon's color, then currentColor. */
    color?: string;
    /** Glyph size used to scale the surrounding backfill inset. Defaults to the child's size. */
    size?: number | string;
}
/**
 * Stacks a filled, soft-stroked copy of the glyph behind its outline at 33%
 * opacity. The backing follows the icon's silhouette and shares its resolved
 * color, including inherited text colors and explicit custom colors.
 */
declare function IconBackfill({ children, color, size, className, style, ...rest }: IconBackfillProps): react.JSX.Element;

type ProgressBarSize = (typeof progressBarSizes)[number];
type ProgressBarTone = (typeof progressBarTones)[number];
interface ProgressBarProps extends ComponentProps<'div'> {
    /** 0 to max. Omit (or set indeterminate) for an unknown duration. */
    value?: number;
    max?: number;
    indeterminate?: boolean;
    size?: ProgressBarSize;
    tone?: ProgressBarTone;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Accessible name for the bar. */
    'aria-label'?: string;
}
declare function ProgressBar({ value, max, indeterminate, size, tone, skeleton, className, ...rest }: ProgressBarProps): react.JSX.Element;

type SpinnerSize = (typeof controlSizes)[number];
type SpinnerTone = (typeof spinnerTones)[number];
interface SpinnerProps extends ComponentProps<'span'> {
    /** sm tracks the surrounding font size (1em); md and lg are fixed. */
    size?: SpinnerSize;
    tone?: SpinnerTone;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Accessible name. Pass an empty string when a parent already announces loading. */
    'aria-label'?: string;
}
declare function Spinner({ size, tone, skeleton, className, ...rest }: SpinnerProps): react.JSX.Element;

interface SliderProps extends Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'size'> {
    value?: number;
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    onValueChange?: (value: number) => void;
    /**
     * Lay the rail vertically, filling from the bottom (min) up - for volume and
     * the like. Set the track length with the `--slider-length` custom property.
     */
    orientation?: 'horizontal' | 'vertical';
    /**
     * Percent of the min-max range between haptic ticks while dragging or keying:
     * a 'selection' tick fires each time the value crosses a bucket boundary, and
     * a 'medium' bump fires once when the value lands on min or max. Set 0 or a
     * negative number to disable the ticks (the edge bump stays).
     */
    hapticStep?: number;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    'aria-label'?: string;
    /** Set to "none" to opt this slider out of haptic feedback. */
    'data-haptic'?: string;
}
/**
 * A styled native range input with a filled leading track and an iOS-style
 * thumb. Native semantics come free: arrow keys nudge by step, Home and End
 * jump to the ends, and screen readers read the value. Pass
 * orientation="vertical" to stand the rail up for volume-style controls.
 */
declare function Slider({ value, defaultValue, min, max, step, onValueChange, orientation, hapticStep, skeleton, disabled, className, style, id, ...rest }: SliderProps): react.JSX.Element;

type SkeletonVariant = (typeof skeletonVariants)[number];
interface SkeletonProps extends ComponentProps<'span'> {
    /** text is a 1em line, rect a rounded block, circle a disc. */
    variant?: SkeletonVariant;
    width?: string | number;
    height?: string | number;
    /** Corner radius override, e.g. var(--glacier-control-radius). */
    radius?: string;
}
/**
 * The kit's one skeleton primitive. Every component's `skeleton` prop renders
 * through this, passing the same tokens the live component consumes, so
 * placeholders always match the real geometry and content never shifts on
 * arrival. Skeletons are decorative (aria-hidden); mark the loading region
 * itself with aria-busy at the app level. Shimmer becomes an opacity pulse
 * under prefers-reduced-motion.
 */
declare function Skeleton({ variant, width, height, radius, className, style, ...rest }: SkeletonProps): react.JSX.Element;

interface ToggleProps extends Omit<ComponentProps<typeof motion.button>, 'children'> {
    pressed?: boolean;
    defaultPressed?: boolean;
    onPressedChange?: (pressed: boolean) => void;
    size?: ControlSize;
    /** Square icon-only layout, like IconButton. */
    iconOnly?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
    /** Required when the content is icon-only. */
    'aria-label'?: string;
    children?: ReactNode;
}
/**
 * A press-state button (aria-pressed) for stateful actions: password reveal,
 * view modes, formatting toolbars. Pressed renders in the accent soft tint.
 * For on/off settings, use Switch instead.
 */
declare function Toggle({ pressed, defaultPressed, onPressedChange, size, iconOnly, skeleton, glass, disabled, className, children, onClick, ...rest }: ToggleProps): react.JSX.Element;

type MeterTone = (typeof meterTones)[number];
interface MeterProps extends ComponentProps<'div'> {
    /** Current level, 0 to max. */
    value: number;
    /** Upper bound. Defaults to the segment count, so value maps 1:1 to segments. */
    max?: number;
    /** Number of discrete segments. */
    segments?: number;
    /**
     * Fill color. 'auto' grades by level: the bottom third reads danger, the
     * middle third warning, the top success. Suits strength and health meters.
     */
    tone?: MeterTone;
    size?: 'sm' | 'md';
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Accessible name for the meter. */
    'aria-label'?: string;
}
/**
 * A segmented level indicator (health bar): discrete pips that fill from the
 * left. Use ProgressBar for task progress; Meter is for how good or full
 * something currently is, like password strength or remaining quota.
 */
declare function Meter({ value, max, segments, tone, size, skeleton, className, ...rest }: MeterProps): react.JSX.Element;

type TextareaSize = (typeof textareaSizes)[number];
interface TextareaProps extends Omit<ComponentProps<'textarea'>, 'size'> {
    size?: TextareaSize;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
}
declare function Textarea({ size, skeleton, glass, className, id, ...rest }: TextareaProps): react.JSX.Element;

interface SearchFieldProps extends Omit<ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'size'> {
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    size?: 'sm' | 'md' | 'lg';
    /** Right-aligned slot for a keyboard shortcut hint, e.g. a Kbd. */
    shortcut?: ReactNode;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
}
declare function SearchField({ value: controlledValue, defaultValue, onValueChange, placeholder, size, shortcut, skeleton, glass, className, id, ...rest }: SearchFieldProps): react.JSX.Element;

interface NumberInputProps extends Omit<ComponentProps<'input'>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'size'> {
    value?: number;
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    onValueChange?: (value: number) => void;
    size?: ControlSize;
    disabled?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
    'aria-label'?: string;
    /** Set to "none" to opt this stepper out of haptic feedback. */
    'data-haptic'?: string;
}
/**
 * A numeric stepper: a minus button, a centered native number input with
 * tabular figures, and a plus button, wrapped in a bordered group at control
 * height. Results clamp to min and max, and the step buttons disable at the
 * bounds.
 *
 * Haptics: every committed step (button tap, hold-repeat tick, ArrowUp or
 * ArrowDown) fires a selection tick; a step that clamps at min or max bumps
 * medium once until the value leaves the bound; typed digits are silent and
 * their blur-commit fires one light. data-haptic="none" opts all of it out.
 */
declare function NumberInput({ value, defaultValue, min, max, step, onValueChange, size, disabled, skeleton, glass, className, id, 'aria-label': ariaLabel, onKeyDown, onBlur, ...rest }: NumberInputProps): react.JSX.Element;

type ProgressRingTone = (typeof progressRingTones)[number];
interface ProgressRingProps extends ComponentProps<'div'> {
    /** 0 to max. Clamped into range. */
    value: number;
    max?: number;
    /** Pixel diameter of the ring. */
    size?: number;
    /** Stroke width of the track and arc in pixels. */
    thickness?: number;
    tone?: ProgressRingTone;
    /** Centered content. Takes priority over showValue. */
    label?: ReactNode;
    /** With no label, render the rounded percentage in the center. */
    showValue?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Accessible name for the ring. */
    'aria-label'?: string;
}
declare function ProgressRing({ value, max, size, thickness, tone, label, showValue, skeleton, className, ...rest }: ProgressRingProps): react.JSX.Element;

type AvatarSize = (typeof avatarSizes)[number];
type AvatarShape = (typeof avatarShapes)[number];
interface AvatarProps extends Omit<ComponentProps<'span'>, 'children'> {
    src?: string;
    alt?: string;
    /** Falls back to initials of up to two words when there is no image. */
    name?: string;
    size?: AvatarSize;
    shape?: AvatarShape;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
}
declare function Avatar({ src, alt, name, size, shape, skeleton, glass, className, ...rest }: AvatarProps): react.JSX.Element;

type StatusDotTone = (typeof tones)[number];
interface StatusDotProps extends Omit<ComponentProps<'span'>, 'children'> {
    tone?: StatusDotTone;
    /** Adds an animated expanding ring for live states. */
    pulse?: boolean;
    size?: 'sm' | 'md';
    /** Accessible name. When set, the dot becomes a status region; otherwise it is decorative. */
    label?: string;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
}
declare function StatusDot({ tone, pulse, size, label, skeleton, className, ...rest }: StatusDotProps): react.JSX.Element;

type CounterBadgeTone = (typeof counterBadgeTones)[number];
interface CounterBadgeProps extends Omit<ComponentProps<'span'>, 'children'> {
    count: number;
    /** Render `${max}+` when count is greater than max. */
    max?: number;
    tone?: CounterBadgeTone;
    /** Render a small dot with no number, for presence or attention. */
    dot?: boolean;
    size?: 'sm' | 'md';
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
    'aria-label'?: string;
}
/**
 * A small numeric badge for unread or attention counts on nav icons and tabs.
 * Solid tone fill with contrast text, pill-shaped so single digits stay
 * circular, tabular figures so the width does not jitter as the count changes.
 */
declare function CounterBadge({ count, max, tone, dot, size, skeleton, glass, className, 'aria-label': ariaLabel, ...rest }: CounterBadgeProps): react.JSX.Element | null;

type CalloutTone = (typeof calloutTones)[number];
interface CalloutProps extends Omit<ComponentProps<'div'>, 'title'> {
    tone?: CalloutTone;
    title?: ReactNode;
    icon?: ReactNode;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
    children?: ReactNode;
}
declare function Callout({ tone, title, icon, skeleton, glass, className, children, ...rest }: CalloutProps): react.JSX.Element;

interface CodeBlockProps extends Omit<ComponentProps<'div'>, 'children'> {
    /** The source text: the accessible content, what the copy button copies, and the plain fallback. */
    code: string;
    /**
     * A pre-highlighted rendering of `code`, e.g. syntax-highlighted markup from a
     * highlighter. The kit ships no highlighter itself, so an app passes the
     * highlighted nodes here; without them the plain `code` renders.
     */
    children?: ReactNode;
    /** Shown as a label in the header. */
    language?: string;
    /** Shown in the header. */
    filename?: string;
    showCopy?: boolean;
    /** Renders a line-number gutter down the left edge. */
    lineNumbers?: boolean;
    /** Drops the top border and top corners so the block docks beneath the element above it. */
    attached?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
}
declare function CodeBlock({ code, children, language, filename, showCopy, lineNumbers, attached, skeleton, glass, className, ...rest }: CodeBlockProps): react.JSX.Element;

type SegmentedBarTone = (typeof segmentedBarTones)[number];
type SegmentedBarSize = (typeof segmentedBarSizes)[number];
interface SegmentedBarSegment {
    value: number;
    tone?: SegmentedBarTone;
    label?: string;
}
interface SegmentedBarProps extends ComponentProps<'div'> {
    /** Slices sized by proportion of the total. Zero-value slices are omitted. */
    data: SegmentedBarSegment[];
    /** Bar thickness: sm 0.375rem, md 0.625rem. */
    size?: SegmentedBarSize;
    /** Round the bar ends with a full radius. */
    rounded?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Accessible name for the bar. Falls back to a generated breakdown. */
    'aria-label'?: string;
}
/**
 * A single proportional bar split into slices sized by share of the total.
 * Unlike Meter, which is discrete equal pips for a level, SegmentedBar shows a
 * continuous breakdown of parts, such as a storage or budget split.
 */
declare function SegmentedBar({ data, size, rounded, skeleton, className, 'aria-label': ariaLabel, ...rest }: SegmentedBarProps): react.JSX.Element;

type BannerTone = (typeof bannerTones)[number];
interface BannerProps extends ComponentProps<'div'> {
    tone?: BannerTone;
    /** Leading glyph, centered with the message. */
    icon?: ReactNode;
    /** Trailing slot, typically a Button or link. */
    action?: ReactNode;
    /** When set, renders a trailing close IconButton that calls this. */
    onDismiss?: () => void;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
declare function Banner({ tone, icon, action, onDismiss, skeleton, className, children, ...rest }: BannerProps): react.JSX.Element;

type AnnouncementTone = (typeof announcementTones)[number];
interface AnnouncementItem {
    /** Stable identity for the update, used for the slide transition and indicator. */
    id: string;
    /** Optional short category shown before the update text. */
    label?: ReactNode;
    /** The announcement message. */
    content: ReactNode;
}
interface AnnouncementsProps extends Omit<ComponentProps<'section'>, 'children'> {
    /** Updates to rotate through. At least one item is required. */
    items: readonly AnnouncementItem[];
    /** Semantic color family for the strip. */
    tone?: AnnouncementTone;
    /** Controlled index of the current update. */
    index?: number;
    /** Initially visible update in uncontrolled use. */
    defaultIndex?: number;
    /** Called whenever a user action or auto-rotation selects a new update. */
    onIndexChange?: (index: number) => void;
    /** Whether updates should rotate until the user pauses or interacts. */
    autoPlay?: boolean;
    /** Delay in milliseconds between automatic updates. */
    interval?: number;
    /** Accessible name for the announcements region. */
    'aria-label'?: string;
}
/**
 * A compact application-chrome ticker for short, rotating updates. Auto-rotation
 * stops while the region is hovered or focused, and a persistent pause control
 * lets people keep the current update in view.
 */
declare function Announcements({ items, tone, index, defaultIndex, onIndexChange, autoPlay, interval, className, 'aria-label': ariaLabel, onMouseEnter, onMouseLeave, onFocusCapture, onBlurCapture, ...rest }: AnnouncementsProps): react.JSX.Element | null;

interface EmptyStateProps extends Omit<ComponentProps<'div'>, 'title'> {
    /** Glyph rendered inside the leading disc. Decorative. */
    icon?: ReactNode;
    /** Heading naming what is empty or missing. */
    title: ReactNode;
    /** Muted supporting sentence, centered and width-capped. */
    description?: ReactNode;
    /** Call-to-action node, e.g. a Button, below the text. */
    action?: ReactNode;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
/**
 * A centered placeholder for an empty view. Stacks an optional icon disc, a
 * title, a muted description, and an action, all centered on both axes so it
 * reads as a calm, deliberate stop rather than a missing screen.
 */
declare function EmptyState({ icon, title, description, action, skeleton, className, children, ...rest }: EmptyStateProps): react.JSX.Element;

type StepsTone = (typeof stepsTones)[number];
type StepsSize = (typeof stepsSizes)[number];
type StepsVariant = (typeof stepsVariants)[number];
interface StepsProps extends Omit<ComponentProps<'div'>, 'children'> {
    /** Total number of steps; renders this many dots. */
    count: number;
    /** Zero-based index of the current step. Earlier dots read completed, later ones upcoming. */
    active?: number;
    /** Semantic color family for completed and current dots. */
    tone?: StepsTone;
    /** Compact size step; sets dot diameter and gap. */
    size?: StepsSize;
    /** dots is the compact dot row; connected joins circular markers with lines and checks. */
    variant?: StepsVariant;
    /** Numbers the connected markers from 1; completed markers keep the check. */
    numbered?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
}
/**
 * A row of progress dots marking position through a tour, wizard, or quiz.
 * Dots before the active index read as completed and fill solid in the tone;
 * the active dot is enlarged to mark the current step; later dots are hollow
 * with a hairline border. Position is announced by the group label, not color.
 */
declare function Steps({ count, active, tone, size, variant, numbered, skeleton, className, ...rest }: StepsProps): react.JSX.Element;

interface RadioCardProps extends Omit<ComponentProps<'input'>, 'type' | 'onChange' | 'checked' | 'defaultChecked' | 'title'> {
    /** The card heading, the primary label of the choice. */
    title: ReactNode;
    /** Secondary line under the title. */
    description?: ReactNode;
    /** Leading glyph or preview swatch above the title. */
    icon?: ReactNode;
    /** Controlled selected state. */
    checked?: boolean;
    /** Initial selected state when uncontrolled. */
    defaultChecked?: boolean;
    /** Called with the next checked state when the card is selected. */
    onCheckedChange?: (checked: boolean) => void;
    /** Extra content rendered below the description. */
    children?: ReactNode;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
}
/**
 * A selectable card with radio semantics: a preview tile that checks as one of
 * a group. Group cards with a shared `name` so the browser and assistive
 * technology treat them as a single radio set. Works controlled (`checked` +
 * `onCheckedChange`) or uncontrolled (`defaultChecked`).
 */
declare function RadioCard({ title, description, icon, checked, defaultChecked, onCheckedChange, disabled, skeleton, children, className, ...rest }: RadioCardProps): react.JSX.Element;

interface StatTileProps extends ComponentProps<'div'> {
    /** Optional leading glyph rendered in a muted disc. Decorative. */
    icon?: ReactNode;
    /** The prominent value - a number, currency, or short string. */
    value: ReactNode;
    /** The muted label naming what the value measures. */
    label: ReactNode;
    /** Optional trailing delta or hint, e.g. a change chip or timeframe. */
    hint?: ReactNode;
    /** Renders the frosted glass material instead of a solid card. */
    glass?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
}
/**
 * A compact stat micro-card: an optional leading icon, a prominent value, and a
 * muted label, with an optional trailing delta or hint. Built on the card
 * surface tokens so a row or grid of tiles reads as one consistent panel.
 */
declare function StatTile({ icon, value, label, hint, glass, skeleton, className, ...rest }: StatTileProps): react.JSX.Element;

type DeviceFrameSize = (typeof deviceFrameSizes)[number];
interface DeviceFrameProps extends Omit<ComponentProps<'div'>, 'children'> {
    /** Preset screen width. Ignored when `width` is set. */
    size?: DeviceFrameSize;
    /** Explicit screen width, overriding `size`, e.g. `320` or `'20rem'`. */
    width?: string | number;
    /**
     * Screen aspect ratio as width / height. Defaults to a modern phone.
     * A number like `9 / 19.5`, or a CSS ratio string like `'9 / 19.5'`.
     */
    aspect?: string | number;
    /** Hides the decorative notch, for a full-bleed slab. */
    hideNotch?: boolean;
    /** Accessible label for the frame region. */
    'aria-label'?: string;
    /** The preview or iframe that fills the screen. */
    children?: ReactNode;
}
/**
 * A decorative phone bezel with a fixed-aspect, inset screen that hosts
 * arbitrary children - a live preview, a screenshot, or an iframe. The bezel,
 * notch, and side buttons are purely presentational and hidden from assistive
 * tech; only the screen contents carry meaning. Pick a preset `size` or set an
 * explicit `width`, and tune the screen shape with `aspect`.
 */
declare function DeviceFrame({ size, width, aspect, hideNotch, className, style, children, ...rest }: DeviceFrameProps): react.JSX.Element;

interface FilterChipProps extends Omit<ComponentProps<typeof motion.button>, 'children' | 'onChange'> {
    /** Controlled selected state. */
    selected?: boolean;
    /** Initial selected state when uncontrolled. */
    defaultSelected?: boolean;
    /** Called with the next selected state when the chip is toggled. */
    onSelectedChange?: (selected: boolean) => void;
    /** Leading glyph. */
    icon?: ReactNode;
    /** Trailing count, rendered as a CounterBadge; hidden when 0 or less. */
    count?: number;
    size?: 'sm' | 'md';
    children?: ReactNode;
}
/**
 * A toggleable filter pill (button, aria-pressed) for faceted filtering. The
 * selected state paints the accent soft tint like Toggle, with an optional
 * leading icon and an optional trailing count rendered as a CounterBadge.
 * Controlled selected + onSelectedChange, matching the kit's other toggles.
 */
declare function FilterChip({ selected, defaultSelected, onSelectedChange, icon, count, size, disabled, className, children, onClick, ...rest }: FilterChipProps): react.JSX.Element;

type ImageFit = 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
type ImageRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
interface ImageProps extends Omit<ComponentProps<'img'>, 'width' | 'height' | 'style'> {
    src: string;
    /** Required for a11y; pass an empty string for a purely decorative image. */
    alt: string;
    /** Aspect ratio of the frame, e.g. `'2 / 3'` for a book cover or `1` for a square. */
    aspectRatio?: string | number;
    /** How the image fills its frame. */
    fit?: ImageFit;
    /** Corner radius, from the radius scale. */
    radius?: ImageRadius;
    /** Rendered when the image fails to load. Defaults to a muted broken-image glyph. */
    fallback?: ReactNode;
    /** Renders a placeholder with the frame's geometry. */
    skeleton?: boolean;
    className?: string;
    style?: CSSProperties;
}
/**
 * A framed image with a fixed aspect ratio: it holds its box while the source
 * loads (showing a skeleton), fits the image with `object-fit`, rounds the
 * corners, and swaps in a fallback if the source fails. Built for content
 * imagery like cover art, thumbnails, and hero shots.
 */
declare function Image({ src, alt, aspectRatio, fit, radius, fallback, skeleton, loading, className, style, ...rest }: ImageProps): react.JSX.Element;

interface RatingProps extends Omit<ComponentProps<'span'>, 'onChange' | 'defaultValue' | 'role' | 'children'> {
    /** Controlled rating value, 0 to `max`. */
    value?: number;
    /** Initial value when uncontrolled. */
    defaultValue?: number;
    /** Number of stars. */
    max?: number;
    onChange?: (value: number) => void;
    /** Display-only: renders the stars (with fractional fill) but no controls. */
    readOnly?: boolean;
    disabled?: boolean;
    size?: 'sm' | 'md' | 'lg';
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Accessible name for the rating group. */
    'aria-label'?: string;
    /** Set to "none" to opt this rating out of haptic feedback. */
    'data-haptic'?: string;
}
/**
 * A star rating. Interactive by default - a native radio group, so arrow keys
 * move between stars and the value participates in forms - or `readOnly` for a
 * display badge that supports fractional fill (e.g. a 4.3 average).
 */
declare function Rating({ value, defaultValue, max, onChange, readOnly, disabled, size, skeleton, className, 'aria-label': ariaLabel, ...rest }: RatingProps): react.JSX.Element;

type OtpFieldType = (typeof otpFieldTypes)[number];
interface OtpFieldProps extends Omit<ComponentProps<'div'>, 'onChange' | 'defaultValue' | 'children'> {
    /** Number of code characters. */
    length?: number;
    /** Controlled code value. */
    value?: string;
    /** Initial value when uncontrolled. */
    defaultValue?: string;
    /** Called with the sanitized code on every change. */
    onValueChange?: (value: string) => void;
    /** Called once with the full code when the last cell fills. */
    onComplete?: (value: string) => void;
    /** Which characters the code accepts. */
    type?: OtpFieldType;
    /** Renders dots instead of the entered characters. */
    masked?: boolean;
    /** Draws a separator dash after every N cells, e.g. 3 for a 123-456 code. */
    groupSize?: number;
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    /** Paints the invalid treatment, matching Input's aria-invalid styling. */
    error?: boolean;
    autoFocus?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
    /** Renders placeholders with the component's exact geometry. */
    skeleton?: boolean;
    /** Accessible name for the code input; defaults to the localized "One-time code". */
    'aria-label'?: string;
}
/**
 * A one-time passcode entry. One real text input is stretched invisibly across
 * the visual cells, so typing, backspace, paste, and platform code autofill
 * (autocomplete="one-time-code") all behave natively while the cells render
 * each character with a blinking caret in the next empty cell. Codes read left
 * to right in every locale, so the row is pinned ltr.
 */
declare function OtpField({ length, value: valueProp, defaultValue, onValueChange, onComplete, type, masked, groupSize, size, disabled, error, autoFocus, glass, skeleton, className, 'aria-label': ariaLabel, ...rest }: OtpFieldProps): react.JSX.Element;

type SparklineShape = (typeof sparklineShapes)[number];
type SparklineTone = (typeof sparklineTones)[number];
interface SparklineProps extends ComponentProps<'span'> {
    /** The series, oldest first. The sparkline renders whatever slice it is given. */
    data: number[];
    /** Fixed lower bound of the value domain. Defaults to the data minimum. */
    min?: number;
    /** Fixed upper bound of the value domain. Defaults to the data maximum. */
    max?: number;
    /** Draws a dashed reference line at this value when it sits inside the domain. */
    baseline?: number;
    /** How the series is marked: a thin line, a line over a soft fill, or micro bars. */
    shape?: SparklineShape;
    /** Ink family for the mark. */
    tone?: SparklineTone;
    /** Height step; the width is fluid and follows the container. */
    size?: 'sm' | 'md' | 'lg';
    /** Marks the newest sample with an emphasis dot. */
    endPoint?: boolean;
    /** Mounts the mark on the frosted glass material: a rounded, blurred tile. */
    glass?: boolean;
    /** Renders a placeholder with the exact geometry. */
    skeleton?: boolean;
    /** Accessible name; describe the trend, not the pixels. */
    'aria-label': string;
}
/**
 * A word-sized trend graphic: a single series as a thin line, a soft-filled
 * area, or micro bars, for table cells, stat tiles, and dense monitoring rows.
 * It carries no axes or labels - the surrounding text does the naming - and it
 * is an impression, not a reading: pair it with a text value that carries the
 * actual figure. Pin min/max (e.g. 0-100 for percentages) so rows in a column
 * share one scale.
 */
declare function Sparkline({ data, min, max, baseline, shape, tone, size, endPoint, glass, skeleton, className, 'aria-label': ariaLabel, ...rest }: SparklineProps): react.JSX.Element;

interface FieldProps extends ComponentProps<'div'> {
    label?: ReactNode;
    hint?: ReactNode;
    /** When set, replaces the hint and shakes in. */
    error?: ReactNode;
    required?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    className?: string;
    children: ReactNode;
}
declare function Field({ label, hint, error, required, skeleton, className, children, ...rest }: FieldProps): react.JSX.Element;

interface FieldsetProps extends ComponentProps<'fieldset'> {
    /** The group label, rendered as a native legend. */
    legend: ReactNode;
    /** Muted supporting line under the legend, announced with the group via aria-describedby. */
    description?: ReactNode;
    /** Right-aligned actions on the legend row. */
    actions?: ReactNode;
    /**
     * The NATIVE fieldset disabled attribute: the browser disables every nested
     * form control for free, with no per-control wiring.
     */
    disabled?: boolean;
    /** Draws the classic hairline box with the legend floating on the border. */
    bordered?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
/**
 * A styled NATIVE fieldset. Using the real element is the whole point: the
 * legend names the group for assistive tech, and the native disabled attribute
 * cascades to every nested control without touching each one.
 */
declare function Fieldset({ legend, description, actions, disabled, bordered, skeleton, className, children, 'aria-describedby': ariaDescribedBy, ...rest }: FieldsetProps): react.JSX.Element;

interface FormSectionProps extends Omit<ComponentProps<'section'>, 'title'> {
    /** The section title, rendered as a Heading that labels the section. */
    title: ReactNode;
    /** Semantic heading level for the title. */
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    /** Muted supporting line under the title. */
    description?: ReactNode;
    /** Right-aligned actions on the title row. */
    actions?: ReactNode;
    /** Draws a hairline divider above the section, for stacking sections. */
    divider?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
/**
 * A page-level grouping for settings and long forms: a titled, labelled
 * region whose content is often one or more Fieldsets.
 */
declare function FormSection({ title, level, description, actions, divider, skeleton, className, children, ...rest }: FormSectionProps): react.JSX.Element;

type CalendarMode = 'single' | 'range';
/** A possibly half-open date range, as reported while a range is being picked. */
interface CalendarRange {
    from?: Date;
    to?: Date;
}
interface CalendarProps extends Omit<ComponentProps<'div'>, 'defaultValue' | 'onSelect'> {
    /** Pick one date (default) or a from/to range. */
    mode?: CalendarMode;
    /** Controlled selected date, in single mode. */
    value?: Date;
    /** Uncontrolled initial date, in single mode. */
    defaultValue?: Date;
    /** Called with the next date, or undefined when the selected day is unpicked. */
    onValueChange?: (value: Date | undefined) => void;
    /** Controlled selected range, in range mode. */
    rangeValue?: CalendarRange;
    /** Uncontrolled initial range, in range mode. */
    defaultRangeValue?: CalendarRange;
    /** Called with the next range; from is set first, then to. */
    onRangeChange?: (range: CalendarRange) => void;
    /** Earliest selectable date; navigation stops at its month. */
    min?: Date;
    /** Latest selectable date; navigation stops at its month. */
    max?: Date;
    /** Marks matching dates disabled and unselectable. */
    disabledDates?: (date: Date) => boolean;
    /** Disables every day and the month navigation. */
    disabled?: boolean;
    /** Overrides the date-fns locale derived from the kit locale. */
    dateFnsLocale?: DayPickerLocale;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Drops the card chrome, for hosts that already frame the grid (DatePicker's panel). */
    bare?: boolean;
    'aria-label'?: string;
    className?: string;
}
/**
 * An inline month grid for picking a single date or a date range. All date
 * math, keyboard navigation (arrows, PageUp/PageDown, Home/End), and grid ARIA
 * come from react-day-picker; every visible surface is restyled with kit
 * tokens through its classNames prop. Month and weekday names follow the kit
 * locale, overridable per instance with dateFnsLocale.
 */
declare function Calendar({ mode, value, defaultValue, onValueChange, rangeValue, defaultRangeValue, onRangeChange, min, max, disabledDates, disabled, dateFnsLocale, skeleton, bare, className, 'aria-label': ariaLabel, ...rest }: CalendarProps): react.JSX.Element;

interface DatePickerProps extends Omit<ComponentProps<'div'>, 'defaultValue'> {
    /** Controlled selected date. */
    value?: Date;
    /** Uncontrolled initial date. */
    defaultValue?: Date;
    /** Called with the next date, or undefined when the selected day is unpicked. */
    onValueChange?: (value: Date | undefined) => void;
    /** Hint shown while no date is selected; defaults to the localized prompt. */
    placeholder?: string;
    size?: ControlSize;
    fullWidth?: boolean;
    disabled?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material on the trigger instead of a solid surface. */
    glass?: boolean;
    /** Earliest selectable date. */
    min?: Date;
    /** Latest selectable date. */
    max?: Date;
    /** Marks matching dates disabled and unselectable. */
    disabledDates?: (date: Date) => boolean;
    /** Overrides the date-fns locale derived from the kit locale. */
    dateFnsLocale?: DayPickerLocale;
    /** Submitted with forms via a hidden input (ISO yyyy-MM-dd) when set. */
    name?: string;
    id?: string;
    'aria-label'?: string;
    className?: string;
}
/**
 * A single-date picker: an Input-metric trigger that opens a portaled Calendar
 * in an anchored glass panel. The panel flips and clamps through the shared
 * anchored-position engine, tracks scroll, and dismisses on Escape or an
 * outside press, restoring focus to the trigger. The value renders through
 * Intl.DateTimeFormat in the kit locale; when name is set an ISO yyyy-MM-dd
 * hidden input submits with native forms. Ranges are deliberately not picked
 * from this popover - use an inline Calendar in range mode, where both
 * endpoints stay visible while the range is chosen.
 */
declare function DatePicker({ value, defaultValue, onValueChange, placeholder, size, fullWidth, disabled, skeleton, glass, min, max, disabledDates, dateFnsLocale, name, id, className, 'aria-label': ariaLabel, ...rest }: DatePickerProps): react.JSX.Element;

/** Why one file was refused: it failed the accept filter, the size cap, or the count cap. */
type FileUploadRejectionReason = 'type' | 'size' | 'count';
interface FileUploadRejection {
    file: File;
    reason: FileUploadRejectionReason;
}
interface FileUploadProps extends Omit<ComponentProps<'div'>, 'defaultValue' | 'onChange'> {
    /** Native accept string (`.pdf,image/*`); also enforced in JS on drop. */
    accept?: string;
    /** Per-file size cap in bytes; larger files are rejected with reason `size`. */
    maxSize?: number;
    /** Total file cap; files past it are rejected with reason `count`. */
    maxFiles?: number;
    /** Allows picking and keeping more than one file. A single-file zone replaces its selection. */
    multiple?: boolean;
    disabled?: boolean;
    /** Submitted with forms through the real file input when set. */
    name?: string;
    /** Controlled selected files. */
    value?: File[];
    /** Uncontrolled initial files. */
    defaultValue?: File[];
    /** Called with the next file list after files are added or removed. */
    onFilesChange?: (files: File[]) => void;
    /** Called with every refused file and why; rejected files never enter the list. */
    onReject?: (rejections: FileUploadRejection[]) => void;
    /** Primary line override; defaults to the localized kit string. */
    label?: string;
    /** Supporting line override; defaults to the localized kit string. */
    hint?: string;
    /** Renders a placeholder with the dropzone geometry. */
    skeleton?: boolean;
    /** Uses the frosted glass material for the dropzone surface. */
    glass?: boolean;
    /** Id for the native file input; falls back to the surrounding Field id. */
    id?: string;
    'aria-label'?: string;
}
/**
 * A dropzone that chooses, validates, lists, and removes files - and nothing
 * more: it has no transport policy and never uploads anything. A visually
 * hidden native file input inside the zone carries keyboard access, the
 * screen-reader name, and form participation via `name`; drag-and-drop is a
 * progressive enhancement over it. Files failing `accept`, `maxSize`, or
 * `maxFiles` go to `onReject` and never enter the list.
 */
declare function FileUpload({ accept, maxSize, maxFiles, multiple, disabled, name, value, defaultValue, onFilesChange, onReject, label, hint, skeleton, glass, id, className, 'aria-label': ariaLabel, ...rest }: FileUploadProps): react.JSX.Element;

/**
 * Shared between the Field molecule (provider) and form-control atoms
 * (consumers), so atoms never import upward from molecules.
 */
interface FieldContextValue {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
}
/** Form controls read their id / aria wiring from the surrounding Field, if any. */
declare const useField: () => FieldContextValue | null;

type PhysicalSide = 'top' | 'bottom' | 'left' | 'right';
/**
 * Writing-direction relative sides: 'inline-end' resolves to 'right' in LTR
 * and 'left' in RTL (and 'inline-start' the opposite). Use these for surfaces
 * that should lead in the reading direction - e.g. submenu flyouts - and the
 * physical 'left'/'right' for surfaces that must stay put regardless of
 * direction. Resolution happens at measure time, so a live dir flip is picked
 * up on the next update.
 */
type Side = PhysicalSide | 'inline-start' | 'inline-end';
type Alignment = 'start' | 'center' | 'end';
type Placement = Side | `${Side}-${Alignment}`;

interface MenuProps {
    /** The element that toggles the menu. Its ref and click are wired up. */
    trigger: ReactElement;
    /** Where to place the menu relative to the trigger. */
    placement?: Placement;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Accessible label for the menu. */
    'aria-label'?: string;
    className?: string;
    children?: ReactNode;
}
/**
 * A dropdown list of actions anchored to a trigger. Built on the same anchored
 * overlay as Popover - it portals to the body, flips and clamps on screen, and
 * closes on outside press or Escape - but with menu semantics: a role="menu"
 * panel of role="menuitem" rows, arrow-key roving focus, and select-to-close.
 */
declare function Menu({ trigger, placement, open, defaultOpen, onOpenChange, className, children, ...rest }: MenuProps): react.JSX.Element;
interface ContextMenuProps extends Omit<ComponentProps<'div'>, 'content'> {
    /** The menu content - MenuItem, MenuSub, MenuSeparator, MenuLabel rows. */
    content: ReactNode;
    onOpenChange?: (open: boolean) => void;
    /** Accessible label for the menu panel. */
    'aria-label'?: string;
    /** Class for the portalled menu panel; className styles the target wrapper. */
    menuClassName?: string;
}
/**
 * A menu summoned at the pointer instead of a trigger. Wrap any content: a
 * right-click (contextmenu) or a touch long-press opens the same glass panel
 * Menu uses, anchored to the pointer coordinates via a zero-size virtual
 * anchor. Dismisses on Escape, outside press, or scrolling away; focus moves
 * into the panel on open and is restored on close.
 */
declare function ContextMenu({ content, onOpenChange, menuClassName, className, children, onContextMenu, onPointerDown, onPointerMove, onPointerUp, onPointerCancel, 'aria-label': ariaLabel, ...rest }: ContextMenuProps): react.JSX.Element;
interface MenuSubProps extends ComponentProps<'button'> {
    /** The row's label. */
    label: ReactNode;
    /** Leading glyph. */
    icon?: ReactNode;
    /** Dims the row and keeps the flyout shut. */
    disabled?: boolean;
    /** Class for the flyout panel; className styles the row. */
    menuClassName?: string;
    /** The flyout content - MenuItem rows, separators, or deeper MenuSubs. */
    children?: ReactNode;
}
/**
 * A flyout submenu row inside a Menu or ContextMenu. Renders like a MenuItem
 * with a trailing chevron; its child panel opens toward inline-end of the row
 * (right in LTR, left in RTL, flipping at the viewport edge) on hover with an
 * intent delay, or on the arrow key pointing into it - ArrowRight in LTR,
 * ArrowLeft in RTL per the APG - or Enter, which focuses the first child item.
 * The opposite arrow closes the flyout and returns focus to the row; Escape
 * closes the whole stack. Nests.
 */
declare function MenuSub({ label, icon, disabled, menuClassName, className, children, onClick, onKeyDown, onPointerEnter, onPointerLeave, ...rest }: MenuSubProps): react.JSX.Element;
interface MenuItemProps extends Omit<ComponentProps<'button'>, 'onSelect'> {
    /** Leading glyph. */
    icon?: ReactNode;
    /** Trailing shortcut hint, e.g. a Kbd or "⌘C". */
    shortcut?: ReactNode;
    /** Paints the row in the danger tone. */
    danger?: boolean;
    /** Called when the item is chosen; the menu then closes. */
    onSelect?: () => void;
}
/** A single action row inside a Menu. */
declare function MenuItem({ icon, shortcut, danger, onSelect, disabled, className, children, onClick, ...rest }: MenuItemProps): react.JSX.Element;
/** A divider between groups of items. */
declare function MenuSeparator({ className }: {
    className?: string;
}): react.JSX.Element;
/** A non-interactive section heading inside a Menu. */
declare function MenuLabel({ className, children }: {
    className?: string;
    children?: ReactNode;
}): react.JSX.Element;

interface SplitButtonProps extends Omit<ComponentProps<'span'>, 'children'> {
    /** Main-action label/content. */
    children: ReactNode;
    /** Fired by the main (start) segment. */
    onAction: () => void;
    /** MenuItem children for the built-in dropdown (end) segment. */
    menu: ReactNode;
    /** Accessible name for the dropdown segment. */
    menuLabel: string;
    variant?: ButtonVariant;
    size?: ControlSize;
    disabled?: boolean;
    loading?: boolean;
    fullWidth?: boolean;
    placement?: ComponentProps<typeof Menu>['placement'];
    className?: string;
}
/**
 * A button with a built-in secondary control: the start segment fires the
 * primary action, the end segment opens an attached menu of related actions.
 * Both segments are real Buttons, so every variant/size/token of the Button
 * contract applies unchanged; the pair reads as one control.
 */
declare function SplitButton({ children, onAction, menu, menuLabel, variant, size, disabled, loading, fullWidth, placement, className, ...rest }: SplitButtonProps): react.JSX.Element;

/**
 * @glacier/motion - the kit's micro-animation vocabulary as enums, backed by
 * framer-motion (the `motion` package) and the @glacier/tokens motion tokens.
 *
 * Usage:
 *   import { motion } from 'motion/react';
 *   import { Motion, Speed, Ease, motionProps } from '@glacier/motion';
 *
 *   <motion.div {...motionProps(Motion.ScaleIn, Speed.Fast)} />
 */

/** Physics spring presets for interruptible motion (thumbs, layout moves). */
declare enum Spring {
    Snappy = "snappy",
    Smooth = "smooth",
    Bouncy = "bouncy"
}

interface SegmentedOption {
    value: string;
    label: ReactNode;
    disabled?: boolean;
}
interface SegmentedControlProps extends ComponentProps<'div'> {
    options: SegmentedOption[];
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    size?: ControlSize;
    fullWidth?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Spring preset for the thumb. Defaults to Spring.Snappy. */
    spring?: Spring;
    disabled?: boolean;
    /** Accessible name for the group. */
    'aria-label'?: string;
    className?: string;
}
/**
 * A segmented toggle. The selected
 * thumb is a shared framer-motion layout element, so it springs between
 * segments instead of jumping. Arrow keys move the selection (native radio
 * behavior), and the thumb follows.
 */
declare function SegmentedControl({ options, value, defaultValue, onValueChange, size, fullWidth, skeleton, spring, disabled, className, 'aria-label': ariaLabel, ...rest }: SegmentedControlProps): react.JSX.Element;

/** Step numbers: 1 unit = 4px at the min viewport, 5px at the max. */
declare const SPACE_STEPS: readonly [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24];
type SpaceStep = (typeof SPACE_STEPS)[number];

/**
 * Density modes, switched by data-density on any ancestor (usually <html>).
 *
 * Two things move together: control heights, and a density scale that
 * multiplies the whole space scale. So every padding and gap built on
 * --glacier-space-* breathes with density while staying on one shared scale.
 *
 * Comfortable remains the default for backwards compatibility. The other
 * modes provide two tighter and two roomier stops around that baseline.
 */
type Density = 'extra-compact' | 'compact' | 'comfortable' | 'spacious' | 'more-space';

declare const densityModes: readonly ["extra-compact", "compact", "comfortable", "spacious", "more-space"];
type DensityMode = Density;
interface DensitySelectorProps extends Omit<ComponentProps<'div'>, 'children' | 'onChange'> {
    /** The active density token value. */
    value: DensityMode;
    /** Called when a density card is selected. */
    onValueChange: (value: DensityMode) => void;
    /** Optional label overrides keyed by density value. */
    labels?: Partial<Record<DensityMode, ReactNode>>;
    /** Disables every density option. */
    disabled?: boolean;
    /** Accessible name for the radio group. */
    'aria-label': string;
}
/** A scroll-safe visual density picker with radio-card keyboard interactions. */
declare function DensitySelector({ value, onValueChange, labels, disabled, className, 'aria-label': ariaLabel, ...rest }: DensitySelectorProps): react.JSX.Element;

/** Which axis the content overflows and scrolls along. */
type ScrollAreaOrientation = 'vertical' | 'horizontal';
type ScrollbarAppearanceName = (typeof scrollbarAppearances)[number];
interface ScrollAreaProps extends Omit<ComponentProps<'div'>, 'children'> {
    /**
     * Caps the viewport along the scroll axis: a CSS length or number of pixels.
     * For a vertical area this is a max-height; for a horizontal one, a max-width.
     */
    maxHeight?: number | string;
    /** Scroll axis. Vertical (the default) shows top/bottom fades; horizontal shows left/right. */
    orientation?: ScrollAreaOrientation;
    /** Visual treatment for the visible scrollbar. */
    scrollbarAppearance?: ScrollbarAppearanceName;
    /** Shows the half-opaque track behind the scrollbar thumb. */
    showScrollbarTrack?: boolean;
    /** Hides the scrollbar entirely; wheel, drag, keyboard, and touch scrolling all still work. */
    hideScrollbar?: boolean;
    /** The overflowing content. */
    children?: ReactNode;
}
/**
 * A styled overflow container. It caps its viewport along one axis, paints a
 * thin themed scrollbar, and fades the content at each edge only when there is
 * more to scroll in that direction. A scroll listener plus a ResizeObserver
 * keep the fade masks in sync as the content or viewport changes, so the top
 * fade appears once you scroll down and the bottom fade disappears at the end.
 * The viewport itself is focusable and keyboard-scrollable.
 */
declare function ScrollArea({ maxHeight, orientation, scrollbarAppearance, showScrollbarTrack, hideScrollbar, className, style, children, ...rest }: ScrollAreaProps): react.JSX.Element;

interface CarouselProps extends ComponentProps<'div'> {
    /** The card children laid out in a horizontal snap-scroll strip. */
    children?: ReactNode;
    /** Shows prev/next controls that appear when the strip overflows. */
    showControls?: boolean;
    /** Space between cards; any CSS length or a `var(--glacier-space-*)`. */
    gap?: string;
    /** Accessible label for the scrollable region. */
    'aria-label'?: string;
    className?: string;
}
/**
 * A horizontal snap-scroll strip that hosts arbitrary card children. It uses
 * CSS scroll-snap for tidy per-card stops, converts vertical wheel gestures to
 * horizontal scroll, and - when `showControls` is set - renders prev/next
 * IconButtons that appear only while the strip overflows, disabling at each end.
 */
declare function Carousel({ children, showControls, gap, className, style, 'aria-label': ariaLabel, ...rest }: CarouselProps): react.JSX.Element;

interface ComboboxOption {
    /** Unique submitted value. */
    value: string;
    /** Content rendered in the input and result row. */
    label: ReactNode;
    /** Plain-text filtering value when label is not a string. */
    textValue?: string;
    /** Optional muted supporting content below the label. */
    description?: ReactNode;
    disabled?: boolean;
}
interface ComboboxProps extends Omit<ComponentProps<'div'>, 'onChange'> {
    options: ComboboxOption[];
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    inputValue?: string;
    defaultInputValue?: string;
    onInputValueChange?: (value: string) => void;
    filter?: (option: ComboboxOption, inputValue: string) => boolean;
    placeholder?: string;
    emptyState?: ReactNode;
    loading?: boolean;
    size?: ControlSize;
    fullWidth?: boolean;
    disabled?: boolean;
    skeleton?: boolean;
    glass?: boolean;
    name?: string;
    id?: string;
    'aria-label'?: string;
    className?: string;
}
/**
 * An editable combobox with a portaled listbox. It keeps focus on the native
 * input and exposes the active option through aria-activedescendant, so normal
 * text editing and list navigation remain available together.
 */
declare function Combobox({ options, value, defaultValue, onValueChange, inputValue, defaultInputValue, onInputValueChange, filter, placeholder, emptyState, loading, size, fullWidth, disabled, skeleton, glass, name, id, className, 'aria-label': ariaLabel, ...rest }: ComboboxProps): react.JSX.Element;

interface MultiSelectOption {
    /** Unique submitted value. */
    value: string;
    /** Content rendered in a tag and option row. */
    label: ReactNode;
    /** Plain-text filtering value when label is not a string. */
    textValue?: string;
    /** Optional muted supporting content below the label. */
    description?: ReactNode;
    disabled?: boolean;
}
interface MultiSelectProps extends Omit<ComponentProps<'div'>, 'onChange'> {
    options: MultiSelectOption[];
    value?: string[];
    defaultValue?: string[];
    onValueChange?: (value: string[]) => void;
    inputValue?: string;
    defaultInputValue?: string;
    onInputValueChange?: (value: string) => void;
    filter?: (option: MultiSelectOption, inputValue: string) => boolean;
    placeholder?: string;
    emptyState?: ReactNode;
    loading?: boolean;
    size?: ControlSize;
    fullWidth?: boolean;
    disabled?: boolean;
    skeleton?: boolean;
    glass?: boolean;
    /** Renders one hidden form input per selected value when set. */
    name?: string;
    id?: string;
    'aria-label'?: string;
    className?: string;
}
/**
 * An editable multi-value combobox. It keeps focus on the native input,
 * exposes active suggestions with aria-activedescendant, and submits repeated
 * hidden form inputs so a normal form can retain each selected value.
 */
declare function MultiSelect({ options, value, defaultValue, onValueChange, inputValue, defaultInputValue, onInputValueChange, filter, placeholder, emptyState, loading, size, fullWidth, disabled, skeleton, glass, name, id, className, 'aria-label': ariaLabel, ...rest }: MultiSelectProps): react.JSX.Element;

type ListSize = 'sm' | 'md';
interface ListProps extends ComponentProps<'ul'> {
    size?: ListSize;
    /** Draws separators between direct ListItem children. */
    divided?: boolean;
}
interface ListItemProps extends Omit<ComponentProps<'li'>, 'onClick' | 'title'> {
    title: ReactNode;
    description?: ReactNode;
    leading?: ReactNode;
    trailing?: ReactNode;
    selected?: boolean;
    disabled?: boolean;
    href?: string;
    onClick?: MouseEventHandler<HTMLButtonElement>;
}
/** A semantic list container that gives direct ListItem children shared row metrics. */
declare function List({ size, divided, className, ...rest }: ListProps): react.JSX.Element;
/** A semantic list row with optional leading, supporting, and trailing content. */
declare function ListItem({ title, description, leading, trailing, selected, disabled, href, onClick, className, ...rest }: ListItemProps): react.JSX.Element;

/** A single dated value, e.g. one day of contribution counts. */
interface HeatmapPoint {
    /** ISO-ish date or any string key; surfaced in the cell title. */
    date: string;
    /** The magnitude for this cell. */
    value: number;
}
/**
 * The grid data: a 2D array of numbers (rows of values), or a flat list of
 * `{ date, value }` points laid out left-to-right, top-to-bottom into columns.
 */
type HeatmapData = number[][] | HeatmapPoint[];
interface HeatmapProps extends ComponentProps<'div'> {
    /** Values to plot: a 2D `number[][]` grid or a flat `{ date, value }[]` list. */
    data: HeatmapData;
    /** Number of intensity steps (including the empty step 0). Defaults to 5. */
    levels?: number;
    /** Show a less→more legend under the grid. Defaults to false. */
    legend?: boolean;
    /** Cells per column when `data` is a flat list. Defaults to 7 (a week). */
    rows?: number;
    /** Renders a placeholder grid of square skeletons with the exact geometry. */
    skeleton?: boolean;
    /** Columns the skeleton grid renders while there is no data. Rows follow `rows`. */
    skeletonColumns?: number;
    /** Accessible name for the grid. */
    'aria-label'?: string;
    className?: string;
}
/**
 * A GitHub-contribution-style intensity grid. Values - a 2D array or a flat
 * list of `{ date, value }` - are bucketed onto an accent ramp: level 0 reads
 * as an empty track, higher levels step up in accent saturation. Each cell
 * carries a title so its value is legible to pointer and screen-reader users,
 * and an optional legend spells out the less→more scale.
 */
declare function Heatmap({ data, levels, legend, rows, skeleton, skeletonColumns, className, 'aria-label': label, ...rest }: HeatmapProps): react.JSX.Element;
declare namespace Heatmap {
    var displayName: string;
}

interface BreadcrumbItem {
    label: ReactNode;
    href?: string;
    current?: boolean;
}
interface BreadcrumbsProps extends Omit<ComponentProps<'nav'>, 'children'> {
    items: BreadcrumbItem[];
    separator?: ReactNode;
}
declare function Breadcrumbs({ items, separator, className, ...rest }: BreadcrumbsProps): react.JSX.Element;

interface PaginationProps extends Omit<ComponentProps<'nav'>, 'children'> {
    page: number;
    total: number;
    pageSize?: number;
    onPageChange: (page: number) => void;
    siblingCount?: number;
    boundaryCount?: number;
}
declare function Pagination({ page, total, pageSize, onPageChange, siblingCount, boundaryCount, className, ...rest }: PaginationProps): react.JSX.Element;

interface AccordionItem {
    id: string;
    title: ReactNode;
    content: ReactNode;
    disabled?: boolean;
}
interface AccordionProps extends Omit<ComponentProps<'div'>, 'children'> {
    items: AccordionItem[];
    defaultOpen?: string | string[];
    allowMultiple?: boolean;
}
declare function Accordion({ items, defaultOpen, allowMultiple, className, ...rest }: AccordionProps): react.JSX.Element;

interface SpotlightProps {
    /** Whether the tour step is shown. */
    open: boolean;
    /** The element to highlight; the cutout and callout are positioned against it. */
    targetRef: RefObject<HTMLElement | null>;
    /** Step heading. */
    title?: ReactNode;
    /** Step body copy. */
    description?: ReactNode;
    /** Where to place the callout relative to the target before flipping and clamping. */
    placement?: Placement;
    /** Padding around the target inside the cutout, in pixels. */
    cutoutPadding?: number;
    /** 1-based index of this step. */
    step?: number;
    /** Total number of steps in the tour. */
    total?: number;
    /** Advances to the next step; the Next button is hidden when omitted. */
    onNext?: () => void;
    /** Returns to the previous step; the Back button is hidden when omitted. */
    onBack?: () => void;
    /** Dismisses the tour, via the close button, Escape, or a backdrop press. */
    onClose: () => void;
    className?: string;
}
/**
 * A guided-tour step. A dimmed, full-screen backdrop with a highlighted cutout
 * punched around a target element, plus a callout - anchored to the target with
 * the shared overlay engine - carrying a title, body, step count, and
 * Back / Next / Close controls. The callout is a role="dialog" that traps focus,
 * closes on Escape or a backdrop press, and tracks the target on scroll and
 * resize so the cutout stays glued to it.
 */
declare function Spotlight({ open, targetRef, title, description, placement, cutoutPadding, step, total, onNext, onBack, onClose, className, }: SpotlightProps): react.ReactPortal | null;

interface SelectOption {
    value: string;
    label: ReactNode;
    disabled?: boolean;
}
interface SelectProps extends ComponentProps<'div'> {
    options: SelectOption[];
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    placeholder?: string;
    size?: ControlSize;
    fullWidth?: boolean;
    disabled?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Renders the frosted glass material on the trigger instead of a solid surface. */
    glass?: boolean;
    /** Submitted with forms via a hidden input when set. */
    name?: string;
    id?: string;
    'aria-label'?: string;
    className?: string;
}
/**
 * A styled replacement for the native select: an Input-metric trigger and a
 * glass listbox that animates open. The menu portals to document.body with
 * fixed positioning, so it escapes overflow-clipping ancestors and stacking
 * contexts (glass panels, modals, scroll areas). Follows the WAI-ARIA listbox
 * pattern with aria-activedescendant; arrow keys navigate, Enter selects,
 * Escape closes.
 */
declare function Select({ options, value, defaultValue, onValueChange, placeholder, size, fullWidth, disabled, skeleton, glass, name, id, className, 'aria-label': ariaLabel, ...rest }: SelectProps): react.JSX.Element;

interface TabItem {
    value: string;
    label: ReactNode;
    content: ReactNode;
    disabled?: boolean;
}
interface TabsProps extends ComponentProps<'div'> {
    tabs: TabItem[];
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
    /** Spring preset for the underline indicator. Defaults to Spring.Snappy. */
    spring?: Spring;
    /** Stretches the tabs to fill the list width. */
    fullWidth?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** Accessible name for the tab list. */
    'aria-label'?: string;
    className?: string;
}
/**
 * A tab menu following the WAI-ARIA tabs pattern with automatic activation:
 * the underline indicator is a shared framer-motion layout element, so it
 * springs between tabs the same way the SegmentedControl thumb does. Arrow
 * keys move and activate (wrapping, skipping disabled tabs), Home and End
 * jump to the extremes.
 */
declare function Tabs({ tabs, value, defaultValue, onValueChange, spring, fullWidth, skeleton, className, 'aria-label': ariaLabel, ...rest }: TabsProps): react.JSX.Element;

interface TooltipProps {
    /** The bubble content: a short label, shortcut, or hint. */
    content: ReactNode;
    /** The element the tooltip describes. Its ref and event handlers are wired up. */
    children: ReactElement;
    /** Where to place the bubble relative to the trigger before flipping and clamping. */
    placement?: Placement;
    /** Milliseconds of hover intent before the bubble opens. Focus opens instantly. */
    delay?: number;
    /** Suppresses the tooltip entirely; the trigger renders untouched. */
    disabled?: boolean;
    /** Renders a placeholder with the exact geometry. */
    skeleton?: boolean;
    className?: string;
}
/**
 * A hover and focus tooltip. The bubble portals to document.body so it escapes
 * overflow-clipping ancestors and stacking contexts, then flips and clamps to
 * stay on screen. It opens on hover intent after a short delay or immediately
 * on focus, and hides on leave, blur, or Escape. The bubble is non-interactive
 * (pointer-events: none) so it can never trap the cursor, and the trigger is
 * linked to it with aria-describedby.
 */
declare function Tooltip({ content, children, placement, delay, disabled, skeleton, className, }: TooltipProps): react.JSX.Element;

type ToastTone = (typeof toastTones)[number];
interface ToastProps {
    tone?: ToastTone;
    /** The notification content. */
    message: ReactNode;
    /** Optional leading glyph. */
    icon?: ReactNode;
    /** Whether a trailing close control is shown. */
    dismissible?: boolean;
    /** Called when the pill or its dismiss control is pressed. */
    onDismiss?: () => void;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    className?: string;
}
/**
 * The visual toast pill. Rendered on its own it is a static notification;
 * the ToastProvider wraps it in motion and a portal. A danger toast announces
 * as an alert, other tones as a status.
 */
declare function Toast({ tone, message, icon, dismissible, onDismiss, glass, skeleton, className, }: ToastProps): react.JSX.Element;
interface ToastOptions {
    tone?: ToastTone;
    message: ReactNode;
    icon?: ReactNode;
    /** Auto-dismiss delay in milliseconds; defaults by tone, 0 disables auto-dismiss. */
    duration?: number;
    /** Whether a trailing close control is shown. */
    dismissible?: boolean;
    /** Renders the frosted glass material instead of a solid surface. */
    glass?: boolean;
}
interface ToastContextValue {
    /** Show a toast, replacing any current one (latest wins, no queue). */
    toast: (options: ToastOptions) => void;
    /** Dismiss the current toast, if any. */
    dismiss: () => void;
}
/**
 * Holds the single current toast, portals it to the bottom center of
 * document.body, and runs the auto-dismiss timer. A new toast replaces the
 * current one immediately: this is a deliberate latest-wins, no-queue design.
 */
declare function ToastProvider({ children }: {
    children: ReactNode;
}): react.JSX.Element;
/**
 * Returns the imperative toast controls. Must be called under a ToastProvider.
 * `toast({ tone, message, icon?, duration?, dismissible? })` replaces the
 * current toast; `dismiss()` clears it.
 */
declare function useToast(): ToastContextValue;

/** A value that can vary by breakpoint. Scalars apply at every width. */
type Responsive<T> = T | Partial<Record<'base' | 'sm' | 'md' | 'lg' | 'xl', T>>;
type Background = 'transparent' | 'bg' | 'surface' | 'surfaceRaised' | 'surfaceSunken' | 'accent' | 'accentSoft' | 'glass';
type RadiusToken = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
type BorderToken = boolean | 'subtle' | 'strong' | 'accent';
type ElevationToken = 0 | 1 | 2 | 3 | 4 | 5;
type ContainerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'prose' | 'full';
type WidthToken = 'auto' | 'full' | 'fit';
type HeightToken = 'auto' | 'full' | 'screen';
type Align = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
type Justify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
/**
 * The shared style surface every layout primitive accepts. All values are
 * scale keys, never raw lengths, so nothing can land off the system.
 */
interface BoxStyleProps {
    /** Padding on all sides, from the space scale. */
    padding?: Responsive<SpaceStep>;
    paddingX?: Responsive<SpaceStep>;
    paddingY?: Responsive<SpaceStep>;
    paddingTop?: SpaceStep;
    paddingRight?: SpaceStep;
    paddingBottom?: SpaceStep;
    paddingLeft?: SpaceStep;
    background?: Background;
    radius?: RadiusToken;
    border?: BorderToken;
    elevation?: ElevationToken;
    width?: WidthToken;
    maxWidth?: ContainerSize;
    height?: HeightToken;
    /** Grow to fill the main axis of a parent Row or Stack. */
    grow?: boolean;
    /** Allow shrinking below content size. Layout primitives shrink by default. */
    shrink?: boolean;
    alignSelf?: Align;
}
interface FlowProps {
    /** Space between children, from the space scale. */
    gap?: Responsive<SpaceStep>;
    /** Cross-axis alignment. */
    align?: Align;
    /** Main-axis distribution. */
    justify?: Justify;
}

interface BoxProps extends BoxStyleProps, Omit<ComponentProps<'div'>, 'color'> {
    /** Rendered element. Defaults to a div. */
    as?: ElementType;
    children?: ReactNode;
}
/**
 * The base layout primitive: a block with token-locked padding, surface, and
 * sizing. Compose it, or reach for Stack, Row, and Grid for flow. min-width is
 * zero so it never overflows a flex or grid parent.
 */
declare function Box({ as, className, style, children, ...props }: BoxProps): react.JSX.Element;

interface StackProps extends BoxStyleProps, FlowProps, Omit<ComponentProps<'div'>, 'color'> {
    as?: ElementType;
    children?: ReactNode;
}
/**
 * A vertical flow. Children stack with a token gap and no margins, so the
 * rhythm is always even. Defaults to gap 4 and stretched children.
 */
declare function Stack({ as, gap, align, justify, className, style, children, ...props }: StackProps): react.JSX.Element;

interface RowProps extends BoxStyleProps, FlowProps, Omit<ComponentProps<'div'>, 'color'> {
    as?: ElementType;
    /** Wrap onto new lines when the row runs out of width. */
    wrap?: boolean;
    children?: ReactNode;
}
/**
 * A horizontal flow. Children sit in a row with a token gap, centered on the
 * cross axis by default. Set wrap to let them flow onto new lines.
 */
declare function Row({ as, gap, align, justify, wrap, className, style, children, ...props }: RowProps): react.JSX.Element;

interface GridProps extends BoxStyleProps, Omit<ComponentProps<'div'>, 'color'> {
    as?: ElementType;
    gap?: Responsive<SpaceStep>;
    /** Fixed column count, optionally per breakpoint. Ignored when minChildWidth is set. */
    columns?: Responsive<number>;
    /** Auto-fit as many equal columns as fit at this minimum child width. */
    minChildWidth?: string;
    align?: Align;
    justify?: Justify;
    children?: ReactNode;
}
/**
 * A grid. Give it a fixed column count (responsive), or a minChildWidth to
 * auto-fit as many equal tracks as fit, which reflows with no media queries.
 * Children never overflow, since each track floors at zero.
 */
declare function Grid({ as, gap, columns, minChildWidth, align, justify, className, style, children, ...props }: GridProps): react.JSX.Element;

interface CenterProps extends BoxStyleProps, Omit<ComponentProps<'div'>, 'color'> {
    as?: ElementType;
    children?: ReactNode;
}
/**
 * Centers its children on both axes. Pair with height="screen" for a
 * full-viewport centered layout, or a fixed height for a panel.
 */
declare function Center({ as, className, style, children, ...props }: CenterProps): react.JSX.Element;

interface SpacerProps {
    className?: string;
}
/**
 * A flexible gap that pushes siblings apart inside a Row or Stack. Drop one
 * between two groups to send them to opposite ends without margins.
 */
declare function Spacer({ className }: SpacerProps): react.JSX.Element;

interface ContainerProps extends Omit<BoxStyleProps, 'maxWidth' | 'width'>, Omit<ComponentProps<'div'>, 'color'> {
    as?: ElementType;
    /** Max content width. Defaults to lg. */
    size?: ContainerSize;
    children?: ReactNode;
}
/**
 * A centered, width-capped column with comfortable responsive gutters. Wrap a
 * page in one so content never runs edge to edge on wide screens.
 */
declare function Container({ as, size, className, style, children, ...props }: ContainerProps): react.JSX.Element;

/** grid wraps cards on auto-fill columns; list stacks them in one column. */
type CardGroupMode = (typeof cardGroupModes)[number];
/** The token-driven gap steps between cards. */
type CardGroupGap = (typeof cardGroupGaps)[number];
/** compact tightens the chosen gap one space step. */
type CardGroupDensity = (typeof cardGroupDensities)[number];
interface CardGroupProps extends ComponentProps<'div'> {
    /**
     * Layout mode. grid lays cards on repeat(auto-fill, minmax(...)) columns
     * that keep a stable minimum width and wrap responsively; list stacks them
     * in a single column.
     */
    mode?: CardGroupMode;
    /**
     * The minimum card width in grid mode, e.g. '16rem'. Feeds the
     * --card-group-min custom property; ignored in list mode.
     */
    minItemWidth?: string;
    /** Space between cards, from the token scale. */
    gap?: CardGroupGap;
    /** compact tightens the chosen gap one space step. */
    density?: CardGroupDensity;
    /** Renders placeholder cards so the grid geometry holds while loading. */
    skeleton?: boolean;
    /** How many placeholder cards the skeleton renders. */
    skeletonCount?: number;
    /** The cards, or any repeated surfaces. */
    children?: ReactNode;
}
/**
 * A layout shelf for repeated surfaces such as Cards and StatTiles. In grid
 * mode it lays children on auto-fill columns floored at `minItemWidth` (and
 * clamped to the container, so a card never overflows a narrow parent); in
 * list mode it stacks them in a single column. Purely visual: it renders a
 * plain div with no role, so add list semantics on top when the content is
 * semantically a list.
 */
declare function CardGroup({ mode, minItemWidth, gap, density, skeleton, skeletonCount, className, style, children, ...rest }: CardGroupProps): react.JSX.Element;

interface SidebarProps extends Omit<ComponentProps<'div'>, 'title'> {
    /** Pinned region at the top, for a brand or a search field. */
    header?: ReactNode;
    /** Pinned region at the bottom, for a profile or settings link. */
    footer?: ReactNode;
    /** Spring preset for the active pill as it slides between items. */
    spring?: Spring;
    children?: ReactNode;
}
/**
 * The bones of a side navigation: an optional pinned header, a scrollable body
 * of sections, and an optional pinned footer. Drop it into AppShell's sidebar
 * slot and fill it with SidebarSection and SidebarItem. The active pill slides
 * between items with the chosen spring.
 */
declare function Sidebar({ header, footer, spring, className, children, ...rest }: SidebarProps): react.JSX.Element;
interface SidebarSectionProps extends Omit<ComponentProps<'div'>, 'title'> {
    /** Optional uppercase group heading. */
    title?: ReactNode;
    children?: ReactNode;
}
/** A titled group of sidebar items. */
declare function SidebarSection({ title, className, children, ...rest }: SidebarSectionProps): react.JSX.Element;
interface SidebarItemProps extends Omit<ComponentProps<'button'>, 'title'> {
    /** Rendered element. Use 'a' for links. Defaults to a button. */
    as?: ElementType;
    /** Anchor href when rendered as a link. */
    href?: string;
    target?: string;
    rel?: string;
    icon?: ReactNode;
    /** Highlights the item as the current location. */
    active?: boolean;
    /** Trailing content such as a CounterBadge. */
    trailing?: ReactNode;
    children?: ReactNode;
}
/** A navigation row: icon, label, and an optional trailing slot. */
declare function SidebarItem({ as, icon, active, trailing, disabled, className, children, ...rest }: SidebarItemProps): react.JSX.Element;

interface ToolbarProps extends ComponentProps<'div'> {
    /** Content pinned to the start, such as a menu button or a title. */
    start?: ReactNode;
    /** Content pinned to the end, such as actions. */
    end?: ReactNode;
    /** Stick to the top of the scroll container. */
    sticky?: boolean;
    /** Add a bottom hairline. */
    border?: boolean;
    /** Add the translucent glass background, for app and page headers. */
    surface?: boolean;
    children?: ReactNode;
}
/**
 * A horizontal bar with start and end slots and a flexible middle. Use it for
 * app headers, page toolbars, and card headers. The middle grows, so the end
 * slot always hugs the trailing edge without a margin.
 */
declare function Toolbar({ start, end, sticky, border, surface, className, children, ...rest }: ToolbarProps): react.JSX.Element;

interface TitleBarProps extends Omit<ComponentProps<'header'>, 'title'> {
    /** One-line centered title, small and muted. It truncates instead of wrapping. */
    title?: ReactNode;
    /** Content pinned to the start, after the traffic-light gutter. Stays clickable. */
    start?: ReactNode;
    /** Content pinned to the end, such as window-level actions. Stays clickable. */
    end?: ReactNode;
    /**
     * Reserve an 88px inline-start gutter for the macOS close, minimize, and
     * zoom buttons that a titleBarStyle Overlay window paints over the bar.
     */
    trafficLightInset?: boolean;
    /** The translucent glass background with backdrop blur, like the app header. */
    surface?: boolean;
    /** A bottom hairline separating the bar from the window content. */
    border?: boolean;
    /** Renders a placeholder with the bar's exact geometry. */
    skeleton?: boolean;
    /** Extra centered content beside the title, such as a search field. */
    children?: ReactNode;
}
/**
 * The desktop window bar for Tauri and Electron shells: the fixed-height strip
 * at the very top of the window. It owns window dragging, centers a one-line
 * title (plus any children, such as a search field), and can reserve the
 * gutter where macOS paints its window controls.
 *
 * data-tauri-drag-region is a plain string attribute: Tauri starts a window
 * drag on mousedown when the pressed element itself carries it, and the
 * attribute is inert everywhere else (Electron, the browser). Only the bar
 * root and the title get it; interactive slot children do not, so their
 * buttons keep receiving clicks. -webkit-app-region is intentionally not
 * used, since the kit targets Tauri's attribute model.
 */
declare function TitleBar({ title, start, end, trafficLightInset, surface, border, skeleton, role, className, children, ...rest }: TitleBarProps): react.JSX.Element;

type SectionGap = 'sm' | 'md' | 'lg';
type SectionDensity = 'comfortable' | 'compact';
type SectionHeadingLevel = 2 | 3;
interface SectionProps extends Omit<ComponentProps<'section'>, 'title'> {
    /** Section heading; when present its generated id labels the section through aria-labelledby. */
    title?: ReactNode;
    /** Muted supporting line under the title. */
    description?: ReactNode;
    /** End-aligned content on the heading row, such as actions. */
    actions?: ReactNode;
    /** Semantic heading level for the title. */
    headingLevel?: SectionHeadingLevel;
    /** Vertical rhythm between the header block and the content. */
    gap?: SectionGap;
    /** Draw a hairline top rule so stacked sections separate cleanly. */
    divider?: boolean;
    /** Section rhythm; compact trims every gap one step down the scale. */
    density?: SectionDensity;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** The section content. */
    children?: ReactNode;
}
/**
 * A titled page region: a heading row with an optional description and
 * end-aligned actions, a token-driven rhythm gap before the content, and an
 * optional hairline divider for stacking sections down a page. With a title
 * the section is a labelled landmark region; without one it renders a plain
 * section, so pass aria-label when an untitled section should still be a
 * named region.
 */
declare function Section({ title, description, actions, headingLevel, gap, divider, density, skeleton, className, children, ...rest }: SectionProps): react.JSX.Element;

/** One row of the overflow menu behind the ellipsis button. */
interface PageHeaderAction {
    /** Stable identity for the row. */
    id: string;
    /** The row's label. */
    label: ReactNode;
    /** Called when the row is chosen; the menu then closes. */
    onSelect?: () => void;
    /** Dims the row and ignores selection. */
    disabled?: boolean;
}
interface PageHeaderProps extends Omit<ComponentProps<'header'>, 'title'> {
    /** The page title, rendered as an h1 or h2 per headingLevel. */
    title: ReactNode;
    /** Muted supporting copy under the title. */
    description?: ReactNode;
    /** Slot above the title; compose the kit Breadcrumbs. */
    breadcrumbs?: ReactNode;
    /** Inline metadata row under the title and description: pills, status dots, counts. */
    meta?: ReactNode;
    /** Primary actions, end-aligned on wide layouts. */
    actions?: ReactNode;
    /**
     * Secondary actions collected into an overflow Menu behind a localized
     * ellipsis button. The button is omitted entirely when the list is empty.
     */
    secondaryActions?: PageHeaderAction[];
    /** The heading element used for the title. */
    headingLevel?: 1 | 2;
    /** Compact trims the vertical padding and stack gap for dense screens. */
    density?: 'comfortable' | 'compact';
    /** Renders a placeholder with the header's exact geometry. */
    skeleton?: boolean;
}
/**
 * The page masthead: breadcrumbs over an h1/h2 title with a muted description
 * and an inline metadata row, primary actions end-aligned, and an overflow
 * menu of secondary actions behind an ellipsis button. The title block and
 * the actions share one wrapping flex row, so on narrow widths the actions
 * drop below the title without overlap and without any JS measurement.
 */
declare function PageHeader({ title, description, breadcrumbs, meta, actions, secondaryActions, headingLevel, density, skeleton, className, ...rest }: PageHeaderProps): react.JSX.Element;

type NavBarOrientation = (typeof navBarOrientations)[number];
interface NavBarProps extends ComponentProps<'nav'> {
    /** Horizontal row for a top nav or bottom tab bar; vertical for a slim icon rail. */
    orientation?: NavBarOrientation;
    /** Required: apps often carry more than one nav landmark, and the label tells them apart. */
    'aria-label': string;
    /** Pinned to the far end (bottom when vertical, trailing edge when horizontal), for a settings item. */
    end?: ReactNode;
    /** Show item labels beside icons in horizontal orientation. Defaults to icon-only. */
    showLabels?: boolean;
    /** Spring preset for the active pill as it slides between items. */
    spring?: Spring;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    children?: ReactNode;
}
/**
 * An app-level primary navigation bar. It renders icon-only destinations with
 * accessible labels and tooltips by default; showLabels adds visible text to
 * horizontal items. Fill it with NavBarItem and
 * pin a settings item in the end slot. The active pill slides between items
 * with the chosen spring.
 */
declare function NavBar({ orientation, end, showLabels, spring, skeleton, className, children, 'aria-label': ariaLabel, ...rest }: NavBarProps): react.JSX.Element;
interface NavBarItemProps extends Omit<ComponentProps<'button'>, 'children'> {
    /** Rendered element. Use 'a' for links. Defaults to a button. */
    as?: ElementType;
    /** Anchor href when rendered as a link. */
    href?: string;
    target?: string;
    rel?: string;
    /** Required leading glyph, hidden from assistive tech. */
    icon: ReactNode;
    /**
    * Required accessible label. It appears in a tooltip by default and becomes
    * visible text when a horizontal NavBar enables showLabels.
     */
    label: string;
    /** Highlights the item as the current location. */
    active?: boolean;
    /** Optional count shown as a CounterBadge: pinned to the icon corner in vertical, inline in horizontal. */
    badge?: number;
}
/**
 * One destination in a NavBar: an icon with an accessible label, an optional
 * count badge, and the sliding active pill. Icon-only items expose the label
 * through aria-label and a tooltip.
 */
declare function NavBarItem({ as, icon, label, active, badge, disabled, className, ...rest }: NavBarItemProps): react.JSX.Element;

interface ModalProps {
    open: boolean;
    /** Called when the user dismisses via Escape, the close button, or the overlay. */
    onClose: () => void;
    title?: ReactNode;
    description?: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    footer?: ReactNode;
    children?: ReactNode;
}
/**
 * A glass dialog rendered in a portal. Springs open, closes instantly.
 * Locks body scroll, traps Tab focus inside the panel, closes on Escape and
 * overlay press, and restores focus to the opener on close.
 */
declare function Modal({ open, onClose, title, description, size, footer, children }: ModalProps): react.ReactPortal | null;

type DrawerSide = (typeof drawerSides)[number];
type DrawerSize = (typeof drawerSizes)[number];
interface DrawerProps extends Omit<ComponentProps<typeof motion.div>, 'title'> {
    open: boolean;
    onClose: () => void;
    title?: ReactNode;
    description?: ReactNode;
    side?: DrawerSide;
    size?: DrawerSize;
    /**
     * Detach the sheet into a floating card with a gutter on every edge and all
     * corners rounded. Defaults to following the host's layout mode: a root
     * data-layout='floating' attribute floats every drawer; omit it (or set
     * 'full') for flush, edge-to-edge sheets. The prop forces the mode per
     * drawer either way.
     */
    floating?: boolean;
    footer?: ReactNode;
    dismissible?: boolean;
    children?: ReactNode;
}
/** A modal sheet that enters from a viewport edge and shares dialog focus behavior with Modal. */
declare function Drawer({ open, onClose, title, description, side, size, floating, footer, dismissible, children, className, ...rest }: DrawerProps): react.ReactPortal | null;

type AlertDialogTone = (typeof alertDialogTones)[number];
interface AlertDialogProps extends Omit<ComponentProps<typeof motion.div>, 'title'> {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    description?: ReactNode;
    actionLabel: ReactNode;
    onAction: () => void;
    cancelLabel?: ReactNode;
    tone?: AlertDialogTone;
    actionDisabled?: boolean;
    actionLoading?: boolean;
    /** Allows Escape and backdrop dismissal. Defaults to false for deliberate confirmation flows. */
    dismissible?: boolean;
    children?: ReactNode;
}
/** A confirmation dialog that focuses its least destructive action first. */
declare function AlertDialog({ open, onClose, title, description, actionLabel, onAction, cancelLabel, tone, actionDisabled, actionLoading, dismissible, children, className, ...rest }: AlertDialogProps): react.ReactPortal | null;

interface AppShellProps extends ComponentProps<'div'> {
    /** The persistent side navigation. */
    sidebar: ReactNode;
    /** Optional top bar content, placed to the right of the mobile menu button. */
    header?: ReactNode;
    /** Optional primary navigation pinned below mobile content and at the bottom of the desktop sidebar. */
    bottomNav?: ReactNode;
    /** Sidebar width on desktop. Defaults to 16rem. */
    sidebarWidth?: string;
    /** Accessible name for the sidebar landmark. */
    sidebarLabel?: string;
    /** Detach the desktop sidebar into a floating, rounded card with a gutter. */
    floating?: boolean;
    /** Force the mobile or desktop layout. When omitted, follows the lg viewport breakpoint. */
    isMobile?: boolean;
    /** Let the user drag the divider (or arrow-key it) to resize the sidebar. */
    resizable?: boolean;
    /** Called with the next sidebar width (a px string) while resizing. */
    onSidebarWidthChange?: (width: string) => void;
    /** Clamp for the resize drag, in pixels. */
    minSidebarWidth?: number;
    maxSidebarWidth?: number;
    children?: ReactNode;
}
/**
 * The app frame: a sticky sidebar next to a scrollable main column with an
 * optional sticky header. Below the lg breakpoint the sidebar collapses into
 * an off-canvas drawer with a built-in menu button and backdrop. Escape, the
 * backdrop, and any link or button tap inside the sidebar close the drawer.
 */
declare function AppShell({ sidebar, header, bottomNav, sidebarWidth, sidebarLabel, floating, isMobile, resizable, onSidebarWidthChange, minSidebarWidth, maxSidebarWidth, children, style, ...rest }: AppShellProps): react.JSX.Element;

interface PopoverProps {
    /** The element that toggles the popover. Its ref and click are wired up. */
    trigger: ReactElement;
    /** Where to place the panel relative to the trigger. */
    placement?: Placement;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Accessible label for the panel when it has no heading. */
    'aria-label'?: string;
    className?: string;
    children?: ReactNode;
}
/**
 * A floating panel anchored to a trigger. The panel portals to the body so it
 * escapes overflow-clipping ancestors, flips and clamps to stay on screen, and
 * closes on outside press and Escape. This is the anchored-overlay bone that
 * menus, pickers, and rich tooltips build on.
 */
declare function Popover({ trigger, placement, open, defaultOpen, onOpenChange, className, children, ...rest }: PopoverProps): react.JSX.Element;

interface TreeItem {
    id: string;
    label: ReactNode;
    /** Leading glyph, hidden from assistive tech. */
    icon?: ReactNode;
    /** Trailing content such as a CounterBadge or Pill. */
    trailing?: ReactNode;
    /** Skipped by arrow navigation and unselectable. */
    disabled?: boolean;
    /** Child items; their presence makes the row an expandable parent. */
    children?: TreeItem[];
}
interface TreeViewProps extends Omit<ComponentProps<'ul'>, 'onSelect'> {
    items: TreeItem[];
    /** Controlled list of expanded parent ids. */
    expandedIds?: string[];
    /** Initially expanded parent ids when uncontrolled. */
    defaultExpandedIds?: string[];
    onExpandedChange?: (expandedIds: string[]) => void;
    /** Controlled selected row id (single-select). */
    selectedId?: string;
    /** Initially selected row id when uncontrolled. */
    defaultSelectedId?: string;
    onSelect?: (id: string) => void;
    /** Accessible name for the tree. Required: a tree without a name is a maze. */
    'aria-label': string;
    /** Renders the frosted glass material behind the tree. */
    glass?: boolean;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
}
/**
 * A hierarchical list of expandable rows following the WAI-ARIA tree pattern:
 * a role="tree" of nested role="treeitem" rows with role="group" branches,
 * one roving tabindex across the visible rows. Arrow keys walk the visible
 * rows (Down/Up), expand or descend (Right), collapse or ascend (Left);
 * Home and End jump to the extremes; Enter and Space select, also toggling
 * parent rows. Branches animate open and closed, and the selected row wears
 * the accent soft tint like an active SidebarItem.
 */
declare function TreeView({ items, expandedIds, defaultExpandedIds, onExpandedChange, selectedId, defaultSelectedId, onSelect, glass, skeleton, className, 'aria-label': ariaLabel, ...rest }: TreeViewProps): react.JSX.Element;

interface Point {
    x: number;
    y: number;
}
interface FloatingPanelProps {
    /** Whether the panel is shown. */
    open: boolean;
    /** Panel title, rendered in the drag handle bar. */
    title: ReactNode;
    /** Called when the user dismisses via the close button or Escape. */
    onClose: () => void;
    /** Initial top-left position in viewport pixels. */
    defaultPosition?: Point;
    /** Extra class names merged onto the panel. */
    className?: string;
    /** Panel body content. */
    children?: ReactNode;
}
/**
 * A draggable, dismissable NON-modal floating panel. A glass Surface portalled
 * to the body with a header grab-bar you drag to move it (pointer events), a
 * title, and a close button. Its position is clamped to the viewport so it can
 * never be dragged fully off-screen. Unlike Modal it does not lock scroll, trap
 * focus, or render an overlay - it floats above the page and lets you keep
 * working underneath.
 */
declare function FloatingPanel({ open, title, onClose, defaultPosition, className, children, }: FloatingPanelProps): react.ReactPortal | null;

interface TabbedPanelTab {
    id: string;
    label: ReactNode;
    /** Optional count rendered as a CounterBadge on the tab. */
    count?: number;
    content: ReactNode;
    disabled?: boolean;
}
interface TabbedPanelProps extends ComponentProps<'div'> {
    tabs: TabbedPanelTab[];
    /** Controlled active tab id. */
    value?: string;
    /** Initial active tab id when uncontrolled. */
    defaultValue?: string;
    onValueChange?: (id: string) => void;
    /** Actions rendered at the end of the header row, e.g. a Button or Menu. */
    actions?: ReactNode;
    /** Accessible name for the tab list. */
    'aria-label'?: string;
    className?: string;
}
/**
 * A framed panel with a header row of tabs and a bounded content body that
 * switches per active tab. Each tab may carry a numeric count as a
 * CounterBadge, and the header has an optional end slot for actions. Follows
 * the WAI-ARIA tabs pattern with automatic activation: a role="tablist" of
 * role="tab" buttons drives a role="tabpanel" body. Arrow keys move and
 * activate the tabs (wrapping, skipping disabled), Home and End jump to the
 * extremes.
 */
declare function TabbedPanel({ tabs, value, defaultValue, onValueChange, actions, className, 'aria-label': ariaLabel, ...rest }: TabbedPanelProps): react.JSX.Element;

interface TabbedModalSection {
    /** Stable identifier for the section, matched against `value`. */
    id: string;
    /** Section navigation label. */
    label: ReactNode;
    /** Optional leading glyph in the nav rail. */
    icon?: ReactNode;
    /** Body shown in the scrollable pane when this section is active. */
    content: ReactNode;
    /** Dims the rail entry and skips it in navigation. */
    disabled?: boolean;
}
interface TabbedModalProps {
    open: boolean;
    /** Called when the user dismisses via Escape, the close button, or the overlay. */
    onClose: () => void;
    /** Sections listed in the responsive tab navigation; the active one fills the content pane. */
    sections: TabbedModalSection[];
    /** Controlled active section id. */
    value?: string;
    /** Initial active section id when uncontrolled. */
    defaultValue?: string;
    /** Called with the next active section id. */
    onValueChange?: (value: string) => void;
    /** Heading shown above the two panes. */
    title?: ReactNode;
    /** Action row passed through to the underlying Modal, below both panes. */
    footer?: ReactNode;
    className?: string;
}
/**
 * A settings-style dialog with section tabs and a scrollable active pane. It
 * composes the kit's Modal, inheriting its portal, focus trap, scroll lock, and
 * dismiss behaviour. The WAI-ARIA tablist is a vertical rail on wide screens
 * and a horizontal strip on narrow screens; Up/Down or Left/Right move and
 * activate tabs respectively, while Home and End jump to the ends.
 */
declare function TabbedModal({ open, onClose, sections, value, defaultValue, onValueChange, title, footer, className, }: TabbedModalProps): react.JSX.Element;

interface TabStripItem {
    /** Stable identity of the tab; also the value reported by onValueChange. */
    id: string;
    /** Visible label. */
    label: ReactNode;
    /** Optional leading glyph. */
    icon?: ReactNode;
}
interface TabStripProps extends ComponentProps<'div'> {
    tabs: TabStripItem[];
    /** Controlled active tab id. */
    value?: string;
    /** Initial active tab id when uncontrolled; defaults to the first tab. */
    defaultValue?: string;
    /** Called with the id of the tab that becomes active. */
    onValueChange?: (id: string) => void;
    /** Called with the id of the tab whose close button is pressed. */
    onClose?: (id: string) => void;
    /** Spring preset for the active indicator. Defaults to Spring.Snappy. */
    spring?: Spring;
    /** Shows the horizontal scrollbar beneath overflowing tabs. Hidden by default so the baseline hairline stays flush with the tabs. */
    showScrollbar?: boolean;
    /** Accessible name for the strip. */
    'aria-label'?: string;
    className?: string;
}
/**
 * A horizontal strip of closable document tabs, like editor or browser tabs.
 * The active tab carries a springing underline indicator (a shared
 * framer-motion layout element), the strip scrolls horizontally when the tabs
 * overflow, and each tab has its own close (×) button. Left/Right move the
 * active tab; Delete or Backspace closes the focused tab.
 *
 * Reordering by drag is out of scope for v1.
 */
declare function TabStrip({ tabs, value, defaultValue, onValueChange, onClose, spring, showScrollbar, className, 'aria-label': ariaLabel, ...rest }: TabStripProps): react.JSX.Element;

type SplitOrientation = 'horizontal' | 'vertical';
interface ResizableSplitPaneProps extends Omit<ComponentProps<'div'>, 'children'> {
    /** Exactly two children: the start pane and the end pane. */
    children: [ReactNode, ReactNode];
    /**
     * Split direction. `horizontal` places the panes side by side with a vertical
     * divider; `vertical` stacks them with a horizontal divider.
     */
    orientation?: SplitOrientation;
    /** Controlled size of the start pane as a fraction of the container, 0–1. */
    ratio?: number;
    /** Initial start-pane fraction when uncontrolled. */
    defaultRatio?: number;
    /** Called with the next ratio on drag, keyboard step, or reset. */
    onRatioChange?: (ratio: number) => void;
    /** Smallest start-pane fraction the divider can reach. */
    min?: number;
    /** Largest start-pane fraction the divider can reach. */
    max?: number;
    /** Fraction the divider snaps back to on double-click. Defaults to `defaultRatio`. */
    resetRatio?: number;
    /** Fraction the divider moves per arrow-key press. */
    step?: number;
    /** Accessible name for the divider. */
    'aria-label'?: string;
    className?: string;
}
/**
 * A container that splits into two panes with a draggable divider. It hosts
 * exactly two children - a start pane and an end pane - and sizes the start pane
 * by a ratio of the container. The divider is a `role="separator"` handle:
 * drag it with a pointer, nudge it with the arrow keys, or double-click to reset.
 * The ratio is controlled-or-uncontrolled, so a consumer can persist it.
 */
declare function ResizableSplitPane({ children, orientation, ratio, defaultRatio, onRatioChange, min, max, resetRatio, step, className, style, 'aria-label': ariaLabel, ...rest }: ResizableSplitPaneProps): react.JSX.Element;

interface TableColumn {
    key: string;
    header: ReactNode;
    align?: 'left' | 'center' | 'right';
    render?: (row: Record<string, unknown>, index: number) => ReactNode;
}
interface TableProps extends Omit<ComponentProps<'table'>, 'children'> {
    columns: TableColumn[];
    data: Record<string, unknown>[];
    caption?: ReactNode;
    emptyState?: ReactNode;
}
declare function Table({ columns, data, caption, emptyState, className, ...rest }: TableProps): react.JSX.Element;

/** The semantic color family a marker can wear. */
type TimelineTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';
interface TimelineItem {
    /** Stable identity (string or number) for the event. */
    id: string | number;
    /** The event headline. */
    title: ReactNode;
    /** Body copy under the header row. */
    description?: ReactNode;
    /** Muted time slot at the end of the header row; pass a <time> element for machine-readable dates. */
    timestamp?: ReactNode;
    /** Avatar or name slot composed by the consumer, leading the header row. */
    actor?: ReactNode;
    /** Glyph inside the marker dot; falls back to a plain dot. */
    icon?: ReactNode;
    /** Colors the marker. Defaults to neutral. */
    tone?: TimelineTone;
    /** Optional media or preview block under the description. */
    media?: ReactNode;
    /** Optional action row of small buttons or links. */
    actions?: ReactNode;
}
interface TimelineProps extends Omit<ComponentProps<'ol'>, 'children'> {
    /** The events, in reading order: the DOM order is the chronological order you choose. */
    items: TimelineItem[];
    /** Accessible name for the feed. Required: a feed without a name is just a list. */
    'aria-label': string;
    /** Vertical rhythm; compact trims the space between events. */
    density?: 'comfortable' | 'compact';
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
    /** How many placeholder rows the skeleton draws. */
    skeletonCount?: number;
}
/**
 * A vertical activity feed: a semantic ordered list of events, each with a
 * tone-colored marker on a connector rail and a content column of header
 * (actor, title, timestamp), description, media, and actions. The DOM order
 * is the reading order - pass items newest-first or oldest-first and the
 * ordered-list semantics carry that chronology to assistive tech. Markers
 * and connectors are decorative; all meaning lives in the content column.
 */
declare function Timeline({ items, 'aria-label': ariaLabel, density, skeleton, skeletonCount, className, ...rest }: TimelineProps): react.JSX.Element;

type TimelineScrubberMarkerTone = (typeof timelineScrubberMarkerTones)[number];
interface TimelineScrubberMarker {
    /** Epoch milliseconds; clamped into the window. */
    time: number;
    /** Tick color family. Defaults to neutral. */
    tone?: TimelineScrubberMarkerTone;
    /** Accessible description of the event, surfaced as the tick tooltip. */
    label?: string;
}
interface TimelineScrubberProps extends Omit<ComponentProps<'div'>, 'onChange'> {
    /** Window start, epoch milliseconds. */
    start: number;
    /** Window end, epoch milliseconds. While live this is "now" and advances as new samples arrive. */
    end: number;
    /** The inspected time. Omit to pin the playhead to the live edge. */
    value?: number;
    /** Called with the scrubbed time as the playhead moves, or null when the user returns to live. */
    onChange?: (time: number | null) => void;
    /** Optional normalized 0-1 context series rendered as the track backdrop. */
    activity?: number[];
    /** Flagged instants drawn as thin ticks over the track. */
    markers?: TimelineScrubberMarker[];
    /** Arrow-key step in milliseconds; PageUp/PageDown move by ten steps. */
    step?: number;
    /** Formats a timestamp for the readout, the ticks, and aria-valuetext. */
    formatTime?: (time: number) => string;
    /** Track height step. The handle adds its overhang above the track. */
    size?: 'sm' | 'md';
    /** Renders the track on the frosted glass material. */
    glass?: boolean;
    /** Blocks scrubbing and dims the control. */
    disabled?: boolean;
    /** Renders a placeholder with the exact geometry. */
    skeleton?: boolean;
    /** Accessible name for the scrubber. */
    'aria-label': string;
}
/**
 * A flight-recorder control: a horizontal band over a recorded time window
 * with an activity backdrop, event markers, and a draggable playhead. Scrub
 * to inspect any recorded moment, or pin the playhead to the live edge and
 * let new time stream in. Controlled: `value` is the inspected time (omit for
 * live) and `onChange` reports scrubs, with null meaning "back to live".
 */
declare function TimelineScrubber({ start, end, value, onChange, activity, markers, step, formatTime, size, glass, disabled, skeleton, className, 'aria-label': ariaLabel, ...rest }: TimelineScrubberProps): react.JSX.Element;

type ChartSeriesTone = (typeof chartSeriesTones)[number];
type TimeSeriesChartShape = (typeof timeSeriesChartShapes)[number];
interface TimeSeriesChartSeries {
    /** Stable identity; keeps color and toggle state across data updates. */
    id: string;
    /** Name shown in the legend and readout. */
    label: string;
    /** The samples, aligned index-for-index with times. */
    values: (number | null)[];
    /** Ink assignment. Defaults to the fixed categorical order by position. */
    tone?: ChartSeriesTone;
}
interface TimeSeriesChartProps extends ComponentProps<'div'> {
    /** The shared time axis in epoch milliseconds, oldest first. */
    times: number[];
    /** The plotted series. Keep it to a handful; roll the tail into an "other" series in gray. */
    series: TimeSeriesChartSeries[];
    /** Thin lines, or lines over a translucent soft fill. */
    shape?: TimeSeriesChartShape;
    /** Fixed lower bound of the value axis. Defaults to 0. */
    min?: number;
    /** Fixed upper bound of the value axis. Defaults to the data maximum. */
    max?: number;
    /** Formats a value for the y axis and the readout. Defaults to a compact number. */
    formatValue?: (value: number) => string;
    /** Formats a timestamp for the x axis and the readout. */
    formatTime?: (time: number) => string;
    /** Shows the legend when two or more series are plotted. */
    showLegend?: boolean;
    /** Plot height as a CSS length; the width is fluid and follows the container. */
    height?: string;
    /** Message shown while times is empty. */
    emptyLabel?: string;
    /** Frames the plot on the frosted glass material. */
    glass?: boolean;
    /** Renders a placeholder with the exact geometry. */
    skeleton?: boolean;
    /** Accessible name describing what the chart plots. */
    'aria-label': string;
}
/**
 * A streaming time-series plot for telemetry: one shared time axis, a handful
 * of series as thin lines or soft areas, a crosshair with a value readout on
 * hover, and a legend that never repaints survivors when series toggle.
 * Canvas-rendered via uPlot, so a one-second feed stays cheap. Series colors
 * follow the fixed categorical order from the spec (never cycled, never
 * re-ranked); pin `max` (e.g. 100 for percentages) so frames share one scale.
 */
declare function TimeSeriesChart({ times, series, shape, min, max, formatValue, formatTime, showLegend, height, emptyLabel, glass, skeleton, className, 'aria-label': ariaLabel, ...rest }: TimeSeriesChartProps): react.JSX.Element;

/** A row's stable identity. Every row must carry an `id`. */
type DataGridRowId = string | number;
/** The minimum shape a row must satisfy: an `id` plus arbitrary column values. */
interface DataGridRow {
    id: DataGridRowId;
    [key: string]: unknown;
}
type SortDirection = 'asc' | 'desc';
/** The active sort: which column and which direction, or null for unsorted. */
interface DataGridSort {
    columnKey: string;
    direction: SortDirection;
}
interface DataGridColumn {
    /** Matches a key on each row, and identifies the column for sorting. */
    key: string;
    /** Header content. */
    header: ReactNode;
    /** Cell text alignment. Defaults to start. */
    align?: 'start' | 'center' | 'end';
    /** When true, the header becomes an activatable sort control. */
    sortable?: boolean;
    /** A fixed or minimum column width, e.g. '12rem'. */
    width?: string;
    /** Custom cell renderer. Defaults to String(row[key]). */
    render?: (row: DataGridRow, rowIndex: number) => ReactNode;
    /** Custom comparable value for sorting. Defaults to row[key]. */
    sortValue?: (row: DataGridRow) => string | number;
}
interface DataGridProps extends Omit<ComponentProps<'div'>, 'onSelect'> {
    columns: DataGridColumn[];
    data: DataGridRow[];
    /** Accessible name for the grid. */
    'aria-label'?: string;
    sort?: DataGridSort | null;
    defaultSort?: DataGridSort | null;
    onSortChange?: (sort: DataGridSort | null) => void;
    /** Skip built-in client sorting; report sort changes and render data as given. */
    manualSort?: boolean;
    /** Render a leading checkbox column with select-all in the header. */
    selectable?: boolean;
    selectedIds?: DataGridRowId[];
    defaultSelectedIds?: DataGridRowId[];
    onSelectionChange?: (ids: DataGridRowId[]) => void;
    loading?: boolean;
    loadingRows?: number;
    emptyState?: ReactNode;
    density?: 'comfortable' | 'compact';
    stickyHeader?: boolean;
    /** Cap the body height and scroll vertically; pairs with stickyHeader. */
    maxHeight?: string;
    skeleton?: boolean;
}
/**
 * A data grid: column-driven table with client sorting, row selection,
 * loading and empty states, responsive overflow, and a roving-focus keyboard
 * grid. Distinct from Table, which is a static semantic table with no
 * interaction model. For very large datasets, pair with a windowing layer
 * (feed only the visible slice as `data` and drive `sort`/`selectedIds`
 * yourself with `manualSort`).
 */
declare function DataGrid({ columns, data, 'aria-label': ariaLabel, sort: controlledSort, defaultSort, onSortChange, manualSort, selectable, selectedIds: controlledSelected, defaultSelectedIds, onSelectionChange, loading, loadingRows, emptyState, density, stickyHeader, maxHeight, skeleton, className, style, ...rest }: DataGridProps): react.JSX.Element;

interface WizardStep {
    /** Stable identity; keys the panel transition. */
    id: string;
    /** Step name: shown as the panel heading and used for a11y labelling. */
    label: ReactNode;
    /** The panel body for this step. */
    content: ReactNode;
    /**
     * The forward gate, run when Next/Finish is pressed on this step:
     * `true` passes; `false` blocks silently (the step's own fields display
     * their errors); a string blocks AND shows that message in the wizard's
     * error live region. May return a Promise of the same: Next shows its
     * loading state and the footer is inert until it settles; a rejection is
     * treated as a silent block.
     */
    validate?: () => boolean | string | Promise<boolean | string>;
}
interface WizardProps extends Omit<ComponentProps<'div'>, 'children'> {
    steps: WizardStep[];
    /** Required accessible name for the wizard region. */
    'aria-label': string;
    /** Controlled zero-based index of the active step. */
    activeStep?: number;
    /** Uncontrolled start; THE resume point (default 0). */
    defaultActiveStep?: number;
    /** Fires with the new index on every committed navigation. */
    onStepChange?: (index: number) => void;
    /**
     * Save callback: fires with the index being LEFT when its gate passes on
     * forward navigation. The parent persists it; resume via defaultActiveStep.
     */
    onSave?: (index: number) => void;
    /** Finish pressed on the last step and its gate passed. */
    onComplete?: () => void;
    /** Defaults to the localized kit Previous message. */
    previousLabel?: ReactNode;
    /** Defaults to the localized kit Next message. */
    nextLabel?: ReactNode;
    /** Defaults to the localized kit Done message. */
    finishLabel?: ReactNode;
    /** Heading element for the step label. */
    headingLevel?: 2 | 3;
    /** Renders a placeholder with the component's exact geometry. */
    skeleton?: boolean;
}
/**
 * A stepped flow: the connected Steps header, one step panel at a time, and a
 * gated footer. Next runs the active step's validate before advancing (and
 * fires onSave for the step being left); Previous always returns ungated.
 * A blocking message from the gate is voiced by a polite live region, and
 * every committed navigation moves focus to the new panel.
 */
declare function Wizard({ steps, 'aria-label': ariaLabel, activeStep, defaultActiveStep, onStepChange, onSave, onComplete, previousLabel, nextLabel, finishLabel, headingLevel, skeleton, className, ...rest }: WizardProps): react.JSX.Element;

/**
 * The translation mandate.
 *
 * A message is not a string; it is a string for EVERY supported locale. Because
 * `Message` is `Record<Locale, string>`, an object literal that omits a locale
 * fails to compile. Add a locale to `locales` and every message in the codebase
 * turns red until it is translated, so a new language can never ship
 * half-translated and a new string can never skip a language.
 */
/**
 * Every locale the app ships strings for. This is the single source of truth:
 * widen it and TypeScript forces a translation for the new locale everywhere.
 *
 * It starts with a single base locale on purpose. That is enough to wire every
 * component through the translator and ban plain strings; the day a second
 * locale is added here, every message in the codebase fails to compile until it
 * is translated. Rename or add to this tuple to choose the languages.
 */
declare const locales: readonly ["en", "es", "fr", "de", "ja", "pt", "zh", "ar"];
type Locale = (typeof locales)[number];
/** The locale used when no LocaleProvider is present. */
declare const DEFAULT_LOCALE: Locale;
/** Locales written right to left. */
declare const rtlLocales: ReadonlySet<Locale>;
/** The writing direction for a locale, for the html dir attribute. */
declare function direction(locale: Locale): 'ltr' | 'rtl';
/**
 * One translated string, mandated across all locales. Omitting any locale is a
 * compile error: `Property 'xx' is missing in type ... but required in Message`.
 */
type Message = Record<Locale, string>;
/** A catalog of named messages, each mandated across all locales. */
type MessageCatalog<K extends string = string> = Record<K, Message>;
/**
 * Defines a message catalog. The generic pins every value to `Message`, so a
 * catalog with a message missing a locale fails to compile at the call site,
 * while preserving the exact keys for `t(messages.someKey)` autocomplete.
 *
 * `const m = defineMessages({ save: { en: 'Save', es: 'Guardar' } })`
 */
declare function defineMessages<T extends MessageCatalog>(catalog: T): T;
/** Interpolates `{name}` placeholders in a resolved string. */
declare function format(template: string, params?: Record<string, string | number>): string;

/** The translator: resolves a message to the active locale, with interpolation. */
type Translate = (message: Message, params?: Record<string, string | number>) => string;
interface LocaleProviderProps {
    locale: Locale;
    children: ReactNode;
}
/**
 * Sets the active locale for everything inside it. Kit components read it
 * through useT; without a provider they fall back to DEFAULT_LOCALE, so the kit
 * works untranslated out of the box.
 */
declare function LocaleProvider({ locale, children }: LocaleProviderProps): react.JSX.Element;
/** The active locale. */
declare function useLocale(): Locale;
/**
 * Returns the translator bound to the active locale. Call it with a message
 * object: `const t = useT(); t(messages.dismiss)`. Because a message must carry
 * every locale by type, there is nothing to miss at the call site.
 */
declare function useT(): Translate;

/**
 * The kit's own user-facing strings, the ones baked into components (mostly
 * aria-labels on close, dismiss, and stepper controls). Routing them through a
 * catalog means every consuming app inherits real translations instead of
 * hardcoded English, and adding a locale forces translating all of them.
 *
 * These are the exact strings the audit found hardcoded across the kit.
 */
declare const kitMessages: {
    dismiss: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    close: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    cancel: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    closeTour: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    previous: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    next: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    clearSearch: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    oneTimeCode: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    decrease: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    increase: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    openNavigation: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    closeNavigation: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    resizeSidebar: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    loading: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    noOptions: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    copy: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    copied: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    back: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    done: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    less: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    more: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    densityExtraCompact: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    densityCompact: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    densityDefault: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    densityComfortable: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    densityMoreSpace: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
    /** Parameterized: t(kitMessages.stepOf, { step, total }). */
    stepOf: {
        en: string;
        es: string;
        fr: string;
        de: string;
        ja: string;
        pt: string;
        zh: string;
        ar: string;
    };
};
type KitMessageKey = keyof typeof kitMessages;

/**
 * Web haptics, best-effort and gracefully degrading.
 *
 * The web platform has no rich haptic API. What exists:
 *   - Android (Chrome, Firefox): navigator.vibrate() buzzes the device motor.
 *     There is no light/medium/heavy taptic, so intensity is approximated with
 *     short durations and patterns.
 *   - iOS Safari 17.4+: no navigator.vibrate, but toggling a hidden
 *     <input switch> pulses the Taptic Engine. A single fixed tap, no intensity.
 *   - Everywhere else (desktop): a no-op.
 *
 * Rich impact haptics only exist in a native shell (React Native, Capacitor, a
 * Tauri plugin). HapticsProvider accepts an `impl` so such a shell can replace
 * this web engine with real haptics without any call site changing.
 */
type HapticKind = 'selection' | 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';
/** Turn the web haptic engine on or off. HapticsProvider drives this. */
declare function setHapticsEnabled(next: boolean): void;
declare function hapticsEnabled(): boolean;
/**
 * Fire feedback of the given kind: buzz the motor (when haptics are enabled)
 * and announce it on the shared bus so the visual-feedback layer can react in
 * the same frame. This is the programmatic entry point - what useHaptics()
 * returns and what components call directly - so a single call keeps taptic and
 * shockwave in lockstep. Safe to call anywhere.
 */
declare function haptic(kind?: HapticKind): void;
type HapticFn = (kind?: HapticKind) => void;

/** The haptic fire function from the nearest provider, else the web engine. */
declare const useHaptics: () => HapticFn;
interface HapticsProviderProps {
    /** Master switch, wired to a user preference. Off by default. */
    enabled?: boolean;
    /**
     * Replaces the web engine, e.g. a native shell passing its own haptics so the
     * kit fires real impact feedback instead of navigator.vibrate.
     */
    impl?: HapticFn;
    children: ReactNode;
}
/**
 * Enables haptic feedback for every touch press under it via one delegated
 * pointerdown listener, so no component needs wiring. Mouse and pen are ignored
 * (no motor), and it is a clean no-op where the platform cannot vibrate.
 *
 * The hook it exposes (useHaptics) also announces each fire on the shared
 * feedback bus, so a VisualFeedbackProvider can paint a matching effect in the
 * same frame. Delegated presses stay off the bus - the visual layer watches
 * presses through its own listener - so the two never double up.
 */
declare function HapticsProvider({ enabled, impl, children }: HapticsProviderProps): react.JSX.Element;

/** The on-screen effect a press paints. */
type VisualFeedbackVariant = 'shockwave' | 'pulse' | 'glow' | 'nudge';
/** How far the effect carries. Subtle by default: this is background texture. */
type VisualFeedbackIntensity = 'subtle' | 'normal' | 'strong';
/** Trigger an effect by hand, in addition to the automatic press feedback. */
type VisualFeedbackFn = (kind?: HapticKind, origin?: {
    x: number;
    y: number;
}) => void;
/** Fire a visual effect by hand from the nearest provider (a no-op with none). */
declare const useVisualFeedback: () => VisualFeedbackFn;
interface VisualFeedbackProviderProps {
    /** Master switch, wired to a user preference. Off by default. */
    enabled?: boolean;
    /** The effect style. Defaults to shockwave (a ring from the press point). */
    variant?: VisualFeedbackVariant;
    /** How far the effect carries. Defaults to subtle. */
    intensity?: VisualFeedbackIntensity;
    children: ReactNode;
}
/**
 * Paints subtle on-screen feedback for every press, in lockstep with the device
 * haptics. Where HapticsProvider buzzes the motor, this draws a shockwave, a
 * tinted pulse, an edge glow, or a whole-screen nudge, colored by the press's
 * semantic kind. It works for every pointer type (so it is the desktop stand-in
 * for haptics), fires programmatic feedback through the shared bus so a
 * haptic('success') lands a matching effect, and collapses to a still color cue
 * under prefers-reduced-motion. Off by default; gate it behind a preference.
 */
declare function VisualFeedbackProvider({ enabled, variant, intensity, children, }: VisualFeedbackProviderProps): react.JSX.Element;

/**
 * The shared feedback bus.
 *
 * Feedback in the kit is one intent - "a control was pressed" or "something
 * semantic just happened" - that two independent consumers can react to: the
 * haptic engine buzzes the device, and the visual-feedback layer paints a
 * subtle on-screen effect. Routing programmatic feedback through this bus is
 * what lets the two fire in lockstep: a single haptic('success') call reaches
 * both, so the shockwave lands on the same frame as the taptic.
 *
 * Pointer presses do NOT go through the bus. Each consumer installs its own
 * delegated listener so it can apply its own rules (haptics is touch-only and
 * needs no coordinates; visual feedback fires for every pointer type and wants
 * the press point for spatial effects). The bus carries only the programmatic
 * path, keeping the two press listeners from double-firing each other.
 */
interface FeedbackEvent {
    /** The semantic kind, reused from the haptic vocabulary. */
    kind: HapticKind;
    /** Viewport origin for spatial effects. Absent for programmatic feedback, which centers. */
    x?: number;
    y?: number;
}
type Listener = (event: FeedbackEvent) => void;
/** Subscribe to programmatic feedback. Returns an unsubscribe function. */
declare function subscribeFeedback(listener: Listener): () => void;
/** Notify every subscriber. Cheap no-op when nothing is listening. */
declare function emitFeedback(event: FeedbackEvent): void;

export { Accordion, AlertDialog, Announcements, AppShell, Avatar, Banner, Box, Breadcrumbs, Button, Calendar, Callout, Card, CardGroup, Carousel, Center, Checkbox, CodeBlock, Combobox, Container, ContextMenu, CounterBadge, DEFAULT_LOCALE, DataGrid, DatePicker, DensitySelector, DeviceFrame, Divider, Drawer, EmptyState, Field, Fieldset, FileUpload, FilterChip, FloatingPanel, FormSection, Grid, HapticsProvider, Heading, Heatmap, IconBackfill, IconButton, Image, Input, Kbd, Label, Link, List, ListItem, LocaleProvider, Menu, MenuItem, MenuLabel, MenuSeparator, MenuSub, Meter, Modal, MultiSelect, NavBar, NavBarItem, NumberInput, OtpField, PageHeader, Pagination, Pill, Popover, ProgressBar, ProgressRing, Radio, RadioCard, Rating, ResizableSplitPane, Row, ScrollArea, ScrollbarAppearance, SearchField, Section, SegmentedBar, SegmentedControl, Select, Sidebar, SidebarItem, SidebarSection, Size, Skeleton, SkeletonVariant$1 as SkeletonVariant, Slider, Spacer, Sparkline, Spinner, SplitButton, Spotlight, Stack, StatTile, StatusDot, Steps, Surface, Switch, TabStrip, TabbedModal, TabbedPanel, Table, Tabs, Text, TextTone, Textarea, TimeSeriesChart, Timeline, TimelineScrubber, TitleBar, Toast, ToastProvider, Toggle, Tone, Toolbar, Tooltip, TreeView, Variant, VisualFeedbackProvider, Wizard, defineMessages, densityModes, direction, emitFeedback, format, haptic, hapticsEnabled, kitMessages, locales, resolveDirection, rtlLocales, setHapticsEnabled, subscribeFeedback, useDirection, useField, useHaptics, useLocale, useT, useToast, useVisualFeedback };
export type { AccordionItem, AccordionProps, AlertDialogProps, AlertDialogTone, Align, AnnouncementItem, AnnouncementTone, AnnouncementsProps, AppShellProps, AvatarProps, Background, BannerProps, BannerTone, BorderToken, BoxProps, BreadcrumbItem, BreadcrumbsProps, ButtonProps, ButtonVariant, CalendarMode, CalendarProps, CalendarRange, CalloutProps, CalloutTone, CardGroupDensity, CardGroupGap, CardGroupMode, CardGroupProps, CardProps, CardVariant, CarouselProps, CenterProps, ChartSeriesTone, CheckboxProps, CodeBlockProps, ComboboxOption, ComboboxProps, ContainerProps, ContainerSize, ContextMenuProps, ControlSize, CounterBadgeProps, DataGridColumn, DataGridProps, DataGridRow, DataGridRowId, DataGridSort, DatePickerProps, DensityMode, DensitySelectorProps, DeviceFrameProps, DeviceFrameSize, Direction, DividerProps, DrawerProps, DrawerSide, DrawerSize, Elevation, EmptyStateProps, FeedbackEvent, FieldProps, FieldsetProps, FileUploadProps, FileUploadRejection, FileUploadRejectionReason, FilterChipProps, FloatingPanelProps, FormSectionProps, GridProps, HapticFn, HapticKind, HeadingProps, HeatmapData, HeatmapPoint, HeatmapProps, IconBackfillProps, IconButtonProps, ImageFit, ImageProps, ImageRadius, InputProps, Justify, KbdProps, KitMessageKey, LabelProps, LinkProps, ListItemProps, ListProps, ListSize, Locale, LocaleProviderProps, MenuItemProps, MenuProps, MenuSubProps, Message, MessageCatalog, MeterProps, MeterTone, ModalProps, MultiSelectOption, MultiSelectProps, NavBarItemProps, NavBarOrientation, NavBarProps, NumberInputProps, OtpFieldProps, OtpFieldType, PageHeaderAction, PageHeaderProps, PaginationProps, PillProps, PillTone, PillVariant, Placement, PopoverProps, ProgressBarProps, ProgressRingProps, RadioCardProps, RadioProps, RadiusToken, RatingProps, ResizableSplitPaneProps, Responsive, RowProps, ScrollAreaOrientation, ScrollAreaProps, ScrollbarAppearanceName, SearchFieldProps, SectionDensity, SectionGap, SectionHeadingLevel, SectionProps, SegmentedBarProps, SegmentedControlProps, SegmentedOption, SelectOption, SelectProps, SidebarItemProps, SidebarProps, SidebarSectionProps, SkeletonProps, SliderProps, SortDirection, SpacerProps, SparklineProps, SparklineShape, SparklineTone, SpinnerProps, SplitButtonProps, SplitOrientation, SpotlightProps, StackProps, StatTileProps, StatusDotProps, StepsProps, StepsSize, StepsTone, SurfaceLevel, SurfaceProps, SwitchProps, TabItem, TabStripItem, TabStripProps, TabbedModalProps, TabbedModalSection, TabbedPanelProps, TabbedPanelTab, TableColumn, TableProps, TabsProps, TextAlign, TextProps, TextareaProps, TimeSeriesChartProps, TimeSeriesChartSeries, TimeSeriesChartShape, TimelineItem, TimelineProps, TimelineScrubberMarker, TimelineScrubberMarkerTone, TimelineScrubberProps, TimelineTone, TitleBarProps, ToastContextValue, ToastOptions, ToastProps, ToastTone, ToggleProps, ToolbarProps, TooltipProps, Translate, TreeItem, TreeViewProps, VisualFeedbackFn, VisualFeedbackIntensity, VisualFeedbackVariant, WizardProps, WizardStep };
