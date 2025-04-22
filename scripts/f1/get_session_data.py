import sys
import json
import fastf1
import pandas as pd
import warnings
import logging
import os
import gc
import psutil
import tracemalloc
from pathlib import Path
from typing import Any, Optional

# Suppress FastF1 warnings about incomplete data
logging.getLogger("fastf1").setLevel(logging.ERROR)

# Configure warnings to be captured instead of printed
warnings.filterwarnings("error", category=UserWarning)

# Configure pandas to use less memory
pd.options.mode.chained_assignment = None  # default='warn'
pd.options.compute.use_bottleneck = False
pd.options.compute.use_numexpr = False

# Memory monitoring
MEMORY_THRESHOLD = 450 * 1024 * 1024  # 450MB threshold for Railway's 512MB limit


def check_memory_usage():
    """Check current memory usage and raise exception if too high."""
    process = psutil.Process(os.getpid())
    memory_usage = process.memory_info().rss

    if memory_usage > MEMORY_THRESHOLD:
        # Force garbage collection
        gc.collect()

        # Check again after garbage collection
        memory_usage = process.memory_info().rss
        if memory_usage > MEMORY_THRESHOLD:
            raise MemoryError(
                f"Memory usage ({memory_usage / 1024 / 1024:.1f}MB) exceeds threshold "
                f"({MEMORY_THRESHOLD / 1024 / 1024:.1f}MB)"
            )


def get_cache_dir() -> str:
    """Get the absolute path to the FastF1 cache directory."""
    # Check if we're in Railway environment
    if os.environ.get("RAILWAY_ENVIRONMENT"):
        # Use /tmp for Railway's ephemeral storage
        cache_dir = Path("/tmp/fastf1_cache")
    else:
        # Use project directory for local development
        script_dir = Path(__file__).resolve().parent
        cache_dir = script_dir.parent.parent / "cache" / "fastf1"

    return str(cache_dir)


def optimize_numeric_dtypes(df: pd.DataFrame) -> pd.DataFrame:
    """Optimize memory usage by downcasting numeric columns."""
    try:
        for col in df.select_dtypes(include=["int64", "float64"]).columns:
            if df[col].dtype == "int64":
                df[col] = pd.to_numeric(df[col], downcast="integer")
            elif df[col].dtype == "float64":
                df[col] = pd.to_numeric(df[col], downcast="float")
        return df
    except MemoryError:
        # If we run out of memory during optimization, return original dataframe
        return df


def clean_data(data: Any) -> Any:
    """Cleans data by converting NaN to None and timestamps to ISO format."""
    try:
        if isinstance(data, pd.DataFrame):
            check_memory_usage()

            # Memory optimization: Convert to smaller dtypes where possible
            data = optimize_numeric_dtypes(data)

            # Select only necessary columns to reduce memory
            essential_columns = [
                "Time",
                "Driver",
                "Position",
                "Status",
                "Points",
                "FastestLap",
                "TeamName",
                "Q1",
                "Q2",
                "Q3",
            ]
            columns_to_use = [col for col in essential_columns if col in data.columns]

            # Process in chunks if dataframe is large
            if len(data) > 1000:
                chunk_size = 500
                result = []
                for i in range(0, len(data), chunk_size):
                    try:
                        check_memory_usage()
                        chunk = data[columns_to_use].iloc[i : i + chunk_size]
                        chunk_dict = chunk.to_dict(orient="records")
                        for item in chunk_dict:
                            cleaned_item = {}
                            for key, value in item.items():
                                if pd.isna(value):
                                    cleaned_item[key] = None
                                elif isinstance(value, pd.Timestamp):
                                    cleaned_item[key] = value.isoformat()
                                else:
                                    cleaned_item[key] = value
                            result.append(cleaned_item)
                        del chunk, chunk_dict
                        gc.collect()
                    except MemoryError as e:
                        # If a chunk fails, try with a smaller chunk size
                        if chunk_size > 100:
                            chunk_size = chunk_size // 2
                            i = i - (i % chunk_size)  # Reset to start of current chunk
                            continue
                        else:
                            raise  # Re-raise if chunk size is already minimal
                return result
            else:
                # Convert to records with only necessary columns
                data_dict = data[columns_to_use].to_dict(orient="records")

                for item in data_dict:
                    for key, value in item.items():
                        if pd.isna(value):
                            item[key] = None
                        elif isinstance(value, pd.Timestamp):
                            item[key] = value.isoformat()

                # Clear memory
                del data
                gc.collect()

                return data_dict
        return data
    except MemoryError as e:
        # If we completely run out of memory during cleaning, return error
        raise MemoryError(f"Failed to clean data: {str(e)}")


