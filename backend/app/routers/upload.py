from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from prisma import Prisma
from prisma.errors import PrismaError
from services.csv_processor import process_csv
from services.db_operations import insert_data, delete_data, replace_data
from config.database import get_db
import logging
import re
from typing import Optional, Dict, Any
from datetime import datetime
import traceback
from python_multipart.exceptions import MultipartParseError
import time
from config.constants import TABLE_COLUMNS

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["upload"])

async def upload_csv(
    file: UploadFile,
    qcode: str,
    startDate: Optional[str],
    endDate: Optional[str],
    db: Prisma,
    table_name: str
):
    start_time = time.time()
    logger.debug(f"Received upload request for {table_name}: qcode={qcode}, startDate={startDate}, endDate={endDate}, file={file.filename}")

    try:
        # Validate inputs
        if not file.filename.endswith(".csv"):
            logger.error(f"Invalid file format: {file.filename}")
            raise HTTPException(status_code=400, detail="File must be a CSV")

        # Sanitize qcode
        if not re.match(r"^[a-z0-9_]+$", qcode.lower()):
            logger.error(f"Invalid qcode format: {qcode}")
            raise HTTPException(status_code=400, detail="Invalid qcode format")

        # Validate date range
        if (startDate and not endDate) or (endDate and not startDate):
            logger.error("Both startDate and endDate are required if one is provided")
            raise HTTPException(status_code=400, detail="Both startDate and endDate are required")
        if startDate and endDate:
            if not (re.match(r"^\d{4}-\d{2}-\d{2}$", startDate) and re.match(r"^\d{4}-\d{2}-\d{2}$", endDate)):
                logger.error(f"Invalid date format: startDate={startDate}, endDate={endDate}")
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
            try:
                start_date_obj = datetime.strptime(startDate, "%Y-%m-%d")
                end_date_obj = datetime.strptime(endDate, "%Y-%m-%d")
                if start_date_obj > end_date_obj:
                    logger.error("startDate cannot be after endDate")
                    raise HTTPException(status_code=400, detail="startDate cannot be after endDate")
            except ValueError as e:
                logger.error(f"Invalid date values: {str(e)}")
                raise HTTPException(status_code=400, detail=f"Invalid date values: {str(e)}")

        # Check if table exists
        table_exists = await db.query_first(
            f"""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = '{table_name}'
            ) as exists
            """
        )

        if not table_exists or not table_exists["exists"]:
            logger.error(f"Table {table_name} does not exist")
            raise HTTPException(status_code=400, detail=f"Table {table_name} does not exist")

        # Check user access to qcode
        account = await db.accounts.find_first(where={"qcode": qcode})
        if not account:
            logger.error(f"Invalid qcode: {qcode}")
            raise HTTPException(status_code=400, detail=f"Invalid qcode: {qcode}")

        # Process CSV
        content = await file.read()
        if not content:
            logger.error("Uploaded file is empty")
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        data, failed_rows = process_csv(content, qcode, table_name, startDate, endDate)

        # Insert data
        success_count, insert_failed_rows = await insert_data(db, data, table_name, qcode)
        failed_rows.extend(insert_failed_rows)

        total_duration = (time.time() - start_time) * 1000  # Convert to ms
        logger.info(f"Uploaded {success_count} records for {table_name} with qcode {qcode} in {total_duration:.2f}ms")

        # Log details of failed rows
        if failed_rows:
            logger.warning(f"Failed to process {len(failed_rows)} rows: {failed_rows[:5]}")

        return {
            "message": f"{success_count} rows inserted, {len(failed_rows)} failed",
            "total_rows": len(data) + len(failed_rows),
            "inserted_rows": success_count,
            "column_names": TABLE_COLUMNS[table_name],
            "first_error": failed_rows[0] if failed_rows else None,
            "failed_rows": failed_rows[:10]
        }
    except MultipartParseError as e:
        logger.error(f"Multipart parsing error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=f"Failed to parse multipart form data: {str(e)}")
    except PrismaError as e:
        logger.error(f"Database error during upload: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except ValueError as e:
        logger.error(f"Data processing error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=f"Data processing error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during upload: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

async def delete_records(
    qcode: str,
    startDate: str,
    endDate: str,
    table_name: str,
    db: Prisma
):
    start_time = time.time()
    logger.debug(f"Received delete request for {table_name}: qcode={qcode}, startDate={startDate}, endDate={endDate}")

    try:
        # Sanitize qcode
        if not re.match(r"^[a-z0-9_]+$", qcode.lower()):
            logger.error(f"Invalid qcode format: {qcode}")
            raise HTTPException(status_code=400, detail="Invalid qcode format")

        # Validate date range
        if not (re.match(r"^\d{4}-\d{2}-\d{2}$", startDate) and re.match(r"^\d{4}-\d{2}-\d{2}$", endDate)):
            logger.error(f"Invalid date format: startDate={startDate}, endDate={endDate}")
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        try:
            start_date_obj = datetime.strptime(startDate, "%Y-%m-%d")
            end_date_obj = datetime.strptime(endDate, "%Y-%m-%d")
            if start_date_obj > end_date_obj:
                logger.error("startDate cannot be after endDate")
                raise HTTPException(status_code=400, detail="startDate cannot be after endDate")
        except ValueError as e:
            logger.error(f"Invalid date values: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid date values: {str(e)}")

        # Check if table exists
        table_exists = await db.query_first(
            f"""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = '{table_name}'
            ) as exists
            """
        )

        if not table_exists or not table_exists["exists"]:
            logger.error(f"Table {table_name} does not exist")
            raise HTTPException(status_code=400, detail=f"Table {table_name} does not exist")

        # Check user access to qcode
        account = await db.accounts.find_first(where={"qcode": qcode})
        if not account:
            logger.error(f"Invalid qcode: {qcode}")
            raise HTTPException(status_code=400, detail=f"Invalid qcode: {qcode}")

        # Delete records
        deleted_count = await delete_data(db, qcode, startDate, endDate, table_name)

        total_duration = (time.time() - start_time) * 1000  # Convert to ms
        logger.info(f"Deleted {deleted_count} records from {table_name} with qcode {qcode} in {total_duration:.2f}ms")

        return {
            "message": f"Deleted {deleted_count} records",
            "deleted_count": deleted_count
        }
    except PrismaError as e:
        logger.error(f"Database error during deletion: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except ValueError as e:
        logger.error(f"Data processing error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=f"Data processing error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during deletion: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

async def replace_master_sheet(
    file: UploadFile,
    qcode: str,
    db: Prisma
):
    start_time = time.time()
    logger.debug(f"Received replace request for master_sheet: qcode={qcode}, file={file.filename}")

    try:
        # Validate inputs
        if not file.filename.endswith(".csv"):
            logger.error(f"Invalid file format: {file.filename}")
            raise HTTPException(status_code=400, detail="File must be a CSV")

        # Sanitize qcode
        if not re.match(r"^[a-z0-9_]+$", qcode.lower()):
            logger.error(f"Invalid qcode format: {qcode}")
            raise HTTPException(status_code=400, detail="Invalid qcode format")

        # Check if table exists
        table_exists = await db.query_first(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'master_sheet'
            ) as exists
            """
        )

        if not table_exists or not table_exists["exists"]:
            logger.error("Table master_sheet does not exist")
            raise HTTPException(status_code=400, detail="Table master_sheet does not exist")

        # Check user access to qcode
        account = await db.accounts.find_first(where={"qcode": qcode})
        if not account:
            logger.error(f"Invalid qcode: {qcode}")
            raise HTTPException(status_code=400, detail=f"Invalid qcode: {qcode}")

        # Process CSV
        content = await file.read()
        if not content:
            logger.error("Uploaded file is empty")
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        data, failed_rows = process_csv(content, qcode, "master_sheet", None, None)

        # Replace data (delete all existing and insert new)
        success_count, insert_failed_rows = await replace_data(db, data, "master_sheet", qcode)
        failed_rows.extend(insert_failed_rows)

        total_duration = (time.time() - start_time) * 1000  # Convert to ms
        logger.info(f"Replaced {success_count} records in master_sheet with qcode {qcode} in {total_duration:.2f}ms")

        return {
            "message": f"{success_count} rows inserted, {len(failed_rows)} failed",
            "total_rows": len(data) + len(failed_rows),
            "inserted_rows": success_count,
            "column_names": TABLE_COLUMNS["master_sheet"],
            "first_error": failed_rows[0] if failed_rows else None,
            "failed_rows": failed_rows[:10]
        }
    except MultipartParseError as e:
        logger.error(f"Multipart parsing error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=f"Failed to parse multipart form data: {str(e)}")
    except PrismaError as e:
        logger.error(f"Database error during replacement: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")
    except ValueError as e:
        logger.error(f"Data processing error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=f"Data processing error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during replacement: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

# Routes for each table upload
@router.post("/upload/master-sheet/")
async def upload_master_sheet(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    return await upload_csv(file, qcode, startDate, endDate, db, "master_sheet")

@router.post("/upload/tradebook/")
async def upload_tradebook(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    return await upload_csv(file, qcode, startDate, endDate, db, "tradebook")

@router.post("/upload/slippage/")
async def upload_slippage(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    return await upload_csv(file, qcode, startDate, endDate, db, "slippage")

@router.post("/upload/mutual-fund-holding/")
async def upload_mutual_fund_holding(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    return await upload_csv(file, qcode, startDate, endDate, db, "mutual_fund_holding")

@router.post("/upload/gold-tradebook/")
async def upload_gold_tradebook(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    return await upload_csv(file, qcode, startDate, endDate, db, "gold_tradebook")

@router.post("/upload/liquidbees-tradebook/")
async def upload_liquidbees_tradebook(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    return await upload_csv(file, qcode, startDate, endDate, db, "liquidbees_tradebook")

# Delete route
@router.post("/replace/delete/")
async def delete_records_route(
    data: Dict[str, Any],
    db: Prisma = Depends(get_db)
):
    try:
        qcode = data.get("qcode")
        startDate = data.get("startDate")
        endDate = data.get("endDate")
        table_name = data.get("table")

        if not all([qcode, startDate, endDate, table_name]):
            raise HTTPException(status_code=400, detail="Missing required fields: qcode, startDate, endDate, table")

        return await delete_records(qcode, startDate, endDate, table_name, db)
    except Exception as e:
        logger.error(f"Error in delete route: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Error processing delete request: {str(e)}")

# Replace route for master_sheet
@router.post("/replace/master-sheet/")
async def replace_master_sheet_route(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    db: Prisma = Depends(get_db)
):
    return await replace_master_sheet(file, qcode, db)