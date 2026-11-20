import "./collaboration-loader.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { modelFixture } from "../browser/fixture.mjs";

const {
  collectFindings, findingKey, findingExists, explicitStride,
  filterFindings, findingsInCell, findingScenarioLabel, DEFAULT_FINDINGS_FILTER, FINDING_SOURCES, STRIDE_CATEGORIES,
} = await import("../../src/findingsView.ts");
const { captureFindings } = await import("../../src/findings.ts");

const issue = (id, patch = {}) => ({
  id, title: "Repeated problem", targetKind: "node", targetId: "n_api",
  scenarioIds: ["s_primary"], status: "Active", description: "", createdAt: 1, replies: [], ...patch,
});
function fixture() {
  const doc = modelFixture().doc;
  doc.issues = [
    issue("i_rule", { kind: "Edge_auth_not_accepted", targetKind: "edge", targetId: "e_request", description: "Recorded policy conflict." }),
    issue("i_note", { origin: "authored-threat", description: "STRIDE: Tampering, Information disclosure", justification: "Authored rationale." }),
    issue("i_unknown"),
    issue("i_resolved", { origin: "authored-threat", status: "Resolved", scenarioIds: ["s_archive"] }),
    issue("i_no_scenario", { targetId: "n_detached", scenarioIds: [], origin: "authored-threat" }),
  ];
  doc.nodes.push({ ...doc.nodes[0], id: "n_detached", title: "Detached component" });
  doc.deviations = [{
    id: "dv_one", key: "synthetic:one", kind: "other", title: "STRIDE: Spoofing",
    description: "A model comparison, not a STRIDE assessment.", explanation: "Recorded mismatch.",
    scenarioIds: [], evidenceIds: [], status: "Active", createdAt: 1, updatedAt: 1,
  }];
  const assistantAnalysis = { documentSessionId: 7, scenarioId: "s_primary", scenarioName: "Primary", createdAt: 1234, answer: "Synthetic only." };
  const assistantFindings = captureFindings([{
    id: "ai_one", title: "Repeated problem", category: "Tampering / Information disclosure", severity: "high",
    rationale: "Returned rationale.", recommendation: "Returned recommendation.",
    references: [{ kind: "node", id: "n_client", label: "Client" }, { kind: "node", id: "n_api", label: "API" }],
  }, {
    id: "ai_unknown", title: "Not categorized", category: "Privacy", severity: "low",
    rationale: "", recommendation: "", references: [],
  }], doc);
  doc.findings = assistantFindings;
  doc.findingAnalysis = { ...assistantAnalysis };
  return {
    doc, documentSessionId: 7, assistantAnalysis, assistantFindings,
    assistantFindingLinks: { analysis: assistantAnalysis, documentSessionId: 7, issues: new Map() },
  };
}
const ids = records => records.map(record => record.identity.id).sort();

test("Findings: source, scope and status filters do not conflate saved with reviewed", () => {
  const input = fixture();
  const before = structuredClone(input);
  const records = collectFindings(input);
  assert.equal(records.length, 8);
  assert.equal(records.find(record => record.identity.id === "i_unknown").source, "review");
  assert.equal(records.find(record => record.identity.id === "i_note").source, "review");
  assert.equal(records.find(record => record.identity.id === "i_rule").source, "rules");
  assert.equal(records.find(record => record.identity.id === "dv_one").source, "service");
  assert.equal(filterFindings(records, DEFAULT_FINDINGS_FILTER, "s_primary").length, 7);
  assert.deepEqual(ids(filterFindings(records, { ...DEFAULT_FINDINGS_FILTER, status: "Needs review" }, null)), []);
  assert.ok(filterFindings(records, { ...DEFAULT_FINDINGS_FILTER, status: "Open" }, null).every(record => record.saved));
  assert.deepEqual(ids(filterFindings(records, { ...DEFAULT_FINDINGS_FILTER, scope: "current" }, null)), []);
  assert.deepEqual(ids(filterFindings(records, { ...DEFAULT_FINDINGS_FILTER, scope: "scenario:s_archive", status: "all" }, "s_primary")), ["dv_one", "i_resolved"]);
  assert.deepEqual(ids(filterFindings(records, { ...DEFAULT_FINDINGS_FILTER, scope: "unscoped" }, "s_primary")), ["dv_one", "i_no_scenario"]);
  assert.deepEqual(ids(filterFindings(records, { ...DEFAULT_FINDINGS_FILTER, source: "ai", query: "client" }, "s_primary")), ["ai_one"]);
  assert.equal(findingScenarioLabel(records.find(record => record.identity.id === "dv_one"), input.doc), "All scenarios (model-wide)");
  assert.deepEqual(input, before, "Projection and view filters never mutate model, snapshot or links");
});

