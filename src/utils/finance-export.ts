/**
 * Authenticated file preview for the finance report ?export= endpoints. The
 * API is bearer-authenticated and the access token lives only in the host's
 * memory, so a plain <a href> can't carry it. The file is fetched with the
 * Authorization header and passed to the in-app viewer.
 *
 * This is a raw fetch, so it sits OUTSIDE RTK Query and gets none of what
 * `baseQuery` adds for free. That is the whole reason for the tenant handling
 * below: these endpoints require `?tenant=`, baseApi stamps it on every request
 * it makes, and a hand-rolled fetch that forgets it gets a 400 every time.
 */

import { toast } from "sonner";

import { getAccessToken } from "@/utils/access-token";
import { getTenantSlug } from "@/utils/tenant-context";
import { showBlobPreview } from "../components/finance-ui/file-preview-dialog";

const baseUrl = import.meta.env.VITE_BACKEND_URL;

/**
 * View a report export. `path` is the report path (no query), `params`
 * carries entity + any period, and `format` is csv | xlsx | pdf.
 */
export async function viewReportExport(
  path: string,
  params: Record<string, string | number | undefined>,
  format: "csv" | "xlsx" | "pdf",
): Promise<void> {
  const search = new URLSearchParams({ export: format });
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") search.set(k, String(v));
  }
  // Never re-stamp a request that already asserts a tenant of its own.
  // getTenantSlug also resolves to the IMPERSONATION target when a session is
  // active, which reading auth.tenant.slug directly would get wrong.
  if (!search.has("tenant")) {
    const slug = getTenantSlug();
    if (slug) search.set("tenant", slug);
  }
  try {
    const token = getAccessToken();
    const res = await fetch(`${baseUrl}${path}?${search.toString()}`, {
      headers: { Authorization: token ? `Bearer ${token}` : "", accept: "*/*" },
    });
    if (!res.ok) {
      toast.error(res.status === 403 ? "You don't have permission to export this." : "Export failed. Please try again.");
      return;
    }
    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = /filename="?([^"]+)"?/.exec(disposition);
    const filename = match?.[1] || `export.${format}`;

    showBlobPreview(filename, blob);
  } catch {
    toast.error("Could not reach the server. Please try again.");
  }
}
