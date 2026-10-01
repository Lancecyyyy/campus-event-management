/* =============================================================================
   Online Campus Event Management System — Database DDL
   Target  : Microsoft SQL Server 2016+ / Azure SQL (T-SQL)
   Form    : Third Normal Form (3NF)
   Entities: Users, Categories, Venues, Events, Registrations

   Re-runnable: drops objects in dependency order, then recreates them.
   Run seed.sql afterwards for sample data.
   ============================================================================= */

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF DB_ID(N'CampusEvents') IS NULL
    CREATE DATABASE CampusEvents;
GO

USE CampusEvents;
GO

/* ---------- Drop in reverse dependency order ---------- */
DROP PROCEDURE IF EXISTS dbo.usp_RegisterForEvent;
DROP VIEW      IF EXISTS dbo.vw_EventAttendees;
DROP TABLE     IF EXISTS dbo.Registrations;
DROP TABLE     IF EXISTS dbo.Events;
DROP TABLE     IF EXISTS dbo.Venues;
DROP TABLE     IF EXISTS dbo.Categories;
DROP TABLE     IF EXISTS dbo.Users;
GO

/* =============================================================================
   Users — students and administrators.
   One row per person; email and student number each identify exactly one user.
   ============================================================================= */
CREATE TABLE dbo.Users
(
    UserId          INT IDENTITY(1,1)  NOT NULL,
    Email           NVARCHAR(254)      NOT NULL,
    FullName        NVARCHAR(100)      NOT NULL,
    StudentNumber   CHAR(10)           NULL,          -- e.g. 2023-01234; NULL for admins
    Program         VARCHAR(10)        NULL,
    Role            VARCHAR(10)        NOT NULL CONSTRAINT DF_Users_Role      DEFAULT ('Student'),
    CreatedAt       DATETIME2(0)       NOT NULL CONSTRAINT DF_Users_CreatedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT PK_Users               PRIMARY KEY CLUSTERED (UserId),
    CONSTRAINT UQ_Users_Email         UNIQUE (Email),
    CONSTRAINT CK_Users_Role          CHECK (Role IN ('Student', 'Admin')),
    CONSTRAINT CK_Users_FullName      CHECK (LEN(LTRIM(RTRIM(FullName))) >= 2),
    -- Students must use the university domain; one "@" only; no look-alike suffixes.
    CONSTRAINT CK_Users_Email         CHECK (
        Email LIKE '_%@_%'
        AND Email NOT LIKE '%@%@%'
        AND Email NOT LIKE '% %'
        AND (Role = 'Admin' OR Email LIKE '%_@univ.edu.ph')
    ),
    CONSTRAINT CK_Users_StudentNumber CHECK (
        StudentNumber IS NULL
        OR StudentNumber LIKE '[12][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9]'
    ),
    CONSTRAINT CK_Users_StudentHasNumber CHECK (Role = 'Admin' OR StudentNumber IS NOT NULL),
    CONSTRAINT CK_Users_Program       CHECK (Program IS NULL OR Program IN ('BSIT', 'BSCS', 'BSIS', 'BSEMC'))
);
GO

-- Filtered unique index: student numbers are unique, but many admins may have NULL.
CREATE UNIQUE NONCLUSTERED INDEX UX_Users_StudentNumber
    ON dbo.Users (StudentNumber)
    WHERE StudentNumber IS NOT NULL;
GO

/* =============================================================================
   Categories — lookup table (Career, Workshop, Talk, Competition, Culture).
   Separated from Events so the name is stored once (removes a transitive dependency).
   ============================================================================= */
CREATE TABLE dbo.Categories
(
    CategoryId  TINYINT IDENTITY(1,1) NOT NULL,
    Name        NVARCHAR(40)          NOT NULL,

    CONSTRAINT PK_Categories      PRIMARY KEY CLUSTERED (CategoryId),
    CONSTRAINT UQ_Categories_Name UNIQUE (Name)
);
GO

/* =============================================================================
   Venues — a building/room is described once, not repeated on every event.
   ============================================================================= */
CREATE TABLE dbo.Venues
(
    VenueId     INT IDENTITY(1,1) NOT NULL,
    Name        NVARCHAR(100)     NOT NULL,
    Building    NVARCHAR(100)     NULL,
    MaxCapacity INT               NOT NULL,

    CONSTRAINT PK_Venues             PRIMARY KEY CLUSTERED (VenueId),
    CONSTRAINT UQ_Venues_Name        UNIQUE (Name),
    CONSTRAINT CK_Venues_MaxCapacity CHECK (MaxCapacity BETWEEN 1 AND 20000)
);
GO

