import Link from 'next/link';
import { LOAI_LABEL, NGUON_LABEL, type NoiDungKhanGia } from '@app/du-an';
import { Markdown } from '@/app/video/markdown';
import { requireDuAn, suaKho } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { supabaseServer } from '@/lib/supabase';
import { DuyetInsightForm, NhapDuLieuForm, NhapTinNhanForm, TomTatButton, XoaDuLieuButton } from '../../forms';

export default async function KhanGiaPage() {
  const me = await requireDuAn();
  const admin = suaKho(me);
  const supabase = await supabaseServer();
  const [{ data: kt }, { data: duLieu }] = await Promise.all([
    supabase.from('du_an_kien_thuc').select('noi_dung,job_status,job_error,job_started_at').eq('muc', 'khan-gia').maybeSingle(),
    supabase.from('du_an_khan_gia_du_lieu').select('id,nguon,loai,ten,so_ky_tu,tu_ngay,den_ngay,tom_tat,tao_luc').order('tao_luc', { ascending: false }),
  ]);
  const kg = (kt?.noi_dung ?? {}) as NoiDungKhanGia;
  const files = duLieu ?? [];
  const dangChay =
    !!kt && ['queued', 'running'].includes(kt.job_status) && !!kt.job_started_at && Date.now() - new Date(kt.job_started_at).getTime() < 15 * 60_000;

  return (
    <>
      <p><Link href="/du-an">← Dự án video</Link></p>
      <h1>Khán giả</h1>
      <p className="meta">
        Đưa dữ liệu thật vào → AI tóm tắt thành <strong>bản insight</strong> → mày sửa và duyệt. Các bước dự án chỉ đọc bản đã duyệt, không đọc dữ liệu thô.
      </p>

      {admin && (
        <>
          <h2>1. Thêm dữ liệu</h2>
          <details className="card" style={{ marginBottom: 12 }}>
            <summary><strong>Lấy dữ liệu ở đâu?</strong></summary>
            <ul>
              <li><strong>Facebook</strong>: Meta Business Suite → Thông tin chi tiết (Insights) → Nội dung → Xuất dữ liệu (CSV). Bình luận: mở bài / video nhiều bình luận, copy dán vào ô.</li>
              <li><strong>TikTok</strong>: TikTok Studio (máy tính) → Phân tích → Xuất dữ liệu. Bình luận: copy từ các video nhiều bình luận.</li>
              <li><strong>YouTube</strong>: YouTube Studio → Số liệu phân tích → Nâng cao → Xuất (CSV). Bình luận: Studio → Bình luận, copy.</li>
              <li><strong>Tin nhắn khách</strong>: copy các câu khách hỏi nhiều (bỏ số điện thoại, tên khách nếu muốn).</li>
              <li>Nên lấy khoảng <strong>3 tháng gần nhất</strong>. Mỗi nguồn / loại một lần thêm để AI ghi rõ nguồn.</li>
            </ul>
          </details>
          <h3>Tin nhắn tư vấn Messenger (file xuất từ Facebook)</h3>
          <details className="card" style={{ marginBottom: 12 }}>
            <summary><strong>Cách tải tin nhắn của Trang</strong></summary>
            <ol>
              <li>Facebook → Trang Soccerstore → Cài đặt → <strong>Tải thông tin xuống</strong> (Download your information), chọn mục <strong>Tin nhắn</strong>.</li>
              <li>Định dạng: <strong>JSON</strong> (không chọn HTML). Chất lượng ảnh: <strong>thấp</strong> (cho file nhẹ — máy chỉ đọc chữ). Khoảng thời gian: 6–12 tháng gần nhất.</li>
              <li>Facebook báo xong (vài giờ – vài ngày) thì tải về, <strong>không cần giải nén</strong>, chọn thẳng file .zip ở ô bên dưới (nhiều phần thì chọn hết một lượt).</li>
            </ol>
          </details>
          <NhapTinNhanForm />
          <h3>Dữ liệu khác (bình luận, số liệu video…)</h3>
          <NhapDuLieuForm />
        </>
      )}

      <h2>Dữ liệu đã có ({files.length})</h2>
      {files.length ? (
        <div className="card scroll">
          <table>
            <thead>
              <tr><th>Tên</th><th>Nguồn</th><th>Loại</th><th>Khoảng ngày</th><th>Ký tự</th><th>AI đã đọc</th><th>Thêm lúc</th>{admin && <th></th>}</tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id}>
                  <td>{f.ten}</td>
                  <td>{NGUON_LABEL[f.nguon] ?? f.nguon}</td>
                  <td>{LOAI_LABEL[f.loai] ?? f.loai}</td>
                  <td>{f.tu_ngay ? `${f.tu_ngay} → ${f.den_ngay ?? ''}` : '—'}</td>
                  <td>{Number(f.so_ky_tu).toLocaleString('vi-VN')}</td>
                  <td className={f.tom_tat ? 'on' : 'meta'}>{f.tom_tat ? '✓' : 'chưa'}</td>
                  <td>{formatDateTime(f.tao_luc)}</td>
                  {admin && <td><XoaDuLieuButton id={f.id} ten={f.ten} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card muted">Chưa có dữ liệu nào.</div>
      )}

      <h2>2. Tóm tắt insight</h2>
      <div className="card settings wide">
        {admin && <TomTatButton dangChay={dangChay} soChuaDoc={files.filter((f) => !f.tom_tat).length} soFile={files.length} />}
        {kt?.job_status === 'failed' && <p className="warn">✗ Lỗi lần trước: {kt.job_error}</p>}
        {kg.ban_ai ? (
          <details>
            <summary>
              Bản AI viết lúc {formatDateTime(kg.ban_ai_luc ?? null)} (từ {kg.ban_ai_nguon?.so_file ?? '?'} file)
            </summary>
            <div className="md"><Markdown text={kg.ban_ai} /></div>
          </details>
        ) : (
          <p className="meta">Chưa có bản insight.</p>
        )}
      </div>

      <h2>3. Bản insight đã duyệt</h2>
      {kg.da_duyet && <p className="meta">Duyệt lúc {formatDateTime(kg.da_duyet_luc ?? null)}</p>}
      {admin ? (
        <div className="card">
          <DuyetInsightForm banDangDung={kg.da_duyet ?? ''} banAi={kg.ban_ai ?? null} />
        </div>
      ) : kg.da_duyet ? (
        <div className="card md"><Markdown text={kg.da_duyet} /></div>
      ) : (
        <div className="card muted">Chưa có bản duyệt.</div>
      )}
    </>
  );
}
