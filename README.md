# Weave Connect

Public-facing prototype for mutual offer/need matching, plus **Harvest**:
when something helps one person, Weave checks who else in the network it can help.

**This is a standalone prototype.**
It is completely separate from Weave Time (`weave-route`) and the Medicare Agency CRM.
Live book / PHI stays in Weave CRM. This page uses synthetic people only.

## Live on phones

**https://jeffkickman.github.io/weave-connect/**

Open that link on any phone. Add to Home Screen:
- iPhone: Share → Add to Home Screen
- Android: menu → Add to Home screen / Install app

## Weave Time staff clock (`staff.html`)

**https://jeffkickman.github.io/weave-connect/staff.html** — add it to the Home Screen as its own app ("Weave Time").

- Clock In/Out, Lunch Start/End, Break Start/End; the button always shows the next allowed punch.
- Lunch is unpaid, breaks are paid (constants `LUNCH_PAID` / `BREAK_PAID` at the top of `staff-core.js`).
- GPS on every punch (stored centrally, not shown to employees); onsite = within 250 m of 1510 E Three Notch St, Andalusia. Offsite or no location requires a note.
- Weeks are Sun–Sat, America/Chicago. Weekly hours and 9+ weeks of history are shown on the phone.
- Invite-only sign in (accounts created by Jeff; temporary password must be changed at first login; Change password / Sign out in the header). No self-registration.
- "Punch as guest" for someone who can't sign in: name + identifying note; the punch is flagged GUEST for Jeff to verify.
- Every punch is auto-sent (with retry) to a private Google Sheet via a Google Apps Script web app (`staff-config.js` holds the endpoint URL). Employees see only Onsite / Offsite / Location unavailable.
- While an employee is on the clock and the app is open, it sends a location update about every 3 minutes (the screen says "While you're clocked in, your location is shared with Jeff."). Employees never see coordinates or addresses.
- **Admin view** (accounts with role `admin`, e.g. Jeff): Live (who is on the clock, where, map), Week (hours + CSV download), Timeline (location history per clock-in session, grouped into stops), Punches (edit / void / add a missed punch, all audited), Employees (add, reset password, deactivate, remove, role). Admins don't clock in for real (v6: Test clock only, all TEST).
- **Drivers** (role `driver`): after Clock In a Start Route form appears (route, vehicle, start mileage, packages, totes, overflow / loose bags that did not fit in a tote, stops). An in-progress view keeps Clock / This week / History reachable; End Route has a read-only Starting numbers panel, Back, and Clear form. Miles and a count check are computed; drafts and unsent routes stay on the phone and retry like punches (`driver-core.js`, `driver.js`). Each route is one row in the private Sheet's `Routes` tab; Atlas posts the start/finish text to Chat. TEST routes are labeled TEST, left out of hours/CSV by default, and never posted.
- **Multiple roles per person** (v5): e.g. driver + contractor. Roles: employee, driver, contractor, office, admin, plus any added on the Employees tab. driver = route screens; admin = admin view only (no clock) plus the Test driver tab; every other role clocks in normally. The Week tab and hours CSV show a Roles column and can filter by role (e.g. contractors separately). Employees tab: `admin-people.js`.
- Admin **Routes** tab (today / week, start + finish numbers, post status, CSV, audited edits) and **Test driver** tab (the driver form; everything saved there is TEST) in `admin-routes.js`.
- **v6 — Undelivered packages** (`undelivered.js`): during / at the end of a route the driver takes a photo of each returned package's label; the phone reads the TBA number (Tesseract.js, loaded from a CDN only the first time; `ocr-core.js` holds the parsing). The driver must tick "I checked this TBA against the label" and pick a reason (12 Amazon-style reasons; Other needs a note). Photos are shrunk to 1280 px JPEG and saved in a private Drive folder; rows go to the `Undelivered` tab for Hub disputes (Atlas, with Jeff's approval). Admin **Undelivered** tab: by day / route, photo link, dispute status (`admin-undelivered.js`).
- **v6 — Post to group**: after a route is finished the driver taps Post to group; Atlas (the only Chat writer) then posts the finish text plus the undelivered TBA + reason list. States: Post to group → Queued, Atlas will post it → Posted. TEST routes: button disabled ("Test route, not posted").
- **v6 — Screenshot auto-fill** (`autofill.js`): on Start / End Route, "Upload screenshot to auto-fill" (several images, gallery or camera). Only confident labeled values go into empty fields; they turn yellow and the driver must tick "I reviewed" before submitting. Raw OCR text is shown. Optional: keep the screenshots with the route (private Drive). Each auto-filled submit is logged to the `OcrLearning` tab (auto-filled vs final values, no photos, no location) for tuning; `weave-admin.py ocr-learning` prints correction rates per field. The parser was written without a real Flex screenshot, so expect tuning.
- **v6 — Admin Test clock**: Admin → Test (clock + driver) → Open Test clock gives Jeff the employee clock; every admin punch is stored with `is_test=TRUE` (never payroll, hours, exports or the Live board). "Clear my test punches" deletes only those rows.
- **Test mode (all staff and drivers)**: a Test mode button puts that person in practice mode (persisted on the phone for the session; a new sign-in starts in real mode). A bright orange banner reads "TEST MODE — nothing here is real." Every punch, route, undelivered package and post is saved with `is_test=TRUE` and is excluded from payroll, week hours, Live, Atlas posting and disputes, same as the admin Test clock. Admins stay always-test. Submit buttons are labeled "Submit TEST …". The server honors an explicit `is_test` flag from a non-admin and will not demote a TEST row to real.
- **Receipts:** every signed-in person (all roles) sees a Receipt button and can log a receipt (personal spend for reimbursement included). They choose how it was paid (company card, my own money, or not sure), pick an assigned company card when they have one, and type or confirm the last 4 (or a 5-digit Amex suffix). Confirmation shows a receipt ID; their own receipts list newest first. Test-mode receipts stay out of accounting lists. Optional on-phone OCR may pre-fill amount, date, and merchant when it is sure — those fields are yellow and need an “I reviewed” tick. The `cardholder` role remains in the catalog but no longer gates the form.
- **Undelivered reasons** include "Oversize / overweight (over 50 lb or over size limit)" with Amazon last-mile oversize / special-handling help text (50 lb; 59 × 33 × 33 in or length + girth 130 in; TVs/monitors 40 in+).
- **v7 — Suggest an idea** (`suggestions.js`, `admin-suggest.js`): every signed-in person (employee, driver, contractor, office, admin) has a "Suggest an idea" button in the top bar. Pick a category (Clock, Driver/route, Photos & auto-fill, Hours/history, Other), write up to 1000 characters, optionally attach a screenshot (shrunk on the phone, private Drive folder "Weave Time Suggestions"). "Thanks, sent to Jeff" confirms it; "My past ideas" shows each one's status (new / reviewing / planned / done / declined). Name and email come from the sign-in, not the form; max 10 per person per day. Admin **Suggestions** tab: filter by status / category, set status and an internal note (staff never see the note). Before the server update the draft stays on the phone and the form says "Server update needed".
- Every password field has a Show/Hide toggle (`staff-pw.js`).
- Icons are generated at deploy time by `tools/make-icons.py`. Logic tests: `node tools/test-staff-core.js`, `node tools/test-admin.js`, `node tools/test-driver-core.js`, `node tools/test-ocr-core.js`.

## What it does
- Weave a resource in (program, class, company, need)
- Harvest scans members, agents, and companies
- Member threads go to the **agent of record** — Harvest never calls the member
- Agent and company threads go to that person
- Fit / Maybe / Out scores from structured eligibility

## Lock
See [`docs/WEAVE-CONNECT-HARVEST.md`](docs/WEAVE-CONNECT-HARVEST.md).
Saying: **Weave it once. Use it twice.**
Motto stays: **Woven in. Nothing slips.**

The Loom is still Jeff’s Ask Weave feed. Harvest writes `type=harvest` rows there later. It is not a second Loom.
