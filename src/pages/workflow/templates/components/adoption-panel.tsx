import { useState } from "react";
import { GitCompare, Info, Loader2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatRelativeDate } from "@/utils/helpers";
import {
  useCompareTemplateQuery,
  useGetTemplateAdoptionQuery,
} from "@/redux/services/dashboard/workflow-api";
import type {
  TemplateAdopter,
  TemplateFieldDiff,
} from "@/redux/services/dashboard/workflow-types";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";

// The engine's stored values, in the words the rest of the console uses. A diff
// is meant to be read by whoever owns the path, not by whoever wrote the enum.
const VALUE_LABELS: Record<string, string> = {
  ANY: "Any one approver",
  QUORUM: "Quorum",
  UNANIMOUS: "Everyone must approve",
  TERMINAL: "Ends the workflow",
  RETURN_TO_REQUESTER: "Returns to the requester",
  ROLE: "Role holders",
  WORKFLOW_GROUP: "Approver group",
  DYNAMIC_ROLE: "Role chosen by the document",
  ORGANOGRAM: "Organogram",
  APPROVAL: "Approval",
  BRANCH: "Branch (routing only)",
  SCHOOL: "School",
  PLATFORM: "Platform",
  DIRECT_MANAGER: "Direct manager",
  N_LEVELS_UP: "N levels up",
  DEPARTMENT_HEAD: "Department head",
  SPECIFIC_POSITION: "Specific position",
};

/** Render a stored value the way the builder shows it, not the way JSON stores it. */
function readValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "not set";
  if (typeof value === "boolean") return value ? "on" : "off";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return VALUE_LABELS[text] ?? text;
}

function DiffRow({ diff }: { diff: TemplateFieldDiff }) {
  return (
    <div className="grid grid-cols-1 gap-1 border-b border-white-02 py-2 last:border-b-0 sm:grid-cols-[160px_1fr_1fr] sm:gap-3">
      <span className="text-xs font-medium text-black-01">{diff.label}</span>
      <span className="text-xs text-gray-01">
        <span className="mr-1 uppercase tracking-wide text-[10px] text-gray-01 sm:hidden">
          Yours:
        </span>
        {readValue(diff.base)}
      </span>
      <span className="text-xs font-medium text-black-01">
        <span className="mr-1 uppercase tracking-wide text-[10px] text-gray-01 sm:hidden">
          Theirs:
        </span>
        {readValue(diff.other)}
      </span>
    </div>
  );
}

/**
 * How one tenant's version differs from the shared template.
 *
 * Read one tenant at a time, on demand: comparing every adopter up front would
 * be a query per tenant for an answer nobody asked for yet.
 */
