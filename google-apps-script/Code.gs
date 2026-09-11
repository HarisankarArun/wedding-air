const CONFIG = Object.freeze({
  eventId: 'maya-arjun-wedding-2027',

  couple: 'Maya & Arjun',
  eventTitle: 'Maya & Arjun — Wedding Ceremony',
  senderName: 'Maya & Arjun Wedding Air',

  flightNumber: 'WA 500',
  venue: 'Bekal Club, Padannakkad, Kerala',
  mapUrl:
    'https://www.google.com/maps/search/?api=1&query=Bekal+Club+Padannakkad',

  /*
   * UTC values corresponding to:
   * 2 January 2027, 10:30 AM–2:30 PM IST
   */
  startIso: '2027-01-02T05:00:00Z',
  endIso: '2027-01-02T09:00:00Z',
  timezone: 'Asia/Kolkata',

  sheetName: 'Bookings',

  /*
   * Optional but recommended.
   *
   * Set this to the Gmail address that owns the script.
   * It is used as Reply-To and calendar organizer.
   */
  organizerEmail: '',

  /*
   * Optional host notification.
   *
   * Leave blank to preserve the free email quota. Adding a BCC address
   * means each booking consumes an additional email recipient.
   */
  notificationEmail: '',

  maxPassengers: 6,
  maxPdfBase64Length: 12000000
});

const HEADERS = [
  'Booking ID',
  'Received at',
  'Contact name',
  'Contact email',
  'Contact phone',
  'Boarding location',
  'Origin code',
  'Cabin',
  'Passenger number',
  'Passenger name',
  'Age',
  'Seat',
  'PDF attached',
  'Email status',
  'Consent'
];

/**
 * Run this once from the Apps Script editor.
 */
function setup() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      'Open Apps Script from inside the Google Sheet and run setup again.'
    );
  }

  PropertiesService
    .getScriptProperties()
    .setProperty('SPREADSHEET_ID', spreadsheet.getId());

  let sheet = spreadsheet.getSheetByName(CONFIG.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet
      .getRange(1, 1, 1, HEADERS.length)
      .setValues([HEADERS]);
  }

  sheet.setFrozenRows(1);

  sheet
    .getRange(1, 1, 1, HEADERS.length)
    .setFontWeight('bold')
    .setBackground('#12233f')
    .setFontColor('#ffffff');

  sheet.autoResizeColumns(1, HEADERS.length);

  /*
   * Calling this during setup requests the email permission before the
   * public web app receives its first booking.
   */
  MailApp.getRemainingDailyQuota();

  console.log('Setup complete. Spreadsheet ID: ' + spreadsheet.getId());
}

function doGet() {
  return ContentService
    .createTextOutput('Wedding Air booking endpoint is running.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  let sheet = null;
  let firstRow = 0;
  let rowCount = 0;

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Request body is missing.');
    }

    const data = JSON.parse(e.postData.contents);

    /*
     * Silently accept honeypot submissions without storing anything.
     */
    if (data.honeypot) {
      return jsonResponse_({ ok: true });
    }

    validatePayload_(data);

    sheet = getBookingSheet_();
    rowCount = data.passengers.length;

    const receivedAt = new Date();

    const rows = data.passengers.map(function (passenger) {
      return [
        safeSheetText_(data.bookingId),
        receivedAt,
        safeSheetText_(data.contact.name),
        safeSheetText_(data.contact.email),
        safeSheetText_(data.contact.phone),
        safeSheetText_(data.journey.origin),
        safeSheetText_(data.journey.originCode),
        safeSheetText_(data.journey.cabin),
        Number(passenger.passengerNumber),
        safeSheetText_(passenger.name),
        Number(passenger.age),
        safeSheetText_(passenger.seat),
        'PENDING',
        'PENDING',
        data.consent ? 'YES' : 'NO'
      ];
    });

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);

    try {
      firstRow = sheet.getLastRow() + 1;

      sheet
        .getRange(firstRow, 1, rows.length, HEADERS.length)
        .setValues(rows);
    } finally {
      lock.releaseLock();
    }

    const emailResult = sendConfirmationEmail_(data);

    updateColumn_(
      sheet,
      firstRow,
      rowCount,
      'PDF attached',
      emailResult.pdfAttached ? 'YES' : 'NO'
    );

    updateColumn_(
      sheet,
      firstRow,
      rowCount,
      'Email status',
      'SENT'
    );

    return jsonResponse_({
      ok: true,
      bookingId: data.bookingId
    });
  } catch (error) {
    console.error(error);

    if (sheet && firstRow && rowCount) {
      try {
        updateColumn_(
          sheet,
          firstRow,
          rowCount,
          'Email status',
          'FAILED: ' + String(error.message).slice(0, 150)
        );
      } catch (trackingError) {
        console.error(trackingError);
      }
    }

    return jsonResponse_({
      ok: false,
      error: String(error.message)
    });
  }
}

