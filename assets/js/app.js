/**
 * نقطة البداية: تسجيل الدخول ← التحقق من الصلاحية ← تشغيل الشاشات.
 *
 * تدفق الشاشات:
 *   setup   : config.js غير مضبوط
 *   login   : غير مسجّل دخول
 *   denied  : دخل بجوجل لكن إيميله غير موجود في قائمة الأعضاء
 *   app     : التطبيق (التقويم / حجوزاتي / الإدارة)
 */
import { isConfigured } from './supabase.js';
import { state, notifyBookingsChanged } from './state.js';
import { auth, getMyProfile, getTeams, getDefaultRoom, subscribeToBookings } from './api.js';
import { toast, initialOf } from './utils.js';
import { initCalendar, showCalendar, renderLegend } from './views/calendar.js';
import { initBookingModal, setupBookingModalForUser, openBookingModal } from './views/booking-modal.js';
import { initDetailsModal } from './views/details-modal.js';
import { initMyBookings, showMyBookings, hideMyBookings } from './views/my-bookings.js';
import { initAdmin, setupAdminForUser, showAdmin, hideAdmin } from './views/admin.js';

const SCREENS = ['loading', 'setup', 'login', 'denied', 'app'];
let booted = false;
let bootingFor = null;   // يمنع التحميل المزدوج إذا وصل حدثان لنفس المستخدم
let realtime = null;


/* ═════════════ التبديل بين الشاشات ═════════════ */

function showScreen(name) {
  for (const s of SCREENS) document.getElementById(`screen-${s}`).hidden = s !== name;
}

const ROUTES = {
  calendar: { show: showCalendar },
  mine: { show: showMyBookings, hide: hideMyBookings },
  admin: { show: showAdmin, hide: hideAdmin, adminOnly: true },
};
let currentRoute = null;

function route() {
  let name = location.hash.slice(1) || 'calendar';
  if (!ROUTES[name] || (ROUTES[name].adminOnly && !state.isAdmin)) name = 'calendar';
  if (name === currentRoute) return;

  if (currentRoute) ROUTES[currentRoute].hide?.();
  currentRoute = name;
  for (const key of Object.keys(ROUTES)) document.getElementById(`view-${key}`).hidden = key !== name;
  document.querySelectorAll('[data-route]').forEach((a) => {
    const active = a.dataset.route === name;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  ROUTES[name].show();
  window.scrollTo({ top: 0 });
}


/* ═════════════ الجلسة ═════════════ */

async function handleSession(session) {
  if (!session) {
    booted = false;
    state.session = state.profile = null;
    realtime?.unsubscribe(); realtime = null;
    showScreen('login');
    return;
  }
  // تحديث الرمز (Token refresh) لنفس المستخدم: لا نعيد التحميل
  if (booted && state.session?.user.id === session.user.id) { state.session = session; return; }
  if (bootingFor === session.user.id) return;

  bootingFor = session.user.id;
  state.session = session;
  showScreen('loading');
  try {
    const profile = await getMyProfile();
    if (!profile) {
      document.getElementById('denied-email').textContent = session.user.email;
      showScreen('denied');
      return;
    }
    const [teams, room] = await Promise.all([getTeams(), getDefaultRoom()]);
    Object.assign(state, { profile, teams, room });
    startApp();
  } catch (err) {
    toast(err.message, 'danger');
    showScreen('login');
  } finally {
    bootingFor = null;
  }
}

function startApp() {
  booted = true;
  renderUser();
  document.querySelectorAll('[data-admin-only]').forEach((e) => { e.hidden = !state.isAdmin; });
  setupBookingModalForUser();
  if (state.isAdmin) setupAdminForUser();
  renderLegend();

  showScreen('app');
  currentRoute = null;
  route();

  // تحديث لحظي: أي تغيير من أي مستخدم يحدّث الشاشات
  realtime?.unsubscribe();
  realtime = subscribeToBookings(() => notifyBookingsChanged());
}

function renderUser() {
  const { profile, session } = state;
  const meta = session.user.user_metadata ?? {};
  const name = profile.full_name || meta.full_name || profile.email.split('@')[0];
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-team').textContent = state.isAdmin ? 'الإدارة العليا' : profile.team_name;
  document.getElementById('user-email').textContent = profile.email;

  const avatar = document.getElementById('user-avatar');
  const initial = document.getElementById('user-initial');
  initial.textContent = initialOf(name);
  if (meta.avatar_url) {
    avatar.src = meta.avatar_url;
    avatar.onload = () => { avatar.hidden = false; initial.hidden = true; };
  }
}


/* ═════════════ التشغيل ═════════════ */

function bindGlobalActions() {
  document.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'logout') { await auth.signOut(); handleSession(null); }
    if (action === 'new-booking') openBookingModal();
  });

  const googleBtn = document.getElementById('btn-google');
  googleBtn.addEventListener('click', async () => {
    googleBtn.disabled = true;
    try { await auth.signInWithGoogle(); } // ينتقل المتصفح لصفحة جوجل
    catch (err) { toast(err.message, 'danger'); googleBtn.disabled = false; }
  });

  window.addEventListener('hashchange', () => { if (booted) route(); });
}

function main() {
  if (!isConfigured) { showScreen('setup'); return; }

  initBookingModal();
  initDetailsModal();
  initCalendar();
  initMyBookings();
  initAdmin();
  bindGlobalActions();

  // Supabase يرسل INITIAL_SESSION عند التحميل ثم SIGNED_IN / SIGNED_OUT.
  // setTimeout حسب توصية Supabase: لا نستدعي طلبات أخرى داخل الـ callback مباشرة.
  auth.onChange((_event, session) => setTimeout(() => handleSession(session), 0));
}

main();
