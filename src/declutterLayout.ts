import { Graph, layout, type EdgeLabel, type GraphLabel, type NodeLabel } from "@dagrejs/dagre";
import { uid, type Position, type PsDocument, type Size, type Waypoint } from "./types";
import { DEFAULT_NODE_SIZE, expandRectToContain, nodeRect, type Rect } from "./boundaryGeometry";

export const DECLUTTER_LABEL_SIZE: Size = { width: 240, height: 32 };

export interface DeclutterInput {
  nodes: { id: string; position: Position; size?: Size }[];
  edges: { id: string; source: string; target: string }[];
  boundaries: { id: string; position: Position; size: Size; nodeIds: string[] }[];
  annotations: { id: string; position: Position; size: Size }[];
}

export interface DeclutterRoute {
  points: Position[];
  label: Position;
  sourceHandle: "top" | "right" | "bottom" | "left";
  targetHandle: "top" | "right" | "bottom" | "left";
}

export interface DeclutterLayout {
  nodes: Map<string, Rect>;
  boundaries: Map<string, Rect>;
  annotations: Map<string, Rect>;
  edges: Map<string, DeclutterRoute>;
  notice: string | null;
}

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return a.position.x < b.position.x + b.size.width + gap &&
    a.position.x + a.size.width + gap > b.position.x &&
    a.position.y < b.position.y + b.size.height + gap &&
    a.position.y + a.size.height + gap > b.position.y;
}

function labelRect(center: Position): Rect {
  return {
    position: { x: center.x - DECLUTTER_LABEL_SIZE.width / 2, y: center.y - DECLUTTER_LABEL_SIZE.height / 2 },
    size: DECLUTTER_LABEL_SIZE,
  };
}

function handleFor(point: Position, rect: Rect): DeclutterRoute["sourceHandle"] {
  const distances = [
    { side: "top" as const, distance: Math.abs(point.y - rect.position.y) },
    { side: "right" as const, distance: Math.abs(point.x - rect.position.x - rect.size.width) },
    { side: "bottom" as const, distance: Math.abs(point.y - rect.position.y - rect.size.height) },
    { side: "left" as const, distance: Math.abs(point.x - rect.position.x) },
  ];
  return distances.sort((a, b) => a.distance - b.distance)[0].side;
}

// Overlapping memberships cannot be represented by a compound graph's single
// parent. Preserve their authored geometry rather than imply a different scope.
function fixedBoundaryLayout(input: DeclutterInput): DeclutterLayout {
  const result: DeclutterLayout = {
    nodes: new Map(input.nodes.map(node => [node.id, { position: node.position, size: node.size ?? DEFAULT_NODE_SIZE }])),
    boundaries: new Map(input.boundaries.map(boundary => [boundary.id, boundary])),
    annotations: new Map(input.annotations.map(annotation => [annotation.id, annotation])),
    edges: new Map(),
    notice: "Overlapping boundaries: authored positions retained; flow labels separated.",
  };
  const occupied = [
    ...result.nodes.values(), ...result.annotations.values(),
    ...input.boundaries.map(boundary => ({ position: boundary.position, size: { width: boundary.size.width, height: 40 } })),
  ];
  for (const edge of input.edges) {
    const source = result.nodes.get(edge.source);
    const target = result.nodes.get(edge.target);
    if (!source || !target) continue;
    const start = { x: source.position.x + source.size.width, y: source.position.y + source.size.height / 2 };
    const end = { x: target.position.x, y: target.position.y + target.size.height / 2 };
    const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    let label = middle;
    for (let lane = 0; occupied.some(rect => overlaps(labelRect(label), rect, 12)); lane++) {
      label = { x: middle.x, y: middle.y + (lane % 2 ? -1 : 1) * (Math.floor(lane / 2) + 1) * 48 };
    }
    occupied.push(labelRect(label));
    result.edges.set(edge.id, {
      points: [start, { x: start.x + 24, y: start.y }, label, { x: end.x - 24, y: end.y }, end],
      label, sourceHandle: "right", targetHandle: "left",
    });
  }
  return result;
}

