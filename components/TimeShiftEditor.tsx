import React, { useRef, useEffect, useState } from 'react';
import { X, Check, Clock, ChevronLeft, ChevronRight, ArrowLeft, ArrowRight } from 'lucide-react';

interface TimeShiftEditorProps {
    buffer: AudioBuffer;
    trackName: string;
    onSave: (newBuffer: AudioBuffer) => void;
    onClose: () => void;
}

export const TimeShiftEditor: React.FC<TimeShiftEditorProps> = ({ buffer, trackName, onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Shift in milliseconds
    // Positive = Delay (Add Silence at start)
    // Negative = Advance (Trim start)
    const [shiftMs, setShiftMs] = useState(0);

    // Visualization Params
    const [zoom, setZoom] = useState(1);

    // DRAWING
    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = containerRef.current.clientWidth;
        const height = 250;
        canvas.width = width;
        canvas.height = height;

        // Clear
        ctx.fillStyle = '#18181b'; // Zinc-900
        ctx.fillRect(0, 0, width, height);

        // Calculate Pixel Offset
        // buffer duration
        const duration = buffer.duration;
        const pxPerSec = (width * zoom) / duration;
        const pxOffset = (shiftMs / 1000) * pxPerSec;

        const data = buffer.getChannelData(0);
        const amp = height / 2;

        ctx.lineWidth = 1;

        // 1. Draw Original Position Ghost (Dimmed)
        // Only if moved
        if (shiftMs !== 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#27272a'; // Zinc-800

            const step = Math.ceil(data.length / (width * zoom));
            // Simplified draw for ghost
            for (let x = 0; x < width; x += 2) {
                const i = Math.floor((x / (width * zoom)) * data.length);
                if (i < data.length) {
                    const val = data[i];
                    ctx.moveTo(x, amp + val * amp * 0.5);
                    ctx.lineTo(x, amp + val * amp * 0.5 + 1); // Dots
                }
            }
            ctx.stroke();
        }

        // 2. Draw Shifted Waveform
        ctx.beginPath();
        if (shiftMs >= 0) {
            ctx.strokeStyle = '#22c55e'; // Green-500 (Delay/Right)
        } else {
            ctx.strokeStyle = '#ef4444'; // Red-500 (Advance/Left/Cut)
        }

        // We iterate pixels of the CANVAS (0 to width)
        // And find which sample corresponds to it given the shift.
        // t_pixel = x / pxPerSec
        // t_sample = t_pixel - (shiftMs/1000)

        // Optimization: Iterate x
        for (let x = 0; x < width; x++) {
            // Calculate time at this pixel
            const tPixel = x / pxPerSec; // seconds
            const tSample = tPixel - (shiftMs / 1000);

            if (tSample >= 0 && tSample < duration) {
                const sampleIdx = Math.floor(tSample * buffer.sampleRate);
                // Sub-sample
                // We need a range? 
                // Let's just pick one sample for speed in this simple view
                const val = data[sampleIdx];

                ctx.moveTo(x, amp + val * amp);
                ctx.lineTo(x, amp - val * amp); // Draw absolute vertical line for visibility
            }
        }
        ctx.stroke();

        // 3. Draw Center Line (Zero)
        ctx.beginPath();
        ctx.strokeStyle = '#52525b';
        ctx.moveTo(0, amp);
        ctx.lineTo(width, amp);
        ctx.stroke();

        // 4. Draw Start Marker Line
        ctx.beginPath();
        ctx.strokeStyle = '#fff';
        ctx.setLineDash([5, 5]);
        const startX = (shiftMs > 0) ? pxOffset : 0;
        // If shift < 0, the start is off-screen left, so visual start is 0
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, height);
        ctx.stroke();
        ctx.setLineDash([]);

    }, [buffer, shiftMs, zoom]);


    // PROCESS
    const processShift = () => {
        if (shiftMs === 0) {
            onClose();
            return;
        }

        const sampleRate = buffer.sampleRate;
        const shiftSamples = Math.floor((shiftMs / 1000) * sampleRate);
        const absShift = Math.abs(shiftSamples);

        let newLength = buffer.length;
        if (shiftSamples > 0) newLength += shiftSamples;
        else newLength -= absShift;

        if (newLength <= 0) {
            onClose(); // Warning?
            return;
        }

        const newBuffer = new AudioBuffer({
            length: newLength,
            numberOfChannels: buffer.numberOfChannels,
            sampleRate: sampleRate
        });

        for (let c = 0; c < buffer.numberOfChannels; c++) {
            const oldData = buffer.getChannelData(c);
            const newData = newBuffer.getChannelData(c);

            if (shiftSamples > 0) {
                // DELAY: Insert Silence at start
                newData.set(oldData, shiftSamples);
                // 0 to shiftSamples is already 0
            } else {
                // ADVANCE: Cut start
                // Copy from absShift to end
                // newData.set(oldData.subarray(absShift)); 
                // Safari/Old browsers might not support subarray on Float32Array efficiently in set? 
                // TypedArray.set supports it.
                for (let i = 0; i < newLength; i++) {
                    newData[i] = oldData[i + absShift];
                }
            }
        }

        onSave(newBuffer);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col">

                {/* HEADER */}
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <Clock className="text-blue-500" />
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Time Shift</h2>
                            <p className="text-xs text-zinc-500 font-mono uppercase">{trackName}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"><X /></button>
                </div>

                {/* VISUAL */}
                <div className="relative bg-black h-48 border-b border-zinc-800" ref={containerRef}>
                    <canvas ref={canvasRef} className="w-full h-full" />
                    <div className="absolute bottom-2 right-2 text-xs font-mono text-zinc-500">
                        {shiftMs > 0 ? `Delaying ${shiftMs}ms` : shiftMs < 0 ? `Cutting ${Math.abs(shiftMs)}ms` : 'Original'}
                    </div>
                </div>

                {/* CONTROLS */}
                <div className="p-6 flex flex-col gap-6">

                    {/* DISPLAY */}
                    <div className="flex justify-center items-end gap-2">
                        <span className={`text-4xl font-black ${shiftMs === 0 ? 'text-zinc-500' : shiftMs > 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {shiftMs > 0 ? '+' : ''}{shiftMs}
                        </span>
                        <span className="text-zinc-500 font-bold mb-1">ms</span>
                    </div>

                    {/* BUTTONS */}
                    <div className="grid grid-cols-5 gap-2">
                        <button onClick={() => setShiftMs(s => s - 100)} className="p-3 bg-zinc-900 rounded-lg hover:bg-red-900/20 text-zinc-400 hover:text-red-500 font-bold text-xs">-100</button>
                        <button onClick={() => setShiftMs(s => s - 10)} className="p-3 bg-zinc-900 rounded-lg hover:bg-red-900/20 text-zinc-400 hover:text-red-500 font-bold text-xs">-10</button>
                        <button onClick={() => setShiftMs(0)} className="p-3 bg-zinc-900 rounded-lg hover:bg-zinc-800 text-zinc-500 font-bold text-xs">0</button>
                        <button onClick={() => setShiftMs(s => s + 10)} className="p-3 bg-zinc-900 rounded-lg hover:bg-green-900/20 text-zinc-400 hover:text-green-500 font-bold text-xs">+10</button>
                        <button onClick={() => setShiftMs(s => s + 100)} className="p-3 bg-zinc-900 rounded-lg hover:bg-green-900/20 text-zinc-400 hover:text-green-500 font-bold text-xs">+100</button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setShiftMs(s => s - 1)} className="p-2 bg-zinc-900 rounded-lg text-zinc-500 hover:text-white font-mono text-xs flex justify-center items-center gap-1"><ChevronLeft size={14} /> 1ms</button>
                        <button onClick={() => setShiftMs(s => s + 1)} className="p-2 bg-zinc-900 rounded-lg text-zinc-500 hover:text-white font-mono text-xs flex justify-center items-center gap-1">1ms <ChevronRight size={14} /></button>
                    </div>

                    <button
                        onClick={processShift}
                        className="w-full py-4 rounded-xl font-bold bg-white text-black hover:bg-blue-100 transition shadow-[0_0_20px_rgba(255,255,255,0.2)] flex items-center justify-center gap-2"
                    >
                        <Check size={18} /> Apply Shift
                    </button>
                </div>
            </div>
        </div>
    );
};
