import sys
import json
import fastf1
import pandas as pd


def clean_data(data):
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
    year, round, session_type, data_type="results", driver=None, lap=None
):
    try:
        # Enable caching
        fastf1.Cache.enable_cache("cache/fastf1")

        # Load session
        session = fastf1.get_session(int(year), int(round), session_type)
        session.load()

        response = {}

        if data_type == "results":
            response["results"] = clean_data(session.results)

        elif data_type == "telemetry" and driver and lap:
            laps = session.laps.pick_driver(driver)
            lap_data = laps.pick_lap(int(lap))
            telemetry = lap_data.get_telemetry()
            response["telemetry"] = clean_data(telemetry)
            response["lap_data"] = clean_data(lap_data.to_frame().to_dict("records"))

        elif data_type == "fastest_laps":
            fastest_laps = session.laps.pick_fastest()
            response["fastest_laps"] = clean_data(fastest_laps)

        elif data_type == "driver_best_lap" and driver:
            driver_laps = session.laps.pick_driver(driver)
            best_lap = driver_laps.pick_fastest()
            telemetry = best_lap.get_telemetry()
            response["best_lap"] = clean_data(best_lap.to_frame().to_dict("records"))
            response["telemetry"] = clean_data(telemetry)

        elif data_type == "weather":
            response["weather"] = clean_data(session.weather_data)

        response["session_info"] = {
            "year": year,
            "round": round,
            "session_type": session_type,
            "track": session.event.Circuit.circuitName,
        }

        print(json.dumps(response))

    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"error": "Not enough arguments"}), file=sys.stderr)
        sys.exit(1)

    year = sys.argv[1]
    round = sys.argv[2]
    session_type = sys.argv[3]
    data_type = sys.argv[4] if len(sys.argv) > 4 else "results"
    driver = sys.argv[5] if len(sys.argv) > 5 else None
    lap = sys.argv[6] if len(sys.argv) > 6 else None

    get_session_data(year, round, session_type, data_type, driver, lap)
