const { calculateQualifyingPoints, calculateRacePoints } = require('../utils/fantasyScoring');

// ── Qualifying ────────────────────────────────────────────────────────────────

describe('calculateQualifyingPoints', () => {
    test('pole position scores 10 points', () => {
        const result = calculateQualifyingPoints({ position: 1 });
        expect(result.points).toBe(10);
        expect(result.breakdown.position).toBe(10);
    });

    test('P10 scores 1 point', () => {
        const result = calculateQualifyingPoints({ position: 10 });
        expect(result.points).toBe(1);
    });

    test('outside top 10 scores 0 points', () => {
        const result = calculateQualifyingPoints({ position: 11 });
        expect(result.points).toBe(0);
        expect(result.breakdown.position).toBeUndefined();
    });

    test('Q2 appearance adds 0 points but appears in breakdown', () => {
        const result = calculateQualifyingPoints({ position: 8, Q2: true });
        expect(result.breakdown.Q2_appearance).toBe(0);
    });

    test('Q3 appearance adds 0 points but appears in breakdown', () => {
        const result = calculateQualifyingPoints({ position: 3, Q3: true });
        expect(result.breakdown.Q3_appearance).toBe(0);
    });
});

// ── Race ─────────────────────────────────────────────────────────────────────

describe('calculateRacePoints', () => {
    test('race win scores 25 points', () => {
        const result = calculateRacePoints({ position: 1 }, { position: 1 });
        expect(result.breakdown.position).toBe(25);
    });

    test('P11 and above scores 0 position points', () => {
        const result = calculateRacePoints({ position: 11 }, { position: 11 });
        expect(result.breakdown.position).toBeUndefined();
        expect(result.points).toBe(0);
    });

    test('fastest lap adds 10 points', () => {
        const result = calculateRacePoints({ position: 5, fastestLap: true }, { position: 5 });
        expect(result.breakdown.fastestLap).toBe(10);
        expect(result.points).toBe(10 + 10); // P5 + fastest lap
    });

    test('driver of the day adds 10 points', () => {
        const result = calculateRacePoints({ position: 3, driverOfTheDay: true }, { position: 3 });
        expect(result.breakdown.driverOfTheDay).toBe(10);
        expect(result.points).toBe(15 + 10); // P3 + DOTD
    });

    test('DNF deducts 20 points', () => {
        const result = calculateRacePoints({ status: 'DNF', position: 15 }, { position: 10 });
        expect(result.breakdown.dnf).toBe(-20);
    });

    test('Retired counts as DNF', () => {
        const result = calculateRacePoints({ status: 'Retired', position: 15 }, { position: 10 });
        expect(result.breakdown.dnf).toBe(-20);
    });

    test('Mechanical failure counts as DNF', () => {
        const result = calculateRacePoints({ status: 'Mechanical', position: 15 }, { position: 10 });
        expect(result.breakdown.dnf).toBe(-20);
    });

    test('Disqualified deducts 20 points', () => {
        const result = calculateRacePoints({ status: 'Disqualified', position: 1 }, { position: 1 });
        expect(result.breakdown.disqualified).toBe(-20);
    });

    test('positions gained scores 1 point each', () => {
        // qualified P5, finished P2 → gained 3
        const result = calculateRacePoints({ position: 2 }, { position: 5 });
        expect(result.breakdown.positionsGained).toBe(3);
    });

    test('positions lost deducts 1 point each', () => {
        // qualified P3, finished P7 → lost 4
        const result = calculateRacePoints({ position: 7 }, { position: 3 });
        expect(result.breakdown.positionsLost).toBe(-4);
    });

    test('DNF suppresses positions lost penalty', () => {
        // started P3, retired P15 — big drop but DNF flag should block pos-lost
        const result = calculateRacePoints({ status: 'DNF', position: 15 }, { position: 3 });
        expect(result.breakdown.positionsLost).toBeUndefined();
        expect(result.breakdown.dnf).toBe(-20);
    });

    test('overtakes score 1 point each', () => {
        const result = calculateRacePoints({ position: 5, overtakes: 4 }, { position: 5 });
        expect(result.breakdown.overtakes).toBe(4);
    });

    test('Lapped status does not trigger DNF penalty', () => {
        const result = calculateRacePoints({ status: 'Lapped', position: 12 }, { position: 12 });
        expect(result.breakdown.dnf).toBeUndefined();
    });

    test('combined: win + fastest lap + DOTD + 2 overtakes', () => {
        const result = calculateRacePoints(
            { position: 1, fastestLap: true, driverOfTheDay: true, overtakes: 2 },
            { position: 1 }
        );
        // 25 (P1) + 10 (FL) + 10 (DOTD) + 2 (overtakes)
        expect(result.points).toBe(47);
    });
});
