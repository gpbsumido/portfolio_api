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

        # Filter out invalid rounds (e.g., testing events with RoundNumber == 0)
        event_schedule = event_schedule[event_schedule['RoundNumber'] > 0]

        if points_type == "per_race":
            # Calculate points per race
            results_per_race = []

            for _, event in event_schedule.iterrows():
                event_round = event['RoundNumber']
                try:
                    race = fastf1.get_session(year, event_round, 'R')
                    race.load()
                    race_results = race.results

                    race_points = []
                    for _, driver in race_results.iterrows():
                        driver_code = driver.get('Abbreviation', 'N/A')
                        full_name = driver.get('FullName', 'N/A')
                        points = driver.get('Points', 0)
                        race_points.append({
                            'driver': driver_code,
                            'name': full_name,
                            'points': points
                        })

                    results_per_race.append({
                        'round': event_round,
                        'race_name': event['EventName'],
                        'results': race_points
                    })
                except Exception as e:
                    print(f"Warning: Failed to load session for round {event_round}. Details: {e}", file=sys.stderr)
                    continue

            return json.dumps({
                'year': year,
                'points_type': points_type,
                'results': results_per_race
            }, indent=4, default=str)

        if round_number is None:
            # Calculate full-season standings
            standings = {}

            for _, event in event_schedule.iterrows():
                event_round = event['RoundNumber']
                try:
                    race = fastf1.get_session(year, event_round, 'R')
                    race.load()
                    race_results = race.results

                    if points_type == "driver":
                        for _, driver in race_results.iterrows():
                            driver_code = driver.get('Abbreviation', 'N/A')
                            full_name = driver.get('FullName', 'N/A')
                            points = driver.get('Points', 0)
                            if driver_code not in standings:
                                standings[driver_code] = {'points': 0, 'name': full_name}
                            standings[driver_code]['points'] += points
                    elif points_type == "constructor":
                        for _, driver in race_results.iterrows():
                            constructor = driver.get('TeamName', 'N/A')
                            points = driver.get('Points', 0)
                            if constructor not in standings:
                                standings[constructor] = {'points': 0}
                            standings[constructor]['points'] += points
                    else:
                        raise ValueError(f"Invalid points type: {points_type}. Must be 'driver' or 'constructor'.")
                except Exception as e:
                    print(f"Warning: Failed to load session for round {event_round}. Details: {e}", file=sys.stderr)
                    continue

            # Format standings as a list of dictionaries
            results = [
                {'name': name, 'points': data['points']}
                for name, data in sorted(standings.items(), key=lambda x: x[1]['points'], reverse=True)
            ]

            return json.dumps({
                'year': year,
                'points_type': points_type,
                'results': results
            }, indent=4, default=str)

        # Validate round number
        if round_number not in event_schedule['RoundNumber'].values:
            raise ValueError(f"No race found with round number '{round_number}' in {year}.")

        # Load the session for the specific round
        race = fastf1.get_session(year, round_number, 'R')
        race.load()

        # Get race results
        race_results = race.results
        position_col = 'PositionText' if 'PositionText' in race_results.columns else 'Position'
        championship_points = []

        if points_type == "driver":
            for _, driver in race_results.iterrows():
                driver_code = driver.get('Abbreviation', 'N/A')
                full_name = driver.get('FullName', 'N/A')
                status = driver.get('Status', 'Unknown')
                position = driver.get(position_col, 'N/A')
                dnf = not status.lower().startswith("finished") and not status.startswith("+")
                points = driver.get('Points', 0)

                championship_points.append({
                    'driver': driver_code,
                    'name': full_name,
                    'position': position,
                    'status': status,
                    'dnf': dnf,
                    'points': points
                })
        elif points_type == "constructor":
            constructors = {}
            for _, driver in race_results.iterrows():
                constructor = driver.get('TeamName', 'N/A')
                points = driver.get('Points', 0)
                constructors[constructor] = constructors.get(constructor, 0) + points

            for constructor, points in constructors.items():
                championship_points.append({
                    'constructor': constructor,
                    'points': points
                })
        else:
            raise ValueError(f"Invalid points type: {points_type}. Must be 'driver' or 'constructor'.")

        return json.dumps({
            'year': year,
            'round': round_number,
            'points_type': points_type,
            'results': championship_points
        }, indent=4, default=str)

    except fastf1.core.DataNotLoadedError as e:
        return json.dumps({
            'error': 'Failed to load data.',
            'details': str(e),
            'year': year,
            'round': round_number
        }, indent=4)
    except Exception as e:
        return json.dumps({
            'error': 'An unexpected error occurred.',
            'details': str(e),
            'year': year,
            'round': round_number
        }, indent=4)

if __name__ == "__main__":
    import sys
    try:
        if len(sys.argv) < 2 or len(sys.argv) > 4:
            print(json.dumps({
                'error': 'Invalid arguments. Usage: python get_championship_points.py <year> [<round_number>] [<points_type>]',
                'details': 'Provide at least one argument: <year> (e.g., 2023). Optionally, provide <round_number> (e.g., 1) and <points_type> (e.g., "driver" or "constructor").'
            }, indent=4))
            sys.exit(1)
        else:
            year = int(sys.argv[1])
            round_number = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else None
            points_type = sys.argv[3] if len(sys.argv) == 4 else "driver"
            print(get_championship_points(year, round_number, points_type))
    except Exception as e:
        print(json.dumps({
            'error': 'Unexpected error in main.',
            'details': str(e)
        }, indent=4))
        sys.exit(1)