function CompareSheet({
  open,
  onClose,
  templateId,
  adopter,
}: {
  open: boolean;
  onClose: () => void;
  templateId: string;
  adopter: TemplateAdopter | null;
}) {
  const { data, isFetching, isError } = useCompareTemplateQuery(
    { id: templateId, withId: adopter?.template_id ?? "" },
    { skip: !open || !adopter },
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-white-02 px-6 pb-4 pt-6">
          <SheetTitle className="text-base font-semibold text-black-01">
            {adopter?.tenant_name ?? "This tenant"} vs your version
          </SheetTitle>
          <SheetDescription className="text-xs text-gray-01">
            Their approval path, next to the one you publish. Configuration only - this
            shows how they route approvals, never their documents or their people.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {isFetching ? (
            <div className="flex h-40 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : isError || !data ? (
            <p className="text-sm text-destructive">Could not load the comparison.</p>
          ) : data.identical ? (
            <p className="rounded-md border border-white-02 bg-pry-01/40 px-4 py-3 text-xs text-gray-01">
              Their version matches yours exactly. They adjusted it at some point and
              ended up back where they started, so a change you publish here will not
              reach them until they switch back to your version.
            </p>
          ) : (
            <>
              <div className="hidden grid-cols-[160px_1fr_1fr] gap-3 border-b border-white-02 pb-1 sm:grid">
                <span className="text-[10px] uppercase tracking-wide text-gray-01">Setting</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-01">Yours</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-01">Theirs</span>
              </div>

              {data.template_fields.length > 0 && (
                <section>
                  <p className="mb-1 text-xs font-semibold text-black-01">The template</p>
                  {data.template_fields.map((f) => (
                    <DiffRow key={f.field} diff={f} />
                  ))}
                </section>
              )}

              {data.stages.added.length > 0 && (
                <section className="rounded-md border border-white-02 px-4 py-3">
                  <p className="text-xs font-semibold text-black-01">
                    Steps they added ({data.stages.added.length})
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {data.stages.added.map((s) => (
                      <li key={s.code} className="text-xs text-gray-01">
                        {s.label} <span className="font-mono">{s.code}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.stages.removed.length > 0 && (
                <section className="rounded-md border border-yellow-01/30 bg-yellow-01/10 px-4 py-3">
                  <p className="text-xs font-semibold text-yellow-01-text">
                    Steps they removed ({data.stages.removed.length})
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {data.stages.removed.map((s) => (
                      <li key={s.code} className="text-xs text-yellow-01-text">
                        {s.label} <span className="font-mono">{s.code}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {data.stages.changed.map((stage) => (
                <section key={stage.code}>
                  <p className="mb-1 text-xs font-semibold text-black-01">
                    {stage.label}{" "}
                    <span className="font-mono font-normal text-gray-01">{stage.code}</span>
                  </p>
                  {stage.fields.map((f) => (
                    <DiffRow key={f.field} diff={f} />
                  ))}
                </section>
              ))}

              {data.routes_differ && (
                <p className="rounded-md border border-white-02 px-4 py-3 text-xs text-gray-01">
                  Their routing between steps differs from yours as well.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Who runs this shared template, on the shared template's own page.
 *
 * The number that matters before an edit: publishing here reaches the tenants
 * still following it and nobody else, and until now there was no way to know
 * whether that was forty tenants or four.
 */
export function AdoptionPanel({ templateId }: { templateId: string }) {
  const { data, isFetching, isError } = useGetTemplateAdoptionQuery(templateId);
  const [comparing, setComparing] = useState<TemplateAdopter | null>(null);

  // A refusal here is not worth a red box: it means this console user is not a
  // platform operator, in which case the panel simply has nothing to say.
  if (isError) return null;

  return (
    <>
      <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white-02 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4 text-primary" /> Who runs this
          </p>
          {data && (
            <span className="text-xs text-gray-01 tabular-nums">
              {data.following_count} of {data.customer_count} as published
            </span>
          )}
        </div>

        {isFetching && !data ? (
          <div className="px-4 py-6">
            <div className="h-4 w-56 animate-pulse rounded bg-gray-50" />
          </div>
        ) : !data ? null : (
          <div className="px-4 py-3">
            <p className="text-xs text-gray-01">
              {data.following_count === 0 ? (
                <>No tenant is running this as published right now.</>
              ) : (
                <>
                  <span className="font-medium text-black-01">
                    {data.following_count}{" "}
                    {data.following_count === 1 ? "tenant runs" : "tenants run"}
                  </span>{" "}
                  this exactly as you publish it, so an edit here reaches{" "}
                  {data.following_count === 1 ? "it" : "them"}.
                </>
              )}{" "}
              {data.adjusted_count > 0 && (
                <>
                  <span className="font-medium text-black-01">
                    {data.adjusted_count}{" "}
                    {data.adjusted_count === 1 ? "has" : "have"}
                  </span>{" "}
                  adjusted it and will not.
                </>
              )}
            </p>

            {data.adjusted.length > 0 && (
              <ul className="mt-3 space-y-1">
                {data.adjusted.map((a) => (
                  <li
                    key={a.template_id}
                    className="flex flex-wrap items-center gap-2 rounded-md border border-white-02 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-black-01">{a.tenant_name}</span>
                    <Badge variant="pending">Own version</Badge>
                    <span className="text-xs text-gray-01">
                      {a.stage_count} {a.stage_count === 1 ? "step" : "steps"} · changed{" "}
                      {formatRelativeDate(a.updated_at)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setComparing(a)}
                    >
                      <GitCompare className="size-3.5" /> Compare
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {data.adjusted_count === 0 && (
              <p className="mt-2 flex items-start gap-2 text-xs text-gray-01">
                <Info className="mt-0.5 size-3.5 shrink-0 text-primary" />
                Nobody has adjusted this one, so every tenant picks up what you publish.
              </p>
            )}
          </div>
        )}
      </div>

      <CompareSheet
        open={!!comparing}
        onClose={() => setComparing(null)}
        templateId={templateId}
        adopter={comparing}
      />
    </>
  );
}
