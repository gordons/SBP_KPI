'use client';
import { useActionState } from 'react';
import { createPeriod } from './actions';

export function CreatePeriodForm({ suggestion }: { suggestion: string }) {
  const [error, action, pending] = useActionState(createPeriod, null);
  return (
    <form action={action} className="row" style={{ alignItems: 'flex-end' }}>
      <label className="field">
        Bulan
        <input type="month" name="period" defaultValue={suggestion} required />
      </label>
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? 'Membuat…' : 'Buat periode'}
      </button>
      {error && <p className="note note-error">{error}</p>}
    </form>
  );
}
