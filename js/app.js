/* ============================================================
   Belle's Beauty & Co. — App Navigation & Booking Logic
   ============================================================ */

'use strict';

// ── Google Apps Script URL ────────────────────────────────────
// Paste your Web App URL here after deploying google-apps-script/Code.gs.
// Leave as empty string to use sample data during development.
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzvuzTZ_akJd74eXh9DPNTGtv93M4jLEXeK1Ra4b7vVgZG0FpEuQZQrZJICgvoM4gn7/exec';

// ── State ────────────────────────────────────────────────────
const state = {
  currentSection: 'landing',
  previousSection: null,   // section we came from before booking
  selectedService: null,
  selectedDate: null,       // display format: "Wednesday, June 11, 2026"
  selectedDateKey: null,    // ISO key: "2026-06-11"
  selectedTime: null,
};

// ── Section routing ──────────────────────────────────────────

/**
 * Show a section by ID and hide all others.
 * Exposed globally so inline onclick handlers can call it.
 */
function showSection(id) {
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
  });
  const target = document.getElementById(id);
  if (!target) return;
  target.classList.add('active');
  state.currentSection = id;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Navigate to a service category (Hair & Makeup or Nails). */
function showServiceSection(category) {
  state.previousSection = category;
  showSection(category);
}

/**
 * Open the booking calendar for a specific service.
 * @param {string} service  - Display name, e.g. "Gel Manicure"
 * @param {string} fromSection - The service section to return to on back
 */
function showBooking(service, fromSection) {
  state.selectedService = service;
  state.previousSection = fromSection || state.currentSection;
  state.selectedDate = null;
  state.selectedDateKey = null;
  state.selectedTime = null;

  // Update the subtitle in the booking section header
  const label = document.getElementById('booking-service-label');
  if (label) label.textContent = `Booking: ${service}`;

  // Reset the booking UI before showing
  resetBookingUI();

  showSection('booking');
  initCalendar();
}

/** Return from booking to the appropriate service section. */
function goBackFromBooking() {
  showSection(state.previousSection || 'landing');
}

/** nav helper that prevents default <a> navigation (used in header links). */
function navTo(id) {
  showSection(id);
  return false; // prevent href="#" scroll
}

/** Same as navTo but also closes the mobile menu. */
function mobileNavTo(id) {
  showSection(id);
  closeMobileMenu();
  return false;
}

/** Scroll to an anchor within the landing page; navigate to landing first if needed. */
function navToAnchor(anchorId) {
  if (state.currentSection === 'landing') {
    document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth' });
  } else {
    showSection('landing');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }
  return false;
}

/** Same as navToAnchor but also closes the mobile menu. */
function mobileNavToAnchor(anchorId) {
  closeMobileMenu();
  navToAnchor(anchorId);
  return false;
}


// ── Booking UI helpers ───────────────────────────────────────

/** Reset all booking UI sub-components to their initial state. */
function resetBookingUI() {
  setEl('timeslots-heading', 'Select a date to view available times');
  clearEl('timeslots-grid');

  const confirmForm = document.getElementById('confirm-form');
  const bookingSuccess = document.getElementById('booking-success');
  if (confirmForm) confirmForm.hidden = true;
  if (bookingSuccess) bookingSuccess.hidden = true;

  // Clear form fields
  ['field-name', 'field-email', 'field-phone', 'field-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

/**
 * Handle the "Confirm Appointment" button.
 * Validates the form, shows the success screen, and posts to Google Apps Script.
 */
async function submitBooking() {
  clearFormError();

  const name = document.getElementById('field-name')?.value.trim();
  const email = document.getElementById('field-email')?.value.trim();
  const phone = document.getElementById('field-phone')?.value.trim();
  const notes = document.getElementById('field-notes')?.value.trim();

  if (!name || !email) {
    showFormError('Please enter your name and email address.');
    return;
  }
  if (!isValidEmail(email)) {
    showFormError('Please enter a valid email address.');
    return;
  }

  // If Apps Script is not configured, show success without the API call.
  if (!APPS_SCRIPT_URL) {
    showSuccessScreen(name, email);
    return;
  }

  const confirmBtn = document.querySelector('#confirm-form .confirm-btn');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Booking…'; }

  try {
    // Send as text/plain to avoid a CORS preflight — Apps Script reads the
    // raw body via e.postData.contents and parses it as JSON on its end.
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        service: state.selectedService,
        dateKey: state.selectedDateKey,
        displayDate: state.selectedDate,
        time: state.selectedTime,
        name, email, phone, notes,
      }),
    });

    const json = await res.json();

    if (json.success) {
      showSuccessScreen(name, email);
    } else {
      showFormError(json.error || 'Unable to complete booking. Please try again.');
    }
  } catch (err) {
    showFormError('Network error — could not reach the booking server. Please try again.');
    console.error('Booking fetch error:', err);
  } finally {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Confirm Appointment'; }
  }
}

