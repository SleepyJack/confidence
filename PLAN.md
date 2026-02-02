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
