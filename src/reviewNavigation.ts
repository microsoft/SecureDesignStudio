import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStore, type FilterState, type Selection } from "./store";
import { useUiShell, type InspectorTab } from "./uiShell";
import type { PsDocument, Scenario } from "./types";
import type { AssistantAnalysisSnapshot } from "./designAssistant";
import { getDetailsTab, setDetailsTab, type DetailsTab } from "./components/detailsTabStore";

type ScrollPlace = { element: HTMLElement; top: number; left: number; anchor?: HTMLElement; offset?: number };
export type InspectorPlace = {
  scroll: ScrollPlace[];
  focus: HTMLElement | null;
  caret?: { start: number; end: number; direction: "forward" | "backward" | "none" };
};

function textControl(element: HTMLElement | null): element is HTMLInputElement | HTMLTextAreaElement {
  return element?.tagName === "INPUT" || element?.tagName === "TEXTAREA";
}

export function captureInspectorPlace(host: HTMLElement, previous?: InspectorPlace, trigger?: HTMLElement): InspectorPlace {
  const scrollers = [...host.querySelectorAll<HTMLElement>("*")].filter(element => element.clientHeight > 0 && (
    element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth
    || element.hasAttribute("data-assistant-scroll")
  ));
  if (!scrollers.length && previous) return previous;
  const active = trigger ?? host.ownerDocument.activeElement;
  const focus = active && host.contains(active) && "focus" in active && typeof active.focus === "function"
    ? active as HTMLElement : null;
  const scroll = new Map((previous?.scroll ?? []).filter(saved => host.contains(saved.element))
    .map(saved => [saved.element, saved]));
  for (const element of scrollers) {
    const bounds = element.getBoundingClientRect();
    const anchor = [...element.querySelectorAll<HTMLElement>("[data-review-id], [data-finding-id]")]
      .find(row => row.getBoundingClientRect().bottom > bounds.top && row.getBoundingClientRect().top < bounds.bottom);
    scroll.set(element, {
      element, top: element.scrollTop, left: element.scrollLeft,
      ...(anchor ? { anchor, offset: anchor.getBoundingClientRect().top - bounds.top } : {}),
    });
  }
  const place: InspectorPlace = { focus, scroll: [...scroll.values()] };
  if (textControl(focus) && typeof focus.selectionStart === "number" && typeof focus.selectionEnd === "number") {
    place.caret = { start: focus.selectionStart, end: focus.selectionEnd, direction: focus.selectionDirection ?? "none" };
  }
  return place;
}

export function restoreInspectorPlace(host: HTMLElement, place: InspectorPlace, restoreFocus = true): boolean {
  for (const saved of place.scroll) {
    const element = saved.element;
    if (!host.contains(element) || !element.clientHeight) continue;
    element.scrollTop = saved.top;
    element.scrollLeft = saved.left;
    if (saved.anchor && element.contains(saved.anchor) && saved.anchor.getClientRects().length) {
      element.scrollTop += saved.anchor.getBoundingClientRect().top - element.getBoundingClientRect().top - (saved.offset ?? 0);
    }
  }
  if (!restoreFocus || !place.focus?.isConnected || !host.contains(place.focus) || !place.focus.getClientRects().length) return false;
  const focus = place.focus.matches(":disabled")
    ? host.querySelector<HTMLElement>(".ps-assistant-window-actions button:not(:disabled)") : place.focus;
  focus?.focus({ preventScroll: true });
  if (focus === place.focus && place.caret && textControl(place.focus)) {
    place.focus.setSelectionRange(place.caret.start, place.caret.end, place.caret.direction);
  }
  return !!focus;
}

export type ReviewElement = { kind: "node" | "edge" | "boundary" | "annotation" | "scenario"; id: string };
export type ReviewRecord = { kind: "issue" | "comment" | "work" | "deviation"; id: string };
export type ReviewSource = { kind: ReviewRecord["kind"] | "change" | "finding" | "message"; id: string };
type ReturnPoint = {
  tab: InspectorTab;
  source?: ReviewSource;
  session: string;
  analysis: AssistantAnalysisSnapshot | null;
  scenarioId: string | null;
  selection: Selection;
  multiSelectedIds: string[];
  filter: FilterState;
  detailsTab: DetailsTab;
  place: InspectorPlace;
};
type NavigationRequest = {
  session: string;
  tab: InspectorTab;
} & ({ kind: "tab" | "panel" } | { kind: "record"; target: ReviewRecord } | { kind: "return"; point: ReturnPoint });
export type ReviewNavigationState = {
  returns: ReturnPoint[];
  preview: ReturnPoint | null;
  request: NavigationRequest | null;
  notice: string | null;
  revision: number;
};

