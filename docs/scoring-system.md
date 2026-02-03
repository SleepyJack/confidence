# Scoring System Documentation

## Overview

The confidence calibration game uses two complementary metrics to measure user performance:

1. **Precision Score** - Rewards both accuracy and narrow ranges (0-100%, higher is better)
2. **Over/Under Confidence Score** - Measures systematic confidence bias (centered at 0)

Both metrics use **Exponential Moving Average (EMA)** filtering to provide smoother, more responsive feedback that encourages skill development over time.

---

## Metric 1: Precision Score

### Purpose
Measures how well users estimate by rewarding both **accuracy** (getting the answer in range) and **precision** (using narrow ranges).

### Implementation: Logarithmic Scoring with Normal Distribution

#### Why Logarithmic Scoring?

Logarithmic scoring is a **proper scoring rule**, meaning users maximize their expected score by reporting their true beliefs. This prevents gaming strategies like:
- Deliberately widening ranges to play it safe
- Over-reporting confidence to get higher scores

**Mathematical Property:**
```
Expected Score = ∫ p(x) × log(q(x)) dx
```

Where:
- `p(x)` = your true belief distribution
- `q(x)` = what you report to the system

This is maximized when `q = p` (honesty), due to Gibbs' inequality from information theory.

**Key Insight:** The logarithm's strictly concave shape creates the exact penalty structure where hedging your bets gives worse expected value than honest reporting.

#### Normal Distribution Model

User estimates are modeled as **normal distributions** rather than uniform distributions:

**Why Normal?**
- More intuitive visualization (bell curves vs rectangles)
- More realistic model of uncertainty
- Rewards precision naturally (taller peaks = higher density at center)
- Users understand that confidence is highest at the center of their range

**Parameters:**
```javascript
mean = (userLow + userHigh) / 2
z = inverse_normal_cdf((1 + confidence) / 2)
sigma = (userHigh - mean) / z
```

This ensures that the probability mass between `[userLow, userHigh]` equals the stated confidence level.

#### Scoring Formula

```javascript
// 1. Calculate probability density at the true answer
density = normalPDF(correctAnswer, mean, sigma)

// 2. Take the logarithm
logScore = log(density)

// 3. Clamp to reasonable range
clampedScore = max(-12, min(-1, logScore))

// 4. Normalize to 0-100%
precisionScore = ((clampedScore + 12) / 11) * 100
```

**Normalization Bounds:**
- **Floor: -12** (log(density) ≤ -12)
  - Represents ~6 standard deviations from mean
  - Prevents one catastrophic answer from destroying overall score
  - Mapped to 0%

- **Ceiling: -1** (log(density) ≥ -1)
  - Represents density ≥ 0.368
  - Achievable with tight, accurate ranges (e.g., width=2, centered answer)
  - Mapped to 100%

#### Example Scores

**Scenario 1: Centered answer, moderate range**
- Range: [90, 110], 80% confidence
- True answer: 100
- σ ≈ 7.8, density ≈ 0.051
- Log score: -2.97 → **82%**

**Scenario 2: Answer at edge**
- Range: [90, 110], 80% confidence
- True answer: 110
- Density ≈ 0.031
- Log score: -3.47 → **78%**

**Scenario 3: Answer just outside range**
- Range: [90, 110], 80% confidence
- True answer: 130 (3.85σ away)
- Density ≈ 0.000031
- Log score: -10.4 → **15%**

**Scenario 4: Very tight and accurate**
- Range: [99, 101], 80% confidence
- True answer: 100
- σ ≈ 0.78, density ≈ 0.512
- Log score: -0.67 → **100%**

---

## Metric 2: Over/Under Confidence Score

### Purpose
Measures systematic confidence bias using a simple, transparent formula that averages to zero for perfectly calibrated users.

### Formula

```javascript
if (correct) {
  score = 100 - confidence
} else {
  score = -confidence
}
```

### Why This Works

For a user with `C%` confidence who is actually correct `C%` of the time:

```
Expected Score = (C/100) × (100 - C) + (1 - C/100) × (-C)
                = C - C²/100 - C + C²/100
                = 0 ✓
```

**Interpretation:**
- **Score = 0**: Perfectly calibrated
- **Score > 0**: Underconfident (playing it safe)
- **Score < 0**: Overconfident (being too bold)

### Properties

1. **Linear penalties** - Being wrong at 90% confidence costs 90 points
2. **Risk/reward balance** - High confidence = small gains if right, large penalties if wrong
3. **Simple to understand** - No complex math, just basic arithmetic
4. **Proper scoring rule** - Cannot be gamed by systematically lying about confidence

