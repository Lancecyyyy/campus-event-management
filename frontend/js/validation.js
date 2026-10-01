/**
 * Registration validation — the core business rules for Kalendaryo.
 *
 * This module is pure: it never touches the DOM, localStorage or the network.
 * Everything external (event lookup, seat counts, duplicate checks, the clock)
 * is passed in as `deps`, so unit tests can swap in mock objects.
 *
 * Mirrors backend/Validation/RegistrationValidator.cs so the browser and the
 * server enforce the same rules.
 *
 * Works in the browser (window.KalendaryoValidation) and in Node (require()).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.KalendaryoValidation = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var UNIVERSITY_DOMAIN = "univ.edu.ph";
  var MAX_EMAIL_LENGTH = 254;
  var MAX_NAME_LENGTH = 100;

  // Local part: letters, digits and . _ % + -   Domain: exactly univ.edu.ph
  var EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@univ\.edu\.ph$/i;
  // Student number: four-digit entry year, hyphen, five digits (2023-01234)
  var STUDENT_NUMBER_PATTERN = /^(\d{4})-\d{5}$/;

  /** Trims and lower-cases an email so "  Ana@UNIV.edu.ph " === "ana@univ.edu.ph". */
  function normalizeEmail(email) {
    return String(email == null ? "" : email).trim().toLowerCase();
  }

  /**
   * True only for addresses on the exact university domain.
   * Rejects look-alikes such as "a@univ.edu.ph.evil.com", "a@notuniv.edu.ph"
   * and "a@cs.univ.edu.ph", plus malformed local parts ("a..b@", ".a@").
   */
  function isUniversityEmail(email) {
    var value = normalizeEmail(email);
    if (value.length === 0 || value.length > MAX_EMAIL_LENGTH) return false;
    if (!EMAIL_PATTERN.test(value)) return false;

    var local = value.slice(0, value.lastIndexOf("@"));
    if (local.charAt(0) === "." || local.charAt(local.length - 1) === ".") return false;
    if (local.indexOf("..") !== -1) return false;
    return true;
  }

  /** True for "2023-01234" style numbers whose entry year is plausible. */
  function isValidStudentNumber(studentNumber, now) {
    var match = STUDENT_NUMBER_PATTERN.exec(String(studentNumber == null ? "" : studentNumber).trim());
    if (!match) return false;
    var year = Number(match[1]);
    var currentYear = (now instanceof Date ? now : new Date()).getFullYear();
    return year >= 2000 && year <= currentYear;
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString("en-PH", { month: "long", day: "numeric" });
    } catch (e) {
      return String(iso);
    }
  }

  /**
   * Validates a registration request.
   *
   * @param {{eventId:string, fullName:string, studentNumber:string, email:string}} input
   * @param {{
   *   events:        { getById(id:string): object|null },
   *   registrations: { countByEvent(id:string): number, exists(eventId:string, email:string): boolean },
   *   clock:         { now(): Date }
   * }} deps
   * @returns {{ valid:boolean, errors:Object<string,string>, seatsRemaining:(number|null) }}
   */
  function validateRegistration(input, deps) {
    var errors = {};
    var data = input || {};
    var now = deps.clock.now();

    // 1. Field checks first. They are cheap and need no data access.
    var fullName = String(data.fullName == null ? "" : data.fullName).trim();
    if (fullName.length < 2) {
      errors.fullName = "Enter your full name.";
    } else if (fullName.length > MAX_NAME_LENGTH) {
      errors.fullName = "Use 100 characters or fewer for your name.";
    }

    if (!isValidStudentNumber(data.studentNumber, now)) {
      errors.studentNumber = "Enter your student number as 2023-01234.";
    }

    if (!isUniversityEmail(data.email)) {
      errors.email = "Use your university email ending in @" + UNIVERSITY_DOMAIN + ".";
    }

    if (!data.eventId) {
      errors.eventId = "Choose an event.";
    }

    // Stop before touching repositories if the basic input is wrong.
    if (Object.keys(errors).length > 0) {
      return { valid: false, errors: errors, seatsRemaining: null };
    }

    // 2. Rules that depend on stored data.
    var event = deps.events.getById(data.eventId);
    if (!event) {
      errors.eventId = "That event no longer exists. Choose another one.";
      return { valid: false, errors: errors, seatsRemaining: null };
    }

    if (event.status && event.status !== "Published") {
      errors.eventId = event.title + " is not open for registration.";
      return { valid: false, errors: errors, seatsRemaining: 0 };
    }

    if (event.closesAt && now.getTime() > new Date(event.closesAt).getTime()) {
      errors.eventId = "Registration for " + event.title + " closed on " + formatDate(event.closesAt) + ".";
      return { valid: false, errors: errors, seatsRemaining: 0 };
    }

    var taken = deps.registrations.countByEvent(event.id);
    var seatsRemaining = Math.max(0, event.capacity - taken);
    if (seatsRemaining <= 0) {
      errors.eventId = event.title + " is full. Pick another event.";
      return { valid: false, errors: errors, seatsRemaining: 0 };
    }

    if (deps.registrations.exists(event.id, normalizeEmail(data.email))) {
      errors.email = "This email is already registered for " + event.title + ".";
      return { valid: false, errors: errors, seatsRemaining: seatsRemaining };
    }

    return { valid: true, errors: {}, seatsRemaining: seatsRemaining };
  }

  return {
    UNIVERSITY_DOMAIN: UNIVERSITY_DOMAIN,
    normalizeEmail: normalizeEmail,
    isUniversityEmail: isUniversityEmail,
    isValidStudentNumber: isValidStudentNumber,
    validateRegistration: validateRegistration
  };
});
