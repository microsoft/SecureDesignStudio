import type { AssistantAnalysisSnapshot, AssistantReference } from "./designAssistant";
import type { PsDeviation, PsDocument, PsFinding, PsIssue } from "./types";

export const STRIDE_CATEGORIES = [
  { id: "S", label: "Spoofing" },
  { id: "T", label: "Tampering" },
  { id: "R", label: "Repudiation" },
  { id: "I", label: "Information disclosure" },
  { id: "D", label: "Denial of service" },
  { id: "E", label: "Elevation of privilege" },
  { id: "U", label: "Unclassified" },
] as const;
export type StrideCategory = typeof STRIDE_CATEGORIES[number]["id"];
export const FINDING_SOURCES = [
  { id: "ai", label: "AI analysis" },
  { id: "rules", label: "Analyzer rules" },
  { id: "review", label: "Saved notes / issues" },
  { id: "service", label: "Service-model deviations" },
] as const;
export type FindingSource = typeof FINDING_SOURCES[number]["id"];
export type FindingStatus = "Needs review" | "Open" | "Resolved";
export type FindingIdentity =
  | { kind: "issue" | "deviation"; id: string }
  | { kind: "ai"; id: string; analysis: AssistantAnalysisSnapshot | null; documentSessionId: number };
export type AssistantFindingLinks = {
  analysis: AssistantAnalysisSnapshot | null;
  documentSessionId: number;
  issues: ReadonlyMap<string, string>;
};
export type StrideMapping = {
  category: Exclude<StrideCategory, "U">;
  basis: "AI suggestion" | "Rule mapping" | "Recorded category";
  reason: string;
};
export type Finding = {
  key: string;
  identity: FindingIdentity;
  source: FindingSource;
  sourceDescription: string;
  title: string;
  found: string;
  why: string;
  next: string;
  status: FindingStatus;
  saved: boolean;
  scenarioIds: string[];
  modelWide: boolean;
  target?: AssistantReference;
  targetLabel: string;
  mappings: StrideMapping[];
  ai?: PsFinding;
  issue?: PsIssue;
  deviation?: PsDeviation;
  savedIssueId?: string;
};
export type FindingsInput = {
  doc: PsDocument;
  documentSessionId: number;
  assistantFindings: readonly PsFinding[];
  assistantAnalysis: AssistantAnalysisSnapshot | null;
  assistantFindingLinks: AssistantFindingLinks | null;
};
export type FindingsFilter = {
  scope: string;
  source: "all" | FindingSource;
  status: "attention" | "all" | FindingStatus;
  query: string;
};
export type FindingCell = { category: StrideCategory; source: FindingSource };
export const DEFAULT_FINDINGS_FILTER: FindingsFilter = {
  scope: "all", source: "all", status: "attention", query: "",
};

const analysisKeys = new WeakMap<AssistantAnalysisSnapshot, number>();
let nextAnalysisKey = 0;
export function findingKey(identity: FindingIdentity): string {
  if (identity.kind !== "ai") return JSON.stringify([identity.kind, identity.id]);
  if (!identity.analysis) return JSON.stringify(["ai", identity.documentSessionId, null, identity.id]);
  // Snapshot object identity, not timestamps or reused provider IDs, defines a generation.
  if (!analysisKeys.has(identity.analysis)) analysisKeys.set(identity.analysis, ++nextAnalysisKey);
  return JSON.stringify(["ai", identity.documentSessionId, analysisKeys.get(identity.analysis), identity.id]);
}

export function findingExists(identity: FindingIdentity, input: FindingsInput): boolean {
  if (identity.kind === "issue") return input.doc.issues.some(issue => issue.id === identity.id);
  if (identity.kind === "deviation") return input.doc.deviations.some(deviation => deviation.id === identity.id);
  return identity.kind === "ai" && identity.analysis === input.assistantAnalysis
    && identity.documentSessionId === input.documentSessionId
    && input.assistantFindings.some(finding => finding.id === identity.id);
}

