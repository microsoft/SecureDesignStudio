import { Graph, layout, type EdgeLabel, type GraphLabel, type NodeLabel } from "@dagrejs/dagre";
import { DEFAULT_NODE_SIZE, expandRectToContain, nodeRect, type Rect } from "./boundaryGeometry";
import { uid, type Position, type PsDocument, type Size, type Waypoint } from "./types";

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

export function declutterDocument(doc: PsDocument, input: DeclutterInput): PsDocument {
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
    // Geometry is shared: retain containment for members hidden by this view.
    for (const id of boundary.nodeIds) {
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
    if (edge.sourceHandle === route.sourceHandle && edge.targetHandle === route.targetHandle &&
        edge.waypoints.length === waypoints.length &&
        edge.waypoints.every((point, i) => samePosition(point, waypoints[i]))) return edge;
    changed = true;
    return { ...edge, waypoints, sourceHandle: route.sourceHandle, targetHandle: route.targetHandle };
  });
  return changed ? {
    ...doc, nodes, boundaries, edges: nextEdges,
    ...(annotations ? { textAnnotations: annotations } : {}),
  } : doc;
}
