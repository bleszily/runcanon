/** Parse limit/offset from URL search params with sane defaults. */
export function parsePagination(url: URL, defaultLimit = 25, maxLimit = 100): { limit: number; offset: number } {
  const limit = Math.min(Math.max(1, Number(url.searchParams.get("limit") ?? defaultLimit) || defaultLimit), maxLimit);
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);
  return { limit, offset };
}

export function paginate<T>(items: T[], limit: number, offset: number): { items: T[]; total: number; limit: number; offset: number } {
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    limit,
    offset,
  };
}