export function explicitStride(value: string): Exclude<StrideCategory, "U">[] {
  const parts = value.replace(/^STRIDE\s*:\s*/i, "").split(/[,;/|+\n]/)
    .map(part => part.trim().replace(/^[STRIDE]\s*[-:]\s*/i, "").toLowerCase());
  return STRIDE_CATEGORIES.flatMap(category =>
    category.id !== "U" && parts.includes(category.label.toLowerCase()) ? [category.id] : []);
}

function issueMappings(issue: PsIssue): StrideMapping[] {
  if (issue.kind === "Edge_auth_not_accepted") return [{
    category: "S", basis: "Rule mapping",
    reason: "Edge_auth_not_accepted reports an authentication method rejected or deprecated by the target policy. The Spoofing mapping is a review aid, not a demonstrated exploit.",
  }];
  const declarations = `${issue.title}\n${issue.description}`.split(/\r?\n/)
    .filter(line => /^\s*STRIDE\s*:/i.test(line));
  return [...new Set(declarations.flatMap(line => explicitStride(line.trim())))].map(category => ({
    category, basis: "Recorded category",
    reason: "Explicit STRIDE declaration in the saved record. No category was inferred from its problem text.",
  }));
}

function targetLabel(doc: PsDocument, reference?: AssistantReference): string {
  if (!reference) return "No affected element recorded";
  const item = (reference.kind === "node" ? doc.nodes : reference.kind === "edge" ? doc.edges : doc.boundaries)
    .find(item => item.id === reference.id);
  if (!item) return `${reference.label || reference.id} (no longer available)`;
  if (reference.kind !== "edge") return item.title || `Untitled ${reference.kind}`;
  const edge = doc.edges.find(edge => edge.id === reference.id)!;
  const nodeName = (id: string) => doc.nodes.find(node => node.id === id)?.title || id;
  return `${edge.title || "Untitled flow"} (${nodeName(edge.source)} \u2192 ${nodeName(edge.target)})`;
}

function targetScenarios(doc: PsDocument, target: AssistantReference): string[] {
  return doc.scenarios.filter(scenario =>
    (target.kind === "node" ? scenario.nodeIds : target.kind === "edge" ? scenario.edgeIds : scenario.boundaryIds)
      .includes(target.id)).map(scenario => scenario.id);
}

function issueScenarios(doc: PsDocument, issue: PsIssue): string[] {
  return issue.scenarioIds.length ? [...issue.scenarioIds]
    : targetScenarios(doc, { kind: issue.targetKind, id: issue.targetId, label: issue.targetId });
}

