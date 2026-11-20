import ExcelJS from 'exceljs';
import { periodEnd } from '../engine/engine';
import type {
  AttendanceRow,
  EventRow,
  Placement,
  ReturnRow,
  SalesRow,
  Settings,
} from '../engine/types';
import { getTemplate, type ColumnDef, type TemplateKind } from '../templates/definitions';

// =============================================================
// Membaca file upload, memvalidasi setiap baris, dan mengubahnya
// ke format mesin hitung. Baris bermasalah ditolak beserta alasannya;
// baris yang valid tetap diterima.
// =============================================================

export interface Rejection {
  row: number; // nomor baris di Excel
  column?: string;
  reason: string;
}

export interface ParseResult<T> {
  kind: TemplateKind;
  rows: T[];
  rejections: Rejection[];
  warnings: string[];
  /** Kesalahan yang membuat seluruh file ditolak (mis. kolom wajib hilang). */
  fatal: string | null;
}

export interface ParseContext {
  period: string; // 'YYYY-MM'
  settings: Settings;
  /** Wajib untuk semua template selain Penempatan: NIK yang sah di periode ini. */
  placements?: Placement[];
}

type RowOf<K extends TemplateKind> = K extends 'placement'
  ? Placement
  : K extends 'sales'
    ? SalesRow
    : K extends 'returns'
      ? ReturnRow
      : K extends 'attendance'
        ? AttendanceRow
        : EventRow;

// ---------- konversi nilai sel ----------

function cellRaw(v: ExcelJS.CellValue): unknown {
  if (v && typeof v === 'object') {
    if ('result' in v) return (v as ExcelJS.CellFormulaValue).result; // rumus -> hasil
    if ('richText' in v) return (v as ExcelJS.CellRichTextValue).richText.map((t) => t.text).join('');
    if ('text' in v) return (v as ExcelJS.CellHyperlinkValue).text;
  }
  return v;
}

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

function toText(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function toNik(v: unknown): string | null {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : null;
  const s = String(v).trim().replace(/\.0+$/, '');
  return /^[A-Za-z0-9-]+$/.test(s) ? s : null;
}

/** Angka: terima number, atau teks format Indonesia (1.234.567,89) / internasional (1234567.89). */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s|Rp/gi, '');
  if (s === '') return null;
  const neg = /^\(.*\)$/.test(s);
  s = s.replace(/[()]/g, '');
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

