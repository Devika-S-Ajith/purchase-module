# Ariel Purchasing Module (CSV-backed prototype)

Self-contained browser prototype for reviewing the exported China-import purchasing data. Open `index.html` directly from disk — **no build step and no local server required**. Planning, simulated receiving and the sample packing-list import are in-memory only.

## Data sources (exported 2 Nov 2026)

- `PurchPO_202611021053.csv` — 5,700 PO headers
- `PurchPODetail_202611021056.csv` — 12,034 detail lines
- `PurchReceipt_202611021104.csv` — 681 receipt documents

## Building the data bundle

`js/data.js` is generated from the CSVs. Regenerate it after a new export:

```bash
python scripts/build_data.py
```

The script keeps PO numbers and invoice numbers as strings (leading zeros preserved), normalises keys, matches receipts to POs (exact `InvoiceNo = PO`, then one trailing `-<digits>` stripped), derives Import / Domestic-custom / Other segments, normalises purchaser and FOB-port labels for display, excludes the invalid receipt `5131-MAC-3` from ETA logic, and emits a compact string-pooled bundle. `POMemo` is excluded; `Marking` is retained.

## Pages

- **Dashboard** — Open POs, Open PO value, In transit, Past ETA, Arriving in 14 days, Unshipped balance, Open CBM, Planned units and At risk units. The Order coverage bar splits counted ordered units into Received, In transit, Planned and At risk. In transit includes open receipts and containers marked Shipped; Planned is limited to draft/booked containers. Status split, Upcoming ETAs and vendor summary with a reconciling total row.
- **Purchase orders** — defaults to the 2,289 POs with lines. Toggle “Include header-only POs (3,422)” to show the rest, tagged “No line items”. Detail-only POs are tagged “PO header missing” (the files contain **11 distinct POs / 14 lines**, not 14 POs). Attention KPI cards (Past ETA, Unshipped balance, Not shipped yet, In transit, Unplanned balance) sit above the table; the first four act as status filters and the Unplanned balance card opens Follow-ups. The table adds Received %, Planned and Unplanned units per PO; an unplanned balance with no open receipt is tagged “Unplanned balance”, and units on a shipped container are tagged “In container”. Search PO/vendor/item/description (200 ms debounce), filter status/port/segment/vendor/buyer, sort ETA/PO age/open value/vendor with an ascending/descending toggle, choose 25/50/100 rows per page, and use numbered pagination. Lazy expansion of header fields, shipments and line rows; expanded lines show Received, Planned, In container and Unplanned.
- **Shipments** — all 681 receipts, grouped by normalised tracking/container. A container ID is 4 letters + 7 digits after removing a trailing `-W` (445 distinct tracking IDs; 77 shared). Groups are collapsed by default and paginated 20 per page; expand a group to see its receipts. Search covers invoice, PO, vendor and tracking. Status filters use plain labels (“On the way”, “Late”, “No matching PO”). Warehouse “3 (likely)” is an inference from a `-W` suffix when `WHLocation` is blank. The header links to the sample packing-list import.
- **Planner (concept)** — planning data does **not** exist in the exports. Includes every open Import balance without an open receipt, including remainders of partly received POs. Create containers (40HC 68 CBM, 40ST 58 CBM, 20GP 28 CBM — assumptions), drag or tap-to-assign open lines, snap down to whole cartons using `BoxQty` (a final sub-carton remainder can be planned as a partial block), and warn when CBM or carton data is missing. A per-line **Block qty** splits one PO line across containers; assigned blocks are labelled B1, B2, … Fill turns red over 100%. Each container has Draft, Booked, Shipped and Arrived status, a sailing date and a port. **Mark as shipped** moves its assigned units from Planned to In transit, updates PO status and removes them from At risk; **Mark arrived** adds them to Received balances in this session. Shipped and arrived containers are locked and kept when draft/booked planning is cleared. Plans and statuses live only in this session.
- **Receive one receipt (simulated)** — chooses one open matched receipt, pre-fills quantities to the current balance, allows partial quantities, and on confirm updates in-memory balances and marks the receipt received. The receipt CSV has no line quantities.
- **Import packing list (simulated)** — loads a real sample container/tracking group with 4–6 matched POs (some may already be fully received), generates about 70% of each open line (carton-snapped) as sample shipped quantities, shows every PO in the document in one result table, and applies the lines to this session. The sample is chosen so applying it leaves at-risk remainder balances; the page shows balance before/after per PO and per line. It does not read a file, OCR a document or write back to Odoo.
- **Follow-ups** — ordered categories: (1) At risk — not fully planned; (2) Open balance — already planned; (3) Past ETA; (4) Not shipped yet and Old; (5) Receipts unmatched. Grouped by vendor with open lines/value, balance, planned, unplanned, ETA, days late, PO age and buyer. “Send reminder” logs a mock reminder in the session; the reminder log is shown at the top.

