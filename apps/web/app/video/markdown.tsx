// Hiển thị markdown đơn giản (dàn ý, danh sách cảnh trám do bộ não viết): tiêu đề, bảng, danh sách, đậm, code.
// Tự viết vì app chưa có thư viện markdown; chỉ hỗ trợ những gì bộ não dùng. Không dùng dangerouslySetInnerHTML.
import type { ReactNode } from 'react';

function dong(text: string, key: string | number): ReactNode {
  // **đậm**, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <span key={key}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong>
          : p.startsWith('`') && p.endsWith('`') ? <code key={i}>{p.slice(1, -1)}</code>
            : p)}
    </span>
  );
}

const oBang = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, '').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i] ?? '';
    if (!l.trim()) { i++; continue; }
    const h = l.match(/^(#{1,4})\s+(.*)/);
    if (h) {
      const Tag = ((h[1] ?? '').length <= 1 ? 'h2' : 'h3') as 'h2' | 'h3';
      out.push(<Tag key={i} className="md-h">{dong(h[2] ?? '', 0)}</Tag>);
      i++; continue;
    }
    if (l.trim().startsWith('|')) {
      const bang: string[] = [];
      while (i < lines.length && (lines[i] ?? '').trim().startsWith('|')) bang.push(lines[i++] ?? '');
      const [dau, , ...than] = bang;
      out.push(
        <div key={i} className="scroll"><table className="md-table">
          <thead><tr>{oBang(dau ?? '').map((c, j) => <th key={j}>{dong(c, j)}</th>)}</tr></thead>
          <tbody>{than.map((r, k) => <tr key={k}>{oBang(r).map((c, j) => <td key={j}>{dong(c, j)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(l)) {
      const items: string[] = [];
      const coSo = /^\s*\d+\./.test(l);
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i] ?? '')) items.push((lines[i++] ?? '').replace(/^\s*([-*]|\d+\.)\s+/, ''));
      const List = coSo ? 'ol' : 'ul';
      out.push(<List key={i}>{items.map((t, k) => <li key={k}>{dong(t, k)}</li>)}</List>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && (lines[i] ?? '').trim() && !/^(#|\||\s*([-*]|\d+\.)\s)/.test(lines[i] ?? '')) para.push(lines[i++] ?? '');
    if (!para.length) para.push(lines[i++] ?? ''); // dòng lạ (vd "#abc") — luôn tiến lên, tránh lặp mãi
    out.push(<p key={i}>{dong(para.join(' '), 0)}</p>);
  }
  return <div className="md">{out}</div>;
}
