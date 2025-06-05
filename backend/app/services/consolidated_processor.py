import pandas as pd
from io import BytesIO
from typing import List, Dict, Any
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

def process_and_consolidate_csv(
    transaction_content: bytes, 
    holding_content: bytes,
    transaction_filename: str = "transaction.csv",
    holding_filename: str = "holding.csv"
) -> List[Dict[str, Any]]:
    """
    Process Transaction Class and Holding Asset Class files (CSV, XLSX, XLS) and generate a consolidated sheet.
    Returns a list of dictionaries with account_code, portfolio_value, nav, pnl, and drawdown.
    """
    
    # Updated required columns based on your actual data
    required_columns = {
        "transaction_class": [
            "WS CLIENT ID",
            "WS ACCOUNT CODE", 
            "CLIENT NAME",
            "TRANDATE",
            "QTY",
            "RATE", 
            "NET AMOUNT",
            "SECURITY NAME",
            "SECURITY TYPE",
            "ISIN"
        ],
        "holding_asset_class": [
            "WS CLIENT ID",
            "WS ACCOUNT CODE",
            "CLIENT NAME", 
            "HOLDINGDATE",
            "HOLDING QTY",
            "UNITCOST",
            "MKTVALUE", 
            "SECURITY NAME",
            "ASTCLS"
        ]
    }

    # Process transaction file
    transaction_data, transaction_failed = _parse_file(
        transaction_content,
        transaction_filename,
        "transaction_class",
        required_columns["transaction_class"]
    )
    
    # Process holding file
    holding_data, holding_failed = _parse_file(
        holding_content,
        holding_filename,
        "holding_asset_class",
        required_columns["holding_asset_class"]
    )

    # Log failed rows
    if transaction_failed:
        logger.warning(f"Failed to process {len(transaction_failed)} transaction rows: {transaction_failed[:5]}")
    if holding_failed:
        logger.warning(f"Failed to process {len(holding_failed)} holding rows: {holding_failed[:5]}")

    # Generate consolidated data
    result = _calculate_consolidated_metrics(transaction_data, holding_data)
    
    logger.info(f"Generated {len(result)} consolidated records")
    return result

