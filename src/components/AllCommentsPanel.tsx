import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../store";
import type { PsComment } from "../types";
import { reviewElementExists, useReviewNavigation, useRevealedReviewRecord } from "../reviewNavigation";

type StatusFilter = "all" | "active" | "resolved";

export function AllCommentsPanel({ embedded = false }: { embedded?: boolean }) {
  const {
    doc,
    setAllCommentsViewOpen,
  } = useStore();
  const { visitElement } = useReviewNavigation();
  const revealed = useRevealedReviewRecord("comment");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [textFilter, setTextFilter] = useState("");

  const matchesFilters = useCallback((c: PsComment) => {
    if (statusFilter === "active" && c.status !== "Active") return false;
    if (statusFilter === "resolved" && c.status !== "Resolved") return false;
    if (textFilter.trim()) {
      const q = textFilter.trim().toLowerCase();
      if (
        !c.text.toLowerCase().includes(q) &&
        !c.replies.some((r) => r.text.toLowerCase().includes(q))
      ) {
        return false;
      }
    }
    return true;
  }, [statusFilter, textFilter]);
  const revealedComment = doc.comments.find(comment => comment.id === revealed.id);

  const items = useMemo(() => {
    const list = doc.comments.filter(c => c.id === revealed.id || revealed.retainedIds.has(c.id) || matchesFilters(c));
    // Most recent first.
    return [...list].sort((a, b) => b.createdAt - a.createdAt);
  }, [doc.comments, matchesFilters, revealed.id, revealed.retainedIds]);

  const counts = useMemo(() => {
    let active = 0;
    let resolved = 0;
    for (const c of doc.comments) {
      if (c.status === "Active") active += 1;
      else resolved += 1;
    }
    return { active, resolved, total: doc.comments.length };
  }, [doc.comments]);

  return (
    <div className="ps-allcomments">
      <header className="ps-allcomments-header">
        <h3>All comments</h3>
        {!embedded && (
          <button
            className="ps-allcomments-close"
            aria-label="Close all comments view"
            title="Close"
            onClick={() => setAllCommentsViewOpen(false)}
          >
            ✕
          </button>
        )}
      </header>

      <div className="ps-allcomments-filterbar">
        <div className="ps-allcomments-status-tabs" role="tablist">
          <FilterPill
            label={`All (${counts.total})`}
            active={statusFilter === "all"}
            onClick={() => { revealed.clear(); setStatusFilter("all"); }}
          />
          <FilterPill
            label={`Active (${counts.active})`}
            active={statusFilter === "active"}
            onClick={() => { revealed.clear(); setStatusFilter("active"); }}
          />
          <FilterPill
            label={`Resolved (${counts.resolved})`}
            active={statusFilter === "resolved"}
            onClick={() => { revealed.clear(); setStatusFilter("resolved"); }}
          />
        </div>
        <input
          type="search"
          placeholder="Search comments…"
          value={textFilter}
          onChange={(e) => { revealed.clear(); setTextFilter(e.target.value); }}
        />
      </div>

      <div className="ps-allcomments-body">
        {revealedComment && !matchesFilters(revealedComment) && (
          <p className="ps-description-below">The linked comment is shown without changing your filters.</p>
        )}
        {items.length === 0 ? (
          <p className="ps-empty">No comments match.</p>
        ) : (
          items.map((c) => (
            <CommentRow key={c.id} comment={c}
              onNavigate={trigger => visitElement({ kind: c.targetKind, id: c.targetId }, {
                source: { kind: "comment", id: c.id }, trigger, requiredScenarioId: c.scenarioId,
              })} />
          ))
        )}
      </div>
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      className={`ps-allcomments-pill ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function CommentRow({
  comment,
  onNavigate,
}: {
  comment: PsComment;
  onNavigate: (trigger: HTMLButtonElement) => void;
}) {
  const {
    doc,
    setCommentStatus,
    deleteComment,
    updateCommentText,
    addCommentReply,
    updateCommentReply,
    deleteCommentReply,
  } = useStore();

  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [textDraft, setTextDraft] = useState(comment.text);
  useEffect(() => setTextDraft(comment.text), [comment.text]);
  const [replyDraft, setReplyDraft] = useState("");
  const targetAvailable = reviewElementExists(doc, { kind: comment.targetKind, id: comment.targetId })
    && doc.scenarios.some(scenario => scenario.id === comment.scenarioId &&
      (comment.targetKind === "node" ? scenario.nodeIds : scenario.edgeIds).includes(comment.targetId));

  let targetLabel = "";
  if (comment.targetKind === "node") {
    const n = doc.nodes.find((x) => x.id === comment.targetId);
    targetLabel = n?.title || "(untitled node)";
  } else {
    const e = doc.edges.find((x) => x.id === comment.targetId);
    targetLabel = e?.title || "(untitled edge)";
  }
  const scenarioName =
    doc.scenarios.find((s) => s.id === comment.scenarioId)?.name ??
    "(deleted scenario)";

  const onResolveToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCommentStatus(
      comment.id,
      comment.status === "Active" ? "Resolved" : "Active"
    );
  };

  const onDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!(e.currentTarget.ownerDocument.defaultView ?? window).confirm("Delete this comment and its replies?")) return;
    deleteComment(comment.id);
  };

  const submitReply = () => {
    const txt = replyDraft.trim();
    if (!txt) return;
    addCommentReply(comment.id, txt);
    setReplyDraft("");
  };

  const saveEdits = () => {
    updateCommentText(comment.id, textDraft);
    setEditing(false);
  };

  return (
    <div
      data-review-kind="comment"
      data-review-id={comment.id}
      className={`ps-allcomments-row ps-allissues-row ps-allcomments-${comment.status.toLowerCase()}`}
    >
      <button
        type="button"
        className="ps-allissues-rowhead"
        onClick={event => onNavigate(event.currentTarget)}
        disabled={!targetAvailable}
        title={targetAvailable ? "Click to navigate to this item" : "Target no longer available in this scenario"}
      >
        <div className="ps-allcomments-row-head">
          <span
            className={`ps-comment-status ps-comment-status-${comment.status.toLowerCase()}`}
          >
            {comment.status}
          </span>
          <span className="ps-allcomments-scenario">{scenarioName}</span>
          <span className="ps-comment-date">{formatDate(comment.createdAt)}</span>
        </div>
        <div className="ps-allcomments-target">
          <strong>{comment.targetKind === "node" ? "Node" : "Edge"}:</strong>{" "}
          {targetLabel}
        </div>
        {!expanded && (
          <p className="ps-allcomments-text">
            {truncate(comment.text || "(empty)", 200)}
          </p>
        )}
        {!expanded && comment.replies.length > 0 && (
          <div className="ps-allcomments-row-meta">
            💬 {comment.replies.length}{" "}
            {comment.replies.length === 1 ? "reply" : "replies"}
          </div>
        )}
      </button>
      {!targetAvailable && <p className="ps-description-below">Target no longer available in this scenario.</p>}

      <div
        className="ps-allissues-actions"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Hide" : "Details"}
        </button>
        <button onClick={onResolveToggle}>
          {comment.status === "Active" ? "Resolve" : "Reopen"}
        </button>
        <button className="ps-danger" onClick={onDelete}>
          Delete
        </button>
      </div>

      {expanded && (
        <div
          className="ps-allissues-detail"
          onClick={(e) => e.stopPropagation()}
        >
          {editing ? (
            <>
              <label className="ps-allissues-field">
                Comment
                <textarea
                  value={textDraft}
                  onChange={(e) => setTextDraft(e.target.value)}
                  rows={4}
                  autoFocus
                />
              </label>
              <div className="ps-comment-edit-actions">
                <button
                  className="ps-modal-primary"
                  onClick={saveEdits}
                  disabled={!textDraft.trim()}
                >
                  Save
                </button>
                <button onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </>
          ) : (
            <>
              <p className="ps-allcomments-text">
                {comment.text || "(empty)"}
              </p>
              <div className="ps-allissues-edit-row">
                <button onClick={() => setEditing(true)}>Edit</button>
              </div>
            </>
          )}

          {comment.replies.length > 0 && (
            <ol className="ps-comment-replies">
              {comment.replies.map((r) => (
                <ReplyItem
                  key={r.id}
                  replyText={r.text}
                  createdAt={r.createdAt}
                  onUpdate={(text) => updateCommentReply(comment.id, r.id, text)}
                  onDelete={() => deleteCommentReply(comment.id, r.id)}
                />
              ))}
            </ol>
          )}

          <div className="ps-comment-reply-row">
            <input
              type="text"
              placeholder="Reply…"
              value={replyDraft}
              onChange={(e) => setReplyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitReply();
                }
              }}
            />
            <button onClick={submitReply} disabled={!replyDraft.trim()}>
              Reply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ReplyItem({
  replyText,
  createdAt,
  onUpdate,
  onDelete,
}: {
  replyText: string;
  createdAt: number;
  onUpdate: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(replyText);
  useEffect(() => setDraft(replyText), [replyText]);

  return (
    <li className="ps-reply">
      <div className="ps-reply-head">
        <span className="ps-comment-date">{formatDate(createdAt)}</span>
        <div className="ps-reply-actions">
          <button onClick={() => setEditing((v) => !v)}>
            {editing ? "Cancel" : "Edit"}
          </button>
          <button className="ps-danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            autoFocus
          />
          <div className="ps-comment-edit-actions">
            <button
              className="ps-modal-primary"
              onClick={() => {
                onUpdate(draft);
                setEditing(false);
              }}
              disabled={!draft.trim()}
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <p>{replyText || "(empty)"}</p>
      )}
    </li>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function formatDate(ts: number): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "";
  }
}
