from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers.upload import router as upload_router
from app.routers.consolidated import router as consolidated_router
from dotenv import load_dotenv
# from app.routers.pms_master_sheet import router as master_sheet_router
import os
import logging
import traceback
from pathlib import Path

# Create logs directory if it doesn't exist
logs_dir = Path("logs")
logs_dir.mkdir(exist_ok=True)

# Configure logging
logging.basicConfig(
    filename="logs/app.log",
    level=logging.DEBUG,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

load_dotenv("../.env")

# Dependency for Prisma
# async def get_db():
#     db = Prisma()
#     await db.connect()
#     try:
#         yield db
#     finally:
#         await db.disconnect()

app = FastAPI(
    title="Portfolio API",
    description="API for processing financial data",
    debug=True
)

origins = [
    "https://client.qodeinvest.com",
    # Add any other trusted origins if needed
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(consolidated_router)
# app.include_router(master_sheet_router, dependencies=[Depends(get_db)])

@app.get("/")
async def root():
    logger.info("Root endpoint accessed")
    return {"message": "Portfolio API is running"}

@app.get("/env")
async def check_env():
    return {"DATABASE_URL": os.getenv("DATABASE_URL"), "SECRET_KEY": os.getenv("SECRET_KEY")}

@app.on_event("startup")
async def startup():
    logger.info("Application startup")
    # Removed database connection code as per request

@app.exception_handler(Exception)
async def custom_exception_handler(request, exc):
    logger.error(f"Unhandled error: {str(exc)}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )