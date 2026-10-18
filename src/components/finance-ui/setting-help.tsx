/**
 * The pieces every settings screen is built from, so that a setting shows its
 * name, its control and the service that reads it, and nothing else.
 *
 * One rule holds across them: an explanation is written once and sits behind
 * the ⓘ beside the thing it explains. A panel's ⓘ says what the panel is for;
 * a field's ⓘ says how to fill it in, then closes with what the server says a
 * change does (`SettingConsumer.impact`) under "What it changes". The "Used by"
 * chip under the control names the service and carries no sentence of its
 * own, because that sentence is already in the ⓘ.
 *
 * What stays on screen is what a reader acts on: labels, controls, the chip,
 * badges, validation and refusal messages, and the note saying why a form is
 * read-only. Short descriptions under the options of a choice also stay, so
 * two options can be told apart without opening anything.
 *
 * These sit inside `AccessField` as any other control does. The ⓘ stays
 * openable when the field is read-only (see `InfoHint`), and a hidden field
 * takes its ⓘ with it.
 */

import { useId, type ElementType, type ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SettingsPanel } from "@/components/settings/settings-layout";
import { cn } from "@/lib/utils";
import type { SettingConsumer } from "@/redux/services/finance/setup-types";
import { InfoHint } from "./info-hint";

type Consumer = SettingConsumer | null | undefined;

/** Pulls the 32px trigger into a line of text without making the line taller. */
const INLINE_HINT = "-my-2 -mr-1";

/**
 * The ⓘ for one setting or panel: its explanation, then what a change does.
 * Renders nothing when there is neither.
 */
export function SettingHint({ label, hint, consumer, className }: {
  /** The setting's name, read out as "About <label>". */
  label: string;
  hint?: ReactNode;
  consumer?: Consumer;
  className?: string;
}) {
  const impact = consumer?.impact?.trim();
  if (!hint && !impact) return null;
  return (
    <InfoHint ariaLabel={`About ${label}`} className={cn(INLINE_HINT, className)}>
      {hint ? <div className="space-y-1.5">{typeof hint === "string" ? <p>{hint}</p> : hint}</div> : null}
      {impact ? (
        <p className={cn(hint && "mt-2 border-t border-white-02 pt-2")}>
          <span className="font-semibold text-gray-01">What it changes: </span>{impact}
        </p>
      ) : null}
    </InfoHint>
  );
}

/** The "Used by" chip under a control. Its sentence lives in the ⓘ. */
export function UsedBy({ consumer }: { consumer?: Consumer }) {
  if (!consumer?.service) return null;
  return (
    <span className="mt-2 flex min-w-0">
      <Badge variant="success" className="max-w-full gap-1 font-mont text-[10px] font-normal">
        <CheckCircle2 className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">Used by {consumer.service}</span>
      </Badge>
    </span>
  );
}

/**
 * A labelled control: the name and its ⓘ, the control, then the chip.
 *
 * The label points at the control by id instead of wrapping it, because a
 * label wrapping the ⓘ as well would hand its clicks to the control and close
 * the explanation as it opens. `children` receives the id to put on the input.
 */
export function SettingField({ label, hint, consumer, className, children }: {
  label: string;
  hint?: ReactNode;
  consumer?: Consumer;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-w-0 items-center gap-1">
        <label htmlFor={id} className="font-mont text-xs font-semibold text-gray-01">{label}</label>
        <SettingHint label={label} hint={hint} consumer={consumer} />
      </div>
      <div className="mt-2">{children(id)}</div>
      <UsedBy consumer={consumer} />
    </div>
  );
}

/**
 * A setting's name with its ⓘ, for a row that lays out its own control. The ⓘ
 * runs inline after the last word, so a name that wraps keeps it beside it.
 */
export function SettingName({ label, suffix, hint, consumer }: {
  label: string;
  /** Shown after the name in lighter text, such as "(default)". */
  suffix?: ReactNode;
  hint?: ReactNode;
  consumer?: Consumer;
}) {
  return (
    <p className="min-w-0 font-mont text-sm font-medium text-gray-01">
      {label}{suffix ? <span className="ml-1.5 font-normal text-gray-05">{suffix}</span> : null}
      <SettingHint label={label} hint={hint} consumer={consumer} className="ml-0.5 align-middle" />
    </p>
  );
}

/** An on/off setting: its name and ⓘ with the chip beneath, and the switch. */
export function SettingToggle({ label, suffix, hint, consumer, checked, onCheckedChange, disabled }: {
  label: string;
  suffix?: ReactNode;
  hint?: ReactNode;
  consumer?: Consumer;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <SettingName label={label} suffix={suffix} hint={hint} consumer={consumer} />
        <UsedBy consumer={consumer} />
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

/**
 * A settings panel whose explanation sits behind an ⓘ beside its title.
 *
 * A panel that holds one setting with no label of its own, such as a list of
 * bands, passes that setting's `consumer` so its "What it changes" sentence
 * joins the panel's ⓘ.
 *
 * The heading is drawn as the panel's first row, so it keeps the host panel's
 * divider beneath it.
 */
export function HintedPanel({ title, hint, consumer, className, children }: {
  title: string;
  hint?: ReactNode;
  consumer?: Consumer;
  className?: string;
  children: ReactNode;
}) {
  return (
    <SettingsPanel className={className}>
      <div className="flex min-w-0 items-center gap-1 px-4 py-3.5 sm:px-5">
        <h3 className="font-mont text-sm font-semibold text-gray-01">{title}</h3>
        <SettingHint label={title} hint={hint} consumer={consumer} />
      </div>
      {children}
    </SettingsPanel>
  );
}

/**
 * A read-only line in a settings panel: an icon, a name with its ⓘ, and the
 * value or badge it reports. Laid out as the host's `SettingsRow` is.
 */
export function HintedRow({ icon: Icon, label, hint, value, badge }: {
  icon?: ElementType;
  label: string;
  hint?: ReactNode;
  value?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:px-5 xl:flex-row xl:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {Icon ? <span className="grid size-8 shrink-0 place-content-center rounded-md bg-gray-02 text-gray-05"><Icon className="size-4" /></span> : null}
        <SettingName label={label} hint={hint} />
      </div>
      {value || badge ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 pl-11 xl:max-w-[48%] xl:justify-end xl:pl-0">
          {value ? <span className="min-w-0 break-words text-right font-mont text-sm font-semibold text-gray-01">{value}</span> : null}
          {badge}
        </div>
      ) : null}
    </div>
  );
}
