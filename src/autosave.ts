// Browser autosave for the entire working document plus undo/redo history.
// Tab recovery survives refresh; the shared checkpoint also serves new tabs.
//
// Bundle format (versioned):
//   { version, source, doc, past[], future[], view: { activeScenarioId, filter } }
//
// `past` and `future` are arrays of full PsDocument snapshots, matching the
// in-memory undo/redo stacks. We cap how many we persist (separately from
// the in-memory cap) because localStorage typically has a 5–10 MB quota.
//
// All reads/writes are wrapped in try/catch — localStorage may be
// unavailable (private mode, sandboxed iframe) or full.

import type { AuthTypeDef, PsDocument } from "./types";
import type { ClassificationLibrary } from "./classificationLibrary";
import { readEmbeddedDoc } from "./embeddedDoc";

const STORAGE_KEY = "secure-design-studio:autosave:v1";
const LEGACY_STORAGE_KEY = "privsec-diagram:autosave:v1";
const CURRENT_VERSION = 1;

// History trim ladder for the quota-fallback retry path. Saving tries each
// limit in turn until one succeeds; the last (0) drops history entirely.
const HISTORY_TRIM_LADDER = [25, 10, 5, 0] as const;

export interface AutosaveView {
  activeScenarioId: string | null;
  // Free-form structural — store.tsx coerces back to FilterState on read.
  filter: unknown;
}

export interface AutosaveBundle {
  doc: PsDocument;
  past: PsDocument[];
  future: PsDocument[];
  view: AutosaveView;
  authenticationHistory?: { past: (AuthTypeDef[] | null)[]; future: (AuthTypeDef[] | null)[] };
  classificationHistory?: { past: (ClassificationLibrary | null)[]; future: (ClassificationLibrary | null)[] };
}

export interface PersistedBundle {
  version: number;
  doc: unknown;
  past: unknown[];
  future: unknown[];
  view: unknown;
  authenticationHistory?: unknown;
  classificationHistory?: unknown;
}

export interface AutosaveSession {
  source: string | null;
  sharedValue: string | null;
  savedValue: string | null;
  recoveredValue: string | null;
}

// Keep the exact embedded seed, not a document ID or a lossy fingerprint:
// separate exports of the same model must not restore one another's edits.
export function createAutosaveSession(embedded: unknown): AutosaveSession {
  return { source: embedded == null ? null : JSON.stringify(embedded),
    sharedValue: null, savedValue: null, recoveredValue: null };
}

export function loadAutosaveRaw(session?: AutosaveSession): PersistedBundle | null {
  if (typeof window === "undefined") return null;
  const implicitSession = session === undefined;
  session ??= createAutosaveSession(readEmbeddedDoc());
  session.recoveredValue = null;
  let storage: Storage | undefined;
  let current: string | null = null;
  try {
    storage = window.localStorage;
    current = storage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    // Tab recovery is independent of localStorage access.
  }
  if (session) session.sharedValue = current;
  try {
    let tab: string | null = null;
    if (session) {
      try {
        tab = window.sessionStorage?.getItem(STORAGE_KEY);
      } catch {
        // Shared recovery remains available when tab storage is denied.
      }
    }
    const matchesSource = (raw: string | null) => {
      if (!raw) return false;
      try {
        return (JSON.parse(raw).source ?? null) === session?.source;
      } catch {
        return false;
      }
    };
    const raw = session
      ? matchesSource(tab) ? tab : matchesSource(current) ? current
        : session.source === null ? storage?.getItem(LEGACY_STORAGE_KEY) : null
      : current ?? storage?.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const p = parsed as Record<string, unknown>;
    if (!("doc" in p)) return null;
    session.recoveredValue = raw;
    if (session && raw === tab) session.savedValue = raw;
    if (!current && implicitSession && session.source === null) {
      // Migrate legacy browser state in place. Future saves use only the
      // SecureDesignStudio namespace; the legacy value is retained so an older
      // deployed build can still recover the same local document.
      try {
        storage?.setItem(STORAGE_KEY, raw);
      } catch {
        // Recovery must not depend on space being available for migration.
      }
    }
    return {
      version: typeof p.version === "number" ? p.version : 0,
      doc: p.doc,
      past: Array.isArray(p.past) ? p.past : [],
      future: Array.isArray(p.future) ? p.future : [],
      view: p.view ?? null,
      authenticationHistory: p.authenticationHistory,
      classificationHistory: p.classificationHistory,
    };
  } catch {
    /* corrupt JSON or storage unavailable */
    return null;
  }
}

