import { useEffect, useRef, useState } from "react";
import { useLibraries } from "../libraries/LibraryProvider";
import { endpointImportHelp } from "../libraries/endpointHelp";
import { safeNavigationHref } from "../urlSafety";
import { useStore } from "../store";
import { resolveNodeTypeDef } from "../types";
import type { EndpointImportResults } from "../nodeEndpoints";

export function ImportEndpointsDialog({
  onCancel,
  onChooseFile,
  results,
}: {
  onCancel: () => void;
  onChooseFile: () => void;
  results?: EndpointImportResults;
}) {
  const libraries = useLibraries();
  const { instructions, example } = endpointImportHelp(libraries);
  const [copyStatus, setCopyStatus] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const exampleRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    closeRef.current?.focus();
    return () => { mountedRef.current = false; };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), select:not(:disabled), textarea, a[href], [tabindex]:not([tabindex='-1'])",
    ) ?? []);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  };

  const onCopy = async () => {
    if (!example) return;
    try {
      await navigator.clipboard.writeText(example.text);
      if (mountedRef.current) setCopyStatus("Copied to clipboard.");
    } catch {
      if (!mountedRef.current) return;
      exampleRef.current?.focus();
      exampleRef.current?.select();
      setCopyStatus("Clipboard access was unavailable. The example is selected; press Ctrl+C or Command+C to copy it.");
    }
  };

  return (
    <div className="ps-modal-overlay ps-fluent-dialog-overlay" onMouseDown={onCancel} role="presentation">
      <div
        ref={dialogRef}
        className="ps-modal ps-fluent-dialog ps-endpoints-dialog"
        onMouseDown={event => event.stopPropagation()}
        onKeyDown={onKeyDown}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ps-endpoints-dialog-title"
      >
        <header className="ps-modal-header">
          <h2 id="ps-endpoints-dialog-title">{results ? "Endpoint import results" : "Import nodes from Endpoints"}</h2>
          <button ref={closeRef} type="button" className="ps-modal-close" aria-label="Close" onClick={onCancel}>
            ×
          </button>
        </header>
        <div className="ps-modal-body">
          {results ? <EndpointResults results={results} /> : <>
          <p>
            Match each nonblank line in a plain-text file against the endpoint
            expressions in the node catalog. Use one endpoint URL per line,
            for example <code>https://example.invalid/service</code>.
          </p>
          <p>
            The importer reads only the file you choose. It does not query
            telemetry, scan services or contact those URLs. Matching node
            types missing from the diagram are added to the active scenario;
            unmatched lines are downloaded separately.
            Review the results and explicitly assign addresses to nodes.
            Type matching alone does not identify an individual asset.
          </p>
          {!instructions && !example && <p>
            No optional endpoint guidance is configured. You can still choose
            a file and import endpoints.
          </p>}
          {instructions && <section>
            <h3>{instructions.title}</h3>
            <p className="ps-endpoints-library-source">{instructions.source}</p>
            <p className="ps-library-help">{instructions.text}</p>
            {instructions.url && safeNavigationHref(instructions.url) && <a
              href={instructions.url} target="_blank" rel="noopener noreferrer"
            >Open library guidance</a>}
          </section>}
          {example && <section>
            <div className="ps-endpoints-query-header">
              <h3>{example.title}</h3>
              <button type="button" onClick={onCopy}>Copy to clipboard</button>
            </div>
            <p className="ps-endpoints-library-source">{example.source}</p>
            <textarea
              ref={exampleRef}
              id="ps-endpoints-query-text"
              className="ps-endpoints-query-text"
              aria-label="Endpoint import example"
              readOnly
              value={example.text}
              rows={14}
              onClick={event => event.currentTarget.select()}
            />
            {example.url && safeNavigationHref(example.url) && <a
              href={example.url} target="_blank" rel="noopener noreferrer"
            >Open example guidance</a>}
            <p role="status">{copyStatus}</p>
          </section>}
          </>}
        </div>
        <footer className="ps-modal-footer ps-dialog-actions">
          <button type="button" onClick={onCancel}>{results ? "Done" : "Cancel"}</button>
          {!results && <button type="button" className="ps-modal-primary" onClick={onChooseFile}>Choose file…</button>}
        </footer>
      </div>
    </div>
  );
}

function EndpointResults({ results }: { results: EndpointImportResults }) {
  const { doc, nodeTypeCatalog, setNodeEndpoint } = useStore();
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus();
    errorRef.current?.scrollIntoView({ block: "nearest" });
  }, [error]);
  const types = new Set(results.rows.flatMap(row => row.typeId ? [row.typeId] : []));
  const added = new Set(results.rows.filter(row => row.nodeAdded).map(row => row.typeId));
  const typeLabel = (id: string) => resolveNodeTypeDef(id, nodeTypeCatalog)?.label ?? id;
  return <>
    <p role="status">Imported {added.size} new node {added.size === 1 ? "type" : "types"} ({types.size} matched in total).</p>
    <p>Choose a node, then select Assign for each address you want to keep. Nothing is assigned automatically.
      Assignment does not discover flows, contact endpoints or verify deployment.</p>
    {results.unknownName && <p>Unmatched lines were downloaded as <strong>{results.unknownName}</strong>.</p>}
    {results.warnings.map(warning => <p key={warning} role="alert">{warning}</p>)}
    {error && <p ref={errorRef} role="alert" tabIndex={-1}>{error}</p>}
    <div className="ps-endpoint-results">
      <table>
        <thead><tr><th scope="col">Address</th><th scope="col">Matched type</th><th scope="col">Import result</th><th scope="col">Assign to node</th></tr></thead>
        <tbody>{results.rows.map((row, index) => {
          const assigned = doc.nodes.filter(node => node.endpoints?.includes(row.address));
          const selected = choices[index] ?? "";
          return <tr key={index}>
            <td>{row.address}</td>
            <td>{row.typeId ? typeLabel(row.typeId) : "Unmatched"}</td>
            <td>{!row.typeId ? "No matching type" : row.nodeAdded ? "Node added" : "Type already exists"}</td>
            <td>
              <select aria-label={`Node for ${row.address} (row ${index + 1})`} value={selected}
                onChange={event => setChoices(previous => ({ ...previous, [index]: event.target.value }))}>
                <option value="">Choose a node</option>
                {[...doc.nodes].sort((a, b) => Number(b.type === row.typeId) - Number(a.type === row.typeId)).map(node =>
                  <option key={node.id} value={node.id}>{node.title || "(Untitled)"} - {typeLabel(node.type)} ({node.id})</option>)}
              </select>
              <button type="button" disabled={!doc.nodes.some(node => node.id === selected) ||
                assigned.some(node => node.id === selected)} onClick={() => {
                try {
                  setNodeEndpoint(selected, row.address, true);
                  setError("");
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : String(failure));
                }
              }}>Assign</button>
              <p>{assigned.length ? `Assigned to: ${assigned.map(node => node.title || node.id).join(", ")}` : "Not assigned"}</p>
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </>;
}
