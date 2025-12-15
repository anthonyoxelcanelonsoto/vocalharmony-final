import React, { useRef, useEffect, useState } from 'react';
import { X, Check, Activity, MoveHorizontal, PlusCircle, Trash2, ZoomIn, ZoomOut } from 'lucide-react';

interface PanEditorProps {
    buffer: AudioBuffer;
    trackName: string;
    onSave: (newBuffer: AudioBuffer) => void;
    onClose: () => void;
}

interface Point {
    x: number; // 0-1 (Normalized time)
    y: number; // -1 to 1 (Left to Right)
}

export const PanEditor: React.FC<PanEditorProps> = ({ buffer, trackName, onSave, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Automation Points (Start with Flat Line at Center)
    const [points, setPoints] = useState<Point[]>([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    const [zoom, setZoom] = useState(1);
    const [scroll, setScroll] = useState(0);
    const [draggingPointIdx, setDraggingPointIdx] = useState<number | null>(null);

    // Working copy of buffer for visualization
    const [waveformBuffer, setWaveformBuffer] = useState<AudioBuffer>(buffer);

    // DRAWING
    useEffect(() => {
        if (!canvasRef.current || !containerRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = containerRef.current.clientWidth;
        const height = 300;
        canvas.width = width;
        canvas.height = height;

        // Clear Background
        ctx.fillStyle = '#18181b'; // Zinc-900
        ctx.fillRect(0, 0, width, height);

        // 1. Draw Waveform (Dimmed) as Reference
        const data = waveformBuffer.getChannelData(0);
        const step = Math.ceil(data.length / (width * zoom));
        const amp = height / 4; // Smaller amp to fit lanes

        ctx.beginPath();

        // Split view: Left (Top) / Right (Bottom) or Just Overlay?
        // Automation overlay usually shows center as 0.
        // Let's draw waveform centered, faded.
        ctx.strokeStyle = '#3f3f46'; // Zinc-700
        ctx.lineWidth = 1;

        const viewportSize = data.length / zoom;
        const startIndex = Math.floor(data.length * scroll);

        for (let x = 0; x < width; x++) {
            let min = 1.0;
            let max = -1.0;
            const chunkStart = startIndex + Math.floor((x / width) * viewportSize);
            const chunkEnd = startIndex + Math.floor(((x + 1) / width) * viewportSize);

            for (let j = chunkStart; j < chunkEnd; j += Math.max(1, Math.floor((chunkEnd - chunkStart) / 10))) {
                const val = data[j];
                if (val < min) min = val;
                if (val > max) max = val;
            }
            if (min > max) { min = 0; max = 0; }
            ctx.moveTo(x, height / 2 + min * amp);
            ctx.lineTo(x, height / 2 + max * amp);
        }
        ctx.stroke();

        // 2. Draw Center Line
        ctx.beginPath();
        ctx.strokeStyle = '#52525b'; // Zinc-600 dashed
        ctx.setLineDash([5, 5]);
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // 3. Draw Automation Lines
        ctx.beginPath();
        ctx.strokeStyle = '#f472b6'; // Pink-400 (FL Studio Automation Color-ish)
        ctx.lineWidth = 3;

        // Sort points by X
        const sortedPoints = [...points].sort((a, b) => a.x - b.x);

        // Map normalized coordinates to screen
        // X: (pt.x - scroll) * zoom * width
        // Y: (1 - (pt.y + 1) / 2) * height  --> Map -1..1 to Height..0?
        // Let's say -1 (Left) is Bottom? No, usually Top is L, Bottom is R? 
        // Standard: Center is 0. Up is L, Down is R? Or vice versa.
        // FL Studio: Up is Pan L? Let's check... typically Up is Left/Positive?
        // Actually usually Volume Automation: Up=100%.
        // Pan: Center=0. Let's make Up = Left, Down = Right.

        // Y Mapping: y=-1 -> 0 (Top/Left), y=1 -> height (Bottom/Right)

        const mapX = (normX: number) => (normX - scroll) * zoom * width;
        const mapY = (normY: number) => ((normY + 1) / 2) * height; // -1->0, 0->0.5, 1->1

        if (sortedPoints.length > 0) {
            const first = sortedPoints[0];
            ctx.moveTo(mapX(first.x), mapY(first.y));

            for (let i = 1; i < sortedPoints.length; i++) {
                const pt = sortedPoints[i];
                ctx.lineTo(mapX(pt.x), mapY(pt.y));
            }
        }
        ctx.stroke();

        // 4. Draw Points (Nodes)
        sortedPoints.forEach((pt, i) => {
            const px = mapX(pt.x);
            const py = mapY(pt.y);

            // Check if visible
            if (px >= -10 && px <= width + 10) {
                ctx.beginPath();
                ctx.fillStyle = '#f472b6';
                ctx.arc(px, py, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#fff';
                ctx.stroke();
            }
        });

    }, [waveformBuffer, points, zoom, scroll]);

    // INTERACTION
    const handlePointerDown = (e: React.PointerEvent) => {
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;

        // Norm Coords
        const normX = scroll + (x / width) / zoom;
        const normY = (y / height) * 2 - 1; // 0..1 -> -1..1

        // Check if clicking existing point
        const hitDist = 10;
        const mapX = (nx: number) => (nx - scroll) * zoom * width;
        const mapY = (ny: number) => ((ny + 1) / 2) * height;

        const hitIdx = points.findIndex(pt => {
            const px = mapX(pt.x);
            const py = mapY(pt.y);
            return Math.sqrt(Math.pow(px - x, 2) + Math.pow(py - y, 2)) < hitDist;
        });

        if (hitIdx !== -1) {
            setDraggingPointIdx(hitIdx);
        } else {
            // Create new point
            const newPoint = { x: Math.max(0, Math.min(1, normX)), y: Math.max(-1, Math.min(1, normY)) };
            setPoints(prev => [...prev, newPoint].sort((a, b) => a.x - b.x));
            // Find index of new point to start dragging immediately
            // (Simpler to just add it now, user can click again to drag if mostly creating)
            // Or better yet, find index after sort? 
            // Stick to simply adding for now.
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (draggingPointIdx === null || !canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;

        const normX = scroll + (x / width) / zoom;
        const normY = (y / height) * 2 - 1;

        setPoints(prev => {
            const newPoints = [...prev];
            // Allow basic constraints? Start/End points locked to X=0/1?
            // Usually good practice.
            let safeX = Math.max(0, Math.min(1, normX));
            if (draggingPointIdx === 0) safeX = 0; // Lock Start
            if (draggingPointIdx === prev.length - 1 && prev[prev.length - 1].x === 1) safeX = 1; // Lock End if currently at end? 
            // Actually let's just allow moving X freely except constraints

            newPoints[draggingPointIdx] = {
                x: safeX,
                y: Math.max(-1, Math.min(1, normY))
            };
            return newPoints; //.sort((a,b) => a.x - b.x) // Sorting while dragging can be glitchy UX
        });
    };

    const handlePointerUp = () => {
        setDraggingPointIdx(null);
        setPoints(prev => [...prev].sort((a, b) => a.x - b.x)); // Sort on release
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        // Delete point?
        if (!canvasRef.current) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const width = rect.width;
        const height = rect.height;

        const mapX = (nx: number) => (nx - scroll) * zoom * width;
        const mapY = (ny: number) => ((ny + 1) / 2) * height;
        const hitDist = 10;

        const hitIdx = points.findIndex(pt => {
            const px = mapX(pt.x);
            const py = mapY(pt.y);
            return Math.sqrt(Math.pow(px - x, 2) + Math.pow(py - y, 2)) < hitDist;
        });

        if (hitIdx !== -1 && points.length > 2) { // Keep bounds
            setPoints(prev => prev.filter((_, i) => i !== hitIdx));
        }
    };

    // PROCESS
    const processPanning = () => {
        // Mono to Stereo + Pan Env
        const newBuffer = new AudioBuffer({
            length: buffer.length,
            numberOfChannels: 2, // Force Stereo
            sampleRate: buffer.sampleRate
        });

        const inputData = buffer.getChannelData(0); // Assuming mono input source usually?
        // If Stereo input, we might just balance them. Let's assume input needs panning.

        const leftOut = newBuffer.getChannelData(0);
        const rightOut = newBuffer.getChannelData(1);

        // Pre-calculate segments for faster processing (Linear Interpolation)
        // Point A to B
        let currentPtIdx = 0;

        for (let i = 0; i < buffer.length; i++) {
            const t = i / buffer.length; // 0..1

            // Find segment
            while (currentPtIdx < points.length - 1 && t > points[currentPtIdx + 1].x) {
                currentPtIdx++;
            }

            const p1 = points[currentPtIdx];
            const p2 = points[currentPtIdx + 1] || p1;

            // Interpolate Pan Value
            let pan = 0;
            if (p2.x === p1.x) pan = p1.y;
            else {
                const ratio = (t - p1.x) / (p2.x - p1.x);
                pan = p1.y + (p2.y - p1.y) * ratio;
            }

            // Apply Pan Law (Constant Power)
            // pan is -1 (L) to 1 (R)
            // x = (pan + 1) * (PI / 4)
            // L = cos(x), R = sin(x)

            const xVal = (pan + 1) * (Math.PI / 4);
            const gainL = Math.cos(xVal);
            const gainR = Math.sin(xVal);

            // If input matches output buffer length, safe access
            const sample = inputData[i];

            leftOut[i] = sample * gainL;
            rightOut[i] = sample * gainR;
        }

        onSave(newBuffer);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 backdrop-blur flex items-center justify-center p-6 animate-in fade-in duration-200">
            <div className="w-full max-w-5xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-[80vh]">

                {/* HEADER */}
                <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-900/50 rounded-t-2xl">
                    <div className="flex items-center gap-3">
                        <MoveHorizontal className="text-pink-500" />
                        <div>
                            <h2 className="text-xl font-bold text-white tracking-tight">Pan Automation</h2>
                            <p className="text-xs text-zinc-500 font-mono uppercase">{trackName} • Double-click to remove points</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400"><X /></button>
                </div>

                {/* CANVAS */}
                <div className="flex-1 relative bg-black overflow-hidden flex flex-col group touch-none" ref={containerRef}>
                    <canvas
                        ref={canvasRef}
                        className="w-full h-full cursor-crosshair touch-none"
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        onDoubleClick={handleDoubleClick}
                    />
                    <div className="absolute top-2 left-2 text-[10px] text-zinc-600 font-mono pointer-events-none">
                        L<br /><br /><br />C<br /><br /><br />R
                    </div>
                </div>

                {/* CONTROLS */}
                <div className="p-6 border-t border-zinc-800 bg-zinc-900/30 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-3 rounded-xl font-bold text-zinc-400 hover:bg-zinc-800 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={processPanning}
                        className="px-8 py-3 rounded-xl font-bold bg-pink-600 text-white hover:bg-pink-500 transition shadow-[0_0_20px_rgba(236,72,153,0.3)] flex items-center gap-2"
                    >
                        <Check size={18} /> Apply Panning
                    </button>
                </div>
            </div>
        </div>
    );
};
