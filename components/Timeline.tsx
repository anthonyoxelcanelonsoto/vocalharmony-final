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

    const handleInteraction = (e: React.MouseEvent | React.TouchEvent, isEnd: boolean = false) => {
        if (!progressBarRef.current) return;
        const rect = progressBarRef.current.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        
        let x = clientX - rect.left;
        let percent = x / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        
        const newTime = percent * duration;

        if (isEnd) {
            onSeek(newTime);
            setIsDragging(false);
        } else {
            setLocalDragTime(newTime);
            setIsDragging(true);
        }
    };

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
                onMouseDown={(e) => handleInteraction(e)}
                onMouseMove={(e) => isDragging && handleInteraction(e)}
                onMouseUp={(e) => isDragging && handleInteraction(e, true)}
                onTouchStart={(e) => handleInteraction(e)}
                onTouchMove={(e) => handleInteraction(e)}
                onTouchEnd={(e) => isDragging && handleInteraction(e, true)}
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