import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import { Crown } from 'lucide-react';

const socket = io.connect("http://localhost:3001");

export default function App() {
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState(""); 
  const [room, setRoom] = useState("");
  const [players, setPlayers] = useState([]);
  const [gameState, setGameState] = useState("menu"); 
  const [letter, setLetter] = useState("?");
  const [isSpinning, setIsSpinning] = useState(false);
  const [isFrozen, setIsFrozen] = useState(false);
  const [results, setResults] = useState([]);
  const [contests, setContests] = useState({});
  const [isRipping, setIsRipping] = useState(false);

  const [formData, setFormData] = useState({ shtet: "", qytet: "", emer: "", send: "", ushqim: "", kafshe: "" });
  const formDataRef = useRef(formData);
  useEffect(() => { formDataRef.current = formData; }, [formData]);

  const playSound = (type) => {
    try {
      const audio = new Audio(`/${type}.mp3`);
      audio.play().catch(() => {}); 
    } catch(e) {}
  };

  const handleInputChange = (field, value) => {
    if (isFrozen) return; 
    
    const val = value.trimStart();
    if (val.length > 0) {
      const lowerVal = val.toLowerCase();
      const lowerLetter = letter.toLowerCase();

      if (lowerLetter.length === 2) {
        if (val.length === 1 && lowerVal !== lowerLetter[0]) return;
        if (val.length >= 2 && lowerVal.substring(0, 2) !== lowerLetter) return;
      } else {
        if (lowerVal[0] !== lowerLetter) return;
      }
    }
    setFormData({ ...formData, [field]: value });
  };

  useEffect(() => {
    socket.on("room_created", (data) => { setRoom(data.roomCode); setPlayers(data.players); setGameState("lobby"); });
    socket.on("joined_room", (data) => { setRoom(data.roomCode); setPlayers(data.players); setGameState("lobby"); });
    socket.on("update_players", (data) => setPlayers(data));
    
    socket.on("wheel_spinning", () => {
      playSound('spin');
      setIsSpinning(true);
      setGameState("lobby");
    });

    socket.on("wheel_stopped", (randomLetter) => {
      setIsSpinning(false);
      setLetter(randomLetter);
      setIsFrozen(false);
      setFormData({ shtet: "", qytet: "", emer: "", send: "", ushqim: "", kafshe: "" });
      setGameState("playing");
    });

    socket.on("freeze_inputs", () => {
      setIsFrozen(true);
      socket.emit("submit_answers", { roomCode: room, answers: formDataRef.current, playerName });
    });

    socket.on("update_contests", (data) => setContests(data));

    socket.on("results_ready", (roundResults) => {
      playSound('rip');
      setIsRipping(true);
      setTimeout(() => {
        setResults(roundResults);
        setGameState("results");
        setIsRipping(false);
      }, 1000);
    });

    return () => socket.removeAllListeners();
  }, [room, playerName, players]);

  const handleStop = () => {
    playSound('stop');
    socket.emit("stop_game", room);
  };

  return (
    <div className="min-h-screen text-blue-900 px-4 py-8 max-w-lg mx-auto pl-16">
      
      {/* Vrimat e Fletores */}
      <div className="fixed left-2 top-0 bottom-0 flex flex-col justify-around py-10 z-50 pointer-events-none">
        {[...Array(12)].map((_, i) => (
           <div key={i} className="w-6 h-6 bg-slate-200 rounded-full border-2 border-slate-300 shadow-[inset_2px_2px_4px_rgba(0,0,0,0.2)]" />
        ))}
      </div>

      <AnimatePresence>
        {isRipping && (
          <div className="fixed inset-0 z-50 flex pointer-events-none">
            <motion.div initial={{ x: 0 }} animate={{ x: "-100%", rotate: -5 }} transition={{ duration: 0.8 }} className="w-1/2 h-full bg-[#fdfcf0] border-r-4 border-dashed border-slate-300" />
            <motion.div initial={{ x: 0 }} animate={{ x: "100%", rotate: 5 }} transition={{ duration: 0.8 }} className="w-1/2 h-full bg-[#fdfcf0] border-l-4 border-dashed border-slate-300" />
          </div>
        )}
      </AnimatePresence>

      {/* MENU */}
      {gameState === "menu" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-10 flex flex-col gap-6 w-full max-w-sm mx-auto">
          <h1 className="text-5xl md:text-6xl font-marker text-center mb-8 rotate-[-2deg]">Shtet-Qytet</h1>
          
          <input 
            placeholder="Kush je ti?" 
            className="hand-drawn font-sans text-2xl font-black p-4 w-full outline-none text-center placeholder:text-blue-900/40 bg-white/50"
            value={playerName} onChange={(e) => setPlayerName(e.target.value)}
          />
          
          <button onClick={() => socket.emit("create_room", playerName)} className="hand-drawn font-sans text-xl font-black p-4 hover:bg-blue-100 transition-colors bg-white">
            Krijo Fletoren (Host)
          </button>

          <div className="flex items-center gap-2 mt-4">
            <input 
              placeholder="KODI" 
              maxLength="6"
              className="hand-drawn font-sans text-2xl font-black p-4 w-1/2 outline-none text-center uppercase bg-white/50"
              value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
            />
            <button onClick={() => socket.emit("join_room", { roomCode: joinCode.toUpperCase(), playerName })} className="hand-drawn font-sans text-lg font-black p-4 w-1/2 hover:bg-emerald-100 transition-colors bg-emerald-50 text-emerald-900 border-emerald-900">
              Bashkohu
            </button>
          </div>
        </motion.div>
      )}

      {/* LOBBY */}
      {gameState === "lobby" && (
        <div className="flex flex-col items-center gap-10 mt-10">
          <div className="text-center bg-white/60 p-6 hand-drawn w-full max-w-sm">
             <p className="text-xl font-bold font-sans uppercase text-slate-500 mb-2">Kodi i Dhomës:</p>
             <p className="font-sans font-black text-5xl text-red-600 tracking-widest">{room}</p>
          </div>
          
          <motion.div animate={{ rotate: isSpinning ? 1800 : 0 }} transition={{ duration: 3, ease: "circOut" }} className="w-40 h-40 border-4 border-blue-900 rounded-full flex items-center justify-center relative bg-white">
            <div className="absolute -top-4 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[20px] border-t-red-600" />
            <span className="font-marker text-7xl">{letter}</span>
          </motion.div>

          {players.find(p => p.id === socket.id)?.id === players[0]?.id ? (
            <button disabled={isSpinning} onClick={() => socket.emit("spin_wheel", room)} className="hand-drawn font-sans text-2xl font-black px-8 py-4 bg-white hover:bg-blue-50 w-full max-w-sm">
              {isSpinning ? "Po rrotullohet..." : "Nis Raundin"}
            </button>
          ) : (
             <p className="font-sans font-bold text-slate-500 animate-pulse">Në pritje të Hostit...</p>
          )}
        </div>
      )}

      {/* PLAYING */}
      {gameState === "playing" && (
        <div className="flex flex-col gap-5 relative">
          
          <div className="flex justify-between items-center mb-4 bg-white/50 p-4 hand-drawn">
            <span className="font-marker text-6xl text-blue-900">{letter}</span>
            <button onClick={handleStop} disabled={isFrozen} className="teacher-circle text-red-600 font-marker text-3xl px-8 py-3 rotate-6 active:scale-90 bg-white shadow-lg">
              STOP!
            </button>
          </div>

          {Object.keys(formData).map(f => (
            <div key={f} className="flex flex-col mb-2">
              <label className="font-sans text-sm font-black uppercase text-slate-500 mb-1 ml-2">{f}</label>
              <input 
                disabled={isFrozen}
                value={formData[f]}
                onChange={(e) => handleInputChange(f, e.target.value)}
                className="hand-drawn font-sans text-2xl font-bold p-3 outline-none bg-white/60 focus:bg-white transition-colors capitalize"
              />
            </div>
          ))}
        </div>
      )}

      {/* RESULTS */}
      {gameState === "results" && (
        <div className="flex flex-col gap-6 pb-10 relative">
          
          {results[0]?.id === socket.id && <Confetti recycle={false} numberOfPieces={200} colors={['#1e40af', '#dc2626', '#fbbf24']} />}

          <div className="text-center bg-white/50 hand-drawn py-4 mb-4">
             <h2 className="font-marker text-4xl text-red-600">Nota Finale</h2>
          </div>

          {results.map((p, idx) => (
            <div key={p.id} className="hand-drawn p-4 relative bg-white/70">
              
              <div className="flex items-center gap-4 mb-4 border-b-2 border-slate-300 pb-4">
                <img src={`https://api.dicebear.com/7.x/croodles/svg?seed=${p.name}`} className="w-16 h-16 rounded-full border-2 border-blue-900 bg-white" />
                <div className="flex-1">
                   <div className="flex items-center gap-2">
                      <h3 className="font-sans text-xl font-black uppercase">{p.name}</h3>
                      {p.winStreak >= 2 && <span className="flex items-center text-yellow-600 font-bold bg-yellow-100 px-2 py-1 rounded-full text-xs"><Crown size={14}/> x{p.winStreak}</span>}
                   </div>
                   <p className="font-sans font-bold text-slate-600">Total: {p.totalScore}</p>
                </div>
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.5 + (idx * 0.2) }} className="teacher-circle w-16 h-16 flex items-center justify-center rotate-[-10deg] bg-white">
                   <span className="text-red-600 font-marker text-2xl">+{p.roundScore}</span>
                </motion.div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {Object.entries(p.pointsBreakdown).map(([cat, data]) => {
                  const key = `${p.id}_${cat}`;
                  const votes = contests[key]?.length || 0;
                  const isFake = votes >= 3;

                  return (
                    <div 
                      key={cat} 
                      onClick={() => p.id !== socket.id && socket.emit("vote_contest", { roomCode: room, targetKey: key, voterId: socket.id })}
                      className="cursor-pointer relative bg-white/50 p-2 rounded-lg border border-slate-200"
                    >
                      <span className="font-sans text-[10px] font-black text-slate-400 uppercase block">{cat}</span>
                      <span className={`font-sans font-bold text-lg ${isFake ? 'text-red-600 line-through' : 'text-blue-900'}`}>
                        {data.word || "—"}
                      </span>
                      {votes > 0 && <span className="absolute -top-2 -right-2 bg-red-600 text-white font-sans text-xs font-black w-5 h-5 flex items-center justify-center rounded-full animate-bounce shadow-md">{votes}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          
          <button onClick={() => setGameState("lobby")} className="hand-drawn font-sans font-black text-xl py-4 mt-4 bg-white hover:bg-blue-50 uppercase">
            Raundi Tjetër
          </button>
        </div>
      )}
    </div>
  );
}