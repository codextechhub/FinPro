/**
 * Setup → Chart of Accounts. The design's tree-table ported to the house theme:
 * an expandable account tree (or flat view) with type pills, normal balance,
 * currency, rolled-up GL balance and sub-ledger tags.
 *
 * The chart is the school's, and every branch posts to it. A new account joins
 * it for every branch, so New account is offered only to a holder of the create
 * key who covers the whole school; the server refuses anyone else. Editing
 * follows the account: the ledger account behind a branch's own bank belongs to
 * that branch, and its bursar may rename it, while every other account needs
 * whole-school reach. Lekki's bursar sees her bank's ledger account editable and
 * the rest of the chart read-only, with the reason.
 *
 * Most of the chart is posted to by the software itself. When the server
 * classifies accounts (`managed_by` on every row) those accounts fold into one
 * collapsed "Managed by the system" section under the everyday tree, so a new
 * bursar reads the accounts they use first; a search still finds them and opens
 * the section. When a role may not read the classification the key is absent
 * from every row, and the chart is one plain tree with no section and no
 * system wording. Each account shows its description as a second line, and how
 * the viewer left the groups and the section is remembered in their browser.
 */
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, Check, Plus, Printer, Activity, Columns2, Network, Settings2 } from "lucide-react";
import { cardColumns } from "../bank-account-access";
import { AccessField, Money, FormField, DetailDrawer, StatusPill, DataTable, TabStrip, toArray, useActiveEntity, useFieldAccess, type Column, type TabStripItem } from "@/components/finance-ui";
import { useCan } from "@/components/finance-ui/can";
import { useWholeSchoolAccess } from "@/components/finance-ui/whole-school-access";
import { EmptyState, ErrorState, LoadingState } from "@/components/finance-ui/states";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { P } from "../../../permissions";
import { useBranches } from "../../../host";
import {
  useGetChartOfAccountsQuery, useGetAccountDetailQuery, useGetAccountActivityQuery, useUpdateAccountMutation,
} from "@/redux/services/finance/setup-api";
import type { Account, AccountDetail, ConsolidatedAccountActivityLine } from "@/redux/services/finance/setup-types";
import { ACCOUNT_TYPES } from "@/utils/chart-of-accounts";
import {
  accountGroupContribution,
  buildAccountTree,
  descendantPostingAccounts,
  isBalanceHidden,
  type AccountTreeNode,
} from "./account-group";
import { getAccountDetailTabKeys, type AccountDetailTabKey } from "./account-detail-tabs";
import { CHART_GROUP_HEADINGS, KIND_ORDER } from "./account-kinds";
import { hasManagedSplit, partitionChart, pruneTree } from "./chart-split";
import { readExpanded, readSystemOpen, writeExpanded, writeSystemOpen } from "./chart-view-state";
import { CreateAccountDrawer } from "./new-account-drawer";
import { useDates } from "../../../lib/display-prefs";

type Node = AccountTreeNode;

const TYPE_PILL: Record<string, string> = {
  ASSET: "bg-blue-50 text-blue-700",
  LIABILITY: "bg-amber-50 text-amber-700",
  EQUITY: "bg-violet-50 text-violet-700",
  INCOME: "bg-green-01/10 text-green-01",
  EXPENSE: "bg-destructive/10 text-destructive",
};
const headCls = "text-gray-01 bg-[#F1F1F1] font-semibold font-mont text-xs whitespace-nowrap px-3 py-2.5 text-left";
const selectCls = "h-9 rounded-md border border-white-02 bg-white px-2 font-mont text-sm focus:border-primary focus:outline-none";
// Lower case: the strip capitalises its labels.
const VIEW_TABS: TabStripItem<"tree" | "flat">[] = [
  { value: "tree", label: "Tree" },
  { value: "flat", label: "Flat" },
];

const GROUP_VIEW_TABS: TabStripItem<"balances" | "activity">[] = [
  { value: "balances", label: "Balance breakdown" },
  { value: "activity", label: "Consolidated activity" },
];

const SYSTEM_SECTION_NOTE = "The software posts to these accounts for you when you record invoices, payments, payroll and stock. You rarely need to open them.";

function Tag({ label }: { label: string }) {
  return <span className="ml-1.5 rounded bg-gray-03/60 px-1.5 py-0.5 font-mont text-[10px] font-semibold uppercase tracking-wide text-gray-05">{label}</span>;
}

/**
 * Which parts of the chart the reader's Field Access switches leave on. Each
 * flag follows one `finance.account` field: a hidden field's column, tag or
 * line is not drawn, and the header cell leaves with its column. The main table
 * and the system section read the same flags, so both hide the same columns.
 */
type ChartFields = {
  showBalance: boolean; showSubtype: boolean; showActive: boolean; showTag: boolean; showContra: boolean;
  showDescription: boolean;
};

/**
 * One chart row. `showMovedBy` adds the system section's "Moved by" line under
 * an account the software keeps.
 */
