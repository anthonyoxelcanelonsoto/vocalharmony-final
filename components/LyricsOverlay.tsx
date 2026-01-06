
import React, { useState, useRef, useEffect } from 'react';
import { FileText, Mic2, Music4 } from 'lucide-react';
import { LyricLine } from '../types';

interface LyricsOverlayProps {
    currentTime: number;
    isVisible: boolean;
    isPlaying: boolean;
    importedLyrics?: LyricLine[];
    importedChords?: LyricLine[];
}

interface Sparkle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    color: string;
    size: number;
}

export const LyricsOverlay: React.FC<LyricsOverlayProps> = ({ currentTime, isVisible, isPlaying, importedLyrics, importedChords }) => {
    const [viewStyle, setViewStyle] = useState<'KARAOKE' | 'READER' | 'CHORDS'>('KARAOKE');
    const scrollRef = useRef<HTMLDivElement>(null);
    const chordsRef = useRef<HTMLDivElement>(null);

    // Sparkle Effect Refs
    // Sparkle Effect Refs
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const sparklesRef = useRef<Sparkle[]>([]);
    const rafRef = useRef<number | undefined>(undefined);

    // Determine active data source
    const activeData = viewStyle === 'CHORDS' ? (importedChords || []) : (importedLyrics || []);

    // Fallback if empty
    const displayLines = activeData.length > 0 ? activeData : [
        { time: 0, text: viewStyle === 'CHORDS' ? "Import 'chord' .lrc file" : "Import .lrc file to see lyrics" },
        { time: 9999, text: "..." }
    ];

    // Find current active line index (Polyfill for findLastIndex)
    const activeIndex = (() => {
        for (let i = displayLines.length - 1; i >= 0; i--) {
            if (displayLines[i].time <= currentTime) return i;
        }
        return -1;
    })();

    // Auto-scroll logic
    useEffect(() => {
        if (!isVisible) return;

        // Ref depends on mode
        const ref = viewStyle === 'CHORDS' ? chordsRef : scrollRef;

        if ((viewStyle === 'KARAOKE' || viewStyle === 'CHORDS') && ref.current && activeIndex !== -1) {
            const activeEl = ref.current.children[activeIndex] as HTMLElement;
            if (activeEl) {
                const container = ref.current;
                const containerHeight = container.clientHeight;
                const elTop = activeEl.offsetTop;
                const elHeight = activeEl.offsetHeight;

                // Center the active element
                const targetScroll = elTop - (containerHeight / 2) + (elHeight / 2);

                container.scrollTo({
                    top: targetScroll,
                    behavior: 'smooth'
                });
            }
        }
    }, [activeIndex, viewStyle, isVisible]);

    // --- SPARKLE EFFECT SPAWNER ---
    useEffect(() => {
        if (viewStyle !== 'CHORDS' || !isVisible || activeIndex === -1) return;

        // Don't sparkle for placeholder text
        if (displayLines[0]?.text.includes("Import")) return;

        const canvas = canvasRef.current;
        if (canvas) {
            // Ensure canvas size matches display
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width;
            canvas.height = rect.height;

            const centerX = rect.width / 2;
            const centerY = rect.height / 2;

            // Magic colors: Cyan, White, Gold, Electric Blue
            const colors = ['#22d3ee', '#cffafe', '#ffffff', '#fcd34d', '#60a5fa'];

            // Spawn burst
            const particleCount = 40;
            for (let i = 0; i < particleCount; i++) {
                const angle = Math.random() * Math.PI * 2;
                // Random speed for explosive effect
                const speed = Math.random() * 8 + 3;

                sparklesRef.current.push({
                    x: centerX,
                    y: centerY,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    life: 1.0 + Math.random() * 0.5, // Random life between 1.0 and 1.5
                    color: colors[Math.floor(Math.random() * colors.length)],
                    size: Math.random() * 3 + 1
                });
            }
        }
    }, [activeIndex, viewStyle, isVisible, displayLines]);

    // --- SPARKLE ANIMATION LOOP ---
    useEffect(() => {
        if (viewStyle !== 'CHORDS') {
            sparklesRef.current = []; // Clear particles if not in chord mode
            return;
        }

        const animate = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // Handle resizing gracefully
            if (canvas.width !== canvas.offsetWidth || canvas.height !== canvas.offsetHeight) {
                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.globalCompositeOperation = 'lighter'; // Additive blending for "magic" glow

            const newSparkles: Sparkle[] = [];

            sparklesRef.current.forEach(p => {
                p.x += p.vx;
                p.y += p.vy;
                p.vx *= 0.92; // Friction
                p.vy *= 0.92; // Friction
                p.vy += 0.15; // Gravity
                p.life -= 0.02; // Fade out

                if (p.life > 0) {
                    ctx.globalAlpha = Math.min(p.life, 1);
                    ctx.fillStyle = p.color;

                    // Draw sparkle
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
                    ctx.fill();

                    // Add a glow ring
                    ctx.beginPath();
                    ctx.strokeStyle = p.color;
                    ctx.lineWidth = 0.5;
                    ctx.arc(p.x, p.y, (p.size * 2) * (2 - p.life), 0, Math.PI * 2); // Expands as it dies
                    ctx.stroke();

                    newSparkles.push(p);
                }
            });

            sparklesRef.current = newSparkles;
            rafRef.current = requestAnimationFrame(animate);
        };

        animate();
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [viewStyle]);

    const toggleMode = () => {
        if (viewStyle === 'KARAOKE') setViewStyle('READER');
        else if (viewStyle === 'READER') setViewStyle('CHORDS');
        else setViewStyle('KARAOKE');
    };

    if (!isVisible) return null;

    return (
        <div className="absolute inset-x-0 bottom-0 h-[45%] z-20 flex flex-col justify-end pb-safe pointer-events-none">
            {/* Gradient Fade to blend with visualizer */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent" />

            {/* Controls Bar (Floating) */}
            <div className="absolute top-0 right-4 flex gap-2 z-30 pointer-events-auto">
                <button
                    onClick={toggleMode}
                    className={`p-2 rounded-full backdrop-blur border shadow-lg transition-all 
                        ${viewStyle === 'KARAOKE' ? 'bg-slate-800/80 text-slate-400 border-slate-600' : ''}
                        ${viewStyle === 'READER' ? 'bg-orange-500 text-black border-orange-400' : ''}
                        ${viewStyle === 'CHORDS' ? 'bg-cyan-400 text-black border-cyan-300' : ''}
                    `}
                    title="Switch View Mode"
                >
                    {viewStyle === 'KARAOKE' && <Mic2 size={16} />}
                    {viewStyle === 'READER' && <FileText size={16} />}
                    {viewStyle === 'CHORDS' && <Music4 size={16} />}
                </button>
            </div>

            {/* CONTENT AREA */}
            <div className="pointer-events-auto w-full h-full relative">

                {/* SPARKLE CANVAS (Chords Mode) */}
                {viewStyle === 'CHORDS' && (
                    <canvas
                        ref={canvasRef}
                        className="absolute inset-0 w-full h-full pointer-events-none z-10"
                    />
                )}

                {viewStyle === 'KARAOKE' && (
                    <div
                        ref={scrollRef}
                        className="relative w-full h-full overflow-y-auto no-scrollbar px-6 flex flex-col items-center gap-4 transition-all duration-500 pb-32 pt-10"
                        style={{ maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)' }}
                    >
                        {displayLines.map((line, idx) => {
                            const isActive = idx === activeIndex;
                            const isFuture = idx > activeIndex;

                            return (
                                <div
                                    key={idx}
                                    className={`text-center transition-all duration-500 ease-out max-w-md cursor-pointer
                                    ${isActive ? 'scale-110 text-white font-bold drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]' : 'scale-95 text-slate-600 font-medium'}
                                    ${isFuture ? 'text-slate-700 blur-[0.5px]' : ''}
                                `}
                                >
                                    <p className={`leading-tight transition-all duration-300 ${isActive ? 'text-2xl' : 'text-xl'}`}>
                                        {line.text}
                                    </p>
                                </div>
                            );
                        })}
                        <div className="h-24 shrink-0" />
                    </div>
                )}

                {viewStyle === 'READER' && (
                    <div className="relative w-full h-full overflow-y-auto no-scrollbar px-6 pb-20 pt-10 overscroll-contain">
                        <div className="max-w-lg mx-auto bg-slate-900/40 p-6 rounded-2xl border border-slate-800/50 backdrop-blur-sm shadow-xl">
                            <h4 className="text-orange-500 font-bold text-xs mb-6 tracking-[0.2em] uppercase border-b border-orange-500/20 pb-3 text-center">Lyrics Sheet</h4>
                            <div className="whitespace-pre-wrap text-slate-300 text-lg leading-loose font-medium select-text">
                                {displayLines.map(l => l.text).join('\n')}
                            </div>
                            <div className="h-12 w-full"></div>
                        </div>
                    </div>
                )}

                {viewStyle === 'CHORDS' && (
                    <div
                        ref={chordsRef}
                        className="relative w-full h-full overflow-y-auto no-scrollbar px-2 flex flex-col items-center gap-20 transition-all duration-300 pb-32 pt-20"
                        style={{ maskImage: 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)' }}
                    >
                        {displayLines.map((line, idx) => {
                            const isActive = idx === activeIndex;

                            return (
                                <div
                                    key={idx}
                                    className={`text-center transition-all duration-300 ease-out w-full
                                    ${isActive ? 'opacity-100 scale-125 z-20' : 'opacity-40 scale-100 blur-[1px]'}
                                `}
                                >
                                    <p className={`font-mono font-black tracking-tighter transition-all duration-200 text-6xl md:text-7xl
                                     ${isActive ? 'text-cyan-400 drop-shadow-[0_0_30px_rgba(34,211,238,0.8)]' : 'text-slate-600'}
                                `}>
                                        {line.text}
                                    </p>
                                </div>
                            );
                        })}
                        <div className="h-32 shrink-0" />
                    </div>
                )}
            </div>
        </div>
    );
};
