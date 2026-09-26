/**
 * `gray-03` and `gray-04` are surface tints, never ink.
 *
 * The host applications define them as near-white (`#F7F7F7`, `#F9F9F8`) to
 * fill a card, a chip or a track. Their names sit in the same numbered scale as
 * the text greys, though, so they read like a lighter step of `gray-02` and get
 * reached for as an icon or text colour - where they land on a white box and
 * vanish. Row arrows across the procurement lists, the approvals search icon
 * and the "-" shown for an empty amount have all gone invisible this way.
 *
 * Muted text and icons want `gray-05`; a deliberately faint mark wants
 * `gray-02`. Fills and strokes are not matched, because a track or background
 * drawn in a tint is what the tint is for. `surface-tints.test.ts` runs this
 * over the whole package in both applications' suites.
 */
const INK_ON_A_TINT = /\btext-gray-0[34]\b/;

/** Every `file:line` in `sources` that colours text or an icon with a surface tint. */
export function inkOnATint(sources: Record<string, string>): string[] {
  return Object.entries(sources).flatMap(([file, text]) =>
    text
      .split("\n")
      .flatMap((line, i) => (INK_ON_A_TINT.test(line) ? [`${file}:${i + 1}`] : [])),
  );
}
