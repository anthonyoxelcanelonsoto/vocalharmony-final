import React, { useRef, useEffect, useState } from 'react';
import { Track } from '../types';
import { Play, Pause, Volume2, Mic, Activity, Clock, MoveHorizontal } from 'lucide-react';
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
    selectedTrackId
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
            className="flex-1 flex flex-col bg-zinc-950 overflow-hidden relative select-none touch-none"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchMove={handleContainerTouchMove}
            onTouchEnd={handleContainerTouchEnd}
            onTouchCancel={handleContainerTouchEnd}
            onWheel={handleWheel}
        >
            {/* TIMELINE RULER */}
            <div className="h-8 bg-zinc-900 border-b border-zinc-800 flex relative overflow-hidden shrink-0 z-40">
                <div className="w-[140px] bg-zinc-900 border-r border-zinc-800 shrink-0 z-20 shadow-lg text-[10px] flex items-center justify-center text-zinc-500 font-bold tracking-widest">
                    TRACKS ({tracks.length})
                </div>
                <div className="flex-1 relative overflow-hidden bg-zinc-800/30" ref={el => { if (el && containerRef.current) el.scrollLeft = containerRef.current.scrollLeft }}>
                    <Ruler duration={Math.max(duration, 300)} zoom={zoom} scroll={scrollX} />
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-30 pointer-events-none"
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
                            className={`h-16 border-b border-zinc-800 flex relative group ${selectedTrackId === track.id ? 'bg-zinc-900/50' : ''}`}
                            onClick={() => onTrackSelect(track.id)}
                        >
                            {/* LEFT SIDEBAR CONTROLS */}
                            {/* LEFT SIDEBAR CONTROLS */}
                            <div
                                className="w-[140px] shrink-0 bg-zinc-900 border-r border-zinc-800 sticky left-0 z-20 flex flex-col justify-center px-2 gap-1 backdrop-blur shadow-lg"
                                onMouseDown={e => e.stopPropagation()}
                                onTouchStart={e => e.stopPropagation()}
                                onPointerDown={e => e.stopPropagation()}
                            >
                                <div className="font-bold text-xs text-white truncate px-1 mb-1">{track.name}</div>

                                {/* Volume Slider (Lite Mode) */}
                                <div className="flex items-center gap-1 px-1">
                                    <Volume2 size={12} className={track.mute ? "text-red-500" : "text-zinc-400"} />
                                    <input
                                        type="range"
                                        min="0" max="1" step="0.01"
                                        value={track.vol}
                                        onPointerDown={e => e.stopPropagation()}
                                        onTouchStart={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={e => e.stopPropagation()}
                                        onChange={(e) => onUpdateTrackVolume(track.id, parseFloat(e.target.value))}
                                        className="flex-1 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-zinc-400 [&::-webkit-slider-thumb]:rounded-full"
                                    />
                                </div>
                                <div className="flex justify-between px-1 mt-1">
                                    <button
                                        onPointerDown={e => e.stopPropagation()}
                                        onTouchStart={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); onToggleMute(track.id); }}
                                        className={`px-1.5 py-0.5 text-[9px] rounded border ${track.mute ? 'bg-red-900/50 border-red-500 text-red-200' : 'border-zinc-700 text-zinc-500'}`}
                                    >M</button>
                                    <button
                                        onPointerDown={e => e.stopPropagation()}
                                        onTouchStart={e => e.stopPropagation()}
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={(e) => { e.stopPropagation(); onToggleSolo(track.id); }}
                                        className={`px-1.5 py-0.5 text-[9px] rounded border ${track.solo ? 'bg-yellow-600/50 border-yellow-500 text-yellow-100' : 'border-zinc-700 text-zinc-500'}`}
                                    >S</button>
                                </div>
                            </div>

                            {/* Lane Content (Waveforms) */}
                            {/* Note: This is a flex item next to the 140px sidebar, so it naturally starts at 140px! */}
                            <div className="flex-1 relative h-full overflow-hidden">
                                {track.hasFile && audioBuffers[track.id] && (
                                    <div
                                        className={`absolute top-2 bottom-2 rounded-lg overflow-hidden transition-all shadow-md ${draggingTrackId === track.id ? 'scale-y-110 brightness-110 z-10 ring-2 ring-white/50 cursor-grabbing' : 'cursor-grab hover:brightness-105'}`}
                                        style={{
                                            left: (track.offset || 0) * zoom,
                                            width: audioBuffers[track.id].duration * zoom,
                                            backgroundColor: `${track.color}40`,
                                            border: `1px solid ${track.color}`
                                        }}
                                        onMouseDown={(e) => handleClipTouchStart(e, track.id, track.offset || 0)}
                                        onTouchStart={(e) => handleClipTouchStart(e, track.id, track.offset || 0)}
                                    >
                                        <WaveformClip buffer={audioBuffers[track.id]} color={track.color} zoom={zoom} />
                                        <div className="absolute top-1 left-2 text-[10px] bg-black/50 px-1 rounded text-white/70 font-mono pointer-events-none select-none">
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
            {/* FLOATING TRANSPORTS */}
            <div className="fixed bottom-2 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-full px-4 py-2 flex items-center gap-4 shadow-xl z-50">
                <button onClick={onTogglePlay} className="p-2 bg-white rounded-full text-black hover:scale-105 transition shadow-lg shadow-white/20">
                    {isPlaying ? <Pause fill="black" size={20} /> : <Play fill="black" size={20} />}
                </button>
                <div className="text-xl font-mono font-bold text-orange-500 w-28 text-center">
                    {formatTime(currentTime, true)}
                </div>
                <div className="flex gap-3 text-zinc-400">
                    <button onClick={() => setZoom(z => Math.max(10, z / 1.5))} className="active:text-white"><Activity size={16} /></button>
                    <button onClick={() => setZoom(z => Math.min(200, z * 1.5))} className="active:text-white"><Activity size={20} /></button>
                </div>
            </div>
        </div>
    );
};

