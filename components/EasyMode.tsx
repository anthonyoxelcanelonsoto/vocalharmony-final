import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../src/db';
import { supabase } from '../src/supabaseClient';
import { Track } from '../types';
import { Play, Pause, Music, Search, Disc3, Mic2, ArrowLeft, CloudDownload, Loader2, Eye, EyeOff, Trash2 } from 'lucide-react';

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
    trackAnalysers?: Record<number, AnalyserNode>;
    isLite?: boolean;
}

const SignalLED = ({ analyser, isPlaying, isSolo, isLite }: { analyser?: AnalyserNode, isPlaying: boolean, isSolo: boolean, isLite?: boolean }) => {
    const ref = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ref.current) return;

        // LITE MODE: No animation, static colors
        if (isLite) {
            if (isSolo) {
                ref.current.style.backgroundColor = 'rgba(2, 132, 199, 0.8)';
                ref.current.style.boxShadow = 'none';
            } else {
                ref.current.style.backgroundColor = 'rgba(16, 185, 129, 0.4)';
                ref.current.style.boxShadow = 'none';
            }
            return;
        }

        if (!analyser || !isPlaying) {
            ref.current.style.backgroundColor = 'transparent';
            ref.current.style.boxShadow = 'none';
            return;
        }

        const bufferLength = analyser.frequencyBinCount;
        const data = new Uint8Array(bufferLength);

        let frameId: number;
        let isActive = true;

        const draw = () => {
            if (!isActive) return;
            analyser.getByteFrequencyData(data);

            let sum = 0;
            let count = 0;
            for (let i = 0; i < bufferLength; i += 32) {
                sum += data[i];
                count++;
            }
            const avg = count > 0 ? sum / count : 0;

            if (ref.current) {
                if (avg > 5) {
                    // Logarithmic-like intensity map
                    const normalized = Math.min(avg / 100, 1);

                    if (isSolo) {
                        // Selected Track: Bright Blue pulsing
                        const opacity = 0.4 + (normalized * 0.6); // 0.4 to 1.0
                        ref.current.style.backgroundColor = `rgba(2, 132, 199, ${opacity})`; // sky-600/blue-700
                        ref.current.style.boxShadow = `inset 0 0 ${40 * normalized}px rgba(56, 189, 248, ${opacity})`;
                    } else {
                        // Background Track: Green pulsing (Standard)
                        const opacity = 0.2 + (normalized * 0.5); // 0.2 to 0.7
                        ref.current.style.backgroundColor = `rgba(16, 185, 129, ${opacity})`; // emerald-500
                        ref.current.style.boxShadow = `inset 0 0 ${20 * normalized}px rgba(16, 185, 129, ${opacity})`;
                    }

                } else {
                    ref.current.style.backgroundColor = 'transparent';
                    ref.current.style.boxShadow = 'none';
                }
            }
            frameId = requestAnimationFrame(draw);
        };
        draw();
        return () => {
            isActive = false;
            cancelAnimationFrame(frameId);
        };
    }, [analyser, isPlaying, isSolo, isLite]);

    return <div ref={ref} className="absolute inset-0 rounded-3xl pointer-events-none transition-colors duration-100 z-0"></div>;
};

