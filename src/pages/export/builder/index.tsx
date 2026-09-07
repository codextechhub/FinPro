/**
 * The export builder - new export, and edit an existing one.
 *
 * FOUR steps, not the spec's five. Step 4 of the original design asked "when
 * should this run, and where should the file go?"; schedules are out of the MVP,
 * so the "when" half no longer exists and the "where" half is delivery, which
 * arrives with slice 4. Rather than ship a step that only says "Export Centre",
 * timing folds into the review step's two actions - save, or save and run. The
 * delivery step comes back when there is something to put in it.
 *
 * Step navigation is free: any step is clickable at any time, and blocking
 * validation lives on the review step rather than on the gates between steps.
 * Someone who wants to change one column should not have to walk the wizard.
 */

import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Play, Save } from "lucide-react";
import PageAccessDenied from "@/components/custom/page-access-denied";
import { WizardStepper } from "@/components/custom/import-wizard/wizard-steps";
import { CustomNativeSelect } from "@/components/custom/custom-native-select";
import { Segmented } from "@/components/finance-ui/segmented";
import { ErrorState, LoadingState } from "@/components/finance-ui/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import { P } from "@/permissions";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { routesPath } from "@/routes/routes-path";
import { apiErrorMessage } from "@/utils/api-errors";
import {
  useCreateExportDefinitionMutation,
  useGetExportCapabilitiesQuery,
  useGetExportCatalogueQuery,
  useGetExportDatasetQuery,
  useGetExportDefinitionQuery,
  useRunExportDefinitionMutation,
  useUpdateExportDefinitionMutation,
} from "@/redux/services/dashboard/exports-api";
import type { Dataset, ExportFormat, ValuesMode } from "@/redux/services/dashboard/exports-types";
import { ChoiceCard } from "./choice-card";
import { FieldPicker } from "./field-picker";
import { FilterEditor } from "./filter-editor";
import { filterIsSet } from "./helpers";
import { FormatOptions } from "./format-options";
import { SummaryBar, SummaryRail } from "./summary-rail";
import { type BuilderState, defaultsForDataset, useBuilderState, usePreview } from "./use-builder-state";
import { PageShell } from "@/components/layout/page-shell";

const STEP_LABELS = ["Data", "Columns", "File", "Review"];
const TOTAL_STEPS = 4;

/**
 * Loader. Its whole job is to have the saved export IN HAND before the form
 * mounts, so the form can seed its state from props rather than copy it in
 * through an effect afterwards - no cascading render, and no window in which
 * the builder is showing an empty form for an export that does exist.
 */
export default function ExportBuilderPage() {
  const { id } = useParams();
  const definitionId = id ? Number(id) : null;
  const isEdit = definitionId != null && Number.isFinite(definitionId);
  const { hasPermission } = usePermissions();
  const allowed = hasPermission(isEdit ? P.UPDATE_EXPORT : P.CREATE_EXPORT);

  const { data: existingRes, isLoading, isError, refetch } = useGetExportDefinitionQuery(
    definitionId as number,
    { skip: !isEdit || !allowed },
  );

  if (!allowed) return <PageAccessDenied />;

  if (isEdit && isLoading) {
    return (
      <PageShell>
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
          <LoadingState rows={6} label="Loading export…" />
        </div>
      </PageShell>
    );
  }
  if (isEdit && (isError || !existingRes)) {
    return (
      <PageShell>
        <div className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
          <ErrorState onRetry={refetch} />
        </div>
      </PageShell>
    );
  }

  const d = existingRes?.data;
  return (
    <BuilderForm
      // Remounts if the route moves to a different export, so state can never
      // leak from one definition to the next.
      key={definitionId ?? "new"}
      definitionId={isEdit ? (definitionId as number) : null}
      initial={
        d
          ? {
              name: d.name,
              description: d.description ?? "",
              datasetKey: d.dataset.id,
              entity: d.entity_code ?? "",
              columns: [...d.columns],
              filters: [...d.filters],
              format: d.format,
              formatOptions: { ...(d.format_options ?? {}) },
              valuesMode: d.values_mode,
              fileNamePattern: d.file_name_pattern,
            }
          : undefined
      }
    />
  );
}

