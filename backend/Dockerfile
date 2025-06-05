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

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


# Copy the rest of your backend code
COPY . .

# Generate Prisma client (now that Pydantic v1.x is installed)
RUN prisma generate

FROM python:3.11-slim AS runner
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Copy installed packages
COPY --from=base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Copy app code
COPY --from=base /app /app

ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]