export const inspectorViewLabels: Record<InspectorTab, string> = {
  properties: "Properties", edges: "Edges", issues: "Issues",
  assistant: "Findings", comments: "Comments", deviations: "Deviations", changes: "Changes", data: "Data", work: "Work",
};

export function reviewElementExists(doc: PsDocument, target: ReviewElement): boolean {
  const items = target.kind === "node" ? doc.nodes : target.kind === "edge" ? doc.edges
    : target.kind === "boundary" ? doc.boundaries : target.kind === "scenario" ? doc.scenarios : doc.textAnnotations ?? [];
  return items.some(item => item.id === target.id);
}

function inScenario(scenario: Scenario, target: ReviewElement): boolean {
  if (target.kind === "scenario") return scenario.id === target.id;
  const ids = target.kind === "node" ? scenario.nodeIds : target.kind === "edge" ? scenario.edgeIds
    : target.kind === "boundary" ? scenario.boundaryIds : scenario.textAnnotationIds ?? [];
  return ids.includes(target.id);
}

function validSelection(doc: PsDocument, selection: Selection, scenarioId: string | null): boolean {
  if (!selection) return true;
  const target: ReviewElement = selection.kind === "waypoint" ? { kind: "edge", id: selection.edgeId } : selection;
  if (!reviewElementExists(doc, target)) return false;
  if (selection.kind === "waypoint" && !doc.edges.find(edge => edge.id === selection.edgeId)
    ?.waypoints.some(waypoint => waypoint.id === selection.waypointId)) return false;
  return scenarioId === null || doc.scenarios.some(scenario => scenario.id === scenarioId && inScenario(scenario, target));
}

function recordRow(host: HTMLElement, tab: InspectorTab, record: ReviewSource): HTMLElement | undefined {
  return [...host.querySelectorAll<HTMLElement>(`#ps-inspector-panel-${tab} [data-review-id]`)]
    .find(row => row.dataset.reviewKind === record.kind && row.dataset.reviewId === record.id);
}

