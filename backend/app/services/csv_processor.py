import csv
from io import StringIO
from typing import List, Dict, Any, Optional
from datetime import datetime
import re
import logging
from app.config.constants import TABLE_COLUMNS, COLUMN_ALIASES, SHARED_TABLE_CONFIGS
from decimal import Decimal, InvalidOperation

logger = logging.getLogger(__name__)

_ALLOWED_DELIMS = [",", ";", "\t", "|"]

def _decode_csv(content: bytes) -> str:
    # BOM-safe, normalize newlines
    return content.decode("utf-8-sig", errors="replace").replace("\r\n", "\n").replace("\r", "\n")

def _sniff_delimiter(sample: str) -> str:
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=_ALLOWED_DELIMS)
        d = getattr(dialect, "delimiter", ",")
        if d not in _ALLOWED_DELIMS:
            return ","
        return d
    except csv.Error:
        # simple fallback: pick the most frequent allowed delimiter
        counts = {d: sample.count(d) for d in _ALLOWED_DELIMS}
        return max(counts, key=counts.get) if any(counts.values()) else ","

def _clean_decimal_str(s: str) -> str:
    return s.replace(",", "").replace("%", "").strip()

def process_csv(
    content: bytes,
    qcode: str,
    table_name: str,
    start_date: Optional[str],
    end_date: Optional[str],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    data: List[Dict[str, Any]] = []
    failed_rows: List[Dict[str, Any]] = []

    required_columns = TABLE_COLUMNS.get(table_name, [])
    column_aliases = COLUMN_ALIASES.get(table_name, {})

    csv_text = _decode_csv(content)
    logger.debug(f"First 100 bytes of CSV content: {csv_text[:100]}")

    # Delimiter detection (whitelisted)
    sample = csv_text[:2048]
    delim = _sniff_delimiter(sample)
    logger.debug(f"Detected delimiter: {repr(delim)}")

    def _make_reader(text: str, delimiter: str) -> csv.DictReader:
        return csv.DictReader(StringIO(text), delimiter=delimiter)

    reader = _make_reader(csv_text, delim)

    if not reader.fieldnames:
        logger.error("No headers found in CSV")
        raise ValueError("CSV file must contain headers")

    # ---- header mapping (case-insensitive + aliases → your displayName) ----
    csv_headers_raw = [h.strip().replace("\ufeff", "") for h in reader.fieldnames]
    csv_headers_lower = [h.lower() for h in csv_headers_raw]

    header_mapping: Dict[str, str] = {}
    for csv_header in csv_headers_raw:
        # direct match to required display names
        matched = False
        for expected_col in required_columns:
            if csv_header.lower() == expected_col.lower():
                header_mapping[csv_header] = expected_col
                matched = True
                break
        if matched:
            continue

        # alias match: COLUMN_ALIASES maps fieldName -> [aliases]
        for field_name, aliases in column_aliases.items():
            if csv_header.lower() in [alias.lower() for alias in aliases]:
                # map to displayName from SHARED_TABLE_CONFIGS
                for col in SHARED_TABLE_CONFIGS[table_name]["requiredColumns"]:
                    if col["fieldName"] == field_name:
                        header_mapping[csv_header] = col["displayName"]
                        matched = True
                        break
            if matched:
                break

        if not matched:
            header_mapping[csv_header] = csv_header  # keep original

    normalized_fieldnames = [header_mapping.get(h, h) for h in csv_headers_raw]
    logger.debug(f"Normalized CSV fieldnames: {normalized_fieldnames}")

    # Some tables: Status and/or Date optional
    effective_required = required_columns.copy()
    if table_name in {
        "gold_tradebook",
        "liquidbees_tradebook",
        "slippage",
        "mutual_fund_holding",
        "capital_in_out",
        "equity_holding",
    } and "Status" in effective_required:
        effective_required.remove("Status")
    
    # For equity_holding, Date is always set programmatically, so remove from required
    if table_name == "equity_holding" and "Date" in effective_required:
        effective_required.remove("Date")

    # If required columns missing, try a safer re-parse with comma (common Excel)
    if not all(col in normalized_fieldnames for col in effective_required):
        missing_once = [c for c in effective_required if c not in normalized_fieldnames]
        logger.warning(f"Required columns missing with delimiter {repr(delim)}: {missing_once}")
        if delim != ",":
            logger.info("Retrying parse with comma delimiter…")
            reader = _make_reader(csv_text, ",")
            if not reader.fieldnames:
                raise ValueError("CSV file must contain headers")
            csv_headers_raw = [h.strip().replace("\ufeff", "") for h in reader.fieldnames]
            header_mapping = {h: next((c for c in required_columns if c.lower() == h.lower()), h) for h in csv_headers_raw}
            normalized_fieldnames = [header_mapping.get(h, h) for h in csv_headers_raw]
            logger.debug(f"Normalized (retry) CSV fieldnames: {normalized_fieldnames}")

    # Final required check
    if not all(col in normalized_fieldnames for col in effective_required):
        missing_columns = [col for col in effective_required if col not in normalized_fieldnames]
        logger.error(f"Missing columns: {missing_columns}")
        # Help the user fix it quickly
        raise ValueError(
            f"Missing required columns: {', '.join(missing_columns)}"
            f"\nDetected columns: {normalized_fieldnames}"
        )

    # Date field (display label) - Skip for equity_holding as date is set programmatically
    if table_name != "equity_holding":
        date_field = SHARED_TABLE_CONFIGS[table_name].get("dateField", "Date")
        date_field_display = next(
            (col["displayName"] for col in SHARED_TABLE_CONFIGS[table_name]["requiredColumns"]
             if col["fieldName"] == date_field),
            date_field,
        )

        # Date formats
        date_formats = (
            ["%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%Y-%m-%d"]
            if table_name == "tradebook" else
            ["%Y-%m-%d"]
        )

    # Numeric validations (unchanged list, but parsing hardened)
    decimal_fields = {
        "master_sheet": [
            "Portfolio Value", "Cash In/Out", "NAV", "Prev NAV", "PnL", "Daily P/L %",
            "Exposure Value", "Prev Portfolio Value", "Prev Exposure Value", "Prev Pnl", "Drawdown %"
        ],
        "tradebook": [
            "Price Entry", "Contract Value Entry", "Price Exit", "Contract Value Exit",
            "Pnl Amount", "Pnl Amount Settlement"
        ],
        "slippage": ["Capital In/Out"],
        "mutual_fund_holding": ["Quantity", "Price"],
        "gold_tradebook": ["Price", "Exposure"],
        "liquidbees_tradebook": ["Price"],
        "equity_holding": [
            "Quantity", "Avg Price", "LTP", "Buy Value", "Value as of Today", "PNL Amount"
        ],
        "capital_in_out": ["Capital In/Out"],
    }.get(table_name, [])

    # Iterate rows
    row_iter = _make_reader(csv_text, delim) if isinstance(reader, csv.DictReader) and reader.fieldnames is None else reader
    for row_num, row in enumerate(row_iter, start=2):  # header is row 1
        try:
            # Normalize column names to your displayNames
            normalized_row = {
                header_mapping.get(k.strip(), k.strip()): (v if v is not None else "").strip()
                for k, v in row.items()
            }

            # Default Status if missing
            if table_name in {
                "tradebook", "slippage", "mutual_fund_holding",
                "gold_tradebook", "liquidbees_tradebook",
                "capital_in_out", "equity_holding"
            } and "Status" not in normalized_row:
                normalized_row["Status"] = "P"

            # Date parse - Skip for equity_holding as date is set programmatically
            if table_name != "equity_holding":
                date_str = normalized_row.get(date_field_display, "").strip()
                if not date_str:
                    raise ValueError(f"Missing date in '{date_field_display}' at row {row_num}")

                parsed_dt = None
                for fmt in date_formats:
                    try:
                        parsed_dt = datetime.strptime(date_str, fmt)
                        break
                    except ValueError:
                        continue
                if not parsed_dt:
                    raise ValueError(f"Invalid date format at row {row_num}: {date_str}. Tried formats: {', '.join(date_formats)}")

                row_date = parsed_dt if table_name == "tradebook" else parsed_dt.date()

                # Date range filter
                if start_date and end_date:
                    s = datetime.strptime(start_date, "%Y-%m-%d").date()
                    e = datetime.strptime(end_date, "%Y-%m-%d").date()
                    if not (s <= (row_date if hasattr(row_date, "year") else row_date) <= e):
                        continue

            # Decimal validations
            for field in decimal_fields:
                raw = normalized_row.get(field, "")
                if raw:
                    try:
                        Decimal(_clean_decimal_str(raw))
                    except InvalidOperation:
                        raise ValueError(f"Invalid decimal value in '{field}' at row {row_num}: {raw}")

            # Special handling for % PNL in equity_holding
            if table_name == "equity_holding":
                percent_pnl = normalized_row.get("% PNL", "")
                if percent_pnl and percent_pnl.lower() not in ["inf", "-inf"]:
                    try:
                        Decimal(_clean_decimal_str(percent_pnl))
                    except InvalidOperation:
                        raise ValueError(f"Invalid decimal value in '% PNL' at row {row_num}: {percent_pnl}")

            data.append(normalized_row)

        except Exception as e:
            logger.error(f"Error processing row {row_num}: {str(e)}, row={row}")
            failed_rows.append({
                "row_index": row_num,
                "error": str(e),
                "row": row,
            })

    return data, failed_rows