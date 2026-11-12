'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { runStyle } from '../settings/run-actions';
import { addCaptions } from './actions';

export function AddCaptionsForm() {
  const [message, action, pending] = useActionState(addCaptions, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (message?.startsWith('Đã thêm')) formRef.current?.reset();
  }, [message]);

  return (
    <form ref={formRef} action={action} className="card settings wide">
      <label>
        <strong>Dán caption đã đăng</strong>
        <span className="meta">Nhiều caption thì ngăn cách bằng một dòng chỉ có ---</span>
        <textarea name="captions" rows={10} placeholder={'Caption thứ nhất…\n---\nCaption thứ hai…'} />
      </label>
      <div className="inline">
        <button type="submit" disabled={pending}>{pending ? 'Đang lưu…' : 'Thêm vào kho'}</button>
        {message && <span className={message.startsWith('Đã thêm') ? 'on' : 'warn'}>{message}</span>}
      </div>
    </form>
  );
}

export function RefreshStyleButton({ active, status }: { active: boolean; status: string | null }) {
  const router = useRouter();
  const [error, action, pending] = useActionState(runStyle, null);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);

  return (
    <form action={action} className="inline">
      <button type="submit" className="ghost" disabled={pending || active}>
        {active ? 'Đang chạy…' : '✨ Cập nhật bằng AI'}
      </button>
      {status && <span className="meta">{status}</span>}
      {error && <span className="warn">{error}</span>}
    </form>
  );
}