def get_session_data(
    year: int,
    round: int,
    session_type: str,
    data_type: str = "results",
    driver: Optional[str] = None,
    lap: Optional[int] = None,
) -> None:
    try:
        # Start memory tracking
        tracemalloc.start()

        # Enable caching with the correct path
        cache_dir = get_cache_dir()
        os.makedirs(cache_dir, exist_ok=True)
        fastf1.Cache.enable_cache(cache_dir)

        # Load session with minimal data
        session = fastf1.get_session(year, round, session_type)

        # Capture warnings during session load
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")

            try:
                # Load only necessary data based on data_type
                if data_type == "results":
                    session.load(
                        telemetry=False, weather=False, messages=False, laps=False
                    )
                elif data_type == "weather":
                    session.load(telemetry=False, laps=False, messages=False)
                elif data_type in ["telemetry", "fastest_laps", "driver_best_lap"]:
                    session.load(weather=False, messages=False)
                else:
                    session.load()
            except MemoryError as e:
                print(
                    json.dumps(
                        {
                            "error": "Memory limit exceeded while loading session data",
                            "details": str(e),
                            "memory_snapshot": tracemalloc.get_traced_memory(),
                        }
                    ),
                    file=sys.stderr,
                )
                sys.exit(1)

            # Log warnings but don't treat them as errors
            if w:
                print(
                    json.dumps({"warnings": [str(warning.message) for warning in w]}),
                    file=sys.stderr,
                )

        response = {}

        try:
            if data_type == "results":
                check_memory_usage()
                results = session.results
                if results is not None:
                    results = optimize_numeric_dtypes(results)
                response["results"] = clean_data(results)
                del results

            elif data_type == "telemetry" and driver and lap:
                if driver not in session.drivers:
                    print(
                        json.dumps({"error": f"Driver {driver} not found in session."}),
                        file=sys.stderr,
                    )
                    sys.exit(1)

                check_memory_usage()
                # Get specific lap data with minimal memory usage
                laps = session.laps.pick_driver(driver)
                if laps.empty:
                    print(
                        json.dumps(
                            {"error": f"No lap data available for driver {driver}."}
                        ),
                        file=sys.stderr,
                    )
                    sys.exit(1)

                lap_data = laps.pick_lap(lap)
                del laps

                # Get only essential telemetry channels
                essential_channels = [
                    "Speed",
                    "RPM",
                    "Gear",
                    "DRS",
                    "Throttle",
                    "Brake",
                ]
                telemetry = lap_data.get_telemetry()
                telemetry = optimize_numeric_dtypes(telemetry[essential_channels])

                response["telemetry"] = clean_data(telemetry)
                response["lap_data"] = clean_data(lap_data.to_frame())

                # Clear memory
                del telemetry, lap_data
                gc.collect()

            elif data_type == "fastest_laps":
                check_memory_usage()
                fastest_lap = session.laps.pick_fastest()
                if fastest_lap is not None:
                    fastest_lap = optimize_numeric_dtypes(fastest_lap)
                response["fastest_laps"] = clean_data(fastest_lap)
                del fastest_lap
                gc.collect()

            elif data_type == "driver_best_lap" and driver:
                if driver not in session.drivers:
                    print(
                        json.dumps({"error": f"Driver {driver} not found in session."}),
                        file=sys.stderr,
                    )
                    sys.exit(1)

                check_memory_usage()
                driver_laps = session.laps.pick_driver(driver)
                if driver_laps.empty:
                    print(
                        json.dumps(
                            {"error": f"No lap data available for driver {driver}."}
                        ),
                        file=sys.stderr,
                    )
                    sys.exit(1)

                best_lap = driver_laps.pick_fastest()
                del driver_laps

                best_lap_frame = best_lap.to_frame()
                if best_lap_frame is not None:
                    best_lap_frame = optimize_numeric_dtypes(best_lap_frame)
                response["best_lap"] = clean_data(best_lap_frame)
                del best_lap_frame

                # Get only essential telemetry channels for best lap
                essential_channels = [
                    "Speed",
                    "RPM",
                    "Gear",
                    "DRS",
                    "Throttle",
                    "Brake",
                ]
                telemetry = best_lap.get_telemetry()
                telemetry = optimize_numeric_dtypes(telemetry[essential_channels])
                response["telemetry"] = clean_data(telemetry)

                # Clear memory
                del telemetry, best_lap
                gc.collect()

            elif data_type == "weather":
                check_memory_usage()
                weather_data = session.weather_data
                if weather_data is not None:
                    # Select only essential weather columns
                    essential_columns = [
                        "Time",
                        "AirTemp",
                        "Humidity",
                        "Pressure",
                        "Rainfall",
                        "TrackTemp",
                        "WindDirection",
                        "WindSpeed",
                    ]
                    weather_data = weather_data[essential_columns]
                    weather_data = optimize_numeric_dtypes(weather_data)
                response["weather"] = clean_data(weather_data)
                del weather_data
                gc.collect()

        except MemoryError as e:
            current, peak = tracemalloc.get_traced_memory()
            print(
                json.dumps(
                    {
                        "error": "Memory limit exceeded while processing data",
                        "details": str(e),
                        "memory_usage": {"current": current, "peak": peak},
                    }
                ),
                file=sys.stderr,
            )
            sys.exit(1)

        response["session_info"] = {
            "year": year,
            "round": round,
            "session_type": session_type,
            "track": session.event.Circuit.circuitName,
            "cache_dir": cache_dir,  # Add cache directory to response for debugging
        }

        # Clear session data from memory
        del session
        gc.collect()

        # Stop memory tracking and get final stats
        current, peak = tracemalloc.get_traced_memory()
        response["memory_stats"] = {"current": current, "peak": peak}
        tracemalloc.stop()

        print(json.dumps(response))

    except Exception as e:
        print(
            json.dumps(
                {
                    "error": str(e),
                    "type": type(e).__name__,
                    "memory_stats": (
                        tracemalloc.get_traced_memory()
                        if tracemalloc.is_tracing()
                        else None
                    ),
                }
            ),
            file=sys.stderr,
        )
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Not enough arguments"}), file=sys.stderr)
        sys.exit(1)

    try:
        year = int(sys.argv[1])
        round = int(sys.argv[2])
        session_type = sys.argv[3]
        data_type = sys.argv[4] if len(sys.argv) > 4 else "results"
        driver = sys.argv[5] if len(sys.argv) > 5 else None
        lap = int(sys.argv[6]) if len(sys.argv) > 6 else None

        get_session_data(year, round, session_type, data_type, driver, lap)
    except ValueError as e:
        print(json.dumps({"error": f"Invalid argument: {e}"}), file=sys.stderr)
        sys.exit(1)
