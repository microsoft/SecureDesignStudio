import "./collaboration-loader.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import * as Y from "yjs";
import { modelFixture } from "../browser/fixture.mjs";
const { createDeclutterLayout, applyDeclutterLayout, DECLUTTER_LABEL_SIZE } = await import("../../src/declutterLayout.ts");
const { normalizeDoc } = await import("../../src/store.tsx");
const { createYShape } = await import("../../src/collab/yDoc.ts");
const { reconcileLocalToY, buildDocFromY } = await import("../../src/collab/reconcile.ts");
const canonical = doc => Object.fromEntries(Object.entries(doc).map(([key, value]) => [
  key, Array.isArray(value) && value.every(item => item && typeof item.id === "string")
    ? [...value].sort((a, b) => a.id.localeCompare(b.id)) : value,
]));

const node = (id, x = 0) => ({ id, position: { x, y: 0 }, size: { width: 160, height: 64 } });
const edge = (id, source, target) => ({ id, source, target });
const boundary = (id, nodeIds) => ({ id, nodeIds, position: { x: -40, y: -40 }, size: { width: 600, height: 400 } });
const overlaps = (a, b) => a.position.x < b.position.x + b.size.width &&
  a.position.x + a.size.width > b.position.x && a.position.y < b.position.y + b.size.height &&
  a.position.y + a.size.height > b.position.y;
const labelRect = route => ({ position: {
  x: route.label.x - DECLUTTER_LABEL_SIZE.width / 2,
  y: route.label.y - DECLUTTER_LABEL_SIZE.height / 2,
}, size: DECLUTTER_LABEL_SIZE });
const contains = (a, b) => b.position.x >= a.position.x && b.position.y >= a.position.y &&
  b.position.x + b.size.width <= a.position.x + a.size.width &&
  b.position.y + b.size.height <= a.position.y + a.size.height;

function assertSeparated(result) {
  const obstacles = [...result.nodes.values(), ...result.annotations.values()];
  const labels = [...result.edges.values()].map(labelRect);
  for (let i = 0; i < labels.length; i++) {
    for (const rect of [...obstacles, ...labels.slice(i + 1)]) {
      assert.equal(overlaps(labels[i], rect), false, "Each label has its own space outside nodes and other labels");
    }
  }
  for (let i = 0; i < obstacles.length; i++) for (const rect of obstacles.slice(i + 1)) {
    assert.equal(overlaps(obstacles[i], rect), false, "Nodes and annotations do not overlap");
  }
}

