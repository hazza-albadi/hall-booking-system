/**
 * شاشة الإدارة (للإدارة العليا فقط):
 *  - إضافة الأعضاء المصرّح لهم (إيميل جوجل + الفريق + الصلاحية)
 *  - تعديل الصلاحية/الفريق، تعطيل، حذف
 *  - كل الحجوزات القادمة
 * ملاحظة: إخفاء الشاشة في الواجهة للراحة فقط؛ الحماية الفعلية في قاعدة البيانات (RLS).
 */
import { state, onBookingsChanged } from '../state.js';
import { listMembers, addMember, updateMember, deleteMember, getAllUpcomingBookings } from '../api.js';
import { esc, safeColor, toast } from '../utils.js';
import { bookingCard, emptyState } from './booking-card.js';
import { openDetailsModal } from './details-modal.js';

let members = [];
let bookings = [];
let visible = false;
const $ = (id) => document.getElementById(id);

export function initAdmin() {
  $('member-form').addEventListener('submit', onAddMember);
  $('members-search').addEventListener('input', renderMembers);
  $('members-list').addEventListener('change', onMemberChange);
  $('members-list').addEventListener('click', onMemberClick);
  $('admin-bookings').addEventListener('click', (e) => {
    const card = e.target.closest('[data-booking-id]');
    const booking = card && bookings.find((b) => b.id === card.dataset.bookingId);
    if (booking) openDetailsModal(booking);
  });
  onBookingsChanged(() => { if (visible) loadBookings(); });
}

export function setupAdminForUser() {
  $('m-team').innerHTML = '<option value="" selected disabled>اختر الفريق…</option>'
    + state.teams.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
}

export function showAdmin() {
  visible = true;
  loadMembers();
  loadBookings();
}

export const hideAdmin = () => { visible = false; };


/* ═════════════ الأعضاء ═════════════ */

async function loadMembers() {
  try {
    members = await listMembers();
    renderMembers();
  } catch (err) { toast(err.message, 'danger'); }
}

function renderMembers() {
  const q = $('members-search').value.trim().toLowerCase();
  const filtered = members.filter((m) =>
    !q || m.email.includes(q) || (m.full_name ?? '').toLowerCase().includes(q)
       || (state.teamById(m.team_id)?.name ?? '').includes(q));

  $('members-count').textContent = members.length;
  $('members-list').innerHTML = filtered.length ? filtered.map(memberRow).join('')
    : emptyState('person-x', q ? 'لا نتائج للبحث.' : 'لم تتم إضافة أعضاء بعد.');
}

function memberRow(m) {
  const team = state.teamById(m.team_id);
  const isMe = m.email === state.profile.email;
  const teamOptions = state.teams
    .map((t) => `<option value="${t.id}" ${t.id === m.team_id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');

  return `
    <div class="member-row ${m.is_active ? '' : 'is-inactive'}" data-email="${esc(m.email)}" style="--team:${safeColor(team?.color)}">
      <div class="member-main">
        <div class="member-name">
          ${esc(m.full_name || m.email.split('@')[0])}
          ${isMe ? '<span class="badge rounded-pill text-bg-light">أنت</span>' : ''}
          ${m.is_active ? '' : '<span class="badge rounded-pill text-bg-secondary">معطّل</span>'}
        </div>
        <div class="member-email" dir="ltr">${esc(m.email)}</div>
      </div>
      <div class="member-controls">
        <select class="form-select form-select-sm" data-field="team_id" aria-label="الفريق">${teamOptions}</select>
        <select class="form-select form-select-sm" data-field="role" aria-label="الصلاحية">
          <option value="lead" ${m.role === 'lead' ? 'selected' : ''}>رئيس فريق</option>
          <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>إدارة عليا</option>
        </select>
        <div class="form-check form-switch m-0" title="${m.is_active ? 'نشط' : 'معطّل'}">
          <input class="form-check-input" type="checkbox" role="switch" data-field="is_active" ${m.is_active ? 'checked' : ''} aria-label="نشط">
        </div>
        <button type="button" class="btn btn-sm btn-icon text-danger" data-act="delete" aria-label="حذف"><i class="bi bi-trash3"></i></button>
      </div>
    </div>`;
}

async function onAddMember(e) {
  e.preventDefault();
  const email = $('m-email');
  if (!email.checkValidity() || !email.value.trim()) {
    email.classList.add('is-invalid');
    email.focus();
    return;
  }
  email.classList.remove('is-invalid');
  const team = $('m-team');
  team.classList.toggle('is-invalid', !team.value);
  if (!team.value) { team.focus(); return; }
  const btn = e.submitter ?? e.target.querySelector('[type=submit]');
  btn.disabled = true;
  try {
    await addMember({
      email: email.value,
      fullName: $('m-name').value,
      teamId: Number($('m-team').value),
      role: $('m-role').value,
    });
    toast('تمت الإضافة ✓ يقدر يدخل الحين بحساب جوجل');
    e.target.reset();
    $('m-team').value = '';
    await loadMembers();
  } catch (err) {
    toast(err.message, 'danger');
  } finally {
    btn.disabled = false;
  }
}

async function onMemberChange(e) {
  const field = e.target.dataset.field;
  const row = e.target.closest('[data-email]');
  if (!field || !row) return;
  const value = field === 'is_active' ? e.target.checked
    : field === 'team_id' ? Number(e.target.value) : e.target.value;

  try {
    await updateMember(row.dataset.email, { [field]: value });
    toast('تم الحفظ');
  } catch (err) {
    toast(err.message, 'danger');
  }
  await loadMembers(); // إعادة المزامنة مع قاعدة البيانات (ترجع القيمة إذا رُفض التعديل)
}

async function onMemberClick(e) {
  const btn = e.target.closest('[data-act="delete"]');
  if (!btn) return;
  const email = btn.closest('[data-email]').dataset.email;
  if (!confirm(`حذف ${email} من قائمة المصرّح لهم؟\nحجوزاته السابقة تبقى في السجل.`)) return;
  try {
    await deleteMember(email);
    toast('تم الحذف');
    await loadMembers();
  } catch (err) { toast(err.message, 'danger'); }
}


/* ═════════════ الحجوزات ═════════════ */

async function loadBookings() {
  try {
    bookings = await getAllUpcomingBookings();
    $('admin-bookings').innerHTML = bookings.length
      ? bookings.map((b) => bookingCard(b, { showTeam: true })).join('')
      : emptyState('calendar-check', 'لا توجد حجوزات قادمة.');
  } catch (err) { toast(err.message, 'danger'); }
}
