# Weave Connect — Harvest

**Locked 2026-09-17.**  
**Saying:** Weave it once. Use it twice.  
**Motto stays:** Woven in. Nothing slips.

This is the matcher that sits on top of the book, the agents, and every company woven into Weave.  
When something helps **one** person, Harvest checks whether it can help **anyone else** in the network.

Do not confuse this with **The Loom**.  
The Loom is Jeff’s feed of Ask Weave threads and customization requests (`docs/WEAVE_AI.md` in grok-workspace).  
Harvest *writes rows onto The Loom* (type = `harvest`) so Jeff is never blind. It is not a second Loom.

## Loop
1. A resource becomes known (program, org, grant, vendor, class, partnership, tool, company capability).
2. It is woven in — who it helps, where, eligibility, who must be told.
3. Harvest scans members, agents, and companies already in the weave.
4. Good fits become threads.
5. Member threads go to the **agent of record**. Never around the AOR.
6. Agent / company threads go to that agent or company contact.
7. Outcomes feed LifeWeave so the next scan is smarter.

Same loop the other way: a need shows up → Harvest looks for a woven resource that already solves it.

## AOR gate
Harvest never calls the member, never hands the book to the outside organization, never blasts “you qualify.”  
The AOR gets: who, why they fit, script, refer path. Member consents before anyone else is involved.

## Scores
- Fit — every required rule known and true → ready to call
- Maybe — a required field is missing → ask two questions
- Out — a required rule is known and false → no thread

## Cadence
Immediate on weave-in. On member-record change. Weekly full cloth. Home Terminal / CRM job. No Heavy.

## Build order
1. This lock + prototype page + catalog workbook
2. CRM `/m/connect` queue for the AOR; Loom filter `type=harvest`
3. Weekly job against the real book (age band / county / dual-LIS only in prompts)
4. LifeWeave graph
