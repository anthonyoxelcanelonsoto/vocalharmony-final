import React, { useRef, useState } from 'react';
import { formatTime } from '../utils';

interface TimelineProps {
    currentTime: number;
    duration: number;
    loopStart: number | null;
    loopEnd: number | null;
    onSeek: (time: number) => void;
}

export const Timeline: React.FC<TimelineProps> = ({ currentTime, duration, loopStart, loopEnd, onSeek }) => {
    const progressBarRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [localDragTime, setLocalDragTime] = useState(0);

    const effectiveTime = isDragging ? localDragTime : currentTime;
    const progressPercent = duration > 0 ? (effectiveTime / duration) * 100 : 0;
    const loopStartPercent = loopStart !== null && duration > 0 ? (loopStart / duration) * 100 : null;
    const loopEndPercent = loopEnd !== null && duration > 0 ? (loopEnd / duration) * 100 : null;

    // Helper to calculate time from clientX
    const getTimeFromClientX = (clientX: number) => {
        if (!progressBarRef.current) return 0;
        const rect = progressBarRef.current.getBoundingClientRect();
        let x = clientX - rect.left;
        let percent = x / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        return percent * duration;
    };

    // Initial Start Handlers (Attached to Div)
    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setLocalDragTime(getTimeFromClientX(e.clientX));
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        setIsDragging(true);
        setLocalDragTime(getTimeFromClientX(e.touches[0].clientX));
    };

    // Global Move/Up Handlers (Attached to Window)
    React.useEffect(() => {
        if (!isDragging) return;

        const handleGlobalMove = (e: MouseEvent | TouchEvent) => {
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            setLocalDragTime(getTimeFromClientX(clientX));
        };

        const handleGlobalUp = (e: MouseEvent | TouchEvent) => {
            const clientX = 'changedTouches' in e ? e.changedTouches[0].clientX : (e as MouseEvent).clientX;
            const finalTime = getTimeFromClientX(clientX);
            setIsDragging(false);
            onSeek(finalTime);
        };

        window.addEventListener('mousemove', handleGlobalMove);
        window.addEventListener('mouseup', handleGlobalUp);
        window.addEventListener('touchmove', handleGlobalMove, { passive: false });
        window.addEventListener('touchend', handleGlobalUp);

        return () => {
            window.removeEventListener('mousemove', handleGlobalMove);
            window.removeEventListener('mouseup', handleGlobalUp);
            window.removeEventListener('touchmove', handleGlobalMove);
            window.removeEventListener('touchend', handleGlobalUp);
        };
    }, [isDragging, duration, onSeek]);

    return (
        <div className="w-full flex flex-col gap-1 select-none">
            {/* Info Row */}
            <div className="flex justify-between items-center text-[10px] font-bold tracking-widest text-orange-500 mb-1">
                <span>{formatTime(effectiveTime)}</span>
                <span className="text-slate-600">{formatTime(duration)}</span>
            </div>

            {/* Fat Scrubber */}
            <div
                ref={progressBarRef}
                className="relative h-6 w-full cursor-pointer touch-none bg-slate-900 rounded overflow-hidden border border-slate-800"
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
            >
                {/* Loop Region */}
                {(loopStartPercent !== null && loopEndPercent !== null) && (
                    <div
                        className="absolute h-full bg-lime-900/30 border-l border-r border-lime-500/50"
                        style={{ left: `${loopStartPercent}%`, width: `${loopEndPercent - loopStartPercent}%` }}
                    />
                )}

                {/* Progress Bar */}
                <div
                    className="absolute h-full bg-orange-600 opacity-30"
                    style={{ width: `${progressPercent}%` }}
                />

                {/* Handle (Big for thumb) */}
                <div
                    className="absolute top-0 h-full w-1 bg-lime-400 shadow-[0_0_10px_rgba(132,204,22,0.8)] z-20"
                    style={{ left: `${progressPercent}%` }}
                >
                    <div className="absolute top-0 -left-1.5 w-4 h-full bg-transparent"></div> {/* Touch Area */}
                </div>
            </div>
        </div>
    );
};