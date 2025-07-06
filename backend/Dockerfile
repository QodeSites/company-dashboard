#######################################################################
# 1. Base image: install Python + OS dependencies (e.g. libpq for Postgres)
#######################################################################
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       libpq-dev \
       curl \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy and install dependencies (including uvicorn)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your backend code
COPY . .

# Generate the Prisma client and fetch binaries
RUN prisma generate
RUN prisma py fetch

#######################################################################
# 2. Final stage: copy both site-packages and bin scripts
#######################################################################
FROM python:3.11-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install runtime dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libpq5 \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy installed Python packages AND console‐script binaries
COPY --from=base /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=base /usr/local/bin /usr/local/bin

# Copy application code
COPY --from=base /app /app

# Copy Prisma binaries from cache (if they exist)
COPY --from=base /root/.cache/prisma-python /root/.cache/prisma-python

ENV PORT=8000
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]