/**
 * "Today", "Yesterday", or "3rd September 2026".
 *
 * Lifted out of the console so the workflow screens can be shared. It has no
 * finance in it and no console in it; it belongs to whichever app is rendering
 * a date somebody has to read rather than parse, and both of them are.
 */
export const formatRelativeDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "-";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  const day = date.getDate();
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";

  return `${day}${suffix} ${date.toLocaleString("en-GB", { month: "long" })} ${date.getFullYear()}`;
};

/**
 * An ISO calendar date: ``2026-09-04``.
 *
 * Deliberately not localised. This is the form a date takes in an input, in a
 * filter and in a payload, where a reader is matching it against something
 * rather than reading it as prose - and where "04/09/2026" means two different
 * days depending on who is looking.
 */
export const formatDate = (timestamp: string | number | Date): string => {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "-";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
