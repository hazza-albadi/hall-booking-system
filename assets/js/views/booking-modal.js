/**
 * نافذة الحجز: يوم + ساعة + مدة (+ غرض اختياري) ← احجز.
 * تفحص التوفر مباشرة أثناء الاختيار، والتحقق النهائي في قاعدة البيانات.
 */
import { CONFIG } from '../config.js';
import { state, notifyBookingsChanged } from '../state.js';
import { createBooking, getBookingsBetween } from '../api.js';
import {
  esc, toast, withButtonLoading, formatDay, formatRange, formatTime, formatDuration,
  addMinutes, parseHM, toDateInput, combineDateAndMinutes, overlaps,
} from '../utils.js';

const { DAY_START, DAY_END, SLOT_MINUTES, DEFAULT_MINUTES } = CONFIG.CALENDAR;
const dayStartMin = parseHM(DAY_START);
const dayEndMin = parseHM(DAY_END);

const el = {};
let modal;
let dayBookings = [];      // حجوزات اليوم المختار (لفحص التوفر)
let duration = DEFAULT_MINUTES;
let loadToken = 0;         // لتجاهل نتائج طلبات قديمة إذا غيّر المستخدم اليوم بسرعة

export function initBookingModal() {
  const root = document.getElementById('booking-modal');
  modal = bootstrap.Modal.getOrCreateInstance(root);
  Object.assign(el, {
    form: document.getElementById('booking-form'),
    teamWrap: document.getElementById('b-team-wrap'),
    team: document.getElementById('b-team'),
    date: document.getElementById('b-date'),
    start: document.getElementById('b-start'),
    durations: document.getElementById('b-durations'),
    title: document.getElementById('b-title'),
    status: document.getElementById('b-status'),
    submit: document.getElementById('b-submit'),
  });

  el.date.addEventListener('change', loadDay);
  el.start.addEventListener('change', render);
  el.team.addEventListener('change', render);
  el.durations.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-minutes]');
    if (!btn || btn.disabled) return;
    duration = Number(btn.dataset.minutes);
    render();
  });
  el.form.addEventListener('submit', onSubmit);
  root.addEventListener('shown.bs.modal', () => {
    if (window.matchMedia('(hover: hover)').matches) el.title.focus();
  });
}

/** يُستدعى بعد معرفة المستخدم: يملأ قائمة الفرق للإدارة ومدد الحجز */
export function setupBookingModalForUser() {
  el.teamWrap.hidden = !state.isAdmin;
  el.team.innerHTML = state.teams
    .map((t) => `<option value="${t.id}">${esc(t.name)}</option>`)
    .join('');

  const options = [];
  for (let m = SLOT_MINUTES; m <= state.maxMinutes; m += SLOT_MINUTES) options.push(m);
  el.durations.innerHTML = options
    .map((m) => `<button type="button" class="duration-btn" role="radio" data-minutes="${m}">${formatDuration(m)}</button>`)
    .join('');
}

/**
 * فتح النافذة.
 * @param {{start?: Date, minutes?: number}} preset وقت مختار من التقويم (اختياري)
 */
export function openBookingModal({ start, minutes } = {}) {
  start ??= nextFreeSlot();
  el.date.value = toDateInput(start);
  el.date.min = toDateInput(new Date());
  duration = Math.min(minutes ?? DEFAULT_MINUTES, state.maxMinutes);
  duration = Math.max(SLOT_MINUTES, Math.round(duration / SLOT_MINUTES) * SLOT_MINUTES);
  el.title.value = '';
  el.team.value = String(state.profile.team_id);

  const startMin = start.getHours() * 60 + start.getMinutes();
  buildStartOptions(Math.min(Math.max(startMin, dayStartMin), dayEndMin - SLOT_MINUTES));
  loadDay();
  modal.show();
}

/** أقرب نصف ساعة قادمة ضمن ساعات اليوم، وإلا بداية الغد */
function nextFreeSlot() {
  const now = new Date();
  let min = Math.ceil((now.getHours() * 60 + now.getMinutes() + 1) / SLOT_MINUTES) * SLOT_MINUTES;
  const day = new Date(now);
  if (min < dayStartMin) min = dayStartMin;
  if (min > dayEndMin - SLOT_MINUTES) { day.setDate(day.getDate() + 1); min = dayStartMin; }
  return combineDateAndMinutes(toDateInput(day), min);
}

