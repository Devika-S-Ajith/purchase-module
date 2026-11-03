# Ariel Purchasing Module (CSV-backed prototype)

Self-contained browser prototype for reviewing the exported China-import purchasing data. Open `index.html` directly from disk — **no build step and no local server required**. Planning and simulated receiving are in-memory only.

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

- **Dashboard** — Open POs, Open PO value, In transit, Past ETA, Arriving in 14 days, Unshipped balance, Open CBM. Status split, Upcoming ETAs, vendor summary with a reconciling total row, and export coverage.
- **Purchase orders** — defaults to the 2,289 POs with lines. Toggle “Include header-only POs (3,422)” to show the rest, tagged “No line items”. Detail-only POs are tagged “PO header missing” (the files contain **11 distinct POs / 14 lines**, not 14 POs). Attention KPI cards (Past ETA, Unshipped balance, Not shipped yet, In transit) sit above the table and act as status filters. Search PO/vendor/item/description (200 ms debounce), filter status/port/segment/vendor/buyer, sort ETA/PO age/open value/vendor with an ascending/descending toggle, choose 25/50/100 rows per page, and use numbered pagination. Lazy expansion of header fields, shipments and line rows.
- **Shipments** — all 681 receipts, grouped by normalised tracking/container. A container ID is 4 letters + 7 digits after removing a trailing `-W` (445 distinct tracking IDs; 77 shared). Groups are collapsed by default and paginated 20 per page; expand a group to see its receipts. Search covers invoice, PO, vendor and tracking. Status filters use plain labels (“On the way”, “Late”, “No matching PO”). Warehouse “3 (likely)” is an inference from a `-W` suffix when `WHLocation` is blank.
- **Planner (concept)** — planning data does **not** exist in the exports. Create containers (40HC 68 CBM, 40ST 58 CBM, 20GP 28 CBM — assumptions), drag or tap-to-assign open Import lines with no receipt, snap down to whole cartons using `BoxQty`, and warn when CBM or carton data is missing. Fill turns red over 100%; plans live only in this session.
- **Receive (simulated)** — chooses an open matched receipt, pre-fills quantities to the current balance, allows partial quantities, and on confirm updates in-memory balances and marks the receipt received. Remaining balance then appears in Follow-ups as “Open balance — no shipment”. The receipt CSV has no line quantities.
- **Follow-ups** — ordered categories: (1) Open balance — no shipment; (2) Past ETA; (3) Not shipped yet and Old; (4) Receipts unmatched. Grouped by vendor with open lines/value, ETA, days late, PO age and buyer. “Send reminder” is a prototype action.

## Rules and assumptions

- **AS_OF is fixed at 2026-11-02** (the export date) for every “days late / in N days” calculation. The UI shows “Data as of 2 Nov 2026”.
- **Segment** default is Import:
  - Import = FOB matches `ningbo|xiamen|shenzhen|shanghai|qingdao|guangzhou|yantian|dalian` (case-insensitive)
  - Domestic/custom = `VendorID` is `ACH` or FOB is `LA`
  - Other = everything else, including blank FOB
- **PO status priority**: No lines → Received (all balances ≤ 0) → Overdue (open receipt ETA < AS_OF) → In transit (open receipt ETA ≥ AS_OF) → Unshipped balance (balance > 0, at least one received receipt, no open receipt) → Partly received → Not shipped yet (plus “Old” when PO age > 90 days).
- **ETA** is the earliest ETA among a PO’s open receipts and is never per line.
- **Received qty** = `clamp(ordered − balance, 0, ordered)`. Receipts override the balance when deciding status.
- **Balance anomalies** (balance < 0 or balance > ordered) are tagged “Check data” and excluded from received %.
- **Price** is blank or zero on fee/misc lines; values are labelled “PO value” because no currency is present in the files.
- **Purchaser display aliases**: Vannesa → VannesaM, Susan → SusanG, Jessica → jessicab, Mayra → MayraA. These are marked “assumed duplicate, confirm with client”; raw values remain on hover.
- **Planning quantities** snap down to whole cartons. The claim that 100% of Import quantities are carton multiples is **not true in these files**: 24 Import lines are not exact multiples and 857 have no `BoxQty`. The planner handles this visibly.

## Code layout

```
index.html               Page shell, toolbar and mount points
css/styles.css           Design tokens, layout, tables, planner and responsive rules
js/data.js               Generated compact CSV bundle (do not edit by hand)
js/app.js                Decoding, derived model, views and interactions
scripts/build_data.py    CSV → js/data.js generator
```

## Notes

- No data is invented: unsupported planning data is clearly labelled as concept/assumption.
- Unmatched receipts are never forced onto a PO.
- The sidebar “Back to Ariel Analytics” is a placeholder link.
