# Pepper Math Tutor Trust Study

This is an in-person, **adult-only (18+)** research study using Pepper as a robot math tutor. The study runs in a web browser on a local computer and records through psiTurk. It has 3 rounds of up to 5 multiplication questions each.

## Start a recorded study

1. Open Terminal in this project folder.
2. Run `python3 runner.py start` to start the local psiTurk server.
3. Open **http://127.0.0.1:22362/study** in a browser.
4. Hand the device to participant 1. The **first visible screen is consent** (there is no researcher version selector).
5. Once participant 1 has finished or withdrawn, go to **http://127.0.0.1:22362/study** again for participant 2. Each visit creates a **new** participant session and moves the sequence forward automatically, including visits that do not finish.

**Alternating conditions, automatically and persistently:**

- Participant 1 / condition `0`: Pepper **apologizes, explains, and corrects** errors.
- Participant 2 / condition `1`: Pepper **corrects** errors without an apology.
- Participant 3 / condition `0`: apology again; then correction, etc.

The next condition and non-identifying assignment sequence history are stored in the local `participants.db` database (`pepper_sequence` and `pepper_assignment_log` tables). Use `/pepper-health` to verify the last eight assignments without creating a participant. Refreshing an `/exp?...` tab **does not** alternate the condition. It persists when the server restarts. **A fresh visit to `/study` consumes a turn, even if the participant leaves early, so completion counts may not be equal.** Do not refresh `/study` unnecessarily. Participants are told which kind of response Pepper gives in their condition, per the requested study design; that advance disclosure can influence trust ratings.

## What participants see

- Consent, contact details, and anonymous-response notice on one full-width page.
- Demographics: exact adult age (18–110 validation), gender, psiTurk experience, robot experience.
- Video playback check, required sound check (with a replayable spoken sample), then 4 short instruction screens with an image of Pepper.
- Three rounds of 5 multiplication questions. Each round has a **2-minute countdown** for answering. The timer pauses during robot feedback and surveys. When it reaches zero, remaining questions in that round are skipped and the ratings appear; no one is forced to complete all five.
- Pepper reads each question aloud using pre-generated **robot-style synthetic voice clips**. Participants can replay or mute the voice. Audio clips also play during suggestions and feedback. The original proprietary Pepper/NAOqi voice is **not included** because it requires an actual Pepper robot or licensed recordings.
- After each round: the **8-item 2019 MDMT Capacity Trust** measure (Reliable and Capable subscales) with scores **0–7 plus Does not fit**, followed by three study-specific workload ratings (mental demand, effort, time pressure; **not** the complete NASA-TLX).
- Apology recognition check and optional open-ended comments at the end.

Pepper deliberately makes **no error in round 1**, **one in round 2 (question 6)**, and **one in round 3 (question 11)**. All conditions use the same questions, wrong suggestions and worked solutions. Only the apology/repair language differs.

## Save, export, and preview

- Run `python3 runner.py export` to create `questiondata.csv`, `trialdata.csv`, `eventdata.csv` (psiTurk raw exports), plus `jasp_ready.csv`, `trials_ready.csv`, and `study_audit.csv` (analysis tables). The analysis tables use anonymous codes; note that psiTurk's **raw** database/exports can contain internal worker/session IDs.
- The three trust component scores and overall capacity trust score for each round are calculated as **means** of available 0–7 ratings. “Does not fit” is missing, not 0. Timed-out rounds can still be included when the participant finishes the ratings and study.
- For a **no-data** demonstration, open `preview.html`. Its first screen is consent and **it alternates locally on page loads**, independently of real study sessions; it does not write any data. A GitHub Pages preview is also non-recording.
- Run `python3 runner.py stop` to stop the local server. Run `python3 runner.py reset --confirm-reset` **only if you intentionally want to permanently delete the entire recorded database and reset the sequence to apology-first**.
- Never upload `participants.db`, `config.txt`, raw exports or participant comments to GitHub.

## Scientific measure and ethics

MDMT Capacity Trust is the 8-item subset of the **Ullman & Malle (2019)** Multi-Dimensional Measure of Trust: reliable, capable, predictable, skilled, someone you can count on, competent, consistent, meticulous. The 2019 form is used deliberately because that is the published eight-item Capacity Trust subset; MDMT v2 also exists. See [2019 MDMT scale instructions](https://hriscaledatabase.psychology.gmu.edu/assets/pdf/CurrentVersion_MDMT.pdf) and cite Ullman, D. & Malle, B. F. (2019), *Measuring gains and losses in human-robot trust: Evidence for differentiable components of trust*, HRI 2019.

Ask your professor / ethics reviewer to verify the wording "no known risks" and the anonymity claim before collecting data. A two-minute time constraint can cause mild frustration; free-text answers may contain volunteered identifying information and psiTurk may retain technical/session metadata. Do not collect identifying information in feedback. Require age 18+.


## Troubleshooting: `/study` still shows the old experiment

The URL points to whichever program is **already listening on port 22362**.
Starting a new unzipped folder does **not** automatically replace an existing server.

1. Close any old psiTurk Terminal sessions where the server is running (in an interactive psiTurk console type `server off`).
2. Open Terminal in **this updated** `TrustProject_Motasem` folder.
3. Run `python3 runner.py start`. If an old server is still running, the script will **stop with an explicit warning instead of falsely saying it is updated**.
4. If you need the updated project to take over port 22362 in a single operation, run `python3 runner.py replace` from this folder. This replaces the listening server on that port; it **does not delete or transfer data** from any old project folder. Do this only between participants.
5. Open `http://127.0.0.1:22362/pepper-health` and confirm it displays `6.2.0`, then open `/study` in a **new browser tab**. If the page was cached, press Cmd+Shift+R.

**Researcher-only condition checks:** open `preview_apology.html` and `preview_correction.html` directly. Neither saves data or advances the recorded condition sequence. The first question in round 2 (question 6) and round 3 (question 11) deliberately shows Pepper making a mistake. On the apology preview, Pepper explicitly says “I am sorry. I made a mistake.” On the correction preview, he corrects the same mistake without an apology.

**Keep old data:** the old folder's `participants.db` is **not** deleted by `replace`; however the new folder starts a separate database if no database was transferred. If you need continuity, stop all servers and copy the existing database and `config.txt` into the updated folder **before starting** the new server. Back up the originals first.

### Analysis compatibility
The current exporter includes only `study_version = 6.2.0` in `jasp_ready.csv`, since older test sessions used a different mistake position. Older records remain visible in `study_audit.csv` and in the original local psiTurk database; they are not deleted. The CSV identifies each session's study version so that separate study designs are not inadvertently combined.

## Researcher checks (v6.2)

- To view which conditions the server assigned, open `http://127.0.0.1:22362/pepper-health` (does not create a participant). Under `assignment_diagnostics`, the `recent_assignments` list should show 0, 1, 0, 1 for consecutive **new /study visits**. These numbers are NOT shown on participant screens.
- A fresh participant MUST start at `/study`. Chrome refresh, back/forward, or revisiting the previous `/exp?...` URL will reopen the same participant and same condition. The server now issues a sequence number and the participant data records it as `server_assignment_number`.
- Sound check is after video check, before four instruction screens; participants must play the sample and confirm that they heard it. `sound_confirmed=1` is recorded in real sessions, while previews save nothing.
- Keep your existing `config.txt`, `.venv`, and `participants.db` when applying an update to the SAME project folder. `runner.py replace` restarts the server. **Only run `python3 runner.py reset --confirm-reset` after testing, after the server is stopped, and after safeguarding any data you need to retain.**
