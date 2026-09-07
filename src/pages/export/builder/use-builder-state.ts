/**
 * Builder state, and the debounced preview that watches it.
 *
 * Modelled on custom/import-wizard: flat state in one parent, steps as
 * presentational children. The wizard is deliberately NOT a reducer - every
 * field is independent, nothing derives from anything else, and a reducer would
 * add ceremony without removing a single bug.
 *
 * Preview behaviour is the part worth reading. The estimate is called on every
 * column and filter change, so it is debounced 400 ms and - crucially - the
 * PREVIOUS result is kept while the next one is in flight, which is what lets
 * the rail stay populated at 60% opacity instead of blanking. Responses are
 * sequence-checked so a slow early request can never overwrite a fast later one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePreviewExportMutation } from "@/redux/services/dashboard/exports-api";
import { apiErrorMessage } from "@/utils/api-errors";
import type {
  Dataset,
  ExportFormat,
  FilterSpec,
  PreviewResult,
  ValuesMode,
} from "@/redux/services/dashboard/exports-types";

const PREVIEW_DEBOUNCE_MS = 400;

export interface BuilderState {
  name: string;
  description: string;
  datasetKey: string;
  entity: string;
  columns: string[];
  filters: FilterSpec[];
  format: ExportFormat;
  formatOptions: Record<string, unknown>;
  valuesMode: ValuesMode;
  fileNamePattern: string;
}

export const emptyBuilderState: BuilderState = {
  name: "",
  description: "",
  datasetKey: "",
  entity: "",
  columns: [],
  filters: [],
  format: "xlsx",
  formatOptions: {},
  valuesMode: "people",
  fileNamePattern: "export-{date}",
};

/** Defaults the catalogue declares for a freshly picked dataset. */
export function defaultsForDataset(dataset: Dataset): Partial<BuilderState> {
  const format = (dataset.supported_formats.includes("xlsx") ? "xlsx" : dataset.supported_formats[0]) as ExportFormat;
  const schema = dataset.format_options?.[format] ?? {};
  return {
    columns: [...dataset.default_columns],
    // Required filters start present but unset, so the builder shows the person
    // what they must fill in rather than letting them discover it at submit.
    filters: dataset.required_filters.map((id) => ({ id })),
    format,
    formatOptions: Object.fromEntries(
      Object.entries(schema).map(([key, option]) => [key, option.default]),
    ),
  };
}

export function useBuilderState(initial?: Partial<BuilderState>) {
  const [state, setState] = useState<BuilderState>({ ...emptyBuilderState, ...initial });
  const patch = useCallback(
    (next: Partial<BuilderState>) => setState((prev) => ({ ...prev, ...next })),
    [],
  );
  return { state, patch, setState };
}

export function usePreview({
  dataset,
  state,
  enabled,
}: {
  dataset: Dataset | undefined;
  state: BuilderState;
  enabled: boolean;
}) {
  const [runPreview] = usePreviewExportMutation();
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Monotonic request id: only the newest response may write state.
  const sequence = useRef(0);

  // The body is the whole configuration, so the effect keys on its serialised
  // form rather than on a list of dependencies that would drift.
  const body = useMemo(() => {
    if (!dataset || !state.columns.length) return null;
    return {
      dataset_key: dataset.id,
      columns: state.columns,
      filters: state.filters,
      format: state.format,
      values_mode: state.valuesMode,
      ...(dataset.requires_entity && state.entity ? { entity: state.entity } : {}),
    };
  }, [dataset, state.columns, state.filters, state.format, state.valuesMode, state.entity]);

  const key = body ? JSON.stringify(body) : "";

  useEffect(() => {
    if (!enabled || !body) {
      // No columns means no estimate to show - and nothing stale worth keeping.
      if (!body) {
        setPreview(null);
        setError(null);
        setRecalculating(false);
      }
      return;
    }

    const mine = ++sequence.current;
    setRecalculating(true);
    const timer = setTimeout(async () => {
      try {
        const res = await runPreview(body).unwrap();
        if (sequence.current !== mine) return; // a newer request has overtaken this one
        setPreview(res.data);
        setError(null);
      } catch (e) {
        if (sequence.current !== mine) return;
        // A configuration problem is the user's to fix and comes back as a 400
        // with the same sentence a failed run would show. Keep the last good
        // figures on screen behind it rather than blanking the rail.
        setError(apiErrorMessage(e, "This configuration could not be estimated."));
      } finally {
        if (sequence.current === mine) setRecalculating(false);
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `key` is the serialised body: one dependency that genuinely covers it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return { preview, recalculating, error };
}