/** Tanggal: terima sel tanggal Excel, 'YYYY-MM-DD', atau 'DD/MM/YYYY'. Hasil 'YYYY-MM-DD'. */
function toDate(v: unknown): string | null {
  const ok = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d && y > 1950 && y < 2100
      ? dt.toISOString().slice(0, 10)
      : null;
  };
  if (v instanceof Date) {
    // exceljs membaca tanggal sebagai UTC tengah malam
    return ok(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number') {
    // serial date Excel
    const ms = Math.round((v - 25569) * 864e5);
    const d = new Date(ms);
    return ok(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return ok(+m[3], +m[2], +m[1]);
  return null;
}

function inPeriod(date: string, period: string): boolean {
  return date.slice(0, 7) === period;
}

// ---------- pembaca utama ----------

export async function parseUpload<K extends TemplateKind>(
  kind: K,
  file: Buffer | ArrayBuffer,
  ctx: ParseContext,
): Promise<ParseResult<RowOf<K>>> {
  const def = getTemplate(kind, ctx.settings);
  const result: ParseResult<RowOf<K>> = { kind, rows: [], rejections: [], warnings: [], fatal: null };

  if (kind !== 'placement' && !ctx.placements?.length) {
    result.fatal = 'Upload template Penempatan untuk periode ini terlebih dahulu.';
    return result;
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(file as ArrayBuffer);
  } catch {
    result.fatal = 'File tidak bisa dibaca. Pastikan formatnya .xlsx (bukan .xls atau .csv).';
    return result;
  }
  const ws = wb.getWorksheet('Data') ?? wb.worksheets.find((w) => w.state === 'visible');
  if (!ws) {
    result.fatal = 'Sheet "Data" tidak ditemukan.';
    return result;
  }

  // Cocokkan kolom berdasarkan judul (urutan boleh berbeda)
  const headerRow = ws.getRow(1);
  const colIndex = new Map<string, number>();
  headerRow.eachCell((cell, i) => {
    const h = toText(cellRaw(cell.value) ?? '').toUpperCase();
    if (h) colIndex.set(h, i);
  });
  const missing = def.columns.filter((c) => c.required && !colIndex.has(c.header.toUpperCase()));
  if (missing.length) {
    result.fatal = `Kolom wajib tidak ditemukan di baris 1: ${missing.map((c) => c.header).join(', ')}. Gunakan template terbaru dari aplikasi.`;
    return result;
  }

  const validNik = new Set((ctx.placements ?? []).map((p) => p.nik));
  const seenKeys = new Map<string, number>();
  const rawPlacements: { row: number; p: Placement }[] = [];

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: Record<string, unknown> = {};
    for (const c of def.columns) {
      const idx = colIndex.get(c.header.toUpperCase());
      values[c.key] = idx ? cellRaw(row.getCell(idx).value) : null;
    }
    if (def.columns.every((c) => isBlank(values[c.key]))) continue; // baris kosong

    const errs: Rejection[] = [];
    const out: Record<string, unknown> = {};
    for (const c of def.columns) {
      const v = values[c.key];
      const parsed = parseCell(c, v, errs, r);
      out[c.key] = parsed;
    }

    // ---- aturan lintas kolom per template ----
    const reject = (column: string | undefined, reason: string) => errs.push({ row: r, column, reason });
    const checkNik = (nik: unknown, column: string) => {
      if (typeof nik === 'string' && !validNik.has(nik)) reject(column, `NIK ${nik} tidak ada di Penempatan periode ini`);
    };
    const checkPeriod = (d: unknown, column: string) => {
      if (typeof d === 'string' && !inPeriod(d, ctx.period)) reject(column, `Tanggal ${d} di luar periode ${ctx.period}`);
    };
    const checkUnique = (key: unknown, column: string) => {
      if (typeof key !== 'string') return;
      const prev = seenKeys.get(key);
      if (prev) reject(column, `${column} ${key} dobel (sudah ada di baris ${prev})`);
      else seenKeys.set(key, r);
    };

    switch (kind) {
      case 'placement': {
        checkUnique(out.nik, 'NIK');
        if (out.superiorNik && out.superiorNik === out.nik) reject('NIK Atasan', 'NIK Atasan tidak boleh sama dengan NIK sendiri');
        const [y, m, d] = periodEnd(ctx.period);
        const end = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        if (typeof out.joinDate === 'string' && out.joinDate > end) reject('Tanggal Masuk', `Tanggal masuk ${out.joinDate} setelah akhir periode`);
        break;
      }
      case 'sales':
        checkUnique(out.invoiceNo, 'No Faktur');
        checkPeriod(out.date, 'Tanggal');
        if (out.nik) checkNik(out.nik, 'NIK Sales');
        if (out.amount === 0) reject('Nilai', 'Nilai faktur 0');
        break;
      case 'returns':
        checkUnique(out.returnNo, 'No Retur');
        checkPeriod(out.date, 'Tanggal Retur');
        checkNik(out.nik, 'NIK Sales');
        break;
      case 'attendance':
        checkUnique(out.nik, 'NIK');
        checkNik(out.nik, 'NIK');
        break;
      case 'events':
        checkPeriod(out.date, 'Tanggal');
        checkNik(out.nik, 'NIK');
        break;
    }

    if (errs.length) {
      result.rejections.push(...errs);
      continue;
    }
    const mapped = mapRow(kind, out);
    if (kind === 'placement') rawPlacements.push({ row: r, p: mapped as Placement });
    else result.rows.push(mapped as RowOf<K>);
  }

  // Penempatan: NIK Atasan harus ada di file yang sama (dicek setelah semua baris terbaca)
  if (kind === 'placement') {
    const niks = new Set(rawPlacements.map((x) => x.p.nik));
    const byNik = new Map(rawPlacements.map((x) => [x.p.nik, x.p]));
    for (const { row, p } of rawPlacements) {
      if (p.superiorNik && !niks.has(p.superiorNik)) {
        result.rejections.push({ row, column: 'NIK Atasan', reason: `NIK Atasan ${p.superiorNik} tidak ada di file Penempatan` });
        continue;
      }
      result.rows.push(p as RowOf<K>);
      if (p.position === 'SP' && !p.superiorNik) result.warnings.push(`Baris ${row}: SP ${p.name} belum punya NIK Atasan (TL), tidak masuk tim mana pun.`);
      if (p.superiorNik) {
        const sup = byNik.get(p.superiorNik);
        if (sup && sup.store !== p.store) result.warnings.push(`Baris ${row}: ${p.name} (${p.store}) beratasan ${sup.name} di toko ${sup.store}.`);
      }
    }
  }

  if (result.rows.length === 0 && result.rejections.length === 0) result.fatal = 'File tidak berisi data.';
  return result;
}

function parseCell(c: ColumnDef, v: unknown, errs: Rejection[], r: number): unknown {
  const reject = (reason: string) => errs.push({ row: r, column: c.header, reason });
  if (isBlank(v)) {
    if (c.required) reject(`${c.header} wajib diisi`);
    if (c.type === 'count') return 0;
    return null;
  }
  switch (c.type) {
    case 'text':
      return toText(v);
    case 'nik': {
      const n = toNik(v);
      if (!n) reject(`NIK "${String(v)}" tidak valid`);
      return n;
    }
    case 'date': {
      const d = toDate(v);
      if (!d) reject(`Tanggal "${String(v)}" tidak valid`);
      return d;
    }
    case 'number': {
      const n = toNumber(v);
      if (n === null) reject(`"${String(v)}" bukan angka`);
      return n;
    }
    case 'count': {
      const n = toNumber(v);
      if (n === null || n < 0) reject(`"${String(v)}" harus angka 0 atau lebih`);
      return n;
    }
    case 'list':
    case 'yesno': {
      const s = toText(v).toUpperCase();
      const opt = c.options?.find((o) => o.toUpperCase() === s);
      if (!opt) reject(`"${toText(v)}" tidak ada di pilihan (${c.options?.join(', ')})`);
      return opt ?? null;
    }
  }
}

function mapRow(kind: TemplateKind, o: Record<string, unknown>): unknown {
  switch (kind) {
    case 'placement':
      return {
        nik: o.nik,
        name: o.name,
        position: o.position,
        store: o.store,
        superiorNik: o.superiorNik ?? null,
        joinDate: o.joinDate,
        facility: o.facility ?? null,
      } as Placement;
    case 'sales':
      return { invoiceNo: o.invoiceNo, date: o.date, store: o.store, nik: o.nik ?? null, amount: o.amount, category: o.category } as SalesRow;
    case 'returns':
      return {
        returnNo: o.returnNo,
        originalInvoiceNo: o.originalInvoiceNo ?? null,
        date: o.date,
        nik: o.nik,
        amount: o.amount,
        cause: o.cause,
        hasBA: o.hasBA === 'YA',
      } as ReturnRow;
    case 'attendance': {
      const counts: Record<string, number> = {};
      for (const [k, v] of Object.entries(o)) if (k.startsWith('count:')) counts[k.slice(6)] = (v as number) ?? 0;
      return { nik: o.nik, counts } as AttendanceRow;
    }
    case 'events':
      return { nik: o.nik, indicatorCode: o.indicatorCode, date: o.date, value: (o.value as number | null) ?? 1 } as EventRow;
  }
}
