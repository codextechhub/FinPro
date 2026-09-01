export const SOURCE_DOCUMENT_ID_PARAM = "document";

export function sourceDocumentIdFromParams(
  params: Pick<URLSearchParams, "get">,
): number | null {
  const value = Number(params.get(SOURCE_DOCUMENT_ID_PARAM));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
