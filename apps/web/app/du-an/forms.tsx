'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { readSheet } from 'read-excel-file/browser';
import { CAU_HOI_THUONG_HIEU, NHOM_THUONG_HIEU } from '@app/du-an/src/thuong-hieu.ts';
import { nhipThanhChu, type NoiDungKhuon, type VideoMau } from '@app/du-an/src/khuon.ts';
import { docFileXuat, doanPhiaShop, lapMau, type HoiThoai, type KetQua } from '@app/du-an/src/tin-nhan.ts';
import { duyetInsight, luuKhuon, luuThuongHieu, luuTran, themDuLieu, themVideoMau, tomTatInsight, xoaDuLieu, xoaVideoMau } from './actions';

const Bao = ({ msg }: { msg: string | null }) => (msg ? <span className={msg.startsWith('✓') ? 'on' : 'warn'}>{msg}</span> : null);

// ───────────── Trần chi phí ─────────────

export function TranForm({ tran }: { tran: number }) {
  const [msg, action, pending] = useActionState(luuTran, null);
  return (
    <form action={action} className="inline">
      <span>Trần mỗi ngày $</span>
      <input name="tran" type="number" min={0} max={50} step={0.5} defaultValue={tran} style={{ width: 90, marginTop: 0 }} />
      <button type="submit" className="ghost" disabled={pending}>Lưu trần</button>
      <Bao msg={msg} />
    </form>
  );
}

// ───────────── Thương hiệu ─────────────

export function ThuongHieuForm({ traLoi, sua }: { traLoi: Record<string, string>; sua: boolean }) {
  const [msg, action, pending] = useActionState(luuThuongHieu, null);
  return (
    <form action={action} className="settings wide">
      {NHOM_THUONG_HIEU.map((nhom) => (
        <div key={nhom} className="card settings wide">
          <h2 style={{ margin: 0 }}>{nhom}</h2>
          {CAU_HOI_THUONG_HIEU.filter((c) => c.nhom === nhom).map((c) => (
            <label key={c.ma}>
              <strong>
                {c.hoi} {c.chuan && <span className="badge warn" title="AI tuyệt đối không được nói khác nội dung này">nguồn chuẩn</span>}
              </strong>
              <span className="meta">{c.goi_y}</span>
              <textarea name={c.ma} rows={3} defaultValue={traLoi[c.ma] ?? ''} disabled={!sua} />
            </label>
          ))}
        </div>
      ))}
      {sua && (
        <div className="save-bar">
          <span className="meta">Lưu bất cứ lúc nào, trả lời dần cũng được</span>
          <button type="submit" disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu'}</button>
          <Bao msg={msg} />
        </div>
      )}
    </form>
  );
}

// ───────────── Dữ liệu khán giả ─────────────

/** Đọc file trong trình duyệt → chữ (CSV / TXT giữ nguyên; Excel → mỗi dòng một hàng, cột cách bằng tab). */
async function docFile(f: File): Promise<string> {
  if (/\.(xlsx|xls)$/i.test(f.name)) {
    const rows = await readSheet(f);
    return rows.map((r) => r.map((c) => (c == null ? '' : String(c).replace(/[\t\n]+/g, ' '))).join('\t')).join('\n');
  }
  return f.text();
}

