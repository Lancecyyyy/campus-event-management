# Online Campus Event Management System — Group Laboratory Submission

**Course:** Applied Generative AI for IT Solution Development
**Prototype:** *Kalendaryo* (Filipino for "calendar") — browse campus events, register with a university email, and view attendees as an organizer.

![Event catalog](docs/screenshot-catalog.png)

```
/
├── SUBMISSION.md                  ← this report (Tasks 1–5)
├── README.md
├── package.json                   ← npm test / npm start shortcuts
├── frontend/                      ← Task 2: semantic, accessible UI (no frameworks)
│   ├── index.html
│   ├── css/styles.css
│   ├── js/validation.js           ← shared business rules (pure, testable)
│   ├── js/data.js                 ← prototype data matching the SQL schema
│   ├── js/app.js                  ← catalog, registration, attendee view
│   └── assets/                    ← SVG illustrations + self-hosted fonts (OFL)
├── database/                      ← Task 3
│   ├── schema.sql                 ← 3NF DDL: FKs, CHECKs, non-clustered FK indexes
│   ├── seed.sql
│   └── erd.mmd                    ← Mermaid ERD source
├── backend/                       ← Task 4
│   ├── RegistrationService.cs     ← refactored, injection-safe, disposes resources
│   └── Validation/                ← RegistrationValidator + repository interfaces
├── tests/                         ← Task 4
│   ├── EventManagement.Tests/     ← xUnit + Moq (C#)
│   └── frontend/validation.test.js← node:test + mock.fn (JavaScript)
└── docs/                          ← screenshots and rendered ERD
```
# Online Campus Event Management System — Group Laboratory Submission

---

### 5.1 Team Roster

| Member   | Name | Assigned role | Primary responsibility |
| Member 1 | Afya Mae B. Angeles | Systems Architect & Prompt Lead | Task 1 (Requirements & Prompt Engineering), Task 5 (Documentation & Integration) |
| Member 2 | Lance C. Camba | Frontend Engineer | Task 2 (AI-Assisted UI & WCAG Accessibility) |
| Member 3 | Young Hoon R. Kim | Database & Backend Engineer | Task 3 (3NF Schema, Mermaid ERD, SQL Scripts) |
| Member 4 | Cassey Alfonso M. Canta | QA & Security Engineer | Task 4 (Shift-Left Unit Testing & Vulnerability Refactoring) |


### 5.2 Setup instructions

**Prerequisites:** a modern browser. Optional: Node.js 18+ (JavaScript tests), .NET 8 SDK (C# tests), SQL Server 2016+ or Docker (database).

1. **Get the code**
   ```bash
   git clone https://github.com/Lancecyyyy/campus-event-management.git
   cd campus-event-management
   ```
2. **Run the frontend** — open `frontend/index.html` directly in a browser (double-click works; fonts and images are local, no internet needed). To pin the demo date, append `?today=2026-10-01` to the URL. Or serve it:
   ```bash
   python -m http.server 5173 --directory frontend    # then open http://localhost:5173
   ```
   Registrations made in the browser are saved in that browser's `localStorage`; clear site data to reset.
3. **Create the database**
   ```bash
   # Optional: SQL Server in Docker
   docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=<StrongPassw0rd!>" -p 1433:1433 -d mcr.microsoft.com/mssql/server:2022-latest

   sqlcmd -S localhost -U sa -P "<StrongPassw0rd!>" -C -i database/schema.sql
   sqlcmd -S localhost -U sa -P "<StrongPassw0rd!>" -C -i database/seed.sql
   ```
   Or open both scripts in SSMS / Azure Data Studio and execute `schema.sql` first, then `seed.sql`.
4. **Run the tests**
   ```bash
   npm test                                   # JavaScript validator tests (no install needed)
   dotnet test tests/EventManagement.Tests    # C# xUnit + Moq tests (restores NuGet packages)
   ```
5. **Use the backend service against the database** — set the connection string as an environment variable (never commit it):
   ```bash
   export CAMPUS_EVENTS_DB="Server=localhost;Database=CampusEvents;User Id=sa;Password=<StrongPassw0rd!>;TrustServerCertificate=True"
   ```
   then construct `RegistrationService.FromEnvironment()`.

### 5.3 AI disclosure statement

We used generative AI during this examination as follows:

| Tool | Used for | How the output was verified |
|---|---|---|
| **Claude (Anthropic)** | Task 1 architecture output; first drafts of the frontend (HTML/CSS/JS), the 3NF schema, Mermaid ERD and DDL, the unit tests, and the security diagnosis/refactor; drafting this report. | Every artifact was opened, run or executed: the UI was reviewed in desktop screenshotted; the JavaScript test suite was executed (33/33 passing); the Mermaid ERD was rendered to confirm it parses; the SQL batches were parsed and reviewed constraint by constraint against the 3NF rules; the refactored C# was reviewed line by line.

### 5.4 Group verification log

| Task # | Identified AI flaw / limitation | Manual correction applied | Member responsible |
|---|---|---|---|
| Task 2 | The success message was written into a live region **inside** the form, and the form is hidden on success, so screen readers never announced the registration. | Added a separate `role="status"` announcer outside the form for the success message. | Member 2 |
| Task 2 | The `hidden` attribute did nothing on the form because `.form { display: grid }` overrode it; the form and the ticket showed at the same time. | Added a global `[hidden] { display: none !important; }` rule. | Member 2 |
| Task 2 | axe-core flagged `landmark-unique`: the attendee section and the table's scroll region shared the same accessible name. | Relabelled the table region with the table caption ("Registered attendees for …"). | Member 2 |
| Task 2 | Fonts loaded from Google Fonts with a preload that fails over `file://`, so the page showed fallback fonts offline and logged CORS errors. | Self-hosted the two OFL-licensed fonts in `frontend/assets/fonts` and removed the preload. | Member 2 |
| Task 2 | The hero countdown used 24-hour blocks (`Math.ceil`) and said "in 9 days" for an event 8 calendar days away. | Counted whole calendar days in the Asia/Manila time zone. | Member 2 |
| Task 3 | Registration code used `RIGHT('000' + seat, 3)`, which turns seat 1000 into `000`, and a global `UNIQUE` on the code would collide for two events on the same date. | Switched to `FORMAT(@SeatNumber, '000')` (pads without truncating) and made the code unique per event: `UQ_Registrations_EventCode (EventId, RegistrationCode)`. | Member 3 |
| Task 2 | Generated sample attendees had seat numbers out of order with their sign-up times (seat 7 registered after seat 159), which made the organizer table look wrong. | Sign-up times are generated first and sorted, so seat 1 is always the earliest registration. | Member 2 |
| Task 4 | The suggested test command `node --test tests/frontend` fails on Node 22 ("Cannot find module"): newer Node treats a bare directory argument as a file. | `npm test` now runs `node --test tests/frontend/validation.test.js`; all 33 tests pass. | Member 4 |
| Task 4 | `TreatWarningsAsErrors` in the backend project would turn NuGet security-audit warnings on transitive packages into build failures on the grader's machine. | Removed the flag from `EventManagement.Backend.csproj`; warnings still show, but the build and `dotnet test` are not blocked. | Member 4 |
---

