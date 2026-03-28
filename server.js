const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 10;
const QUESTIONS_PER_GAME = 10;
const QUESTION_TIMEOUT_MS = 60000;
const PSEUDOS = [
  "Le Fantôme", "Monsieur X", "La Mouche", "L'Énigme", "Le Caméléon",
  "La Plume", "Le Masque", "Le Miroir", "La Brume", "L'Ombre"
];

const QUESTIONS_POOL = [
  'Quel est ton plat préféré ?',
  'Quelle est la destination de voyage de tes rêves ?',
  'Quelle est la dernière série que tu as regardée ?',
  'Quel est ton animal favori ?',
  'Quelle est ta couleur préférée ?',
  'Quel métier voulais-tu faire enfant ?',
  'Quel est ton talent secret ?',
  'Quel super-pouvoir aimerais-tu avoir ?',
  'Quel est le livre qui t’a marqué ?',
  'Quel est ton souvenir d’enfance préféré ?',
  'Quel est ton dessert favori ?',
  'Quelle invention aurais-tu aimé créer ?',
  'Quel est ton sport préféré ?',
  'Quel est ton héros de fiction préféré ?',
  'Quelle chanson te fait toujours danser ?',
  'Quel est le meilleur conseil que tu aies reçu ?',
  'Quel est ton loisir favori ?',
  'Quel pays aimerais-tu visiter ?',
  'Quel est ton film préféré ?',
  'Quelle est ta saison préférée ?'
];

const rooms = new Map();