function AccountRow({ node, depth, expanded, toggle, currency, onSelect, showMovedBy, fields }: {
  node: Node; depth: number; expanded: Set<number>; toggle: (id: number) => void; currency?: string | null; onSelect: (id: number) => void; showMovedBy: boolean; fields: ChartFields;
}) {
  const { showBalance, showSubtype, showActive, showTag, showContra, showDescription } = fields;
  const hasChildren = node.children.length > 0;
  const open = expanded.has(node.id);
  const cell = "border-t border-white-02 px-3 py-2 font-mont text-sm text-black-01";
  return (
    <>
      <tr className="cursor-pointer hover:bg-primary/5" onClick={() => onSelect(node.id)}>
        <td className={cell}>
          <div className="flex items-start" style={{ paddingLeft: depth * 18 }}>
            {hasChildren ? (
              <button onClick={(e) => { e.stopPropagation(); toggle(node.id); }} className="mr-1 mt-0.5 text-gray-05 hover:text-gray-01" aria-label={open ? "Collapse" : "Expand"}>
                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ) : <span className="mr-1 inline-block w-4 shrink-0" />}
            <div className="min-w-0">
              <div className="flex items-center">
                <span className="font-semibold tabular-nums text-gray-01">{node.code}</span>
                <span className="ml-2 text-black-01">{node.name}</span>
                {showTag && node.tag && <Tag label={node.tag === "CONTROL" ? "CTRL" : node.tag} />}
                {showContra && node.is_contra && <Tag label="Contra" />}
              </div>
              {showDescription && node.description ? (
                <p className="max-w-[22rem] truncate text-xs text-gray-05" title={node.description}>{node.description}</p>
              ) : null}
              {showMovedBy && node.managed_by ? (
                <p className="max-w-[22rem] truncate text-[11px] text-gray-05">Moved by {node.managed_by.moved_by}</p>
              ) : null}
            </div>
          </div>
        </td>
        <td className={cell}>
          <span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium capitalize", TYPE_PILL[node.account_type] ?? "bg-gray-03/60 text-gray-05")}>
            {node.account_type.toLowerCase()}
          </span>
        </td>
        {showSubtype ? <td className={cn(cell, "text-gray-05")}>{node.subtype || "-"}</td> : null}
        <td className={cn(cell, "text-gray-05")}>{node.normal_balance === "DEBIT" ? "Dr" : "Cr"}</td>
        <td className={cn(cell, "text-gray-05")}>{currency ?? "NGN"}</td>
        {showBalance ? (
          <td className={cn(cell, "text-right")}>
            {node.rolled === null ? <span className="text-gray-05">-</span> : <Money kobo={node.rolled} currency={currency} align="right" />}
          </td>
        ) : null}
        {showActive ? (
          <td className={cn(cell, "text-center")}>
            {node.is_active ? <Check className="mx-auto size-4 text-green-01" /> : <span className="text-gray-05">-</span>}
          </td>
        ) : null}
      </tr>
      {hasChildren && open && node.children.map((c) => (
        <AccountRow key={c.id} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} currency={currency} onSelect={onSelect} showMovedBy={showMovedBy} fields={fields} />
      ))}
    </>
  );
}

/** A run of chart rows under an optional heading, such as one account type of the system section. */
type RowGroup = { heading?: string; rows: Node[] };

/** The chart's table: one header row, then each group's rows. */
function ChartTable({ groups, expanded, toggle, currency, onSelect, showMovedBy, fields }: {
  groups: RowGroup[]; expanded: Set<number>; toggle: (id: number) => void; currency?: string | null; onSelect: (id: number) => void; showMovedBy: boolean; fields: ChartFields;
}) {
  const { showBalance, showSubtype, showActive } = fields;
  const columns = 4 + (showSubtype ? 1 : 0) + (showBalance ? 1 : 0) + (showActive ? 1 : 0);
  return (
    <table className="w-full border-collapse">
      <thead>
        <tr>
          <th className={headCls}>Account</th>
          <th className={headCls}>Type</th>
          {showSubtype ? <th className={headCls}>Subtype</th> : null}
          <th className={headCls}>Normal</th>
          <th className={headCls}>Currency</th>
          {showBalance ? <th className={cn(headCls, "text-right")}>Balance</th> : null}
          {showActive ? <th className={cn(headCls, "text-center")}>Active</th> : null}
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <GroupRows key={group.heading ?? "all"} group={group} columns={columns} expanded={expanded} toggle={toggle} currency={currency} onSelect={onSelect} showMovedBy={showMovedBy} fields={fields} />
        ))}
      </tbody>
    </table>
  );
}

function GroupRows({ group, columns, ...rest }: {
  group: RowGroup; columns: number; expanded: Set<number>; toggle: (id: number) => void; currency?: string | null; onSelect: (id: number) => void; showMovedBy: boolean; fields: ChartFields;
}) {
  return (
    <>
      {group.heading ? (
        <tr>
          <th colSpan={columns} scope="colgroup" className="border-t border-white-02 bg-gray-02/60 px-3 py-1.5 text-left font-mont text-[11px] font-semibold uppercase tracking-wide text-gray-05">{group.heading}</th>
        </tr>
      ) : null}
      {group.rows.map((n) => <AccountRow key={n.id} node={n} depth={0} {...rest} />)}
    </>
  );
}

