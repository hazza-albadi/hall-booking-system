/**
 * نافذة تفاصيل الحجز + الإلغاء.
 * الإدارة تلغي أي حجز (مع سبب إذا كان لفريق آخر)، والرئيس يلغي حجوزات فريقه.
 */
import { state, notifyBookingsChanged } from '../state.js';
import { cancelBooking } from '../api.js';
import {
  esc, safeColor, toast, withButtonLoading, formatDay, formatRange,
  formatDuration, formatDateTime, minutesBetween,
} from '../utils.js';

let modal, body, footer, current;

export function initDetailsModal() {
  const root = document.getElementById('details-modal');
  modal = bootstrap.Modal.getOrCreateInstance(root);
  body = document.getElementById('details-body');
  footer = document.getElementById('details-footer');
  footer.addEventListener('click', onFooterClick);
}

export function openDetailsModal(booking) {
  current = booking;
  renderBody();
  renderFooter('view');
  modal.show();
}

function renderBody() {
  const b = current;
  const color = safeColor(b.team_color);
  const minutes = minutesBetween(b.starts_at, b.ends_at);
  const by = b.created_by_name || b.created_by_email;

  body.innerHTML = `
    <div class="detail-team" style="--team:${color}">
      <span class="team-dot"></span>${esc(b.team_name)}
      ${b.status === 'cancelled' ? '<span class="badge text-bg-danger ms-auto">ملغى</span>' : ''}
    </div>
    ${b.title ? `<p class="detail-title">${esc(b.title)}</p>` : ''}
    <dl class="detail-list">
      <div><dt><i class="bi bi-calendar-event"></i> اليوم</dt><dd>${esc(formatDay(b.starts_at))}</dd></div>
      <div><dt><i class="bi bi-clock"></i> الوقت</dt><dd>${esc(formatRange(b.starts_at, b.ends_at))} <span class="text-muted">(${esc(formatDuration(minutes))})</span></dd></div>
      <div><dt><i class="bi bi-person"></i> حجز بواسطة</dt><dd>${esc(by)}</dd></div>
      <div><dt><i class="bi bi-plus-circle"></i> تاريخ الحجز</dt><dd>${esc(formatDateTime(b.created_at))}</dd></div>
      ${b.status === 'cancelled' ? `
        <div><dt><i class="bi bi-x-circle"></i> أُلغي بواسطة</dt><dd dir="auto">${esc(b.cancelled_by_email)} · ${esc(formatDateTime(b.cancelled_at))}</dd></div>
        ${b.cancel_reason ? `<div><dt><i class="bi bi-chat-left-text"></i> السبب</dt><dd>${esc(b.cancel_reason)}</dd></div>` : ''}
      ` : ''}
    </dl>
    <div id="cancel-area"></div>`;
}

/** mode: 'view' (زر الإلغاء) أو 'confirm' (تأكيد الإلغاء مع السبب) */
function renderFooter(mode) {
  const area = body.querySelector('#cancel-area');
  if (!state.canCancel(current)) {
    footer.innerHTML = `<button type="button" class="btn btn-light w-100" data-bs-dismiss="modal">إغلاق</button>`;
    return;
  }

  if (mode === 'view') {
    area.innerHTML = '';
    footer.innerHTML = `
      <button type="button" class="btn btn-outline-danger w-100" data-act="ask-cancel">
        <i class="bi bi-x-circle"></i> إلغاء الحجز
      </button>`;
    return;
  }

  const otherTeam = current.team_id !== state.profile.team_id;
  const reasonRequired = state.isAdmin && otherTeam;
  area.innerHTML = `
    <div class="cancel-box">
      <p class="mb-2 fw-medium">متأكد من إلغاء هذا الحجز؟</p>
      <label class="form-label small" for="cancel-reason">
        سبب الإلغاء ${reasonRequired ? '<span class="text-danger">*</span>' : '<span class="text-muted">(اختياري)</span>'}
      </label>
      <textarea id="cancel-reason" class="form-control" rows="2" maxlength="300"
        placeholder="${reasonRequired ? 'سيظهر السبب للفريق' : ''}"></textarea>
    </div>`;
  footer.innerHTML = `
    <div class="d-flex gap-2 w-100">
      <button type="button" class="btn btn-light flex-fill" data-act="back">تراجع</button>
      <button type="button" class="btn btn-danger flex-fill" data-act="confirm-cancel">
        <span class="btn-label">تأكيد الإلغاء</span>
        <span class="spinner-border spinner-border-sm" hidden></span>
      </button>
    </div>`;
  area.querySelector('textarea').focus();
}

async function onFooterClick(e) {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'ask-cancel') return renderFooter('confirm');
  if (btn.dataset.act === 'back') return renderFooter('view');

  if (btn.dataset.act === 'confirm-cancel') {
    const reasonEl = body.querySelector('#cancel-reason');
    const reason = reasonEl.value.trim();
    if (state.isAdmin && current.team_id !== state.profile.team_id && !reason) {
      reasonEl.classList.add('is-invalid');
      reasonEl.focus();
      return;
    }
    await withButtonLoading(btn, async () => {
      try {
        await cancelBooking(current.id, reason);
        modal.hide();
        toast('تم إلغاء الحجز');
        notifyBookingsChanged();
      } catch (err) {
        toast(err.message, 'danger');
      }
    });
  }
}
