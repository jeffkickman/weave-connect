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

Staff clock / PTO / suggestion box: `staff.html` (local until Time API is wired).

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
