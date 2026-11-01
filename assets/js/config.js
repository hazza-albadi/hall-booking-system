/**
 * إعدادات المشروع
 * ─────────────────────────────────────────────────────────────
 * رابط Supabase والمفتاح العام لا يُكتبان هنا ولا يُرفعان على GitHub.
 * مصدرهما الملف المولَّد env.js:
 *   - محلياً:  ملف .env  ثم  npm run env
 *   - Vercel:  Settings → Environment Variables  (يُولَّد تلقائياً وقت النشر)
 */

// إذا لم يُولَّد env.js بعد، نكمل بقيم فارغة فتظهر شاشة "الإعداد غير مكتمل"
const ENV = await import('./env.js').then((m) => m.ENV).catch(() => ({}));

export const CONFIG = {
  SUPABASE_URL: ENV.SUPABASE_URL ?? '',
  SUPABASE_ANON_KEY: ENV.SUPABASE_ANON_KEY ?? '',

  /** إعدادات العرض في التقويم */
  CALENDAR: {
    DAY_START: '07:00',     // أول ساعة تظهر في التقويم
    DAY_END: '24:00',       // آخر ساعة
    SLOT_MINUTES: 30,       // دقة اختيار الوقت
    DEFAULT_MINUTES: 60,    // المدة الافتراضية عند الضغط على وقت
    FIRST_DAY: 0,           // بداية الأسبوع: 0 = الأحد
  },
};
