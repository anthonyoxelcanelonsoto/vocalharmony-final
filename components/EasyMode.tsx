```javascript
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../src/db';
import { supabase } from '../src/supabaseClient'; // Import Supabase
import { Track } from '../types';
import { Play, Pause, Music, Search, Disc3, Mic2, ArrowLeft, CloudDownload, Loader2 } from 'lucide-react';

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
    
    // Local Songs
    const localSongs = useLiveQuery(() => (db as any).myLibrary.toArray()) || [];
    
    // Cloud Songs
    const [cloudSongs, setCloudSongs] = useState<any[]>([]);
    const [loadingCloud, setLoadingCloud] = useState(false);
    
    const [searchQuery, setSearchQuery] = useState("");
    const [downloadingId, setDownloadingId] = useState<number | null>(null);

    // Initial Cloud Fetch
    useEffect(() => {
        const fetchCloud = async () => {
            setLoadingCloud(true);
            const { data } = await supabase.from('songs').select('*');
            if (data) {
                setCloudSongs(data);
            }
            setLoadingCloud(false);
        };
        fetchCloud();
    }, []);

    // Merge: Prefer Local if exists (by ID)
    const combinedSongs = [...localSongs];
    cloudSongs.forEach(cSong => {
        if (!localSongs.find((l: any) => l.id === cSong.id)) {
            combinedSongs.push({ ...cSong, isCloud: true });
        }
    });

    // Identify the "Pista" (Backing Track)
    const backingTrackId = tracks.find(t => t.name.toLowerCase().includes('pista'))?.id;

    // Filter Logic
    const filteredSongs = combinedSongs.filter(song => {
        const query = searchQuery.toLowerCase();
        return (
            (song.title && song.title.toLowerCase().includes(query)) ||
            (song.artist && song.artist.toLowerCase().includes(query)) ||
            (song.genre && song.genre.toLowerCase().includes(query))
        );
    });

    const handleSongSelect = async (song: any) => {
        // If Cloud only, Download first
        if (song.isCloud) {
            try {
                setDownloadingId(song.id);
                // 1. Download ZIP
                const response = await fetch(song.zip_url);
                if (!response.ok) throw new Error('Download failed');
                const blob = await response.blob();
                
                // 2. Save to Dexie (Local Library)
                const newSong = {
                    id: song.id,
                    title: song.title,
                    artist: song.artist,
                    genre: song.genre,
                    cover_url: song.cover_url,
                    mix_rules: song.mix_rules,
                    fileBlob: blob
                };
                await (db as any).myLibrary.add(newSong);
                
                // 3. Load
                await onLoadSong(newSong);
                setDownloadingId(null);
                setView('PLAYER');
            } catch (e) {
                console.error("Download Error", e);
                alert("Error al descargar la canción. Verifique su conexión.");
                setDownloadingId(null);
            }
        } else {
            // Local
            await onLoadSong(song);
            setView('PLAYER');
        }
    };

    const handleTrackToggle = (clickedTrackId: number) => {
        setTracks(prev => {
            const newTracks = prev.map(t => {
                const isBacking = t.name.toLowerCase().includes('pista');
                if (clickedTrackId !== backingTrackId) {
                    if (t.id === clickedTrackId) {
                        return { ...t, solo: true, mute: false };
                    }
                    if (isBacking) {
                        return { ...t, solo: true, mute: false };
                    }
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
            <div className="flex flex-col h-screen bg-black text-white p-6 animate-in fade-in zoom-in-95 duration-500 overflow-hidden">
                <div className="flex items-center justify-between mb-8 shrink-0">
                    <button onClick={onExit} className="p-3 rounded-full hover:bg-white/10 text-slate-400">
                         <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-600">
                        Elige una Canción
                    </h1>
                    <div className="w-12"></div> {/* Spacer */}
                </div>

                {/* Search */}
                <div className="relative w-full max-w-2xl mx-auto mb-10 shrink-0">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input 
                        className="w-full bg-slate-900 border border-slate-800 rounded-full py-4 pl-12 pr-6 text-lg focus:ring-2 focus:ring-sky-500 focus:outline-none transition-all"
                        placeholder="Buscar en tu biblioteca o nube..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto min-h-0 w-full max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-20 px-4">
                        {filteredSongs.map(song => (
                            <button 
                                key={song.id}
                                onClick={() => !downloadingId && handleSongSelect(song)}
                                disabled={downloadingId !== null}
                                className={`group flex items - center gap - 4 bg - slate - 900 / 50 hover: bg - slate - 800 border border - slate - 800 rounded - 2xl p - 4 transition - all hover: scale - [1.02] text - left relative overflow - hidden
                                ${ downloadingId === song.id ? 'opacity-75 cursor-wait' : '' }
