import "./collaboration-loader.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import { unzipSync, strFromU8 } from "fflate";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { modelFixture } from "../browser/fixture.mjs";
const { declutterDocument, applyScenarioDeclutter, scenarioDocument, updateScenarioDocument, pruneScenarioLayouts } = await import("../../src/declutterLayout.ts");
const { normalizeDoc } = await import("../../src/store.tsx");
const { createYShape } = await import("../../src/collab/yDoc.ts");
const { reconcileLocalToY, buildDocFromY } = await import("../../src/collab/reconcile.ts");
const { containsRect, nodeRect } = await import("../../src/boundaryGeometry.ts");
const { exportTm7 } = await import("../../src/tm7Export.ts");
const { exportVsdx } = await import("../../src/vsdxExport.ts");
const { flowEdgePath } = await import("../../src/components/FlowEdge.tsx");

const canonical = doc => Object.fromEntries(Object.entries(doc).map(([key, value]) => [key,
  Array.isArray(value) ? value.toSorted((a, b) => a.id.localeCompare(b.id)) : value]));
const boundary = (id, nodeIds) => ({ id, nodeIds, position: { x: -40, y: -40 }, size: { width: 600, height: 400 } });
const arrangeScenario = (doc, id) => {
  const scenario = doc.scenarios.find(item => item.id === id);
  const drawing = scenarioDocument(doc, id);
  return applyScenarioDeclutter(doc, {
    nodes: drawing.nodes.filter(node => scenario.nodeIds.includes(node.id)),
    edges: drawing.edges.filter(edge => scenario.edgeIds.includes(edge.id))
      .map(edge => ({ ...edge, labelSize: { width: 360, height: 48 } })),
    boundaries: drawing.boundaries.filter(boundary => scenario.boundaryIds.includes(boundary.id)),
    annotations: (drawing.textAnnotations ?? []).filter(annotation => scenario.textAnnotationIds?.includes(annotation.id)),
  }, id);
};

test("Optimize: shared entities retain independent scenario geometry through edits and native normalization", () => {
  const original = normalizeDoc(modelFixture().doc);
  original.scenarios[1].edgeIds.push("e_request");
  original.scenarios[1].nodeIds.push("n_client");
  original.scenarios[1].edgeNumbers.e_request = 2;
  const first = arrangeScenario(original, "s_primary");
  const firstDrawing = scenarioDocument(first, "s_primary");
  const both = arrangeScenario(first, "s_archive");
  assert.deepEqual(scenarioDocument(both, "s_primary"), { ...firstDrawing, scenarios: both.scenarios });
  assert.notDeepEqual(both.scenarios[0].layout.nodes.n_api, both.scenarios[1].layout.nodes.n_api);
  assert.notDeepEqual(both.scenarios[0].layout.edges.e_request, both.scenarios[1].layout.edges.e_request);
  assert.deepEqual(both.nodes, original.nodes, "Shared baseline geometry is not overwritten");
  assert.deepEqual(both.edges, original.edges);
  assert.equal(arrangeScenario(both, "s_primary"), both, "Repeated Optimize is a no-op");
  const edited = updateScenarioDocument(both, "s_primary", doc => ({
    ...doc,
    nodes: doc.nodes.map(node => node.id === "n_api"
      ? { ...node, title: "Shared edit", position: { x: 901, y: 502 } } : node),
    edges: doc.edges.map(edge => edge.id === "e_request" ? { ...edge, waypoints: [] } : edge),
  }));
  assert.deepEqual(edited.nodes.find(node => node.id === "n_api").position, original.nodes[1].position);
  assert.equal(scenarioDocument(edited, "s_archive").nodes[1].title, "Shared edit");
  assert.deepEqual(edited.scenarios[1].layout, both.scenarios[1].layout);
  assert.deepEqual(scenarioDocument(edited, "s_primary").nodes[1].position, { x: 901, y: 502 });
  assert.deepEqual(scenarioDocument(edited, "s_primary").edges[0].waypoints, []);
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeDoc(JSON.parse(JSON.stringify(edited))))),
    JSON.parse(JSON.stringify(edited)));
  assert.equal(scenarioDocument(original, "s_primary"), original, "Legacy files use their shared arrangement");
  assert.equal(scenarioDocument(edited, null), edited, "Show all uses the baseline");
});

