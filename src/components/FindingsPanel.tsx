import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store";
import { useUiShell } from "../uiShell";
import { reviewElementExists, useReviewNavigation, type ReviewSource } from "../reviewNavigation";
import {
  collectFindings, DEFAULT_FINDINGS_FILTER, filterFindings, findingKey, findingHasCategory,
  findingScenarioLabel, findingsInCell, FINDING_SOURCES, STRIDE_CATEGORIES,
  type Finding, type FindingCell, type FindingsFilter,
} from "../findingsView";
import { ISSUE_NOT_EVALUATED_LABELS } from "../types";
import { formatGuidanceReferences } from "../aiDesignGuidance";
import { workItemFromFinding } from "../workItems";
import { WORK_ITEM_TYPES, isWorkItemType } from "../../shared/adoContract";
import { safeNavigationHref } from "../urlSafety";
import { useAiProvider } from "../aiProvider";

const sourceLabel = (finding: Finding) =>
  FINDING_SOURCES.find(source => source.id === finding.source)?.label ?? "Source not recorded";
const categoryLabel = (id: string) => STRIDE_CATEGORIES.find(category => category.id === id)?.label ?? id;
const sourceFor = (finding: Finding): ReviewSource =>
  ({ kind: "unified-finding", id: finding.key, identity: finding.identity });