const Ruler: React.FC<{ duration: number, zoom: number, scroll: number }> = ({ duration, zoom, scroll }) => {
    // Safety: prevent infinite loop if duration is huge or NaN
    const safeDuration = Number.isFinite(duration) ? Math.min(Math.max(0, duration), 3600) : 0;
    const step = Math.max(1, zoom < 30 ? 5 : 1);
    const ticks: number[] = [];

    for (let i = 0; i < safeDuration; i += step) {
        ticks.push(i);
    }

    return (
        <div className="absolute top-0 bottom-0 left-0 flex pointer-events-none" style={{ width: duration * zoom }}>
            {ticks.map(t => (
                <div key={t} className="absolute top-0 bottom-0 border-l border-zinc-700 text-[10px] text-zinc-500 pl-1" style={{ left: t * zoom }}>
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
                backgroundImage: `linear-gradient(to right, #27272a 1px, transparent 1px)`,
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

            // Safety checks
            const width = canvas.offsetWidth;
            const height = canvas.offsetHeight;
            if (width === 0 || height === 0) return;
            if (buffer.numberOfChannels === 0) return;

            // Handle High DPI displays for crisp rendering
            const dpr = window.devicePixelRatio || 1;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.scale(dpr, dpr);

            try {
                const data = buffer.getChannelData(0);
                // Step logic: how many samples per pixel?
                const step = Math.ceil(data.length / width);
                const amp = height / 2;

                ctx.clearRect(0, 0, width, height);
                ctx.beginPath();
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;

                const innerStep = Math.max(1, Math.floor(step / 10));

                for (let i = 0; i < width; i++) {
                    let min = 1.0;
                    let max = -1.0;

                    const startIdx = i * step;
                    if (startIdx >= data.length) break;

                    for (let j = 0; j < step; j += innerStep) {
                        const val = data[startIdx + j];
                        if (val < min) min = val;
                        if (val > max) max = val;
                    }
                    if (min > max) { min = 0; max = 0; }
                    ctx.moveTo(i, amp + min * amp);
                    ctx.lineTo(i, amp + max * amp);
                }
                ctx.stroke();
            } catch (e) {
                console.error("Error rendering waveform:", e);
            }
        };

        // Defer rendering slightly to ensure layout is done
        // We need to re-render when ZOOM changes (as width changes)
        const timeout = setTimeout(renderWaveform, 0);
        return () => clearTimeout(timeout);
    }, [buffer, color, zoom]); // Added zoom dependency

    return <canvas ref={canvasRef} className="w-full h-full" />;
};