export function NhapDuLieuForm() {
  const router = useRouter();
  const [nguon, setNguon] = useState('facebook');
  const [loai, setLoai] = useState('binh-luan');
  const [ten, setTen] = useState('');
  const [tuNgay, setTuNgay] = useState('');
  const [denNgay, setDenNgay] = useState('');
  const [noiDung, setNoiDung] = useState('');
  const [tenFile, setTenFile] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="card settings wide">
      <div className="inline wrap">
        <label>
          Nguồn
          <select value={nguon} onChange={(e) => setNguon(e.target.value)}>
            <option value="facebook">Facebook</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="tin-nhan">Tin nhắn khách</option>
            <option value="khac">Khác</option>
          </select>
        </label>
        <label>
          Loại
          <select value={loai} onChange={(e) => setLoai(e.target.value)}>
            <option value="binh-luan">Bình luận</option>
            <option value="so-lieu">Số liệu video (view, giữ chân…)</option>
            <option value="tin-nhan">Tin nhắn</option>
            <option value="khac">Khác</option>
          </select>
        </label>
        <label>
          Từ ngày
          <input type="date" value={tuNgay} onChange={(e) => setTuNgay(e.target.value)} />
        </label>
        <label>
          Đến ngày
          <input type="date" value={denNgay} onChange={(e) => setDenNgay(e.target.value)} />
        </label>
      </div>
      <label>
        Tên dữ liệu
        <input value={ten} onChange={(e) => setTen(e.target.value)} placeholder='vd "Bình luận TikTok tháng 9–11", "Số liệu YouTube Shorts 90 ngày"' />
      </label>
      <label>
        Chọn file (.csv, .txt, .xlsx) <span className="meta">— hoặc dán thẳng vào ô dưới</span>
        <input
          type="file"
          accept=".csv,.txt,.tsv,.xlsx,.xls"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const text = await docFile(f);
              setNoiDung(text);
              setTenFile(f.name);
              if (!ten) setTen(f.name.replace(/\.[^.]+$/, ''));
              setMsg(null);
            } catch (err) {
              setMsg(`Không đọc được file: ${(err as Error).message}`);
            }
            e.target.value = '';
          }}
        />
      </label>
      <label>
        Nội dung {tenFile && <span className="meta">(từ file {tenFile})</span>}
        <textarea rows={8} value={noiDung} onChange={(e) => setNoiDung(e.target.value)} placeholder="Dán bình luận, tin nhắn khách hỏi, hoặc bảng số liệu…" />
        <span className="meta">{noiDung.length.toLocaleString('vi-VN')} ký tự · tối đa 3 triệu ký tự mỗi lần</span>
      </label>
      <div className="inline">
        <button
          disabled={pending || !noiDung.trim()}
          onClick={() =>
            start(async () => {
              const err = await themDuLieu({ nguon, loai, ten, noi_dung: noiDung, tu_ngay: tuNgay, den_ngay: denNgay });
              if (err) return setMsg(err);
              setNoiDung('');
              setTen('');
              setTenFile(null);
              setMsg('✓ Đã thêm — bấm "Tóm tắt insight" khi đã thêm đủ dữ liệu');
              router.refresh();
            })
          }
        >
          {pending ? 'Đang lưu…' : 'Thêm dữ liệu'}
        </button>
        <Bao msg={msg} />
      </div>
    </div>
  );
}

/** Nhập file XUẤT tin nhắn Messenger (.zip / .json / cả thư mục): đọc + che thông tin cá nhân + chọn mẫu ngay trên máy,
 *  chỉ gửi lên phần chữ đã che (~1,2 triệu ký tự). */
