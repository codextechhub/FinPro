/**
 * Receivables -> Doubtful Debts: the provision runs.
 *
 * A run works out the allowance each branch must hold for debts that may not be
 * paid, from how old each overdue balance is and the school's bands (by default
 * 25% over 180 days, 50% over 365 and 100% over 730, under Settings >
 * Receivables). It is raised as a draft with its figures, approved by a second
 * person through its own route, and posted as one journal per branch: an
 * increase debits Bad debts (5350) and credits the Allowance for doubtful debts
 * (1290), a decrease the reverse. The figures are worked out again when it
 * posts, because receipts and write-offs made while it waited change them.
 *
 * A run covers every branch at once, so only a whole-school holder of the keys
 * raises, submits or posts one. A reader bound to some branches is listed the
 * runs with a line for one of them, each cut down to those branches' lines and
 * totals (`partial_view`). Such a part offers nothing to submit or post and says
 * nothing about approval: `approval_required` is null there, because whether a
 * run needs approval turns on its whole total.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Plus, Send } from "lucide-react";
import {
  ConfirmActionModal, DataTable, DetailDrawer, FormField, FormModal, Money, PostingDateField,
  PostingRecap, StatusPill, toArray, type Column,
} from "@/components/finance-ui";
import { useNoApproverPrompt } from "@/components/finance-ui/no-approver-prompt";
import { RETURNED_HINT, sentBackPill } from "@/components/finance-ui/returned-correction";
import { ResumeButton, ReturnedNote, useFinanceReturned } from "@/components/finance-ui/returned-note";
import { statusWord } from "@/components/finance-ui/status-words";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { P } from "../../../permissions";
import { useReaderReach } from "../../../host";
import { useWholeSchoolAccess } from "@/components/finance-ui/whole-school-access";
import { useDates } from "../../../lib/display-prefs";
import {
  useCreateProvisionMutation, useGetProvisionsQuery, usePostProvisionMutation, useSubmitProvisionMutation,
} from "@/redux/services/finance/fees-api";
import type { DoubtfulDebtProvision, ProvisionLine } from "@/redux/services/finance/fees-types";
import { DetailField, Note, bandLabel, bpsToPercent, useBranchColumn } from "./fees-parts";
import { ListBranchSelect, listBranchArg, useListBranch } from "./list-branch";

const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";
const td = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";

/**
 * Whether the run in hand is only the reader's branches' part of it.
 *
 * The server says so with `partial_view`; a null `approval_required` comes only
 * with such a part, so either one is enough.
 */
export function isPartOfRun(run: Pick<DoubtfulDebtProvision, "partial_view" | "approval_required">): boolean {
  return run.partial_view === true || run.approval_required === null;
}

/** "your branch's part", or "your branches' part" for a reader who works in several. */
function yourBranchesPart(branchIds: number[] | null): string {
  return (branchIds?.length ?? 0) > 1 ? "your branches' part" : "your branch's part";
}

/** The journal a provision's net movement posts: raising the allowance, or releasing it. */
export function provisionRecap(lines: ProvisionLine[]) {
  const net = lines.reduce((sum, line) => sum + line.movement, 0);
  const amount = Math.abs(net);
  const expense = { code: "5350", name: "Bad debts", amount };
  const allowance = { code: "1290", name: "Allowance for doubtful debts", amount };
  return net >= 0 ? { dr: [expense], cr: [allowance], net } : { dr: [allowance], cr: [expense], net };
}

