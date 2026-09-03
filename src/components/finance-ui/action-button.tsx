/**
 * <ActionButton> - a permission-gated control that opens a confirm modal and
 * runs an async action (a state-changing mutation). Encapsulates the gate +
 * confirm + loading pattern repeated across every "post / settle / pay /
 * approve" row action, so pages stay declarative.
 */

import { useState } from "react";
import { Can } from "./can";
import { ConfirmActionModal } from "./confirm-action-modal";
import type { PermissionCode } from "../../permissions";
import { cn } from "@/lib/utils";

interface ActionButtonProps {
  label: string;
  permission: PermissionCode;
  title: string;
  description?: string;
  confirmText?: string;
  destructive?: boolean;
  /** Runs the action; should throw to keep the modal open on failure. */
  onConfirm: () => Promise<void>;
  /** Render as a subtle inline link (table rows) rather than a button. */
  asLink?: boolean;
  children?: React.ReactNode;
  className?: string;
}

export function ActionButton({
  label,
  permission,
  title,
  description,
  confirmText,
  destructive,
  onConfirm,
  asLink,
  children,
  className,
}: ActionButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch {
      /* leave open; error toast surfaced centrally */
    } finally {
      setLoading(false);
    }
  };

  return (
    <Can permission={permission}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className={cn(
          asLink
            ? "font-mont text-xs font-semibold text-primary hover:underline"
            : "rounded-md bg-primary px-3 py-1.5 font-mont text-xs font-semibold text-white hover:bg-primary/90",
          className,
        )}
      >
        {label}
      </button>
      <ConfirmActionModal
        open={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        confirmText={confirmText ?? label}
        destructive={destructive}
        loading={loading}
        onConfirm={run}
      >
        {children}
      </ConfirmActionModal>
    </Can>
  );
}
