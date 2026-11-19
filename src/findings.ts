import { isWorkItemType } from "../shared/adoContract";
import type { AiGuidanceReference } from "../shared/aiDesignGuidance";
import type { AssistantFinding, AssistantReference } from "./designAssistant";
import type { PsDocument, PsFinding, PsFindingAnalysis } from "./types";

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, nonempty = false): string {
  if (typeof value !== "string" || (nonempty && !value.trim())) {
    throw new Error(`${label} must be ${nonempty ? "nonempty " : ""}text.`);
  }
  return value;
}

function reference(value: unknown): AssistantReference {
  const entry = object(value, "Finding reference");
  if (entry.kind !== "node" && entry.kind !== "edge" && entry.kind !== "boundary") {
    throw new Error("Finding reference kind must be node, edge or boundary.");
  }
  return { kind: entry.kind, id: text(entry.id, "Finding reference ID", true),
    label: text(entry.label, "Finding reference label") };
}

function guidance(value: unknown): AiGuidanceReference[] {
  if (!Array.isArray(value)) throw new Error("Finding guidance references must be an array.");
  return value.map(value => {
    const entry = object(value, "Finding guidance reference");
    const source = entry.definitionSource;
    if (source !== "saved" && source !== "available" && source !== "core") {
      throw new Error("Finding guidance definition source is invalid.");
    }
    if (typeof entry.revision !== "number" || !Number.isSafeInteger(entry.revision) || entry.revision < 1 ||
        !Array.isArray(entry.sources) || entry.sources.some(source => typeof source !== "string")) {
      throw new Error("Finding guidance revision and sources are invalid.");
    }
    return {
      typeId: text(entry.typeId, "Finding guidance type ID", true), definitionSource: source,
      revision: entry.revision, updatedOn: text(entry.updatedOn, "Finding guidance date"),
      sources: entry.sources.map(source => text(source, "Finding guidance source")),
      ...(entry.protocolId !== undefined ? { protocolId: text(entry.protocolId, "Finding protocol ID", true) } : {}),
      ...(entry.methodId !== undefined ? { methodId: text(entry.methodId, "Finding method ID", true) } : {}),
    };
  });
}

export function normalizeFinding(value: unknown): PsFinding {
  const entry = object(value, "Finding");
  const severity = entry.severity;
  if (severity !== "critical" && severity !== "high" && severity !== "medium" && severity !== "low") {
    throw new Error("Finding severity is invalid.");
  }
  const status = entry.status === undefined ? "Active" : entry.status;
  if (status !== "Active" && status !== "Resolved") {
    throw new Error("Finding status must be Active or Resolved.");
  }
  if (!Array.isArray(entry.references)) throw new Error("Finding references must be an array.");
  const references = entry.references.map(reference);
  const savedTarget = (value: unknown, issue = false) => {
    const target = reference(value);
    if ((issue && target.kind === "boundary") ||
        !references.some(item => item.kind === target.kind && item.id === target.id && item.label === target.label)) {
      throw new Error("Finding navigation target must match an original diagram reference.");
    }
    return target;
  };
  if (entry.accepted !== undefined && typeof entry.accepted !== "boolean") {
    throw new Error("Finding accepted state must be a boolean.");
  }
  if (entry.workItemType !== undefined && !isWorkItemType(entry.workItemType)) {
    throw new Error("Finding work item type is invalid.");
  }
  return {
    id: text(entry.id, "Finding ID", true), title: text(entry.title, "Finding title"),
    category: text(entry.category, "Finding category"), severity, status,
    rationale: text(entry.rationale, "Finding rationale"),
    recommendation: text(entry.recommendation, "Finding recommendation"), references,
    ...(entry.accepted !== undefined ? { accepted: entry.accepted } : {}),
    ...(entry.workItemType !== undefined ? { workItemType: entry.workItemType } : {}),
    ...(entry.weaknessType !== undefined ? { weaknessType: text(entry.weaknessType, "Finding weakness type") } : {}),
    ...(entry.guidanceReferences !== undefined ? { guidanceReferences: guidance(entry.guidanceReferences) } : {}),
    ...(entry.focusReference !== undefined ? { focusReference: savedTarget(entry.focusReference) } : {}),
    ...(entry.issueReference !== undefined ? { issueReference: savedTarget(entry.issueReference, true) } : {}),
  };
}

export function normalizeFindings(value: unknown): PsFinding[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("Findings must be an array.");
  const ids = new Set<string>();
  return value.map(value => {
    const finding = normalizeFinding(value);
    if (ids.has(finding.id)) throw new Error("Finding IDs must be unique.");
    ids.add(finding.id);
    return finding;
  });
}

export function normalizeFindingAnalysis(value: unknown): PsFindingAnalysis | undefined {
  if (value === undefined) return undefined;
  const entry = object(value, "Finding analysis");
  if (typeof entry.createdAt !== "number" || !Number.isFinite(entry.createdAt) || entry.createdAt < 0 ||
      !Number.isFinite(new Date(entry.createdAt).getTime())) {
    throw new Error("Finding analysis timestamp is invalid.");
  }
  return {
    ...(entry.id !== undefined ? { id: text(entry.id, "Finding analysis ID", true) } : {}),
    scenarioId: text(entry.scenarioId, "Finding analysis scenario ID", true),
    scenarioName: text(entry.scenarioName, "Finding analysis scenario name"),
    createdAt: entry.createdAt, answer: text(entry.answer, "Finding analysis answer"),
  };
}

// Response IDs may repeat across analyses. Keep concurrent snapshots in distinct Yjs entries.
export function findingRecordKey(id: string, analysis: PsFindingAnalysis | undefined): string {
  return analysis?.id ? JSON.stringify([analysis.id, id]) : id;
}

export function captureFindings(findings: readonly AssistantFinding[], doc: PsDocument): PsFinding[] {
  const exists = (reference: AssistantReference) => (reference.kind === "node" ? doc.nodes
    : reference.kind === "edge" ? doc.edges : doc.boundaries).some(item => item.id === reference.id);
  return normalizeFindings(findings.map(finding => ({
    ...finding, status: "Active", accepted: false,
    focusReference: finding.references.find(exists),
    issueReference: finding.references.find(item => item.kind !== "boundary" && exists(item)),
  })))!;
}
