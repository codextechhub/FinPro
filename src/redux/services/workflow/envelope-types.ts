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

/** Generic over its rows, with a default so the bare form still reads.

The two apps' own copies disagree on this: one is a bare envelope whose caller
adds ``data``, the other carries ``data: T[]``. Both spellings appear in the
services that moved here, so this accepts either - ``PaginatedResponse`` for the
bare shell, ``PaginatedResponse<OrgNode>`` where the rows are known. */
export interface PaginatedResponse<T = never> {
  success: boolean;
  message: string;
  pagination: Pagination;
  data?: T[];
}

export interface ResponseMessage {
  status: boolean;
  message: string;
}
