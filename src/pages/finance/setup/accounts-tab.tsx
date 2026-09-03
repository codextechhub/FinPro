// Setup → Chart of Accounts. The design's tree-table ported to the house theme:
// an expandable account tree (or flat view) with type pills, normal balance,
// currency, rolled-up GL balance and sub-ledger tags. Read-only viewer.
import { useMemo, useState } from "react";
import { useActionParam } from "@/hooks/use-action-param";
import { skipToken } from "@reduxjs/toolkit/query";
import { toast } from "sonner";
import { ArrowLeft, ChevronDown, ChevronRight, Check, Plus, Printer, Activity, Columns2, Network, Settings2 } from "lucide-react";
import { Money, FormField, DetailDrawer, InfoHint, StatusPill, DataTable, toArray, useActiveEntity, type Column } from "@/components/finance-ui";
import { SearchSelect } from "@/components/custom/search-select";
import { Can, useCan } from "@/components/finance-ui/can";
import { EmptyState, ErrorState, LoadingState } from "@/components/finance-ui/states";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { P } from "../../../permissions";
import {
  useGetChartOfAccountsQuery, useCreateAccountMutation, useGetAccountDetailQuery, useGetAccountActivityQuery, useUpdateAccountMutation,
} from "@/redux/services/finance/setup-api";
import type { Account, AccountDetail, ConsolidatedAccountActivityLine } from "@/redux/services/finance/setup-types";
import { ACCOUNT_CODE_LENGTH, ACCOUNT_TYPES, accountCodeError, accountsInCodeLine, accountTypeFromCode, isValidAccountCode } from "@/utils/chart-of-accounts";
import {
  accountGroupContribution,
  buildAccountTree,
  descendantPostingAccounts,
  type AccountTreeNode,
} from "./account-group";
import { getAccountDetailTabKeys, type AccountDetailTabKey } from "./account-detail-tabs";

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

function Tag({ label }: { label: string }) {
  return <span className="ml-1.5 rounded bg-gray-03/60 px-1.5 py-0.5 font-mont text-[10px] font-semibold uppercase tracking-wide text-gray-05">{label}</span>;
}

