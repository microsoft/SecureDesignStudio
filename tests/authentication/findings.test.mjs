import "./collaboration-loader.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const { emptyDocument } = await import("../../src/types.ts");
const { normalizeDoc, StoreProvider, useStore } = await import("../../src/store.tsx");
const { UiShellProvider } = await import("../../src/uiShell.tsx");
const { captureFindings } = await import("../../src/findings.ts");
const { createYShape, isYShapeEmpty } = await import("../../src/collab/yDoc.ts");
const { reconcileLocalToY, reconcileCurrentDocumentToY, buildDocFromY } = await import("../../src/collab/reconcile.ts");
const { saveAutosave, loadAutosaveRaw } = await import("../../src/autosave.ts");
const { capturePristineHtml, buildStandaloneHtml, readEmbeddedDoc } = await import("../../src/embeddedDoc.ts");
const { diffDocuments } = await import("../../src/diff.ts");

const reference = { kind: "node", id: "n_missing", label: "Original missing node" };
const finding = {
  id: "f_saved", title: "Repeated finding title", severity: "high", category: "Synthetic",
  rationale: "  Complete rationale\r\n</script><script>untrusted</script> \u03a9  ",
  recommendation: "Full recommendation", references: [reference], status: "Resolved", accepted: true,
  focusReference: reference, issueReference: reference, workItemType: "Task", weaknessType: "",
  guidanceReferences: [{ typeId: "synthetic", definitionSource: "saved", revision: 3,
    updatedOn: "2026-11-19", sources: ["https://example.invalid/reference"] }],
};
const analysis = { scenarioId: "s_missing", scenarioName: "Original scenario", createdAt: 1234, answer: "Original answer" };
const fixture = () => normalizeDoc({ ...emptyDocument(), findings: [finding], findingAnalysis: analysis });

test("saved findings: optional legacy state, complete exact records and unavailable references round-trip", () => {
  assert.equal("findings" in normalizeDoc(emptyDocument()), false);
  assert.equal("findingAnalysis" in normalizeDoc(emptyDocument()), false);
  const doc = fixture();
  assert.deepEqual(doc.findings, [finding]);
  assert.deepEqual(doc.findingAnalysis, analysis);
  assert.deepEqual(normalizeDoc(JSON.parse(JSON.stringify(doc))), doc);
  const legacyStatus = { ...finding }; delete legacyStatus.status;
  assert.equal(normalizeDoc({ ...emptyDocument(), findings: [legacyStatus] }).findings[0].status, "Active");
  assert.deepEqual(normalizeDoc({ ...doc, findings: [] }).findings, []);
  assert.deepEqual(diffDocuments(emptyDocument(), doc), [], "Ordinary review findings, like issues, are not graph changes");
});

test("saved findings: malformed review state rejects rather than discarding authored evidence", () => {
  const changes = [
    doc => { doc.findings = {}; },
    doc => { doc.findings = null; },
    doc => { doc.findings.push(structuredClone(finding)); },
    ...["id", "title", "category", "rationale", "recommendation"].map(key => doc => { doc.findings[0][key] = null; }),
    ...["", "Open", null, 2].map(value => doc => { doc.findings[0].status = value; }),
    doc => { doc.findings[0].accepted = "true"; },
    doc => { doc.findings[0].severity = "Critical"; },
    doc => { doc.findings[0].workItemType = "Bug-like"; },
    doc => { doc.findings[0].weaknessType = 7; },
    doc => { doc.findings[0].references = {}; },
    doc => { doc.findings[0].references[0].kind = "scenario"; },
    doc => { doc.findings[0].focusReference = { ...reference, id: "another" }; },
    doc => { doc.findings[0].guidanceReferences = [null]; },
    doc => { doc.findings[0].guidanceReferences[0].sources = [7]; },
    doc => { doc.findings[0].guidanceReferences[0].revision = -1; },
    doc => { doc.findingAnalysis = null; },
    doc => { doc.findingAnalysis.scenarioId = ""; },
    ...[-1, NaN, Infinity, "1234", 1e30].map(value => doc => { doc.findingAnalysis.createdAt = value; }),
  ];
  for (const change of changes) {
    const doc = fixture(); change(doc);
    assert.throws(() => normalizeDoc(doc), /[Ff]inding/);
  }
});

