import sys
import json
import fastf1
import pandas as pd


def get_schedule(year):
    try:
        schedule = fastf1.get_event_schedule(int(year))
        print(schedule.where(pd.notna(schedule), None).to_json(orient="records", date_format="iso"))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    year = sys.argv[1] if len(sys.argv) > 1 else 2024  # Default to 2024
    get_schedule(year)
