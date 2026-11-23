/**
 * Đọc file XUẤT tin nhắn Messenger (Facebook / Trang → "Tải thông tin xuống", định dạng JSON) NGAY TRONG TRÌNH DUYỆT:
 *  - nhận .zip (kể cả zip > 4GB có ảnh/video bên trong: chỉ đọc mục lục + các file JSON tin nhắn, không giải nén cả file),
 *    hoặc các file .json đã giải nén, hoặc cả thư mục;
 *  - sửa lỗi chữ tiếng Việt của Facebook (UTF-8 bị ghi thành từng byte), gộp message_1..n của cùng hội thoại;
 *  - che thông tin cá nhân (tên khách, số điện thoại, email, địa chỉ, số tài khoản) TRƯỚC khi gửi đi đâu;
 *  - lọc (khoảng ngày, độ dài), gom tin trả lời mẫu, chọn ngẫu nhiên vừa ngân sách ký tự → 1 khối chữ cho AI đọc.
 * Không dùng thư viện ngoài (chỉ Blob + DecompressionStream có sẵn trong trình duyệt / Node ≥ 21).
 */

// ───────────── Đọc .zip (đọc chọn lọc, hỗ trợ zip64) ─────────────

export interface MucZip {
  ten: string;
  kieuNen: number;
  coMa: boolean;
  nen: number;
  viTri: number;
}

async function docByte(f: Blob, tu: number, den: number): Promise<Uint8Array> {
  return new Uint8Array(await f.slice(tu, den).arrayBuffer());
}

/** Mục lục file zip (tên + vị trí từng file bên trong) — chỉ đọc phần cuối file. */
export async function lietKeZip(f: Blob): Promise<MucZip[]> {
  const duoi = Math.min(f.size, 22 + 65535 + 20);
  const goc = f.size - duoi;
  const buf = await docByte(f, goc, f.size);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      e = i;
      break;
    }
  }
  if (e < 0) throw new Error('không phải file .zip (hoặc file tải về chưa xong)');
  let cdSize = dv.getUint32(e + 12, true);
  let cdOff = dv.getUint32(e + 16, true);
  if (cdSize === 0xffffffff || cdOff === 0xffffffff || dv.getUint16(e + 10, true) === 0xffff) {
    // zip64: phần "locator" nằm ngay trước, chỉ tới bản ghi cuối 64-bit
    if (e < 20 || dv.getUint32(e - 20, true) !== 0x07064b50) throw new Error('file zip64 hỏng');
    const z64 = Number(dv.getBigUint64(e - 20 + 8, true));
    const r = await docByte(f, z64, z64 + 56);
    const d2 = new DataView(r.buffer, r.byteOffset, r.byteLength);
    if (d2.getUint32(0, true) !== 0x06064b50) throw new Error('file zip64 hỏng');
    cdSize = Number(d2.getBigUint64(40, true));
    cdOff = Number(d2.getBigUint64(48, true));
  }
  const cd = await docByte(f, cdOff, cdOff + cdSize);
  const v = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const td = new TextDecoder('utf-8');
  const ra: MucZip[] = [];
  let p = 0;
  while (p + 46 <= cd.length && v.getUint32(p, true) === 0x02014b50) {
    const coMa = (v.getUint16(p + 8, true) & 1) === 1;
    const kieuNen = v.getUint16(p + 10, true);
    let nen = v.getUint32(p + 20, true);
    let goc32 = v.getUint32(p + 24, true);
    const nLen = v.getUint16(p + 28, true);
    const xLen = v.getUint16(p + 30, true);
    const cLen = v.getUint16(p + 32, true);
    let viTri = v.getUint32(p + 42, true);
    const ten = td.decode(cd.subarray(p + 46, p + 46 + nLen));
    for (let x = p + 46 + nLen, het = x + xLen; x + 4 <= het; ) {
      const id = v.getUint16(x, true);
      const sz = v.getUint16(x + 2, true);
      if (id === 1) {
        let q = x + 4;
        if (goc32 === 0xffffffff) (goc32 = Number(v.getBigUint64(q, true))), (q += 8);
        if (nen === 0xffffffff) (nen = Number(v.getBigUint64(q, true))), (q += 8);
        if (viTri === 0xffffffff) viTri = Number(v.getBigUint64(q, true));
      }
      x += 4 + sz;
    }
    ra.push({ ten, kieuNen, coMa, nen, viTri });
    p += 46 + nLen + xLen + cLen;
  }
  return ra;
}

