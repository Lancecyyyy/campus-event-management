using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace EventManagement.Backend.Validation
{
    /// <summary>
    /// Core business rules for registering a student for a campus event.
    /// Mirrors frontend/js/validation.js so client and server agree.
    /// </summary>
    public sealed class RegistrationValidator
    {
        public const string UniversityDomain = "univ.edu.ph";
        private const int MaxEmailLength = 254;
        private const int MaxNameLength = 100;

        // Timeouts guard against catastrophic backtracking (ReDoS) on hostile input.
        private static readonly Regex EmailPattern = new Regex(
            @"^[a-z0-9._%+-]+@univ\.edu\.ph$",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled,
            TimeSpan.FromMilliseconds(100));

        private static readonly Regex StudentNumberPattern = new Regex(
            @"^(?<year>\d{4})-\d{5}$",
            RegexOptions.CultureInvariant | RegexOptions.Compiled,
            TimeSpan.FromMilliseconds(100));

        private readonly IEventRepository _events;
        private readonly IRegistrationRepository _registrations;
        private readonly IClock _clock;

        public RegistrationValidator(IEventRepository events, IRegistrationRepository registrations, IClock clock)
        {
            _events = events ?? throw new ArgumentNullException(nameof(events));
            _registrations = registrations ?? throw new ArgumentNullException(nameof(registrations));
            _clock = clock ?? throw new ArgumentNullException(nameof(clock));
        }

        /// <summary>Trims and lower-cases (culture-invariant, so no Turkish-I surprises).</summary>
        public static string NormalizeEmail(string? email) =>
            (email ?? string.Empty).Trim().ToLowerInvariant();

        /// <summary>
        /// True only for the exact university domain. Rejects "a@univ.edu.ph.evil.com",
        /// "a@notuniv.edu.ph", "a@cs.univ.edu.ph", "a..b@univ.edu.ph" and ".a@univ.edu.ph".
        /// </summary>
        public static bool IsUniversityEmail(string? email)
        {
            string value = NormalizeEmail(email);
            if (value.Length == 0 || value.Length > MaxEmailLength) return false;
            if (!EmailPattern.IsMatch(value)) return false;

            string local = value.Substring(0, value.LastIndexOf('@'));
            if (local.StartsWith(".", StringComparison.Ordinal) || local.EndsWith(".", StringComparison.Ordinal)) return false;
            if (local.Contains("..", StringComparison.Ordinal)) return false;
            return true;
        }

        /// <summary>True for "2023-01234" style numbers with an entry year from 2000 to the current year.</summary>
        public static bool IsValidStudentNumber(string? studentNumber, int currentYear)
        {
            Match match = StudentNumberPattern.Match((studentNumber ?? string.Empty).Trim());
            if (!match.Success) return false;
            int year = int.Parse(match.Groups["year"].Value, CultureInfo.InvariantCulture);
            return year >= 2000 && year <= currentYear;
        }

        public ValidationResult Validate(RegistrationRequest request)
        {
            if (request is null) throw new ArgumentNullException(nameof(request));

            var errors = new Dictionary<string, string>(StringComparer.Ordinal);
            DateTimeOffset now = _clock.UtcNow;

            // 1. Field checks: cheap, and need no data access.
            string fullName = (request.FullName ?? string.Empty).Trim();
            if (fullName.Length < 2)
                errors["fullName"] = "Enter your full name.";
            else if (fullName.Length > MaxNameLength)
                errors["fullName"] = "Use 100 characters or fewer for your name.";

            if (!IsValidStudentNumber(request.StudentNumber, now.Year))
                errors["studentNumber"] = "Enter your student number as 2023-01234.";

            if (!IsUniversityEmail(request.Email))
                errors["email"] = $"Use your university email ending in @{UniversityDomain}.";

            if (request.EventId <= 0)
                errors["eventId"] = "Choose an event.";

            if (errors.Count > 0)
                return new ValidationResult(errors, seatsRemaining: null);

            // 2. Rules that depend on stored data.
            EventInfo? ev = _events.GetById(request.EventId);
            if (ev is null)
            {
                errors["eventId"] = "That event no longer exists. Choose another one.";
                return new ValidationResult(errors, seatsRemaining: null);
            }

            if (!string.Equals(ev.Status, "Published", StringComparison.Ordinal))
            {
                errors["eventId"] = $"{ev.Title} is not open for registration.";
                return new ValidationResult(errors, seatsRemaining: 0);
            }

            if (now > ev.RegistrationClosesAt)
            {
                errors["eventId"] = $"Registration for {ev.Title} has closed.";
                return new ValidationResult(errors, seatsRemaining: 0);
            }

            int seatsRemaining = Math.Max(0, ev.Capacity - _registrations.CountActive(ev.EventId));
            if (seatsRemaining == 0)
            {
                errors["eventId"] = $"{ev.Title} is full. Pick another event.";
                return new ValidationResult(errors, seatsRemaining: 0);
            }

            if (_registrations.Exists(ev.EventId, NormalizeEmail(request.Email)))
            {
                errors["email"] = $"This email is already registered for {ev.Title}.";
                return new ValidationResult(errors, seatsRemaining);
            }

            return new ValidationResult(errors, seatsRemaining);
        }
    }
}
