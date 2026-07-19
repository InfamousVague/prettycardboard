/**
 * Deck-tinted accents: while a deck is open, the app's Glacier accent shifts
 * toward the deck's color identity, then restores the user's chosen accent on
 * leave. The mapping targets the closest Glacier accent ramp:
 *
 *   W -> amber, U -> blue (default), B -> purple, R -> red, G -> green,
 *   colorless -> graphite, 3+ colors -> teal (prismatic stand-in).
 */

let tinted = false;

function accentFor(identity: string[]): string | null {
  const colors = ['W', 'U', 'B', 'R', 'G'].filter((color) => identity.includes(color));
  if (colors.length === 0) return 'graphite';
  if (colors.length >= 3) return 'teal';
  // One or two colors: the first color's ramp carries the tint (two-color
  // pairs lean on their primary; a finer split would need custom ramps).
  switch (colors[0]) {
    case 'W':
      return 'amber';
    case 'U':
      return null; // blue is the token default: clear the attribute
    case 'B':
      return 'purple';
    case 'R':
      return 'red';
    case 'G':
      return 'green';
    default:
      return null;
  }
}

export function applyDeckTint(identity: string[]): void {
  const accent = accentFor(identity);
  const root = document.documentElement;
  tinted = true;
  if (accent) root.setAttribute('data-accent', accent);
  else root.removeAttribute('data-accent');
}

/** Restore the user's configured accent (from preferences) after a tint. */
export function clearDeckTint(userAccent: string, defaultAccent: string): void {
  if (!tinted) return;
  tinted = false;
  const root = document.documentElement;
  if (userAccent === defaultAccent) root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', userAccent);
}
