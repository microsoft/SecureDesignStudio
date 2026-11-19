import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { ReviewNavigationState } from "./reviewNavigation";

export type InspectorPresentation = "docked" | "floating" | "window";
export type InspectorTab =
  | "properties"
  | "edges"
  | "issues"
  | "assistant"
  | "comments"
  | "deviations"
  | "changes"
  | "data"
  | "work";

interface UiPreferences {
  inspectorVisible: boolean;
  inspectorWidth: number;
  inspectorPinned: boolean;
  inspectorActiveTab: InspectorTab;
  darkTheme: boolean;
  autosaveIntervalMs: number;
  outOfScopeColor: string;
  externalInteractorColor: string;
}

interface UiShellApi extends UiPreferences {
  inspectorPresentation: InspectorPresentation;
  setInspectorPresentation: (presentation: InspectorPresentation) => void;
  inspectorHostRef: MutableRefObject<HTMLElement | null>;
  documentFileName: string;
  setDocumentFileName: (documentFileName: string) => void;
  openInspector: (tab?: InspectorTab, trigger?: HTMLElement | null, options?: { preserveReviewJourney?: boolean; focus?: boolean }) => void;
  closeInspector: (options?: { restoreFocus?: boolean }) => void;
  toggleInspector: (trigger?: HTMLElement | null) => void;
  setInspectorWidth: (width: number) => void;
  setInspectorPinned: (pinned: boolean) => void;
  setInspectorActiveTab: (tab: InspectorTab, options?: { automatic?: boolean }) => void;
  focusInspectorTab: (tab: InspectorTab) => void;
  reviewNavigation: ReviewNavigationState;
  setReviewNavigation: Dispatch<SetStateAction<ReviewNavigationState>>;
  endReviewNavigation: (source?: InspectorTab, notice?: string) => void;
  setDarkTheme: (darkTheme: boolean) => void;
  setAutosaveIntervalMs: (autosaveIntervalMs: number) => void;
  setScopeColor: (field: "outOfScopeColor" | "externalInteractorColor", color: string) => void;
  resetPreferences: () => void;
  fitViewRequest: number;
  requestFitView: () => void;
  reopenFocusRequest: number;
}

const STORAGE_KEY = "ps-ui-preferences-v2";
export const AUTOSAVE_INTERVAL_OPTIONS = [500, 2000, 5000, 15000] as const;
const DEFAULT_PREFERENCES: UiPreferences = {
  inspectorVisible: true,
  inspectorWidth: 500,
  inspectorPinned: false,
  inspectorActiveTab: "properties",
  darkTheme: false,
  autosaveIntervalMs: 500,
  outOfScopeColor: "#b45309",
  externalInteractorColor: "#7c3aed",
};
const INSPECTOR_TABS = new Set<InspectorTab>([
  "properties",
  "edges",
  "issues",
  "assistant",
  "comments",
  "deviations",
  "changes",
  "data",
  "work",
]);