export function ProvisionsTab({ entity, currency }: { entity: string; currency?: string | null }) {
  const dates = useDates();
  const { branchIds } = useReaderReach();
  const { wholeSchool, canWholeSchool, heldWithoutReach } = useWholeSchoolAccess();
  const list = useListBranch();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<DoubtfulDebtProvision | null>(null);
  // A run names no branch; a branch's list keeps the runs with a line for it.
  const { data, isLoading, isFetching, isError, refetch } = useGetProvisionsQuery({ entity, page, ...listBranchArg(list.view) });
  const rows = useMemo(() => toArray(data?.data), [data]);
  const pg = data?.pagination;
  const open = selected ? rows.find((r) => r.id === selected.id) ?? selected : null;
  const showsParts = useMemo(() => rows.some(isPartOfRun), [rows]);

  const columns: Column<DoubtfulDebtProvision>[] = [
    { header: "Ref", cell: (r) => <span className="font-semibold tabular-nums">{r.document_number}</span> },
    { header: "As of", cell: (r) => <span className="tabular-nums">{dates.day(r.as_of)}</span> },
    {
      header: "Allowance required", align: "right",
      cell: (r) => (
        <div className="flex flex-col items-end">
          <Money kobo={r.required_total} currency={currency} align="right" />
          {isPartOfRun(r) ? <span className="font-mont text-[11px] text-gray-05">{yourBranchesPart(branchIds)}</span> : null}
        </div>
      ),
    },
    { header: "Change", align: "right", cell: (r) => <Money kobo={r.movement_total} currency={currency} align="right" /> },
    { header: "Status", cell: (r) => <StatusPill {...sentBackPill(r, r.status, statusWord(r.status), true)} /> },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <ListBranchSelect view={list.view} onChange={(v) => { setPage(1); list.choose(v); }} />
          <p className="font-mont text-xs text-gray-05">One journal per branch, worked out from each branch&apos;s aged debts.</p>
        </div>
        {canWholeSchool(P.FIN_CREATE_PROVISION) ? (
          <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="size-4" /> New provision run</Button>
        ) : null}
      </div>
      {heldWithoutReach(P.FIN_CREATE_PROVISION) ? (
        <Note>A provision run covers every branch at once, so only someone who covers the whole school raises one.</Note>
      ) : null}
      {showsParts ? (
        <p className="font-mont text-xs text-gray-05">{`Each run covers the whole school. You are shown only ${yourBranchesPart(branchIds)}: its figures and its journal.`}</p>
      ) : null}
      <DataTable
        columns={columns} rows={rows} rowKey={(r) => r.id}
        loading={isLoading || isFetching} error={isError} onRetry={refetch} onRowClick={setSelected}
        page={pg?.currentPage} totalPages={pg?.totalPages} onPageChange={setPage}
        emptyTitle="No provision runs"
        emptyMessage={wholeSchool
          ? "A run sets the allowance for doubtful debts from how old each overdue balance is."
          : "A run that includes your branch shows here once someone who covers the whole school raises it."}
      />
      <NewProvisionModal open={creating} onClose={() => setCreating(false)} entity={entity} onCreated={setSelected} />
      <ProvisionDrawer provision={open} entity={entity} currency={currency} onClose={() => setSelected(null)} />
    </div>
  );
}

function NewProvisionModal({ open, onClose, entity, onCreated }: {
  open: boolean; onClose: () => void; entity: string; onCreated: (p: DoubtfulDebtProvision) => void;
}) {
  const [asOf, setAsOf] = useState("");
  const [narration, setNarration] = useState("");
  const [create, { isLoading }] = useCreateProvisionMutation();
  const close = () => { setAsOf(""); setNarration(""); onClose(); };
  const submit = async () => {
    try {
      const res = await create({ entity, as_of: asOf, narration: narration.trim() || undefined }).unwrap();
      toast.success(res.message || "Provision prepared.");
      onCreated(res.data);
      close();
    } catch { /* central */ }
  };
  return (
    <FormModal
      open={open} onOpenChange={(o) => !o && close()}
      title="New provision run"
      description="Works out each branch's allowance from its debts aged to this date. Nothing posts until it is approved."
      submitText="Prepare run" loading={isLoading} canSubmit={!!asOf} onSubmit={submit}
    >
      <PostingDateField label="Age debts to" entity={entity} value={asOf} onChange={setAsOf} />
      <FormField label="Narration">
        <Input value={narration} onChange={(e) => setNarration(e.target.value)} maxLength={255} placeholder="e.g. Year-end provision" className="bg-white" />
      </FormField>
    </FormModal>
  );
}

