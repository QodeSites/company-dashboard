from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers.upload import router as upload_router
from routers.consolidated import router as consolidated_router
from dotenv import load_dotenv
import os
import logging
import traceback

# Configure logging
logging.basicConfig(
    filename="logs/app.log",
    level=logging.DEBUG,
    format="%(asctime)s - %(levelname)s - %(name)s - %(message)s"
)
logger = logging.getLogger(__name__)

load_dotenv("../.env")

app = FastAPI(
    title="Portfolio API",
    description="API for processing financial data",
    debug=True
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(consolidated_router)

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