function loadPreferences(): UiPreferences {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const legacyWidth = Number.parseInt(
        window.localStorage.getItem("ps-side-width") ?? "",
        10,
      );
      return Number.isFinite(legacyWidth)
        ? {
            ...DEFAULT_PREFERENCES,
            inspectorWidth: Math.min(720, Math.max(320, legacyWidth)),
          }
        : DEFAULT_PREFERENCES;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_PREFERENCES;
    const candidate = parsed as Partial<UiPreferences>;
    return {
      outOfScopeColor: typeof candidate.outOfScopeColor === "string" && /^#[0-9a-f]{6}$/i.test(candidate.outOfScopeColor)
        ? candidate.outOfScopeColor : DEFAULT_PREFERENCES.outOfScopeColor,
      externalInteractorColor: typeof candidate.externalInteractorColor === "string" && /^#[0-9a-f]{6}$/i.test(candidate.externalInteractorColor)
        ? candidate.externalInteractorColor : DEFAULT_PREFERENCES.externalInteractorColor,
      inspectorVisible:
        typeof candidate.inspectorVisible === "boolean"
          ? candidate.inspectorVisible
          : DEFAULT_PREFERENCES.inspectorVisible,
      inspectorWidth:
        typeof candidate.inspectorWidth === "number" &&
        Number.isFinite(candidate.inspectorWidth)
          ? Math.min(720, Math.max(320, candidate.inspectorWidth))
          : DEFAULT_PREFERENCES.inspectorWidth,
      inspectorPinned:
        typeof candidate.inspectorPinned === "boolean"
          ? candidate.inspectorPinned
          : DEFAULT_PREFERENCES.inspectorPinned,
      inspectorActiveTab:
        typeof candidate.inspectorActiveTab === "string" &&
        INSPECTOR_TABS.has(candidate.inspectorActiveTab as InspectorTab)
          ? (candidate.inspectorActiveTab as InspectorTab)
          : DEFAULT_PREFERENCES.inspectorActiveTab,
      darkTheme:
        typeof candidate.darkTheme === "boolean"
          ? candidate.darkTheme
          : DEFAULT_PREFERENCES.darkTheme,
      autosaveIntervalMs:
        typeof candidate.autosaveIntervalMs === "number" &&
        AUTOSAVE_INTERVAL_OPTIONS.includes(
          candidate.autosaveIntervalMs as (typeof AUTOSAVE_INTERVAL_OPTIONS)[number],
        )
          ? candidate.autosaveIntervalMs
          : DEFAULT_PREFERENCES.autosaveIntervalMs,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

const UiShellContext = createContext<UiShellApi | null>(null);

export function UiShellProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(loadPreferences);
  const [inspectorPresentation, setInspectorPresentation] = useState<InspectorPresentation>("docked");
  const inspectorHostRef = useRef<HTMLElement | null>(null);
  const [documentFileName, setDocumentFileName] = useState(
    "secure-design-studio-diagram.tma",
  );
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const [reopenFocusRequest, setReopenFocusRequest] = useState(0);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const focusTicketRef = useRef(0);
  const [reviewNavigation, setReviewNavigation] = useState<ReviewNavigationState>({
    returns: [], preview: null, request: null, notice: null, revision: 0,
  });
  const endReviewNavigation = useCallback((source?: InspectorTab, notice?: string) => {
    ++focusTicketRef.current;
    setReviewNavigation(current => {
      if (source && !current.returns.some(point => point.tab === source) && current.preview?.tab !== source
        && !(current.request?.kind === "return" && current.request.point.tab === source)) return current;
      if (!current.returns.length && !current.preview && !current.request && !current.notice) return current;
      return { returns: [], preview: null, request: null, notice: notice ?? null, revision: current.revision };
    });
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // UI preferences are optional when browser storage is unavailable.
    }
  }, [preferences]);

  const value = useMemo<UiShellApi>(() => {
    const rememberTrigger = (trigger?: HTMLElement | null) => {
      const fallback =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      restoreFocusRef.current = trigger ?? fallback;
    };
    const focusInspectorTab = (tab: InspectorTab) => {
      const ticket = ++focusTicketRef.current;
      const view = inspectorHostRef.current?.ownerDocument.defaultView ?? window;
      view.requestAnimationFrame(() => {
        if (ticket !== focusTicketRef.current) return;
        inspectorHostRef.current?.ownerDocument.defaultView?.focus();
        inspectorHostRef.current
          ?.querySelector<HTMLElement>(`#ps-inspector-tab-${tab}`)
          ?.focus({ preventScroll: true });
      });
    };
    const restoreAfterClose = () => {
      const trigger = restoreFocusRef.current;
      if (
        !trigger?.isConnected ||
        trigger.getClientRects().length === 0 ||
        (trigger instanceof HTMLButtonElement && trigger.disabled)
      ) {
        setReopenFocusRequest((current) => current + 1);
        return;
      }
      requestAnimationFrame(() => trigger.focus());
    };
    return {
      ...preferences,
      inspectorPresentation,
      setInspectorPresentation,
      inspectorHostRef,
      reviewNavigation,
      setReviewNavigation,
      endReviewNavigation,
      focusInspectorTab,
      documentFileName,
      setDocumentFileName,
      openInspector: (requestedTab, trigger, options) => {
        const tab = requestedTab ?? preferences.inspectorActiveTab;
        ++focusTicketRef.current;
        if (!options?.preserveReviewJourney && requestedTab !== undefined) endReviewNavigation();
        rememberTrigger(trigger);
        setPreferences((current) => ({
          ...current,
          inspectorVisible: true,
          inspectorActiveTab: tab,
        }));
        if (options?.focus !== false) focusInspectorTab(tab);
      },
      closeInspector: (options) => {
        ++focusTicketRef.current;
        setReviewNavigation(current => current.request ? { ...current, request: null } : current);
        setPreferences((current) => ({
          ...current,
          inspectorVisible: false,
        }));
        if (options?.restoreFocus === false) setReopenFocusRequest(0);
        else restoreAfterClose();
      },
      toggleInspector: (trigger) => {
        if (preferences.inspectorVisible) {
          ++focusTicketRef.current;
          setReviewNavigation(current => current.request ? { ...current, request: null } : current);
          rememberTrigger(trigger);
          setPreferences((current) => ({
            ...current,
            inspectorVisible: false,
          }));
          restoreAfterClose();
        } else {
          rememberTrigger(trigger);
          setPreferences((current) => ({
            ...current,
            inspectorVisible: true,
          }));
          focusInspectorTab(preferences.inspectorActiveTab);
        }
      },
      setInspectorWidth: (inspectorWidth) =>
        setPreferences((current) => ({ ...current, inspectorWidth })),
      setInspectorPinned: (inspectorPinned) =>
        setPreferences((current) => ({ ...current, inspectorPinned })),
      setInspectorActiveTab: (inspectorActiveTab, options) => {
        ++focusTicketRef.current;
        if (!options?.automatic) endReviewNavigation();
        setPreferences((current) => ({ ...current, inspectorActiveTab }));
      },
      setDarkTheme: (darkTheme) =>
        setPreferences((current) => ({ ...current, darkTheme })),
      setAutosaveIntervalMs: (autosaveIntervalMs) =>
        setPreferences((current) => ({ ...current, autosaveIntervalMs })),
      setScopeColor: (field, color) => {
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Scope color must be a six-digit hex color.");
        setPreferences(current => ({ ...current, [field]: color }));
      },
      resetPreferences: () => {
        endReviewNavigation();
        try {
          window.localStorage.removeItem("ps-side-width");
        } catch {
          // UI preferences are optional when browser storage is unavailable.
        }
        setPreferences({ ...DEFAULT_PREFERENCES });
      },
      fitViewRequest,
      requestFitView: () => setFitViewRequest((current) => current + 1),
      reopenFocusRequest,
    };
  }, [preferences, documentFileName, fitViewRequest, reopenFocusRequest, inspectorPresentation, reviewNavigation, endReviewNavigation]);

  return (
    <UiShellContext.Provider value={value}>{children}</UiShellContext.Provider>
  );
}

export function useUiShell(): UiShellApi {
  const value = useContext(UiShellContext);
  if (!value) {
    throw new Error("useUiShell must be used within UiShellProvider");
  }
  return value;
}
