// Wraps a Finance area page in the console layout (sub-nav + entity header).
import { ConsoleShell } from "@/components/finance-ui/console-shell";
import { financeNav } from "./finance-nav";

export function FinanceShell({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleShell title="Finance" nav={financeNav}>
      {children}
    </ConsoleShell>
  );
}
