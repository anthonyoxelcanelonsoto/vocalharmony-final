import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../src/db'; // Adjust import path as needed
import { Track } from '../types'; // Adjust
import { Play, Pause, Music, Search, Disc3, Mic2, ArrowLeft } from 'lucide-react';

interface EasyModeProps {
    tracks: Track[];
    setTracks: React.Dispatch<React.SetStateAction<Track[]>>;
    isPlaying: boolean;
    onTogglePlay: () => void;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    onLoadSong: (song: any) => Promise<void>;
    onExit: () => void;
}

export const EasyMode: React.FC<EasyModeProps> = ({
    tracks,
    setTracks,
    isPlaying,
    onTogglePlay,
    currentTime,
    duration,
    onSeek,
    onLoadSong,
    onExit
}) => {
    const [view, setView] = useState<'SELECT' | 'PLAYER'>('SELECT');
    const songs = useLiveQuery(() => db.myLibrary.toArray());
    const [searchQuery, setSearchQuery] = useState("");

    // Identify the "Pista" (Backing Track)
    const backingTrackId = tracks.find(t => t.name.toLowerCase().includes('pista'))?.id;

    // Filter Logic for Library
    const filteredSongs = songs ? songs.filter(song => {
        const query = searchQuery.toLowerCase();
        return (
            (song.title && song.title.toLowerCase().includes(query)) ||
            (song.artist && song.artist.toLowerCase().includes(query))
        );
    }) : [];

    const handleSongSelect = async (song: any) => {
        await onLoadSong(song);
        setView('PLAYER');
    };

    const handleTrackToggle = (clickedTrackId: number) => {
        setTracks(prev => {
            const newTracks = prev.map(t => {
                // Determine if this is the backing track
                const isBacking = t.name.toLowerCase().includes('pista');

                // If we clicked a regular track
                if (clickedTrackId !== backingTrackId) {
                    if (t.id === clickedTrackId) {
                        // This is the target: SOLO it
                        return { ...t, solo: true, mute: false };
                    }
                    if (isBacking) {
                        // Backing track: ALWAYS SOLO along with selection
                        return { ...t, solo: true, mute: false };
                    }
                    // All others: Un-solo, potentially mute if logic dictates, 
                    // but "solo" on some tracks implicitly mutes non-soloed ones in the audio engine.
                    // So we just need to Ensure SOLO is set correctly.
                    return { ...t, solo: false };
                }
                return t;
            });
            return newTracks;
        });
    };

    const toggleFullMix = () => {
        setTracks(prev => prev.map(t => ({ ...t, solo: false, mute: false })));
    };

    // --- SONG SELECTOR VIEW ---
    if (view === 'SELECT') {
        return (
            <div className="flex flex-col h-full bg-black text-white p-6 animate-in fade-in zoom-in-95 duration-500">
                <div className="flex items-center justify-between mb-8">
                    <button onClick={onExit} className="p-3 rounded-full hover:bg-white/10 text-slate-400">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-600">
                        Elige una Canción
                    </h1>
                    <div className="w-12"></div> {/* Spacer */}
                </div>

                {/* Search */}
                <div className="relative w-full max-w-2xl mx-auto mb-10">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        className="w-full bg-slate-900 border border-slate-800 rounded-full py-4 pl-12 pr-6 text-lg focus:ring-2 focus:ring-sky-500 focus:outline-none transition-all"
                        placeholder="Buscar en tu biblioteca..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pb-20 px-4">
                    {filteredSongs.map(song => (
                        <button
                            key={song.id}
                            onClick={() => handleSongSelect(song)}
                            className="group flex items-center gap-4 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 rounded-2xl p-4 transition-all hover:scale-[1.02] text-left"
                        >
                            <div className="w-20 h-20 rounded-xl bg-slate-950 shadow-lg flex-shrink-0 overflow-hidden relative">
                                {song.cover_url ? (
                                    <img src={song.cover_url} className="w-full h-full object-cover" />
                                ) : (
                                    <Music className="w-full h-full p-6 text-slate-700" />
                                )}
                                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Play size={24} className="text-white fill-current" />
                                </div>
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-white line-clamp-1 group-hover:text-sky-400 transition-colors">{song.title}</h3>
                                <p className="text-slate-400 text-sm">{song.artist || "Artista Desconocido"}</p>
                            </div>
                        </button>
                    ))}
                    {filteredSongs.length === 0 && (
                        <div className="col-span-full text-center py-20 text-slate-600">
                            <p>No se encontraron canciones.</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // --- PLAYER VIEW ---
    // Filter out "Pista" and "Master" for the grid
    const visibleTracks = tracks.filter(t =>
        !t.isMaster &&
        !t.name.toLowerCase().includes('pista')
    );

    const formatTime = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate progress
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="flex flex-col h-full bg-black text-white relative">

            {/* TOP BAR */}
            <div className="flex items-center justify-between p-6 bg-gradient-to-b from-black to-transparent z-10">
                <button onClick={() => setView('SELECT')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                    <ArrowLeft size={20} />
                    <span className="font-bold text-sm uppercase tracking-widest">Biblioteca</span>
                </button>
                <div className="text-center">
                    {/* Song Title could go here nicely */}
                </div>
                <div className="w-20"></div>
            </div>

            {/* MAIN TRACKS AREA */}
            <div className="flex-1 flex flex-col justify-center px-6 lg:px-20 pb-10">

                {/* Full Mix Button (Reset) */}
                <div className="flex justify-center mb-8">
                    <button
                        onClick={toggleFullMix}
                        className={`px-8 py-3 rounded-full font-black text-sm tracking-widest uppercase border transition-all
                        ${!tracks.some(t => t.solo)
                                ? 'bg-sky-500 border-sky-400 text-black shadow-[0_0_20px_rgba(14,165,233,0.4)] scale-110'
                                : 'bg-black border-slate-700 text-slate-400 hover:border-white hover:text-white'}
                        `}
                    >
                        Mezcla Completa
                    </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-8">
                    {visibleTracks.map(track => {
                        const isSolo = track.solo;
                        return (
                            <button
                                key={track.id}
                                onClick={() => handleTrackToggle(track.id)}
                                className={`group relative aspect-square rounded-3xl flex flex-col items-center justify-center gap-4 transition-all duration-300
                                ${isSolo
                                        ? 'bg-gradient-to-br from-sky-600 to-blue-700 shadow-[0_0_40px_rgba(2,132,199,0.4)] scale-105 border-transparent'
                                        : 'bg-slate-900/50 border border-slate-800 hover:bg-slate-800 hover:border-slate-600'}
                                `}
                            >
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-500
                                    ${isSolo ? 'bg-white text-sky-600 scale-110' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'}
                                `}>
                                    <Mic2 size={32} />
                                </div>
                                <h3 className={`text-xl font-bold transition-colors ${isSolo ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
                                    {track.name}
                                </h3>

                                {isSolo && (
                                    <div className="absolute top-4 right-4">
                                        <div className="w-3 h-3 bg-white rounded-full animate-pulse shadow-[0_0_10px_white]"></div>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* BOTTOM PLAYBACK CONTROLS */}
            <div className="bg-[#050510] border-t border-white/5 p-6 pb-10">
                {/* Progress Bar */}
                <div
                    className="w-full h-2 bg-slate-800 rounded-full mb-8 relative cursor-pointer group"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const pct = x / rect.width;
                        onSeek(pct * duration);
                    }}
                >
                    <div className="absolute top-0 left-0 h-full bg-sky-500 rounded-full" style={{ width: `${progress}%` }}>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg scale-0 group-hover:scale-100 transition-transform"></div>
                    </div>
                </div>

                <div className="flex items-center justify-between max-w-4xl mx-auto">
                    <span className="text-slate-400 font-mono font-medium w-16 text-left">{formatTime(currentTime)}</span>

                    <button
                        onClick={onTogglePlay}
                        className="w-20 h-20 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(255,255,255,0.2)]"
                    >
                        {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-2" />}
                    </button>

                    <span className="text-slate-400 font-mono font-medium w-16 text-right">{formatTime(duration)}</span>
                </div>
            </div>

        </div>
    );
};