export const EasyMode: React.FC<EasyModeProps> = ({
    tracks,
    setTracks,
    isPlaying,
    onTogglePlay,
    currentTime,
    duration,
    onSeek,
    onLoadSong,
    onExit,
    trackAnalysers,
    isLite = false
}) => {
    const [view, setView] = useState<'SELECT' | 'PLAYER'>('SELECT');
    const [defaultVolumes, setDefaultVolumes] = useState<Record<number, number>>({});
    const [isBackingEnabled, setIsBackingEnabled] = useState(true);
    const [showAllTracks, setShowAllTracks] = useState(false);

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
                setDefaultVolumes({});
                setIsBackingEnabled(true);
                setView('PLAYER');
            } catch (e) {
                console.error("Download Error", e);
                alert("Error al descargar la canción. Verifique su conexión.");
                setDownloadingId(null);
            }
        } else {
            // Local
            await onLoadSong(song);
            setDefaultVolumes({});
            setIsBackingEnabled(true);
            setView('PLAYER');
        }
    };

    const handleTrackToggle = (clickedTrackId: number) => {
        setTracks(prev => {
            const clickedTrack = prev.find(t => t.id === clickedTrackId);

            // If clicking a track that is already active/soloed, reset to Full Mix (Deselect)
            if (clickedTrack?.solo && clickedTrackId !== backingTrackId) {
                return prev.map(t => {
                    // Restore Backing Track to its "Enabled" preference
                    if (t.id === backingTrackId) {
                        return { ...t, solo: false, mute: !isBackingEnabled, vol: defaultVolumes[t.id] ?? 1.0 };
                    }
                    return { ...t, solo: false, mute: false, vol: defaultVolumes[t.id] ?? 1.0 };
                });
            }

            // Otherwise, Activate Focus Mode
            return prev.map(t => {
                const isBacking = t.name.toLowerCase().includes('pista');
                if (clickedTrackId !== backingTrackId) {
                    if (t.id === clickedTrackId) {
                        return { ...t, solo: true, mute: false, vol: 1.25 };
                    }
                    if (isBacking) {
                        // Only unmute backing if it is enabled
                        return { ...t, solo: true, mute: !isBackingEnabled, vol: 0.25 };
                    }
                    return { ...t, solo: false };
                }
                return t;
            });
        });
    };

    const handleDeleteSong = async (song: any) => {
        if (!confirm(`¿Estás seguro de que deseas eliminar "${song.title}" de tu biblioteca local? Esto te permitirá descargarla de nuevo desde la nube.`)) {
            return;
        }
        try {
            await (db as any).myLibrary.delete(song.id);
        } catch (error) {
            console.error("Error deleting song:", error);
            alert("Hubo un error al eliminar la canción.");
        }
    };

    // Capture Default Mix (Original Volumes) whenever we enter PlayerView or load new tracks
    useEffect(() => {
        if (view === 'PLAYER' && Object.keys(defaultVolumes).length === 0 && tracks.length > 0) {
            const defaults: Record<number, number> = {};
            tracks.forEach(t => defaults[t.id] = t.vol);
            setDefaultVolumes(defaults);
        }
    }, [view, tracks, defaultVolumes]);

    // --- SONG SELECTOR VIEW ---
    if (view === 'SELECT') {
        return (
            <div className="flex flex-col h-screen bg-black text-white p-4 md:p-6 animate-in fade-in zoom-in-95 duration-500 overflow-hidden">
                <div className="flex items-center justify-between mb-4 md:mb-8 shrink-0">
                    <button onClick={onExit} className="p-3 rounded-full hover:bg-white/10 text-slate-400">
                        <ArrowLeft size={24} />
                    </button>
                    <h1 className="text-2xl md:text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-400 to-blue-600">
                        Elige una Canción
                    </h1>
                    <div className="w-12"></div> {/* Spacer */}
                </div>

                {/* Search */}
                <div className="relative w-full max-w-2xl mx-auto mb-6 md:mb-8 shrink-0">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        className="w-full bg-slate-900 border border-slate-800 rounded-full py-3 md:py-4 pl-12 pr-6 text-base md:text-lg focus:ring-2 focus:ring-sky-500 focus:outline-none transition-all"
                        placeholder="Buscar en tu biblioteca o nube..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto min-h-0 w-full max-w-7xl mx-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 pb-24 px-4 md:px-8">
                        {filteredSongs.map(song => (
                            <button
                                key={song.id}
                                onClick={() => !downloadingId && handleSongSelect(song)}
                                disabled={downloadingId !== null}
                                className={`group flex items-center gap-3 md:gap-4 bg-slate-900/50 hover:bg-slate-800 border border-slate-800 rounded-2xl p-3 md:p-4 transition-all hover:scale-[1.02] text-left relative overflow-hidden
                                ${downloadingId === song.id ? 'opacity-75 cursor-wait' : ''}
                                `}
                            >
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl bg-slate-950 shadow-lg flex-shrink-0 overflow-hidden relative">
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
                                    <h3 className="font-bold text-base md:text-lg text-white line-clamp-1 group-hover:text-sky-400 transition-colors">{song.title}</h3>
                                    <p className="text-slate-400 text-sm">{song.artist || "Artista Desconocido"}</p>
                                    <div className="flex items-center gap-2 mt-1">
                                        {song.genre && <span className="text-xs text-slate-600 uppercase tracking-wider">{song.genre}</span>}
                                        {song.isCloud && <span className="text-[10px] bg-sky-900/50 text-sky-400 px-1.5 py-0.5 rounded border border-sky-800">NUBE</span>}
                                    </div>
                                </div>

                                {/* DELETE BUTTON */}
                                {!song.isCloud && (
                                    <div
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteSong(song);
                                        }}
                                        className="p-2 rounded-full hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-colors relative z-20"
                                        title="Eliminar de biblioteca local"
                                    >
                                        <Trash2 size={18} />
                                    </div>
                                )}
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
    // Filter out "Pista" and "Master". 
    // If showAllTracks is false, ONLY show "Primera", "Segunda", "Tercera".
    const visibleTracks = tracks.filter(t => {
        if (t.isMaster) return false;
        const lower = t.name.toLowerCase();
        if (lower.includes('pista')) return false;

        if (showAllTracks) return true;

        const exactNames = ['primera', 'segunda', 'tercera'];
        return exactNames.includes(lower.trim());
    });

    const formatTime = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate progress
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
        <div className="flex flex-col h-screen bg-black text-white overflow-hidden">

            {/* TOP BAR */}
            <div className="flex-none flex items-center justify-between p-6 bg-gradient-to-b from-black to-transparent z-10">
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
            <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-6 lg:px-20 py-4 scrollbar-hide">

                {/* Full Mix Button (Reset) */}
                {/* Control Buttons */}
                <div className="flex flex-wrap justify-center gap-4 mb-8 pt-4">

                    {backingTrackId && (
                        <button
                            onClick={() => {
                                const newState = !isBackingEnabled;
                                setIsBackingEnabled(newState);
                                setTracks(prev => prev.map(t =>
                                    t.id === backingTrackId ? { ...t, mute: !newState } : t
                                ));
                            }}
                            className={`px-6 py-3 rounded-full font-black text-sm tracking-widest uppercase border flex items-center gap-2
                            ${isLite ? '' : 'transition-all duration-300'}
                            ${isBackingEnabled
                                    ? (isLite ? 'bg-emerald-600 border-transparent text-white' : 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_20px_rgba(16,185,129,0.4)] scale-105')
                                    : 'bg-black border-slate-700 text-slate-400 hover:border-white hover:text-white'}
                            `}
                        >
                            <Music size={18} />
                            {isBackingEnabled ? 'Música: ON' : 'Música: OFF'}
                        </button>
                    )}

                    <button
                        onClick={() => setShowAllTracks(!showAllTracks)}
                        className={`px-6 py-3 rounded-full font-black text-sm tracking-widest uppercase border flex items-center gap-2
                        ${isLite ? '' : 'transition-all duration-300'}
                        ${showAllTracks
                                ? (isLite ? 'bg-indigo-600 border-transparent text-white' : 'bg-indigo-500 border-indigo-400 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] scale-105')
                                : 'bg-black border-slate-700 text-slate-400 hover:border-white hover:text-white'}
                        `}
                    >
                        {showAllTracks ? <EyeOff size={18} /> : <Eye size={18} />}
                        {showAllTracks ? 'Ocultar' : 'Mostrar Todas'}
                    </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8 pb-8 max-w-5xl mx-auto">
                    {visibleTracks.map(track => {
                        const isSolo = track.solo;
                        const anySolo = tracks.some(t => t.solo);
                        const isAudible = !track.mute && (anySolo ? isSolo : true);
                        const isSignalActive = isPlaying && isAudible;

                        return (
                            <button
                                key={track.id}
                                onClick={() => handleTrackToggle(track.id)}
                                className={`group relative w-full aspect-auto md:aspect-square py-6 md:py-0 rounded-3xl flex md:flex-col items-center justify-start md:justify-center gap-6 md:gap-4 px-6 md:px-0
                                ${isLite ? '' : 'transition-all duration-300'}
                                ${isSolo
                                        ? (isLite ? 'bg-sky-900/50 border border-sky-500/50' : 'bg-transparent shadow-[0_0_40px_rgba(2,132,199,0.4)] scale-[1.02] md:scale-105 border-transparent')
                                        : 'bg-slate-900/50 border border-slate-800 hover:bg-slate-800 hover:border-slate-600'}
                                `}
                            >
                                <div className={`relative z-10 w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center shrink-0
                                    ${isLite ? '' : 'transition-all duration-500'}
                                    ${isSolo ? 'bg-white text-sky-600' + (isLite ? '' : ' scale-110') : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'}
                                `}>
                                    <Mic2 size={28} className="md:w-8 md:h-8" />
                                </div>
                                <h3 className={`relative z-10 text-xl font-bold transition-colors ${isSolo ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
                                    {track.name}
                                </h3>

                                {/* Signal LED */}
                                <SignalLED
                                    analyser={trackAnalysers ? trackAnalysers[track.id] : undefined}
                                    isPlaying={isPlaying}
                                    isSolo={!!isSolo}
                                    isLite={isLite}
                                />
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* BOTTOM PLAYBACK CONTROLS */}
            <div className="flex-none bg-[#050510] border-t border-white/5 p-6 pb-10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20">
                {/* Progress Bar */}
                <div
                    className="w-full h-8 flex items-center relative cursor-pointer group mb-4"
                    onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const x = e.clientX - rect.left;
                        const pct = x / rect.width;
                        onSeek(pct * duration);
                    }}
                >
                    {/* Hitbox transparent */}
                    <div className="absolute inset-0 z-10"></div>

                    {/* Track Line */}
                    <div className="w-full h-2 bg-slate-800 rounded-full relative overflow-hidden">
                        <div className="absolute top-0 left-0 h-full bg-sky-500" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>

                <div className="flex items-center justify-between max-w-4xl mx-auto px-4">
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