/** Giải nén 1 file bên trong zip. */
export async function docMucZip(f: Blob, m: MucZip): Promise<Uint8Array> {
  if (m.coMa) throw new Error(`${m.ten}: file zip có mật khẩu`);
  const h = await docByte(f, m.viTri, m.viTri + 30);
  const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  if (dv.getUint32(0, true) !== 0x04034b50) throw new Error(`zip hỏng ở ${m.ten}`);
  const bd = m.viTri + 30 + dv.getUint16(26, true) + dv.getUint16(28, true);
  const tho = f.slice(bd, bd + m.nen);
  if (m.kieuNen === 0) return new Uint8Array(await tho.arrayBuffer());
  if (m.kieuNen !== 8) throw new Error(`${m.ten}: kiểu nén ${m.kieuNen} chưa hỗ trợ`);
  const s = tho.stream().pipeThrough(new DecompressionStream('deflate-raw') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// ───────────── Tách hội thoại ─────────────

export interface Tin {
  ai: string;
  luc: number;
  chu: string;
}
export interface HoiThoai {
  khoa: string;
  nguoi: string[];
  tin: Tin[];
}

const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** Facebook ghi chữ UTF-8 thành từng byte ("Ä\u0091" thay vì "đ") → ghép lại. Chữ đã đúng thì giữ nguyên. */
export function suaChu(s: string): string {
  if (!s || !/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  try {
    return UTF8.decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  } catch {
    return s;
  }
}

/** File JSON có phải tin nhắn không (đọc trước theo tên để khỏi mở hàng nghìn file khác). */
export function laFileTinNhan(duongDan: string): boolean {
  const p = duongDan.replace(/\\/g, '/').toLowerCase();
  return p.endsWith('.json') && (/(^|\/)message_\d+\.json$/.test(p) || /messag|inbox|e2ee/.test(p));
}

type ThoTin = Record<string, unknown> & {
  sender_name?: string;
  senderName?: string;
  timestamp_ms?: number;
  timestamp?: number;
  content?: string;
  text?: string;
  share?: { link?: string };
  media?: { uri?: string }[];
};

function chuTin(m: ThoTin): string {
  if (m.is_unsent || m.isUnsent) return '';
  let c = suaChu(String(m.content ?? m.text ?? '')).trim();
  const kem: string[] = [];
  const co = (k: string) => Array.isArray(m[k]) && (m[k] as unknown[]).length > 0;
  if (co('photos')) kem.push('[ảnh]');
  if (co('videos')) kem.push('[video]');
  if (co('audio_files')) kem.push('[ghi âm]');
  if (co('files')) kem.push('[file]');
  if (co('gifs') || m.sticker) kem.push('[sticker]');
  for (const md of Array.isArray(m.media) ? m.media : []) {
    const u = String(md?.uri ?? '').toLowerCase();
    kem.push(/\.(mp4|mov|webm)$/.test(u) ? '[video]' : /\.(mp3|m4a|aac|ogg|wav)$/.test(u) ? '[ghi âm]' : '[ảnh]');
  }
  if (m.call_duration != null) kem.push('[cuộc gọi]');
  const link = m.share?.link;
  if (link && !c.includes(link)) c = `${c} ${link}`.trim();
  return [c, ...new Set(kem)].filter(Boolean).join(' ');
}

/** 1 file JSON → phần hội thoại (null nếu không phải file tin nhắn). */
export function docFileJson(duongDan: string, text: string): HoiThoai | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(text);
  } catch {
    return null;
  }
  if (!o || !Array.isArray(o.messages)) return null;
  const nguoi = (Array.isArray(o.participants) ? o.participants : [])
    .map((p: unknown) => suaChu(typeof p === 'string' ? p : String((p as { name?: string })?.name ?? '')))
    .filter(Boolean);
  const p = duongDan.replace(/\\/g, '/');
  const khoa = String(o.thread_path ?? o.threadPath ?? (/message_\d+\.json$/i.test(p) ? p.replace(/\/[^/]*$/, '') : p));
  const tin: Tin[] = [];
  for (const m of o.messages as ThoTin[]) {
    const chu = chuTin(m);
    if (!chu) continue;
    let luc = Number(m.timestamp_ms ?? m.timestamp ?? 0);
    if (luc && luc < 1e12) luc *= 1000;
    tin.push({ ai: suaChu(String(m.sender_name ?? m.senderName ?? '')), luc, chu });
  }
  return { khoa, nguoi, tin };
}

/** Gộp các phần (message_1, message_2… cùng hội thoại; nhiều file zip) → danh sách hội thoại, tin xếp theo giờ. */
export function gopHoiThoai(phan: HoiThoai[]): HoiThoai[] {
  const map = new Map<string, HoiThoai>();
  for (const h of phan) {
    const cu = map.get(h.khoa);
    if (!cu) map.set(h.khoa, { khoa: h.khoa, nguoi: [...h.nguoi], tin: [...h.tin] });
    else {
      for (const n of h.nguoi) if (!cu.nguoi.includes(n)) cu.nguoi.push(n);
      cu.tin.push(...h.tin);
    }
  }
  const ra = [...map.values()].filter((h) => h.tin.length);
  for (const h of ra) {
    // bỏ tin trùng (cùng người, cùng giờ, cùng chữ — gặp khi tải 2 lần chồng nhau)
    const thay = new Set<string>();
    h.tin = h.tin
      .sort((a, b) => a.luc - b.luc)
      .filter((t) => {
        const k = `${t.ai}|${t.luc}|${t.chu}`;
        return thay.has(k) ? false : (thay.add(k), true);
      });
    for (const t of h.tin) if (t.ai && !h.nguoi.includes(t.ai)) h.nguoi.push(t.ai);
  }
  return ra;
}

/** Đoán tên phía shop: người có mặt trong nhiều hội thoại nhất (tên Trang). */
export function doanPhiaShop(ds: HoiThoai[]): { ten: string; so: number }[] {
  const dem = new Map<string, number>();
  for (const h of ds) for (const n of new Set(h.nguoi)) dem.set(n, (dem.get(n) ?? 0) + 1);
  return [...dem.entries()]
    .map(([ten, so]) => ({ ten, so }))
    .sort((a, b) => b.so - a.so)
    .slice(0, 6);
}

// ───────────── Che thông tin cá nhân ─────────────

const RE_EMAIL = /[\w.+-]+@[\w-]+(\.[\w-]+)+/g;
const RE_SDT = /(?<![\d.,])(?:\+?84|0)(?:[\s.-]?\d){8,10}(?![\d.,]*\d)/g;
const RE_SO_DAI = /(?<![\d.,])\d(?:[\s-]?\d){8,}(?![\d.,]*\d)/g; // số tài khoản, mã đơn dài
// "địa chỉ: …", "đ/c: …", "dc: …" (bắt buộc có dấu hai chấm — "đc" không có ":" thường là "được")
const RE_NHAN_DIA_CHI = /(?<!\p{L})(địa chỉ|đ\/c|đc|dc)\s*:\s*[^\n]+/giu;
const TU_DIA_CHI =
  /(?<!\p{L})(phường|quận|huyện|thị xã|thị trấn|xã|thôn|xóm|ấp|ngõ|ngách|hẻm|kiệt|số nhà|tổ dân phố|khu phố|kp|tp|thành phố|tỉnh)(?!\p{L})|(?<!\p{L})[pq]\.\s?\d/giu;

/** Bộ che cho 1 hội thoại (dựng bộ lọc tên 1 lần). `tenKhach`: tên đầy đủ các khách trong hội thoại —
 *  che họ tên, "tên đệm + tên", và tên gọi kèm đại từ ("anh Tuấn", "chị Lan", "a Đức"). */
export function boChe(tenKhach: string[]): (chu: string, laKhach: boolean) => string {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const loc: [RegExp, string][] = [];
  for (const ten of tenKhach) {
    const tu = ten.normalize('NFC').trim().split(/\s+/);
    const bien = [tu.join(' '), ...(tu.length >= 3 ? [tu.slice(-2).join(' ')] : [])].filter((x) => x.length >= 4);
    for (const b of bien) loc.push([new RegExp(`(?<![\\p{L}\\p{N}])${esc(b)}(?![\\p{L}\\p{N}])`, 'giu'), '[tên]']);
    const goi = tu[tu.length - 1];
    if (goi && goi.length >= 2 && /^[\p{L}\p{N}]+$/u.test(goi))
      loc.push([new RegExp(`(?<!\\p{L})(anh|chị|em|bạn|ông|cô|chú|bác|a|c|e)\\s+${esc(goi)}(?![\\p{L}\\p{N}])`, 'giu'), '$1 [tên]']);
  }
  return (chu, laKhach) => cheTin(chu, loc, laKhach);
}

function cheTin(chu: string, locTen: [RegExp, string][], laKhach: boolean): string {
  let s = chu
    .normalize('NFC')
    .replace(RE_EMAIL, '[email]')
    .replace(RE_SDT, '[sđt]')
    .replace(RE_SO_DAI, '[số]')
    .replace(RE_NHAN_DIA_CHI, (_m, nhan: string) => `${nhan}: [địa chỉ]`);
  for (const [re, thay] of locTen) s = s.replace(re, thay);
  if (laKhach) {
    const tuDc = s.match(TU_DIA_CHI)?.length ?? 0;
    if (tuDc >= 2 || (tuDc >= 1 && /\[sđt\]/.test(s))) return '[khách gửi địa chỉ' + (/\[sđt\]/.test(s) ? ' + sđt' : '') + ']';
  }
  return s;
}

// ───────────── Lọc, chọn mẫu, xuất chữ ─────────────

export interface TuyChon {
  phiaShop: string;
  tuNgay?: string; // yyyy-mm-dd
  denNgay?: string;
  toiThieuTin: number; // tối thiểu số tin / hội thoại
  nganSach: number; // tổng ký tự tối đa
}
export interface KetQua {
  chu: string;
  tong: number;
  duDieuKien: number;
  daChon: number;
  soTinMau: number;
  tuNgay: string | null;
  denNgay: string | null;
}

const TOI_DA_MOI_HOI_THOAI = 8000;
const ngay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const ngayVN = (ms: number) => ngay(ms).split('-').reverse().join('/');

/** Trộn ngẫu nhiên nhưng cố định (cùng dữ liệu → cùng mẫu, bấm lại không ra kết quả khác). */
function tron<T>(a: T[], hat: number): T[] {
  const r = [...a];
  let s = hat >>> 0 || 1;
  for (let i = r.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}

const chuanMau = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

export function lapMau(ds: HoiThoai[], tc: TuyChon): KetQua {
  const tu = tc.tuNgay ? Date.parse(tc.tuNgay + 'T00:00:00') : -Infinity;
  const den = tc.denNgay ? Date.parse(tc.denNgay + 'T23:59:59') : Infinity;
  const laShop = (ai: string) => ai === tc.phiaShop;
  const du = ds.filter((h) => {
    const cuoi = h.tin[h.tin.length - 1]!.luc;
    if (cuoi < tu || h.tin[0]!.luc > den) return false;
    const khach = h.tin.filter((t) => !laShop(t.ai)).length;
    return h.tin.length >= tc.toiThieuTin && khach >= 2 && h.tin.length - khach >= 1;
  });

  // Trộn ngẫu nhiên cố định; chỉ che thông tin cá nhân của hội thoại nào thật sự dùng tới (che hết 20.000 hội thoại rất chậm)
  const hat = du.reduce((s, h) => (s + h.tin.length * 31 + h.tin[0]!.luc) % 2147483647, 7);
  const thuTu = tron(du, hat);
  const daChe = new Map<HoiThoai, Tin[]>();
  const che = (h: HoiThoai): Tin[] => {
    let r = daChe.get(h);
    if (!r) {
      const khach = h.nguoi.filter((n) => !laShop(n));
      const c = boChe(khach);
      const nhan = (ai: string) => (laShop(ai) ? 'Shop' : khach.length > 1 ? `Khách ${khach.indexOf(ai) + 1}` : 'Khách');
      r = h.tin.map((t) => ({ ai: nhan(t.ai), luc: t.luc, chu: c(t.chu, !laShop(t.ai)) }));
      daChe.set(h, r);
    }
    return r;
  };

  // tin trả lời mẫu / tự động của shop: cùng 1 câu (sau khi che tên) xuất hiện ở nhiều hội thoại → gom lên đầu,
  // trong hội thoại chỉ ghi số. Đếm trên tối đa 3.000 hội thoại là đủ.
  const xemMau = thuTu.slice(0, 3000);
  const demMau = new Map<string, { chu: string; so: number }>();
  for (const h of xemMau) {
    const thay = new Set<string>();
    for (const t of che(h)) {
      if (t.ai !== 'Shop' || t.chu.length < 25) continue;
      const k = chuanMau(t.chu);
      if (thay.has(k)) continue;
      thay.add(k);
      const cu = demMau.get(k);
      if (cu) cu.so++;
      else demMau.set(k, { chu: t.chu, so: 1 });
    }
  }
  const nguong = Math.max(5, Math.ceil(xemMau.length * 0.03));
  const mau = [...demMau.entries()].filter(([, v]) => v.so >= nguong).sort((a, b) => b[1].so - a[1].so).slice(0, 30);
  const soMau = new Map(mau.map(([k], i) => [k, i + 1]));

  const viet = (h: HoiThoai, stt: number): string => {
    const dong: string[] = [];
    let truoc = '';
    for (const { ai, chu: c } of che(h)) {
      const k = ai === 'Shop' ? soMau.get(chuanMau(c)) : undefined;
      const chu = k ? `[tin mẫu #${k}]` : c;
      if (ai === truoc) dong[dong.length - 1] += ` / ${chu}`;
      else dong.push(`${ai}: ${chu}`);
      truoc = ai;
    }
    let than = dong.join('\n');
    if (than.length > TOI_DA_MOI_HOI_THOAI) {
      const dau = than.slice(0, 5000).replace(/\n[^\n]*$/, '');
      const cuoi = than.slice(-2600).replace(/^[^\n]*\n/, '');
      than = `${dau}\n… (lược bớt đoạn giữa) …\n${cuoi}`;
    }
    return `=== Hội thoại ${stt} · ${ngayVN(h.tin[0]!.luc)} · ${h.tin.length} tin ===\n${than}`;
  };

  const chon: { h: HoiThoai; khoi: string }[] = [];
  let tong = 0;
  let boQua = 0;
  for (const h of thuTu) {
    const khoi = viet(h, 0);
    if (tong + khoi.length > tc.nganSach) {
      if (tc.nganSach - tong < 2000 || ++boQua > 50) break; // gần đầy: thử thêm vài hội thoại ngắn rồi dừng
      continue;
    }
    chon.push({ h, khoi });
    tong += khoi.length + 2;
  }
  chon.sort((a, b) => a.h.tin[0]!.luc - b.h.tin[0]!.luc);

  const tuN = chon.length ? ngay(chon[0]!.h.tin[0]!.luc) : null;
  const denN = chon.length ? ngay(Math.max(...chon.map((c) => c.h.tin[c.h.tin.length - 1]!.luc))) : null;
  const dau = [
    `TIN NHẮN TƯ VẤN QUA MESSENGER (Facebook) — ${chon.length} hội thoại chọn ngẫu nhiên trong ${du.length} hội thoại đủ điều kiện (≥ ${tc.toiThieuTin} tin, có cả khách và shop trả lời)${tuN ? `, từ ${tuN} đến ${denN}` : ''}.`,
    'Thông tin cá nhân đã che: [tên], [sđt], [email], [địa chỉ], [số]. "[khách gửi địa chỉ…]" = khách gửi thông tin nhận hàng (thường là dấu hiệu đã chốt đơn).',
  ];
  if (mau.length) {
    dau.push('', 'TIN TRẢ LỜI MẪU / TỰ ĐỘNG CỦA SHOP (dùng lặp lại ở nhiều hội thoại; trong hội thoại ghi là [tin mẫu #số]):');
    mau.forEach(([, v], i) => dau.push(`#${i + 1} (~${Math.round((v.so / xemMau.length) * 100)}% hội thoại): ${v.chu}`));
  }
  const chu = [dau.join('\n'), ...chon.map((c, i) => c.khoi.replace(/^=== Hội thoại 0 /, `=== Hội thoại ${i + 1} `))].join('\n\n');
  return { chu, tong: ds.length, duDieuKien: du.length, daChon: chon.length, soTinMau: mau.length, tuNgay: tuN, denNgay: denN };
}

// ───────────── Đọc file người dùng chọn ─────────────

export interface TienDo {
  (viec: string, xong: number, tong: number): void;
}

/** Đọc các file người dùng chọn (.zip / .json, hoặc cả thư mục) → danh sách hội thoại đã gộp. */
export async function docFileXuat(
  files: { ten: string; file: Blob }[],
  bao: TienDo = () => {},
): Promise<{ hoiThoai: HoiThoai[]; soFileJson: number; loi: string[] }> {
  const phan: HoiThoai[] = [];
  const loi: string[] = [];
  let soFileJson = 0;
  const td = new TextDecoder('utf-8');
  for (const { ten, file } of files) {
    if (/\.zip$/i.test(ten)) {
      bao(`Đọc mục lục ${ten}`, 0, 1);
      let muc: MucZip[];
      try {
        muc = (await lietKeZip(file)).filter((m) => laFileTinNhan(m.ten));
      } catch (e) {
        loi.push(`${ten}: ${(e as Error).message}`);
        continue;
      }
      for (const [i, m] of muc.entries()) {
        if (i % 20 === 0) bao(`Đọc tin nhắn trong ${ten}`, i, muc.length);
        try {
          const h = docFileJson(m.ten, td.decode(await docMucZip(file, m)));
          if (h) phan.push(h), soFileJson++;
        } catch (e) {
          loi.push(`${m.ten}: ${(e as Error).message}`);
        }
      }
    } else if (/\.json$/i.test(ten)) {
      const h = docFileJson(ten, await file.text());
      if (h) phan.push(h), soFileJson++;
    }
  }
  bao('Gộp hội thoại', 1, 1);
  return { hoiThoai: gopHoiThoai(phan), soFileJson, loi: loi.slice(0, 20) };
}
