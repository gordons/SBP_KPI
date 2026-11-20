import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/data';
import { buildPaPdf } from '@/lib/export';
import { loadExportData } from '@/lib/export/load';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ?period=YYYY-MM [&nik=...] [&jabatan=SP]
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const period = q.get('period') ?? '';
  const nik = q.get('nik');
  const jabatan = q.get('jabatan');
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: 'Periode tidak valid' }, { status: 400 });
  const s = await getSession();
  try {
    const data = await loadExportData(s.supabase, period);
    const niks = nik ? [nik] : jabatan ? data.rows.filter((r) => r.position === jabatan).map((r) => r.nik) : undefined;
    if (niks && !niks.length) return new NextResponse('Tidak ada karyawan yang cocok.', { status: 404 });
    const pdf = await buildPaPdf(data, niks);
    const draft = data.status === 'locked' ? '' : '_DRAF';
    const suffix = nik ? `_${nik}` : jabatan ? `_${jabatan}` : '';
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${nik ? 'inline' : 'attachment'}; filename="Penilaian_Kinerja_${period}${suffix}${draft}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Export gagal', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
