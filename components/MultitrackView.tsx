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
    selectedTrackId
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [zoom, setZoom] = useState(50);
    const [scrollX, setScrollX] = useState(0);
    const [draggingTrackId, setDraggingTrackId] = useState<number | null>(null);
    const [dragStartX, setDragStartX] = useState(0);
    const [dragStartOffset, setDragStartOffset] = useState(0);

    const lastPinchDist = useRef<number | null>(null);

    const handleClipTouchStart = (e: React.TouchEvent | React.MouseEvent, trackId: number, currentOffset: number) => {
        e.stopPropagation(); // Prevent triggering container events if any
        setDraggingTrackId(trackId);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        setDragStartX(clientX);
        setDragStartOffset(currentOffset || 0);
    };

    // Global Container Touch Move (Handles Pinch & Clip Drag)
    const handleContainerTouchMove = (e: React.TouchEvent) => {
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

        // CLIP DRAG (1 Finger)
        if (draggingTrackId !== null) {
            e.preventDefault(); // Prevent scrolling while dragging clip
            const clientX = e.touches[0].clientX;
            const deltaPx = clientX - dragStartX;
            const deltaSec = deltaPx / zoom;
            onUpdateTrackOffset(draggingTrackId, dragStartOffset + deltaSec);
        }
    };

    const handleContainerTouchEnd = () => {
        lastPinchDist.current = null;
        setDraggingTrackId(null);
    };

    // Mouse Fallback
    const handleMouseMove = (e: React.MouseEvent) => {
        if (draggingTrackId === null) return;
        e.preventDefault();
        const clientX = e.clientX;
        const deltaPx = clientX - dragStartX;
        const deltaSec = deltaPx / zoom;
        onUpdateTrackOffset(draggingTrackId, dragStartOffset + deltaSec);
    };

    const handleMouseUp = () => {
        setDraggingTrackId(null);
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
            <div className="h-8 bg-zinc-900 border-b border-zinc-800 flex relative overflow-hidden" style={{ minHeight: '32px' }}>
                <div className="w-[140px] bg-zinc-900 border-r border-zinc-800 shrink-0 z-10 shadow-lg text-[10px] flex items-center justify-center text-zinc-500 font-bold tracking-widest">
                    TRACKS ({tracks.length})
                </div>
                <div className="flex-1 relative overflow-hidden" ref={el => { if (el && containerRef.current) el.scrollLeft = containerRef.current.scrollLeft }}>
                    <Ruler duration={Math.max(duration, 300)} zoom={zoom} scroll={scrollX} />
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-20 pointer-events-none"
                        style={{ left: currentTime * zoom - scrollX }}
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

                    {/* GRID LINES */}
                    <BackgroundGrid zoom={zoom} height={tracks.length * 100 + 200} />

                    {/* PLAYHEAD */}
                    <div
                        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-30 pointer-events-none shadow-[0_0_10px_orange]"
                        style={{ left: currentTime * zoom }}
                    />

                    {tracks.map(track => (
                        <div
                            key={track.id}
                            className={`h-16 border-b border-zinc-800 flex relative group ${selectedTrackId === track.id ? 'bg-zinc-900/50' : ''}`}
                            onClick={() => onTrackSelect(track.id)}
                        >
                            {/* LEFT SIDEBAR CONTROLS */}
                            <div className="w-[140px] shrink-0 bg-zinc-900 border-r border-zinc-800 sticky left-0 z-20 flex flex-col justify-center px-2 gap-1 backdrop-blur shadow-lg">
                                <div className="font-bold text-xs text-white truncate px-1 mb-1">{track.name}</div>

                                {/* Volume Slider Only (Lite Mode) */}
                                <div className="flex items-center gap-1 px-1">
                                    <Volume2 size={12} className={track.mute ? "text-red-500" : "text-zinc-400"} />
                                    <input
                                        type="range"
                                        min="0" max="1" step="0.01"
                                        value={track.vol}
                                        onClick={e => e.stopPropagation()}
                                        onChange={(e) => onUpdateTrackVolume(track.id, parseFloat(e.target.value))}
                                        className="w-full h-1 bg-zinc-700 rounded-full appearance-none accent-orange-500"
                                    />
                                </div>
                            </div>

                            {/* Lane Content */}
                            <div className="flex-1 relative h-full">
                                {track.hasFile && audioBuffers[track.id] && (
                                    <div
                                        className="absolute top-2 bottom-2 rounded-lg overflow-hidden cursor-grab active:cursor-grabbing hover:brightness-110 transition-filter shadow-md"
                                        style={{
                                            left: (track.offset || 0) * zoom,
                                            width: audioBuffers[track.id].duration * zoom,
                                            backgroundColor: `${track.color}40`,
                                            border: `1px solid ${track.color}`
                                        }}
                                        onMouseDown={(e) => handleClipTouchStart(e, track.id, track.offset || 0)}
                                        onTouchStart={(e) => handleClipTouchStart(e, track.id, track.offset || 0)}
                                    >
                                        <WaveformClip buffer={audioBuffers[track.id]} color={track.color} />
                                        <div className="absolute top-1 left-2 text-[10px] bg-black/50 px-1 rounded text-white/70 font-mono pointer-events-none">
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
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded-full px-6 py-3 flex items-center gap-6 shadow-2xl z-50">
                <button onClick={onTogglePlay} className="p-3 bg-white rounded-full text-black hover:scale-105 transition shadow-lg shadow-white/20">
                    {isPlaying ? <Pause fill="black" /> : <Play fill="black" />}
                </button>
                <div className="text-2xl font-mono font-bold text-orange-500 w-32 text-center">
                    {formatTime(currentTime, true)}
                </div>
                <div className="flex gap-4 text-zinc-400">
                    <button onClick={() => setZoom(z => Math.max(10, z / 1.5))} className="active:text-white"><Activity size={18} /></button>
                    <button onClick={() => setZoom(z => Math.min(200, z * 1.5))} className="active:text-white"><Activity size={24} /></button>
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


const WaveformClip: React.FC<{ buffer: AudioBuffer, color: string }> = ({ buffer, color }) => {
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

            canvas.width = width;
            canvas.height = height;

            try {
                const data = buffer.getChannelData(0);
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
        const timeout = setTimeout(renderWaveform, 0);
        return () => clearTimeout(timeout);
    }, [buffer, color]);

    return <canvas ref={canvasRef} className="w-full h-full" />;
};
