/**
 * Unit tests for frontend/js/validation.js
 * Run: node --test tests/frontend/validation.test.js   (Node 18+; no npm install needed)
 *
 * The event store, registration store and clock are mock objects built with
 * node:test's mock.fn(), so no DOM, localStorage or real date is involved.
 */
const { test, describe, mock } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const V = require(path.join(__dirname, "..", "..", "frontend", "js", "validation.js"));

const NOW = new Date("2026-10-01T08:00:00+08:00");

const careerFair = (overrides = {}) => ({
  id: "ev-career-fair",
  title: "IT Career Fair 2026",
  capacity: 200,
  closesAt: "2026-10-08T23:59:00+08:00",
  ...overrides
});

/** Builds mocked dependencies. Every function is a spy we can assert on. */
function makeDeps({ event = careerFair(), taken = 0, exists = false, now = NOW } = {}) {
  return {
    events: { getById: mock.fn(() => event) },
    registrations: {
      countByEvent: mock.fn(() => taken),
      exists: mock.fn(() => exists)
    },
    clock: { now: mock.fn(() => new Date(now.getTime())) }
  };
}

const validInput = (overrides = {}) => ({
  eventId: "ev-career-fair",
  fullName: "Andrea Santos",
  studentNumber: "2023-01234",
  email: "andrea.santos@univ.edu.ph",
  ...overrides
});

describe("isUniversityEmail", () => {
  const accepted = [
    "andrea.santos@univ.edu.ph",
    "ANDREA.SANTOS@UNIV.EDU.PH",
    "  andrea.santos@univ.edu.ph  ",
    "a+events@univ.edu.ph"
  ];
  const rejected = [
    null, "", "andrea@gmail.com",
    "andrea@univ.edu.ph.evil.com",
    "andrea@notuniv.edu.ph",
    "andrea@cs.univ.edu.ph",
    "@univ.edu.ph", ".andrea@univ.edu.ph", "andrea.@univ.edu.ph", "an..drea@univ.edu.ph",
    "a@b@univ.edu.ph",
    "x' OR '1'='1@univ.edu.ph",
    "a".repeat(250) + "@univ.edu.ph"
  ];

  for (const email of accepted) {
    test(`accepts ${JSON.stringify(email)}`, () => assert.equal(V.isUniversityEmail(email), true));
  }
  for (const email of rejected) {
    test(`rejects ${JSON.stringify(email && email.length > 40 ? email.slice(0, 20) + "…" : email)}`, () =>
      assert.equal(V.isUniversityEmail(email), false));
  }
});

describe("isValidStudentNumber", () => {
  const cases = [
    ["2023-01234", true], ["2026-00001", true],
    ["2027-00001", false], ["1999-12345", false], ["2023-0123", false], ["202301234", false]
  ];
  for (const [value, expected] of cases) {
    test(`${value} -> ${expected}`, () => assert.equal(V.isValidStudentNumber(value, NOW), expected));
  }
});

describe("validateRegistration", () => {
  test("valid request passes and reports seats remaining", () => {
    const deps = makeDeps({ taken: 161 });
    const result = V.validateRegistration(validInput(), deps);

    assert.equal(result.valid, true);
    assert.equal(result.seatsRemaining, 39);
    assert.equal(deps.events.getById.mock.callCount(), 1);
    assert.deepEqual(deps.events.getById.mock.calls[0].arguments, ["ev-career-fair"]);
  });

  test("invalid email fails without touching any repository", () => {
    const deps = makeDeps();
    const result = V.validateRegistration(validInput({ email: "andrea@gmail.com" }), deps);

    assert.equal(result.valid, false);
    assert.equal(result.errors.email, "Use your university email ending in @univ.edu.ph.");
    assert.equal(deps.events.getById.mock.callCount(), 0);
    assert.equal(deps.registrations.countByEvent.mock.callCount(), 0);
    assert.equal(deps.registrations.exists.mock.callCount(), 0);
  });

  test("reports every invalid field at once", () => {
    const result = V.validateRegistration({ eventId: "", fullName: " ", studentNumber: "123", email: "nope" }, makeDeps());
    assert.deepEqual(Object.keys(result.errors).sort(), ["email", "eventId", "fullName", "studentNumber"]);
  });

  test("the last seat is still available", () => {
    const deps = makeDeps({ event: careerFair({ capacity: 30 }), taken: 29 });
    const result = V.validateRegistration(validInput(), deps);
    assert.equal(result.valid, true);
    assert.equal(result.seatsRemaining, 1);
  });

  test("a full event is rejected and the duplicate check is skipped", () => {
    const deps = makeDeps({ event: careerFair({ capacity: 80 }), taken: 80 });
    const result = V.validateRegistration(validInput(), deps);

    assert.equal(result.valid, false);
    assert.equal(result.seatsRemaining, 0);
    assert.match(result.errors.eventId, /is full/);
    assert.equal(deps.registrations.exists.mock.callCount(), 0);
  });

  test("a duplicate is rejected using the normalised email", () => {
    const deps = makeDeps({ taken: 10, exists: true });
    const result = V.validateRegistration(validInput({ email: "  Andrea.Santos@UNIV.edu.ph " }), deps);

    assert.equal(result.valid, false);
    assert.equal(result.errors.email, "This email is already registered for IT Career Fair 2026.");
    assert.deepEqual(deps.registrations.exists.mock.calls[0].arguments, ["ev-career-fair", "andrea.santos@univ.edu.ph"]);
  });

  test("registration after the closing time is rejected", () => {
    const deps = makeDeps({ now: new Date("2026-10-09T00:00:01+08:00") });
    const result = V.validateRegistration(validInput(), deps);

    assert.equal(result.valid, false);
    assert.match(result.errors.eventId, /closed/);
    assert.equal(deps.registrations.countByEvent.mock.callCount(), 0);
  });

  test("registration exactly at the closing time is accepted", () => {
    const deps = makeDeps({ now: new Date("2026-10-08T23:59:00+08:00") });
    assert.equal(V.validateRegistration(validInput(), deps).valid, true);
  });

  test("a cancelled event is rejected", () => {
    const deps = makeDeps({ event: careerFair({ status: "Cancelled" }) });
    const result = V.validateRegistration(validInput(), deps);
    assert.equal(result.valid, false);
    assert.equal(deps.registrations.countByEvent.mock.callCount(), 0);
  });

  test("a missing event is rejected", () => {
    const deps = makeDeps({ event: null });
    const result = V.validateRegistration(validInput(), deps);
    assert.equal(result.valid, false);
    assert.equal(result.seatsRemaining, null);
  });
});
