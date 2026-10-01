# Kalendaryo — Online Campus Event Management System

Laboratory prototype for *Applied Generative AI for IT Solution Development*. Students browse campus events and register with an `@univ.edu.ph` email; organizers view attendees.

**The full report is in [SUBMISSION.md](SUBMISSION.md)** (Tasks 1–5, team roster, setup, AI disclosure, verification log).

| Folder | Contents |
|---|---|
| `frontend/` | Open `index.html` in a browser. Semantic HTML5, WCAG 2.2 AA, vanilla JS. |
| `database/` | `schema.sql` (3NF DDL), `seed.sql`, `erd.mmd` |
| `backend/` | `RegistrationService.cs` (refactored, injection-safe), `Validation/` |
| `tests/` | xUnit + Moq (`dotnet test tests/EventManagement.Tests`), node:test (`npm test`) |