/* =============================================================================
   Events
   ============================================================================= */
CREATE TABLE dbo.Events
(
    EventId              INT IDENTITY(1,1) NOT NULL,
    CategoryId           TINYINT           NOT NULL,
    VenueId              INT               NOT NULL,
    CreatedByUserId      INT               NOT NULL,
    Title                NVARCHAR(150)     NOT NULL,
    Description          NVARCHAR(1000)    NULL,
    StartsAt             DATETIMEOFFSET(0) NOT NULL,
    EndsAt               DATETIMEOFFSET(0) NOT NULL,
    RegistrationClosesAt DATETIMEOFFSET(0) NOT NULL,
    Capacity             INT               NOT NULL,
    Status               VARCHAR(12)       NOT NULL CONSTRAINT DF_Events_Status    DEFAULT ('Published'),
    CreatedAt            DATETIME2(0)      NOT NULL CONSTRAINT DF_Events_CreatedAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT PK_Events PRIMARY KEY CLUSTERED (EventId),

    -- Lookups must not disappear while events still point at them.
    CONSTRAINT FK_Events_Categories FOREIGN KEY (CategoryId)
        REFERENCES dbo.Categories (CategoryId) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT FK_Events_Venues FOREIGN KEY (VenueId)
        REFERENCES dbo.Venues (VenueId)        ON DELETE NO ACTION ON UPDATE NO ACTION,
    -- NO ACTION (not CASCADE): Users -> Registrations already cascades, and SQL Server
    -- rejects a second cascade path Users -> Events -> Registrations (error 1785).
    CONSTRAINT FK_Events_CreatedBy FOREIGN KEY (CreatedByUserId)
        REFERENCES dbo.Users (UserId)          ON DELETE NO ACTION ON UPDATE NO ACTION,

    CONSTRAINT CK_Events_Title     CHECK (LEN(LTRIM(RTRIM(Title))) >= 3),
    CONSTRAINT CK_Events_Schedule  CHECK (EndsAt > StartsAt),
    CONSTRAINT CK_Events_Closes    CHECK (RegistrationClosesAt <= StartsAt),
    CONSTRAINT CK_Events_Capacity  CHECK (Capacity BETWEEN 1 AND 20000),
    CONSTRAINT CK_Events_Status    CHECK (Status IN ('Draft', 'Published', 'Cancelled', 'Completed'))
);
GO

/* Non-clustered indexes on every foreign key column (SQL Server does not create them automatically) */
CREATE NONCLUSTERED INDEX IX_Events_CategoryId      ON dbo.Events (CategoryId);
CREATE NONCLUSTERED INDEX IX_Events_VenueId         ON dbo.Events (VenueId);
CREATE NONCLUSTERED INDEX IX_Events_CreatedByUserId ON dbo.Events (CreatedByUserId);
/* Catalog query: upcoming published events, ordered by start time */
CREATE NONCLUSTERED INDEX IX_Events_Status_StartsAt ON dbo.Events (Status, StartsAt)
    INCLUDE (Title, VenueId, CategoryId, Capacity, RegistrationClosesAt);
GO

/* =============================================================================
   Registrations — the many-to-many between Users and Events.
   Holds only facts about the registration itself; name/email live in Users.
   ============================================================================= */
CREATE TABLE dbo.Registrations
(
    RegistrationId   INT IDENTITY(1,1) NOT NULL,
    EventId          INT               NOT NULL,
    UserId           INT               NOT NULL,
    SeatNumber       INT               NOT NULL,
    RegistrationCode VARCHAR(20)       NOT NULL,     -- e.g. KAL-1009-162
    Status           VARCHAR(10)       NOT NULL CONSTRAINT DF_Registrations_Status       DEFAULT ('Confirmed'),
    RegisteredAt     DATETIME2(0)      NOT NULL CONSTRAINT DF_Registrations_RegisteredAt DEFAULT (SYSUTCDATETIME()),

    CONSTRAINT PK_Registrations PRIMARY KEY CLUSTERED (RegistrationId),

    -- Deleting an event or a user removes their registrations.
    CONSTRAINT FK_Registrations_Events FOREIGN KEY (EventId)
        REFERENCES dbo.Events (EventId) ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT FK_Registrations_Users  FOREIGN KEY (UserId)
        REFERENCES dbo.Users (UserId)   ON DELETE CASCADE ON UPDATE NO ACTION,

    CONSTRAINT UQ_Registrations_EventUser UNIQUE (EventId, UserId),        -- one seat per student per event
    CONSTRAINT UQ_Registrations_EventSeat UNIQUE (EventId, SeatNumber),    -- no double-booked seats
    CONSTRAINT UQ_Registrations_EventCode UNIQUE (EventId, RegistrationCode), -- code is derived from the seat, so unique per event
    CONSTRAINT CK_Registrations_Seat      CHECK (SeatNumber >= 1),
    CONSTRAINT CK_Registrations_Status    CHECK (Status IN ('Confirmed', 'Cancelled', 'Attended')),
    CONSTRAINT CK_Registrations_Code      CHECK (RegistrationCode LIKE 'KAL-[0-9][0-9][0-9][0-9]-[0-9][0-9][0-9]%')
);
GO

