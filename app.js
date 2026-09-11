'use strict';

/*
 * Update this configuration before publishing.
 *
 * The Google Apps Script configuration must use the same event details.
 */
const CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbxQz9MExeZP7grIwHXypvgx89EvvPgGcyDid8F_-1zTiBgZTedLX5w_JQHPhANkgAu3MA/exec',
  eventId: 'maya-arjun-wedding-2027',

  airline: 'Wedding Air',
  couple: 'Maya & Arjun',
  eventTitle: 'Maya & Arjun — Wedding Ceremony',
  flightNumber: 'WA 500',

  startIso: '2027-01-02T10:30:00+05:30',
  endIso: '2027-01-02T14:30:00+05:30',
  timezone: 'Asia/Kolkata',

  eventDateLong: 'Saturday, 2 January 2027',
  passDate: '02 JAN 2027',
  passDateShort: '02 JAN',
  boardingTime: '10:00 AM',
  ceremonyTime: '10:30 AM IST',

  destinationCode: 'BEK',
  venue: 'Bekal Club, Padannakkad, Kerala',
  mapUrl:
    'https://www.google.com/maps/search/?api=1&query=Bekal+Club+Padannakkad',

  maxPassengers: 6
};

const CABINS = {
  economy: {
    title: 'Celebration Class',
    passTitle: 'CELEBRATION',
    shortTitle: 'CELEBRATION',
    fare: 'Your cherished presence',
    seats: ['18A', '18B', '18C', '18D', '18E', '18F']
  },

  business: {
    title: 'Blessings Class',
    passTitle: 'BLESSINGS',
    shortTitle: 'BLESSINGS',
    fare: 'Warm wishes and prayers',
    seats: ['07A', '07B', '07E', '07F', '07J', '07K']
  },

  first: {
    title: 'Forever First',
    passTitle: 'FOREVER FIRST',
    shortTitle: 'FIRST',
    fare: 'Infinite love and blessings',
    seats: ['01A', '01E', '01F', '01K', '02A', '02K']
  }
};

