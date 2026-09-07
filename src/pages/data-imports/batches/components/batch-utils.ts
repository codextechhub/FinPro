// Small helpers shared by the batch-detail page and its tabs.

// RTK responses are sometimes wrapped in a { data } envelope; this normalises.
export const unwrap = <T,>(res: { data: T } | T | undefined): T | undefined => {
  if (!res) return undefined;
  return (res as { data: T }).data ?? (res as T);
};

export function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function triggerBlobDownload(url: string, filename: string) {
  try {
    const token = document.cookie.match(/(?:^|;\s*)token=([^;]*)/)?.[1];
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