function BuilderForm({
  definitionId,
  initial,
}: {
  definitionId: number | null;
  initial?: Partial<BuilderState>;
}) {
  const isEdit = definitionId != null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPermission } = usePermissions();
  const canRun = hasPermission(P.RUN_EXPORT);

  // The step lives in the URL so a review link survives a refresh, and so
  // "Duplicate" can open the builder straight on step 4.
  const step = Math.min(TOTAL_STEPS, Math.max(1, Number(searchParams.get("step")) || 1));
  const goStep = (next: number) =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("step", String(next));
        return p;
      },
      { replace: true },
    );

  const { state, patch } = useBuilderState(initial);

  const { data: catalogueRes, isLoading: catalogueLoading, isError: catalogueError, refetch } =
    useGetExportCatalogueQuery();
  const { data: capsRes } = useGetExportCapabilitiesQuery();
  const { data: datasetRes, isFetching: datasetLoading } = useGetExportDatasetQuery(state.datasetKey, {
    skip: !state.datasetKey,
  });

  const dataset: Dataset | undefined = datasetRes?.data;
  const modules = useMemo(() => catalogueRes?.data.modules ?? [], [catalogueRes]);
  const entities = capsRes?.data.allowed_entities ?? [];

  // Derived, not seeded by an effect: null means "the user has not chosen", so
  // the first available module answers until they do.
  const [chosenModule, setChosenModule] = useState<string | null>(null);
  const module =
    chosenModule ?? modules.find((m) => m.available)?.name ?? modules[0]?.name ?? "";

  // Picking a dataset resets everything downstream of it: its columns, filters
  // and format options belong to that dataset and nothing else.
  const chooseDataset = (next: Dataset) => {
    patch({
      datasetKey: next.id,
      ...defaultsForDataset(next),
      entity: next.requires_entity ? state.entity || entities[0]?.code || "" : "",
      fileNamePattern:
        state.fileNamePattern === "export-{date}" || !state.fileNamePattern
          ? `${next.id.split(".").pop()?.replace(/_/g, "-")}-{date}`
          : state.fileNamePattern,
    });
  };

  const { preview, recalculating, error: previewError } = usePreview({
    dataset,
    state,
    enabled: true,
  });

  // ── Validation ────────────────────────────────────────────────────────────
  // Blocking only. Warnings live on the estimate, where the number they are
  // about already is.
  const problems = useMemo(() => {
    const out: { step: number; message: string }[] = [];
    if (!state.datasetKey) out.push({ step: 1, message: "Choose a dataset." });
    if (dataset?.requires_entity && !state.entity)
      out.push({ step: 1, message: "Choose the entity this export reads." });
    if (!state.columns.length) out.push({ step: 2, message: "Choose at least one column." });
    if (dataset) {
      const withdrawn = state.columns.filter((c) => !dataset.fields.some((f) => f.id === c));
      if (withdrawn.length)
        out.push({
          step: 2,
          message: `${withdrawn.length} chosen column${withdrawn.length === 1 ? " is" : "s are"} no longer on this dataset. Remove ${withdrawn.length === 1 ? "it" : "them"}.`,
        });
      for (const f of dataset.filters.filter((f) => f.required)) {
        const spec = state.filters.find((s) => s.id === f.id);
        if (!filterIsSet(f, spec))
          out.push({ step: 2, message: `${f.label} must be set - this dataset requires it.` });
      }
    }
    if (!state.name.trim()) out.push({ step: 4, message: "Give this export a name." });
    return out;
  }, [state, dataset]);

  // Problems stay quiet until the person actually tries to save. A form nobody
  // has filled in yet is not "wrong". They then surface on the review step, in
  // words, each linking to the step that fixes it.
  const [attempted, setAttempted] = useState(false);

  // Moving ON from a step needs that step's own prerequisite. Picking a module
  // is not picking a dataset, and everything after step 1 is meaningless without
  // one - so Next stays disabled rather than leading somewhere empty. Step
  // navigation via the step bar is still free; this only gates the forward walk.
  const nextBlockedReason =
    step === 1 && !state.datasetKey
      ? "Choose a dataset first."
      : step === 1 && dataset?.requires_entity && !state.entity
        ? "Choose the entity this export reads."
        : step === 2 && !state.columns.length
          ? "Choose at least one column."
          : "";
  const canLeaveStep = !nextBlockedReason;

  const [createDefinition, { isLoading: creating }] = useCreateExportDefinitionMutation();
  const [updateDefinition, { isLoading: updating }] = useUpdateExportDefinitionMutation();
  const [runDefinition, { isLoading: running }] = useRunExportDefinitionMutation();
  const saving = creating || updating || running;

  const withdrawnColumns = dataset
    ? state.columns.filter((c) => !dataset.fields.some((f) => f.id === c))
    : [];
  const sensitiveChosen = dataset
    ? state.columns.filter((c) => dataset.fields.find((f) => f.id === c)?.sensitive)
    : [];

  const body = () => ({
    name: state.name.trim(),
    description: state.description.trim(),
    dataset_key: state.datasetKey,
    columns: state.columns,
    filters: state.filters,
    format: state.format,
    format_options: state.formatOptions,
    values_mode: state.valuesMode,
    file_name_pattern: state.fileNamePattern,
    ...(dataset?.requires_entity && state.entity ? { entity: state.entity } : {}),
  });

  const save = async (thenRun: boolean) => {
    setAttempted(true);
    if (problems.length) {
      goStep(problems[0].step);
      toast.error("Some details are still missing. They are marked on the step bar.");
      return;
    }
    try {
      const saved = isEdit
        ? await updateDefinition({ id: definitionId as number, body: body() }).unwrap()
        : await createDefinition(body()).unwrap();

      if (!thenRun) {
        toast.success(
          isEdit
            ? "Export saved. Files already produced are unchanged."
            : "Export saved. Run it whenever you need a file.",
        );
        navigate(routesPath.PROTECTED.EXPORT.SAVED);
        return;
      }

      const run = await runDefinition({
        id: saved.data.id,
        // Idempotency: a double-click inside 60 s returns the run already going
        // rather than queueing a second one.
        client_key: `${saved.data.id}-${Date.now()}`,
      }).unwrap();
      toast.success("Export queued. It will appear in Files when the file is ready.");
      navigate(routesPath.PROTECTED.EXPORT.RUN(run.data.id));
    } catch (e) {
      toast.error(apiErrorMessage(e, "That export could not be saved."));
    }
  };

  const loading = catalogueLoading;

  return (
    <PageShell className="text-black-01" data-guide="data-export-builder.workspace">
      <button
        type="button"
        onClick={() => navigate(routesPath.PROTECTED.EXPORT.SAVED)}
        className="inline-flex items-center gap-1.5 font-mont text-xs font-medium text-gray-05 hover:text-primary"
      >
        <ArrowLeft className="size-3.5" /> Exports
      </button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3" data-guide="data-export-builder.heading">
        <div className="min-w-0">
          <h1 className="font-mont text-lg font-semibold text-black-01">
            {isEdit ? "Edit export" : "New export"}
          </h1>
          <p className="mt-0.5 font-mont text-xs text-gray-01">
            {dataset ? `${dataset.module} · ${dataset.name}` : "Choose what to export, then how it should look."}
            {isEdit ? " · Editing changes future files only; files already produced are never altered." : ""}
          </p>
        </div>
      </div>

      <div className="mt-5" data-guide="data-export-builder.steps">
        <WizardStepper currentStep={step} labels={STEP_LABELS} />
      </div>

      {loading ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "mt-5 rounded-md")}>
          <LoadingState rows={6} label="Loading the catalogue…" />
        </div>
      ) : catalogueError ? (
        <div className={cn(INFORMATION_CARD_SURFACE, "mt-5 rounded-md")}>
          <ErrorState onRetry={refetch} />
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-5">
            {step === 1 && (
              <StepData
                modules={modules}
                module={module}
                onModule={setChosenModule}
                datasetKey={state.datasetKey}
                onDataset={chooseDataset}
                entities={entities}
                entity={state.entity}
                onEntity={(entity) => patch({ entity })}
                requiresEntity={!!dataset?.requires_entity}
              />
            )}

            {step === 2 && (
              <StepColumns
                dataset={dataset}
                loading={datasetLoading}
                columns={state.columns}
                onColumns={(columns) => patch({ columns })}
                filters={state.filters}
                onFilters={(filters) => patch({ filters })}
                withdrawn={withdrawnColumns}
                sensitiveChosen={sensitiveChosen}
              />
            )}

            {step === 3 && (
              <StepFile
                dataset={dataset}
                format={state.format}
                onFormat={(format) => {
                  const schema = dataset?.format_options?.[format] ?? {};
                  patch({
                    format,
                    formatOptions: Object.fromEntries(
                      Object.entries(schema).map(([k, o]) => [k, o.default]),
                    ),
                  });
                }}
                valuesMode={state.valuesMode}
                onValuesMode={(valuesMode) => patch({ valuesMode })}
                formatOptions={state.formatOptions}
                onFormatOptions={(formatOptions) => patch({ formatOptions })}
                fileNamePattern={state.fileNamePattern}
                onFileNamePattern={(fileNamePattern) => patch({ fileNamePattern })}
              />
            )}

            {step === 4 && (
              <StepReview
                state={state}
                dataset={dataset}
                preview={preview}
                problems={attempted ? problems : []}
                sensitiveChosen={sensitiveChosen}
                onName={(name) => patch({ name })}
                onDescription={(description) => patch({ description })}
                onEdit={goStep}
              />
            )}

            {/* Below xl the rail becomes this bar, so the figures never leave. */}
            <div className="xl:hidden">
              <SummaryBar
                name={state.name}
                columns={state.columns.length}
                preview={preview}
                recalculating={recalculating}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3" data-guide="data-export-builder.actions">
              <Button
                variant="ghost"
                disabled={step === 1}
                onClick={() => goStep(step - 1)}
                className="gap-1.5"
              >
                <ArrowLeft className="size-4" /> Back
              </Button>

              <div className="flex flex-wrap items-center gap-2">
                {step < TOTAL_STEPS ? (
                  <Button
                    onClick={() => goStep(step + 1)}
                    disabled={!canLeaveStep}
                    title={canLeaveStep ? undefined : nextBlockedReason}
                    className="gap-1.5"
                  >
                    Next <ArrowRight className="size-4" />
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="white"
                      onClick={() => save(false)}
                      loading={saving && !running}
                      loadingText="Saving…"
                      className="gap-1.5"
                    >
                      <Save className="size-4" /> Save without running
                    </Button>
                    <Button
                      size="lg"
                      onClick={() => save(true)}
                      loading={running}
                      loadingText="Queueing…"
                      disabled={!canRun || saving}
                      title={canRun ? undefined : "You do not have permission to run exports."}
                      className="gap-1.5"
                    >
                      <Play className="size-4" /> Save and run
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>

          <SummaryRail
            className="hidden xl:sticky xl:top-4 xl:block xl:h-fit"
            name={state.name}
            datasetName={dataset?.name ?? ""}
            scopeLabel={state.entity || (dataset ? "Whole organisation" : "")}
            columns={state.columns.length}
            format={state.format}
            preview={preview}
            recalculating={recalculating}
            error={previewError}
          />
        </div>
      )}
    </PageShell>
  );
}

