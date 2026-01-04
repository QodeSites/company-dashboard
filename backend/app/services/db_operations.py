from prisma import Prisma
from app.models.schemas import MasterSheet
import logging
from typing import List, Dict, Any, Tuple, Optional
from prisma.errors import PrismaError
from datetime import datetime, date, timezone
from decimal import Decimal, InvalidOperation
from pydantic import ValidationError as PydanticValidationError
import asyncio
from contextlib import asynccontextmanager

# NEW: timezone support for "today" in Asia/Kolkata
try:
    from zoneinfo import ZoneInfo  # Python 3.9+
except Exception:  # pragma: no cover
    ZoneInfo = None

logger = logging.getLogger(__name__)

# Enhanced configuration
class DatabaseConfig:
    BATCH_SIZE = 500
    MAX_RETRIES = 3
    RETRY_DELAY = 1.0
    CONNECTION_TIMEOUT = 30.0

# Whitelist of allowed table names to prevent SQL injection
ALLOWED_TABLES = {
    "master_sheet_test",
    "tradebook",
    "slippage",
    "mutual_fund_holding",
    "gold_tradebook",
    "liquidbees_tradebook",
    "equity_holding",
    "equity_holding_test",
    "mutual_fund_holding_sheet_test",
    "capital_in_out",
}

# Table-specific date field mapping
DATE_FIELD_MAPPING = {
    "master_sheet_test": "date",
    "tradebook": "timestamp_entry",
    "slippage": "date",
    "mutual_fund_holding": "date",
    "gold_tradebook": "date",
    "liquidbees_tradebook": "date",
    "equity_holding": "date",
    "equity_holding_test": "date",
    "mutual_fund_holding_sheet_test": "as_of_date",
    "capital_in_out": "date",
}

class DatabaseOperationError(Exception):
    """Custom exception for database operations."""
    pass

# RENAMED to avoid clashing with Pydantic's ValidationError
class DataValidationError(Exception):
    """Custom exception for data validation errors."""
    pass

def _today_iso_kolkata() -> str:
    """Return today's date as YYYY-MM-DD in Asia/Kolkata (fallback to server local)."""
    if ZoneInfo:
        return datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()
    return datetime.now().date().isoformat()

def serialize_date(value: Any) -> Optional[str]:
    """
    Ensure any date or datetime is converted to an ISO-8601 datetime string.
    Returns None for None values.
    """
    if value is None:
        return None

    try:
        if isinstance(value, str):
            # Try to parse string dates
            if len(value) == 10:  # YYYY-MM-DD format
                value = datetime.strptime(value, "%Y-%m-%d").date()
            elif len(value) == 19:  # YYYY-MM-DD HH:MM:SS format
                value = datetime.strptime(value, "%Y-%m-%d %H:%M:%S")

        if isinstance(value, date) and not isinstance(value, datetime):
            value = datetime.combine(value, datetime.min.time())

        if isinstance(value, datetime) and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)

        return value.isoformat()
    except (ValueError, TypeError) as e:
        logger.warning(f"Failed to serialize date value {value}: {e}")
        return None

def safe_decimal(value: Any, field_name: str, row_index: int) -> Optional[Decimal]:
    """
    Safely convert a value to Decimal, handling invalid cases.
    Returns None for empty or None values.
    """
    if value is None or str(value).strip() in ("", "None", "null"):
        return None

    try:
        # Handle different numeric formats
        cleaned_value = str(value).replace(",", "").replace("$", "").replace("%", "").strip()
        if cleaned_value in ("", "-", "N/A", "n/a", "#DIV/0!"):
            return None
        return Decimal(cleaned_value)
    except (InvalidOperation, ValueError, TypeError) as e:
        raise DataValidationError(f"Invalid {field_name} at row {row_index}: {value} - {str(e)}")

def safe_int(value: Any, field_name: str, row_index: int) -> Optional[int]:
    """Safely convert a value to integer."""
    if value is None or str(value).strip() in ("", "None", "null"):
        return None

    try:
        cleaned_value = str(value).replace(",", "").strip()
        if cleaned_value in ("", "-", "N/A", "n/a"):
            return None
        return int(float(cleaned_value))  # Handle decimal strings like "10.0"
    except (ValueError, TypeError) as e:
        raise DataValidationError(f"Invalid {field_name} at row {row_index}: {value} - {str(e)}")

