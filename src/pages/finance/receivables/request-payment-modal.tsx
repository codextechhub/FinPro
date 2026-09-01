// Request online payment - kick off an invoice-linked gateway collection.
// Calls POST /payments/collections/ (vs_payments) which creates a CollectionIntent
// and returns a checkout link. When the customer pays, the webhook books the
// receipt (Dr bank, Cr AR) and allocates it to THIS invoice automatically - no
// manual recording. This screen just generates and surfaces the link/reference.
import { useState } from "react";
import { toast } from "sonner";
import { Globe, Copy, ExternalLink, Check } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Money, StatusPill } from "@/components/finance-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useInitiateCollectionMutation } from "@/redux/services/payments/payments-api";
import type { Collection } from "@/redux/services/payments/payments-types";

export function RequestPaymentModal({ open, onOpenChange, entity, invoiceId, docNumber, balanceKobo, currency }: {
  open: boolean; onOpenChange: (o: boolean) => void; entity: string;
  invoiceId: number; docNumber: string; balanceKobo: number; currency?: string | null;
}) {
  const [narration, setNarration] = useState("");
  const [result, setResult] = useState<Collection | null>(null);
  const [copied, setCopied] = useState(false);
  const [initiate, { isLoading }] = useInitiateCollectionMutation();

  const close = () => { setNarration(""); setResult(null); setCopied(false); onOpenChange(false); };

  const generate = async () => {
    try {
      const res = await initiate({
        entity, invoice: invoiceId, amount: balanceKobo,
        narration: narration || `Payment for ${docNumber}`,
      }).unwrap();
      setResult(res.data);
      toast.success(res.message || "Payment link generated.");
    } catch { /* central */ }
  };

  const copy = async () => {
    if (!result?.checkout_url) return;
    await navigator.clipboard.writeText(result.checkout_url);
    setCopied(true); setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !isLoading && close()}>
      <DialogContent className="console-geist sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mont text-base font-semibold text-black-01">Request online payment</DialogTitle>
          <DialogDescription className="font-mont text-sm text-gray-05">
            Generate a checkout link for {docNumber}. When the customer pays, the receipt is booked and allocated to this invoice automatically.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2.5 font-mont text-sm">
              <span className="text-gray-05">Amount to collect</span>
              <span className="font-semibold text-black-01"><Money kobo={balanceKobo} currency={currency} /></span>
            </div>
            <label className="block space-y-1">
              <span className="font-mont text-xs text-gray-05">Narration</span>
              <Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder={`Payment for ${docNumber}`} className="bg-white" />
            </label>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button variant="outline" disabled={isLoading} onClick={close}>Cancel</Button>
              <Button disabled={isLoading || balanceKobo <= 0} onClick={generate} className="gap-1.5">
                <Globe className="size-4" />{isLoading ? "Generating…" : "Generate payment link"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-2 font-mont text-xs">
              <StatusPill status={result.status} />
              <span className="text-gray-05">Ref {result.reference}</span>
            </div>
            <label className="block space-y-1">
              <span className="font-mont text-xs text-gray-05">Checkout link</span>
              <div className="flex items-center gap-2">
                <Input readOnly value={result.checkout_url ?? "-"} className="bg-gray-50 font-mont text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button variant="outline" size="sm" onClick={copy} className="h-9 shrink-0 gap-1 px-2" disabled={!result.checkout_url}>
                  {copied ? <Check className="size-3.5 text-green-01" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy"}
                </Button>
                <Button size="sm" onClick={() => result.checkout_url && window.open(result.checkout_url, "_blank", "noopener")} className="h-9 shrink-0 gap-1 px-2" disabled={!result.checkout_url}>
                  <ExternalLink className="size-3.5" /> Open
                </Button>
              </div>
            </label>
            <p className="font-mont text-[11px] text-gray-05">
              Share this link with the customer. On payment, the receipt posts (Dr bank, Cr AR) and allocates to {docNumber} automatically - it’ll appear in the Payments tab.
            </p>
            <div className="flex items-center justify-end pt-1">
              <Button onClick={close}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
