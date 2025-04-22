import fastf1
import json
import warnings
import sys

from datetime import datetime, timezone

# Enable caching
fastf1.Cache.enable_cache('cache/fastf1')

# Suppress warnings from FastF1
warnings.filterwarnings("ignore", category=UserWarning, module="fastf1")


def get_championship_points(year, round_number=None, points_type="driver"):
    try:
        # Get the event schedule for the year
        event_schedule = fastf1.get_event_schedule(year)
        event_schedule = event_schedule[event_schedule['RoundNumber'] > 0]  # Filter valid rounds

        def load_race_results(event_round):
            race = fastf1.get_session(year, event_round, 'R')
            race.load()
            return race.results

        if points_type == "per_race":
            results_per_race = []
            for _, event in event_schedule.iterrows():
                try:
                    race_results = load_race_results(event['RoundNumber'])
                    race_points = [
                        {
                            'driver': driver.get('Abbreviation', 'N/A'),
                            'name': driver.get('FullName', 'N/A'),
                            'points': driver.get('Points', 0)
                        }
                        for _, driver in race_results.iterrows()
                    ]
                    results_per_race.append({
                        'round': event['RoundNumber'],
                        'race_name': event['EventName'],
                        'results': race_points
                    })
                except Exception as e:
                    print(f"Warning: Failed to load session for round {event['RoundNumber']}. Details: {e}", file=sys.stderr)
            return json.dumps({'year': year, 'points_type': points_type, 'results': results_per_race}, indent=4)

        standings = {}
        for _, event in event_schedule.iterrows():
            try:
                race_results = load_race_results(event['RoundNumber'])
                for _, driver in race_results.iterrows():
                    if points_type == "driver":
                        key = driver.get('Abbreviation', 'N/A')
                        name = driver.get('FullName', 'N/A')
                    elif points_type == "constructor":
                        key = driver.get('TeamName', 'N/A')
                        name = None
                    else:
                        raise ValueError(f"Invalid points type: {points_type}. Must be 'driver' or 'constructor'.")
                    standings.setdefault(key, {'points': 0, 'name': name})
                    standings[key]['points'] += driver.get('Points', 0)
            except Exception as e:
                print(f"Warning: Failed to load session for round {event['RoundNumber']}. Details: {e}", file=sys.stderr)

        if round_number is None:
            results = [
                {'name': data['name'] or key, 'points': data['points']}
                for key, data in sorted(standings.items(), key=lambda x: x[1]['points'], reverse=True)
            ]
            return json.dumps({'year': year, 'points_type': points_type, 'results': results}, indent=4)

        if round_number not in event_schedule['RoundNumber'].values:
            raise ValueError(f"No race found with round number '{round_number}' in {year}.")

        race_results = load_race_results(round_number)
        if points_type == "driver":
            position_col = 'PositionText' if 'PositionText' in race_results.columns else 'Position'
            championship_points = [
                {
                    'driver': driver.get('Abbreviation', 'N/A'),
                    'name': driver.get('FullName', 'N/A'),
                    'position': driver.get(position_col, 'N/A'),
                    'status': driver.get('Status', 'Unknown'),
                    'dnf': not driver.get('Status', '').lower().startswith("finished"),
                    'points': driver.get('Points', 0)
                }
                for _, driver in race_results.iterrows()
            ]
        elif points_type == "constructor":
            constructors = {}
            for _, driver in race_results.iterrows():
                constructor = driver.get('TeamName', 'N/A')
                constructors[constructor] = constructors.get(constructor, 0) + driver.get('Points', 0)
            championship_points = [{'constructor': constructor, 'points': points} for constructor, points in constructors.items()]
        else:
            raise ValueError(f"Invalid points type: {points_type}. Must be 'driver' or 'constructor'.")

        return json.dumps({'year': year, 'round': round_number, 'points_type': points_type, 'results': championship_points}, indent=4)

    except fastf1.core.DataNotLoadedError as e:
        return json.dumps({'error': 'Failed to load data.', 'details': str(e), 'year': year, 'round': round_number}, indent=4)
    except Exception as e:
        return json.dumps({'error': 'An unexpected error occurred.', 'details': str(e), 'year': year, 'round': round_number}, indent=4)


if __name__ == "__main__":
    try:
        if len(sys.argv) < 2 or len(sys.argv) > 4:
            print(json.dumps({
                'error': 'Invalid arguments. Usage: python get_championship_points.py <year> [<round_number>] [<points_type>]',
                'details': 'Provide at least one argument: <year> (e.g., 2023). Optionally, provide <round_number> (e.g., 1) and <points_type> (e.g., "driver" or "constructor").'
            }, indent=4))
            sys.exit(1)

        year = int(sys.argv[1])
        round_number = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
        points_type = sys.argv[3] if len(sys.argv) == 4 else "driver"
        print(get_championship_points(year, round_number, points_type))
    except Exception as e:
        print(json.dumps({'error': 'Unexpected error in main.', 'details': str(e)}, indent=4))
        sys.exit(1)
