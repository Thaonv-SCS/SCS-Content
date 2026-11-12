'use client';

import { useActionState } from 'react';
import { syncWebsite } from './actions';

export function SyncWebsiteButton() {
  const [message, action, pending] = useActionState(syncWebsite, null);
  return (
    <form action={action} className="inline">
      <button type="submit" className="ghost" disabled={pending}>{pending ? 'Đang đồng bộ…' : '↻ Đồng bộ dữ liệu website'}</button>
      {message && <span className={message.startsWith('✓') ? 'on' : 'warn'}>{message}</span>}
    </form>
  );
}
