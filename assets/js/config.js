/**
 * إعدادات المشروع
 * ─────────────────────────────────────────────────────────────
 * 1) انسخ من Supabase ← Project Settings ← API:
 *      - Project URL         → SUPABASE_URL
 *      - anon / publishable  → SUPABASE_ANON_KEY
 *
 * المفتاح العام (anon) آمن للوضع في الواجهة: الحماية الحقيقية
 * في قاعدة البيانات (Row Level Security).
 * ⚠️ لا تضع مفتاح service_role هنا أبداً.
 */
export const CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR-ANON-KEY',

  /** إعدادات العرض في التقويم */
  CALENDAR: {
    DAY_START: '07:00',     // أول ساعة تظهر في التقويم
    DAY_END: '24:00',       // آخر ساعة
    SLOT_MINUTES: 30,       // دقة اختيار الوقت
    DEFAULT_MINUTES: 60,    // المدة الافتراضية عند الضغط على وقت
    FIRST_DAY: 0,           // بداية الأسبوع: 0 = الأحد
  },
};
