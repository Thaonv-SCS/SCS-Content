'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { DuyetYTuong, KeHoach, KichBan, YTuong } from '@app/du-an/src/types.ts';
import { chayLai, duyetBuoc, huyDuAn, lamLaiBuoc, luuKichBanSuaTay, vietLaiDoanKB } from '../actions';

const Bao = ({ msg }: { msg: string | null }) => (msg ? <span className="warn">{msg}</span> : null);

type Quyen = { lam: boolean; duyet: boolean };

// ───────────── Cổng duyệt chung: góp ý làm lại ─────────────

function LamLaiForm({ id, buoc, nhan = '↻ Làm lại theo góp ý' }: { id: string; buoc: 'y-tuong' | 'ke-hoach' | 'kich-ban'; nhan?: string }) {
  const [msg, action, pending] = useActionState(lamLaiBuoc.bind(null, id, buoc), null);
  return (
    <form action={action} className="inline wrap">
      <input name="yeu_cau" placeholder="Góp ý cho AI: chưa đạt chỗ nào, muốn hướng nào…" style={{ minWidth: 320, flex: 1 }} />
      <button type="submit" className="ghost" disabled={pending}>{pending ? 'Đang gửi…' : nhan}</button>
      <Bao msg={msg} />
    </form>
  );
}

// ───────────── Bước 1: Phát triển ý tưởng ─────────────

const Diem = ({ n }: { n: number }) => <span title={`${n}/5`}>{'●'.repeat(Math.max(0, Math.min(5, Math.round(n))))}{'○'.repeat(5 - Math.max(0, Math.min(5, Math.round(n))))}</span>;

export function YTuongView({ id, nd, duyet, cho, q, tenKhuon }: { id: string; nd: YTuong; duyet: DuyetYTuong | null; cho: boolean; q: Quyen; tenKhuon: Record<string, string> }) {
  const [goc, setGoc] = useState<number>(duyet?.goc ?? nd.de_xuat.goc);
  const [msg, action, pending] = useActionState(duyetBuoc.bind(null, id, 'y-tuong'), null);
  const daChon = duyet ? (duyet.goc_rieng ? 0 : duyet.goc ?? 0) : null;
  return (
    <div className="settings wide">
      <p>{nd.tom_tat_brief}</p>
      <div>
        <strong>Insight người xem</strong>
        <ul>
          {nd.insight.map((x, i) => (
            <li key={i}>
              {x.noi_dung} {x.gia_dinh && <span className="badge warn">giả định</span>}
              <div className="meta">{x.bang_chung}</div>
            </li>
          ))}
        </ul>
      </div>
      <div className="du-an-goc">
        {nd.goc.map((g, i) => {
          const so = i + 1;
          const deXuat = nd.de_xuat.goc === so;
          const chon = cho ? goc === so : daChon === so;
          return (
            <label key={i} className={`card du-an-goc-the ${chon ? 'chon' : ''}`}>
              <div className="inline wrap" style={{ gap: 8 }}>
                {cho && q.duyet && <input type="radio" name="goc_radio" checked={goc === so} onChange={() => setGoc(so)} />}
                <strong>Góc {so}: {g.ten}</strong>
                {deXuat && <span className="badge">★ AI đề xuất</span>}
                {!cho && daChon === so && <span className="badge on">✓ đã chọn</span>}
              </div>
              <span className="meta">Khuôn: {tenKhuon[g.khuon] ?? g.khuon}</span>
              <p style={{ margin: 0 }}>{g.mo_ta}</p>
              <div className="meta">Vì sao hợp: {g.vi_sao}</div>
              <div className="du-an-diem">
                <span>Hấp dẫn <Diem n={g.diem.hap_dan} /></span>
                <span>Bán hàng <Diem n={g.diem.ban_hang} /></span>
                <span>Dễ quay <Diem n={g.diem.de_quay} /></span>
              </div>
              <div><strong>Ưu:</strong> {g.uu.join(' · ')}</div>
              <div><strong>Nhược:</strong> {g.nhuoc.join(' · ')}</div>
              <div className="warn"><strong>Rủi ro:</strong> {g.rui_ro.join(' · ')}</div>
              <div><strong>Hook thử:</strong><ul>{g.hook.map((h, k) => <li key={k}>“{h}”</li>)}</ul></div>
            </label>
          );
        })}
      </div>
      <div className="verify">
        <strong>AI đề xuất góc {nd.de_xuat.goc}:</strong> {nd.de_xuat.ly_do}
      </div>
      {nd.cau_hoi.length > 0 && (
        <div>
          <strong>Câu hỏi cho mày</strong>
          <ol>{nd.cau_hoi.map((c, i) => <li key={i}>{c}</li>)}</ol>
        </div>
      )}
      {!cho && duyet && (
        <p className="meta">
          {duyet.goc_rieng ? `Đã duyệt với góc tự đặt: ${duyet.goc_rieng}` : `Đã duyệt góc ${duyet.goc}`}
          {duyet.ghi_chu ? ` · Ghi chú: ${duyet.ghi_chu}` : ''}
        </p>
      )}
      {cho && q.duyet && (
        <form action={action} className="card settings wide du-an-cong">
          <input type="hidden" name="goc" value={goc} />
          <strong>Duyệt ý tưởng</strong>
          <label>
            Ghi chú / trả lời câu hỏi <span className="meta">— AI dùng khi làm kế hoạch</span>
            <textarea name="ghi_chu" rows={3} />
          </label>
          <label>
            Hoặc góc của mày <span className="meta">— điền thì bỏ qua 3 góc trên</span>
            <textarea name="goc_rieng" rows={2} />
          </label>
          <div className="inline wrap">
            <button type="submit" disabled={pending}>{pending ? 'Đang gửi…' : `✓ Duyệt góc ${goc} → làm kế hoạch`}</button>
            <Bao msg={msg} />
          </div>
        </form>
      )}
      {cho && q.lam && <LamLaiForm id={id} buoc="y-tuong" nhan="↻ Nghĩ lại 3 góc khác" />}
    </div>
  );
}

