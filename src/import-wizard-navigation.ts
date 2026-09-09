import { useEffect } from "react";
import { useBlocker } from "react-router";

export interface ImportWizardWork {
  complete: boolean;
  templateId: number | null;
  file: File | null;
  notes: string;
  batchId: number | null;
}

export function hasImportWizardWork({
  complete,
  templateId,
  file,
  notes,
  batchId,
}: ImportWizardWork) {
  if (complete) return false;
  return Boolean(templateId || file || notes.trim() || batchId);
}

/**
 * Protect an import only while it contains a local choice or unfinished batch.
 *
 * Browser unload and client-side routing are separate navigation paths, so the
 * guard covers both from the same dirty decision. Completed imports are never
 * blocked, even though the wizard retains their values for the result screen.
 */
export function useImportWizardNavigationGuard(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const blocker = useBlocker(isDirty);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const shouldLeave = window.confirm(
      "An import is in progress. Leave this page and stop working on it?",
    );
    if (shouldLeave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
}
