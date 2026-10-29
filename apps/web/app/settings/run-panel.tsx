'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { RunStatus } from '@app/core';
import { runNow } from './run-actions';

const STATUS_LABEL: Record<RunStatus['status'], string> = {
  queued: '⏳ Đang khởi động',
  running: '⏳ Đang chạy',
  done: '✓ Xong',
  failed: '✗ Lỗi',
};

function fmt(iso?: string) {
  return iso
    ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : '';
}

export function RunPanel({ lastRun, active }: { lastRun: RunStatus | null; active: boolean }) {
  const router = useRouter();
  const [error, action, pending] = useActionState(runNow, null);

  // Đang chạy thì tự làm mới trang mỗi 5 giây để cập nhật trạng thái
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);

  return (
    <div className="card settings">
      <div>
        <strong>Chạy ngay</strong>
        <div className="meta">Lấy bài mới rồi tạo bản tin hôm nay — chạy được cả khi lịch tự động đang tắt. Mất khoảng 2–3 phút, tốn ~$0.5.</div>
      </div>

      {lastRun && (
        <div className={lastRun.status === 'failed' ? 'warn' : active ? '' : 'on'}>
          {STATUS_LABEL[lastRun.status]}
          {lastRun.step && active ? ` — ${lastRun.step}` : ''} · {lastRun.trigger === 'manual' ? 'chạy tay' : 'theo lịch'} lúc{' '}
          {fmt(lastRun.started_at)}
          {lastRun.message && !active && <pre className="run-log">{lastRun.message}</pre>}
        </div>
      )}

      <form action={action} className="settings">
        <label className="switch-row">
          <input type="checkbox" name="force" />
          <span>
            <strong>Tạo lại bản tin hôm nay nếu đã có</strong>
            <span className="meta">Bản tin cũ của hôm nay và các lựa chọn / bản sửa trên đó sẽ bị xóa.</span>
          </span>
        </label>
        <div>
          <button type="submit" disabled={pending || active}>
            {active ? 'Đang chạy…' : pending ? 'Đang gửi…' : '▶ Chạy ngay'}
          </button>
        </div>
        {error && <p className="warn">{error}</p>}
      </form>
    </div>
  );
}
