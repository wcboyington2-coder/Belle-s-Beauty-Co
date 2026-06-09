/* ============================================================
   Belle's Beauty & Co. — Calendar & Time-Slot Module
   ============================================================

   HOW GOOGLE CALENDAR INTEGRATION WORKS:
   ───────────────────────────────────────
   1. On load, fetchBusyData() calls the Apps Script web app
      (APPS_SCRIPT_URL in app.js) with timeMin / timeMax for
      the visible month.

   2. The script returns an array of { start, end } busy ranges
      from the owner's Google Calendar.

   3. buildBusyMap() converts those ranges into the busyMap
      format: { "YYYY-MM-DD": ["9:00 AM", "9:30 AM", ...] }.

   4. renderCalendar() re-renders with real availability data.
      On month navigation, fetchBusyData() is called again.

   5. When a customer confirms a booking, submitBooking() in
      app.js POSTs the details to the same Apps Script URL,
      which creates a Google Calendar event and emails both
      the owner and the customer.

   ============================================================ */

'use strict';

/* ── Config ─────────────────────────────────────────────────── */

/*
 * GOOGLE CALENDAR INTEGRATION:
 * Replace with your actual Google Calendar ID.
 * Format: "youraddress@gmail.com" or a resource ID.
 */
// const CALENDAR_ID = 'YOUR_CALENDAR_ID@gmail.com';

/* Timezone for display and event creation (IANA format). */
// const TIMEZONE = 'America/Toronto';

/* Every half-hour slot within business hours. */
const ALL_TIME_SLOTS = [
  '9:00 AM', '9:30 AM',
  '10:00 AM', '10:30 AM',
  '11:00 AM', '11:30 AM',
  '12:00 PM', '12:30 PM',
  '1:00 PM',  '1:30 PM',
  '2:00 PM',  '2:30 PM',
  '3:00 PM',  '3:30 PM',
  '4:00 PM',  '4:30 PM',
];

/* Day-of-week indices where the salon is closed (0 = Sunday). */
const CLOSED_DAYS = [0]; // Closed on Sundays

/* How many days in advance bookings can be made. */
const MAX_DAYS_AHEAD = 60;

/* Duration (minutes) for each bookable service. */
const SERVICE_DURATIONS = {
  'Event Makeup':                            60,
  'Event Hair':                              60,
  'Shampoo & Blow Dry':                      60,
  'Shampoo, Hair Trim & Blow Dry':           90,
  'Dry Trim':                                30,
  'Regular Polish':                          90,
  'Gel Polish on Natural Nail':              90,
  'Gel X Nails w/ Gel Polish':              120,
  'Gel X Nails w/ Builder Gel & Polish':    150,
  'Builder Gel on Natural Nail (No Polish)': 150,
  'Builder Gel on Natural Nail w/ Polish':  150,
};


/* ── Sample data (replace with Google Calendar API data) ─────── */

/*
 * GOOGLE CALENDAR INTEGRATION:
 * This static map will be replaced by the output of buildBusyMap()
 * once you connect the API. Key format: "YYYY-MM-DD".
 * Value: array of time-slot strings that are already booked.
 */
const SAMPLE_BOOKED_SLOTS = (() => {
  const map = {};
  const today = new Date();

  // Helper: date key N days from today
  function key(n) {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return toDateKey(d);
  }

  // Partially booked days
  map[key(1)]  = ['9:00 AM', '9:30 AM', '10:00 AM'];
  map[key(2)]  = ['2:00 PM', '2:30 PM', '3:00 PM', '3:30 PM'];
  map[key(4)]  = ['11:00 AM', '11:30 AM', '12:00 PM', '12:30 PM'];
  map[key(6)]  = ['9:00 AM', '9:30 AM', '1:00 PM', '1:30 PM', '4:00 PM', '4:30 PM'];
  map[key(8)]  = ['10:00 AM', '10:30 AM', '2:00 PM'];
  map[key(10)] = ['9:00 AM', '9:30 AM', '11:00 AM', '3:00 PM', '3:30 PM'];

  // Fully booked day
  map[key(5)]  = [...ALL_TIME_SLOTS];
  map[key(12)] = [...ALL_TIME_SLOTS];

  return map;
})();


/* ── Calendar state ──────────────────────────────────────────── */
let calYear, calMonth;
let busyMap = SAMPLE_BOOKED_SLOTS; // replaced when Google Calendar data arrives

/** How many 30-min slots the currently selected service fills (minimum 1). */
function getServiceSlotCount() {
  const mins = SERVICE_DURATIONS[state.selectedService] || 30;
  return Math.ceil(mins / 30);
}


/* ── Public API ──────────────────────────────────────────────── */

