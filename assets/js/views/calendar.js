/**
 * شاشة التقويم (FullCalendar).
 * - الضغط على وقت فاضي ← نافذة الحجز بالوقت معبّأ.
 * - السحب على عدة خانات ← نافذة الحجز بالمدة المسحوبة.
 * - الضغط على حجز ← التفاصيل والإلغاء.
 */
import { CONFIG } from '../config.js';
import { state, onBookingsChanged } from '../state.js';
import { getBookingsBetween } from '../api.js';
import { esc, safeColor, toast, formatRange, minutesBetween, addMinutes, LOCALE } from '../utils.js';
import { openBookingModal } from './booking-modal.js';
import { openDetailsModal } from './details-modal.js';

const C = CONFIG.CALENDAR;
const MOBILE = '(max-width: 767.98px)';
let calendar;

/** تسجيل المستمعين فقط؛ التقويم نفسه يُنشأ عند أول عرض (بعد تسجيل الدخول) */
export function initCalendar() {
  onBookingsChanged(() => calendar?.refetchEvents());
}

function createCalendar() {
  const isMobile = () => window.matchMedia(MOBILE).matches;

  // العربية بأرقام لاتينية (متوافقة مع باقي الموقع)
  const ar = FullCalendar.globalLocales.find((l) => l.code === 'ar') ?? {};
  const locale = { ...ar, code: LOCALE };

  calendar = new FullCalendar.Calendar(document.getElementById('calendar'), {
    locale,
    direction: 'rtl',
    firstDay: C.FIRST_DAY,
    initialView: isMobile() ? 'timeGridDay' : 'timeGridWeek',
    headerToolbar: toolbar(isMobile()),
    buttonText: { today: 'اليوم', week: 'أسبوع', day: 'يوم', list: 'قائمة' },
    height: 'auto',
    allDaySlot: false,
    nowIndicator: true,
    slotMinTime: C.DAY_START,
    slotMaxTime: C.DAY_END,
    slotDuration: { minutes: C.SLOT_MINUTES },
    snapDuration: { minutes: C.SLOT_MINUTES },
    slotLabelFormat: { hour: 'numeric', minute: '2-digit', hour12: true, meridiem: 'short' },
    eventTimeFormat: { hour: 'numeric', minute: '2-digit', hour12: true, meridiem: 'short' },
    dayHeaderFormat: isMobile() ? { weekday: 'long', day: 'numeric', month: 'short' } : { weekday: 'short', day: 'numeric' },
    stickyHeaderDates: true,
    expandRows: false,
    noEventsText: 'لا توجد حجوزات في هذه الفترة',

    // ── التحديد والحجز ──
    selectable: true,
    selectMirror: true,
    selectOverlap: false,
    selectLongPressDelay: 350,
    selectAllow: (info) => info.start >= addMinutes(new Date(), -5)
      && minutesBetween(info.start, info.end) <= state.maxMinutes,
    select: (info) => {
      const minutes = minutesBetween(info.start, info.end);
      // ضغطة واحدة تختار خانة واحدة؛ نتركها لـ dateClick (مدة افتراضية ساعة)
      if (minutes <= C.SLOT_MINUTES) return;
      setTimeout(() => { calendar.unselect(); openBookingModal({ start: info.start, minutes }); });
    },
    dateClick: (info) => {
      if (info.date < addMinutes(new Date(), -5)) {
        toast('هذا الوقت مضى، اختر وقتاً لاحقاً.', 'info');
        return;
      }
      if (info.allDay) { // من عرض الشهر/القائمة: نفس اليوم، أقرب وقت
        info.date.setHours(Math.max(new Date().getHours() + 1, parseInt(C.DAY_START, 10)), 0, 0, 0);
      }
      const start = info.date;
      setTimeout(() => { calendar.unselect(); openBookingModal({ start }); });
    },

    // ── عرض الحجوزات ──
    events: loadEvents,
    eventClick: (info) => openDetailsModal(info.event.extendedProps.booking),
    eventContent: renderEvent,
    eventDidMount: (info) => {
      const b = info.event.extendedProps.booking;
      if (!b) return; // معاينة التحديد (ليست حجزاً بعد)
      info.el.style.setProperty('--team', safeColor(b.team_color));
      info.el.title = `${b.team_name} · ${formatRange(info.event.start, info.event.end)}`;
    },

    windowResize: () => {
      const mobile = isMobile();
      calendar.setOption('headerToolbar', toolbar(mobile));
      if (mobile && calendar.view.type === 'timeGridWeek') calendar.changeView('timeGridDay');
    },
  });
}

/** يُستدعى عند ظهور شاشة التقويم (FullCalendar يحتاج أن يكون ظاهراً ليُرسم) */
export function showCalendar() {
  if (calendar) calendar.refetchEvents();
  else createCalendar();
  calendar.render();
  calendar.updateSize();
}

export function renderLegend() {
  document.getElementById('legend').innerHTML = state.teams
    .map((t) => `<span class="legend-item" style="--team:${safeColor(t.color)}"><span class="team-dot"></span>${esc(t.name)}</span>`)
    .join('');
}

function toolbar(mobile) {
  return mobile
    ? { start: 'prev,next', center: 'title', end: 'today timeGridDay,listWeek' }
    : { start: 'prev,next today', center: 'title', end: 'timeGridWeek,timeGridDay,listWeek' };
}

async function loadEvents(info, success, failure) {
  try {
    const rows = await getBookingsBetween(info.start, info.end);
    success(rows.map((b) => ({
      id: b.id,
      start: b.starts_at,
      end: b.ends_at,
      title: b.team_name,
      classNames: b.team_id === state.profile?.team_id ? ['ev-mine'] : [],
      extendedProps: { booking: b },
    })));
  } catch (err) {
    toast(err.message, 'danger');
    failure(err);
  }
}

function renderEvent(arg) {
  const b = arg.event.extendedProps.booking;
  // معاينة أثناء السحب لاختيار وقت (Mirror) — لا يوجد حجز بعد
  if (!b) {
    return { html: `<div class="ev"><div class="ev-team">حجز جديد</div><div class="ev-time">${esc(formatRange(arg.event.start, arg.event.end))}</div></div>` };
  }
  if (arg.view.type.startsWith('list')) {
    return { html: `<span class="ev-list"><span class="team-dot" style="--team:${safeColor(b.team_color)}"></span><strong>${esc(b.team_name)}</strong>${b.title ? ` · ${esc(b.title)}` : ''}</span>` };
  }
  return {
    html: `
      <div class="ev">
        <div class="ev-team">${esc(b.team_name)}</div>
        <div class="ev-time">${esc(formatRange(arg.event.start, arg.event.end))}</div>
        ${b.title ? `<div class="ev-title">${esc(b.title)}</div>` : ''}
      </div>`,
  };
}