document.addEventListener('DOMContentLoaded', function () {
  const bookingView = document.getElementById('booking-view');
  const confirmationView = document.getElementById('confirmation-view');
  const bookingForm = document.getElementById('booking-form');

  const contactNameInput = document.getElementById('contact-name');
  const contactEmailInput = document.getElementById('contact-email');
  const contactPhoneInput = document.getElementById('contact-phone');
  const boardingLocationSelect =
    document.getElementById('boarding-location');

  const passengerList = document.getElementById('passenger-list');
  const passengerFormTemplate =
    document.getElementById('passenger-form-template');
  const boardingPassTemplate =
    document.getElementById('boarding-pass-template');

  const addPassengerButton =
    document.getElementById('btn-add-passenger');
  const submitButton = document.getElementById('btn-submit');

  const fareDescription = document.getElementById('fare-description');
  const summaryOriginCode =
    document.getElementById('summary-origin-code');
  const summaryOriginName =
    document.getElementById('summary-origin-name');

  const confirmationTitle =
    document.getElementById('confirmation-title');
  const confirmationReference =
    document.getElementById('confirmation-reference');
  const deliveryStatus =
    document.getElementById('delivery-status');

  const passSwitcher = document.getElementById('pass-switcher');
  const passengerTabs = document.getElementById('passenger-tabs');
  const passIndicator = document.getElementById('pass-indicator');
  const passPages = document.getElementById('pass-pages');

  const previousPassButton =
    document.getElementById('btn-prev-pass');
  const nextPassButton =
    document.getElementById('btn-next-pass');

  const downloadCurrentButton =
    document.getElementById('btn-download-current');
  const downloadAllButton =
    document.getElementById('btn-download-all');
  const printAllButton =
    document.getElementById('btn-print-all');

  const googleCalendarButton =
    document.getElementById('btn-google-calendar');
  const calendarFileButton =
    document.getElementById('btn-calendar-file');
  const newBookingButton =
    document.getElementById('btn-new-booking');

  let passengerSerial = 0;
  let currentPasses = [];
  let currentIndex = 0;
  let currentBooking = null;

  applyConfiguration();
  addPassenger();
  updateJourneySummary();
  updateCabinDescription();

  addPassengerButton.addEventListener('click', function () {
    addPassenger();
  });

  boardingLocationSelect.addEventListener(
    'change',
    updateJourneySummary
  );

  bookingForm.addEventListener('change', function (event) {
    if (event.target.name === 'cabin') {
      updateCabinDescription();
    }
  });

  bookingForm.addEventListener('submit', handleBookingSubmit);

  previousPassButton.addEventListener('click', function () {
    showPass(
      currentIndex === 0
        ? currentPasses.length - 1
        : currentIndex - 1
    );
  });

  nextPassButton.addEventListener('click', function () {
    showPass(
      currentIndex === currentPasses.length - 1
        ? 0
        : currentIndex + 1
    );
  });

  downloadCurrentButton.addEventListener('click', function () {
    runButtonTask(
      downloadCurrentButton,
      'Preparing PDF…',
      async function () {
        try {
          const blob = await createPdf([currentIndex]);

          downloadBlob(
            blob,
            `${currentBooking.bookingId}_${currentPasses[currentIndex].name}.pdf`
          );
        } catch (error) {
          console.error(error);
          window.print();
        }
      }
    );
  });

  downloadAllButton.addEventListener('click', function () {
    runButtonTask(
      downloadAllButton,
      'Preparing PDF…',
      async function () {
        try {
          const indexes = currentPasses.map(function (_, index) {
            return index;
          });

          const blob = await createPdf(indexes);

          downloadBlob(
            blob,
            `${currentBooking.bookingId}_All_Boarding_Passes.pdf`
          );
        } catch (error) {
          console.error(error);
          window.print();
        }
      }
    );
  });

  printAllButton.addEventListener('click', function () {
    window.print();
  });

  calendarFileButton.addEventListener('click', function () {
    if (!currentBooking) return;

    const ics = createCalendarFile(currentBooking);

    downloadBlob(
      new Blob([ics], { type: 'text/calendar;charset=utf-8' }),
      `${CONFIG.eventId}.ics`
    );
  });

  newBookingButton.addEventListener('click', resetBooking);

  function applyConfiguration() {
    document.title = `${CONFIG.couple} | Wedding Air`;

    document
      .querySelectorAll('[data-config]')
      .forEach(function (element) {
        const key = element.dataset.config;

        if (Object.prototype.hasOwnProperty.call(CONFIG, key)) {
          element.textContent = CONFIG[key];
        }
      });

    document
      .querySelectorAll('[data-map-link]')
      .forEach(function (element) {
        element.href = CONFIG.mapUrl;
      });
  }

  function getPassengerCards() {
    return Array.from(
      passengerList.querySelectorAll('.passenger-card')
    );
  }

  function addPassenger(values) {
    const cards = getPassengerCards();

    if (cards.length >= CONFIG.maxPassengers) return;

    const fragment =
      passengerFormTemplate.content.cloneNode(true);
    const card = fragment.querySelector('.passenger-card');

    passengerSerial += 1;
    card.dataset.passengerId = String(passengerSerial);

    const nameInput = card.querySelector('[data-field="name"]');
    const ageInput = card.querySelector('[data-field="age"]');
    const removeButton =
      card.querySelector('.btn-remove-passenger');

    nameInput.id = `passenger-name-${passengerSerial}`;
    ageInput.id = `passenger-age-${passengerSerial}`;

    if (values) {
      nameInput.value = values.name || '';
      ageInput.value = values.age ?? '';
    }

    removeButton.addEventListener('click', function () {
      if (getPassengerCards().length <= 1) return;

      card.remove();
      renumberPassengers();
    });

    passengerList.appendChild(fragment);
    renumberPassengers();
  }

  function renumberPassengers() {
    const cards = getPassengerCards();

    cards.forEach(function (card, index) {
      card.querySelector('.passenger-number').textContent =
        `Passenger ${index + 1}`;

      card.querySelector('.passenger-title').textContent =
        index === 0 ? 'Primary guest' : 'Guest details';

      const removeButton =
        card.querySelector('.btn-remove-passenger');

      removeButton.hidden = cards.length === 1;
      removeButton.setAttribute(
        'aria-label',
        `Remove passenger ${index + 1}`
      );
    });

    addPassengerButton.disabled =
      cards.length >= CONFIG.maxPassengers;
  }

  function updateJourneySummary() {
    const option =
      boardingLocationSelect.options[
        boardingLocationSelect.selectedIndex
      ];

    summaryOriginCode.textContent = option.dataset.code;
    summaryOriginName.textContent = option.textContent.trim();
  }

  function updateCabinDescription() {
    const selected =
      bookingForm.querySelector('input[name="cabin"]:checked');

    const cabin = CABINS[selected.value];
    fareDescription.textContent = cabin.fare;
  }

  async function handleBookingSubmit(event) {
    event.preventDefault();

    if (!bookingForm.reportValidity()) return;

    const honeypot = document.getElementById('website').value;

    if (honeypot) return;

    submitButton.disabled = true;
    submitButton.textContent = 'Preparing passes…';

    try {
      const booking = buildBooking();
      currentBooking = booking;

      renderPasses(booking);
      showConfirmation(booking);

      let pdfBase64 = '';
      let pdfCreated = false;

      try {
        const indexes = currentPasses.map(function (_, index) {
          return index;
        });

        const pdfBlob = await createPdf(indexes);

        /*
         * Keep the request comfortably below Apps Script and email
         * attachment limits.
         */
        if (pdfBlob.size <= 8 * 1024 * 1024) {
          pdfBase64 = await blobToBase64(pdfBlob);
          pdfCreated = true;
        }
      } catch (pdfError) {
        console.error('PDF creation failed:', pdfError);
      }

      deliveryStatus.className = 'delivery-status';
      deliveryStatus.textContent =
        'Sending the booking to Google…';

      const submissionResult = await submitToGoogle(
        booking,
        pdfBase64
      );

      if (submissionResult === 'not-configured') {
        deliveryStatus.className = 'delivery-status warning';
        deliveryStatus.textContent =
          'Passes were created locally. Connect the Google Apps Script URL to enable Sheets and email delivery.';
      } else if (pdfCreated) {
        deliveryStatus.className = 'delivery-status';
        deliveryStatus.textContent =
          `Booking sent to ${booking.contact.email}. Email delivery may take a minute.`;
      } else {
        deliveryStatus.className = 'delivery-status warning';
        deliveryStatus.textContent =
          'The booking was sent, but the PDF attachment could not be generated. You can still print the passes from this page.';
      }
    } catch (error) {
      console.error(error);

      deliveryStatus.className = 'delivery-status error';
      deliveryStatus.textContent =
        'The online submission failed. Please download your passes and contact the host.';
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = 'Confirm booking';
    }
  }

  function buildBooking() {
    const originOption =
      boardingLocationSelect.options[
        boardingLocationSelect.selectedIndex
      ];

    const cabinValue =
      bookingForm.querySelector(
        'input[name="cabin"]:checked'
      ).value;

    const cabin = CABINS[cabinValue];
    const bookingId = createBookingId();

    const passengers = getPassengerCards().map(
      function (card, index) {
        const fullName = card
          .querySelector('[data-field="name"]')
          .value
          .trim()
          .replace(/\s+/g, ' ');

        const age = Number(
          card.querySelector('[data-field="age"]').value
        );

        return {
          passengerNumber: index + 1,
          name: fullName,
          age: age
        };
      }
    );

    const seatOffset =
      hashString(bookingId) % cabin.seats.length;

    const passes = passengers.map(function (passenger, index) {
      return {
        ...passenger,
        seat:
          cabin.seats[
            (seatOffset + index) % cabin.seats.length
          ],
        cabin: cabin.passTitle,
        cabinShort: cabin.shortTitle
      };
    });

    return {
      bookingId: bookingId,
      createdAt: new Date().toISOString(),
      eventId: CONFIG.eventId,

      contact: {
        name: contactNameInput.value.trim(),
        email: contactEmailInput.value.trim().toLowerCase(),
        phone: contactPhoneInput.value.trim()
      },

      journey: {
        origin: originOption.value,
        originCode: originOption.dataset.code,
        cabinCode: cabinValue,
        cabin: cabin.title
      },

      passengers: passes,
      consent: document.getElementById('consent').checked
    };
  }

  function renderPasses(booking) {
    currentPasses = booking.passengers;
    currentIndex = 0;

    passPages.replaceChildren();
    passengerTabs.replaceChildren();

    booking.passengers.forEach(function (passenger, index) {
      const article =
        boardingPassTemplate.content.firstElementChild.cloneNode(
          true
        );

      bindPassValue(article, 'airline', CONFIG.airline);
      bindPassValue(article, 'couple', CONFIG.couple);
      bindPassValue(article, 'name', passenger.name.toUpperCase());
      bindPassValue(article, 'bookingId', booking.bookingId);
      bindPassValue(article, 'origin', booking.journey.origin);
      bindPassValue(
        article,
        'originCode',
        booking.journey.originCode
      );
      bindPassValue(
        article,
        'destinationCode',
        CONFIG.destinationCode
      );
      bindPassValue(
        article,
        'flightNumber',
        CONFIG.flightNumber
      );
      bindPassValue(article, 'eventDate', CONFIG.passDate);
      bindPassValue(
        article,
        'eventDateShort',
        CONFIG.passDateShort
      );
      bindPassValue(
        article,
        'boardingTime',
        CONFIG.boardingTime
      );
      bindPassValue(
        article,
        'ceremonyTime',
        CONFIG.ceremonyTime
      );
      bindPassValue(article, 'cabin', passenger.cabin);
      bindPassValue(
        article,
        'cabinShort',
        passenger.cabinShort
      );
      bindPassValue(article, 'age', `${passenger.age} YRS`);
      bindPassValue(article, 'seat', passenger.seat);
      bindPassValue(article, 'venue', CONFIG.venue);
      bindPassValue(
        article,
        'barcodeText',
        `${CONFIG.flightNumber.replace(/\s/g, '')}-${booking.bookingId}-P${index + 1}`
      );

      article
        .querySelectorAll('[data-pass-map]')
        .forEach(function (link) {
          link.href = CONFIG.mapUrl;
        });

      const page = document.createElement('div');
      page.className = 'pass-page';
      page.dataset.index = String(index);
      page.appendChild(article);
      passPages.appendChild(page);

      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'tab-pill';
      tab.textContent =
        `Pass ${index + 1}: ${passenger.name.split(' ')[0]}`;

      tab.addEventListener('click', function () {
        showPass(index);
      });

      passengerTabs.appendChild(tab);
    });

    passSwitcher.hidden = booking.passengers.length <= 1;
    downloadAllButton.hidden = booking.passengers.length <= 1;

    showPass(0);
  }

  function bindPassValue(root, key, value) {
    root
      .querySelectorAll(`[data-pass="${key}"]`)
      .forEach(function (element) {
        element.textContent = value;
      });
  }

  function showPass(index) {
    if (!currentPasses[index]) return;

    currentIndex = index;

    Array.from(passPages.children).forEach(function (
      page,
      pageIndex
    ) {
      page.classList.toggle('is-active', pageIndex === index);
    });

    Array.from(passengerTabs.children).forEach(function (
      tab,
      tabIndex
    ) {
      tab.classList.toggle('active', tabIndex === index);
    });

    passIndicator.textContent =
      `Pass ${index + 1} of ${currentPasses.length} — ${currentPasses[index].name}`;
  }

  function showConfirmation(booking) {
    confirmationTitle.textContent =
      booking.passengers.length === 1
        ? 'Your boarding pass is ready'
        : `${booking.passengers.length} boarding passes are ready`;

    confirmationReference.textContent = booking.bookingId;

    const calendarUrl = createGoogleCalendarUrl(booking);
    googleCalendarButton.href = calendarUrl;

    bookingView.hidden = true;
    confirmationView.hidden = false;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function createPdf(indexes) {
    if (
      !window.html2canvas ||
      !window.jspdf ||
      !window.jspdf.jsPDF
    ) {
      throw new Error('PDF libraries are unavailable.');
    }

    if (document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }

    const jsPDF = window.jspdf.jsPDF;

    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    for (let pageNumber = 0; pageNumber < indexes.length; pageNumber++) {
      const index = indexes[pageNumber];

      const source = passPages.querySelector(
        `.pass-page[data-index="${index}"] .boarding-pass`
      );

      if (!source) continue;

      const host = document.createElement('div');
      host.className = 'pdf-host';

      const clone = source.cloneNode(true);
      host.appendChild(clone);
      document.body.appendChild(host);

      let canvas;

      try {
        await nextFrame();

        canvas = await window.html2canvas(clone, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: 1200
        });
      } finally {
        host.remove();
      }

      if (pageNumber > 0) {
        pdf.addPage('a4', 'landscape');
      }

      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.setFillColor(241, 244, 248);
      pdf.rect(0, 0, pageWidth, pageHeight, 'F');

      const maximumWidth = pageWidth - 16;
      const maximumHeight = pageHeight - 20;
      const ratio = Math.min(
        maximumWidth / canvas.width,
        maximumHeight / canvas.height
      );

      const imageWidth = canvas.width * ratio;
      const imageHeight = canvas.height * ratio;
      const imageX = (pageWidth - imageWidth) / 2;
      const imageY = (pageHeight - imageHeight) / 2;

      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.94),
        'JPEG',
        imageX,
        imageY,
        imageWidth,
        imageHeight,
        undefined,
        'FAST'
      );
    }

    return pdf.output('blob');
  }

  async function submitToGoogle(booking, pdfBase64) {
    if (
      !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(
        CONFIG.apiUrl
      )
    ) {
      return 'not-configured';
    }

    const payload = {
      eventId: CONFIG.eventId,
      bookingId: booking.bookingId,
      createdAt: booking.createdAt,
      contact: booking.contact,
      journey: booking.journey,
      passengers: booking.passengers.map(function (passenger) {
        return {
          passengerNumber: passenger.passengerNumber,
          name: passenger.name,
          age: passenger.age,
          seat: passenger.seat
        };
      }),
      consent: booking.consent,
      calendarUrl: createGoogleCalendarUrl(booking),
      pdfBase64: pdfBase64,
      honeypot: ''
    };

    /*
     * text/plain avoids an OPTIONS preflight.
     *
     * Apps Script web apps do not provide convenient custom CORS
     * headers, so no-cors is used. This means the browser can confirm
     * that the request was handed off, but cannot read the JSON result.
     */
    await fetch(CONFIG.apiUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    return 'submitted';
  }

  function createGoogleCalendarUrl(booking) {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: CONFIG.eventTitle,
      dates:
        `${toGoogleDate(CONFIG.startIso)}/${toGoogleDate(CONFIG.endIso)}`,
      details:
        `${CONFIG.flightNumber} ceremonial flight\n` +
        `Booking reference: ${booking.bookingId}\n` +
        `Passengers: ${booking.passengers
          .map(function (passenger) {
            return passenger.name;
          })
          .join(', ')}`,
      location: CONFIG.venue,
      ctz: CONFIG.timezone
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function createCalendarFile(booking) {
    const names = booking.passengers
      .map(function (passenger) {
        return passenger.name;
      })
      .join(', ');

    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Wedding Air//Wedding Ceremony//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${booking.bookingId}@wedding-air`,
      `DTSTAMP:${toGoogleDate(new Date().toISOString())}`,
      `DTSTART:${toGoogleDate(CONFIG.startIso)}`,
      `DTEND:${toGoogleDate(CONFIG.endIso)}`,
      `SUMMARY:${escapeIcs(CONFIG.eventTitle)}`,
      `LOCATION:${escapeIcs(CONFIG.venue)}`,
      `DESCRIPTION:${escapeIcs(
        `${CONFIG.flightNumber}\\nBooking: ${booking.bookingId}\\nPassengers: ${names}`
      )}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');
  }

  function resetBooking() {
    bookingForm.reset();
    passengerList.replaceChildren();

    passengerSerial = 0;
    currentPasses = [];
    currentBooking = null;
    currentIndex = 0;

    addPassenger();
    updateJourneySummary();
    updateCabinDescription();

    confirmationView.hidden = true;
    bookingView.hidden = false;

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function createBookingId() {
    let randomPart;

    if (window.crypto && window.crypto.getRandomValues) {
      const bytes = new Uint8Array(3);
      window.crypto.getRandomValues(bytes);

      randomPart = Array.from(bytes)
        .map(function (byte) {
          return byte.toString(16).padStart(2, '0');
        })
        .join('');
    } else {
      randomPart = Math.floor(Math.random() * 16777215)
        .toString(16)
        .padStart(6, '0');
    }

    return `WA-${randomPart.toUpperCase()}`;
  }

  function hashString(value) {
    return Array.from(value).reduce(function (hash, character) {
      return (hash * 31 + character.charCodeAt(0)) >>> 0;
    }, 0);
  }

  function toGoogleDate(value) {
    return new Date(value)
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  }

  function escapeIcs(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\r?\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();

      reader.onload = function () {
        resolve(String(reader.result).split(',')[1]);
      };

      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  async function runButtonTask(button, busyText, task) {
    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = busyText;

    try {
      await task();
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        requestAnimationFrame(resolve);
      });
    });
  }
});