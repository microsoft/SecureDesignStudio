import "./collaboration-loader.mjs";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
const { clearAutosave, createAutosaveSession, loadAutosaveRaw, saveAutosave } = await import("../../src/autosave.ts");

const key = "secure-design-studio:autosave:v1";
const legacyKey = "privsec-diagram:autosave:v1";
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;
afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});
const storage = () => {
  const entries = new Map();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: key => entries.delete(key),
  };
};
const bundle = title => ({
  doc: { nodes: [{ id: "n_test", title }], scenarios: [] },
  past: [], future: [], view: { activeScenarioId: null, filter: {} },
});
const mount = (localStorage = storage(), sessionStorage = storage(), seed = null) => {
  globalThis.window = { localStorage, sessionStorage };
  const session = createAutosaveSession(seed);
  const restored = loadAutosaveRaw(session);
  return { session, restored, localStorage, sessionStorage };
};
const quota = () => { throw new DOMException("Synthetic quota", "QuotaExceededError"); };

test("autosave: embedded recovery matches the exact export, never an unrelated diagram or changed seed", () => {
  const first = mount(undefined, undefined, { doc: { id: "same", title: "Original" } });
  assert.equal(first.restored, null);
  assert.equal(saveAutosave(bundle("Edited"), first.session), null);
  assert.equal(mount(first.localStorage, first.sessionStorage, { doc: { id: "same", title: "Original" } })
    .restored.doc.nodes[0].title, "Edited");
  assert.equal(mount(first.localStorage, first.sessionStorage, { doc: { id: "same", title: "Different export" } }).restored, null);
  assert.equal(mount(first.localStorage, first.sessionStorage).restored, null);
  const legacy = storage();
  legacy.setItem(key, JSON.stringify(bundle("Unrelated older build")));
  assert.equal(mount(legacy, storage(), { doc: { id: "same" } }).restored, null);
});

test("autosave: stale tabs cannot overwrite shared recovery and each tab restores its own document", () => {
  const first = mount();
  assert.equal(saveAutosave(bundle("Initial"), first.session), null);
  const second = mount(first.localStorage);
  assert.equal(saveAutosave(bundle("Second tab"), second.session), null);
  globalThis.window = first;
  assert.equal(saveAutosave(bundle("Initial"), first.session), null, "Unchanged lifecycle flush does not rewrite shared data");
  assert.match(saveAutosave(bundle("First tab new edit"), first.session), /Another tab/);
  assert.equal(JSON.parse(first.localStorage.getItem(key)).doc.nodes[0].title, "Second tab");
  const reloaded = mount(first.localStorage, first.sessionStorage);
  assert.equal(reloaded.restored.doc.nodes[0].title, "First tab new edit");
  assert.equal(saveAutosave(bundle("First tab new edit"), reloaded.session), null);
  assert.equal(JSON.parse(first.localStorage.getItem(key)).doc.nodes[0].title, "Second tab",
    "An unedited reload must not republish a stale tab's copy");
  assert.equal(mount(first.localStorage, second.sessionStorage).restored.doc.nodes[0].title, "Second tab");
});

test("autosave: failed writes return an actionable error and retain the prior backup", () => {
  const state = mount();
  assert.equal(saveAutosave(bundle("Backup"), state.session), null);
  state.localStorage.setItem = quota;
  state.sessionStorage.setItem = quota;
  assert.match(saveAutosave(bundle("Unsaved"), state.session), /Save a \.tma backup/);
  assert.equal(loadAutosaveRaw(state.session).doc.nodes[0].title, "Backup");
});

test("autosave: independent store failures preserve the available recovery path and report the limitation", () => {
  for (const denied of ["localStorage", "sessionStorage"]) {
    const state = mount();
    Object.defineProperty(globalThis.window, denied, { get: quota });
    assert.match(saveAutosave(bundle("Retained"), state.session), /Save a \.tma backup/);
    const restored = loadAutosaveRaw(createAutosaveSession(null));
    assert.equal(restored.doc.nodes[0].title, "Retained");
  }
});

