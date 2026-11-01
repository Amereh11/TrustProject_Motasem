# TrustProject_Motasem

**Pepper Math Tutor Trust Study** — 15 questions, three rounds, and trust ratings after each round.

- **Condition 0:** Pepper corrects two incorrect suggestions.
- **Condition 1:** Pepper apologizes and corrects those same suggestions.
- **Phase 1 (Q1–5):** no errors. **Phase 2 (Q6–10):** error at Q8. **Phase 3 (Q11–15):** error at Q13.
- Both versions use the same questions, instructions, video, and math explanations. Only the response to Pepper's mistakes differs.

**Practice:** Open `preview.html` and choose a condition; nothing is saved.

**Recorded study (Mac or Linux/Windows WSL):** Open a terminal in this folder, run `python3 runner.py start`, then visit http://127.0.0.1:22362/study. Use the researcher page to alternate conditions. For stop, export, and reset commands, see `TERMINAL_COMMANDS.txt`.

**Data:** The recorded server saves to a local SQLite database. `python3 runner.py export` produces raw CSVs and cleaned JASP tables. Never put participant records, database files, or private config on GitHub. GitHub Pages can show only a non-recording preview, not the psiTurk database study.

**Ethics:** Before recruiting under-18 participants, obtain the required research approval, permission, and assent. This project's checkbox alone does not provide those approvals. Trust items here are study-specific 7-point ratings, not a validated Godspeed scale.
