/**
 * Việc chạy nền (AI viết / tìm thông tin) bị ngắt giữa chừng thì trạng thái kẹt mãi ở "đang chạy".
 * Quá 15 phút (cùng mốc với isRunning trong products/actions.ts — máy chủ đã cho chạy lại) → hiện như lỗi để mở khóa nút.
 */
export const TREO_SAU_MS = 15 * 60_000;
export const LOI_TREO = 'Bị treo (quá 15 phút không xong, có thể đã bị ngắt) — bấm Viết lại để chạy lại.';

export function goTreo<T extends { job_status: string; job_error: string | null }>(r: T, batDau: string | null | undefined): T {
  if (!['queued', 'running'].includes(r.job_status)) return r;
  if (batDau && Date.now() - new Date(batDau).getTime() < TREO_SAU_MS) return r;
  return { ...r, job_status: 'failed', job_error: LOI_TREO };
}