`}
                            >
                                <div className="w-20 h-20 rounded-xl bg-slate-950 shadow-lg flex-shrink-0 overflow-hidden relative">
                                    {song.cover_url ? (
                                        <img src={song.cover_url} className="w-full h-full object-cover" alt={song.title} />
                                    ) : (
                                        <Music className="w-full h-full p-6 text-slate-700" />
                                    )}
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        {song.isCloud ? <CloudDownload size={24} className="text-sky-400" /> : <Play size={24} className="text-white fill-current" />}
                                    </div>
                                    {downloadingId === song.id && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <Loader2 size={24} className="animate-spin text-white" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-lg text-white line-clamp-1 group-hover:text-sky-400 transition-colors">{song.title}</h3>
                                    <p className="text-slate-400 text-sm">{song.artist || "Artista Desconocido"}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        {song.genre && <span className="text-xs text-slate-600 uppercase tracking-wider">{song.genre}</span>}
                                        {song.isCloud && <span className="text-[10px] bg-sky-900/50 text-sky-400 px-1.5 py-0.5 rounded border border-sky-800">NUBE</span>}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                    
                    {filteredSongs.length === 0 && !loadingCloud && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-600 gap-4">
                            <Disc3 size={48} className="animate-spin-slow opacity-20" />
                            <p className="text-lg">No se encontraron canciones.</p>
                        </div>
                    )}
                    {loadingCloud && filteredSongs.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                             <Loader2 size={32} className="animate-spin mb-4" />
                             <p>Buscando en la nube...</p>
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
        return `${ mins }:${ secs.toString().padStart(2, '0') } `;
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
                        className={`px - 8 py - 3 rounded - full font - black text - sm tracking - widest uppercase border transition - all
                        ${
    !tracks.some(t => t.solo)
    ? 'bg-sky-500 border-sky-400 text-black shadow-[0_0_20px_rgba(14,165,233,0.4)] scale-110'
    : 'bg-black border-slate-700 text-slate-400 hover:border-white hover:text-white'
}
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
                                className={`group relative aspect - square rounded - 3xl flex flex - col items - center justify - center gap - 4 transition - all duration - 300
                                ${
    isSolo
        ? 'bg-gradient-to-br from-sky-600 to-blue-700 shadow-[0_0_40px_rgba(2,132,199,0.4)] scale-105 border-transparent'
        : 'bg-slate-900/50 border border-slate-800 hover:bg-slate-800 hover:border-slate-600'
}
`}
                            >
                                <div className={`w - 16 h - 16 rounded - full flex items - center justify - center transition - all duration - 500
                                    ${ isSolo ? 'bg-white text-sky-600 scale-110' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300' }
`}>
                                    <Mic2 size={32} />
                                </div>
                                <h3 className={`text - xl font - bold transition - colors ${ isSolo ? 'text-white' : 'text-slate-400 group-hover:text-white' } `}>
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
                    <div className="absolute top-0 left-0 h-full bg-sky-500 rounded-full" style={{ width: `${ progress }% ` }}>
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