## Rules and assumptions

- **AS_OF is fixed at 2026-11-02** (the export date) for every “days late / in N days” calculation. The UI shows “Data as of 2 Nov 2026”.
- **Segment** default is Import:
  - Import = FOB matches `ningbo|xiamen|shenzhen|shanghai|qingdao|guangzhou|yantian|dalian` (case-insensitive)
  - Domestic/custom = `VendorID` is `ACH` or FOB is `LA`
  - Other = everything else, including blank FOB
- **PO status priority**: No lines → Received (all balances ≤ 0) → Overdue (open receipt ETA < AS_OF) → In transit (open receipt ETA ≥ AS_OF, or some open units are on a Shipped container) → Unshipped balance (balance > 0, at least one received receipt, no open receipt) → Partly received → Not shipped yet (plus “Old” when PO age > 90 days).
- **Planned units** = open balance assigned to a **Draft** or **Booked** container in the Planner. The Planner only offers POs with no open receipt, including partially received POs. One PO line can be split into multiple labelled blocks. Booked is still planned, not in transit.
- **Shipped units** = open units assigned to a **Shipped** container. Marking a container shipped removes those units from Planned and adds them to In transit. Marking it **Arrived** adds them to Received and reduces the PO balance in this session.
- **Unplanned balance** = open balance − planned units − shipped units for a PO with no open receipt. **At risk** = balance > 0, no open receipt, and unplanned units > 0. This is the balance the old spreadsheet/email process can lose.
- **Order coverage** = Received + In transit + Planned + At risk. It is counted from non-check PO lines, so the four parts add up to Ordered. In transit includes POs whose open balance is covered by an open receipt, plus units on Shipped containers; planned is limited to Draft/Booked containers; at risk is the remainder that is neither shipped nor planned.
- **ETA** is the earliest ETA among a PO’s open receipts and is never per line.
- **Received qty** = `clamp(ordered − balance, 0, ordered)`. Receipts override the balance when deciding status.
- **Balance anomalies** (balance < 0 or balance > ordered) are tagged “Check data” and excluded from received %.
- **Price** is blank or zero on fee/misc lines; values are labelled “PO value” because no currency is present in the files.
- **Purchaser display aliases**: Vannesa → VannesaM, Susan → SusanG, Jessica → jessicab, Mayra → MayraA. These are marked “assumed duplicate, confirm with client”; raw values remain on hover.
- **Planning quantities** snap down to whole cartons. A final balance smaller than one carton can be planned as a partial block so it is not stranded. The claim that 100% of Import quantities are carton multiples is **not true in these files**: 24 Import lines are not exact multiples and 857 have no `BoxQty`. The planner handles this visibly.

## Code layout

```
index.html               Page shell, toolbar and mount points
css/styles.css           Design tokens, layout, tables, planner and responsive rules
js/data.js               Generated compact CSV bundle (do not edit by hand)
js/app.js                Decoding, derived model, views and interactions
scripts/build_data.py    CSV → js/data.js generator
```

## Notes

- No data is invented: unsupported planning data is clearly labelled as concept/assumption. The packing-list quantities are generated for the demo and labelled “simulated”. Container statuses, sailing dates, ports and their effect on balances are also simulated in this session.
- There is no live Google Sheets, Forms, Odoo or Ariel integration, no OCR/document ingestion, no real email or messaging, no login/roles and no shared persistence. Reminders are logged in the session only. The CSV exports do not contain container status, sailing date or port; those fields exist only in the Planner prototype.
- Unmatched receipts are never forced onto a PO.
- The sidebar “Back to Ariel Analytics” is a placeholder link.
