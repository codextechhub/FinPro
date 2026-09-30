import { useEffect, useMemo, useRef, useState } from "react";
import { SearchSelect } from "@/components/custom/search-select";
import { useUserDirectory } from "./use-user-directory";

/**
 * Pick one person from the people the host lets the reader name.
 *
 * The directory is the host's (see `useDirectory` in the host contract), read
 * once and shared with every other screen that resolves a name. A filter that
 * looks back over requests offers everybody, including people who have since
 * left; a picker that hands somebody approvals passes `activeOnly`, because
 * only an active person can act on them. The server checks the same thing, and
 * branch reach besides, so the list is a convenience rather than the rule.
 *
 * Two behaviours hold wherever the picker is placed:
 *
 * - Choosing somebody closes the list and clears what was typed. The field is
 *   rebuilt after each choice, so a picker whose caller keeps no value (the
 *   approver editor's "Add a person", which moves the choice into a list) is
 *   left empty and ready for the next name rather than holding the last search,
 *   and a picker that does keep the value shows the chosen name. Focus returns
 *   to the field.
 * - Escape with the list open closes the list only. The dialog or sheet around
 *   the picker listens for Escape on the whole document and would otherwise
 *   close too, throwing away everything entered in it; marking the key press
 *   as handled before it gets there leaves the dialog open.
 */
export function PersonPicker({
  id,
  label,
  value,
  onChange,
  placeholder = "Search by name",
  exclude,
  activeOnly = false,
  isRequired,
  disabled,
  error,
  containerClass,
}: {
  id: string;
  label?: string;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  /** People not to offer, such as those already on a stage. */
  exclude?: readonly string[];
  activeOnly?: boolean;
  isRequired?: boolean;
  disabled?: boolean;
  error?: string;
  containerClass?: string;
}) {
  const { byId, isLoading } = useUserDirectory();
  const [generation, setGeneration] = useState(0);
  const refocus = useRef(false);

  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    document.getElementById(id)?.focus();
  }, [generation, id]);

  useEffect(() => {
    // Capture on window runs before a dialog's own listener on the document.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.getElementById(id)?.getAttribute("aria-expanded") === "true") event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [id]);

  const options = useMemo(() => {
    const skip = new Set(exclude ?? []);
    return Array.from(byId.values())
      .filter((u) => !skip.has(String(u.id)) && (!activeOnly || u.status === "ACTIVE"))
      .map((u) => ({
        value: String(u.id),
        label: u.role ? `${u.full_name || u.email} (${u.role})` : u.full_name || u.email,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [byId, exclude, activeOnly]);

  return (
    <SearchSelect
      key={generation}
      id={id}
      label={label}
      placeholder={placeholder}
      options={options}
      value={value}
      loading={isLoading}
      isRequired={isRequired}
      disabled={disabled}
      error={error}
      containerClass={containerClass}
      onChange={(e) => {
        const chosen = e.target.value;
        onChange(chosen);
        if (!chosen) return;
        refocus.current = true;
        setGeneration((g) => g + 1);
      }}
    />
  );
}
