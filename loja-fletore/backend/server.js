const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Konfigurimi i CORS për Express
app.use(cors({
    origin: "*",
    methods: ["GET", "POST"]
}));

const server = http.createServer(app);

// Konfigurimi i Socket.io i përshtatur për Deploy (Render/Vercel)
const io = new Server(server, { 
  cors: { 
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  allowEIO3: true,
  transports: ['websocket', 'polling'] 
});

// Shto një rrugë bazë për të kontrolluar nëse serveri është online
app.get("/", (req, res) => {
    res.send("Serveri i Lojës është Online!");
});

const rooms = {};

// Alfabeti shqip i pastruar (Pa Ë, Pa Zh)
const alfabeti = [
  'A','B','C','Ç','D','Dh','E','F','G','Gj','H','I','J','K','L','Ll','M','N','Nj','O','P','Q','R','Rr','S','Sh','T','Th','U','V','X','Xh','Y','Z'
];

io.on('connection', (socket) => {
  
  socket.on('create_room', (playerName) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[roomCode] = { 
      host: socket.id, 
      players: [{ id: socket.id, name: playerName || "Lojtari", totalScore: 0, winStreak: 0 }],
      currentRound: { answers: [], submissions: 0 },
      contests: {} 
    };
    socket.join(roomCode);
    socket.emit('room_created', { roomCode, isHost: true, players: rooms[roomCode].players });
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    if (rooms[roomCode]) {
      rooms[roomCode].players.push({ id: socket.id, name: playerName || "Lojtar i Ri", totalScore: 0, winStreak: 0 });
      socket.join(roomCode);
      socket.emit('joined_room', { roomCode, isHost: false, players: rooms[roomCode].players });
      io.to(roomCode).emit('update_players', rooms[roomCode].players);
    }
  });

  socket.on('spin_wheel', (roomCode) => {
    if (rooms[roomCode] && rooms[roomCode].host === socket.id) {
      const randomLetter = alfabeti[Math.floor(Math.random() * alfabeti.length)];
      rooms[roomCode].currentRound = { answers: [], submissions: 0 }; 
      rooms[roomCode].contests = {}; 
      
      io.to(roomCode).emit('wheel_spinning');
      setTimeout(() => io.to(roomCode).emit('wheel_stopped', randomLetter), 3000);
    }
  });

  socket.on('stop_game', (roomCode) => {
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
    
    if (!rooms[roomCode].contests[targetKey].includes(voterId)) {
      rooms[roomCode].contests[targetKey].push(voterId);
      io.to(roomCode).emit('update_contests', rooms[roomCode].contests);
      
      // Nëse arrihen 3 vota, rillogarit menjëherë pikët për të gjithë
      if (rooms[roomCode].contests[targetKey].length >= 3) {
        calculateScores(roomCode);
      }
    }
  });

  const calculateScores = (roomCode) => {
    const room = rooms[roomCode];
    const roundData = room.currentRound.answers;
    const categories = ['shtet', 'qytet', 'emer', 'send', 'ushqim', 'kafshe'];
    
    const frequencyMap = {};
    categories.forEach(cat => frequencyMap[cat] = {});

    roundData.forEach(player => {
      categories.forEach(cat => {
        const word = player.answers[cat]?.trim().toLowerCase();
        if (word) {
          const contestKey = `${player.id}_${cat}`;
          const votes = room.contests[contestKey] ? room.contests[contestKey].length : 0;
          // Shëno fjalën në hartë vetëm nëse nuk është djegur nga votat
          if (votes < 3) {
            frequencyMap[cat][word] = (frequencyMap[cat][word] || 0) + 1;
          }
        }
      });
    });

    let maxScore = -1;
    let winnerId = null;

    const results = roundData.map(player => {
      let roundScore = 0;
      const pointsBreakdown = {};

      categories.forEach(cat => {
        const word = player.answers[cat]?.trim().toLowerCase();
        const contestKey = `${player.id}_${cat}`;
        const votes = room.contests[contestKey] ? room.contests[contestKey].length : 0;
        
        let points = 0;
        if (!word || votes >= 3) {
          points = 0;
        } else if (frequencyMap[cat][word] === 1) {
          points = 10;
        } else {
          points = 5;
        }
        
        roundScore += points;
        pointsBreakdown[cat] = { word: player.answers[cat], points };
      });

      const roomPlayer = room.players.find(p => p.id === player.id);
      if (roomPlayer) {
          // Resetojmë totalScore para se të shtojmë roundScore e ri nëse është rillogaritje votimi
          // Por këtu po e mbajmë thjeshtë: pikët shtohen vetëm herën e parë të llogaritjes
          roomPlayer.lastRoundScore = roundScore;
      }

      if (roundScore > maxScore) { maxScore = roundScore; winnerId = player.id; }

      return { 
        id: player.id, 
        name: player.name, 
        pointsBreakdown, 
        roundScore, 
        totalScore: roomPlayer.totalScore + roundScore, 
        winStreak: roomPlayer.winStreak 
      };
    });

    // Përditëso Win Streaks vetëm kur mbyllet raundi realisht
    if (room.currentRound.submissions === room.players.length) {
        room.players.forEach(p => {
            if (p.id === winnerId && maxScore > 0) p.winStreak += 1;
            else p.winStreak = 0;
        });
    }

    io.to(roomCode).emit('results_ready', results);
  };
});

// Përdor procesin e portit të Render
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Serveri po punon në portin ${PORT}`));