/**
 * Vendor Assessment form - a right-side FormDrawer (house convention, not the
 * prototype's centered modal). Records a point-in-time scorecard; the weighted
 * overall score + grade preview mirror the backend exactly. On-Time Delivery is
 * prefilled from the vendor's computed on-time rate (editable).
 */
import { useState } from "react";
import { toast } from "sonner";

import { FormDrawer, FormField, VendorPicker } from "@/components/finance-ui";
import { useCreateVendorAssessmentMutation } from "@/redux/services/procurement/procurement-ext-api";
import { GradePill, ScoreInput } from "./shared";
import { ASSESSMENT_CRITERIA, ASSESSMENT_WEIGHTS, computeOverall, gradeFor } from "./helpers";

// On-Time Delivery prefill from a vendor's computed on-time rate (0..1) → 0–100, or null.
function prefillOtd(vendor: string, onTimeByVendor: Record<string, number | null>): number | null {
  const rate = vendor ? onTimeByVendor[vendor] : null;
  return rate == null ? null : Math.round(rate * 100);
}

export function AssessmentFormDrawer({ entity, onClose, defaultVendor, onTimeByVendor }: {
  entity: string;
  onClose: () => void;
  defaultVendor?: string;
  // vendor code → computed on-time rate (0..1) or null, from the performance rows.
  onTimeByVendor: Record<string, number | null>;
}) {
  const [vendor, setVendor] = useState(defaultVendor ?? "");
  const [scores, setScores] = useState(() => ({
    on_time_delivery: prefillOtd(defaultVendor ?? "", onTimeByVendor) ?? 80,
    quality_acceptance: 80, invoice_accuracy: 80, responsiveness: 80,
  }));
  const [notes, setNotes] = useState("");
  const [create, { isLoading }] = useCreateVendorAssessmentMutation();

  // Prefill On-Time Delivery from the picked vendor's computed rate (editable after).
  const handleVendor = (code: string) => {
    setVendor(code);
    const otd = prefillOtd(code, onTimeByVendor);
    if (otd != null) setScores((s) => ({ ...s, on_time_delivery: otd }));
  };

  const setScore = (key: keyof typeof scores) => (value: number) =>
    setScores((s) => ({ ...s, [key]: value }));

  const overall = computeOverall(scores);
  const grade = gradeFor(overall);
  const canSubmit = !!vendor;

  const save = async () => {
    if (!canSubmit) return;
    try {
      const r = await create({ entity, vendor, notes: notes.trim() || undefined, ...scores }).unwrap();
      toast.success(r.message || "Vendor assessment recorded.");
      onClose();
    } catch { /* central error toast */ }
  };

  return (
    <FormDrawer
      open onOpenChange={(o) => !isLoading && !o && onClose()}
      title="New vendor assessment"
      description="Record a point-in-time scorecard. Scores are weighted into an overall grade; the assessment is immutable once saved."
      widthClass="sm:max-w-lg" onSubmit={save} submitText="Save assessment" loading={isLoading} canSubmit={canSubmit}
    >
      <FormField label="Vendor" required>
        <VendorPicker entity={entity} value={vendor} onChange={handleVendor} placeholder="Select a vendor to assess" />
      </FormField>

      <div className="space-y-4 rounded-md border border-white-02 p-4">
        {ASSESSMENT_CRITERIA.map(({ key, label }) => (
          <ScoreInput key={key} label={label} weight={ASSESSMENT_WEIGHTS[key]} value={scores[key]} onChange={setScore(key)} />
        ))}
      </div>

      <div className="flex items-center justify-between rounded-md bg-primary/5 px-4 py-3">
        <div>
          <p className="font-mont text-[11px] text-gray-05">Weighted overall score</p>
          <p className="mt-0.5 font-mont text-2xl font-semibold tabular-nums text-black-01">{overall}<span className="text-sm text-gray-05"> / 100</span></p>
        </div>
        <GradePill grade={grade} />
      </div>

      <FormField label="Notes">
        <textarea
          value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000}
          placeholder="Optional context for this scorecard"
          className="w-full rounded-md border border-white-02 bg-white px-3 py-2 font-mont text-sm text-black-01 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        />
      </FormField>
    </FormDrawer>
  );
}
