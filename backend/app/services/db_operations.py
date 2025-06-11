from prisma import Prisma
from app.models.schemas import MasterSheet
import logging
from typing import List, Dict, Any, Tuple
from prisma.errors import PrismaError
from datetime import datetime, date, timezone
from decimal import Decimal, InvalidOperation
from pydantic import ValidationError

logger = logging.getLogger(__name__)

# Whitelist of allowed table names to prevent SQL injection
ALLOWED_TABLES = {
    "master_sheet",
    "tradebook",
    "slippage",
    "mutual_fund_holding",
    "gold_tradebook",
    "liquidbees_tradebook",
    "equity_holding",
    "capital_in_out"
}

def serialize_date(value: Any) -> str:
    """Ensure any date or datetime is converted to an ISO-8601 datetime string."""
    if isinstance(value, date) and not isinstance(value, datetime):
        value = datetime.combine(value, datetime.min.time())
    if isinstance(value, datetime) and value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()

def safe_decimal(value: Any, field_name: str, row_index: int) -> Decimal:
    """Safely convert a value to Decimal, handling invalid cases."""
    if value is None or str(value).strip() == "":
        return None
    try:
        cleaned_value = str(value).replace(",", "").strip()
        return Decimal(cleaned_value)
    except (InvalidOperation, ValueError) as e:
        raise ValueError(f"Invalid {field_name} at row {row_index}: {value}")

