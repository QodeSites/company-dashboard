from fastapi import APIRouter, UploadFile, File, Form, Depends, HTTPException
from prisma import Prisma
from prisma.errors import PrismaError
from app.services.csv_processor import process_csv
from app.services.db_operations import insert_data, delete_data, replace_data, get_data_summary, DatabaseOperationError
from app.config.database import get_db
import logging
import re
from typing import Optional, Dict, Any, List
from datetime import datetime
import traceback
from python_multipart.exceptions import MultipartParseError
import time
from app.config.constants import TABLE_COLUMNS
from pydantic import BaseModel, validator

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["upload"])

# Request models for better validation
class DeleteRequest(BaseModel):
    qcode: str
    startDate: str
    endDate: str  
    table: str
    
    @validator('qcode')
    def validate_qcode(cls, v):
        if not re.match(r"^[a-z0-9_]+$", v.lower()):
            raise ValueError("Invalid qcode format")
        return v.lower()
    
    @validator('startDate', 'endDate')
    def validate_date_format(cls, v):
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("Invalid date format. Use YYYY-MM-DD")
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("Invalid date value")
        return v

# Table name mapping for URL to database table names
TABLE_NAME_MAPPING = {
    "master-sheet": "master_sheet",
    "tradebook": "tradebook", 
    "slippage": "slippage",
    "mutual-fund-holding": "mutual_fund_holding",
    "gold-tradebook": "gold_tradebook",
    "liquidbees-tradebook": "liquidbees_tradebook",
    "equity-holding": "equity_holding",
    "capital-in-out": "capital_in_out"
}

# Valid table names for validation - use the database table names
VALID_TABLE_NAMES = set(TABLE_NAME_MAPPING.values())

