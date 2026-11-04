# Ariel Purchasing Module (CSV-backed prototype)

Self-contained browser prototype for reviewing the exported China-import purchasing data. Open `index.html` directly from disk — **no build step and no local server required**. Containers are the source of truth for planning, real shipment receipts and vendor details. Demo edits are browser-local; there is no packing-list import.

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

## Pages and navigation

The sidebar is:

- **OVERVIEW** — Dashboard
- **ACT** — Follow-ups, Containers
- **ORDERS** — Purchase orders, Vendors
- **← Back to Ariel Analytics** — placeholder link at the bottom

Old links redirect to the merged Containers page: `#planner`, `#import`, `#receive` and `#vendor-updates` open the **Plan** view; `#shipments` opens the **In transit** view. The page name “Planner” and the old Shipments, Import packing list, Receive one receipt and Vendor updates sidebar entries are gone.

### Dashboard

Four PO-based KPIs: Open POs (including open value), In transit, At risk and Not yet planned. They use the same PO buckets as the coverage bar: Open POs = In transit + Planned + Not yet planned + At risk, while In transit, At risk and Not yet planned match their coverage segments exactly. The full-width Order coverage bar counts each PO once and splits them into Received, In transit, Planned, Not yet planned and At risk; its header also shows how many of the total POs are open.

Below it is Top 8 vendors by open value with a PO-based Received %; “View all vendors” opens the full vendor list.

### Containers

The page has three segmented views with counts:

- **Plan** — exactly the previous planning behaviour, limited to Draft and Booked containers. Draft and booked containers appear in a horizontal switcher and only the active container is shown, so planning focuses on one container at a time. Includes every open Import balance without an open receipt, including remainders of partly received POs. Type a container name/type and add it (40HC 68 CBM, 40ST 58 CBM and 20GP 28 CBM are recognised capacity assumptions), drag or tap-to-assign open lines, snap down to whole cartons using `BoxQty` (a final sub-carton remainder can be planned as a partial block), and warn when CBM or carton data is missing. Search the awaiting lines by vendor, PO or item ID. A quantity dialog lets one PO line split across containers; assigned blocks are labelled B1, B2, … Fill turns red over 100%.
- **In transit** — Shipped containers created in Plan plus real receipt-export groups without a `ReceiptDate`. Real groups are collapsed by default, paginated 20 per page and show shared-container counts. Search covers container/tracking, invoice, PO and vendor; filters cover receipt type and the plain status labels (“On the way”, “Past ETA”, “No ETA”, “No matching PO”, “Invalid data”).
- **Arrived** — Arrived containers created in Plan plus real receipt-export groups with a `ReceiptDate`. Uses the same grouping, search and type filters.

Container detail uses `#containers/<id>`: a drawer on wide screens and a full-page view with a Back button on narrow screens. Closing restores the current view, filters and scroll position. The header shows the container/tracking number, type, vendor and PO counts, port, sailing date, ETA, warehouse, a Draft → Booked → Shipped → Arrived stepper and the next-step action. Contents are grouped by PO/item with Vendor, PO, Item, Ordered, In this container, Balance after and Result tags. Contents are read-only by default. A Booked container ships “as planned” by default; “Shipped differently” can reduce a line before arrival, and any shortfall returns to the PO balance. Marking it Arrived moves shipped units to Received and locks the container.

Vendor details live in the detail panel with all fields from the old Vendor updates page: tracking/container, invoice/booking, vessel, ETD/ETA, port, warehouse, cartons, gross weight, CBM, status, source, contact and notes. Entries are editable per container. Existing browser-local Vendor updates are carried over by tracking number or PO, and any unmatched entries remain in a collapsed “Vendor updates not yet attached to a container” section. Older entries are never deleted.

Documents are attached per container with an **Attach file** control. The list records file name, type and date for packing list, invoice or booking confirmation. Nothing is uploaded, read, OCR'd or parsed.

The header’s **Reset demo data** clears only the merged Containers localStorage key. It does not touch the old Vendor updates key.

### Container naming

A real container ID is 4 letters followed by 7 digits after removing a trailing `-W` (for example `TCLU1234567-W` → `TCLU1234567`). Anything else is shown as **Tracking no.** with an **LCL / carrier reference** tag. Grouping uses only the normalised tracking value; no separate carrier-reference field is invented. The current export has 445 distinct normalised tracking IDs (203 in transit, 242 arrived) and 77 shared containers. The seven receipts with no tracking number are kept in a separate “Receipts without a tracking number” table and are not counted as containers. Planner-created containers use the editable **Container ID** field; adding a later real container number does not rename them.

### Purchase orders

Defaults to the 2,289 POs with lines. Toggle “Include header-only POs (3,422)” to show the rest, tagged “No line items”. Detail-only POs are tagged “PO header missing” (the files contain **11 distinct POs / 14 lines**, not 14 POs). Dashboard KPIs are not repeated on this page. The table adds Received %, Planned and Unplanned units per PO; qualifying balances are tagged “At risk”, while other unplanned balances without an open receipt are tagged “Not yet planned”. Units on a shipped container are tagged “In container”. Search PO/vendor/item/description (200 ms debounce), filter status/port/vendor/buyer, choose 25/50/100 POs per page, and use the single numbered pager above the table. Rows are always sorted by ETA, earliest first, with no-ETA POs last. The status list only includes statuses present in the current filters. The table scrolls inside its card with a sticky header.

Expanded POs show every line in a bounded, independently scrollable table with a sticky header, plus:

