import { useState, useMemo } from "react";
import { useNavigate } from "react-router";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomInput } from "@/components/custom/custom-input";
import {
  Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList, ComboboxEmpty,
} from "@/components/ui/combobox";
import PageAccessDenied from "@/components/custom/page-access-denied";
import { P } from "@/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";
import { routesPath } from "@/routes/routes-path";
import { useCreateImportTemplateMutation } from "@/redux/services/dashboard/import-api";
import { PageShell } from "@/components/layout/page-shell";
import type {
  CreateTemplatePayload,
  DatasetType,
  FileFormat,
  ImportTemplateColumn,
  TemplateColumnDataType,
  TemplateStatus,
} from "@/redux/services/dashboard/import-types";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";

const DATASET_TYPES: DatasetType[] = ["schools", "branches"];
const FILE_FORMATS: FileFormat[] = ["csv", "xlsx", "xls"];
const TEMPLATE_STATUSES: TemplateStatus[] = ["draft", "active", "retired"];
const COLUMN_DATA_TYPES: TemplateColumnDataType[] = [
  "string", "integer", "decimal", "date", "datetime", "email", "boolean", "choice",
];

type DraftColumn = Omit<Partial<ImportTemplateColumn>, "id" | "created_at" | "updated_at"> & {
  _tmpId: string;
};

const INITIAL_FORM = {
  code: "",
  name: "",
  dataset_type: "schools" as DatasetType,
  description: "",
  status: "draft" as TemplateStatus,
  default_file_format: "xlsx" as FileFormat,
  instructions: "",
  allow_sample_row: true,
  is_download_enabled: true,
};

const blankColumn = (order: number): DraftColumn => ({
  _tmpId: Math.random().toString(36).slice(2, 10),
  column_name: "",
  target_field: "",
  display_name: "",
  help_text: "",
  data_type: "string",
  is_required: false,
  is_unique: false,
  max_length: null,
  allowed_values: [],
  sample_value: "",
  default_value: "",
  column_order: order,
  reference_model: "",
  reference_lookup_field: "",
});

