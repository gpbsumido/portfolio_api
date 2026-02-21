import fastf1
import json
import pandas as pd
import sys
import os

# Enable caching
cache_dir = '/tmp/fastf1_cache' if os.environ.get('RAILWAY_ENVIRONMENT') else os.path.join(os.path.dirname(__file__), '..', '..', 'cache', 'fastf1')
os.makedirs(cache_dir, exist_ok=True)
fastf1.Cache.enable_cache(cache_dir)

try:
    year = int(sys.argv[1])
    round_num = int(sys.argv[2])
except (IndexError, ValueError):
    print(json.dumps({'error': 'Usage: get_fantasy_data.py <year> <round>'}))
    sys.exit(1)

try:
    quali = fastf1.get_session(year, round_num, 'Q')
    race = fastf1.get_session(year, round_num, 'R')

    quali.load()
    race.load()

    # Get qualifying results
    quali_data = []
    for _, driver in quali.results.iterrows():
        quali_data.append({
            'driver': driver['Abbreviation'],
            'position': int(driver['Position']),
            'Q2': not pd.isna(driver['Q2']),
            'Q3': not pd.isna(driver['Q3']),
        })

    # Get race results
    race_data = []
    for _, driver in race.results.iterrows():
        position = int(driver['Position']) if not pd.isna(driver['Position']) else None
        status = driver['Status']
        dnf = status not in ['Finished'] and not status.startswith('+')
        race_data.append({
            'driver': driver['Abbreviation'],
            'position': position,
            'status': status,
            'dnf': dnf,
            'fastestLap': False,
            'overtakes': 0,
        })

    # Determine fastest lap driver
    fastest_lap_driver = race.laps.pick_fastest()['Driver']
    for entry in race_data:
        if entry['driver'] == fastest_lap_driver:
            entry['fastestLap'] = True
            break

    # Count overtakes per driver
    for driver_code in race.drivers:
        driver_laps = race.laps.pick_drivers(driver_code)
        overtakes = sum(
            1 for i in range(1, len(driver_laps))
            if driver_laps.iloc[i]['Position'] < driver_laps.iloc[i - 1]['Position']
        )
        for entry in race_data:
            if entry['driver'] == driver_code:
                entry['overtakes'] = overtakes
                break

    output = {
        'qualifying': quali_data,
        'race': race_data,
        'event_info': {
            'name': race.event['EventName'],
            'year': year,
            'round': round_num,
            'date': str(race.date),
        },
    }

    print(json.dumps(output))

except Exception as e:
    print(json.dumps({'error': str(e), 'year': year, 'round': round_num}))
    sys.exit(1)
