import React, { useState, useRef, useEffect } from 'react';
import {
    Play, Pause, SkipBack, Rewind, FastForward,
    Mic, Volume2, Search, Filter, MoreHorizontal,
    Heart, Plus, Upload, X, ChevronLeft, ChevronRight,
    Music, Layers, Settings, Share, Undo, Redo, Download,
    Sliders, Activity
} from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../src/db';
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

    // Library Data from Dexie
    const librarySongs = useLiveQuery(() => (db as any).myLibrary.toArray(), []);

    // Scroll Synchronization
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (headersRef.current) {
            headersRef.current.scrollTop = e.currentTarget.scrollTop;
        }
    };

    const bars = Array.from({ length: 50 }, (_, i) => i + 1);

    return (
        <div className="h-screen w-screen bg-[#121212] text-white flex overflow-hidden font-sans select-none fixed inset-0 z-[100]">

            {/* 2. SIDEBAR (Library) */}
            {sidebarOpen && (
                <aside className="w-80 flex-shrink-0 bg-[#1E1E1E] border-r border-[#2C2C2C] flex flex-col z-20">
                    <div className="h-14 flex items-center px-4 border-b border-[#2C2C2C] justify-between">
                        <span className="font-bold text-sm tracking-widest uppercase text-slate-400">My Workspace</span>
                        <div className="flex gap-2">
                            <Search size={16} className="text-slate-400 hover:text-white cursor-pointer" />
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-[#2C2C2C]">
                        {['Liked', 'Project', 'Edits'].map(f => (
                            <button key={f} className="px-3 py-1 rounded-full bg-[#2C2C2C] text-xs font-medium text-slate-300 hover:bg-slate-700 whitespace-nowrap border border-white/5">
                                {f}
                            </button>
                        ))}
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-y-auto">
                        {librarySongs?.map((song: any) => (
                            <div key={song.id} className="flex items-center gap-3 p-3 hover:bg-[#2C2C2C] border-b border-[#2C2C2C]/50 group transition-colors cursor-pointer">
                                <div className="w-12 h-12 rounded bg-slate-800 flex-shrink-0 relative overflow-hidden ring-1 ring-white/10">
                                    <img
                                        src={song.cover_url || 'https://via.placeholder.com/150'}
                                        className="w-full h-full object-cover"
                                        alt={song.title}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-center">
                                        <h4 className="text-sm font-bold truncate text-slate-200">{song.title}</h4>
                                        <button className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-white"><MoreHorizontal size={14} /></button>
                                    </div>
                                    <p className="text-[10px] text-slate-500 truncate">{song.artist || 'Unknown Artist'}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-[9px] bg-orange-500/20 text-orange-500 px-1 rounded font-mono">v1</span>
                                        <span className="text-[9px] text-slate-600 font-mono">120 BPM • Cm</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {(!librarySongs || librarySongs.length === 0) && (
                            <div className="p-8 text-center text-slate-600 text-xs">
                                No songs in library
                            </div>
                        )}
                    </div>
                </aside>
            )}

            {/* 3. MAIN AREA */}
            <main className="flex-1 flex flex-col min-w-0 bg-[#121212]">

                {/* 5. HEADER */}
                <header className="h-12 bg-[#1E1E1E] border-b border-[#2C2C2C] flex items-center px-4 justify-between flex-shrink-0 z-30 shadow-md">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 hover:bg-[#2C2C2C] rounded-lg text-slate-400 active:scale-95 transition">
                            <Layers size={18} />
                        </button>
                        <div className="flex items-center gap-2">
                            <button className="text-slate-500 hover:text-white"><ChevronLeft size={16} /></button>
                            <span className="font-bold text-xs text-slate-300 bg-[#2C2C2C] px-2 py-1 rounded border border-white/5">16.5s Grabación (Remastered)</span>
                            <button className="text-slate-500 hover:text-white"><ChevronRight size={16} /></button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button className="p-2 hover:bg-[#2C2C2C] rounded text-slate-400 hover:text-white"><Undo size={16} /></button>
                        <button className="p-2 hover:bg-[#2C2C2C] rounded text-slate-400 hover:text-white"><Redo size={16} /></button>
                        <button className="bg-orange-600/90 hover:bg-orange-500 border border-orange-500/50 px-4 py-1.5 rounded text-xs font-bold flex items-center gap-2 text-white shadow-lg shadow-orange-900/20 active:scale-95 transition">
                            <Download size={14} /> Export
                        </button>
                    </div>
                </header>

                {/* CONTENT GRID */}
                <div className="flex-1 flex overflow-hidden relative">

                    {/* A. TRACK HEADERS (Left Column - Syncs Y with Timeline) */}
                    <div ref={headersRef} className="w-64 flex-shrink-0 bg-[#1E1E1E] border-r border-[#2C2C2C] overflow-hidden select-none z-10 shadow-xl">
                        <div className="h-8 border-b border-[#2C2C2C] bg-[#1E1E1E] flex items-center px-2 text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                            Tracks
                        </div>
                        <div className='pb-20'> {/* Padding for scrolling */}
                            {tracks.map((track, i) => (
                                <div key={track.id} className="h-24 border-b border-[#2C2C2C] flex relative group bg-[#1E1E1E] hover:bg-[#252525] transition-colors">
                                    {/* Color Strip */}
                                    <div className="w-1.5 h-full" style={{ backgroundColor: getTrackColor(i) }}></div>

                                    {/* Controls */}
                                    <div className="flex-1 p-2 flex flex-col justify-between">
                                        <div className="flex items-center gap-2">
                                            {/* Number Badge */}
                                            <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black text-black shadow-lg" style={{ backgroundColor: getTrackColor(i) }}>
                                                {i + 1}
                                            </div>
                                            <span className="text-xs font-bold text-slate-200 truncate flex-1">{track.name}</span>
                                            <Settings size={12} className="text-slate-600 hover:text-white cursor-pointer" />
                                        </div>

                                        <div className="flex items-center gap-1.5 mt-1">
                                            <button className={`w-6 h-5 rounded flex items-center justify-center text-[9px] font-black border transition-all ${track.solo ? 'bg-yellow-400 text-black border-yellow-500 shadow-[0_0_10px_rgba(250,204,21,0.3)]' : 'bg-[#121212] text-slate-500 border-[#333] hover:border-slate-500'}`}>S</button>
                                            <button className={`w-6 h-5 rounded flex items-center justify-center text-[9px] font-black border transition-all ${track.mute ? 'bg-red-500 text-white border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]' : 'bg-[#121212] text-slate-500 border-[#333] hover:border-slate-500'}`}>M</button>
                                            <div className="h-5 flex-1 bg-[#121212] border border-[#333] rounded flex items-center px-2 text-[9px] text-slate-500 font-mono overflow-hidden whitespace-nowrap">
                                                No Input
                                            </div>
                                        </div>

                                        {/* Vol Slider */}
                                        <div className="flex items-center gap-2 mt-1">
                                            <Volume2 size={12} className="text-slate-500" />
                                            <div className="flex-1 h-1 bg-[#121212] rounded-full overflow-hidden">
                                                <div className="h-full bg-slate-400 rounded-full" style={{ width: `${(track.vol || 1) * 80}%` }}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}

                            <button onClick={() => { }} className='w-full py-2 flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-white hover:bg-[#2C2C2C] transition-colors border-b border-[#2C2C2C]'>
                                <Plus size={14} /> Add Track
                            </button>
                        </div>
                    </div>

                    {/* B. TIMELINE (Right Column - Scrolls X and Y) */}
                    <div ref={timelineRef} onScroll={handleScroll} className="flex-1 bg-[#121212] overflow-auto relative custom-scrollbar">
                        <div className="min-w-[150vw] h-full relative pb-20">

                            {/* Ruler */}
                            <div className="h-8 border-b border-[#2C2C2C] flex sticky top-0 bg-[#121212] z-20 shadow-md">
                                {bars.map(b => (
                                    <div key={b} className="w-24 flex-shrink-0 border-r border-[#2C2C2C]/50 text-[9px] text-slate-500 pl-1 pt-2 font-mono select-none">
                                        {b}
                                    </div>
                                ))}
                            </div>

                            {/* Grid & Clips */}
                            <div className="relative">
                                {/* Grid Background */}
                                <div className="absolute inset-0 flex pointer-events-none h-full">
                                    {bars.map(b => <div key={b} className="w-24 flex-shrink-0 border-r border-[#2C2C2C]/20 h-full"></div>)}
                                </div>

                                {/* Playhead */}
                                <div className="absolute top-0 bottom-0 w-[1px] bg-white z-30 shadow-[0_0_10px_rgba(255,255,255,0.5)] pointer-events-none" style={{ left: '100px' }}>
                                    <div className="w-3 h-3 -ml-1.5 bg-white rounded-full shadow-lg mt-[-6px]"></div>
                                </div>

                                {/* Track Rows */}
                                {tracks.map((track, i) => (
                                    <div key={track.id} className="h-24 border-b border-[#2C2C2C]/30 relative group hover:bg-white/[0.02]" >
                                        {/* Clip */}
                                        <div className="absolute top-2 bottom-2 rounded-md overflow-hidden flex items-center cursor-pointer hover:brightness-110 transition-all border border-white/10 shadow-md"
                                            style={{
                                                left: `${i * 50 + 20}px`,
                                                width: '400px',
                                                backgroundColor: getTrackColor(i),
                                                boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), inset 0 0 20px rgba(0,0,0,0.2)`
                                            }}>

                                            {/* Waveform Visualization (CSS Gradient Trick) */}
                                            <div className='w-full h-full opacity-60 mix-blend-multiply flex items-center justify-around overflow-hidden'
                                                style={{ backgroundImage: 'linear-gradient(90deg, transparent 50%, rgba(0,0,0,0.3) 50%)', backgroundSize: '4px 100%' }}>
                                                {/* Clip Label */}
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
                <footer className="h-16 bg-[#1E1E1E] border-t border-[#2C2C2C] flex items-center px-4 justify-between gap-6 flex-shrink-0 z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.3)]">

                    {/* Left: Tools */}
                    <div className="flex items-center gap-2">
                        <button className="flex items-center gap-2 px-3 py-2 bg-[#2C2C2C] rounded-lg border border-[#333] hover:bg-[#333] text-xs font-bold text-slate-300 transition-colors">
                            <Plus size={14} className="text-green-500" /> New
                        </button>
                    </div>

                    {/* Center: AI Generation Pill */}
                    <div className="flex-1 max-w-xl bg-black/40 backdrop-blur-md rounded-full border border-white/10 p-1 flex items-center shadow-2xl relative group focus-within:ring-1 focus-within:ring-orange-500/50 transition-all">
                        <button className="px-3 py-1.5 flex items-center gap-2 text-xs font-bold text-slate-300 hover:text-white border-r border-white/10 transition-colors">
                            <Music size={12} className="text-fuchsia-500" /> <span className="hidden lg:inline">Vocals</span>
                        </button>
                        <input type="text" placeholder="Style..." className="bg-transparent px-3 text-xs w-24 border-r border-white/10 outline-none text-slate-300 placeholder-slate-600" />
                        <input type="text" placeholder="/PROMPT: Idea..." className="bg-transparent px-3 text-xs flex-1 outline-none text-white placeholder-slate-600 font-mono" />
                        <button className="bg-gradient-to-r from-orange-600 to-red-600 text-white text-[10px] font-black uppercase tracking-wider px-5 py-2 rounded-full hover:brightness-110 active:scale-95 transition-all shadow-[0_0_15px_rgba(249,115,22,0.4)]">
                            Create
                        </button>
                    </div>

                    {/* Right: Transport */}
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end">
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Tempo</span>
                            <span className="text-orange-500 font-mono text-xs font-bold flex items-center gap-1">122 <span className="text-slate-600">BPM</span></span>
                        </div>

                        <div className="flex items-center gap-4 bg-[#121212] px-4 py-1.5 rounded-full border border-white/5">
                            <SkipBack size={18} className="text-slate-500 hover:text-white cursor-pointer" />
                            <button onClick={onPlayPause} className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
                            </button>
                            <Sliders size={18} className="text-slate-500 hover:text-white cursor-pointer" />
                        </div>

                        <div className="flex flex-col w-16 items-end">
                            <span className="font-mono text-xs text-white tracking-tight">00:03:12</span>
                            <span className="text-[8px] text-slate-600">01:02:05</span>
                        </div>
                    </div>
                </footer>
            </main>
        </div>
    );
};

// Helper for vibrant colors
const getTrackColor = (index: number) => {
    const colors = ['#Eab308', '#F97316', '#D946EF', '#3B82F6', '#22C55E', '#ff0055']; // Yellow, Orange, Fuchsia, Blue, Green
    return colors[index % colors.length];
};

export default MultiTrackStudio;
