# F1 API

Trial F1 used for implementing/testing Portfolio site. (located currently at paulsumido.com)

## Features

- Race schedules
- Session results (qualifying/race)
- Driver telemetry
- Fastest laps
- Weather data
- Best lap analysis

## API Endpoints

- `GET /api/f1/schedule/:year` - Get race schedule for a specific season
- `GET /api/f1/results/:year/:round/:session` - Get session results
- `GET /api/f1/telemetry/:year/:round/:session/:driver/:lap` - Get driver telemetry
- `GET /api/f1/fastest-laps/:year/:round/:session` - Get fastest laps
- `GET /api/f1/best-lap/:year/:round/:session/:driver` - Get driver's best lap
- `GET /api/f1/weather/:year/:round/:session` - Get session weather data

## Local Development

### Prerequisites

- Node.js >= 18
- Python 3
- Docker (optional)

### Setup

1. Clone the repository:

```bash
git clone <repository-url>
cd f1-api
```

2. Install dependencies:

```bash
# Install Node.js dependencies
npm install

# Install Python dependencies
pip install -r requirements.txt
```

3. Create .env file:

```bash
PORT=3001
NODE_ENV=development
```

4. Run the development server:

```bash
npm run dev
```

### Using Docker

1. Build the image:

```bash
docker build -t f1-api .
```

2. Run the container:

```bash
docker run -p 3001:3001 --env-file .env f1-api
```

## Railway Deployment

1. Push your code to GitHub

2. Create a new project on Railway and connect your repository

3. Enable "Deploy from Dockerfile" in project settings

4. Set environment variables in Railway dashboard:

   - `PORT`
   - `NODE_ENV`

5. Deploy!

## Cache

FastF1 uses a cache to improve performance. The cache is stored in `cache/fastf1/`. In the Docker environment, this directory is created during build.

## Error Handling

The API includes comprehensive error handling:

- Python script errors
- JSON parsing errors
- FastF1 API errors
- Invalid parameters

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request
