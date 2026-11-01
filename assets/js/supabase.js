/**
 * إنشاء عميل Supabase مرة واحدة واستخدامه في كل الملفات.
 * المكتبة محمّلة من vendor/supabase كمتغيّر عام: window.supabase
 */
import { CONFIG } from './config.js';

/** هل تم ضبط الإعدادات؟ (لعرض شاشة الإعداد بدل خطأ غامض) */
export const isConfigured =
  /^https?:\/\//.test(CONFIG.SUPABASE_URL) && Boolean(CONFIG.SUPABASE_ANON_KEY);

export const sb = isConfigured
  ? window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',          // الأسلوب الموصى به لتسجيل الدخول عبر جوجل
        persistSession: true,      // يبقى المستخدم مسجّلاً بعد إغلاق المتصفح
        autoRefreshToken: true,
        detectSessionInUrl: true,  // يلتقط الجلسة بعد الرجوع من جوجل
      },
    })
  : null;
