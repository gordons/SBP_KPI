import type { Settings, TenureTable } from './types';

// =============================================================
// Setting awal SBP 2026, diambil dari workbook Rumus Insentif Oktober 2026
// dengan perbaikan yang sudah disepakati. Di aplikasi, semua nilai ini
// disimpan di database (settings_versions) dan diubah lewat menu Setting.
// =============================================================

const M = 1_000_000;

const tenure: TenureTable = {
  baseTarget: 100 * M,
  facilityAmounts: { HP: 100 * M },
  steps: [
    { afterMonths: 3, amount: 100 * M },
    { afterMonths: 6, amount: 125 * M },
    { afterMonths: 9, amount: 125 * M },
    { afterMonths: 12, amount: 125 * M },
    { afterMonths: 15, amount: 125 * M },
    { afterMonths: 18, amount: 125 * M },
    { afterMonths: 21, amount: 125 * M },
    { afterMonths: 24, amount: 125 * M },
    { afterMonths: 30, amount: 125 * M },
    { afterMonths: 36, amount: 125 * M },
  ],
};

const months = (values: number[]) =>
  Object.fromEntries(values.map((v, i) => [`2026-${String(i + 1).padStart(2, '0')}`, v * M]));

export const SBP_SETTINGS_2026: Settings = {
  stores: [
    { code: 'TBB', group: 'TENURE', spTargetMethod: 'tenure', tlPersonalTarget: 300 * M, tierTable: 'STANDAR' },
    { code: 'MLN', group: 'TENURE', spTargetMethod: 'tenure', tlPersonalTarget: 300 * M, tierTable: 'STANDAR' },
    { code: 'DRM', group: 'SPLIT', spTargetMethod: 'split', tlPersonalTarget: 300 * M, tierTable: 'STANDAR' },
    { code: 'MSA', group: 'SPLIT', spTargetMethod: 'split', tlPersonalTarget: 300 * M, tierTable: 'STANDAR' },
  ],

  // Target toko Jan–Des 2026 (juta Rp).
  // MSA: blok "MSA bagi 2" di sheet Target dikali 2 (Okt = 950 jt, sama dengan sheet Target Toko). PERLU DIKONFIRMASI.
  storeTargets: {
    TBB: months([12900, 12800, 8500, 13000, 12900, 12900, 12200, 11200, 11700, 11700, 10200, 12200]),
    MLN: months([12500, 13500, 10500, 11500, 12000, 13500, 11500, 10500, 10500, 11500, 12000, 13000]),
    DRM: months([2000, 1900, 1600, 2200, 1850, 1850, 1850, 1750, 1550, 1750, 1550, 1850]),
    MSA: months([850, 1000, 850, 900, 950, 1000, 1000, 900, 900, 950, 1000, 1200]),
  },

  tenureTables: { TENURE: tenure, SPLIT: tenure },

  stepTables: {
    RETUR: [
      { min: 0, value: 1 },
      { min: 2, value: 0.75 },
      { min: 3, value: 0.5 },
      { min: 5, value: 0 },
    ],
    ABSENSI: [
      { min: 0, value: 1 },
      { min: 2, value: 0.75 },
      { min: 3, value: 0.5 },
      { min: 4, value: 0.25 },
      { min: 5, value: 0 },
    ],
    KOMPLAIN: [
      { min: 0, value: 1 },
      { min: 2, value: 0.75 },
      { min: 3, value: 0.5 },
      { min: 5, value: 0 },
    ],
  },

  tierTables: {
    STANDAR: {
      thresholds: [1.2, 1.1, 1.0, 0.9, 0.8],
      rates: {
        SP: [0.00125, 0.001, 0.00075, 0.0005, 0.00025],
        TL: [0.000625, 0.0005, 0.000375, 0.00025, 0.000125],
        ASM: [0.00032, 0.00025, 0.0002, 0.00015, 0.0001],
        SM: [0.0007, 0.0006, 0.0005, 0.0004, 0.0003],
      },
      belowLabel: 'SP1',
    },
  },

  indicators: [
    { code: 'OMZET_PRIBADI', name: 'Omzet pribadi', source: 'sales', agg: 'sum', level: 'self' },
    { code: 'OMZET_TIM', name: 'Omzet tim', source: 'sales', agg: 'sum', level: 'team' },
    { code: 'OMZET_TOKO', name: 'Omzet toko', source: 'sales', agg: 'sum', level: 'store' },
    { code: 'JUMLAH_RETUR', name: 'Jumlah retur', source: 'returns', agg: 'count', level: 'self' },
    { code: 'JUMLAH_ABSEN', name: 'Jumlah absen', source: 'attendance', agg: 'sum', level: 'self' },
    { code: 'JUMLAH_KOMPLAIN', name: 'Jumlah komplain', source: 'events', agg: 'count', level: 'self', eventCode: 'KOMPLAIN' },
  ],

  templates: [
    {
      position: 'SP',
      name: 'Sales Promotion',
      incentiveBase: 'OMZET_PRIBADI',
      primaryComponent: 'PENJUALAN',
      components: [
        { code: 'PENJUALAN', name: 'Penjualan', weight: 0.7, active: true, method: 'ratio', indicator: 'OMZET_PRIBADI', target: { type: 'sp_target' }, cap: null },
        { code: 'RETUR', name: 'Retur', weight: 0.1, active: true, method: 'step', indicator: 'JUMLAH_RETUR', stepTable: 'RETUR' },
        { code: 'ABSENSI', name: 'Absensi', weight: 0.2, active: true, method: 'step', indicator: 'JUMLAH_ABSEN', stepTable: 'ABSENSI' },
      ],
    },
    {
      position: 'TL',
      name: 'Team Leader',
      incentiveBase: 'OMZET_TIM',
      primaryComponent: 'TOTAL_SALES_TIM',
      components: [
        { code: 'TOTAL_SALES_TIM', name: 'Total sales tim', weight: 0.6, active: true, method: 'ratio', indicator: 'OMZET_TIM', target: { type: 'team_sum', includeOwn: 'tl_personal' }, cap: null },
        // Definisi sementara, menunggu keputusan: % SP di tim dengan skor >= 100%
        { code: 'TEAM_PERFORMANCE', name: 'Team performance', weight: 0.3, active: true, method: 'subordinate_pass', subordinate: { position: 'SP', scope: 'direct', threshold: 1.0 } },
        { code: 'PENJUALAN_PRIBADI', name: 'Penjualan pribadi', weight: 0.1, active: true, method: 'ratio', indicator: 'OMZET_PRIBADI', target: { type: 'tl_personal' }, cap: 1 },
        { code: 'KOMPLAIN', name: 'Komplain', weight: 0, active: false, method: 'step', indicator: 'JUMLAH_KOMPLAIN', stepTable: 'KOMPLAIN' },
      ],
    },
    {
      position: 'ASM',
      name: 'Assistant Store Manager',
      incentiveBase: 'OMZET_TOKO',
      primaryComponent: 'PENJUALAN_TOKO',
      components: [
        { code: 'PENJUALAN_TOKO', name: 'Penjualan toko', weight: 0.5, active: true, method: 'ratio', indicator: 'OMZET_TOKO', target: { type: 'store_target' }, cap: null },
        { code: 'KINERJA_TL', name: 'Kinerja TL', weight: 0.2, active: true, method: 'subordinate_pass', subordinate: { position: 'TL', scope: 'store', threshold: 1.0 } },
        { code: 'PENJUALAN', name: 'Penjualan', weight: 0.1, active: true, method: 'ratio', indicator: 'OMZET_PRIBADI', target: { type: 'fixed', value: 500 * M }, cap: 1 },
        { code: 'SSR', name: 'SSR', weight: 0.2, active: false, method: 'ratio', direction: 'lower', cap: 1.2 },
      ],
    },
    {
      position: 'SM',
      name: 'Store Manager',
      incentiveBase: 'OMZET_TOKO',
      primaryComponent: 'PENJUALAN_TOKO',
      components: [
        { code: 'PENJUALAN_TOKO', name: 'Penjualan toko', weight: 0.5, active: true, method: 'ratio', indicator: 'OMZET_TOKO', target: { type: 'store_target' }, cap: null },
        { code: 'KPI_ASM', name: 'KPI ASM', weight: 0.2, active: true, method: 'subordinate_pass', subordinate: { position: 'ASM', scope: 'store', threshold: 1.0 } },
        { code: 'SSR', name: 'SSR', weight: 0.3, active: false, method: 'ratio', direction: 'lower', cap: 1.2 },
      ],
    },
  ],

  lists: {
    positions: [
      { code: 'SP', name: 'Sales Promotion' },
      { code: 'TL', name: 'Team Leader' },
      { code: 'ASM', name: 'Assistant Store Manager' },
      { code: 'SM', name: 'Store Manager' },
    ],
    facilities: ['HP'],
    salesCategories: ['NORMAL', 'AFILIASI', 'IMPORT', 'ONGKIR'],
    returnCauses: [
      { code: 'SALES', name: 'Kesalahan sales' },
      { code: 'BARANG_TIDAK_LAKU', name: 'Barang tidak laku' },
      { code: 'BARANG_RUSAK', name: 'Barang rusak' },
      { code: 'SYSTEM_ERROR', name: 'System error' },
      { code: 'CUSTOMER', name: 'Permintaan customer' },
      { code: 'CHECKER', name: 'Kesalahan checker' },
      { code: 'MD', name: 'Kesalahan MD' },
      { code: 'ADMIN', name: 'Kesalahan admin' },
      { code: 'LAINNYA', name: 'Lainnya' },
    ],
    absenceCodes: [
      { code: 'ALPA', name: 'Tidak hadir tanpa keterangan' },
      { code: 'TELAT', name: 'Terlambat' },
      { code: 'CT', name: 'Cuti tahunan' },
      { code: 'SD', name: 'Sakit dengan surat dokter' },
      { code: 'STSD', name: 'Sakit tanpa surat dokter' },
      { code: 'CL', name: 'Cuti lainnya' },
      { code: 'CM', name: 'Cuti melahirkan' },
      { code: 'IPG', name: 'Izin potong gaji' },
      { code: 'LSLK', name: 'LSLK' },
      { code: 'TLN', name: 'TLN' },
      { code: 'CIM', name: 'CIM' },
    ],
    eventCodes: [{ code: 'KOMPLAIN', name: 'Komplain pelanggan' }],
  },

  dataRules: {
    // Default sementara, menunggu keputusan b, c, d di PRD
    salesCategoriesCounted: ['NORMAL', 'AFILIASI'],
    returnCausesCounted: 'ALL',
    absenceCodesCounted: ['ALPA'],
  },

  redistributeInactiveWeight: true,
  incentiveRounding: 1,
};
