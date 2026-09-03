import Cookies from "js-cookie";

import { getTenantSlug } from "@/utils/tenant-context";

const baseUrl = import.meta.env.VITE_BACKEND_URL || "";

function buildUrl(path: string, params: Record<string, string | number | undefined>) {
  // These are raw fetches, outside RTK Query, so nothing stamps the `?tenant=`
  // that baseQuery adds to every request it makes - and the finance endpoints
  // require it. Same fix as @/utils/finance-export; see the note there.
  const withTenant: Record<string, string | number | undefined> = { ...params };
  if (withTenant.tenant == null || withTenant.tenant === "") {
    const slug = getTenantSlug();
    if (slug) withTenant.tenant = slug;
  }
  const query = Object.entries(withTenant)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  const cleanBase = baseUrl.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}${query ? `?${query}` : ""}`;
}

/**
 * The backend serves print-ready HTML documents (@media print / @page A4); there
 * is no server-side PDF. We fetch the HTML (the endpoint needs the Bearer token,
 * so a plain navigation won't authenticate), open it in a new tab, and trigger
 * the browser's print dialog - from which the user saves as PDF.
 */
async function openPrintableDocument(path: string, params: Record<string, string | number | undefined>) {
  // Open the tab synchronously, inside the click gesture - if we opened it after
  // the await, popup blockers would treat it as non-user-initiated and swallow it.
  // No `noopener`: we need the handle to navigate + print() our own blob.
  const win = window.open("", "_blank");
  if (!win) throw new Error("Allow pop-ups for this site to open the document.");
  try {
    const token = Cookies.get("token");
    const res = await fetch(buildUrl(path, params), {
      headers: {
        ...(token && token !== "undefined" ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) {
      let message = "Could not open the document.";
      try {
        const data = await res.json();
        message = data?.detail || data?.message || message;
      } catch {
        // Non-JSON document errors fall through to the generic message.
      }
      throw new Error(message);
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    win.addEventListener("load", () => { win.focus(); win.print(); }, { once: true });
    win.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    win.close(); // don't leave a blank tab open on failure
    throw error;
  }
}

export const openInvoiceDocument = (id: number, entity: string) =>
  openPrintableDocument(`/finance/invoices/${id}/document/`, { entity });

export const openPaymentReceipt = (id: number, entity: string) =>
  openPrintableDocument(`/finance/payments/${id}/receipt/`, { entity });
