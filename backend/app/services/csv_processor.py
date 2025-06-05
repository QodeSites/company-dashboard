import csv
from io import StringIO
from typing import List, Dict, Any, Optional
from datetime import datetime
import re
import logging
from config.constants import TABLE_COLUMNS, COLUMN_ALIASES, SHARED_TABLE_CONFIGS
from decimal import Decimal, InvalidOperation

logger = logging.getLogger(__name__)

def process_csv(content: bytes, qcode: str, table_name: str, start_date: Optional[str], end_date: Optional[str]) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    data = []
    failed_rows = []
    required_columns = TABLE_COLUMNS.get(table_name, [])
    column_aliases = COLUMN_ALIASES.get(table_name, {})
    
    # Decode CSV content, handling BOM
    csv_content = content.decode('utf-8-sig')
    logger.debug(f"First 100 bytes of CSV content: {csv_content[:100]}")
    csv_file = StringIO(csv_content)
    
    # Detect delimiter
    sample = csv_content[:1024]
    try:
        dialect = csv.Sniffer().sniff(sample)
        logger.debug(f"Detected delimiter: {dialect.delimiter}")
        reader = csv.DictReader(csv_file, dialect=dialect)
    except csv.Error:
        logger.warning("Could not detect delimiter, defaulting to comma")
        csv_file.seek(0)
        reader = csv.DictReader(csv_file)  # Default to comma

    # Validate fieldnames
    if not reader.fieldnames:
        logger.error("No headers found in CSV")
        raise ValueError("CSV file must contain headers")

    # Create case-insensitive mapping from CSV headers to TABLE_COLUMNS, including aliases
    header_mapping = {}
    csv_headers = [field.strip().replace('\ufeff', '') for field in reader.fieldnames]
    for csv_header in csv_headers:
        # Check direct match
        for expected_col in required_columns:
            if csv_header.lower() == expected_col.lower():
                header_mapping[csv_header] = expected_col
                break
        else:
            # Check aliases
            for field_name, aliases in column_aliases.items():
                if csv_header.lower() in [alias.lower() for alias in aliases]:
                    # Map to the corresponding displayName
                    for col in SHARED_TABLE_CONFIGS[table_name]['requiredColumns']:
                        if col['fieldName'] == field_name:
                            header_mapping[csv_header] = col['displayName']
                            break
                    break
            else:
                header_mapping[csv_header] = csv_header  # Keep original if no match

    # Normalize fieldnames to match TABLE_COLUMNS
    normalized_fieldnames = [header_mapping.get(field.strip(), field.strip()) for field in reader.fieldnames]
    logger.debug(f"Normalized CSV fieldnames: {normalized_fieldnames}")
    
    effective_required = required_columns.copy()

    # Status is optional for some tables
    if table_name in ["gold_tradebook", "liquidbees_tradebook", "slippage", "mutual_fund_holding", "capital_in_out"] and "Status" in effective_required:
        effective_required.remove("Status")

    # Validate required columns
    if not all(col in normalized_fieldnames for col in effective_required):
        missing_columns = [col for col in effective_required if col not in normalized_fieldnames]
        logger.error(f"Missing columns: {missing_columns}")
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
    
    # Determine date field for filtering
    date_field = SHARED_TABLE_CONFIGS[table_name].get('dateField', 'Date')
    date_field_display = next(
        (col['displayName'] for col in SHARED_TABLE_CONFIGS[table_name]['requiredColumns']
         if col['fieldName'] == date_field),
        date_field  # fallback
    )

    # Supported date formats
    date_formats = [
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%d"
    ] if table_name == "tradebook" else ["%Y-%m-%d"]

    # Decimal fields for validation
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
        "equity_holding": ["Price", "Exposure"],
        "capital_in_out": ["Capital In/Out"]
    }.get(table_name, [])

    for row_num, row in enumerate(reader, start=2):
        try:
            # Create normalized row using mapped headers
            normalized_row = {
                header_mapping.get(key.strip(), key.strip()): value
                for key, value in row.items()
            }
            
            # Add default Status if missing
            if table_name in ["tradebook", "slippage", "mutual_fund_holding", "gold_tradebook", "liquidbees_tradebook", "capital_in_out"] and "Status" not in normalized_row:
                normalized_row["Status"] = "P"

            # Validate date format
            date_str = normalized_row.get(date_field_display, "").strip()
            if not date_str:
                logger.error(f"Missing date in '{date_field_display}' at row {row_num}: value='{date_str}'")
                raise ValueError(f"Missing date in '{date_field_display}' at row {row_num}")

            # Try parsing date with supported formats
            row_date = None
            for date_format in date_formats:
                try:
                    row_date = datetime.strptime(date_str, date_format)
                    break
                except ValueError:
                    continue
            
            if not row_date:
                logger.error(f"Invalid date format at row {row_num}: value='{date_str}', tried formats={date_formats}")
                raise ValueError(f"Invalid date format at row {row_num}: {date_str}. Tried formats: {', '.join(date_formats)}")

            if table_name != "tradebook":
                row_date = row_date.date()

            # Filter by date range
            if start_date and end_date:
                start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
                end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
                if not (start_date_obj <= row_date <= end_date_obj):
                    continue

            # Validate decimal fields
            for field in decimal_fields:
                value = normalized_row.get(field, "").strip()
                if value:
                    try:
                        Decimal(value.replace(",", ""))
                    except InvalidOperation:
                        logger.error(f"Invalid decimal value in '{field}' at row {row_num}: value='{value}'")
                        raise ValueError(f"Invalid decimal value in '{field}' at row {row_num}: {value}")

            data.append(normalized_row)
        except Exception as e:
            logger.error(f"Error processing row {row_num}: {str(e)}, row={row}")
            failed_rows.append({
                "row_index": row_num,
                "error": str(e),
                "row": row
            })

    return data, failed_rows