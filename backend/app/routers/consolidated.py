
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.responses import StreamingResponse
from services.consolidated_processor import process_and_consolidate_csv
import logging
import traceback
from python_multipart.exceptions import MultipartParseError
import time
import csv
import os
from io import StringIO

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/upload", tags=["consolidated"])

def cleanup_file(file_path: str):
    """Background task to clean up temporary files"""
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            logger.info(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.warning(f"Failed to delete temporary file {file_path}: {str(e)}")

@router.post("/consolidated-sheet/")
async def upload_and_generate_consolidated(
    transaction_file: UploadFile = File(..., description="Transaction Class CSV/Excel file"),
    holding_file: UploadFile = File(..., description="Holding Asset Class CSV/Excel file")
):
    """
    Upload Transaction Class and Holding Asset Class files to generate a consolidated portfolio sheet.
    
    The consolidated sheet will contain:
    - account_code: Account identifier
    - portfolio_value: Current portfolio value
    - nav: Net Asset Value
    - pnl: Profit and Loss
    - drawdown: Maximum drawdown percentage
    - date: Date of the record
    """
    start_time = time.time()
    logger.info(f"Processing files: {transaction_file.filename}, {holding_file.filename}")

    try:
        # Validate file formats
        valid_extensions = ('.csv', '.xlsx', '.xls')
        
        if not (transaction_file.filename and transaction_file.filename.lower().endswith(valid_extensions)):
            raise HTTPException(
                status_code=400, 
                detail=f"Transaction file must be CSV, XLSX, or XLS format. Got: {transaction_file.filename}"
            )
        
        if not (holding_file.filename and holding_file.filename.lower().endswith(valid_extensions)):
            raise HTTPException(
                status_code=400, 
                detail=f"Holding file must be CSV, XLSX, or XLS format. Got: {holding_file.filename}"
            )

        # Read file contents
        logger.info("Reading transaction file...")
        transaction_content = await transaction_file.read()
        if not transaction_content:
            raise HTTPException(status_code=400, detail="Transaction file is empty")
        
        logger.info("Reading holding file...")
        holding_content = await holding_file.read()
        if not holding_content:
            raise HTTPException(status_code=400, detail="Holding file is empty")

        # Process and generate consolidated data
        logger.info("Processing and consolidating data...")
        consolidated_data = process_and_consolidate_csv(
            transaction_content, 
            holding_content,
            transaction_file.filename,
            holding_file.filename
        )

        if not consolidated_data:
            raise HTTPException(
                status_code=400, 
                detail="No valid data found to consolidate. Please check your file formats and data."
            )

        # Create CSV content
        logger.info(f"Generating CSV with {len(consolidated_data)} records...")
        output = StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow(["account_code", "portfolio_value", "nav", "pnl", "drawdown", "date"])
        
        # Write data rows
        for row in consolidated_data:
            writer.writerow([
                row["account_code"],
                row["portfolio_value"],
                row["nav"],
                row["pnl"],
                row["drawdown"],
                row["date"]
            ])
        
        # Get CSV content
        csv_content = output.getvalue()
        output.close()
        
        processing_time = (time.time() - start_time) * 1000
        logger.info(f"Successfully generated consolidated sheet in {processing_time:.2f}ms")

        # Return as streaming response
        def generate():
            yield csv_content.encode('utf-8')

        return StreamingResponse(
            generate(),
            media_type="text/csv",
            headers={
                "Content-Disposition": "attachment; filename=consolidated_portfolio_sheet.csv",
                "X-Processing-Time-MS": str(round(processing_time, 2)),
                "X-Records-Count": str(len(consolidated_data))
            }
        )

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except ValueError as e:
        logger.error(f"Data processing error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=400, detail=f"Data processing error: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
