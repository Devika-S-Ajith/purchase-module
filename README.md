# Ariel Purchasing Module (CSV-backed prototype)

Self-contained browser prototype for reviewing the exported China-import purchasing data. Open `index.html` directly from disk — **no build step and no local server required**. Planning, simulated receiving and the sample packing-list import are in-memory only; vendor updates are stored in the browser's localStorage for this prototype.

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

- **Dashboard** — four PO-based KPIs: Open POs (including open value), In transit, At risk and Not yet planned. They use the same PO buckets as the coverage bar: Open POs = In transit + Planned + Not yet planned + At risk, while In transit, At risk and Not yet planned match their coverage segments exactly. The full-width Order coverage bar counts each PO once and splits them into Received, In transit, Planned, Not yet planned and At risk; its header also shows how many of the total POs are open. Below it is the Top 8 vendors by open value with a PO-based Received %; “View all vendors” opens the full vendor list.
- **Purchase orders** — defaults to the 2,289 POs with lines. Toggle “Include header-only POs (3,422)” to show the rest, tagged “No line items”. Detail-only POs are tagged “PO header missing” (the files contain **11 distinct POs / 14 lines**, not 14 POs). The KPI cards above the table mirror the dashboard: Open POs, In transit, At risk and Not yet planned. They act as bucket filters (click again to clear); Open POs includes every PO with an open balance, so it also covers Planned POs. The table adds Received %, Planned and Unplanned units per PO; qualifying balances are tagged “At risk”, while other unplanned balances without an open receipt are tagged “Not yet planned”. Units on a shipped container are tagged “In container”. Search PO/vendor/item/description (200 ms debounce), filter status/port/vendor/buyer, sort ETA/PO age/open value/vendor with an ascending/descending toggle, choose 25/50/100 POs per page, and use numbered pagination at the top and bottom of the table. The table scrolls inside its card with a sticky header, and expanded POs paginate their line items 25 at a time, so large POs do not stretch or break the page. Lazy expansion of header fields, shipments and line rows; expanded lines show Received, Planned, In container and Unplanned.
- **Vendors** — all vendors in the current filters, with PO counts, open POs, open value, Received % (the share of POs fully received), Needs action and Next ETA. Select a vendor to open its purchase orders.
- **Shipments** — all 681 receipts, grouped by normalised tracking/container. A container ID is 4 letters + 7 digits after removing a trailing `-W` (445 distinct tracking IDs; 77 shared). Groups are collapsed by default and paginated 20 per page; expand a group to see its receipts. Search covers invoice, PO, vendor and tracking. Status filters use plain labels (“On the way”, “Past ETA”, “No matching PO”). Warehouse “3 (likely)” is an inference from a `-W` suffix when `WHLocation` is blank. The header links to the sample packing-list import.
- **Vendor updates** — capture shipment and other details supplied by vendors: tracking/container, invoice/booking, vessel, ETD/ETA, port, warehouse, cartons, gross weight, CBM, status, source, contact and notes. Select a PO to attach the update; vendor and buyer come from the PO. Reachable from the sidebar, the global “+ Log vendor update” toolbar button on every page, and a button in each expanded PO (which pre-fills the PO and filters the list to it). Entries are browser-local (localStorage), searchable/filterable and can be deleted.
- **Planner** — planning data does **not** exist in the exports. Includes every open Import balance without an open receipt, including remainders of partly received POs. Type a container name/type and add it (40HC 68 CBM, 40ST 58 CBM and 20GP 28 CBM are recognised capacity assumptions), drag or tap-to-assign open lines, snap down to whole cartons using `BoxQty` (a final sub-carton remainder can be planned as a partial block), and warn when CBM or carton data is missing. Search the awaiting lines by vendor, PO or item ID. When a line is dropped or tapped into a container, a quantity dialog asks how many units to add, so a smaller quantity splits one PO line across containers; assigned blocks are labelled B1, B2, … Fill turns red over 100%. Each container has Draft, Booked, Shipped and Arrived status, a sailing date and a port. **Mark as shipped** moves its assigned units from Planned to In transit; **Mark arrived** adds them to Received balances in this session. Shipped and arrived containers are locked and kept when draft/booked planning is cleared. Plans and statuses live only in this session.
- **Receive one receipt (simulated)** — chooses one open matched receipt, pre-fills quantities to the current balance, allows partial quantities, and on confirm updates in-memory balances and marks the receipt received. The receipt CSV has no line quantities.
- **Import packing list** — loads a real sample container/tracking group with 4–6 matched POs (some may already be fully received), generates about 70% of each open line (carton-snapped) as sample shipped quantities, lists every PO and all of its items with total quantity, current balance, quantity on this list, vendor and match type, and applies the lines to this session. The sample is chosen so applying it leaves at-risk remainder balances. It does not read a file, OCR a document or write back to Odoo.
- **Follow-ups** — ordered categories: (1) At risk; (2) Not yet planned; (3) Open balance — already planned; (4) Past ETA; (5) Not shipped yet and Old; (6) Receipts unmatched. Grouped by vendor with open lines/value, balance, planned, unplanned, ETA, days late, PO age and buyer. “Send reminder” logs a mock reminder in the session; the reminder log is shown at the top.

