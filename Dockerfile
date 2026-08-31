# Base image with Node + Python
FROM node:22-bullseye

# Enable corepack for pnpm
RUN corepack enable

# Install Python and required system dependencies
RUN apt-get update && \
    apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    build-essential \
    postgresql-client \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working dir
WORKDIR /app

# Copy package files & install Node dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy Python requirements & install them
COPY requirements.txt ./
RUN pip3 install -r requirements.txt

# Create cache directory for FastF1
RUN mkdir -p cache/fastf1

# Copy your source code
COPY . .

# Build TypeScript
RUN pnpm run build


# Expose app port
EXPOSE ${PORT:-3001}

# The entrypoint waits for the database itself, so nothing wraps it here.
#
# This used to be wrapped in wait-for-it against ${DB_HOST:-host.docker.internal},
# which is a local-development address. On Railway DB_HOST is not set, so a new
# service would sit for 15 seconds waiting on a host that cannot exist and then
# crash pointing at host.docker.internal -- an error that sends you to look at
# Docker when the container never had a database to wait for.
#
# Nothing needed it. docker-compose already gates the app on the db's
# healthcheck, and scripts/start.sh does its own bounded pg_isready wait using
# DATABASE_URL, which is the variable that actually says where the database is.
CMD ["bash", "scripts/start.sh"]