/**
 * The folded section for the accounts the software keeps: a title with its
 * count, one line saying what they are, and the table once it is open.
 */
function SystemSection({ count, matchesOf, open, onToggle, children }: {
  count: number; matchesOf: number | null; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-white-02 bg-white" aria-label="Managed by the system">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex w-full items-start gap-2 px-3 py-3 text-left">
        <span className="mt-0.5 text-gray-05">{open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</span>
        <span className="min-w-0">
          <span className="block font-mont text-sm font-semibold text-black-01">
            Managed by the system ({matchesOf === null ? count : `${matchesOf} of ${count}`})
          </span>
          <span className="block font-mont text-xs text-gray-05">{SYSTEM_SECTION_NOTE}</span>
        </span>
      </button>
      {open ? <div className="overflow-x-auto border-t border-white-02">{children}</div> : null}
    </section>
  );
}

export function AccountsTab({ entity }: { entity: string }) {
  return <ChartOfAccounts key={entity} entity={entity} />;
}

function ChartOfAccounts({ entity }: { entity: string }) {
  const access = useFieldAccess("finance.account");
  const { currency } = useActiveEntity();
  const { data, isLoading, isFetching, isError, refetch } = useGetChartOfAccountsQuery({ entity });
  const accounts = toArray<Account>(data?.data);

  const [view, setView] = useState<"tree" | "flat">("tree");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(() => readExpanded(entity) ?? new Set());
  const [touched, setTouched] = useState(() => readExpanded(entity) !== null);
  const [systemOpen, setSystemOpen] = useState(readSystemOpen);
  const [creating, setCreating] = useState(false);
  const { canWholeSchool } = useWholeSchoolAccess();
  const canCreate = canWholeSchool(P.FIN_CREATE_ACCOUNT);
  useActionParam("new", canCreate, () => { if (canCreate) setCreating(true); });
  const [detailId, setDetailId] = useState<number | null>(null);

  // Default: expand every parent until the viewer starts toggling.
  const allParentIds = useMemo(() => new Set(accounts.filter((a) => !a.is_postable).map((a) => a.id)), [accounts]);
  const effectiveExpanded = touched ? expanded : allParentIds;
  const toggle = (id: number) => {
    const next = new Set(effectiveExpanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setTouched(true);
    setExpanded(next);
    writeExpanded(entity, next);
  };
  const toggleSystem = () => {
    setSystemOpen(!systemOpen);
    writeSystemOpen(!systemOpen);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) =>
      (!type || a.account_type === type) &&
      (!q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.description ?? "").toLowerCase().includes(q)),
    );
  }, [accounts, type, search]);

  const tree = useMemo(() => buildAccountTree(filtered), [filtered]);
  const flat = useMemo(
    () => filtered.slice().sort((a, b) => a.code.localeCompare(b.code))
      .map<Node>((a) => ({ ...a, children: [], rolled: isBalanceHidden(a) ? null : (a.balance?.kobo ?? 0) })),
    [filtered],
  );
  // The Balance column stays while at least one account's balance is readable.
  const showBalance = !access.isHidden("balance") && accounts.some((a) => !isBalanceHidden(a));
  const fields: ChartFields = {
    showBalance,
    showSubtype: !access.isHidden("subtype"),
    showActive: !access.isHidden("is_active"),
    showTag: !access.isHidden("tag"),
    showContra: !access.isHidden("is_contra"),
    showDescription: !access.isHidden("description"),
  };
  // Tree view only makes sense unfiltered; an active search/type filter falls back to flat.
  const filtering = search !== "" || type !== "";
  const rows = view === "tree" && !filtering ? tree : flat;

  // A reader who may not see the classification gets one plain tree.
  const hideManaged = access.isHidden("managed_by");
  const split = useMemo(() => !hideManaged && hasManagedSplit(accounts), [accounts, hideManaged]);
  const { everyday, system } = useMemo(() => partitionChart(accounts), [accounts]);
  const mainRows = split ? (rows === tree ? pruneTree(tree, everyday) : flat.filter((n) => everyday.has(n.id))) : rows;
  const systemRows = split ? (rows === tree ? pruneTree(tree, system) : flat.filter((n) => system.has(n.id))) : [];
  const systemGroups: RowGroup[] = rows === tree
    ? KIND_ORDER.map((kind) => ({ heading: CHART_GROUP_HEADINGS[kind], rows: systemRows.filter((n) => n.account_type === kind) })).filter((g) => g.rows.length > 0)
    : [{ rows: systemRows }];
  const systemMatches = rows === tree ? system.size : systemRows.length;
  const showSystem = split && systemMatches > 0;
  // A text search opens the section so a match is never hidden behind a click.
  const systemShown = systemOpen || search.trim() !== "";
  const tableProps = { expanded: effectiveExpanded, toggle, currency, onSelect: setDetailId, fields };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, name or purpose" className="h-9 max-w-xs font-mont text-sm" />
        <TabStrip items={VIEW_TABS} value={view} onChange={setView} variant="pill-compact" ariaLabel="Account list shape" />
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls} aria-label="Account type">
          <option value="">All types</option>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
        </select>
        {canCreate ? (
          <Button onClick={() => setCreating(true)} className="ml-auto h-9 gap-1.5 font-mont text-xs font-semibold">
            <Plus className="size-3.5" /> New account
          </Button>
        ) : null}
      </div>

      {isLoading || isFetching ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : mainRows.length === 0 && !showSystem ? (
        <EmptyState title="No accounts" message="The chart of accounts will appear here." />
      ) : (
        <>
          {mainRows.length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-white-02 bg-white">
              <ChartTable groups={[{ rows: mainRows }]} showMovedBy={false} {...tableProps} />
            </div>
          ) : filtering ? (
            <p className="font-mont text-xs text-gray-05">No everyday account matches.</p>
          ) : null}
          {showSystem ? (
            <SystemSection
              count={system.size}
              matchesOf={filtering ? systemMatches : null}
              open={systemShown}
              onToggle={toggleSystem}
            >
              <ChartTable groups={systemGroups} showMovedBy {...tableProps} />
            </SystemSection>
          ) : null}
        </>
      )}

      {canCreate ? <CreateAccountDrawer open={creating} onClose={() => setCreating(false)} entity={entity} parents={accounts} /> : null}
      <AccountDetailDrawer key={detailId ?? "closed"} id={detailId} entity={entity} accounts={accounts} currency={currency} onClose={() => setDetailId(null)} />
    </div>
  );
}

