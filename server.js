const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname)));

// In-memory state (easy demo). For production, use persistent store.
let questions = [
  { id: 1, text: 'What is 2 + 2?', choices: ['2','3','4','5'], answer: 2 },
  { id: 2, text: 'Capital of France?', choices: ['London','Paris','Rome','Berlin'], answer: 1 },
  { id: 3, text: 'Which is a JS runtime?', choices: ['React','Node.js','Vue','Angular'], answer: 1 }
];

let currentIndex = 0; // which question is live
let participants = {}; // socketId -> {name, score, answers: {qId: choice}}

io.on('connection', (socket) => {
  console.log('conn', socket.id);

  socket.on('join', (payload) => {
    // payload: {role: 'host'|'player', name}
    if (payload.role === 'host') {
      socket.join('hosts');
      // send full state
      socket.emit('state', { questions, currentIndex, participants });
    } else {
      participants[socket.id] = { name: payload.name || 'Anonymous', score: 0, answers: {} };
      socket.join('players');
      // send participant id
      socket.emit('joined', { id: socket.id });
      // send current question
      socket.emit('question', { index: currentIndex, question: publicQuestion(questions[currentIndex]) });
      // update hosts
      io.to('hosts').emit('state', { questions, currentIndex, participants });
    }
  });

  socket.on('answer', (data) => {
    // data: {index, choice}
    const p = participants[socket.id];
    if (!p) return;
    const q = questions[data.index];
    if (!q) return;
    if (p.answers[q.id] != null) return; // already answered
    p.answers[q.id] = data.choice;
    if (data.choice === q.answer) {
      p.score += 1;
    }
    // notify hosts of live update
    io.to('hosts').emit('state', { questions, currentIndex, participants });
  });

  socket.on('next', () => {
    // host triggered next question
    currentIndex = Math.min(questions.length - 1, currentIndex + 1);
    io.to('players').emit('question', { index: currentIndex, question: publicQuestion(questions[currentIndex]) });
    io.to('hosts').emit('state', { questions, currentIndex, participants });
  });

  socket.on('prev', () => {
    currentIndex = Math.max(0, currentIndex - 1);
    io.to('players').emit('question', { index: currentIndex, question: publicQuestion(questions[currentIndex]) });
    io.to('hosts').emit('state', { questions, currentIndex, participants });
  });

  socket.on('disconnect', () => {
    if (participants[socket.id]) {
      delete participants[socket.id];
      io.to('hosts').emit('state', { questions, currentIndex, participants });
    }
  });
});

function publicQuestion(q) {
  if (!q) return null;
  return { id: q.id, text: q.text, choices: q.choices.map((c, i) => ({ i, text: c })) };
}

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
