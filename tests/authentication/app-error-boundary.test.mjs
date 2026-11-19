// A render error must not leave a blank page, and a crafted autosaved model
// must not make the app unrecoverable after every reload (audit S4).
import "./collaboration-loader.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { AppErrorBoundary } = await import("../../src/components/AppErrorBoundary.tsx");

function fallback(state) {
  const boundary = new AppErrorBoundary({ children: null });
  boundary.state = { ...boundary.state, ...AppErrorBoundary.getDerivedStateFromError(new Error("synthetic")), ...state };
  return { boundary, markup: renderToStaticMarkup(boundary.render()) };
}

test("regression: a render error shows recovery actions instead of a blank page", () => {
  assert.deepEqual(AppErrorBoundary.getDerivedStateFromError(new Error("x")).failed, true);
  const { markup } = fallback();
  assert.match(markup, /role="alert"/);
  assert.match(markup, /Reload/);
  assert.match(markup, /Download the autosaved model/);
  assert.match(markup, /Discard the autosaved model/);
  // The error text is not echoed: it can carry model content.
  assert.doesNotMatch(markup, /synthetic/);
});

test("regression: discarding the autosave needs a second, explicit confirmation", () => {
  const removed = [];
  const saved = new Map([["secure-design-studio:autosave:v1", JSON.stringify({
    version: 1, doc: { nodes: [], scenarios: [] }, past: [], future: [], view: {},
  })]]);
  let reloads = 0;
  const previous = globalThis.window;
  globalThis.window = {
    localStorage: {
      removeItem: key => { removed.push(key); saved.delete(key); },
      getItem: key => saved.get(key) ?? null,
      setItem: (key, value) => saved.set(key, value),
    },
    location: { reload: () => { reloads++; } },
  };
  try {
    const first = fallback();
    first.boundary.setState = update => Object.assign(first.boundary.state, update);
    first.boundary.requestDiscard();
    assert.equal(removed.length, 0, "first click only asks");
    assert.match(renderToStaticMarkup(first.boundary.render()), /Confirm discard/);
    first.boundary.confirmDiscard();
    assert.ok(removed.includes("secure-design-studio:autosave:v1"));
    assert.equal(reloads, 1);
  } finally {
    globalThis.window = previous;
  }
});

for (const sameSeed of [true, false]) {
  test(`regression: standalone crash recovery keeps another tab's ${sameSeed ? "same-export" : "different-export"} checkpoint`, async t => {
    const key = "secure-design-studio:autosave:v1";
    const seed = { format: "secure-design-studio-diagram", version: 2,
      doc: { version: 1, nodes: [{ id: "n_saved", title: "Exported model" }], scenarios: [] } };
    const current = {
      version: 1, source: JSON.stringify(seed),
      doc: { ...seed.doc, nodes: [{ id: "n_saved", title: "This tab edit" }] },
      past: [seed.doc], future: [], view: { activeScenarioId: null, filter: {} },
    };
    const otherSeed = sameSeed ? seed : { ...seed, doc: { ...seed.doc, nodes: [] } };
    const newer = { ...current, source: JSON.stringify(otherSeed),
      doc: { ...seed.doc, nodes: [{ id: "n_other", title: "Another tab edit" }] } };
    const shared = new Map([[key, JSON.stringify(newer)]]);
    const tab = new Map([[key, JSON.stringify(current)]]);
    const storage = entries => ({
      getItem: key => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: key => entries.delete(key),
    });
    const previousWindow = globalThis.window, previousDocument = globalThis.document;
    let reloads = 0, downloads = 0, downloaded;
    const link = { href: "", download: "", click: () => { downloads++; } };
    globalThis.window = {
      localStorage: storage(shared), sessionStorage: storage(tab),
      location: { reload: () => { reloads++; } },
    };
    globalThis.document = {
      getElementById: id => id === "ps-embedded-doc" ? { textContent: JSON.stringify(seed) } : null,
      createElement: tag => { assert.equal(tag, "a"); return link; },
    };
    t.after(() => {
      if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
      if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
    });
    t.mock.method(URL, "createObjectURL", blob => { downloaded = blob; return "blob:synthetic-recovery"; });
    const { boundary } = fallback();
    boundary.setState = update => Object.assign(boundary.state, update);
    boundary.downloadAutosave();
    assert.equal(downloads, 1);
    assert.equal(link.download, "secure-design-studio-autosave.json");
    assert.deepEqual(JSON.parse(await downloaded.text()), {
      version: current.version, doc: current.doc, past: current.past, future: current.future, view: current.view,
    }, "The actual recovery action downloads this tab's complete model and history");
    boundary.requestDiscard();
    assert.equal(tab.get(key), JSON.stringify(current), "The first action does not discard recovery");
    boundary.confirmDiscard();
    assert.equal(tab.has(key), false);
    assert.equal(shared.get(key), JSON.stringify(newer), "Another tab's newer checkpoint is not discarded");
    assert.equal(reloads, 1);
    if (!sameSeed) {
      boundary.downloadAutosave();
      assert.equal(downloads, 1, "Recovery never downloads an unrelated export after discard");
    }
  });
}

test("regression: the app root is wrapped in the error boundary", async () => {
  const { readFile } = await import("node:fs/promises");
  const main = await readFile(new URL("../../src/main.tsx", import.meta.url), "utf8");
  assert.match(main, /<AppErrorBoundary>[\s\S]*<App \/>[\s\S]*<\/AppErrorBoundary>/);
});