export function saveAutosave(bundle: AutosaveBundle, session?: AutosaveSession): string | null {
  const failure = "Autosave could not be updated. Browser storage may be full or unavailable. Save a .tma backup using File > Save.";
  if (typeof window === "undefined") return failure;
  if (!session) {
    session = createAutosaveSession(readEmbeddedDoc());
    loadAutosaveRaw(session);
  }
  let storage: Storage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    // Attempt tab-local recovery even when shared storage is denied.
  }
  let tabSaved = false;
  let sharedSaved = false;

  // Try progressively smaller history caps so a big diagram still saves
  // (without history) rather than failing silently when the quota is hit.
  for (const limit of HISTORY_TRIM_LADDER) {
    const payload = {
      version: CURRENT_VERSION,
      source: session?.source ?? null,
      doc: bundle.doc,
      past: limit > 0 ? bundle.past.slice(-limit) : [],
      future: limit > 0 ? bundle.future.slice(-limit) : [],
      view: bundle.view,
      authenticationHistory: bundle.authenticationHistory ? {
        past: limit > 0 ? bundle.authenticationHistory.past.slice(-limit) : [],
        future: limit > 0 ? bundle.authenticationHistory.future.slice(-limit) : [],
      } : undefined,
      classificationHistory: bundle.classificationHistory ? {
        past: limit > 0 ? bundle.classificationHistory.past.slice(-limit) : [],
        future: limit > 0 ? bundle.classificationHistory.future.slice(-limit) : [],
      } : undefined,
    };
    try {
      const value: string = JSON.stringify(payload);
      if (session?.savedValue === value) return null;
      tabSaved = false;
      let tabQuotaFailure = false;
      if (session) {
        try {
          window.sessionStorage.setItem(STORAGE_KEY, value);
          tabSaved = true;
        } catch (error) {
          tabQuotaFailure = error instanceof DOMException && error.name === "QuotaExceededError";
        }
        if (storage && storage.getItem(STORAGE_KEY) !== session.sharedValue) {
          if (!tabSaved) continue;
          return "Another tab changed shared autosave. This tab's edits are retained for refresh, but not a new tab. Save a .tma backup using File > Save.";
        }
      }
      try {
        if (!storage) continue;
        storage.setItem(STORAGE_KEY, value);
        sharedSaved = true;
      } catch {
        // A smaller history may fit both stores; retain any successful tab copy.
        continue;
      }
      if (session) {
        session.sharedValue = value;
        if (tabSaved) session.savedValue = value;
        else if (tabQuotaFailure) continue;
        else break;
      }
      return null;
    } catch {
      // Quota or serialization error — try a smaller payload.
    }
  }
  if (sharedSaved) return "Shared autosave was updated, but tab-isolated recovery is unavailable. Save a .tma backup before working in multiple tabs.";
  if (tabSaved) return "Shared autosave could not be updated. This tab's edits are retained for refresh, but not a new tab. Save a .tma backup using File > Save.";
  return failure;
}

export function clearAutosave(): void {
  if (typeof window === "undefined") return;
  const session = createAutosaveSession(readEmbeddedDoc());
  loadAutosaveRaw(session);
  if (session.recoveredValue === null) return;
  // Crash recovery belongs to this page, not another tab's newer checkpoint.
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[storageName];
      for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
        if (storage?.getItem(key) === session.recoveredValue) storage.removeItem(key);
      }
    } catch {
      // The other store may still be available.
    }
  }
}