test("Optimize: boundary and annotation edits are local, removed members do not retain stale layouts", () => {
  const original = normalizeDoc(modelFixture().doc);
  original.boundaries = [{ ...boundary("b_shared", original.nodes.map(node => node.id)), type: "security", title: "Shared" }];
  original.textAnnotations = [{ id: "a_shared", text: "Synthetic", position: { x: 0, y: 0 }, size: { width: 300, height: 120 } }];
  for (const scenario of original.scenarios) {
    scenario.boundaryIds = ["b_shared"];
    scenario.textAnnotationIds = ["a_shared"];
  }
  const arranged = arrangeScenario(arrangeScenario(original, "s_primary"), "s_archive");
  const edited = updateScenarioDocument(arranged, "s_primary", doc => ({
    ...doc,
    boundaries: doc.boundaries.map(item => ({ ...item, position: { x: -300, y: -400 }, size: { width: 2000, height: 1400 } })),
    textAnnotations: doc.textAnnotations.map(item => ({ ...item, position: { x: 123, y: 456 }, text: "Shared text" })),
  }));
  assert.deepEqual(edited.scenarios[1].layout, arranged.scenarios[1].layout);
  assert.deepEqual(edited.boundaries, original.boundaries);
  assert.deepEqual(scenarioDocument(edited, "s_primary").textAnnotations[0].position, { x: 123, y: 456 });
  assert.equal(scenarioDocument(edited, "s_archive").textAnnotations[0].text, "Shared text");
  const removed = pruneScenarioLayouts({ ...edited, scenarios: edited.scenarios.map(scenario => ({
    ...scenario, nodeIds: [], edgeIds: [], boundaryIds: [], textAnnotationIds: [],
  })) });
  for (const scenario of removed.scenarios) {
    assert.deepEqual(scenario.layout, { nodes: {}, edges: {}, boundaries: {}, annotations: {} });
  }
});

test("Optimize: invalid saved scenario geometry rejects the whole import instead of dropping the layout", () => {
  const arranged = arrangeScenario(normalizeDoc(modelFixture().doc), "s_primary");
  const mutations = [
    layout => { layout.nodes.n_api.position.x = "not-a-number"; },
    layout => { layout.nodes.n_api.size = { width: -1, height: 10 }; },
    layout => { layout.edges.e_request.compactLabel = "true"; },
    layout => { layout.edges.e_request.waypoints.push({ ...layout.edges.e_request.waypoints[0] }); },
    layout => { layout.boundaries = []; },
  ];
  for (const mutate of mutations) {
    const invalid = structuredClone(arranged);
    mutate(invalid.scenarios[0].layout);
    assert.throws(() => normalizeDoc(invalid), /Invalid scenario layout/);
  }
});

test("Optimize: simultaneous independent scenario layouts survive synthetic peer merge and reconnect", () => {
  const original = normalizeDoc(modelFixture().doc);
  const a = createYShape(new Y.Doc()), b = createYShape(new Y.Doc()), reconnect = createYShape(new Y.Doc());
  try {
    reconcileLocalToY(a, original);
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    const first = arrangeScenario(buildDocFromY(a), "s_primary");
    const second = arrangeScenario(buildDocFromY(b), "s_archive");
    reconcileLocalToY(a, first);
    reconcileLocalToY(b, second);
    Y.applyUpdate(a.ydoc, Y.encodeStateAsUpdate(b.ydoc));
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    Y.applyUpdate(reconnect.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    const merged = buildDocFromY(reconnect);
    assert.deepEqual(merged.scenarios.find(s => s.id === "s_primary").layout,
      JSON.parse(JSON.stringify(first.scenarios.find(s => s.id === "s_primary").layout)));
    assert.deepEqual(merged.scenarios.find(s => s.id === "s_archive").layout,
      JSON.parse(JSON.stringify(second.scenarios.find(s => s.id === "s_archive").layout)));
    assert.deepEqual(canonical(buildDocFromY(a)), canonical(buildDocFromY(b)));
  } finally {
    a.ydoc.destroy(); b.ydoc.destroy(); reconnect.ydoc.destroy();
  }
});

test("Optimize: TM7 tabs and Visio pages export each shared scenario's geometry without mutating the baseline", () => {
  const original = normalizeDoc(modelFixture().doc);
  original.scenarios[1].nodeIds.push("n_client");
  original.scenarios[1].edgeIds.push("e_request");
  original.scenarios[1].edgeNumbers.e_request = 2;
  const arranged = arrangeScenario(arrangeScenario(original, "s_primary"), "s_archive");
  const before = structuredClone(arranged);
  const surfaces = xml => [...new DOMParser().parseFromString(xml, "text/xml")
    .getElementsByTagNameNS("*", "DrawingSurfaceModel")]
    .map(surface => new XMLSerializer().serializeToString(surface));
  const tabs = surfaces(exportTm7(arranged));
  const pages = unzipSync(exportVsdx(arranged));
  for (const [index, scenario] of arranged.scenarios.entries()) {
    const projected = scenarioDocument(arranged, scenario.id);
    const flattened = { ...projected, scenarios: projected.scenarios.map(({ layout, ...rest }) => rest) };
    assert.equal(tabs[index], surfaces(exportTm7(flattened))[index]);
    const path = `visio/pages/page${index + 1}.xml`;
    assert.equal(strFromU8(pages[path]), strFromU8(unzipSync(exportVsdx(flattened))[path]));
  }
  assert.notEqual(tabs[0], surfaces(exportTm7(original))[0], "TM7 uses saved geometry, not the shared baseline");
  assert.notEqual(strFromU8(pages["visio/pages/page1.xml"]),
    strFromU8(unzipSync(exportVsdx(original))["visio/pages/page1.xml"]));
  assert.deepEqual(arranged, before, "exports are read-only");
});

const inputFor = doc => ({
  nodes: doc.nodes, boundaries: doc.boundaries, annotations: doc.textAnnotations ?? [],
  edges: doc.edges.map(edge => ({ ...edge, labelSize: { width: 360, height: 48 } })),
});
const meaning = doc => ({
  ...doc,
  nodes: doc.nodes.map(({ position, ...rest }) => rest),
  edges: doc.edges.map(({ sourceHandle, targetHandle, waypoints, compactLabel, ...rest }) => rest),
  boundaries: doc.boundaries.map(({ position, size, ...rest }) => rest),
  ...(doc.textAnnotations ? { textAnnotations: doc.textAnnotations.map(({ position, ...rest }) => rest) } : {}),
});

test("Optimize: saved routes avoid spline overshoot and duplicate render segments while manual routes remain splines", () => {
  const points = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 0 },
    { x: 600, y: 20 }, { x: 610, y: 20 }];
  const original = structuredClone(points);
  assert.equal(flowEdgePath(points, true), "M 0,0 L 600,0 L 600,20 L 610,20");
  assert.match(flowEdgePath(points), / C /);
  assert.deepEqual(points, original, "render deduplication does not change saved waypoints or label anchor");
  const doc = normalizeDoc(modelFixture().doc);
  doc.edges[0].compactLabel = true;
  assert.equal(normalizeDoc(JSON.parse(JSON.stringify(doc))).edges[0].compactLabel, true);
  doc.edges[0].compactLabel = false;
  assert.equal(normalizeDoc(doc).edges[0].compactLabel, false);
  doc.edges[0].compactLabel = "true";
  assert.throws(() => normalizeDoc(doc), /optimized route metadata/);
});

