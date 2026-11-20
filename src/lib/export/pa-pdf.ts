import { PDFDocument, rgb, StandardFonts, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import { periodEnd } from '../engine/engine';
import { periodLabel } from '../labels';
import type { ExportData, ExportRow } from './types';
import { sortRows } from './types';

// =============================================================
// Form Penilaian Kinerja (pengganti sheet PA), 1 halaman A4 per karyawan.
// =============================================================

const WINE = rgb(0x2d / 255, 0x1b / 255, 0x24 / 255);
const PINK = rgb(0xc8 / 255, 0x17 / 255, 0x6a / 255);
const MUTED = rgb(0x6f / 255, 0x5f / 255, 0x67 / 255);
const LINE = rgb(0xd9 / 255, 0xcf / 255, 0xd4 / 255);
const SOFT = rgb(0xf6 / 255, 0xf4 / 255, 0xf5 / 255);
const RED = rgb(0xb4 / 255, 0x23 / 255, 0x18 / 255);

const W = 595.28;
const H = 841.89;
const M = 40; // margin
const CW = W - 2 * M;

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** Font standar PDF hanya mendukung WinAnsi: ganti karakter di luar itu. */
function safe(s: string): string {
  return s
    .replace(/[≥]/g, '>=')
    .replace(/[≤]/g, '<=')
    .replace(/[×]/g, 'x')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

const rp = (n: number) => 'Rp ' + Math.round(n).toLocaleString('id-ID');
const jt = (n: number | null) => (n == null ? '-' : (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt');
const pc = (n: number | null, d = 2) => (n == null ? '-' : (n * 100).toLocaleString('id-ID', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%');
const tgl = (iso: string | null) => {
  if (!iso) return '-';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
};

interface Ctx {
  page: PDFPage;
  reg: PDFFont;
  bold: PDFFont;
}

function text(c: Ctx, s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' | 'center'; maxW?: number } = {}) {
  const font = o.bold ? c.bold : c.reg;
  const size = o.size ?? 9;
  let str = safe(s);
  if (o.maxW && font.widthOfTextAtSize(str, size) > o.maxW) {
    while (str.length > 1 && font.widthOfTextAtSize(str + '...', size) > o.maxW) str = str.slice(0, -1);
    str = str.trimEnd() + '...';
  }
  const w = font.widthOfTextAtSize(str, size);
  const dx = o.align === 'right' ? -w : o.align === 'center' ? -w / 2 : 0;
  c.page.drawText(str, { x: x + dx, y, size, font, color: o.color ?? WINE });
}

function hline(c: Ctx, y: number, x1 = M, x2 = W - M, color = LINE, t = 0.6) {
  c.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color });
}

function section(c: Ctx, title: string, y: number): number {
  text(c, title, M, y, { size: 10.5, bold: true });
  hline(c, y - 5, M, W - M, WINE, 1);
  return y - 20;
}

function drawEmployee(c: Ctx, d: ExportData, r: ExportRow, locked: boolean) {
  const { page } = c;
  const [py, pm, pd] = periodEnd(d.period);

  // ---- kepala ----
  page.drawRectangle({ x: 0, y: H - 78, width: W, height: 78, color: WINE });
  text(c, 'PENILAIAN KINERJA', M, H - 42, { size: 18, bold: true, color: rgb(1, 1, 1) });
  text(c, 'PT Sumber Bintang Perkasa (SBP Group)', M, H - 60, { size: 9, color: rgb(0.85, 0.78, 0.82) });
  text(c, periodLabel(d.period), W - M, H - 42, { size: 13, bold: true, color: rgb(1, 1, 1), align: 'right' });
  text(c, `Tanggal penilaian: ${pd} ${BULAN[pm - 1]} ${py}`, W - M, H - 60, { size: 9, color: rgb(0.85, 0.78, 0.82), align: 'right' });

  if (!locked) {
    const mark = 'DRAF - BELUM DIKUNCI';
    const size = 44;
    const wm = c.bold.widthOfTextAtSize(mark, size);
    const a = (35 * Math.PI) / 180;
    page.drawText(mark, {
      x: W / 2 - (wm / 2) * Math.cos(a), y: H / 2 - 40 - (wm / 2) * Math.sin(a),
      size, font: c.bold, color: RED, opacity: 0.1, rotate: degrees(35),
    });
  }

  // ---- data karyawan ----
  let y = section(c, 'Data karyawan', H - 104);
  const left: [string, string][] = [
    ['Nama', r.name],
    ['NIK', r.nik],
    ['Jabatan', r.positionName],
    ['Lokasi kerja', r.store],
  ];
  const right: [string, string][] = [
    ['Atasan langsung', r.superiorName ?? '-'],
    ['Tanggal masuk', tgl(r.joinDate)],
    ['Masa kerja', `${r.tenureMonths} bulan`],
    ['Periode', periodLabel(d.period)],
  ];
  left.forEach(([k, v], i) => {
    text(c, k, M, y - i * 15, { color: MUTED });
    text(c, v, M + 80, y - i * 15, { bold: i === 0, maxW: 170 });
  });
  right.forEach(([k, v], i) => {
    text(c, k, M + CW / 2 + 10, y - i * 15, { color: MUTED });
    text(c, v, M + CW / 2 + 100, y - i * 15, { maxW: 150 });
  });
  y -= 4 * 15 + 14;

  // ---- tabel kinerja ----
  y = section(c, 'Kinerja', y);
  const colX = [M, M + 22, M + 200, M + 280, M + 360, M + 420, M + 470, W - M];
  const heads = ['No', 'KPI', 'Target', 'Aktual', 'Pencapaian', 'Bobot', 'Nilai'];
  page.drawRectangle({ x: M, y: y - 6, width: CW, height: 18, color: SOFT });
  heads.forEach((h, i) => text(c, h, i < 2 ? colX[i] + 4 : colX[i + 1] - 4, y, { bold: true, size: 8.5, align: i < 2 ? 'left' : 'right' }));
  y -= 20;
  r.components.forEach((k, i) => {
    let tgt = '-';
    let act = '-';
    let ach = '-';
    if (k.method === 'ratio') {
      tgt = jt(k.target);
      act = jt(k.achieve);
      ach = pc(k.pct);
    } else if (k.method === 'step') {
      act = k.achieve == null ? '-' : `${k.achieve.toLocaleString('id-ID')} kali`;
      ach = k.value == null ? '-' : k.value.toLocaleString('id-ID');
    } else {
      tgt = k.target == null ? '-' : `${k.target} orang`;
      act = k.achieve == null ? '-' : `${k.achieve} lulus`;
      ach = pc(k.value);
    }
    const inactive = k.status !== 'ok';
    const name = k.name + (k.status === 'inactive' ? ' (nonaktif)' : k.status === 'no_data' ? ' (tanpa data)' : '');
    const color = inactive ? MUTED : WINE;
    text(c, String(i + 1), colX[0] + 4, y, { color });
    text(c, name, colX[1] + 4, y, { color, maxW: 170 });
    text(c, tgt, colX[3] - 4, y, { align: 'right', color });
    text(c, act, colX[4] - 4, y, { align: 'right', color });
    text(c, ach, colX[5] - 4, y, { align: 'right', color });
    text(c, pc(k.weight, 0), colX[6] - 4, y, { align: 'right', color });
    text(c, pc(k.weighted), colX[7] - 4, y, { align: 'right', color, bold: !inactive });
    hline(c, y - 6);
    y -= 18;
  });
  text(c, 'Total nilai (skor)', colX[1] + 4, y, { bold: true });
  text(c, pc(r.score), colX[7] - 4, y, { bold: true, align: 'right', size: 10 });
  y -= 24;

  // ---- insentif ----
  page.drawRectangle({ x: M, y: y - 46, width: CW, height: 56, color: SOFT });
  page.drawRectangle({ x: M, y: y - 46, width: 4, height: 56, color: PINK });
  text(c, 'Tier', M + 16, y - 8, { color: MUTED, size: 8.5 });
  text(c, r.tierLabel, M + 16, y - 30, { bold: true, size: 15, color: r.tierLabel === 'SP1' ? RED : WINE });
  text(c, 'Tarif insentif', M + 110, y - 8, { color: MUTED, size: 8.5 });
  text(c, r.rate > 0 ? pc(r.rate, 4) : '-', M + 110, y - 30, { bold: true, size: 15 });
  text(c, 'Dasar insentif', M + 220, y - 8, { color: MUTED, size: 8.5 });
  text(c, jt(r.incentiveBase), M + 220, y - 30, { bold: true, size: 15 });
  text(c, 'Insentif (Rp)', W - M - 14, y - 8, { color: MUTED, size: 8.5, align: 'right' });
  text(c, rp(r.finalIncentive), W - M - 14, y - 30, { bold: true, size: 17, color: PINK, align: 'right' });
  y -= 58;
  if (r.overrideValue != null) {
    text(c, `Disesuaikan dari ${rp(r.incentive)}: ${r.overrideReason ?? ''}`, M, y, { size: 8, color: MUTED, maxW: CW });
    y -= 12;
  }
  if (r.tierLabel === 'SP1') {
    text(c, 'Skor di bawah ambang tier terendah: tidak mendapat insentif dan masuk kategori SP1.', M, y, { size: 8, color: RED });
    y -= 12;
  }
  y -= 10;

  // ---- parameter tier ----
  y = section(c, 'Parameter insentif', y);
  const store = d.settings.stores.find((s) => s.code === r.store);
  const tier = store ? d.settings.tierTables[store.tierTable] : undefined;
  if (tier) {
    const rates = tier.rates[r.position] ?? [];
    const n = tier.thresholds.length + 1;
    const cw = CW / n;
    tier.thresholds.forEach((th, i) => {
      const x = M + i * cw;
      const isMine = r.tierLabel === `${Math.round(th * 100)}%`;
      if (isMine) page.drawRectangle({ x, y: y - 22, width: cw - 4, height: 34, color: rgb(0.98, 0.91, 0.95) });
      text(c, `Skor >= ${Math.round(th * 100)}%`, x + 6, y, { size: 8, color: MUTED });
      text(c, rates[i] != null ? pc(rates[i], 4) : '-', x + 6, y - 14, { bold: true, size: 9.5, color: isMine ? PINK : WINE });
    });
    const x = M + tier.thresholds.length * cw;
    text(c, `< ${Math.round((tier.thresholds.at(-1) ?? 0) * 100)}%`, x + 6, y, { size: 8, color: MUTED });
    text(c, tier.belowLabel, x + 6, y - 14, { bold: true, size: 9.5, color: RED });
  }
  y -= 40;

  // ---- kekuatan & kekurangan ----
  y = section(c, 'Kekuatan dan kekurangan', y);
  text(c, 'Kelebihan yang perlu dipertahankan', M, y, { size: 8.5, color: MUTED });
  text(c, 'Kekurangan yang perlu diperbaiki', M + CW / 2 + 10, y, { size: 8.5, color: MUTED });
  for (let i = 1; i <= 3; i++) {
    const yy = y - i * 20;
    text(c, `${i}.`, M, yy + 4);
    hline(c, yy, M + 12, M + CW / 2 - 10);
    text(c, `${i}.`, M + CW / 2 + 10, yy + 4);
    hline(c, yy, M + CW / 2 + 22, W - M);
  }
  y -= 82;

  // ---- tanda tangan ----
  text(c, 'Tanda tangan di bawah ini menunjukkan bahwa atasan (penilai) dan karyawan (yang dinilai) telah menyetujui', M, y, { size: 8, color: MUTED });
  text(c, 'penilaian, mengikuti feedback dan counseling.', M, y - 10, { size: 8, color: MUTED });
  y -= 24;
  const signers = ['Karyawan', 'Atasan', 'Store Manager', 'HRD', 'Direksi'];
  const sw = (CW - 4 * 8) / 5;
  signers.forEach((s, i) => {
    const x = M + i * (sw + 8);
    page.drawRectangle({ x, y: y - 78, width: sw, height: 84, borderColor: LINE, borderWidth: 0.8 });
    text(c, s, x + sw / 2, y - 8, { size: 8.5, bold: true, align: 'center' });
    text(c, 'Nama:', x + 6, y - 58, { size: 7.5, color: MUTED });
    text(c, 'Tgl:', x + 6, y - 71, { size: 7.5, color: MUTED });
  });

  // ---- kaki ----
  const gen = new Date(d.generatedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  text(c, `Dicetak dari aplikasi KPI & Insentif SBP, ${gen}. ${locked ? 'Periode sudah dikunci.' : 'Periode belum dikunci, angka masih bisa berubah.'}`, M, 24, { size: 7, color: MUTED });
}

/** PDF form PA. niks kosong = semua karyawan (1 halaman per orang, urut toko > jabatan > nama). */
export async function buildPaPdf(d: ExportData, niks?: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Penilaian Kinerja ${periodLabel(d.period)}`);
  pdf.setAuthor('SBP KPI');
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const locked = d.status === 'locked';
  const rows = sortRows(d.rows).filter((r) => !niks?.length || niks.includes(r.nik));
  for (const r of rows) {
    const page = pdf.addPage([W, H]);
    drawEmployee({ page, reg, bold }, d, r, locked);
  }
  return pdf.save();
}
