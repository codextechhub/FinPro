// Procurement → Inventory → Locations. The places stock physically sits.
//
// Low-traffic admin: a school sets its stores up once and rarely returns. The screen
// exists because stock is now held per location, and because a two-campus school
// migrated onto a single `MAIN` store needs somewhere to create the other one.
//
// There is deliberately no Transfer button. Moving stock between locations today is
// an issue at the source and a receipt at the destination, and the receipt re-prices
// the stock rather than carrying its cost across. A single transfer document is a
// recorded gap in the backend and will arrive with its own endpoint.
import { useMemo, useState } from "react";
import { skipToken } from "@reduxjs/toolkit/query";
import { useActionParam } from "@/hooks/use-action-param";
import { toast } from "sonner";
import { ChevronRight, FilePenLine, Plus, Star } from "lucide-react";

import {
  DataTable, DetailDrawer, FormDrawer, FormField, LoadingState, Money, StatusPill,
  toArray, type Column,
} from "@/components/finance-ui";
import { Can, useCan } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { P } from "@/permissions";
import {
  useCreateStockLocationMutation, useGetStockBalancesQuery, useGetStockLocationsQuery,
  useUpdateStockLocationMutation,
} from "@/redux/services/procurement/procurement-ext-api";
import type { StockBalance, StockLocation } from "@/redux/services/procurement/procurement-types";
import { useBranches } from "../../host";
import { apiFieldError } from "@/utils/api-errors";
import { ProcurementShell } from "./procurement-shell";
import { EmptyPanel, Field } from "./sourcing/shared";
import { isForbidden, shortDate } from "./sourcing/helpers";
import { PageShell } from "@/components/layout/page-shell";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";

const fmtQty = (value?: string | null) => {
  const n = Number(value);
  return (Number.isFinite(n) ? n : 0).toLocaleString(undefined, { maximumFractionDigits: 4 });
};

export function LocationsSection({ entity, currency }: { entity: string; currency?: string | null }) {
  const { can } = useCan();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<StockLocation | null>(null);
  const [balancesFor, setBalancesFor] = useState<StockLocation | null>(null);
  useActionParam("new", () => setCreating(true));

  // Every location, active and archived: this is the screen that manages them, so
  // unlike useStockLocations it must not hide the ones it exists to reactivate.
  const { currentData: data, isLoading, isFetching, isError, error, refetch } =
    useGetStockLocationsQuery({ entity, page });
  const rows = toArray(data?.data);
  const [update, { isLoading: updating }] = useUpdateStockLocationMutation();

  const total = data?.pagination?.totalItems ?? rows.length;
  // A school already running two branches came through the migration with every
  // item sitting at one store. Nothing can move it automatically - the remedy is
  // operational - so say so where they can act on it.
  const singleStore = !isLoading && !isError && total === 1;

  const act = async (location: StockLocation, body: { is_default?: boolean; is_active?: boolean }) => {
    try {
      const r = await update({ id: location.id, entity, ...body }).unwrap();
      toast.success(r.message || "Stock location updated.");
    } catch (e) {
      // The server refuses deactivating a location that still holds stock. The
      // central handler has already said why; take them to what is in it, which is
      // the thing they have to deal with before the refusal goes away.
      if (apiFieldError(e, "is_active")?.includes("still holds stock")) setBalancesFor(location);
    }
  };

  const columns: Column<StockLocation>[] = [
    {
      header: "Location",
      cell: (l) => <div className="min-w-40"><p className="font-semibold">{l.name}</p><p className="mt-0.5 font-mont text-xs text-gray-05">{l.code}</p></div>,
    },
    { header: "Branch", cell: (l) => l.branch_name || <span className="text-gray-05">Entity-wide</span> },
    { header: "Default", cell: (l) => (l.is_default ? <StatusPill status="DEFAULT" /> : <span className="text-gray-05">-</span>) },
    { header: "Status", cell: (l) => <StatusPill status={l.is_active ? "ACTIVE" : "INACTIVE"} /> },
    { header: "Created", cell: (l) => shortDate(l.created_at) },
    {
      header: "",
      align: "right",
      cell: (l) => (can(P.PROC_MANAGE_STOCK) ? (
        <div className="flex flex-wrap items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="outline" onClick={() => setEditing(l)}><FilePenLine className="size-3.5" /> Edit</Button>
          {/* Exactly one default per entity, so this moves the flag rather than
              setting an independent one - an action, never a free checkbox. */}
          {!l.is_default && l.is_active && (
            <Button size="sm" variant="outline" disabled={updating} onClick={() => act(l, { is_default: true })}><Star className="size-3.5" /> Make default</Button>
          )}
          {l.is_active
            ? <Button size="sm" variant="outline-dest" disabled={updating || l.is_default} title={l.is_default ? "The default location cannot be deactivated. Make another location the default first." : undefined} onClick={() => act(l, { is_active: false })}>Deactivate</Button>
            : <Button size="sm" variant="outline" disabled={updating} onClick={() => act(l, { is_active: true })}>Activate</Button>}
        </div>
      ) : <ChevronRight className="ml-auto size-4 text-gray-04" />),
    },
  ];

  return (
    <ProcurementShell>
      <PageShell className="space-y-5 text-black-01">
        <header data-guide="procurement-stock-locations.heading" className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-mont text-lg font-semibold text-gray-01">Stock Locations</h1>
            <p className="mt-0.5 font-mont text-xs text-gray-05">The stores stock is held in. Each holds its own quantity, value and average cost.</p>
          </div>
          <Can permission={P.PROC_MANAGE_STOCK}><Button onClick={() => setCreating(true)}><Plus className="size-4" /> New location</Button></Can>
        </header>

        {singleStore && (
          <section className="rounded-md border border-primary/20 bg-primary/5 p-4">
            <p className="font-mont text-sm font-semibold text-gray-01">All your stock is currently at {rows[0]?.code}.</p>
            <p className="mt-1 font-mont text-xs leading-5 text-gray-05">
              If you keep goods in more than one place, create your other stores here, then move the opening balances across by issuing from {rows[0]?.code} and receiving into the new store. Until then every movement is recorded against {rows[0]?.code}.
            </p>
          </section>
        )}

        <section data-guide="procurement-stock-locations.list" className={cn(INFORMATION_CARD_SURFACE, "min-w-0 rounded-md")}>
          <DataTable
            columns={columns} rows={rows} rowKey={(l) => l.id}
            loading={isLoading || isFetching} error={isError} forbidden={isForbidden(error)} onRetry={refetch}
            onRowClick={(l) => setBalancesFor(l)}
            page={data?.pagination?.currentPage} totalPages={data?.pagination?.totalPages} onPageChange={setPage}
            emptyTitle="No stock locations"
            emptyMessage="Every entity is provisioned with one. If you are seeing this, create a store before moving stock."
          />
        </section>
      </PageShell>

      {creating && <LocationForm entity={entity} isFirst={total === 0} onClose={() => setCreating(false)} />}
      {editing && <LocationForm entity={entity} initial={editing} isFirst={false} onClose={() => setEditing(null)} />}
      <LocationBalancesDrawer
        key={balancesFor?.id ?? "closed"}
        location={balancesFor} entity={entity} currency={currency}
        onClose={() => setBalancesFor(null)}
      />
    </ProcurementShell>
  );
}

