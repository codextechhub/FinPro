import { useMemo, useState } from "react";
import { FlaskConical, Lock, Pencil, Plus, RefreshCw, Trash2, TriangleAlert, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SearchSelect } from "@/components/custom/search-select";
import PermissionGate from "@/components/custom/permission-gate";
import { MoneyInput } from "@/components/finance-ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { P } from "@/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { useActionParam } from "@/hooks/use-action-param";
import { useAppSelector } from "@/redux/store";
import { apiErrorMessage, errorStatus } from "@/utils/api-errors";
import { useBranches, useDirectory } from "@xvs/finance/host";
import {
  useDeleteDynamicRoleMutation,
  useGetDynamicRoleFieldsQuery,
  useGetDynamicRolesQuery,
  usePreviewDynamicRoleMutation,
  useUpdateDynamicRoleMutation,
} from "@/redux/services/dashboard/workflow-api";
import type {
  ConditionFieldSpec,
  DynamicRole,
} from "@/redux/services/dashboard/workflow-types";
import {
  conditionSentence,
  targetSentence,
} from "@/pages/protected/workflow/components/dynamic-role-format";
import { useRuleNames } from "@/pages/protected/workflow/components/use-rule-names";
import { humanizeDocumentType } from "@/pages/protected/workflow/components/workflow-format";
import { BAND_SURFACE } from "../templates/components/template-builder-bits";
import { DynamicRoleEditor } from "./dynamic-role-editor";
import { draftFromDynamicRole, rulesPayload } from "./dynamic-role-form";

type EditorState = { role: DynamicRole | null } | null;

/** Ask for the whole catalogue. A stable reference, so the query is cached once. */
const EVERY_DOCUMENT: string[] = [];

/**
 * The Dynamic Role tab: named, reusable rules that decide who approves.
 *
 * A Dynamic Role is built here once and picked by name in any stage, the way an
 * approver group is. It reads top to bottom - the first rule whose conditions
 * all hold decides, and the Otherwise row catches every document the others do
 * not - so its rules are shown numbered and in words, beside a tester that runs
 * the engine's own matching for a requester and an amount.
 *
 * Creating and editing need the approver-group manage key. The same key gates
 * `?action=new`, so the address cannot open a drawer the button would not.
 */
