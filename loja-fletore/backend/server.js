const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);

const io = new Server(server, { cors: { origin: "*" } });

const rooms = {};
// Alfabeti shqip PA shkronjën Ë
const alfabeti = ['A','B','C','D','E','F','G','Gj','H','I','J','K','L','M','N','Nj','O','P','Q','R','S','Sh','T','Th','U','V','X','Z',];

io.on('connection', (socket) => {
  
  socket.on('create_room', (playerName) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[roomCode] = { 
      host: socket.id, 
      players: [{ id: socket.id, name: playerName || "Lojtari", totalScore: 0, winStreak: 0, penalized: false }],
      currentRound: { answers: [], submissions: 0 },
      contests: {} // Format: { "playerId_category": [voterId1, voterId2] }
    };
    socket.join(roomCode);
    socket.emit('room_created', { roomCode, isHost: true, players: rooms[roomCode].players });
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    if (rooms[roomCode]) {
      rooms[roomCode].players.push({ id: socket.id, name: playerName || "Lojtar i Ri", totalScore: 0, winStreak: 0, penalized: false });
      socket.join(roomCode);
      socket.emit('joined_room', { roomCode, isHost: false, players: rooms[roomCode].players });
      io.to(roomCode).emit('update_players', rooms[roomCode].players);
    }
  });

  socket.on('spin_wheel', (roomCode) => {
    if (rooms[roomCode] && rooms[roomCode].host === socket.id) {
      const randomLetter = alfabeti[Math.floor(Math.random() * alfabeti.length)];
      rooms[roomCode].currentRound = { answers: [], submissions: 0 }; 
      rooms[roomCode].contests = {}; // Reseto votat
      
      io.to(roomCode).emit('wheel_spinning');
      setTimeout(() => io.to(roomCode).emit('wheel_stopped', randomLetter), 3000);
    }
  });

  socket.on('stop_game', (roomCode) => {
    // Logjika Anti-Spam: Kush shtyp STOP duhet regjistruar për verifikim më pas
    rooms[roomCode].currentRound.stopperId = socket.id;
    io.to(roomCode).emit('freeze_inputs');
  });

  socket.on('submit_answers', ({ roomCode, answers, playerName }) => {
    if (!rooms[roomCode]) return;
    const room = rooms[roomCode];
    room.currentRound.answers.push({ id: socket.id, name: playerName, answers });
    room.currentRound.submissions++;

    if (room.currentRound.submissions === room.players.length) calculateScores(roomCode);
  });

  socket.on('vote_contest', ({ roomCode, targetKey, voterId }) => {
    if (!rooms[roomCode]) return;
    if (!rooms[roomCode].contests[targetKey]) rooms[roomCode].contests[targetKey] = [];
    
    // Shto votën nëse nuk ka votuar më parë
    if (!rooms[roomCode].contests[targetKey].includes(voterId)) {
      rooms[roomCode].contests[targetKey].push(voterId);
      io.to(roomCode).emit('update_contests', rooms[roomCode].contests);
      
      // Nëse arrihen 3 vota, rillogarit pikët
      if (rooms[roomCode].contests[targetKey].length >= 3) {
        recalculateScores(roomCode);
      }
    }
  });

  const calculateScores = (roomCode) => {
    const room = rooms[roomCode];
    const roundData = room.currentRound.answers;
    const categories = ['shtet', 'qytet', 'emer', 'send', 'ushqim', 'kafshe'];
    
    // Gjej fjalët e përbashkëta (Frequency Map)
    const frequencyMap = {};
    categories.forEach(cat => frequencyMap[cat] = {});

    roundData.forEach(player => {
      categories.forEach(cat => {
        const word = player.answers[cat].trim().toLowerCase();
        if (word) frequencyMap[cat][word] = (frequencyMap[cat][word] || 0) + 1;
      });
    });

    let maxScore = -1;
    let winnerId = null;

    const results = roundData.map(player => {
      let roundScore = 0;
      let emptyCount = 0;
      const pointsBreakdown = {};

      categories.forEach(cat => {
        const word = player.answers[cat].trim().toLowerCase();
        const contestKey = `${player.id}_${cat}`;
        const votes = room.contests[contestKey] ? room.contests[contestKey].length : 0;
        
        let points = 0;
        if (!word || votes >= 3) {
          points = 0;
          if(!word) emptyCount++;
        } else if (frequencyMap[cat][word] === 1) {
          points = 10;
        } else {
          points = 5;
        }
        
        roundScore += points;
        pointsBreakdown[cat] = { word: player.answers[cat], points };
      });

      const roomPlayer = room.players.find(p => p.id === player.id);
      
      // Anti-Spam: Nëse ai që shtypi STOP ka 4+ fusha bosh/të djegura, penalizohet!
      if (room.currentRound.stopperId === player.id && emptyCount >= 4) {
          roomPlayer.penalized = true;
      } else {
          roomPlayer.penalized = false;
      }

      if (roomPlayer) roomPlayer.totalScore += roundScore;

      // Gjej fituesin e raundit
      if (roundScore > maxScore) { maxScore = roundScore; winnerId = player.id; }

      return { id: player.id, name: player.name, pointsBreakdown, roundScore, totalScore: roomPlayer.totalScore, penalized: roomPlayer.penalized, winStreak: roomPlayer.winStreak };
    });

    // Përditëso Win Streaks
    room.players.forEach(p => {
      if (p.id === winnerId && maxScore > 0) p.winStreak += 1;
      else p.winStreak = 0;
    });

    io.to(roomCode).emit('results_ready', results);
  };

  const recalculateScores = (roomCode) => {
      
  };
});

server.listen(3001, () => console.log('Serveri po punon në portin 3001'));