// ── Create / edit ────────────────────────────────────────────────────────────
function LocationForm({ entity, initial, isFirst, onClose }: {
  entity: string; initial?: StockLocation; isFirst: boolean; onClose: () => void;
}) {
  const [code, setCode] = useState(initial?.code || "");
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [branch, setBranch] = useState(initial?.branch_id ? String(initial.branch_id) : "");
  const [makeDefault, setMakeDefault] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [create, { isLoading: creating }] = useCreateStockLocationMutation();
  const [update, { isLoading: updating }] = useUpdateStockLocationMutation();
  const saving = creating || updating;

  // Branches live behind school management, which a stock manager may not hold.
  // When we cannot read them the field is simply absent and the store is
  // entity-wide, which is a valid answer rather than missing data.
  const branchQ = useBranches();
  const branches = useMemo(() => toArray(branchQ.data), [branchQ.data]);
  const branchesReadable = !branchQ.isError && (branchQ.isLoading || branches.length > 0);

  const dirty = !initial
    || name !== initial.name
    || description !== (initial.description || "")
    || branch !== (initial.branch_id ? String(initial.branch_id) : "")
    || makeDefault;
  const canSubmit = !!name.trim() && (!!initial || !!code.trim()) && dirty;

  const save = async () => {
    if (!canSubmit) return;
    try {
      if (initial) {
        const r = await update({
          id: initial.id, entity,
          name: name.trim(), description: description.trim(),
          branch: branch ? Number(branch) : null,
          // Only ever sent as true - the flag moves, it is never cleared directly.
          ...(makeDefault ? { is_default: true } : {}),
        }).unwrap();
        toast.success(r.message || "Stock location updated.");
      } else {
        const r = await create({
          entity, code: code.trim().toUpperCase(), name: name.trim(),
          description: description.trim() || undefined,
          ...(branch ? { branch: Number(branch) } : {}),
          // The server forces the first location to be the default; sending it
          // explicitly for a later one is what moves the flag.
          ...(makeDefault || isFirst ? { is_default: true } : {}),
        }).unwrap();
        toast.success(r.message || "Stock location created.");
      }
      onClose();
    } catch (e) {
      const field = apiFieldError(e, "code");
      if (field) setCodeError(field);
    }
  };

  return (
    <FormDrawer
      open onOpenChange={(o) => !saving && !o && onClose()}
      title={initial ? "Edit stock location" : "New stock location"}
      description={initial ? "Update this store. Its code cannot be changed." : "A store stock is held in. Leave the campus blank for an entity-wide store."}
      widthClass="sm:max-w-lg" onSubmit={save} submitText={initial ? "Save changes" : "Create"}
      loading={saving} canSubmit={canSubmit}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FormField label="Code" required={!initial}>
          <Input
            value={code} disabled={!!initial} maxLength={20}
            onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(""); }}
            aria-invalid={!!codeError}
            className="bg-white font-mont uppercase"
            placeholder="ANNEX"
          />
          {codeError && <p role="alert" className="mt-1 font-mont text-[11px] font-medium text-red-600">{codeError}</p>}
        </FormField>
        <FormField label="Name" required>
          <Input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} className="bg-white" placeholder="Annex store" />
        </FormField>
      </div>
      {branchesReadable && (
        <FormField label="Branch">
          <NativeSelect value={branch} disabled={branchQ.isLoading} onChange={(e) => setBranch(e.target.value)}>
            <option value="">Entity-wide</option>
            {branches.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
          </NativeSelect>
          <span className="mt-1 block font-mont text-[11px] leading-5 text-gray-05">Goods received at this branch land in this store by default.</span>
        </FormField>
      )}
      <FormField label="Description">
        <Input value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} className="bg-white" />
      </FormField>
      {isFirst ? (
        <p className="font-mont text-[11px] leading-5 text-gray-05">The first store an entity has is always its default.</p>
      ) : (
        <label className="flex cursor-pointer items-start gap-2 font-mont text-xs text-gray-01">
          <input type="checkbox" className="mt-0.5" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} />
          <span>Make this the default store<span className="mt-0.5 block font-normal text-gray-05">Movements that do not name a store use the default. Exactly one store is the default, so this moves the flag off the current one.</span></span>
        </label>
      )}
    </FormDrawer>
  );
}