const DRAWER_TABS = [
  { key: "activity", label: "Activity", icon: Activity },
  { key: "taccount", label: "T-account", icon: Columns2 },
  { key: "subs", label: "Sub-accounts", icon: Network },
  { key: "settings", label: "Settings", icon: Settings2 },
] as const;

function AccountDetailDrawer({ id, entity, accounts, currency, onClose }: {
  id: number | null; entity: string; accounts: Account[]; currency?: string | null; onClose: () => void;
}) {
  const dates = useDates();
  const { data, isLoading, isError, refetch } = useGetAccountDetailQuery(id ? { entity, id } : skipToken);
  const [tab, setTab] = useState<AccountDetailTabKey>("activity");
  const [groupView, setGroupView] = useState<"balances" | "activity" | null>(null);
  const d = data?.data;
  const acc = d?.account;
  const access = useFieldAccess("finance.account", acc);
  // The detail row carries the classification; the chart row stands in until it does.
  const managed = acc && !access.isHidden("managed_by") ? (acc.managed_by !== undefined ? acc.managed_by : accounts.find((a) => a.id === acc.id)?.managed_by) : undefined;
  const kids = id ? accounts.filter((a) => a.parent_id === id) : [];
  const availableTabKeys = getAccountDetailTabKeys(acc?.is_postable ?? true);
  const tabItems: TabStripItem<AccountDetailTabKey>[] = DRAWER_TABS
    .filter((candidate) => availableTabKeys.includes(candidate.key) && (
      !["activity", "taccount"].includes(candidate.key) || !access.isHidden("activity")
    ))
    .map((candidate) => ({
      value: candidate.key,
      label: (
        <>
          <candidate.icon className="size-3.5" />
          {candidate.label}{candidate.key === "subs" && kids.length ? ` (${kids.length})` : ""}
        </>
      ),
    }));
  const activeTab = tabItems.some((item) => item.value === tab) ? tab : (tabItems[0]?.value ?? "settings");

  // A bank account's balance figures leave the summary and the activity together.
  const balances = { current: d?.summary.current_balance, opening: d?.summary.opening_balance };
  const showRunning = (d?.activity ?? []).some((a) => a.running_balance !== undefined);

  const cell = "border-t border-white-02 px-3 py-2 font-mont text-xs text-black-01";
  const th = "bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01";

  return (
    <DetailDrawer
      open={id != null}
      onOpenChange={(o) => !o && onClose()}
      title={acc ? `${acc.code} · ${acc.name}` : "Account"}
      description={acc ? `${acc.subtype || d?.type_label || acc.account_type} · Normal: ${acc.normal_balance === "DEBIT" ? "Debit" : "Credit"}` : undefined}
      widthClass="sm:max-w-4xl"
      footer={<Button variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer className="size-4" /> Print</Button>}
    >
      {isLoading ? <LoadingState rows={6} /> : isError || !d || !acc ? <ErrorState onRetry={refetch} /> : (
        <div className="space-y-4">
          {acc.description && !access.isHidden("description") ? (
            <div className="rounded-md bg-gray-02/60 px-3 py-2">
              <p className="font-mont text-[11px] font-semibold text-gray-05">What it&apos;s for</p>
              <p className="mt-0.5 font-mont text-sm text-black-01">{acc.description}</p>
            </div>
          ) : null}
          {managed ? (
            <div className="space-y-1 rounded-md border border-blue-100 bg-blue-50/60 px-3 py-2 font-mont text-xs text-gray-01">
              <p><span className="font-semibold">Managed by the system:</span> kept by {managed.keeper}. Record it with {managed.moved_by}.</p>
              {managed.hand_journals === false ? <p>Typed journals cannot post to this account.</p> : null}
            </div>
          ) : null}
          {/* KPI cards */}
          <div className={cn("grid gap-3", cardColumns(1 + (balances.current ? 1 : 0) + (balances.opening ? 1 : 0)))}>
            {!balances.current ? null : acc.is_postable ? (
              <div className="rounded-md bg-white p-3 ring-1 ring-white-02">
                <p className="font-mont text-[11px] text-gray-05">Current balance</p>
                <p className="mt-1 font-mont text-base font-semibold tabular-nums"><Money kobo={balances.current.kobo} currency={currency} /></p>
              </div>
            ) : (
              <button type="button" onClick={() => setGroupView("balances")}
                className="rounded-md bg-white p-3 text-left ring-1 ring-white-02 transition hover:bg-primary/5 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <p className="font-mont text-[11px] text-gray-05">Group balance</p>
                <p className="mt-1 font-mont text-base font-semibold tabular-nums"><Money kobo={balances.current.kobo} currency={currency} /></p>
                <span className="mt-1 inline-flex items-center gap-0.5 font-mont text-[11px] font-semibold text-primary">View breakdown <ChevronRight className="size-3" /></span>
              </button>
            )}
            {balances.opening ? (
              <div className="rounded-md bg-white p-3 ring-1 ring-white-02">
                <p className="font-mont text-[11px] text-gray-05">{acc.is_postable ? "Opening (FY carry-in)" : "Opening group balance"}</p>
                <p className="mt-1 font-mont text-base font-semibold tabular-nums"><Money kobo={balances.opening.kobo} currency={currency} /></p>
              </div>
            ) : null}
            {acc.is_postable ? (
              <div className="rounded-md bg-white p-3 ring-1 ring-white-02">
                <p className="font-mont text-[11px] text-gray-05">Posted YTD</p>
                <p className="mt-1 font-mont text-base font-semibold tabular-nums">{d.summary.line_count} lines</p>
                <p className="font-mont text-[11px] text-gray-05">across {d.summary.journal_count} journals</p>
              </div>
            ) : (
              <button type="button" onClick={() => setGroupView("activity")}
                className="rounded-md bg-white p-3 text-left ring-1 ring-white-02 transition hover:bg-primary/5 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <p className="font-mont text-[11px] text-gray-05">Posted activity YTD</p>
                <p className="mt-1 font-mont text-base font-semibold tabular-nums">{d.summary.line_count} lines</p>
                <p className="font-mont text-[11px] text-gray-05">across {d.summary.journal_count} journals</p>
                <span className="mt-1 inline-flex items-center gap-0.5 font-mont text-[11px] font-semibold text-primary">View activity <ChevronRight className="size-3" /></span>
              </button>
            )}
          </div>

          {groupView ? (
            <GroupLedger
              key={`${acc.id}-${groupView}`}
              initialView={groupView}
              entity={entity}
              account={acc}
              accounts={accounts}
              summary={d.summary}
              currency={currency}
              onBack={() => setGroupView(null)}
            />
          ) : (
            <>
          {/* tabs */}
          <TabStrip
            items={tabItems}
            value={activeTab}
            onChange={setTab}
            variant="underline"
            ariaLabel="Account detail sections"
            className="gap-1"
            buttonClassName="inline-flex items-center gap-1.5 px-3 py-2 font-semibold"
          />

          {activeTab === "activity" && !access.isHidden("activity") && (
            (d.activity ?? []).length === 0 ? <EmptyState title="No postings" message="Posted journal lines hitting this account will appear here." /> : (
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full border-collapse">
                  <thead><tr>
                    <th className={th}>Date</th><th className={th}>Journal</th><th className={th}>Description</th>
                    <th className={th}>Cost centre</th><th className={cn(th, "text-right")}>Debit</th>
                    <th className={cn(th, "text-right")}>Credit</th>
                    {showRunning ? <th className={cn(th, "text-right")}>Balance</th> : null}
                  </tr></thead>
                  <tbody>
                    {(d.activity ?? []).map((a, i) => (
                      <tr key={`${a.journal_no}-${i}`}>
                        <td className={cn(cell, "text-gray-05")}>{dates.day(a.date)}</td>
                        <td className={cn(cell, "font-semibold")}>{a.journal_no}</td>
                        <td className={cn(cell, "max-w-xs truncate")}>{a.description || "-"}</td>
                        <td className={cn(cell, "text-gray-05")}>{a.cost_center || "-"}</td>
                        <td className={cn(cell, "text-right tabular-nums")}>{a.debit.kobo ? <Money kobo={a.debit.kobo} currency={currency} align="right" /> : "-"}</td>
                        <td className={cn(cell, "text-right tabular-nums")}>{a.credit.kobo ? <Money kobo={a.credit.kobo} currency={currency} align="right" /> : "-"}</td>
                        {showRunning ? (
                          <td className={cn(cell, "text-right font-medium tabular-nums")}>
                            {a.running_balance ? <Money kobo={a.running_balance.kobo} currency={currency} align="right" /> : "-"}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === "taccount" && !access.isHidden("activity") && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-white-02">
                <p className="border-b border-white-02 bg-[#F1F1F1] px-3 py-2 font-mont text-xs font-semibold">Debits</p>
                {(d.activity ?? []).filter((a) => a.debit?.kobo).map((a, i) => (
                  <div key={i} className="flex justify-between px-3 py-1.5 font-mont text-xs"><span className="truncate text-gray-05">{a.journal_no}</span><Money kobo={a.debit.kobo} currency={currency} /></div>
                ))}
              </div>
              <div className="rounded-md border border-white-02">
                <p className="border-b border-white-02 bg-[#F1F1F1] px-3 py-2 font-mont text-xs font-semibold">Credits</p>
                {(d.activity ?? []).filter((a) => a.credit?.kobo).map((a, i) => (
                  <div key={i} className="flex justify-between px-3 py-1.5 font-mont text-xs"><span className="truncate text-gray-05">{a.journal_no}</span><Money kobo={a.credit.kobo} currency={currency} /></div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "subs" && (
            kids.length === 0 ? <EmptyState title="No sub-accounts" message="This is a leaf account." /> : (
              <div className="rounded-md border border-white-02">
                {kids.map((k) => (
                  <div key={k.id} className="flex items-center justify-between border-t border-white-02 px-3 py-2 font-mont text-sm first:border-t-0">
                    <span><span className="font-semibold tabular-nums">{k.code}</span><span className="ml-2">{k.name}</span></span>
                    {!access.isHidden("is_active") ? <StatusPill status={k.is_active ? "ACTIVE" : "INACTIVE"} /> : null}
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === "settings" && <AccountSettings key={acc.id} entity={entity} account={acc} onSaved={onClose} />}
            </>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}

type GroupBalanceRow = {
  account: Account;
  /** Null when the posting account's balance is hidden from the role. */
  contribution: number | null;
};

function GroupLedger({ initialView, entity, account, accounts, summary, currency, onBack }: {
  initialView: "balances" | "activity";
  entity: string;
  account: Account;
  accounts: Account[];
  summary: AccountDetail["summary"];
  currency?: string | null;
  onBack: () => void;
}) {
  const dates = useDates();
  const [view, setView] = useState<"balances" | "activity">(initialView);
  const [balanceSearch, setBalanceSearch] = useState("");
  const [balancePage, setBalancePage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [accountFilter, setAccountFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(summary.fiscal_year_start ?? "");
  const [dateTo, setDateTo] = useState(summary.as_of);
  const postingAccounts = useMemo(
    () => descendantPostingAccounts(accounts, account.id),
    [accounts, account.id],
  );

  const balanceRows = useMemo<GroupBalanceRow[]>(() => {
    const query = balanceSearch.trim().toLowerCase();
    return postingAccounts
      .filter((candidate) => (
        !query
        || candidate.code.toLowerCase().includes(query)
        || candidate.name.toLowerCase().includes(query)
      ))
      .map((candidate) => ({
        account: candidate,
        contribution: accountGroupContribution(candidate, account.normal_balance),
      }));
  }, [postingAccounts, balanceSearch, account.normal_balance]);
  const balancePageSize = 10;
  const balanceTotalPages = Math.max(1, Math.ceil(balanceRows.length / balancePageSize));
  const visibleBalances = balanceRows.slice(
    (balancePage - 1) * balancePageSize,
    balancePage * balancePageSize,
  );

  const activityArgs = view === "activity" ? {
    entity,
    id: account.id,
    page: activityPage,
    page_size: 25,
    ...(accountFilter ? { account: Number(accountFilter) } : {}),
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
  } : skipToken;
  const {
    data: activityData,
    isLoading: activityLoading,
    isFetching: activityFetching,
    isError: activityError,
    refetch: refetchActivity,
  } = useGetAccountActivityQuery(activityArgs);
  const activityRows = toArray(activityData?.data);

  // Both money columns leave together when no posting account's balance is readable.
  const showBalances = postingAccounts.some((candidate) => !isBalanceHidden(candidate));
  const balanceColumns: Column<GroupBalanceRow>[] = [
    {
      header: "Posting account",
      cell: ({ account: candidate }) => (
        <span>
          <span className="font-semibold tabular-nums">{candidate.code}</span>
          <span className="ml-2">{candidate.name}</span>
          {candidate.is_contra ? <Tag label="Contra" /> : null}
        </span>
      ),
    },
    ...(showBalances ? [
      {
        header: "Account balance",
        align: "right" as const,
        cell: ({ account: candidate }: GroupBalanceRow) => isBalanceHidden(candidate)
          ? <span className="text-gray-05">-</span>
          : <Money kobo={candidate.balance?.kobo ?? 0} currency={currency} align="right" />,
      },
      {
        header: "Group contribution",
        align: "right" as const,
        cell: (row: GroupBalanceRow) => row.contribution === null
          ? <span className="text-gray-05">-</span>
          : <Money kobo={row.contribution} currency={currency} align="right" />,
      },
    ] : []),
  ];
  const activityColumns: Column<ConsolidatedAccountActivityLine>[] = [
    { header: "Date", cell: (line) => <span className="whitespace-nowrap text-gray-05">{dates.day(line.date)}</span> },
    {
      header: "Account",
      cell: (line) => (
        <span>
          <span className="font-semibold tabular-nums">{line.account_code}</span>
          <span className="ml-1.5">{line.account_name}</span>
        </span>
      ),
    },
    {
      header: "Journal & description",
      cell: (line) => (
        <span className="block max-w-64">
          <span className="block font-semibold">{line.journal_no}</span>
          <span className="block truncate text-xs font-normal text-gray-05">
            {line.description || "No description"}
            {line.cost_center ? ` · ${line.cost_center}` : ""}
          </span>
        </span>
      ),
    },
    { header: "Debit", align: "right", cell: (line) => line.debit.kobo ? <Money kobo={line.debit.kobo} currency={currency} align="right" /> : "-" },
    { header: "Credit", align: "right", cell: (line) => line.credit.kobo ? <Money kobo={line.credit.kobo} currency={currency} align="right" /> : "-" },
  ];

  const resetActivityFilters = () => {
    setAccountFilter("");
    setDateFrom("");
    setDateTo("");
    setActivityPage(1);
  };

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white-02 pb-3">
        <div className="flex min-w-0 items-start gap-2">
          <button type="button" onClick={onBack} aria-label="Back to account details"
            className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md text-gray-05 hover:bg-gray-02 hover:text-gray-01">
            <ArrowLeft className="size-4" />
          </button>
          <div className="min-w-0">
            <h3 className="font-mont text-sm font-semibold text-black-01">Group ledger</h3>
            <p className="font-mont text-xs text-gray-05">Balances and posted movement across every posting account under {account.code}.</p>
          </div>
        </div>
        <TabStrip
          items={GROUP_VIEW_TABS}
          value={view}
          onChange={setView}
          variant="pill-compact"
          semantics="toggle"
          buttonClassName="py-1.5 font-semibold"
        />
      </div>

      {view === "balances" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Input
              value={balanceSearch}
              onChange={(event) => { setBalanceSearch(event.target.value); setBalancePage(1); }}
              placeholder="Search posting accounts"
              className="h-9 w-full bg-white font-mont text-sm sm:max-w-xs"
            />
            <p className="font-mont text-xs text-gray-05">{balanceRows.length} posting accounts</p>
          </div>
          <DataTable
            columns={balanceColumns}
            rows={visibleBalances}
            rowKey={(row) => row.account.id}
            emptyTitle="No posting accounts"
            emptyMessage="This account group has no posting accounts yet."
            page={balancePage}
            totalPages={balanceTotalPages}
            onPageChange={setBalancePage}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <FormField label="Posting account">
              <select value={accountFilter} onChange={(event) => { setAccountFilter(event.target.value); setActivityPage(1); }} className={cn(selectCls, "w-full")}>
                <option value="">All posting accounts</option>
                {postingAccounts.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.code} - {candidate.name}</option>)}
              </select>
            </FormField>
            <FormField label="From">
              <DatePickerInput value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setActivityPage(1); }} className="bg-white" />
            </FormField>
            <FormField label="To">
              <DatePickerInput value={dateTo} onChange={(event) => { setDateTo(event.target.value); setActivityPage(1); }} className="bg-white" />
            </FormField>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-mont text-xs text-gray-05">Defaults to the current fiscal year. Each row identifies the posting account it came from.</p>
            <Button type="button" variant="outline" onClick={resetActivityFilters} className="h-8 font-mont text-xs">All history</Button>
          </div>
          {activityData?.totals ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                ["Total debits", activityData.totals.debit.kobo],
                ["Total credits", activityData.totals.credit.kobo],
                ["Net group movement", activityData.totals.net_movement.kobo],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md bg-gray-02/60 px-3 py-2">
                  <p className="font-mont text-[11px] text-gray-05">{label}</p>
                  <p className="mt-0.5 font-mont text-sm font-semibold"><Money kobo={Number(value)} currency={currency} /></p>
                </div>
              ))}
            </div>
          ) : null}
          <DataTable
            columns={activityColumns}
            rows={activityRows}
            rowKey={(line) => line.id}
            mobileCard={(line) => (
              <div className="space-y-2 font-mont">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold"><span className="tabular-nums">{line.account_code}</span> {line.account_name}</p>
                  <span className="shrink-0 text-xs text-gray-05">{dates.day(line.date)}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold">{line.journal_no}</p>
                  <p className="text-xs text-gray-05">{line.description || "No description"}{line.cost_center ? ` · ${line.cost_center}` : ""}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 border-t border-white-02 pt-2">
                  <div><p className="text-[10px] uppercase tracking-wide text-gray-05">Debit</p><p className="text-sm font-semibold">{line.debit.kobo ? <Money kobo={line.debit.kobo} currency={currency} /> : "-"}</p></div>
                  <div className="text-right"><p className="text-[10px] uppercase tracking-wide text-gray-05">Credit</p><p className="text-sm font-semibold">{line.credit.kobo ? <Money kobo={line.credit.kobo} currency={currency} /> : "-"}</p></div>
                </div>
              </div>
            )}
            loading={activityLoading || activityFetching}
            error={activityError}
            onRetry={refetchActivity}
            emptyTitle="No consolidated activity"
            emptyMessage="No posted lines match these filters."
            page={activityData?.pagination.currentPage ?? activityPage}
            totalPages={activityData?.pagination.totalPages ?? 1}
            onPageChange={setActivityPage}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Why an account's settings are read-only for this reader, in their terms.
 *
 * Three reasons, each true of a different account. Without the update key,
 * nobody may edit any account. The ledger account behind a branch's own bank
 * belongs to that branch, so a reader who does not work there reads that,
 * never that every branch posts to it: Ikeja's bank ledger is Ikeja's, and
 * Lekki's bursar may not change it however wide her keys. Any other account
 * is the whole chart's, which only a whole-school reader changes.
 */
export function accountReadOnlyReason({ holdsKey, bankBranchId, bankBranchName }: {
  holdsKey: boolean;
  bankBranchId: number | null | undefined;
  bankBranchName: string | null;
}): string {
  if (!holdsKey) return "You don’t have permission to edit accounts.";
  if (bankBranchId != null) {
    const branch = bankBranchName ?? "its branch";
    return `This is the ledger account behind ${branch}'s own bank account, so only someone who works in ${branch} can change it.`;
  }
  return "Only a school-wide administrator can change this account, because every branch posts to it.";
}

/**
 * An account's Settings tab: its name, subtype and whether it is active.
 *
 * Editable by a holder of the update key who may change this account: the
 * branch of the bank behind it, or anyone covering the whole school when no
 * bank backs it. Anyone else reads why it is read-only (accountReadOnlyReason).
 */
export function AccountSettings({ entity, account, onSaved }: { entity: string; account: Account; onSaved: () => void }) {
  const [update, { isLoading }] = useUpdateAccountMutation();
  const { can } = useCan();
  const { canChange } = useWholeSchoolAccess();
  const mayEdit = canChange(P.FIN_UPDATE_ACCOUNT, [account.bank_branch_id]);
  const { data: branches } = useBranches();
  const bankBranchName = account.bank_branch_id == null
    ? null
    : branches?.find((b) => Number(b.id) === account.bank_branch_id)?.name ?? null;
  const access = useFieldAccess("finance.account", account);
  const [name, setName] = useState(account.name);
  const [subtype, setSubtype] = useState(account.subtype ?? "");
  const [description, setDescription] = useState(account.description ?? "");
  const [active, setActive] = useState(account.is_active);
  const descriptionChanged = !access.isReadOnly("description") && description.trim() !== (account.description ?? "").trim();
  const dirty = name !== account.name || subtype !== (account.subtype ?? "") || descriptionChanged || active !== account.is_active;

  const save = async () => {
    try {
      const r = await update(access.writableOnly({
        entity, id: account.id, name: name.trim(), subtype: subtype.trim(), is_active: active,
        ...(descriptionChanged ? { description: description.trim() } : {}),
      }, { creating: false })).unwrap();
      toast.success(r.message || "Account updated.");
      onSaved();
    } catch { /* central */ }
  };

  if (!mayEdit) {
    return (
      <EmptyState
        title="Read-only"
        message={accountReadOnlyReason({
          holdsKey: can(P.FIN_UPDATE_ACCOUNT), bankBranchId: account.bank_branch_id, bankBranchName,
        })}
      />
    );
  }
  return (
    <div className="space-y-3">
      <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white" /></FormField>
      <AccessField access={access} name="subtype"><FormField label="Subtype"><Input value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="e.g. Current asset" className="bg-white" /></FormField></AccessField>
      {account.description !== undefined ? (
        <AccessField access={access} name="description" label="What it's for">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="bg-white" placeholder="Say what goes into this account" />
        </AccessField>
      ) : null}
      <AccessField access={access} name="is_active"><label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label></AccessField>
      <Button onClick={save} disabled={!dirty || isLoading} className="font-mont text-xs font-semibold">{isLoading ? "Saving…" : "Save changes"}</Button>
    </div>
  );
}