async def validate_qcode(db: Prisma, qcode: str) -> Dict[str, Any]:
    """Validate qcode and return account information."""
    if not qcode or not isinstance(qcode, str):
        raise DatabaseOperationError("Invalid qcode: must be a non-empty string")

    account = await db.accounts.find_first(where={"qcode": qcode})
    if not account:
        raise DatabaseOperationError(f"Account not found for qcode: {qcode}")

    return account

async def get_table_count(db: Prisma, table_name: str, qcode: str) -> int:
    """Get the current count of records in a table for a specific qcode."""
    try:
        result = await db.query_first(
            f'SELECT COUNT(*) as count FROM "{table_name}" WHERE qcode = $1',
            qcode,
        )
        return result["count"] if result else 0
    except PrismaError as e:
        logger.error(f"Error getting count for {table_name}: {e}")
        return 0

@asynccontextmanager
async def database_transaction(db: Prisma):
    """Context manager for database transactions with automatic rollback."""
    try:
        yield db
    except Exception as e:
        logger.error(f"Transaction failed: {e}")
        raise

def serialize_master_sheet_item(item: Dict[str, Any], qcode: str, index: int) -> Dict[str, Any]:
    """Serialize master sheet data item."""
    date_str = item.get("Date")
    if not date_str:
        raise DataValidationError(f"Missing Date at row {index}")

    try:
        if isinstance(date_str, str):
            date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
        elif isinstance(date_str, date):
            date_obj = date_str
        else:
            raise ValueError("Invalid date type")
    except ValueError as e:
        raise DataValidationError(
            f"Invalid Date format at row {index}: {date_str}, expected YYYY-MM-DD - {e}"
        )

    try:
        master_sheet = MasterSheet(
            qcode=qcode,
            date=date_obj,
            system_tag=item.get("System Tag") or None,
            portfolio_value=safe_decimal(item.get("Portfolio Value"), "Portfolio Value", index),
            capital_in_out=safe_decimal(item.get("Cash In/Out"), "Cash In/Out", index),
            nav=safe_decimal(item.get("NAV"), "NAV", index),
            prev_nav=safe_decimal(item.get("Prev NAV"), "Prev NAV", index),
            pnl=safe_decimal(item.get("PnL"), "PnL", index),
            daily_p_l=safe_decimal(item.get("Daily P/L %"), "Daily P/L %", index),
            exposure_value=safe_decimal(item.get("Exposure Value"), "Exposure Value", index),
            prev_portfolio_value=safe_decimal(item.get("Prev Portfolio Value"), "Prev Portfolio Value", index),
            prev_exposure_value=safe_decimal(item.get("Prev Exposure Value"), "Prev Exposure Value", index),
            prev_pnl=safe_decimal(item.get("Prev Pnl"), "Prev Pnl", index),
            drawdown=safe_decimal(item.get("Drawdown %"), "Drawdown %", index),
            created_at=datetime.now(timezone.utc).date(),
        )

        serialized_item = {
            "qcode": qcode,
            "created_at": serialize_date(datetime.now(timezone.utc)),
        }

        serialized_item.update(
            {
                k: serialize_date(v) if isinstance(v, (date, datetime)) else v
                for k, v in master_sheet.dict(exclude_none=True).items()
            }
        )

        return serialized_item

    except PydanticValidationError as e:
        # surface pydantic model errors clearly
        raise DataValidationError(f"Pydantic validation failed at row {index}: {e}") from e
    except DataValidationError:
        raise
    except Exception as e:
        raise DataValidationError(f"Error processing master sheet row {index}: {str(e)}")

