import Link from 'next/link';
import { CAU_HOI_THUONG_HIEU } from '@app/du-an';
import { requireDuAn } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { ThuongHieuForm } from '../../forms';

export default async function ThuongHieuPage() {
  const me = await requireDuAn();
  const supabase = await supabaseServer();
  const { data } = await supabase.from('du_an_kien_thuc').select('noi_dung,cap_nhat_luc').eq('muc', 'thuong-hieu').maybeSingle();
  const traLoi = ((data?.noi_dung as { tra_loi?: Record<string, string> } | null)?.tra_loi ?? {}) as Record<string, string>;
  const da = CAU_HOI_THUONG_HIEU.filter((c) => traLoi[c.ma]?.trim()).length;

  return (
    <>
      <p><Link href="/du-an">← Dự án video</Link></p>
      <h1>Thương hiệu</h1>
      <p className="meta">
        {da}/{CAU_HOI_THUONG_HIEU.length} câu đã trả lời · cập nhật {formatDateTime(data?.cap_nhat_luc ?? null)}. Mọi bước (ý tưởng, kịch bản…) đọc phần này. Câu có nhãn{' '}
        <span className="badge warn">nguồn chuẩn</span> là thông tin AI tuyệt đối không được nói khác — ghi đúng nguyên văn shop cam kết. Câu để trống = AI không tự bịa phần đó.
      </p>
      <ThuongHieuForm traLoi={traLoi} sua={me.role === 'admin'} />
    </>
  );
}