/** Render the success state after a confirmed booking. */
function showSuccessScreen(name, email) {
  const confirmForm = document.getElementById('confirm-form');
  const bookingSuccess = document.getElementById('booking-success');
  const successDetails = document.getElementById('success-details');

  if (confirmForm) confirmForm.hidden = true;
  if (bookingSuccess) bookingSuccess.hidden = false;

  if (successDetails) {
    successDetails.textContent =
      `${state.selectedService} — ${state.selectedDate} at ${state.selectedTime}. ` +
      `A confirmation will be sent to ${email}.`;
  }
}

/** Show a validation/network error inside the booking form. Stays visible until cleared. */
function showFormError(message) {
  let err = document.getElementById('form-error');
  if (!err) {
    err = document.createElement('p');
    err.id = 'form-error';
    err.style.cssText =
      'font-size:.85rem;color:#b84040;margin-bottom:.75rem;' +
      'padding:.5rem .75rem;background:#fdf4f4;border:1px solid #f0c0c0;border-radius:6px;';
    document.querySelector('#confirm-form .confirm-btn')?.before(err);
  }
  err.textContent = message;
}

function clearFormError() {
  document.getElementById('form-error')?.remove();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


// ── General inquiry form ─────────────────────────────────────

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xgobyevg';

async function submitInquiry(event) {
  event.preventDefault();

  const name = document.getElementById('inq-name')?.value.trim();
  const email = document.getElementById('inq-email')?.value.trim();
  const phone = document.getElementById('inq-phone')?.value.trim();
  const message = document.getElementById('inq-message')?.value.trim();
  const errEl = document.getElementById('inq-error');
  const btn = event.target.querySelector('button[type="submit"]');

  const showErr = (msg) => {
    if (errEl) { errEl.textContent = msg; errEl.hidden = false; }
  };

  if (errEl) errEl.hidden = true;

  if (!name || !email || !message) {
    showErr('Please fill in all required fields.');
    return false;
  }
  if (!isValidEmail(email)) {
    showErr('Please enter a valid email address.');
    return false;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }

  try {
    const res = await fetch(FORMSPREE_ENDPOINT, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, message }),
    });

    if (res.ok) {
      document.getElementById('inquiry-form').hidden = true;
      document.getElementById('inquiry-success').hidden = false;
    } else {
      const data = await res.json().catch(() => ({}));
      showErr(data?.error || 'Something went wrong. Please try again.');
      if (btn) { btn.disabled = false; btn.textContent = 'Send Message'; }
    }
  } catch {
    showErr('Network error — please check your connection and try again.');
    if (btn) { btn.disabled = false; btn.textContent = 'Send Message'; }
  }

  return false;
}


// ── Mobile menu ──────────────────────────────────────────────

function closeMobileMenu() {
  const nav = document.getElementById('mobile-nav');
  const btn = document.getElementById('mobile-menu-btn');
  if (nav) nav.classList.remove('open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function toggleMobileMenu() {
  const nav = document.getElementById('mobile-nav');
  const btn = document.getElementById('mobile-menu-btn');
  if (!nav || !btn) return;
  const isOpen = nav.classList.toggle('open');
  btn.setAttribute('aria-expanded', String(isOpen));
}


// ── DOM helpers ──────────────────────────────────────────────
function setEl(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}
function clearEl(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = '';
}


// ── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Mobile menu button
  const menuBtn = document.getElementById('mobile-menu-btn');
  if (menuBtn) menuBtn.addEventListener('click', toggleMobileMenu);

  // Close mobile menu when clicking outside the header
  document.addEventListener('click', e => {
    if (!e.target.closest('.site-header')) closeMobileMenu();
  });

  // Header keyboard nav: treat logo div like a button
  const headerLogo = document.querySelector('.header-logo');
  if (headerLogo) {
    headerLogo.addEventListener('keydown', e => {
      if (e.key === 'Enter') showSection('landing');
    });
  }

});
