import Link from 'next/link';
import { redirect } from 'next/navigation';
import { moHinhCho, VIEC_DU_AN } from '@app/core';
import { requireDuAn } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { TaoDuAnForm } from './form';

export default async function TaoDuAnPage() {
  const me = await requireDuAn();
  if (me.role !== 'admin' && !me.duAnQuyen['y-tuong']?.includes('lam')) redirect('/du-an');
  const supabase = await supabaseServer();
  const [{ data }, { data: caiDat, error }] = await Promise.all([supabase.from('du_an_khuon').select('ma,ten').order('thu_tu'), supabase.rpc('mo_hinh_ai')]);
  const macDinh = Object.fromEntries(VIEC_DU_AN.map((b) => [b, moHinhCho(`du-an:${b}`, error ? null : caiDat)]));
  return (
    <>
      <p><Link href="/du-an">← Dự án video</Link></p>
      <h1>Dự án mới</h1>
      <TaoDuAnForm khuon={data ?? []} macDinh={macDinh} />
    </>
  );
}
