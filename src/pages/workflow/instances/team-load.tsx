import { useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGetTeamLoadQuery } from "@/redux/services/dashboard/workflow-api";
import { humanizeDocumentType } from "@/pages/protected/workflow/components/workflow-format";
import { PageShell } from "@/components/layout/page-shell";

export default function TeamLoad() {
  const { data, isLoading, isFetching, refetch } = useGetTeamLoadQuery(undefined, {
    refetchOnMountOrArgChange: true,
  });

  const rows = useMemo(() => data ?? [], [data]);

  const grouped = useMemo(() => {
    const m = new Map<string, { stage_label: string | null; stage_code: string; active_count: number }[]>();
    for (const r of rows) {
      const list = m.get(r.document_type) ?? [];
      list.push({ stage_label: r.stage_label, stage_code: r.stage_code, active_count: r.active_count });
      m.set(r.document_type, list);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const total = rows.reduce((s, r) => s + r.active_count, 0);

  return (
    <>
      <PageShell className="space-y-5 text-black-01">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-semibold font-mont text-gray-01">Active Approvals by Stage</p>
            <p className="text-xs text-gray-01 mt-0.5">
              Where the approval backlog is sitting right now -{" "}
              <span className="font-medium text-black-01">{total}</span> active stage
              {total === 1 ? "" : "s"} across the platform.
            </p>
          </div>
          <Button
            variant="white"
            size="lg"
            className="[&_svg]:size-5 font-medium font-mont shrink-0"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
          </Button>
        </div>

        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-primary" />
          </div>
        ) : grouped.length === 0 ? (
          <div className="rounded-lg border border-white-02 bg-white py-16 text-center text-sm text-gray-01">
            No active approval stages right now.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {grouped.map(([docType, stages]) => {
              const subtotal = stages.reduce((s, x) => s + x.active_count, 0);
              return (
                <div key={docType} className="rounded-lg border border-white-02 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">{humanizeDocumentType(docType)}</h3>
                    <span className="rounded-full bg-pry-01 px-2 py-0.5 text-xs font-medium text-primary">
                      {subtotal} active
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {stages
                      .sort((a, b) => b.active_count - a.active_count)
                      .map((s) => (
                        <li key={s.stage_code} className="flex items-center gap-3">
                          <span className="flex-1 truncate text-sm text-gray-01">
                            {s.stage_label ?? s.stage_code}
                          </span>
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
                            <span
                              className="block h-full rounded-full bg-primary"
                              style={{ width: `${subtotal ? (s.active_count / subtotal) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="w-6 text-right text-sm font-medium text-black-01">
                            {s.active_count}
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </PageShell>
    </>
  );
}
