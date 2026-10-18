# Family Feud Game

A fully functional, browser-based Family Feud-style game built with vanilla HTML, CSS, and JavaScript. Designed for family game nights, primarily on iPads in landscape orientation.

## Features

- **Two-Team Gameplay**: Team A vs Team B with customizable names
- **Question Set Management**: Create, edit, delete, and save question sets locally
- **Complete Game Flow**: Face-off → Play/Pass → Board Play → Strikes → Steal → Scoring → Next Round → Final Results
- **Host-Controlled**: All answers, strikes, steals, and scoring are manually controlled by the host
- **Local Persistence**: Uses localStorage to save question sets and current game state
- **Undo Functionality**: Reverses most recent actions
- **Responsive Design**: Works on iPad landscape (primary) and other screen sizes
- **No Dependencies**: Pure vanilla HTML, CSS, and JavaScript - works offline

## Getting Started

1. Download all files to a folder on your device
2. Open `index.html` in a web browser (Chrome, Safari, Firefox, etc.)
3. No server required - works locally

## Game Flow

1. **Main Menu**: Create/select question sets, start/resume games
2. **Team Setup**: Customize team names
3. **Ready**: Start face-off for the current question
4. **Face-Off**: Host reveals answers and selects face-off winner
5. **Play/Pass**: Winning team chooses to play or pass
6. **Board Play**: Playing team tries to reveal answers; host adds strikes on incorrect answers
7. **Steal**: After 3 strikes, opposing team gets 1 steal attempt
8. **Round Complete**: When all answers revealed or steal resolved
9. **Award Points**: Host confirms point award to round-winning team
10. **Next Round**: Continue to next question or end game
11. **Final Results**: Display winner, optional tiebreaker

## Data Storage

- **Question Sets**: Stored in `localStorage` under key `ff_questionSets`
- **Game State**: Stored in `localStorage` under key `ff_savedGame`
- **Clearing browser data will erase saved content**

### Saved Game Shape

The current game is persisted as a single object that separates data which is
constant for the whole game from the per-action history:

```js
{
  fixedGameState: {
    activeQuestionSetId,        // which saved question set is being played
    teamAName,                  // team names never change mid-game
    teamBName
  },
  history: [                    // ordered snapshots; last element == current state
    // each entry: currentRoundIndex, currentQuestion, team scores,
    // revealedAnswerIndices (array on disk, Set in memory), roundPoints,
    // strikes, currentTeam, faceoffWinner, playOrPassDecision, phase,
    // stealAttemptStatus, roundComplete, roundAwarded, gameOver,
    // isTiebreaker, usedTiebreakerQuestions
  ]
}
```

- `history[0]` is the earliest recorded state and `history[history.length - 1]`
  is the current state.
- Undo simply drops the last entry and loads the new last entry into the live
  `GameState`, then re-persists.
- Large/static fields (the whole question set) are **not** duplicated into every
  snapshot; only the question set id lives in `fixedGameState`.
- Duplicate consecutive snapshots are collapsed, so redraws never create extra
  undo steps.

### Code Structure

- `index.html` – screens and markup.
- `style.css` – visual design and responsive rules.
- `app.js` – split into:
  - State (`createEmptyGameState`, `GameState`, `GameFixedState`, `GameStateHistory`)
  - Persistence (`loadQuestionSets`, `saveQuestionSets`, `loadSavedGame`, `persistHistory`, `commitGameState`)
  - Undo (`undoLastAction`)
  - Parsing (`parseQuestionSetFromText`)
  - Rendering (`updateUI` and friends)
  - Phase transitions and actions (`startFaceoff`, `selectFaceoffWinner`, `playOrPass`, `revealAnswer`, `addStrike`, `resolveSteal`, `awardPoints`, `nextRound`, `endGame`)

## Game Phases

`READY → FACEOFF → PLAY_OR_PASS → BOARD_PLAY → (STEAL) → ROUND_COMPLETE → AWARDED → (next round)`.
Only controls valid for the current phase are rendered, and each action commits a
new state snapshot for undo.

## Tips for iPad

- Use landscape orientation for best experience
- Touch controls are optimized for iPad
- No physical keyboard required (though text entry needed when creating questions)

## Requirements

- Modern web browser
- No internet connection needed after files are saved
- JavaScript enabled