export function createDeclutterLayout(input: DeclutterInput): DeclutterLayout {
  const visible = new Set(input.nodes.map(node => node.id));
  const memberships = input.boundaries.map(boundary => new Set(boundary.nodeIds.filter(id => visible.has(id))));
  for (let a = 0; a < memberships.length; a++) {
    for (let b = a + 1; b < memberships.length; b++) {
      const left = memberships[a], right = memberships[b];
      if ([...left].some(id => right.has(id)) &&
          [...left].some(id => !right.has(id)) && [...right].some(id => !left.has(id))) {
        return fixedBoundaryLayout(input);
      }
    }
  }

  const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({ multigraph: true, compound: true });
  graph.setGraph({
    rankdir: "LR", nodesep: 64, edgesep: 32, ranksep: 100,
    marginx: 48, marginy: 48,
  });
  // Graph-local IDs cannot collide with imported node, edge or boundary IDs.
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
    ...DECLUTTER_LABEL_SIZE, labelpos: "c",
  }, `e${i}`));
  if (graph.nodeCount()) layout(graph);

  const readRect = (key: string): Rect => {
    const node = graph.node(key);
    if (node.x === undefined || node.y === undefined ||
        ![node.x, node.y, node.width, node.height].every(Number.isFinite)) {
      throw new Error("The diagram layout returned invalid node geometry.");
    }
    return { position: { x: node.x - node.width / 2, y: node.y - node.height / 2 },
      size: { width: node.width, height: node.height } };
  };
  const result: DeclutterLayout = {
    nodes: new Map(input.nodes.map(node => [node.id, readRect(nodeKeys.get(node.id)!)])),
    boundaries: new Map(input.boundaries.map((boundary, i) => [boundary.id, readRect(boundaryKeys[i])])),
    annotations: new Map(input.annotations.map((annotation, i) => [annotation.id, readRect(`a${i}`)])),
    edges: new Map(), notice: null,
  };
  edges.forEach((edge, i) => {
    const route = graph.edge(nodeKeys.get(edge.source)!, nodeKeys.get(edge.target)!, `e${i}`);
    if (!route.points?.length || route.x === undefined || route.y === undefined ||
        ![route.x, route.y, ...route.points.flatMap(point => [point.x, point.y])].every(Number.isFinite)) {
      throw new Error("The diagram layout returned invalid flow geometry.");
    }
    result.edges.set(edge.id, {
      points: route.points, label: { x: route.x, y: route.y },
      sourceHandle: handleFor(route.points[0], result.nodes.get(edge.source)!),
      targetHandle: handleFor(route.points.at(-1)!, result.nodes.get(edge.target)!),
    });
  });
  return result;
}

function savedWaypoints(route: DeclutterRoute): Waypoint[] {
  const points = route.points.slice(1, -1);
  let center = points.findIndex(point => point.x === route.label.x && point.y === route.label.y);
  if (center < 0) {
    center = Math.floor(points.length / 2);
    points.splice(center, 0, route.label);
  }
  const left = [route.points[0], ...points.slice(0, center), route.label];
  const right = [route.label, ...points.slice(center + 1), route.points[route.points.length - 1]];
  // The native renderer anchors labels to the middle waypoint. Balance the
  // two route halves without moving bends or adding stacked drag handles.
  const subdivide = (half: Position[]) => {
    let longest = 0;
    for (let i = 1; i < half.length - 1; i++) {
      const length = (j: number) => Math.hypot(half[j + 1].x - half[j].x, half[j + 1].y - half[j].y);
      if (length(i) > length(longest)) longest = i;
    }
    const a = half[longest], b = half[longest + 1];
    half.splice(longest + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  };
  while (left.length < right.length) subdivide(left);
  while (right.length < left.length) subdivide(right);
  return [...left.slice(1, -1), route.label, ...right.slice(1, -1)]
    .map(point => ({ id: uid("w"), x: point.x, y: point.y }));
}

export function applyDeclutterLayout(doc: PsDocument, layout: DeclutterLayout): PsDocument {
  const nodes = doc.nodes.map(node => {
    const rect = layout.nodes.get(node.id);
    return rect ? { ...node, position: rect.position } : node;
  });
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  return {
    ...doc,
    nodes,
    boundaries: doc.boundaries.map(boundary => {
      const arranged = layout.boundaries.get(boundary.id);
      if (!arranged && !boundary.nodeIds.some(id => layout.nodes.has(id))) return boundary;
      let rect = arranged ?? boundary;
      // Shared boundaries must still contain members hidden by this view.
      for (const id of boundary.nodeIds) {
        const node = nodeMap.get(id);
        if (node) rect = expandRectToContain(rect, nodeRect(node));
      }
      return { ...boundary, position: rect.position, size: rect.size };
    }),
    ...(doc.textAnnotations ? { textAnnotations: doc.textAnnotations.map(annotation => {
      const rect = layout.annotations.get(annotation.id);
      return rect ? { ...annotation, position: rect.position } : annotation;
    }) } : {}),
    edges: doc.edges.map(edge => {
      const route = layout.edges.get(edge.id);
      return route ? { ...edge, sourceHandle: route.sourceHandle, targetHandle: route.targetHandle,
        compactLabel: true, waypoints: savedWaypoints(route) } : edge;
    }),
  };
}