export function NhapTinNhanForm() {
  const router = useRouter();
  const [dang, setDang] = useState<string | null>(null);
  const [ds, setDs] = useState<HoiThoai[] | null>(null);
  const [baoDoc, setBaoDoc] = useState<string | null>(null);
  const [shopChon, setShopChon] = useState<{ ten: string; so: number }[]>([]);
  const [phiaShop, setPhiaShop] = useState('');
  const [tuNgay, setTuNgay] = useState('');
  const [denNgay, setDenNgay] = useState('');
  const [toiThieu, setToiThieu] = useState(6);
  const [kq, setKq] = useState<KetQua | null>(null);
  const [ten, setTen] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const doc = async (list: FileList | null) => {
    if (!list?.length) return;
    const files = [...list]
      .map((f) => ({ ten: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name, file: f as Blob }))
      .filter((f) => /\.(zip|json)$/i.test(f.ten));
    if (!files.length) return setMsg('Không thấy file .zip hay .json nào.');
    setMsg(null);
    setKq(null);
    setDs(null);
    try {
      const r = await docFileXuat(files, (viec, xong, tong) => setDang(tong > 1 ? `${viec}: ${xong}/${tong} file` : `${viec}…`));
      if (!r.hoiThoai.length) {
        setMsg(`Không thấy tin nhắn nào trong file đã chọn${r.loi.length ? ` (lỗi: ${r.loi.slice(0, 3).join('; ')})` : ''}. Cần file xuất định dạng JSON (không phải HTML).`);
        return;
      }
      const shop = doanPhiaShop(r.hoiThoai);
      const cuoi = Math.max(...r.hoiThoai.map((h) => h.tin[h.tin.length - 1]!.luc));
      setDs(r.hoiThoai);
      setShopChon(shop);
      setPhiaShop(shop[0]?.ten ?? '');
      setDenNgay(new Date(cuoi).toISOString().slice(0, 10));
      setTuNgay(new Date(cuoi - 183 * 86400_000).toISOString().slice(0, 10)); // mặc định 6 tháng gần nhất
      setBaoDoc(`Đọc ${r.soFileJson.toLocaleString('vi-VN')} file tin nhắn → ${r.hoiThoai.length.toLocaleString('vi-VN')} hội thoại${r.loi.length ? ` · ${r.loi.length} file lỗi bị bỏ qua` : ''}`);
    } catch (e) {
      setMsg(`Không đọc được: ${(e as Error).message}`);
    } finally {
      setDang(null);
    }
  };

  const lap = () => {
    if (!ds) return;
    setDang('Đang che thông tin cá nhân và chọn mẫu…');
    setTimeout(() => {
      try {
        const r = lapMau(ds, { phiaShop, tuNgay, denNgay, toiThieuTin: toiThieu, nganSach: 1_200_000 });
        setKq(r);
        setTen(`Tin nhắn Messenger ${r.tuNgay ?? ''} → ${r.denNgay ?? ''}`);
      } finally {
        setDang(null);
      }
    }, 30);
  };

  return (
    <div className="card settings wide">
      <p className="meta" style={{ margin: 0 }}>
        Chọn file tải về từ Facebook (<strong>.zip</strong>, nhiều phần thì chọn hết một lượt) — hoặc file <strong>.json</strong> / cả thư mục đã giải nén.
        Máy đọc ngay trên trình duyệt, <strong>che tên, số điện thoại, email, địa chỉ</strong> trước khi gửi lên; file gốc không rời máy mày.
      </p>
      <div className="inline wrap">
        <label>
          Chọn file .zip / .json
          <input type="file" multiple accept=".zip,.json" disabled={!!dang || pending} onChange={(e) => { void doc(e.target.files); e.target.value = ''; }} />
        </label>
        <label>
          …hoặc cả thư mục đã giải nén
          <input
            type="file"
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            disabled={!!dang || pending}
            onChange={(e) => { void doc(e.target.files); e.target.value = ''; }}
          />
        </label>
      </div>
      {dang && <p className="meta">⏳ {dang}</p>}
      {ds && (
        <>
          <p className="on" style={{ margin: 0 }}>✓ {baoDoc}</p>
          <div className="inline wrap">
            <label>
              Phía shop (tên Trang)
              <select value={phiaShop} onChange={(e) => { setPhiaShop(e.target.value); setKq(null); }}>
                {shopChon.map((s) => <option key={s.ten} value={s.ten}>{s.ten} ({s.so.toLocaleString('vi-VN')} hội thoại)</option>)}
              </select>
            </label>
            <label>
              Từ ngày
              <input type="date" value={tuNgay} onChange={(e) => { setTuNgay(e.target.value); setKq(null); }} />
            </label>
            <label>
              Đến ngày
              <input type="date" value={denNgay} onChange={(e) => { setDenNgay(e.target.value); setKq(null); }} />
            </label>
            <label>
              Bỏ hội thoại ngắn hơn
              <select value={toiThieu} onChange={(e) => { setToiThieu(Number(e.target.value)); setKq(null); }}>
                {[2, 4, 6, 8, 10, 15].map((n) => <option key={n} value={n}>{n} tin</option>)}
              </select>
            </label>
          </div>
          <div className="inline">
            <button className="ghost" disabled={!!dang || !phiaShop} onClick={lap}>Lọc & chọn mẫu</button>
            <span className="meta">Chọn ngẫu nhiên tối đa ~1,2 triệu ký tự (thường 200–400 hội thoại) — đủ để thấy quy luật, AI đọc tốn khoảng $0,1–0,3.</span>
          </div>
        </>
      )}
      {kq && (
        <>
          {kq.daChon ? (
            <p style={{ margin: 0 }}>
              <strong>{kq.daChon.toLocaleString('vi-VN')}</strong> hội thoại được chọn / {kq.duDieuKien.toLocaleString('vi-VN')} đủ điều kiện / {kq.tong.toLocaleString('vi-VN')} tất cả
              {kq.soTinMau ? ` · gom ${kq.soTinMau} tin trả lời mẫu của shop` : ''} · {kq.chu.length.toLocaleString('vi-VN')} ký tự
            </p>
          ) : (
            <p className="warn" style={{ margin: 0 }}>Không có hội thoại nào đủ điều kiện — nới khoảng ngày, giảm số tin tối thiểu, hoặc kiểm tra lại "Phía shop".</p>
          )}
          {kq.daChon > 0 && (
            <>
              <details>
                <summary className="meta">Xem trước (kiểm tra thông tin cá nhân đã được che chưa)</summary>
                <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 400, overflow: 'auto' }}>{kq.chu.slice(0, 6000)}{kq.chu.length > 6000 ? '\n…' : ''}</pre>
              </details>
              <label>
                Tên dữ liệu
                <input value={ten} onChange={(e) => setTen(e.target.value)} />
              </label>
              <div className="inline">
                <button
                  disabled={pending || !ten.trim()}
                  onClick={() =>
                    start(async () => {
                      const err = await themDuLieu({ nguon: 'facebook', loai: 'tin-nhan', ten, noi_dung: kq.chu, tu_ngay: kq.tuNgay ?? '', den_ngay: kq.denNgay ?? '' });
                      if (err) return setMsg(err);
                      setDs(null);
                      setKq(null);
                      setMsg('✓ Đã thêm vào kho — bấm "Tóm tắt insight" bên dưới');
                      router.refresh();
                    })
                  }
                >
                  {pending ? 'Đang lưu…' : 'Thêm vào kho'}
                </button>
              </div>
            </>
          )}
        </>
      )}
      <Bao msg={msg} />
    </div>
  );
}

