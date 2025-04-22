import sys
import json
import fastf1
import pandas as pd


def get_schedule(year):
    try:
        schedule = fastf1.get_event_schedule(int(year))
        # Convert to dict and handle NaN/datetime values
        schedule_dict = schedule.fillna(None).to_dict(orient="records")
        for event in schedule_dict:
            for key, value in event.items():
                if isinstance(value, pd.Timestamp):
                    event[key] = value.isoformat()
        print(json.dumps(schedule_dict, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    year = sys.argv[1] if len(sys.argv) > 1 else 2024  # Default to 2024
    get_schedule(year)
