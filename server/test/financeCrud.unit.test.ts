// Unit test murni (tanpa koneksi DB) untuk helper pagination yang dipakai di
// seluruh endpoint list finance — memastikan angka offset/page/pageSize/totalPages
// tetap benar untuk kasus edge (nilai default, dibatasi max, nilai tidak valid).
import { describe, it, expect } from 'vitest';
import { parsePagination, paginationMeta } from '../lib/financeCrud.js';

function fakeReq(query: Record<string, any>) {
  return { query } as any;
}

describe('parsePagination', () => {
  it('pakai default kalau page/pageSize tidak dikirim', () => {
    const r = parsePagination(fakeReq({}));
    expect(r).toEqual({ page: 1, pageSize: 100, offset: 0 });
  });

  it('menghitung offset dengan benar untuk halaman > 1', () => {
    const r = parsePagination(fakeReq({ page: '3', pageSize: '20' }));
    expect(r).toEqual({ page: 3, pageSize: 20, offset: 40 });
  });

  it('membatasi pageSize ke maxPageSize kalau melebihi', () => {
    const r = parsePagination(fakeReq({ pageSize: '9999' }), 100, 500);
    expect(r.pageSize).toBe(500);
  });

  it('pakai default/max besar untuk master data (500/500)', () => {
    const r = parsePagination(fakeReq({}), 500, 500);
    expect(r).toEqual({ page: 1, pageSize: 500, offset: 0 });
  });

  it('mengabaikan nilai page/pageSize tidak valid (0, negatif, NaN) dan jatuh ke default', () => {
    expect(parsePagination(fakeReq({ page: '0' })).page).toBe(1);
    expect(parsePagination(fakeReq({ page: '-5' })).page).toBe(1);
    expect(parsePagination(fakeReq({ page: 'abc' })).page).toBe(1);
    expect(parsePagination(fakeReq({ pageSize: '-1' })).pageSize).toBe(100);
    expect(parsePagination(fakeReq({ pageSize: '0' })).pageSize).toBe(100);
  });
});

describe('paginationMeta', () => {
  it('menghitung totalPages dengan pembulatan ke atas', () => {
    expect(paginationMeta(101, 1, 100)).toEqual({ total: 101, page: 1, pageSize: 100, totalPages: 2 });
    expect(paginationMeta(100, 1, 100)).toEqual({ total: 100, page: 1, pageSize: 100, totalPages: 1 });
    expect(paginationMeta(0, 1, 100)).toEqual({ total: 0, page: 1, pageSize: 100, totalPages: 1 });
  });
});