### Comparison to Alternatives

**Why not `avgConfidence - actualAccuracy`?**
- Doesn't account for individual answer risk
- Treats all mistakes equally regardless of confidence
- Less responsive to learning

**Why not just track accuracy?**
- Doesn't measure calibration at all
- Users could be 80% accurate with 99% confidence (overconfident)
- Or 80% accurate with 60% confidence (underconfident)

---

## EMA Filtering

### Why EMA Instead of Simple Mean?

**Problems with simple mean:**
- Old mistakes penalize forever
- High variance at the beginning (small sample size)
- Doesn't reflect skill improvement
- Discourages practice

**Benefits of EMA:**
- Recent performance weighted more heavily (30% new, 70% old)
- Smoother trends, less noisy feedback
- Encourages continued practice
- Transforms tool from measurement to skill-building
- Shows upward trajectory clearly

### Implementation

```javascript
EMA_ALPHA = 0.3  // 30% new value, 70% old value

// Precision Score
if (ema === null) {
  ema = max(70%, firstScore)  // Start optimistic
} else {
  ema = α × newScore + (1 - α) × ema
}

// Over/Under Confidence Score
ema = 0  // Start at 0 (perfectly calibrated)
ema = α × newScore + (1 - α) × ema
```

**Initial Values:**
- **Precision Score**: 70% (or first score if higher)
  - Assumes users have some capability
  - Prevents catastrophic first answer from being demotivating

- **Over/Under Confidence**: 0
  - Neutral starting point
  - Represents perfect calibration

**α = 0.3 means:**
- ~10 answers to fully incorporate new patterns
- Recent 5 answers carry ~83% of the weight
- Old performance fades but isn't forgotten

### Visualization

Charts display both:
- **Scatter points** (raw scores) - Transparency shows individual performance
- **Smooth line** (EMA) - Shows trend and current skill level

---

## Design Decisions

### Why Two Metrics?

**Precision Score** and **Over/Under Confidence** measure different things:
- **Precision**: Overall estimation quality (accuracy + narrow ranges)
- **Confidence**: Systematic bias in confidence judgments

You can be:
- High precision, well-calibrated ✓ (ideal)
- High precision, overconfident (too narrow ranges)
- Low precision, well-calibrated (wide but honest ranges)
- Low precision, underconfident (unnecessarily wide ranges)

### Why Confidence Range 50-99%?

Below 50% confidence is illogical:
- 40% confidence = "60% chance my range is wrong"
- This means you believe your own estimate is probably incorrect
- **50% = coin flip** is the minimum meaningful confidence

### Why Normal Distribution Over Uniform?

**Considered uniform distribution:**
- Simpler math (constant density in range)
- No "center preference"

**Chose normal distribution:**
- More intuitive visualization (bell curves)
- More realistic model of uncertainty
- Center preference makes sense (encourages precision)
- Much prettier graphs

**Accepted trade-off:** Users get more credit for centered answers, but this is appropriate—if you're certain about the center, you should narrow your range.

### Why Not Percentile-Based Scoring?

**Idea:** Score = how close to center of distribution (100% at mean, 0% at tails)

**Problem:** Not a proper scoring rule! Can be gamed:
```
True belief: [90, 110], σ=7.8, answer at 115
- Honest: percentile 97.3 → score 5.4%
- Wide [80, 120], σ=15.6 → percentile 83.1 → score 33.8%
```

By being vague, you reduce penalties. Logarithmic scoring fixes this.

---

## Implementation Details

### File: `js/scoring.js`

**Core Functions:**
- `calculateLogScore()` - Computes log(density) for a single answer
- `normalizeLogScore()` - Maps [-12, -1] to [0, 100]
- `getCalibrationScoreEMA()` - Computes EMA of precision scores
- `calculateConfidenceBiasScore()` - Single answer confidence score
- `getConfidenceBiasScoreEMA()` - EMA of confidence bias
- `getTimeSeriesData()` - Returns both raw and EMA for charts
- `getConfidenceBiasTimeSeriesData()` - Same for confidence metric

**Key Constants:**
```javascript
LOG_SCORE_FLOOR: -12    // Worst possible clamped log score
EMA_ALPHA: 0.3          // EMA decay factor
PRECISION_INITIAL: 70   // Initial precision score (%)
```

### File: `js/chart.js`

