import { Fragment } from 'react';
import Link from 'next/link';
import { classifyCost, modelLabel } from '@app/core';
import type { SupabaseClient } from '@supabase/supabase-js';

const TZ = 'Asia/Ho_Chi_Minh';

/** Khoảng thời gian xem báo cáo (?ky=...) */
export const KY = [
  { ma: 'hom-nay', ten: 'Hôm nay' },
  { ma: '7-ngay', ten: '7 ngày' },
  { ma: '30-ngay', ten: '30 ngày' },
  { ma: 'thang-nay', ten: 'Tháng này' },
  { ma: 'thang-truoc', ten: 'Tháng trước' },
  { ma: 'tat-ca', ten: 'Tất cả' },
] as const;
export type Ky = (typeof KY)[number]['ma'];

type Call = {
  purpose: string;
  model: string;
  cost_usd: number | string;
  created_at: string;
  created_by: string | null;
  job_id: string | null;
  tokens_in: number;
  tokens_out: number;
};

const usd = (n: number) => `$${n < 0.1 && n > 0 ? n.toFixed(3) : n.toFixed(2)}`;
const pctOf = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
const ngayVN = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ }); // YYYY-MM-DD
const dauNgay = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);

function khoang(ky: Ky): { tu: Date | null; den: Date | null; nhan: string } {
  const homNay = ngayVN(new Date());
  const [y, m] = homNay.split('-').map(Number) as [number, number];
  const dauThang = `${homNay.slice(0, 7)}-01`;
  switch (ky) {
    case 'hom-nay':
      return { tu: dauNgay(homNay), den: null, nhan: 'hôm nay' };
    case '7-ngay':
      return { tu: new Date(dauNgay(homNay).getTime() - 6 * 86400_000), den: null, nhan: '7 ngày qua' };
    case '30-ngay':
      return { tu: new Date(dauNgay(homNay).getTime() - 29 * 86400_000), den: null, nhan: '30 ngày qua' };
    case 'thang-truoc': {
      const truoc = m === 1 ? `${y - 1}-12-01` : `${y}-${String(m - 1).padStart(2, '0')}-01`;
      return { tu: dauNgay(truoc), den: dauNgay(dauThang), nhan: `tháng ${truoc.slice(5, 7)}/${truoc.slice(0, 4)}` };
    }
    case 'tat-ca':
      return { tu: null, den: null, nhan: 'từ trước tới nay' };
    default:
      return { tu: dauNgay(dauThang), den: null, nhan: `tháng ${homNay.slice(5, 7)}/${homNay.slice(0, 4)}` };
  }
}

async function docTatCa(supabase: SupabaseClient, tu: Date | null, den: Date | null, cot: string): Promise<Call[]> {
  const ra: Call[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    let q = supabase.from('llm_calls').select(cot).order('created_at').range(from, from + 999);
    if (tu) q = q.gte('created_at', tu.toISOString());
    if (den) q = q.lt('created_at', den.toISOString());
    const { data, error } = await q;
    if (error) throw error;
    ra.push(...((data ?? []) as unknown as Call[]));
    if (!data || data.length < 1000) break;
  }
  return ra;
}

function cong<K>(m: Map<K, { n: number; usd: number }>, k: K, v: number) {
  const x = m.get(k) ?? { n: 0, usd: 0 };
  x.n++;
  x.usd += v;
  m.set(k, x);
}

/** Thanh tỉ lệ nhỏ trong bảng (một màu, chỉ để so độ lớn). */
function Thanh({ pct }: { pct: number }) {
  return (
    <span className="cost-bar" title={`${pct}%`}>
      <span style={{ width: `${Math.max(pct, pct > 0 ? 1.5 : 0)}%` }} />
    </span>
  );
}