// ── One location's balances ──────────────────────────────────────────────────
function LocationBalancesDrawer({ location, entity, currency, onClose }: {
  location: StockLocation | null; entity: string; currency?: string | null; onClose: () => void;
}) {
  // skipToken rather than `skip`: the argument expression is evaluated whether or
  // not the query runs, so reading `location.id` off a closed drawer threw before
  // the skip could matter.
  const { data, isLoading } = useGetStockBalancesQuery(
    // held_only: a store's page is about what is in it, not about every item that
    // has ever been zero there.
    location ? { entity, location: location.id, held_only: "true", page_size: 100 } : skipToken,
  );
  const rows = toArray(data?.data);
  const totalValue = rows.reduce((sum, row) => sum + row.stock_value, 0);

  return (
    <DetailDrawer
      open={!!location} onOpenChange={(o) => !o && onClose()}
      title={location ? location.name : "Stock location"}
      description={location ? `${location.code}${location.branch_name ? ` · ${location.branch_name}` : " · Entity-wide"}` : ""}
      widthClass="sm:max-w-2xl"
    >
      {!location ? null : (
        <div className="space-y-5">
          <dl className="grid grid-cols-1 gap-4 rounded-md border border-white-02 p-4 sm:grid-cols-2">
            <Field label="Code" value={location.code} />
            <Field label="Branch" value={location.branch_name || "Entity-wide"} />
            <Field label="Default" value={location.is_default ? "Yes" : "No"} />
            <Field label="Status" value={location.is_active ? "Active" : "Inactive"} />
            <Field label="Description" value={location.description || "-"} />
            <Field label="Value held" value={<Money kobo={totalValue} currency={currency} />} />
          </dl>
          {isLoading ? <LoadingState rows={5} /> : rows.length ? <BalancesTable rows={rows} currency={currency} /> : (
            <EmptyPanel>Nothing is held at this location. It can be deactivated.</EmptyPanel>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}

export function BalancesTable({ rows, currency, showItem = true, showLocation = false }: {
  rows: StockBalance[]; currency?: string | null; showItem?: boolean; showLocation?: boolean;
}) {
  const heads = [
    ...(showLocation ? ["Location"] : []),
    ...(showItem ? ["Item"] : []),
    "On hand", "Unit cost", "Value",
  ];
  return (
    <div className="overflow-x-auto rounded-md border border-white-02">
      <table className="w-full min-w-[480px]">
        <thead><tr>{heads.map((h) => <th key={h} className="bg-[#F1F1F1] px-3 py-2 text-left font-mont text-[11px] font-semibold text-gray-01">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.id}>
            {showLocation && <td className="border-t border-white-02 px-3 py-2 font-mont text-xs font-semibold">{row.location_code || "-"}</td>}
            {showItem && <td className="border-t border-white-02 px-3 py-2"><p className="font-mont text-xs font-semibold">{row.stock_item_name || row.stock_item_code}</p><p className="font-mont text-[11px] text-gray-05">{row.stock_item_code}</p></td>}
            <td className="border-t border-white-02 px-3 py-2 text-right font-mont text-xs tabular-nums">{fmtQty(row.on_hand_qty)}</td>
            <td className="border-t border-white-02 px-3 py-2 text-right"><Money kobo={row.unit_cost} currency={currency} align="right" /></td>
            <td className="border-t border-white-02 px-3 py-2 text-right"><Money kobo={row.stock_value} currency={currency} align="right" /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
