import { useState } from "react";
import Tabs from "@/pages/protected/workflow/components/tabs";
import { useFilterParam } from "@/hooks/use-filter-param";
import GroupsTab from "./groups-tab";
import DynamicRolesTab from "./dynamic-roles-tab";
import { PageShell } from "@/components/layout/page-shell";

type Tab = "groups" | "rules";
const TABS: { key: Tab; label: string }[] = [
  { key: "groups", label: "Groups" },
  { key: "rules", label: "Dynamic Role" },
];

/**
 * Who can approve, in the two shapes the engine supports outside a plain role:
 * a named pool of people, and a rule ladder the document itself picks from.
 *
 * They share a screen because they answer the same question and an administrator
 * moves between them constantly - a step that outgrows a single group usually
 * becomes a threshold ladder, and a ladder's rules point back at roles and
 * groups defined here.
 *
 * The heading is the name both apps' sidebars give this screen, so somebody who
 * clicked "Approvers" lands on a page that says so. Rename one and the
 * other goes with it.
 */
export default function WorkflowApprover() {
  const [tab, setTab] = useState<Tab>("groups");
  // A deep link can open the rules tab directly.
  useFilterParam<Tab>("tab", ["groups", "rules"], setTab);

  return (
    <PageShell className="space-y-5 text-black-01">
      <div>
        <p className="font-semibold font-mont text-gray-01">Approvers</p>
        <p className="mt-0.5 text-xs text-gray-01">
          Define who can approve. Roles, seats and rules resolve at the moment a step
          activates, so an approval path stays correct as people move.
        </p>
      </div>

      <Tabs
        tabs={TABS.map((t) => ({ value: t.key, label: t.label }))}
        activeTab={tab}
        setActiveTab={(value) => setTab(value as Tab)}
      />

      {tab === "groups" ? <GroupsTab /> : <DynamicRolesTab />}
    </PageShell>
  );
}
