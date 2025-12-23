import React from 'react';

interface MultiTrackStudioProps {
    tracks: any[];
    setTracks: (tracks: any[]) => void;
    isPlaying: boolean;
    onPlayPause: () => void;
    currentTime: number;
}

const MultiTrackStudio: React.FC<MultiTrackStudioProps> = ({
    tracks, isPlaying, onPlayPause
}) => {
    return (
        <div className="fixed inset-0 z-[100] bg-slate-950 text-white flex flex-col">

            {/* Header */}
            <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center px-4 justify-between">
                <span className="font-bold text-lg">VocalHarmony Pro - Landscape Studio</span>
                <button
                    onClick={onPlayPause}
                    className="px-4 py-2 bg-orange-600 rounded-lg font-bold"
                >
                    {isPlaying ? 'Pause' : 'Play'}
                </button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden">

                {/* Track List */}
                <div className="w-64 bg-slate-900 border-r border-slate-800 p-4 overflow-y-auto">
                    <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Tracks ({tracks.length})</h2>
                    {tracks.map((track, i) => (
                        <div
                            key={track.id || i}
                            className="p-3 mb-2 rounded-lg bg-slate-800 border-l-4"
                            style={{ borderColor: ['#EAB308', '#F97316', '#D946EF', '#3B82F6', '#22C55E'][i % 5] }}
                        >
                            <span className="font-bold text-sm">{track.name}</span>
                        </div>
                    ))}
                </div>

                {/* Timeline Area */}
                <div className="flex-1 bg-slate-950 p-4 overflow-auto">
                    <div className="h-8 bg-slate-900 rounded mb-4 flex items-center px-4">
                        <span className="text-xs text-slate-500 font-mono">Timeline</span>
                    </div>

                    {tracks.map((track, i) => (
                        <div
                            key={track.id || i}
                            className="h-16 mb-2 rounded-lg flex items-center px-4"
                            style={{ backgroundColor: ['#EAB308', '#F97316', '#D946EF', '#3B82F6', '#22C55E'][i % 5] + '40' }}
                        >
                            <span className="text-white font-bold text-sm">{track.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer */}
            <div className="h-14 bg-slate-900 border-t border-slate-800 flex items-center justify-center px-4">
                <span className="text-orange-500 font-mono font-bold">122 BPM</span>
            </div>
        </div>
    );
};

export default MultiTrackStudio;