export default function NewTemplate() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(P.CREATE_IMPORT_TEMPLATE);

  const [createTemplate, { isLoading }] = useCreateImportTemplateMutation();

  const [form, setForm] = useState({
    code: "",
    name: "",
    dataset_type: "schools" as DatasetType,
    description: "",
    status: "draft" as TemplateStatus,
    default_file_format: "xlsx" as FileFormat,
    instructions: "",
    allow_sample_row: true,
    is_download_enabled: true,
  });
  const [columns, setColumns] = useState<DraftColumn[]>([blankColumn(1)]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isDirty = useMemo(() => {
    if (JSON.stringify(form) !== JSON.stringify(INITIAL_FORM)) return true;
    if (columns.length !== 1) return true;
    const c = columns[0];
    return !!(
      c.column_name?.trim() ||
      c.target_field?.trim() ||
      c.display_name?.trim() ||
      c.help_text?.trim() ||
      c.data_type !== "string" ||
      c.is_required ||
      c.is_unique ||
      (c.allowed_values?.length ?? 0) > 0 ||
      c.sample_value?.trim() ||
      c.default_value?.trim() ||
      c.reference_model?.trim() ||
      c.reference_lookup_field?.trim()
    );
  }, [form, columns]);

  const back = () => navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.INDEX);

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const setCol = (idx: number, patch: Partial<DraftColumn>) =>
    setColumns((arr) => arr.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  const addCol = () => setColumns((arr) => [...arr, blankColumn(arr.length + 1)]);
  const removeCol = (idx: number) =>
    setColumns((arr) => arr.filter((_, i) => i !== idx).map((c, i) => ({ ...c, column_order: i + 1 })));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "Required.";
    else if (!/^[a-z][a-z0-9_]*$/.test(form.code.trim())) e.code = "Lowercase letters, digits, underscores. Must start with a letter.";
    if (!form.name.trim()) e.name = "Required.";
    columns.forEach((c, i) => {
      if (!c.column_name?.trim()) e[`col_${i}_column_name`] = "Required.";
      if (!c.target_field?.trim()) e[`col_${i}_target_field`] = "Required.";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    const payload: CreateTemplatePayload = {
      ...form,
      code: form.code.trim(),
      name: form.name.trim(),
      columns: columns.map(({ _tmpId, ...rest }) => {
        void _tmpId;
        return {
          ...rest,
          column_name: rest.column_name?.trim() ?? "",
          target_field: rest.target_field?.trim() ?? "",
          display_name: rest.display_name?.trim() || (rest.column_name?.trim() ?? ""),
          allowed_values: Array.isArray(rest.allowed_values) ? rest.allowed_values : [],
        };
      }),
    };

    try {
      const result = await createTemplate(payload).unwrap();
      toast.success("Template created.");
      const newId = result?.data?.id;
      if (newId) {
        navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.VIEW(newId));
      } else {
        back();
      }
    } catch { /* interceptor shows the toast */ }
  };

  if (!canCreate) {
    return (
      <PageAccessDenied
        onBack={back}
        message="You don't have permission to create import templates."
      />
    );
  }

  return (
      <>
        <PageShell className="text-black-01 space-y-5 max-w-4xl pb-32" data-guide="data-import-templates.editor">
          {/* Header */}
          <div>
            <h1 className="text-lg font-semibold font-mont text-black-01">New Import Template</h1>
            <p className="text-xs text-gray-01 mt-0.5">
              Define a new system import template with its column structure.
            </p>
          </div>

          {/* Section 1: Identity */}
          <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-4")}>
            <p className="text-sm font-semibold font-mont border-b border-white-02 pb-3">Identity</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <CustomInput
                id="code" name="code" label="Code"
                placeholder="schools_master_v1"
                value={form.code}
                onChange={(e) => set("code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                error={errors.code}
              />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-black-01 font-mont">Dataset Type</label>
                <Combobox
                  value={form.dataset_type}
                  onValueChange={(v) => v && set("dataset_type", v as DatasetType)}
                  items={DATASET_TYPES}
                  filter={(item: string, q: string) => !q || item.includes(q.toLowerCase())}
                  itemToStringLabel={(item: string) => item}
                >
                  <ComboboxInput placeholder="Pick dataset" showTrigger className="h-10" />
                  <ComboboxContent>
                    <ComboboxList>
                      {DATASET_TYPES.map((d) => (
                        <ComboboxItem key={d} value={d} className="capitalize">{d}</ComboboxItem>
                      ))}
                      <ComboboxEmpty>No matches</ComboboxEmpty>
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            </div>

            <CustomInput
              id="name" name="name" label="Template Name"
              placeholder="Schools - Platform Onboarding"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              error={errors.name}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-black-01 font-mont">File Format</label>
                <Combobox
                  value={form.default_file_format}
                  onValueChange={(v) => v && set("default_file_format", v as FileFormat)}
                  items={FILE_FORMATS}
                  filter={(item: string, q: string) => !q || item.includes(q.toLowerCase())}
                  itemToStringLabel={(item: string) => item}
                >
                  <ComboboxInput placeholder="Pick format" showTrigger className="h-10" />
                  <ComboboxContent>
                    <ComboboxList>
                      {FILE_FORMATS.map((f) => (
                        <ComboboxItem key={f} value={f} className="uppercase">{f}</ComboboxItem>
                      ))}
                      <ComboboxEmpty>No matches</ComboboxEmpty>
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-black-01 font-mont">Status</label>
                <Combobox
                  value={form.status}
                  onValueChange={(v) => v && set("status", v as TemplateStatus)}
                  items={TEMPLATE_STATUSES}
                  filter={(item: string, q: string) => !q || item.includes(q.toLowerCase())}
                  itemToStringLabel={(item: string) => item}
                >
                  <ComboboxInput placeholder="Pick status" showTrigger className="h-10" />
                  <ComboboxContent>
                    <ComboboxList>
                      {TEMPLATE_STATUSES.map((s) => (
                        <ComboboxItem key={s} value={s} className="capitalize">{s}</ComboboxItem>
                      ))}
                      <ComboboxEmpty>No matches</ComboboxEmpty>
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
              </div>
            </div>
          </section>

          {/* Section 2: Description + Instructions */}
          <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-4")}>
            <p className="text-sm font-semibold font-mont border-b border-white-02 pb-3">Description & Instructions</p>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-black-01 font-mont">Description</label>
              <textarea
                rows={2}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                placeholder="What this template covers"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-black-01 font-mont">Instructions</label>
              <textarea
                rows={4}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                placeholder="Plain-language guidance shown to operators before download/upload."
                value={form.instructions}
                onChange={(e) => set("instructions", e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={form.allow_sample_row}
                  onChange={(e) => set("allow_sample_row", e.target.checked)}
                />
                Include sample row in generated file
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={form.is_download_enabled}
                  onChange={(e) => set("is_download_enabled", e.target.checked)}
                />
                Download enabled
              </label>
            </div>
          </section>

          {/* Section 3: Columns */}
          <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-4")}>
            <div className="flex items-center justify-between border-b border-white-02 pb-3">
              <p className="text-sm font-semibold font-mont">
                Columns <span className="text-gray-01 font-normal">({columns.length})</span>
              </p>
              <Button type="button" size="sm" variant="white" onClick={addCol}>
                <Plus className="size-3.5" /> Add Column
              </Button>
            </div>

            <div className="space-y-3">
              {columns.map((col, idx) => (
                <div key={col._tmpId} className="rounded-md border border-white-02 p-4 space-y-3 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-mont font-semibold text-gray-01">
                      Column #{col.column_order}
                    </p>
                    {columns.length > 1 && (
                      <button
                        type="button"
                        className="text-gray-400 hover:text-destructive transition-colors"
                        onClick={() => removeCol(idx)}
                        aria-label="Remove column"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <CustomInput
                      id={`col_name_${idx}`} name="col_name" label="Column Header"
                      placeholder="e.g. School Name"
                      value={col.column_name ?? ""}
                      onChange={(e) => setCol(idx, { column_name: e.target.value })}
                      error={errors[`col_${idx}_column_name`]}
                    />
                    <CustomInput
                      id={`col_target_${idx}`} name="col_target" label="Target Field"
                      placeholder="e.g. name"
                      value={col.target_field ?? ""}
                      onChange={(e) => setCol(idx, { target_field: e.target.value })}
                      error={errors[`col_${idx}_target_field`]}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <CustomInput
                      id={`col_display_${idx}`} name="col_display" label="Display Name (optional)"
                      value={col.display_name ?? ""}
                      onChange={(e) => setCol(idx, { display_name: e.target.value })}
                    />
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-medium text-black-01 font-mont">Data Type</label>
                      <Combobox
                        value={col.data_type ?? "string"}
                        onValueChange={(v) => v && setCol(idx, { data_type: v as TemplateColumnDataType })}
                        items={COLUMN_DATA_TYPES}
                        filter={(item: string, q: string) => !q || item.includes(q.toLowerCase())}
                        itemToStringLabel={(item: string) => item}
                      >
                        <ComboboxInput placeholder="Type" showTrigger className="h-10" />
                        <ComboboxContent>
                          <ComboboxList>
                            {COLUMN_DATA_TYPES.map((d) => (
                              <ComboboxItem key={d} value={d}>{d}</ComboboxItem>
                            ))}
                            <ComboboxEmpty>No matches</ComboboxEmpty>
                          </ComboboxList>
                        </ComboboxContent>
                      </Combobox>
                    </div>
                  </div>

                  {col.data_type === "choice" && (
                    <CustomInput
                      id={`col_choices_${idx}`} name="col_choices"
                      label="Allowed values (comma-separated)"
                      placeholder="active, suspended, closed"
                      value={(col.allowed_values ?? []).join(", ")}
                      onChange={(e) =>
                        setCol(idx, {
                          allowed_values: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <CustomInput
                      id={`col_ref_model_${idx}`} name="col_ref_model"
                      label="Reference Model (optional)"
                      placeholder="e.g. School"
                      value={col.reference_model ?? ""}
                      onChange={(e) => setCol(idx, { reference_model: e.target.value })}
                    />
                    <CustomInput
                      id={`col_ref_field_${idx}`} name="col_ref_field"
                      label="Reference Lookup Field"
                      placeholder="e.g. code"
                      value={col.reference_lookup_field ?? ""}
                      onChange={(e) => setCol(idx, { reference_lookup_field: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <CustomInput
                      id={`col_sample_${idx}`} name="col_sample"
                      label="Sample value"
                      value={col.sample_value ?? ""}
                      onChange={(e) => setCol(idx, { sample_value: e.target.value })}
                    />
                    <CustomInput
                      id={`col_default_${idx}`} name="col_default"
                      label="Default value"
                      value={col.default_value ?? ""}
                      onChange={(e) => setCol(idx, { default_value: e.target.value })}
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-black-01 font-mont">Help text</label>
                    <textarea
                      rows={2}
                      className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                      value={col.help_text ?? ""}
                      onChange={(e) => setCol(idx, { help_text: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center gap-5">
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={!!col.is_required}
                        onChange={(e) => setCol(idx, { is_required: e.target.checked })}
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={!!col.is_unique}
                        onChange={(e) => setCol(idx, { is_unique: e.target.checked })}
                      />
                      Unique
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </PageShell>

        {/* Sticky footer */}
        <div className="fixed bottom-0 right-0 left-0 md:left-(--sidebar-width) group-has-data-[collapsible=icon]/sidebar-wrapper:md:left-(--sidebar-width-icon) transition-[left] duration-200 ease-linear border-t border-white-02 bg-white px-4.5 py-3 flex justify-end gap-2 z-10">
          <Button type="button" variant="white" onClick={back} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={isLoading || !isDirty}>
            {isLoading ? "Creating…" : "Create Template"}
          </Button>
        </div>
      </>
  );
}
