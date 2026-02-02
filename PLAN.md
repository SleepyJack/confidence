# Implementation Plan

## Project Overview

Building a confidence calibration game as a web application, starting with a minimal viable product (MVP) and clear paths for future enhancement.

## MVP Scope (Phase 1)

### Core Features
- Single-page web application
- Static question set (30-50 curated questions)
- User inputs: numerical range (low/high bounds) + confidence level
- Immediate feedback after each question (correct/incorrect)
- End-of-game summary with calibration statistics
- Browser localStorage for session persistence

### Technical Architecture

**Frontend Only (No Backend Required for MVP)**
- HTML/CSS/JavaScript (Vanilla JS for MVP)
- **Modular structure** to enable easy migration to React/Vue later:
  - Separate modules: `game.js` (game logic), `storage.js` (localStorage), `ui.js` (DOM manipulation), `scoring.js` (calibration calculations)
  - Clear interfaces between modules
  - No tight coupling to DOM structure

**Data Storage**
- Questions: Static JSON file embedded in the project
- User answers & history: Browser localStorage
- Format: `{ questionId, userLow, userHigh, confidence, correctAnswer, isCorrect, timestamp }`

**Question Format**
```json
{
  "id": "moon-distance",
  "question": "What is the average distance from Earth to the Moon in kilometers?",
  "answer": 384400,
  "unit": "km",
  "category": "astronomy",
  "difficulty": "medium"
}
```

### Scoring Algorithm

**Calibration Calculation**:
For each answer, determine if the correct answer falls within the user's stated range:
- If correct answer is within [userLow, userHigh]: **correct**
- If outside the range: **incorrect**

**Instantaneous Calibration Score**:
After each question, calculate running metrics:
- Bucket answers by confidence level (rounded to nearest 5% or 10%)
- For each bucket: Expected accuracy vs Actual accuracy
- Calibration error: |Expected - Actual|
- Overall calibration score: weighted average of calibration errors

**Time-Series & Recency Weighting**:
- Store all historical answers with timestamps
- Display calibration score over time (e.g., line chart or sparkline)
- **Recency weighting** (optional for MVP, consider for polish):
  - Recent answers weighted more heavily in score calculation
  - Simple approach: Exponential moving average with decay factor (e.g., 0.9)
  - Alternative: Rolling window (e.g., last 20 answers)
- Shows if user is improving calibration over time

**Display Components**:
1. **Current Answer Feedback**: "Correct!" or "Incorrect - answer was X"
2. **Instantaneous Score**: Current overall calibration score
3. **Mini Chart**: Small time-series showing score trend
4. **Summary Stats**:
   - Total questions answered
   - Per-confidence-level breakdown (e.g., "At 80% confidence: 12/15 correct = 80%" - perfect!)
   - Overall indicator: "Overconfident" / "Well-calibrated" / "Underconfident"

### UI/UX Design Decisions

**Question Input**:
- Text inputs for low/high bounds (with number validation)
- **Slider for confidence level** (0-100%, or perhaps 50-99% to avoid extremes)
  - Shows percentage as user drags
  - Allows sophisticated users full control over confidence expression

**Game Flow (One Question at a Time)**:
1. **First visit**: Brief instructions overlay or welcome modal
2. **Question Display**: Show one question with input form
3. **User Input**: Range (low/high) + confidence slider
4. **Submit Answer**
5. **Immediate Feedback Screen**:
   - Reveal correct answer
   - Show if user's range captured it (✓ or ✗)
   - Update and display calibration stats:
     - Current overall calibration score
     - Mini time-series chart showing trend
     - Summary stats (total Qs, breakdown by confidence level)
6. **"Next Question" button**: User decides whether to continue or stop
7. **No enforced session length**: Users play as long as they want

**Persistent Stats Display**:
- Always visible (sidebar or top bar):
  - Total questions answered
  - Current calibration score
  - Mini chart showing recent performance
- Updates after each question

**Future Enhancement (Post-MVP)**:
- **History View**: Separate page/modal where users can browse all past answers, filter by category, see which questions they got wrong, etc.

## Technical Implementation Structure