test("Declutter: dense parallel, reverse, cyclic and self flows retain every ID with separated labels", () => {
  const input = {
    nodes: [node("a"), node("b", 300), node("c", 600), node("disconnected", -600)],
    edges: [
      ...Array.from({ length: 30 }, (_, i) => edge(`parallel-${i}`, "a", "b")),
      edge("reverse", "b", "a"), edge("next", "b", "c"), edge("cycle", "c", "a"),
      edge("self", "b", "b"),
    ], boundaries: [],
    annotations: [{ id: "note", position: { x: 0, y: 0 }, size: { width: 300, height: 120 } }],
  };
  const before = structuredClone(input);
  const result = createDeclutterLayout(input);
  assert.deepEqual(input, before, "Authored geometry and content are never mutated");
  assert.deepEqual(result, createDeclutterLayout(input), "Layout is deterministic");
  assert.equal(result.nodes.size, input.nodes.length);
  assert.deepEqual([...result.edges.keys()], input.edges.map(item => item.id));
  assertSeparated(result);
  for (const route of result.edges.values()) {
    assert.ok(route.points.length >= 3);
    assert.ok(route.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  }
});

test("Declutter: nested/equal boundaries contain exactly their visible members, including inter-group flows", () => {
  const input = { nodes: ["a", "b", "c", "outside"].map(id => node(id)),
    edges: [edge("inside", "a", "b"), edge("across", "b", "c"), edge("out", "c", "outside")],
    boundaries: [boundary("outer", ["a", "b", "c", "hidden"]), boundary("inner", ["a", "b"]),
      boundary("equal", ["a", "b"]), boundary("empty", [])], annotations: [] };
  const before = structuredClone(input);
  const result = createDeclutterLayout(input);
  assert.equal(result.notice, null);
  assertSeparated(result);
  for (const item of input.boundaries) for (const n of input.nodes) {
    assert.equal(contains(result.boundaries.get(item.id), result.nodes.get(n.id)), item.nodeIds.includes(n.id),
      `${item.id} must not imply a different membership for ${n.id}`);
  }
  assert.deepEqual(input, before);
});

test("Declutter: overlapping scopes retain authored geometry and explicitly disclose the partial layout", () => {
  const input = { nodes: [node("a"), node("shared", 250), node("b", 500)],
    edges: Array.from({ length: 12 }, (_, i) => edge(`e${i}`, "a", "shared")),
    boundaries: [boundary("left", ["a", "shared"]), boundary("right", ["shared", "b"])], annotations: [] };
  const before = structuredClone(input);
  const result = createDeclutterLayout(input);
  assert.match(result.notice, /Overlapping boundaries.*authored positions retained/);
  for (const n of input.nodes) assert.deepEqual(result.nodes.get(n.id), { position: n.position, size: n.size });
  for (const b of input.boundaries) assert.deepEqual(result.boundaries.get(b.id).position, b.position);
  assertSeparated(result);
  assert.deepEqual(input, before);
});

test("Declutter: empty/filtered views and colliding imported IDs do not invent endpoints or lose objects", () => {
  assert.equal(createDeclutterLayout({ nodes: [], edges: [], boundaries: [], annotations: [] }).edges.size, 0);
  const input = { nodes: [node("b0"), node("a0")], edges: [edge("n0", "b0", "a0"), edge("hidden", "b0", "not-visible")],
    boundaries: [boundary("n0", ["b0"])],
    annotations: [{ id: "e0", position: { x: -100, y: -100 }, size: { width: 120, height: 80 } }] };
  const result = createDeclutterLayout(input);
  assert.deepEqual([...result.edges.keys()], ["n0"]);
  assert.equal(result.nodes.size, 2);
  assert.equal(result.boundaries.size, 1);
  assert.equal(result.annotations.size, 1);
});

test("Declutter: saved geometry uses native editable waypoints and retains hidden boundary members and model facts", () => {
  const doc = normalizeDoc(modelFixture().doc);
  doc.edges.push({ ...doc.edges[0], id: "synthetic-self", target: doc.edges[0].source });
  doc.boundaries = [{ id: "shared", type: "security", title: "Shared boundary",
    nodeIds: doc.nodes.map(node => node.id), position: { x: -100, y: -100 }, size: { width: 1400, height: 900 } }];
  const before = structuredClone(doc);
  const input = { nodes: doc.nodes.slice(0, 2), edges: doc.edges,
    boundaries: doc.boundaries, annotations: [] };
  const layout = createDeclutterLayout(input);
  const saved = applyDeclutterLayout(doc, layout);
  assert.deepEqual(doc, before);
  assert.deepEqual(saved.scenarios, before.scenarios);
  assert.deepEqual(saved.data, before.data);
  assert.deepEqual(saved.comments, before.comments);
  assert.deepEqual(saved.issues, before.issues);
  assert.deepEqual(saved.nodes.at(-1), before.nodes.at(-1), "Hidden nodes stay where authored");
  for (const id of saved.boundaries[0].nodeIds) {
    const node = saved.nodes.find(node => node.id === id);
    assert.ok(contains(saved.boundaries[0], { position: node.position, size: node.size }));
  }
  for (const edge of saved.edges) {
    const route = layout.edges.get(edge.id);
    if (!route) {
      assert.deepEqual(edge, before.edges.find(item => item.id === edge.id));
      continue;
    }
    const middle = edge.waypoints[Math.floor((edge.waypoints.length - 1) / 2)];
    assert.deepEqual({ x: middle.x, y: middle.y }, route.label);
    assert.equal(new Set(edge.waypoints.map(point => point.id)).size, edge.waypoints.length);
    assert.equal(edge.compactLabel, true);
    const original = before.edges.find(item => item.id === edge.id);
    for (const key of ["title", "description", "metadata", "authenticationTypes", "audience", "constraints"]) {
      assert.deepEqual(edge[key], original[key]);
    }
  }
  assert.deepEqual(normalizeDoc(JSON.parse(JSON.stringify(saved))), saved);
  const invalid = structuredClone(saved);
  invalid.edges[0].compactLabel = "not-a-boolean";
  assert.throws(() => normalizeDoc(invalid), /Invalid compact label/);
});

test("Declutter: saved layout and compact labels survive synthetic collaboration, peer edits and reconnect", () => {
  const doc = normalizeDoc(modelFixture().doc);
  const saved = applyDeclutterLayout(doc, createDeclutterLayout({
    nodes: doc.nodes, edges: doc.edges, boundaries: doc.boundaries, annotations: [],
  }));
  const a = createYShape(new Y.Doc());
  const b = createYShape(new Y.Doc());
  const reconnect = createYShape(new Y.Doc());
  try {
    reconcileLocalToY(a, saved);
    Y.applyUpdate(b.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    assert.deepEqual(canonical(buildDocFromY(b)), canonical(normalizeDoc(saved)));
    const edited = buildDocFromY(b);
    edited.edges[0].description = "Unrelated peer edit";
    reconcileLocalToY(b, edited);
    Y.applyUpdate(a.ydoc, Y.encodeStateAsUpdate(b.ydoc));
    Y.applyUpdate(reconnect.ydoc, Y.encodeStateAsUpdate(a.ydoc));
    const received = buildDocFromY(reconnect);
    assert.equal(received.edges[0].description, "Unrelated peer edit");
    for (const edge of saved.edges) {
      const peer = received.edges.find(item => item.id === edge.id);
      assert.equal(peer.compactLabel, true);
      assert.deepEqual(peer.waypoints, edge.waypoints);
    }
    assert.deepEqual(canonical(received).nodes, canonical(normalizeDoc(saved)).nodes);
  } finally {
    a.ydoc.destroy();
    b.ydoc.destroy();
    reconnect.ydoc.destroy();
  }
});
