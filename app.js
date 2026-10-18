/**
 * Family Feud Game - Vanilla JavaScript Implementation
 * A fully functional browser-based Family Feud-style game
 * State-driven with explicit phases, localStorage persistence, and undo functionality
 */

// Game State Structure
function createEmptyGameState() {
    return {
        currentRoundIndex: -1,
        currentQuestion: null,

        // Cumulative scores (change over the course of a game)
        teamAScore: 0,
        teamBScore: 0,

        // Round state
        revealedAnswerIndices: new Set(),
        roundPoints: 0,
        strikes: 0,
        currentTeam: null, // 'A' or 'B'
        faceoffWinner: null, // 'A' or 'B'
        playOrPassDecision: null, // 'PLAY' or 'PASS'

        // Game phases
        phase: 'MENU', // MENU, READY, FACEOFF, PLAY_OR_PASS, BOARD_PLAY, STEAL, ROUND_COMPLETE, AWARDED, GAME_OVER
        stealAttemptStatus: null, // 'PENDING', 'SUCCESS', 'FAILED', 'NONE'
        roundComplete: false,
        roundAwarded: false,
        gameOver: false,

        // Tiebreaker state (can change during a game, so it is part of history)
        isTiebreaker: false,
        usedTiebreakerQuestions: []
    };
}

function createEmptyFixedState() {
    return {
        // Constant for the whole game
        activeQuestionSetId: null,
        activeQuestionSet: null, // derived from id at runtime, not persisted
        teamAName: 'Team A',
        teamBName: 'Team B'
    };
}

const GameState = createEmptyGameState();
let GameFixedState = createEmptyFixedState();
let GameStateHistory = []; // Array of GameState snapshots, 0 = earliest, last = latest

// UI State
let currentScreen = 'screen-menu';
let editingQuestionSetId = null;
let editingQuestionId = null;

// Constants
const PHASES = {
    MENU: 'MENU',
    READY: 'READY',
    FACEOFF: 'FACEOFF',
    PLAY_OR_PASS: 'PLAY_OR_PASS',
    BOARD_PLAY: 'BOARD_PLAY',
    STEAL: 'STEAL',
    ROUND_COMPLETE: 'ROUND_COMPLETE',
    AWARDED: 'AWARDED',
    GAME_OVER: 'GAME_OVER'
};

// LocalStorage Keys
const LS_QUESTION_SETS = 'ff_questionSets';
const LS_SAVED_GAME = 'ff_savedGame';


// Question Set Storage
let questionSets = loadQuestionSets();
let savedGame = loadSavedGame();


// Utility Functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Set) return new Set(Array.from(obj));
    if (obj instanceof Array) return obj.map(item => deepClone(item));
    const cloned = {};
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            cloned[key] = deepClone(obj[key]);
        }
    }
    return cloned;
}

// LocalStorage Functions
function loadQuestionSets() {
    try {
        const data = localStorage.getItem(LS_QUESTION_SETS);
        if (data) {
            return JSON.parse(data);
        }
    } catch (e) {
        console.warn('Failed to load question sets:', e);
    }
    return [];
}

function saveQuestionSets() {
    try {
        localStorage.setItem(LS_QUESTION_SETS, JSON.stringify(questionSets));
    } catch (e) {
        console.warn('Failed to save question sets:', e);
    }
}

function restoreState(h) {
    const s = { ...h };
    if (h && h.revealedAnswerIndices && Array.isArray(h.revealedAnswerIndices)) {
        s.revealedAnswerIndices = new Set(h.revealedAnswerIndices);
    } else {
        s.revealedAnswerIndices = new Set();
    }
    return s;
}

function loadSavedGame() {
    try {
        const data = localStorage.getItem(LS_SAVED_GAME);
        if (!data) return null;
        const saved = JSON.parse(data);
        if (!saved) return null;

        if (Array.isArray(saved)) {
            // Legacy format (array of states) - migrate
            if (saved.length === 0) return null;
            const restored = saved.map(restoreState);
            const last = restored[restored.length - 1];
            const fixed = {
                activeQuestionSetId: last.activeQuestionSetId || null,
                activeQuestionSet: questionSets.find(s => s.id === last.activeQuestionSetId) || null,
                teamAName: last.teamAName || 'Team A',
                teamBName: last.teamBName || 'Team B'
            };
            return { fixedGameState: fixed, history: restored };
        }

        if (Array.isArray(saved.history)) {
            const fixedRaw = saved.fixedGameState || {};
            const fixed = {
                activeQuestionSetId: fixedRaw.activeQuestionSetId || null,
                activeQuestionSet: questionSets.find(s => s.id === fixedRaw.activeQuestionSetId) || null,
                teamAName: fixedRaw.teamAName || 'Team A',
                teamBName: fixedRaw.teamBName || 'Team B'
            };
            return { fixedGameState: fixed, history: saved.history.map(restoreState) };
        }
    } catch (e) {
        console.warn('Failed to load saved game:', e);
    }
    return null;
}

function persistHistory() {
    try {
        const historyToSave = GameStateHistory.map(h => {
            const clone = deepClone(h);
            clone.revealedAnswerIndices = Array.from(clone.revealedAnswerIndices).sort((a, b) => a - b);
            return clone;
        });
        const fixedToSave = {
            activeQuestionSetId: GameFixedState.activeQuestionSetId,
            teamAName: GameFixedState.teamAName,
            teamBName: GameFixedState.teamBName
        };
        localStorage.setItem(LS_SAVED_GAME, JSON.stringify({
            fixedGameState: fixedToSave,
            history: historyToSave
        }));
    } catch (e) {
        console.warn('Failed to save game state:', e);
    }
}