function validatePayload_(data) {
  if (!data || data.eventId !== CONFIG.eventId) {
    throw new Error('Invalid event ID.');
  }

  if (!/^WA-[A-F0-9]{6}$/.test(String(data.bookingId || ''))) {
    throw new Error('Invalid booking ID.');
  }

  if (!data.contact) {
    throw new Error('Contact details are missing.');
  }

  const contactName = String(data.contact.name || '').trim();
  const contactEmail = String(data.contact.email || '').trim();
  const contactPhone = String(data.contact.phone || '').trim();

  if (!contactName || contactName.length > 100) {
    throw new Error('Invalid contact name.');
  }

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ||
    contactEmail.length > 150
  ) {
    throw new Error('Invalid email address.');
  }

  if (!contactPhone || contactPhone.length > 30) {
    throw new Error('Invalid phone number.');
  }

  if (!data.journey) {
    throw new Error('Journey details are missing.');
  }

  if (
    !Array.isArray(data.passengers) ||
    data.passengers.length < 1 ||
    data.passengers.length > CONFIG.maxPassengers
  ) {
    throw new Error('Invalid passenger count.');
  }

  data.passengers.forEach(function (passenger, index) {
    const name = String(passenger.name || '').trim();
    const age = Number(passenger.age);
    const seat = String(passenger.seat || '').trim();

    if (!name || name.length > 100) {
      throw new Error(
        'Invalid passenger name at position ' + (index + 1)
      );
    }

    if (!Number.isInteger(age) || age < 0 || age > 120) {
      throw new Error(
        'Invalid passenger age at position ' + (index + 1)
      );
    }

    if (!seat || seat.length > 20) {
      throw new Error(
        'Invalid passenger seat at position ' + (index + 1)
      );
    }
  });

  if (!data.consent) {
    throw new Error('Consent is required.');
  }

  if (
    data.pdfBase64 &&
    data.pdfBase64.length > CONFIG.maxPdfBase64Length
  ) {
    throw new Error('PDF attachment is too large.');
  }
}

function getBookingSheet_() {
  const spreadsheetId = PropertiesService
    .getScriptProperties()
    .getProperty('SPREADSHEET_ID');

  if (!spreadsheetId) {
    throw new Error(
      'Spreadsheet is not configured. Run the setup function first.'
    );
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(CONFIG.sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.sheetName);
    sheet
      .getRange(1, 1, 1, HEADERS.length)
      .setValues([HEADERS]);
  }

  return sheet;
}

