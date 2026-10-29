'use client';

import { useActionState } from 'react';
import { signIn } from '../auth-actions';

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="card login">
      <h1>Đăng nhập</h1>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Mật khẩu
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p className="warn">{error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Đang đăng nhập…' : 'Đăng nhập'}
      </button>
    </form>
  );
}