// A stable string key for comparing two states (Sets become sorted arrays)
function stateKey(state) {
    return JSON.stringify({
        currentRoundIndex: state.currentRoundIndex,
        currentQuestion: state.currentQuestion,
        teamAScore: state.teamAScore,
        teamBScore: state.teamBScore,
        revealedAnswerIndices: Array.from(state.revealedAnswerIndices || []).sort((a, b) => a - b),
        roundPoints: state.roundPoints,
        strikes: state.strikes,
        currentTeam: state.currentTeam,
        faceoffWinner: state.faceoffWinner,
        playOrPassDecision: state.playOrPassDecision,
        phase: state.phase,
        stealAttemptStatus: state.stealAttemptStatus,
        roundComplete: state.roundComplete,
        roundAwarded: state.roundAwarded,
        gameOver: state.gameOver,
        isTiebreaker: state.isTiebreaker,
        usedTiebreakerQuestions: state.usedTiebreakerQuestions || []
    });
}

/**
 * Commit the current GameState as the latest entry in GameStateHistory, then
 * persist. Duplicate consecutive states are collapsed so that mere redraws do
 * not create spurious undo checkpoints.
 */
function commitGameState() {
    const snapshot = deepClone(GameState);
    const last = GameStateHistory[GameStateHistory.length - 1];
    if (last && stateKey(last) === stateKey(snapshot)) {
        persistHistory();
        return;
    }
    GameStateHistory.push(snapshot);
    if (GameStateHistory.length > 200) {
        GameStateHistory.shift();
    }
    persistHistory();
}

// Alias used throughout the action handlers: committing records undo history.
function saveGameState() {
    commitGameState();
}

function createUndoCheckpoint() {
    // Actions commit their resulting state via saveGameState(), which creates
    // the undo history entries. Intentionally a no-op.
}

function clearSavedGame() {
    try {
        localStorage.removeItem(LS_SAVED_GAME);
    } catch (e) {
        console.warn('Failed to clear saved game:', e);
    }
}

// Undo Functionality
function undoLastAction() {
    if (GameStateHistory.length <= 1) {
        updateUndoButton();
        return false;
    }
    // Drop the latest state and restore the one before it
    GameStateHistory.pop();
    const previous = GameStateHistory[GameStateHistory.length - 1];
    const restored = deepClone(previous);
    // Replace all live GameState fields with the restored snapshot
    Object.keys(GameState).forEach(k => { delete GameState[k]; });
    Object.assign(GameState, restored);
    GameState.revealedAnswerIndices = new Set(previous.revealedAnswerIndices);
    persistHistory();
    updateUI();
    return true;
}

// Screen Navigation
function showScreen(screenId) {
    const screens = document.querySelectorAll('.screen');
    screens.forEach(s => s.classList.remove('active'));
    const screen = document.getElementById(screenId);
    if (screen) {
        screen.classList.add('active');
    }
    currentScreen = screenId;
}

// Validation Functions
function validateQuestion(question) {
    if (!question.prompt || question.prompt.trim() === '') {
        return 'Question prompt cannot be empty';
    }
    if (!question.answers || question.answers.length === 0) {
        return 'Question must have at least one answer';
    }
    for (let i = 0; i < question.answers.length; i++) {
        const ans = question.answers[i];
        if (!ans.text || ans.text.trim() === '') {
            return `Answer ${i + 1} must have text`;
        }
        if (ans.points === undefined || ans.points === null || isNaN(ans.points)) {
            return `Answer ${i + 1} must have a valid point value`;
        }
        const pts = parseInt(ans.points);
        if (pts <= 0 || pts !== Number(ans.points) || !Number.isInteger(pts)) {
            return `Answer ${i + 1} must have a positive whole number point value`;
        }
    }
    return null;
}

function validateQuestionSet(set) {
    if (!set.name || set.name.trim() === '') {
        return 'Question set name cannot be empty';
    }
    if (!set.questions || set.questions.length === 0) {
        return 'Question set must have at least one question';
    }
    for (let i = 0; i < set.questions.length; i++) {
        const err = validateQuestion(set.questions[i]);
        if (err) {
            return `Question ${i + 1}: ${err}`;
        }
    }
    return null;
}

// Continue writing... Let me add more core functions in chunks
// But the content might be long; let me proceed systematically

function resetGameForNewRound() {
    GameState.revealedAnswerIndices = new Set();
    GameState.roundPoints = 0;
    GameState.strikes = 0;
    GameState.currentTeam = null;
    GameState.faceoffWinner = null;
    GameState.playOrPassDecision = null;
    GameState.stealAttemptStatus = 'NONE';
    GameState.roundComplete = false;
    GameState.roundAwarded = false;
    // Keep cumulative scores
}

// UI Update Functions - I'll write them next
// For now, let me complete the basic structure
function renderMenu() {
    const resumeBtn = document.getElementById('btn-resume-game');
    if (resumeBtn) {
        let canResume = GameStateHistory.length > 0;
        if (!canResume) {
            try {
                canResume = localStorage.getItem(LS_SAVED_GAME) !== null;
            } catch (e) {
                canResume = false;
            }
        }
        resumeBtn.disabled = !canResume;
    }
}