function AccountRow({ node, depth, expanded, toggle, currency, onSelect }: {
  node: Node; depth: number; expanded: Set<number>; toggle: (id: number) => void; currency?: string | null; onSelect: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const open = expanded.has(node.id);
  const cell = "border-t border-white-02 px-3 py-2 font-mont text-sm text-black-01";
  return (
    <>
      <tr className="cursor-pointer hover:bg-primary/5" onClick={() => onSelect(node.id)}>
        <td className={cell}>
          <div className="flex items-center" style={{ paddingLeft: depth * 18 }}>
            {hasChildren ? (
              <button onClick={(e) => { e.stopPropagation(); toggle(node.id); }} className="mr-1 text-gray-05 hover:text-gray-01" aria-label={open ? "Collapse" : "Expand"}>
                {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ) : <span className="mr-1 inline-block w-4" />}
            <span className="font-semibold tabular-nums text-gray-01">{node.code}</span>
            <span className="ml-2 text-black-01">{node.name}</span>
            {node.tag && <Tag label={node.tag === "CONTROL" ? "CTRL" : node.tag} />}
            {node.is_contra && <Tag label="Contra" />}
          </div>
        </td>
        <td className={cell}>
          <span className={cn("rounded px-2 py-0.5 font-mont text-[11px] font-medium capitalize", TYPE_PILL[node.account_type] ?? "bg-gray-03/60 text-gray-05")}>
            {node.account_type.toLowerCase()}
          </span>
        </td>
        <td className={cn(cell, "text-gray-05")}>{node.subtype || "-"}</td>
        <td className={cn(cell, "text-gray-05")}>{node.normal_balance === "DEBIT" ? "Dr" : "Cr"}</td>
        <td className={cn(cell, "text-gray-05")}>{currency ?? "NGN"}</td>
        <td className={cn(cell, "text-right")}><Money kobo={node.rolled} currency={currency} align="right" /></td>
        <td className={cn(cell, "text-center")}>
          {node.is_active ? <Check className="mx-auto size-4 text-green-01" /> : <span className="text-gray-05">-</span>}
        </td>
      </tr>
      {hasChildren && open && node.children.map((c) => (
        <AccountRow key={c.id} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} currency={currency} onSelect={onSelect} />
      ))}
    </>
  );
}

export function AccountsTab({ entity }: { entity: string }) {
  const { currency } = useActiveEntity();
  const { data, isLoading, isFetching, isError, refetch } = useGetChartOfAccountsQuery({ entity });
  const accounts = toArray<Account>(data?.data);

  const [view, setView] = useState<"tree" | "flat">("tree");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [touched, setTouched] = useState(false);
  const [creating, setCreating] = useState(false);
  const { can } = useCan();
  useActionParam("new", can(P.FIN_CREATE_ACCOUNT), () => setCreating(true));
  const [detailId, setDetailId] = useState<number | null>(null);

  // Default: expand every parent until the user starts toggling.
  const allParentIds = useMemo(() => new Set(accounts.filter((a) => !a.is_postable).map((a) => a.id)), [accounts]);
  const effectiveExpanded = touched ? expanded : allParentIds;
  const toggle = (id: number) => {
    const next = new Set(effectiveExpanded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setTouched(true);
    setExpanded(next);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((a) =>
      (!type || a.account_type === type) &&
      (!q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)),
    );
  }, [accounts, type, search]);

  const tree = useMemo(() => buildAccountTree(filtered), [filtered]);
  const flat = useMemo(
    () => filtered.slice().sort((a, b) => a.code.localeCompare(b.code))
      .map<Node>((a) => ({ ...a, children: [], rolled: a.balance?.kobo ?? 0 })),
    [filtered],
  );
  // Tree view only makes sense unfiltered; an active search/type filter falls back to flat.
  const rows = view === "tree" && !search && !type ? tree : flat;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code or name" className="h-9 max-w-xs font-mont text-sm" />
        <div className="flex rounded-md border border-white-02 p-0.5 font-mont text-xs">
          {(["tree", "flat"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={cn("rounded px-2.5 py-1 capitalize", view === v ? "bg-primary text-white" : "text-gray-05 hover:text-gray-01")}>
              {v}
            </button>
          ))}
        </div>
        <select value={type} onChange={(e) => setType(e.target.value)} className={selectCls} aria-label="Account type">
          <option value="">All types</option>
          {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
        </select>
        <Can permission={P.FIN_CREATE_ACCOUNT}>
          <Button onClick={() => setCreating(true)} className="ml-auto h-9 gap-1.5 font-mont text-xs font-semibold">
            <Plus className="size-3.5" /> New account
          </Button>
        </Can>
      </div>

      {isLoading || isFetching ? (
        <LoadingState rows={8} />
      ) : isError ? (
        <ErrorState onRetry={refetch} />
      ) : rows.length === 0 ? (
        <EmptyState title="No accounts" message="The chart of accounts will appear here." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-white-02 bg-white">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={headCls}>Account</th>
                <th className={headCls}>Type</th>
                <th className={headCls}>Subtype</th>
                <th className={headCls}>Normal</th>
                <th className={headCls}>Currency</th>
                <th className={cn(headCls, "text-right")}>Balance</th>
                <th className={cn(headCls, "text-center")}>Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((n) => (
                <AccountRow key={n.id} node={n} depth={0} expanded={effectiveExpanded} toggle={toggle} currency={currency} onSelect={setDetailId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateAccountDrawer open={creating} onClose={() => setCreating(false)} entity={entity} parents={accounts} />
      <AccountDetailDrawer key={detailId ?? "closed"} id={detailId} entity={entity} accounts={accounts} currency={currency} onClose={() => setDetailId(null)} />
    </div>
  );
}

function CreateAccountDrawer({ open, onClose, entity, parents }: {
  open: boolean; onClose: () => void; entity: string; parents: Account[];
}) {
  const [create, { isLoading }] = useCreateAccountMutation();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [subtype, setSubtype] = useState("");
  const [parent, setParent] = useState("");
  const [postable, setPostable] = useState(true);
  const [contra, setContra] = useState(false);
  const existingCodes = useMemo(() => new Set(parents.map((account) => account.code)), [parents]);
  const inferredType = accountTypeFromCode(code);
  const codeError = accountCodeError(code, existingCodes);
  const fieldsEnabled = isValidAccountCode(code, existingCodes);
  const canSubmit = fieldsEnabled && name.trim() !== "" && inferredType !== null;
  const parentOptions = accountsInCodeLine(parents, code)
    .map((account) => ({ value: String(account.id), label: `${account.code} - ${account.name}` }));

  const reset = () => { setCode(""); setName(""); setSubtype(""); setParent(""); setPostable(true); setContra(false); };
  const close = () => { reset(); onClose(); };
  const changeCode = (nextCode: string) => {
    if (accountTypeFromCode(nextCode) !== inferredType) setParent("");
    setCode(nextCode);
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      const r = await create({
        entity, code: code.trim(), name: name.trim(),
        subtype: subtype.trim() || undefined, parent: parent ? Number(parent) : undefined,
        is_postable: postable, is_contra: contra,
      }).unwrap();
      toast.success(r.message || "Account created.");
      close();
    } catch { /* central toast */ }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={(o) => (o ? undefined : close())}
      title="New account"
      description="Add a node to the chart of accounts."
      widthClass="sm:max-w-xl"
      footer={
        <>
          <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
          <Button disabled={isLoading || !canSubmit} onClick={submit} className="gap-1.5">
            <Plus className="size-4" />{isLoading ? "Saving…" : "Create account"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <label htmlFor="new-account-code" className="font-mont text-xs text-gray-05">Code *</label>
              <AccountCodeHint />
            </div>
            <Input
              id="new-account-code"
              value={code}
              onChange={(e) => changeCode(e.target.value)}
              className="bg-white font-mont"
              placeholder="e.g. 4200"
              inputMode="numeric"
              maxLength={ACCOUNT_CODE_LENGTH}
              pattern="[1-5][0-9]{3}"
              aria-invalid={!!codeError}
              aria-describedby={codeError ? "account-code-error" : undefined}
              autoFocus
            />
            {codeError && <p id="account-code-error" className="font-mont text-xs text-destructive">{codeError}</p>}
          </div>
          <FormField label="Account type" required>
            <select value={inferredType ?? ""} disabled className={cn(selectCls, "w-full disabled:bg-gray-02 disabled:text-gray-05")} aria-label="Account type determined by code">
              <option value="">Set automatically from code</option>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t[0] + t.slice(1).toLowerCase()}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} disabled={!fieldsEnabled} className="bg-white" placeholder={fieldsEnabled ? "e.g. Tuition revenue" : "Enter a valid code first"} /></FormField>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField label="Subtype"><Input value={subtype} onChange={(e) => setSubtype(e.target.value)} disabled={!fieldsEnabled} placeholder="e.g. Current asset" className="bg-white" /></FormField>
          <FormField label="Parent account">
            <SearchSelect
              options={parentOptions}
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              disabled={!fieldsEnabled}
              placeholder={inferredType ? `None (${inferredType.toLowerCase()} top level)` : "Enter a valid code first"}
              revealOnSearch
            />
          </FormField>
        </div>
        <div className="flex flex-wrap gap-5 rounded-md bg-gray-50 px-3 py-3 font-mont text-sm text-gray-01">
          <label className="flex items-center gap-2"><input type="checkbox" checked={postable} onChange={(e) => setPostable(e.target.checked)} disabled={!fieldsEnabled} className="accent-primary" /> Postable (accepts entries)</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={contra} onChange={(e) => setContra(e.target.checked)} disabled={!fieldsEnabled} className="accent-primary" /> Contra account</label>
        </div>
      </div>
    </DetailDrawer>
  );
}

function AccountCodeHint() {
  const lines = [
    ["1", "Assets"],
    ["2", "Liabilities"],
    ["3", "Equity"],
    ["4", "Income"],
    ["5", "Expenses"],
  ];

  return (
    <InfoHint ariaLabel="View account code rules">
      <div className="w-52">
        <p className="mb-1.5 font-semibold">Use exactly four digits.</p>
        <div className="grid grid-cols-[1rem_1fr] gap-x-2 gap-y-1">
          {lines.map(([prefix, label]) => (
            <div key={prefix} className="contents">
              <span className="font-semibold">{prefix}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </InfoHint>
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
  const { data, isLoading, isError, refetch } = useGetAccountDetailQuery(id ? { entity, id } : skipToken);
  const [tab, setTab] = useState<AccountDetailTabKey>("activity");
  const [groupView, setGroupView] = useState<"balances" | "activity" | null>(null);
  const d = data?.data;
  const acc = d?.account;
  const kids = id ? accounts.filter((a) => a.parent_id === id) : [];
  const availableTabKeys = getAccountDetailTabKeys(acc?.is_postable ?? true);
  const tabs = DRAWER_TABS.filter((candidate) => availableTabKeys.includes(candidate.key));
  const activeTab = availableTabKeys.includes(tab) ? tab : availableTabKeys[0];

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
          {/* KPI cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {acc.is_postable ? (
              <div className="rounded-md bg-white p-3 ring-1 ring-white-02">
                <p className="font-mont text-[11px] text-gray-05">Current balance</p>
                <p className="mt-1 font-mont text-base font-semibold tabular-nums"><Money kobo={d.summary.current_balance.kobo} currency={currency} /></p>
              </div>
            ) : (
              <button type="button" onClick={() => setGroupView("balances")}
                className="rounded-md bg-white p-3 text-left ring-1 ring-white-02 transition hover:bg-primary/5 hover:ring-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <p className="font-mont text-[11px] text-gray-05">Group balance</p>
                <p className="mt-1 font-mont text-base font-semibold tabular-nums"><Money kobo={d.summary.current_balance.kobo} currency={currency} /></p>
                <span className="mt-1 inline-flex items-center gap-0.5 font-mont text-[11px] font-semibold text-primary">View breakdown <ChevronRight className="size-3" /></span>
              </button>
            )}
            <div className="rounded-md bg-white p-3 ring-1 ring-white-02">
              <p className="font-mont text-[11px] text-gray-05">{acc.is_postable ? "Opening (FY carry-in)" : "Opening group balance"}</p>
              <p className="mt-1 font-mont text-base font-semibold tabular-nums"><Money kobo={d.summary.opening_balance.kobo} currency={currency} /></p>
            </div>
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
          <div className="flex max-w-full gap-1 overflow-x-auto border-b border-white-02">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)}
                className={cn("-mb-px inline-flex whitespace-nowrap items-center gap-1.5 border-b-2 px-3 py-2 font-mont text-xs font-semibold",
                  activeTab === t.key ? "border-primary text-primary" : "border-transparent text-gray-05 hover:text-gray-01")}>
                <t.icon className="size-3.5" />
                {t.label}{t.key === "subs" && kids.length ? ` (${kids.length})` : ""}
              </button>
            ))}
          </div>

          {activeTab === "activity" && (
            d.activity.length === 0 ? <EmptyState title="No postings" message="Posted journal lines hitting this account will appear here." /> : (
              <div className="overflow-x-auto rounded-md border border-white-02">
                <table className="w-full border-collapse">
                  <thead><tr>
                    <th className={th}>Date</th><th className={th}>Journal</th><th className={th}>Description</th>
                    <th className={th}>Cost centre</th><th className={cn(th, "text-right")}>Debit</th>
                    <th className={cn(th, "text-right")}>Credit</th><th className={cn(th, "text-right")}>Balance</th>
                  </tr></thead>
                  <tbody>
                    {d.activity.map((a, i) => (
                      <tr key={`${a.journal_no}-${i}`}>
                        <td className={cn(cell, "text-gray-05")}>{a.date}</td>
                        <td className={cn(cell, "font-semibold")}>{a.journal_no}</td>
                        <td className={cn(cell, "max-w-xs truncate")}>{a.description || "-"}</td>
                        <td className={cn(cell, "text-gray-05")}>{a.cost_center || "-"}</td>
                        <td className={cn(cell, "text-right tabular-nums")}>{a.debit.kobo ? <Money kobo={a.debit.kobo} currency={currency} align="right" /> : "-"}</td>
                        <td className={cn(cell, "text-right tabular-nums")}>{a.credit.kobo ? <Money kobo={a.credit.kobo} currency={currency} align="right" /> : "-"}</td>
                        <td className={cn(cell, "text-right font-medium tabular-nums")}><Money kobo={a.running_balance.kobo} currency={currency} align="right" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {activeTab === "taccount" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-white-02">
                <p className="border-b border-white-02 bg-[#F1F1F1] px-3 py-2 font-mont text-xs font-semibold">Debits</p>
                {d.activity.filter((a) => a.debit.kobo).map((a, i) => (
                  <div key={i} className="flex justify-between px-3 py-1.5 font-mont text-xs"><span className="truncate text-gray-05">{a.journal_no}</span><Money kobo={a.debit.kobo} currency={currency} /></div>
                ))}
              </div>
              <div className="rounded-md border border-white-02">
                <p className="border-b border-white-02 bg-[#F1F1F1] px-3 py-2 font-mont text-xs font-semibold">Credits</p>
                {d.activity.filter((a) => a.credit.kobo).map((a, i) => (
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
                    <StatusPill status={k.is_active ? "ACTIVE" : "INACTIVE"} />
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
  contribution: number;
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
    {
      header: "Account balance",
      align: "right",
      cell: ({ account: candidate }) => <Money kobo={candidate.balance?.kobo ?? 0} currency={currency} align="right" />,
    },
    {
      header: "Group contribution",
      align: "right",
      cell: (row) => <Money kobo={row.contribution} currency={currency} align="right" />,
    },
  ];
  const activityColumns: Column<ConsolidatedAccountActivityLine>[] = [
    { header: "Date", cell: (line) => <span className="whitespace-nowrap text-gray-05">{line.date}</span> },
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
        <div className="flex max-w-full overflow-x-auto rounded-md border border-white-02 p-0.5 font-mont text-xs">
          <button type="button" onClick={() => setView("balances")} aria-pressed={view === "balances"}
            className={cn("whitespace-nowrap rounded px-2.5 py-1.5 font-semibold", view === "balances" ? "bg-primary text-white" : "text-gray-05 hover:text-gray-01")}>
            Balance breakdown
          </button>
          <button type="button" onClick={() => setView("activity")} aria-pressed={view === "activity"}
            className={cn("whitespace-nowrap rounded px-2.5 py-1.5 font-semibold", view === "activity" ? "bg-primary text-white" : "text-gray-05 hover:text-gray-01")}>
            Consolidated activity
          </button>
        </div>
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
              <Input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setActivityPage(1); }} className="bg-white" />
            </FormField>
            <FormField label="To">
              <Input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setActivityPage(1); }} className="bg-white" />
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
                  <span className="shrink-0 text-xs text-gray-05">{line.date}</span>
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

function AccountSettings({ entity, account, onSaved }: { entity: string; account: Account; onSaved: () => void }) {
  const [update, { isLoading }] = useUpdateAccountMutation();
  const [name, setName] = useState(account.name);
  const [subtype, setSubtype] = useState(account.subtype ?? "");
  const [active, setActive] = useState(account.is_active);
  const dirty = name !== account.name || subtype !== (account.subtype ?? "") || active !== account.is_active;

  const save = async () => {
    try {
      const r = await update({ entity, id: account.id, name: name.trim(), subtype: subtype.trim(), is_active: active }).unwrap();
      toast.success(r.message || "Account updated.");
      onSaved();
    } catch { /* central */ }
  };

  return (
    <Can permission={P.FIN_UPDATE_ACCOUNT} fallback={<EmptyState title="Read-only" message="You don’t have permission to edit accounts." />}>
      <div className="space-y-3">
        <FormField label="Name" required><Input value={name} onChange={(e) => setName(e.target.value)} className="bg-white" /></FormField>
        <FormField label="Subtype"><Input value={subtype} onChange={(e) => setSubtype(e.target.value)} placeholder="e.g. Current asset" className="bg-white" /></FormField>
        <label className="flex items-center gap-2 font-mont text-sm text-gray-01"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active</label>
        <Button onClick={save} disabled={!dirty || isLoading} className="font-mont text-xs font-semibold">{isLoading ? "Saving…" : "Save changes"}</Button>
      </div>
    </Can>
  );
}
