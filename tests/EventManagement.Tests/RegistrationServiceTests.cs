using System;
using EventManagement.Backend;
using Xunit;

namespace EventManagement.Tests
{
    /// <summary>
    /// Guards in the refactored RegistrationService that run before any database work.
    /// The connection string points at a server that does not exist: if a test ever
    /// reached conn.Open(), it would fail, which proves the guard ran first.
    /// Query behaviour against a real database belongs in integration tests.
    /// </summary>
    public class RegistrationServiceTests
    {
        private const string UnreachableDb =
            "Server=tcp:unreachable.invalid,1433;Database=CampusEvents;Integrated Security=false;User Id=x;Password=x;Connect Timeout=1;";

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void Constructor_RequiresConnectionString(string? value)
        {
            Assert.Throws<ArgumentException>(() => new RegistrationService(value!));
        }

        [Theory]
        [InlineData("' OR '1'='1")]
        [InlineData("x'; DROP TABLE Registrations; --")]
        [InlineData("andrea@univ.edu.ph' --")]
        [InlineData("andrea@gmail.com")]
        public void GetUserRegistration_RejectsHostileOrForeignEmail_BeforeOpeningConnection(string email)
        {
            var service = new RegistrationService(UnreachableDb);

            var ex = Assert.Throws<ArgumentException>(() => service.GetUserRegistration(email));
            Assert.Equal("inputEmail", ex.ParamName);
        }

        [Fact]
        public async System.Threading.Tasks.Task GetUserRegistrationAsync_RejectsHostileEmail_BeforeOpeningConnection()
        {
            var service = new RegistrationService(UnreachableDb);

            await Assert.ThrowsAsync<ArgumentException>(() => service.GetUserRegistrationAsync("' OR 1=1 --"));
        }
    }
}