def _parse_file(
    content: bytes,
    filename: str,
    table_name: str,
    required_columns: List[str]
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Parse a file (CSV, XLSX, XLS) by extension-first, with CSV-then-Excel fallback.
    """
    data = []
    failed_rows = []
    file_io = BytesIO(content)

    # Determine format by extension
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    is_csv = ext == "csv"
    is_excel = ext in ("xls", "xlsx")

    # Read into DataFrame
    try:
        if is_csv:
            df = pd.read_csv(file_io)
        elif is_excel:
            try:
                df = pd.read_excel(file_io, engine="openpyxl")
            except Exception:
                file_io.seek(0)
                df = pd.read_excel(file_io, engine="xlrd")
        else:
            # Unknown extension → try CSV first, then Excel
            try:
                df = pd.read_csv(file_io)
            except Exception:
                file_io.seek(0)
                try:
                    df = pd.read_excel(file_io, engine="openpyxl")
                except Exception:
                    file_io.seek(0)
                    df = pd.read_excel(file_io, engine="xlrd")
    except Exception as e:
        raise ValueError(f"Failed to parse {table_name} file '{filename}': {e}")

    # Clean and normalize column names
    df.columns = [str(col).strip() for col in df.columns]
    
    # Create header mapping for case-insensitive matching
    header_mapping = {}
    available_columns = list(df.columns)
    
    for col in df.columns:
        # Try exact match first
        if col in required_columns:
            header_mapping[col] = col
        else:
            # Try case-insensitive match
            for expected in required_columns:
                if col.upper() == expected.upper():
                    header_mapping[col] = expected
                    break
            else:
                header_mapping[col] = col

    # Validate required columns are present
    normalized_columns = [header_mapping.get(c, c) for c in df.columns]
    missing_columns = [c for c in required_columns if c not in normalized_columns]
    
    if missing_columns:
        logger.error(f"Available columns in {filename}: {available_columns}")
        raise ValueError(
            f"Missing required columns in {table_name} ('{filename}'): {missing_columns}. "
            f"Available columns: {available_columns}"
        )

    # Build row dictionaries
    for idx, row in df.iterrows():
        try:
            # Skip empty rows
            if row.isna().all():
                continue
                
            normalized_row = {}
            for col in df.columns:
                mapped_col = header_mapping.get(col, col)
                value = row[col]
                
                # Handle NaN values
                if pd.isna(value):
                    normalized_row[mapped_col] = None
                else:
                    # Convert to string for consistent handling
                    normalized_row[mapped_col] = str(value).strip() if isinstance(value, str) else value
            
            data.append(normalized_row)
            
        except Exception as e:
            failed_rows.append({
                "row_index": idx + 2,  # +2 because pandas is 0-indexed and we have header
                "error": str(e),
                "row": row.to_dict(),
            })

    logger.info(f"Successfully parsed {len(data)} rows from {filename}")
    return data, failed_rows

def _calculate_consolidated_metrics(
    transaction_data: List[Dict[str, Any]], 
    holding_data: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Calculate consolidated metrics: portfolio_value, nav, pnl, drawdown
    """
    
    # Group data by account code and date
    account_data: Dict[str, Dict[str, Any]] = {}
    
    # Process holding data first (for portfolio values)
    for row in holding_data:
        try:
            account_code = str(row.get("WS ACCOUNT CODE", "")).strip()
            if not account_code:
                continue
                
            holding_date = row.get("HOLDINGDATE")
            mkt_value = row.get("MKTVALUE")
            
            # Parse and validate date
            if not holding_date:
                continue
                
            try:
                # Handle various date formats
                if isinstance(holding_date, str):
                    date_obj = pd.to_datetime(holding_date, errors='coerce', dayfirst=True)
                else:
                    date_obj = pd.to_datetime(holding_date, errors='coerce')
                    
                if pd.isna(date_obj):
                    logger.warning(f"Invalid holding date: {holding_date}")
                    continue
                    
                date_key = date_obj.strftime("%Y-%m-%d")
            except Exception as e:
                logger.warning(f"Date parsing error for {holding_date}: {e}")
                continue
            
            # Parse market value
            try:
                mkt_value = float(mkt_value or 0)
            except (ValueError, TypeError):
                logger.warning(f"Invalid MKTVALUE: {mkt_value}")
                mkt_value = 0
            
            # Initialize account data structure
            if account_code not in account_data:
                account_data[account_code] = {
                    "dates": {},
                    "peak_portfolio_value": 0
                }
            
            # Initialize date data
            if date_key not in account_data[account_code]["dates"]:
                account_data[account_code]["dates"][date_key] = {
                    "portfolio_value": 0,
                    "capital_flows": 0,  # Net capital in/out from transactions
                }
            
            # Accumulate portfolio value for the date
            account_data[account_code]["dates"][date_key]["portfolio_value"] += mkt_value
            
        except Exception as e:
            logger.warning(f"Error processing holding row: {e}, row: {row}")
            continue
    
    # Process transaction data (for capital flows)
    for row in transaction_data:
        try:
            account_code = str(row.get("WS ACCOUNT CODE", "")).strip()
            if not account_code:
                continue
                
            tran_date = row.get("TRANDATE")
            net_amount = row.get("NET AMOUNT")
            
            # Parse and validate date
            if not tran_date:
                continue
                
            try:
                if isinstance(tran_date, str):
                    date_obj = pd.to_datetime(tran_date, errors='coerce', dayfirst=True)
                else:
                    date_obj = pd.to_datetime(tran_date, errors='coerce')
                    
                if pd.isna(date_obj):
                    logger.warning(f"Invalid transaction date: {tran_date}")
                    continue
                    
                date_key = date_obj.strftime("%Y-%m-%d")
            except Exception as e:
                logger.warning(f"Date parsing error for {tran_date}: {e}")
                continue
            
            # Parse net amount
            try:
                net_amount = float(net_amount or 0)
            except (ValueError, TypeError):
                logger.warning(f"Invalid NET AMOUNT: {net_amount}")
                net_amount = 0
            
            # Initialize account data if not exists
            if account_code not in account_data:
                account_data[account_code] = {
                    "dates": {},
                    "peak_portfolio_value": 0
                }
            
            # Initialize date data if not exists
            if date_key not in account_data[account_code]["dates"]:
                account_data[account_code]["dates"][date_key] = {
                    "portfolio_value": 0,
                    "capital_flows": 0,
                }
            
            # Accumulate capital flows (positive for money in, negative for money out)
            account_data[account_code]["dates"][date_key]["capital_flows"] += net_amount
            
        except Exception as e:
            logger.warning(f"Error processing transaction row: {e}, row: {row}")
            continue
    
    # Calculate metrics and generate result
    result = []
    
    for account_code, data in account_data.items():
        if not data["dates"]:
            continue
            
        # Sort dates chronologically
        sorted_dates = sorted(data["dates"].keys())
        
        # Calculate running metrics
        previous_nav = 0
        peak_portfolio_value = 0
        
        for date_key in sorted_dates:
            date_data = data["dates"][date_key]
            
            portfolio_value = date_data["portfolio_value"]
            capital_flows = date_data["capital_flows"]
            
            # NAV calculation: current portfolio value
            nav = portfolio_value
            
            # PnL calculation: change in portfolio value minus capital flows
            pnl = nav - previous_nav - capital_flows
            
            # Update peak for drawdown calculation
            peak_portfolio_value = max(peak_portfolio_value, portfolio_value)
            
            # Drawdown calculation: percentage decline from peak
            if peak_portfolio_value > 0:
                drawdown = (peak_portfolio_value - portfolio_value) / peak_portfolio_value
            else:
                drawdown = 0
            
            result.append({
                "account_code": account_code,
                "portfolio_value": round(portfolio_value, 4),
                "nav": round(nav, 4),
                "pnl": round(pnl, 4),
                "drawdown": round(drawdown * 100, 4),  # Convert to percentage
                "date": date_key
            })
            
            # Update previous NAV for next iteration
            previous_nav = nav
    
    # Sort result by account code and date
    result.sort(key=lambda x: (x["account_code"], x["date"]))
    
    return result