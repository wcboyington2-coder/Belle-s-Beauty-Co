// ─────────────────────────────────────────────────────────────────────────────
//  Belle's Beauty & Co. — Google Apps Script
//
//  HOW TO DEPLOY:
//  1. Go to https://script.google.com and create a new project.
//  2. Replace everything in Code.gs with this file's contents.
//  3. Fill in CALENDAR_ID, OWNER_EMAIL, and TIMEZONE below.
//  4. Click Deploy → New deployment → Web app.
//     • Execute as: Me
//     • Who has access: Anyone
//  5. Click Deploy, authorize when prompted, then copy the Web App URL.
//  6. Paste that URL into js/app.js as APPS_SCRIPT_URL.
//
//  After any code change: Deploy → Manage deployments → edit the existing
//  deployment → "New version" → Deploy. The URL stays the same.
// ─────────────────────────────────────────────────────────────────────────────

// ── Config — fill these in before deploying ──────────────────────────────────
const CALENDAR_ID = 'annabellecfry2002@gmail.com';
const OWNER_EMAIL = 'annabellecfry2002@gmail.com';
const SALON_NAME  = "Belle's Beauty & Co.";
// IMPORTANT: set the script's timezone in Apps Script → Project Settings → Time zone.
// It must match your salon's local timezone so events are created at the right time.
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_DURATIONS = {
  'Event Makeup':                             60,
  'Event Hair':                               60,
  'Shampoo & Blow Dry':                       60,
  'Shampoo, Hair Trim & Blow Dry':            90,
  'Dry Trim':                                 30,
  'Regular Polish':                           90,
  'Gel Polish on Natural Nail':               90,
  'Gel X Nails w/ Gel Polish':              120,
  'Gel X Nails w/ Builder Gel & Polish':    150,
  'Builder Gel on Natural Nail (No Polish)': 150,
  'Builder Gel on Natural Nail w/ Polish':  150,
};

// ── GET — return busy ranges for a date range ─────────────────────────────────
function doGet(e) {
  if (!e || !e.parameter) {
    return jsonResponse({ error: 'No parameters received' });
  }

  const timeMin = e.parameter.timeMin;
  const timeMax = e.parameter.timeMax;

  if (!timeMin || !timeMax) {
    return jsonResponse({ error: 'Missing timeMin or timeMax' });
  }

  try {
    const cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) {
      return jsonResponse({ error: 'Calendar not found: ' + CALENDAR_ID });
    }

    const events = cal.getEvents(new Date(timeMin), new Date(timeMax));

    const busy = events.map(function(ev) {
      return {
        start: ev.getStartTime().toISOString(),
        end:   ev.getEndTime().toISOString(),
      };
    });

    return jsonResponse({ busy: busy });
  } catch (err) {
    return jsonResponse({ error: err.message });
  }
}

// ── POST — create a calendar event and send confirmation emails ───────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var service     = data.service;
    var dateKey     = data.dateKey;     // "YYYY-MM-DD"
    var displayDate = data.displayDate; // "Wednesday, June 11, 2026"
    var time        = data.time;        // "2:00 PM"
    var name        = data.name;
    var email       = data.email;
    var phone       = data.phone  || 'N/A';
    var notes       = data.notes  || 'None';

    if (!service || !dateKey || !time || !name || !email) {
      return jsonResponse({ success: false, error: 'Missing required fields' });
    }

    var durationMins = SERVICE_DURATIONS[service] || 60;
    var startDT      = parseDateTime(dateKey, time);
    var endDT        = new Date(startDT.getTime() + durationMins * 60 * 1000);

    // Create the calendar event
    var cal = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!cal) {
      return jsonResponse({ success: false, error: 'Calendar not found: ' + CALENDAR_ID + '. Make sure the script is authorized and the calendar ID is correct.' });
    }
    var event = cal.createEvent(
      service + ' — ' + name,
      startDT,
      endDT,
      {
        description: [
          'Service: ' + service,
          'Client:  ' + name,
          'Email:   ' + email,
          'Phone:   ' + phone,
          'Notes:   ' + notes,
        ].join('\n'),
        guests:      email,
        sendInvites: true,
      }
    );

    // Notify the owner
    MailApp.sendEmail({
      to:      OWNER_EMAIL,
      subject: 'New Booking: ' + service + ' — ' + name,
      body:
        'A new appointment was booked via your website.\n\n' +
        'Service:  ' + service  + '\n' +
        'Date:     ' + displayDate + '\n' +
        'Time:     ' + time     + '\n\n' +
        'Client:   ' + name     + '\n' +
        'Email:    ' + email    + '\n' +
        'Phone:    ' + phone    + '\n' +
        'Notes:    ' + notes,
    });

    // Confirm to the customer
    MailApp.sendEmail({
      to:      email,
      subject: 'Your Appointment is Confirmed — ' + SALON_NAME,
      body:
        'Hi ' + name + ',\n\n' +
        'Your appointment has been confirmed!\n\n' +
        'Service:  ' + service     + '\n' +
        'Date:     ' + displayDate + '\n' +
        'Time:     ' + time        + '\n\n' +
        'If you need to reschedule or cancel, please contact us.\n\n' +
        'See you soon!\n' +
        SALON_NAME,
    });

    return jsonResponse({ success: true, eventId: event.getId() });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Build a Date from a "YYYY-MM-DD" key and a "H:MM AM/PM" string.
 * Date is constructed in the script's local timezone (set via Project Settings).
 */
function parseDateTime(dateKey, timeStr) {
  var parts     = dateKey.split('-').map(Number);
  var year      = parts[0];
  var month     = parts[1];
  var day       = parts[2];
  var timeParts = timeStr.split(' ');
  var timePart  = timeParts[0];
  var meridiem  = timeParts[1];
  var hm        = timePart.split(':').map(Number);
  var hours     = hm[0];
  var minutes   = hm[1];
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return new Date(year, month - 1, day, hours, minutes, 0);
}