### File Organization
```
confidence/
├── index.html           # Main HTML page
├── styles/
│   └── main.css        # All styles
├── js/
│   ├── main.js         # Entry point, initialization
│   ├── game.js         # Game state and logic
│   ├── storage.js      # localStorage interface
│   ├── scoring.js      # Calibration calculations
│   ├── ui.js           # DOM manipulation, rendering
│   └── chart.js        # Time-series visualization
└── data/
    └── questions.json  # Static question bank
```

### Module Interfaces

**game.js** - Core game logic
```javascript
// State management
- getCurrentQuestion()
- submitAnswer(low, high, confidence)
- getNextQuestion()
- getGameState()
```

**storage.js** - Data persistence
```javascript
- saveAnswer(answer)
- loadHistory()
- getQuestionPool()
- markQuestionSeen(questionId)
```

**scoring.js** - Calibration calculations
```javascript
- calculateCalibration(history)
- getCalibrationByConfidenceLevel(history)
- getRecentCalibration(history, windowSize)
- isAnswerCorrect(userLow, userHigh, correctAnswer)
```

**ui.js** - Rendering
```javascript
- renderQuestion(question)
- renderFeedback(answer, isCorrect, stats)
- renderStats(calibrationData)
- updateChart(history)
```

**chart.js** - Visualization
```javascript
- createTimeSeriesChart(history)
- updateChartData(newDataPoint)
```

This modular structure means:
- Each module has a single responsibility
- Clear interfaces make testing easier
- Can be easily wrapped in React components later
- No tight coupling to specific DOM elements

## Question Set for MVP

**Approach**: Manually curate 30-50 questions covering diverse domains

**Categories to include**:
- Geography (populations, distances, areas)
- History (dates, numbers from historical events)
- Science (measurements, constants, quantities)
- World records and statistics
- Astronomy and space
- Economics and demographics

**Selection criteria**:
- Answer must be a specific number
- Answer must be verifiable from reliable sources
- Questions should vary in difficulty
- Avoid questions that are too easy or too obscure

**Example questions**:
- "What is the height of Mount Everest in meters?"
- "In what year was the Battle of Hastings fought?"
- "What is the population of Tokyo?"
- "How many bones are in the adult human body?"
- "What is the speed of light in km/s?"

## Phase 2: Enhancements (Future)

### Backend & Persistence
- Set up simple backend (Node.js/Express or serverless functions)
- User authentication (email/password or OAuth)
- PostgreSQL or MongoDB for storing user history
- API endpoints for questions and score tracking

### AI-Generated Questions
- Integration with LLM API (OpenAI GPT-4, Anthropic Claude, or similar)
- Prompt engineering for diverse, interesting questions
- Answer verification strategy:
  - Model generates question + answer + source
  - Manual review queue for new questions
  - User reporting for incorrect answers
- Rate limiting and cost management

### Advanced Features
- Question categories and filtering
- Difficulty progression (adaptive game)
- Multiplayer mode or challenges
- Leaderboards
- Calibration curve visualization (Expected vs Actual confidence)
- Historical progress tracking over time
- Question packs or themed sets
- Social sharing of scores

## Phase 3: Multi-User Platform with AI Question Generation

### Architecture Overview

**Two-Database System**:
- **Questions Database**: Stores all questions (static + AI-generated)
- **Answers Database**: Stores user responses with metadata

### Question Database Schema

```javascript
{
  id: "uuid",
  question: "What is the population of Russia in millions?",
  answer: 144,
  unit: "million",
  category: "demographics",
  difficulty: "medium",  // estimated or calculated from response data

  // Metadata
  source: "UN 2023 estimates",  // or "AI-generated"
  createdAt: timestamp,
  lastVerified: timestamp,
  generationModel: "claude-3-opus-20240229",  // if AI-generated
  swVersion: "1.2.0",  // app version when created

  // Quality metrics (calculated from answers)
  timesShown: 145,
  avgCalibrationScore: 67.3,
  reportCount: 2,  // user reports of incorrect/confusing
  status: "active",  // active | trial | retired

  // For time-sensitive questions
  expiresAt: timestamp,  // optional, for "current president" type questions
  timeSensitive: boolean
}
```

### Answer Database Schema

