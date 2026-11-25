import { Graph, layout, type EdgeLabel, type GraphLabel, type NodeLabel } from "@dagrejs/dagre";
import { DEFAULT_NODE_SIZE, expandRectToContain, nodeRect, type Rect } from "./boundaryGeometry";
import { uid, type Position, type PsDocument, type Scenario, type ScenarioLayout, type Size, type Waypoint } from "./types";

export interface DeclutterInput {
  nodes: { id: string; size?: Size }[];
  edges: { id: string; source: string; target: string; labelSize: Size }[];
  boundaries: { id: string; size: Size; nodeIds: string[] }[];
  annotations: { id: string; size: Size }[];
}

function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

function handleFor(point: Position, rect: Rect): "top" | "right" | "bottom" | "left" {
  return [
    { side: "top" as const, distance: Math.abs(point.y - rect.position.y) },
    { side: "right" as const, distance: Math.abs(point.x - rect.position.x - rect.size.width) },
    { side: "bottom" as const, distance: Math.abs(point.y - rect.position.y - rect.size.height) },
    { side: "left" as const, distance: Math.abs(point.x - rect.position.x) },
  ].sort((a, b) => a.distance - b.distance)[0].side;
}

function savedWaypoints(points: Position[], label: Position, previous: Waypoint[]): Waypoint[] {
  const interior = points.slice(1, -1);
  let center = interior.findIndex(point => samePosition(point, label));
  if (center < 0) {
    center = Math.floor(interior.length / 2);
    interior.splice(center, 0, label);
  }
  const left = [points[0], ...interior.slice(0, center), label];
  const right = [label, ...interior.slice(center + 1), points[points.length - 1]];
  // FlowEdge anchors its label to the middle waypoint. Balance the route
  // halves by subdividing segments, keeping every bend and the label center.
  const subdivide = (half: Position[]) => {
    let longest = 0;
    const length = (i: number) => Math.hypot(half[i + 1].x - half[i].x, half[i + 1].y - half[i].y);
    for (let i = 1; i < half.length - 1; i++) {
      if (length(i) > length(longest)) longest = i;
    }
    const a = half[longest], b = half[longest + 1];
    half.splice(longest + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  };
  while (left.length < right.length) subdivide(left);
  while (right.length < left.length) subdivide(right);
  return [...left.slice(1, -1), label, ...right.slice(1, -1)].map((point, i) => ({
    id: previous[i]?.id ?? uid("w"), x: point.x, y: point.y,
  }));
}

export function declutterDocument(
  doc: PsDocument, input: DeclutterInput, containmentNodeIds?: ReadonlySet<string>,
): PsDocument {
  if (!input.nodes.length && !input.boundaries.length && !input.annotations.length) return doc;
  const visible = new Set(input.nodes.map(node => node.id));
  const memberships = input.boundaries.map(boundary => new Set(boundary.nodeIds.filter(id => visible.has(id))));
  for (let a = 0; a < memberships.length; a++) {
    for (let b = a + 1; b < memberships.length; b++) {
      const left = memberships[a], right = memberships[b];
      if ([...left].some(id => right.has(id)) &&
          [...left].some(id => !right.has(id)) && [...right].some(id => !left.has(id))) {
        throw new Error("Declutter needs disjoint or nested boundary memberships. Overlapping memberships were left unchanged.");
      }
    }
  }

  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({ multigraph: true, compound: true });
  graph.setGraph({ rankdir: "LR", nodesep: 64, edgesep: 32, ranksep: 100, marginx: 48, marginy: 48 });
  // Imported IDs can collide across kinds; use graph-local keys.
  const nodeKeys = new Map(input.nodes.map((node, i) => [node.id, `n${i}`]));
  const boundaryKeys = input.boundaries.map((_, i) => `b${i}`);
  input.nodes.forEach(node => graph.setNode(nodeKeys.get(node.id)!, { ...(node.size ?? DEFAULT_NODE_SIZE) }));
  input.annotations.forEach((annotation, i) => graph.setNode(`a${i}`, { ...annotation.size }));
  input.boundaries.forEach((boundary, i) => graph.setNode(boundaryKeys[i],
    memberships[i].size ? { width: 0, height: 0 } : { ...boundary.size }));
  const contains = (outer: number, inner: number) =>
    [...memberships[inner]].every(id => memberships[outer].has(id)) &&
    (memberships[outer].size > memberships[inner].size || outer < inner);
  input.boundaries.forEach((_, i) => {
    if (!memberships[i].size) return;
    const parent = input.boundaries.map((_, j) => j)
      .filter(j => j !== i && contains(j, i))
      .sort((a, b) => memberships[a].size - memberships[b].size || b - a)[0];
    if (parent !== undefined) graph.setParent(boundaryKeys[i], boundaryKeys[parent]);
  });
  input.nodes.forEach(node => {
    const parent = input.boundaries.map((_, i) => i)
      .filter(i => memberships[i].has(node.id))
      .sort((a, b) => memberships[a].size - memberships[b].size || b - a)[0];
    if (parent !== undefined) graph.setParent(nodeKeys.get(node.id)!, boundaryKeys[parent]);
  });
  const edges = input.edges.filter(edge => nodeKeys.has(edge.source) && nodeKeys.has(edge.target));
  edges.forEach((edge, i) => graph.setEdge(nodeKeys.get(edge.source)!, nodeKeys.get(edge.target)!, {
    width: edge.labelSize.width + 24, height: edge.labelSize.height + 24, labelpos: "c",
  }, `e${i}`));
  layout(graph);

  const readRect = (key: string): Rect => {
    const node = graph.node(key);
    if (node.x === undefined || node.y === undefined ||
        ![node.x, node.y, node.width, node.height].every(Number.isFinite)) {
      throw new Error("Declutter returned invalid node geometry. The diagram was left unchanged.");
    }
    return {
      position: { x: node.x - node.width / 2, y: node.y - node.height / 2 },
      size: { width: node.width, height: node.height },
    };
  };
  const nodeRects = new Map(input.nodes.map(node => [node.id, readRect(nodeKeys.get(node.id)!)]));
  const boundaryRects = new Map(input.boundaries.map((boundary, i) => [boundary.id, readRect(boundaryKeys[i])]));
  const annotationRects = new Map(input.annotations.map((annotation, i) => [annotation.id, readRect(`a${i}`)]));
  const routes = new Map(edges.map((edge, i) => {
    const route = graph.edge(nodeKeys.get(edge.source)!, nodeKeys.get(edge.target)!, `e${i}`);
    if (!route.points?.length || route.x === undefined || route.y === undefined ||
        ![route.x, route.y, ...route.points.flatMap(point => [point.x, point.y])].every(Number.isFinite)) {
      throw new Error("Declutter returned invalid flow geometry. The diagram was left unchanged.");
    }
    return [edge.id, {
      points: route.points, label: { x: route.x, y: route.y },
      sourceHandle: handleFor(route.points[0], nodeRects.get(edge.source)!),
      targetHandle: handleFor(route.points[route.points.length - 1], nodeRects.get(edge.target)!),
    }];
  }));
  let changed = false;
  const nodes = doc.nodes.map(node => {
    const rect = nodeRects.get(node.id);
    if (!rect || samePosition(node.position, rect.position)) return node;
    changed = true;
    return { ...node, position: rect.position };
  });
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const boundaries = doc.boundaries.map(boundary => {
    const arranged = boundaryRects.get(boundary.id);
    if (!arranged && !boundary.nodeIds.some(id => nodeRects.has(id))) return boundary;
    let rect = arranged ?? boundary;
    // Global/filtered views retain hidden members; saved scenarios contain only their members.
    for (const id of boundary.nodeIds) {
      if (containmentNodeIds && !containmentNodeIds.has(id)) continue;
      const node = nodeMap.get(id);
      if (node) rect = expandRectToContain(rect, nodeRect(node));
    }
    if (samePosition(boundary.position, rect.position) &&
        boundary.size.width === rect.size.width && boundary.size.height === rect.size.height) return boundary;
    changed = true;
    return { ...boundary, position: rect.position, size: rect.size };
  });
  const annotations = doc.textAnnotations?.map(annotation => {
    const rect = annotationRects.get(annotation.id);
    if (!rect || samePosition(annotation.position, rect.position)) return annotation;
    changed = true;
    return { ...annotation, position: rect.position };
  });
  const nextEdges = doc.edges.map(edge => {
    const route = routes.get(edge.id);
    if (!route) return edge;
    const waypoints = savedWaypoints(route.points, route.label, edge.waypoints);
    if (edge.compactLabel === true && edge.sourceHandle === route.sourceHandle && edge.targetHandle === route.targetHandle &&
        edge.waypoints.length === waypoints.length &&
        edge.waypoints.every((point, i) => samePosition(point, waypoints[i]))) return edge;
    changed = true;
    return { ...edge, waypoints, sourceHandle: route.sourceHandle, targetHandle: route.targetHandle, compactLabel: true };
  });
  return changed ? {
    ...doc, nodes, boundaries, edges: nextEdges,
    ...(annotations ? { textAnnotations: annotations } : {}),
  } : doc;
}

function nodeGeometry(node: ScenarioLayout["nodes"][string]) {
  return { position: node.position, size: node.size };
}

function edgeGeometry(edge: ScenarioLayout["edges"][string]) {
  return { waypoints: edge.waypoints, sourceHandle: edge.sourceHandle,
    targetHandle: edge.targetHandle, compactLabel: edge.compactLabel };
}

function rectGeometry(rect: { position: Position; size: Size }) {
  return { position: rect.position, size: rect.size };
}

export function scenarioDocument(doc: PsDocument, scenarioId: string | null): PsDocument {
  const saved = doc.scenarios.find(scenario => scenario.id === scenarioId)?.layout;
  if (!saved) return doc;
  return {
    ...doc,
    nodes: doc.nodes.map(node => Object.hasOwn(saved.nodes, node.id)
      ? { ...node, ...nodeGeometry(saved.nodes[node.id]) } : node),
    edges: doc.edges.map(edge => Object.hasOwn(saved.edges, edge.id)
      ? { ...edge, ...edgeGeometry(saved.edges[edge.id]) } : edge),
    boundaries: doc.boundaries.map(boundary => Object.hasOwn(saved.boundaries, boundary.id)
      ? { ...boundary, ...saved.boundaries[boundary.id] } : boundary),
    ...(doc.textAnnotations ? { textAnnotations: doc.textAnnotations.map(annotation =>
      Object.hasOwn(saved.annotations, annotation.id)
        ? { ...annotation, ...saved.annotations[annotation.id] } : annotation) } : {}),
  };
}

function captureScenarioLayout(doc: PsDocument, scenario: Scenario): ScenarioLayout {
  return {
    nodes: Object.fromEntries(doc.nodes.filter(node => scenario.nodeIds.includes(node.id))
      .map(node => [node.id, nodeGeometry(node)])),
    edges: Object.fromEntries(doc.edges.filter(edge => scenario.edgeIds.includes(edge.id))
      .map(edge => [edge.id, edgeGeometry(edge)])),
    boundaries: Object.fromEntries(doc.boundaries.filter(boundary => scenario.boundaryIds.includes(boundary.id))
      .map(boundary => [boundary.id, rectGeometry(boundary)])),
    annotations: Object.fromEntries((doc.textAnnotations ?? []).filter(annotation =>
      scenario.textAnnotationIds?.includes(annotation.id)).map(annotation => [annotation.id, rectGeometry(annotation)])),
  };
}

// Run geometry-sensitive edits against the active arrangement, then retain
// shared facts without publishing its coordinates into other scenarios.
export function updateScenarioDocument(
  doc: PsDocument, scenarioId: string | null, update: (current: PsDocument) => PsDocument,
): PsDocument {
  const projected = scenarioDocument(doc, scenarioId);
  const next = update(projected);
  if (next === projected) return doc;
  if (projected === doc) return next;
  const scenario = next.scenarios.find(item => item.id === scenarioId);
  const nodes = new Map(doc.nodes.map(node => [node.id, node]));
  const edges = new Map(doc.edges.map(edge => [edge.id, edge]));
  const boundaries = new Map(doc.boundaries.map(boundary => [boundary.id, boundary]));
  const annotations = new Map(doc.textAnnotations?.map(annotation => [annotation.id, annotation]));
  return {
    ...next,
    nodes: next.nodes.map(node => {
      const original = nodes.get(node.id);
      return original ? { ...node, ...nodeGeometry(original) } : node;
    }),
    edges: next.edges.map(edge => {
      const original = edges.get(edge.id);
      return original ? { ...edge, ...edgeGeometry(original) } : edge;
    }),
    boundaries: next.boundaries.map(boundary => {
      const original = boundaries.get(boundary.id);
      return original ? { ...boundary, ...rectGeometry(original) } : boundary;
    }),
    ...(next.textAnnotations ? { textAnnotations: next.textAnnotations.map(annotation => {
      const original = annotations.get(annotation.id);
      return original ? { ...annotation, ...rectGeometry(original) } : annotation;
    }) } : {}),
    scenarios: scenario ? next.scenarios.map(item => item.id === scenario.id
      ? { ...item, layout: captureScenarioLayout(next, scenario) } : item) : next.scenarios,
  };
}

export function applyScenarioDeclutter(
  doc: PsDocument, input: DeclutterInput, scenarioId: string | null,
): PsDocument {
  const scenario = doc.scenarios.find(item => item.id === scenarioId);
  if (!scenario) return declutterDocument(doc, input);
  const projected = scenarioDocument(doc, scenario.id);
  const next = declutterDocument(projected, input, new Set(scenario.nodeIds));
  if (next === projected) return doc;
  const saved = captureScenarioLayout(next, scenario);
  return { ...doc, scenarios: doc.scenarios.map(item => item.id === scenario.id
    ? { ...item, layout: saved } : item) };
}

export function pruneScenarioLayouts(doc: PsDocument): PsDocument {
  if (!doc.scenarios.some(scenario => scenario.layout)) return doc;
  const nodeIds = new Set(doc.nodes.map(node => node.id));
  const edgeIds = new Set(doc.edges.map(edge => edge.id));
  const boundaryIds = new Set(doc.boundaries.map(boundary => boundary.id));
  const annotationIds = new Set(doc.textAnnotations?.map(annotation => annotation.id));
  const retain = <T,>(entries: Record<string, T>, ids: readonly string[]) => {
    const allowed = new Set(ids);
    return Object.keys(entries).every(id => allowed.has(id)) ? entries
      : Object.fromEntries(Object.entries(entries).filter(([id]) => allowed.has(id)));
  };
  let changed = false;
  const scenarios = doc.scenarios.map(scenario => {
    const layout = scenario.layout;
    if (!layout) return scenario;
    const nodes = retain(layout.nodes, scenario.nodeIds.filter(id => nodeIds.has(id)));
    const edges = retain(layout.edges, scenario.edgeIds.filter(id => edgeIds.has(id)));
    const boundaries = retain(layout.boundaries, scenario.boundaryIds.filter(id => boundaryIds.has(id)));
    const annotations = retain(layout.annotations, (scenario.textAnnotationIds ?? []).filter(id => annotationIds.has(id)));
    if (nodes === layout.nodes && edges === layout.edges && boundaries === layout.boundaries
      && annotations === layout.annotations) return scenario;
    changed = true;
    return { ...scenario, layout: { nodes, edges, boundaries, annotations } };
  });
  return changed ? { ...doc, scenarios } : doc;
}

export function normalizeScenarioLayout(raw: unknown): ScenarioLayout | undefined {
  if (raw === undefined) return undefined;
  const record = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Invalid scenario layout: expected a geometry object.");
    }
    return value as Record<string, unknown>;
  };
  const number = (value: unknown): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error("Invalid scenario layout: coordinates and sizes must be finite numbers.");
    }
    return value;
  };
  const position = (value: unknown): Position => {
    const point = record(value);
    return { x: number(point.x), y: number(point.y) };
  };
  const size = (value: unknown): Size => {
    const rect = record(value);
    const width = number(rect.width), height = number(rect.height);
    if (width <= 0 || height <= 0) throw new Error("Invalid scenario layout: sizes must be positive.");
    return { width, height };
  };
  const map = <T,>(value: unknown, parse: (entry: Record<string, unknown>) => T): Record<string, T> => {
    const entries = Object.entries(record(value));
    if (entries.length > 10000) throw new Error("Invalid scenario layout: too many geometry entries.");
    return Object.fromEntries(entries.map(([id, entry]) => {
      if (!id || id.length > 128 || ["__proto__", "prototype", "constructor"].includes(id)) {
        throw new Error("Invalid scenario layout: invalid entity ID.");
      }
      return [id, parse(record(entry))];
    }));
  };
  const saved = record(raw);
  return {
    nodes: map(saved.nodes, entry => ({
      position: position(entry.position), ...(entry.size === undefined ? {} : { size: size(entry.size) }),
    })),
    boundaries: map(saved.boundaries, entry => ({ position: position(entry.position), size: size(entry.size) })),
    annotations: map(saved.annotations, entry => ({ position: position(entry.position), size: size(entry.size) })),
    edges: map(saved.edges, entry => {
      if (!Array.isArray(entry.waypoints) || entry.waypoints.length > 1000) {
        throw new Error("Invalid scenario layout: expected a bounded waypoint list.");
      }
      const ids = new Set<string>();
      const waypoints = entry.waypoints.map(value => {
        const point = record(value);
        if (typeof point.id !== "string" || !point.id || point.id.length > 128 || ids.has(point.id)) {
          throw new Error("Invalid scenario layout: waypoint IDs must be unique strings.");
        }
        ids.add(point.id);
        return { id: point.id, ...position(point) };
      });
      const handle = (value: unknown): string | undefined => {
        if (value === undefined) return undefined;
        if (typeof value !== "string" || value.length > 128) throw new Error("Invalid scenario layout: invalid handle.");
        return value;
      };
      if (entry.compactLabel !== undefined && typeof entry.compactLabel !== "boolean") {
        throw new Error("Invalid scenario layout: compact labels must be boolean.");
      }
      return { waypoints,
        ...(entry.sourceHandle === undefined ? {} : { sourceHandle: handle(entry.sourceHandle) }),
        ...(entry.targetHandle === undefined ? {} : { targetHandle: handle(entry.targetHandle) }),
        ...(entry.compactLabel === undefined ? {} : { compactLabel: entry.compactLabel }),
      };
    }),
  };
}
