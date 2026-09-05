// Shared Finance & Procurement UI primitives (spec §4). Built once in the app's
// design language and reused across both consoles. Import from "@/components/
// finance-ui".

export { Can, useCan } from "./can";
export { Money, kpiValueClass } from "./money";
export { MoneyInput } from "./money-input";
export { StatusPill } from "./status-pill";
export { JournalTable, type JournalLineView } from "./journal-table";
export { PostingRecap, type RecapRow } from "./posting-recap";
export { DataTable, headCls, cellCls, type Column } from "./data-table";
export { DetailDrawer } from "./detail-drawer";
export { ConfirmActionModal } from "./confirm-action-modal";
export { DocumentEmailAction, type DocumentEmailActionProps } from "./document-email-action";
export { ActionButton } from "./action-button";
export { EntitySelect } from "./entity-select";
export { FormModal, FormDrawer, FormField } from "./form-modal";
export { PostingDateField } from "./posting-date-field";
export { usePostingWindow, type PostingWindowState } from "./use-posting-window";
export { Segmented } from "./segmented";
export { TabStrip, type TabStripItem, type TabStripProps, type TabStripVariant } from "./tab-strip";
export { AccountPicker, ReceivableAccountPicker, CustomerPicker, VendorPicker, CurrencyPicker, TaxCodePicker, CostCenterPicker, TaxObligationPicker, PettyCashFundPicker, BankAccountPicker } from "./pickers";
export { LineEditor, emptyLine, toApiLines, type DocLine } from "./line-editor";
export { useActiveEntity, useEntityCode } from "./use-entity";
export {
  LoadingState,
  LoadingRows,
  EmptyState,
  ErrorState,
  ForbiddenState,
} from "./states";
export {
  SkeletonText,
  SkeletonRow,
  SkeletonCard,
  SkeletonKpi,
  SkeletonLoadingLabel,
} from "@/components/custom/skeletons";
// KpiCard already exists app-wide; re-export so finance pages import from one place.
export { default as KpiCard } from "@/components/custom/kpi-card";
export { StatCard, type StatTone } from "./stat-card";
export { TeachingNote } from "./teaching-note";
export { InfoHint } from "./info-hint";
export { BarChart, Donut, StatStrip, WorkflowStrip, Sparkline, BudgetBar, AgingStack, TrendArea, CHART_COLORS, type BarDatum, type DonutDatum, type AgingDatum } from "./charts";
// Coerce an endpoint's `data` to an array (backend sends `{}` for an empty list).
export { toArray } from "@/redux/services/finance/api-types";
