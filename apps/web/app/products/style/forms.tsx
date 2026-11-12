'use client';

import { useActionState, useState, useTransition } from 'react';
import { addGoldByUrl, refreshStyleNow, saveStyleNotes, toggleGold } from '../actions';

export function StyleEditor({ notes, canRefresh }: { notes: string; canRefresh: boolean }) {
  const [msg, save, saving] = useActionState(saveStyleNotes, null);
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form action={save} className="settings">
      <textarea
        name="notes"
        rows={10}
        defaultValue={notes}
        placeholder={'Chưa có luật nào. Sửa tay vài bài rồi bấm "Rút luật ngay", hoặc tự gõ, mỗi dòng một luật:\n- Meta description kết thúc bằng mã sản phẩm\n- Không dùng cụm "trải nghiệm tuyệt vời"'}
      />
      <div className="inline">
        <button type="submit" disabled={saving}>Lưu</button>
        <button
          type="button"
          className="ghost"
          disabled={pending || !canRefresh}
          title={canRefresh ? '' : 'Chưa có bản sửa tay nào'}
          onClick={() => {
            if (confirm('Rút lại luật từ các bản sửa tay? (~$0.05–0.1) — luật đang có sẽ được AI cập nhật, chỗ mày tự gõ có thể bị viết lại.'))
              start(async () => setRefreshMsg(await refreshStyleNow()));
          }}
        >
          ↻ Rút luật ngay từ bản sửa
        </button>
        {(msg || refreshMsg) && <span className={(refreshMsg ?? msg)?.startsWith('✓') ? 'on' : 'warn'}>{refreshMsg ?? msg}</span>}
      </div>
    </form>
  );
}

export function GoldToggle({ wooId, gold }: { wooId: number; gold: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button className="ghost small" disabled={pending} onClick={() => start(() => toggleGold(wooId, !gold))}>
      {gold ? '★ Bỏ mẫu chuẩn' : '☆ Đặt làm mẫu chuẩn'}
    </button>
  );
}

export function AddGoldForm() {
  const [msg, action, pending] = useActionState(addGoldByUrl, null);
  return (
    <form action={action} className="inline">
      <input name="url" placeholder="Dán link sản phẩm trên web, vd https://soccerstore.vn/san-pham/…" />
      <button type="submit" className="ghost" disabled={pending}>＋ Thêm mẫu chuẩn</button>
      {msg && <span className={msg.startsWith('✓') ? 'on' : 'warn'}>{msg}</span>}
    </form>
  );
}