for (const location of ["current", "past", "future", "embedded"]) {
  for (const field of ["findings", "findingAnalysis"]) {
    test(`saved findings: malformed ${field} in ${location} recovery pauses without overwriting evidence`, t => {
      const valid = fixture(), invalid = structuredClone(valid);
      if (field === "findings") invalid.findings[0].status = "invalid";
      else invalid.findingAnalysis.createdAt = -1;
      const oldWindow = globalThis.window, oldDocument = globalThis.document;
      const values = new Map(), raw = JSON.stringify({ version: 1,
        doc: location === "current" ? invalid : valid,
        past: location === "past" ? [invalid] : [], future: location === "future" ? [invalid] : [],
      });
      values.set("secure-design-studio:autosave:v1", raw);
      globalThis.window = { localStorage: {
        getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
      } };
      globalThis.document = { getElementById: id => id === "ps-embedded-doc" && location === "embedded"
        ? { textContent: JSON.stringify({ format: "secure-design-studio-diagram", version: 2, doc: invalid }) } : null };
      t.after(() => {
        if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
        if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
      });
      let store;
      function Probe() { store = useStore(); return null; }
      renderToStaticMarkup(createElement(UiShellProvider, null, createElement(StoreProvider, null, createElement(Probe))));
      assert.match(store.documentRecoveryError, /recovery is paused.*[Ff]inding/);
      assert.equal(values.get("secure-design-studio:autosave:v1"), raw);
    });
  }
}

test("saved findings: AI responses cannot set review decisions or substitute navigation targets", () => {
  const doc = normalizeDoc({ ...emptyDocument(), nodes: [
    { id: "n_present", title: "Present", type: "", position: { x: 0, y: 0 } },
  ] });
  const present = { kind: "node", id: "n_present", label: "Present" };
  const response = { ...finding, references: [reference, present] };
  const before = structuredClone(response);
  const captured = captureFindings([response], doc)[0];
  assert.equal(captured.status, "Active");
  assert.equal(captured.accepted, false);
  assert.deepEqual(captured.focusReference, present);
  assert.deepEqual(captured.issueReference, present);
  assert.deepEqual(response, before);
  doc.findings = [captured]; doc.nodes = [];
  assert.deepEqual(normalizeDoc(doc).findings[0].focusReference, present,
    "Removing a target never promotes another reference on reopen");
  assert.throws(() => captureFindings([response, response], doc), /unique/);
});

test("saved findings: synthetic peers merge review fields, deletion and reconnect without losing analysis", t => {
  const a = createYShape(), b = createYShape(), reconnected = createYShape();
  t.after(() => [a, b, reconnected].forEach(shape => shape.ydoc.destroy()));
  const initial = fixture();
  initial.findings.push({ ...finding, id: "f_second", status: "Active", accepted: false });
  assert.equal(isYShapeEmpty(a), true);
  reconcileLocalToY(a, initial);
  assert.equal(isYShapeEmpty(a), false);
  Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
  assert.deepEqual(buildDocFromY(b).findings, initial.findings);
  assert.deepEqual(buildDocFromY(b).findingAnalysis, analysis);
  const left = buildDocFromY(a), right = buildDocFromY(b);
  left.findings[0].status = "Active";
  right.findings[0].accepted = false;
  reconcileLocalToY(a, left);
  reconcileLocalToY(b, right);
  const updateA = Y.encodeStateAsUpdate(a.ydoc), updateB = Y.encodeStateAsUpdate(b.ydoc);
  Y.applyUpdate(a.ydoc, updateB); Y.applyUpdate(b.ydoc, updateA);
  assert.deepEqual(buildDocFromY(a), buildDocFromY(b));
  assert.equal(buildDocFromY(a).findings[0].status, "Active");
  assert.equal(buildDocFromY(a).findings[0].accepted, false);
  const deleted = buildDocFromY(a);
  deleted.findings = deleted.findings.filter(item => item.id !== "f_second");
  reconcileLocalToY(a, deleted);
  Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
  Y.applyUpdate(reconnected.ydoc, Y.encodeStateAsUpdate(b.ydoc));
  assert.deepEqual(buildDocFromY(reconnected).findings, deleted.findings);
  assert.deepEqual(buildDocFromY(reconnected).findingAnalysis, analysis);
});