test("Findings: every cell counts exactly its records; overlapping categories are not unique totals", () => {
  const records = filterFindings(collectFindings(fixture()), DEFAULT_FINDINGS_FILTER, "s_primary");
  let totalCells = 0;
  for (const category of STRIDE_CATEGORIES) for (const source of FINDING_SOURCES) {
    const cell = { category: category.id, source: source.id };
    const matches = findingsInCell(records, cell);
    const expected = records.filter(record => record.source === source.id &&
      (category.id === "U" ? record.mappings.length === 0 : record.mappings.some(mapping => mapping.category === category.id)));
    assert.deepEqual(matches, expected);
    totalCells += matches.length;
  }
  assert.equal(findingsInCell(records, null).length, records.length);
  assert.ok(totalCells > records.length, "Multi-category rows overlap rather than creating duplicate findings");
  assert.deepEqual(ids(findingsInCell(records, { category: "I", source: "ai" })), ["ai_one"]);
  assert.deepEqual(ids(findingsInCell(records, { category: "U", source: "service" })), ["dv_one"]);
  assert.deepEqual(ids(findingsInCell(records, { category: "S", source: "service" })), []);
});

test("Findings: mappings use only declared categories and an exact known rule; unknown evidence stays unknown", () => {
  assert.deepEqual(explicitStride("STRIDE: S - Spoofing; Information disclosure"), ["S", "I"]);
  assert.deepEqual(explicitStride("possible spoofing in arbitrary problem text"), []);
  assert.deepEqual(explicitStride("S / OWASP A01 / Privacy"), []);
  const input = fixture();
  input.doc.issues.push(issue("i_narrative", { description: "Spoofing is not assessed; no Tampering conclusion." }));
  input.doc.issues.push(issue("i_unknown_rule", { kind: "Other_Edge_auth_not_accepted" }));
  const records = collectFindings(input);
  assert.deepEqual(records.find(record => record.identity.id === "i_rule").mappings.map(mapping => [mapping.category, mapping.basis]), [["S", "Rule mapping"]]);
  assert.equal(records.find(record => record.identity.id === "i_note").mappings[0].basis, "Recorded category");
  assert.equal(records.find(record => record.identity.id === "ai_one").mappings[0].basis, "AI suggestion");
  for (const id of ["i_narrative", "i_unknown_rule", "dv_one", "ai_unknown"]) {
    assert.deepEqual(records.find(record => record.identity.id === id).mappings, []);
  }
  assert.match(records.find(record => record.identity.id === "i_unknown").sourceDescription, /original source not recorded/);
  assert.equal(records.find(record => record.identity.id === "ai_unknown").why, "No rationale was returned.");
  assert.equal(records.find(record => record.identity.id === "ai_unknown").next, "No recommendation was returned.");
});

test("Findings: only the returned issue ID joins a live/saved pair; same-title decoys remain independent", () => {
  const input = fixture();
  const live = collectFindings(input).find(record => record.identity.id === "ai_one");
  input.doc.issues.push(issue("i_returned", { targetId: "n_client", title: live.title }));
  input.assistantFindingLinks.issues.set("ai_one", "i_returned");
  let records = collectFindings(input);
  assert.equal(records.length, 8);
  assert.equal(records.filter(record => record.source === "ai").length, 2);
  assert.equal(records.find(record => record.identity.id === "ai_one").issue.id, "i_returned");
  assert.equal(records.find(record => record.identity.id === "ai_one").status, "Open");
  assert.ok(records.some(record => record.identity.id === "i_unknown"), "Title twin is not consumed");
  input.doc.issues.find(record => record.id === "i_returned").status = "Resolved";
  input.doc.issues.find(record => record.id === "i_returned").title = "Edited saved problem";
  records = collectFindings(input);
  assert.equal(records.find(record => record.identity.id === "ai_one").title, "Edited saved problem");
  assert.equal(records.find(record => record.identity.id === "ai_one").status, "Open",
    "An issue decision does not silently change the saved AI finding's lifecycle");
  input.assistantFindings[0].status = "Resolved";
  assert.equal(collectFindings(input).find(record => record.identity.id === "ai_one").status, "Resolved");
  input.doc.issues.find(record => record.id === "i_returned").description = "";
  input.doc.issues.find(record => record.id === "i_returned").scenarioIds = [];
  input.doc.scenarios[1].nodeIds.push("n_client");
  records = collectFindings(input);
  assert.equal(records.find(record => record.identity.id === "ai_one").found, "No description is recorded.");
  assert.deepEqual(records.find(record => record.identity.id === "ai_one").scenarioIds, ["s_primary", "s_archive"],
    "A saved empty scope follows its exact target's memberships, not a stale scope guess");
  input.doc.issues = input.doc.issues.filter(record => record.id !== "i_returned");
  const removed = collectFindings(input).find(record => record.identity.id === "ai_one");
  assert.equal(removed.savedIssueId, "i_returned");
  assert.equal(removed.issue, undefined, "A removed saved record never substitutes a title twin");
  assert.equal(removed.saved, true, "Deleting an issue never deletes the saved AI finding");
});