function updateMenuButtons() {
    renderMenu();
}

function hasGameInProgress() {
    // Check in-memory game first
    if (GameStateHistory.length > 0 && !GameState.gameOver) return true;
    // Check saved game
    if (savedGame && savedGame.history && savedGame.history.length > 0) {
        const last = savedGame.history[savedGame.history.length - 1];
        if (last && !last.gameOver) return true;
    }
    return false;
}

function renderQuestionSets() {
    const listEl = document.getElementById('qs-list-container');
    const titleEl = document.getElementById('question-sets-title');
    if (!listEl) return;
    
    if (questionSets.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--text-dark);">No saved question sets</p>';
        if (titleEl) titleEl.textContent = 'Question Sets';
        return;
    }
    
    let html = '';
    questionSets.forEach(set => {
        html += `
            <div class="qs-item">
                <div class="qs-info">
                    <div class="qs-name">${escapeHtml(set.name)}</div>
                    <div class="qs-meta">${set.questions ? set.questions.length : 0} question(s)</div>
                </div>
                <div class="qs-actions">
                    <button class="qs-btn select" data-id="${set.id}" data-action="select">Select</button>
                    <button class="qs-btn edit" data-id="${set.id}" data-action="edit">Edit</button>
                    <button class="qs-btn delete" data-id="${set.id}" data-action="delete">Delete</button>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
    
    // Add event listeners
    listEl.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            const action = btn.getAttribute('data-action');
            handleQuestionSetAction(id, action);
        });
    });
}

function handleQuestionSetAction(id, action) {
    if (action === 'select') {
        // Check if game in progress
        if (hasGameInProgress()) {
            if (!confirm('Starting a new game will clear the current game progress. Continue?')) {
                return;
            }
        }
        GameFixedState.activeQuestionSetId = id;
        GameFixedState.activeQuestionSet = questionSets.find(s => s.id === id);
        GameStateHistory = [];
        showScreen('screen-team-setup');
        populateTeamSetup();
    } else if (action === 'edit') {
        editingQuestionSetId = id;
        const set = questionSets.find(s => s.id === id);
        if (set) {
            openEditorForSet(set);
        }
    } else if (action === 'delete') {
        if (confirm('Are you sure you want to delete this question set?')) {
            questionSets = questionSets.filter(s => s.id !== id);
            saveQuestionSets();
            renderQuestionSets();
        }
    }
}

function populateTeamSetup() {
    document.getElementById('team-a-name').value = GameFixedState.teamAName;
    document.getElementById('team-b-name').value = GameFixedState.teamBName;
}

function openEditorForSet(set) {
    document.getElementById('set-name').value = set.name;
    renderQuestionsList(set.questions);
    showScreen('screen-editor');
    hideValidation('editor-validation');
}

function renderQuestionsList(questions) {
    const listEl = document.getElementById('questions-list');
    if (!listEl) return;
    
    if (!questions || questions.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--text-dark);">No questions</p>';
        return;
    }
    
    let html = '';
    questions.forEach((q, idx) => {
        html += `
            <div class="question-item">
                <div class="question-text">${escapeHtml(q.prompt).substring(0, 60)}${q.prompt.length > 60 ? '...' : ''} (${q.answers ? q.answers.length : 0} answers)</div>
                <div class="question-actions">
                    <button class="qs-btn edit" data-idx="${idx}" data-action="edit-q">Edit</button>
                    <button class="qs-btn delete" data-idx="${idx}" data-action="delete-q">Delete</button>
                    <button class="qs-btn select" data-idx="${idx}" data-action="up" ${idx === 0 ? 'disabled' : ''}>↑</button>
                    <button class="qs-btn select" data-idx="${idx}" data-action="down" ${idx === questions.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
            </div>
        `;
    });
    listEl.innerHTML = html;
    
    listEl.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-idx'));
            const action = btn.getAttribute('data-action');
            handleQuestionAction(questions, idx, action);
        });
    });
}

function handleQuestionAction(questions, idx, action) {
    if (action === 'edit-q') {
        editingQuestionId = idx;
        openQuestionModal(questions[idx], idx);
    } else if (action === 'delete-q') {
        questions.splice(idx, 1);
        const set = questionSets.find(s => s.id === editingQuestionSetId);
        if (set) {
            set.questions = questions;
        }
        renderQuestionsList(questions);
    } else if (action === 'up') {
        if (idx > 0) {
            const temp = questions[idx - 1];
            questions[idx - 1] = questions[idx];
            questions[idx] = temp;
            renderQuestionsList(questions);
        }
    } else if (action === 'down') {
        if (idx < questions.length - 1) {
            const temp = questions[idx + 1];
            questions[idx + 1] = questions[idx];
            questions[idx] = temp;
            renderQuestionsList(questions);
        }
    }
}

function openQuestionModal(question, idx) {
    const modal = document.getElementById('modal-question');
    document.getElementById('modal-question-title').textContent = idx !== undefined ? 'Edit Question' : 'Add Question';
    document.getElementById('question-prompt').value = question ? question.prompt : '';
    const answers = question ? question.answers : [];
    modalAnswers = answers.slice();
    const listEl = document.getElementById('modal-answers-list');
    if (listEl) listEl._answers = modalAnswers;
    renderModalAnswers(modalAnswers);
    modal.style.display = 'flex';
    hideValidation('modal-question-validation');
}

function renderModalAnswers(answers) {
    const listEl = document.getElementById('modal-answers-list');
    if (!listEl) return;
    
    if (!answers || answers.length === 0) {
        listEl.innerHTML = '<p style="text-align:center;color:var(--text-dark);">No answers</p>';
        return;
    }
    
    let html = '';
    answers.forEach((ans, idx) => {
        html += `
            <div class="modal-answer-item">
                <input type="text" class="modal-input" data-idx="${idx}" data-field="text" value="${escapeHtml(ans.text)}" placeholder="Answer text">
                <input type="number" class="modal-input" data-idx="${idx}" data-field="points" value="${ans.points}" placeholder="Points" min="1" step="1">
                <button class="qs-btn delete" data-idx="${idx}" data-action="del-ans">Delete</button>
                <button class="qs-btn select" data-idx="${idx}" data-action="up-ans" ${idx === 0 ? 'disabled' : ''}>↑</button>
                <button class="qs-btn select" data-idx="${idx}" data-action="down-ans" ${idx === answers.length - 1 ? 'disabled' : ''}>↓</button>
            </div>
        `;
    });
    listEl.innerHTML = html;
    
    listEl.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            const idx = parseInt(input.getAttribute('data-idx'));
            const field = input.getAttribute('data-field');
            if (answers[idx]) {
                answers[idx][field] = field === 'points' ? parseInt(input.value) : input.value;
            }
        });
    });
    
    listEl.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-idx'));
            const action = btn.getAttribute('data-action');
            if (action === 'del-ans') {
                answers.splice(idx, 1);
                renderModalAnswers(answers);
            } else if (action === 'up-ans') {
                if (idx > 0) {
                    const temp = answers[idx - 1];
                    answers[idx - 1] = answers[idx];
                    answers[idx] = temp;
                    renderModalAnswers(answers);
                }
            } else if (action === 'down-ans') {
                if (idx < answers.length - 1) {
                    const temp = answers[idx + 1];
                    answers[idx + 1] = answers[idx];
                    answers[idx] = temp;
                    renderModalAnswers(answers);
                }
            }
        });
    });
}

function parseQuestionSetFromText(text, filename) {
    const lines = text.split(/\r?\n/);
    const questions = [];
    let currentQuestion = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed === '') continue;
        
        // Check if it's a question line (starts with number followed by dot)
        const questionMatch = trimmed.match(/^(\d+)\.\s*(.+)$/);
        if (questionMatch) {
            // Save previous question if exists
            if (currentQuestion && currentQuestion.answers && currentQuestion.answers.length > 0) {
                questions.push(currentQuestion);
            }
            currentQuestion = {
                prompt: questionMatch[2].trim(),
                answers: []
            };
            continue;
        }
        
        // Check if it's an answer line (starts with dash, bullet, or number)
        const answerMatch = trimmed.match(/^[-*]\s*(\d+)\s*:\s*(.+)$/) || trimmed.match(/^(\d+)\)\s*(\d+)\s*:\s*(.+)$/) || trimmed.match(/^(\d+)\.\s*(.+)$/);
        // More specific: dash followed by score: answer
        const dashAnswerMatch = trimmed.match(/^[-*]\s*(\d+)\s*:\s*(.+)$/);
        if (dashAnswerMatch && currentQuestion) {
            const score = parseInt(dashAnswerMatch[1]);
            const answerText = dashAnswerMatch[2].trim();
            if (!isNaN(score) && score > 0 && answerText) {
                currentQuestion.answers.push({
                    text: answerText,
                    points: score
                });
            }
            continue;
        }
        
        // Try alternative format: "- 50: Answer" or "- Answer: 50"? But spec says "<score>: <answer>"
        // Also try "50: Answer" without dash
        // Skip if starts with number but followed by dot (question) - already handled
        if (/^\d+\./.test(trimmed)) continue;
        
        const colonMatch = trimmed.match(/^(\d+)\s*:\s*(.+)$/);
        if (colonMatch && currentQuestion) {
            const score = parseInt(colonMatch[1]);
            const answerText = colonMatch[2].trim();
            if (!isNaN(score) && score > 0 && answerText) {
                currentQuestion.answers.push({
                    text: answerText,
                    points: score
                });
            }
            continue;
        }
    }
    
    // Save last question
    if (currentQuestion && currentQuestion.answers && currentQuestion.answers.length > 0) {
        questions.push(currentQuestion);
    }
    
    if (questions.length === 0) {
        alert('No valid questions found in file. Please use format:\n1. Question\n- 50: Answer\n- 30: Answer');
        return null;
    }
    
    const setName = filename.replace(/\.[^/.]+$/, '') || 'Uploaded Set';
    return {
        id: generateId(),
        name: setName,
        questions: questions
    };
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showValidation(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.add('show');
    }
}

function hideValidation(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = '';
        el.classList.remove('show');
    }
}

// Event Listeners Setup
function setupEventListeners() {
    // Menu
    document.getElementById('btn-new-question-set').addEventListener('click', () => {
        editingQuestionSetId = null;
        document.getElementById('set-name').value = '';
        renderQuestionsList([]);
        showScreen('screen-editor');
        hideValidation('editor-validation');
    });
    
    document.getElementById('btn-select-question-set').addEventListener('click', () => {
        renderQuestionSets();
        showScreen('screen-question-sets');
    });
    
    document.getElementById('btn-start-game').addEventListener('click', () => {
        if (questionSets.length === 0) {
            alert('Please create or select a question set first');
            return;
        }
        renderQuestionSets();
        showScreen('screen-question-sets');
    });
    
    document.getElementById('btn-resume-game').addEventListener('click', () => {
        if (savedGame) {
            resumeGame();
        }
    });
    
    document.getElementById('btn-paste-question-set').addEventListener('click', () => {
        document.getElementById('paste-name').value = '';
        document.getElementById('paste-text').value = '';
        document.getElementById('modal-paste').style.display = 'flex';
        hideValidation('paste-validation');
    });
    
    document.getElementById('btn-save-paste').addEventListener('click', () => {
        const name = document.getElementById('paste-name').value.trim();
        const text = document.getElementById('paste-text').value;
        if (!name) {
            showValidation('paste-validation', 'Please enter a question set name');
            return;
        }
        const set = parseQuestionSetFromText(text, name);
        if (set) {
            set.name = name;
            questionSets.push(set);
            saveQuestionSets();
            alert('Question set saved!');
            document.getElementById('modal-paste').style.display = 'none';
            hideValidation('paste-validation');
            updateMenuButtons();
            renderQuestionSets();
        }
    });
    
    document.getElementById('btn-cancel-paste').addEventListener('click', () => {
        document.getElementById('modal-paste').style.display = 'none';
        hideValidation('paste-validation');
    });
    
    document.getElementById('btn-manage-question-sets').addEventListener('click', () => {
        renderQuestionSets();
        document.getElementById('question-sets-title').textContent = 'Manage Question Sets';
        showScreen('screen-question-sets');
    });
    
    // Question Sets
    document.getElementById('btn-back-from-qs').addEventListener('click', () => {
        showScreen('screen-menu');
        updateMenuButtons();
    });
    
    // Editor
    document.getElementById('btn-back-from-editor').addEventListener('click', () => {
        showScreen('screen-menu');
    });
    
    document.getElementById('btn-add-question').addEventListener('click', () => {
        editingQuestionId = null;
        openQuestionModal(null);
    });
    
    document.getElementById('btn-save-question-set').addEventListener('click', () => {
        const setName = document.getElementById('set-name').value.trim();
        if (!setName) {
            showValidation('editor-validation', 'Question set name cannot be empty');
            return;
        }
        
        // Find or create question set
        let set = null;
        if (editingQuestionSetId) {
            set = questionSets.find(s => s.id === editingQuestionSetId);
        } else {
            set = { id: generateId(), name: '', questions: [] };
            questionSets.push(set);
            editingQuestionSetId = set.id;
        }
        set.name = setName;
        
        const err = validateQuestionSet(set);
        if (err) {
            showValidation('editor-validation', err);
            return;
        }
        
        saveQuestionSets();
        hideValidation('editor-validation');
        alert('Question set saved!');
        showScreen('screen-menu');
        updateMenuButtons();
    });
    
    document.getElementById('btn-cancel-editor').addEventListener('click', () => {
        showScreen('screen-menu');
    });
    
    // Team Setup
    document.getElementById('btn-back-from-team-setup').addEventListener('click', () => {
        showScreen('screen-question-sets');
    });
    
    document.getElementById('btn-start-game-confirmed').addEventListener('click', () => {
        GameFixedState.teamAName = document.getElementById('team-a-name').value.trim() || 'Team A';
        GameFixedState.teamBName = document.getElementById('team-b-name').value.trim() || 'Team B';
        startNewGame();
    });
    
    // Modal
    document.getElementById('btn-add-modal-answer').addEventListener('click', () => {
        const listEl = document.getElementById('modal-answers-list');
        if (!listEl._answers) listEl._answers = [];
        listEl._answers.push({ text: '', points: 1 });
        modalAnswers = listEl._answers;
        renderModalAnswers(listEl._answers);
    });
    
    document.getElementById('btn-save-modal-question').addEventListener('click', () => {
        const prompt = document.getElementById('question-prompt').value.trim();
        const listEl = document.getElementById('modal-answers-list');
        const answers = listEl._answers || [];
        
        const question = { prompt, answers };
        const err = validateQuestion(question);
        if (err) {
            showValidation('modal-question-validation', err);
            return;
        }
        
        // Save to current question set
        const set = questionSets.find(s => s.id === editingQuestionSetId);
        if (set) {
            if (editingQuestionId !== null && editingQuestionId !== undefined) {
                set.questions[editingQuestionId] = question;
            } else {
                if (!set.questions) set.questions = [];
                set.questions.push(question);
            }
            renderQuestionsList(set.questions);
        }
        
        document.getElementById('modal-question').style.display = 'none';
        hideValidation('modal-question-validation');
    });
    
    document.getElementById('btn-cancel-modal-question').addEventListener('click', () => {
        document.getElementById('modal-question').style.display = 'none';
        hideValidation('modal-question-validation');
    });
}

// Initialize
function initializeApp() {
    setupEventListeners();
    updateMenuButtons();
    showScreen('screen-menu');
}

// Game Flow Functions
function startNewGame() {
    // Reset game state
    GameState.currentRoundIndex = 0;
    GameState.teamAScore = 0;
    GameState.teamBScore = 0;
    GameFixedState.teamAName = GameFixedState.teamAName || 'Team A';
    GameFixedState.teamBName = GameFixedState.teamBName || 'Team B';
    GameState.gameOver = false;
    GameState.isTiebreaker = false;
    GameState.usedTiebreakerQuestions = [];
    GameStateHistory = [];
    
    resetGameForNewRound();
    loadCurrentRound();
    createUndoCheckpoint(); // Save initial state
    
    showScreen('screen-gameplay');
    updateUI();
    saveGameState();
}

function resumeGame() {
    const stored = loadSavedGame();
    if (!stored || !stored.history || stored.history.length === 0) return;
    savedGame = stored;
    
    GameStateHistory = stored.history.map(restoreState);
    
    // Fixed state (static for the whole game) is restored once
    GameFixedState = {
        activeQuestionSetId: stored.fixedGameState.activeQuestionSetId,
        activeQuestionSet: stored.fixedGameState.activeQuestionSet,
        teamAName: stored.fixedGameState.teamAName || 'Team A',
        teamBName: stored.fixedGameState.teamBName || 'Team B'
    };
    
    // Load the latest state into GameState
    const current = GameStateHistory[GameStateHistory.length - 1];
    Object.keys(GameState).forEach(k => { delete GameState[k]; });
    Object.assign(GameState, deepClone(current));
    GameState.revealedAnswerIndices = new Set(current.revealedAnswerIndices);
    
    if (GameState.gameOver) {
        showScreen('screen-results');
        updateResults();
    } else {
        showScreen('screen-gameplay');
        updateUI();
    }
}

function loadCurrentRound() {
    const set = GameFixedState.activeQuestionSet;
    if (!set || !set.questions) return;
    
    if (GameState.isTiebreaker) {
        // Find unused question
        let question = null;
        for (let i = set.questions.length - 1; i >= 0; i--) {
            if (!GameState.usedTiebreakerQuestions.includes(i)) {
                question = set.questions[i];
                GameState.currentQuestion = question;
                GameState.usedTiebreakerQuestions.push(i);
                break;
            }
        }
        if (!question && set.questions.length > 0) {
            question = set.questions[Math.floor(Math.random() * set.questions.length)];
            GameState.currentQuestion = question;
        }
    } else {
        if (GameState.currentRoundIndex < 0 || GameState.currentRoundIndex >= set.questions.length) {
            return;
        }
        GameState.currentQuestion = set.questions[GameState.currentRoundIndex];
    }
    
    resetGameForNewRound();
    GameState.phase = PHASES.READY;
}

function nextRound() {
    if (GameState.isTiebreaker) {
        // End tiebreaker
        endGame();
        return;
    }
    
    const set = GameFixedState.activeQuestionSet;
    if (!set || !set.questions) return;
    
    GameState.currentRoundIndex++;
    if (GameState.currentRoundIndex >= set.questions.length) {
        // No more questions
        alert('All questions have been used');
        return;
    }
    
    loadCurrentRound();
    saveGameState();
    updateUI();
}

function endGame() {
    GameState.gameOver = true;
    GameState.phase = PHASES.GAME_OVER;
    saveGameState();
    showScreen('screen-results');
    updateResults();
}

// UI Update Functions
function updateUI() {
    updateHeader();
    updateScoreboard();
    updateBoard();
    updateGameInfo();
    updateControls();
    updateUndoButton();
}

function updateHeader() {
    document.getElementById('round-number').textContent = GameState.isTiebreaker ? 'TB' : (GameState.currentRoundIndex + 1);
    document.getElementById('current-question').textContent = GameState.currentQuestion ? GameState.currentQuestion.prompt : 'No question';
}

function updateScoreboard() {
    document.getElementById('display-team-a').textContent = GameFixedState.teamAName;
    document.getElementById('display-team-b').textContent = GameFixedState.teamBName;
    document.getElementById('team-a-points').textContent = GameState.teamAScore;
    document.getElementById('team-b-points').textContent = GameState.teamBScore;
    
    // Highlight playing team
    const taEl = document.getElementById('score-team-a');
    const tbEl = document.getElementById('score-team-b');
    taEl.classList.toggle('playing', GameState.currentTeam === 'A');
    tbEl.classList.toggle('playing', GameState.currentTeam === 'B');
}

function updateBoard() {
    const container = document.getElementById('answers-container');
    if (!GameState.currentQuestion || !GameState.currentQuestion.answers) {
        container.innerHTML = '<p style="color:var(--text-dark);">No answers</p>';
        return;
    }
    
    let html = '';
    GameState.currentQuestion.answers.forEach((ans, idx) => {
        const isRevealed = GameState.revealedAnswerIndices.has(idx);
        html += `
            <div class="answer-slot ${isRevealed ? 'revealed' : ''}" data-idx="${idx}">
                <span class="answer-number">${idx + 1}</span>
                ${isRevealed ? `<span class="answer-text">${escapeHtml(ans.text)}</span><span class="answer-points">${ans.points}</span>` : '<span class="answer-text"></span><span class="answer-points"></span>'}
            </div>
        `;
    });
    container.innerHTML = html;
    
    // Add event listeners to answer slots (only in faceoff or board play)
    if (GameState.phase === PHASES.FACEOFF || GameState.phase === PHASES.BOARD_PLAY) {
        container.querySelectorAll('.answer-slot').forEach(slot => {
            slot.addEventListener('click', () => {
                const idx = parseInt(slot.getAttribute('data-idx'));
                revealAnswer(idx);
            });
        });
    }
}

function updateGameInfo() {
    document.getElementById('round-points').textContent = GameState.roundPoints;
    
    // Strikes
    for (let i = 1; i <= 3; i++) {
        const strikeEl = document.getElementById(`strike-${i}`);
        if (strikeEl) {
            strikeEl.classList.toggle('active', i <= GameState.strikes);
        }
    }
    
    document.getElementById('game-phase').textContent = formatPhase(GameState.phase);
    document.getElementById('current-team').textContent = GameState.currentTeam ? 
        (GameState.currentTeam === 'A' ? GameFixedState.teamAName : GameFixedState.teamBName) : '-';
}

function formatPhase(phase) {
    switch (phase) {
        case PHASES.READY: return 'Ready';
        case PHASES.FACEOFF: return 'Face-Off';
        case PHASES.PLAY_OR_PASS: return 'Play/Pass';
        case PHASES.BOARD_PLAY: return 'Board Play';
        case PHASES.STEAL: return 'Steal';
        case PHASES.ROUND_COMPLETE: return 'Round Complete';
        case PHASES.AWARDED: return 'Scored';
        case PHASES.GAME_OVER: return 'Game Over';
        default: return phase;
    }
}

function updateControls() {
    const container = document.getElementById('controls-dynamic');
    let html = '';
    
    switch (GameState.phase) {
        case PHASES.READY:
            html = `<button class="dynamic-btn play" id="btn-start-faceoff">Start Face-Off</button>`;
            break;
        case PHASES.FACEOFF:
            html = `
                <button class="dynamic-btn faceoff" id="btn-team-a-wins">${GameFixedState.teamAName} Wins</button>
                <button class="dynamic-btn faceoff" id="btn-team-b-wins">${GameFixedState.teamBName} Wins</button>
            `;
            break;
        case PHASES.PLAY_OR_PASS:
            html = `
                <button class="dynamic-btn play" id="btn-play">PLAY</button>
                <button class="dynamic-btn pass" id="btn-pass">PASS</button>
            `;
            break;
        case PHASES.BOARD_PLAY:
            html = `<button class="dynamic-btn strike" id="btn-add-strike">Add Strike</button>`;
            break;
        case PHASES.STEAL:
            html = `
                <button class="dynamic-btn steal" id="btn-steal-success">Steal Successful</button>
                <button class="dynamic-btn pass" id="btn-steal-failed">Steal Failed</button>
            `;
            break;
        case PHASES.ROUND_COMPLETE:
            html = `<button class="dynamic-btn award" id="btn-award-points">Award Points</button>`;
            break;
        case PHASES.AWARDED:
            html = `<button class="dynamic-btn next" id="btn-next-round">Next Round</button>`;
            break;
        default:
            break;
    }
    container.innerHTML = html;
    
    // Add event listeners
    const btn = id => document.getElementById(id);
    if (btn('btn-start-faceoff')) btn('btn-start-faceoff').addEventListener('click', () => startFaceoff());
    if (btn('btn-team-a-wins')) btn('btn-team-a-wins').addEventListener('click', () => selectFaceoffWinner('A'));
    if (btn('btn-team-b-wins')) btn('btn-team-b-wins').addEventListener('click', () => selectFaceoffWinner('B'));
    if (btn('btn-play')) btn('btn-play').addEventListener('click', () => playOrPass('PLAY'));
    if (btn('btn-pass')) btn('btn-pass').addEventListener('click', () => playOrPass('PASS'));
    if (btn('btn-add-strike')) btn('btn-add-strike').addEventListener('click', () => addStrike());
    if (btn('btn-steal-success')) btn('btn-steal-success').addEventListener('click', () => resolveSteal(true));
    if (btn('btn-steal-failed')) btn('btn-steal-failed').addEventListener('click', () => resolveSteal(false));
    if (btn('btn-award-points')) btn('btn-award-points').addEventListener('click', () => awardPoints());
    if (btn('btn-next-round')) btn('btn-next-round').addEventListener('click', () => nextRound());
}

function updateUndoButton() {
    const btn = document.getElementById('btn-undo');
    if (btn) {
        btn.disabled = GameStateHistory.length <= 1;
    }
}

// Game Actions
function startFaceoff() {
    createUndoCheckpoint();
    GameState.phase = PHASES.FACEOFF;
    saveGameState();
    updateUI();
}

function selectFaceoffWinner(team) {
    createUndoCheckpoint();
    GameState.faceoffWinner = team;
    GameState.phase = PHASES.PLAY_OR_PASS;
    saveGameState();
    updateUI();
}

function playOrPass(action) {
    createUndoCheckpoint();
    GameState.playOrPassDecision = action;
    if (action === 'PLAY') {
        GameState.currentTeam = GameState.faceoffWinner;
    } else if (action === 'PASS') {
        GameState.currentTeam = GameState.faceoffWinner === 'A' ? 'B' : 'A';
    }
    GameState.phase = PHASES.BOARD_PLAY;
    saveGameState();
    updateUI();
}

function revealAnswer(idx) {
    if (GameState.revealedAnswerIndices.has(idx)) {
        return; // Already revealed
    }
    createUndoCheckpoint();
    GameState.revealedAnswerIndices.add(idx);
    const ans = GameState.currentQuestion.answers[idx];
    GameState.roundPoints += ans.points;
    
    // Check if all revealed
    if (GameState.currentQuestion.answers.length === GameState.revealedAnswerIndices.size) {
        GameState.roundComplete = true;
        GameState.phase = PHASES.ROUND_COMPLETE;
    }
    
    saveGameState();
    updateUI();
}

function addStrike() {
    if (GameState.strikes >= 3) {
        return;
    }
    createUndoCheckpoint();
    GameState.strikes++;
    if (GameState.strikes >= 3) {
        // Transition to steal
        GameState.stealAttemptStatus = 'PENDING';
        GameState.phase = PHASES.STEAL;
    }
    saveGameState();
    updateUI();
}

function resolveSteal(success) {
    if (GameState.stealAttemptStatus !== 'PENDING') {
        alert('Steal already resolved');
        return;
    }
    createUndoCheckpoint();
    GameState.stealAttemptStatus = success ? 'SUCCESS' : 'FAILED';
    GameState.roundComplete = true;
    GameState.phase = PHASES.ROUND_COMPLETE;
    saveGameState();
    updateUI();
}

function awardPoints() {
    if (GameState.roundAwarded) {
        alert('Round already awarded');
        return;
    }
    // The team currently on the board is the default recipient of the round.
    // (In the rare case the face-off winner was never routed through PLAY/PASS,
    // fall back to the face-off winner so points are never silently lost.)
    const playingTeam = GameState.currentTeam || GameState.faceoffWinner;
    let winnerTeam = playingTeam;

    if (GameState.stealAttemptStatus === 'SUCCESS') {
        // Opposing team won the steal and takes the round.
        winnerTeam = (playingTeam === 'A') ? 'B' : 'A';
    } else if (GameState.stealAttemptStatus === 'FAILED') {
        // Steal failed, original playing team keeps the round.
        winnerTeam = playingTeam;
    }
    // If every answer was revealed, the playing team wins the round.
    if (GameState.currentQuestion.answers.length === GameState.revealedAnswerIndices.size) {
        winnerTeam = playingTeam;
    }

    if (winnerTeam === 'A') {
        GameState.teamAScore += GameState.roundPoints;
    } else if (winnerTeam === 'B') {
        GameState.teamBScore += GameState.roundPoints;
    }
    
    GameState.roundAwarded = true;
    GameState.phase = PHASES.AWARDED;
    saveGameState();
    updateUI();
}

// Results and other functions
function updateResults() {
    const taName = document.getElementById('final-team-a-name');
    const tbName = document.getElementById('final-team-b-name');
    const taScore = document.getElementById('final-team-a-score');
    const tbScore = document.getElementById('final-team-b-score');
    const winnerMsg = document.getElementById('winner-message');
    const tiebreakerSec = document.getElementById('tiebreaker-section');
    
    if (taName) taName.textContent = GameFixedState.teamAName;
    if (tbName) tbName.textContent = GameFixedState.teamBName;
    if (taScore) taScore.textContent = GameState.teamAScore;
    if (tbScore) tbScore.textContent = GameState.teamBScore;
    
    if (GameState.teamAScore > GameState.teamBScore) {
        winnerMsg.textContent = `${GameFixedState.teamAName} Wins!`;
        tiebreakerSec.style.display = 'none';
    } else if (GameState.teamBScore > GameState.teamAScore) {
        winnerMsg.textContent = `${GameFixedState.teamBName} Wins!`;
        tiebreakerSec.style.display = 'none';
    } else {
        winnerMsg.textContent = "It's a Tie!";
        tiebreakerSec.style.display = 'block';
    }
}

// More event listeners for results screen
function setupMoreEventListeners() {
    document.getElementById('btn-return-menu').addEventListener('click', () => {
        clearSavedGame();
        showScreen('screen-menu');
        updateMenuButtons();
    });
    
    document.getElementById('btn-replay').addEventListener('click', () => {
        if (GameFixedState.activeQuestionSet) {
            clearSavedGame();
            startNewGame();
        }
    });
    
    document.getElementById('btn-start-tiebreaker').addEventListener('click', () => {
        if (!GameFixedState.activeQuestionSet) return;
        clearSavedGame();
        GameState.isTiebreaker = true;
        GameState.currentRoundIndex = 0;
        GameState.teamAScore = 0;
        GameState.teamBScore = 0;
        GameState.gameOver = false;
        GameStateHistory = [];
        resetGameForNewRound();
        loadCurrentRound();
        createUndoCheckpoint();
        showScreen('screen-gameplay');
        updateUI();
        saveGameState();
    });
    
    document.getElementById('btn-end-game').addEventListener('click', () => {
        if (confirm('End the game? This will show final results.')) {
            endGame();
        }
    });
    
    document.getElementById('btn-undo').addEventListener('click', () => {
        undoLastAction();
    });
    
    // Modal answer add
    // Modal answer add button handled in setup
}

// Modal answer add - handled in main setup
let modalAnswers = [];
function getModalAnswers() {
    const listEl = document.getElementById('modal-answers-list');
    return listEl._answers || modalAnswers;
}

// Update the init
function initializeApp() {
    setupEventListeners();
    setupMoreEventListeners();
    updateMenuButtons();
    showScreen('screen-menu');
}

// Auto-init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}