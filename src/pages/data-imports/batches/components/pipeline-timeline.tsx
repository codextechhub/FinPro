import { Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BatchStatus } from "@/redux/services/dashboard/import-types";
import { PIPELINE, PIPELINE_LABEL, FAILURE_STATUSES, STATUS_LABEL } from "./batch-status";

export function PipelineTimeline({ status }: { status: BatchStatus }) {
  const isFailure = FAILURE_STATUSES.has(status);

  // Translate the wide status enum into a position along the happy-path pipeline.
  const pipelineIndex = (() => {
    if (status === "draft" || status === "uploaded" || status === "detecting" || status === "mapping_required") return 0;
    if (status === "validating") return 1;
    if (status === "validation_failed") return 1;
    if (status === "ready_to_import") return 2;
    if (status === "import_queued") return 2;
    if (status === "import_running") return 3;
    if (status === "import_partial" || status === "import_failed") return 3;
    if (status === "import_succeeded") return 4;
    if (status === "rolled_back" || status === "cancelled") return 4;
    return 0;
  })();

  return (
    <div className="flex items-start gap-0 overflow-x-auto pb-1">
      {PIPELINE.map((step, idx) => {
        const isCompleted = !isFailure && idx < pipelineIndex;
        const isCurrent = !isFailure && idx === pipelineIndex;
        const isDone = step === "import_succeeded" && status === "import_succeeded";
        return (
          <div key={step} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center">
              <div className={cn(
                "size-7 rounded-full flex items-center justify-center text-xs font-semibold border-2 transition-colors",
                (isCompleted || isDone) && "bg-primary border-primary text-white",
                isCurrent && !isDone && "bg-white border-primary text-primary",
                !isCompleted && !isCurrent && !isDone && "bg-gray-50 border-gray-200 text-gray-400",
              )}>
                {isCompleted || isDone ? <Check className="size-3" /> : idx + 1}
              </div>
              <p className={cn(
                "text-[10px] mt-1.5 whitespace-nowrap font-medium",
                (isCompleted || isDone) && "text-primary",
                isCurrent && !isDone && "text-primary",
                !isCompleted && !isCurrent && !isDone && "text-gray-400",
              )}>
                {PIPELINE_LABEL[step]}
              </p>
            </div>
            {idx < PIPELINE.length - 1 && (
              <div className={cn(
                "h-0.5 w-10 mb-4 mx-0.5 transition-colors",
                idx < pipelineIndex && !isFailure ? "bg-primary" : "bg-gray-200",
              )} />
            )}
          </div>
        );
      })}
      {isFailure && (
        <div className="flex items-center ml-2">
          <div className="h-0.5 w-8 bg-gray-200 mb-4" />
          <div className="flex flex-col items-center">
            <div className="size-7 rounded-full flex items-center justify-center bg-red-100 border-2 border-red-400 text-red-600">
              <AlertTriangle className="size-3.5" />
            </div>
            <p className="text-[10px] mt-1.5 whitespace-nowrap text-red-500 font-medium">
              {STATUS_LABEL[status]}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
