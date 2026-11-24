import { catalogDefinitionsFor } from "../types";
import { catalogDefinitionKey } from "../catalogDefinitions";
import { useStore } from "../store";

export function CatalogDefinitionsNotice() {
  const { doc, availableCatalogDefinitions } = useStore();
  const saved = doc.catalogDefinitions ?? [];
  if (!saved.length) return null;
  return (
    <details className="ps-catalog-snapshots">
      <summary>Catalog labels in this diagram</summary>
      <p>
        These labels and descriptions travel with the diagram so it stays readable
        when a library is missing or uses different wording. The saved wording
        applies only to this diagram. It does not install a library, grant access,
        or verify security, compliance, or publisher identity.
      </p>
      <p>
        An ID with no saved or installed definition stays unresolved.
        Versions before 0.1.26 may discard saved definitions.
      </p>
      <ul>
        {saved.map((definition) => {
          const installed = catalogDefinitionsFor(definition.kind, undefined, availableCatalogDefinitions)
            .find((def) => def.id === definition.id);
          const conflict = installed && (installed.label !== definition.label
            || installed.description !== definition.description);
          return (
            <li key={catalogDefinitionKey(definition)}>
              <strong>{definition.label}</strong> ({definition.kind}: {definition.id})
              {" — "}{conflict ? "Differs from installed definition; saved definition retained."
                : installed ? "Saved in diagram." : "Document-only definition."}
              {definition.library && <span> Library metadata: {definition.library.id} @ {definition.library.version} (unverified).</span>}
              {definition.description && <p>{definition.description}</p>}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