export function XoaDuLieuButton({ id, ten }: { id: string; ten: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="link"
      disabled={pending}
      onClick={() => {
        if (confirm(`Xóa dữ liệu "${ten}"? (Bản insight đã duyệt không bị ảnh hưởng)`))
          start(async () => {
            const err = await xoaDuLieu(id);
            if (err) alert(err);
            router.refresh();
          });
      }}
    >
      Xóa
    </button>
  );
}

export function TomTatButton({ dangChay, soChuaDoc, soFile }: { dangChay: boolean; soChuaDoc: number; soFile: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  // Đang chạy → tự làm mới để hiện kết quả
  useEffect(() => {
    if (!dangChay) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [dangChay, router]);
  return (
    <div className="inline wrap">
      <button
        disabled={pending || dangChay || !soFile}
        onClick={() =>
          start(async () => {
            setMsg(await tomTatInsight());
            router.refresh();
          })
        }
      >
        {dangChay ? '⏳ Đang tóm tắt…' : '✨ Tóm tắt insight'}
      </button>
      <span className="meta">
        {soChuaDoc ? `${soChuaDoc} file mới sẽ được đọc (rẻ) rồi` : 'Các file đã đọc rồi,'} AI gộp thành bản insight (~$0.1–0.3). Mất 1–5 phút, trang tự cập nhật.
      </span>
      <Bao msg={msg} />
    </div>
  );
}

export function DuyetInsightForm({ banDangDung, banAi }: { banDangDung: string; banAi: string | null }) {
  const [msg, action, pending] = useActionState(duyetInsight, null);
  const [text, setText] = useState(banDangDung || banAi || '');
  return (
    <form action={action} className="settings wide">
      <label>
        <strong>Bản insight dùng cho dự án</strong>
        <span className="meta">Sửa thẳng ở đây (markdown: ## tiêu đề, - gạch đầu dòng) rồi bấm Duyệt. Các bước ý tưởng / kịch bản chỉ đọc bản đã duyệt.</span>
        <textarea name="da_duyet" rows={22} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <div className="inline wrap">
        <button type="submit" disabled={pending || !text.trim()}>{pending ? 'Đang lưu…' : '✓ Duyệt bản này'}</button>
        {banAi && text !== banAi && (
          <button type="button" className="ghost" onClick={() => setText(banAi)}>Lấy lại bản AI mới nhất</button>
        )}
        <Bao msg={msg} />
      </div>
    </form>
  );
}

// ───────────── Khuôn video ─────────────

export function KhuonForm({ ma, ten, noiDung, sua }: { ma: string; ten: string; noiDung: NoiDungKhuon; sua: boolean }) {
  const [msg, action, pending] = useActionState(luuKhuon.bind(null, ma), null);
  const o = (name: string, label: string, value: string, rows = 2, hint?: string) => (
    <label>
      <strong>{label}</strong>
      {hint && <span className="meta">{hint}</span>}
      <textarea name={name} rows={rows} defaultValue={value} disabled={!sua} />
    </label>
  );
  return (
    <form action={action} className="card settings wide">
      <label>
        <strong>Tên khuôn</strong>
        <input name="ten" defaultValue={ten} disabled={!sua} />
      </label>
      {o('muc_tieu', 'Mục tiêu', noiDung.muc_tieu)}
      {o('khi_nao_dung', 'Khi nào dùng', noiDung.khi_nao_dung)}
      <div className="inline wrap">
        <label>
          <strong>Độ dài</strong>
          <input name="do_dai" defaultValue={noiDung.do_dai} disabled={!sua} />
        </label>
        <label>
          <strong>Người nói</strong>
          <input name="nguoi_noi" defaultValue={noiDung.nguoi_noi} disabled={!sua} />
        </label>
        <label>
          <strong>Phong cách dựng</strong>
          <input name="phong_cach_dung" defaultValue={noiDung.phong_cach_dung} disabled={!sua} />
        </label>
      </div>
      {o('nhip', 'Các nhịp', nhipThanhChu(noiDung.nhip), 7, 'Mỗi dòng một nhịp: Tên | mô tả | khoảng giây (vd "Hook | Câu hỏi gây tò mò | 0–3")')}
      {o('hook_mau', 'Hook mẫu', noiDung.hook_mau.join('\n'), 4, 'Mỗi dòng một câu')}
      {o('nen_tranh', 'Nên tránh', noiDung.nen_tranh.join('\n'), 4, 'Mỗi dòng một ý')}
      {o('ghi_chu', 'Ghi chú của mày', noiDung.ghi_chu, 3, 'Gu riêng của shop cho khuôn này — AI ưu tiên làm theo')}
      {sua && (
        <div className="inline">
          <button type="submit" disabled={pending}>{pending ? 'Đang lưu…' : 'Lưu khuôn'}</button>
          <Bao msg={msg} />
        </div>
      )}
    </form>
  );
}

export function VideoMauForm({ ma, ds, sua }: { ma: string; ds: VideoMau[]; sua: boolean }) {
  const router = useRouter();
  const [msg, action, pending] = useActionState(async (prev: string | null, fd: FormData) => {
    const err = await themVideoMau(ma, prev, fd);
    if (!err) router.refresh();
    return err;
  }, null);
  const [xoaDang, start] = useTransition();
  return (
    <div className="card settings wide">
      {ds.length ? (
        <ul>
          {ds.map((v) => (
            <li key={v.link}>
              <a href={v.link} target="_blank" rel="noreferrer">{v.link}</a>
              {v.ghi_chu && <span className="meta"> — {v.ghi_chu}</span>}
              {sua && (
                <button className="link" disabled={xoaDang} onClick={() => start(async () => (await xoaVideoMau(ma, v.link), router.refresh()))}>
                  {' '}Xóa
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="meta">Chưa có video mẫu. Thêm dần — đủ 2–3 video là tao phân tích để chỉnh khuôn theo đúng gu shop.</p>
      )}
      {sua && (
        <form action={action} className="inline wrap">
          <input name="link" placeholder="Link video (TikTok / Facebook / YouTube…)" style={{ minWidth: 280 }} />
          <input name="ghi_chu" placeholder="Ghi chú: vì sao chọn video này" style={{ minWidth: 240 }} />
          <button type="submit" className="ghost" disabled={pending}>Thêm video mẫu</button>
          <Bao msg={msg} />
        </form>
      )}
    </div>
  );
}
