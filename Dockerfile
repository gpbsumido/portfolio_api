# Base image with Node + Python
FROM node:18-bullseye

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
COPY package*.json ./
RUN npm install

# Copy Python requirements & install them
COPY requirements.txt ./
RUN pip3 install -r requirements.txt

# Create cache directory for FastF1
RUN mkdir -p cache/fastf1

# Copy your source code
COPY . .

# Add wait-for-it script to handle database startup
ADD https://raw.githubusercontent.com/vishnubob/wait-for-it/master/wait-for-it.sh /wait-for-it.sh
RUN chmod +x /wait-for-it.sh

# Expose app port
EXPOSE ${PORT:-3001}

# Start command that waits for database
CMD ["/bin/bash", "-c", "/wait-for-it.sh ${DB_HOST:-host.docker.internal}:${DB_PORT:-5432} -- npm start"] 