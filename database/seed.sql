/* =============================================================================
   Sample data for CampusEvents. Run after schema.sql.
   Times are Philippine Standard Time (+08:00).
   ============================================================================= */
USE CampusEvents;
GO
SET NOCOUNT ON;

INSERT INTO dbo.Categories (Name) VALUES
    (N'Career'), (N'Workshop'), (N'Talk'), (N'Competition'), (N'Culture');

INSERT INTO dbo.Venues (Name, Building, MaxCapacity) VALUES
    (N'University Gymnasium',   N'Gymnasium',      1500),
    (N'IT Building, Room 304',  N'IT Building',      40),
    (N'Audio-Visual Room',      N'Library',         100),
    (N'IT Building, Labs 1 to 3', N'IT Building',   130),
    (N'Main Quadrangle',        NULL,               600),
    (N'Student Center, Hall B', N'Student Center',   60);

INSERT INTO dbo.Users (Email, FullName, StudentNumber, Program, Role) VALUES
    (N'events.office@univ.edu.ph', N'Campus Events Office', NULL,         NULL,    'Admin'),
    (N'andrea.santos@univ.edu.ph', N'Andrea Santos',        '2023-01234', 'BSIT',  'Student'),
    (N'paolo.reyes@univ.edu.ph',   N'Paolo Reyes',          '2022-04821', 'BSCS',  'Student'),
    (N'bea.cruz@univ.edu.ph',      N'Bea Cruz',             '2024-00917', 'BSIS',  'Student'),
    (N'miguel.ocampo@univ.edu.ph', N'Miguel Ocampo',        '2025-11206', 'BSEMC', 'Student');

DECLARE @Admin INT = (SELECT UserId FROM dbo.Users WHERE Role = 'Admin');

INSERT INTO dbo.Events
    (CategoryId, VenueId, CreatedByUserId, Title, Description, StartsAt, EndsAt, RegistrationClosesAt, Capacity)
VALUES
    (1, 1, @Admin, N'IT Career Fair 2026', N'Meet more than 40 companies hiring interns and fresh graduates.',
        '2026-10-09T09:00:00+08:00', '2026-10-09T16:00:00+08:00', '2026-10-08T23:59:00+08:00', 200),
    (2, 2, @Admin, N'UX Clinic: Portfolio Reviews', N'One-on-one portfolio reviews with product designers.',
        '2026-10-14T13:00:00+08:00', '2026-10-14T17:00:00+08:00', '2026-10-13T23:59:00+08:00', 30),
    (3, 3, @Admin, N'Phishing in the Wild: A Security Talk', N'Real phishing emails, taken apart line by line.',
        '2026-10-16T15:00:00+08:00', '2026-10-16T17:00:00+08:00', '2026-10-15T23:59:00+08:00', 80),
    (4, 4, @Admin, N'Hack the Barangay', N'A 24-hour civic hackathon for teams of three or four.',
        '2026-10-24T08:00:00+08:00', '2026-10-25T08:00:00+08:00', '2026-10-20T23:59:00+08:00', 120),
    (5, 5, @Admin, N'Undas Film Night', N'Outdoor screening of Filipino horror classics.',
        '2026-10-29T18:00:00+08:00', '2026-10-29T21:00:00+08:00', '2026-10-29T17:00:00+08:00', 90),
    (2, 6, @Admin, N'Parol-making Workshop', N'Build a five-point star lantern from bamboo and papel de Hapon.',
        '2026-11-20T14:00:00+08:00', '2026-11-20T17:00:00+08:00', '2026-11-18T23:59:00+08:00', 40);

/* Register through the stored procedure so seat and code rules are exercised */
DECLARE @Code VARCHAR(20), @Seat INT;
DECLARE @Andrea INT = (SELECT UserId FROM dbo.Users WHERE Email = N'andrea.santos@univ.edu.ph');
DECLARE @Paolo  INT = (SELECT UserId FROM dbo.Users WHERE Email = N'paolo.reyes@univ.edu.ph');
DECLARE @Bea    INT = (SELECT UserId FROM dbo.Users WHERE Email = N'bea.cruz@univ.edu.ph');

EXEC dbo.usp_RegisterForEvent @EventId = 1, @UserId = @Andrea, @RegistrationCode = @Code OUTPUT, @SeatNumber = @Seat OUTPUT;
EXEC dbo.usp_RegisterForEvent @EventId = 1, @UserId = @Paolo,  @RegistrationCode = @Code OUTPUT, @SeatNumber = @Seat OUTPUT;
EXEC dbo.usp_RegisterForEvent @EventId = 2, @UserId = @Bea,    @RegistrationCode = @Code OUTPUT, @SeatNumber = @Seat OUTPUT;

SELECT * FROM dbo.vw_EventAttendees ORDER BY EventId, SeatNumber;
GO
