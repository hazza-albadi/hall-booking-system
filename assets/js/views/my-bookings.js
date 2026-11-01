/**
 * شاشة "حجوزات فريقي": القادمة والسجل.
 */
import { state, onBookingsChanged } from '../state.js';
import { getTeamBookings } from '../api.js';
import { esc, toast } from '../utils.js';
import { bookingCard, emptyState } from './booking-card.js';
import { openDetailsModal } from './details-modal.js';

let tab = 'upcoming';
let rows = [];
let visible = false;
const list = () => document.getElementById('mine-list');

export function initMyBookings() {
  document.querySelectorAll('[data-mine-tab]').forEach((btn) =>
    btn.addEventListener('click', () => {
      tab = btn.dataset.mineTab;
      document.querySelectorAll('[data-mine-tab]').forEach((b) => b.classList.toggle('active', b === btn));
      refresh();
    }));

  list().addEventListener('click', (e) => {
    const card = e.target.closest('[data-booking-id]');
    const booking = card && rows.find((r) => r.id === card.dataset.bookingId);
    if (booking) openDetailsModal(booking);
  });

  onBookingsChanged(() => { if (visible) refresh(); });
}

export function showMyBookings() {
  visible = true;
  document.getElementById('mine-sub').textContent = state.profile.team_name;
  refresh();
}

export const hideMyBookings = () => { visible = false; };

async function refresh() {
  const el = list();
  if (!rows.length) el.innerHTML = '<div class="text-center py-5"><span class="spinner-border text-primary"></span></div>';
  try {
    rows = await getTeamBookings(state.profile.team_id, tab);
  } catch (err) {
    toast(err.message, 'danger');
    return;
  }
  el.innerHTML = rows.length
    ? rows.map((b) => bookingCard(b)).join('')
    : tab === 'upcoming'
      ? emptyState('calendar-plus', 'ما عند فريقك حجوزات قادمة.',
          `<button type="button" class="btn btn-brand" data-action="new-booking"><i class="bi bi-plus-lg"></i> ${esc('حجز جديد')}</button>`)
      : emptyState('clock-history', 'لا يوجد سجل بعد.');
}
