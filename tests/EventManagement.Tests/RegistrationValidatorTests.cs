using System;
using System.Linq;
using EventManagement.Backend.Validation;
using Moq;
using Xunit;

namespace EventManagement.Tests
{
    /// <summary>
    /// Unit tests for the registration rules. Every external dependency (event store,
    /// registration store, clock) is a Moq mock, so no database or real time is involved.
    /// </summary>
    public class RegistrationValidatorTests
    {
        private static readonly DateTimeOffset Now = new DateTimeOffset(2026, 10, 1, 8, 0, 0, TimeSpan.FromHours(8));

        private readonly Mock<IEventRepository> _events = new Mock<IEventRepository>(MockBehavior.Strict);
        private readonly Mock<IRegistrationRepository> _registrations = new Mock<IRegistrationRepository>(MockBehavior.Strict);
        private readonly Mock<IClock> _clock = new Mock<IClock>();

        public RegistrationValidatorTests()
        {
            _clock.SetupGet(c => c.UtcNow).Returns(Now);
        }

        private RegistrationValidator CreateSut() =>
            new RegistrationValidator(_events.Object, _registrations.Object, _clock.Object);

        private static EventInfo CareerFair(int capacity = 200, string status = "Published") =>
            new EventInfo(1, "IT Career Fair 2026", capacity,
                new DateTimeOffset(2026, 10, 8, 23, 59, 0, TimeSpan.FromHours(8)), status);

        private static RegistrationRequest ValidRequest(string email = "andrea.santos@univ.edu.ph") =>
            new RegistrationRequest(1, "Andrea Santos", "2023-01234", email);

        /* ------------------------------------------------------------------
           Email domain rule (pure function, no mocks needed)
           ------------------------------------------------------------------ */

        [Theory]
        [InlineData("andrea.santos@univ.edu.ph")]
        [InlineData("ANDREA.SANTOS@UNIV.EDU.PH")]          // case-insensitive
        [InlineData("  andrea.santos@univ.edu.ph  ")]      // surrounding spaces trimmed
        [InlineData("a+events@univ.edu.ph")]
        public void IsUniversityEmail_AcceptsUniversityAddresses(string email)
        {
            Assert.True(RegistrationValidator.IsUniversityEmail(email));
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("andrea@gmail.com")]
        [InlineData("andrea@univ.edu.ph.evil.com")]        // look-alike suffix
        [InlineData("andrea@notuniv.edu.ph")]              // look-alike prefix
        [InlineData("andrea@cs.univ.edu.ph")]              // subdomain
        [InlineData("andrea@univ.edu")]
        [InlineData("@univ.edu.ph")]                       // empty local part
        [InlineData(".andrea@univ.edu.ph")]
        [InlineData("andrea.@univ.edu.ph")]
        [InlineData("an..drea@univ.edu.ph")]
        [InlineData("a@b@univ.edu.ph")]
        [InlineData("x' OR '1'='1@univ.edu.ph")]           // injection payload
        public void IsUniversityEmail_RejectsEverythingElse(string? email)
        {
            Assert.False(RegistrationValidator.IsUniversityEmail(email));
        }

        [Theory]
        [InlineData("2023-01234", true)]
        [InlineData("2026-00001", true)]
        [InlineData("2027-00001", false)]  // future entry year
        [InlineData("1999-12345", false)]
        [InlineData("2023-0123", false)]
        [InlineData("202301234", false)]
        public void IsValidStudentNumber_ChecksFormatAndYear(string value, bool expected)
        {
            Assert.Equal(expected, RegistrationValidator.IsValidStudentNumber(value, currentYear: 2026));
        }

        /* ------------------------------------------------------------------
           Validate(): isolation via mocks
           ------------------------------------------------------------------ */

        [Fact]
        public void Validate_ValidRequest_IsValid_AndReportsSeatsRemaining()
        {
            _events.Setup(e => e.GetById(1)).Returns(CareerFair(capacity: 200));
            _registrations.Setup(r => r.CountActive(1)).Returns(161);
            _registrations.Setup(r => r.Exists(1, "andrea.santos@univ.edu.ph")).Returns(false);

            ValidationResult result = CreateSut().Validate(ValidRequest());

            Assert.True(result.IsValid);
            Assert.Equal(39, result.SeatsRemaining);
            _events.Verify(e => e.GetById(1), Times.Once);
            _registrations.Verify(r => r.CountActive(1), Times.Once);
        }

        [Fact]
        public void Validate_InvalidEmail_FailsWithoutTouchingAnyRepository()
        {
            // Strict mocks with no setups: any repository call would throw.
            ValidationResult result = CreateSut().Validate(ValidRequest(email: "andrea@gmail.com"));

            Assert.False(result.IsValid);
            Assert.Equal("Use your university email ending in @univ.edu.ph.", result.Errors["email"]);
            _events.VerifyNoOtherCalls();
            _registrations.VerifyNoOtherCalls();
        }

