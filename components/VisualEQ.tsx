import React, { useRef, useEffect, useState } from 'react';
import { Track } from '../types';

interface VisualEQProps {
    track: Track;
    analyser?: AnalyserNode;
    onChange: (newEq: NonNullable<Track['eq']>) => void;
}

export const VisualEQ: React.FC<VisualEQProps> = ({ track, analyser, onChange }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef<'low' | 'lowMid' | 'mid' | 'highMid' | 'high' | null>(null);

    // Offline nodes for curve calculation
    const offlineCtxRef = useRef<OfflineAudioContext | null>(null);
    const filtersRef = useRef<{
        low: BiquadFilterNode,
        lowMid: BiquadFilterNode,
        mid: BiquadFilterNode,
        highMid: BiquadFilterNode,
        high: BiquadFilterNode
    } | null>(null);

    // Init Offline Context for calculation
    useEffect(() => {
        try {
            const ctx = new OfflineAudioContext(1, 1, 48000);

            const low = ctx.createBiquadFilter();
            low.type = "lowshelf";

            const lowMid = ctx.createBiquadFilter();
            lowMid.type = "peaking";

            const mid = ctx.createBiquadFilter();
            mid.type = "peaking";

            const highMid = ctx.createBiquadFilter();
            highMid.type = "peaking";

            const high = ctx.createBiquadFilter();
            high.type = "highshelf";

            offlineCtxRef.current = ctx;
            filtersRef.current = { low, lowMid, mid, highMid, high };
        } catch (e) {
            console.error("Could not create offline context for EQ vis", e);
        }
    }, []);

    // DRAW LOOP
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !track.eq || !filtersRef.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frameId = 0;

        // Prepare frequency array for curve
        const width = canvas.width;
        const FREQ_COUNT = width;
        const freqs = new Float32Array(FREQ_COUNT);
        // Logarithmic scale 20Hz to 20000Hz
        for (let i = 0; i < FREQ_COUNT; i++) {
            const t = i / (FREQ_COUNT - 1);
            freqs[i] = 20 * Math.pow(1000, t);
        }

        // Response Arrays
        const magLow = new Float32Array(FREQ_COUNT);
        const phaseLow = new Float32Array(FREQ_COUNT);

        const magLowMid = new Float32Array(FREQ_COUNT);
        const phaseLowMid = new Float32Array(FREQ_COUNT);

        const magMid = new Float32Array(FREQ_COUNT);
        const phaseMid = new Float32Array(FREQ_COUNT);

        const magHighMid = new Float32Array(FREQ_COUNT);
        const phaseHighMid = new Float32Array(FREQ_COUNT);

        const magHigh = new Float32Array(FREQ_COUNT);
        const phaseHigh = new Float32Array(FREQ_COUNT);

        const draw = () => {
            if (!filtersRef.current || !track.eq) return;

            const { low, lowMid, mid, highMid, high } = filtersRef.current;

            // Sync dummy nodes with track state
            // Low
            low.frequency.value = track.eq.low.freq;
            low.gain.value = track.eq.low.gain;

            // LowMid
            lowMid.frequency.value = track.eq.lowMid.freq;
            lowMid.Q.value = track.eq.lowMid.q;
            lowMid.gain.value = track.eq.lowMid.gain;

            // Mid
            mid.frequency.value = track.eq.mid.freq;
            mid.Q.value = track.eq.mid.q;
            mid.gain.value = track.eq.mid.gain;

            // HighMid
            highMid.frequency.value = track.eq.highMid.freq;
            highMid.Q.value = track.eq.highMid.q;
            highMid.gain.value = track.eq.highMid.gain;

            // High
            high.frequency.value = track.eq.high.freq;
            high.gain.value = track.eq.high.gain;

            // Get responses
            low.getFrequencyResponse(freqs, magLow, phaseLow);
            lowMid.getFrequencyResponse(freqs, magLowMid, phaseLowMid);
            mid.getFrequencyResponse(freqs, magMid, phaseMid);
            highMid.getFrequencyResponse(freqs, magHighMid, phaseHighMid);
            high.getFrequencyResponse(freqs, magHigh, phaseHigh);

            // CLEAR
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // 1. DRAW SPECTRUM BACKGROUND
            if (analyser) {
                const bufferLength = analyser.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyser.getByteFrequencyData(dataArray);

                ctx.beginPath();
                ctx.moveTo(0, canvas.height);
                ctx.fillStyle = 'rgba(100, 116, 139, 0.2)';

                for (let i = 0; i < width; i++) {
                    const f = freqs[i];
                    const nyquist = analyser.context.sampleRate / 2;
                    const index = Math.min(bufferLength - 1, Math.floor((f / nyquist) * bufferLength));
                    const val = dataArray[index] / 255.0;

                    const y = canvas.height * (1 - val);
                    ctx.lineTo(i, y);
                }
                ctx.lineTo(width, canvas.height);
                ctx.fill();
            }

            // 2. DRAW GRID
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const y0 = canvas.height / 2;
            ctx.moveTo(0, y0); ctx.lineTo(width, y0);
            ctx.stroke();

            // 3. DRAW EQ CURVE
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();

            for (let i = 0; i < width; i++) {
                // Sum magnitudes (linear mult)
                const totalMag = magLow[i] * magLowMid[i] * magMid[i] * magHighMid[i] * magHigh[i];
                const db = 20 * Math.log10(totalMag);

                const rangeDB = 20;
                let y = (canvas.height / 2) - (db / rangeDB) * (canvas.height / 2);

                if (i === 0) ctx.moveTo(i, y);
                else ctx.lineTo(i, y);
            }
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(255,255,255,0.5)';
            ctx.stroke();
            ctx.shadowBlur = 0;

            // 4. DRAW HANDLES
            const getX = (f: number) => {
                const t = Math.log(f / 20) / Math.log(1000);
                return t * width;
            };
            const getY = (g: number) => {
                const rangeDB = 20;
                return (canvas.height / 2) - (g / rangeDB) * (canvas.height / 2);
            };

            const bands = [
                { id: 'low', ...track.eq.low, color: '#a78bfa' },      // Purple
                { id: 'lowMid', ...track.eq.lowMid, color: '#6366f1' }, // Indigo
                { id: 'mid', ...track.eq.mid, color: '#2dd4bf' },      // Teal
                { id: 'highMid', ...track.eq.highMid, color: '#facc15' },// Yellow
                { id: 'high', ...track.eq.high, color: '#f472b6' }     // Pink
            ];

            bands.forEach(b => {
                const x = getX(b.freq);
                const y = getY(b.gain);

                ctx.beginPath();
                ctx.arc(x, y, 6, 0, Math.PI * 2);
                ctx.fillStyle = b.color;
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                if (draggingRef.current === b.id) {
                    ctx.shadowBlur = 15;
                    ctx.shadowColor = b.color;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }
            });

            frameId = requestAnimationFrame(draw);
        };

        draw();
        return () => cancelAnimationFrame(frameId);
    }, [track.eq, analyser]);

    // INTERACTION
    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas || !track.eq) return;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        const x = clientX - rect.left;
        const y = clientY - rect.top;

        const getX = (f: number) => (Math.log(f / 20) / Math.log(1000)) * canvas.width;
        const getY = (g: number) => (canvas.height / 2) - (g / 20) * (canvas.height / 2);

        const bands = [
            { id: 'low', ...track.eq.low },
            { id: 'lowMid', ...track.eq.lowMid },
            { id: 'mid', ...track.eq.mid },
            { id: 'highMid', ...track.eq.highMid },
            { id: 'high', ...track.eq.high }
        ];

        let closest = null;
        let minDist = 30; // hit radius

        for (const b of bands) {
            const hx = getX(b.freq);
            const hy = getY(b.gain);
            const dist = Math.sqrt((x - hx) ** 2 + (y - hy) ** 2);
            if (dist < minDist) {
                closest = b.id;
                minDist = dist;
            }
        }

        if (closest) {
            draggingRef.current = closest as any;
        }
    };

    const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
        if (!draggingRef.current || !track.eq || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

        let x = clientX - rect.left;
        let y = clientY - rect.top;

        x = Math.max(0, Math.min(canvas.width, x));
        y = Math.max(0, Math.min(canvas.height, y));

        const t = x / canvas.width;
        const freq = 20 * Math.pow(1000, t);
        const gain = 20 * (1 - (2 * y / canvas.height));

        const band = draggingRef.current;
        const newEq = { ...track.eq };

        if (band === 'low') {
            newEq.low = { ...newEq.low, freq, gain };
        } else if (band === 'lowMid') {
            newEq.lowMid = { ...newEq.lowMid, freq, gain };
        } else if (band === 'mid') {
            newEq.mid = { ...newEq.mid, freq, gain };
        } else if (band === 'highMid') {
            newEq.highMid = { ...newEq.highMid, freq, gain };
        } else if (band === 'high') {
            newEq.high = { ...newEq.high, freq, gain };
        }

        onChange(newEq);
    };

    const handleEnd = () => {
        draggingRef.current = null;
    };

    return (
        <div
            ref={containerRef}
            className="w-full h-64 bg-slate-950 rounded-xl border border-slate-800 relative overflow-hidden touch-none"
            onMouseDown={handleStart}
            onTouchStart={handleStart}
            onMouseMove={handleMove}
            onTouchMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchEnd={handleEnd}
        >
            <canvas
                ref={canvasRef}
                width={600}
                height={256}
                className="w-full h-full"
            />
        </div>
    );
};