export default function DynamicRolesTab() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(P.MANAGE_APPROVER_GROUPS);

  const [selectedId, setSelectedId] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const [deleteTarget, setDeleteTarget] = useState<DynamicRole | null>(null);
  const [inUse, setInUse] = useState("");

  useActionParam("new", canManage, () => setEditor({ role: null }));

  const { data, isLoading, isFetching, refetch } = useGetDynamicRolesQuery(
    { page: 1, page_size: 100 },
    { refetchOnMountOrArgChange: true },
  );
  const roles = useMemo(() => data?.data ?? [], [data]);
  // Derived rather than synced: the clicked one while it exists, else the first.
  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? roles[0] ?? null,
    [roles, selectedId],
  );

  const [updateRole, { isLoading: isUpdating }] = useUpdateDynamicRoleMutation();
  const [deleteRole, { isLoading: isDeleting }] = useDeleteDynamicRoleMutation();

  const toggleActive = () => {
    if (!selected) return;
    updateRole({ id: selected.id, body: { is_active: !selected.is_active } })
      .unwrap()
      .then(() =>
        toast.success(selected.is_active ? "Dynamic Role deactivated." : "Dynamic Role reactivated."),
      )
      .catch((err) => toast.error(apiErrorMessage(err, "That could not be changed.")));
  };

  const doDelete = () => {
    if (!deleteTarget) return;
    deleteRole(deleteTarget.id)
      .unwrap()
      .then(() => {
        toast.success("Dynamic Role deleted.");
        setDeleteTarget(null);
        setInUse("");
      })
      .catch((err) => {
        if (errorStatus(err) === 409) {
          setInUse(
            "A stage still uses this Dynamic Role. Deactivate it instead, or point that stage elsewhere first.",
          );
          return;
        }
        toast.error(apiErrorMessage(err, "This Dynamic Role could not be deleted."));
      });
  };

  return (
    <>
      <section className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-gray-01">
            Rules that choose who approves from the document and the person who raised it.
            Build one here, then pick it in a stage's "Decided by".
          </p>
          <div className="inline-flex flex-wrap items-center gap-3.5">
            <Button variant="white" size="lg" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn(isFetching && "animate-spin")} /> Refresh
            </Button>
            <PermissionGate permission={P.MANAGE_APPROVER_GROUPS}>
              <Button size="lg" onClick={() => setEditor({ role: null })}>
                <Plus /> New Dynamic Role
              </Button>
            </PermissionGate>
          </div>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[280px_1fr]">
          <aside className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md p-3")}>
            <p className="px-1 pb-1 text-xs font-semibold uppercase text-gray-01">
              {roles.length} {roles.length === 1 ? "Dynamic Role" : "Dynamic Roles"}
            </p>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-md bg-gray-50" />
                ))}
              </div>
            ) : roles.length === 0 ? (
              <p className="px-1 py-8 text-center text-xs text-gray-01">No Dynamic Roles yet.</p>
            ) : (
              <ul className="space-y-1">
                {roles.map((r) => {
                  const ruleCount = r.rules.filter((rule) => !rule.is_fallback).length;
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(r.id)}
                        aria-current={r.id === selected?.id}
                        className={cn(
                          "w-full rounded-md px-3 py-2 text-left transition-colors",
                          r.id === selected?.id ? "bg-pry-01" : "hover:bg-gray-50",
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={cn(
                              "min-w-0 flex-1 truncate text-sm font-medium",
                              r.id === selected?.id ? "text-primary" : "text-black-01",
                            )}
                          >
                            {r.name}
                          </span>
                          {!r.is_active && (
                            <Badge variant="inactive" className="shrink-0">Off</Badge>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-01 tabular-nums">
                          {ruleCount} {ruleCount === 1 ? "rule" : "rules"} + Otherwise ·{" "}
                          {r.used_by.length
                            ? `used by ${r.used_by.length} ${r.used_by.length === 1 ? "stage" : "stages"}`
                            : "not used yet"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          <div className="min-w-0 space-y-4">
            {isLoading ? (
              <div className="h-64 animate-pulse rounded-md bg-gray-50" />
            ) : !selected ? (
              <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md py-16 text-center")}>
                <span className="mx-auto grid size-12 place-content-center rounded-full bg-pry-01 text-primary">
                  <Workflow className="size-6" />
                </span>
                <p className="mx-auto mt-3 max-w-md text-sm text-gray-01">
                  No Dynamic Roles yet. Build one to send big purchases to the principal and
                  the rest to the bursar, then pick it in any stage.
                </p>
                <PermissionGate permission={P.MANAGE_APPROVER_GROUPS}>
                  <Button className="mt-4" onClick={() => setEditor({ role: null })}>
                    <Plus /> New Dynamic Role
                  </Button>
                </PermissionGate>
              </div>
            ) : (
              <DynamicRoleDetail
                key={selected.id}
                role={selected}
                canManage={canManage}
                busy={isUpdating}
                onEdit={() => setEditor({ role: selected })}
                onToggleActive={toggleActive}
                onDelete={() => {
                  setInUse("");
                  setDeleteTarget(selected);
                }}
              />
            )}
          </div>
        </div>
      </section>

      {editor && (
        <DynamicRoleEditor
          role={editor.role}
          onClose={() => setEditor(null)}
          onSaved={(id) => {
            setSelectedId(id);
            setEditor(null);
          }}
        />
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) {
            setDeleteTarget(null);
            setInUse("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{inUse ? "This Dynamic Role is in use" : "Delete this Dynamic Role?"}</DialogTitle>
            <DialogDescription>
              {inUse || `${deleteTarget?.name ?? "It"} will be removed. This cannot be undone.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setInUse("");
              }}
              disabled={isDeleting}
            >
              {inUse ? "Close" : "Keep it"}
            </Button>
            {!inUse && (
              <Button variant="destructive" onClick={doDelete} disabled={isDeleting}>
                {isDeleting ? "Deleting…" : "Delete"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One Dynamic Role: what it serves, its rules in words, a tester, and where it is used. */
function DynamicRoleDetail({
  role,
  canManage,
  busy,
  onEdit,
  onToggleActive,
  onDelete,
}: {
  role: DynamicRole;
  canManage: boolean;
  busy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  // The whole catalogue: a Dynamic Role names no document type, so its rules
  // are read back against every field the system offers.
  const { data: fieldsData } = useGetDynamicRoleFieldsQuery(EVERY_DOCUMENT);
  const fields = useMemo(
    () => new Map((fieldsData?.fields ?? []).map((f) => [f.key, f])),
    [fieldsData],
  );
  const names = useRuleNames();
  const [matched, setMatched] = useState<number | null>(null);

  const ordered = useMemo(() => [...role.rules].sort((a, b) => a.order - b.order), [role.rules]);

  return (
    <>
      <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-4")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-black-01">{role.name}</h2>
              <span className="rounded border border-white-02 bg-gray-50 px-1.5 py-0.5 font-mono text-xs text-gray-01">
                {role.code}
              </span>
              <Badge variant={role.is_active ? "active" : "inactive"}>
                {role.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {role.description && <p className="mt-1 text-xs text-gray-01">{role.description}</p>}
          </div>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="size-3.5" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={onToggleActive} disabled={busy}>
                {role.is_active ? "Deactivate" : "Reactivate"}
              </Button>
              <Button variant="outline" size="sm" onClick={onDelete}>
                <Trash2 className="size-3.5" /> Delete
              </Button>
            </div>
          )}
        </div>
        {!role.is_active && (
          <p className="mt-3 flex items-start gap-2 rounded-md border border-yellow-01/30 bg-yellow-01/10 px-3 py-2 text-xs text-yellow-01-text">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            Switched off, so stages using it find nobody and wait until it is reactivated.
          </p>
        )}
      </div>

      <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
        <div className="border-b border-white-02 px-4 py-3">
          <p className="text-sm font-semibold">
            Rules <span className="font-normal text-gray-01">read top to bottom, first match wins</span>
          </p>
        </div>
        <ol>
          {ordered.map((rule, i) => {
            const isHit = matched != null && i === matched;
            const skipped = matched != null && i > matched;
            return (
              <li
                key={rule.id}
                className={cn(
                  "flex gap-3 border-b border-white-02 px-4 py-3 last:border-b-0",
                  rule.is_fallback && BAND_SURFACE,
                  isHit && "bg-pry-01/40",
                )}
              >
                <span
                  className={cn(
                    "grid size-6 shrink-0 place-content-center rounded text-xs font-semibold tabular-nums",
                    isHit ? "bg-primary text-white" : "bg-pry-01 text-primary",
                  )}
                >
                  {rule.is_fallback ? <Lock className="size-3" /> : i + 1}
                </span>
                <div className={cn("min-w-0 flex-1 text-sm", skipped && "text-gray-01")}>
                  <p>
                    {rule.is_fallback ? (
                      <span className="font-medium">Otherwise</span>
                    ) : (
                      <>
                        <span className="text-gray-01">When </span>
                        {conditionSentence(rule.condition, fields, names)}
                      </>
                    )}
                    <span className="text-gray-01"> → </span>
                    <span className="font-medium text-black-01">{targetSentence(rule)}</span>
                  </p>
                  {rule.label && <p className="mt-0.5 text-xs text-gray-01">{rule.label}</p>}
                  {isHit && (
                    <p className="mt-0.5 text-xs font-medium text-primary">This one decides.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <DynamicRoleTester role={role} fields={fields} onMatched={setMatched} />

      <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md px-4 py-3")}>
        <p className="text-sm font-semibold">Used by</p>
        {role.used_by.length ? (
          <ul className="mt-2 space-y-1 text-xs">
            {role.used_by.map((use) => (
              <li key={`${use.template_id}:${use.stage_code}`} className="text-black-01">
                {use.stage_label}{" "}
                <span className="text-gray-01">
                  on {use.template_name} · {humanizeDocumentType(use.document_type)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-gray-01">
            No stage uses it yet. Choose it in a template stage's "Decided by".
          </p>
        )}
      </div>
    </>
  );
}

/**
 * Tries a Dynamic Role for a requester, an amount and a branch.
 *
 * Sends the saved rules through the same checks and matching the engine runs,
 * so the answer - which rule decides, and who that reaches - is the engine's.
 */
function DynamicRoleTester({
  role,
  fields,
  onMatched,
}: {
  role: DynamicRole;
  fields: Map<string, ConditionFieldSpec>;
  onMatched: (index: number | null) => void;
}) {
  const self = useAppSelector((s) => s.auth.user);
  const [requester, setRequester] = useState(self?.id != null ? String(self.id) : "");
  const [amount, setAmount] = useState<number | null>(null);
  const [branch, setBranch] = useState("");
  const { data: people } = useDirectory();
  const { data: branches } = useBranches();
  const [preview, { data, isLoading, error, reset }] = usePreviewDynamicRoleMutation();

  const peopleOptions = (people ?? [])
    .filter((p) => p.status === "ACTIVE")
    .map((p) => ({ value: String(p.id), label: p.full_name || p.email }));
  const branchOptions = (branches ?? []).map((b) => ({ value: String(b.id), label: b.name }));
  const hasAmount = fields.has("amount");

  const run = () => {
    if (!requester) return;
    preview({
      requester,
      document_types: [],
      rules: rulesPayload(draftFromDynamicRole(role)),
      sample: {
        ...(hasAmount && amount != null ? { amount } : {}),
        ...(branch ? { branch } : {}),
      },
    })
      .unwrap()
      .then((result) => onMatched(result.dynamic_role.matched_order ?? null))
      .catch(() => onMatched(null));
  };

  const matchedTarget = data?.dynamic_role.matched_target;

  return (
    <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
      <div className="border-b border-white-02 px-4 py-3">
        <p className="text-sm font-semibold">Try it</p>
      </div>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <SearchSelect
            id="dr-try-requester"
            label="Raised by"
            options={peopleOptions}
            value={requester}
            onChange={(e) => {
              setRequester(e.target.value);
              reset();
              onMatched(null);
            }}
            placeholder="Who is raising it?"
          />
          {hasAmount && (
            <div className="space-y-1.5">
              <label htmlFor="dr-try-amount" className="text-xs font-medium text-black-01">
                Amount
              </label>
              <MoneyInput
                id="dr-try-amount"
                valueKobo={amount}
                onChangeKobo={(kobo) => {
                  setAmount(kobo);
                  reset();
                  onMatched(null);
                }}
              />
            </div>
          )}
          <SearchSelect
            id="dr-try-branch"
            label="Branch"
            options={branchOptions}
            value={branch}
            onChange={(e) => {
              setBranch(e.target.value);
              reset();
              onMatched(null);
            }}
            placeholder="Their own branch"
          />
        </div>
        <Button size="sm" onClick={run} disabled={!requester || isLoading}>
          <FlaskConical className="size-3.5" /> {isLoading ? "Trying…" : "Try it"}
        </Button>

        {error != null && (
          <p className="text-xs text-error-text">
            {apiErrorMessage(error, "These rules could not be tried.")}
          </p>
        )}

        {data && (
          <div className={cn("rounded-md border border-white-02 px-3 py-2.5 text-xs", BAND_SURFACE)}>
            <p className="text-black-01">
              {data.dynamic_role.matched_order == null
                ? "No rule matched."
                : `Rule ${data.dynamic_role.matched_order + 1} decides`}
              {matchedTarget ? (
                <>, so it goes to <strong>{matchedTarget.name}</strong>.</>
              ) : (
                "."
              )}
            </p>
            {data.count === 0 ? (
              <p className="mt-1 flex items-center gap-1.5 text-yellow-01-text">
                <TriangleAlert className="size-3.5" />
                Nobody can approve it: that reaches no one here, and the person raising it never
                approves their own.
              </p>
            ) : (
              <p className="mt-1 text-gray-01">
                {data.count} {data.count === 1 ? "person" : "people"} would be asked:{" "}
                <span className="text-black-01">
                  {data.approvers.map((a) => a.user.full_name).join(", ")}
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
