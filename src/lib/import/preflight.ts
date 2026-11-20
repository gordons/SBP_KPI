import type { PeriodInput, Settings } from '../engine/types';

// =============================================================
// Panel rekonsiliasi sebelum hitung. Hasil 'error' memblokir tombol Hitung,
// 'warning' hanya ditampilkan.
// =============================================================

export interface PreflightItem {
  level: 'error' | 'warning' | 'info';
  message: string;
}

export interface StoreTotal {
  store: string;
  invoices: number;
  total: number; // semua kategori
  counted: number; // kategori yang dihitung di KPI
  nonIndividual: number; // tanpa NIK
}

export interface PreflightResult {
  items: PreflightItem[];
  storeTotals: StoreTotal[];
  canCalculate: boolean;
}

export function preflight(input: PeriodInput, s: Settings, uploaded: Set<string>): PreflightResult {
  const items: PreflightItem[] = [];
  const add = (level: PreflightItem['level'], message: string) => items.push({ level, message });

  // 1. Template wajib
  if (!uploaded.has('placement')) add('error', 'Template Penempatan belum diupload.');
  if (!uploaded.has('sales')) add('error', 'Template Sales belum diupload.');
  for (const [kind, label, source] of [
    ['returns', 'Retur', 'returns'],
    ['attendance', 'Absensi', 'attendance'],
    ['events', 'Data KPI Lain', 'events'],
  ] as const) {
    const used = s.templates.some((t) =>
      t.components.some((c) => c.active && c.indicator && s.indicators.find((i) => i.code === c.indicator)?.source === source),
    );
    if (used && !uploaded.has(kind)) add('warning', `Template ${label} belum diupload, padahal dipakai komponen KPI aktif.`);
  }

  // 2. Setting yang dibutuhkan
  for (const st of new Set(input.placements.map((p) => p.store))) {
    if (!s.stores.find((x) => x.code === st)) add('error', `Toko ${st} belum terdaftar di Setting.`);
    if (s.storeTargets[st]?.[input.period] === undefined) add('error', `Target toko ${st} untuk ${input.period} belum diisi.`);
  }
  for (const pos of new Set(input.placements.map((p) => p.position))) {
    if (!s.templates.find((t) => t.position === pos)) add('error', `Jabatan ${pos} belum punya template KPI.`);
  }

  // 3. Kelengkapan data per karyawan
  const salesNik = new Set(input.sales.map((x) => x.nik).filter(Boolean));
  const attNik = new Set(input.attendance.map((x) => x.nik));
  const sp = input.placements.filter((p) => p.position === 'SP');
  const noSales = sp.filter((p) => !salesNik.has(p.nik));
  if (noSales.length) add('warning', `${noSales.length} SP tanpa penjualan: ${noSales.map((p) => p.name).join(', ')}.`);
  if (uploaded.has('attendance')) {
    const noAtt = input.placements.filter((p) => !attNik.has(p.nik));
    if (noAtt.length) add('warning', `${noAtt.length} karyawan tanpa data absensi (komponen absensi dianggap tanpa data): ${noAtt.map((p) => p.name).join(', ')}.`);
  }
  for (const st of new Set(input.placements.map((p) => p.store))) {
    if (!input.placements.some((p) => p.store === st && p.position === 'TL') && input.placements.some((p) => p.store === st && p.position === 'SP')) {
      add('warning', `Toko ${st} tidak punya TL. Komponen yang menilai TL akan dialihkan bobotnya.`);
    }
  }

  // 4. Retur tanpa BA
  const noBA = input.returns.filter((r) => !r.hasBA).length;
  if (noBA) add('info', `${noBA} dari ${input.returns.length} retur belum ada BA.`);

  // 5. Rekap omzet per toko (untuk dicocokkan dengan total di sistem sumber)
  const counted = new Set(s.dataRules.salesCategoriesCounted);
  const map = new Map<string, StoreTotal>();
  for (const x of input.sales) {
    const t = map.get(x.store) ?? { store: x.store, invoices: 0, total: 0, counted: 0, nonIndividual: 0 };
    t.invoices += 1;
    t.total += x.amount;
    if (counted.has(x.category)) t.counted += x.amount;
    if (!x.nik) t.nonIndividual += x.amount;
    map.set(x.store, t);
  }

  return {
    items,
    storeTotals: [...map.values()].sort((a, b) => a.store.localeCompare(b.store)),
    canCalculate: !items.some((i) => i.level === 'error'),
  };
}
