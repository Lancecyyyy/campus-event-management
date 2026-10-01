/**
 * Kalendaryo — catalog, registration and organizer views.
 * Vanilla JS, no frameworks, no state-management libraries (Task 1 constraint).
 */
(function () {
  "use strict";

  var V = window.KalendaryoValidation;
  var D = window.KalendaryoData;
  var TZ = "Asia/Manila";
  var STORAGE_KEY = "kalendaryo.registrations.v1";
  var METER_DOTS = 20;

  /* ---------- Clock (overridable for demos: index.html?today=2026-10-01) ---------- */
  var clock = {
    now: (function () {
      var param = new URLSearchParams(window.location.search).get("today");
      if (param && !isNaN(Date.parse(param + "T08:00:00+08:00"))) {
        var fixed = new Date(param + "T08:00:00+08:00");
        return function () { return new Date(fixed.getTime()); };
      }
      return function () { return new Date(); };
    })()
  };

  /* ---------- Repositories (in-browser stand-ins for the backend) ---------- */
  var seedRegistrations = D.buildSeedRegistrations();
  var savedRegistrations = loadSaved();

  function loadSaved() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return []; // Private mode or blocked storage: keep registrations in memory only.
    }
  }

  function persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(savedRegistrations));
    } catch (e) { /* in-memory only */ }
  }

  var events = {
    all: function () {
      return D.EVENTS.slice().sort(function (a, b) { return new Date(a.startsAt) - new Date(b.startsAt); });
    },
    upcoming: function () {
      var now = clock.now().getTime();
      return events.all().filter(function (e) { return new Date(e.endsAt).getTime() > now; });
    },
    getById: function (id) {
      for (var i = 0; i < D.EVENTS.length; i++) if (D.EVENTS[i].id === id) return D.EVENTS[i];
      return null;
    }
  };

  var registrations = {
    all: function () { return seedRegistrations.concat(savedRegistrations); },
    byEvent: function (eventId) {
      return registrations.all().filter(function (r) { return r.eventId === eventId; });
    },
    countByEvent: function (eventId) { return registrations.byEvent(eventId).length; },
    exists: function (eventId, email) {
      var target = V.normalizeEmail(email);
      return registrations.all().some(function (r) {
        return r.eventId === eventId && V.normalizeEmail(r.email) === target;
      });
    },
    add: function (reg) { savedRegistrations.push(reg); persist(); }
  };

  /* ---------- Formatting ---------- */
  function fmt(iso, opts) {
    var o = Object.assign({ timeZone: TZ }, opts);
    return new Intl.DateTimeFormat("en-PH", o).format(new Date(iso));
  }
  function monthShort(iso) { return fmt(iso, { month: "short" }); }
  function dayTwo(iso) { return fmt(iso, { day: "2-digit" }); }
  function weekdayShort(iso) { return fmt(iso, { weekday: "short" }); }
  function timeOf(iso) { return fmt(iso, { hour: "numeric", minute: "2-digit" }); }
  function longDate(iso) { return fmt(iso, { weekday: "long", month: "long", day: "numeric" }); }
  function sameDay(a, b) { return fmt(a, { dateStyle: "short" }) === fmt(b, { dateStyle: "short" }); }

  function timeRange(event) {
    if (sameDay(event.startsAt, event.endsAt)) {
      return timeOf(event.startsAt) + " to " + timeOf(event.endsAt);
    }
    return fmt(event.startsAt, { month: "short", day: "numeric" }) + ", " + timeOf(event.startsAt) +
      " to " + fmt(event.endsAt, { month: "short", day: "numeric" }) + ", " + timeOf(event.endsAt);
  }

  function eventState(event) {
    var taken = registrations.countByEvent(event.id);
    var left = Math.max(0, event.capacity - taken);
    var closed = clock.now().getTime() > new Date(event.closesAt).getTime();
    return { taken: taken, left: left, full: left === 0, closed: closed, open: left > 0 && !closed };
  }

  /* ---------- DOM refs ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var listEl = $("event-list");
  var template = $("event-template");
  var filtersEl = $("filters");
  var form = $("register-form");
  var eventSelect = $("event-select");
  var statusEl = $("form-status");
  var ticket = $("ticket");
  var attendeeSelect = $("attendee-event");
  var attendeeSearch = $("attendee-search");

  var activeCategory = "All";
  var justFilled = null; // { eventId, dotIndex } — animates the seat that was just taken
  var newestCode = null;

  /* ---------- Hero ---------- */
  function renderHero() {
    var next = events.upcoming()[0];
    if (!next) {
      $("hero-when").textContent = "Nothing scheduled yet";
      $("hero-title").textContent = "The calendar is clear for now";
      $("hero-meta").textContent = "New events appear here as soon as organizers publish them.";
      $("hero-cta").hidden = true;
      return;
    }
    // Whole calendar days in Manila time, not 24-hour blocks
    var dayKey = function (d) {
      var parts = {};
      new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date(d)).forEach(function (p) { parts[p.type] = p.value; });
      return Date.UTC(+parts.year, +parts.month - 1, +parts.day);
    };
    var days = Math.round((dayKey(next.startsAt) - dayKey(clock.now())) / 86400000);
    var when = days <= 0 ? "Happening today" : days === 1 ? "Next on campus, tomorrow" : "Next on campus, in " + days + " days";
    $("hero-when").textContent = when;
    $("hero-title").textContent = next.title;
    $("hero-meta").textContent = longDate(next.startsAt) + ", " + timeRange(next) + ". " + next.venue + ".";
    $("hero-month").textContent = monthShort(next.startsAt);
    $("hero-day").textContent = dayTwo(next.startsAt);

    var cta = $("hero-cta");
    var state = eventState(next);
    if (state.open) {
      cta.textContent = "Register for this event";
      cta.setAttribute("href", "#register");
      cta.onclick = function (e) { e.preventDefault(); chooseEvent(next.id, true); };
    } else {
      cta.textContent = "See other events";
      cta.setAttribute("href", "#events");
      cta.onclick = null;
    }
  }

  /* ---------- Filters ---------- */
  function renderFilters() {
    D.CATEGORIES.forEach(function (cat) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.category = cat;
      b.setAttribute("aria-pressed", "false");
      b.textContent = cat;
      filtersEl.appendChild(b);
    });
    filtersEl.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-category]");
      if (!btn) return;
      activeCategory = btn.dataset.category;
      filtersEl.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b === btn));
      });
      renderEvents();
    });
  }

  /* ---------- Event list ---------- */
  function seatMeter(el, event, state) {
    el.textContent = "";
    var filled = Math.round((state.taken / event.capacity) * METER_DOTS);
    if (state.taken > 0 && filled === 0) filled = 1;
    if (!state.full && filled >= METER_DOTS) filled = METER_DOTS - 1;
    if (state.full) filled = METER_DOTS;
    for (var i = 0; i < METER_DOTS; i++) {
      var dot = document.createElement("span");
      dot.className = "seat" + (i < filled ? " is-taken" : "");
      if (justFilled && justFilled.eventId === event.id && i === filled - 1) dot.classList.add("is-new");
      el.appendChild(dot);
    }
    el.classList.toggle("is-full", state.full);
  }

  function renderEvents() {
    listEl.textContent = "";
    var selectedId = eventSelect.value;
    var shown = events.upcoming().filter(function (e) {
      return activeCategory === "All" || e.category === activeCategory;
    });
    $("event-empty").hidden = shown.length > 0;

    shown.forEach(function (event) {
      var node = template.content.cloneNode(true);
      var article = node.querySelector(".event");
      var titleId = event.id + "-title";
      var state = eventState(event);

      article.setAttribute("aria-labelledby", titleId);
      article.dataset.eventId = event.id;
      article.classList.toggle("is-selected", event.id === selectedId);
      article.classList.toggle("is-unavailable", !state.open);

      var time = node.querySelector(".event-date");
      time.setAttribute("datetime", event.startsAt);
      node.querySelector(".event-month").textContent = monthShort(event.startsAt);
      node.querySelector(".event-day").textContent = dayTwo(event.startsAt);
      node.querySelector(".event-weekday").textContent = weekdayShort(event.startsAt);

      var img = node.querySelector(".event-art");
      img.src = event.image;
      img.alt = event.imageAlt;

      node.querySelector(".event-category").textContent = event.category;
      var h = node.querySelector(".event-title");
      h.id = titleId;
      h.textContent = event.title;
      node.querySelector(".event-meta").textContent = timeRange(event) + ", " + event.venue;
      node.querySelector(".event-desc").textContent = event.description;

      seatMeter(node.querySelector(".seat-meter"), event, state);

      var count = node.querySelector(".seat-count");
      if (state.closed) {
        count.textContent = "Registration closed";
      } else if (state.full) {
        count.innerHTML = "Full, all " + event.capacity + " seats taken";
        count.classList.add("is-red");
      } else {
        count.innerHTML = "<strong>" + state.left + "</strong> of " + event.capacity + " seats left";
        if (state.left <= Math.max(5, event.capacity * 0.1)) count.classList.add("is-red");
      }

      var btn = node.querySelector(".event-register");
      btn.setAttribute("aria-label", (state.open ? "Register for " : "Registration unavailable for ") + event.title);
      if (!state.open) {
        btn.disabled = true;
        btn.textContent = state.closed ? "Closed" : "Full";
      } else {
        btn.addEventListener("click", function () { chooseEvent(event.id, true); });
      }

      listEl.appendChild(node);
    });
    justFilled = null;
  }

  /* ---------- Registration form ---------- */
  function renderEventOptions() {
    var current = eventSelect.value;
    eventSelect.textContent = "";
    var placeholder = new Option("Choose an event", "");
    eventSelect.appendChild(placeholder);
    events.upcoming().forEach(function (event) {
      var state = eventState(event);
      var label = event.title + ", " + fmt(event.startsAt, { month: "short", day: "numeric" });
      if (state.closed) label += " (closed)";
      else if (state.full) label += " (full)";
      var opt = new Option(label, event.id);
      opt.disabled = !state.open;
      eventSelect.appendChild(opt);
    });
    if (current) eventSelect.value = current;
  }

  function chooseEvent(id, focusForm) {
    eventSelect.value = id;
    showForm();
    highlightSelected();
    clearError("eventId");
    if (focusForm) {
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      $("register").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      $("full-name").focus({ preventScroll: true });
    }
  }

  function highlightSelected() {
    listEl.querySelectorAll(".event").forEach(function (a) {
      a.classList.toggle("is-selected", a.dataset.eventId === eventSelect.value);
    });
  }

  var fieldIds = { eventId: "event-select", fullName: "full-name", studentNumber: "student-number", email: "email" };

  function clearError(field) {
    var input = $(fieldIds[field]);
    var msg = form.querySelector('[data-error-for="' + field + '"]');
    if (input) input.removeAttribute("aria-invalid");
    if (msg) msg.textContent = "";
  }

  function showErrors(errors) {
    Object.keys(fieldIds).forEach(clearError);
    var first = null;
    Object.keys(fieldIds).forEach(function (field) {
      if (!errors[field]) return;
      var input = $(fieldIds[field]);
      input.setAttribute("aria-invalid", "true");
      form.querySelector('[data-error-for="' + field + '"]').textContent = errors[field];
      if (!first) first = input;
    });
    var n = Object.keys(errors).length;
    statusEl.textContent = n === 1 ? "Fix the highlighted field to continue." : "Fix the " + n + " highlighted fields to continue.";
    statusEl.classList.add("is-error");
    if (first) first.focus();
  }

  form.addEventListener("input", function (e) {
    var name = e.target.name;
    if (name && e.target.getAttribute("aria-invalid") === "true") clearError(name);
  });
  eventSelect.addEventListener("change", highlightSelected);

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    statusEl.textContent = "";
    statusEl.classList.remove("is-error");

    var input = {
      eventId: eventSelect.value,
      fullName: form.fullName.value,
      studentNumber: form.studentNumber.value,
      email: form.email.value,
      program: form.program.value
    };

    var result = V.validateRegistration(input, { events: events, registrations: registrations, clock: clock });
    if (!result.valid) {
      showErrors(result.errors);
      renderEvents(); // seat counts may have changed
      return;
    }

    var event = events.getById(input.eventId);
    var seat = registrations.countByEvent(event.id) + 1;
    var reg = {
      eventId: event.id,
      fullName: input.fullName.trim().replace(/\s+/g, " "),
      studentNumber: input.studentNumber.trim(),
      email: V.normalizeEmail(input.email),
      program: input.program,
      seat: seat,
      code: D.registrationCode(event, seat),
      registeredAt: clock.now().toISOString()
    };
    registrations.add(reg);

    var state = eventState(event);
    justFilled = { eventId: event.id };
    newestCode = reg.code;

    renderEvents();
    renderEventOptions();
    renderHero();
    attendeeSelect.value = event.id;
    renderAttendees();
    printTicket(event, reg);
    $("announcer").textContent = "Registered for " + event.title + ". Seat " + seat + ", code " + reg.code + ". " +
      state.left + (state.left === 1 ? " seat" : " seats") + " left.";
  });

  /* ---------- Ticket ---------- */
  function barcode(el, code) {
    el.textContent = "";
    var h = 2166136261;
    for (var i = 0; i < code.length; i++) { h ^= code.charCodeAt(i); h = Math.imul(h, 16777619); }
    for (var b = 0; b < 46; b++) {
      h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
      var bar = document.createElement("span");
      bar.style.width = (1 + (Math.abs(h) % 3)) + "px";
      bar.style.marginRight = (1 + (Math.abs(h >> 4) % 3)) + "px";
      el.appendChild(bar);
    }
    el.setAttribute("aria-label", "Barcode for registration code " + code);
  }

  function printTicket(event, reg) {
    $("t-event").textContent = event.title;
    $("t-date").textContent = fmt(event.startsAt, { month: "short", day: "numeric", year: "numeric" });
    $("t-time").textContent = timeOf(event.startsAt);
    $("t-venue").textContent = event.venue;
    $("t-name").textContent = reg.fullName;
    $("t-seat").textContent = String(reg.seat).padStart(3, "0");
    $("t-code").textContent = reg.code;
    barcode($("t-barcode"), reg.code);

    form.hidden = true;
    ticket.hidden = false;
    ticket.classList.remove("is-printing");
    void ticket.offsetWidth; // restart the print animation
    ticket.classList.add("is-printing");
    ticket.focus({ preventScroll: true });
  }

  function showForm() {
    if (!ticket.hidden) {
      ticket.hidden = true;
      form.hidden = false;
    }
  }

  $("ticket-again").addEventListener("click", function () {
    var keepEvent = eventSelect.value;
    form.reset();
    renderEventOptions();
    eventSelect.value = eventState(events.getById(keepEvent) || { id: "", capacity: 0, closesAt: 0 }).open ? keepEvent : "";
    showForm();
    statusEl.textContent = "";
    $("announcer").textContent = "";
    $("full-name").focus();
  });

  /* ---------- Attendees (organizer view) ---------- */
  function renderAttendeeOptions() {
    attendeeSelect.textContent = "";
    events.all().forEach(function (event) {
      attendeeSelect.appendChild(new Option(event.title, event.id));
    });
  }

  function currentAttendees() {
    var q = attendeeSearch.value.trim().toLowerCase();
    return registrations.byEvent(attendeeSelect.value)
      .filter(function (r) {
        return !q || r.fullName.toLowerCase().indexOf(q) !== -1 || r.email.indexOf(q) !== -1;
      })
      .sort(function (a, b) { return new Date(b.registeredAt) - new Date(a.registeredAt); });
  }

  function renderAttendees() {
    var event = events.getById(attendeeSelect.value);
    if (!event) return;
    var rows = currentAttendees();
    var total = registrations.countByEvent(event.id);
    var left = Math.max(0, event.capacity - total);

    $("attendee-caption").textContent = "Registered attendees for " + event.title + ", newest first";
    $("attendee-summary").innerHTML = "<strong>" + total + "</strong> registered for " + escapeHtml(event.title) +
      ". " + (left === 0 ? "No seats left." : left + " of " + event.capacity + " seats left.");

    var tbody = $("attendee-rows");
    tbody.textContent = "";
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      if (r.code === newestCode) tr.className = "is-new";
      [String(r.seat).padStart(3, "0"), r.fullName, r.studentNumber, r.email, r.program || "None given",
        fmt(r.registeredAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), r.code]
        .forEach(function (value, i) {
          var cell = document.createElement(i === 1 ? "th" : "td");
          if (i === 1) cell.setAttribute("scope", "row");
          cell.textContent = value;
          tr.appendChild(cell);
        });
      tbody.appendChild(tr);
    });
    $("attendee-empty").hidden = rows.length > 0 || total === 0;
    if (total === 0) {
      $("attendee-empty").hidden = false;
      $("attendee-empty").textContent = "No one has registered yet. Share the event so the first student can save a seat.";
    } else {
      $("attendee-empty").textContent = "No matches. Clear the search to see everyone registered for this event.";
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function csvCell(v) {
    var s = String(v == null ? "" : v);
    // Neutralise spreadsheet formula injection (=, +, -, @) and quote every cell.
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  $("export-csv").addEventListener("click", function () {
    var event = events.getById(attendeeSelect.value);
    var lines = [["Seat", "Name", "Student number", "Email", "Program", "Registered at", "Code"].map(csvCell).join(",")];
    currentAttendees().forEach(function (r) {
      lines.push([r.seat, r.fullName, r.studentNumber, r.email, r.program, r.registeredAt, r.code].map(csvCell).join(","));
    });
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = event.id + "-attendees.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });

  attendeeSelect.addEventListener("change", renderAttendees);
  attendeeSearch.addEventListener("input", renderAttendees);

  /* ---------- Boot ---------- */
  renderFilters();
  renderEventOptions();
  renderHero();
  renderEvents();
  renderAttendeeOptions();
  attendeeSelect.value = (events.upcoming()[0] || events.all()[0]).id;
  renderAttendees();
  document.documentElement.classList.add("is-ready");
})();