/* Non-clustered indexes on both foreign key columns */
CREATE NONCLUSTERED INDEX IX_Registrations_EventId ON dbo.Registrations (EventId)
    INCLUDE (UserId, Status, SeatNumber, RegisteredAt);   -- attendee list + seat count
CREATE NONCLUSTERED INDEX IX_Registrations_UserId  ON dbo.Registrations (UserId)
    INCLUDE (EventId, Status);                            -- "my registrations"
GO

/* =============================================================================
   View — attendee list for administrators (joins back the 3NF tables)
   ============================================================================= */
CREATE VIEW dbo.vw_EventAttendees
AS
SELECT  r.RegistrationId,
        r.EventId,
        e.Title          AS EventTitle,
        r.SeatNumber,
        u.FullName,
        u.StudentNumber,
        u.Email,
        u.Program,
        r.Status,
        r.RegisteredAt,
        r.RegistrationCode
FROM    dbo.Registrations AS r
JOIN    dbo.Users         AS u ON u.UserId  = r.UserId
JOIN    dbo.Events        AS e ON e.EventId = r.EventId;
GO

/* =============================================================================
   usp_RegisterForEvent — the only write path for registrations.
   Seat availability is checked and the seat assigned inside one transaction;
   UPDLOCK + HOLDLOCK on the event row serialises concurrent sign-ups so two
   students cannot take the last seat at the same time.
   ============================================================================= */
CREATE PROCEDURE dbo.usp_RegisterForEvent
    @EventId          INT,
    @UserId           INT,
    @RegistrationCode VARCHAR(20) OUTPUT,
    @SeatNumber       INT         OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRANSACTION;

    DECLARE @Capacity INT, @ClosesAt DATETIMEOFFSET(0), @StartsAt DATETIMEOFFSET(0), @Status VARCHAR(12);

    SELECT  @Capacity = Capacity,
            @ClosesAt = RegistrationClosesAt,
            @StartsAt = StartsAt,
            @Status   = Status
    FROM    dbo.Events WITH (UPDLOCK, HOLDLOCK)
    WHERE   EventId = @EventId;

    IF @Capacity IS NULL
        THROW 50001, 'Event not found.', 1;
    IF @Status <> 'Published'
        THROW 50002, 'Event is not open for registration.', 1;
    IF SYSDATETIMEOFFSET() > @ClosesAt
        THROW 50003, 'Registration for this event has closed.', 1;
    IF EXISTS (SELECT 1 FROM dbo.Registrations WHERE EventId = @EventId AND UserId = @UserId)
        THROW 50004, 'This user is already registered for the event.', 1;

    DECLARE @Taken INT =
        (SELECT COUNT(*) FROM dbo.Registrations WHERE EventId = @EventId AND Status <> 'Cancelled');
    IF @Taken >= @Capacity
        THROW 50005, 'The event is full.', 1;

    SET @SeatNumber = ISNULL((SELECT MAX(SeatNumber) FROM dbo.Registrations WHERE EventId = @EventId), 0) + 1;
    -- FORMAT '000' pads to three digits but never truncates (seat 1000 -> "1000")
    SET @RegistrationCode = CONCAT('KAL-', FORMAT(@StartsAt, 'MMdd'), '-', FORMAT(@SeatNumber, '000'));

    INSERT INTO dbo.Registrations (EventId, UserId, SeatNumber, RegistrationCode)
    VALUES (@EventId, @UserId, @SeatNumber, @RegistrationCode);

    COMMIT TRANSACTION;
END;
GO