export function collectFindings(input: FindingsInput): Finding[] {
  const { doc, assistantAnalysis: analysis, assistantFindingLinks: links } = input;
  const records: Finding[] = [];
  const linkedIssues = new Set<string>();
  if (!analysis || analysis.documentSessionId === input.documentSessionId) {
    for (const ai of input.assistantFindings) {
      const currentLinks = links?.analysis === analysis && links.documentSessionId === input.documentSessionId ? links : null;
      const savedIssueId = currentLinks?.issues.get(ai.id);
      const issue = doc.issues.find(issue => issue.id === savedIssueId);
      if (issue) linkedIssues.add(issue.id);
      const identity: FindingIdentity = { kind: "ai", id: ai.id, analysis, documentSessionId: input.documentSessionId };
      const target = ai.focusReference;
      records.push({
        key: findingKey(identity), identity, source: "ai",
        sourceDescription: "Saved AI finding; suggestions have not been independently verified.",
        title: (issue ? issue.title : ai.title) || "Untitled finding",
        found: issue ? issue.description.trim() || "No description is recorded." : ai.rationale.trim() || "No description was returned.",
        why: ai.rationale.trim() || "No rationale was returned.",
        next: ai.recommendation.trim() || "No recommendation was returned.",
        status: ai.status === "Active" ? "Open" : "Resolved",
        saved: true, scenarioIds: issue ? issueScenarios(doc, issue) : analysis ? [analysis.scenarioId] : [],
        modelWide: false, target,
        targetLabel: !target && ai.references.length ? "No available diagram reference" : targetLabel(doc, target),
        mappings: explicitStride(ai.category).map(category => ({
          category, basis: "AI suggestion",
          reason: `The retained AI category explicitly names ${STRIDE_CATEGORIES.find(item => item.id === category)!.label}.`,
        })),
        ai, issue, savedIssueId,
      });
    }
  }
  for (const issue of doc.issues) {
    if (linkedIssues.has(issue.id)) continue;
    const identity: FindingIdentity = { kind: "issue", id: issue.id };
    const target = { kind: issue.targetKind, id: issue.targetId, label: issue.targetId };
    records.push({
      key: findingKey(identity), identity,
      source: issue.kind ? "rules" : "review",
      sourceDescription: issue.kind ? `Recorded analyzer rule: ${issue.kind}.`
        : issue.origin === "authored-threat" ? "Authored threat note." : "Saved issue; original source not recorded.",
      title: issue.title || "Untitled finding",
      found: issue.description.trim() || "No description is recorded.",
      why: issue.justification?.trim() || (issue.kind ? issue.description.trim() : "") || "No separate rationale is recorded.",
      next: issue.kind === "Edge_auth_not_accepted"
        ? "Update the edge's auth selection or adjust the target node's type policy."
        : "No separate recommendation is recorded. Review the saved description and discussion.",
      status: issue.status === "Active" ? "Open" : "Resolved",
      saved: true, scenarioIds: issueScenarios(doc, issue),
      modelWide: false, target, targetLabel: targetLabel(doc, target), mappings: issueMappings(issue), issue,
    });
  }
  for (const deviation of doc.deviations) {
    const identity: FindingIdentity = { kind: "deviation", id: deviation.id };
    const target = deviation.targetKind && deviation.targetId
      ? { kind: deviation.targetKind, id: deviation.targetId, label: deviation.targetId } : undefined;
    records.push({
      key: findingKey(identity), identity, source: "service",
      sourceDescription: "Saved service-model comparison record, not a live scan or telemetry feed.",
      title: deviation.title || "Untitled deviation", found: deviation.description.trim() || "No description is recorded.",
      why: deviation.explanation.trim() || "No explanation is recorded.",
      next: "No separate recommendation is recorded. Review the explanation and cited evidence.",
      status: deviation.status === "Active" ? "Open" : "Resolved", saved: true,
      scenarioIds: [...deviation.scenarioIds], modelWide: deviation.scenarioIds.length === 0,
      target, targetLabel: targetLabel(doc, target), mappings: [], deviation,
    });
  }
  return records;
}

export function findingHasCategory(finding: Finding, category: StrideCategory): boolean {
  return category === "U" ? finding.mappings.length === 0 : finding.mappings.some(mapping => mapping.category === category);
}

export function filterFindings(records: readonly Finding[], filter: FindingsFilter, activeScenarioId: string | null): Finding[] {
  const query = filter.query.trim().toLowerCase();
  return records.filter(finding => {
    if (filter.scope === "current" || filter.scope.startsWith("scenario:")) {
      const id = filter.scope === "current" ? activeScenarioId : filter.scope.slice("scenario:".length);
      if (id === null || (!finding.modelWide && !finding.scenarioIds.includes(id))) return false;
    } else if (filter.scope === "unscoped" && finding.scenarioIds.length !== 0) return false;
    if (filter.source !== "all" && finding.source !== filter.source) return false;
    if (filter.status === "attention" ? finding.status === "Resolved"
      : filter.status !== "all" && finding.status !== filter.status) return false;
    return !query || [finding.title, finding.found, finding.why, finding.next, finding.targetLabel, finding.identity.id]
      .some(value => value.toLowerCase().includes(query));
  });
}

export function findingsInCell(records: readonly Finding[], cell: FindingCell | null): Finding[] {
  return cell ? records.filter(finding => finding.source === cell.source && findingHasCategory(finding, cell.category)) : [...records];
}

export function findingScenarioLabel(finding: Finding, doc: PsDocument): string {
  if (finding.modelWide) return "All scenarios (model-wide)";
  if (!finding.scenarioIds.length) return "No scenario assigned";
  return finding.scenarioIds.map(id => doc.scenarios.find(scenario => scenario.id === id)?.name
    || (finding.identity.kind === "ai" && finding.identity.analysis ? `${finding.identity.analysis.scenarioName} (removed)` : `${id} (removed)`)).join(", ");
}