def serialize_tradebook_item(item: Dict[str, Any], qcode: str, index: int) -> Dict[str, Any]:
    """Serialize tradebook data item."""
    return {
        "qcode": qcode,
        "timestamp_entry": serialize_date(item.get("Timestamp Entry")),
        "system_tag_entry": item.get("System Tag Entry"),
        "action_entry": item.get("Action Entry"),
        "symbol_entry": item.get("Symbol Entry"),
        "price_entry": safe_decimal(item.get("Price Entry"), "Price Entry", index),
        "qty_entry": safe_int(item.get("Qty Entry"), "Qty Entry", index),
        "contract_value_entry": safe_decimal(item.get("Contract Value Entry"), "Contract Value Entry", index),
        "timestamp_exit": serialize_date(item.get("Timestamp Exit")) if item.get("Timestamp Exit") else None,
        "system_tag_exit": item.get("System Tag Exit") or None,
        "action_exit": item.get("Action Exit") or None,
        "symbol_exit": item.get("Symbol Exit") or None,
        "price_exit": safe_decimal(item.get("Price Exit"), "Price Exit", index),
        "qty_exit": safe_int(item.get("Qty Exit"), "Qty Exit", index),
        "contract_value_exit": safe_decimal(item.get("Contract Value Exit"), "Contract Value Exit", index),
        "pnl_amount": safe_decimal(item.get("Pnl Amount"), "Pnl Amount", index),
        "pnl_amount_settlement": safe_decimal(item.get("Pnl Amount Settlement"), "Pnl Amount Settlement", index),
        "status": item.get("Status", "P"),
        "created_at": serialize_date(datetime.now(timezone.utc)),
    }

