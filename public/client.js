const socket = io();

const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code');
const createRoomBtn = document.getElementById('create-room-btn');
const showJoinBtn = document.getElementById('show-join-btn');
const joinForm = document.getElementById('join-form');
const joinRoomBtn = document.getElementById('join-room-btn');
const statusMessage = document.getElementById('status-message');
const lobbyPanel = document.getElementById('lobby-panel');
const joinPanel = document.getElementById('join-panel');
const roomCodeLabel = document.getElementById('room-code-label');
const playerPseudoLabel = document.getElementById('player-pseudo-label');
const playerRoleLabel = document.getElementById('player-role-label');
const playerList = document.getElementById('player-list');
const chatMessages = document.getElementById('chat-messages');
const chatHeading = document.getElementById('chat-heading');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const guessPanel = document.getElementById('guess-panel');
const guessForm = document.getElementById('guess-form');
const submitGuessBtn = document.getElementById('submit-guess-btn');
const guessStatus = document.getElementById('guess-status');
const resultsPanel = document.getElementById('results-panel');
const revealList = document.getElementById('reveal-list');
const finalScoreboard = document.getElementById('final-scoreboard');
const resultsList = document.getElementById('results-list');
const showHistoryBtn = document.getElementById('show-history-btn');
const historyModal = document.getElementById('history-modal');
const historyMessages = document.getElementById('history-messages');
const closeHistoryBtn = document.getElementById('close-history-btn');
const startGameBtn = document.getElementById('start-game-btn');
const questionCard = document.getElementById('question-card');
const questionNumberLabel = document.getElementById('question-number');
const questionTimerLabel = document.getElementById('question-timer');
const questionText = document.getElementById('question-text');
const answeredCountLabel = document.getElementById('answered-count');
const gameStatusLabel = document.getElementById('game-status');

let currentRoomCode = null;
let localPlayerId = null;
let resultRevealTimer = null;
let resultRevealIndex = 0;
let resultRevealResults = null;
let resultRevealKey = '';

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? '#f67d7d' : '#c8d0ff';
}

function showLobby(room, playerId, initialGameState = null) {
  currentRoomCode = room.code;
  localPlayerId = playerId;
  currentRoomChat = room.chat;
  roomCodeLabel.textContent = room.code;
  const me = room.players.find((player) => player.id === playerId);
  const displayName = (room.game?.started ? me?.pseudo : me?.name) || 'Vous';
  playerPseudoLabel.textContent = displayName;
  playerRoleLabel.textContent = me?.isHost ? 'Hôte' : 'Joueur';
  renderPlayers(room.players, room.game?.started);
  updateHostControls(room);
  updateGameUI(initialGameState || room.game);
  updateLocalLabels(room);
  renderChatHistory(room.chat);
  joinPanel.classList.add('hidden');
  lobbyPanel.classList.remove('hidden');
  setStatus('Vous êtes dans la salle. Attendez d’autres joueurs ou discutez dans le chat.');
}

function updateLocalLabels(room) {
  const me = room.players.find((player) => player.id === localPlayerId);
  if (!me) return;
  playerPseudoLabel.textContent = (room.game?.started ? me.pseudo : me.name) || 'Vous';
  playerRoleLabel.textContent = me?.isHost ? 'Hôte' : 'Joueur';
}

