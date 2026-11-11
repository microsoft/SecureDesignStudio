import type { CatalogDefinitionSnapshot, PsDocument, Scenario } from "./types";
import { nodeDfdSummary, flowDfdSummary, resolveNodeReviewScope, formatDfdValue } from "./dfdSemantics";
import {
  RETENTION_LABELS,
  ISSUE_NOT_EVALUATED_LABELS,
  deviationKindLabel,
  privacyBoundaryTypeLabel,
  securityBoundaryTypeLabel,
  BOUNDARY_NETWORK_FIELDS,
  formatBoundaryNetworkText,
  authTypeLabel,
  authenticationCatalogFor,
  formatRequiredAccessRights,
  dataClassificationLabel,
  formatProductionIdentity,
  nodeTypeLabel,
} from "./types";
import { resolveProtocolReference } from "./protocols";
import { safeNavigationHref } from "./urlSafety";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeFileStem(value: string): string {
  return (
    value
      .replace(/\.tma$/i, "")
      .trim()
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/[. ]+$/g, "") || "secure-design-studio-diagram"
  );
}

export function downloadBlob(blob: Blob, fileName: string, ownerDocument: Document = document): void {
  if (!ownerDocument.body) throw new Error("The download window is no longer available.");
  const url = URL.createObjectURL(blob);
  const anchor = ownerDocument.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  try {
    ownerDocument.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function inlineDiagramImage(image: HTMLImageElement, original: HTMLImageElement): void {
  const source = original.currentSrc || original.src;
  image.removeAttribute("srcset");
  if (source.startsWith("data:")) return;
  const style = getComputedStyle(original);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil((parseFloat(style.width) || original.naturalWidth) * 2));
  canvas.height = Math.max(1, Math.ceil((parseFloat(style.height) || original.naturalHeight) * 2));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("A diagram icon could not be embedded for export.");
  // Use the already decoded image so exporting also works without a network.
  context.drawImage(original, 0, 0, canvas.width, canvas.height);
  image.src = canvas.toDataURL("image/png");
}

function cloneDiagramElement<T extends HTMLElement | SVGElement>(element: T): T {
  const clone = element.cloneNode(true) as T;
  const sources = [element, ...element.querySelectorAll("*")];
  const targets = [clone, ...clone.querySelectorAll("*")];
  sources.forEach((source, index) => {
    const target = targets[index];
    if (!(target instanceof HTMLElement || target instanceof SVGElement)) return;
    const computed = getComputedStyle(source);
    for (const property of computed) {
      // Computed SVG references are absolute URLs; the clone needs local defs.
      const value = computed.getPropertyValue(property).replace(/url\(["']?[^"'#)]*#([^"')]+)["']?\)/g, 'url("#$1")');
      target.style.setProperty(property, value);
    }
    target.style.setProperty("animation", "none");
    target.style.setProperty("transition", "none");
    if (source instanceof HTMLTextAreaElement && target instanceof HTMLTextAreaElement) {
      target.textContent = source.value;
    }
  });
  return clone;
}

export async function captureDiagramPng(): Promise<string> {
  await document.fonts.ready;
  // Let menu dismissal and pending React Flow measurements reach the DOM.
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const viewport = document.querySelector<HTMLElement>(".react-flow__viewport");
  if (!viewport) throw new Error("Open Diagram view before exporting an image.");
  if (!viewport.querySelector(".react-flow__node")) {
    throw new Error("The current view has no diagram elements to export.");
  }
  const originalImages = Array.from(viewport.querySelectorAll("img"));
  await Promise.all(originalImages.map(image => image.decode()));

  const origin = viewport.getBoundingClientRect();
  const zoom = new DOMMatrix(getComputedStyle(viewport).transform).a;
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (const element of viewport.querySelectorAll(".react-flow__node, .react-flow__node *, .react-flow__edge-path, .ps-edge-label, .ps-edge-label *")) {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") continue;
    const rect = element.getBoundingClientRect();
    if (!rect.width && !rect.height) continue;
    bounds.left = Math.min(bounds.left, (rect.left - origin.left) / zoom);
    bounds.top = Math.min(bounds.top, (rect.top - origin.top) / zoom);
    bounds.right = Math.max(bounds.right, (rect.right - origin.left) / zoom);
    bounds.bottom = Math.max(bounds.bottom, (rect.bottom - origin.top) / zoom);
  }
  const padding = 48;
  const x = Math.floor(bounds.left - padding);
  const y = Math.floor(bounds.top - padding);
  const width = Math.ceil(bounds.right - x + padding);
  const height = Math.ceil(bounds.bottom - y + padding);
  if (!Number.isFinite(width + height) || width <= 0 || height <= 0) {
    throw new Error("The diagram is not ready to export. Wait for it to finish rendering.");
  }
  const pixelWidth = width * 2, pixelHeight = height * 2;
  if (pixelWidth > 16384 || pixelHeight > 16384 || pixelWidth * pixelHeight > 64_000_000) {
    throw new Error("The diagram is too large for a PNG image. Filter the view or export a smaller scenario.");
  }

  // Clone the real scene, not a second approximation of its model geometry.
  const clone = cloneDiagramElement(viewport);
  clone.querySelectorAll("img").forEach((image, index) => inlineDiagramImage(image, originalImages[index]));
  clone.style.transform = `translate(${-x}px, ${-y}px)`;
  clone.style.transformOrigin = "0 0";
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.overflow = "visible";
  clone.style.zIndex = "1";
  const container = document.createElement("div");
  container.style.cssText = `position:relative;width:${width}px;height:${height}px;overflow:hidden`;
  const flow = viewport.closest(".react-flow");
  for (let ancestor = flow; ancestor; ancestor = ancestor.parentElement) {
    const color = getComputedStyle(ancestor).backgroundColor;
    if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
      container.style.backgroundColor = color;
      break;
    }
  }
  const background = flow?.querySelector<SVGSVGElement>(".react-flow__background");
  if (background && flow) {
    const grid = cloneDiagramElement(background);
    const flowRect = flow.getBoundingClientRect();
    const left = origin.left - flowRect.left + x * zoom;
    const top = origin.top - flowRect.top + y * zoom;
    grid.setAttribute("viewBox", `${left} ${top} ${width * zoom} ${height * zoom}`);
    grid.style.width = `${width}px`;
    grid.style.height = `${height}px`;
    grid.style.zIndex = "0";
    const rect = grid.querySelector("rect");
    if (rect) {
      rect.style.setProperty("x", `${left}px`);
      rect.style.setProperty("y", `${top}px`);
      rect.style.width = `${width * zoom}px`;
      rect.style.height = `${height * zoom}px`;
    }
    container.appendChild(grid);
  }
  container.appendChild(clone);
  const content = new XMLSerializer().serializeToString(container);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${content}</foreignObject></svg>`;
  const image = new Image();
  // A data URL keeps the self-contained foreignObject origin-clean for canvas.
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = pixelWidth;
  canvas.height = pixelHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas export is unavailable in this browser.");
  context.scale(2, 2);
  context.drawImage(image, 0, 0, width, height);
  const result = canvas.toDataURL("image/png");
  if (!result.startsWith("data:image/png;")) throw new Error("The browser could not create the PNG image.");
  return result;
}

export function downloadDiagramPng(dataUrl: string, documentFileName: string): void {
  const binary = atob(dataUrl.split(",")[1] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  downloadBlob(
    new Blob([bytes], { type: "image/png" }),
    `${safeFileStem(documentFileName)}-diagram.png`,
  );
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '<p class="empty">None.</p>';
  return `<div class="table-wrap"><table><thead><tr>${headers
    .map((header) => `<th>${escapeHtml(header)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (row) =>
        `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table></div>`;
}

export function buildReviewReportHtml(options: {
  inventoryLabel?: string;
  inventoryRequired?: boolean;
  classificationDefinitions?: readonly CatalogDefinitionSnapshot[];
  doc: PsDocument;
  scenario: Scenario;
  diagramDataUrl?: string;
  documentFileName: string;
  appVersion: string;
}): string {
  const { doc, scenario, diagramDataUrl, documentFileName, appVersion } = options;
  const nodeIds = new Set(scenario.nodeIds);
  const edgeIds = new Set(scenario.edgeIds);
  const boundaryIds = new Set(scenario.boundaryIds);
  const nodes = doc.nodes.filter((node) => nodeIds.has(node.id));
  const edges = doc.edges.filter((edge) => edgeIds.has(edge.id));
  const boundaries = doc.boundaries.filter((boundary) => boundaryIds.has(boundary.id));
  const nodeById = new Map(doc.nodes.map((node) => [node.id, node]));
  const dataById = new Map(doc.data.map((item) => [item.id, item]));
  const relevantDataIds = new Set<string>();
  Object.values(scenario.nodeData).forEach((items) =>
    Object.keys(items).forEach((id) => relevantDataIds.add(id)),
  );
  for (const edge of edges) {
    for (const id of scenario.edgeRequestData[edge.id] ?? []) relevantDataIds.add(id);
    for (const id of scenario.edgeResponseData[edge.id] ?? []) relevantDataIds.add(id);
  }
  const data = doc.data.filter((item) => relevantDataIds.has(item.id));
  const issues = doc.issues.filter(
    (issue) =>
      (issue.scenarioIds.length === 0 || issue.scenarioIds.includes(scenario.id)) &&
      ((issue.targetKind === "node" && nodeIds.has(issue.targetId)) ||
        (issue.targetKind === "edge" && edgeIds.has(issue.targetId))),
  );
  const comments = doc.comments.filter((comment) => comment.scenarioId === scenario.id);
  const deviations = doc.deviations.filter(
    (deviation) =>
      deviation.scenarioIds.length === 0 ||
      deviation.scenarioIds.includes(scenario.id),
  );

  const dataNames = (ids: string[] | undefined) =>
    (ids ?? [])
      .map((id) => dataById.get(id)?.name ?? id)
      .map(escapeHtml)
      .join(", ") || "None";

  const nodeRows = nodes.map((node) => [
    escapeHtml(node.title),
    escapeHtml(nodeTypeLabel(node.type, doc.nodeTypes)),
    escapeHtml(nodeDfdSummary(node, doc, scenario)),
    escapeHtml(formatDfdValue(scenario.nodeScopeReasons?.[node.id]) || "Not specified"),
    escapeHtml(resolveNodeReviewScope(node, scenario, doc.nodeTypes).diagnostics.join(" ") || "None"),
    escapeHtml(node.description || "—"),
    escapeHtml(node.serviceTreeId || (options.inventoryRequired ? "Missing" : "Not specified")),
    escapeHtml(node.endpointRegex || "—"),
  ]);
  const edgeRows = edges
    .slice()
    .sort(
      (left, right) =>
        (scenario.edgeNumbers[left.id] ?? 0) -
        (scenario.edgeNumbers[right.id] ?? 0),
    )
    .map((edge) => {
      const protocol = resolveProtocolReference(edge.protocolId, doc.protocolDefinitions);
      const protocolLabel = protocol.status === "resolved"
        ? `${protocol.definition.label}${protocol.conflict ? " (saved conflict)" : ""}`
        : protocol.status === "unresolved" ? `${edge.protocolId} (unresolved)` : "Not specified";
      return [
      escapeHtml(scenario.edgeNumbers[edge.id] ?? "—"),
      escapeHtml(edge.title),
      escapeHtml(nodeById.get(edge.source)?.title ?? edge.source),
      escapeHtml(nodeById.get(edge.target)?.title ?? edge.target),
      escapeHtml(flowDfdSummary(edge, doc, scenario)),
      escapeHtml(protocolLabel),
      escapeHtml((edge.authenticationTypes ?? []).map(id => authTypeLabel(id, authenticationCatalogFor(doc))).join(", ") || "Not specified"),
      escapeHtml(edge.applicationId || "Not specified"),
      escapeHtml(edge.audience || "—"),
      escapeHtml(edge.productionIdentity ? formatProductionIdentity(edge.productionIdentity, doc.catalogDefinitions) : "None retained"),
      `<span class="flow-rights">${escapeHtml(formatRequiredAccessRights(edge.requiredAccessRights) || "Unspecified")}</span>`,
      dataNames(scenario.edgeRequestData[edge.id]),
      dataNames(scenario.edgeResponseData[edge.id]),
    ];
    });
  const dataRows = data.map((item) => {
    const storedAt = nodes
      .filter((node) => scenario.nodeData[node.id]?.[item.id] !== undefined)
      .map((node) => {
        const retention = scenario.nodeData[node.id][item.id];
        return `${escapeHtml(node.title)} (${escapeHtml(RETENTION_LABELS[retention] || "Unspecified")})`;
      })
      .join(", ") || "Not stored";
    return [
      escapeHtml(item.name),
      escapeHtml(dataClassificationLabel(item.classification, doc.catalogDefinitions, options.classificationDefinitions)),
      escapeHtml(item.sample || "—"),
      storedAt,
    ];
  });
  const issueRows = issues.map((issue) => [
    escapeHtml(issue.status),
    escapeHtml(issue.origin === "authored-threat" && !issue.kind ? "Authored threat note" : issue.kind ? "Analyze" : "Manual / accepted AI"),
    escapeHtml(issue.kind
      ? issue.notEvaluatedReason ? ISSUE_NOT_EVALUATED_LABELS[issue.notEvaluatedReason] : "No evaluation limitation recorded"
      : "Not applicable"),
    escapeHtml(issue.title),
    escapeHtml(
      issue.targetKind === "node"
        ? nodeById.get(issue.targetId)?.title ?? issue.targetId
        : doc.edges.find((edge) => edge.id === issue.targetId)?.title ?? issue.targetId,
    ),
    `<span class="flow-rights">${escapeHtml(issue.description)}${issue.origin === "authored-threat" && !issue.kind
      ? `\n\nJustification: ${escapeHtml(issue.justification || "(not supplied)")}` : ""}</span>`,
  ]);
  const metadataRows = [
    ...nodes.map(entity => ({ entity, kind: "Node" })),
    ...edges.map(entity => ({ entity, kind: "Flow" })),
  ].flatMap(({ entity, kind }) => Object.entries(entity.metadata ?? {}).map(([id, value]) => [
    escapeHtml(kind), escapeHtml(entity.title || entity.id),
    escapeHtml(entity.metadataFields?.find(field => field.id === id)?.label ?? `${id} (unresolved)`),
    escapeHtml(value),
  ]));
  const commentRows = comments.map((comment) => [
    escapeHtml(comment.status),
    escapeHtml(
      comment.targetKind === "node"
        ? nodeById.get(comment.targetId)?.title ?? comment.targetId
        : doc.edges.find((edge) => edge.id === comment.targetId)?.title ?? comment.targetId,
    ),
    escapeHtml(comment.text),
    escapeHtml(comment.replies.length),
  ]);
  const deviationRows = deviations.map((deviation) => {
    const target =
      deviation.targetKind === "node" && deviation.targetId
        ? nodeById.get(deviation.targetId)?.title ?? deviation.targetId
        : deviation.targetKind === "edge" && deviation.targetId
          ? doc.edges.find((edge) => edge.id === deviation.targetId)?.title ??
            deviation.targetId
          : "Document-wide";
    return [
      escapeHtml(deviation.status),
      escapeHtml(deviationKindLabel(deviation.kind, doc.catalogDefinitions)),
      escapeHtml(deviation.title),
      escapeHtml(target),
      escapeHtml(deviation.explanation),
      escapeHtml(deviation.evidenceIds.join(", ") || "—"),
      escapeHtml(
        deviation.sampleCalls
          ?.map(
            (call) =>
              `${call.source} → ${call.destination} (${call.count})`,
          )
          .join(" | ") || "—",
      ),
    ];
  });
  const workRows = doc.workItems.map((item) => {
    // Only http(s)/mailto become links; anything else stays inert text.
    const href = safeNavigationHref(item.link);
    return [
      escapeHtml(item.description),
      href
        ? `<a href="${escapeHtml(href)}" rel="noreferrer">${escapeHtml(href)}</a>`
        : item.link ? escapeHtml(item.link) : "—",
    ];
  });
  const generatedAt = new Date().toLocaleString();

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(scenario.name)} review report</title>
<style>
.flow-rights{white-space:pre-wrap;overflow-wrap:anywhere}
:root{font-family:Segoe UI,Arial,sans-serif;color:#242424;background:#fff}*{box-sizing:border-box}body{margin:0}main{max-width:1180px;margin:0 auto;padding:32px}header{border-bottom:3px solid #0f6cbd;padding-bottom:18px;margin-bottom:24px}h1{font-size:26px;margin:0 0 6px}h2{font-size:18px;margin:28px 0 10px;color:#0f548c}p{line-height:1.5}.meta{display:flex;gap:18px;flex-wrap:wrap;color:#616161;font-size:13px}.summary{display:grid;grid-template-columns:repeat(6,minmax(100px,1fr));gap:10px}.metric{border:1px solid #d1d1d1;padding:12px}.metric strong{display:block;font-size:22px;color:#0f6cbd}.diagram{width:100%;max-height:650px;object-fit:contain;border:1px solid #d1d1d1;background:#fafafa}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #d1d1d1;padding:7px;text-align:left;vertical-align:top}th{background:#f3f3f3}.empty{color:#616161}footer{margin-top:32px;padding-top:12px;border-top:1px solid #d1d1d1;color:#616161;font-size:11px}@media print{main{max-width:none;padding:12mm}.no-print{display:none}h2{break-after:avoid}tr,img{break-inside:avoid}.table-wrap{overflow:visible}}
</style></head><body><main>
<header><h1>SecureDesignStudio Review Report</h1><div class="meta"><span>Document: ${escapeHtml(documentFileName)}</span><span>Scenario: ${escapeHtml(scenario.name)}</span><span>Generated: ${escapeHtml(generatedAt)}</span></div></header>
<section><h2>Executive summary</h2><p>${escapeHtml(scenario.description || "No scenario description provided.")}</p><div class="summary"><div class="metric"><strong>${nodes.length}</strong>Nodes</div><div class="metric"><strong>${edges.length}</strong>Flows</div><div class="metric"><strong>${boundaries.length}</strong>Boundaries</div><div class="metric"><strong>${issues.length}</strong>Issues</div><div class="metric"><strong>${deviations.length}</strong>Deviations</div><div class="metric"><strong>${data.length}</strong>Data items</div></div></section>
${diagramDataUrl ? `<section><h2>Scenario diagram</h2><img class="diagram" src="${diagramDataUrl}" alt="${escapeHtml(scenario.name)} diagram"></section>` : ""}
<section><h2>Boundaries</h2><p>Network notes are declared intent, not verified enforcement or compliance. Blank means undocumented. Notes retained on privacy boundaries are inactive and are not shown here.</p>${table(["Title", "Type", "Subtype", ...BOUNDARY_NETWORK_FIELDS.map(field => field.label)], boundaries.map((boundary) => [
  escapeHtml(boundary.title), escapeHtml(boundary.type),
  escapeHtml(boundary.type === "privacy"
    ? boundary.privacySubtype ? privacyBoundaryTypeLabel(boundary.privacySubtype, doc.catalogDefinitions) : "Unspecified"
    : boundary.securitySubtype ? securityBoundaryTypeLabel(boundary.securitySubtype, doc.catalogDefinitions) : "Unspecified"),
  ...BOUNDARY_NETWORK_FIELDS.map(({ key }) => boundary.type === "security"
    ? `<span style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(formatBoundaryNetworkText(boundary[key]) || "Undocumented")}</span>`
    : "Inactive (security only)"),
]))}</section>
<section><h2>Node inventory</h2><p>DFD role is independent of service type. Scope excludes interiors only from LLM review, never fixed checks. Stored reasons on External Interactors are inactive.</p>${table(["Node", "Type", "DFD role / scope", "Stored scope reason", "Diagnostics", "Description", options.inventoryLabel ?? "Inventory ID", "Endpoint pattern"], nodeRows)}</section>
<section><h2>Canvas text annotations</h2><p>Nonsemantic, untrusted authored context. Not assets or review findings.</p>${table(["Text", "Position (x, y)", "Size (width, height)"],
  (doc.textAnnotations ?? []).filter(annotation => scenario.textAnnotationIds?.includes(annotation.id)).map(annotation => [
    `<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escapeHtml(annotation.text)}</pre>`,
    escapeHtml(`${annotation.position.x}, ${annotation.position.y}`),
    escapeHtml(`${annotation.size.width}, ${annotation.size.height}`),
  ]))}</section>
<section><h2>Data flow inventory</h2><p>Communication profiles and authentication are declared design intent, not verified negotiated transport protection or deployed grants. Not specified is not proof of plaintext or encryption. Required access rights are not verified grants or compliance. Retained identity evidence is historical compatibility data.</p>${table(["#", "Flow", "Source", "Target", "Scope context", "Protocol", "Authentication", "Caller Application ID", "Audience", "Retained identity evidence", "Required access rights", "Request data", "Response data"], edgeRows)}</section>
<section><h2>Data inventory and retention</h2>${table(["Data element", "Classification", "Sample", "Stored / processed at"], dataRows)}</section>
${metadataRows.length ? `<section><h2>Custom metadata</h2>${table(["Type", "Element", "Field", "Value"], metadataRows)}</section>` : ""}
<section><h2>Security and privacy findings</h2><p>Active/Resolved is the review status, not an analysis result. Not re-evaluated findings may contain retained or partial evidence. No recorded limitation does not certify freshness or complete model coverage.</p>${table(["Status", "Source", "Evaluation", "Finding", "Affected element", "Details"], issueRows)}</section>
<section><h2>Comments and discussions</h2>${table(["Status", "Affected element", "Comment", "Replies"], commentRows)}</section>
<section><h2>Deviations</h2>${table(["Status", "Kind", "Deviation", "Affected element", "Explanation", "Evidence IDs", "Sample calls"], deviationRows)}</section>
<section><h2>Work items</h2>${table(["Description", "Tracking link"], workRows)}</section>
<footer>Generated by SecureDesignStudio v${escapeHtml(appVersion)}. Analyze findings are deterministic policy checks. AI-assisted findings appear only after a user accepts them into Issues or Work Items. Review all generated content before relying on it.</footer>
</main></body></html>`;
}

export function downloadReviewReport(html: string, documentFileName: string): void {
  downloadBlob(
    new Blob([html], { type: "text/html;charset=utf-8" }),
    `${safeFileStem(documentFileName)}-review-report.html`,
  );
}
