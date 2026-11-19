'use server';

import { revalidatePath } from 'next/cache';
import {
  fetchDuplicate405Page,
  fetchSizeTerms,
  fetchStockPage,
  findBySkus,
  updateStock,
  type StockItem,
  type StockStatus,
  type StockUpdate,
  type Visibility,
} from '@app/products';
import { currentUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
type Page = { items: StockItem[]; totalPages: number; total: number };

async function team(): Promise<string | null> {
  const me = await currentUser();
  return me && (me.role === 'admin' || me.role === 'staff') ? null : 'Tài khoản chưa được cấp quyền.';
}

const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: (err as Error).message });

async function guarded<T>(fn: () => Promise<T>): Promise<Result<T>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return fail(err);
  }
}

/** Một trang danh sách (100 sản phẩm) — trình duyệt gọi lần lượt từng trang để hiện tiến độ. */
export async function loadStockPage(stock: StockStatus | 'all', page: number): Promise<Result<Page>> {
  return guarded(() => fetchStockPage(stock, page));
}

/** Một trang các sản phẩm đang dùng bản "40.5" trùng (40½). */
export async function loadDuplicate405Page(page: number): Promise<Result<Page>> {
  return guarded(() => fetchDuplicate405Page(page));
}

export async function loadSizeTerms(): Promise<Result<string[]>> {
  return guarded(() => fetchSizeTerms());
}

