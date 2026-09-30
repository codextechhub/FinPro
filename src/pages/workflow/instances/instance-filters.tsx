import { useEffect, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/ui/date-picker-input";
import { CustomNativeSelect } from "@/components/custom/custom-native-select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebounce } from "@/hooks/use-debounce";
import {
  useGetDelegationDocumentTypesQuery,
  useGetInstanceFilterOptionsQuery,
} from "@/redux/services/dashboard/workflow-api";
import type { WorkflowInstanceStatus } from "@/redux/services/dashboard/workflow-types";
import type { HostBranch } from "../../../host";
import { INSTANCE_STATUS_META } from "../../../components/workflow/workflow-format";
import { PersonPicker } from "../../../components/workflow/person-picker";
import { activeFilterCount, WAITING_DAY_OPTIONS, type InstanceFilters } from "./manage-approvals";

/** The statuses a request can be filtered on, in the order a request moves through them. */
const STATUSES: WorkflowInstanceStatus[] = [
  "IN_PROGRESS", "SUBMITTED", "RETURNED", "APPROVED", "REJECTED", "WITHDRAWN", "CANCELLED",
];

const WAITING_OPTIONS = WAITING_DAY_OPTIONS.map((days) => ({
  value: String(days),
  label: days === 1 ? "More than 1 day" : `More than ${days} days`,
}));

function FilterLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return <label htmlFor={htmlFor} className="text-sm text-black-01">{children}</label>;
}

/**
 * The Manage Approvals filter bar.
 *
 * Every filter is optional and each one narrows the list on its own. The stage
 * filter appears once a document type is chosen, since stages belong to one
 * document type's templates. The branch filter appears only when the reader
 * can pick between more than one branch; with one there is nothing to choose.
 * The search box is debounced, so typing a document number costs one request,
 * not one per key.
 */
export function InstanceFilterBar({
  filters,
  onChange,
  onClear,
  branches,
}: {
  filters: InstanceFilters;
  onChange: (patch: Partial<InstanceFilters>) => void;
  onClear: () => void;
  /** The branches to offer, or null when the branch filter does not apply. */
  branches: HostBranch[] | null;
}) {
  const [searchInput, setSearchInput] = useState(filters.search);
  const search = useDebounce(searchInput.trim(), 400);

  // The address bar is the source of truth; the box follows it when it changes
  // from elsewhere (Clear filters, the back button).
  const [seenSearch, setSeenSearch] = useState(filters.search);
  if (filters.search !== seenSearch) {
    setSeenSearch(filters.search);
    setSearchInput(filters.search);
  }

  useEffect(() => {
    if (search !== filters.search) onChange({ search });
    // Only a settled search moves the address; the filters themselves do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const documentTypes = useGetDelegationDocumentTypesQuery();
  const stageOptions = useGetInstanceFilterOptionsQuery(filters.documentType, { skip: !filters.documentType });
  const stages = stageOptions.data?.stages ?? [];
  // Two templates for one document type can both have a stage of the same name.
  const stageLabelCounts = stages.reduce<Record<string, number>>((acc, s) => {
    acc[s.label] = (acc[s.label] ?? 0) + 1;
    return acc;
  }, {});

  const statusText = filters.statuses.length === 0
    ? "All statuses"
    : filters.statuses.length === 1
      ? INSTANCE_STATUS_META[filters.statuses[0] as WorkflowInstanceStatus]?.label ?? filters.statuses[0]
      : `${filters.statuses.length} statuses`;

  const toggleStatus = (status: string) => {
    const next = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ statuses: STATUSES.filter((s) => next.includes(s)) });
  };

  const narrowed = activeFilterCount(filters) > 0;

  return (
    <div className="space-y-3" data-guide="workflow-instances.filters">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-05" />
          <Input
            aria-label="Search by title or document number"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search title or document number"
            className="h-10 w-full bg-white pl-8 font-mont"
          />
        </div>
        {narrowed && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput("");
              onClear();
            }}
          >
            <X className="size-4" /> Clear filters
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CustomNativeSelect
          id="filter-doc-type"
          label="Document type"
          placeholder="All document types"
          loading={documentTypes.isLoading}
          options={documentTypes.data ?? []}
          value={filters.documentType}
          onChange={(e) => onChange({ documentType: e.target.value })}
        />

        <div className="grid gap-1.5">
          <FilterLabel>Status</FilterLabel>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-10 w-full justify-between bg-white font-normal">
                <span className="truncate">{statusText}</span>
                <ChevronDown className="size-4 text-gray-05" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {STATUSES.map((status) => (
                <DropdownMenuCheckboxItem
                  key={status}
                  checked={filters.statuses.includes(status)}
                  onSelect={(e) => e.preventDefault()}
                  onCheckedChange={() => toggleStatus(status)}
                >
                  {INSTANCE_STATUS_META[status].label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {filters.documentType && (
          <CustomNativeSelect
            id="filter-stage"
            label="Stage"
            placeholder="Any stage"
            loading={stageOptions.isLoading}
            options={stages.map((s) => ({
              value: s.id,
              label: stageLabelCounts[s.label] > 1 ? `${s.label} (${s.template_code})` : s.label,
            }))}
            value={filters.stage}
            onChange={(e) => onChange({ stage: e.target.value })}
          />
        )}

        <CustomNativeSelect
          id="filter-waiting-longer"
          label="Waiting longer than"
          placeholder="Any time"
          options={WAITING_OPTIONS}
          value={filters.waitingLongerThan}
          onChange={(e) => onChange({ waitingLongerThan: e.target.value })}
        />

        <PersonPicker
          id="filter-waiting-on"
          label="Waiting on"
          placeholder="Anybody"
          value={filters.waitingOn}
          onChange={(waitingOn) => onChange({ waitingOn })}
        />
        <PersonPicker
          id="filter-requested-by"
          label="Raised by"
          placeholder="Anybody"
          value={filters.requestedBy}
          onChange={(requestedBy) => onChange({ requestedBy })}
        />
        <PersonPicker
          id="filter-request-for"
          label="Request for"
          placeholder="Anybody"
          value={filters.requestFor}
          onChange={(requestFor) => onChange({ requestFor })}
        />

        {branches && (
          <CustomNativeSelect
            id="filter-branch"
            label="Branch"
            placeholder="All branches"
            options={branches.map((b) => ({ value: String(b.id), label: b.name }))}
            value={filters.branch}
            onChange={(e) => onChange({ branch: e.target.value })}
          />
        )}

        <div className="grid gap-1.5">
          <FilterLabel htmlFor="filter-submitted-from">Submitted from</FilterLabel>
          <DatePickerInput
            id="filter-submitted-from"
            value={filters.submittedFrom}
            max={filters.submittedTo || undefined}
            placeholder="Any day"
            onChange={(e) => onChange({ submittedFrom: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <FilterLabel htmlFor="filter-submitted-to">Submitted to</FilterLabel>
          <DatePickerInput
            id="filter-submitted-to"
            value={filters.submittedTo}
            min={filters.submittedFrom || undefined}
            placeholder="Any day"
            onChange={(e) => onChange({ submittedTo: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