def serialize_table_item(
    item: Dict[str, Any],
    table_name: str,
    qcode: str,
    account: Dict[str, Any],
    index: int,
) -> Dict[str, Any]:
    """Generic function to serialize data items based on table name."""
    base_data = {
        "qcode": qcode,
        "created_at": serialize_date(datetime.now(timezone.utc)),
    }

    if table_name == "master_sheet_test":
        return serialize_master_sheet_item(item, qcode, index)

    elif table_name == "tradebook":
        return serialize_tradebook_item(item, qcode, index)

    elif table_name == "slippage":
        base_data.update({
            "date": serialize_date(item.get("Date")),
            "account": item.get("Account") or account.account_name,
            "system_tag": item.get("System Tag"),
            "capital_in_out": safe_decimal(item.get("Capital In/Out"), "Capital In/Out", index),
            "status": item.get("Status", "P"),
        })

    elif table_name == "mutual_fund_holding":
        base_data.update({
            "account_name": account.account_name,
            "mastersheet_tag": item.get("Mastersheet Tag"),
            "date": serialize_date(item.get("Date")),
            "trade_type": item.get("Trade Type"),
            "symbol": item.get("Symbol"),
            "isin": item.get("ISIN"),
            "quantity": safe_decimal(item.get("Quantity"), "Quantity", index),
            "price": safe_decimal(item.get("Price"), "Price", index),
            "broker": item.get("Broker") or None,
            "debt_equity": item.get("Debt Equity") or None,
            "collateral": item.get("Collateral") or None,
            "sub_category": item.get("Sub Category") or None,
            "status": item.get("Status", "P"),
        })

    elif table_name == "gold_tradebook":
        base_data.update({
            "account_name": account.account_name,
            "mastersheet_tag": item.get("Mastersheet Tag"),
            "action": item.get("Action") or None,
            "basket": item.get("Basket") or None,
            "date": serialize_date(item.get("Date")),
            "trade_type": item.get("Trade Type"),
            "symbol": item.get("Symbol"),
            "expiry": serialize_date(item.get("Expiry")) if item.get("Expiry") else None,
            "exchange": item.get("Exchange") or None,
            "quantity": safe_int(item.get("Quantity"), "Quantity", index),
            "lotsize": safe_int(item.get("Lotsize"), "Lotsize", index),
            "no_of_lots": safe_int(item.get("No of Lots"), "No of Lots", index),
            "price": safe_decimal(item.get("Price"), "Price", index),
            "exposure": safe_decimal(item.get("Exposure"), "Exposure", index),
            "status": item.get("Status", "P"),
        })

    elif table_name == "liquidbees_tradebook":
        base_data.update({
            "account": account.account_name,
            "mastersheet_tag": item.get("Mastersheet Tag"),
            "date": serialize_date(item.get("Date")),
            "trade_type": item.get("Trade Type"),
            "symbol": item.get("Symbol"),
            "exchange": item.get("Exchange") or None,
            "quantity": safe_int(item.get("Quantity"), "Quantity", index),
            "price": safe_decimal(item.get("Price"), "Price", index),
            "broker": item.get("Broker") or None,
            "debt_equity": item.get("Debt Equity") or None,
            "collateral": item.get("Collateral") or None,
            "sub_category": item.get("Sub Category") or None,
            "status": item.get("Status", "P"),
        })

    elif table_name == "equity_holding":
        raw_date = _today_iso_kolkata()
        base_data.update({
            qcode : qcode,
            "mastersheet_tag": item.get("Mastersheet Tag"),
            "date": serialize_date(raw_date),  # always set, defaulted if missing
            "trade_type": item.get("Trade Type"),
            "symbol": item.get("Symbol"),
            "exchange": item.get("Exchange") or None,
            "quantity": safe_int(item.get("Quantity"), "Quantity", index),
            "price": safe_decimal(item.get("Price"), "Price", index),
            "broker": item.get("Broker") or None,
            "debt_equity": item.get("Debt Equity") or None,
            "collateral": item.get("Collateral") or None,
            "sub_category": item.get("Sub Category") or None,
            "exposure": safe_decimal(item.get("Exposure"), "Exposure", index),
            "status": item.get("Status", "P"),  # sensible default
        })

    elif table_name == "equity_holding_test":
        raw_date = _today_iso_kolkata()
        base_data.update({
            "qcode": qcode,
            "date": serialize_date(raw_date),
            "symbol": item.get("Symbol"),
            "mastersheet_tag": item.get("Mastersheet Tag"),
            "exchange": item.get("Exchange") or None,
            "quantity": safe_int(item.get("Quantity"), "Quantity", index),
            "avg_price": safe_decimal(item.get("Avg Price"), "Avg Price", index),
            "broker": item.get("Broker") or None,
            "debt_equity": item.get("Debt/Equity") or None,
            "sub_category": item.get("Sub Category") or None,
            "ltp": safe_decimal(item.get("LTP"), "LTP", index),
            "buy_value": safe_decimal(item.get("Buy Value"), "Buy Value", index),
            "value_as_of_today": safe_decimal(item.get("Value as of Today"), "Value as of Today", index),
            "pnl_amount": safe_decimal(item.get("PNL Amount"), "PNL Amount", index),
            "percent_pnl": safe_decimal(item.get("% PNL"), "% PNL", index) if item.get("% PNL") and str(item.get("% PNL")).lower() not in ["inf", "-inf"] else None,
            "status": item.get("Status", "P"),
        })

    elif table_name == "mutual_fund_holding_sheet_test":
        base_data.update({
            "qcode": qcode,
            "as_of_date": serialize_date(item.get("As of Date")),
            "symbol": item.get("Symbol"),
            "isin": item.get("ISIN"),
            "scheme_code": item.get("Scheme Code") or None,
            "quantity": safe_decimal(item.get("Quantity"), "Quantity", index),
            "avg_price": safe_decimal(item.get("Avg Price"), "Avg Price", index),
            "broker": item.get("Broker") or None,
            "debt_equity": item.get("Debt/Equity") or None,
            "mastersheet_tag": item.get("Mastersheet Tag"),
            "sub_category": item.get("Sub Category") or None,
            "nav": safe_decimal(item.get("NAV"), "NAV", index),
            "buy_value": safe_decimal(item.get("Buy Value"), "Buy Value", index),
            "value_as_of_today": safe_decimal(item.get("Value as of Today"), "Value as of Today", index),
            "pnl_amount": safe_decimal(item.get("PNL Amount"), "PNL Amount", index),
            "percent_pnl": safe_decimal(item.get("% PNL"), "% PNL", index) if item.get("% PNL") and str(item.get("% PNL")).lower() not in ["inf", "-inf"] else None,
            "status": item.get("Status", "P"),
        })

    elif table_name == "capital_in_out":
        base_data.update({
            "date": serialize_date(item.get("Date")),
            "account": item.get("Account") or account.account_name,
            "system_tag": item.get("System Tag"),
            "capital_in_out": safe_decimal(item.get("Capital In/Out"), "Capital In/Out", index),
            "status": item.get("Status", "P"),
        })

    else:
        raise ValueError(f"Unknown table name: {table_name}")

    return base_data