export async function lookupSkus(text: string): Promise<Result<{ items: StockItem[]; missing: string[] }>> {
  const skus = text.split(/[\r\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
  if (!skus.length) return { ok: false, error: 'Chưa có mã nào.' };
  if (skus.length > 500) return { ok: false, error: 'Tối đa 500 mã mỗi lần.' };
  return guarded(() => findBySkus(skus));
}

export type ChangeKind = 'stock' | 'price' | 'size' | 'merge_size';

export type Change = {
  id: number;
  sku: string;
  name: string;
  kind: ChangeKind;
  old_stock?: string;
  new_stock?: StockStatus;
  old_visibility?: string;
  new_visibility?: Visibility;
  old_regular?: number | null;
  new_regular?: number | null;
  /** null = không giảm giá */
  old_sale?: number | null;
  new_sale?: number | null;
  old_sizes?: string[];
  new_sizes?: string[];
};

const sameSizes = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Change → lệnh gửi WooCommerce (null = không có gì để đổi). */
function toUpdate(c: Change): StockUpdate | null {
  const u: StockUpdate = { id: c.id };
  if (c.kind === 'stock') {
    if (c.new_stock && c.new_stock !== c.old_stock) u.stock_status = c.new_stock;
    if (c.new_visibility && c.new_visibility !== c.old_visibility) u.catalog_visibility = c.new_visibility;
  } else if (c.kind === 'price') {
    if (c.new_regular != null && c.new_regular !== c.old_regular) u.regular_price = String(c.new_regular);
    if (c.new_sale !== undefined && c.new_sale !== c.old_sale) u.sale_price = c.new_sale ? String(c.new_sale) : '';
  } else if (c.new_sizes && (c.kind === 'merge_size' || !sameSizes(c.old_sizes, c.new_sizes))) {
    u.sizes = c.new_sizes; // gộp size: gửi lại đúng danh sách cũ để WooCommerce chuyển sang bản 40.5 chuẩn
  }
  return Object.keys(u).length > 1 ? u : null;
}

/** Kiểm tra lại phía server (không tin dữ liệu trình duyệt gửi lên). */
async function validate(changes: Change[]): Promise<string | null> {
  for (const c of changes) {
    if (c.kind === 'price') {
      const regular = c.new_regular ?? c.old_regular;
      const sale = c.new_sale !== undefined ? c.new_sale : c.old_sale;
      if (!regular || regular <= 0) return `${c.sku}: thiếu giá niêm yết.`;
      if (sale && sale >= regular) return `${c.sku}: giá sale phải nhỏ hơn giá niêm yết.`;
    }
  }
  const sizes = [...new Set(changes.flatMap((c) => (c.kind === 'size' ? (c.new_sizes ?? []) : [])))];
  if (sizes.length) {
    const known = new Set(await fetchSizeTerms());
    const unknown = sizes.filter((s) => !known.has(s));
    if (unknown.length) return `Size không có trên web: ${unknown.join(', ')} (app không tự tạo size mới).`;
  }
  return null;
}

/**
 * Gửi một phần (≤ 25 sản phẩm) của một lần cập nhật lên web, ghi lịch sử những cái thành công.
 * Trình duyệt chia nhỏ và gọi lần lượt → không bị giới hạn thời gian của một yêu cầu, có thanh tiến độ.
 */
export async function applyStockChunk(runId: string, changes: Change[], undoOf?: string): Promise<Result<{ id: number; error?: string }[]>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  if (changes.length > 25) return { ok: false, error: 'Tối đa 25 sản phẩm mỗi phần.' };
  const invalid = await validate(changes).catch((e: Error) => e.message);
  if (invalid) return { ok: false, error: invalid };

  const pairs = changes.map((c) => ({ c, u: toUpdate(c) })).filter((p): p is { c: Change; u: StockUpdate } => !!p.u);
  if (!pairs.length) return { ok: true, data: [] };
  try {
    const results = await updateStock(pairs.map((p) => p.u));
    const okIds = new Set(results.filter((r) => !r.error).map((r) => r.id));
    const rows = pairs
      .filter((p) => okIds.has(p.c.id))
      .map(({ c }) => ({
        run_id: runId,
        kind: c.kind,
        woo_id: c.id,
        sku: c.sku,
        name: c.name,
        old_stock: c.old_stock ?? null,
        new_stock: c.new_stock ?? c.old_stock ?? null,
        old_visibility: c.old_visibility ?? null,
        new_visibility: c.new_visibility ?? c.old_visibility ?? null,
        old_regular: c.old_regular ?? null,
        new_regular: c.new_regular ?? c.old_regular ?? null,
        old_sale: c.old_sale ?? null,
        new_sale: c.new_sale !== undefined ? c.new_sale : (c.old_sale ?? null),
        old_sizes: c.old_sizes ?? null,
        new_sizes: c.new_sizes ?? null,
        undo_of: undoOf ?? null,
      }));
    if (rows.length) {
      const supabase = await supabaseServer();
      await supabase.from('stock_changes').insert(rows);
    }
    return { ok: true, data: results };
  } catch (err) {
    return fail(err);
  }
}

/** Các dòng của một lần cập nhật, đảo ngược mới ↔ cũ (để hoàn tác). */
export async function getRunChanges(runId: string): Promise<Result<Change[]>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('stock_changes')
    .select('kind,woo_id,sku,name,old_stock,new_stock,old_visibility,new_visibility,old_regular,new_regular,old_sale,new_sale,old_sizes,new_sizes,undone_at')
    .eq('run_id', runId);
  if (error) return { ok: false, error: error.message };
  if (data?.some((r) => r.undone_at)) return { ok: false, error: 'Lần này đã được hoàn tác rồi.' };
  if (data?.some((r) => r.kind === 'merge_size')) return { ok: false, error: 'Gộp size không cần hoàn tác — size hiển thị trên web vẫn y như cũ.' };
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.woo_id,
      sku: r.sku ?? '',
      name: r.name ?? '',
      kind: r.kind as ChangeKind,
      old_stock: r.new_stock ?? undefined,
      new_stock: (r.old_stock ?? undefined) as StockStatus | undefined,
      old_visibility: r.new_visibility ?? undefined,
      new_visibility: (r.old_visibility ?? undefined) as Visibility | undefined,
      old_regular: num(r.new_regular),
      new_regular: num(r.old_regular),
      old_sale: num(r.new_sale),
      new_sale: num(r.old_sale),
      old_sizes: r.new_sizes ?? undefined,
      new_sizes: r.old_sizes ?? undefined,
    })),
  };
}

export async function markUndone(runId: string) {
  if (await team()) return;
  const supabase = await supabaseServer();
  await supabase.from('stock_changes').update({ undone_at: new Date().toISOString() }).eq('run_id', runId);
  revalidatePath('/stock');
}