**Visualization:**
- Two datasets per chart: scatter (raw) + line (EMA)
- Color-coded scatter points:
  - **Precision**: Orange at 50% opacity
  - **Confidence Bias**: Green (good), blue (under), red (over)
- Smooth curves with `tension: 0.35`
- Area fill under precision score line
- Zero-line reference for confidence bias

**Tooltips:**
- Show both raw and smoothed values
- Format: "Raw: 75.3%, Smoothed: 72.1%"

### File: `js/distribution.js`

**Bell Curve Rendering:**
- 200 points for smooth curve
- Area fill with gradient (full curve vs confidence bounds)
- Dashed vertical lines at user bounds
- True answer marked with arrow, dot on curve, and label
- Color-coded: green (captured) vs red (missed)

---

## Mathematical Foundations

### Proper Scoring Rules

A scoring rule `S(q, x)` is **proper** if:
```
E_p[S(q, X)] is maximized when q = p
```

Where `p` is true distribution, `q` is reported distribution.

**Log scoring satisfies this:**
```
E_p[log(q(X))] = ∫ p(x) log(q(x)) dx
```

This is the negative of **cross-entropy** `H(p, q)`, which is minimized when `q = p`.

**Other proper scoring rules:**
- Brier Score: `S = 1 - (q - I)²` where `I` is indicator function
- Spherical Score: `S = q / ||q||`

We chose log scoring because:
- Natural connection to information theory
- Heavily penalizes confident mistakes (exponential)
- Works well with probability distributions (density)

### Normal Distribution CDF Inversion

To get σ from confidence bounds, we solve:
```
P(userLow < X < userHigh) = confidence
P((userLow - μ)/σ < Z < (userHigh - μ)/σ) = confidence
```

For symmetric bounds around mean:
```
P(-z < Z < z) = confidence
P(Z < z) = (1 + confidence) / 2
z = Φ^(-1)((1 + confidence) / 2)
```

Then:
```
σ = (userHigh - mean) / z
```

We use **Abramowitz and Stegun rational approximation** for inverse CDF.

---

## Future Considerations

### Potential Improvements

1. **Adaptive Normalization Bounds**
   - Adjust [-12, -1] based on question difficulty
   - Track per-category difficulty
   - Calibrate bounds to real usage patterns

2. **Question-Specific EMA Decay**
   - Faster decay (higher α) for easier questions
   - Slower decay for difficult domains
   - Adaptive α based on score variance

3. **Multi-Timescale Tracking**
   - Short-term EMA (α=0.4) for recent trend
   - Long-term EMA (α=0.1) for overall skill
   - Display both for comparison

4. **Bayesian Confidence Intervals**
   - Show uncertainty in EMA estimates
   - Especially important early on
   - Visualize as shaded bands on charts

### Research Questions

1. **Optimal Initial Values**
   - Should we use 70% or different values?
   - Could we infer from first N answers?
   - Per-user calibration of starting point

2. **EMA Parameter Tuning**
   - Is α=0.3 optimal for learning?
   - Should it vary by user engagement level?
   - A/B test different decay rates

3. **Alternative Distributions**
   - Log-normal for skewed questions?
   - Mixture models for multi-modal uncertainty?
   - User-specified distribution shapes?

---

## References

### Information Theory
- Shannon, C. E. (1948). "A Mathematical Theory of Communication"
- Cover & Thomas (2006). "Elements of Information Theory"

### Proper Scoring Rules
- Gneiting & Raftery (2007). "Strictly Proper Scoring Rules, Prediction, and Estimation"
- Brier, G. W. (1950). "Verification of Forecasts Expressed in Terms of Probability"

### Calibration
- Lichtenstein, Fischhoff & Phillips (1982). "Calibration of Probabilities: The State of the Art"
- Tetlock & Gardner (2015). "Superforecasting: The Art and Science of Prediction"

### Statistical Methods
- Abramowitz & Stegun (1964). "Handbook of Mathematical Functions"
- Normal distribution and CDF approximations

---

## Changelog

### 2026-02-03
- Implemented EMA filtering (α=0.3)
- Changed confidence range to 50-99%
- Renamed "Calibration Score" to "Precision Score"
- Removed "Calibration Bias" metric
- Added scatter + line visualization

### 2026-02-02
- Switched from uniform to normal distribution model
- Replaced Chart.js for time-series charts
- Added Over/Under Confidence Score metric

### 2025-01-XX
- Initial implementation with logarithmic scoring
- Brier score → log score transition
- 45 curated questions added
