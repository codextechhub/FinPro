// The package's loading indicators, drawn by the host where it supplies a
// mark and by a plain spinner where it does not.

import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { HostLoadingMark } from "../../host";

/**
 * The wait indicator for a section or page that is loading.
 *
 * Renders the host application's own loading mark (the console's is the CodeX
 * logo sweep). A host without one gets a primary-coloured spinner. Size it
 * with a `size-*` class.
 */
export function LoadingMark({ className, label = "Loading" }: { className?: string; label?: string | null }) {
  if (HostLoadingMark) return <HostLoadingMark className={className} label={label} />;
  return (
    <Loader2
      className={cn("animate-spin text-primary", className)}
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    />
  );
}

/**
 * The icon on a Refresh button: the refresh arrow at rest, the loading mark
 * while the refetch runs, or the arrow spinning where the host has no mark.
 */
export function RefreshIcon({ spinning = false, className }: { spinning?: boolean; className?: string }) {
  if (spinning && HostLoadingMark) return <HostLoadingMark className={className} label={null} inButton />;
  return <RefreshCw className={cn(className, spinning && "animate-spin")} />;
}