test("autosave: denied tab storage does not trim valid shared undo history", () => {
  const state = mount();
  Object.defineProperty(globalThis.window, "sessionStorage", {
    get() { throw new DOMException("Synthetic denied storage", "SecurityError"); },
  });
  const saved = { ...bundle("Retained"), past: [{ nodes: [{ id: "n_test", title: "Previous" }] }] };
  assert.match(saveAutosave(saved, state.session), /tab-isolated recovery is unavailable/);
  assert.deepEqual(loadAutosaveRaw(state.session).past, saved.past);
});

test("autosave: quota trimming retains aligned profile history and successful retries clear the error", () => {
  const state = mount();
  const setItem = state.localStorage.setItem;
  state.localStorage.setItem = (key, value) => {
    if (JSON.parse(value).past.length > 5) quota();
    setItem(key, value);
  };
  const input = {
    ...bundle("Current"),
    past: Array.from({ length: 30 }, (_, index) => ({ index })),
    authenticationHistory: { past: Array.from({ length: 30 }, (_, index) => [{ index }]), future: [] },
  };
  assert.equal(saveAutosave(input, state.session), null);
  const saved = loadAutosaveRaw(state.session);
  assert.equal(saved.past.length, 5);
  assert.equal(saved.authenticationHistory.past[0][0].index, saved.past[0].index);
  state.localStorage.setItem = quota;
  assert.match(saveAutosave(bundle("Retry"), state.session), /Shared autosave could not/);
  state.localStorage.setItem = setItem;
  assert.equal(saveAutosave(bundle("Retry"), state.session), null);
});

test("autosave: legacy recovery does not require a successful migration write", () => {
  const state = mount();
  state.localStorage.setItem(legacyKey, JSON.stringify(bundle("Legacy")));
  state.localStorage.setItem = quota;
  assert.equal(loadAutosaveRaw().doc.nodes[0].title, "Legacy");
  assert.equal(loadAutosaveRaw(state.session).doc.nodes[0].title, "Legacy");
});

test("autosave: no-argument recovery controls use this tab and leave another tab's checkpoint intact", () => {
  const first = mount();
  assert.equal(saveAutosave(bundle("First tab"), first.session), null);
  const second = mount(first.localStorage);
  assert.equal(saveAutosave(bundle("Second tab"), second.session), null);
  const shared = first.localStorage.getItem(key);
  globalThis.window = first;
  assert.equal(loadAutosaveRaw().doc.nodes[0].title, "First tab");
  clearAutosave();
  assert.equal(first.sessionStorage.getItem(key), null);
  assert.equal(first.localStorage.getItem(key), shared);
  assert.equal(second.sessionStorage.getItem(key), shared);
});

test("autosave: no-argument standalone save, recovery and discard match the exact embedded seed", () => {
  const seed = { doc: { id: "original-export" } };
  globalThis.document = { getElementById: id => id === "ps-embedded-doc" ? { textContent: JSON.stringify(seed) } : null };
  const first = mount(undefined, undefined, seed);
  assert.equal(saveAutosave(bundle("Edited export")), null);
  assert.equal(loadAutosaveRaw().doc.nodes[0].title, "Edited export");
  const other = mount(first.localStorage, undefined, { doc: { id: "different-export" } });
  assert.equal(saveAutosave(bundle("Other export"), other.session), null);
  const unrelated = first.localStorage.getItem(key);
  globalThis.window = first;
  assert.equal(loadAutosaveRaw().doc.nodes[0].title, "Edited export");
  clearAutosave();
  assert.equal(first.sessionStorage.getItem(key), null);
  assert.equal(first.localStorage.getItem(key), unrelated);
  assert.equal(loadAutosaveRaw(), null, "Discard never falls through to another export's model");
});