        [Fact]
        public void Validate_ReportsEveryInvalidField_AtOnce()
        {
            var request = new RegistrationRequest(0, " ", "123", "nope");

            ValidationResult result = CreateSut().Validate(request);

            string[] fields = result.Errors.Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray();
            Assert.Equal(new[] { "email", "eventId", "fullName", "studentNumber" }, fields);
        }

        [Fact]
        public void Validate_LastSeat_IsStillValid()
        {
            _events.Setup(e => e.GetById(1)).Returns(CareerFair(capacity: 30));
            _registrations.Setup(r => r.CountActive(1)).Returns(29);
            _registrations.Setup(r => r.Exists(1, It.IsAny<string>())).Returns(false);

            ValidationResult result = CreateSut().Validate(ValidRequest());

            Assert.True(result.IsValid);
            Assert.Equal(1, result.SeatsRemaining);
        }

        [Fact]
        public void Validate_FullEvent_IsRejected_AndSkipsDuplicateCheck()
        {
            _events.Setup(e => e.GetById(1)).Returns(CareerFair(capacity: 80));
            _registrations.Setup(r => r.CountActive(1)).Returns(80);

            ValidationResult result = CreateSut().Validate(ValidRequest());

            Assert.False(result.IsValid);
            Assert.Equal(0, result.SeatsRemaining);
            Assert.Contains("is full", result.Errors["eventId"]);
            _registrations.Verify(r => r.Exists(It.IsAny<int>(), It.IsAny<string>()), Times.Never);
        }

        [Fact]
        public void Validate_DuplicateRegistration_IsRejected_UsingNormalisedEmail()
        {
            _events.Setup(e => e.GetById(1)).Returns(CareerFair());
            _registrations.Setup(r => r.CountActive(1)).Returns(10);
            _registrations.Setup(r => r.Exists(1, "andrea.santos@univ.edu.ph")).Returns(true);

            ValidationResult result = CreateSut().Validate(ValidRequest(email: "  Andrea.Santos@UNIV.edu.ph "));

            Assert.False(result.IsValid);
            Assert.Equal("This email is already registered for IT Career Fair 2026.", result.Errors["email"]);
            _registrations.Verify(r => r.Exists(1, "andrea.santos@univ.edu.ph"), Times.Once);
        }

        [Fact]
        public void Validate_AfterRegistrationCloses_IsRejected()
        {
            _clock.SetupGet(c => c.UtcNow).Returns(new DateTimeOffset(2026, 10, 9, 0, 0, 1, TimeSpan.FromHours(8)));
            _events.Setup(e => e.GetById(1)).Returns(CareerFair());

            ValidationResult result = CreateSut().Validate(ValidRequest());

            Assert.False(result.IsValid);
            Assert.Contains("has closed", result.Errors["eventId"]);
            _registrations.VerifyNoOtherCalls();
        }

        [Fact]
        public void Validate_ExactlyAtClosingTime_IsStillAccepted()
        {
            _clock.SetupGet(c => c.UtcNow).Returns(new DateTimeOffset(2026, 10, 8, 23, 59, 0, TimeSpan.FromHours(8)));
            _events.Setup(e => e.GetById(1)).Returns(CareerFair());
            _registrations.Setup(r => r.CountActive(1)).Returns(0);
            _registrations.Setup(r => r.Exists(1, It.IsAny<string>())).Returns(false);

            Assert.True(CreateSut().Validate(ValidRequest()).IsValid);
        }

        [Theory]
        [InlineData("Draft")]
        [InlineData("Cancelled")]
        [InlineData("Completed")]
        public void Validate_UnpublishedEvent_IsRejected(string status)
        {
            _events.Setup(e => e.GetById(1)).Returns(CareerFair(status: status));

            ValidationResult result = CreateSut().Validate(ValidRequest());

            Assert.False(result.IsValid);
            _registrations.VerifyNoOtherCalls();
        }

        [Fact]
        public void Validate_MissingEvent_IsRejected()
        {
            _events.Setup(e => e.GetById(1)).Returns((EventInfo?)null);

            ValidationResult result = CreateSut().Validate(ValidRequest());

            Assert.False(result.IsValid);
            Assert.Null(result.SeatsRemaining);
        }

        [Fact]
        public void Constructor_RejectsNullDependencies()
        {
            Assert.Throws<ArgumentNullException>(() => new RegistrationValidator(null!, _registrations.Object, _clock.Object));
            Assert.Throws<ArgumentNullException>(() => new RegistrationValidator(_events.Object, null!, _clock.Object));
            Assert.Throws<ArgumentNullException>(() => new RegistrationValidator(_events.Object, _registrations.Object, null!));
        }
    }
}