function shufflePlayers(players) {
  const array = [...players];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function renderPlayers(players, gameStarted = false) {
  const displayPlayers = gameStarted ? shufflePlayers(players) : players;
  playerList.innerHTML = displayPlayers
    .map((player) => {
      const label = gameStarted ? player.pseudo : player.name;
      return `
      <li>
        <div>
          <strong>${label || player.pseudo || 'Joueur'}</strong>
          <small>${player.isHost ? 'Hôte' : 'Joueur'}</small>
        </div>
      </li>
    `;
    })
    .join('');
}

function formatChatMessage({ sender, text, timestamp, type }) {
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const classes = ['chat-message'];
  if (type) {
    classes.push(`chat-message--${type}`);
  }
  return `
    <div class="${classes.join(' ')}">
      <strong>${sender}</strong>
      <small>${time}</small>
      <div>${text}</div>
    </div>
  `;
}

function appendChat(message) {
  const atBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 40;
  chatMessages.insertAdjacentHTML('beforeend', formatChatMessage(message));
  if (atBottom) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

let currentRoomChat = [];

function renderChatHistory(chat) {
  chatMessages.innerHTML = '';
  chat.forEach(appendChat);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderHistoryMessages(chat) {
  historyMessages.innerHTML = '';
  chat.forEach((message) => {
    historyMessages.insertAdjacentHTML('beforeend', formatChatMessage(message));
  });
  historyMessages.scrollTop = historyMessages.scrollHeight;
}

function openHistoryModal() {
  renderHistoryMessages(currentRoomChat);
  historyModal.classList.remove('hidden');
}

function closeHistoryModal() {
  historyModal.classList.add('hidden');
}

function updateHostControls(room) {
  const me = room.players.find((player) => player.id === localPlayerId);
  if (me?.isHost && !room.game.started) {
    startGameBtn.classList.remove('hidden');
  } else {
    startGameBtn.classList.add('hidden');
  }
}

function renderGuessPanel(game) {
  if (!game.pseudos || !game.guessNames) {
    guessPanel.classList.add('hidden');
    return;
  }

  guessPanel.classList.remove('hidden');
  guessForm.innerHTML = game.pseudos
    .map((pseudo, index) => `
      <div class="guess-row">
        <label for="guess-${index}">${pseudo}</label>
        <select id="guess-${index}" name="${pseudo}" ${game.hasSubmitted ? 'disabled' : ''}>
          <option value="">Sélectionnez un nom</option>
          ${game.guessNames.map((name) => `<option value="${name}">${name}</option>`).join('')}
        </select>
      </div>
    `)
    .join('');

  const selects = Array.from(guessForm.querySelectorAll('select'));
  selects.forEach((select) => select.addEventListener('change', updateGuessOptions));
  updateGuessOptions();

  submitGuessBtn.disabled = game.hasSubmitted;
  guessStatus.textContent = game.hasSubmitted
    ? `Réponses envoyées (${game.guessSubmissionCount}/${game.guessRequiredCount}).`
    : 'Reliez chaque pseudo à un vrai nom.';
}

function updateGuessOptions() {
  const selects = Array.from(guessForm.querySelectorAll('select'));
  const selectedNames = selects
    .map((select) => select.value)
    .filter((value) => value);

  selects.forEach((select) => {
    const options = Array.from(select.options);
    options.forEach((option) => {
      if (!option.value) {
        option.disabled = false;
        return;
      }
      option.disabled = selectedNames.includes(option.value) && select.value !== option.value;
    });
  });
}

function getResultsKey(results) {
  return results.map((item) => `${item.id}:${item.score}:${item.pseudo}:${item.name}`).join('|');
}

function renderResults(game) {
  if (!game.results) {
    resultsPanel.classList.add('hidden');
    return;
  }

  resultsPanel.classList.remove('hidden');
  const key = getResultsKey(game.results);
  if (key !== resultRevealKey) {
    resultRevealKey = key;
    startResultsReveal(game.results);
  }
}

function startResultsReveal(results) {
  if (resultRevealTimer) {
    clearTimeout(resultRevealTimer);
  }

  resultRevealResults = results;
  resultRevealIndex = 0;
  revealList.innerHTML = '';
  finalScoreboard.classList.add('hidden');
  resultsList.innerHTML = '';

  nextRevealStep();
}

function nextRevealStep() {
  if (!resultRevealResults || resultRevealIndex >= resultRevealResults.length) {
    showFinalScoreboard();
    return;
  }

  const item = resultRevealResults[resultRevealIndex++];
  const card = document.createElement('div');
  card.className = 'reveal-card';
  card.innerHTML = `
    <strong>${item.pseudo}</strong>
    <div class="reveal-name">?</div>
  `;
  revealList.appendChild(card);

  setTimeout(() => {
    const nameElement = card.querySelector('.reveal-name');
    if (nameElement) {
      nameElement.textContent = item.name;
    }
  }, 2000);

  resultRevealTimer = setTimeout(nextRevealStep, 4000);
}

function showFinalScoreboard() {
  if (resultRevealTimer) {
    clearTimeout(resultRevealTimer);
    resultRevealTimer = null;
  }

  finalScoreboard.classList.remove('hidden');
  resultsList.innerHTML = resultRevealResults
    .map((item, index) => `
      <div class="result-item">
        <div>
          <strong>${item.name} (${item.pseudo})</strong>
          <small>${item.score} points</small>
        </div>
        <div>#${index + 1}</div>
      </div>
    `)
    .join('');
}

function updateGameUI(game) {
  const showingQuestions = game && game.started && game.phase === 'questions';
  const showingGuess = game && game.phase === 'guess';
  const showingResults = game && game.phase === 'results';

  questionCard.classList.toggle('hidden', !showingQuestions);
  guessPanel.classList.toggle('hidden', !showingGuess);
  resultsPanel.classList.toggle('hidden', !showingResults);
  chatHeading.classList.toggle('hidden', showingGuess || showingResults);
  chatMessages.classList.toggle('hidden', showingGuess || showingResults);
  chatForm.classList.toggle('hidden', showingGuess || showingResults);
  showHistoryBtn.classList.toggle('hidden', !(showingGuess || showingResults));

  if (!game || !game.started) {
    gameStatusLabel.textContent = 'La partie n’a pas encore commencé.';
    return;
  }

  if (showingQuestions) {
    questionNumberLabel.textContent = `${game.questionNumber}/${game.totalQuestions}`;
    questionTimerLabel.textContent = game.timeLeft != null ? `${game.timeLeft}s` : '--';
    questionText.textContent = game.currentQuestionText || 'En attente de la question...';
    answeredCountLabel.textContent = `${game.answeredCount}/${game.requiredCount} réponses reçues`;
    gameStatusLabel.textContent = game.hasAnswered
      ? 'Vous avez déjà répondu à cette question.'
      : 'Répondez à la question dans le chat ci-dessous.';
    return;
  }

  if (showingGuess) {
    renderGuessPanel(game);
    gameStatusLabel.textContent = game.hasSubmitted
      ? `Attendez les autres (${game.guessSubmissionCount}/${game.guessRequiredCount}).`
      : 'Associez chaque pseudo à un vrai nom.';
    return;
  }

  if (showingResults) {
    renderResults(game);
    gameStatusLabel.textContent = 'Voici les résultats finaux.';
    return;
  }
}

createRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) return setStatus('Entrez votre prénom pour créer une salle.', true);
  socket.emit('create-room', { name });
});