async def process_batch_with_retry(
    db: Prisma,
    table_name: str,
    batch_data: List[Dict[str, Any]],
    batch_number: int,
    max_retries: int = 3,
) -> Tuple[int, List[Dict[str, Any]]]:
    """Process a batch with retry logic for failed inserts."""
    success_count = 0
    failed_rows: List[Dict[str, Any]] = []

    for attempt in range(max_retries):
        try:
            await getattr(db, table_name).create_many(data=batch_data, skip_duplicates=True)
            success_count = len(batch_data)
            break
        except PrismaError as e:
            if attempt < max_retries - 1:
                logger.warning(
                    f"Batch insert failed for {table_name} batch {batch_number}, attempt {attempt + 1}: {str(e)}. Retrying..."
                )
                await asyncio.sleep(DatabaseConfig.RETRY_DELAY * (attempt + 1))
                continue

            # Final attempt failed, try individual inserts
            logger.warning(
                f"Batch insert failed for {table_name} batch {batch_number}: {str(e)}. Trying individual inserts."
            )

            for j, item in enumerate(batch_data):
                try:
                    await getattr(db, table_name).create(data=item)
                    success_count += 1
                except Exception as individual_error:
                    logger.warning(
                        f"Individual insert failed for item {j + 1} in batch {batch_number}: {str(individual_error)}"
                    )
                    failed_rows.append(
                        {
                            "row_index": j + 1,
                            "row": item,
                            "error": str(individual_error),
                        }
                    )
            break

    return success_count, failed_rows

async def insert_data(
    db: Prisma,
    data: List[Dict[str, Any]],
    table_name: str,
    qcode: str,
    batch_size: Optional[int] = None,
) -> Tuple[int, List[Dict[str, Any]]]:
    """
    Generic function to insert data into a specified table with batch processing and validation.
    """
    if not data:
        logger.info("No data provided for insertion")
        return 0, []

    if table_name not in ALLOWED_TABLES:
        raise DatabaseOperationError(f"Invalid table name: {table_name}")

    # Validate qcode and get account info
    account = await validate_qcode(db, qcode)

    batch_size = batch_size or DatabaseConfig.BATCH_SIZE
    success_count = 0
    failed_rows: List[Dict[str, Any]] = []

    # Log initial state
    initial_count = await get_table_count(db, table_name, qcode)
    logger.info(f"Starting insert operation - {table_name}: {initial_count} existing records")

    async with database_transaction(db):
        # Process data in batches
        for i in range(0, len(data), batch_size):
            batch = data[i : i + batch_size]
            batch_data: List[Dict[str, Any]] = []
            batch_number = i // batch_size + 1

            # Validate and serialize each item in the batch
            for index, item in enumerate(batch, start=i + 1):
                try:
                    serialized_item = serialize_table_item(item, table_name, qcode, account, index)
                    batch_data.append(serialized_item)
                except (DataValidationError, ValueError) as e:
                    logger.warning(f"Validation failed for row {index} in {table_name}: {str(e)}")
                    failed_rows.append(
                        {
                            "row_index": index,
                            "row": item,
                            "error": f"Validation error: {str(e)}",
                        }
                    )
                    continue
                except Exception as e:
                    logger.error(f"Unexpected error for row {index} in {table_name}: {str(e)}")
                    failed_rows.append(
                        {
                            "row_index": index,
                            "row": item,
                            "error": f"Unexpected error: {str(e)}",
                        }
                    )
                    continue

            # Insert batch if there's valid data
            if batch_data:
                logger.debug(f"Processing batch {batch_number} with {len(batch_data)} rows for {table_name}")
                batch_success, batch_failed = await process_batch_with_retry(
                    db, table_name, batch_data, batch_number
                )
                success_count += batch_success
                failed_rows.extend(batch_failed)

    # Log final state
    final_count = await get_table_count(db, table_name, qcode)
    logger.info(
        f"Insert operation completed - {table_name}: {final_count} total records, {success_count} inserted, {len(failed_rows)} failed"
    )

    return success_count, failed_rows

