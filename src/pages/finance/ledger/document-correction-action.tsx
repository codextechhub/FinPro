/**
 * The journal footer's actions for a journal a supplier or bank document owns:
 * open the document where its corrections live, and, where there is a single
 * safe undo, offer it here. See document-correction.ts for which is which.
 */

import { useState } from "react";
import { useNavigate } from "react-router";
import { Ban, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { ConfirmActionModal } from "@/components/finance-ui";
import { Can } from "@/components/finance-ui/can";
import { Button } from "@/components/ui/button";
import { useServesPath } from "../../../lib/host-routes";
import { useCorrectSourceDocumentMutation } from "@/redux/services/finance/document-corrections-api";
import { DOCUMENT_CORRECTIONS, documentScreenLink, type CorrectableDocumentType } from "./document-correction";

export function DocumentCorrectionAction({ documentType, documentId, documentNumber, entity, onDone }: {
  documentType: CorrectableDocumentType;
  documentId: number;
  documentNumber: string;
  entity: string;
  onDone?: () => void;
}) {
  const navigate = useNavigate();
  const serves = useServesPath();
  const [open, setOpen] = useState(false);
  const [correct, { isLoading }] = useCorrectSourceDocumentMutation();
  const config = DOCUMENT_CORRECTIONS[documentType];
  const link = documentScreenLink(documentType, documentId);
  const undo = config.undo;

  const confirm = async () => {
    if (!undo) return;
    try {
      const response = await correct({ path: undo.path(documentId), entity }).unwrap();
      toast.success(response.message || `${documentNumber} corrected.`);
      setOpen(false);
      onDone?.();
    } catch { /* central */ }
  };

  return <>
    {serves(link) && <Button variant="outline" className="gap-1.5" title={config.elsewhere} onClick={() => { onDone?.(); navigate(link); }}><ExternalLink className="size-4" /> Open {config.label}</Button>}
    {undo && <Can permission={undo.permission}>
      <Button variant="outline" disabled={isLoading} onClick={() => setOpen(true)} className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/5"><Ban className="size-4" /> {undo.verb}</Button>
    </Can>}
    {undo && <ConfirmActionModal open={open} onOpenChange={setOpen} title={`${undo.verb.split(" ")[0]} ${documentNumber}?`} description={undo.effect} confirmText={undo.verb} destructive loading={isLoading} onConfirm={confirm} />}
  </>;
}