function buildStartOptions(selected) {
  const opts = [];
  for (let m = dayStartMin; m < dayEndMin; m += SLOT_MINUTES) {
    opts.push(`<option value="${m}" ${m === selected ? 'selected' : ''}>${formatTimeOfDay(m)}</option>`);
  }
  el.start.innerHTML = opts.join('');
}

/** 570 → "9:30 ص" */
const formatTimeOfDay = (m) => formatTime(combineDateAndMinutes('2000-01-01', m));

/** تحميل حجوزات اليوم المختار ثم إعادة الرسم */
async function loadDay() {
  if (!el.date.value) return;
  const token = ++loadToken;
  const dayStart = combineDateAndMinutes(el.date.value, 0);
  dayBookings = [];
  el.status.className = 'slot-status';
  el.status.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جارٍ فحص التوفر…';
  el.submit.disabled = true;
  try {
    const rows = await getBookingsBetween(dayStart, addMinutes(dayStart, 24 * 60));
    if (token !== loadToken) return;
    dayBookings = rows;
  } catch (err) {
    if (token !== loadToken) return;
    toast(err.message, 'danger');
  }
  render();
}

/** يحسب الوقت المختار ويعرض حالة التوفر ويحدّث الأزرار */
function render() {
  if (!el.date.value) return;
  const startMin = Number(el.start.value);
  const now = new Date();

  // تعليم الأوقات المحجوزة أو الماضية في قائمة "من الساعة"
  for (const opt of el.start.options) {
    const s = combineDateAndMinutes(el.date.value, Number(opt.value));
    const busy = dayBookings.find((b) => overlaps(s, addMinutes(s, SLOT_MINUTES), b.starts_at, b.ends_at));
    const past = s < addMinutes(now, -5);
    opt.disabled = !!(busy || past);
    opt.textContent = formatTimeOfDay(Number(opt.value)) + (busy ? ' · محجوز' : '');
  }

  // تعطيل المدد التي تتجاوز نهاية اليوم
  for (const btn of el.durations.querySelectorAll('[data-minutes]')) {
    const m = Number(btn.dataset.minutes);
    btn.disabled = startMin + m > dayEndMin;
    if (btn.disabled && m === duration) duration = Math.max(SLOT_MINUTES, dayEndMin - startMin);
  }
  for (const btn of el.durations.querySelectorAll('[data-minutes]')) {
    const active = Number(btn.dataset.minutes) === duration;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
  }

  const start = combineDateAndMinutes(el.date.value, startMin);
  const end = addMinutes(start, duration);
  const conflict = dayBookings.find((b) => overlaps(start, end, b.starts_at, b.ends_at));
  const when = `${formatDay(start)} · ${formatRange(start, end)}`;

  let ok = false;
  if (start < addMinutes(now, -5)) {
    el.status.className = 'slot-status is-bad';
    el.status.innerHTML = `<i class="bi bi-clock-history"></i> هذا الوقت مضى، اختر وقتاً لاحقاً.`;
  } else if (conflict) {
    el.status.className = 'slot-status is-bad';
    el.status.innerHTML = `<i class="bi bi-x-circle-fill"></i> يتعارض مع حجز <strong>${esc(conflict.team_name)}</strong> (${formatRange(conflict.starts_at, conflict.ends_at)})`;
  } else {
    ok = true;
    el.status.className = 'slot-status is-ok';
    el.status.innerHTML = `<i class="bi bi-check-circle-fill"></i> متاح · ${esc(when)}`;
  }
  el.submit.disabled = !ok;
}

async function onSubmit(event) {
  event.preventDefault();
  if (el.submit.disabled) return;

  const start = combineDateAndMinutes(el.date.value, Number(el.start.value));
  const end = addMinutes(start, duration);
  const teamId = state.isAdmin ? Number(el.team.value) : null;

  await withButtonLoading(el.submit, async () => {
    try {
      await createBooking({ start, end, title: el.title.value.trim(), teamId });
      modal.hide();
      toast(`تم الحجز ✓ ${formatDay(start)} · ${formatRange(start, end)}`);
      notifyBookingsChanged();
    } catch (err) {
      toast(err.message, 'danger');
      loadDay(); // ربما حجزه شخص آخر للتو: نحدّث التوفر
    }
  });
}
