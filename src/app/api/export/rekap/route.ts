import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/data';
import { buildRekapXlsx } from '@/lib/export';
import { loadExportData } from '@/lib/export/load';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get('period') ?? '';
  if (!/^\d{4}-\d{2}$/.test(period)) return NextResponse.json({ error: 'Periode tidak valid' }, { status: 400 });
  const s = await getSession();
  try {
    const data = await loadExportData(s.supabase, period);
    const buf = await buildRekapXlsx(data);
    const draft = data.status === 'locked' ? '' : '_DRAF';
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Rekap_Insentif_${period}${draft}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : 'Export gagal', { status: 400, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}
