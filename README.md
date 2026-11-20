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
- Icons are generated at deploy time by `tools/make-icons.py`. Logic tests: `node tools/test-staff-core.js`.

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
