using System;
using System.Collections.Generic;

namespace EventManagement.Backend.Validation
{
    /// <summary>Read model for an event, as stored in dbo.Events.</summary>
    public sealed record EventInfo(
        int EventId,
        string Title,
        int Capacity,
        DateTimeOffset RegistrationClosesAt,
        string Status);

    /// <summary>What a student submits from the registration form.</summary>
    public sealed record RegistrationRequest(
        int EventId,
        string? FullName,
        string? StudentNumber,
        string? Email);

    /// <summary>Outcome of validating a <see cref="RegistrationRequest"/>.</summary>
    public sealed class ValidationResult
    {
        public ValidationResult(IReadOnlyDictionary<string, string> errors, int? seatsRemaining)
        {
            Errors = errors ?? throw new ArgumentNullException(nameof(errors));
            SeatsRemaining = seatsRemaining;
        }

        /// <summary>Field name to user-facing message. Empty when the request is valid.</summary>
        public IReadOnlyDictionary<string, string> Errors { get; }

        /// <summary>Seats left before this registration, or null when the event was never checked.</summary>
        public int? SeatsRemaining { get; }

        public bool IsValid => Errors.Count == 0;
    }

    /* ---- External dependencies. Tests replace these with Moq mocks. ---- */

    public interface IEventRepository
    {
        EventInfo? GetById(int eventId);
    }

    public interface IRegistrationRepository
    {
        /// <summary>Registrations for the event that are not cancelled.</summary>
        int CountActive(int eventId);

        /// <summary>True when this (already normalised) email holds a seat for the event.</summary>
        bool Exists(int eventId, string normalizedEmail);
    }

    public interface IClock
    {
        DateTimeOffset UtcNow { get; }
    }

    public sealed class SystemClock : IClock
    {
        public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;
    }
}
