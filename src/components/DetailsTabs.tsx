import type { DetailsTab } from "./detailsTabStore";
import { useUiShell } from "../uiShell";

export interface DetailsTabsProps {
  tab: DetailsTab;
  onChange: (tab: DetailsTab) => void;
  generalIncomplete?: boolean;
  privacyIncomplete?: boolean;
}

const TABS: { id: DetailsTab; label: string }[] = [
  { id: "general", label: "General / Security" },
  { id: "privacy", label: "Privacy" },
];

export function DetailsTabs({
  tab,
  onChange,
  generalIncomplete,
  privacyIncomplete,
}: DetailsTabsProps) {
  const { endReviewNavigation } = useUiShell();
  const incompleteByTab: Record<DetailsTab, boolean | undefined> = {
    general: generalIncomplete,
    privacy: privacyIncomplete,
  };
  return (
    <div className="ps-details-tabs" role="tablist">
      {TABS.map((t) => {
        const active = t.id === tab;
        const incomplete = !!incompleteByTab[t.id];
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ps-details-tab${active ? " is-active" : ""}`}
            onClick={() => { endReviewNavigation(); onChange(t.id); }}
          >
            {t.label}
            {incomplete && (
              <span
                className="ps-details-tab-indicator"
                aria-label="needs attention"
                title="This tab has fields that need to be filled out"
              >
                •
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