function ProvisionDrawer({ provision, entity, currency, onClose }: {
  provision: DoubtfulDebtProvision | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  const dates = useDates();
  const { branchIds } = useReaderReach();
  const { canWholeSchool } = useWholeSchoolAccess();
  const branches = useBranchColumn();
  const [confirming, setConfirming] = useState(false);
  const [submit, { isLoading: submitting }] = useSubmitProvisionMutation();
  const [post, { isLoading: posting }] = usePostProvisionMutation();
  const { promptIfParked, noApproverDialog } = useNoApproverPrompt({ documentLabel: "provision run" });
  // No edit route: one sent back is resumed as it is, or withdrawn to change it.
  const { standing, request, workflowId, requestNamed } = useFinanceReturned(provision, { path: "provisions", entity });
  if (!provision) return null;

  const isDraft = provision.status === "DRAFT" && !standing;
  const partOnly = isPartOfRun(provision);
  const gated = provision.approval_required !== false;
  const allowed = !partOnly && (gated ? canWholeSchool(P.FIN_SUBMIT_PROVISION) : canWholeSchool(P.FIN_POST_PROVISION));
  const recap = provisionRecap(provision.lines);
  const bandKeys = [...new Set(provision.lines.flatMap((l) => Object.keys(l.bands)))].sort((a, b) => Number(a) - Number(b));

  const act = async () => {
    try {
      if (gated) {
        const res = await submit({ entity, id: provision.id }).unwrap();
        toast.success(res.message || "Provision submitted for approval.");
        promptIfParked(res.data?.approval);
        setConfirming(false);
        if (!res.data?.approval?.parked) onClose();
        return;
      }
      const res = await post({ entity, id: provision.id }).unwrap();
      toast.success(res.message || "Provision posted.");
      setConfirming(false);
      onClose();
    } catch { /* central */ }
  };

  return (
    <>
      <DetailDrawer
        open onOpenChange={(o) => (o ? undefined : onClose())}
        title={provision.document_number}
        description={`Doubtful debts aged to ${dates.day(provision.as_of)}`}
        widthClass="sm:max-w-2xl"
        footer={standing === "sender" ? (
          <ResumeButton workflowId={workflowId} tags={["FinanceProvisions"]} onResumed={onClose} />
        ) : isDraft && allowed ? (
          <Button onClick={() => setConfirming(true)} className="gap-1.5">
            {gated ? <><Send className="size-4" /> Submit for approval</> : <><Check className="size-4" /> Post provision</>}
          </Button>
        ) : undefined}
      >
        <div className="space-y-5">
          {partOnly ? (
            <Note>{`This run covers the whole school. You are shown only ${yourBranchesPart(branchIds)}. Submitting and posting it are for someone who covers the whole school.`}</Note>
          ) : null}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <DetailField label="Status"><StatusPill {...sentBackPill(provision, provision.status, statusWord(provision.status), true)} /></DetailField>
            <DetailField label="Allowance required"><Money kobo={provision.required_total} currency={currency} /></DetailField>
            <DetailField label="Change to the allowance"><Money kobo={provision.movement_total} currency={currency} /></DetailField>
          </div>
          <ReturnedNote standing={standing} request={request} requestNamed={requestNamed} senderHint={RETURNED_HINT.resumeOnly} />
          {isDraft ? (
            <Note>
              {gated && !partOnly
                ? "A second person approves this run before it posts. The figures are worked out again when it posts, so receipts and write-offs made meanwhile are counted."
                : "The figures are worked out again when it posts, so receipts and write-offs made meanwhile are counted."}
            </Note>
          ) : null}

          <div>
            <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">
              {branches.show ? "By branch" : "Figures"}
            </p>
            <div className="overflow-x-auto rounded-md border border-white-02">
              <table className="w-full border-collapse">
                <thead><tr>
                  {branches.show ? <th className={th}>Branch</th> : null}
                  <th className={`${th} text-right`}>Required</th>
                  <th className={`${th} text-right`}>Held now</th>
                  <th className={`${th} text-right`}>Change</th>
                </tr></thead>
                <tbody>
                  {provision.lines.map((line) => (
                    <tr key={line.branch_id ?? "none"}>
                      {branches.show ? <td className={td}>{branches.name(line.branch_id, line.branch_name)}</td> : null}
                      <td className={`${td} text-right`}><Money kobo={line.required} currency={currency} align="right" /></td>
                      <td className={`${td} text-right`}><Money kobo={line.current} currency={currency} align="right" /></td>
                      <td className={`${td} text-right`}><Money kobo={line.movement} currency={currency} align="right" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {bandKeys.length ? (
            <div>
              <p className="mb-2 font-mont text-xs font-semibold uppercase tracking-wide text-gray-05">By age</p>
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full border-collapse">
                  <thead><tr>
                    {branches.show ? <th className={th}>Branch</th> : null}
                    <th className={th}>Band</th>
                    <th className={`${th} text-right`}>Owed</th>
                    <th className={`${th} text-right`}>Required</th>
                  </tr></thead>
                  <tbody>
                    {provision.lines.flatMap((line) => bandKeys.filter((k) => line.bands[k]).map((k) => (
                      <tr key={`${line.branch_id}-${k}`}>
                        {branches.show ? <td className={td}>{branches.name(line.branch_id, line.branch_name)}</td> : null}
                        <td className={td}>
                          {bandLabel(k)}
                          {(() => {
                            const band = provision.policy_snapshot.find((b) => String(b.over_days) === k);
                            return band ? <span className="text-gray-05"> at {bpsToPercent(band.rate_bps)}</span> : null;
                          })()}
                        </td>
                        <td className={`${td} text-right`}><Money kobo={line.bands[k].owed} currency={currency} align="right" /></td>
                        <td className={`${td} text-right`}><Money kobo={line.bands[k].required} currency={currency} align="right" /></td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <PostingRecap
            title={recap.net >= 0 ? "Raising the allowance" : "Releasing the allowance"}
            dr={recap.dr} cr={recap.cr} currency={currency} stackOnMobile
            helper={branches.show && provision.lines.length > 1 ? "Posted as one journal per branch; this is their total." : undefined}
          />
          {provision.narration ? <DetailField label="Narration"><span className="font-normal">{provision.narration}</span></DetailField> : null}
        </div>
      </DetailDrawer>
      <ConfirmActionModal
        open={confirming} onOpenChange={(o) => !o && setConfirming(false)}
        title={gated ? "Submit this provision run for approval?" : "Post this provision run?"}
        description={gated
          ? `Sends ${provision.document_number} for approval. Nothing reaches the ledger until it is approved.`
          : `Posts ${provision.document_number} as one journal per branch, with the figures worked out again today.`}
        confirmText={gated ? "Submit" : "Post"} loading={submitting || posting} onConfirm={act}
      />
      {noApproverDialog}
    </>
  );
}
