import { NextResponse, type NextRequest } from 'next/server';
import { getSession, loadSettings } from '@/lib/data';
import { buildTemplate, getTemplate, TEMPLATE_KINDS, type TemplateKind } from '@/lib/templates';

export const runtime = 'nodejs';

// Template dibuat saat diunduh, dari Setting yang berlaku untuk periode, jadi dropdown selalu terbaru.
export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!TEMPLATE_KINDS.includes(kind as TemplateKind)) return NextResponse.json({ error: 'Template tidak dikenal' }, { status: 404 });
  const period = req.nextUrl.searchParams.get('period') ?? new Date().toISOString().slice(0, 7);
  const s = await getSession();
  const { settings } = await loadSettings(s.supabase, period);
  const def = getTemplate(kind as TemplateKind, settings);
  const buf = await buildTemplate(kind as TemplateKind, settings);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${def.fileName.replace('.xlsx', `_${period}.xlsx`)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
