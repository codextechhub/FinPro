// Wraps a Procurement area page in the console layout (sub-nav + entity header).
import { ConsoleShell } from "@/components/finance-ui/console-shell";
import { procurementNav } from "./procurement-nav";

export function ProcurementShell({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleShell title="Procurement" nav={procurementNav}>
      {children}
    </ConsoleShell>
  );
}