test("Findings: reused IDs and timestamps never join analysis generations or reloads", () => {
  const input = fixture();
  input.doc.issues.push(issue("i_saved"));
  input.assistantFindingLinks.issues.set("ai_one", "i_saved");
  const original = collectFindings(input).find(record => record.identity.id === "ai_one");
  input.assistantAnalysis = { ...input.assistantAnalysis };
  const newGeneration = collectFindings(input);
  assert.equal(findingExists(original.identity, input), false);
  assert.notEqual(newGeneration.find(record => record.identity.id === "ai_one").key, original.key);
  assert.ok(newGeneration.some(record => record.identity.id === "i_saved"), "Old links are not applied across generations");
  assert.equal(newGeneration.find(record => record.identity.id === "ai_one").saved, true);
  input.documentSessionId++;
  assert.equal(collectFindings(input).some(record => record.ai), false, "Document replacement rejects the stale analysis");
  input.assistantAnalysis = { ...input.assistantAnalysis, documentSessionId: input.documentSessionId };
  input.assistantFindingLinks = null;
  assert.ok(collectFindings(input).some(record => record.identity.id === "i_saved"), "Reload retains the real issue, not invented AI provenance");
  const reloaded = collectFindings(input).find(record => record.identity.id === "ai_one");
  assert.equal(reloaded.saved, true);
  assert.equal(reloaded.issue, undefined, "Reload cannot reconstruct an issue link by title");
});

test("Findings: primary targets stay pinned when another same-title reference survives", () => {
  const input = fixture();
  input.doc.nodes[0].title = input.doc.nodes[1].title = "Repeated service";
  const before = collectFindings(input).find(record => record.identity.id === "ai_one");
  assert.equal(before.target.id, "n_client");
  input.doc.nodes = input.doc.nodes.filter(node => node.id !== "n_client");
  const after = collectFindings(input).find(record => record.identity.id === "ai_one");
  assert.equal(after.target.id, "n_client");
  assert.match(after.targetLabel, /no longer available/);
  assert.equal(after.key, before.key);
  assert.equal(findingKey({ kind: "issue", id: "ai_one" }) === before.key, false);
});

test("Findings: duplicate IDs reject the complete target capture without choosing a winner", () => {
  const input = fixture();
  const before = structuredClone(input);
  const first = input.assistantFindings[0];
  assert.throws(() => captureFindings([first, {
    ...first, title: "Different problem with the same ID",
    references: [{ kind: "node", id: "n_api", label: "Different target" }],
  }], input.doc), /Finding IDs must be unique/);
  assert.deepEqual(input, before);
  assert.equal(input.assistantFindings[0].issueReference.id, "n_client",
    "The existing valid capture is not overwritten by an ambiguous response");
});

test("Findings: saved AI records without analysis metadata stay visible and honestly unscoped", () => {
  const input = fixture();
  input.assistantAnalysis = null;
  input.assistantFindingLinks = null;
  delete input.doc.findingAnalysis;
  const records = collectFindings(input).filter(record => record.ai);
  assert.equal(records.length, 2);
  for (const record of records) {
    assert.equal(record.saved, true);
    assert.equal(record.status, "Open");
    assert.deepEqual(record.scenarioIds, []);
    assert.equal(findingExists(record.identity, input), true);
    assert.equal(findingScenarioLabel(record, input.doc), "No scenario assigned");
  }
});
