import ExcelJS from 'exceljs';
import { periodLabel, statusLabel } from '../labels';
import { DECISION_LABEL, POSITION_ORDER, sortRows, type ExportData } from './types';

const WINE = 'FF2D1B24';
const RP = '#,##0';
const RP_JUTA = '#,##0';
const PCT = '0.00%';

function headerStyle(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle', wrapText: true };
  row.height = 30;
  row.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WINE } }));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' });
}

/** Rekap insentif untuk payroll: Rekap, Ringkasan, Rincian Komponen, Info. */
export async function buildRekapXlsx(d: ExportData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SBP KPI';
  const locked = d.status === 'locked';
  const rows = sortRows(d.rows);
  const title = `Rekap Insentif ${periodLabel(d.period)}`;
  const statusLine = locked
    ? `Status: Dikunci (final untuk payroll). Dihitung ${fmtDate(d.calculatedAt)}.`
    : `DRAF, BELUM DIKUNCI. Status: ${statusLabel(d.status)}. Angka masih bisa berubah. Dihitung ${fmtDate(d.calculatedAt)}.`;

  // ---------- Rekap ----------
  const ws = wb.addWorksheet('Rekap Insentif', { views: [{ state: 'frozen', ySplit: 4, xSplit: 3 }] });
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = statusLine;
  ws.getCell('A2').font = { bold: !locked, color: { argb: locked ? 'FF2E7D5B' : 'FFB42318' } };

  const cols: { header: string; key: string; width: number; fmt?: string }[] = [
    { header: 'No', key: 'no', width: 5 },
    { header: 'NIK', key: 'nik', width: 11 },
    { header: 'Nama', key: 'name', width: 28 },
    { header: 'Jabatan', key: 'position', width: 9 },
    { header: 'Toko', key: 'store', width: 8 },
    { header: 'Target (Rp)', key: 'target', width: 16, fmt: RP_JUTA },
    { header: 'Pencapaian (Rp)', key: 'achieve', width: 16, fmt: RP_JUTA },
    { header: 'Skor', key: 'score', width: 9, fmt: PCT },
    { header: 'Tier', key: 'tier', width: 7 },
    { header: 'Tarif', key: 'rate', width: 9, fmt: '0.0000%' },
    { header: 'Dasar Insentif (Rp)', key: 'base', width: 17, fmt: RP },
    { header: 'Insentif Hitung (Rp)', key: 'incentive', width: 16, fmt: RP },
    { header: 'Override (Rp)', key: 'override', width: 14, fmt: RP },
    { header: 'Insentif Akhir (Rp)', key: 'final', width: 17, fmt: RP },
    { header: 'Keterangan', key: 'note', width: 50 },
  ];
  ws.columns = cols.map((c) => ({ key: c.key, width: c.width }));
  const head = ws.getRow(4);
  head.values = cols.map((c) => c.header);
  headerStyle(head);

  rows.forEach((r, i) => {
    const notes = [r.overrideReason ? `Override: ${r.overrideReason}` : null, ...r.warnings].filter(Boolean).join('; ');
    const row = ws.addRow({
      no: i + 1,
      nik: r.nik,
      name: r.name,
      position: r.position,
      store: r.store,
      target: r.target,
      achieve: r.achieve,
      score: r.score,
      tier: r.tierLabel,
      rate: r.rate,
      base: r.incentiveBase,
      incentive: r.incentive,
      override: r.overrideValue,
      final: r.finalIncentive,
      note: notes || null,
    });
    cols.forEach((c, j) => c.fmt && (row.getCell(j + 1).numFmt = c.fmt));
    if (r.tierLabel === 'SP1') row.getCell('tier').font = { color: { argb: 'FFB42318' }, bold: true };
    row.getCell('note').alignment = { wrapText: true, vertical: 'top' };
  });

  const first = 5;
  const last = 4 + rows.length;
  const total = ws.addRow({ name: 'TOTAL' });
  total.font = { bold: true };
  if (rows.length) {
    for (const key of ['incentive', 'final']) {
      const col = ws.getColumn(key).letter;
      total.getCell(key).value = { formula: `SUM(${col}${first}:${col}${last})`, result: rows.reduce((a, r) => a + (key === 'final' ? r.finalIncentive : r.incentive), 0) };
      total.getCell(key).numFmt = RP;
    }
  }
  total.eachCell((c) => (c.border = { top: { style: 'thin' } }));
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: cols.length } };

  // ---------- Ringkasan per toko & jabatan ----------
  const sum = wb.addWorksheet('Ringkasan');
  sum.getCell('A1').value = `Ringkasan ${title}`;
  sum.getCell('A1').font = { bold: true, size: 13 };
  sum.columns = [
    { key: 'store', width: 10 },
    { key: 'position', width: 10 },
    { key: 'count', width: 12 },
    { key: 'earners', width: 18 },
    { key: 'total', width: 20 },
  ];
  const sh = sum.getRow(3);
  sh.values = ['Toko', 'Jabatan', 'Karyawan', 'Menerima insentif', 'Total insentif (Rp)'];
  headerStyle(sh);
  const stores = [...new Set(rows.map((r) => r.store))].sort();
  let grand = 0;
  for (const st of stores) {
    const positions = [...new Set(rows.filter((r) => r.store === st).map((r) => r.position))].sort(
      (a, b) => POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b),
    );
    for (const p of positions) {
      const g = rows.filter((r) => r.store === st && r.position === p);
      const t = g.reduce((a, r) => a + r.finalIncentive, 0);
      grand += t;
      const row = sum.addRow({ store: st, position: p, count: g.length, earners: g.filter((r) => r.finalIncentive > 0).length, total: t });
      row.getCell('total').numFmt = RP;
    }
  }
  const gt = sum.addRow({ store: 'TOTAL', count: rows.length, earners: rows.filter((r) => r.finalIncentive > 0).length, total: grand });
  gt.font = { bold: true };
  gt.getCell('total').numFmt = RP;

  // ---------- Rincian komponen ----------
  const det = wb.addWorksheet('Rincian Komponen', { views: [{ state: 'frozen', ySplit: 1 }] });
  det.columns = [
    { header: 'NIK', key: 'nik', width: 11 },
    { header: 'Nama', key: 'name', width: 28 },
    { header: 'Jabatan', key: 'position', width: 9 },
    { header: 'Toko', key: 'store', width: 8 },
    { header: 'Komponen', key: 'comp', width: 22 },
    { header: 'Cara nilai', key: 'method', width: 16 },
    { header: 'Target', key: 'target', width: 16 },
    { header: 'Pencapaian', key: 'achieve', width: 16 },
    { header: 'Nilai', key: 'value', width: 10 },
    { header: 'Bobot', key: 'weight', width: 9 },
    { header: 'Nilai x Bobot', key: 'weighted', width: 12 },
    { header: 'Status', key: 'status', width: 22 },
  ];
  headerStyle(det.getRow(1));
  const METHOD: Record<string, string> = { ratio: 'Rasio', step: 'Tangga', subordinate_pass: 'Kelulusan bawahan' };
  const STATUS: Record<string, string> = { ok: 'Dihitung', inactive: 'Nonaktif', no_data: 'Tanpa data' };
  for (const r of rows) {
    for (const c of r.components) {
      const row = det.addRow({
        nik: r.nik,
        name: r.name,
        position: r.position,
        store: r.store,
        comp: c.name,
        method: METHOD[c.method] ?? c.method,
        target: c.target,
        achieve: c.achieve,
        value: c.value,
        weight: c.weight,
        weighted: c.weighted,
        status: STATUS[c.status] ?? c.status,
      });
      if (c.method === 'ratio') {
        row.getCell('target').numFmt = RP;
        row.getCell('achieve').numFmt = RP;
      }
      row.getCell('value').numFmt = c.method === 'step' ? '0.00' : PCT;
      row.getCell('weight').numFmt = '0.0%';
      row.getCell('weighted').numFmt = PCT;
    }
  }

  // ---------- Info ----------
  const info = wb.addWorksheet('Info');
  info.columns = [{ width: 24 }, { width: 70 }];
  const add = (k: string, v: string) => {
    const row = info.addRow([k, v]);
    row.getCell(1).font = { bold: true };
  };
  add('Periode', periodLabel(d.period));
  add('Status', statusLabel(d.status));
  add('Dihitung', fmtDate(d.calculatedAt));
  add('Versi setting', d.settingsVersionId ? `#${d.settingsVersionId}` : '-');
  add('Diunduh', fmtDate(d.generatedAt));
  info.addRow([]);
  info.addRow(['Riwayat persetujuan']).font = { bold: true };
  if (!d.approvals.length) info.addRow(['', 'Belum ada']);
  for (const a of d.approvals) info.addRow([fmtDate(a.at), `${DECISION_LABEL[a.decision] ?? a.decision} oleh ${a.by}${a.note ? `: ${a.note}` : ''}`]);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