showJoinBtn.addEventListener('click', () => {
  joinForm.classList.toggle('hidden');
});

joinRoomBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const roomCode = roomCodeInput.value.trim().toUpperCase();
  if (!name) return setStatus('Entrez votre prénom pour rejoindre une salle.', true);
  if (!roomCode) return setStatus('Entrez le code de la salle.', true);
  socket.emit('join-room', { roomCode, name });
});

startGameBtn.addEventListener('click', () => {
  if (!currentRoomCode) return;
  socket.emit('start-game', { roomCode: currentRoomCode });
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !currentRoomCode) return;
  socket.emit('send-chat', { roomCode: currentRoomCode, text });
  chatInput.value = '';
});

guessForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!currentRoomCode) return;

  const formData = new FormData(guessForm);
  const guess = {};
  for (const [pseudo, name] of formData.entries()) {
    guess[pseudo] = name;
  }

  socket.emit('submit-guess', { roomCode: currentRoomCode, guess });
});

submitGuessBtn.addEventListener('click', () => {
  guessForm.dispatchEvent(new Event('submit', { cancelable: true }));
});

showHistoryBtn.addEventListener('click', openHistoryModal);
closeHistoryBtn.addEventListener('click', closeHistoryModal);
historyModal.addEventListener('click', (event) => {
  if (event.target === historyModal) {
    closeHistoryModal();
  }
});

socket.on('error-message', (message) => {
  setStatus(message, true);
});

socket.on('room-updated', (room) => {
  currentRoomChat = room.chat;
  renderPlayers(room.players, room.game?.started);
  updateHostControls(room);
  updateGameUI(room.game);
  updateLocalLabels(room);
  renderChatHistory(room.chat);
});

socket.on('joined-room', ({ room, playerId, game }) => {
  currentRoomChat = room.chat;
  showLobby(room, playerId, game);
});

socket.on('game-updated', (game) => {
  updateGameUI(game);
});

socket.on('chat-message', (message) => {
  currentRoomChat.push(message);
  if (!historyModal.classList.contains('hidden')) {
    renderHistoryMessages(currentRoomChat);
  }
  appendChat(message);
});

socket.on('room-created', (roomState) => {
  renderPlayers(roomState.players, roomState.game?.started);
});