```javascript
{
  id: "uuid",
  userId: "user-uuid",
  questionId: "question-uuid",

  // Response data
  userLow: 100,
  userHigh: 200,
  confidence: 80,
  correctAnswer: 144,
  isCorrect: true,

  // Calculated scores
  logScore: -3.2,
  calibrationScore: 68.5,

  // Metadata
  answeredAt: timestamp,
  responseTimeMs: 12500,  // time to answer
  swVersion: "1.2.0"
}
```

### Lazy Question Generation Strategy

**Core Principle**: Don't generate questions until needed.

**Algorithm**:
1. User requests a question
2. Query for unseen questions:
   ```sql
   SELECT * FROM questions
   WHERE id NOT IN (
     SELECT question_id FROM answers WHERE user_id = ?
   )
   AND status = 'active'
   ORDER BY RANDOM()
   LIMIT 1
   ```
3. If unseen questions exist (>= threshold, e.g., 10): serve random unseen question
4. If unseen questions low (< 10): **trigger background generation** of new batch
5. If no unseen questions: generate on-demand (rare for new users, common for power users)

**Proactive Generation for Power Users**:
- Monitor unseen question count per user
- When count drops to 3: spawn background task to generate batch of 20
- Generation happens async, doesn't block user experience
- Questions enter "trial" status first

### AI Question Generation

**Generation Flow**:
1. **Select example questions** (stratified sampling):
   - Random sample across categories (2 history, 2 science, 2 geography, etc.)
   - Include mix of difficulties
   - Prefer questions from last 500 generated (recency) but enforce diversity
   - Track category distribution to prevent drift

2. **Prompt structure**:
   ```
   Generate a numerical estimation question similar to these examples:
   [5-7 example questions with answers and sources]

   Requirements:
   - Must have a single numerical answer
   - Must be verifiable from reliable sources
   - Provide the source for verification
   - Vary difficulty and category from examples
   - Avoid duplicates or very similar questions

   Return: question text, numerical answer, unit, category, source
   ```

3. **Duplicate prevention**:
   - **Before generation**: Provide last 50 questions to AI in prompt
   - **After generation**:
     - Hash exact question text (catch perfect duplicates)
     - Semantic similarity check using embeddings (catch near-duplicates)
     - Threshold: cosine similarity < 0.85
   - **Human review queue**: Questions with similarity 0.75-0.85 flagged for review

4. **Quality assurance**:
   - New questions start in "trial" status
   - After 20 responses: calculate quality metrics
   - If avgCalibrationScore reasonable & reportCount < 2: promote to "active"
   - If metrics poor: retire or flag for human review

### Preventing Evolutionary Drift

**Problem**: If we always sample recent questions as examples, categories/styles may drift over time.

**Solutions**:
1. **Stratified sampling**: Always pull examples from each category
2. **Anchor questions**: Maintain set of 20 "canonical" questions that are always included in example pool
3. **Diversity metrics**: Track category/difficulty distribution over time
   - Alert if new questions skew heavily toward one category
   - Dashboard showing generation trends
4. **Periodic human review**: Random sample of AI-generated questions reviewed monthly

### Handling Stale Questions

**Time-sensitive questions** (populations, "current president", records):
- Flag with `timeSensitive: true` and `expiresAt: timestamp`
- Cron job checks expired questions monthly
- Expired questions moved to "needs_review" queue
- Human reviewer updates answer or retires question

**Quality-based retirement**:
- If `reportCount > 5` or `avgCalibrationScore < 30`: flag for review
- Questions with consistently poor metrics retired from active pool

### Cost Control & Rate Limiting

**AI Generation limits**:
- Max 100 questions generated per hour (global)
- Max 20 questions per user per day
- Cache generated questions aggressively
- Monitor costs with alerts

**Optimization**:
- Batch generation: Generate 20 at once (1 API call vs 20)
- Reuse across users: One power user's generation helps all users
- Fallback: If quota exceeded, serve questions other users haven't seen

### User Reporting & Feedback

**Report types**:
- "Answer is incorrect"
- "Question is confusing"
- "Duplicate question"

**Handling**:
- Increment `reportCount` on question
- After 3 reports: auto-flag for human review
- After 10 reports: auto-retire (extreme cases)
- Reviewers can edit answer, retire, or mark as "reviewed_ok"

