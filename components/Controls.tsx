import React, { useRef, useState, useEffect } from 'react';

// Haptic helper for controls
const vibrate = (ms: number = 5) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
    }
};

interface KnobProps {
    value: number;
    color: string;
    size?: 'sm' | 'md' | 'lg';
    onChange?: (val: number) => void;
    label?: string;
    disabled?: boolean;
    min?: number;
    max?: number;
}

export const Knob: React.FC<KnobProps> = ({ value, color, size = 'md', onChange, label, disabled, min = 0, max = 1 }) => {
    const [isDragging, setIsDragging] = useState(false);
    const startY = useRef(0);
    const startVal = useRef(0);

    // Size configurations
    const sizeClasses = {
        sm: 'w-8 h-8',
        md: 'w-10 h-10',
        lg: 'w-14 h-14'
    };

    const indicatorSize = {
        sm: 'h-3 w-0.5',
        md: 'h-4 w-1',
        lg: 'h-6 w-1.5'
    };

    useEffect(() => {
        const handleMove = (e: MouseEvent | TouchEvent) => {
            if (!isDragging || !onChange) return;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
            const delta = startY.current - clientY;
            // Sensitivity: 200px = full range
            const range = max - min;
            const change = (delta / 200) * range;
            const newVal = Math.max(min, Math.min(max, startVal.current + change));
            onChange(newVal);
        };
        const handleUp = () => setIsDragging(false);

        if (isDragging) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('touchmove', handleMove);
            window.addEventListener('mouseup', handleUp);
            window.addEventListener('touchend', handleUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('touchend', handleUp);
        };
    }, [isDragging, onChange, min, max]);

    const handleStart = (e: React.MouseEvent | React.TouchEvent) => {
        if (disabled || !onChange) return;
        vibrate(5);
        setIsDragging(true);
        startY.current = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        startVal.current = value;
        e.stopPropagation();
        // e.preventDefault(); // Handled by touch-action in CSS
    };

    // Normalize for rotation (0 to 1)
    const normalized = (value - min) / (max - min);

    return (
        <div className={`flex flex-col items-center gap-1 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
            <div
                className="flex flex-col items-center touch-none relative"
                onMouseDown={handleStart}
                onTouchStart={handleStart}
            >
                <div className={`relative rounded-full border bg-slate-900 flex items-center justify-center shadow-lg transition-all ${sizeClasses[size]} ${isDragging ? 'border-lime-400 ring-2 ring-lime-400/20' : 'border-slate-700'}`}>
                    {/* Background Tick Marks */}
                    <svg className="absolute inset-0 w-full h-full p-0.5 opacity-30 pointer-events-none" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="48" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="4 4" className="text-slate-500" />
                    </svg>

                    <div
                        className={`rounded-full absolute top-[10%] origin-bottom transition-transform duration-75 ${indicatorSize[size]}`}
                        style={{
                            transform: `rotate(${(normalized * 270) - 135}deg)`,
                            backgroundColor: isDragging ? '#a3e635' : color,
                            boxShadow: `0 0 8px ${isDragging ? '#a3e635' : color}`
                        }}
                    />
                </div>
            </div>
            {label && <span className="text-[9px] font-bold text-slate-500 tracking-wider uppercase">{label}</span>}
        </div>
    );
};

export const MiniFader: React.FC<{ value: number; color: string; onChange: (val: number) => void; disabled?: boolean }> = ({ value, color, onChange, disabled }) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState(false);

    const handleInteraction = (e: React.MouseEvent | React.TouchEvent) => {
        if (!trackRef.current) return;

        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        const rect = trackRef.current.getBoundingClientRect();

        // Logic to ensure 0 and 1 are easily reachable
        // We define the usable track height slightly smaller than full height 
        // to account for the handle size, then map touch to value.
        const HANDLE_HEIGHT = 16;
        const USABLE_HEIGHT = rect.height - HANDLE_HEIGHT;

        let relativeY = clientY - rect.top - (HANDLE_HEIGHT / 2);

        // Invert (bottom is 0)
        let val = 1 - (relativeY / USABLE_HEIGHT);

        // Clamp with a small buffer to make 0/1 "sticky"
        if (val > 0.96) val = 1;
        if (val < 0.04) val = 0;

        val = Math.max(0, Math.min(1, val));

        onChange(val);
    };

    const startDrag = (e: React.MouseEvent | React.TouchEvent) => {
        if (disabled) return;
        setActive(true);
        vibrate(5);
        handleInteraction(e);

        const move = (ev: any) => handleInteraction(ev);
        const end = () => {
            setActive(false);
            window.removeEventListener('mousemove', move);
            window.removeEventListener('touchmove', move);
            window.removeEventListener('mouseup', end);
            window.removeEventListener('touchend', end);
        };

        window.addEventListener('mousemove', move);
        window.addEventListener('touchmove', move, { passive: false });
        window.addEventListener('mouseup', end);
        window.addEventListener('touchend', end);
    };

    return (
        <div
            className={`flex flex-col items-center gap-1 h-full w-10 pb-1 ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        >
            <div
                ref={trackRef}
                onMouseDown={startDrag}
                onTouchStart={startDrag}
                className="relative w-8 flex-1 bg-slate-950 rounded-lg border border-slate-800 touch-none cursor-pointer flex justify-center py-2"
            >
                {/* Groove */}
                <div className="w-1 h-full bg-slate-900 rounded-full shadow-inner relative">
                    {/* Fill */}
                    <div
                        className="absolute bottom-0 w-full rounded-full opacity-60 transition-all duration-75"
                        style={{ height: `${value * 100}%`, backgroundColor: color }}
                    ></div>
                </div>

                {/* Handle */}
                <div
                    className={`absolute left-0 right-0 h-4 mx-1 rounded border shadow-lg flex items-center justify-center transition-transform duration-75 ${active ? 'scale-110 border-lime-400' : 'border-slate-600'}`}
                    style={{
                        bottom: `${value * 100}%`,
                        marginBottom: '-8px', // Center handle
                        backgroundColor: '#1e293b'
                    }}
                >
                    <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: active ? '#bef264' : color }}></div>
                </div>
            </div>
            <span className="text-[9px] font-bold text-slate-500 tracking-wider">VOL</span>
        </div>
    );
};

