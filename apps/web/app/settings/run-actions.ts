'use server';

import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { revalidatePath } from 'next/cache';
import { isRunActive, type RunStatus, type RunTask } from '@app/core';
import { supabaseServer } from '@/lib/supabase';

/**
 * Khởi động pipeline.
 * - Đã cấu hình GITHUB_TOKEN + GITHUB_REPO (bản chạy trên mạng): nhờ GitHub Actions chạy workflow.
 * - Chưa cấu hình (đang chạy trên máy): chạy ngay trên máy này, nền, không chờ.
 */
async function startRun(task: RunTask, force: boolean): Promise<string | null> {
  const { NETLIFY, VERCEL } = process.env;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN?.trim();
  const GITHUB_REF = process.env.GITHUB_REF?.trim() || 'main';
  // Chấp nhận cả "owner/repo", link "https://github.com/owner/repo(.git)", lẫn dấu cách thừa
  const GITHUB_REPO = process.env.GITHUB_REPO?.trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  // Trên hosting (Netlify/Vercel) không chạy được pipeline tại chỗ — bắt buộc đi qua GitHub Actions
  if ((NETLIFY || VERCEL) && !(GITHUB_TOKEN && GITHUB_REPO)) {
    return 'Chưa cấu hình GITHUB_TOKEN / GITHUB_REPO trên hosting nên không chạy được.';
  }

  const supabase = await supabaseServer();
  const { data: row } = await supabase.from('settings').select('value').eq('key', 'last_run').maybeSingle();
  if (isRunActive(row?.value as RunStatus | undefined)) return 'Đang có một lượt chạy, đợi nó xong đã.';

  const queued: RunStatus = { status: 'queued', trigger: 'manual', task, step: 'Đang khởi động', started_at: new Date().toISOString() };
  await supabase.from('settings').upsert({ key: 'last_run', value: queued, updated_at: queued.started_at });

  if (GITHUB_TOKEN && GITHUB_REPO) {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/actions/workflows/daily.yml/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' },
      body: JSON.stringify({ ref: GITHUB_REF, inputs: { hours: '48', force, task } }),
    });
    if (!res.ok) {
      const detail = ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? '';
      const hint =
        res.status === 404
          ? ` — token không thấy repo "${GITHUB_REPO}": kiểm tra GITHUB_REPO đúng dạng owner/repo, và token đã chọn repo này ở mục Repository access.`
          : res.status === 401
            ? ' — token sai hoặc đã hết hạn.'
            : res.status === 403
              ? ' — token thiếu quyền "Actions: Read and write".'
              : '';
      const failed: RunStatus = { ...queued, status: 'failed', message: `GitHub từ chối: HTTP ${res.status} ${detail}${hint}` };
      await supabase.from('settings').upsert({ key: 'last_run', value: failed });
      return failed.message!;
    }
  } else {
    // apps/web → gốc monorepo. Lệnh cố định, không chứa dữ liệu người dùng nhập.
    spawn(`npm run pipeline -- --trigger=manual --task=${task}${force ? ' --force' : ''}`, {
      cwd: resolve(process.cwd(), '../..'),
      detached: true,
      stdio: 'ignore',
      shell: true,
      windowsHide: true,
    }).unref();
  }
  return null;
}

/** Nút "Chạy ngay": lấy bài & tạo bản tin. */
export async function runNow(_prev: string | null, form: FormData): Promise<string | null> {
  const error = await startRun('digest', form.get('force') === 'on');
  revalidatePath('/settings');
  return error;
}

/** Nút "Cập nhật bằng AI" ở kho caption. */
export async function runStyle(_prev: string | null): Promise<string | null> {
  const error = await startRun('style', false);
  revalidatePath('/captions');
  return error;
}