test("Optimize: scenario boundaries ignore remote other-scenario members without changing global containment", () => {
  const doc = normalizeDoc(modelFixture().doc);
  doc.nodes[2].position = { x: 9000, y: 7000 };
  doc.boundaries = [{ ...boundary("shared_boundary", ["n_api", "n_archive"]),
    size: { width: 10000, height: 8000 }, title: "Shared", type: "security" }];
  for (const scenario of doc.scenarios) scenario.boundaryIds = ["shared_boundary"];
  const original = structuredClone(doc);
  const other = arrangeScenario(doc, "s_archive");
  const local = arrangeScenario(other, "s_primary");
  const drawing = scenarioDocument(local, "s_primary");
  const visibleOnly = {
    ...doc, nodes: doc.nodes.slice(0, 2), edges: doc.edges.slice(0, 2),
    boundaries: doc.boundaries.map(item => ({ ...item, nodeIds: ["n_api"] })),
  };
  const expected = declutterDocument(visibleOnly, inputFor(visibleOnly));
  assert.deepEqual(drawing.boundaries[0], { ...expected.boundaries[0], nodeIds: ["n_api", "n_archive"] });
  assert.ok(containsRect(drawing.boundaries[0], nodeRect(drawing.nodes[1])));
  assert.ok(!containsRect(drawing.boundaries[0], nodeRect(doc.nodes[2])), "remote member does not inflate the saved border");
  assert.deepEqual(local.boundaries, doc.boundaries);
  assert.deepEqual(local.nodes, doc.nodes);
  assert.deepEqual(local.scenarios[1].layout, other.scenarios[1].layout);
  assert.equal(arrangeScenario(local, "s_primary"), local);
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeDoc(JSON.parse(JSON.stringify(local))))),
    JSON.parse(JSON.stringify(local)));
  const filteredGlobal = declutterDocument(doc, inputFor({ ...doc, nodes: doc.nodes.slice(0, 2), edges: doc.edges.slice(0, 2) }));
  assert.ok(containsRect(filteredGlobal.boundaries[0], nodeRect(doc.nodes[2])), "default filtered global containment is preserved");
  const all = applyScenarioDeclutter(doc, inputFor(doc), null);
  for (const id of all.boundaries[0].nodeIds) {
    assert.ok(containsRect(all.boundaries[0], nodeRect(all.nodes.find(node => node.id === id))));
  }
  assert.deepEqual(all.scenarios, doc.scenarios);
  assert.deepEqual(doc, original);
});

