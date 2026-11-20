// =============================================================
// Tipe data mesin KPI SBP
// Semua aturan hitung berasal dari Settings (data), bukan kode.
// =============================================================

export type Position = string; // 'SP' | 'TL' | 'ASM' | 'SM' | jabatan lain

/** Satu baris template Penempatan (snapshot per periode). */
export interface Placement {
  nik: string;
  name: string;
  position: Position;
  store: string;
  superiorNik: string | null;
  joinDate: string; // ISO YYYY-MM-DD
  facility: string | null; // mis. 'HP'
}

/** Satu baris template Sales (1 faktur). Faktur retur ditulis dengan nilai negatif. */
export interface SalesRow {
  invoiceNo: string;
  date: string;
  store: string;
  nik: string | null; // null = non-individu (masuk omzet toko saja)
  amount: number;
  category: string; // NORMAL | AFILIASI | IMPORT | ONGKIR | ...
}

/** Satu baris template Retur (1 faktur retur). Dipakai untuk menghitung JUMLAH retur. */
export interface ReturnRow {
  returnNo: string;
  originalInvoiceNo: string | null;
  date: string;
  nik: string;
  amount: number;
  cause: string;
  hasBA: boolean;
}

/** Satu baris template Absensi (1 karyawan per periode). */
export interface AttendanceRow {
  nik: string;
  counts: Record<string, number>; // kode -> jumlah, mis. { TELAT: 1, STSD: 0, ALPA: 2 }
}

/** Satu baris template Data KPI lain (1 kejadian). */
export interface EventRow {
  nik: string;
  indicatorCode: string;
  date: string;
  value: number;
}

export interface PeriodInput {
  period: string; // 'YYYY-MM'
  placements: Placement[];
  sales: SalesRow[];
  returns: ReturnRow[];
  attendance: AttendanceRow[];
  events: EventRow[];
}

// ---------------- Settings ----------------

export interface StepRow {
  min: number; // berlaku jika jumlah >= min
  value: number;
}

export interface TenureTable {
  baseTarget: number;
  facilityAmounts: Record<string, number>; // { HP: 100_000_000 }
  /** Tambahan target jika masa kerja (bulan) > afterMonths. Semua tangga yang terlewati dijumlahkan. */
  steps: { afterMonths: number; amount: number }[];
}

export interface StoreConfig {
  code: string;
  group: string;
  /** Cara menghitung target SP di toko ini. */
  spTargetMethod: 'tenure' | 'split';
  tlPersonalTarget: number;
  tierTable: string;
}

export interface TierTable {
  thresholds: number[]; // urut menurun, mis. [1.2, 1.1, 1.0, 0.9, 0.8]
  rates: Record<Position, number[]>; // tarif per ambang, panjang sama dengan thresholds
  belowLabel: string; // 'SP1'
}

export type IndicatorSource = 'sales' | 'returns' | 'attendance' | 'events';
export type IndicatorLevel = 'self' | 'team' | 'store';

export interface IndicatorDef {
  code: string;
  name: string;
  source: IndicatorSource;
  agg: 'sum' | 'count';
  level: IndicatorLevel;
  /** Khusus source 'events': kode indikator pada template Data KPI lain. */
  eventCode?: string;
}

export type TargetDef =
  | { type: 'sp_target' } // rumus masa kerja atau split, tergantung toko
  | { type: 'store_target' }
  | { type: 'tl_personal' }
  | { type: 'team_sum'; includeOwn: 'tl_personal' | 'none' } // jumlah target bawahan langsung
  | { type: 'fixed'; value: number };

export interface ComponentDef {
  code: string;
  name: string;
  weight: number;
  active: boolean;
  method: 'ratio' | 'step' | 'subordinate_pass';
  indicator?: string;
  target?: TargetDef;
  direction?: 'higher' | 'lower';
  cap?: number | null;
  stepTable?: string;
  subordinate?: {
    position: Position;
    scope: 'direct' | 'store';
    threshold: number; // skor minimal dianggap lulus, mis. 1.0
  };
}

export interface PositionTemplate {
  position: Position;
  name: string;
  components: ComponentDef[];
  /** Indikator yang dikalikan tarif untuk menghasilkan insentif Rp. */
  incentiveBase: string;
  /** Primary target ditampilkan di hasil (target utama jabatan). */
  primaryComponent: string;
}

export interface Settings {
  stores: StoreConfig[];
  /** store -> 'YYYY-MM' -> target toko. Diisi sekali per tahun. */
  storeTargets: Record<string, Record<string, number>>;
  tenureTables: Record<string, TenureTable>; // per grup toko
  stepTables: Record<string, StepRow[]>;
  tierTables: Record<string, TierTable>;
  indicators: IndicatorDef[];
  templates: PositionTemplate[];
  /** Daftar pilihan (dropdown) di template upload. */
  lists: {
    positions: { code: Position; name: string }[];
    facilities: string[];
    salesCategories: string[];
    returnCauses: { code: string; name: string }[];
    absenceCodes: { code: string; name: string }[];
    eventCodes: { code: string; name: string }[];
  };
  dataRules: {
    salesCategoriesCounted: string[];
    returnCausesCounted: string[] | 'ALL';
    absenceCodesCounted: string[];
  };
  /** Komponen nonaktif / tanpa data: bobotnya dialihkan proporsional ke komponen lain. */
  redistributeInactiveWeight: boolean;
  /** Pembulatan insentif ke kelipatan ini (1 = rupiah penuh). */
  incentiveRounding: number;
}

// ---------------- Hasil ----------------

export interface ComponentResult {
  code: string;
  name: string;
  method: ComponentDef['method'];
  target: number | null;
  achieve: number | null;
  pct: number | null; // persen pencapaian (rasio) atau nilai tangga
  value: number | null; // nilai sebelum bobot
  weight: number; // bobot setelah pengalihan
  weighted: number; // value x weight
  status: 'ok' | 'inactive' | 'no_data';
  note?: string;
}

export interface EmployeeResult {
  nik: string;
  name: string;
  position: Position;
  store: string;
  tenureMonths: number;
  target: number | null;
  components: ComponentResult[];
  score: number;
  tierLabel: string; // '120%' ... atau 'SP1'
  rate: number;
  incentiveBase: number;
  incentive: number;
  warnings: string[];
}

export interface CalcOutput {
  period: string;
  results: EmployeeResult[];
  warnings: string[];
}
