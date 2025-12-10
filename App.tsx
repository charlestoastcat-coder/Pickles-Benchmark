
import React, { useState, useEffect, useRef, useCallback } from 'react';
import BenchmarkCanvas, { CanvasRef } from './components/BenchmarkCanvas';
import { TEST_DURATION_MS, MAX_PARTICLES } from './constants';

// --- Types ---
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface Body3D {
  pos: Vector3;
  vel: Vector3;
  mass: number;
  size: number;
}

interface DataPoint {
  time: number;
  fps: number;
  particles: number;
}

const App: React.FC = () => {
  // UI States
  const [timer, setTimer] = useState<number>(0);
  const [fps, setFps] = useState<number>(0);
  const [particleCount, setParticleCount] = useState<number>(0);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [showResults, setShowResults] = useState<boolean>(false);
  
  // Layout State
  const [windowSize, setWindowSize] = useState({ w: typeof window !== 'undefined' ? window.innerWidth : 1920, h: typeof window !== 'undefined' ? window.innerHeight : 1080 });

  // Benchmark Data
  const [history, setHistory] = useState<DataPoint[]>([]);
  const [finalScore, setFinalScore] = useState<number>(0);
  const [peakParticles, setPeakParticles] = useState<number>(0);
  const [avgFps, setAvgFps] = useState<number>(0);

  // Refs for performance
  const historyRef = useRef<DataPoint[]>([]);
  const bodiesRef = useRef<Body3D[]>([]);
  const canvasRefs = useRef<CanvasRef>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const totalCalcsRef = useRef<number>(0);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
        setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Physics Engine (The Stressor) ---
  const updatePhysics = (dt: number) => {
      const bodies = bodiesRef.current;
      const len = bodies.length;
      const G = 0.5; 
      let calcs = 0;

      // Dynamic striding to allow the UI to paint even under extreme load
      const stride = len > 8000 ? Math.ceil(len / 4000) : 1;

      for (let i = 0; i < len; i++) {
          const bodyA = bodies[i];

          // Center Attraction (Keep the swarm in the middle of the screen)
          const distFromCenterSq = bodyA.pos.x*bodyA.pos.x + bodyA.pos.y*bodyA.pos.y + bodyA.pos.z*bodyA.pos.z;
          const centerPull = 0.00001; 
          bodyA.vel.x -= bodyA.pos.x * centerPull;
          bodyA.vel.y -= bodyA.pos.y * centerPull;
          bodyA.vel.z -= bodyA.pos.z * centerPull;

          // Heavy N-Body Loop
          for (let j = i + 1; j < len; j+=stride) {
              const bodyB = bodies[j];

              const dx = bodyB.pos.x - bodyA.pos.x;
              const dy = bodyB.pos.y - bodyA.pos.y;
              const dz = bodyB.pos.z - bodyA.pos.z;
              
              const distSq = dx*dx + dy*dy + dz*dz + 100;
              const dist = Math.sqrt(distSq);
              const force = (G * bodyA.mass * bodyB.mass) / distSq;
              
              // TRANSCENDENTAL MATH LOAD
              const stress = Math.sin(dx * 0.01) * Math.cos(dy * 0.01) + Math.tan(dz * 0.001);

              const fx = (dx / dist) * force + (stress * 0.00001);
              const fy = (dy / dist) * force + (stress * 0.00001);
              const fz = (dz / dist) * force + (stress * 0.00001);

              bodyA.vel.x += fx / bodyA.mass;
              bodyA.vel.y += fy / bodyA.mass;
              bodyA.vel.z += fz / bodyA.mass;

              bodyB.vel.x -= fx / bodyB.mass;
              bodyB.vel.y -= fy / bodyB.mass;
              bodyB.vel.z -= fz / bodyB.mass;
              
              calcs++;
          }

          // Integration
          bodyA.pos.x += bodyA.vel.x * dt;
          bodyA.pos.y += bodyA.vel.y * dt;
          bodyA.pos.z += bodyA.vel.z * dt;
          
          // Soft Bounds (Bounce back if too far)
          if(Math.abs(bodyA.pos.x) > 4000) bodyA.vel.x *= -0.8;
          if(Math.abs(bodyA.pos.y) > 4000) bodyA.vel.y *= -0.8;
          if(Math.abs(bodyA.pos.z) > 4000) bodyA.vel.z *= -0.8;
      }
      return calcs;
  };

  const startBenchmark = useCallback(() => {
    if (isRunning) return;
    
    const { canvas, ctx } = canvasRefs.current || {};
    if (!canvas || !ctx) {
        console.error("Canvas context not ready");
        return;
    }

    setIsRunning(true);
    setShowResults(false);
    historyRef.current = [];
    bodiesRef.current = [];
    totalCalcsRef.current = 0;
    
    // Initial Population
    const addParticles = (count: number) => {
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * 400; // tighter start cluster
            bodiesRef.current.push({
                pos: { x: Math.cos(angle)*r, y: (Math.random()-0.5)*200, z: Math.sin(angle)*r },
                vel: { x: Math.sin(angle)*3, y: (Math.random()-0.5)*2, z: -Math.cos(angle)*3 },
                mass: Math.random() * 3 + 1,
                size: Math.random() * 4 + 2
            });
        }
    };
    addParticles(2500); 

    const startTime = Date.now();
    const endTime = startTime + TEST_DURATION_MS;
    let lastMetricTime = startTime;
    let frameCount = 0;

    const loop = () => {
        if (!canvasRefs.current?.ctx) {
             animationFrameIdRef.current = requestAnimationFrame(loop);
             return;
        }
        const ctx = canvasRefs.current.ctx;
        
        // Dynamic center point based on current window size
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const cx = width/2;
        const cy = height/2;

        const now = Date.now();
        const elapsed = now - startTime;
        
        // --- 1. Load Ramping Logic ---
        if (now > lastMetricTime + 500) {
            const currentFps = (frameCount * 1000) / (now - lastMetricTime);
            setFps(Math.round(currentFps));
            setTimer(parseFloat((elapsed/1000).toFixed(1)));
            setProgress((elapsed / TEST_DURATION_MS) * 100);
            setParticleCount(bodiesRef.current.length);
            
            historyRef.current.push({
                time: elapsed / 1000,
                fps: currentFps,
                particles: bodiesRef.current.length
            });

            const rampAmount = currentFps > 45 ? 1000 : (currentFps < 15 ? 100 : 400);
            addParticles(rampAmount);

            lastMetricTime = now;
            frameCount = 0;
        }

        if (now >= endTime) {
            finish();
            return;
        }

        frameCount++;

        // --- 2. Physics ---
        const calcs = updatePhysics(0.5);
        totalCalcsRef.current += calcs;

        // --- 3. Render ---
        // Trail effect - Dark Green/Black
        ctx.fillStyle = 'rgba(2, 8, 4, 0.25)'; 
        ctx.fillRect(0, 0, width, height);

        // Cool "Energy" Blending
        ctx.globalCompositeOperation = 'lighter';
        
        const bodies = bodiesRef.current;
        const len = bodies.length;
        
        // Dynamic Heat Color: Lime -> Yellow -> Red
        const stressLevel = Math.min(1, len / 20000);
        
        // Base Lime
        let r = 132, g = 204, b = 22; 
        
        if (stressLevel > 0.6) {
             // Red/Orange shift
             r = 239 + (Math.sin(now * 0.01) * 20); 
             g = 68; 
             b = 68; 
        } else if (stressLevel > 0.3) {
             // Yellow shift
             r = 234; g = 179; b = 8;
        }

        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.8)`;
        ctx.beginPath();

        for(let i=0; i<len; i++) {
            const b = bodies[i];
            // 3D Projection
            const scale = 600 / (600 + b.pos.z + 1000);
            
            if (scale < 0.05) continue; 

            const x = b.pos.x * scale + cx;
            const y = b.pos.y * scale + cy;
            const s = b.size * scale;
            
            if (x < -100 || x > width+100 || y < -100 || y > height+100) continue;

            // DRAW PICKLE (Ellipse aligned with velocity)
            const angle = Math.atan2(b.vel.y, b.vel.x);
            
            ctx.moveTo(x, y);
            // x, y, radiusX, radiusY, rotation, startAngle, endAngle
            ctx.ellipse(x, y, s * 1.5, s * 0.6, angle, 0, Math.PI * 2);
        }
        ctx.fill();

        ctx.globalCompositeOperation = 'source-over';
        animationFrameIdRef.current = requestAnimationFrame(loop);
    };

    animationFrameIdRef.current = requestAnimationFrame(loop);
  }, [isRunning]);

  const finish = useCallback(() => {
     if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
     setIsRunning(false);
     setShowResults(true);
     
     const data = historyRef.current;
     const avg = data.length > 0 ? data.reduce((acc, curr) => acc + curr.fps, 0) / data.length : 0;
     const peak = bodiesRef.current.length;
     const score = Math.floor((totalCalcsRef.current / 100000) * (avg / 60));

     setHistory(data);
     setAvgFps(Math.round(avg));
     setPeakParticles(peak);
     setFinalScore(score);
  }, []);

  // --- Graph Component ---
  const Graph = ({ data }: { data: DataPoint[] }) => {
      if (!data || data.length < 2) return <div className="text-center text-slate-500 py-8">Insufficient Data</div>;
      
      const width = 600;
      const height = 200;
      const pad = 30;
      
      const maxFps = 65; 
      const maxParticles = Math.max(...data.map(d => d.particles));
      const endTime = data[data.length-1].time;

      const getX = (t: number) => pad + (t / endTime) * (width - pad*2);
      const getYFps = (f: number) => height - pad - (f / maxFps) * (height - pad*2);
      const getYLoad = (p: number) => height - pad - (p / maxParticles) * (height - pad*2);
      
      let fpsPath = `M ${getX(data[0].time)} ${getYFps(data[0].fps)}`;
      let loadPath = `M ${getX(data[0].time)} ${height-pad}`;
      
      data.forEach(d => {
          fpsPath += ` L ${getX(d.time)} ${getYFps(d.fps)}`;
          loadPath += ` L ${getX(d.time)} ${getYLoad(d.particles)}`;
      });
      loadPath += ` L ${getX(endTime)} ${height-pad} Z`;

      return (
          <div className="w-full bg-slate-900/50 rounded-xl p-4 border border-slate-700/50">
              <h3 className="text-white/70 text-xs font-mono uppercase tracking-widest mb-4">Performance Profile</h3>
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
                  {/* Grid */}
                  <line x1={pad} y1={getYFps(60)} x2={width-pad} y2={getYFps(60)} stroke="#1e293b" strokeDasharray="4" />
                  <line x1={pad} y1={getYFps(30)} x2={width-pad} y2={getYFps(30)} stroke="#1e293b" strokeDasharray="4" />
                  
                  {/* Load Fill */}
                  <path d={loadPath} fill="url(#loadGradient)" stroke="none" />
                  <defs>
                      <linearGradient id="loadGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(132, 204, 22, 0.3)" />
                          <stop offset="100%" stopColor="rgba(132, 204, 22, 0)" />
                      </linearGradient>
                  </defs>

                  {/* Lines */}
                  <path d={fpsPath} fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  
                  {/* Labels */}
                  <text x={width-pad+5} y={getYFps(data[data.length-1].fps)} fill="#ef4444" fontSize="10" fontFamily="monospace" alignmentBaseline="middle">FPS</text>
                  <text x={pad} y={height} fill="#64748b" fontSize="10" dy="10">0s</text>
                  <text x={width-pad} y={height} fill="#64748b" fontSize="10" textAnchor="end" dy="10">{Math.round(endTime)}s</text>
              </svg>
          </div>
      );
  };

  return (
    <>
      <div className="absolute inset-0 bg-black z-0 overflow-hidden">
           {/* Pickle Grid */}
           <div className="absolute inset-0 opacity-20" 
                style={{ 
                    backgroundImage: 'linear-gradient(#14532d 1px, transparent 1px), linear-gradient(90deg, #14532d 1px, transparent 1px)', 
                    backgroundSize: '40px 40px' 
                }}>
           </div>
           
           {/* Vignette */}
           <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.8)_100%)]"></div>
      </div>

      {/* Canvas Layer - Centered and Dynamic */}
      <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
        <BenchmarkCanvas ref={canvasRefs} width={windowSize.w} height={windowSize.h} />
      </div>
      
      {/* HUD Layer - Top Level */}
      <div className="absolute inset-0 pointer-events-none z-20 flex flex-col p-6 font-sans select-none">
         
         {/* Header */}
         <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_currentColor] transition-colors duration-500 ${isRunning ? 'bg-red-500 text-red-500 animate-pulse' : 'bg-lime-500 text-lime-500'}`}></div>
                <h1 className="text-2xl font-bold tracking-tight text-white">PICKLES<span className="font-light text-lime-500">BENCHMARK</span></h1>
            </div>
            <div className="bg-black/60 backdrop-blur border border-lime-900/50 px-4 py-2 rounded-lg transition-all">
                <span className={`font-mono text-sm ${isRunning ? 'text-red-400' : 'text-lime-500'}`}>
                    {isRunning ? `T+${timer.toFixed(1)}s` : 'PICKLES READY'}
                </span>
            </div>
         </div>

         {/* Results Screen - Scrollable */}
         {showResults && (
             <div className="flex-1 flex items-center justify-center pointer-events-auto z-50 p-4">
                 <div className="bg-black/90 backdrop-blur-xl border border-lime-900 rounded-2xl shadow-2xl max-w-3xl w-full animate-in fade-in slide-in-from-bottom-4 duration-500 shadow-lime-900/20 flex flex-col max-h-[85vh]">
                     {/* Scrollable Content Area */}
                     <div className="overflow-y-auto p-8 custom-scrollbar">
                         <div className="flex flex-col md:flex-row justify-between items-end mb-8 border-b border-gray-800 pb-6">
                             <div>
                                 <div className="text-gray-400 text-xs font-mono uppercase tracking-widest mb-2">Pickle Score</div>
                                 <div className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-lime-400 to-emerald-200 tracking-tighter filter drop-shadow-lg">
                                     {finalScore.toLocaleString()}
                                 </div>
                             </div>
                             <div className="text-right mt-4 md:mt-0">
                                 <div className="text-gray-500 text-sm">Peak Pickles</div>
                                 <div className="text-2xl font-bold text-white">{peakParticles.toLocaleString()}</div>
                             </div>
                         </div>

                         <Graph data={history} />

                         <div className="grid grid-cols-2 gap-4 mt-6 mb-8">
                             <div className="bg-gray-900 p-4 rounded border border-gray-800">
                                 <div className="text-xs text-gray-500 uppercase">Avg Frame Rate</div>
                                 <div className="text-lg font-bold text-white">{avgFps} <span className="text-sm font-normal text-gray-500">FPS</span></div>
                             </div>
                             <div className="bg-gray-900 p-4 rounded border border-gray-800">
                                 <div className="text-xs text-gray-500 uppercase">Crunch Power</div>
                                 <div className="text-lg font-bold text-lime-400">{(totalCalcsRef.current / 1000000).toFixed(1)}M</div>
                             </div>
                         </div>
                     </div>
                     
                     {/* Footer Button (Fixed) */}
                     <div className="p-6 border-t border-gray-800 flex justify-center bg-black/50 rounded-b-2xl">
                         <button 
                            onClick={startBenchmark}
                            className="bg-lime-600 hover:bg-lime-500 text-black font-bold py-3 px-12 rounded-lg transition-all transform hover:scale-105"
                         >
                            Bench Again
                         </button>
                     </div>
                 </div>
             </div>
         )}

         {/* Start Screen */}
         {!isRunning && !showResults && (
             <div className="flex-1 flex items-center justify-center pointer-events-auto">
                 <div className="text-center max-w-lg">
                     <div className="mb-8">
                         <div className="inline-block bg-lime-500/10 text-lime-400 text-xs font-bold px-3 py-1 rounded-full mb-4 border border-lime-500/20">
                             V3.0 BENCHMARK
                         </div>
                         <h2 className="text-4xl font-bold text-white mb-4">Pickles Extreme Test</h2>
                         <p className="text-gray-400 leading-relaxed">
                             This benchmark uses an <span className="text-lime-200">unbounded N-Body gravity simulation</span> to push your CPU until it turns into a pickle.
                             Linear ramping load.
                         </p>
                     </div>
                     <button 
                        onClick={startBenchmark}
                        className="group relative bg-lime-600 hover:bg-lime-500 text-white font-semibold text-lg py-5 px-16 rounded-full shadow-[0_0_50px_rgba(101,163,13,0.4)] transition-all hover:scale-105 active:scale-95 overflow-hidden"
                     >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg] translate-x-[-150%] group-hover:translate-x-[150%] transition-transform duration-700 ease-in-out"></div>
                        <span>Run Benchmark</span>
                     </button>
                 </div>
             </div>
         )}

         {/* Telemetry Footer */}
         <div className="mt-auto transition-opacity duration-500" style={{ opacity: isRunning ? 1 : 0.5 }}>
             {isRunning && (
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                     <div className="bg-black/60 backdrop-blur border border-lime-900/30 p-4 rounded-xl border-l-4 border-l-red-500">
                         <div className="text-[10px] text-gray-500 uppercase font-mono mb-1">FPS</div>
                         <div className={`text-3xl font-mono font-bold ${fps < 20 ? 'text-red-500' : 'text-white'}`}>
                             {fps}
                         </div>
                     </div>
                     <div className="bg-black/60 backdrop-blur border border-lime-900/30 p-4 rounded-xl border-l-4 border-l-lime-500">
                         <div className="text-[10px] text-gray-500 uppercase font-mono mb-1">Pickles</div>
                         <div className="text-3xl font-mono font-bold text-lime-400">
                             {particleCount.toLocaleString()}
                         </div>
                     </div>
                     <div className="bg-black/60 backdrop-blur border border-lime-900/30 p-4 rounded-xl hidden md:block">
                         <div className="text-[10px] text-gray-500 uppercase font-mono mb-1">Interactions</div>
                         <div className="text-xl font-mono text-gray-300 truncate">
                             {(Math.pow(particleCount, 2)/1000000).toFixed(2)}M
                         </div>
                     </div>
                     <div className="bg-black/60 backdrop-blur border border-lime-900/30 p-4 rounded-xl flex flex-col justify-end">
                         <div className="text-[10px] text-gray-500 uppercase font-mono mb-2 flex justify-between">
                             <span>Progress</span>
                             <span>{Math.round(progress)}%</span>
                         </div>
                         <div className="w-full bg-gray-800 h-2 rounded-full overflow-hidden">
                             <div className="bg-gradient-to-r from-lime-600 to-lime-400 h-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }}></div>
                         </div>
                     </div>
                 </div>
             )}
         </div>

      </div>
    </>
  );
};

export default App;
