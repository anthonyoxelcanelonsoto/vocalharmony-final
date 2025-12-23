import React, { useState, useRef, useEffect } from 'react';
import {
    Play, Pause, SkipBack, Rewind, FastForward,
    Mic, Volume2, Search, Filter, MoreHorizontal,
    Heart, Plus, Upload, X, ChevronLeft, ChevronRight,
    Music, Layers, Settings, Share, Undo, Redo, Download,
    Sliders, Activity
} from 'lucide-react';
// import { useLiveQuery } from 'dexie-react-hooks'; // COMMENTED OUT FOR DEBUG
// import { db } from '../src/db'; // COMMENTED OUT FOR DEBUG
import { Track } from '../types';

interface MultiTrackStudioProps {
    tracks: Track[];
    setTracks: (tracks: Track[]) => void;
    isPlaying: boolean;
    onPlayPause: () => void;
    currentTime: number;
}

const MultiTrackStudio: React.FC<MultiTrackStudioProps> = ({
    tracks, setTracks, isPlaying, onPlayPause, currentTime
}) => {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const headersRef = useRef<HTMLDivElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);

    // DEBUGGING: Removed DB Call
    const librarySongs: any[] = [];

    // Scroll Synchronization
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (headersRef.current) {
            headersRef.current.scrollTop = e.currentTarget.scrollTop;
        }
    };

    const bars = Array.from({ length: 50 }, (_, i) => i + 1);

    // Helper for vibrant colors
    const getTrackColor = (index: number) => {
        const colors = ['#Eab308', '#F97316', '#D946EF', '#3B82F6', '#22C55E', '#ff0055'];
        return colors[index % colors.length];
    };

    return (
        <div className="fixed inset-0 z-[100] h-screen w-screen bg-slate-950 text-white flex overflow-hidden font-sans select-none">

            {/* 2. SIDEBAR (Library) */}
            {sidebarOpen && (
                <aside className="w-80 flex-shrink-0 bg-neutral-900 border-r border-neutral-800 flex flex-col z-20">
                    <div className="h-14 flex items-center px-4 border-b border-neutral-800 justify-between">
                        <span className="font-bold text-sm tracking-widest uppercase text-slate-400">My Workspace</span>
                        <div className="flex gap-2">
                            <Search size={16} className="text-slate-400 hover:text-white cursor-pointer" />
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-neutral-800">
                        {['Liked', 'Project', 'Edits'].map(f => (
                            <button key={f} className="px-3 py-1 rounded-full bg-neutral-800 text-xs font-medium text-slate-300 hover:bg-slate-700 whitespace-nowrap border border-white/5">
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto">
                        {(!librarySongs || librarySongs.length === 0) && (
                            <div className="p-8 text-center text-slate-600 text-xs">
                                Library (DB Disabled for Debug)
                            </div>
                        )}
                    </div>
                </aside>
            )}

            {/* 3. MAIN AREA */}
            <main className="flex-1 flex flex-col min-w-0 bg-slate-950">

                {/* 5. HEADER */}
                <header className="h-12 bg-neutral-900 border-b border-neutral-800 flex items-center px-4 justify-between flex-shrink-0 z-30 shadow-md">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-neutral-800 rounded-lg text-slate-400 active:scale-95 transition">
                            <Layers size={18} />
                        </button>
                        <div className="flex items-center gap-2">
                            <button className="text-slate-500 hover:text-white"><ChevronLeft size={16} /></button>
                            <span className="font-bold text-xs text-slate-300 bg-neutral-800 px-2 py-1 rounded border border-white/5">16.5s Grabación</span>
                            <button className="text-slate-500 hover:text-white"><ChevronRight size={16} /></button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="p-2 hover:bg-neutral-800 rounded text-slate-400 hover:text-white"><Undo size={16} /></button>
                        <button className="p-2 hover:bg-neutral-800 rounded text-slate-400 hover:text-white"><Redo size={16} /></button>
                        <button className="bg-orange-600/90 hover:bg-orange-500 border border-orange-500/50 px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 text-white shadow-lg shadow-orange-900/20 active:scale-95 transition">
                            <Download size={14} /> Export
                        </button>
                    </div>
                </header>

                {/* CONTENT GRID */}
                <div className="flex-1 flex overflow-hidden relative">

                    {/* A. TRACK HEADERS */}
                    <div ref={headersRef} className="w-64 flex-shrink-0 bg-neutral-900 border-r border-neutral-800 overflow-hidden select-none z-10 shadow-xl">
                        <div className="h-8 border-b border-neutral-800 bg-neutral-900 flex items-center px-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            Tracks
                        </div>
                        <div className='pb-20'>
                            {tracks.map((track, i) => (
                                <div key={track.id} className="h-24 border-b border-neutral-800 flex relative group bg-neutral-900 hover:bg-neutral-800 transition-colors">
                                    <div className="w-1.5 h-full" style={{ backgroundColor: getTrackColor(i) }}></div>
                                    <div className="flex-1 p-2 flex flex-col justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black text-black shadow-lg" style={{ backgroundColor: getTrackColor(i) }}>
                                                {i + 1}
                                            </div>
                                            <span className="text-xs font-bold text-slate-200 truncate flex-1">{track.name}</span>
                                            <Settings size={12} className="text-slate-600 hover:text-white cursor-pointer" />
                                        </div>

                                        <div className="flex items-center gap-1.5 mt-1">
                                            <button className={`w-6 h-5 rounded flex items-center justify-center text-[9px] font-black border transition-all ${track.solo ? 'bg-yellow-400 text-black border-yellow-500' : 'bg-neutral-950 text-slate-500 border-neutral-800 hover:border-slate-500'}`}>S</button>
                                            <button className={`w-6 h-5 rounded flex items-center justify-center text-[9px] font-black border transition-all ${track.mute ? 'bg-red-500 text-white border-red-500' : 'bg-neutral-950 text-slate-500 border-neutral-800 hover:border-slate-500'}`}>M</button>
                                            <div className="h-5 flex-1 bg-neutral-950 border border-neutral-800 rounded flex items-center px-2 text-[9px] text-slate-500 font-mono overflow-hidden whitespace-nowrap">
                                                No Input
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 mt-1">
                                            <Volume2 size={12} className="text-slate-500" />
                                            <div className="flex-1 h-1 bg-neutral-950 rounded-full overflow-hidden">
                                                <div className="h-full bg-slate-400 rounded-full" style={{ width: `${(track.vol || 1) * 80}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <button onClick={() => { }} className='w-full py-2 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-white hover:bg-neutral-800 transition-colors border-b border-neutral-800'>
                                <Plus size={14} /> Add Track
                            </button>
                        </div>
                    </div>

                    {/* B. TIMELINE */}
                    <div ref={timelineRef} onScroll={handleScroll} className="flex-1 bg-slate-950 overflow-auto relative custom-scrollbar">
                        <div className="min-w-[150vw] h-full relative pb-20">
                            {/* Ruler */}
                            <div className="h-8 border-b border-neutral-800 flex sticky top-0 bg-slate-950 z-20 shadow-md">
                                {bars.map(b => (
                                    <div key={b} className="w-24 flex-shrink-0 border-r border-neutral-800/50 text-[9px] text-slate-600 pl-1 pt-2 font-mono select-none">
                                        {b}
                                    </div>
                                ))}
                            </div>

                            {/* Grid */}
                            <div className="relative">
                                <div className="absolute inset-0 flex pointer-events-none h-full">
                                    {bars.map(b => <div key={b} className="w-24 flex-shrink-0 border-r border-neutral-800/30 h-full"></div>)}
                                </div>

                                {/* Playhead */}
                                <div className="absolute top-0 bottom-0 w-[1px] bg-white z-30 shadow-[0_0_10px_rgba(255,255,255,0.5)] pointer-events-none" style={{ left: '100px' }}>
                                    <div className="w-3 h-3 -ml-1.5 bg-white rounded-full shadow-lg mt-[-6px]"></div>
                                </div>

                                {/* Track Rows */}
                                {tracks.map((track, i) => (
                                    <div key={track.id} className="h-24 border-b border-neutral-800/50 relative group hover:bg-white/[0.02]" >
                                        <div className="absolute top-2 bottom-2 rounded-md overflow-hidden flex items-center cursor-pointer hover:brightness-110 transition-all border border-white/10 shadow-md"
                                            style={{
                                                left: `${i * 50 + 20}px`,
                                                width: '400px',
                                                backgroundColor: getTrackColor(i),
                                            }}>
                                            <div className='w-full h-full opacity-60 mix-blend-multiply flex items-center justify-around overflow-hidden'
                                                style={{ backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.3) 50%)', backgroundSize: '4px 100%' }}>
                                                <div className="absolute top-1 left-2 text-[10px] font-bold text-black/70 uppercase tracking-wider bg-white/30 px-1 rounded backdrop-blur-sm">
                                                    {track.name}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. BOTTOM BAR */}
                <footer className="h-16 bg-neutral-900 border-t border-neutral-800 flex items-center px-4 justify-between gap-6 flex-shrink-0 z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.3)]">
                    <div className="flex items-center gap-2">
                        <button className="flex items-center gap-2 px-3 py-2 bg-neutral-800 rounded-lg border border-neutral-700 hover:bg-neutral-700 text-xs font-bold text-slate-300 transition-colors">
                            <Plus size={14} className="text-green-500" /> New
                        </button>
                    </div>

                    {/* Center */}
                    <div className="flex-1 max-w-xl bg-black/40 backdrop-blur-md rounded-full border border-white/10 p-1 flex items-center shadow-2xl relative">
                        <button className="px-3 py-1.5 flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white border-r border-white/10">
                            <Music size={12} className="text-fuchsia-500" /> <span className="hidden lg:inline">Vocals</span>
                        </button>
                        <span className="text-xs text-slate-500 px-4">Generate AI Track...</span>
                    </div>

                    <div className="flex items-center gap-6">
                        <span className="text-orange-500 font-mono text-xs font-bold">122 BPM</span>
                        <button onClick={onPlayPause} className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition">
                            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                        </button>
                    </div>
                </footer>
            </main>
        </div>
    );
};

export default MultiTrackStudio;