export function useReviewNavigation() {
  const store = useStore();
  const shell = useUiShell();
  const { doc, activeScenarioId, selection, filter, documentSessionId, collab, assistantAnalysis } = store;
  const { reviewNavigation, setReviewNavigation, inspectorActiveTab, inspectorHostRef } = shell;
  const session = `${documentSessionId}:${collab.room ?? ""}`;

  const capture = (source?: ReviewSource, trigger?: HTMLElement): ReturnPoint => ({
    tab: inspectorActiveTab, source, session, analysis: assistantAnalysis,
    scenarioId: activeScenarioId, selection, multiSelectedIds: [...store.multiSelectedIds],
    filter: { ...filter }, detailsTab: getDetailsTab(),
    place: inspectorHostRef.current ? captureInspectorPlace(inspectorHostRef.current, undefined, trigger) : { scroll: [], focus: null },
  });

  const visit = (tab: InspectorTab, source: ReviewSource | undefined, trigger: HTMLElement | undefined,
    request: NavigationRequest | null, continueVisit = false) => {
    const preview = reviewNavigation.preview;
    // A row's first click may select a target before its double-click opens Properties.
    const point = continueVisit && preview && preview.session === session && preview.tab === inspectorActiveTab
      && source && preview.source?.kind === source.kind && preview.source.id === source.id
      && (pointIsAssistant(preview) ? preview.analysis === assistantAnalysis : true) ? preview : capture(source, trigger);
    const changesView = tab !== inspectorActiveTab;
    setReviewNavigation(current => ({
      returns: changesView ? [...current.returns, point].slice(-4) : current.returns,
      preview: changesView ? null : point,
      notice: null, request, revision: current.revision + 1,
    }));
    if (changesView || request) shell.openInspector(tab, trigger, { preserveReviewJourney: true, focus: false });
  };

  const visitElement = (target: ReviewElement, options: {
    source?: ReviewSource; trigger: HTMLElement; openProperties?: boolean;
    scenarioIds?: readonly string[]; requiredScenarioId?: string; continueVisit?: boolean;
  }): boolean => {
    if (!reviewElementExists(doc, target) || (options.requiredScenarioId &&
      !doc.scenarios.some(scenario => scenario.id === options.requiredScenarioId && inScenario(scenario, target)))) {
      setReviewNavigation(current => ({ ...current, notice: "This exact target is no longer available in its review context." }));
      return false;
    }
    const scenarios = doc.scenarios.filter(scenario => inScenario(scenario, target));
    const preferred = options.requiredScenarioId ? [options.requiredScenarioId]
      : options.scenarioIds ?? (activeScenarioId ? [activeScenarioId] : []);
    const scenarioId = preferred.find(id => scenarios.some(scenario => scenario.id === id)) ?? scenarios[0]?.id ?? null;
    const tab = options.openProperties || (!shell.inspectorPinned && inspectorActiveTab !== "edges" && inspectorActiveTab !== "changes")
      ? "properties" : inspectorActiveTab;
    visit(tab, options.source, options.trigger, tab === inspectorActiveTab ? null : { kind: "tab", tab, session },
      options.continueVisit ?? options.openProperties);
    store.setActiveScenarioId(scenarioId);
    store.setSelection(target.kind === "scenario" ? null : { kind: target.kind, id: target.id });
    if (tab !== inspectorActiveTab && Object.values(filter).some(Boolean)) store.clearFilter();
    if (target.kind !== "scenario") store.setFocusTarget({ kind: target.kind, id: target.id });
    return true;
  };

  const visitRecord = (target: ReviewRecord, trigger: HTMLElement, source?: ReviewSource) => {
    const tab = target.kind === "issue" ? "issues" : target.kind === "comment" ? "comments"
      : target.kind === "deviation" ? "deviations" : "work";
    // Creation and this request are batched; validate the returned ID after the saved record renders.
    visit(tab, source, trigger, { kind: "record", target, tab, session });
  };

  const sourceExists = (point: ReturnPoint): boolean => {
    const source = point.source;
    if (!source) return true;
    switch (source.kind) {
      case "issue": return doc.issues.some(item => item.id === source.id);
      case "comment": return doc.comments.some(item => item.id === source.id);
      case "deviation": return doc.deviations.some(item => item.id === source.id);
      case "work": return doc.workItems.some(item => item.id === source.id);
      case "change": return store.diffChanges.some(item => item.id === source.id);
      case "finding": return point.analysis === assistantAnalysis && store.assistantFindings.some(item => item.id === source.id);
      case "message": return !!inspectorHostRef.current && !!recordRow(inspectorHostRef.current, point.tab, source);
    }
  };

  const back = () => {
    const point = reviewNavigation.returns.at(-1);
    if (!point || point.session !== session) { shell.endReviewNavigation(); return; }
    const scenarioAvailable = point.scenarioId === null || doc.scenarios.some(scenario => scenario.id === point.scenarioId);
    const originAvailable = sourceExists(point);
    const selectionAvailable = scenarioAvailable && validSelection(doc, point.selection, point.scenarioId);
    const tab = (point.tab === "changes" && !store.diffFileName) || (point.tab === "deviations" && !doc.deviations.length)
      ? "properties" : point.tab;
    const notice = !originAvailable ? "The original review record is no longer available. No other record was substituted."
      : !scenarioAvailable ? "The original scenario is no longer available. Showing all scenarios without restoring its selection."
      : !selectionAvailable ? "The original selection is no longer available in this scenario."
      : null;
    store.setActiveScenarioId(scenarioAvailable ? point.scenarioId : null);
    const additional = selectionAvailable ? point.multiSelectedIds.filter(id => {
      const kind = doc.nodes.some(node => node.id === id) ? "node"
        : doc.boundaries.some(boundary => boundary.id === id) ? "boundary" : "annotation";
      return validSelection(doc, { kind, id }, point.scenarioId);
    }) : [];
    store.setSelection(selectionAvailable ? point.selection : null, additional);
    store.setFilter(point.filter);
    setDetailsTab(point.detailsTab);
    setReviewNavigation(current => ({
      returns: current.returns.slice(0, -1), preview: null, notice, revision: current.revision + 1,
      request: originAvailable && scenarioAvailable && tab === point.tab
        ? { kind: "return", point, session, tab } : { kind: "tab", session, tab },
    }));
    shell.openInspector(tab, undefined, { preserveReviewJourney: true, focus: false });
  };

  const dismiss = () => {
    setReviewNavigation(current => ({ returns: [], preview: null, notice: null,
      revision: current.revision + 1, request: { kind: "panel", tab: inspectorActiveTab, session } }));
    shell.openInspector(inspectorActiveTab, undefined, { preserveReviewJourney: true, focus: false });
  };

  return { visitElement, visitRecord, back, dismiss, session };
}

function pointIsAssistant(point: ReturnPoint): boolean { return point.tab === "assistant"; }