async def delete_data(db: Prisma, qcode: str, start_date: str, end_date: str, table_name: str) -> int:
    """
    Delete records from the specified table within the given date range for the qcode.
    """
    if table_name not in ALLOWED_TABLES:
        raise DatabaseOperationError(f"Invalid table name: {table_name}")

    # Validate qcode
    await validate_qcode(db, qcode)

    # Validate date format
    try:
        datetime.strptime(start_date, "%Y-%m-%d")
        datetime.strptime(end_date, "%Y-%m-%d")
    except ValueError as e:
        raise DatabaseOperationError(f"Invalid date format: {e}")

    try:
        date_field = DATE_FIELD_MAPPING.get(table_name, "date")
        delete_query = (
            f'DELETE FROM "{table_name}" WHERE qcode = $1 AND {date_field} >= $2::date AND {date_field} <= $3::date'
        )

        result = await db.execute_raw(delete_query, qcode, start_date, end_date)
        logger.info(
            f"Deleted {result} records from {table_name} for qcode {qcode} between {start_date} and {end_date}"
        )
        return result

    except PrismaError as e:
        logger.error(f"Error deleting records from {table_name}: {str(e)}")
        raise DatabaseOperationError(f"Failed to delete records: {str(e)}")

async def replace_data(
    db: Prisma,
    data: List[Dict[str, Any]],
    table_name: str,
    qcode: str,
    batch_size: Optional[int] = None,
) -> Tuple[int, List[Dict[str, Any]]]:
    """
    Replace all records in the specified table for the qcode with new data.
    """
    if table_name not in ALLOWED_TABLES:
        raise DatabaseOperationError(f"Invalid table name: {table_name}")

    # Validate qcode
    await validate_qcode(db, qcode)

    try:
        async with database_transaction(db):
            # Delete all existing records for the qcode
            delete_query = f'DELETE FROM "{table_name}" WHERE qcode = $1'
            deleted_count = await db.execute_raw(delete_query, qcode)
            logger.info(f"Deleted {deleted_count} existing records from {table_name} for qcode {qcode}")

            # Insert new data
            success_count, failed_rows = await insert_data(db, data, table_name, qcode, batch_size)
            logger.info(
                f"Replaced data in {table_name} for qcode {qcode}: {success_count} inserted, {len(failed_rows)} failed"
            )

            return success_count, failed_rows

    except Exception as e:
        logger.error(f"Error replacing records in {table_name}: {str(e)}")
        raise DatabaseOperationError(f"Failed to replace records: {str(e)}")

async def get_data_summary(db: Prisma, qcode: str, table_name: Optional[str] = None) -> Dict[str, Any]:
    """
    Get a summary of data for a specific qcode.
    """
    await validate_qcode(db, qcode)

    if table_name:
        if table_name not in ALLOWED_TABLES:
            raise DatabaseOperationError(f"Invalid table name: {table_name}")
        tables_to_check = [table_name]
    else:
        tables_to_check = list(ALLOWED_TABLES)

    summary: Dict[str, Any] = {}

    for table in tables_to_check:
        try:
            count = await get_table_count(db, table, qcode)

            # Get date range if applicable
            date_field = DATE_FIELD_MAPPING.get(table, "date")
            date_range_query = f'''
                SELECT MIN({date_field}) as min_date, MAX({date_field}) as max_date 
                FROM "{table}" WHERE qcode = $1
            '''
            date_range = await db.query_first(date_range_query, qcode)

            summary[table] = {
                "record_count": count,
                "date_range": {
                    "min_date": date_range.get("min_date") if date_range else None,
                    "max_date": date_range.get("max_date") if date_range else None,
                },
            }
        except Exception as e:
            logger.error(f"Error getting summary for {table}: {e}")
            summary[table] = {"error": str(e)}

    return summary