export const VuMeter: React.FC<{ analyser?: AnalyserNode; isPlaying: boolean }> = ({ analyser, isPlaying }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef<number>();

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const draw = () => {
            if (!isPlaying || !analyser) {
                // Draw inactive state
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#1e293b';
                const segHeight = (canvas.height - 2) / 10;
                for (let i = 0; i < 10; i++) {
                    ctx.fillRect(0, i * segHeight + 0.5, canvas.width, segHeight - 1);
                }
                return;
            }

            const bufferLength = analyser.fftSize;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(dataArray);

            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                const x = (dataArray[i] - 128) / 128.0;
                sum += x * x;
            }
            const rms = Math.sqrt(sum / bufferLength);
            const volume = Math.min(rms * 5, 1);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const segments = 12;
            const activeSegments = Math.floor(volume * segments);
            const segHeight = (canvas.height) / segments;

            for (let i = 0; i < segments; i++) {
                const reverseIndex = segments - 1 - i;
                if (i < activeSegments) {
                    if (reverseIndex < 2) ctx.fillStyle = '#ef4444';
                    else if (reverseIndex < 5) ctx.fillStyle = '#f59e0b';
                    else ctx.fillStyle = '#10b981';
                } else {
                    ctx.fillStyle = '#1e293b';
                }
                ctx.fillRect(0, reverseIndex * segHeight + 0.5, canvas.width, segHeight - 1);
            }
            rafRef.current = requestAnimationFrame(draw);
        };
        draw();
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [analyser, isPlaying]);

    return <canvas ref={canvasRef} width={12} height={50} className="w-3 h-12 rounded bg-slate-950 border border-slate-800/50" />;
};

export const SignalLight: React.FC<{ analyser?: AnalyserNode; isPlaying: boolean; color: string }> = ({ analyser, isPlaying, color }) => {
    const lightRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number>();

    useEffect(() => {
        const draw = () => {
            if (!lightRef.current) return;

            let intensity = 0;

            if (isPlaying && analyser) {
                const bufferLength = analyser.fftSize;
                // Using TimeDomain for waveform volume/RMS
                const dataArray = new Uint8Array(bufferLength);
                analyser.getByteTimeDomainData(dataArray);

                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const x = (dataArray[i] - 128) / 128.0;
                    sum += x * x;
                }
                const rms = Math.sqrt(sum / bufferLength);
                // Amplify signal for visual effect (LEDs light up easily)
                intensity = Math.min(rms * 15, 1);
            }

            // Visual Logic:
            // Base state: Dim (0.2 opacity)
            // On state: Bright (1.0 opacity) + Glow (Box Shadow)

            // Only update DOM if necessary (though browsers optimize this well)
            const isActive = intensity > 0.05;

            // Allow slight "decay" visual feel or direct response
            lightRef.current.style.backgroundColor = color;
            lightRef.current.style.opacity = isActive ? '1' : '0.2';
            lightRef.current.style.boxShadow = isActive ? `0 0 ${intensity * 10}px ${color}` : 'none';
            // Slight scale effect on kick drum / loud sounds
            lightRef.current.style.transform = isActive ? `scale(${1 + intensity * 0.3})` : 'scale(1)';

            rafRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [analyser, isPlaying, color]);

    return (
        <div className="w-8 h-2 rounded-full bg-slate-900 overflow-hidden flex items-center justify-center border border-slate-800/50">
            <div
                ref={lightRef}
                className="w-4 h-1.5 rounded-full transition-colors duration-75 will-change-[opacity,box-shadow,transform]"
            />
        </div>
    );
};