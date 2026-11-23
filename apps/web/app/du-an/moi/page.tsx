import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireDuAn } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { TaoDuAnForm } from './form';

export default async function TaoDuAnPage() {
  const me = await requireDuAn();
  if (me.role !== 'admin' && !me.duAnQuyen['y-tuong']?.includes('lam')) redirect('/du-an');
  const supabase = await supabaseServer();
  const { data } = await supabase.from('du_an_khuon').select('ma,ten').order('thu_tu');
  return (
    <>
      <p><Link href="/du-an">← Dự án video</Link></p>
      <h1>Dự án mới</h1>
      <TaoDuAnForm khuon={data ?? []} />
    </>
  );
}
