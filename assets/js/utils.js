/**
 * أدوات عامة: الحماية من XSS، تنسيق التواريخ، الإشعارات.
 */

/* ═════════════ الأمان ═════════════ */

/** تحويل النص لصيغة آمنة قبل وضعه في HTML (يمنع حقن الأكواد XSS) */
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

/** التأكد أن اللون بصيغة #RRGGBB قبل استخدامه في style */
export function safeColor(color) {
  return /^#[0-9a-f]{6}$/i.test(color) ? color : '#64748B';
}


/* ═════════════ التواريخ ═════════════ */

// عربي بأرقام لاتينية (10:30) لوضوح الأوقات
export const LOCALE = 'ar-u-nu-latn';

const fmtDay = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
const fmtDayShort = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDateTime = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });

export const formatDay = (d) => fmtDay.format(new Date(d));
export const formatDayShort = (d) => fmtDayShort.format(new Date(d));
export const formatTime = (d) => fmtTime.format(new Date(d));
export const formatDateTime = (d) => fmtDateTime.format(new Date(d));
export const formatRange = (s, e) => `${formatTime(s)} – ${formatTime(e)}`;

/** المدة بالعربي: 30 دقيقة، ساعة، ساعة ونص، ساعتين، ساعتين ونص، 3 ساعات */
export function formatDuration(minutes) {
  const map = { 30: '30 دقيقة', 60: 'ساعة', 90: 'ساعة ونص', 120: 'ساعتين', 150: 'ساعتين ونص', 180: '3 ساعات' };
  if (map[minutes]) return map[minutes];
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return [h && `${h} س`, m && `${m} د`].filter(Boolean).join(' و');
}

export const addMinutes = (date, min) => new Date(date.getTime() + min * 60_000);
export const minutesBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 60_000);

/** "HH:MM" → عدد الدقائق من بداية اليوم */
export const parseHM = (hm) => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
export const toHM = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** قيمة حقل input[type=date] بالتوقيت المحلي */
export function toDateInput(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** دمج "2026-11-08" + دقائق اليوم → Date محلي */
export function combineDateAndMinutes(dateStr, minutes) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60);
}

/** هل الفترتان متداخلتان؟ (النهاية غير مشمولة) */
export const overlaps = (s1, e1, s2, e2) => new Date(s1) < new Date(e2) && new Date(s2) < new Date(e1);


/* ═════════════ الإشعارات ═════════════ */

/** إشعار صغير أسفل الشاشة. type: success | danger | info */
export function toast(message, type = 'success') {
  const icons = { success: 'check-circle-fill', danger: 'exclamation-octagon-fill', info: 'info-circle-fill' };
  const el = document.createElement('div');
  el.className = `toast app-toast app-toast-${type} border-0`;
  el.setAttribute('role', type === 'danger' ? 'alert' : 'status');
  el.innerHTML = `
    <div class="d-flex align-items-center gap-2 p-3">
      <i class="bi bi-${icons[type] ?? icons.info}"></i>
      <div class="flex-grow-1">${esc(message)}</div>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="إغلاق"></button>
    </div>`;
  document.getElementById('toasts').append(el);
  el.addEventListener('hidden.bs.toast', () => el.remove());
  new bootstrap.Toast(el, { delay: type === 'danger' ? 6000 : 3500 }).show();
}

/** تشغيل زر مع مؤشر تحميل ومنع الضغط المتكرر */
export async function withButtonLoading(button, task) {
  const spinner = button.querySelector('.spinner-border');
  button.disabled = true;
  spinner?.removeAttribute('hidden');
  try { return await task(); }
  finally { button.disabled = false; spinner?.setAttribute('hidden', ''); }
}

/** الحرف الأول من الاسم (لصورة الحساب الاحتياطية) */
export const initialOf = (name) => (name || '?').trim().charAt(0).toUpperCase();
