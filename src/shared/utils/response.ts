/**
 * Typed response helpers for consistent API responses.
 *
 * NOTE: paul-explore currently expects raw response bodies (not wrapped).
 * Existing endpoints keep their "v1" shape. New endpoints should use these
 * helpers and set the X-API-Version: 2 header.
 */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export function success<T>(data: T): { data: T } {
  return { data };
}

export function paginated<T>(
  data: T[],
  pagination: PaginationMeta,
): { data: T[]; pagination: PaginationMeta } {
  return { data, pagination };
}

export function created<T>(data: T): { data: T } {
  return { data };
}
