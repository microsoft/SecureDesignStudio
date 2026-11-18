import "./collaboration-loader.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import { modelFixture } from "../browser/fixture.mjs";
const { declutterDocument } = await import("../../src/declutterLayout.ts");
const { normalizeDoc } = await import("../../src/store.tsx");
const { createYShape } = await import("../../src/collab/yDoc.ts");
const { reconcileLocalToY, buildDocFromY } = await import("../../src/collab/reconcile.ts");
const { containsRect, nodeRect } = await import("../../src/boundaryGeometry.ts");

const inputFor = doc => ({
  nodes: doc.nodes, boundaries: doc.boundaries, annotations: doc.textAnnotations ?? [],
  edges: doc.edges.map(edge => ({ ...edge, labelSize: { width: 360, height: 48 } })),
});
const meaning = doc => ({
  ...doc,
  nodes: doc.nodes.map(({ position, ...rest }) => rest),
  edges: doc.edges.map(({ sourceHandle, targetHandle, waypoints, ...rest }) => rest),
  boundaries: doc.boundaries.map(({ position, size, ...rest }) => rest),
  ...(doc.textAnnotations ? { textAnnotations: doc.textAnnotations.map(({ position, ...rest }) => rest) } : {}),
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