// ───────────── Bước 2: Kế hoạch nội dung ─────────────

const NGUON: Record<string, [string, string]> = {
  web: ['web shop', 'on'],
  'kho-tri-thuc': ['kho tri thức', ''],
  'can-xac-minh': ['cần xác minh', 'warn'],
};

export function KeHoachView({ id, nd, cho, q, tenKhuon, ghiChuDuyet }: { id: string; nd: KeHoach; cho: boolean; q: Quyen; tenKhuon: Record<string, string>; ghiChuDuyet?: string }) {
  const [msg, action, pending] = useActionState(duyetBuoc.bind(null, id, 'ke-hoach'), null);
  return (
    <div className="settings wide">
      <table className="du-an-bang">
        <tbody>
          <tr><th>Khuôn</th><td>{tenKhuon[nd.khuon] ?? nd.khuon} <span className="meta">— {nd.ly_do_khuon}</span></td></tr>
          <tr><th>Độ dài</th><td>{nd.do_dai}</td></tr>
          <tr><th>Nền tảng</th><td>{nd.nen_tang.join(', ')}</td></tr>
          <tr><th>Thông điệp</th><td><strong>{nd.thong_diep}</strong></td></tr>
          <tr><th>CTA</th><td>{nd.cta}</td></tr>
          <tr><th>Nhân vật</th><td>{nd.nhan_vat.map((n) => <div key={n.vai}><strong>{n.vai}</strong>: {n.mo_ta}</div>)}</td></tr>
        </tbody>
      </table>
      <div>
        <strong>Các nhịp</strong>
        <table className="du-an-bang">
          <thead><tr><th>Nhịp</th><th>Ý chính</th><th>Giây</th></tr></thead>
          <tbody>{nd.nhip.map((n, i) => <tr key={i}><td>{n.ten}</td><td>{n.y_chinh}</td><td>{n.giay}</td></tr>)}</tbody>
        </table>
      </div>
      <div>
        <strong>Dữ kiện sẽ nói</strong>
        <table className="du-an-bang">
          <thead><tr><th>Dữ kiện</th><th>Nguồn</th><th>Chi tiết</th></tr></thead>
          <tbody>
            {nd.du_kien.map((d, i) => (
              <tr key={i}>
                <td>{d.noi_dung}</td>
                <td><span className={`badge ${NGUON[d.nguon]?.[1] ?? ''}`}>{NGUON[d.nguon]?.[0] ?? d.nguon}</span></td>
                <td className="meta">{d.chi_tiet}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {nd.luu_y_san_xuat.length > 0 && <div><strong>Chuẩn bị sản xuất</strong><ul>{nd.luu_y_san_xuat.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {nd.goi_y_chuoi.length > 0 && <div><strong>Gợi ý làm thành chuỗi</strong><ul>{nd.goi_y_chuoi.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {!cho && ghiChuDuyet && <p className="meta">Ghi chú khi duyệt: {ghiChuDuyet}</p>}
      {cho && q.duyet && (
        <form action={action} className="card settings wide du-an-cong">
          <strong>Duyệt kế hoạch</strong>
          <label>
            Ghi chú cho kịch bản <span className="meta">— vd ai nói, câu bắt buộc có, độ dài…</span>
            <textarea name="ghi_chu" rows={3} />
          </label>
          <div className="inline wrap">
            <button type="submit" disabled={pending}>{pending ? 'Đang gửi…' : '✓ Duyệt → viết kịch bản'}</button>
            <Bao msg={msg} />
          </div>
        </form>
      )}
      {cho && q.lam && <LamLaiForm id={id} buoc="ke-hoach" />}
    </div>
  );
}

// ───────────── Bước 3: Kịch bản ─────────────

const giayDep = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

export function KichBanView({ id, nd, cho, xong, q, banIn }: { id: string; nd: KichBan; cho: boolean; xong: boolean; q: Quyen; banIn: string }) {
  const router = useRouter();
  const [sua, setSua] = useState(false);
  const [ban, setBan] = useState<KichBan>(nd);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [mo, setMo] = useState<number | null>(null);
  const [gopY, setGopY] = useState('');
  const [msgDuyet, actionDuyet, pendingDuyet] = useActionState(duyetBuoc.bind(null, id, 'kich-ban'), null);
  const duocSua = q.lam && (cho || xong);

  const doiDoan = (i: number, patch: Partial<KichBan['doan'][number]>) =>
    setBan((b) => ({ ...b, doan: b.doan.map((d, k) => (k === i ? { ...d, ...patch } : d)) }));

  return (
    <div className="settings wide">
      <div className="inline wrap">
        <strong style={{ fontSize: 17 }}>{nd.tieu_de}</strong>
        <span className="badge">{giayDep(nd.tong_giay)} · {nd.doan.length} đoạn</span>
        <a href={banIn} target="_blank" rel="noreferrer" className="button ghost-button">📱 Bản đọc khi quay / in</a>
      </div>
      <div>
        <strong>Phương án hook</strong>
        <ol>
          {nd.hook.map((h, i) => (
            <li key={i} className={nd.hook_chon === i + 1 ? 'on' : ''}>
              “{h.cau}” {nd.hook_chon === i + 1 && <span className="badge on">đang dùng</span>}
              <div className="meta">{h.ly_do}</div>
            </li>
          ))}
        </ol>
      </div>

      <div className="scroll">
        <table className="du-an-kb">
          <thead>
            <tr><th>#</th><th>Nhịp</th><th>Lời nói</th><th>Hình</th><th>Giây</th>{duocSua && !sua && <th></th>}</tr>
          </thead>
          <tbody>
            {(sua ? ban : nd).doan.map((d, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  {d.nhip}
                  {sua ? (
                    <input value={d.nguoi_noi} onChange={(e) => doiDoan(i, { nguoi_noi: e.target.value.toUpperCase().slice(0, 2) })} placeholder="A/B" style={{ width: 48 }} />
                  ) : (
                    d.nguoi_noi && <div><span className="badge">{d.nguoi_noi}</span></div>
                  )}
                </td>
                <td className="du-an-loi">
                  {sua ? <textarea rows={4} value={d.loi} onChange={(e) => doiDoan(i, { loi: e.target.value })} /> : d.loi}
                  {d.can_xac_minh && <div className="warn" style={{ fontSize: 12 }}>⚠ Cần xác minh: {d.can_xac_minh}</div>}
                </td>
                <td className="meta">{sua ? <textarea rows={4} value={d.hinh} onChange={(e) => doiDoan(i, { hinh: e.target.value })} /> : d.hinh}</td>
                <td>{sua ? <input type="number" value={d.giay} onChange={(e) => doiDoan(i, { giay: Number(e.target.value) })} style={{ width: 60 }} /> : d.giay}</td>
                {duocSua && !sua && (
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {mo === i ? (
                      <div className="settings" style={{ minWidth: 220 }}>
                        <textarea rows={2} value={gopY} onChange={(e) => setGopY(e.target.value)} placeholder="Góp ý cho đoạn này" />
                        <div className="inline">
                          <button
                            className="small"
                            disabled={pending || !gopY.trim()}
                            onClick={() =>
                              start(async () => {
                                const err = await vietLaiDoanKB(id, i, gopY);
                                setMsg(err);
                                if (!err) {
                                  setMo(null);
                                  setGopY('');
                                }
                                router.refresh();
                              })
                            }
                          >
                            Gửi
                          </button>
                          <button className="link" onClick={() => setMo(null)}>Hủy</button>
                        </div>
                      </div>
                    ) : (
                      <button className="ghost small" onClick={() => (setMo(i), setGopY(''))}>↻ Viết lại đoạn</button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {nd.ghi_chu_quay.length > 0 && <div><strong>Ghi chú khi quay</strong><ul>{nd.ghi_chu_quay.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
      {nd.can_xac_minh.length > 0 && (
        <div className="verify">
          <strong>⚠ Cần xác minh trước khi quay</strong>
          <ul>{nd.can_xac_minh.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}

      {duocSua && (
        <div className="inline wrap">
          {sua ? (
            <>
              <button
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const err = await luuKichBanSuaTay(id, ban);
                    setMsg(err);
                    if (!err) setSua(false);
                    router.refresh();
                  })
                }
              >
                {pending ? 'Đang lưu…' : 'Lưu bản sửa'}
              </button>
              <button className="ghost" onClick={() => (setSua(false), setBan(nd))}>Hủy</button>
            </>
          ) : (
            <button className="ghost" onClick={() => (setBan(nd), setSua(true))}>✎ Sửa tay</button>
          )}
          <Bao msg={msg} />
        </div>
      )}
      {cho && q.duyet && !sua && (
        <form action={actionDuyet} className="card settings wide du-an-cong">
          <strong>Chốt kịch bản</strong>
          <input type="hidden" name="ghi_chu" value="" />
          <div className="inline wrap">
            <button type="submit" disabled={pendingDuyet}>{pendingDuyet ? 'Đang gửi…' : '✓ Chốt kịch bản'}</button>
            <Bao msg={msgDuyet} />
          </div>
        </form>
      )}
      {(cho || xong) && q.lam && !sua && <LamLaiForm id={id} buoc="kich-ban" nhan="↻ Viết lại cả kịch bản" />}
    </div>
  );
}

// ───────────── Nút chung ─────────────

export function ChayLaiButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="inline">
      <button disabled={pending} onClick={() => start(async () => (setMsg(await chayLai(id)), router.refresh()))}>↻ Chạy lại bước này</button>
      <Bao msg={msg} />
    </span>
  );
}

export function HuyButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      className="link"
      disabled={pending}
      onClick={() => {
        if (confirm('Hủy dự án này? AI sẽ không làm tiếp.')) start(async () => (await huyDuAn(id), router.refresh()));
      }}
    >
      Hủy dự án
    </button>
  );
}
