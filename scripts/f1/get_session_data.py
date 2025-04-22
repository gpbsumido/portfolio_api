import sys
import json
import fastf1
import pandas as pd
import warnings
import logging
import os
from pathlib import Path
from typing import Any, Optional

# Suppress FastF1 warnings about incomplete data
logging.getLogger("fastf1").setLevel(logging.ERROR)

# Configure warnings to be captured instead of printed
warnings.filterwarnings("error", category=UserWarning)


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


def clean_data(data: Any) -> Any:
    """Cleans data by converting NaN to None and timestamps to ISO format."""
    if isinstance(data, pd.DataFrame):
        data_dict = data.to_dict(orient="records")
        for item in data_dict:
            for key, value in item.items():
                if pd.isna(value):
                    item[key] = None
                elif isinstance(value, pd.Timestamp):
                    item[key] = value.isoformat()
        return data_dict
    return data


def get_session_data(
    year: int,
    round: int,
    session_type: str,
    data_type: str = "results",
    driver: Optional[str] = None,
    lap: Optional[int] = None,
) -> None:
    try:
        # Ensure FastF1 dependencies are installed
        try:
            import fastf1
        except ImportError:
            print(
                json.dumps(
                    {"error": "FastF1 is not installed. Run 'pip install fastf1'."}
                ),
                file=sys.stderr,
            )
            sys.exit(1)

        # Enable caching with the correct path
        cache_dir = get_cache_dir()
        os.makedirs(cache_dir, exist_ok=True)
        fastf1.Cache.enable_cache(cache_dir)

        # Load session
        session = fastf1.get_session(year, round, session_type)

        # Capture warnings during session load
        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            session.load()

            # Log warnings but don't treat them as errors
            if w:
                print(
                    json.dumps({"warnings": [str(warning.message) for warning in w]}),
                    file=sys.stderr,
                )

        response = {}

        if data_type == "results":
            response["results"] = clean_data(session.results)

        elif data_type == "telemetry" and driver and lap:
            if driver not in session.drivers:
                print(
                    json.dumps({"error": f"Driver {driver} not found in session."}),
                    file=sys.stderr,
                )
                sys.exit(1)
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
            response["telemetry"] = clean_data(lap_data.get_telemetry())
            response["lap_data"] = clean_data(lap_data.to_frame().to_dict("records"))

        elif data_type == "fastest_laps":
            response["fastest_laps"] = clean_data(session.laps.pick_fastest())

        elif data_type == "driver_best_lap" and driver:
            if driver not in session.drivers:
                print(
                    json.dumps({"error": f"Driver {driver} not found in session."}),
                    file=sys.stderr,
                )
                sys.exit(1)
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
            response["best_lap"] = clean_data(best_lap.to_frame().to_dict("records"))
            response["telemetry"] = clean_data(best_lap.get_telemetry())

        elif data_type == "weather":
            response["weather"] = clean_data(session.weather_data)

        response["session_info"] = {
            "year": year,
            "round": round,
            "session_type": session_type,
            "track": session.event.Circuit.circuitName,
            "cache_dir": cache_dir,  # Add cache directory to response for debugging
        }

        print(json.dumps(response))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
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