/** Biểu đồ cột chi phí theo ngày (hoặc theo tháng khi xem "Tất cả"); rê chuột vào cột để xem chi tiết từng loại. */
function BieuDo({ cot }: { cot: { nhan: string; tong: number; chiTiet: [string, number][] }[] }) {
  const W = 720;
  const H = 180;
  const padL = 44;
  const padB = 22;
  const max = Math.max(...cot.map((c) => c.tong), 0.01);
  // vạch chia tròn số
  const buoc = [0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 50].find((b) => max / b <= 4) ?? 100;
  const vach = Array.from({ length: Math.floor(max / buoc) + 1 }, (_, i) => i * buoc);
  const top = Math.max(max, vach[vach.length - 1] ?? max);
  const rong = (W - padL) / Math.max(cot.length, 1);
  const y = (v: number) => H - padB - (v / top) * (H - padB - 8);
  const nhanMoi = Math.ceil(cot.length / 12); // không ghi nhãn mọi cột khi nhiều ngày
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="cost-chart" role="img" aria-label="Chi phí AI theo thời gian">
      {vach.map((v) => (
        <g key={v}>
          <line x1={padL} x2={W} y1={y(v)} y2={y(v)} className="cost-grid" />
          <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="cost-axis">${v < 1 ? v.toFixed(2) : v}</text>
        </g>
      ))}
      {cot.map((c, i) => {
        const x = padL + i * rong + 1;
        const w = Math.max(rong - 2, 1);
        const h = Math.max(H - padB - y(c.tong), c.tong > 0 ? 1 : 0);
        const r = Math.min(4, w / 2, h);
        return (
          <g key={c.nhan} className="cost-col">
            <rect x={padL + i * rong} y={0} width={rong} height={H - padB} className="cost-hit" />
            {h > 0 && (
              <path
                d={`M${x},${H - padB} V${H - padB - h + r} Q${x},${H - padB - h} ${x + r},${H - padB - h} H${x + w - r} Q${x + w},${H - padB - h} ${x + w},${H - padB - h + r} V${H - padB} Z`}
                className="cost-mark"
              />
            )}
            {i % nhanMoi === 0 && (
              <text x={x + w / 2} y={H - 6} textAnchor="middle" className="cost-axis">{c.nhan}</text>
            )}
            <title>{`${c.nhan}: ${usd(c.tong)}${c.chiTiet.length ? '\n' + c.chiTiet.map(([k, v]) => `· ${k}: ${usd(v)}`).join('\n') : ''}`}</title>
          </g>
        );
      })}
      <line x1={padL} x2={W} y1={H - padB} y2={H - padB} className="cost-base" />
    </svg>
  );
}