## Rules and assumptions

- **AS_OF is fixed at 2026-11-02** (the export date) for every “days late / in N days” calculation. The UI shows “Data as of 2 Nov 2026”.
- **Segment** values are still derived for diagnostics, but the segment dropdown has been removed because all live shipments are imports; every view shows all segments by default:
  - Import = FOB matches `ningbo|xiamen|shenzhen|shanghai|qingdao|guangzhou|yantian|dalian` (case-insensitive)
  - Domestic/custom = `VendorID` is `ACH` or FOB is `LA`
  - Other = everything else, including blank FOB
- **PO status priority**: No lines → Received (all balances ≤ 0) → Overdue (open receipt ETA < AS_OF) → In transit (open receipt ETA ≥ AS_OF, or some open units are on a Shipped container) → Unshipped balance (balance > 0, at least one received receipt, no open receipt) → Partly received → Not shipped yet (plus “Old” when PO age > 90 days).
- **Planned units** = open balance assigned to a **Draft** or **Booked** container in the Planner. The Planner only offers POs with no open receipt, including partially received POs. One PO line can be split into multiple labelled blocks. Booked is still planned, not in transit.
- **Shipped units** = open units assigned to a **Shipped** container. Marking a container shipped removes those units from Planned and adds them to In transit. Marking it **Arrived** adds them to Received and reduces the PO balance in this session.
- **Unplanned units** = open balance − planned units − shipped units for a PO with no open receipt. **At risk** = open balance > 0, no open receipt, unplanned units > 0, and (PO age > 90 days or the PO has at least one received receipt). All other unplanned open balance is **Not yet planned**; young POs are not At risk just because they have not shipped yet.
- **Order coverage** = Received + In transit + Planned + Not yet planned + At risk. Each PO is counted once, so the five segments add up to the POs in view. At risk takes precedence for a PO with no open receipt and an unplanned balance; In transit covers POs with an open receipt or shipped units; Planned POs have their remaining balance in Draft/Booked containers; remaining open POs are Not yet planned.
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

- No data is invented: container capacities are assumptions (40HC 68 CBM, 40ST 58 CBM, 20GP 28 CBM). The packing-list quantities are generated for the demo. Container statuses, sailing dates, ports and their effect on balances are simulated in this session.
- There is no live Google Sheets, Forms, Odoo or Ariel integration, no OCR/document ingestion, no real email or messaging, no login/roles and no shared persistence. Reminders are logged in the session only. Vendor updates are stored in this browser only (localStorage), so they are not shared across buyers or devices. The CSV exports do not contain container status, sailing date or port; those fields exist only in the Planner prototype and vendor updates.
- Unmatched receipts are never forced onto a PO.
- The sidebar “Back to Ariel Analytics” is a placeholder link.