def validate_file_upload(file: UploadFile) -> None:
    """Validate uploaded file"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")
    
    if file.size and file.size > 50 * 1024 * 1024:  # 50MB limit
        raise HTTPException(status_code=400, detail="File too large. Maximum size is 50MB")

def validate_qcode_format(qcode: str) -> str:
    """Validate and normalize qcode"""
    if not qcode or not isinstance(qcode, str):
        raise HTTPException(status_code=400, detail="qcode is required")
    
    normalized_qcode = qcode.strip().lower()
    if not re.match(r"^[a-z0-9_]+$", normalized_qcode):
        raise HTTPException(status_code=400, detail="Invalid qcode format. Use only letters, numbers, and underscores")
    
    return normalized_qcode

def validate_date_range(start_date: Optional[str], end_date: Optional[str]) -> None:
    """Validate date range"""
    if (start_date and not end_date) or (end_date and not start_date):
        raise HTTPException(status_code=400, detail="Both startDate and endDate are required if one is provided")
    
    if start_date and end_date:
        # Validate date format
        for date_str in [start_date, end_date]:
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
        
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d")
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d")
            
            if start_date_obj > end_date_obj:
                raise HTTPException(status_code=400, detail="startDate cannot be after endDate")
                
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"Invalid date values: {str(e)}")

def validate_table_name(table_name: str) -> str:
    """Validate table name and return database table name"""
    if table_name not in VALID_TABLE_NAMES:
        raise HTTPException(status_code=400, detail=f"Invalid table name: {table_name}")
    
    return table_name

async def check_table_exists(db: Prisma, table_name: str) -> None:
    """Check if table exists in database"""
    try:
        table_exists = await db.query_first(
            """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = $1
            ) as exists
            """,
            table_name
        )
        
        if not table_exists or not table_exists["exists"]:
            raise HTTPException(status_code=400, detail=f"Table {table_name} does not exist")
            
    except PrismaError as e:
        logger.error(f"Database error checking table existence: {e}")
        raise HTTPException(status_code=500, detail="Database error")

async def verify_qcode_access(db: Prisma, qcode: str) -> Dict[str, Any]:
    """Verify qcode exists and return account info"""
    try:
        account = await db.accounts.find_first(where={"qcode": qcode})
        if not account:
            raise HTTPException(status_code=404, detail=f"Account not found for qcode: {qcode}")
        return account
    except PrismaError as e:
        logger.error(f"Database error verifying qcode: {e}")
        raise HTTPException(status_code=500, detail="Database error")

async def upload_csv_handler(
    file: UploadFile,
    qcode: str,
    table_name: str,
    startDate: Optional[str] = None,
    endDate: Optional[str] = None,
    db: Prisma = None
) -> Dict[str, Any]:
    """Generic CSV upload handler"""
    start_time = time.time()
    
    try:
        # Validate inputs
        validate_file_upload(file)
        normalized_qcode = validate_qcode_format(qcode)
        validate_date_range(startDate, endDate)
        validated_table_name = validate_table_name(table_name)
        
        # Check database constraints
        await check_table_exists(db, validated_table_name)
        account = await verify_qcode_access(db, normalized_qcode)
        
        # Process file
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        # Process CSV
        data, csv_failed_rows = process_csv(
            content, normalized_qcode, validated_table_name, startDate, endDate
        )
        
        if not data and not csv_failed_rows:
            raise HTTPException(status_code=400, detail="No valid data found in CSV file")
        
        # Insert data
        success_count, db_failed_rows = await insert_data(db, data, validated_table_name, normalized_qcode)
        
        # Combine failed rows from CSV processing and database insertion
        all_failed_rows = csv_failed_rows + db_failed_rows
        
        # Calculate timing
        total_duration = (time.time() - start_time) * 1000
        
        # Log results
        logger.info(
            f"Upload completed for {validated_table_name}: "
            f"qcode={normalized_qcode}, success={success_count}, "
            f"failed={len(all_failed_rows)}, duration={total_duration:.2f}ms"
        )
        
        # Prepare response
        response_data = {
            "message": f"Upload completed: {success_count} rows inserted, {len(all_failed_rows)} failed",
            "total_rows": len(data) + len(all_failed_rows),
            "inserted_rows": success_count,
            "failed_count": len(all_failed_rows),
            "column_names": TABLE_COLUMNS.get(validated_table_name, []),
            "processing_time_ms": round(total_duration, 2)
        }
        
        if all_failed_rows:
            response_data["failed_rows"] = all_failed_rows
            response_data["first_error"] = all_failed_rows[0] if all_failed_rows else None
            
            # Log sample failed rows for debugging
            logger.warning(f"Failed rows sample for {validated_table_name}: {all_failed_rows[:3]}")
        
        return response_data
        
    except HTTPException:
        raise
    except DatabaseOperationError as e:
        logger.error(f"Database operation error during upload: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error during upload: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

# UPLOAD ROUTES - All properly implemented
@router.post("/upload/master-sheet/")
async def upload_master_sheet(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    """Upload master sheet CSV data"""
    return await upload_csv_handler(file, qcode, "master_sheet", startDate, endDate, db)

@router.post("/upload/tradebook/")
async def upload_tradebook(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    """Upload tradebook CSV data"""
    return await upload_csv_handler(file, qcode, "tradebook", startDate, endDate, db)

@router.post("/upload/slippage/")
async def upload_slippage(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    """Upload slippage CSV data"""
    return await upload_csv_handler(file, qcode, "slippage", startDate, endDate, db)

@router.post("/upload/mutual-fund-holding/")
async def upload_mutual_fund_holding(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    """Upload mutual fund holding CSV data"""
    return await upload_csv_handler(file, qcode, "mutual_fund_holding", startDate, endDate, db)

@router.post("/upload/gold-tradebook/")
async def upload_gold_tradebook(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    """Upload gold tradebook CSV data"""
    return await upload_csv_handler(file, qcode, "gold_tradebook", startDate, endDate, db)

@router.post("/upload/liquidbees-tradebook/")
async def upload_liquidbees_tradebook(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    """Upload liquidbees tradebook CSV data"""
    return await upload_csv_handler(file, qcode, "liquidbees_tradebook", startDate, endDate, db)

@router.post("/upload/equity-holding/")
async def upload_equity_holding(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    """Upload equity holding CSV data"""
    return await upload_csv_handler(file, qcode, "equity_holding", startDate, endDate, db)

@router.get("/upload/equity-holding/health")
async def health_check_equity_holding():
    """Health check endpoint for equity holding upload"""
    return {
        "status": "healthy",
        "service": "equity_holding_upload",
        "timestamp": datetime.now().isoformat(),
        "supported_tables": list(VALID_TABLE_NAMES),
        "supported_endpoints": list(TABLE_NAME_MAPPING.keys())
    }

@router.post("/upload/capital-in-out/")
async def upload_capital_in_out(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    startDate: Optional[str] = Form(None),
    endDate: Optional[str] = Form(None),
    db: Prisma = Depends(get_db)
):
    """Upload capital in/out CSV data"""
    return await upload_csv_handler(file, qcode, "capital_in_out", startDate, endDate, db)

# DELETE ROUTE - Properly implemented
@router.post("/replace/delete/")
async def delete_records_route(
    request: DeleteRequest,
    db: Prisma = Depends(get_db)
):
    """Delete records from a table within a date range"""
    try:
        # Validate table name
        validated_table_name = validate_table_name(request.table)
        
        # Verify qcode access
        await verify_qcode_access(db, request.qcode)
        
        # Check table exists
        await check_table_exists(db, validated_table_name)
        
        # Perform deletion
        deleted_count = await delete_data(
            db, 
            request.qcode, 
            validated_table_name, 
            request.startDate, 
            request.endDate
        )
        
        return {
            "message": f"Successfully deleted {deleted_count} records from {validated_table_name}",
            "deletedCount": deleted_count,
            "qcode": request.qcode,
            "table": validated_table_name,
            "dateRange": f"{request.startDate} to {request.endDate}"
        }
        
    except HTTPException:
        raise
    except DatabaseOperationError as e:
        logger.error(f"Database operation error during deletion: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error during deletion: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Deletion failed: {str(e)}")

# REPLACE ROUTE - Properly implemented
@router.post("/replace/master-sheet/")
async def replace_master_sheet_route(
    file: UploadFile = File(...),
    qcode: str = Form(...),
    db: Prisma = Depends(get_db)
):
    """Replace all master sheet data for a qcode"""
    try:
        # Validate inputs
        validate_file_upload(file)
        normalized_qcode = validate_qcode_format(qcode)
        
        # Verify qcode access
        await verify_qcode_access(db, normalized_qcode)
        
        # Check table exists
        await check_table_exists(db, "master_sheet")
        
        # Process file
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty")
        
        # Use replace_data function
        result = await replace_data(db, content, normalized_qcode, "master_sheet")
        
        return result
        
    except HTTPException:
        raise
    except DatabaseOperationError as e:
        logger.error(f"Database operation error during replacement: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error during replacement: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Replacement failed: {str(e)}")

# DATA SUMMARY ROUTE - Properly implemented
@router.get("/data-summary/{qcode}")
async def get_data_summary_route(
    qcode: str,
    table_name: Optional[str] = None,
    db: Prisma = Depends(get_db)
):
    """Get data summary for a qcode"""
    try:
        # Validate qcode
        normalized_qcode = validate_qcode_format(qcode)
        
        # Verify qcode access
        await verify_qcode_access(db, normalized_qcode)
        
        # If table_name is provided, validate it
        if table_name:
            table_name = validate_table_name(table_name)
            await check_table_exists(db, table_name)
        
        # Get data summary
        summary = await get_data_summary(db, normalized_qcode, table_name)
        
        return summary
        
    except HTTPException:
        raise
    except DatabaseOperationError as e:
        logger.error(f"Database operation error getting summary: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error getting summary: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to get summary: {str(e)}")

@router.get("/upload/health")
async def health_check():
    """Health check endpoint for upload service"""
    return {
        "status": "healthy",
        "service": "upload_service",
        "timestamp": datetime.now().isoformat(),
        "supported_tables": list(VALID_TABLE_NAMES),
        "supported_endpoints": list(TABLE_NAME_MAPPING.keys())
    }