async def insert_data(db: Prisma, data: List[Dict[str, Any]], table_name: str, qcode: str) -> Tuple[int, List[Dict[str, Any]]]:
    """
    Generic function to insert data into a specified table with batch processing and validation.
    """
    success_count = 0
    failed_rows = []
    batch_size = 500

    if table_name not in ALLOWED_TABLES:
        raise ValueError(f"Invalid table name: {table_name}")

    account = await db.accounts.find_first(where={"qcode": qcode})
    if not account:
        raise ValueError(f"Invalid qcode: {qcode}")

    initial_count = await db.query_first(
        f'SELECT COUNT(*) as count FROM "{table_name}" WHERE qcode = $1',
        qcode
    )
    logger.debug(f"Initial row count - {table_name}: {initial_count['count'] if initial_count else 0}")

    for i in range(0, len(data), batch_size):
        batch = data[i:i + batch_size]
        batch_data = []

        for index, item in enumerate(batch, start=i + 1):
            serialized_item = {
                "qcode": qcode,
                "created_at": serialize_date(datetime.now(timezone.utc))
            }

            try:
                if table_name == "master_sheet":
                    date_str = item.get("Date")
                    if not date_str:
                        raise ValueError(f"Missing Date at row {index}")

                    try:
                        date_obj = datetime.strptime(date_str, "%Y-%m-%d").date()
                    except ValueError:
                        raise ValueError(f"Invalid Date format at row {index}: {date_str}, expected YYYY-MM-DD")

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
                        created_at=datetime.now(timezone.utc).date()
                    )

                    serialized_item.update({
                        k: serialize_date(v) if isinstance(v, (date, datetime)) else v
                        for k, v in master_sheet.dict(exclude_none=True).items()
                    })

                elif table_name == "tradebook":
                    serialized_item.update({
                        "qcode": qcode,
                        "timestamp_entry": serialize_date(datetime.strptime(item["Timestamp Entry"], "%Y-%m-%d %H:%M:%S")),
                        "system_tag_entry": item["System Tag Entry"],
                        "action_entry": item["Action Entry"],
                        "symbol_entry": item["Symbol Entry"],
                        "price_entry": safe_decimal(item.get("Price Entry"), "Price Entry", index),
                        "qty_entry": int(item["Qty Entry"]) if item.get("Qty Entry") else None,
                        "contract_value_entry": safe_decimal(item.get("Contract Value Entry"), "Contract Value Entry", index),
                        "timestamp_exit": serialize_date(datetime.strptime(item["Timestamp Exit"], "%Y-%m-%d %H:%M:%S")) if item.get("Timestamp Exit") else None,
                        "system_tag_exit": item.get("System Tag Exit") or None,
                        "action_exit": item.get("Action Exit") or None,
                        "symbol_exit": item.get("Symbol Exit") or None,
                        "price_exit": safe_decimal(item.get("Price Exit"), "Price Exit", index),
                        "qty_exit": int(item["Qty Exit"]) if item.get("Qty Exit") else None,
                        "contract_value_exit": safe_decimal(item.get("Contract Value Exit"), "Contract Value Exit", index),
                        "pnl_amount": safe_decimal(item.get("Pnl Amount"), "Pnl Amount", index),
                        "pnl_amount_settlement": safe_decimal(item.get("Pnl Amount Settlement"), "Pnl Amount Settlement", index),
                        "status": item.get("Status", "P")
                    })
                elif table_name == "slippage":
                    serialized_item.update({
                        "qcode": qcode,
                        "date": serialize_date(datetime.strptime(item["Date"], "%Y-%m-%d")),
                        "account": item.get("Account") or account.account_name,
                        "system_tag": item["System Tag"],
                        "capital_in_out": safe_decimal(item.get("Capital In/Out"), "Capital In/Out", index),
                        "status": item.get("Status", "P")
                    })
                elif table_name == "mutual_fund_holding":
                    serialized_item.update({
                        "qcode": qcode,
                        "account_name": account.account_name,
                        "mastersheet_tag": item["Mastersheet Tag"],
                        "date": serialize_date(datetime.strptime(item["Date"], "%Y-%m-%d")),
                        "trade_type": item["Trade Type"],
                        "symbol": item["Symbol"],
                        "isin": item["ISIN"],
                        "quantity": safe_decimal(item.get("Quantity"), "Quantity", index),
                        "price": safe_decimal(item.get("Price"), "Price", index),
                        "broker": item.get("Broker") or None,
                        "debt_equity": item.get("Debt Equity") or None,
                        "collateral": item.get("Collateral") or None,
                        "sub_category": item.get("Sub Category") or None,
                        "status": item.get("Status", "P")
                    })
                elif table_name == "gold_tradebook":
                    serialized_item.update({
                        "qcode": qcode,
                        "account_name": account.account_name,
                        "mastersheet_tag": item["Mastersheet Tag"],
                        "action": item.get("Action") or None,
                        "basket": item.get("Basket") or None,
                        "date": serialize_date(datetime.strptime(item["Date"], "%Y-%m-%d")),
                        "trade_type": item["Trade Type"],
                        "symbol": item["Symbol"],
                        "expiry": serialize_date(datetime.strptime(item["Expiry"], "%Y-%m-%d")) if item.get("Expiry") else None,
                        "exchange": item.get("Exchange") or None,
                        "quantity": int(item["Quantity"]) if item.get("Quantity") else None,
                        "lotsize": int(item["Lotsize"]) if item.get("Lotsize") else None,
                        "no_of_lots": int(item["No of Lots"]) if item.get("No of Lots") else None,
                        "price": safe_decimal(item.get("Price"), "Price", index),
                        "exposure": safe_decimal(item.get("Exposure"), "Exposure", index),
                        "status": item.get("Status", "P")
                    })
                elif table_name == "liquidbees_tradebook":
                    serialized_item.update({
                        "qcode": qcode,
                        "account": account.account_name,
                        "mastersheet_tag": item["Mastersheet Tag"],
                        "date": serialize_date(datetime.strptime(item["Date"], "%Y-%m-%d")),
                        "trade_type": item["Trade Type"],
                        "symbol": item["Symbol"],
                        "exchange": item.get("Exchange") or None,
                        "quantity": int(item["Quantity"]) if item.get("Quantity") else None,
                        "price": safe_decimal(item.get("Price"), "Price", index),
                        "broker": item.get("Broker") or None,
                        "debt_equity": item.get("Debt Equity") or None,
                        "collateral": item.get("Collateral") or None,
                        "sub_category": item.get("Sub Category") or None,
                        "status": item.get("Status", "P")
                    })
                elif table_name == "equity_holding":
                    serialized_item.update({
                        "qcode": qcode,
                        "account": item.get("Account") or account.account_name,
                        "mastersheet_tag": item["Mastersheet Tag"],
                        "date": serialize_date(datetime.strptime(item["Date"], "%Y-%m-%d")),
                        "trade_type": item["Trade Type"],
                        "symbol": item["Symbol"],
                        "exchange": item.get("Exchange") or None,
                        "quantity": int(item["Quantity"]) if item.get("Quantity") else None,
                        "price": safe_decimal(item.get("Price"), "Price", index),
                        "broker": item.get("Broker") or None,
                        "debt_equity": item.get("Debt Equity") or None,
                        "collateral": item.get("Collateral") or None,
                        "sub_category": item.get("Sub Category") or None,
                        "exposure": safe_decimal(item.get("Exposure"), "Exposure", index),
                        "status": item.get("Status") or None
                    })
                elif table_name == "capital_in_out":
                    serialized_item.update({
                        "qcode": qcode,
                        "date": serialize_date(datetime.strptime(item["Date"], "%Y-%m-%d")),
                        "account": item.get("Account") or account.account_name,
                        "system_tag": item["System Tag"],
                        "capital_in_out": safe_decimal(item.get("Capital In/Out"), "Capital In/Out", index),
                        "status": item.get("Status", "P")
                    })

                batch_data.append(serialized_item)

            except (ValidationError, ValueError) as e:
                logger.warning(f"Validation failed for row {index} in {table_name}: {str(e)}")
                failed_rows.append({
                    "row_index": index,
                    "row": item,
                    "error": f"Validation error: {str(e)}"
                })
                continue
            except Exception as e:
                logger.warning(f"Unexpected error for row {index} in {table_name}: {str(e)}")
                failed_rows.append({
                    "row_index": index,
                    "row": item,
                    "error": f"Unexpected error: {str(e)}"
                })
                continue

        if batch_data:
            logger.debug(f"Processing batch {i//batch_size + 1} with {len(batch_data)} rows for {table_name}")

            try:
                await getattr(db, table_name).create_many(data=batch_data, skip_duplicates=True)
                success_count += len(batch_data)
            except PrismaError as e:
                logger.warning(f"Batch insert failed for {table_name} batch {i//batch_size + 1}: {str(e)}")

                for j, item in enumerate(batch_data):
                    try:
                        await getattr(db, table_name).create(data=item)
                        success_count += 1
                    except Exception as e:
                        logger.warning(f"Individual insert failed for row {i + j + 1} in {table_name}: {str(e)}")
                        failed_rows.append({
                            "row_index": i + j + 1,
                            "row": item,
                            "error": str(e)
                        })

    final_count = await db.query_first(
        f'SELECT COUNT(*) as count FROM "{table_name}" WHERE qcode = $1',
        qcode
    )
    logger.debug(f"Final row count - {table_name}: {final_count['count'] if final_count else 0}")

    return success_count, failed_rows

