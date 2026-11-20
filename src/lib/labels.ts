// Label dan format tampilan (Bahasa Indonesia)

export const STATUS_STEPS = [
  { code: 'draft', label: 'Draft', hint: 'Upload data' },
  { code: 'calculated', label: 'Dihitung', hint: 'Cek hasil' },
  { code: 'submitted', label: 'Diajukan', hint: 'Menunggu HR Manager' },
  { code: 'approved', label: 'Disetujui', hint: 'Siap dikunci' },
  { code: 'locked', label: 'Dikunci', hint: 'Final untuk payroll' },
] as const;

export type PeriodStatus = (typeof STATUS_STEPS)[number]['code'];

export const statusLabel = (s: string) => STATUS_STEPS.find((x) => x.code === s)?.label ?? s;

export const ROLE_LABEL: Record<string, string> = {
  hr_admin: 'HR Admin',
  hr_manager: 'HR Manager',
  viewer: 'Viewer',
};

export const KIND_LABEL: Record<string, string> = {
  placement: 'Penempatan',
  sales: 'Sales',
  returns: 'Retur',
  attendance: 'Absensi',
  events: 'Data KPI Lain',
};

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function periodLabel(p: string) {
  const [y, m] = p.split('-').map(Number);
  return `${BULAN[m - 1]} ${y}`;
}

export const rupiah = (n: number | null | undefined) =>
  n == null ? '–' : 'Rp ' + Math.round(n).toLocaleString('id-ID');

export const juta = (n: number | null | undefined) =>
  n == null ? '–' : (n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';

export const pct = (n: number | null | undefined, digits = 1) =>
  n == null ? '–' : (n * 100).toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits }) + '%';

export const angka = (n: number | null | undefined) => (n == null ? '–' : n.toLocaleString('id-ID'));

export function tanggalWaktu(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
}