function randomCode() {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  return Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

function shuffleArray(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function selectQuestions() {
  return shuffleArray(QUESTIONS_POOL).slice(0, QUESTIONS_PER_GAME);
}

function createRoom(hostName) {
  const code = (() => {
    let id;
    do {
      id = randomCode();
    } while (rooms.has(id));
    return id;
  })();

  const players = [];
  rooms.set(code, {
    code,
    hostId: null,
    players,
    chat: [],
    phase: 'lobby',
    gameStarted: false,
    questions: [],
    currentQuestionIndex: -1,
    currentQuestionText: null,
    questionStartTime: null,
    answeredIds: new Set(),
    timer: null,
    guessNames: [],
    guessSubmissions: new Map(),
    scores: new Map(),
    results: null,
  });
  return rooms.get(code);
}

function getGameState(room, socketId = null) {
  const baseState = {
    started: room.gameStarted,
    phase: room.phase,
    questionNumber: room.currentQuestionIndex >= 0 ? room.currentQuestionIndex + 1 : 0,
    totalQuestions: QUESTIONS_PER_GAME,
    currentQuestionText: room.currentQuestionText,
    answeredCount: room.answeredIds.size,
    requiredCount: room.players.length,
    timeLeft: room.questionStartTime
      ? Math.max(0, Math.ceil((room.questionStartTime + QUESTION_TIMEOUT_MS - Date.now()) / 1000))
      : null,
  };

  if (room.phase === 'questions') {
    return {
      ...baseState,
      hasAnswered: socketId ? room.answeredIds.has(socketId) : false,
    };
  }

  if (room.phase === 'guess') {
    return {
      ...baseState,
      pseudos: room.players.map((p) => p.pseudo),
      guessNames: room.guessNames,
      guessSubmissionCount: room.guessSubmissions.size,
      guessRequiredCount: room.players.length,
      hasSubmitted: socketId ? room.guessSubmissions.has(socketId) : false,
    };
  }

  if (room.phase === 'results') {
    return {
      ...baseState,
      results: room.results || [],
    };
  }

  return baseState;
}

function getRoomState(room) {
  return {
    code: room.code,
    players: room.players.map((p) => {
      const playerState = {
        id: p.id,
        pseudo: p.pseudo,
        isHost: p.isHost,
      };
      if (!room.gameStarted) {
        playerState.name = p.name;
      }
      return playerState;
    }),
    chat: room.chat,
    game: getGameState(room),
  };
}

function clearRoomTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

function broadcastChat(room, message) {
  room.chat.push(message);
  io.to(room.code).emit('chat-message', message);
}

function sendRoomUpdate(room) {
  io.to(room.code).emit('room-updated', getRoomState(room));
}

async function sendGameUpdate(room) {
  const sockets = await io.in(room.code).fetchSockets();
  sockets.forEach((socket) => {
    socket.emit('game-updated', getGameState(room, socket.id));
  });
}

function endGame(room) {
  clearRoomTimer(room);
  room.gameStarted = false;
  room.currentQuestionText = null;
  room.currentQuestionIndex = -1;
  room.questionStartTime = null;
  room.questions = [];
  room.answeredIds = new Set();

  const endMessage = {
    sender: 'Système',
    type: 'system',
    text: 'La partie est terminée. Merci pour la partie !',
    timestamp: Date.now(),
  };
  broadcastChat(room, endMessage);
  sendGameUpdate(room);
  sendRoomUpdate(room);
}

function beginGuessPhase(room) {
  clearRoomTimer(room);
  room.phase = 'guess';
  room.currentQuestionText = null;
  room.currentQuestionIndex = room.questions.length;
  room.questionStartTime = null;
  room.answeredIds = new Set();
  room.guessNames = shuffleArray(room.players.map((p) => p.name));
  room.guessSubmissions = new Map();

  sendRoomUpdate(room);
  sendGameUpdate(room);
}

function computeResults(room) {
  const actualByPseudo = Object.fromEntries(room.players.map((p) => [p.pseudo, p.name]));
  const results = room.players.map((player) => {
    const guess = room.guessSubmissions.get(player.id) || {};
    let score = 0;
    for (const [pseudo, name] of Object.entries(guess)) {
      if (actualByPseudo[pseudo] === name) {
        score += 1;
      }
    }
    room.scores.set(player.id, score);
    return {
      id: player.id,
      pseudo: player.pseudo,
      name: player.name,
      score,
    };
  });
  results.sort((a, b) => b.score - a.score);
  room.results = results;
  room.phase = 'results';
  room.currentQuestionText = null;
  room.questionStartTime = null;

  sendRoomUpdate(room);
  sendGameUpdate(room);
}

function sendNextQuestion(room) {
  clearRoomTimer(room);
  room.currentQuestionIndex += 1;

  if (room.currentQuestionIndex >= room.questions.length) {
    return beginGuessPhase(room);
  }

  room.currentQuestionText = room.questions[room.currentQuestionIndex];
  room.answeredIds = new Set();
  room.questionStartTime = Date.now();
  room.timer = setTimeout(() => finalizeQuestion(room), QUESTION_TIMEOUT_MS);

  const questionMessage = {
    sender: 'Système',
    type: 'question',
    text: `Question ${room.currentQuestionIndex + 1} : ${room.currentQuestionText}`,
    timestamp: Date.now(),
  };
  broadcastChat(room, questionMessage);
  sendGameUpdate(room);
}

function finalizeQuestion(room) {
  if (room.phase !== 'questions' || room.questionStartTime === null) {
    return;
  }

  clearRoomTimer(room);

  const timedOut = room.answeredIds.size < room.players.length;
  if (timedOut) {
    const feedbackMessage = {
      sender: 'Système',
      type: 'system',
      text: '60 secondes écoulées. Passage à la question suivante...',
      timestamp: Date.now(),
    };
    broadcastChat(room, feedbackMessage);
  }
  sendNextQuestion(room);
}

function assignPseudos(room) {
  const shuffled = shuffleArray(PSEUDOS).slice(0, room.players.length);
  room.players.forEach((player, index) => {
    player.pseudo = shuffled[index];
  });
}

function startGame(room) {
  if (room.phase !== 'lobby') return;
  if (room.players.length < 2) return;

  assignPseudos(room);
  room.phase = 'questions';
  room.gameStarted = true;
  room.questions = selectQuestions();
  room.currentQuestionIndex = -1;
  room.currentQuestionText = null;
  room.questionStartTime = null;
  room.answeredIds = new Set();
  room.guessNames = [];
  room.guessSubmissions = new Map();
  room.scores = new Map(room.players.map((player) => [player.id, 0]));
  room.results = null;
  room.chat = [];

  const startMessage = {
    sender: 'Système',
    type: 'system',
    text: 'La partie commence ! Répondez à la première question dans le chat.',
    timestamp: Date.now(),
  };
  broadcastChat(room, startMessage);
  sendRoomUpdate(room);
  sendNextQuestion(room);
}

function markAnswer(room, player) {
  if (!room.gameStarted || !room.currentQuestionText) {
    return;
  }

  if (room.answeredIds.has(player.id)) {
    return;
  }

  room.answeredIds.add(player.id);
  sendGameUpdate(room);

  if (room.answeredIds.size >= room.players.length) {
    finalizeQuestion(room);
  }
}

io.on('connection', (socket) => {
  socket.on('create-room', ({ name }) => {
    if (!name || typeof name !== 'string') {
      return socket.emit('error-message', 'Name is required to create a room.');
    }

    const room = createRoom(name.trim());
    const player = {
      id: socket.id,
      name: name.trim(),
      pseudo: null,
      isHost: true,
    };
    room.hostId = socket.id;
    room.players.push(player);

    socket.join(room.code);
    socket.emit('room-created', getRoomState(room));
    socket.emit('joined-room', { room: getRoomState(room), playerId: socket.id });
  });

  socket.on('join-room', ({ roomCode, name }) => {
    const code = roomCode?.toUpperCase?.()?.trim();
    const room = rooms.get(code);

    if (!room) {
      return socket.emit('error-message', 'Room not found.');
    }

    if (room.gameStarted) {
      return socket.emit('error-message', 'La partie a déjà commencé.');
    }

    if (room.players.length >= MAX_PLAYERS) {
      return socket.emit('error-message', 'Room is full.');
    }

    if (!name || typeof name !== 'string') {
      return socket.emit('error-message', 'Name is required to join a room.');
    }

    const player = {
      id: socket.id,
      name: name.trim(),
      pseudo: null,
      isHost: false,
    };

    room.players.push(player);
    socket.join(room.code);

    sendRoomUpdate(room);
    socket.emit('joined-room', { room: getRoomState(room), playerId: socket.id, game: getGameState(room, socket.id) });
  });

  socket.on('start-game', ({ roomCode }) => {
    const code = roomCode?.toUpperCase?.()?.trim();
    const room = rooms.get(code);

    if (!room) {
      return socket.emit('error-message', 'Room not found.');
    }

    if (socket.id !== room.hostId) {
      return socket.emit('error-message', 'Only the host can start the game.');
    }

    if (room.gameStarted) {
      return socket.emit('error-message', 'The game has already started.');
    }

    if (room.players.length < 2) {
      return socket.emit('error-message', 'At least two players are required to start.');
    }

    startGame(room);
  });

  socket.on('send-chat', ({ roomCode, text }) => {
    const code = roomCode?.toUpperCase?.()?.trim();
    const room = rooms.get(code);
    if (!room) return;

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    if (room.phase !== 'lobby' && room.phase !== 'questions') {
      return socket.emit('error-message', 'Le chat n’est pas disponible dans cette phase.');
    }

    if (room.phase === 'questions' && room.currentQuestionText && room.answeredIds.has(player.id)) {
      return socket.emit('error-message', 'Vous avez déjà répondu à cette question.');
    }

    const message = {
      sender: room.gameStarted ? player.pseudo : player.name,
      text: text.trim().slice(0, 250),
      timestamp: Date.now(),
    };
    room.chat.push(message);
    io.to(room.code).emit('chat-message', message);

    if (room.gameStarted && room.currentQuestionText) {
      markAnswer(room, player);
    }
  });
  socket.on('submit-guess', ({ roomCode, guess }) => {
    const code = roomCode?.toUpperCase?.()?.trim();
    const room = rooms.get(code);
    if (!room) return;

    if (room.phase !== 'guess') {
      return socket.emit('error-message', 'Vous ne pouvez pas envoyer de réponse maintenant.');
    }

    const player = room.players.find((p) => p.id === socket.id);
    if (!player) return;

    if (room.guessSubmissions.has(player.id)) {
      return socket.emit('error-message', 'Vous avez déjà soumis votre réponse.');
    }

    const validPseudos = new Set(room.players.map((p) => p.pseudo));
    const validNames = new Set(room.players.map((p) => p.name));
    const selectedNames = new Set();

    if (!guess || typeof guess !== 'object') {
      return socket.emit('error-message', 'Réponse invalide.');
    }

    for (const pseudo of Object.keys(guess)) {
      if (!validPseudos.has(pseudo)) {
        return socket.emit('error-message', 'Pseudo invalide dans la soumission.');
      }
      const name = guess[pseudo];
      if (!validNames.has(name)) {
        return socket.emit('error-message', 'Nom invalide dans la soumission.');
      }
      if (selectedNames.has(name)) {
        return socket.emit('error-message', 'Vous devez utiliser chaque nom une seule fois.');
      }
      selectedNames.add(name);
    }

    if (selectedNames.size !== room.players.length) {
      return socket.emit('error-message', 'Vous devez relier chaque pseudo à un nom.');
    }

    room.guessSubmissions.set(player.id, guess);
    sendGameUpdate(room);

    if (room.guessSubmissions.size >= room.players.length) {
      computeResults(room);
    }
  });
  socket.on('disconnect', () => {
    for (const room of rooms.values()) {
      const index = room.players.findIndex((p) => p.id === socket.id);
      if (index !== -1) {
        const [player] = room.players.splice(index, 1);
        const leaveMessage = {
          sender: 'Système',
          type: 'system',
          text: `${player.pseudo} a quitté la salle.`,
          timestamp: Date.now(),
        };
        room.chat.push(leaveMessage);
        sendRoomUpdate(room);
        broadcastChat(room, leaveMessage);
        if (room.hostId === socket.id && room.players.length > 0) {
          room.hostId = room.players[0].id;
          room.players[0].isHost = true;
          sendRoomUpdate(room);
        }
        if (room.gameStarted && room.currentQuestionText && room.answeredIds.size >= room.players.length) {
          finalizeQuestion(room);
        }
        if (room.players.length === 0) {
          rooms.delete(room.code);
        }
        break;
      }
    }
  });
});

app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, () => {
  console.log(`L'Incognito lobby server running on http://localhost:${PORT}`);
});
