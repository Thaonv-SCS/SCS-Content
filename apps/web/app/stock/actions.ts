'use server';

import { revalidatePath } from 'next/cache';
import { fetchStockPage, findBySkus, updateStock, type StockItem, type StockStatus, type Visibility } from '@app/products';
import { currentUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function team(): Promise<string | null> {
  const me = await currentUser();
  return me && (me.role === 'admin' || me.role === 'staff') ? null : 'Tài khoản chưa được cấp quyền.';
}

const fail = (err: unknown): { ok: false; error: string } => ({ ok: false, error: (err as Error).message });

/** Một trang danh sách (100 sản phẩm) — trình duyệt gọi lần lượt từng trang để hiện tiến độ. */
export async function loadStockPage(stock: StockStatus | 'all', page: number): Promise<Result<{ items: StockItem[]; totalPages: number; total: number }>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  try {
    return { ok: true, data: await fetchStockPage(stock, page) };
  } catch (err) {
    return fail(err);
  }
}

export async function lookupSkus(text: string): Promise<Result<{ items: StockItem[]; missing: string[] }>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  const skus = text.split(/[\r\n,;\t]+/).map((s) => s.trim()).filter(Boolean);
  if (!skus.length) return { ok: false, error: 'Chưa có mã nào.' };
  if (skus.length > 500) return { ok: false, error: 'Tối đa 500 mã mỗi lần.' };
  try {
    return { ok: true, data: await findBySkus(skus) };
  } catch (err) {
    return fail(err);
  }
}

export type Change = {
  id: number;
  sku: string;
  name: string;
  old_stock: string;
  old_visibility: string;
  new_stock?: StockStatus;
  new_visibility?: Visibility;
};

/**
 * Gửi một phần (≤ 25 sản phẩm) của một lần cập nhật lên web, ghi lịch sử những cái thành công.
 * Trình duyệt chia nhỏ và gọi lần lượt → không bị giới hạn thời gian của một yêu cầu, có thanh tiến độ.
 */
export async function applyStockChunk(runId: string, changes: Change[], undoOf?: string): Promise<Result<{ id: number; error?: string }[]>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  if (changes.length > 25) return { ok: false, error: 'Tối đa 25 sản phẩm mỗi phần.' };
  const updates = changes
    .map((c) => ({
      id: c.id,
      ...(c.new_stock && c.new_stock !== c.old_stock ? { stock_status: c.new_stock } : {}),
      ...(c.new_visibility && c.new_visibility !== c.old_visibility ? { catalog_visibility: c.new_visibility } : {}),
    }))
    .filter((u) => Object.keys(u).length > 1);
  if (!updates.length) return { ok: true, data: [] };
  try {
    const results = await updateStock(updates);
    const okIds = new Set(results.filter((r) => !r.error).map((r) => r.id));
    const supabase = await supabaseServer();
    const rows = changes
      .filter((c) => okIds.has(c.id))
      .map((c) => ({
        run_id: runId,
        woo_id: c.id,
        sku: c.sku,
        name: c.name,
        old_stock: c.old_stock,
        new_stock: c.new_stock ?? c.old_stock,
        old_visibility: c.old_visibility,
        new_visibility: c.new_visibility ?? c.old_visibility,
        undo_of: undoOf ?? null,
      }));
    if (rows.length) await supabase.from('stock_changes').insert(rows);
    return { ok: true, data: results };
  } catch (err) {
    return fail(err);
  }
}

/** Các dòng của một lần cập nhật (để hoàn tác: đảo ngược mới ↔ cũ). */
export async function getRunChanges(runId: string): Promise<Result<Change[]>> {
  const denied = await team();
  if (denied) return { ok: false, error: denied };
  const supabase = await supabaseServer();
  const { data, error } = await supabase
    .from('stock_changes')
    .select('woo_id,sku,name,old_stock,new_stock,old_visibility,new_visibility,undone_at')
    .eq('run_id', runId);
  if (error) return { ok: false, error: error.message };
  if (data?.some((r) => r.undone_at)) return { ok: false, error: 'Lần này đã được hoàn tác rồi.' };
  // Đảo ngược: trạng thái hiện tại (= mới) → trả về cũ
  return {
    ok: true,
    data: (data ?? []).map((r) => ({
      id: r.woo_id,
      sku: r.sku ?? '',
      name: r.name ?? '',
      old_stock: r.new_stock,
      old_visibility: r.new_visibility,
      new_stock: r.old_stock as StockStatus,
      new_visibility: r.old_visibility as Visibility,
    })),
  };
}

export async function markUndone(runId: string) {
  if (await team()) return;
  const supabase = await supabaseServer();
  await supabase.from('stock_changes').update({ undone_at: new Date().toISOString() }).eq('run_id', runId);
  revalidatePath('/stock');
}

export async function refreshHistory() {
  revalidatePath('/stock');
}
