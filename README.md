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

## Tips for iPad

- Use landscape orientation for best experience
- Touch controls are optimized for iPad
- No physical keyboard required (though text entry needed when creating questions)

## Requirements

- Modern web browser
- No internet connection needed after files are saved
- JavaScript enabled
