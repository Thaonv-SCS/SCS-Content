/**
 * Chạy cả pipeline (lấy bài → tạo bản tin) và ghi trạng thái vào settings.last_run để web app hiển thị.
 * Dùng chung cho lịch 6h sáng (GitHub Actions) và nút "Chạy ngay" trong app.
 *
 *   npm run pipeline -- --trigger=manual [--force] [--hours=48]
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { RunStatus, RunTask } from '@app/core';
import { getDb } from './db.ts';

const { values: args } = parseArgs({
  options: {
    trigger: { type: 'string', default: 'manual' },
    task: { type: 'string', default: 'digest' },
    force: { type: 'boolean', default: false },
    hours: { type: 'string', default: '48' },
  },
});

const db = getDb();
if (!db) throw new Error('Cần SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');

const task: RunTask = args.task === 'style' ? 'style' : 'digest';
const run: RunStatus = { status: 'running', trigger: args.trigger!, task, started_at: new Date().toISOString() };
const save = (patch: Partial<RunStatus>) => {
  Object.assign(run, patch);
  return db.from('settings').upsert({ key: 'last_run', value: run, updated_at: new Date().toISOString() });
};

const pipelineDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const tail: string[] = [];

/** Chạy một script con, in log ra màn hình và giữ lại vài dòng cuối để báo lên app. */
function step(script: string, scriptArgs: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['--import', 'tsx', script, ...scriptArgs], { cwd: pipelineDir, env: process.env });
    const onData = (buf: Buffer) => {
      process.stdout.write(buf);
      // Bỏ dòng đếm tiến độ kiểu "11/12"
      for (const line of buf.toString().split(/\r?\n|\r/)) if (line.trim() && !/^\d+\/\d+$/.test(line.trim())) tail.push(line.trim());
      tail.splice(0, Math.max(0, tail.length - 8));
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

try {
  if (task === 'style') {
    await save({ step: 'Đọc kho caption & viết ghi chú văn phong' });
    if ((await step('src/style.ts', [])) !== 0) throw new Error('Cập nhật ghi chú văn phong lỗi');
    await save({ status: 'done', step: undefined, finished_at: new Date().toISOString(), message: tail.slice(-2).join('\n') });
    process.exit(0);
  }

  await save({ step: 'Lấy bài từ các nguồn' });
  if ((await step('src/fetch.ts', [`--hours=${args.hours}`])) !== 0) throw new Error('Bước lấy bài lỗi');

  await save({ step: 'Phân loại & viết gợi ý bằng AI' });
  if ((await step('src/digest.ts', [`--hours=${args.hours}`, ...(args.force ? ['--force'] : [])])) !== 0) {
    throw new Error('Bước tạo bản tin lỗi');
  }

  await save({ status: 'done', step: undefined, finished_at: new Date().toISOString(), message: tail.slice(-3).join('\n') });
} catch (err) {
  await save({
    status: 'failed',
    finished_at: new Date().toISOString(),
    message: `${(err as Error).message}\n${tail.slice(-5).join('\n')}`,
  });
  process.exitCode = 1;
}