test("saved findings: legacy partial writers retain review; current complete replacement clears it", t => {
  const shape = createYShape();
  t.after(() => shape.ydoc.destroy());
  const initial = fixture();
  reconcileCurrentDocumentToY(shape, initial);
  reconcileLocalToY(shape, emptyDocument());
  assert.deepEqual(buildDocFromY(shape).findings, initial.findings);
  assert.deepEqual(buildDocFromY(shape).findingAnalysis, analysis);
  const malformed = fixture(); malformed.findings[0].status = "invalid";
  const previous = Y.encodeStateAsUpdate(shape.ydoc);
  assert.throws(() => reconcileLocalToY(shape, malformed), /status/);
  assert.deepEqual(Y.encodeStateAsUpdate(shape.ydoc), previous, "Invalid review never partially changes the room");
  reconcileCurrentDocumentToY(shape, { ...initial, findings: [] });
  assert.deepEqual(buildDocFromY(shape).findings, []);
  assert.equal(isYShapeEmpty(shape), false, "A completed zero-finding analysis is not an empty room");
  reconcileCurrentDocumentToY(shape, emptyDocument());
  assert.deepEqual(buildDocFromY(shape).findings, []);
  assert.equal(buildDocFromY(shape).findingAnalysis, undefined);
});

test("saved findings: concurrent analyses never mix reused response IDs or scenario snapshots", t => {
  const a = createYShape(), b = createYShape();
  t.after(() => [a, b].forEach(shape => shape.ydoc.destroy()));
  reconcileLocalToY(a, fixture());
  Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
  const left = { ...fixture(), findingAnalysis: { ...analysis, id: "fa_left", scenarioId: "s_left" },
    findings: [{ ...finding, title: "Left analysis", status: "Active" }] };
  const right = { ...fixture(), findingAnalysis: { ...analysis, id: "fa_right", scenarioId: "s_right" },
    findings: [{ ...finding, title: "Right analysis", status: "Resolved" }, { ...finding, id: "f_right_only" }] };
  reconcileLocalToY(a, left);
  reconcileLocalToY(b, right);
  const updateA = Y.encodeStateAsUpdate(a.ydoc), updateB = Y.encodeStateAsUpdate(b.ydoc);
  Y.applyUpdate(a.ydoc, updateB); Y.applyUpdate(b.ydoc, updateA);
  const result = buildDocFromY(a);
  assert.deepEqual(result, buildDocFromY(b));
  const winner = result.findingAnalysis.id === "fa_left" ? left : right;
  assert.deepEqual(result.findingAnalysis, winner.findingAnalysis);
  assert.deepEqual([...result.findings].sort((a, b) => a.id.localeCompare(b.id)),
    [...winner.findings].sort((a, b) => a.id.localeCompare(b.id)));
});

test("saved findings: autosave/history and standalone HTML retain review without script injection", t => {
  const oldWindow = globalThis.window, oldDocument = globalThis.document;
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const storage = new Map();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } });
  globalThis.window = { localStorage: globalThis.localStorage };
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument;
    if (oldStorage) Object.defineProperty(globalThis, "localStorage", oldStorage); else delete globalThis.localStorage;
  });
  const doc = fixture(), deleted = { ...doc, findings: [] };
  const wrapper = { format: "secure-design-studio-diagram", version: 2, doc, view: { activeScenarioId: null, filter: {} } };
  saveAutosave({ doc, past: [deleted], future: [deleted], view: wrapper.view });
  const recovered = loadAutosaveRaw();
  assert.deepEqual(normalizeDoc(recovered.doc), doc);
  assert.deepEqual(recovered.past, [deleted]); assert.deepEqual(recovered.future, [deleted]);
  capturePristineHtml('<!doctype html><html><body><div id="root"></div></body></html>');
  const html = buildStandaloneHtml(JSON.stringify(wrapper));
  assert.equal(html.includes("</script><script>untrusted"), false);
  const payload = html.match(/<script[^>]*id="ps-embedded-doc"[^>]*>([\s\S]*?)<\/script>/)[1];
  globalThis.document = { getElementById: () => ({ textContent: payload }) };
  assert.deepEqual(readEmbeddedDoc(), wrapper);
  assert.deepEqual(normalizeDoc(readEmbeddedDoc().doc), doc);
});
