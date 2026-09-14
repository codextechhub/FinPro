import { ExternalLink, ListChecks, Minus, Plus, ShieldAlert, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

type FieldItem = { label: string; value: string };
type FieldSection = { kind: "fields"; title: string; items: FieldItem[] };
type TableColumn = { key: string; label: string };
type TableSection = {
  kind: "table";
  title: string;
  columns: TableColumn[];
  rows: Record<string, string>[];
};
type ChangeItem = {
  operation: "ADD" | "REMOVE";
  label: string;
  description?: string;
  restricted: boolean;
};
type ChangeSection = { kind: "changes"; title: string; items: ChangeItem[] };
type DetailSection = FieldSection | TableSection | ChangeSection;
type DocumentPrompt = { title: string; description: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function EmptyLine({ children }: { children: string }) {
  return <p className="rounded-md border border-white-02 bg-gray-50 px-3 py-2 text-xs text-gray-01">{children}</p>;
}

function isSection(value: unknown): value is DetailSection {
  if (!isObject(value) || typeof value.title !== "string") return false;
  if (value.kind === "fields") {
    return Array.isArray(value.items) && value.items.every(
      (item) => isObject(item) && typeof item.label === "string" && typeof item.value === "string",
    );
  }
  if (value.kind === "changes") {
    return Array.isArray(value.items) && value.items.every(
      (item) => isObject(item)
        && (item.operation === "ADD" || item.operation === "REMOVE")
        && typeof item.label === "string"
        && typeof item.restricted === "boolean"
        && (item.description === undefined || typeof item.description === "string"),
    );
  }
  if (value.kind !== "table" || !Array.isArray(value.columns) || !Array.isArray(value.rows)) return false;
  const columns = value.columns.filter(
    (column) => isObject(column) && typeof column.key === "string" && typeof column.label === "string",
  ) as TableColumn[];
  return columns.length === value.columns.length && value.rows.every(
    (row) => isObject(row) && columns.every((column) => typeof row[column.key] === "string"),
  );
}

/**
 * Distinguish a legacy empty snapshot from an unsupported or malformed one.
 * The renderer stays fail-closed when it cannot understand decision evidence.
 */
export function documentDetailSections(details: unknown): DetailSection[] | null {
  if (details == null) return [];
  if (!isObject(details)) return null;
  if (Object.keys(details).length === 0) return [];
  if (details.schema_version !== 1 || !Array.isArray(details.sections)) return null;
  return details.sections.every(isSection) ? details.sections : null;
}

/**
 * Render the immutable business facts a reviewer needs without interpreting
 * any domain model. The server chooses safe strings and semantic blocks; this
 * component owns their responsive presentation and never renders raw markup.
 */
export function DocumentDetailsPanel({
  details,
  documentLink,
  documentPrompt,
}: {
  details: unknown;
  documentLink: string | null;
  documentPrompt: DocumentPrompt;
}) {
  const sections = documentDetailSections(details);
  const populated = Boolean(sections?.length);

  if (!populated && sections !== null) {
    if (!documentLink) return null;
    return (
      <div
        data-guide="approval-detail.view-document"
        className="flex flex-col gap-3 rounded-lg border border-white-02 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-black-01">{documentPrompt.title}</p>
          <p className="mt-0.5 text-xs text-gray-01">{documentPrompt.description}</p>
        </div>
        <SourceDocumentButton href={documentLink} />
      </div>
    );
  }

  return (
    <div data-guide="approval-detail.details" className="min-w-0 rounded-lg border border-white-02 bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-white-02 px-5 py-3">
        <ListChecks className="size-4 text-gray-01" />
        <h2 className="text-sm font-semibold">Details</h2>
        {populated ? (
          <span className="text-xs text-gray-01 sm:ml-auto">Review without leaving this approval</span>
        ) : null}
      </div>

      {sections === null ? (
        <div className="flex items-start gap-3 p-5 text-sm text-gray-01">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-yellow-600" />
          <p>This version of the approval details cannot be shown here. Review the full document before deciding.</p>
        </div>
      ) : (
        <div className="space-y-6 p-5 lg:max-h-[38rem] lg:overflow-y-auto lg:overscroll-contain">
          {sections.map((section, index) => (
            <DetailSectionView key={`${section.kind}-${section.title}-${index}`} section={section} />
          ))}
        </div>
      )}

      {documentLink ? (
        <div
          data-guide="approval-detail.view-document"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-white-02 px-5 py-3"
        >
          <p className="text-xs text-gray-01">Need the source record or its attachments?</p>
          <SourceDocumentButton href={documentLink} />
        </div>
      ) : null}
    </div>
  );
}

function DetailSectionView({ section }: { section: DetailSection }) {
  if (section.kind === "fields") return <FieldsSection section={section} />;
  if (section.kind === "table") return <TableSectionView section={section} />;
  return <ChangesSection section={section} />;
}

function SectionHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-06">
      {children}
    </h3>
  );
}

function FieldsSection({ section }: { section: FieldSection }) {
  if (!section.items.length) return null;
  return (
    <section>
      <SectionHeading>{section.title}</SectionHeading>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
        {section.items.map((item, index) => (
          <div key={`${item.label}-${index}`} className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wide text-gray-06">{item.label}</dt>
            <dd className="mt-1 break-words text-sm text-black-01">{item.value || "-"}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TableSectionView({ section }: { section: TableSection }) {
  return (
    <section>
      <SectionHeading>{section.title}</SectionHeading>
      {!section.rows.length ? (
        <EmptyLine>No items were supplied.</EmptyLine>
      ) : (
        <div className="max-w-full overflow-x-auto rounded-lg border border-white-02">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-06">
              <tr>
                {section.columns.map((column) => (
                  <th key={column.key} scope="col" className="whitespace-nowrap px-3 py-2.5 font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white-02">
              {section.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {section.columns.map((column) => (
                    <td key={column.key} className="max-w-80 whitespace-normal break-words px-3 py-3 align-top text-black-01">
                      {row[column.key] || "-"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ChangesSection({ section }: { section: ChangeSection }) {
  return (
    <section>
      <SectionHeading>{section.title}</SectionHeading>
      {!section.items.length ? (
        <EmptyLine>No changes were supplied.</EmptyLine>
      ) : (
        <ul className="divide-y divide-white-02 overflow-hidden rounded-lg border border-white-02">
          {section.items.map((item, index) => {
            const added = item.operation === "ADD";
            return (
              <li key={`${item.operation}-${item.label}-${index}`} className="flex min-w-0 items-start gap-3 px-3 py-3">
                <span className={`mt-0.5 grid size-6 shrink-0 place-content-center rounded-full ${added ? "bg-green-01/10 text-green-01-text" : "bg-gray-05/10 text-gray-06-text"}`}>
                  {added ? <Plus className="size-3.5" /> : <Minus className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${added ? "bg-green-01/10 text-green-01-text" : "bg-gray-05/10 text-gray-06-text"}`}>
                      {added ? "Added" : "Removed"}
                    </span>
                    <p className="break-words text-sm font-medium text-black-01">{item.label}</p>
                    {item.restricted ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-error-text">
                        <ShieldAlert className="size-3" /> Restricted
                      </span>
                    ) : null}
                  </div>
                  {item.description ? (
                    <p className="mt-1 break-words text-xs text-gray-01">{item.description}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SourceDocumentButton({ href }: { href: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="w-full shrink-0 sm:w-auto">
      <a href={href}>
        View full document <ExternalLink className="size-3.5" />
      </a>
    </Button>
  );
}
