const fs = require('fs');
const vm = require('vm');
const path = require('path');

// scoring.js declares `const Scoring = {...}` — not a module.
// Load it via vm; appending `Scoring;` makes it the script's completion value.
const scoringCode = fs.readFileSync(path.join(__dirname, '..', 'js', 'scoring.js'), 'utf8');
const Scoring = vm.runInContext(scoringCode + '\nScoring;', vm.createContext({ Math, console }));

// ---------------------------------------------------------------------------
// isAnswerCorrect
// ---------------------------------------------------------------------------
describe('isAnswerCorrect', () => {
  test('answer inside range', () => {
    expect(Scoring.isAnswerCorrect(10, 20, 15)).toBe(true);
  });

  test('answer on lower boundary (inclusive)', () => {
    expect(Scoring.isAnswerCorrect(10, 20, 10)).toBe(true);
  });

  test('answer on upper boundary (inclusive)', () => {
    expect(Scoring.isAnswerCorrect(10, 20, 20)).toBe(true);
  });

  test('answer below range', () => {
    expect(Scoring.isAnswerCorrect(10, 20, 9)).toBe(false);
  });

  test('answer above range', () => {
    expect(Scoring.isAnswerCorrect(10, 20, 21)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// normalizeLogScore  — maps [LOG_SCORE_FLOOR, -1] → [0, 100]
// ---------------------------------------------------------------------------
describe('normalizeLogScore', () => {
  test('floor (-12) maps to 0', () => {
    expect(Scoring.normalizeLogScore(-12)).toBe(0);
  });

  test('ceiling (-1) maps to 100', () => {
    expect(Scoring.normalizeLogScore(-1)).toBe(100);
  });

  test('midpoint (-6.5) maps to ~50', () => {
    expect(Scoring.normalizeLogScore(-6.5)).toBeCloseTo(50);
  });

  test('values below floor clamp to 0', () => {
    expect(Scoring.normalizeLogScore(-100)).toBe(0);
  });

  test('values above ceiling clamp to 100', () => {
    expect(Scoring.normalizeLogScore(0)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// getNormalParams
// ---------------------------------------------------------------------------
describe('getNormalParams', () => {
  test('mean is midpoint of range', () => {
    expect(Scoring.getNormalParams(0, 100, 80).mean).toBe(50);
    expect(Scoring.getNormalParams(20, 60, 70).mean).toBe(40);
  });

  test('higher confidence → smaller sigma (tighter distribution)', () => {
    const lo = Scoring.getNormalParams(0, 100, 60).sigma;
    const hi = Scoring.getNormalParams(0, 100, 95).sigma;
    expect(hi).toBeLessThan(lo);
  });

  test('wider range → larger sigma at same confidence', () => {
    const narrow = Scoring.getNormalParams(40, 60, 80).sigma;
    const wide   = Scoring.getNormalParams(0, 100, 80).sigma;
    expect(wide).toBeGreaterThan(narrow);
  });

  test('sigma is always positive', () => {
    expect(Scoring.getNormalParams(0, 100, 50).sigma).toBeGreaterThan(0);
    expect(Scoring.getNormalParams(0, 100, 99).sigma).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// calculateLogScore
// ---------------------------------------------------------------------------
describe('calculateLogScore', () => {
  test('zero-width range returns -10', () => {
    expect(Scoring.calculateLogScore(50, 50, 80, 50)).toBe(-10);
  });

  test('negative-width range returns -10', () => {
    expect(Scoring.calculateLogScore(60, 50, 80, 55)).toBe(-10);
  });

  test('answer at centre scores higher than answer far away', () => {
    const centre = Scoring.calculateLogScore(0, 100, 80, 50);
    const far    = Scoring.calculateLogScore(0, 100, 80, 5000);
    expect(centre).toBeGreaterThan(far);
  });

  test('tight correct range scores higher than wide correct range', () => {
    const tight = Scoring.calculateLogScore(45, 55, 80, 50);
    const wide  = Scoring.calculateLogScore(0, 100, 80, 50);
    expect(tight).toBeGreaterThan(wide);
  });
});

// ---------------------------------------------------------------------------
// calculateConfidenceBiasScore  — right: +(100-conf), wrong: -conf
// ---------------------------------------------------------------------------
describe('calculateConfidenceBiasScore', () => {
  test('correct at 80% → +20', () => {
    expect(Scoring.calculateConfidenceBiasScore(80, true)).toBe(20);
  });

  test('wrong at 80% → -80', () => {
    expect(Scoring.calculateConfidenceBiasScore(80, false)).toBe(-80);
  });

  test('correct at 50% → +50', () => {
    expect(Scoring.calculateConfidenceBiasScore(50, true)).toBe(50);
  });

  test('wrong at 50% → -50', () => {
    expect(Scoring.calculateConfidenceBiasScore(50, false)).toBe(-50);
  });

  test('perfectly calibrated 80% user averages to 0 (4 right, 1 wrong)', () => {
    const scores = [true, true, true, true, false].map(
      ok => Scoring.calculateConfidenceBiasScore(80, ok)
    );
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    expect(avg).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getConfidenceBiasScoreEMA  — α=0.6 first, then α=0.3, starts at 0
// ---------------------------------------------------------------------------
describe('getConfidenceBiasScoreEMA', () => {
  test('empty history → null', () => {
    expect(Scoring.getConfidenceBiasScoreEMA([])).toBeNull();
  });

  test('single correct answer at 80%: 0.6×20 + 0.4×0 = 12', () => {
    expect(Scoring.getConfidenceBiasScoreEMA([
      { confidence: 80, isCorrect: true }
    ])).toBeCloseTo(12);
  });

  test('three-answer sequence produces expected EMA', () => {
    // Manual trace (first sample uses α=0.6, rest use α=0.3):
    //   answer 1: score=+20, ema = 0.6×20  + 0.4×0     =  12
    //   answer 2: score=-80, ema = 0.3×-80 + 0.7×12    = -15.6
    //   answer 3: score=+40, ema = 0.3×40  + 0.7×-15.6 =  1.08
    const history = [
      { confidence: 80, isCorrect: true },
      { confidence: 80, isCorrect: false },
      { confidence: 60, isCorrect: true },
    ];
    expect(Scoring.getConfidenceBiasScoreEMA(history)).toBeCloseTo(1.08);
  });
});

// ---------------------------------------------------------------------------
// getCalibrationScoreEMA  — α=0.6 first, then α=0.3, initialises at 50
// ---------------------------------------------------------------------------
describe('getCalibrationScoreEMA', () => {
  test('empty history → null', () => {
    expect(Scoring.getCalibrationScoreEMA([])).toBeNull();
  });

  test('first answer applies α=0.6 to initial value of 50', () => {
    // EMA = 0.6 × score + 0.4 × 50
    const history = [{ userLow: 0, userHigh: 100, confidence: 80, correctAnswer: 50 }];
    const result = Scoring.getCalibrationScoreEMA(history);
    // Result should be between 50 and the raw score
    expect(result).toBeGreaterThan(50);
    expect(result).toBeLessThan(100);
  });

  test('repeated bad scores pull EMA toward 0', () => {
    // Answer way outside range → normalised score ≈ 0, repeated 20× decays the EMA
    const bad = { userLow: 0, userHigh: 1, confidence: 80, correctAnswer: 10000 };
    expect(Scoring.getCalibrationScoreEMA(Array(20).fill(bad))).toBeLessThan(10);
  });

  test('repeated perfect scores pull EMA toward 100', () => {
    // Tight range, answer dead centre → high normalised score
    const perfect = { userLow: 49.9, userHigh: 50.1, confidence: 80, correctAnswer: 50 };
    expect(Scoring.getCalibrationScoreEMA(Array(20).fill(perfect))).toBeGreaterThan(90);
  });
});

// ---------------------------------------------------------------------------
// getCalibrationStatus
// ---------------------------------------------------------------------------
describe('getCalibrationStatus', () => {
  test('null → "No data yet"', () => {
    expect(Scoring.getCalibrationStatus(null)).toBe('No data yet');
  });

  test('0 → "Well-calibrated"', () => {
    expect(Scoring.getCalibrationStatus(0)).toBe('Well-calibrated');
  });

  test('4 → "Well-calibrated" (within ±5 band)', () => {
    expect(Scoring.getCalibrationStatus(4)).toBe('Well-calibrated');
  });

  test('10 → "Overconfident"', () => {
    expect(Scoring.getCalibrationStatus(10)).toBe('Overconfident');
  });

  test('-10 → "Underconfident"', () => {
    expect(Scoring.getCalibrationStatus(-10)).toBe('Underconfident');
  });
});

// ---------------------------------------------------------------------------
// calculateAllMetrics  — integration
// ---------------------------------------------------------------------------
describe('calculateAllMetrics', () => {
  test('empty history → null metrics, zero total, "No data yet"', () => {
    const m = Scoring.calculateAllMetrics([]);
    expect(m.totalAnswered).toBe(0);
    expect(m.calibrationScore).toBeNull();
    expect(m.confidenceBiasScore).toBeNull();
    expect(m.actualAccuracy).toBeNull();
    expect(m.status).toBe('No data yet');
  });

  test('two correct answers at 80% → all fields populated', () => {
    const history = [
      { userLow: 0, userHigh: 100, confidence: 80, correctAnswer: 50, isCorrect: true },
      { userLow: 0, userHigh: 100, confidence: 80, correctAnswer: 50, isCorrect: true },
    ];
    const m = Scoring.calculateAllMetrics(history);
    expect(m.totalAnswered).toBe(2);
    expect(m.calibrationScore).not.toBeNull();
    expect(m.confidenceBiasScore).not.toBeNull();
    expect(m.actualAccuracy).toBe(100);
    expect(m.averageConfidence).toBe(80);
    // Two correct at 80% → bias scores are +20 each → positive → Underconfident
    expect(m.status).toBe('Underconfident');
  });

  test('status is "Well-calibrated" when bias EMA is within ±5', () => {
    // All correct at 99% → bias score = +1 each time → EMA converges to ~1
    const history = Array(5).fill(
      { userLow: 0, userHigh: 100, confidence: 99, correctAnswer: 50, isCorrect: true }
    );
    const m = Scoring.calculateAllMetrics(history);
    expect(Math.abs(m.confidenceBiasScore)).toBeLessThan(5);
    expect(m.status).toBe('Well-calibrated');
  });
});

// ---------------------------------------------------------------------------
// getTimeSeriesData  — includes 0th point for trend line start
// ---------------------------------------------------------------------------
describe('getTimeSeriesData', () => {
  const history = [
    { userLow: 0, userHigh: 100, confidence: 80, correctAnswer: 50, timestamp: 1000 },
    { userLow: 0, userHigh: 100, confidence: 80, correctAnswer: 50, timestamp: 2000 },
  ];

  test('includes 0th point plus one per history entry', () => {
    expect(Scoring.getTimeSeriesData(history)).toHaveLength(3);
  });

  test('0th point has questionNumber 0 and null score', () => {
    const data = Scoring.getTimeSeriesData(history);
    expect(data[0].questionNumber).toBe(0);
    expect(data[0].score).toBeNull();
    expect(data[0].scoreEMA).toBe(50); // PRECISION_INITIAL
  });

  test('answer points are 1-indexed starting at index 1', () => {
    const data = Scoring.getTimeSeriesData(history);
    expect(data[1].questionNumber).toBe(1);
    expect(data[2].questionNumber).toBe(2);
  });

  test('answer points have numeric score and scoreEMA', () => {
    const point = Scoring.getTimeSeriesData(history)[1];
    expect(typeof point.score).toBe('number');
    expect(typeof point.scoreEMA).toBe('number');
    expect(point.questionNumber).toBe(1);
  });

  test('first answer EMA uses α=0.6 from initial 50', () => {
    const data = Scoring.getTimeSeriesData(history);
    const firstPoint = data[1];
    // EMA = 0.6 × score + 0.4 × 50
    const expected = 0.6 * firstPoint.score + 0.4 * 50;
    expect(firstPoint.scoreEMA).toBeCloseTo(expected);
  });
});

// ---------------------------------------------------------------------------
// getConfidenceBiasTimeSeriesData  — includes 0th point for trend line start
// ---------------------------------------------------------------------------
describe('getConfidenceBiasTimeSeriesData', () => {
  test('0th point has questionNumber 0, null bias, and EMA 0', () => {
    const history = [{ confidence: 80, isCorrect: true, timestamp: 1000 }];
    const data = Scoring.getConfidenceBiasTimeSeriesData(history);
    expect(data[0].questionNumber).toBe(0);
    expect(data[0].confidenceBias).toBeNull();
    expect(data[0].confidenceBiasEMA).toBe(0);
  });

  test('raw scores match calculateConfidenceBiasScore (at index 1+)', () => {
    const history = [
      { confidence: 80, isCorrect: true,  timestamp: 1000 },  // raw = +20
      { confidence: 60, isCorrect: false, timestamp: 2000 },  // raw = -60
    ];
    const data = Scoring.getConfidenceBiasTimeSeriesData(history);
    expect(data[1].confidenceBias).toBe(20);
    expect(data[2].confidenceBias).toBe(-60);
  });

  test('EMA on first answer: 0.6×raw + 0.4×0', () => {
    const history = [{ confidence: 80, isCorrect: true, timestamp: 1000 }];
    const point = Scoring.getConfidenceBiasTimeSeriesData(history)[1];
    expect(point.confidenceBiasEMA).toBeCloseTo(12); // 0.6×20
  });

  test('answer points are 1-indexed starting at index 1', () => {
    const history = [
      { confidence: 80, isCorrect: true,  timestamp: 1000 },
      { confidence: 80, isCorrect: false, timestamp: 2000 },
    ];
    const data = Scoring.getConfidenceBiasTimeSeriesData(history);
    expect(data[1].questionNumber).toBe(1);
    expect(data[2].questionNumber).toBe(2);
  });
});
