/**
 * طبقة البيانات: كل التواصل مع Supabase موجود في هذا الملف فقط.
 * باقي الملفات لا تعرف شيئاً عن Supabase؛ تستدعي هذه الدوال.
 * (هذا يسهّل التطوير لاحقاً أو تغيير مزوّد البيانات)
 */
import { sb } from './supabase.js';

/* ═════════════ الأخطاء ═════════════ */

/** ترجمة رموز الأخطاء القادمة من قاعدة البيانات إلى رسائل عربية واضحة */
const ERROR_MESSAGES = {
  NOT_MEMBER: 'حسابك غير مصرّح له بالحجز.',
  FORBIDDEN: 'ليس لديك صلاحية لهذا الإجراء.',
  OVERLAP: (d) => d ? `الوقت محجوز مسبقاً من ${d}.` : 'الوقت محجوز مسبقاً، اختر وقتاً آخر.',
  TOO_LONG: (d) => `أقصى مدة للحجز ${Number(d) / 60 || 3} ساعات.`,
  IN_PAST: 'لا يمكن الحجز في وقت مضى.',
  INVALID_TIME: 'وقت النهاية يجب أن يكون بعد وقت البداية.',
  TITLE_TOO_LONG: 'الغرض طويل جداً (الحد 120 حرفاً).',
  ROOM_NOT_FOUND: 'القاعة غير متاحة حالياً.',
  TEAM_NOT_FOUND: 'الفريق غير موجود.',
  NOT_FOUND: 'الحجز غير موجود.',
  ALREADY_CANCELLED: 'الحجز ملغى مسبقاً.',
  BOOKING_ENDED: 'لا يمكن إلغاء حجز انتهى وقته.',
  REASON_REQUIRED: 'اكتب سبب الإلغاء (سيظهر للفريق).',
  REASON_TOO_LONG: 'السبب طويل جداً (الحد 300 حرف).',
  LAST_ADMIN: 'لا يمكن إزالة آخر مدير؛ أضف مديراً آخر أولاً.',
  23505: 'هذا الإيميل مضاف مسبقاً.',
  23514: 'تأكد من صحة البيانات المدخلة.',
  42501: 'ليس لديك صلاحية لهذا الإجراء.',
};

export class AppError extends Error {}

function toAppError(error) {
  const entry = ERROR_MESSAGES[error?.message] ?? ERROR_MESSAGES[error?.code];
  if (entry) return new AppError(typeof entry === 'function' ? entry(error.details) : entry);
  if (error?.message?.includes('Failed to fetch')) return new AppError('تعذّر الاتصال، تأكد من الإنترنت.');
  console.error(error);
  return new AppError('حدث خطأ غير متوقع، حاول مرة أخرى.');
}

/** يفك نتيجة Supabase: يرجع البيانات أو يرمي خطأ مترجماً */
function unwrap({ data, error }) {
  if (error) throw toAppError(error);
  return data;
}


/* ═════════════ تسجيل الدخول ═════════════ */

export const auth = {
  async signInWithGoogle() {
    const redirectTo = window.location.origin + window.location.pathname;
    unwrap(await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    }));
  },

  async signOut() {
    await sb.auth.signOut();
  },

  async getSession() {
    return unwrap(await sb.auth.getSession()).session;
  },

  /** يستدعي callback عند تسجيل الدخول أو الخروج */
  onChange(callback) {
    sb.auth.onAuthStateChange((event, session) => callback(event, session));
  },
};


/* ═════════════ المستخدم والبيانات الأساسية ═════════════ */

/** بيانات المستخدم الحالي: { email, full_name, role, team_id, team_name, team_color } أو null */
export async function getMyProfile() {
  const rows = unwrap(await sb.rpc('get_my_profile'));
  return rows?.[0] ?? null;
}

export async function getTeams() {
  return unwrap(await sb.from('teams')
    .select('id, name, color')
    .eq('is_active', true)
    .order('sort_order'));
}

export async function getDefaultRoom() {
  const rows = unwrap(await sb.from('rooms')
    .select('id, name, max_minutes')
    .eq('is_active', true)
    .order('id')
    .limit(1));
  return rows[0] ?? null;
}


/* ═════════════ الحجوزات ═════════════ */

const BOOKING_FIELDS =
  'id, team_id, team_name, team_color, title, starts_at, ends_at, status, ' +
  'created_by_email, created_by_name, created_at, cancelled_at, cancelled_by_email, cancel_reason';

/** الحجوزات المؤكدة التي تتقاطع مع فترة زمنية (للتقويم) */
export async function getBookingsBetween(from, to) {
  return unwrap(await sb.from('booking_details')
    .select(BOOKING_FIELDS)
    .eq('status', 'confirmed')
    .lt('starts_at', to.toISOString())
    .gt('ends_at', from.toISOString())
    .order('starts_at'));
}

/** حجوزات فريق: القادمة (مؤكدة) أو السجل (السابقة والملغاة) */
export async function getTeamBookings(teamId, kind = 'upcoming') {
  const now = new Date().toISOString();
  let q = sb.from('booking_details').select(BOOKING_FIELDS).eq('team_id', teamId);
  q = kind === 'upcoming'
    ? q.eq('status', 'confirmed').gt('ends_at', now).order('starts_at')
    : q.or(`status.eq.cancelled,ends_at.lte."${now}"`).order('starts_at', { ascending: false }).limit(50);
  return unwrap(await q);
}

/** كل الحجوزات القادمة لكل الفرق (للإدارة) */
export async function getAllUpcomingBookings() {
  return unwrap(await sb.from('booking_details')
    .select(BOOKING_FIELDS)
    .eq('status', 'confirmed')
    .gt('ends_at', new Date().toISOString())
    .order('starts_at')
    .limit(200));
}

/** إنشاء حجز — كل التحقق يتم داخل قاعدة البيانات (create_booking) */
export async function createBooking({ start, end, title, teamId }) {
  return unwrap(await sb.rpc('create_booking', {
    p_starts_at: start.toISOString(),
    p_ends_at: end.toISOString(),
    p_title: title || null,
    p_team_id: teamId ?? null,
  }));
}

export async function cancelBooking(id, reason = null) {
  unwrap(await sb.rpc('cancel_booking', { p_booking_id: id, p_reason: reason || null }));
}

/** الاشتراك في أي تغيير على الحجوزات (تحديث لحظي) */
export function subscribeToBookings(onChange) {
  return sb.channel('bookings-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, onChange)
    .subscribe();
}


/* ═════════════ الأعضاء (للإدارة) ═════════════ */

export async function listMembers() {
  return unwrap(await sb.from('members')
    .select('email, full_name, team_id, role, is_active, created_at')
    .order('role')
    .order('team_id')
    .order('email'));
}

export async function addMember({ email, fullName, teamId, role }) {
  return unwrap(await sb.from('members').insert({
    email: email.trim().toLowerCase(),
    full_name: fullName?.trim() || null,
    team_id: teamId,
    role,
  }));
}

export async function updateMember(email, changes) {
  return unwrap(await sb.from('members').update(changes).eq('email', email));
}

export async function deleteMember(email) {
  return unwrap(await sb.from('members').delete().eq('email', email));
}
