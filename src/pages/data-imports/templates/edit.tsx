import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageAccessDenied from "@/components/custom/page-access-denied";
import { useDashboardBack } from "@/components/layout/dashboard-header";
import { CustomInput } from "@/components/custom/custom-input";
import {
  Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList, ComboboxEmpty,
} from "@/components/ui/combobox";
import { P } from "@/permissions";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { INFORMATION_CARD_SURFACE } from "@/components/ui/card-surface";
import { routesPath } from "@/routes/routes-path";
import { PageShell } from "@/components/layout/page-shell";
import {
  useGetImportTemplateQuery,
  useUpdateImportTemplateMutation,
} from "@/redux/services/dashboard/import-api";
import type {
  FileFormat,
  ImportTemplate,
  ImportTemplateColumn,
  TemplateColumnDataType,
  TemplateStatus,
  UpdateTemplatePayload,
} from "@/redux/services/dashboard/import-types";

const FILE_FORMATS: FileFormat[] = ["csv", "xlsx", "xls"];
const TEMPLATE_STATUSES: TemplateStatus[] = ["draft", "active", "retired"];
const COLUMN_DATA_TYPES: TemplateColumnDataType[] = [
  "string", "integer", "decimal", "date", "datetime", "email", "boolean", "choice",
];

type DraftColumn = Omit<Partial<ImportTemplateColumn>, "id" | "created_at" | "updated_at"> & {
  _tmpId: string;
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

const fromExisting = (col: ImportTemplateColumn): DraftColumn => ({
  _tmpId: String(col.id),
  column_name: col.column_name,
  target_field: col.target_field,
  display_name: col.display_name,
  help_text: col.help_text,
  data_type: col.data_type,
  is_required: col.is_required,
  is_unique: col.is_unique,
  max_length: col.max_length,
  allowed_values: col.allowed_values ?? [],
  sample_value: col.sample_value,
  default_value: col.default_value,
  column_order: col.column_order,
  reference_model: col.reference_model,
  reference_lookup_field: col.reference_lookup_field,
});

const unwrap = <T,>(res: { data: T } | T | undefined): T | undefined => {
  if (!res) return undefined;
  return (res as { data: T }).data ?? (res as T);
};

export default function EditTemplate() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { id } = useParams<{ id: string }>();
  const templateId = Number(id);

  const canEdit = hasPermission(P.MANAGE_IMPORT_TEMPLATES);

  const { data: raw, isLoading: fetching, isError: fetchError } = useGetImportTemplateQuery(
    templateId,
    { skip: !templateId || isNaN(templateId) || !canEdit },
  );
  const template = unwrap<ImportTemplate>(raw);

  const [updateTemplate, { isLoading: saving }] = useUpdateImportTemplateMutation();

  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "draft" as TemplateStatus,
    default_file_format: "xlsx" as FileFormat,
    instructions: "",
    allow_sample_row: true,
    is_download_enabled: true,
  });
  const [columns, setColumns] = useState<DraftColumn[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [columnsEdited, setColumnsEdited] = useState(false);
  const [initialized, setInitialized] = useState(false);
  // State (not a ref): it participates in the render output via isDirty, so a
  // ref would be read during render - unsafe under the React Compiler.
  const [initialForm, setInitialForm] = useState<typeof form | null>(null);

  const back = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.VIEW(templateId));
    }
  };
  // Not a static destination (deep-link with no history falls back to the
  // template view), so the header's back is set imperatively.
  useDashboardBack(back);

  // Pre-fill form when the fetched template arrives (guarded render-phase
  // adjustment - runs once, no setState-in-effect cascade).
  if (template && !initialized) {
    const snapshot = {
      name: template.name,
      description: template.description ?? "",
      status: template.status,
      default_file_format: template.default_file_format,
      instructions: template.instructions ?? "",
      allow_sample_row: template.allow_sample_row,
      is_download_enabled: template.is_download_enabled,
    };
    setForm(snapshot);
    const sorted = (template.columns ?? []).slice().sort((a, b) => a.column_order - b.column_order);
    setColumns(sorted.length > 0 ? sorted.map(fromExisting) : [blankColumn(1)]);
    setInitialForm(snapshot);
    setInitialized(true);
  }

  // Gated on the permission the endpoint itself enforces. This used to also
  // require `user.user_type === "CX_STAFF"`, a field the API does not return -
  // so the check was `undefined === "CX_STAFF"` and denied everybody. The model
  // calls user_type an inert marker that must never drive authorization; RBAC is
  // where that decision belongs, and it is the one the server actually makes.
  if (!canEdit) {
    return (
      <PageAccessDenied
        onBack={back}
        message="You don't have permission to edit import templates."
      />
    );
  }

  if (!templateId || isNaN(templateId)) {
    return (
      <>
        <div className="flex h-96 items-center justify-center">
          <p className="text-sm text-destructive">Invalid template id.</p>
        </div>
      </>
    );
  }

  if (fetching) {
    return (
      <>
        <div className="flex h-96 items-center justify-center"><div className="loader" /></div>
      </>
    );
  }

  if (fetchError || !template) {
    return (
      <>
        <div className="flex h-96 flex-col items-center justify-center gap-3">
          <p className="text-sm text-destructive">Template not found or you don't have access.</p>
          <Button variant="white" size="sm" onClick={back}>Go back</Button>
        </div>
      </>
    );
  }

  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const setCol = (idx: number, patch: Partial<DraftColumn>) => {
    setColumnsEdited(true);
    setColumns((arr) => arr.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  };

  const addCol = () => {
    setColumnsEdited(true);
    setColumns((arr) => [...arr, blankColumn(arr.length + 1)]);
  };

  const removeCol = (idx: number) => {
    setColumnsEdited(true);
    setColumns((arr) =>
      arr.filter((_, i) => i !== idx).map((c, i) => ({ ...c, column_order: i + 1 })),
    );
  };

  const isDirty =
    columnsEdited ||
    (initialForm !== null && JSON.stringify(form) !== JSON.stringify(initialForm));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Required.";
    if (columnsEdited) {
      columns.forEach((c, i) => {
        if (!c.column_name?.trim()) e[`col_${i}_column_name`] = "Required.";
        if (!c.target_field?.trim()) e[`col_${i}_target_field`] = "Required.";
      });
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error("Please fix the highlighted fields.");
      return;
    }
    const payload: UpdateTemplatePayload = {
      name: form.name.trim(),
      description: form.description,
      status: form.status,
      default_file_format: form.default_file_format,
      instructions: form.instructions,
      allow_sample_row: form.allow_sample_row,
      is_download_enabled: form.is_download_enabled,
    };
    if (columnsEdited) {
      payload.columns = columns.map(({ _tmpId, ...rest }) => {
        void _tmpId;
        return {
          ...rest,
          column_name: rest.column_name?.trim() ?? "",
          target_field: rest.target_field?.trim() ?? "",
          display_name: rest.display_name?.trim() || (rest.column_name?.trim() ?? ""),
          allowed_values: Array.isArray(rest.allowed_values) ? rest.allowed_values : [],
        };
      });
    }
    try {
      await updateTemplate({ id: templateId, body: payload }).unwrap();
      toast.success("Template updated.");
      navigate(routesPath.PROTECTED.DATA_IMPORTS.TEMPLATES.VIEW(templateId));
    } catch { /* interceptor shows the toast */ }
  };

  return (
    <>
      <PageShell className="text-black-01 space-y-5 max-w-4xl pb-32">
        {/* Header */}
        <div>
          <h1 className="text-lg font-semibold font-mont text-black-01">Edit Import Template</h1>
          <p className="text-xs text-gray-01 mt-0.5">
            <span className="font-mono">{template.code}</span>
            {" · "}
            <span className="capitalize">{template.dataset_type}</span>
            <span className="ml-1 italic">(code and dataset cannot be changed)</span>
          </p>
        </div>

        {/* Section 1: Identity */}
        <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-4")}>
          <p className="text-sm font-semibold font-mont border-b border-white-02 pb-3">Identity</p>

          {/* Read-only code */}
          <div>
            <p className="text-xs font-medium text-black-01 font-mont mb-1">Code</p>
            <p className="text-sm font-mono bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-400">
              {template.code}
            </p>
          </div>

          <CustomInput
            id="name" name="name" label="Name" required
            placeholder="e.g. Schools Master Import"
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

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.allow_sample_row}
                onChange={(e) => set("allow_sample_row", e.target.checked)}
                className="rounded border-gray-300 text-primary"
              />
              <span className="text-sm text-black-01">Include sample row</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.is_download_enabled}
                onChange={(e) => set("is_download_enabled", e.target.checked)}
                className="rounded border-gray-300 text-primary"
              />
              <span className="text-sm text-black-01">Downloadable</span>
            </label>
          </div>
        </section>

        {/* Section 2: Description + Instructions */}
        <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-4")}>
          <p className="text-sm font-semibold font-mont border-b border-white-02 pb-3">Description & Instructions</p>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-black-01 font-mont">Description</label>
            <textarea
              rows={3}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              placeholder="Brief summary of what this template is for…"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-black-01 font-mont">Instructions</label>
            <textarea
              rows={5}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
              placeholder="Plain-language guidance shown to staff before download or upload…"
              value={form.instructions}
              onChange={(e) => set("instructions", e.target.value)}
            />
          </div>
        </section>

        {/* Section 3: Columns */}
        <section className={cn(INFORMATION_CARD_SURFACE, "rounded-md p-5 space-y-4")}>
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white-02 pb-3">
            <div>
              <p className="text-sm font-semibold font-mont">Columns</p>
              <p className="text-xs text-gray-01 mt-0.5">
                {columns.length} column{columns.length === 1 ? "" : "s"}
              </p>
            </div>
            <Button type="button" size="sm" variant="white" onClick={addCol}>
              <Plus className="size-3.5" /> Add Column
            </Button>
          </div>

          {columnsEdited && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>
                Saving with column changes will <strong>replace all existing columns</strong> on this template.
              </span>
            </div>
          )}

          <div className="space-y-3">
            {columns.map((col, idx) => (
              <div key={col._tmpId} className="rounded-md border border-white-02 p-4 space-y-3 hover:border-gray-200 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-mono text-gray-400 font-medium">Col {idx + 1}</span>
                  <Button
                    type="button" size="sm" variant="white"
                    className="text-destructive hover:bg-destructive/5"
                    onClick={() => removeCol(idx)}
                    disabled={columns.length <= 1}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomInput
                    id={`col_${idx}_column_name`}
                    name={`col_${idx}_column_name`}
                    label="Column Name (CSV header)"
                    placeholder="e.g. school_name"
                    value={col.column_name ?? ""}
                    onChange={(e) => setCol(idx, { column_name: e.target.value })}
                    error={errors[`col_${idx}_column_name`]}
                  />
                  <CustomInput
                    id={`col_${idx}_target_field`}
                    name={`col_${idx}_target_field`}
                    label="Target Field (model field)"
                    placeholder="e.g. name"
                    value={col.target_field ?? ""}
                    onChange={(e) => setCol(idx, { target_field: e.target.value })}
                    error={errors[`col_${idx}_target_field`]}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                          {COLUMN_DATA_TYPES.map((t) => (
                            <ComboboxItem key={t} value={t}>{t}</ComboboxItem>
                          ))}
                          <ComboboxEmpty>No matches</ComboboxEmpty>
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  </div>
                  <CustomInput
                    id={`col_${idx}_display_name`}
                    name={`col_${idx}_display_name`}
                    label="Display Name"
                    placeholder="Label shown to user"
                    value={col.display_name ?? ""}
                    onChange={(e) => setCol(idx, { display_name: e.target.value })}
                  />
                  <CustomInput
                    id={`col_${idx}_sample_value`}
                    name={`col_${idx}_sample_value`}
                    label="Sample Value"
                    placeholder="e.g. St. Joseph's"
                    value={col.sample_value ?? ""}
                    onChange={(e) => setCol(idx, { sample_value: e.target.value })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <CustomInput
                    id={`col_${idx}_help_text`}
                    name={`col_${idx}_help_text`}
                    label="Help Text"
                    placeholder="Short guidance for this field"
                    value={col.help_text ?? ""}
                    onChange={(e) => setCol(idx, { help_text: e.target.value })}
                  />
                  {col.data_type === "choice" && (
                    <CustomInput
                      id={`col_${idx}_allowed_values`}
                      name={`col_${idx}_allowed_values`}
                      label="Allowed Values (comma-separated)"
                      placeholder="yes,no,maybe"
                      value={(col.allowed_values ?? []).join(",")}
                      onChange={(e) =>
                        setCol(idx, {
                          allowed_values: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                        })
                      }
                    />
                  )}
                </div>

                <div className="flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={col.is_required ?? false}
                      onChange={(e) => setCol(idx, { is_required: e.target.checked })}
                      className={cn("rounded border-gray-300 text-primary")}
                    />
                    <span className="text-xs text-black-01">Required</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={col.is_unique ?? false}
                      onChange={(e) => setCol(idx, { is_unique: e.target.checked })}
                      className="rounded border-gray-300 text-primary"
                    />
                    <span className="text-xs text-black-01">Unique</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </section>
      </PageShell>

      {/* Sticky footer */}
      <div className="fixed bottom-0 right-0 left-0 md:left-(--sidebar-width) group-has-data-[collapsible=icon]/sidebar-wrapper:md:left-(--sidebar-width-icon) transition-[left] duration-200 ease-linear border-t border-white-02 bg-white px-4.5 py-3 flex justify-end gap-2 z-10">
        <Button type="button" variant="white" onClick={back} disabled={saving}>
          Cancel
        </Button>
        <Button type="button" onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? "Saving…" : "Save Changes"}
        </Button>
      </div>
    </>
  );
}