export async function CostReport({ supabase, ky }: { supabase: SupabaseClient; ky: Ky }) {
  const homNay = ngayVN(new Date());
  const dauThang = dauNgay(`${homNay.slice(0, 7)}-01`);
  const bay = new Date(dauNgay(homNay).getTime() - 6 * 86400_000);
  const { tu, den, nhan } = khoang(ky);

  const [gan, ds, { data: nguoi }, { data: caiDat }] = await Promise.all([
    docTatCa(supabase, bay < dauThang ? bay : dauThang, null, 'cost_usd,created_at,job_id'),
    docTatCa(supabase, tu, den, 'purpose,model,cost_usd,created_at,created_by,job_id,tokens_in,tokens_out'),
    supabase.from('profiles').select('user_id,display_name,role'),
    supabase.from('settings').select('key,value').in('key', ['daily_budget_usd', 'video_tran_ngay_usd']),
  ]);
  const tran = (k: string, mac: number) => Number(caiDat?.find((r) => r.key === k)?.value ?? mac);

  // ── Ô số lớn
  const tHomNay = dauNgay(homNay).getTime();
  const sum = (rows: { cost_usd: number | string }[]) => rows.reduce((s, r) => s + Number(r.cost_usd), 0);
  const homNayRows = gan.filter((r) => new Date(r.created_at).getTime() >= tHomNay);
  const homNayVideo = sum(homNayRows.filter((r) => r.job_id));
  const homNayKhac = sum(homNayRows.filter((r) => !r.job_id));
  const bayNgay = sum(gan.filter((r) => new Date(r.created_at) >= bay));
  const thangNay = sum(gan.filter((r) => new Date(r.created_at) >= dauThang));
  const ngayThu = Number(homNay.slice(8, 10));
  const soNgayThang = new Date(Number(homNay.slice(0, 4)), Number(homNay.slice(5, 7)), 0).getDate();
  const duKien = ngayThu ? (thangNay / ngayThu) * soNgayThang : 0;

  // ── Gom theo loại / bước / mô hình / người / video
  const tong = sum(ds);
  const theoLoai = new Map<string, { nhan: string; n: number; usd: number; buoc: Map<string, { n: number; usd: number; models: Set<string> }> }>();
  const theoModel = new Map<string, { n: number; usd: number }>();
  const theoNguoi = new Map<string, { n: number; usd: number }>();
  const theoVideo = new Map<string, { n: number; usd: number }>();
  const theoNgay = new Map<string, Map<string, number>>();

  // video → người tạo + tên
  const jobIds = [...new Set(ds.flatMap((r) => (r.job_id ? [r.job_id] : [])))];
  const jobs = new Map<string, { ten: string; tao_boi: string | null }>();
  for (let i = 0; i < jobIds.length; i += 200) {
    const { data } = await supabase.from('video_jobs').select('id,ten,tao_boi').in('id', jobIds.slice(i, i + 200));
    (data ?? []).forEach((j) => jobs.set(j.id as string, { ten: j.ten as string, tao_boi: (j.tao_boi as string | null) ?? null }));
  }
  const tenNguoi = new Map((nguoi ?? []).map((p) => [p.user_id as string, (p.display_name as string | null) || (p.user_id as string).slice(0, 8)]));

  const theoThang = !tu || (den ?? new Date()).getTime() - tu.getTime() > 62 * 86400_000;
  for (const r of ds) {
    const v = Number(r.cost_usd);
    const k = classifyCost(r.purpose);
    const l = theoLoai.get(k.category) ?? { nhan: k.categoryLabel, n: 0, usd: 0, buoc: new Map() };
    l.n++;
    l.usd += v;
    const b = l.buoc.get(k.stepLabel) ?? { n: 0, usd: 0, models: new Set<string>() };
    b.n++;
    b.usd += v;
    b.models.add(modelLabel(r.model));
    l.buoc.set(k.stepLabel, b);
    theoLoai.set(k.category, l);

    cong(theoModel, modelLabel(r.model), v);

    const job = r.job_id ? jobs.get(r.job_id) : undefined;
    const ai = r.created_by ?? job?.tao_boi ?? null;
    cong(theoNguoi, ai ? (tenNguoi.get(ai) ?? 'tài khoản đã xóa') : k.category === 'digest' || k.category === 'captions' ? 'Tự động (bản tin chạy theo lịch / nút Chạy ngay)' : 'Chạy bằng script / không rõ', v);

    if (r.job_id) cong(theoVideo, r.job_id, v);

    const ngay = ngayVN(new Date(r.created_at));
    const khoaNgay = theoThang ? ngay.slice(0, 7) : ngay;
    const d = theoNgay.get(khoaNgay) ?? new Map<string, number>();
    d.set(k.categoryLabel, (d.get(k.categoryLabel) ?? 0) + v);
    theoNgay.set(khoaNgay, d);
  }

  // cột biểu đồ: đủ mọi ngày trong khoảng (ngày không tốn gì = cột 0)
  const cot: { nhan: string; tong: number; chiTiet: [string, number][] }[] = [];
  if (!theoThang && tu) {
    const het = den ? den.getTime() : dauNgay(homNay).getTime() + 86400_000;
    for (let t = tu.getTime(); t < het; t += 86400_000) {
      const ngay = ngayVN(new Date(t + 3600_000));
      const d = theoNgay.get(ngay) ?? new Map();
      cot.push({ nhan: `${ngay.slice(8, 10)}/${ngay.slice(5, 7)}`, tong: [...d.values()].reduce((a, b) => a + b, 0), chiTiet: [...d.entries()].sort((a, b) => b[1] - a[1]) });
    }
  } else {
    for (const [thang, d] of [...theoNgay.entries()].sort()) {
      cot.push({ nhan: `${thang.slice(5, 7)}/${thang.slice(2, 4)}`, tong: [...d.values()].reduce((a, b) => a + b, 0), chiTiet: [...d.entries()].sort((a, b) => b[1] - a[1]) });
    }
  }

  const loai = [...theoLoai.entries()].sort((a, b) => b[1].usd - a[1].usd);
  const sapXep = (m: Map<string, { n: number; usd: number }>) => [...m.entries()].sort((a, b) => b[1].usd - a[1].usd);
  const tokens = ds.reduce((s, r) => s + (r.tokens_in ?? 0) + (r.tokens_out ?? 0), 0);

  return (
    <>
      <div className="cost-tiles">
        <div className="card">
          <div className="meta">Hôm nay</div>
          <div className="cost-big">{usd(homNayKhac + homNayVideo)}</div>
          <div className="meta">
            Bản tin + sản phẩm {usd(homNayKhac)} / trần ${tran('daily_budget_usd', 3)}
            <br />
            Video {usd(homNayVideo)} / trần ${tran('video_tran_ngay_usd', 8)}
          </div>
        </div>
        <div className="card">
          <div className="meta">7 ngày qua</div>
          <div className="cost-big">{usd(bayNgay)}</div>
          <div className="meta">≈ {usd(bayNgay / 7)}/ngày</div>
        </div>
        <div className="card">
          <div className="meta">Tháng này</div>
          <div className="cost-big">{usd(thangNay)}</div>
          <div className="meta">{ngayThu}/{soNgayThang} ngày</div>
        </div>
        <div className="card">
          <div className="meta">Dự kiến cả tháng</div>
          <div className="cost-big">{usd(duKien)}</div>
          <div className="meta">theo mức chi bình quân tháng này</div>
        </div>
      </div>

      <div className="inline wrap" style={{ margin: '14px 0 10px' }}>
        <span className="meta">Xem:</span>
        {KY.map((k) => (
          <Link key={k.ma} href={`/settings?ky=${k.ma}`} className={`chip${k.ma === ky ? ' active' : ''}`}>
            {k.ten}
          </Link>
        ))}
      </div>

      <div className="card">
        <div className="inline wrap">
          <strong>Tổng {nhan}: {usd(tong)}</strong>
          <span className="meta">
            {ds.length} lần gọi · {(tokens / 1_000_000).toFixed(2)} triệu token
          </span>
        </div>
        {cot.length > 1 && <BieuDo cot={cot} />}
        {cot.length > 1 && <div className="meta">Rê chuột vào cột để xem chi tiết từng loại.</div>}
      </div>

      <h2>Theo loại</h2>
      <div className="card scroll">
        <table>
          <thead>
            <tr>
              <th>Loại / bước</th>
              <th style={{ textAlign: 'right' }}>Lần gọi</th>
              <th style={{ textAlign: 'right' }}>Chi phí</th>
              <th style={{ width: '30%' }}>Tỉ lệ</th>
            </tr>
          </thead>
          <tbody>
            {loai.map(([key, l]) => (
              <Fragment key={key}>
                <tr className="cost-cat">
                  <td><strong>{l.nhan}</strong></td>
                  <td style={{ textAlign: 'right' }}>{l.n}</td>
                  <td style={{ textAlign: 'right' }}><strong>{usd(l.usd)}</strong></td>
                  <td><Thanh pct={pctOf(l.usd, tong)} /> <span className="meta">{pctOf(l.usd, tong)}%</span></td>
                </tr>
                {[...l.buoc.entries()]
                  .sort((a, b) => b[1].usd - a[1].usd)
                  .map(([buoc, b]) => (
                    <tr key={`${key}-${buoc}`} className="cost-step">
                      <td>
                        {buoc}
                        <div className="meta">{[...b.models].join(', ')}</div>
                      </td>
                      <td style={{ textAlign: 'right' }} className="meta">{b.n}</td>
                      <td style={{ textAlign: 'right' }}>{usd(b.usd)}</td>
                      <td className="meta">{pctOf(b.usd, tong)}%</td>
                    </tr>
                  ))}
              </Fragment>
            ))}
            {!loai.length && (
              <tr>
                <td colSpan={4} className="muted">Không có chi phí nào trong khoảng này.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="cost-2col">
        <div>
          <h2>Theo mô hình AI / dịch vụ</h2>
          <div className="card scroll">
            <table>
              <tbody>
                {sapXep(theoModel).map(([m, x]) => (
                  <tr key={m}>
                    <td>{m}</td>
                    <td style={{ textAlign: 'right' }} className="meta">{x.n} lần</td>
                    <td style={{ textAlign: 'right' }}>{usd(x.usd)}</td>
                    <td className="meta" style={{ textAlign: 'right' }}>{pctOf(x.usd, tong)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h2>Theo người</h2>
          <div className="card scroll">
            <table>
              <tbody>
                {sapXep(theoNguoi).map(([ai, x]) => (
                  <tr key={ai}>
                    <td>{ai}</td>
                    <td style={{ textAlign: 'right' }} className="meta">{x.n} lần</td>
                    <td style={{ textAlign: 'right' }}>{usd(x.usd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {theoVideo.size > 0 && (
        <>
          <h2>Theo từng video ({theoVideo.size})</h2>
          <div className="card scroll">
            <table>
              <tbody>
                {sapXep(theoVideo)
                  .slice(0, 30)
                  .map(([id, x]) => (
                    <tr key={id}>
                      <td>
                        <Link href={`/video/${id}`}>{jobs.get(id)?.ten ?? id.slice(0, 8)}</Link>
                      </td>
                      <td style={{ textAlign: 'right' }} className="meta">{x.n} lần</td>
                      <td style={{ textAlign: 'right' }}>{usd(x.usd)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {theoVideo.size > 30 && <div className="meta">Hiện 30 video tốn nhất.</div>}
          </div>
        </>
      )}

      <p className="meta">
        Chi phí tính theo giá công bố của từng dịch vụ tại lúc gọi; hóa đơn thật xem ở trang Anthropic / ElevenLabs. Tính năng mới (làm ảnh, giọng
        nói…) ghi chi phí theo quy ước <code>loại:bước</code> sẽ tự hiện thành dòng riêng ở bảng "Theo loại".
      </p>
    </>
  );
}
