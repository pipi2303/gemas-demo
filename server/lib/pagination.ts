// ============================================================
// Pagination generik — dipakai lintas modul (Finance Add-on & /api/data)
// ============================================================
/**
 * Pagination generik untuk endpoint listing (?page=&pageSize=).
 * Default pageSize besar (100, maks 500) supaya perilaku existing untuk
 * organisasi kecil tidak berubah, sambil tetap mencegah query tanpa batas
 * mengembalikan seluruh histori (bisa jadi ribuan baris) sekaligus.
 */
export function parsePagination(req: { query: any }, defaultPageSize = 100, maxPageSize = 500) {
  const rawPageSize = parseInt(String(req.query.pageSize ?? ''), 10);
  const pageSize = Math.min(Math.max(Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : defaultPageSize, 1), maxPageSize);
  const rawPage = parseInt(String(req.query.page ?? ''), 10);
  const page = Math.max(Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1, 1);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

export function paginationMeta(total: number, page: number, pageSize: number) {
  return { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
