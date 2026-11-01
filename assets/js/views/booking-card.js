/**
 * بطاقة حجز موحّدة تُستخدم في "حجوزاتي" وفي لوحة الإدارة.
 */
import { esc, safeColor, formatRange, formatDuration, minutesBetween, LOCALE } from '../utils.js';

const fmtDayNum = new Intl.DateTimeFormat(LOCALE, { day: 'numeric' });
const fmtMonth = new Intl.DateTimeFormat(LOCALE, { month: 'short' });
const fmtWeekday = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' });

export function bookingCard(b, { showTeam = false } = {}) {
  const color = safeColor(b.team_color);
  const start = new Date(b.starts_at);
  const cancelled = b.status === 'cancelled';
  const past = new Date(b.ends_at) <= new Date();
  const badge = cancelled
    ? '<span class="badge rounded-pill text-bg-danger">ملغى</span>'
    : past ? '<span class="badge rounded-pill text-bg-secondary">انتهى</span>' : '';

  return `
    <button type="button" class="booking-card ${cancelled ? 'is-cancelled' : ''}" data-booking-id="${esc(b.id)}" style="--team:${color}">
      <span class="booking-date">
        <span class="booking-date-day">${fmtDayNum.format(start)}</span>
        <span class="booking-date-month">${fmtMonth.format(start)}</span>
      </span>
      <span class="booking-info">
        <span class="booking-line">
          ${showTeam ? `<span class="booking-team"><span class="team-dot"></span>${esc(b.team_name)}</span>` : ''}
          <span class="booking-weekday">${fmtWeekday.format(start)}</span>
          ${badge}
        </span>
        <span class="booking-time">${esc(formatRange(b.starts_at, b.ends_at))} · ${esc(formatDuration(minutesBetween(b.starts_at, b.ends_at)))}</span>
        ${b.title ? `<span class="booking-title">${esc(b.title)}</span>` : ''}
      </span>
      <i class="bi bi-chevron-left booking-chevron"></i>
    </button>`;
}

export function emptyState(icon, text, action = '') {
  return `
    <div class="empty-state">
      <i class="bi bi-${icon}"></i>
      <p>${esc(text)}</p>
      ${action}
    </div>`;
}
