using System;
using System.Data;
using System.Threading;
using System.Threading.Tasks;
using EventManagement.Backend.Validation;
using Microsoft.Data.SqlClient;

namespace EventManagement.Backend
{
    /// <summary>
    /// Data access for registrations — refactored from the flawed lab snippet (Task 4).
    ///
    /// Fixes applied:
    ///  1. SQL injection      — the email is sent as a typed parameter (@Email), never concatenated.
    ///  2. Resource leak      — SqlConnection and SqlCommand are wrapped in using blocks, so they are
    ///                          disposed (and the connection returned to the pool) even when an
    ///                          exception is thrown.
    ///  3. Hard-coded secrets — the connection string is injected from configuration, not embedded.
    ///  4. NullReference      — ExecuteScalar() returns null when no row matches; the original called
    ///                          .ToString() on it and crashed. We return null instead.
    ///  5. SELECT *           — ExecuteScalar only reads the first column, so the query names the one
    ///                          column it needs and joins Users, where Email lives in the 3NF schema.
    ///  6. Input validation   — malformed or non-university emails are rejected before any database
    ///                          work (defence in depth; parameterisation is the actual injection fix).
    /// </summary>
    public sealed class RegistrationService
    {
        private const int CommandTimeoutSeconds = 15;

        private const string LatestRegistrationByEmailSql = @"
SELECT TOP (1) r.RegistrationCode
FROM   dbo.Registrations AS r
INNER JOIN dbo.Users     AS u ON u.UserId = r.UserId
WHERE  u.Email = @Email
  AND  r.Status <> 'Cancelled'
ORDER BY r.RegisteredAt DESC;";

        private readonly string _connectionString;

        /// <param name="connectionString">
        /// Read from configuration, e.g. appsettings.json "ConnectionStrings:CampusEvents",
        /// user-secrets, or the CAMPUS_EVENTS_DB environment variable. Never commit it to source control.
        /// </param>
        public RegistrationService(string connectionString)
        {
            if (string.IsNullOrWhiteSpace(connectionString))
                throw new ArgumentException("A connection string is required.", nameof(connectionString));
            _connectionString = connectionString;
        }

        /// <summary>Builds the service from the CAMPUS_EVENTS_DB environment variable.</summary>
        public static RegistrationService FromEnvironment() =>
            new RegistrationService(Environment.GetEnvironmentVariable("CAMPUS_EVENTS_DB")
                ?? throw new InvalidOperationException("Set the CAMPUS_EVENTS_DB environment variable."));

        /// <summary>
        /// Returns the most recent active registration code for a student's email,
        /// or <c>null</c> when that student has no registration.
        /// </summary>
        /// <exception cref="ArgumentException">The email is not a valid @univ.edu.ph address.</exception>
        public string? GetUserRegistration(string inputEmail)
        {
            string email = RequireUniversityEmail(inputEmail);

            using (var conn = new SqlConnection(_connectionString))
            using (var cmd = new SqlCommand(LatestRegistrationByEmailSql, conn))
            {
                cmd.CommandType = CommandType.Text;
                cmd.CommandTimeout = CommandTimeoutSeconds;
                // Typed, sized parameter: SQL Server treats the value strictly as data, and the
                // fixed type/length lets it reuse one cached query plan.
                cmd.Parameters.Add("@Email", SqlDbType.NVarChar, 254).Value = email;

                conn.Open();
                object? result = cmd.ExecuteScalar();
                return result is null || result is DBNull ? null : Convert.ToString(result, System.Globalization.CultureInfo.InvariantCulture);
            } // cmd.Dispose() then conn.Dispose() run here, even on exceptions.
        }

        /// <summary>Async version for ASP.NET Core endpoints, so request threads are not blocked on I/O.</summary>
        public async Task<string?> GetUserRegistrationAsync(string inputEmail, CancellationToken cancellationToken = default)
        {
            string email = RequireUniversityEmail(inputEmail);

            await using (var conn = new SqlConnection(_connectionString))
            await using (var cmd = new SqlCommand(LatestRegistrationByEmailSql, conn))
            {
                cmd.CommandType = CommandType.Text;
                cmd.CommandTimeout = CommandTimeoutSeconds;
                cmd.Parameters.Add("@Email", SqlDbType.NVarChar, 254).Value = email;

                await conn.OpenAsync(cancellationToken).ConfigureAwait(false);
                object? result = await cmd.ExecuteScalarAsync(cancellationToken).ConfigureAwait(false);
                return result is null || result is DBNull ? null : Convert.ToString(result, System.Globalization.CultureInfo.InvariantCulture);
            }
        }

        private static string RequireUniversityEmail(string inputEmail)
        {
            if (!RegistrationValidator.IsUniversityEmail(inputEmail))
                throw new ArgumentException(
                    $"Email must be a valid @{RegistrationValidator.UniversityDomain} address.", nameof(inputEmail));
            return RegistrationValidator.NormalizeEmail(inputEmail);
        }
    }
}