### Question Quality Scoring

Track per-question metrics:
- **Completion rate**: % of users who answer (vs skip)
- **Avg calibration score**: Are users well-calibrated on this Q?
- **Avg confidence**: Do users feel certain or uncertain?
- **Report rate**: Reports per 100 views

Use metrics to:
- Identify and retire bad questions
- Tune difficulty estimates
- Improve AI generation prompts

### Migration Path from Phase 2

**Phase 2** → **Phase 3**:
1. Set up databases (Questions, Answers, Users)
2. Migrate existing static questions to Questions DB
3. Implement lazy loading (serve from DB instead of JSON file)
4. Add AI generation endpoint (manual trigger at first)
5. Implement proactive generation for power users
6. Add quality scoring and retirement logic
7. Build admin dashboard for question review

### Open Questions

1. **Which AI model?** Claude (more careful) vs GPT-4 (faster/cheaper)?
2. **Similarity threshold?** 0.85 too strict? Too lenient?
3. **Trial period?** 20 responses enough to judge quality?
4. **Human review cadence?** Weekly? Monthly? Trigger-based only?
5. **Question expiry?** Auto-expire time-sensitive Qs or manual review?

## Design Decisions Made ✓

### Core Mechanics
1. **Question count per session**: ✓ One question at a time, user decides when to stop
2. **Confidence level input**: ✓ Slider (free-form 0-100% or 50-99%)
3. **Feedback timing**: ✓ Immediate after each question
4. **Score tracking**: ✓ Continuous, with time-series visualization and recency weighting (optional)
5. **Tech stack**: ✓ Vanilla JS with modular structure for future framework migration

### Still To Decide
1. **Styling**: Minimal/clean, or more game-like with animations?
2. **Question ordering**: Random? Sequential? Category-based selection?
3. **Question reuse**: Track which questions user has seen, avoid immediate repeats?
4. **Confidence range**: Allow 0-100% or restrict to 50-99% (since <50% doesn't make sense for a range estimate)?
5. **Chart library**: Use a simple library (Chart.js, Recharts) or build custom SVG/Canvas visualization?

### For Phase 2
1. **Monetization**: Free? Freemium? Ads?
2. **AI question generation**: Which API to use? Cost per question?
3. **Moderation**: How to handle inappropriate or incorrect AI-generated questions?
4. **Multi-language support**: Worth considering from the start?

## Development Approach

### Step 1: Prototype (Week 1)
- Create basic HTML/CSS/JS structure
- Build question display and input form
- Implement basic game flow (1 question → answer → next)
- Hardcode 5 test questions

### Step 2: Core MVP (Week 2)
- Curate full question set (30-50 questions)
- Implement localStorage persistence
- Build calibration scoring algorithm
- Create end-of-game summary screen
- Add basic styling

### Step 3: Polish MVP (Week 3)
- Improve UI/UX
- Add instructions and help text
- Test across browsers
- Handle edge cases (invalid input, etc.)
- Deploy to GitHub Pages or similar

### Step 4: User Testing
- Share with friends/colleagues
- Gather feedback on:
  - Question quality and variety
  - UI/UX clarity
  - Scoring understandability
  - Game length and difficulty

### Step 5: Iterate
- Refine based on feedback
- Consider Phase 2 features based on user interest

## Success Metrics

**MVP Success**:
- Users can complete a full game session
- Calibration scoring is accurate and understandable
- Users find the questions interesting and varied
- Technical implementation is clean and maintainable

**Long-term Success**:
- Users return for multiple sessions
- Users improve their calibration over time
- Users share the game with others
- Positive feedback on educational value

## Technical Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Question quality varies | Manual curation for MVP, editorial review process |
| Answers may be disputed | Include sources in question data, allow user feedback |
| localStorage can be cleared | Accept for MVP, add accounts in Phase 2 |
| Browser compatibility | Test on major browsers, use standard APIs only |
| Users game the system | Not a concern for MVP (educational, not competitive) |

## Next Steps

1. Review and refine this plan
2. Make decisions on open questions (game length, confidence input, etc.)
3. Set up project structure (HTML/CSS/JS files)
4. Start with Step 1: Build basic prototype
5. Curate initial question set
