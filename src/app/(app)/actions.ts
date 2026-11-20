'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { canEdit, getSession } from '@/lib/data';

export async function createPeriod(_prev: string | null, form: FormData): Promise<string | null> {
  const s = await getSession();
  if (!canEdit(s.role)) return 'Hanya HR Admin atau HR Manager yang bisa membuat periode.';
  const period = String(form.get('period') ?? '');
  if (!/^\d{4}-\d{2}$/.test(period)) return 'Pilih bulan dan tahun.';
  const { error } = await s.supabase.from('periods').insert({ period });
  if (error) return error.code === '23505' ? 'Periode ini sudah ada.' : error.message;
  revalidatePath('/');
  redirect(`/periode/${period}`);
}
