import { isRunActive, parseSettings, type RunStatus } from '@app/core';
import { supabaseServer } from '@/lib/supabase';
import { saveSettings } from './actions';
import { RunPanel } from './run-panel';

const TZ = 'Asia/Ho_Chi_Minh';

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
  const monthStart = `${today.slice(0, 7)}-01`;

  const [{ data: rows, error }, { data: calls }, { data: digests }] = await Promise.all([
    supabase.from('settings').select('key,value'),
    supabase.from('llm_calls').select('cost_usd,created_at').gte('created_at', new Date(`${monthStart}T00:00:00+07:00`).toISOString()),
    supabase.from('digests').select('date,viewed_at').eq('status', 'ready').order('date', { ascending: false }).limit(7),
  ]);
  if (error) return <p className="warn">Chưa có bảng cài đặt — cần chạy migration 0003 trên Supabase.</p>;

  const s = parseSettings(rows);
  const lastRun = (rows?.find((r) => r.key === 'last_run')?.value ?? null) as RunStatus | null;
  const todayStart = new Date(`${today}T00:00:00+07:00`).getTime();
  const spentMonth = (calls ?? []).reduce((sum, c) => sum + Number(c.cost_usd), 0);
  const spentToday = (calls ?? []).filter((c) => new Date(c.created_at).getTime() >= todayStart).reduce((sum, c) => sum + Number(c.cost_usd), 0);

  const recent = digests ?? [];
  const unviewedStreak = recent.findIndex((d) => d.viewed_at) === -1 ? recent.length : recent.findIndex((d) => d.viewed_at);
  const autoPaused = s.schedule_enabled && s.auto_pause_days > 0 && unviewedStreak >= s.auto_pause_days;

  return (
    <>
      <h1>Cài đặt</h1>

      <div className="card status-line">
        {!s.schedule_enabled ? (
          <span className="off">⏸ Lịch tự chạy đang TẮT — 6h sáng sẽ không lấy bài, không gọi AI.</span>
        ) : autoPaused ? (
          <span className="warn">
            ⏸ Đang tự tạm dừng: {unviewedStreak} bản tin gần nhất chưa được mở. Mở trang Bản tin là lịch chạy lại từ sáng mai.
          </span>
        ) : (
          <span className="on">▶ Lịch tự chạy đang BẬT — 6h sáng mỗi ngày.</span>
        )}
      </div>

      <RunPanel lastRun={lastRun} active={isRunActive(lastRun)} />

      <h2>Lịch tự động</h2>
      <form action={saveSettings} className="card settings">
        <label className="switch-row">
          <input type="checkbox" name="schedule_enabled" defaultChecked={s.schedule_enabled} />
          <span>
            <strong>Tự chạy lúc 6h sáng</strong>
            <span className="meta">Tắt khi mày bận / đi vắng. Nút "Chạy ngay" ở trên vẫn dùng được.</span>
          </span>
        </label>

        <label>
          <strong>Tự tạm dừng sau</strong>
          <span className="inline">
            <input type="number" name="auto_pause_days" min={0} max={30} defaultValue={s.auto_pause_days} /> bản tin liên tiếp chưa xem
          </span>
          <span className="meta">0 = không bao giờ tự dừng.</span>
        </label>

        <label>
          <strong>Trần chi phí AI mỗi ngày</strong>
          <span className="inline">
            $ <input type="number" name="daily_budget_usd" min={0} max={20} step={0.5} defaultValue={s.daily_budget_usd} />
          </span>
          <span className="meta">Chạm trần thì dừng gọi AI trong ngày. Một bản tin hiện tốn khoảng $0.5.</span>
        </label>

        <div>
          <button type="submit">Lưu cài đặt</button>
        </div>
      </form>

      <h2>Chi phí AI</h2>
      <div className="card">
        Hôm nay: <strong>${spentToday.toFixed(2)}</strong> · Tháng này: <strong>${spentMonth.toFixed(2)}</strong>
      </div>
    </>
  );
}
