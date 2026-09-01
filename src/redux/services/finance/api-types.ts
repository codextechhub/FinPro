// Shared response envelopes for the Finance & Procurement consoles.
//
// The backend wraps every response in core.response / core.pagination:
//   • single/object  → { success, message, data }
//   • paginated list → { success, message, pagination, data: T[] }
//   • error          → { success:false, message, error } (handled centrally
//                       in base-api's interceptor)
// These generics mirror those shapes so each typed endpoint stays terse.

export interface ApiEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
}

export interface Pagination {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  next: string | null;
  previous: string | null;
}

export interface PaginatedEnvelope<T> {
  success: boolean;
  message: string;
  pagination: Pagination;
  data: T[];
}

/** Common list params threaded into every entity-scoped list endpoint. */
export interface EntityScopedParams {
  entity: string;
  page?: number;
  page_size?: number;
}

/**
 * Coerce an endpoint's `data` field to an array. The backend's success_response
 * does `data or {}`, so a list endpoint returns `[]` as `{}` when EMPTY - guard
 * every non-paginated list read with this so the UI never gets a non-array.
 */
export function toArray<T>(data: T[] | null | undefined): T[] {
  // Typed as T[]|undefined for inference, but the backend may actually send `{}`
  // at runtime - the guard catches that and returns an empty array.
  return Array.isArray(data) ? data : [];
}
