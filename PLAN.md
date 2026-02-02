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
- HTML/CSS/JavaScript
- Option A: Vanilla JS (simplest, fastest to build)
- Option B: Lightweight framework (React/Vue if we want component structure)

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
For each confidence level (e.g., 80%), calculate:
- Expected accuracy: 80%
- Actual accuracy: (correct answers / total answers at this confidence level) × 100%
- Calibration error: |Expected - Actual|

**Overall Score**:
- Average calibration error across all confidence levels used
- Lower is better (perfect calibration = 0)

**Display**:
- Per-confidence-level breakdown
- Overall calibration score
- Simple indicator: "Overconfident" vs "Well-calibrated" vs "Underconfident"

### UI/UX Design Decisions

**Question Input**:
- Text inputs for low/high bounds (most flexible)
- Consider adding number validation and range helpers
- Dropdown or buttons for confidence (e.g., 50%, 70%, 80%, 90%, 95%, 99%)

**Game Flow**:
1. Welcome screen with instructions
2. Question display (1 at a time)
3. User input form
4. Immediate feedback (correct answer + whether user was right)
5. Continue to next question
6. After N questions (10-20?), show summary statistics

**Feedback Loop**:
- Show correct answer immediately after each question
- Highlight if user's range contained the answer
- At end of session, show calibration table and overall score

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

## Open Questions & Decisions Needed

### For MVP
1. **Question count per session**: 10? 20? User choice?
2. **Confidence level input**: Discrete options (50%, 70%, 80%, 90%, 95%) or free-form 0-100%?
3. **Styling**: Minimal/clean, or more game-like with animations?
4. **Question ordering**: Random? Sequential? By difficulty?
5. **Replay behavior**: Can users retry the same questions? New session each time?

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
