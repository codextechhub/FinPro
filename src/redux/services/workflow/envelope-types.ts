/**
 * The two response shells these services wrap their rows in.
 *
 * Declared here rather than imported from a host. Both apps have their own
 * copy under their own path - ``@/types`` in one, ``auth-types`` in the other -
 * and a shared service that reached for either would compile in one app and
 * fail in the other. Four fields; carrying them costs less than the coupling.
 */
export interface Pagination {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface PaginatedResponse {
  success: boolean;
  message: string;
  pagination: Pagination;
}

export interface ResponseMessage {
  status: boolean;
  message: string;
}
