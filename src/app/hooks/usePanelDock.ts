import { useCallback, useEffect, useState } from 'react';
import { resolvePanelDock, type DockMode } from '../preferences.ts';
import { useApp } from '../state/appStore.ts';
import { useMobileLayout } from './useIsPhone.ts';
import { usePreference } from './usePreference.ts';

export type { DockMode };

/**
 * A panel's own dock override, broadcast so a panel and the toggle that drives
 * it can live in different components (the table's library sidebar and its
 * header button are the case that forces this). Same shape as the app-wide
 * `pc:preferences` event.
 */
const PANEL_DOCK_EVENT = 'pc:paneldock';

/** Per-user, per-panel, exactly like `pc.railhidden.<userId>`. */
const overrideKey = (userId: string | undefined, panelId: string) =>
  `pc.paneldock.${userId ?? 'anon'}.${panelId}`;

/** null = no override, i.e. follow the app-wide resolved value. */
function loadOverride(userId: string | undefined, panelId: string): DockMode | null {
  try {
    const raw = localStorage.getItem(overrideKey(userId, panelId));
    if (raw === 'dock' || raw === 'float') return raw;
  } catch {
    /* storage unavailable - follow the preference */
  }
  return null;
}

function saveOverride(userId: string | undefined, panelId: string, mode: DockMode | 'auto'): void {
  try {
    if (mode === 'auto') localStorage.removeItem(overrideKey(userId, panelId));
    else localStorage.setItem(overrideKey(userId, panelId), mode);
  } catch {
    /* ignore write failures (private mode, quota) */
  }
}

export interface PanelDock {
  /** Render into `slot` rather than as a floating overlay. Always false on a
   *  phone - consumers must NOT re-check the breakpoint themselves. */
  docked: boolean;
  /** The resolved mode behind `docked`, for anything that needs to stamp it. */
  mode: DockMode;
  /** Set this panel's own override; 'auto' clears it back to the preference. */
  setMode: (mode: DockMode | 'auto') => void;
  /** The host's slot element, or null while it is absent (or not wanted). */
  slot: HTMLElement | null;
}

/**
 * The dock state for one panel - see THE DOCK CONTRACT in components/panels.css.
 *
 * The app-wide preference (`panelDock`, resolved against `layout` and the phone
 * breakpoint) is the default; each panel may override it for itself, persisted
 * per user. The panel then renders `docked && slot ? createPortal(body, slot)
 * : <floating wrapper>` - the mechanism the lobby's nav dock already proves.
 *
 * @param panelId stable id for the persisted override, e.g. 'chat'
 * @param slotId  the host slot's DOM id, e.g. 'pc-dock-shell'
 */
export function usePanelDock(panelId: string, slotId?: string): PanelDock {
  const phone = useMobileLayout();
  const panelDock = usePreference('panelDock');
  const layout = usePreference('layout');
  const userId = useApp((state) => state.identity?.userId);

  const [override, setOverride] = useState<DockMode | null>(() => loadOverride(userId, panelId));
  useEffect(() => {
    // Re-seed on an account or panel change, and follow every other copy of
    // this hook so a header toggle and the panel it toggles stay in step.
    const read = () => setOverride(loadOverride(userId, panelId));
    read();
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<{ panelId?: string }>).detail;
      if (!detail?.panelId || detail.panelId === panelId) read();
    };
    window.addEventListener(PANEL_DOCK_EVENT, onChange);
    return () => window.removeEventListener(PANEL_DOCK_EVENT, onChange);
  }, [userId, panelId]);

  const setMode = useCallback(
    (next: DockMode | 'auto') => {
      saveOverride(userId, panelId, next);
      window.dispatchEvent(new CustomEvent(PANEL_DOCK_EVENT, { detail: { panelId } }));
    },
    [userId, panelId],
  );

  // The app-wide default, then this panel's override on top of it. The phone
  // rule outranks BOTH - nothing docks on a phone, ever, not even a panel the
  // player explicitly docked on a desktop.
  const resolved = resolvePanelDock({ panelDock, layout }, phone);
  const mode: DockMode = phone ? 'float' : (override ?? resolved);
  const docked = mode === 'dock';

  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // The slot is rendered by a sibling (the shell body, the table), so it is
    // not in the DOM during this component's first render. Effects run after
    // the whole tree has committed, which is when the lookup is safe - the
    // same reason the lobby's nav dock resolves here rather than inline.
    setSlot(slotId && docked ? document.getElementById(slotId) : null);
  }, [slotId, docked]);

  return { docked, mode, setMode, slot };
}
