// Procurement Analytics (§6) - thin router/shell over the four read-only report
// screens (AP Aging, GR/IR & Control, Spend, Vendor Performance). Each section
// lives in its own file under ./analytics/; this picks one off the :section route.
// Every screen gates on procurement.report.view (the backend view enforces it too).
import { EmptyState, ForbiddenState, useActiveEntity } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { P } from "@/permissions";
import { ProcurementShell } from "./procurement-shell";
import type { SectionProps } from "./analytics/helpers";
import { DEFAULT_ANALYTICS_SECTION, type AnalyticsSection } from "./console-sections";
import ApAgingScreen from "./analytics/ap-aging";
import GrirScreen from "./analytics/grir";
import SpendScreen from "./analytics/spend";
import PerformanceScreen from "./analytics/performance";
import { PageShell } from "@/components/layout/page-shell";

const SECTIONS: Record<AnalyticsSection, (props: SectionProps) => React.ReactElement> = {
  "ap-aging": ApAgingScreen,
  grir: GrirScreen,
  spend: SpendScreen,
  performance: PerformanceScreen,
};


/**
 * `section` comes from the route table, not from `useParams`.
 *
 * Each section is registered at its own literal path so an unknown one 404s, and a
 * literal path has no params to read - reading one here returned undefined for
 * every section and quietly rendered AP Aging for all of them. Passing it in keeps
 * the route the single place that says which screen a URL means.
 */
export default function AnalyticsPage({ section = DEFAULT_ANALYTICS_SECTION }: {
  section?: AnalyticsSection;
}) {
  const { code: entity, currency } = useActiveEntity();
  const { can } = useCan();
  const canReports = can(P.PROC_VIEW_PROC_REPORTS);
  const Section = SECTIONS[section] ?? ApAgingScreen;

  return (
    <ProcurementShell>
      {!entity ? (
        <PageShell>
          <EmptyState title="Select an entity" message="Choose a ledger entity to see its procurement reports." />
        </PageShell>
      ) : !canReports ? (
        <PageShell>
          <ForbiddenState message="You don’t hold procurement.report.view for this console." />
        </PageShell>
      ) : (
        <Section entity={entity} currency={currency} />
      )}
    </ProcurementShell>
  );
}
