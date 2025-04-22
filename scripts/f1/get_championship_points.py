import fastf1
import json
import warnings
import sys
import logging
import numpy as np
import pandas as pd
from datetime import datetime, timezone
import os

# Ensure the cache directory exists
os.makedirs('./cache', exist_ok=True)

# Redirect FastF1 logs to stderr or suppress them completely
for handler in logging.root.handlers[:]:
    logging.root.removeHandler(handler)
logging.basicConfig(stream=sys.stderr, level=logging.DEBUG)  # Ensure logs go to stderr

# Disable FastF1 logging
logging.getLogger('fastf1').setLevel(logging.CRITICAL)

# Enable FastF1 cache with a relative path
fastf1.Cache.enable_cache('./cache')

# Suppress warnings from FastF1
warnings.filterwarnings("ignore", category=UserWarning, module="fastf1")

def json_error(message, details=None):
    """Return a JSON error response and exit."""
    print(f"Error: {message}\nDetails: {details}", file=sys.stderr)  # Log error to stderr
    print(json.dumps({'error': message, 'details': details}, indent=4))
    sys.exit(1)

def safe_get(series, key, default='N/A'):
    """Safely get a value from a Pandas Series."""
    return series[key] if key in series and pd.notnull(series[key]) else default

def safe_json(obj):
    """Ensure all objects are JSON serializable."""
    if isinstance(obj, (np.integer, np.int32, np.int64)):
        return int(obj)
    if isinstance(obj, (np.floating, np.float32, np.float64)):
        return float(obj)
    if isinstance(obj, (np.ndarray,)):
        return obj.tolist()
    return str(obj)

def load_race_results(year, event_round):
    """Load race results for a specific round."""
    race = fastf1.get_session(year, event_round, 'R')
    try:
        race.load()
        if race.results is None or race.results.empty:
            return None
        return race.results
    except Exception as e:
        logging.error(f"Race session load failed for round {event_round}. Details: {str(e)}")
        return None

def get_championship_points(year, round_number=None, points_type="driver"):
    try:
        # Get the event schedule for the year
        event_schedule = fastf1.get_event_schedule(year)
        event_schedule = event_schedule[event_schedule['RoundNumber'] > 0]  # Filter valid rounds

        if points_type == "per_race":
            results_per_race = []
            for _, event in event_schedule.iterrows():
                race_results = load_race_results(year, event['RoundNumber'])
                if race_results is None:
                    continue  # Skip if no race results are available
                race_points = [
                    {
                        'driver': safe_get(driver, 'Abbreviation'),
                        'name': safe_get(driver, 'FullName'),
                        'points': safe_get(driver, 'Points', 0)
                    }
                    for _, driver in race_results.iterrows()
                ]
                results_per_race.append({
                    'round': event['RoundNumber'],
                    'race_name': event['EventName'],
                    'results': race_points
                })
            return json.dumps({'year': year, 'points_type': points_type, 'results': results_per_race}, indent=4, default=safe_json)

        standings = {}
        for _, event in event_schedule.iterrows():
            race_results = load_race_results(year, event['RoundNumber'])
            if race_results is None:
                continue  # Skip if no race results are available
            for _, driver in race_results.iterrows():
                if points_type == "driver":
                    key = safe_get(driver, 'Abbreviation')
                    name = safe_get(driver, 'FullName')
                elif points_type == "constructor":
                    key = safe_get(driver, 'TeamName')
                    name = None
                else:
                    raise ValueError(f"Invalid points type: {points_type}. Must be 'driver' or 'constructor'.")
                standings.setdefault(key, {'points': 0, 'name': name})
                standings[key]['points'] += safe_get(driver, 'Points', 0)

        if round_number is None:
            results = [
                {'name': data['name'] or key, 'points': data['points']}
                for key, data in sorted(standings.items(), key=lambda x: x[1]['points'], reverse=True)
            ]
            return json.dumps({'year': year, 'points_type': points_type, 'results': results}, indent=4, default=safe_json)

        if round_number not in event_schedule['RoundNumber'].values:
            raise ValueError(f"No race found with round number '{round_number}' in {year}.")

        race_results = load_race_results(year, round_number)
        if race_results is None:
            return json.dumps({'year': year, 'round': round_number, 'points_type': points_type, 'results': []}, indent=4, default=safe_json)

        if points_type == "driver":
            position_col = 'PositionText' if 'PositionText' in race_results.columns else 'Position'
            championship_points = [
                {
                    'driver': safe_get(driver, 'Abbreviation'),
                    'name': safe_get(driver, 'FullName'),
                    'position': safe_get(driver, position_col),
                    'status': safe_get(driver, 'Status', 'Unknown'),
                    'dnf': not safe_get(driver, 'Status', '').lower().startswith("finished"),
                    'points': safe_get(driver, 'Points', 0)
                }
                for _, driver in race_results.iterrows()
            ]
        elif points_type == "constructor":
            constructors = {}
            for _, driver in race_results.iterrows():
                constructor = safe_get(driver, 'TeamName')
                constructors[constructor] = constructors.get(constructor, 0) + safe_get(driver, 'Points', 0)
            championship_points = [{'constructor': constructor, 'points': points} for constructor, points in constructors.items()]
        else:
            raise ValueError(f"Invalid points type: {points_type}. Must be 'driver' or 'constructor'.")

        return json.dumps({'year': year, 'round': round_number, 'points_type': points_type, 'results': championship_points}, indent=4, default=safe_json)

    except fastf1.core.DataNotLoadedError as e:
        json_error('Failed to load data.', str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()  # Log the full traceback for debugging
        json_error('An unexpected error occurred.', str(e))

def main():
    try:
        if len(sys.argv) < 2 or len(sys.argv) > 4:
            json_error(
                'Invalid arguments. Usage: python get_championship_points.py <year> [<round_number>] [<points_type>]',
                'Provide at least one argument: <year> (e.g., 2023). Optionally, provide <round_number> (e.g., 1) and <points_type> (e.g., "driver" or "constructor").'
            )

        year = int(sys.argv[1])
        round_number = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
        points_type = sys.argv[3] if len(sys.argv) == 4 else "driver"
        result = get_championship_points(year, round_number, points_type)
        print(result)  # Ensure only JSON is printed to stdout
    except Exception as e:
        import traceback
        traceback.print_exc()  # Log the full traceback for debugging
        json_error("Failed to generate championship points", str(e))

if __name__ == "__main__":
    main()