export function FindingsPanel() {
  const store = useStore();
  const { pending } = useAiProvider();
  const { doc, assistantAnalysis, documentSessionId, collab } = store;
  const shell = useUiShell();
  const { visitFinding, visitElement, visitRecord } = useReviewNavigation();
  const [filter, setFilter] = useState<FindingsFilter>({ ...DEFAULT_FINDINGS_FILTER });
  const [cell, setCell] = useState<FindingCell | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [hideZeros, setHideZeros] = useState(false);
  const [error, setError] = useState("");
  const [selectedFindingKey, setSelectedFindingKey] = useState<string | null>(null);
  const errorElement = useRef<HTMLParagraphElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const readingPlaces = useRef(new Map<string, { content: number; chrome: number }>());
  const saves = useRef(new Map<string, string>());
  const session = `${documentSessionId}:${collab.room ?? ""}`;
  const previousSession = useRef(session);
  const classificationId = useId();
  const cardDescriptionId = useId();
  const records = useMemo(() => collectFindings(store), [
    doc, documentSessionId, store.assistantFindings, assistantAnalysis, store.assistantFindingLinks,
  ]);
  const missingScope = filter.scope.startsWith("scenario:")
    && !doc.scenarios.some(scenario => `scenario:${scenario.id}` === filter.scope);
  const base = useMemo(() => missingScope ? [] : filterFindings(records, filter, store.activeScenarioId),
    [records, filter, store.activeScenarioId, missingScope]);
  const shown = useMemo(() => findingsInCell(base, cell), [base, cell]);
  const detail = shell.findingDetail && records.find(record => record.key === findingKey(shell.findingDetail!));
  const readingKey = shell.findingDetail ? findingKey(shell.findingDetail) : "list";
  useEffect(() => {
    const target = records.find(finding => finding.key === selectedFindingKey)?.target;
    if (!target || !store.selection || store.selection.kind === "waypoint"
      || store.selection.kind !== target.kind || store.selection.id !== target.id) {
      setSelectedFindingKey(null);
    }
  }, [records, store.selection, selectedFindingKey]);
  useLayoutEffect(() => {
    if (!error) return;
    errorElement.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    errorElement.current?.focus({ preventScroll: true });
  }, [error]);
  useLayoutEffect(() => {
    const content = root.current;
    const inspector = content?.closest<HTMLElement>(".ps-inspector");
    if (!content || !inspector || shell.inspectorActiveTab !== "findings" || !shell.inspectorVisible) return;
    const saved = readingPlaces.current.get(readingKey);
    content.scrollTop = saved?.content ?? 0;
    inspector.scrollTop = saved?.chrome ?? 0;
    const remember = () => {
      if (content.clientHeight) readingPlaces.current.set(readingKey, { content: content.scrollTop, chrome: inspector.scrollTop });
    };
    content.addEventListener("scroll", remember);
    inspector.addEventListener("scroll", remember);
    return () => {
      content.removeEventListener("scroll", remember);
      inspector.removeEventListener("scroll", remember);
    };
  }, [readingKey, shell.inspectorActiveTab, shell.inspectorVisible, shell.inspectorPresentation]);

  useLayoutEffect(() => {
    if (previousSession.current === session) return;
    previousSession.current = session;
    setFilter({ ...DEFAULT_FINDINGS_FILTER });
    setCell(null);
    setCollapsed(false);
    setHideZeros(false);
    setError("");
    setSelectedFindingKey(null);
    saves.current.clear();
    readingPlaces.current.clear();
  }, [session]);
  useLayoutEffect(() => { setError(""); }, [shell.findingDetail]);

  const updateFilter = (patch: Partial<FindingsFilter>) => {
    shell.endReviewNavigation();
    setFilter(current => ({ ...current, ...patch }));
    setCell(null);
  };
  const revealResults = () => {
    const heading = resultsHeading.current;
    heading?.scrollIntoView({ block: "start", inline: "nearest" });
    heading?.focus({ preventScroll: true });
  };
  const selectCell = (next: FindingCell | null) => {
    shell.endReviewNavigation();
    setCell(current => current?.category === next?.category && current?.source === next?.source ? null : next);
    const view = resultsHeading.current?.ownerDocument.defaultView;
    view?.requestAnimationFrame(revealResults);
  };
  const showList = () => {
    shell.endReviewNavigation();
    shell.setFindingDetail(null);
    resultsHeading.current?.ownerDocument.defaultView?.requestAnimationFrame(revealResults);
  };
  const visitTarget = (finding: Finding, trigger: HTMLButtonElement, target = finding.target) => {
    if (target) visitElement(target, {
      trigger, source: sourceFor(finding), openProperties: true, scenarioIds: finding.scenarioIds,
    });
  };
  const focusCard = (finding: Finding, trigger: HTMLButtonElement) => {
    if (finding.target && visitElement(finding.target, {
      trigger, source: sourceFor(finding), scenarioIds: finding.scenarioIds,
    })) setSelectedFindingKey(finding.key);
  };
  const targetButton = (finding: Finding) => finding.target ? (
    <button type="button" className="ps-finding-place"
      disabled={!reviewElementExists(doc, finding.target)}
      aria-label={`View affected element: ${finding.targetLabel}`}
      onClick={event => visitTarget(finding, event.currentTarget)}>
      {finding.targetLabel} <span>/ {finding.target.kind === "edge" ? "flow" : finding.target.kind}</span>
    </button>
  ) : <p className="ps-findings-muted">{finding.targetLabel}</p>;
  const badges = (finding: Finding) => <div className="ps-finding-badges">
    {finding.ai && <span>{finding.ai.severity}</span>}
    <span>{finding.status}</span>
  </div>;
  const tags = (finding: Finding) => <div className="ps-finding-tags">
    {(finding.mappings.length ? finding.mappings.map(mapping => mapping.category) : ["U"]).map(category =>
      <span key={category}>STRIDE <strong>{categoryLabel(category)}</strong></span>)}
  </div>;
  const metadata = (finding: Finding) => <div className="ps-finding-meta">
    <span>{sourceLabel(finding)}</span>
    <span>{finding.saved ? "Saved" : "Session-only \u00b7 Not saved"}</span>
    <span>{findingScenarioLabel(finding, doc)}</span>
    <code>{finding.identity.id}</code>
  </div>;

  const createIssue = (finding: Finding) => {
    const { ai, identity } = finding;
    const links = store.assistantFindingLinks;
    if (!ai || identity.kind !== "ai") return;
    if ((links?.analysis === identity.analysis && links.documentSessionId === documentSessionId && links.issues.has(ai.id))
      || saves.current.has(finding.key)) return;
    const target = ai.issueReference;
    if (identity.analysis !== assistantAnalysis || !target || target.kind === "boundary"
      || identity.documentSessionId !== documentSessionId || !reviewElementExists(doc, target)
      || (identity.analysis && !doc.scenarios.some(scenario => scenario.id === identity.analysis!.scenarioId))) {
      setError("The original analysis, scenario or issue target is no longer available. Re-analyze before creating an issue.");
      return;
    }
    try {
      const created = store.addIssue(target.kind, target.id, identity.analysis ? [identity.analysis.scenarioId] : [], ai.title,
        `${ai.rationale}\n\nRecommended action: ${ai.recommendation}${formatGuidanceReferences(ai.guidanceReferences)}`,
        undefined, ai.guidanceReferences);
      saves.current.set(finding.key, created.id);
      store.setAssistantFindingLinks(current => ({
        analysis: identity.analysis, documentSessionId,
        issues: new Map(current?.analysis === identity.analysis && current.documentSessionId === documentSessionId
          ? current.issues : []).set(ai.id, created.id),
      }));
      store.updateFinding(ai.id, { accepted: true });
      setError("");
      detailHeading.current?.ownerDocument.defaultView?.requestAnimationFrame(() => detailHeading.current?.focus({ preventScroll: true }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create an issue from this finding.");
    }
  };

  const changeFinding = (id: string, patch: Parameters<typeof store.updateFinding>[1]) => {
    try {
      store.updateFinding(id, patch);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the finding.");
    }
  };

  const restoreActionFocus = (finding: Finding, trigger: HTMLButtonElement) => {
    const index = shown.findIndex(item => item.key === finding.key);
    const next = index >= 0 ? shown[index + 1] ?? shown[index - 1] : undefined;
    trigger.ownerDocument.defaultView?.requestAnimationFrame(() => {
      if (!root.current?.getClientRects().length) return;
      if (trigger.isConnected && trigger.getClientRects().length && !trigger.disabled) {
        trigger.focus({ preventScroll: true });
        return;
      }
      const row = [...root.current.querySelectorAll<HTMLElement>(".ps-finding-card")]
        .find(row => row.dataset.reviewId === next?.key);
      const control = row?.querySelector<HTMLElement>("[data-review-focus]:not(:disabled), [data-finding-details]");
      control?.scrollIntoView({ block: "nearest", inline: "nearest" });
      (control ?? resultsHeading.current)?.focus({ preventScroll: true });
    });
  };
  const toggleReviewStatus = (finding: Finding, trigger: HTMLButtonElement) => {
    try {
      if (finding.ai) store.updateFinding(finding.ai.id, { status: finding.ai.status === "Active" ? "Resolved" : "Active" });
      else if (finding.issue) store.setIssueStatus(finding.issue.id, finding.issue.status === "Active" ? "Resolved" : "Active");
      else throw new Error("Review status cannot be changed for this source.");
      setError("");
      restoreActionFocus(finding, trigger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update the finding.");
    }
  };
  const deleteReviewRecord = (finding: Finding, trigger: HTMLButtonElement) => {
    const owner = trigger.ownerDocument.defaultView ?? window;
    if (!owner.confirm(finding.ai
      ? "Delete this finding? Issues and work items already created from it will be kept."
      : "Delete this issue and its replies?")) return;
    try {
      if (finding.ai) store.deleteFinding(finding.ai.id);
      else if (finding.issue) store.deleteIssue(finding.issue.id);
      else throw new Error("This source does not support deleting its record.");
      setError("");
      if (detail?.key === finding.key) showList();
      restoreActionFocus(finding, trigger);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the finding.");
    }
  };
  const lifecycleActions = (finding: Finding) => (finding.ai || finding.issue) && <>
    <button type="button" disabled={!!finding.ai && pending > 0}
      onClick={event => toggleReviewStatus(finding, event.currentTarget)}>
      {finding.status === "Resolved" ? "Reopen" : "Resolve"}
    </button>
    <button type="button" className="ps-danger" disabled={!!finding.ai && pending > 0}
      onClick={event => deleteReviewRecord(finding, event.currentTarget)}>Delete</button>
  </>;

  const aiActions = (finding: Finding) => {
    const ai = finding.ai;
    if (!ai) return null;
    const target = ai.issueReference;
    const accepted = store.acceptedFindingIds.has(ai.id);
    const canSave = !!target && reviewElementExists(doc, target)
      && (!assistantAnalysis || doc.scenarios.some(scenario => scenario.id === assistantAnalysis.scenarioId));
    return <>
      <div className="ps-finding-actions">
        <button type="button" className="ps-finding-primary"
          disabled={!!finding.savedIssueId || accepted || !canSave}
          onClick={() => createIssue(finding)}>{finding.issue ? "Issue created" : "Create issue"}</button>
        {finding.issue && <span role="status">Issue <code>{finding.issue.id}</code>. Linked once to this analysis.</span>}
      </div>
      {finding.savedIssueId && !finding.issue && <p role="status">
        The previously created issue is no longer available. It has not been recreated or replaced by another record.
      </p>}
      {!canSave && <p className="ps-findings-muted">Creating an issue requires the original node or flow and any recorded analysis scenario to remain available.</p>}
      {accepted && !finding.savedIssueId && <p className="ps-findings-muted">Marked accepted in the saved review. A linked issue or Work item ID is not recorded here.</p>}
      <details className="ps-assistant-work-classification">
        <summary>Work item actions</summary>
        <fieldset disabled={accepted || pending > 0}>
          <legend>Individual finding classification</legend>
          <label htmlFor={`${classificationId}-type`}>Work item type</label>
          <select id={`${classificationId}-type`} value={ai.workItemType ?? ""} onChange={event => {
            const value = event.target.value;
            if (value === "" || isWorkItemType(value)) changeFinding(ai.id, { workItemType: value || undefined });
          }}>
            <option value="">Not set</option>
            {WORK_ITEM_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          <label htmlFor={`${classificationId}-weakness`}>Weakness Type</label>
          <input id={`${classificationId}-weakness`} value={ai.weaknessType ?? ""} placeholder="Optional (blank allowed)"
            onChange={event => {
              const weaknessType = event.target.value || undefined;
              changeFinding(ai.id, { weaknessType });
            }} />
          <p>These choices copy into a new pending Work item. Type and Severity are required for Bugs and Tasks; Weakness Type may be blank.</p>
        </fieldset>
        <button type="button" disabled={accepted} onClick={event => {
          try {
            const created = store.createWorkItem(workItemFromFinding(ai, assistantAnalysis));
            store.updateFinding(ai.id, { accepted: true });
            visitRecord({ kind: "work", id: created.id }, event.currentTarget, sourceFor(finding));
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not create the work item.");
          }
        }}>Create work item</button>
      </details>
    </>;
  };

  return <div className="ps-findings" ref={root} tabIndex={0} data-assistant-scroll="findings">
    {error && <p ref={errorElement} tabIndex={-1} role="alert">{error}</p>}
    <div hidden={!!shell.findingDetail} data-findings-list>
      <div className="ps-findings-filters">
        <label>Scope<select aria-label="Findings scope" value={filter.scope} onChange={event => updateFilter({ scope: event.target.value })}>
          <option value="all">All scenarios</option>
          <option value="current">Current scenario</option>
          <option value="unscoped">No scenario assigned</option>
          {doc.scenarios.map(scenario => <option key={scenario.id} value={`scenario:${scenario.id}`}>{scenario.name}</option>)}
        </select></label>
        <label>Source<select aria-label="Findings source" value={filter.source}
          onChange={event => updateFilter({ source: event.target.value as FindingsFilter["source"] })}>
          <option value="all">All sources</option>
          {FINDING_SOURCES.map(source => <option key={source.id} value={source.id}>{source.label}</option>)}
        </select></label>
        <label>Status<select aria-label="Findings status" value={filter.status}
          onChange={event => updateFilter({ status: event.target.value as FindingsFilter["status"] })}>
          <option value="attention">Needs attention</option><option value="all">All statuses</option>
          {(["Needs review", "Open", "Resolved"] as const).map(status => <option key={status}>{status}</option>)}
        </select></label>
        <label>Search findings<input type="search" aria-label="Search findings" placeholder="Problem, element or ID" value={filter.query}
          onChange={event => updateFilter({ query: event.target.value })} /></label>
      </div>
      {filter.scope === "current" && <p className="ps-findings-muted" role="status">
        {store.activeScenario ? `Current scenario: ${store.activeScenario.name}` : "No current scenario is selected. Choose a scenario or All scenarios."}
      </p>}
      {missingScope && <p className="ps-findings-muted" role="status">The selected scenario no longer exists. Choose another scope; no scenario was substituted.</p>}
      <div className="ps-findings-section-heading">
        <h3>STRIDE evidence</h3>
        <div>
          <button type="button" className="ps-findings-link" onClick={revealResults}>Findings ({shown.length})</button>
          <button type="button" className="ps-findings-link" aria-expanded={!collapsed} aria-controls="ps-stride-summary"
            onClick={() => setCollapsed(current => !current)}>{collapsed ? "Show STRIDE evidence" : "Collapse"}</button>
        </div>
      </div>
      <div id="ps-stride-summary" hidden={collapsed}>
        <div className="ps-findings-matrix">
          <div className="ps-findings-table-scroll" tabIndex={0} role="region" aria-label="STRIDE evidence table">
            <table aria-label="STRIDE evidence by source">
              <thead><tr><th scope="col">Category</th>{FINDING_SOURCES.map(source => <th key={source.id} scope="col">{source.label}</th>)}</tr></thead>
              <tbody>{STRIDE_CATEGORIES.filter(category => !hideZeros || base.some(finding => findingHasCategory(finding, category.id))).map(category =>
                <tr key={category.id}>
                  <th scope="row"><span className="ps-stride-code">{category.id}</span> {category.label}</th>
                  {FINDING_SOURCES.map(source => {
                    const count = findingsInCell(base, { category: category.id, source: source.id }).length;
                    return <td key={source.id}>{count ? <button type="button"
                      aria-label={`STRIDE ${category.label}, ${source.label}: ${count} ${count === 1 ? "finding" : "findings"}`}
                      aria-pressed={cell?.category === category.id && cell.source === source.id} aria-controls="ps-finding-results"
                      onClick={() => selectCell({ category: category.id, source: source.id })}>{count}</button>
                      : <span className="ps-findings-muted">0</span>}</td>;
                  })}
                </tr>)}</tbody>
            </table>
          </div>
          <div className="ps-findings-matrix-foot">
            <span>Counts filter this list; categories can overlap.</span>
            <button type="button" className="ps-findings-link" aria-pressed={hideZeros} onClick={() => setHideZeros(value => !value)}>
              {hideZeros ? "Show all category rows" : "Hide zero rows"}
            </button>
          </div>
        </div>
        <p className="ps-findings-hint">A zero is not a security pass.{!assistantAnalysis && (store.assistantFindings.length
          ? " Analysis context is not recorded for these saved findings." : " No AI analysis is retained.")}</p>
      </div>
      <div id="ps-finding-results">
        <div className="ps-findings-list-heading">
          <h3 ref={resultsHeading} tabIndex={-1} data-findings-results>{cell ? "Matching findings" : "Findings"} ({shown.length})</h3>
          <span>{cell ? `${shown.length} of ${base.length}` : base.length} unique in this scope</span>
        </div>
        {cell && <div className="ps-findings-filter-chip">
          <span>STRIDE &middot; {categoryLabel(cell.category)} &middot; {FINDING_SOURCES.find(source => source.id === cell.source)?.label}</span>
          <button type="button" aria-label="Clear selected evidence count" onClick={() => selectCell(null)}>Clear</button>
        </div>}
        {!shown.length ? <div className="ps-findings-empty" role="status">
          <h3>No matching findings</h3>
          <p>Change the filters to see other records. This does not establish that the design was assessed or is safe.</p>
        </div> : <ul className="ps-finding-list">{shown.map((finding, index) => <li key={finding.key}
          className={`ps-finding-card${selectedFindingKey === finding.key ? " ps-finding-card-selected" : ""}`}
          data-review-kind="unified-finding" data-review-id={finding.key}
          data-finding-id={finding.identity.id} data-finding-source={finding.source ?? "unknown"}>
          <button type="button" className="ps-finding-card-main" data-review-focus
            aria-label={`Focus finding: ${finding.title}`} aria-pressed={selectedFindingKey === finding.key}
            aria-describedby={`${cardDescriptionId}-${index}`}
            disabled={!finding.target || !reviewElementExists(doc, finding.target)}
            title={finding.target && reviewElementExists(doc, finding.target)
              ? `Focus ${finding.targetLabel}` : "No available diagram target; use Details to review this finding"}
            onClick={event => focusCard(finding, event.currentTarget)}>
            <div className="ps-finding-card-heading">
              <span className="ps-finding-title">{finding.title}</span>
              {badges(finding)}
            </div>
            <div id={`${cardDescriptionId}-${index}`}>
              <span className="ps-finding-place">{finding.targetLabel}
                {finding.target && <span> / {finding.target.kind === "edge" ? "flow" : finding.target.kind}</span>}
              </span>
              <p><strong>Why:</strong> {finding.why}</p>
              <p><strong>Next:</strong> {finding.next}</p>
              {tags(finding)}
              {metadata(finding)}
            </div>
          </button>
          <div className="ps-allissues-actions ps-finding-card-actions">
            <button type="button" data-finding-details
              onClick={event => visitFinding(finding.identity, event.currentTarget)}>Details</button>
            {lifecycleActions(finding)}
            {finding.deviation && <button type="button" onClick={event =>
              visitRecord({ kind: "deviation", id: finding.deviation!.id }, event.currentTarget, sourceFor(finding))}>Explain</button>}
          </div>
        </li>)}</ul>}
      </div>
      <details className="ps-findings-source-tools">
        <summary>Source tools and authoring</summary>
        <div className="ps-finding-actions">
          <button type="button" onClick={event => shell.openInspector("assistant", event.currentTarget)}>AI Assistant</button>
          <button type="button" onClick={event => shell.openInspector("issues", event.currentTarget)}>Issues and threat notes</button>
          {doc.deviations.length > 0 && <button type="button" onClick={event => shell.openInspector("deviations", event.currentTarget)}>Deviation explanations</button>}
        </div>
      </details>
    </div>
    {shell.findingDetail && (detail ? <article className="ps-finding-detail" data-finding-detail
      data-review-kind="unified-finding" data-review-id={detail.key} data-finding-id={detail.identity.id}>
      <h2 ref={detailHeading} tabIndex={-1} data-finding-detail-heading data-review-focus>{detail.title}</h2>
      {badges(detail)}
      {targetButton(detail)}
      {metadata(detail)}
      {!shown.some(finding => finding.key === detail.key) && <p className="ps-findings-hint">
        This finding is outside the current list filters. Your filters have been kept.
      </p>}
      <section><h3>What was found</h3><p>{detail.found}</p></section>
      <section><h3>Why it matters</h3><p>{detail.why}</p></section>
      <section className="ps-finding-next"><h3>What to do next</h3><p>{detail.next}</p></section>
      <section><h3>STRIDE classification</h3>
        {detail.mappings.length ? detail.mappings.map(mapping => <div className="ps-finding-mapping" key={mapping.category}>
          <strong>{mapping.category} &middot; {categoryLabel(mapping.category)}</strong>
          <p><strong>{mapping.basis}.</strong> {mapping.reason}</p>
        </div>) : <div className="ps-finding-mapping"><strong>Unclassified</strong><p>No supported STRIDE mapping is recorded. No threat category was inferred.</p></div>}
        <p className="ps-findings-hint">STRIDE organizes the evidence. A category label does not verify a threat.</p>
      </section>
      <section><details className="ps-finding-evidence">
        <summary>Evidence and source</summary>
        <p>{detail.sourceDescription}</p>
        <p>Record ID: <code>{detail.identity.id}</code></p>
        {detail.issue?.notEvaluatedReason && <p>{ISSUE_NOT_EVALUATED_LABELS[detail.issue.notEvaluatedReason]}</p>}
        {detail.ai && detail.identity.kind === "ai" && detail.identity.analysis && <>
          <p>Analysis snapshot: {detail.identity.analysis.scenarioName}. {new Date(detail.identity.analysis.createdAt).toLocaleString()}.</p>
          <p>Rationale and recommendation are retained AI suggestions, not updated by later model or issue edits.</p>
          <p>{detail.identity.analysis.answer || "No analysis summary was returned."}</p>
          {detail.ai.references.length > 0 && <ul>{detail.ai.references.map((reference, index) =>
            <li key={`${reference.kind}:${reference.id}:${index}`}>
              {reference.label || "Unnamed reference"}: {reference.kind} <code>{reference.id}</code>
              {!reviewElementExists(doc, reference) && " (no longer available)"}
            </li>)}</ul>}
        </>}
        {detail.deviation && <>
          <p>Evidence IDs: {detail.deviation.evidenceIds.length ? detail.deviation.evidenceIds.join(", ") : "None recorded"}</p>
          <p>Comparison key: <code>{detail.deviation.key}</code></p>
          {!!detail.deviation.sampleCalls?.length && <p>{detail.deviation.sampleCalls.length} recorded sample calls available in source details.</p>}
        </>}
        {!!(detail.ai?.guidanceReferences ?? detail.issue?.guidanceReferences)?.length &&
          <p>{formatGuidanceReferences(detail.ai?.guidanceReferences ?? detail.issue?.guidanceReferences)}</p>}
        {detail.issue?.resolutionLink && safeNavigationHref(detail.issue.resolutionLink) &&
          <a href={safeNavigationHref(detail.issue.resolutionLink)!} target="_blank" rel="noopener noreferrer">Resolution guidance</a>}
      </details></section>
      {detail.ai && detail.ai.references.length > 1 && <div className="ps-finding-actions" aria-label="Exact diagram references">
        {detail.ai.references.map((reference, index) => <button key={`${reference.kind}:${reference.id}:${index}`} type="button"
          data-reference-kind={reference.kind} data-reference-id={reference.id}
          disabled={!reviewElementExists(doc, reference)} onClick={event => visitTarget(detail, event.currentTarget, reference)}>
          View {reference.label || reference.id} ({reference.kind})
        </button>)}
      </div>}
      {aiActions(detail)}
      <div className="ps-finding-actions">
        {lifecycleActions(detail)}
        {detail.issue && <>
          <button type="button" onClick={event => visitRecord({ kind: "issue", id: detail.issue!.id }, event.currentTarget, sourceFor(detail))}>
            Edit issue and replies
          </button>
        </>}
        {detail.deviation && <>
          <button type="button" onClick={event => visitRecord({ kind: "deviation", id: detail.deviation!.id }, event.currentTarget, sourceFor(detail))}>
            Explain and view source details
          </button>
        </>}
        <button type="button" onClick={showList}>Findings list</button>
      </div>
    </article> : <div role="status">
      <h3>This finding is no longer available</h3>
      <p>No other record was substituted. Return to the list to review the remaining findings.</p>
      <button type="button" onClick={showList}>Findings list</button>
    </div>)}
  </div>;
}
