#!/usr/bin/env python3
"""
Build js/data.js from the three purchasing CSV exports.

The browser cannot reliably fetch local CSV files when index.html is opened
from disk, so this script normalises the exports into a compact JS bundle.
Run it from the repository root:

    python scripts/build_data.py
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AS_OF = "2026-11-02"
AS_OF_DATE = dt.date.fromisoformat(AS_OF)

PO_CSV = ROOT / "PurchPO_202611021053.csv"
DETAIL_CSV = ROOT / "PurchPODetail_202611021056.csv"
RECEIPT_CSV = ROOT / "PurchReceipt_202611021104.csv"
VENDOR_CSV = ROOT / "Vendors_202611041459.csv"
VENDOR_CONTACTS_CSV = ROOT / "VendorContacts_202611041500.csv"
INVENTORY_CSV = ROOT / "InventoryTransactions_202611041440.csv"
OUT_JS = ROOT / "js" / "data.js"
EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

# Only fields the prototype needs. POMemo is deliberately excluded because it
# contains large multi-line free text and is not displayed.
PO_COLUMNS = [
    ("po", "str"),
    ("poDate", "date"),
    ("vendorId", "str"),
    ("purchaser", "str"),
    ("marking", "str"),
    ("fob", "str"),
    ("port", "str"),
    ("segment", "str"),
    ("readyDate", "date"),
    ("orderId", "str"),
    ("reorderPo", "str"),
    ("reorderId", "str"),
    ("importMethod", "str"),
    ("reviewed", "num"),
    ("paymentBalance", "num"),
    ("oilRate", "num"),
    ("header", "num"),
]

DETAIL_COLUMNS = [
    ("id", "num"),
    ("po", "str"),
    ("itemId", "str"),
    ("description", "str"),
    ("ordered", "num"),
    ("balance", "num"),
    ("price", "num"),
    ("boxQty", "num"),
    ("cbm", "num"),
    ("exchangeRate", "num"),
    ("hsCode", "str"),
    ("overseas", "num"),
    ("oil", "num"),
    ("oilRate", "num"),
]

RECEIPT_COLUMNS = [
    ("id", "num"),
    ("vendorId", "str"),
    ("invoiceNo", "str"),
    ("invoiceDate", "date"),
    ("etaDate", "date"),
    ("receiptDate", "date"),
    ("tracking", "str"),
    ("reference", "str"),
    ("warehouse", "str"),
    ("type", "str"),
    ("matchPo", "str"),
    ("matchType", "str"),
    ("segment", "str"),
    ("containerId", "str"),
    ("trackingKey", "str"),
    ("invalid", "num"),
]


def text(value: str | None) -> str:
    return (value or "").strip()


def emails_from(value: str | None) -> list[str]:
    emails: list[str] = []
    seen: set[str] = set()
    for match in EMAIL_PATTERN.findall(text(value)):
        key = match.lower()
        if key in seen:
            continue
        seen.add(key)
        emails.append(match)
    return emails


def number(value: str | None) -> float | None:
    value = text(value)
    if not value:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def date_only(value: str | None) -> str:
    value = text(value)
    return value[:10] if value else ""


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


# Display-only canonicalisation of the free-text FOB values observed in the
# export. Classification still uses the raw FOB regex, so abbreviations such as
# SH/NB remain Other even though their display label is a known port.
PORT_DISPLAY = {
    "LA": "LA",
    "NINGBO": "Ningbo",
    "NB": "Ningbo",
    "SHANGHAI": "Shanghai",
    "SH": "Shanghai",
    "XIAMEN": "Xiamen",
    "SHENZHEN": "Shenzhen",
    "SHENZHEN, CHINA": "Shenzhen",
    "QINGDAO": "Qingdao",
    "GUANGZHOU": "Guangzhou",
    "YANTIAN": "Yantian",
    "DALIAN": "Dalian",
    "NINGBO/SHANGHAI": "Ningbo / Shanghai",
    "NINGBO OR SHANGHAI": "Ningbo / Shanghai",
    "SHANGHAI/NINGBO": "Ningbo / Shanghai",
    "NB/SH": "Ningbo / Shanghai",
    "SH/NB": "Ningbo / Shanghai",
    "NINGBO/HK/SHANGHAI": "Ningbo / Shanghai / Hong Kong",
    "SHANGHAI/NINGBO/SHENZHEN": "Ningbo / Shanghai / Shenzhen",
    "SHENZHEN/HK": "Shenzhen / Hong Kong",
    "SHENZHEN, HK": "Shenzhen / Hong Kong",
    "SHENZHEN/HONG KONG": "Shenzhen / Hong Kong",
    "HK/SHENZHEN": "Shenzhen / Hong Kong",
    "DELIVERY HK/FOB XIAMEN": "Xiamen / Hong Kong",
    "YANTIAN OR SHEKOU": "Yantian / Shekou",
    "HONG KONG": "Hong Kong",
    "HK": "Hong Kong",
    "DELIVERY TO HK": "Hong Kong",
    "DELIVER TO HK": "Hong Kong",
    "CAT LAI": "Cat Lai",
    "HO CHI MINH": "Ho Chi Minh",
    "YANGOON": "Yangon",
    "KEELUNG,TAIWAN": "Keelung, Taiwan",
    "TAIWAN": "Taiwan",
    "KENOSHA, WI": "Kenosha, WI",
    "OUR DOCK": "Our dock",
    "SHANGHAI, NINGBO, TIANJIN, QINGDAO": "Shanghai / Ningbo / Tianjin / Qingdao",
}


def normalise_port(fob: str) -> str:
    raw = text(fob)
    if not raw:
        return ""
    # Keep the original wording for values we do not recognise, but trim it.
    return PORT_DISPLAY.get(raw.upper(), raw)


def segment_for(vendor_id: str, fob: str) -> str:
    vendor = text(vendor_id).upper()
    raw_fob = text(fob)
    if vendor == "ACH" or raw_fob.upper() == "LA":
        return "domestic"
    if re.search(
        r"ningbo|xiamen|shenzhen|shanghai|qingdao|guangzhou|yantian|dalian",
        raw_fob,
        flags=re.I,
    ):
        return "import"
    return "other"


def infer_vendor_from_po(po: str) -> str:
    parts = [part for part in re.split(r"[-_ ]+", text(po).upper()) if part]
    for part in parts:
        if re.fullmatch(r"[A-Z]{2,5}", part) and part not in {"C", "W", "PO"}:
            return part
    return ""


def tracking_key(tracking: str) -> str:
    return re.sub(r"-W$", "", text(tracking), flags=re.I).upper()


def container_id(tracking: str) -> str:
    value = tracking_key(tracking)
    return value if re.fullmatch(r"[A-Z]{4}\d{7}", value) else ""


def tracking_is_description(value: str) -> bool:
    """Detect receipt rows where TrackingNumber contains an order note.

    The receipt export includes values such as "ORDER CANCEL in Aug 2026" and
    "SAMPLE ORDER in Aug 2026" in the tracking column. They are meaningful
    references, but they are not container IDs or tracking numbers.
    """
    raw = text(value)
    if not raw:
        return False
    if re.search(r"\b(?:order|sample|cancel(?:led)?|prepaid|tbd|unknown)\b", raw, flags=re.I):
        return True
    # Real tracking values are normally alphanumeric with optional -/&. A
    # sentence-like value with spaces and lowercase words is a note.
    return bool(" " in raw and re.search(r"[a-z]", raw))


def inventory_maps(rows: list[dict[str, str]]) -> dict[str, str]:
    """Map receipt invoices to the first real tracking number.

    InventoryTransactions is the authoritative source for tracking numbers.
    A PO can span more than one container, so only an invoice match is used;
    the receipt export's own value remains the fallback when no map exists.
    """
    by_invoice: dict[str, str] = {}
    for raw in rows:
        tracking = text(raw.get("TrackingNum"))
        if not tracking or tracking_is_description(tracking):
            continue
        invoice = text(raw.get("InvoiceNo"))
        if invoice:
            by_invoice.setdefault(invoice, tracking)
    return by_invoice


def purchase_display(raw: str) -> str:
    """Used only for the duplicate-purchaser data-health note."""
    return {
        "Vannesa": "VannesaM",
        "Susan": "SusanG",
        "Jessica": "jessicab",
        "Mayra": "MayraA",
    }.get(raw, raw)


def compact(rows: list[dict], columns: list[tuple[str, str]], pool: list[str], pool_index: dict[str, int]):
    string_cols = [index for index, (_, kind) in enumerate(columns) if kind in {"str", "date"}]

    def intern(value: str) -> int:
        if value not in pool_index:
            pool_index[value] = len(pool)
            pool.append(value)
        return pool_index[value]

    encoded_rows = []
    for row in rows:
        encoded = []
        for index, (name, kind) in enumerate(columns):
            value = row.get(name)
            if kind in {"str", "date"}:
                encoded.append(intern("" if value is None else str(value)))
            else:
                encoded.append(value)
        encoded_rows.append(encoded)

    return {
        "columns": [name for name, _ in columns],
        "stringCols": string_cols,
        "rows": encoded_rows,
    }


def main() -> None:
    po_raw = read_csv(PO_CSV)
    detail_raw = read_csv(DETAIL_CSV)
    receipt_raw = read_csv(RECEIPT_CSV)
    inventory_raw = read_csv(INVENTORY_CSV) if INVENTORY_CSV.exists() else []
    inventory_by_invoice = inventory_maps(inventory_raw)

    vendor_names: dict[str, str] = {}
    vendor_codes: dict[str, str] = {}
    vendor_contacts: dict[str, dict] = {}
    contacts_by_vendor: dict[str, list[dict]] = defaultdict(list)

    if VENDOR_CONTACTS_CSV.exists():
        for raw in read_csv(VENDOR_CONTACTS_CSV):
            vendor_id = text(raw.get("VendorID"))
            if not vendor_id:
                continue
            contact_name = " ".join(
                part for part in (
                    text(raw.get("ContactFName")),
                    text(raw.get("ContactLName")),
                ) if part
            )
            emails = emails_from(raw.get("ContactEmail"))
            phone = text(raw.get("ContactTel")) or text(raw.get("ContactMobile"))
            if not (contact_name or emails or phone):
                continue
            contacts_by_vendor[vendor_id].append(
                {
                    "name": contact_name,
                    "emails": emails,
                    "phone": phone,
                    "main": text(raw.get("MainContact")).lower() in {"1", "true", "yes", "y"},
                }
            )

    if VENDOR_CSV.exists():
        for raw in read_csv(VENDOR_CSV):
            vendor_id = text(raw.get("VendorID"))
            vendor_name = text(raw.get("VendorName"))
            vendor_code = text(raw.get("VendorCode"))
            if vendor_id and vendor_name:
                vendor_names[vendor_id] = vendor_name
            if vendor_id and vendor_code and vendor_code.upper() != vendor_id.upper():
                vendor_codes[vendor_id] = vendor_code

            if not vendor_id:
                continue
            vendor_email_list = emails_from(raw.get("VendorEmail"))
            vendor_phone = text(raw.get("VendorTel")) or text(raw.get("Mobile"))
            contacts = contacts_by_vendor.get(vendor_id, [])
            main_contact = next(
                (contact for contact in contacts if contact["main"] and (contact["emails"] or contact["phone"])),
                None,
            )
            selected_contact = main_contact or next(
                (contact for contact in contacts if contact["emails"] or contact["phone"]),
                None,
            )
            emails: list[str] = []
            if selected_contact and selected_contact["emails"]:
                emails = list(selected_contact["emails"])
            else:
                emails = list(vendor_email_list)
            if not emails:
                seen_emails: set[str] = set()
                for contact in contacts:
                    for email in contact["emails"]:
                        if email.lower() not in seen_emails:
                            seen_emails.add(email.lower())
                            emails.append(email)
            phone = (selected_contact["phone"] if selected_contact else "") or vendor_phone
            contact_name = text(raw.get("PurchaseContact")) or (
                selected_contact["name"] if selected_contact else ""
            )
            if contact_name or emails or phone:
                vendor_contacts[vendor_id] = {
                    "name": contact_name,
                    "emails": emails,
                    "phone": phone,
                }

    po_rows: list[dict] = []
    header_pos: set[str] = set()
    for raw in po_raw:
        po = text(raw["PO"])
        header_pos.add(po)
        po_rows.append(
            {
                "po": po,
                "poDate": date_only(raw["PODate"]),
                "vendorId": text(raw["VendorID"]),
                "purchaser": text(raw["Purchaser"]),
                "marking": text(raw["Marking"]),
                "fob": text(raw["FOB"]),
                "port": normalise_port(raw["FOB"]),
                "segment": segment_for(raw["VendorID"], raw["FOB"]),
                "readyDate": date_only(raw["ReadyDate"]),
                "orderId": text(raw["OrderID"]),
                "reorderPo": text(raw["ReorderPO"]),
                "reorderId": text(raw["ReorderID"]),
                "importMethod": text(raw["ImportMethod"]),
                "reviewed": number(raw["Reviewed"]),
                "paymentBalance": number(raw["PaymentBalance"]),
                "oilRate": number(raw["OilRate"]),
                "header": 1,
            }
        )

    detail_pos = {text(row["PO"]) for row in detail_raw}
    detail_only_pos = sorted(detail_pos - header_pos)
    detail_only_line_count = sum(1 for row in detail_raw if text(row["PO"]) in detail_only_pos)
    for po in detail_only_pos:
        vendor = infer_vendor_from_po(po)
        po_rows.append(
            {
                "po": po,
                "poDate": "",
                "vendorId": vendor,
                "purchaser": "",
                "marking": "",
                "fob": "",
                "port": "",
                "segment": segment_for(vendor, ""),
                "readyDate": "",
                "orderId": "",
                "reorderPo": "",
                "reorderId": "",
                "importMethod": "",
                "reviewed": None,
                "paymentBalance": None,
                "oilRate": None,
                "header": 0,
            }
        )

    all_po_set = {row["po"] for row in po_rows}
    po_segment = {row["po"]: row["segment"] for row in po_rows}

    detail_rows: list[dict] = []
    for raw in detail_raw:
        detail_rows.append(
            {
                "id": number(raw["PODetailID"]),
                "po": text(raw["PO"]),
                "itemId": text(raw["ItemID"]),
                "description": text(raw["ItemDescription"]),
                "ordered": number(raw["PurQuantity"]),
                "balance": number(raw["BalQuantity"]),
                "price": number(raw["PurPrice"]),
                "boxQty": number(raw["BoxQty"]),
                "cbm": number(raw["CBM"]),
                "exchangeRate": number(raw["ExchangeRate"]),
                "hsCode": text(raw["HarmonizedCode"]),
                "overseas": number(raw["Overseas"]),
                "oil": number(raw["Oil"]),
                "oilRate": number(raw["OilRate"]),
            }
        )

    # Match exact InvoiceNo = PO first, then strip one trailing "-<digits>".
    invalid_invoice = "5131-MAC-3"
    exact_matches = 0
    fallback_matches = 0
    invalid_receipt = None
    receipt_rows: list[dict] = []
    for raw in receipt_raw:
        invoice = text(raw["InvoiceNo"])
        invalid = 1 if invoice == invalid_invoice else 0
        match_po = ""
        match_type = ""
        if not invalid:
            if invoice in all_po_set:
                match_po, match_type = invoice, "exact"
                exact_matches += 1
            else:
                stripped = re.sub(r"-\d+$", "", invoice)
                if stripped in all_po_set:
                    match_po, match_type = stripped, "suffix"
                    fallback_matches += 1
        if invalid:
            invalid_receipt = {
                "id": number(raw["ID"]),
                "invoiceNo": invoice,
                "vendorId": text(raw["VendorID"]),
                "invoiceDate": date_only(raw["InvoiceDate"]),
                "etaDate": date_only(raw["ETADate"]),
                "receiptDate": date_only(raw["ReceiptDate"]),
                "tracking": text(raw["TrackingNumber"]),
                "type": text(raw["ReceiptType"]),
            }
        vendor_id = text(raw["VendorID"])
        segment = po_segment.get(match_po, "") if match_po else ("domestic" if vendor_id.upper() == "ACH" else "other")
        original_tracking = text(raw["TrackingNumber"])
        stripped_invoice = re.sub(r"-\d+$", "", invoice)
        inventory_tracking = ""
        if not invalid:
            inventory_tracking = (
                inventory_by_invoice.get(invoice)
                or inventory_by_invoice.get(stripped_invoice)
                or ""
            )

        reference = original_tracking if tracking_is_description(original_tracking) else ""
        if inventory_tracking:
            final_tracking = inventory_tracking
        elif reference:
            final_tracking = ""
        else:
            final_tracking = original_tracking

        receipt_rows.append(
            {
                "id": number(raw["ID"]),
                "vendorId": vendor_id,
                "invoiceNo": invoice,
                "invoiceDate": date_only(raw["InvoiceDate"]),
                "etaDate": date_only(raw["ETADate"]),
                "receiptDate": date_only(raw["ReceiptDate"]),
                "tracking": final_tracking,
                "reference": reference,
                "warehouse": text(raw["WHLocation"]),
                "type": text(raw["ReceiptType"]),
                "matchPo": match_po,
                "matchType": match_type,
                "segment": segment,
                "containerId": container_id(final_tracking),
                "trackingKey": tracking_key(final_tracking),
                "invalid": invalid,
            }
        )

    # ---------- Data-health calculations (from the raw exports) ----------
    po_columns = list(po_raw[0].keys())
    detail_columns = list(detail_raw[0].keys())
    receipt_columns = list(receipt_raw[0].keys())

    def empty_count(rows: list[dict], column: str) -> int:
        return sum(1 for row in rows if not text(row.get(column, "")))

    always_empty = {
        "po": [column for column in po_columns if empty_count(po_raw, column) == len(po_raw)],
        "detail": [column for column in detail_columns if empty_count(detail_raw, column) == len(detail_raw)],
        "receipt": [column for column in receipt_columns if empty_count(receipt_raw, column) == len(receipt_raw)],
    }

    negative_balances = [
        row for row in detail_raw
        if number(row["BalQuantity"]) is not None and number(row["BalQuantity"]) < 0
    ]
    inflated_balances = [
        row for row in detail_raw
        if number(row["BalQuantity"]) is not None
        and number(row["PurQuantity"]) is not None
        and number(row["BalQuantity"]) > number(row["PurQuantity"])
    ]
    zero_price = [row for row in detail_raw if number(row["PurPrice"]) == 0]
    blank_price = [row for row in detail_raw if not text(row["PurPrice"])]
    missing_hs = [row for row in detail_raw if not text(row["HarmonizedCode"])]
    missing_cbm = [row for row in detail_raw if number(row["CBM"]) is None or number(row["CBM"]) == 0]

    po_by_id = {text(row["PO"]): row for row in po_raw}
    import_lines = [
        row for row in detail_raw
        if text(row["PO"]) in po_by_id
        and segment_for(po_by_id[text(row["PO"])]["VendorID"], po_by_id[text(row["PO"])]["FOB"]) == "import"
    ]
    import_missing_cbm = [
        row for row in import_lines
        if number(row["CBM"]) is None or number(row["CBM"]) == 0
    ]

    purchaser_counts = Counter(text(row["Purchaser"]) for row in po_raw)
    purchaser_duplicates = []
    for raw_name, canonical in {
        "Vannesa": "VannesaM",
        "Susan": "SusanG",
        "Jessica": "jessicab",
        "Mayra": "MayraA",
    }.items():
        if purchaser_counts.get(raw_name):
            purchaser_duplicates.append(
                {
                    "raw": raw_name,
                    "normalised": canonical,
                    "count": purchaser_counts[raw_name],
                    "canonicalCount": purchaser_counts.get(canonical, 0),
                }
            )

    port_counts = Counter(text(row["FOB"]) for row in po_raw)
    port_rows = [
        {"raw": port if port else "(blank)", "count": count}
        for port, count in port_counts.most_common()
    ]

    unmatched_receipts = [
        row for row in receipt_rows if not row["matchPo"] and not row["invalid"]
    ]
    unmatched_by_type = Counter(row["type"] or "(blank)" for row in unmatched_receipts)
    unmatched_examples = [
        {
            "invoiceNo": row["invoiceNo"],
            "vendorId": row["vendorId"],
            "etaDate": row["etaDate"],
            "receiptDate": row["receiptDate"],
            "tracking": row["tracking"],
            "type": row["type"],
        }
        for row in unmatched_receipts[:12]
    ]

    valid_receipts = [row for row in receipt_rows if not row["invalid"]]
    open_receipts = [row for row in valid_receipts if not row["receiptDate"]]
    open_receipts_2026 = [
        row for row in open_receipts if row["etaDate"].startswith("2026")
    ]
    past_eta_receipts = [
        row for row in open_receipts if row["etaDate"] and row["etaDate"] < AS_OF
    ]
    end_14 = (AS_OF_DATE + dt.timedelta(days=14)).isoformat()
    arriving_14 = [
        row for row in open_receipts
        if row["etaDate"] and AS_OF <= row["etaDate"] <= end_14
    ]

    tracking_keys = [row["trackingKey"] for row in receipt_rows if row["trackingKey"]]
    tracking_counts = Counter(tracking_keys)
    shared_tracking = {
        key: count for key, count in tracking_counts.items() if count > 1
    }

    container_ids = [row["containerId"] for row in receipt_rows if row["containerId"]]
    container_counts = Counter(container_ids)
    shared_containers = {
        key: count for key, count in container_counts.items() if count > 1
    }

    balance_anomalies = []
    for row in negative_balances + inflated_balances:
        balance_anomalies.append(
            {
                "po": text(row["PO"]),
                "itemId": text(row["ItemID"]),
                "ordered": number(row["PurQuantity"]),
                "balance": number(row["BalQuantity"]),
                "kind": "negative" if number(row["BalQuantity"]) < 0 else "inflated",
            }
        )

    # Carton-multiple check for import lines (used by the planner concept).
    imported_line_rows = []
    for row in import_lines:
        ordered = number(row["PurQuantity"])
        box = number(row["BoxQty"])
        imported_line_rows.append(
            {
                "multiple": ordered is not None and box and box > 0 and ordered % box == 0,
                "missingBox": not box or box <= 0,
            }
        )
    carton_multiple_ok = sum(1 for row in imported_line_rows if row["multiple"])
    carton_multiple_total = len(imported_line_rows)
    missing_box_qty = sum(1 for row in imported_line_rows if row["missingBox"])

    health = {
        "counts": {
            "poHeaders": len(po_raw),
            "detailLines": len(detail_raw),
            "receipts": len(receipt_raw),
            "vendors": len({text(row["VendorID"]) for row in po_raw if text(row["VendorID"])}),
            "purchasers": len({text(row["Purchaser"]) for row in po_raw if text(row["Purchaser"])}),
            "posWithLines": len(detail_pos),
            "headerOnlyPos": len(header_pos - detail_pos),
            "detailOnlyPos": len(detail_only_pos),
            "detailOnlyLines": detail_only_line_count,
            "matchedReceipts": exact_matches + fallback_matches,
            "exactMatches": exact_matches,
            "suffixMatches": fallback_matches,
            "unmatchedReceipts": len(unmatched_receipts),
            "invalidReceipts": sum(1 for row in receipt_rows if row["invalid"]),
        },
        "acceptance": {
            "headerPos": len(po_raw),
            "detailLines": len(detail_raw),
            "posWithLines": len(detail_pos),
            "vendors": len({text(row["VendorID"]) for row in po_raw if text(row["VendorID"])}),
            "receipts": len(receipt_raw),
            "matchedReceipts": exact_matches + fallback_matches,
            "inTransitReceipts2026": len(open_receipts_2026),
            "pastEtaReceipts": len(past_eta_receipts),
            "arrivingWithin14": len(arriving_14),
        },
        "invalidReceipt": invalid_receipt,
        "unmatchedByType": dict(unmatched_by_type.most_common()),
        "unmatchedExamples": unmatched_examples,
        "balanceAnomalies": balance_anomalies,
        "negativeBalanceCount": len(negative_balances),
        "inflatedBalanceCount": len(inflated_balances),
        "zeroPriceCount": len(zero_price),
        "blankPriceCount": len(blank_price),
        "zeroOrBlankPriceCount": len(zero_price) + len(blank_price),
        "missingHsCount": len(missing_hs),
        "missingHsPct": round(len(missing_hs) / len(detail_raw) * 100, 1) if detail_raw else 0,
        "purchaserDuplicates": purchaser_duplicates,
        "portRows": port_rows,
        "readyDateFilled": sum(1 for row in po_raw if text(row["ReadyDate"])),
        "readyDatePct": round(
            sum(1 for row in po_raw if text(row["ReadyDate"])) / len(po_raw) * 100, 1
        ) if po_raw else 0,
        "alwaysEmpty": always_empty,
        "paymentAmountFields": {
            "PaymentAmount1": sum(1 for row in po_raw if number(row["PaymentAmount1"]) not in (None, 0)),
            "PaymentAmount2": sum(1 for row in po_raw if number(row["PaymentAmount2"]) not in (None, 0)),
            "PaymentAmount3": sum(1 for row in po_raw if number(row["PaymentAmount3"]) not in (None, 0)),
        },
        "importLines": len(import_lines),
        "importMissingCbm": len(import_missing_cbm),
        "importMissingCbmPct": round(len(import_missing_cbm) / len(import_lines) * 100, 1) if import_lines else 0,
        "missingCbmExamples": [
            {
                "po": text(row["PO"]),
                "itemId": text(row["ItemID"]),
                "ordered": number(row["PurQuantity"]),
            }
            for row in import_missing_cbm[:10]
        ],
        "cartonMultiple": {
            "ok": carton_multiple_ok,
            "total": carton_multiple_total,
            "missingBoxQty": missing_box_qty,
        },
        "trackingStats": {
            "distinct": len(tracking_counts),
            "shared": len(shared_tracking),
            "sharedDistribution": dict(Counter(shared_tracking.values())),
        },
        "inventoryStats": {
            "rows": len(inventory_raw),
            "invoices": len(inventory_by_invoice),
            "tracking": len({tracking_key(value) for value in inventory_by_invoice.values()}),
        },
        "containerStats": {
            "distinct": len(container_counts),
            "shared": len(shared_containers),
            "sharedDistribution": dict(Counter(shared_containers.values())),
        },
        "headerOnlyExamples": sorted(header_pos - detail_pos)[:12],
        "detailOnlyPos": detail_only_pos,
    }

    # ---------- Compact bundle ----------
    pool = [""]
    pool_index = {"": 0}
    tables = {
        "po": compact(po_rows, PO_COLUMNS, pool, pool_index),
        "detail": compact(detail_rows, DETAIL_COLUMNS, pool, pool_index),
        "receipt": compact(receipt_rows, RECEIPT_COLUMNS, pool, pool_index),
    }

    payload = {
        "asOf": AS_OF,
        "source": {
            "po": PO_CSV.name,
            "detail": DETAIL_CSV.name,
            "receipt": RECEIPT_CSV.name,
            "vendors": VENDOR_CSV.name if VENDOR_CSV.exists() else "",
            "vendorContacts": VENDOR_CONTACTS_CSV.name if VENDOR_CONTACTS_CSV.exists() else "",
            "inventory": INVENTORY_CSV.name if INVENTORY_CSV.exists() else "",
        },
        "vendorNames": vendor_names,
        "vendorCodes": vendor_codes,
        "vendorContacts": vendor_contacts,
        "ports": sorted({row["port"] for row in po_rows if row["port"]}),
        "portMap": {
            port: normalise_port(port)
            for port in port_counts
            if port
        },
        "strings": pool,
        "tables": tables,
        "health": health,
    }

    OUT_JS.parent.mkdir(parents=True, exist_ok=True)
    serialised = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    serialised = serialised.replace("</", "<\\/")
    OUT_JS.write_text(
        "/* Generated by scripts/build_data.py. Do not edit by hand. */\n"
        f"window.PURCHASING_DATA={serialised};\n",
        encoding="utf-8",
    )

    print(f"Wrote {OUT_JS} ({OUT_JS.stat().st_size / 1024 / 1024:.2f} MB)")
    print(json.dumps(health["counts"], indent=2))
    print("Acceptance:", json.dumps(health["acceptance"], indent=2))
    print("Tracking:", health["trackingStats"])
    print("Containers:", health["containerStats"])
    print("Import CBM missing:", health["importMissingCbm"], "/", health["importLines"], f"({health['importMissingCbmPct']}%)")
    print("Carton multiples:", health["cartonMultiple"])
    print("Detail-only POs:", len(detail_only_pos), "lines:", detail_only_line_count)


if __name__ == "__main__":
    main()
