import sys
import json
import fastf1
import pandas as pd


def get_schedule(year):
    try:
        schedule = fastf1.get_event_schedule(int(year))
        # Convert to dict and handle NaN/datetime values
        schedule_dict = schedule.to_dict(orient="records")
        # Clean the data to ensure JSON serialization
        for event in schedule_dict:
            for key, value in event.items():
                if pd.isna(value):
                    event[key] = None
                elif isinstance(value, pd.Timestamp):
                    event[key] = value.isoformat()
        print(json.dumps(schedule_dict))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    if len(sys.argv) > 1:
        get_schedule(sys.argv[1])
    else:
        get_schedule(2024)  # Default to current year
