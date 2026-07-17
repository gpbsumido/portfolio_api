import type {
  FantasyDataResult,
  FantasyPointsEntry,
  QualifyingResult,
  RaceResult,
} from './types.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { runPythonScriptQueued, MEMORY_ERROR_MESSAGES } = require('../../../utils/pythonQueue') as {
  runPythonScriptQueued: (scriptName: string, args?: string[]) => Promise<any>;
  MEMORY_ERROR_MESSAGES: Record<string, string>;
};

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  calculateQualifyingPoints,
  calculateRacePoints,
} = require('../../../utils/fantasyScoring') as {
  calculateQualifyingPoints: (result: QualifyingResult) => { points: number; breakdown: Record<string, number> };
  calculateRacePoints: (race: RaceResult, quali: QualifyingResult) => { points: number; breakdown: Record<string, number> };
};

export { MEMORY_ERROR_MESSAGES };

export class FantasyService {
  async getFantasyPoints(
    year: string,
    round: string,
  ): Promise<{ event: unknown; points: Record<string, FantasyPointsEntry>; unprocessed: FantasyDataResult }> {
    const results: FantasyDataResult = await runPythonScriptQueued('get_fantasy_data.py', [year, round]);

    if (results.error) {
      throw new Error(results.error);
    }

    const fantasyPoints: Record<string, FantasyPointsEntry> = {};

    results.qualifying.forEach((qualiResult) => {
      const driver = qualiResult.driver;
      const raceResult = results.race.find((r) => r.driver === driver);
      if (!raceResult) return;

      const qualifyingPoints = calculateQualifyingPoints(qualiResult);
      const racePoints = calculateRacePoints(raceResult, qualiResult);

      fantasyPoints[driver] = {
        total: qualifyingPoints.points + racePoints.points,
        qualifying: qualifyingPoints,
        race: racePoints,
      };
    });

    return {
      event: results.event_info,
      points: fantasyPoints,
      unprocessed: results,
    };
  }
}