/**
 * Initialize the calendar to the current month.
 * @param {Object} [externalBusyMap] - Optional map from Google Calendar API.
 *   If provided, this replaces the sample data.
 *
 * GOOGLE CALENDAR INTEGRATION:
 *   Call initCalendar(busyMapFromAPI) after fetching freebusy data.
 */
function initCalendar(externalBusyMap) {
  if (externalBusyMap) busyMap = externalBusyMap;

  const today = new Date();
  calYear  = today.getFullYear();
  calMonth = today.getMonth();

  renderCalendar(calYear, calMonth);
  wireCalendarNav();

  // Fetch real availability; re-renders the calendar grid when data arrives.
  fetchBusyData(calYear, calMonth);
}

/**
 * Load free/busy data from the Apps Script web app for the given month.
 * Falls back silently to sample data if the URL is not configured.
 */
async function fetchBusyData(year, month) {
  if (typeof APPS_SCRIPT_URL === 'undefined' || !APPS_SCRIPT_URL) return;

  const timeMin = new Date(year, month, 1).toISOString();
  const timeMax = new Date(year, month + 1, 1).toISOString();

  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?timeMin=${timeMin}&timeMax=${timeMax}`);
    const json = await res.json();

    if (json.busy) {
      busyMap = buildBusyMap(json.busy);
      renderCalendar(year, month);
    }
  } catch (err) {
    console.warn('Could not load availability from Google Calendar:', err);
  }
}


/* ── Rendering ───────────────────────────────────────────────── */

function renderCalendar(year, month) {
  const label = document.getElementById('cal-month-label');
  if (label) {
    label.textContent = new Date(year, month, 1)
      .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  const grid = document.getElementById('calendar-days');
  if (!grid) return;
  grid.innerHTML = '';

  const today     = startOfDay(new Date());
  const maxDate   = new Date(today);
  maxDate.setDate(today.getDate() + MAX_DAYS_AHEAD);

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();

  // Blank cells before the 1st
  for (let i = 0; i < firstWeekday; i++) {
    appendDayCell(grid, '', 'empty');
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const date    = new Date(year, month, d);
    const dateKey = toDateKey(date);
    const dayEl   = document.createElement('div');
    dayEl.textContent = d;
    dayEl.setAttribute('role', 'gridcell');

    const isPast      = date < today;
    const isFuture    = date > maxDate;
    const isClosed    = CLOSED_DAYS.includes(date.getDay());
    const isToday     = date.getTime() === today.getTime();

    /*
     * GOOGLE CALENDAR INTEGRATION:
     * isFullyBooked comes from comparing booked slots to ALL_TIME_SLOTS.
     * With real API data, busyMap[dateKey] contains busy ranges that have
     * been pre-converted to slot strings by buildBusyMap().
     */
    const booked        = busyMap[dateKey] || [];
    const isFullyBooked = booked.length >= ALL_TIME_SLOTS.length;

    if (isPast || isFuture) {
      dayEl.className = 'cal-day past';
    } else if (isClosed || isFullyBooked) {
      dayEl.className = 'cal-day fully-booked';
      dayEl.setAttribute('aria-label', `${d} — unavailable`);
    } else {
      dayEl.className = `cal-day available${isToday ? ' today' : ''}`;
      dayEl.setAttribute('aria-label', `${d} — available`);
      dayEl.setAttribute('tabindex', '0');
      dayEl.addEventListener('click', () => selectDate(dateKey, dayEl));
      dayEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectDate(dateKey, dayEl);
        }
      });
    }

    grid.appendChild(dayEl);
  }
}

function appendDayCell(grid, text, cls) {
  const el = document.createElement('div');
  el.className = `cal-day ${cls}`;
  el.textContent = text;
  el.setAttribute('aria-hidden', 'true');
  grid.appendChild(el);
}

function wireCalendarNav() {
  const prevBtn = document.getElementById('prev-month');
  const nextBtn = document.getElementById('next-month');

  if (prevBtn) {
    prevBtn.onclick = () => {
      const today = new Date();
      if (calYear > today.getFullYear() || calMonth > today.getMonth()) {
        calMonth--;
        if (calMonth < 0) { calMonth = 11; calYear--; }
        renderCalendar(calYear, calMonth);
        fetchBusyData(calYear, calMonth);
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar(calYear, calMonth);
      fetchBusyData(calYear, calMonth);
    };
  }
}


/* ── Date selection ──────────────────────────────────────────── */

function selectDate(dateKey, clickedEl) {
  // Deselect previously selected day
  document.querySelectorAll('#calendar-days .cal-day.selected')
    .forEach(el => el.classList.remove('selected'));

  // Mark new selection
  if (clickedEl) clickedEl.classList.add('selected');

  state.selectedDate    = formatDisplayDate(dateKey);
  state.selectedDateKey = dateKey;
  state.selectedTime    = null;

  renderTimeSlots(dateKey);
}


/* ── Time slot rendering ─────────────────────────────────────── */

function renderTimeSlots(dateKey) {
  const heading = document.getElementById('timeslots-heading');
  if (heading) heading.textContent = formatDisplayDate(dateKey);

  const grid = document.getElementById('timeslots-grid');
  if (!grid) return;
  grid.innerHTML = '';

  /*
   * GOOGLE CALENDAR INTEGRATION:
   * bookedSlots here comes from busyMap[dateKey], which is populated
   * from the freebusy API response. Each entry is a time-slot string
   * that falls within a busy period returned by the API.
   */
  const bookedSlots = busyMap[dateKey] || [];
  const slotCount   = getServiceSlotCount();

  ALL_TIME_SLOTS.forEach((slot, idx) => {
    const isBooked = bookedSlots.includes(slot);
    const btn = document.createElement('button');
    btn.textContent = slot;
    btn.className   = 'timeslot';

    if (isBooked) {
      btn.disabled = true;
      btn.classList.add('booked-slot');
    } else {
      // Valid start: full duration block fits within hours AND none of those slots are booked.
      const endIdx    = idx + slotCount;
      const fits      = endIdx <= ALL_TIME_SLOTS.length;
      const blockFree = fits && ALL_TIME_SLOTS.slice(idx, endIdx).every(s => !bookedSlots.includes(s));

      if (!fits || !blockFree) {
        btn.disabled = true;
        btn.classList.add('no-room');
      } else {
        btn.addEventListener('click', () => selectTimeSlot(slot, btn));
      }
    }

    grid.appendChild(btn);
  });

  // Hide confirm form and success when re-selecting a date
  const confirmForm = document.getElementById('confirm-form');
  const success     = document.getElementById('booking-success');
  if (confirmForm) confirmForm.hidden = true;
  if (success)     success.hidden = true;
}


/* ── Time slot selection ─────────────────────────────────────── */

function selectTimeSlot(time, btn) {
  // Deselect any previously selected slot
  document.querySelectorAll('.timeslots-grid .timeslot.selected')
    .forEach(el => el.classList.remove('selected'));

  // Clear previous duration shadow
  document.querySelectorAll('#timeslots-grid .timeslot.duration-shadow')
    .forEach(el => el.classList.remove('duration-shadow'));

  btn.classList.add('selected');
  state.selectedTime = time;

  // Shade the subsequent slots consumed by this service so the customer
  // can see the full appointment block.
  const slotCount = getServiceSlotCount();
  const startIdx  = ALL_TIME_SLOTS.indexOf(time);
  const allBtns   = document.querySelectorAll('#timeslots-grid .timeslot');
  for (let i = startIdx + 1; i < startIdx + slotCount; i++) {
    if (allBtns[i]) allBtns[i].classList.add('duration-shadow');
  }

  showConfirmForm();
}

function showConfirmForm() {
  const confirmForm = document.getElementById('confirm-form');
  const summary     = document.getElementById('confirm-summary');
  const success     = document.getElementById('booking-success');

  if (success) success.hidden = true;

  if (summary) {
    summary.textContent =
      `${state.selectedService}  ·  ${state.selectedDate}  ·  ${state.selectedTime}`;
  }

  if (confirmForm) {
    confirmForm.hidden = false;
    // Scroll the form into view smoothly on mobile
    confirmForm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}


/* ── Utility functions ───────────────────────────────────────── */

/** Return a Date set to midnight. */
function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a Date as "YYYY-MM-DD". */
function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format "YYYY-MM-DD" as a readable string, e.g. "Wednesday, June 11, 2026". */
function formatDisplayDate(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Convert a freebusy response (array of {start, end} ISO strings) into the
 * busyMap format used by this module: { "YYYY-MM-DD": ["9:00 AM", ...] }.
 * Each event's occupied 30-min slots are marked for the event's start date.
 */
function buildBusyMap(busyRanges) {
  const map = {};
  busyRanges.forEach(({ start, end }) => {
    const startDate = new Date(start);
    const endDate   = new Date(end);
    ALL_TIME_SLOTS.forEach(slot => {
      const slotTime = parseSlotTime(slot, startDate);
      if (slotTime >= startDate && slotTime < endDate) {
        const key = toDateKey(startDate);
        if (!map[key]) map[key] = [];
        if (!map[key].includes(slot)) map[key].push(slot);
      }
    });
  });
  return map;
}

/** Build a Date for a time-slot string on a given reference date. */
function parseSlotTime(slot, onDate) {
  const [time, meridiem] = slot.split(' ');
  let [hours, minutes] = time.split(':').map(Number);
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return new Date(onDate.getFullYear(), onDate.getMonth(), onDate.getDate(), hours, minutes);
}