function sendConfirmationEmail_(data) {
  const additionalRecipients =
    CONFIG.notificationEmail ? 1 : 0;

  const requiredQuota = 1 + additionalRecipients;

  if (MailApp.getRemainingDailyQuota() < requiredQuota) {
    throw new Error('The daily Google email quota has been reached.');
  }

  const attachments = [];
  let pdfAttached = false;

  if (data.pdfBase64) {
    try {
      const pdfBytes = Utilities.base64Decode(data.pdfBase64);

      if (pdfBytes.length <= 8 * 1024 * 1024) {
        attachments.push(
          Utilities.newBlob(
            pdfBytes,
            'application/pdf',
            data.bookingId + '_Boarding_Passes.pdf'
          )
        );

        pdfAttached = true;
      }
    } catch (error) {
      console.error('Could not decode PDF: ' + error.message);
    }
  }

  const calendarFile = createCalendarFile_(data);

  attachments.push(
    Utilities.newBlob(
      calendarFile,
      'text/calendar',
      CONFIG.eventId + '.ics'
    )
  );

  const calendarUrl = createGoogleCalendarUrl_(data);
  const eventDate = Utilities.formatDate(
    new Date(CONFIG.startIso),
    CONFIG.timezone,
    'EEEE, d MMMM yyyy'
  );

  const eventTime = Utilities.formatDate(
    new Date(CONFIG.startIso),
    CONFIG.timezone,
    'h:mm a'
  );

  const passengerRows = data.passengers
    .map(function (passenger) {
      return `
        <tr>
          <td style="padding:10px;border-bottom:1px solid #e4e8ee;">
            ${escapeHtml_(passenger.name)}
          </td>
          <td style="padding:10px;border-bottom:1px solid #e4e8ee;">
            ${escapeHtml_(passenger.age)}
          </td>
          <td style="padding:10px;border-bottom:1px solid #e4e8ee;">
            <strong>${escapeHtml_(passenger.seat)}</strong>
          </td>
        </tr>
      `;
    })
    .join('');

  const htmlBody = `
    <!doctype html>
    <html>
      <body style="margin:0;background:#f1f4f8;font-family:Arial,sans-serif;color:#172033;">
        <div style="max-width:680px;margin:0 auto;padding:24px 12px;">
          <div style="overflow:hidden;border-radius:18px;background:#ffffff;">
            <div style="padding:26px;background:#12233f;color:#ffffff;">
              <div style="font-size:12px;font-weight:bold;letter-spacing:2px;color:#e0b968;">
                WEDDING AIR
              </div>

              <h1 style="margin:10px 0 6px;font-size:28px;">
                Your ceremonial flight is confirmed
              </h1>

              <p style="margin:0;color:#cbd4e1;">
                Booking reference:
                <strong>${escapeHtml_(data.bookingId)}</strong>
              </p>
            </div>

            <div style="padding:26px;">
              <p>
                Dear ${escapeHtml_(data.contact.name)},
              </p>

              <p>
                We are delighted to confirm your booking for
                <strong>${escapeHtml_(CONFIG.eventTitle)}</strong>.
                Your boarding passes are attached to this email.
              </p>

              <div style="margin:22px 0;padding:16px;border-radius:12px;background:#fffaf2;">
                <strong>${escapeHtml_(eventDate)}</strong><br>
                ${escapeHtml_(eventTime)} IST<br>
                ${escapeHtml_(CONFIG.venue)}
              </div>

              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr style="background:#f5f7fa;text-align:left;">
                    <th style="padding:10px;">Passenger</th>
                    <th style="padding:10px;">Age</th>
                    <th style="padding:10px;">Seat</th>
                  </tr>
                </thead>
                <tbody>
                  ${passengerRows}
                </tbody>
              </table>

              <div style="margin-top:24px;">
                <a
                  href="${escapeHtml_(calendarUrl)}"
                  style="display:inline-block;margin:0 8px 8px 0;padding:12px 16px;border-radius:9px;background:#b92335;color:#ffffff;text-decoration:none;font-weight:bold;"
                >
                  Add to Google Calendar
                </a>

                <a
                  href="${escapeHtml_(CONFIG.mapUrl)}"
                  style="display:inline-block;margin:0 8px 8px 0;padding:12px 16px;border-radius:9px;background:#12233f;color:#ffffff;text-decoration:none;font-weight:bold;"
                >
                  View venue map
                </a>
              </div>

              <p style="margin-top:28px;color:#687386;">
                We cannot wait to celebrate with you.<br>
                <strong>${escapeHtml_(CONFIG.couple)}</strong>
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const plainBody = [
    'Your ceremonial flight is confirmed.',
    '',
    'Booking reference: ' + data.bookingId,
    'Event: ' + CONFIG.eventTitle,
    'Date: ' + eventDate,
    'Time: ' + eventTime + ' IST',
    'Venue: ' + CONFIG.venue,
    '',
    'Passengers:',
    data.passengers
      .map(function (passenger) {
        return (
          passenger.name +
          ' — Age ' +
          passenger.age +
          ' — Seat ' +
          passenger.seat
        );
      })
      .join('\n'),
    '',
    'Add to Google Calendar:',
    calendarUrl,
    '',
    'Venue map:',
    CONFIG.mapUrl
  ].join('\n');

  const message = {
    to: data.contact.email,
    subject:
      'Boarding passes confirmed — ' + CONFIG.eventTitle,
    body: plainBody,
    htmlBody: htmlBody,
    attachments: attachments,
    name: CONFIG.senderName
  };

  if (CONFIG.organizerEmail) {
    message.replyTo = CONFIG.organizerEmail;
  }

  if (CONFIG.notificationEmail) {
    message.bcc = CONFIG.notificationEmail;
  }

  MailApp.sendEmail(message);

  return {
    pdfAttached: pdfAttached
  };
}

function createGoogleCalendarUrl_(data) {
  const params = [
    'action=TEMPLATE',
    'text=' + encodeURIComponent(CONFIG.eventTitle),
    'dates=' +
      encodeURIComponent(
        toCalendarDate_(new Date(CONFIG.startIso)) +
        '/' +
        toCalendarDate_(new Date(CONFIG.endIso))
      ),
    'details=' +
      encodeURIComponent(
        CONFIG.flightNumber +
        ' ceremonial flight\nBooking reference: ' +
        data.bookingId
      ),
    'location=' + encodeURIComponent(CONFIG.venue),
    'ctz=' + encodeURIComponent(CONFIG.timezone)
  ];

  return (
    'https://calendar.google.com/calendar/render?' +
    params.join('&')
  );
}

function createCalendarFile_(data) {
  const passengers = data.passengers
    .map(function (passenger) {
      return passenger.name;
    })
    .join(', ');

  const hasOrganizer = Boolean(CONFIG.organizerEmail);
  const method = hasOrganizer ? 'REQUEST' : 'PUBLISH';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wedding Air//Wedding Ceremony//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:' + method,
    'BEGIN:VEVENT',
    'UID:' + data.bookingId + '@wedding-air',
    'DTSTAMP:' + toCalendarDate_(new Date()),
    'DTSTART:' + toCalendarDate_(new Date(CONFIG.startIso)),
    'DTEND:' + toCalendarDate_(new Date(CONFIG.endIso)),
    'SUMMARY:' + escapeIcs_(CONFIG.eventTitle),
    'LOCATION:' + escapeIcs_(CONFIG.venue),
    'DESCRIPTION:' +
      escapeIcs_(
        CONFIG.flightNumber +
        '\nBooking: ' +
        data.bookingId +
        '\nPassengers: ' +
        passengers
      ),
    'STATUS:CONFIRMED',
    'SEQUENCE:0'
  ];

  if (hasOrganizer) {
    lines.push(
      'ORGANIZER;CN="' +
        escapeIcsParameter_(CONFIG.couple) +
        '":mailto:' +
        CONFIG.organizerEmail
    );

    lines.push(
      'ATTENDEE;CN="' +
        escapeIcsParameter_(data.contact.name) +
        '";RSVP=TRUE:mailto:' +
        data.contact.email
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.join('\r\n');
}

function updateColumn_(
  sheet,
  firstRow,
  rowCount,
  headerName,
  value
) {
  const column = HEADERS.indexOf(headerName) + 1;

  if (column < 1) {
    throw new Error('Unknown sheet column: ' + headerName);
  }

  const values = Array.from(
    { length: rowCount },
    function () {
      return [value];
    }
  );

  sheet
    .getRange(firstRow, column, rowCount, 1)
    .setValues(values);
}

function safeSheetText_(value) {
  const text = String(value == null ? '' : value).trim();

  /*
   * Prevent values such as "=IMPORTXML(...)" from being treated as
   * spreadsheet formulas.
   */
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function toCalendarDate_(date) {
  return Utilities.formatDate(
    date,
    'UTC',
    "yyyyMMdd'T'HHmmss'Z'"
  );
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeIcs_(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function escapeIcsParameter_(value) {
  return String(value == null ? '' : value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r?\n/g, ' ');
}

function jsonResponse_(object) {
  return ContentService
    .createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}
