'use client';
import { useActionState, useRef } from 'react';
import { SubmitButton } from '@/components/submit-button';
import { changeStatus, overrideIncentive, runCalculation, uploadFile } from './actions';

export function UploadForm({ period, kind, hasFile }: { period: string; kind: string; hasFile: boolean }) {
  const [state, action] = useActionState(uploadFile, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <div className="stack" style={{ gap: 8 }}>
      <form ref={formRef} action={action} className="row">
        <input type="hidden" name="period" value={period} />
        <input type="hidden" name="kind" value={kind} />
        <input type="file" name="file" accept=".xlsx" required aria-label="Pilih file" />
        <SubmitButton
          pendingText="Mengupload…"
          className="btn btn-primary"
          confirm={hasFile ? 'File sebelumnya akan digantikan dan hasil hitung perlu dihitung ulang. Lanjutkan?' : undefined}
        >
          {hasFile ? 'Ganti file' : 'Upload'}
        </SubmitButton>
      </form>
      {state?.kind === kind && state.error && <p className="note note-error">{state.error}</p>}
      {state?.kind === kind && state.ok && <p className="note note-ok">{state.ok}</p>}
      {state?.kind === kind && state.warnings?.length ? (
        <div className="note note-warning small">
          {state.warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CalculateForm({ period, disabled, recalc }: { period: string; disabled: boolean; recalc: boolean }) {
  const [error, action] = useActionState(runCalculation, null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="period" value={period} />
      <div>
        <SubmitButton pendingText="Menghitung…" className="btn btn-primary" disabled={disabled}>
          {recalc ? 'Hitung ulang KPI' : 'Hitung KPI'}
        </SubmitButton>
      </div>
      {error && <p className="note note-error">{error}</p>}
    </form>
  );
}

const DECISION_TEXT: Record<string, { label: string; primary?: boolean; note?: string; confirm?: string }> = {
  submitted: { label: 'Ajukan ke HR Manager', primary: true },
  approved: { label: 'Setujui', primary: true },
  rejected: { label: 'Kembalikan untuk revisi', note: 'Alasan pengembalian (wajib)' },
  locked: { label: 'Kunci periode', primary: true, confirm: 'Setelah dikunci, data dan hasil tidak bisa diubah. Lanjutkan?' },
  reopened: { label: 'Buka kembali', note: 'Alasan membuka kembali (wajib)', confirm: 'Periode akan kembali ke status Dihitung dan perlu disetujui ulang. Lanjutkan?' },
};

export function TransitionForm({ period, decisions }: { period: string; decisions: string[] }) {
  const [error, action] = useActionState(changeStatus, null);
  if (!decisions.length) return null;
  return (
    <div className="stack">
      {decisions.map((d) => {
        const t = DECISION_TEXT[d];
        return (
          <form key={d} action={action} className="row" style={{ alignItems: 'flex-end' }}>
            <input type="hidden" name="period" value={period} />
            <input type="hidden" name="decision" value={d} />
            {t.note && (
              <label className="field" style={{ flex: '1 1 260px' }}>
                {t.note}
                <input type="text" name="note" minLength={5} required />
              </label>
            )}
            <SubmitButton pendingText="Menyimpan…" className={t.primary ? 'btn btn-primary' : 'btn'} confirm={t.confirm}>
              {t.label}
            </SubmitButton>
          </form>
        );
      })}
      {error && <p className="note note-error">{error}</p>}
    </div>
  );
}

export function OverrideForm({ period, nik }: { period: string; nik: string }) {
  const [error, action] = useActionState(overrideIncentive, null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="nik" value={nik} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field">
          Insentif baru (Rp)
          <input type="text" inputMode="numeric" name="value" placeholder="mis. 750000" required />
        </label>
        <label className="field" style={{ flex: '1 1 320px' }}>
          Alasan
          <input type="text" name="reason" minLength={10} placeholder="mis. Koreksi omzet faktur yang salah input" required />
        </label>
        <SubmitButton pendingText="Menyimpan…">Simpan override</SubmitButton>
      </div>
      {error && <p className="note note-error">{error}</p>}
    </form>
  );
}
