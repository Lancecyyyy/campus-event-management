/**
 * Prototype data for Kalendaryo.
 *
 * Shapes match the SQL schema in /database/schema.sql (Events + Venues +
 * Categories flattened for display, Registrations joined to Users).
 * Sample attendees are generated deterministically so the organizer view
 * has believable data and every reload shows the same people.
 */
(function (root) {
  "use strict";

  var EVENTS = [
    {
      id: "ev-career-fair",
      title: "IT Career Fair 2026",
      category: "Career",
      startsAt: "2026-10-09T09:00:00+08:00",
      endsAt: "2026-10-09T16:00:00+08:00",
      closesAt: "2026-10-08T23:59:00+08:00",
      venue: "University Gymnasium",
      capacity: 200,
      seeded: 161,
      image: "assets/career.svg",
      imageAlt: "Line drawing of a briefcase",
      description: "Meet more than 40 companies hiring interns and fresh graduates. Bring printed copies of your résumé."
    },
    {
      id: "ev-ux-clinic",
      title: "UX Clinic: Portfolio Reviews",
      category: "Workshop",
      startsAt: "2026-10-14T13:00:00+08:00",
      endsAt: "2026-10-14T17:00:00+08:00",
      closesAt: "2026-10-13T23:59:00+08:00",
      venue: "IT Building, Room 304",
      capacity: 30,
      seeded: 27,
      image: "assets/workshop.svg",
      imageAlt: "Line drawing of a pen nib over a rough wireframe sketch",
      description: "Twenty-minute one-on-one reviews with working product designers. Have your portfolio open on a laptop."
    },
    {
      id: "ev-security-talk",
      title: "Phishing in the Wild: A Security Talk",
      category: "Talk",
      startsAt: "2026-10-16T15:00:00+08:00",
      endsAt: "2026-10-16T17:00:00+08:00",
      closesAt: "2026-10-15T23:59:00+08:00",
      venue: "Audio-Visual Room",
      capacity: 80,
      seeded: 80,
      image: "assets/talk.svg",
      imageAlt: "Line drawing of a shield with a padlock in the centre",
      description: "Real phishing emails sent to Philippine schools this year, taken apart line by line, and how to spot the next one."
    },
    {
      id: "ev-hackathon",
      title: "Hack the Barangay",
      category: "Competition",
      startsAt: "2026-10-24T08:00:00+08:00",
      endsAt: "2026-10-25T08:00:00+08:00",
      closesAt: "2026-10-20T23:59:00+08:00",
      venue: "IT Building, Labs 1 to 3",
      capacity: 120,
      seeded: 88,
      image: "assets/competition.svg",
      imageAlt: "Line drawing of an open laptop with a small house on its screen",
      description: "A 24-hour civic hackathon. Teams of three or four build tools that real barangay offices asked for."
    },
    {
      id: "ev-undas-films",
      title: "Undas Film Night",
      category: "Culture",
      startsAt: "2026-10-29T18:00:00+08:00",
      endsAt: "2026-10-29T21:00:00+08:00",
      closesAt: "2026-10-29T17:00:00+08:00",
      venue: "Main Quadrangle",
      capacity: 90,
      seeded: 41,
      image: "assets/culture.svg",
      imageAlt: "Line drawing of a film reel beside a lit candle",
      description: "An outdoor screening of Filipino horror classics before the long weekend. Bring a banig or a mat."
    },
    {
      id: "ev-parol",
      title: "Parol-making Workshop",
      category: "Workshop",
      startsAt: "2026-11-20T14:00:00+08:00",
      endsAt: "2026-11-20T17:00:00+08:00",
      closesAt: "2026-11-18T23:59:00+08:00",
      venue: "Student Center, Hall B",
      capacity: 40,
      seeded: 12,
      image: "assets/parol.svg",
      imageAlt: "Line drawing of a five-pointed star lantern with tassels",
      description: "Build a five-point star lantern from bamboo sticks and papel de Hapon. All materials are provided."
    }
  ];

  var FIRST = ["Andrea", "Paolo", "Bea", "Miguel", "Kyla", "Jerome", "Trisha", "Carlo", "Nicole", "Rafael",
    "Joanna", "Marco", "Hannah", "Gabriel", "Patricia", "Joshua", "Camille", "Adrian", "Denise", "Enzo",
    "Bianca", "Kenneth", "Rica", "Luis", "Alyssa", "Vince", "Mika", "Jericho", "Sofia", "Renz"];
  var LAST = ["Santos", "Reyes", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza", "Torres", "Aquino",
    "Navarro", "Villanueva", "Ramos", "Castillo", "Dela Cruz", "Fernandez", "Manalo", "Pascual", "Soriano",
    "Tolentino", "Salvador", "Lim", "Tan", "Del Rosario", "Gonzales"];
  var PROGRAMS = ["BSIT", "BSCS", "BSIS", "BSEMC"];

  // Small seeded PRNG (mulberry32) so sample data is stable between reloads.
  function prng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function slug(name) {
    return name.toLowerCase().replace(/[^a-z]/g, "");
  }

  function registrationCode(event, seat) {
    var d = new Date(event.startsAt);
    var mm = String(d.getMonth() + 1).padStart(2, "0");
    var dd = String(d.getDate()).padStart(2, "0");
    return "KAL-" + mm + dd + "-" + String(seat).padStart(3, "0");
  }

  function buildSeedRegistrations() {
    var rand = prng(2026);
    var all = [];
    EVENTS.forEach(function (event) {
      var used = {};
      // Registration times are drawn first and sorted, so seat 1 is the earliest sign-up.
      var times = [];
      for (var t = 0; t < event.seeded; t++) {
        times.push(Date.UTC(2026, 8, 1 + Math.floor(rand() * 29), Math.floor(rand() * 14), Math.floor(rand() * 60)));
      }
      times.sort(function (a, b) { return a - b; });
      for (var seat = 1; seat <= event.seeded; seat++) {
        var first = FIRST[Math.floor(rand() * FIRST.length)];
        var last = LAST[Math.floor(rand() * LAST.length)];
        var base = slug(first) + "." + slug(last);
        var email = base + "@univ.edu.ph";
        var n = 2;
        while (used[email]) { email = base + n + "@univ.edu.ph"; n++; }
        used[email] = true;

        var year = 2022 + Math.floor(rand() * 5);
        var studentNumber = year + "-" + String(Math.floor(rand() * 99999)).padStart(5, "0");
        var registeredAt = new Date(times[seat - 1]);

        all.push({
          eventId: event.id,
          fullName: first + " " + last,
          studentNumber: studentNumber,
          email: email,
          program: PROGRAMS[Math.floor(rand() * PROGRAMS.length)],
          seat: seat,
          code: registrationCode(event, seat),
          registeredAt: registeredAt.toISOString()
        });
      }
    });
    return all;
  }

  root.KalendaryoData = {
    EVENTS: EVENTS,
    CATEGORIES: ["Career", "Workshop", "Talk", "Competition", "Culture"],
    PROGRAMS: PROGRAMS,
    buildSeedRegistrations: buildSeedRegistrations,
    registrationCode: registrationCode
  };
})(typeof self !== "undefined" ? self : this);