async def delete_data(db: Prisma, qcode: str, start_date: str, end_date: str, table_name: str) -> int:
    """
    Delete records from the specified table within the given date range for the qcode.
    """
    if table_name not in ALLOWED_TABLES:
        raise ValueError(f"Invalid table name: {table_name}")

    try:
        date_field = "date" if table_name != "tradebook" else "timestamp_entry"
        delete_query = (
            f'DELETE FROM "{table_name}" WHERE qcode = $1 AND {date_field} >= $2::date AND {date_field} <= $3::date'
        )
        result = await db.execute_raw(
            delete_query,
            qcode,
            start_date,
            end_date
        )
        logger.debug(f"Deleted {result} records from {table_name} for qcode {qcode} between {start_date} and {end_date}")
        return result
    except PrismaError as e:
        logger.error(f"Error deleting records from {table_name}: {str(e)}")
        raise

async def replace_data(db: Prisma, data: List[Dict[str, Any]], table_name: str, qcode: str) -> Tuple[int, List[Dict[str, Any]]]:
    """
    Replace all records in the specified table for the qcode with new data.
    """
    if table_name not in ALLOWED_TABLES:
        raise ValueError(f"Invalid table name: {table_name}")

    try:
        # Delete all existing records for the qcode
        delete_query = f'DELETE FROM "{table_name}" WHERE qcode = $1'
        deleted_count = await db.execute_raw(delete_query, qcode)
        logger.debug(f"Deleted {deleted_count} existing records from {table_name} for qcode {qcode}")

        # Insert new data
        success_count, failed_rows = await insert_data(db, data, table_name, qcode)
        logger.debug(f"Inserted {success_count} new records into {table_name} for qcode {qcode}")

        return success_count, failed_rows
    except PrismaError as e:
        logger.error(f"Error replacing records in {table_name}: {str(e)}")
        raise