test("Declutter separates measured labels and nodes for parallel, cyclic, self and disconnected flows without semantic changes", () => {
  const doc = normalizeDoc(modelFixture().doc);
  doc.edges.push(
    { ...doc.edges[0], id: "e_cycle", source: "n_api", target: "n_client" },
    { ...doc.edges[0], id: "e_self", source: "n_api", target: "n_api" },
  );
  const original = structuredClone(doc);
  const next = declutterDocument(doc, inputFor(doc));
  assert.deepEqual(doc, original, "input is immutable");
  assert.deepEqual(meaning(next), meaning(doc));
  const rects = [
    ...next.nodes.map(node => nodeRect(node)),
    ...next.edges.map(edge => {
      const center = edge.waypoints[Math.floor((edge.waypoints.length - 1) / 2)];
      assert.ok(center, "label is anchored to an ordinary editable waypoint");
      return { position: { x: center.x - 180, y: center.y - 24 }, size: { width: 360, height: 48 } };
    }),
  ];
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    assert.ok(a.position.x + a.size.width <= b.position.x || b.position.x + b.size.width <= a.position.x ||
      a.position.y + a.size.height <= b.position.y || b.position.y + b.size.height <= a.position.y,
    `rectangles ${i} and ${j} do not overlap`);
  }
  assert.strictEqual(declutterDocument(next, inputFor(next)), next, "repeat click is a no-op, including waypoint IDs");
});

test("Declutter limits changes to the supplied visible scope and preserves hidden members of shared boundaries", () => {
  const doc = normalizeDoc(modelFixture().doc);
  doc.boundaries = [{
    id: "b_shared", title: "Shared", type: "security", nodeIds: ["n_api", "n_archive"],
    position: { x: 300, y: 80 }, size: { width: 1000, height: 300 },
  }];
  const input = inputFor(doc);
  input.nodes = doc.nodes.slice(0, 2);
  input.edges = input.edges.slice(0, 2);
  input.boundaries = [];
  const next = declutterDocument(doc, input);
  assert.deepEqual(meaning(next), meaning(doc));
  assert.strictEqual(next.nodes[2], doc.nodes[2]);
  assert.strictEqual(next.edges[2], doc.edges[2]);
  for (const id of doc.boundaries[0].nodeIds) {
    assert.ok(containsRect(next.boundaries[0], nodeRect(next.nodes.find(node => node.id === id))));
  }
  assert.deepEqual(next.scenarios, doc.scenarios);
});

test("Declutter retains nested boundary membership, empty boundaries and annotation content", () => {
  const doc = normalizeDoc(modelFixture().doc);
  const boundary = (id, nodeIds) => ({
    id, nodeIds, title: id, type: "security",
    position: { x: 0, y: 0 }, size: { width: 1100, height: 400 },
  });
  doc.boundaries = [
    boundary("outer", ["n_client", "n_api"]), boundary("inner", ["n_api"]), boundary("empty", []),
  ];
  doc.textAnnotations = [{
    id: "a1", text: "Authored\nannotation", position: { x: 0, y: 0 }, size: { width: 280, height: 120 },
  }];
  const next = declutterDocument(doc, inputFor(doc));
  assert.deepEqual(meaning(next), meaning(doc));
  for (const b of next.boundaries) for (const id of b.nodeIds) {
    assert.ok(containsRect(b, nodeRect(next.nodes.find(node => node.id === id))));
  }
});

test("Declutter rejects crossing boundary memberships before mutation and leaves empty diagrams unchanged", () => {
  const doc = normalizeDoc(modelFixture().doc);
  doc.boundaries = [["n_client", "n_api"], ["n_api", "n_archive"]].map((nodeIds, i) => ({
    id: `b${i}`, nodeIds, title: "Crossing", type: "security",
    position: { x: 0, y: 0 }, size: { width: 1100, height: 400 },
  }));
  const original = structuredClone(doc);
  assert.throws(() => declutterDocument(doc, inputFor(doc)), /Overlapping memberships.*unchanged/);
  assert.deepEqual(doc, original);
  const empty = { ...doc, nodes: [], edges: [], boundaries: [] };
  assert.strictEqual(declutterDocument(empty, inputFor(empty)), empty);
});

test("Declutter geometry round-trips through normalization and synthetic collaborative persistence without a schema field", () => {
  const doc = normalizeDoc(modelFixture().doc);
  const next = declutterDocument(doc, inputFor(doc));
  assert.deepEqual(normalizeDoc(JSON.parse(JSON.stringify(next))), next);
  const ydoc = new Y.Doc();
  try {
    const shape = createYShape(ydoc);
    reconcileLocalToY(shape, next);
    const ordered = Object.fromEntries(Object.entries(next).map(([key, value]) => [
      key, Array.isArray(value) ? value.toSorted((a, b) => a.id.localeCompare(b.id)) : value,
    ]));
    assert.deepEqual(normalizeDoc(buildDocFromY(shape)), ordered);
  } finally { ydoc.destroy(); }
});
