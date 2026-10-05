/**
 * The server's own payroll PDFs: a payslip and a yearly tax summary.
 *
 * The server builds both, so a payslip printed by the bursar, emailed to the
 * person and opened from My payslips is the same document with the same year
 * to date. The browser never lays one out itself.
 *
 * These are raw fetches, outside RTK Query, because the response is a file
 * rather than JSON. So nothing stamps the bearer token or the `?tenant=` that
 * baseQuery adds to every request it makes; both are added here, as the report
 * exports do (see finance-export.ts). The PDF opens in the app's file viewer,
 * from which it can be printed or saved.
 *
 * A refusal is answered with the server's own sentence: a payslip is refused
 * to a role that may not read every figure on it, and that sentence says so.
 */

import { toast } from "sonner";

import { getAccessToken } from "@/utils/access-token";
import { getTenantSlug } from "@/utils/tenant-context";
import { showBlobPreview } from "../components/finance-ui/file-preview-dialog";

const baseUrl = import.meta.env.VITE_BACKEND_URL || "";

/** The URL of a payroll PDF, with the tenant stamped on unless it names one. */
export function payrollPdfUrl(path: string, params: Record<string, string | number | undefined> = {}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  if (!search.has("tenant")) {
    const slug = getTenantSlug();
    if (slug) search.set("tenant", slug);
  }
  const cleanBase = baseUrl.replace(/\/$/, "");
  const query = search.toString();
  return `${cleanBase}${path}${query ? `?${query}` : ""}`;
}

/** The sentence a refused or failed PDF request carries, or a plain fallback. */
async function failureMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    const message = body?.error?.detail?.detail || body?.message || body?.detail;
    if (typeof message === "string" && message) return message;
  } catch {
    // A body that is not JSON falls through to the generic sentence.
  }
  return res.status === 404 ? "That document was not found." : "Could not open the document. Please try again.";
}

/**
 * Fetch a payroll PDF and show it. Resolves true when it opened.
 *
 * `fallbackName` names the file when the response does not.
 */
export async function openPayrollPdf(
  path: string,
  params: Record<string, string | number | undefined>,
  fallbackName: string,
): Promise<boolean> {
  try {
    const token = getAccessToken();
    const res = await fetch(payrollPdfUrl(path, params), {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), accept: "application/pdf" },
    });
    if (!res.ok) {
      toast.error(await failureMessage(res));
      return false;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = /filename="?([^"]+)"?/.exec(disposition);
    showBlobPreview(match?.[1] || fallbackName, blob);
    return true;
  } catch {
    toast.error("Could not reach the server. Please try again.");
    return false;
  }
}

/** A payroll line's payslip, for payroll staff. */
export const openLinePayslip = (entity: string, runId: number, lineId: number) =>
  openPayrollPdf(`/finance/payroll-runs/${runId}/lines/${lineId}/payslip/`, { entity }, "payslip.pdf");

/** A salary record's tax year, for payroll staff. */
export const openSalaryTaxSummary = (entity: string, salaryId: number, year: number) =>
  openPayrollPdf(`/finance/employee-salaries/${salaryId}/tax-summary/`, { entity, year, output: "pdf" }, `tax-summary-${year}.pdf`);

/** One of the signed-in person's own payslips. */
export const openMyPayslip = (id: number) =>
  openPayrollPdf(`/finance/my-payslips/${id}/`, { output: "pdf" }, "payslip.pdf");

/** The signed-in person's own tax year on one set of books. */
export const openMyTaxSummary = (year: number, entity?: string) =>
  openPayrollPdf("/finance/my-tax-summary/", { year, entity, output: "pdf" }, `tax-summary-${year}.pdf`);
