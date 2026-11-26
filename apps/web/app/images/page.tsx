import { requireTeam } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase';
import { ThumbUploader } from './thumb-uploader';
import { ImageUploader } from './uploader';
import { VideoUploader } from './video-uploader';

export default async function ImagesPage() {
  const me = await requireTeam();
  const supabase = await supabaseServer();
  const [{ data: history }, { data: people }] = await Promise.all([
    supabase.from('image_uploads').select('id,created_by,woo_id,sku,name,mode,added,images_before,images_after,created_at').order('created_at', { ascending: false }).limit(30),
    supabase.from('profiles').select('user_id,display_name'),
  ]);
  const names = new Map((people ?? []).map((p) => [p.user_id as string, (p.display_name as string | null) ?? '']));
  const fmt = (iso: string) => new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' });

  return (
    <>
      <h1>Up ảnh sản phẩm</h1>

      <h2>Ảnh đại diện (thumb ở catalogue)</h2>
      <p className="muted">
        Up hàng loạt ảnh đại diện — ảnh hiện ở trang danh mục và ảnh đầu tiên của sản phẩm. Đặt <strong>tên file theo SKU</strong>, chọn nhiều ảnh một lúc;
        app tự khớp SKU, cho xem ảnh cũ / ảnh mới trước khi up.
      </p>
      <ThumbUploader />

      <h2>Ảnh trong mô tả</h2>
      <p className="muted">
        Chọn thư mục chứa các thư mục con đặt tên theo <strong>mã sản phẩm</strong> (vd <code>Ảnh 12-11/FQ8687-446/…jpg</code>). App tự khớp mã, thu
        nhỏ ảnh về 1024px và chèn xuống <strong>cuối phần mô tả</strong> — giống up bằng trình soạn thảo WordPress. Không đụng ảnh thumb.
      </p>
      <ImageUploader />

      <h2>Video trong mô tả (theo SKU)</h2>
      <p className="muted">
        Chèn video YouTube / TikTok hàng loạt vào mô tả sản phẩm — hiện ngay dưới bảng thông số, căn giữa.
      </p>
      <VideoUploader />

      <h2>Lịch sử up ảnh / video</h2>
      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th>Lúc</th>
              <th>Ai</th>
              <th>Sản phẩm</th>
              <th>Ảnh</th>
            </tr>
          </thead>
          <tbody>
            {(history ?? []).map((h) => (
              <tr key={h.id}>
                <td>{fmt(h.created_at)}</td>
                <td>{h.created_by === me.id ? 'mày' : names.get(h.created_by) || 'tài khoản khác'}</td>
                <td>
                  {h.name}
                  <div className="meta">{h.sku}</div>
                </td>
                <td>
                  {h.mode === 'video'
                    ? `Chèn ${h.added} video${h.images_before ? ` · bỏ ${h.images_before} video cũ` : ''}`
                    : h.mode === 'thumb'
                    ? h.images_before ? 'Thay ảnh đại diện' : 'Đặt ảnh đại diện'
                    : `${h.mode === 'replace' ? 'Thay' : 'Thêm'} ${h.added} ảnh mô tả · ${h.images_before} → ${h.images_after}`}
                </td>
              </tr>
            ))}
            {!history?.length && (
              <tr>
                <td colSpan={4} className="muted">Chưa up lần nào.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
