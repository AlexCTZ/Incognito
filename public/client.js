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
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const startGameBtn = document.getElementById('start-game-btn');
const questionCard = document.getElementById('question-card');
const questionNumberLabel = document.getElementById('question-number');
const questionTimerLabel = document.getElementById('question-timer');
const questionText = document.getElementById('question-text');
const answeredCountLabel = document.getElementById('answered-count');
const gameStatusLabel = document.getElementById('game-status');

let currentRoomCode = null;
let localPlayerId = null;

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.style.color = isError ? '#f67d7d' : '#c8d0ff';
}

function showLobby(room, playerId, initialGameState = null) {
  currentRoomCode = room.code;
  localPlayerId = playerId;
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

function renderPlayers(players, gameStarted = false) {
  playerList.innerHTML = players
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

function renderChatHistory(chat) {
  chatMessages.innerHTML = '';
  chat.forEach(appendChat);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateHostControls(room) {
  const me = room.players.find((player) => player.id === localPlayerId);
  if (me?.isHost && !room.game.started) {
    startGameBtn.classList.remove('hidden');
  } else {
    startGameBtn.classList.add('hidden');
  }
}

function updateGameUI(game) {
  if (!game || !game.started) {
    questionCard.classList.add('hidden');
    gameStatusLabel.textContent = 'La partie n’a pas encore commencé.';
    return;
  }

  questionCard.classList.remove('hidden');
  questionNumberLabel.textContent = `${game.questionNumber}/${game.totalQuestions}`;
  questionTimerLabel.textContent = game.timeLeft != null ? `${game.timeLeft}s` : '--';
  questionText.textContent = game.currentQuestionText || 'En attente de la question...';
  answeredCountLabel.textContent = `${game.answeredCount}/${game.requiredCount} réponses reçues`;
  gameStatusLabel.textContent = game.hasAnswered
    ? 'Vous avez déjà répondu à cette question.'
    : 'Répondez à la question dans le chat ci-dessous.';
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

socket.on('error-message', (message) => {
  setStatus(message, true);
});

socket.on('joined-room', ({ room, playerId, game }) => {
  showLobby(room, playerId, game);
});

socket.on('room-updated', (room) => {
  renderPlayers(room.players, room.game?.started);
  updateHostControls(room);
  updateGameUI(room.game);
  updateLocalLabels(room);
  renderChatHistory(room.chat);
});

socket.on('game-updated', (game) => {
  updateGameUI(game);
});

socket.on('chat-message', (message) => {
  appendChat(message);
});

socket.on('room-created', (roomState) => {
  renderPlayers(roomState.players, roomState.game?.started);
});
