from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.routers.upload import router as upload_router
from app.routers.consolidated import router as consolidated_router
from dotenv import load_dotenv
from starlette.middleware.base import BaseHTTPMiddleware
import os
import logging
import traceback
import time
from pathlib import Path
from fastapi.routing import APIRoute

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

class ProxyHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if "X-Forwarded-Proto" in request.headers:
            request.scope["scheme"] = request.headers["X-Forwarded-Proto"]
        return await call_next(request)

# Create FastAPI app - IMPORTANT: Remove redirect_slashes=False to allow automatic redirects
app = FastAPI(
    title="Portfolio API",
    description="API for processing financial data",
    debug=True
    # Removed redirect_slashes=False - let FastAPI handle redirects automatically
)

# Add proxy headers middleware
app.add_middleware(ProxyHeadersMiddleware)

# CORS origins
origins = [
    "https://client.qodeinvest.com",
    "http://localhost:3000"
]

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(upload_router)
app.include_router(consolidated_router)

@app.get("/")
async def root():
    logger.info("Root endpoint accessed")
    return {"message": "Portfolio API is running"}

@app.get("/api")
async def api_root():
    """API root endpoint"""
    return {
        "message": "Portfolio API v1.0",
        "endpoints": {
            "upload": "/api/upload/",
            "replace": "/api/replace/",
            "data_summary": "/api/data-summary/{qcode}",
            "health": "/api/upload/health"
        }
    }

@app.get("/env")
async def check_env():
    return {"DATABASE_URL": os.getenv("DATABASE_URL"), "SECRET_KEY": os.getenv("SECRET_KEY")}

@app.get("/api/routes")
async def list_routes():
    """List all available API routes"""
    routes = []
    for route in app.router.routes:
        if isinstance(route, APIRoute):
            routes.append({
                "path": route.path,
                "methods": list(route.methods),
                "name": route.name,
                "summary": route.summary or route.description
            })
    return {"routes": routes}

@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Log all incoming requests"""
    start_time = time.time()
    
    logger.info(f"Incoming request: {request.method} {request.url.path}")
    
    response = await call_next(request)
    
    process_time = time.time() - start_time
    logger.info(f"Request completed: {request.method} {request.url.path} - {response.status_code} - {process_time:.3f}s")
    
    return response

@app.on_event("startup")
async def startup():
    logger.info("Application startup")
    # List routes to confirm what's live
    routes = [r for r in app.router.routes if isinstance(r, APIRoute)]
    logger.info(f"Total routes registered: {len(routes)}")
    for r in routes:
        logger.info(f"Route: {','.join(r.methods)} {r.path} -> {r.name}")

@app.exception_handler(404)
async def not_found_handler(request: Request, exc: HTTPException):
    """Custom 404 handler with helpful information"""
    logger.warning(f"404 Not Found: {request.method} {request.url.path}")
    
    # Get available upload routes for debugging
    upload_routes = []
    for route in app.router.routes:
        if isinstance(route, APIRoute) and "/upload/" in route.path:
            upload_routes.append(f"{','.join(route.methods)} {route.path}")
    
    return JSONResponse(
        status_code=404,
        content={
            "detail": f"Not Found: {request.method} {request.url.path}",
            "upload_routes": upload_routes,
            "suggestion": "Check /api/routes for all available endpoints"
        }
    )

@app.exception_handler(405)
async def method_not_allowed_handler(request: Request, exc: HTTPException):
    """Custom 405 handler with helpful information"""
    logger.warning(f"405 Method Not Allowed: {request.method} {request.url.path}")
    
    # Find routes that match the path but have different methods
    matching_routes = []
    for route in app.router.routes:
        if isinstance(route, APIRoute) and route.path == request.url.path:
            matching_routes.extend(route.methods)
    
    return JSONResponse(
        status_code=405,
        content={
            "detail": f"Method {request.method} not allowed for {request.url.path}",
            "allowed_methods": list(set(matching_routes)) if matching_routes else [],
            "suggestion": "Check the HTTP method you're using"
        }
    )

@app.exception_handler(Exception)
async def custom_exception_handler(request: Request, exc: Exception):
    """Global exception handler"""
    logger.error(f"Unhandled error on {request.method} {request.url.path}: {str(exc)}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {str(exc)}"}
    )