- **Vendor confirmation** — Not sent / Sent / Confirmed / Changed / Rejected, free-text notes, and a per-line ready date.
- **Containers** — every block assigned to the PO, with container, type, block labels, units and status.

Both blocks use the merged localStorage state.

### Vendors

All vendors in the current filters, with PO counts, open POs, open value, Received % (the share of POs fully received), Needs action and Next ETA. Select a vendor to open its purchase orders.

### Follow-ups

Ordered categories: (1) At risk; (2) Not yet planned; (3) Open balance — already planned; (4) Past ETA; (5) Not shipped yet and Old; (6) Receipts unmatched. A category index shows the count in each section; sections and vendor groups are collapsible, with vendors highlighted and grouped with open lines/value, balance, planned, unplanned, ETA, days late, PO age and buyer. “Send reminder” opens a pre-filled draft email; clicking Send logs the reminder in the session. No email is sent.

PO rows also get two planning tags: **Ariel needs to plan** when an unplanned line has a ready date, and **Vendor needs a chase** when an unplanned line has no ready date or its ready date has passed. These tags do not create new Follow-ups categories.

## Rules and assumptions

- **AS_OF is fixed at 2026-11-02** (the export date) for every “days late / in N days” calculation. The UI shows “Data as of 2 Nov 2026”.
- **Segment** values are still derived for diagnostics, but the segment dropdown has been removed because all live shipments are imports; every view shows all segments by default:
  - Import = FOB matches `ningbo|xiamen|shenzhen|shanghai|qingdao|guangzhou|yantian|dalian` (case-insensitive)
  - Domestic/custom = `VendorID` is `ACH` or FOB is `LA`
  - Other = everything else, including blank FOB
- **PO status priority**: No lines → Received (all balances ≤ 0) → Overdue (open receipt ETA < AS_OF) → In transit (open receipt ETA ≥ AS_OF, or some open units are on a Shipped container) → Unshipped balance (balance > 0, at least one received receipt, no open receipt) → Partly received → Not shipped yet (plus “Old” when PO age > 90 days).
- **Planned units** = open balance assigned to a **Draft** or **Booked** container in Containers → Plan. Plan only offers POs with no open receipt, including partially received POs. One PO line can be split into multiple labelled blocks. Booked is still planned, not in transit.
- **Shipped units** = open units assigned to a **Shipped** container. Marking a container shipped removes those units from Planned and adds them to In transit. Marking it **Arrived** adds them to Received and reduces the PO balance in this browser.
- **Unplanned units** = open balance − planned units − shipped units for a PO with no open receipt. **At risk** = open balance > 0, no open receipt, unplanned units > 0, and (PO age > 90 days or the PO has at least one received receipt). All other unplanned open balance is **Not yet planned**; young POs are not At risk just because they have not shipped yet.
- **Order coverage** = Received + In transit + Planned + Not yet planned + At risk. Each PO is counted once, so the five segments add up to the POs in view. At risk takes precedence for a PO with no open receipt and an unplanned balance; In transit covers POs with an open receipt or shipped units; Planned POs have their remaining balance in Draft/Booked containers; remaining open POs are Not yet planned.
- **ETA** is the earliest ETA among a PO’s open receipts and is never per line.
- **Received qty** = `clamp(ordered − balance, 0, ordered)`. Receipts override the balance when deciding status.
- **Balance anomalies** (balance < 0 or balance > ordered) are tagged “Check data” and excluded from received %.
- **Price** is blank or zero on fee/misc lines; values are labelled “PO value” because no currency is present in the files.
- **Purchaser display aliases**: Vannesa → VannesaM, Susan → SusanG, Jessica → jessicab, Mayra → MayraA. These are marked “assumed duplicate, confirm with client”; raw values remain on hover.
- **Planning quantities** snap down to whole cartons. A final balance smaller than one carton can be planned as a partial block so it is not stranded. The claim that 100% of Import quantities are carton multiples is **not true in these files**: 24 Import lines are not exact multiples and 857 have no `BoxQty`. Plan handles this visibly.
- **Real receipt exports carry no line quantities.** A real container can show the matched PO and its balance, but “In this container” is blank and the panel says “Contents are not in the export”. Quantities are never invented. Marking a real receipt arrived changes its receipt status only; it cannot reduce PO balances from this export. Unmatched receipts show “No matching PO” and are never forced onto a PO.

## Persistence

Merged demo state is stored under `ariel.containers.v1`: containers, plans, simulated receipts/quantities, PO confirmations and ready dates, vendor details and document metadata. The old `ariel.vendorUpdates.v1` key is read for migration and is left untouched by **Reset demo data**.

## Code layout

```
index.html               Page shell, toolbar and mount points
css/styles.css           Design tokens, layout, tables, containers and responsive rules
js/data.js               Generated compact CSV bundle (do not edit by hand)
js/app.js                Decoding, derived model, views and interactions
scripts/build_data.py    CSV → js/data.js generator
```

## Notes

- No data is imported or invented: container capacities are assumptions (40HC 68 CBM, 40ST 58 CBM, 20GP 28 CBM). There is no packing-list import, file parser, OCR or document ingestion. Attachments keep metadata only.
- There is no live Google Sheets, Forms, Odoo or Ariel integration, no real email or messaging, no login/roles and no shared persistence. Reminders are logged in the session only. Demo state is stored in this browser only and is not shared across buyers or devices.
- The CSV exports do not contain container status, sailing date, port, confirmation status, ready dates or vendor contact details; those fields exist only in this prototype and its browser-local state.
- The sidebar “Back to Ariel Analytics” is a placeholder link.
