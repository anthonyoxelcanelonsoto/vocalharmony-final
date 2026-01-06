import React, { useRef, useEffect, useState } from 'react';
import { Track } from '../types';
import { Play, Pause, Volume2, Mic, Activity, Clock, MoveHorizontal, SkipBack, SkipForward } from 'lucide-react';
import { formatTime } from '../utils';

interface MultitrackViewProps {
    tracks: Track[];
    audioBuffers: { [id: number]: AudioBuffer };
    currentTime: number;
    isPlaying: boolean;
    duration: number;
    onSeek: (time: number) => void;
    onTogglePlay: () => void;
    onUpdateTrackOffset: (trackId: number, newOffset: number) => void;
    onUpdateTrackVolume: (trackId: number, vol: number) => void;
    onUpdateTrackPan: (trackId: number, pan: number) => void;
    onToggleMute: (trackId: number) => void;
    onToggleSolo: (trackId: number) => void;
    onTrackSelect: (trackId: number) => void;
    onDragEnd?: () => void;
    selectedTrackId: number;
    loopStart: number | null;
    loopEnd: number | null;
    onSetLoopStart: (time: number | null) => void;
    onSetLoopEnd: (time: number | null) => void;
}

export const MultitrackView: React.FC<MultitrackViewProps> = ({
    tracks,
    audioBuffers,
    currentTime,
    isPlaying,
    duration,
    onSeek,
    onTogglePlay,
    onUpdateTrackOffset,
    onUpdateTrackVolume,
    onUpdateTrackPan,
    onToggleMute,
    onToggleSolo,
    onTrackSelect,
    onDragEnd,
    selectedTrackId,
    loopStart,
    loopEnd,
    onSetLoopStart,
    onSetLoopEnd
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(50);
    const [scrollX, setScrollX] = useState(0);
    const [draggingTrackId, setDraggingTrackId] = useState<number | null>(null);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartOffset, setDragStartOffset] = useState(0);

    const lastPinchDist = useRef<number | null>(null);
    const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isDragUnlockedRef = useRef(false);

    // Haptic Helper (Local)
    const vibe = () => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(15); };

    const handleClipTouchStart = (e: React.TouchEvent | React.MouseEvent, trackId: number, currentOffset: number) => {
        // Only stop propagation if we are actually interacting, but needed for scroll? 
        // We stop propagation so we can handle logic, but we must decide if it's a scroll or drag.
        // Actually, we should NOT stop propagation immediately if we want to allow scrolling of parent?
        // No, the parent scroll is handled by overflow. We need to prevent the drag logic from kicking in immediately.

        // e.stopPropagation(); // Removed to allow potential scrolling if drag doesn't engage? No, clips are reliable targets.

        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;

        // Prepare Drag Data but DON'T activate it yet
        setDragStartX(clientX);
        setDragStartOffset(currentOffset || 0);
        isDragUnlockedRef.current = false;

        // Start Long Press Timer
        longPressTimerRef.current = setTimeout(() => {
            isDragUnlockedRef.current = true;
            setDraggingTrackId(trackId);
            vibe(); // Haptic feedback: Unlocked!
        }, 300); // 300ms hold to unlock
    };

    const handleClipMoveCheck = (e: React.TouchEvent | React.MouseEvent) => {
        // If user moves significantly BEFORE unlock, cancel the timer (it's a scroll)
        if (!isDragUnlockedRef.current && longPressTimerRef.current) {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            if (Math.abs(clientX - dragStartX) > 10) {
                clearTimeout(longPressTimerRef.current);
                longPressTimerRef.current = null;
            }
        }
    };


    // Global Container Touch Move (Handles Pinch & Clip Drag)
    const handleContainerTouchMove = (e: React.TouchEvent) => {
        // Check if we need to cancel long press due to early movement
        handleClipMoveCheck(e);

        // PINCH ZOOM (2 Fingers)
        if (e.touches.length === 2) {
            e.preventDefault(); // Prevent native page zoom
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            const dist = Math.hypot(touch1.clientX - touch2.clientX, touch1.clientY - touch2.clientY);

            if (lastPinchDist.current !== null) {
                const delta = dist - lastPinchDist.current;
                setZoom(prev => Math.max(10, Math.min(300, prev + delta * 0.5)));
            }
            lastPinchDist.current = dist;
            return;
        }

        // CLIP DRAG (1 Finger) - Only if UNLOCKED
        if (draggingTrackId !== null && isDragUnlockedRef.current) {
            e.preventDefault(); // Prevent scrolling while dragging clip
            const clientX = e.touches[0].clientX;
            const deltaPx = clientX - dragStartX;
            const deltaSec = deltaPx / zoom;
            onUpdateTrackOffset(draggingTrackId, dragStartOffset + deltaSec);
        }
    };

    const handleContainerTouchEnd = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }

        if (draggingTrackId !== null) {
            onDragEnd?.();
        }
        lastPinchDist.current = null;
        setDraggingTrackId(null);
        isDragUnlockedRef.current = false;
    };

    // Mouse Fallback
    const handleMouseMove = (e: React.MouseEvent) => {
        handleClipMoveCheck(e);
        if (draggingTrackId === null || !isDragUnlockedRef.current) return;

        e.preventDefault();
        const clientX = e.clientX;
        const deltaPx = clientX - dragStartX;
        const deltaSec = deltaPx / zoom;
        onUpdateTrackOffset(draggingTrackId, dragStartOffset + deltaSec);
    };

    const handleMouseUp = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
        if (draggingTrackId !== null) {
            onDragEnd?.();
        }
        setDraggingTrackId(null);
        isDragUnlockedRef.current = false;
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey) {
            e.preventDefault();
            const newZoom = Math.max(10, Math.min(200, zoom - e.deltaY * 0.1));
            setZoom(newZoom);
        } else {
            // Scroll logic handled by native overflow
        }
    };

    // AUTO-SCROLL TO CENTER PLAYHEAD
    useEffect(() => {
        if (isPlaying && containerRef.current) {
            const container = containerRef.current;
            const containerWidth = container.clientWidth;
            // Playhead absolute X position inside the scrolling container
            // The content starts after 140px sidebar margin
            const playheadX = 140 + (currentTime * zoom);

            // Calculate target scrollLeft to center the playhead
            const targetScrollLeft = playheadX - (containerWidth / 2);

            // Apply scroll
            container.scrollLeft = Math.max(0, targetScrollLeft);
        }
    }, [currentTime, isPlaying, zoom]);

    return (
        <div
            className="flex-1 flex flex-col bg-[#02040a] overflow-hidden relative select-none touch-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchMove={handleContainerTouchMove}
            onTouchEnd={handleContainerTouchEnd}
            onTouchCancel={handleContainerTouchEnd}
            onWheel={handleWheel}
        >
            {/* TIMELINE RULER */}
            <div className="h-8 bg-[#050510] border-b border-white/5 flex relative overflow-hidden shrink-0 z-40 shadow-sm">
                <div className="w-[140px] bg-[#050510] border-r border-white/5 shrink-0 z-20 shadow-lg text-[10px] flex items-center justify-center text-slate-500 font-bold tracking-widest uppercase">
                    Tracks ({tracks.length})
                </div>
                <div className="flex-1 relative overflow-hidden bg-white/0" ref={el => { if (el && containerRef.current) el.scrollLeft = containerRef.current.scrollLeft }}>
                    <Ruler duration={Math.max(duration, 300)} zoom={zoom} scroll={scrollX} />
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-30 pointer-events-none shadow-[0_0_10px_orange]"
                        style={{ left: currentTime * zoom }}
                    />
                </div>
            </div>

            {/* TRACKS CONTAINER */}
            <div
                className="flex-1 overflow-auto relative scrolling-touch no-scrollbar"
                ref={containerRef}
                onScroll={(e) => setScrollX(e.currentTarget.scrollLeft)}
            >
                <div className="relative min-w-full flex flex-col" style={{ width: Math.max(duration * zoom + 500, window.innerWidth) }}>

                    <div className="absolute inset-0 ml-[140px]">
                        {/* GRID LINES (Inside offset area) */}
                        <BackgroundGrid zoom={zoom} height={tracks.length * 100 + 500} />

                        {/* PLAYHEAD (Inside offset area) */}
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-30 pointer-events-none shadow-[0_0_10px_orange]"
                            style={{ left: currentTime * zoom }}
                        />
                    </div>

                    {tracks.map(track => (
                        <div
                            key={track.id}
                            className={`h-20 border-b border-white/5 flex relative group transition-colors ${selectedTrackId === track.id ? 'bg-white/5' : ''}`}
                            onClick={() => onTrackSelect(track.id)}
                        >
                            {/* LEFT SIDEBAR CONTROLS */}
                            <div
                                className="w-[140px] shrink-0 bg-[#050510]/95 border-r border-white/5 sticky left-0 z-20 flex flex-col justify-center px-3 gap-1.5 backdrop-blur-md shadow-[4px_0_15px_rgba(0,0,0,0.3)]"
                                onMouseDown={e => e.stopPropagation()}
                                onTouchStart={e => e.stopPropagation()}
                                onPointerDown={e => e.stopPropagation()}
                            >
                                <div className="font-bold text-xs text-slate-200 truncate px-1" style={{ textShadow: `0 0 10px ${track.color}40` }}>{track.name}</div>

                                {/* Volume Slider (Lite Mode) */}
                                <div className="flex items-center gap-2 px-1">
                                    <Volume2 size={12} className={track.mute ? "text-red-500" : "text-slate-500"} />
                                    <input
                                        type="range"
                                        min="0" max="1" step="0.01"
                                        value={track.vol}
                                        onPointerDown={e => e.stopPropagation()}
                                        onTouchStart={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={e => e.stopPropagation()}
                                        onChange={(e) => onUpdateTrackVolume(track.id, parseFloat(e.target.value))}
                                        className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-slate-300 [&::-webkit-slider-thumb]:rounded-full hover:[&::-webkit-slider-thumb]:bg-white transition-all"
                                    />
                                </div>
                                <div className="flex justify-between px-1 mt-0.5 gap-2">
                                    <button
                                        onPointerDown={e => e.stopPropagation()}
                                        onTouchStart={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); onToggleMute(track.id); }}
                                        className={`flex-1 py-1 text-[9px] font-black rounded transition-all ${track.mute ? 'bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                                    >M</button>
                                    <button
                                        onPointerDown={e => e.stopPropagation()}
                                        onTouchStart={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); onToggleSolo(track.id); }}
                                        className={`flex-1 py-1 text-[9px] font-black rounded transition-all ${track.solo ? 'bg-yellow-500 text-black shadow-[0_0_10px_rgba(234,179,8,0.5)]' : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'}`}
                                    >S</button>
                                </div>
                            </div>

                            {/* Lane Content (Waveforms) */}
                            <div className="flex-1 relative h-full overflow-hidden">
                                {track.hasFile && audioBuffers[track.id] && (
                                    <div
                                        className={`absolute top-2 bottom-2 rounded-md overflow-hidden transition-all ${draggingTrackId === track.id ? 'scale-y-105 brightness-125 z-10 shadow-2xl cursor-grabbing' : 'cursor-grab hover:brightness-110'}`}
                                        style={{
                                            left: (track.offset || 0) * zoom,
                                            width: audioBuffers[track.id].duration * zoom,
                                            backgroundColor: `${track.color}20`, // More transparent fill
                                            border: `1px solid ${track.color}80`,
                                            boxShadow: `0 0 15px ${track.color}30` // Neon Glow
                                        }}
                                        onMouseDown={(e) => handleClipTouchStart(e, track.id, track.offset || 0)}
                                        onTouchStart={(e) => handleClipTouchStart(e, track.id, track.offset || 0)}
                                    >
                                        <WaveformClip buffer={audioBuffers[track.id]} color={track.color} zoom={zoom} />
                                        <div className="absolute top-0.5 left-2 text-[9px] bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded text-white/90 font-bold pointer-events-none select-none tracking-tight">
                                            {track.name}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    <div className="h-40"></div>
                </div>
            </div>

            {/* FLOATING TRANSPORTS */}
            {/* FIXED BOTTOM TRANSPORT BAR - MOBILE OPTIMIZED */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#02040a]/95 backdrop-blur border-t border-white/10 pb-safe z-50 shadow-[0_-5px_30px_rgba(0,0,0,0.5)] flex flex-col items-center">

                {/* TIME DISPLAY (Top) */}
                <div className="w-full bg-black/20 border-b border-white/5 py-1.5 flex justify-center">
                    <div className="text-xl font-mono font-black text-orange-500 tracking-widest drop-shadow-[0_0_10px_rgba(249,115,22,0.4)]">
                        {formatTime(currentTime, true)}
                    </div>
                </div>

                {/* CONTROLS ROW (Bottom) */}
                <div className="w-full flex items-center justify-between px-6 py-4 gap-4">

                    {/* LEFT: LOOP & SEEK BACK */}
                    <div className="flex items-center gap-3">
                        {/* Loop Controls */}
                        <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
                            <button
                                onClick={() => onSetLoopStart(loopStart !== null ? null : currentTime)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${loopStart !== null ? 'bg-orange-600 text-white' : 'text-slate-500 hover:text-white hover:bg-white/10'}`}
                                title="Set Loop A"
                            >A</button>
                            <button
                                onClick={() => onSetLoopEnd(loopEnd !== null ? null : currentTime)}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-colors ${loopEnd !== null ? 'bg-orange-600 text-white' : 'text-slate-500 hover:text-white hover:bg-white/10'}`}
                                title="Set Loop B"
                            >B</button>
                        </div>

                        <button
                            onClick={() => onSeek(Math.max(0, currentTime - 5))}
                            className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full active:bg-white/10 active:scale-95 transition text-slate-400 hover:text-white border border-white/5"
                        >
                            <SkipBack size={18} fill="currentColor" />
                        </button>
                    </div>

                    {/* CENTER: PLAY/PAUSE (Big) */}
                    <button
                        onClick={onTogglePlay}
                        className={`w-16 h-16 shrink-0 rounded-full flex items-center justify-center shadow-2xl transition-all active:scale-95
                        ${isPlaying
                                ? 'bg-slate-200 text-black shadow-[0_0_20px_rgba(255,255,255,0.3)]'
                                : 'bg-orange-500 text-black shadow-[0_0_30px_rgba(249,115,22,0.5)] border-4 border-orange-400/50 animate-pulse'}
                        `}
                    >
                        {isPlaying ? <Pause fill="black" size={28} /> : <Play fill="black" size={28} className="ml-1" />}
                    </button>

                    {/* RIGHT: SEEK FWD & ZOOM */}
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => onSeek(Math.min(duration, currentTime + 5))}
                            className="w-10 h-10 flex items-center justify-center bg-white/5 rounded-full active:bg-white/10 active:scale-95 transition text-slate-400 hover:text-white border border-white/5"
                        >
                            <SkipForward size={18} fill="currentColor" />
                        </button>

                        <div className="flex bg-white/5 rounded-full p-1 border border-white/5">
                            <button onClick={() => setZoom(z => Math.max(10, z / 1.5))} className="w-8 h-8 rounded-full flex items-center justify-center hover:text-white hover:bg-white/10 text-slate-500 transition-colors"><Activity size={14} /></button>
                            <button onClick={() => setZoom(z => Math.min(200, z * 1.5))} className="w-8 h-8 rounded-full flex items-center justify-center hover:text-white hover:bg-white/10 text-slate-500 transition-colors"><Activity size={18} /></button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Ruler: React.FC<{ duration: number, zoom: number, scroll: number }> = ({ duration, zoom, scroll }) => {
    const safeDuration = Number.isFinite(duration) ? Math.min(Math.max(0, duration), 3600) : 0;
    const step = Math.max(1, zoom < 30 ? 5 : 1);
    const ticks: number[] = [];
    for (let i = 0; i < safeDuration; i += step) {
        ticks.push(i);
    }
    return (
        <div className="absolute top-0 bottom-0 left-0 flex pointer-events-none" style={{ width: duration * zoom }}>
            {ticks.map(t => (
                <div key={t} className="absolute top-0 bottom-0 border-l border-white/10 text-[9px] text-slate-600 pl-1.5 font-mono" style={{ left: t * zoom }}>
                    {t % 5 === 0 ? formatTime(t) : ''}
                </div>
            ))}
        </div>
    );
};

const BackgroundGrid: React.FC<{ zoom: number, height: number }> = ({ zoom, height }) => {
    return (
        <div
            className="absolute top-0 left-0 w-full h-full pointer-events-none"
            style={{
                backgroundImage: `linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px)`,
                backgroundSize: `${zoom}px 100%`,
                height
            }}
        />
    );
};


const WaveformClip: React.FC<{ buffer: AudioBuffer, color: string, zoom: number }> = ({ buffer, color, zoom }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const renderWaveform = () => {
            if (!canvasRef.current || !buffer) return;
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            if (width === 0 || height === 0) return;
            if (buffer.numberOfChannels === 0) return;

            const dpr = window.devicePixelRatio || 1;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);

            try {
                const data = buffer.getChannelData(0);
                const step = Math.ceil(data.length / width);
                const amp = height / 2;

                ctx.clearRect(0, 0, width, height);

                // MAIN WAVE
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5; // Thicker line
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                // Add Shadow for Glow
                ctx.shadowColor = color;
                ctx.shadowBlur = 4;

                const innerStep = Math.max(1, Math.floor(step / 10));

                for (let i = 0; i < width; i++) {
                    let min = 1.0;
                    let max = -1.0;
                    const startIdx = Math.floor(i * step); // Fixed index access
                    if (startIdx >= data.length) break;

                    for (let j = 0; j < step; j += innerStep) {
                        const val = data[startIdx + j];
                        if (val < min) min = val;
                        if (val > max) max = val;
                    }
                    if (min > max) { min = 0; max = 0; }

                    // Draw symmetric wave centered
                    const yMin = amp + min * amp * 0.9; // Scale 0.9 to fit
                    const yMax = amp + max * amp * 0.9;

                    ctx.moveTo(i, yMin);
                    ctx.lineTo(i, yMax);
                }
                ctx.stroke();

                // Clear shadow for next render pass if any
                ctx.shadowBlur = 0;

            } catch (e) {
                console.error("Error rendering waveform:", e);
            }
        };

        const timeout = setTimeout(renderWaveform, 0);
        return () => clearTimeout(timeout);
    }, [buffer, color, zoom]);

    return <canvas ref={canvasRef} className="w-full h-full" />;
};
