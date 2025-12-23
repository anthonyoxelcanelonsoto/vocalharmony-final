
import React, { useRef, useEffect, useState } from 'react';
import { NOTE_STRINGS, NoteBlock, AppMode } from '../types';
import { autoCorrelate, getNoteFromPitch } from '../utils';
import { Crosshair, ZoomIn, ZoomOut, ArrowUp, ArrowDown, Settings2, X, Maximize2, Minimize2, Magnet } from 'lucide-react';

interface VisualizerProps {
    analyser: AnalyserNode | null;
    ctx: AudioContext | null;
    color?: string;
    isActive: boolean;
    viewMode: 'piano' | 'staff';
    isFullscreen?: boolean;
    isUltraMode?: boolean;
    appMode?: AppMode; // Added appMode for specific styling
    noteBlocks?: NoteBlock[];
    onBlockChange?: (id: string, shiftCents: number) => void;
    currentTime?: number;
    pitchShift?: number; // Global pitch shift of the track
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    size: number;
    color: string;
}

type SnapMode = 'FREE' | 'SEMI' | 'TONE';

export const PitchVisualizer: React.FC<VisualizerProps> = ({
    analyser, ctx, color = '#f97316', isActive, viewMode, isFullscreen = false,
    isUltraMode = false, appMode = 'PRO', noteBlocks = [], onBlockChange, currentTime = 0, pitchShift = 0
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const requestRef = useRef<number>();

    // Interaction State
    const [draggingBlockId, setDraggingBlockId] = useState<string | null>(null);
    const dragStartY = useRef<number>(0);
    const dragStartCents = useRef<number>(0);
    const [snapMode, setSnapMode] = useState<SnapMode>('FREE');

    const [baseOctave, setBaseOctave] = useState(2);
    const [numOctaves, setNumOctaves] = useState(4);
    const [horizZoom, setHorizZoom] = useState(2);
    const [autoScroll, setAutoScroll] = useState(true);
    const [showMenu, setShowMenu] = useState(false);

    const historyRef = useRef<{ y: number | null, isPerfect: boolean, note?: string, midi?: number }[]>([]);
    const waveformRef = useRef<number[]>([]);
    const smoothingBuffer = useRef<number[]>([]);
    const octaveTracker = useRef<number[]>([]);
    const particlesRef = useRef<Particle[]>([]);
    const lastScrollTime = useRef<number>(0);
    const bgImageRef = useRef<HTMLImageElement | null>(null);

    // Constants
    const LEFT_MARGIN = 60;

    const getStaffStep = (midi: number) => {
        const octave = Math.floor(midi / 12);
        const noteIndex = midi % 12;
        const stepMap = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
        return (octave * 7) + stepMap[noteIndex];
    };

    useEffect(() => {
        const img = new Image();
        img.src = "https://i.postimg.cc/W32qRBkX/pergamino-4.png";
        img.onload = () => { bgImageRef.current = img; };
    }, []);

    useEffect(() => {
        const handleResize = () => {
            if (containerRef.current && canvasRef.current) {
                const dpr = window.devicePixelRatio || 1;
                const rect = containerRef.current.getBoundingClientRect();
                canvasRef.current.width = rect.width * dpr;
                canvasRef.current.height = rect.height * dpr;
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) ctx.scale(dpr, dpr);
                canvasRef.current.style.width = `${rect.width}px`;
                canvasRef.current.style.height = `${rect.height}px`;
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // --- INTERACTION HANDLERS ---
    const handlePointerDown = (e: React.PointerEvent) => {
        if (!isUltraMode || !canvasRef.current || !noteBlocks.length) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        const height = rect.height;

        const headX = LEFT_MARGIN + (historyRef.current.length * horizZoom);

        for (const block of noteBlocks) {
            const pixelsPerSec = horizZoom * 60;
            const timeOffset = currentTime - block.start;
            const blockX = headX - (timeOffset * pixelsPerSec);
            const blockW = block.duration * pixelsPerSec;

            if (blockX + blockW < 0 || blockX > rect.width) continue;

            let blockY = 0;
            let blockH = 20;
            // Apply global pitch shift to block position
            const displayMidi = block.originalMidi + pitchShift + (block.shiftCents / 100);

            if (viewMode === 'staff') {
                const CENTER_MIDI = isFullscreen ? 60 : 71;
                const VIEW_RANGE = isFullscreen ? 70 : 50;
                const ppt = height / VIEW_RANGE;
                const centerStep = getStaffStep(CENTER_MIDI);
                const targetStep = getStaffStep(Math.round(displayMidi));
                const diffSteps = targetStep - centerStep;
                const stepHeight = ppt * 1.5;
                blockY = (height / 2) - (diffSteps * stepHeight);
                blockH = stepHeight * 0.9;
            } else {
                const effectiveNumOctaves = isFullscreen ? numOctaves * 1.5 : numOctaves;
                const effectiveBaseOctave = isFullscreen ? Math.max(0, baseOctave - 1) : baseOctave;
                const pixelsPerSemitone = height / (effectiveNumOctaves * 12);
                const lowestMidiVisible = (effectiveBaseOctave + 1) * 12;
                const semiTonesFromBottom = displayMidi - lowestMidiVisible;
                blockY = height - (semiTonesFromBottom * pixelsPerSemitone) - (pixelsPerSemitone / 2);
                blockH = pixelsPerSemitone;
            }

            if (clickX >= blockX && clickX <= blockX + blockW &&
                Math.abs(clickY - blockY) < Math.max(30, blockH * 1.5)) {

                setDraggingBlockId(block.id);
                dragStartY.current = e.clientY;
                dragStartCents.current = block.shiftCents;
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                if (autoScroll) setAutoScroll(false);
                return;
            }
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isUltraMode || !draggingBlockId || !onBlockChange || !canvasRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        const height = rect.height;
        const deltaY = dragStartY.current - e.clientY;

        let pixelsPerSemitone = 20;

        if (viewMode === 'staff') {
            const VIEW_RANGE = isFullscreen ? 70 : 50;
            const ppt = height / VIEW_RANGE;
            pixelsPerSemitone = ppt * 1.5;
        } else {
            const effectiveNumOctaves = isFullscreen ? numOctaves * 1.5 : numOctaves;
            const pixelsPerSemitone = height / (effectiveNumOctaves * 12);
        }

        const rawCentsChange = (deltaY / pixelsPerSemitone) * 100;
        let totalCents = dragStartCents.current + rawCentsChange;

        if (snapMode === 'SEMI') {
            totalCents = Math.round(totalCents / 100) * 100;
        } else if (snapMode === 'TONE') {
            totalCents = Math.round(totalCents / 200) * 200;
        }

        onBlockChange(draggingBlockId, totalCents);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (draggingBlockId) {
            setDraggingBlockId(null);
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        }
    };

    useEffect(() => {
        if (!ctx) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const canvasCtx = canvas.getContext('2d');
        if (!canvasCtx) return;

        const width = parseFloat(canvas.style.width);
        const height = parseFloat(canvas.style.height);

        const bufferLength = analyser ? analyser.fftSize : 2048;
        const buffer = new Float32Array(bufferLength);

        const draw = () => {
            if (!canvasRef.current) return;

            let pitch = -1;
            let volume = 0;

            if (analyser && isActive) {
                analyser.getFloatTimeDomainData(buffer);
                const analysis = autoCorrelate(buffer, ctx.sampleRate);
                pitch = analysis.pitch;
                volume = analysis.volume;
            }

            canvasCtx.clearRect(0, 0, width, height);

            // BACKGROUND
            // BACKGROUND
            if (viewMode === 'staff' && bgImageRef.current) {
                // Draw Parchment Background Rotated 90 Degrees (Horizontal)
                const img = bgImageRef.current;

                // Rotated Dimensions: Image Width becomes logical height, Image Height becomes logical width
                const rotImgWidth = img.height;
                const rotImgHeight = img.width;

                const imgAspect = rotImgWidth / rotImgHeight;
                const canvasAspect = width / height;

                let drawScale;

                // COVER Logic (Fill everything) using Rotated Ratio
                const scaleW = width / rotImgWidth; // Scale needed to match width
                const scaleH = height / rotImgHeight; // Scale needed to match height
                drawScale = Math.max(scaleW, scaleH); // Take the larger scale to COVER the area

                const finalW = img.width * drawScale;
                const finalH = img.height * drawScale;

                // Fill background with dark slate first
                canvasCtx.fillStyle = '#0f172a';
                canvasCtx.fillRect(0, 0, width, height);

                canvasCtx.save();
                canvasCtx.translate(width / 2, height / 2);
                canvasCtx.rotate(-Math.PI / 2); // Rotate -90 degrees
                canvasCtx.drawImage(img, -finalW / 2, -finalH / 2, finalW, finalH);

                // Optional: Add slight dark tint for contrast if needed (Rotated context)
                if (appMode === 'ULTRA') {
                    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                    canvasCtx.fillRect(-finalW / 2, -finalH / 2, finalW, finalH);
                }
                canvasCtx.restore();
            } else {
                if (appMode === 'ULTRA') {
                    canvasCtx.fillStyle = '#000000';
                } else if (appMode === 'SIMPLE') {
                    // Darker Slate for Simple Mode
                    canvasCtx.fillStyle = viewMode === 'staff' ? '#0f172a' : '#020617';
                } else {
                    // PRO Mode
                    canvasCtx.fillStyle = viewMode === 'staff' ? '#0f172a' : '#020617';
                }
                canvasCtx.fillRect(0, 0, width, height);
            }

            const getYFromMidi = (midiVal: number) => {
                if (viewMode === 'staff') {
                    const CENTER_MIDI = isFullscreen ? 60 : 71;
                    const VIEW_RANGE = isFullscreen ? 70 : 50;
                    const ppt = height / VIEW_RANGE;
                    const centerStep = getStaffStep(CENTER_MIDI);
                    const floorMidi = Math.floor(midiVal);
                    const frac = midiVal - floorMidi;
                    const stepFloor = getStaffStep(floorMidi);
                    const stepCeil = getStaffStep(floorMidi + 1);
                    const currentStep = stepFloor + (stepCeil - stepFloor) * frac;
                    const diff = currentStep - centerStep;
                    const stepPixelHeight = ppt * 1.5;
                    return (height / 2) - (diff * stepPixelHeight);
                }

                const effectiveNumOctaves = isFullscreen ? numOctaves * 1.5 : numOctaves;
                const effectiveBaseOctave = isFullscreen ? Math.max(0, baseOctave - 1) : baseOctave;
                const pixelsPerSemitone = height / (effectiveNumOctaves * 12);
                const lowestMidiVisible = (effectiveBaseOctave + 1) * 12;
                const semiTonesFromBottom = midiVal - lowestMidiVisible;
                return height - (semiTonesFromBottom * pixelsPerSemitone) - (pixelsPerSemitone / 2);
            };

            // --- GRIDS ---
            if (viewMode === 'piano') {
                const effectiveNumOctaves = isFullscreen ? numOctaves * 1.5 : numOctaves;
                const effectiveBaseOctave = isFullscreen ? Math.max(0, baseOctave - 1) : baseOctave;
                const pixelsPerSemitone = height / (effectiveNumOctaves * 12);
                const noteHeight = pixelsPerSemitone;

                for (let o = effectiveBaseOctave + Math.ceil(effectiveNumOctaves) - 1; o >= effectiveBaseOctave; o--) {
                    for (let n = 11; n >= 0; n--) {
                        const currentMidi = (o + 1) * 12 + n;
                        const y = getYFromMidi(currentMidi) - (noteHeight / 2);
                        const noteName = NOTE_STRINGS[n];
                        if (noteName.includes('#')) {
                            // Darker keys styling
                            canvasCtx.fillStyle = isUltraMode ? '#18181b' : (appMode === 'SIMPLE' ? '#1e293b' : '#0f172a');
                            canvasCtx.fillRect(0, y, width, noteHeight);
                        }
                        canvasCtx.strokeStyle = isUltraMode ? '#27272a' : (appMode === 'SIMPLE' ? '#475569' : '#1e293b');
                        canvasCtx.lineWidth = 1;
                        canvasCtx.beginPath(); canvasCtx.moveTo(0, y + noteHeight); canvasCtx.lineTo(width, y + noteHeight); canvasCtx.stroke();
                        if (noteName === "C") {
                            // High contrast labels for Simple Mode
                            canvasCtx.fillStyle = appMode === 'SIMPLE' ? '#cbd5e1' : '#475569';
                            canvasCtx.font = appMode === 'SIMPLE' ? 'bold 12px Inter' : '10px Inter';
                            canvasCtx.fillText(`C${o}`, 4, y + noteHeight - 3);
                        }
                    }
                }
            } else {
                // Staff Grid (Ink Style)
                canvasCtx.font = '48px serif'; canvasCtx.fillStyle = '#000000';
                const g4Y = getYFromMidi(67);
                if (g4Y > -50 && g4Y < height + 50) canvasCtx.fillText('𝄞', 10, g4Y + 16);
                canvasCtx.strokeStyle = '#000000'; canvasCtx.lineWidth = 1.5;
                [64, 67, 71, 74, 77].forEach(m => {
                    const y = getYFromMidi(m);
                    canvasCtx.beginPath(); canvasCtx.moveTo(LEFT_MARGIN, y); canvasCtx.lineTo(width, y); canvasCtx.stroke();
                });
                if (isFullscreen) {
                    const f3Y = getYFromMidi(53);
                    canvasCtx.font = '40px serif'; canvasCtx.fillText('𝄢', 10, f3Y + 14);
                    [43, 47, 50, 53, 57].forEach(m => {
                        const y = getYFromMidi(m);
                        canvasCtx.beginPath(); canvasCtx.moveTo(LEFT_MARGIN, y); canvasCtx.lineTo(width, y); canvasCtx.stroke();
                    });
                    const topY = getYFromMidi(77); const botY = getYFromMidi(43);
                    canvasCtx.beginPath(); canvasCtx.moveTo(LEFT_MARGIN, topY); canvasCtx.lineTo(LEFT_MARGIN, botY); canvasCtx.lineWidth = 2; canvasCtx.stroke();
                    canvasCtx.beginPath(); canvasCtx.moveTo(LEFT_MARGIN - 5, topY);
                    canvasCtx.bezierCurveTo(LEFT_MARGIN - 15, topY, LEFT_MARGIN - 20, (topY + botY) / 2 - 20, LEFT_MARGIN - 25, (topY + botY) / 2);
                    canvasCtx.bezierCurveTo(LEFT_MARGIN - 20, (topY + botY) / 2 + 20, LEFT_MARGIN - 15, botY, LEFT_MARGIN - 5, botY);
                    canvasCtx.lineWidth = 1; canvasCtx.stroke();
                }
                const c4Y = getYFromMidi(60);
                canvasCtx.strokeStyle = '#334155'; canvasCtx.lineWidth = 1;
                canvasCtx.beginPath(); canvasCtx.moveTo(LEFT_MARGIN, c4Y); canvasCtx.lineTo(width, c4Y); canvasCtx.stroke();
                canvasCtx.fillStyle = '#64748b'; canvasCtx.font = '10px Inter'; canvasCtx.fillText('C4', isFullscreen ? 25 : 5, c4Y + 3);
            }

            // --- LIVE DATA PROCESSING ---
            let currentY: number | null = null;
            let isPerfect = false;
            let currentNoteName = '';
            let currentMidi: number | undefined = undefined;
            const maxPoints = Math.ceil((width - LEFT_MARGIN - 50) / horizZoom);

            if (isActive && analyser) {
                waveformRef.current.push(Math.min(volume * 8, 1.0));
                if (waveformRef.current.length > maxPoints) waveformRef.current.shift();

                if (pitch !== -1 && pitch > 40 && pitch < 3000) {
                    const noteData = getNoteFromPitch(pitch);
                    if (noteData) {
                        currentNoteName = noteData.note;
                        currentMidi = noteData.midi;

                        // STABILIZED AUTO-SCROLL LOGIC
                        if (autoScroll && viewMode === 'piano') {
                            octaveTracker.current.push(noteData.octave);
                            if (octaveTracker.current.length > 50) octaveTracker.current.shift();

                            const now = Date.now();
                            // Require a minimum amount of data to make a decision
                            if (octaveTracker.current.length > 20) {
                                const avgOctave = octaveTracker.current.reduce((a, b) => a + b, 0) / octaveTracker.current.length;
                                const viewCenter = baseOctave + (numOctaves / 2);
                                const dist = avgOctave - viewCenter;

                                // Increase threshold (was 0.8) and add time debounce
                                if (Math.abs(dist) > 0.9 && (now - lastScrollTime.current > 600)) {
                                    let newBase = Math.floor(avgOctave - (numOctaves / 2) + 0.5);
                                    const clampedBase = Math.max(0, Math.min(6, newBase));

                                    if (clampedBase !== baseOctave) {
                                        setBaseOctave(clampedBase);
                                        lastScrollTime.current = now;
                                    }
                                }
                            }
                        }

                        const exactMidi = noteData.midi + (noteData.deviation / 100);
                        const targetY = getYFromMidi(exactMidi);
                        smoothingBuffer.current.push(targetY);
                        if (smoothingBuffer.current.length > 6) smoothingBuffer.current.shift();
                        currentY = smoothingBuffer.current.reduce((a, b) => a + b, 0) / smoothingBuffer.current.length;
                        isPerfect = Math.abs(noteData.deviation) < 15;
                    }
                } else {
                    smoothingBuffer.current = [];
                }

                historyRef.current.push({ y: currentY, isPerfect, note: currentNoteName, midi: currentMidi });
                if (historyRef.current.length > maxPoints) historyRef.current.shift();
            }

            // --- ULTRA MODE BLOCKS ---
            const headX = LEFT_MARGIN + (historyRef.current.length * horizZoom);

            if (isUltraMode && noteBlocks.length > 0) {
                canvasCtx.save();
                canvasCtx.beginPath();
                canvasCtx.rect(LEFT_MARGIN, 0, width - LEFT_MARGIN, height);
                canvasCtx.clip();

                noteBlocks.forEach(block => {
                    const pixelsPerSec = horizZoom * 60;
                    const timeOffset = currentTime - block.start;

                    const x = headX - (timeOffset * pixelsPerSec);
                    const w = Math.max(5, block.duration * pixelsPerSec);

                    if (x + w > LEFT_MARGIN && x < width) {
                        // Apply global pitch shift to block visual position
                        const displayMidi = block.originalMidi + pitchShift + (block.shiftCents / 100);
                        const y = getYFromMidi(displayMidi);

                        let h = 10;
                        if (viewMode === 'staff') h = 8;
                        else {
                            const effectiveNumOctaves = isFullscreen ? numOctaves * 1.5 : numOctaves;
                            const pixelsPerSemitone = height / (effectiveNumOctaves * 12);
                            h = pixelsPerSemitone;
                        }

                        const isDragging = block.id === draggingBlockId;
                        canvasCtx.fillStyle = isDragging ? '#fcd34d' : '#ea580c';

                        canvasCtx.beginPath();
                        canvasCtx.roundRect(x, y - h / 2, w, h, 4);
                        canvasCtx.fill();
                        canvasCtx.strokeStyle = isDragging ? '#fff' : '#7c2d12';
                        canvasCtx.lineWidth = 1;
                        canvasCtx.stroke();
                    }
                });
                canvasCtx.restore();
            }

            // --- RENDER TRACE ---
            const waveCenter = height / 2;

            if (viewMode === 'piano') {
                // Stronger background wave for SIMPLE mode
                canvasCtx.fillStyle = appMode === 'SIMPLE' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)';

                for (let i = 0; i < waveformRef.current.length; i++) {
                    const h = waveformRef.current[i] * height;
                    const x = LEFT_MARGIN + (i * horizZoom);
                    canvasCtx.fillRect(x, waveCenter - (h / 2), Math.max(1, horizZoom), h);
                }

                canvasCtx.beginPath();
                canvasCtx.lineCap = 'round';
                canvasCtx.lineJoin = 'round';
                for (let i = 0; i < historyRef.current.length; i++) {
                    const point = historyRef.current[i];
                    const x = LEFT_MARGIN + (i * horizZoom);
                    if (point.y === null || point.y < -50 || point.y > height + 50) {
                        canvasCtx.stroke(); canvasCtx.beginPath(); continue;
                    }
                    canvasCtx.strokeStyle = point.isPerfect ? '#fbbf24' : color;

                    // Thicker line for SIMPLE mode
                    let lineWidth = point.isPerfect ? 3 : 2;
                    if (appMode === 'SIMPLE') lineWidth += 2;

                    canvasCtx.lineWidth = lineWidth;
                    if (i === 0 || historyRef.current[i - 1]?.y === null) canvasCtx.moveTo(x, point.y);
                    else canvasCtx.lineTo(x, point.y);
                    canvasCtx.stroke(); canvasCtx.beginPath(); canvasCtx.moveTo(x, point.y);
                }
            } else {
                // Dots for Staff
                for (let i = 0; i < historyRef.current.length; i++) {
                    const point = historyRef.current[i];
                    const x = LEFT_MARGIN + (i * horizZoom);
                    if (point.y !== null && point.y > 0 && point.y < height) {
                        canvasCtx.beginPath();
                        canvasCtx.ellipse(x, point.y, 4, 3, 0, 0, 2 * Math.PI);
                        canvasCtx.fillStyle = point.isPerfect ? '#fbbf24' : color;
                        canvasCtx.fill();

                        if (point.note && point.note.includes('#') && i % 15 === 0) {
                            canvasCtx.font = 'bold 12px Inter'; canvasCtx.fillStyle = '#fff'; canvasCtx.fillText('♯', x + 6, point.y - 4);
                        }
                        // Ledger lines
                        if (point.midi) {
                            const isTreble = point.midi >= 63 && point.midi <= 78;
                            const isBass = point.midi >= 42 && point.midi <= 58;
                            if (!isTreble && !isBass) {
                                const distToC4 = Math.abs(point.midi - 60);
                                const distToC2 = Math.abs(point.midi - 36);
                                const distToA5 = Math.abs(point.midi - 81);
                                if (distToC4 < 0.5 || distToC2 < 0.5 || distToA5 < 0.5) {
                                    const lineY = getYFromMidi(Math.round(point.midi));
                                    canvasCtx.beginPath(); canvasCtx.moveTo(x - 6, lineY); canvasCtx.lineTo(x + 6, lineY);
                                    canvasCtx.strokeStyle = '#000000'; canvasCtx.lineWidth = 1; canvasCtx.stroke();
                                }
                            }
                        }
                    }
                }
            }

            // --- ORIGIN LINE ---
            if (viewMode === 'staff' && currentMidi && currentY) {
                const originY = getYFromMidi(Math.round(currentMidi));
                canvasCtx.beginPath(); canvasCtx.moveTo(LEFT_MARGIN, originY); canvasCtx.lineTo(headX, currentY);
                canvasCtx.strokeStyle = isPerfect ? '#fbbf24' : 'rgba(255,255,255,0.3)';
                canvasCtx.setLineDash([2, 4]); canvasCtx.lineWidth = 1; canvasCtx.stroke(); canvasCtx.setLineDash([]);
                canvasCtx.beginPath(); canvasCtx.arc(LEFT_MARGIN, originY, 3, 0, Math.PI * 2);
                canvasCtx.fillStyle = isPerfect ? '#fbbf24' : 'rgba(255,255,255,0.5)'; canvasCtx.fill();
            }

            // --- PARTICLES ---
            if (currentY !== null && currentY > 0 && currentY < height) {
                const spawnCount = Math.floor(volume * 4) + 1;
                for (let k = 0; k < spawnCount; k++) {
                    let pColor = isPerfect ? '#fbbf24' : '#fff';
                    if (isUltraMode) {
                        const fireColors = ['#f59e0b', '#ea580c', '#b91c1c', '#ffffff'];
                        pColor = fireColors[Math.floor(Math.random() * fireColors.length)];
                    }

                    particlesRef.current.push({
                        x: headX, y: currentY,
                        vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4,
                        life: 1.0, size: Math.random() * 3 + 1, color: pColor
                    });
                }
            }

            if (particlesRef.current.length > 0) {
                canvasCtx.globalCompositeOperation = 'lighter';
                const surviving: Particle[] = [];
                for (const p of particlesRef.current) {
                    p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life -= 0.04;
                    if (p.life > 0) {
                        canvasCtx.globalAlpha = p.life; canvasCtx.fillStyle = p.color;
                        canvasCtx.beginPath(); canvasCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2); canvasCtx.fill();
                        surviving.push(p);
                    }
                }
                particlesRef.current = surviving;
                canvasCtx.globalCompositeOperation = 'source-over'; canvasCtx.globalAlpha = 1.0;
            }

            // --- HEAD CURSOR ---
            if (currentY !== null && currentY > 0 && currentY < height) {
                const cursorColor = isPerfect ? '#fbbf24' : color;
                canvasCtx.shadowBlur = 15; canvasCtx.shadowColor = cursorColor;
                canvasCtx.beginPath();
                if (viewMode === 'piano') canvasCtx.arc(headX, currentY, 6, 0, 2 * Math.PI);
                else canvasCtx.ellipse(headX, currentY, 7, 5, -0.2, 0, 2 * Math.PI);
                canvasCtx.fillStyle = isPerfect ? '#fbbf24' : '#fff'; canvasCtx.fill();

                if (viewMode === 'staff') {
                    canvasCtx.beginPath();
                    const isStemUp = (currentMidi || 0) < 71;
                    canvasCtx.moveTo(headX + (isStemUp ? 6 : -6), currentY); canvasCtx.lineTo(headX + (isStemUp ? 6 : -6), currentY + (isStemUp ? -30 : 30));
                    canvasCtx.strokeStyle = '#000000'; canvasCtx.lineWidth = 2; canvasCtx.stroke();
                }
                canvasCtx.shadowBlur = 0;
            }

            requestRef.current = requestAnimationFrame(draw);
        };
        draw();
        return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); }
    }, [isActive, ctx, analyser, baseOctave, numOctaves, horizZoom, color, autoScroll, viewMode, isFullscreen, isUltraMode, appMode, noteBlocks, draggingBlockId, currentTime, snapMode, pitchShift]);

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden">
            <canvas
                ref={canvasRef}
                className={`block w-full h-full ${isUltraMode ? 'cursor-ns-resize touch-none' : ''}`}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
            />

            {/* Mobile Toggle Button */}
            <button
                onClick={() => setShowMenu(!showMenu)}
                className={`absolute top-2 left-2 p-2 bg-slate-900/80 rounded-full text-slate-400 border border-slate-700 z-30 transition-transform ${isFullscreen ? 'translate-y-8' : ''}`}
            >
                {showMenu ? <X size={18} /> : <Settings2 size={18} />}
            </button>

            {showMenu && (
                <div className={`absolute top-12 left-2 flex flex-col gap-2 bg-slate-900/90 p-2 rounded-lg border border-slate-700 backdrop-blur z-30 ${isFullscreen ? 'translate-y-8' : ''}`}>
                    {isUltraMode && (
                        <div className="flex flex-col gap-1 pb-2 mb-2 border-b border-slate-700">
                            <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                                <Magnet size={10} /> Snap
                            </span>
                            <div className="flex gap-1">
                                <button onClick={() => setSnapMode('FREE')} className={`flex-1 px-2 py-1 text-[10px] rounded font-bold transition-colors ${snapMode === 'FREE' ? 'bg-orange-600 text-black' : 'bg-slate-800 text-slate-400'}`}>FREE</button>
                                <button onClick={() => setSnapMode('SEMI')} className={`flex-1 px-2 py-1 text-[10px] rounded font-bold transition-colors ${snapMode === 'SEMI' ? 'bg-orange-600 text-black' : 'bg-slate-800 text-slate-400'}`}>1/2</button>
                                <button onClick={() => setSnapMode('TONE')} className={`flex-1 px-2 py-1 text-[10px] rounded font-bold transition-colors ${snapMode === 'TONE' ? 'bg-orange-600 text-black' : 'bg-slate-800 text-slate-400'}`}>1</button>
                            </div>
                        </div>
                    )}
                    <button onClick={() => setAutoScroll(!autoScroll)} className={`p-2 rounded ${autoScroll ? 'bg-orange-500 text-black' : 'bg-slate-800 text-slate-400'}`}><Crosshair size={18} /></button>
                    <div className="h-[1px] bg-slate-700" />
                    <button onClick={() => setNumOctaves(p => Math.max(2, p - 1))} className="p-2 bg-slate-800 text-slate-400 rounded"><ZoomIn size={18} /></button>
                    <button onClick={() => setNumOctaves(p => Math.min(6, p + 1))} className="p-2 bg-slate-800 text-slate-400 rounded"><ZoomOut size={18} /></button>
                    <div className="h-[1px] bg-slate-700" />
                    <button onClick={() => setHorizZoom(p => Math.min(p + 1, 6))} className="p-2 bg-slate-800 text-slate-400 rounded"><Maximize2 size={18} /></button>
                    <button onClick={() => setHorizZoom(p => Math.max(p - 1, 1))} className="p-2 bg-slate-800 text-slate-400 rounded"><Minimize2 size={18} /></button>
                    <div className="h-[1px] bg-slate-700" />
                    <button onClick={() => { setBaseOctave(p => Math.min(p + 1, 6)); setAutoScroll(false); }} className="p-2 bg-slate-800 text-slate-400 rounded"><ArrowUp size={18} /></button>
                    <button onClick={() => { setBaseOctave(p => Math.max(p - 1, 0)); setAutoScroll(false); }} className="p-2 bg-slate-800 text-slate-400 rounded"><ArrowDown size={18} /></button>
                </div>
            )}
        </div>
    );
}
