import React, { useRef, useEffect, useState } from 'react';
import { X, Check, Volume2, MicOff, ZoomIn, ZoomOut, Scissors, Activity } from 'lucide-react';

interface WaveformEditorProps {
    buffer: AudioBuffer;
    trackName: string;
    onSave: (newBuffer: AudioBuffer) => void;
    onClose: () => void;
}

export const WaveformEditor: React.FC<WaveformEditorProps> = ({ buffer, trackName, onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // State
    const [selection, setSelection] = useState<{ start: number, end: number } | null>(null); // 0 to 1 normalized
    const [gain, setGain] = useState(100); // %
    const [zoom, setZoom] = useState(1);
    const [scroll, setScroll] = useState(0);
    const [hoverTime, setHoverTime] = useState<number | null>(null);

    // Working copy of buffer data to allow non-destructive previews (or undo)
    // For simplicity V1, we edit a clone directly and strictly Save/Cancel
    const [workingBuffer, setWorkingBuffer] = useState<AudioBuffer | null>(null);

    useEffect(() => {
        // Clone buffer on mount
        const clone = new AudioBuffer({
            length: buffer.length,
            numberOfChannels: buffer.numberOfChannels,
            sampleRate: buffer.sampleRate
        });
        for (let i = 0; i < buffer.numberOfChannels; i++) {
            clone.copyToChannel(buffer.getChannelData(i), i);
        }
        setWorkingBuffer(clone);
    }, [buffer]);

    // DRAWING
    useEffect(() => {
        if (!canvasRef.current || !workingBuffer || !containerRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Resize
        const width = containerRef.current.clientWidth;
        const height = 300;
        canvas.width = width;
        canvas.height = height;

        // Clear
        ctx.fillStyle = '#09090b'; // Zinc-950
        ctx.fillRect(0, 0, width, height);

        // Draw Waveform
        const data = workingBuffer.getChannelData(0); // Mono view
        const step = Math.ceil(data.length / (width * zoom)); // Zoom factor
        const amp = height / 2;

        ctx.beginPath();
        ctx.strokeStyle = '#f97316'; // Orange-500
        ctx.lineWidth = 1;

        // VISIBLE RANGE
        // scroll is 0-1. 
        // Visible window size (normalized) = 1/zoom
        // Start Index = data.length * scroll
        const viewportSize = data.length / zoom;
        const startIndex = Math.floor(data.length * scroll);
        const endIndex = Math.min(data.length, startIndex + viewportSize);

        // Map pixel x to data index
        // x=0 -> startIndex
        // x=width -> endIndex

        for (let x = 0; x < width; x++) {
            // Calculate index for this pixel
            // const i = startIndex + Math.floor((x / width) * viewportSize);

            // Min/Max for this pixel chunk (optimization)
            let min = 1.0;
            let max = -1.0;

            const chunkStart = startIndex + Math.floor((x / width) * viewportSize);
            const chunkEnd = startIndex + Math.floor(((x + 1) / width) * viewportSize);

            for (let j = chunkStart; j < chunkEnd; j += Math.max(1, Math.floor((chunkEnd - chunkStart) / 10))) {
                // Sub-sampling for speed
                const val = data[j];
                if (val < min) min = val;
                if (val > max) max = val;
            }

            if (min > max) { min = 0; max = 0; } // Silence

            ctx.moveTo(x, amp + min * amp);
            ctx.lineTo(x, amp + max * amp);
        }
        ctx.stroke();

        // Draw Selection
        if (selection) {
            // Convert normalized selection to pixel
            // sel.start (0-1) -> absolute sample index -> relative to viewport -> pixel

            const selStartIdx = selection.start * data.length;
            const selEndIdx = selection.end * data.length;

            // Project to screen
            const x1 = ((selStartIdx - startIndex) / viewportSize) * width;
            const x2 = ((selEndIdx - startIndex) / viewportSize) * width;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(x1, 0, x2 - x1, height);

            // Border lines
            ctx.beginPath();
            ctx.strokeStyle = 'white';
            ctx.moveTo(x1, 0); ctx.lineTo(x1, height);
            ctx.moveTo(x2, 0); ctx.lineTo(x2, height);
            ctx.stroke();
        }

        // Draw Center Line
        ctx.beginPath();
        ctx.strokeStyle = '#27272a'; // Zinc-800
        ctx.moveTo(0, amp);
        ctx.lineTo(width, amp);
        ctx.stroke();

    }, [workingBuffer, selection, zoom, scroll]);

    // MOUSE HANDLING
    const handleMouseDown = (e: React.MouseEvent) => {
        if (!canvasRef.current || !workingBuffer) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;

        // Pixel to Normalized Buffer Position
        const viewportSizeNorm = 1 / zoom;
        const scrollNorm = scroll;
        const clickNormViaViewport = x / width; // 0-1 within view
        const absoluteNorm = scrollNorm + (clickNormViaViewport * viewportSizeNorm);

        setSelection({ start: absoluteNorm, end: absoluteNorm });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!canvasRef.current || !workingBuffer) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;

        // Hover effect (optional) inside

        if (e.buttons === 1 && selection) {
            // Dragging
            const viewportSizeNorm = 1 / zoom;
            const scrollNorm = scroll;
            const clickNormViaViewport = Math.max(0, Math.min(1, x / width));
            const absoluteNorm = Math.max(0, Math.min(1, scrollNorm + (clickNormViaViewport * viewportSizeNorm)));

            setSelection(prev => prev ? { ...prev, end: absoluteNorm } : null);
        }
    };

    // PROCESSORS
    const processAudio = (type: 'GAIN' | 'SILENCE') => {
        if (!workingBuffer || !selection) return;

        const startIdx = Math.floor(Math.min(selection.start, selection.end) * workingBuffer.length);
        const endIdx = Math.ceil(Math.max(selection.start, selection.end) * workingBuffer.length);

        if (startIdx === endIdx) return;

        const newBuffer = new AudioBuffer({
            length: workingBuffer.length,
            numberOfChannels: workingBuffer.numberOfChannels,
            sampleRate: workingBuffer.sampleRate
        });

        for (let c = 0; c < workingBuffer.numberOfChannels; c++) {
            const oldData = workingBuffer.getChannelData(c);
            const newData = newBuffer.getChannelData(c);
            newData.set(oldData); // Copy all

            // Process Range
            for (let i = startIdx; i < endIdx; i++) {
                if (type === 'SILENCE') {
                    newData[i] = 0;
                } else if (type === 'GAIN') {
                    newData[i] *= (gain / 100);
                }
            }
        }

        setWorkingBuffer(newBuffer);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-[80vh]">

                {/* HEADER */}
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <Activity className="text-orange-500" />
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Wave Editor</h2>
                            <p className="text-xs text-zinc-500 font-mono uppercase">{trackName}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"><X /></button>
                    </div>
                </div>

                {/* EDITOR CANVAS */}
                <div className="flex-1 relative bg-black overflow-hidden flex flex-col group cursor-crosshair" ref={containerRef}>
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full"
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                    />

                    {/* OVERLAY INFO */}
                    <div className="absolute top-4 right-4 bg-black/60 backdrop-blur rounded px-2 py-1 text-xs font-mono text-zinc-400 border border-zinc-800 pointer-events-none">
                        Zoom: {zoom.toFixed(1)}x
                    </div>
                </div>

                {/* ZOOM SCROLLBAR (MiniMap placeholder logic) */}
                <div className="h-4 bg-zinc-900 w-full relative">
                    <div
                        className="h-full bg-zinc-700 hover:bg-zinc-600 cursor-grab active:cursor-grabbing rounded-full opacity-50 absolute"
                        style={{
                            left: `${scroll * 100}%`,
                            width: `${(1 / zoom) * 100}%`
                        }}
                        onMouseDown={(e) => {
                            // Simple scroll drag logic could go here, for now simpler Zoom buttons in footer
                        }}
                    ></div>
                </div>

                {/* FOOTER CONTROLS */}
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/30 grid grid-cols-1 md:grid-cols-3 gap-6 items-center">

                    {/* LEFT: ZOOM */}
                    <div className="flex items-center gap-2">
                        <button onClick={() => setZoom(z => Math.max(1, z / 1.5))} className="p-2 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-300"><ZoomOut size={16} /></button>
                        <span className="text-xs font-mono w-12 text-center text-zinc-500">VIEW</span>
                        <button onClick={() => setZoom(z => Math.min(50, z * 1.5))} className="p-2 bg-zinc-800 rounded hover:bg-zinc-700 text-zinc-300"><ZoomIn size={16} /></button>
                    </div>

                    {/* CENTER: TOOLS */}
                    <div className="flex items-center justify-center gap-4">
                        <div className="flex items-center gap-2 bg-zinc-900 p-1.5 rounded-xl border border-zinc-800">
                            <input
                                type="range"
                                min="0"
                                max="200"
                                value={gain}
                                onChange={(e) => setGain(Number(e.target.value))}
                                className="w-24 accent-orange-500 h-1"
                            />
                            <div className="text-xs font-bold text-orange-500 w-12 text-right">{gain}%</div>
                            <button
                                onClick={() => processAudio('GAIN')}
                                disabled={!selection}
                                className="bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white p-2 rounded-lg font-bold text-xs flex items-center gap-1 transition"
                            >
                                <Volume2 size={14} /> Apply
                            </button>
                        </div>

                        <button
                            onClick={() => processAudio('SILENCE')}
                            disabled={!selection}
                            className="bg-red-900/30 hover:bg-red-900/50 border border-red-900/50 disabled:opacity-50 text-red-400 p-2 rounded-lg font-bold text-xs flex items-center gap-1 transition"
                        >
                            <MicOff size={14} /> Silence
                        </button>
                    </div>

                    {/* RIGHT: ACTIONS */}
                    <div className="flex items-center justify-end gap-3">
                        <button
                            onClick={onClose}
                            className="px-6 py-3 rounded-xl font-bold text-zinc-400 hover:bg-zinc-800 transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => workingBuffer && onSave(workingBuffer)}
                            className="px-8 py-3 rounded-xl font-bold bg-white text-black hover:bg-zinc-200 transition shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center gap-2"
                        >
                            <Check size={18} /> Save Changes
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
};