// ── Step 1 · Data ────────────────────────────────────────────────────────────
function StepData({
  modules,
  module,
  onModule,
  datasetKey,
  onDataset,
  entities,
  entity,
  onEntity,
  requiresEntity,
}: {
  modules: { name: string; datasets: Dataset[]; available: boolean }[];
  module: string;
  onModule: (m: string) => void;
  datasetKey: string;
  onDataset: (d: Dataset) => void;
  entities: { id: number; code: string; name: string }[];
  entity: string;
  onEntity: (code: string) => void;
  requiresEntity: boolean;
}) {
  const current = modules.find((m) => m.name === module);
  const empty = modules.filter((m) => !m.available).map((m) => m.name);

  return (
    <section className={cn(INFORMATION_CARD_SURFACE, "space-y-5 rounded-md p-4")}>
      <div>
        <h2 className="font-mont text-base font-semibold text-black-01">Choose the data to export</h2>
        <p className="mt-1 font-mont text-xs leading-relaxed text-gray-01">
          Datasets are published by your administrators. You only see the ones you are allowed to
          export, in the entities you have access to.
        </p>
      </div>

      <div>
        <p className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">Module</p>
        <Segmented
          value={module}
          onChange={onModule}
          options={modules.map((m) => [m.name, m.name] as const)}
          isDisabled={(name) => !modules.find((m) => m.name === name)?.available}
        />
        {/* An empty module is information, not a gap to hide. */}
        {empty.length > 0 && (
          <p className="mt-2 font-mont text-[11px] leading-relaxed text-gray-05">
            {empty.join(" and ")} {empty.length === 1 ? "has" : "have"} no datasets published to the
            Export Centre yet. Your administrators publish them per module.
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">Dataset</p>
        <div className="space-y-2.5" role="radiogroup" aria-label="Dataset">
          {current?.datasets.length ? (
            current.datasets.map((d) => (
              <ChoiceCard
                key={d.id}
                title={d.name}
                tag={`${d.field_count} fields`}
                description={d.description}
                selected={datasetKey === d.id}
                onSelect={() => onDataset(d)}
              />
            ))
          ) : (
            <p className="rounded-md border border-dashed border-gray-02 px-3.5 py-6 text-center font-mont text-xs text-gray-05">
              Nothing is published for {module} yet.
            </p>
          )}
        </div>
      </div>

      {requiresEntity && (
        <div>
          <p className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">
            Entity scope
          </p>
          <CustomNativeSelect
            id="builder-entity"
            aria-label="Entity"
            placeholder="Choose an entity…"
            containerClass="w-full sm:w-72"
            options={entities.map((e) => ({ value: e.code, label: `${e.code} - ${e.name}` }))}
            value={entity}
            onChange={(e) => onEntity(e.target.value)}
          />
          <p className="mt-2 font-mont text-[11px] text-gray-05">
            {entities.length} {entities.length === 1 ? "entity is" : "entities are"} available to you.
            Data never crosses an entity boundary.
          </p>
        </div>
      )}
    </section>
  );
}

// ── Step 2 · Columns and filters ─────────────────────────────────────────────
function StepColumns({
  dataset,
  loading,
  columns,
  onColumns,
  filters,
  onFilters,
  withdrawn,
  sensitiveChosen,
}: {
  dataset: Dataset | undefined;
  loading: boolean;
  columns: string[];
  onColumns: (next: string[]) => void;
  filters: import("@/redux/services/dashboard/exports-types").FilterSpec[];
  onFilters: (next: import("@/redux/services/dashboard/exports-types").FilterSpec[]) => void;
  withdrawn: string[];
  sensitiveChosen: string[];
}) {
  if (loading || !dataset) {
    return (
      <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md")}>
        <LoadingState rows={5} columns={2} label="Loading fields…" />
      </section>
    );
  }

  return (
    <section className={cn(INFORMATION_CARD_SURFACE, "space-y-5 rounded-md p-4")}>
      <div>
        <h2 className="font-mont text-base font-semibold text-black-01">Choose columns and filters</h2>
        <p className="mt-1 font-mont text-xs leading-relaxed text-gray-01">
          The estimate updates as you go, with the number of rows this will produce and how big the
          file will be.
        </p>
      </div>

      <FieldPicker
        fields={dataset.fields}
        selected={columns}
        onChange={onColumns}
        withdrawn={withdrawn}
      />

      {/* Sensitive columns are called out here AND again at review, because
          including one is recorded against the person's name. */}
      {sensitiveChosen.length > 0 && (
        <div className="rounded-md border-l-[3px] border-yellow-01 bg-yellow-01/10 px-4 py-3">
          <p className="font-mont text-sm font-semibold text-yellow-01-text">
            {sensitiveChosen.length === 1 ? "One column is" : `${sensitiveChosen.length} columns are`}{" "}
            marked sensitive
          </p>
          <p className="mt-1 font-mont text-xs leading-relaxed text-gray-01">
            {sensitiveChosen
              .map((id) => dataset.fields.find((f) => f.id === id)?.label ?? id)
              .join(", ")}{" "}
            {sensitiveChosen.length === 1 ? "is" : "are"} restricted by your administrators. Including{" "}
            {sensitiveChosen.length === 1 ? "it" : "them"} is recorded in the audit log against your
            name.
          </p>
        </div>
      )}

      <div>
        <p className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">Filters</p>
        <FilterEditor
          filters={dataset.filters}
          value={filters}
          onChange={onFilters}
          maxDateSpanDays={dataset.max_date_span_days}
        />
      </div>
    </section>
  );
}

// ── Step 3 · File ────────────────────────────────────────────────────────────
function StepFile({
  dataset,
  format,
  onFormat,
  valuesMode,
  onValuesMode,
  formatOptions,
  onFormatOptions,
  fileNamePattern,
  onFileNamePattern,
}: {
  dataset: Dataset | undefined;
  format: ExportFormat;
  onFormat: (f: ExportFormat) => void;
  valuesMode: ValuesMode;
  onValuesMode: (v: ValuesMode) => void;
  formatOptions: Record<string, unknown>;
  onFormatOptions: (next: Record<string, unknown>) => void;
  fileNamePattern: string;
  onFileNamePattern: (next: string) => void;
}) {
  const FORMAT_COPY: Record<string, { title: string; description: string }> = {
    xlsx: {
      title: "Excel (.xlsx)",
      description: "Best for reading, filtering and sharing. Keeps column widths and a frozen header row.",
    },
    csv: {
      title: "CSV (.csv)",
      description: "Best for loading into another system. No formatting, no second sheet.",
    },
  };

  const today = new Date();
  const rendered =
    fileNamePattern
      .replace("{date}", today.toISOString().slice(0, 10))
      .replace("{datetime}", `${today.toISOString().slice(0, 10)}-${String(today.getHours()).padStart(2, "0")}${String(today.getMinutes()).padStart(2, "0")}`)
      .replace("{entity}", "entity")
      .replace("{run}", "1") + `.${format}`;

  return (
    <section className={cn(INFORMATION_CARD_SURFACE, "space-y-5 rounded-md p-4")}>
      <div>
        <h2 className="font-mont text-base font-semibold text-black-01">Configure the file</h2>
        <p className="mt-1 font-mont text-xs leading-relaxed text-gray-01">
          Options change with the format, because not every format can do every thing.
        </p>
      </div>

      <div>
        <p className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">Format</p>
        <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Format">
          {(["xlsx", "csv"] as const).map((f) => {
            const supported = dataset?.supported_formats.includes(f) ?? true;
            return (
              <ChoiceCard
                key={f}
                title={FORMAT_COPY[f].title}
                description={FORMAT_COPY[f].description}
                selected={format === f}
                disabled={!supported}
                disabledReason={
                  supported ? undefined : `${dataset?.name} cannot be produced as ${f.toUpperCase()}.`
                }
                onSelect={() => onFormat(f)}
              />
            );
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">
          What should the values look like?
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Values mode">
          <ChoiceCard
            title="For people to read"
            description="Dates as 26 Jul 2026, amounts as ₦1,240,000.00, statuses as their labels."
            selected={valuesMode === "people"}
            onSelect={() => onValuesMode("people")}
          />
          <ChoiceCard
            title="For another system to import"
            description="Dates as 2026-07-26, amounts as 1240000.00 with no symbol, statuses as their codes."
            selected={valuesMode === "system"}
            onSelect={() => onValuesMode("system")}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">
          {format === "xlsx" ? "Excel options" : "CSV options"}
        </p>
        <FormatOptions
          schema={dataset?.format_options?.[format] ?? {}}
          value={formatOptions}
          onChange={onFormatOptions}
        />
      </div>

      <div>
        <p className="mb-2 font-mont text-[11px] uppercase tracking-widest text-gray-05">File name</p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={fileNamePattern}
            onChange={(e) => onFileNamePattern(e.target.value)}
            aria-label="File name pattern"
            className="h-9 w-full bg-white font-geist-mono text-sm sm:w-80"
          />
          <span className="font-geist-mono text-sm text-gray-05">.{format}</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {["{date}", "{datetime}", "{entity}", "{run}"].map((token) => (
            <button
              key={token}
              type="button"
              onClick={() => onFileNamePattern(`${fileNamePattern}${token}`)}
              className="rounded border border-white-02 px-1.5 py-0.5 font-geist-mono text-[11px] text-gray-05 hover:border-primary hover:text-primary"
            >
              {token}
            </button>
          ))}
        </div>
        <p className="mt-2 font-geist-mono text-[11px] tabular-nums text-gray-05">
          Today this produces {rendered}
        </p>
      </div>
    </section>
  );
}

// ── Step 4 · Review ──────────────────────────────────────────────────────────
function StepReview({
  state,
  dataset,
  preview,
  problems,
  sensitiveChosen,
  onName,
  onDescription,
  onEdit,
}: {
  state: ReturnType<typeof useBuilderState>["state"];
  dataset: Dataset | undefined;
  preview: import("@/redux/services/dashboard/exports-types").PreviewResult | null;
  problems: { step: number; message: string }[];
  sensitiveChosen: string[];
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onEdit: (step: number) => void;
}) {
  const label = (id: string) => dataset?.fields.find((f) => f.id === id)?.label ?? id;

  const rows: { k: string; v: React.ReactNode; step: number }[] = [
    { k: "Dataset", v: dataset?.name ?? "-", step: 1 },
    { k: "Scope", v: state.entity || "Whole organisation", step: 1 },
    { k: "Columns", v: state.columns.map(label).join(", ") || "None", step: 2 },
    {
      k: "Filters",
      v: dataset
        ? state.filters
            .map((s) => dataset.filters.find((f) => f.id === s.id)?.label ?? s.id)
            .join("; ") || "None"
        : "-",
      step: 2,
    },
    {
      k: "Format",
      v: `${state.format.toUpperCase()}, ${state.valuesMode === "system" ? "values for systems" : "values for people"}`,
      step: 3,
    },
    { k: "File name", v: `${state.fileNamePattern}.${state.format}`, step: 3 },
    { k: "Availability", v: "Each file can be downloaded for 30 days, then expires", step: 3 },
  ];

  return (
    <section className={cn(INFORMATION_CARD_SURFACE, "space-y-5 rounded-md p-4")}>
      <div>
        <h2 className="font-mont text-base font-semibold text-black-01">Review</h2>
        {preview?.reads_as && (
          <p className="mt-1.5 font-mont text-sm leading-relaxed text-gray-01">{preview.reads_as}</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block font-mont text-[11px] text-gray-05">
            Name<span className="text-destructive"> *</span>
          </span>
          <Input
            value={state.name}
            onChange={(e) => onName(e.target.value)}
            placeholder="e.g. Customer invoices - monthly"
            aria-invalid={!state.name.trim()}
            className="h-9 bg-white"
          />
        </label>
        <label className="block">
          <span className="mb-1 block font-mont text-[11px] text-gray-05">Description</span>
          <Input
            value={state.description}
            onChange={(e) => onDescription(e.target.value)}
            placeholder="What this export is for"
            className="h-9 bg-white"
          />
        </label>
      </div>

      {/* Blocking problems, each pointing at the step that fixes it. */}
      {problems.length > 0 && (
        <div className="rounded-md border-l-[3px] border-destructive bg-destructive/10 px-4 py-3">
          <p className="font-mont text-sm font-semibold text-error-text">
            {problems.length === 1
              ? "One thing is missing before this can be saved"
              : `${problems.length} things are missing before this can be saved`}
          </p>
          <ul className="mt-1.5 space-y-1">
            {problems.map((p, i) => (
              <li key={i} className="font-mont text-xs leading-relaxed text-gray-01">
                {p.message}{" "}
                <button
                  type="button"
                  onClick={() => onEdit(p.step)}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  Fix on step {p.step}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sensitiveChosen.length > 0 && (
        <div className="rounded-md border-l-[3px] border-yellow-01 bg-yellow-01/10 px-4 py-3">
          <p className="font-mont text-sm font-semibold text-yellow-01-text">
            This export includes restricted columns
          </p>
          <p className="mt-1 font-mont text-xs leading-relaxed text-gray-01">
            {sensitiveChosen.map(label).join(" and ")}{" "}
            {sensitiveChosen.length === 1 ? "is" : "are"} marked sensitive. Including{" "}
            {sensitiveChosen.length === 1 ? "it" : "them"} is recorded in the audit log against your
            name.
          </p>
        </div>
      )}

      <div className="divide-y divide-white-02 rounded-md border border-white-02">
        {rows.map((r) => (
          <div key={r.k} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3.5 py-2.5">
            <span className="w-24 shrink-0 font-mont text-[11px] text-gray-05">{r.k}</span>
            <span className="min-w-0 flex-1 font-mont text-sm text-black-01">{r.v}</span>
            <button
              type="button"
              onClick={() => onEdit(r.step)}
              className="shrink-0 font-mont text-xs font-medium text-primary hover:underline"
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      {/* Sharing is out of the MVP, so the promise this makes is only about the
          owner: an export is yours, and every download is re-authorised against
          whoever clicks it. */}
      <p className={cn("font-mont text-xs leading-relaxed text-gray-01")}>
        This export runs as you, so it shows the data your access allows. Access is checked again
        every time it runs and every time a file is downloaded.
      </p>
    </section>
  );
}
