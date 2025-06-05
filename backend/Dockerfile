# company-dashboard/backend/Dockerfile

#######################################################################
# 1. Base image: install Python + OS dependencies (e.g. libpq for Postgres)
#######################################################################
FROM python:3.11-slim AS base

# Prevent Python from writing .pyc files & buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install any OS‐level dependencies you need (e.g. libpq-dev for psycopg2)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements early so we can leverage Docker layer caching
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

#######################################################################
# 2. Copy the rest of your backend code
#######################################################################
COPY . .

# If you use Prisma migrations at runtime, generate the client & run migrations:
RUN pip install --no-cache-dir prisma-client   # (if you need a Python Prisma runtime)
RUN npx prisma generate                        # (if you run migrations at build time)
# If you need to run migrations on container startup, you can do it in your CMD below

#######################################################################
# 3. Final stage: specify how to run your backend in production
#######################################################################
FROM python:3.11-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Copy installed Python packages from the base stage
COPY --from=base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Copy application code
COPY --from=base /app /app

# Expose port 8000 for your API
ENV PORT=8000
EXPOSE 8000

# If you need to run database migrations before serving, do it here:
#   e.g. RUN npx prisma migrate deploy
# But often in Python you’d run Alembic or manage.py migrate—adjust as needed.

# Start your Python API server. 
# Below is a FastAPI + Uvicorn example; adapt for Flask or Django if needed.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
