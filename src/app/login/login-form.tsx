'use client';
import { useActionState } from 'react';
import { signIn } from './actions';

export function LoginForm() {
  const [error, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="stack">
      <h2>Masuk</h2>
      <label className="field">
        Email
        <input type="email" name="email" autoComplete="email" required />
      </label>
      <label className="field">
        Kata sandi
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      {error && <p className="note note-error">{error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Memeriksa…' : 'Masuk'}
      </button>
      <p className="small muted">Belum punya akun? Minta HR Manager membuatkan akun dan peran Anda.</p>
    </form>
  );
}