export function useReviewNavigationLifecycle() {
  const { documentSessionId, collab, assistantAnalysis, viewMode, doc } = useStore();
  const { reviewNavigation, setReviewNavigation, endReviewNavigation, inspectorHostRef, inspectorVisible } = useUiShell();
  const session = `${documentSessionId}:${collab.room ?? ""}`;
  const previousSession = useRef(session);
  const previousView = useRef(viewMode);
  const currentDoc = useRef(doc);
  currentDoc.current = doc;

  useLayoutEffect(() => {
    if (previousSession.current !== session || previousView.current !== viewMode) endReviewNavigation();
    previousSession.current = session;
    previousView.current = viewMode;
  }, [session, viewMode, endReviewNavigation]);

  useLayoutEffect(() => {
    if ([...reviewNavigation.returns, ...(reviewNavigation.preview ? [reviewNavigation.preview] : []),
      ...(reviewNavigation.request?.kind === "return" ? [reviewNavigation.request.point] : [])]
      .some(point => pointIsAssistant(point) && point.analysis !== assistantAnalysis)) {
      endReviewNavigation("assistant", "The AI review changed. Its previous return context is no longer available.");
    }
  }, [assistantAnalysis, reviewNavigation.returns, reviewNavigation.preview, reviewNavigation.request, endReviewNavigation]);

  useLayoutEffect(() => {
    const request = reviewNavigation.request;
    if (!request || request.session !== session || !inspectorVisible) return;
    const host = inspectorHostRef.current;
    const view = host?.ownerDocument.defaultView;
    if (!host || !view) return;
    let frame = view.requestAnimationFrame(() => {
      frame = view.requestAnimationFrame(() => {
        host.ownerDocument.defaultView?.focus();
        const panel = host.querySelector<HTMLElement>(`#ps-inspector-panel-${request.tab}`);
        const tab = host.querySelector<HTMLElement>(`#ps-inspector-tab-${request.tab}`);
        if (!panel || panel.hidden) return;
        if (request.kind === "return") {
          const focus = request.point.place.focus;
          if (focus?.isConnected && panel.contains(focus) && !focus.matches(":disabled") && focus.getClientRects().length) {
            restoreInspectorPlace(host, request.point.place);
          } else {
            restoreInspectorPlace(host, request.point.place, false);
            const row = request.point.source ? recordRow(host, request.tab, request.point.source) : undefined;
            const control = row?.querySelector<HTMLElement>("[data-review-focus]:not(:disabled), .ps-assistant-finding-target:not(:disabled), button:not(:disabled)");
            (control ?? tab)?.focus({ preventScroll: true });
          }
        } else if (request.kind === "record") {
          const current = currentDoc.current;
          const records = request.target.kind === "issue" ? current.issues : request.target.kind === "comment" ? current.comments
            : request.target.kind === "work" ? current.workItems : current.deviations;
          const row = records.some(record => record.id === request.target.id) ? recordRow(host, request.tab, request.target) : undefined;
          if (!row) {
            setReviewNavigation(current => ({ ...current, request: null,
              notice: "The linked record is no longer available. No other record was substituted." }));
            tab?.focus({ preventScroll: true });
            return;
          }
          const control = row.querySelector<HTMLElement>("[data-review-focus]:not(:disabled), input:not(:disabled), button:not(:disabled)");
          const landing = control?.closest<HTMLElement>(".ps-work-field") ?? control ?? row;
          landing.scrollIntoView({ block: "nearest", inline: "nearest" });
          control?.focus({ preventScroll: true });
        } else if (request.kind === "panel") {
          panel.focus({ preventScroll: true });
        } else {
          const scroller = host.querySelector<HTMLElement>("#ps-inspector-panel");
          if (scroller) scroller.scrollTop = 0;
          tab?.focus({ preventScroll: true });
        }
        setReviewNavigation(current => current.request === request ? { ...current, request: null } : current);
      });
    });
    return () => view.cancelAnimationFrame(frame);
  }, [reviewNavigation.request, session, inspectorHostRef, inspectorVisible, setReviewNavigation]);
}

export function useRevealedReviewRecord(kind: ReviewRecord["kind"]) {
  const { reviewNavigation, setReviewNavigation } = useUiShell();
  const { documentSessionId, collab } = useStore();
  const session = `${documentSessionId}:${collab.room ?? ""}`;
  const [revealed, setRevealed] = useState<{ id: string; session: string } | null>(null);
  const request = reviewNavigation.request;
  const record = request?.kind === "record" ? request.target : request?.kind === "return" ? request.point.source : null;
  const target = record?.kind === kind && request?.session === session ? record : null;
  const retainedIds = useMemo(() => new Set(reviewNavigation.returns
    .flatMap(point => point.source?.kind === kind ? [point.source.id] : [])), [reviewNavigation.returns, kind]);
  useLayoutEffect(() => {
    if (target) setRevealed({ id: target.id, session });
    else if (revealed?.session !== session) setRevealed(null);
  }, [target, session]);
  return {
    id: target?.id ?? (revealed?.session === session ? revealed.id : null),
    request: target && request?.kind === "record" ? reviewNavigation.revision : undefined,
    retainedIds,
    clear: () => {
      setRevealed(null);
      setReviewNavigation(current => ((current.request?.kind === "record" && current.request.target.kind === kind)
        || (current.request?.kind === "return" && current.request.point.source?.kind === kind))
        ? { ...current, request: null } : current);
    },
  };
}
