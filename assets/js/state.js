/**
 * حالة التطبيق المشتركة بين كل الشاشات (مصدر واحد للحقيقة).
 */
export const state = {
  session: null,        // جلسة Supabase الحالية
  profile: null,        // { email, full_name, role, team_id, team_name, team_color }
  teams: [],            // قائمة الفرق
  room: null,           // القاعة الافتراضية { id, name, max_minutes }

  get isAdmin() { return this.profile?.role === 'admin'; },
  get maxMinutes() { return this.room?.max_minutes ?? 180; },

  teamById(id) { return this.teams.find((t) => t.id === id); },

  /** هل يستطيع المستخدم الحالي إلغاء هذا الحجز؟ (نفس منطق قاعدة البيانات) */
  canCancel(booking) {
    if (!this.profile || booking.status !== 'confirmed') return false;
    if (this.isAdmin) return true;
    return booking.team_id === this.profile.team_id && new Date(booking.ends_at) > new Date();
  },
};

/** إشعار كل الشاشات أن الحجوزات تغيّرت (حجز جديد، إلغاء، تحديث لحظي) */
export const BOOKINGS_CHANGED = 'bookings:changed';
export const notifyBookingsChanged = () => document.dispatchEvent(new CustomEvent(BOOKINGS_CHANGED));
export const onBookingsChanged = (fn) => document.addEventListener(BOOKINGS_CHANGED, fn);
