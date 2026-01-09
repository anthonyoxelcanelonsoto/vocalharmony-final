import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../src/db';
import { supabase } from '../src/supabaseClient';
import { Track } from '../types';
import { Play, Pause, Music, Search, Disc3, Mic2, ArrowLeft, CloudDownload, Loader2, Eye, EyeOff, Trash2, BookOpen, X, LayoutGrid, List } from 'lucide-react';
import { parseLRC, formatTime } from '../utils';
import { LyricLine } from '../types';

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
    importedLyrics?: LyricLine[];
}

const SignalLED = ({ analyser, isPlaying, isSolo, isActive, size = 'md' }: { analyser?: AnalyserNode, isPlaying: boolean, isSolo: boolean, isActive: boolean, size?: 'sm' | 'md' }) => {
    const ref = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!ref.current) return;

        // Visual Reset if disabled
        if (!analyser || !isPlaying || !isActive) {
            ref.current.style.backgroundColor = 'transparent';
            ref.current.style.boxShadow = 'none';
            return;
        }

        const bufferLength = analyser.frequencyBinCount;
        const data = new Uint8Array(bufferLength);

        let frameId: number;
        let isRunning = true;
        let frameCount = 0;

        const draw = () => {
            if (!isRunning) return;

            // Throttle: Update only every 3rd frame (~20fps) to save battery/CPU on mobile
            frameCount++;
            if (frameCount % 3 !== 0) {
                frameId = requestAnimationFrame(draw);
                return;
            }

            analyser.getByteFrequencyData(data);

            let sum = 0;
            // Sample every 32nd bin (already optimized)
            for (let i = 0; i < bufferLength; i += 32) {
                sum += data[i];
            }
            // Count approximate bins sampled
            const count = Math.ceil(bufferLength / 32);
            const avg = count > 0 ? sum / count : 0;

            if (ref.current) {
                if (avg > 5) {
                    const normalized = Math.min(avg / 100, 1);

                    if (isSolo) {
                        // Selected: Blue
                        const opacity = 0.4 + (normalized * 0.6);
                        ref.current.style.backgroundColor = `rgba(2, 132, 199, ${opacity})`;
                        ref.current.style.boxShadow = `inset 0 0 ${40 * normalized}px rgba(56, 189, 248, ${opacity})`;
                    } else {
                        // Background: Green
                        const opacity = 0.2 + (normalized * 0.5);
                        ref.current.style.backgroundColor = `rgba(16, 185, 129, ${opacity})`;
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
            isRunning = false;
            cancelAnimationFrame(frameId);
        };
    }, [analyser, isPlaying, isSolo, isActive]);

    // Size-based styling
    const sizeClasses = size === 'sm'
        ? 'w-3 h-3 rounded-full'
        : 'absolute inset-0 rounded-xl pointer-events-none';

    return <div ref={ref} className={`${sizeClasses} transition-colors duration-100 z-0`}></div>;
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
    importedLyrics
}) => {
    const [view, setView] = useState<'SELECT' | 'PLAYER' | 'LYRICS'>('SELECT');
    const [currentSong, setCurrentSong] = useState<any>(null);
    const [defaultVolumes, setDefaultVolumes] = useState<Record<number, number>>({});
    const [isBackingEnabled, setIsBackingEnabled] = useState(true);
    const [showAllTracks, setShowAllTracks] = useState(false);
    const [autoScroll, setAutoScroll] = useState(true); // Auto-scroll lyrics toggle
    const [compactView, setCompactView] = useState(false); // Compact view to see all tracks at once

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

    const changeView = (v: 'SELECT' | 'PLAYER' | 'LYRICS') => {
        console.log("Changing View to:", v);
        setView(v);
    };

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

    const formatTime = (s: number) => {
        const mins = Math.floor(s / 60);
        const secs = Math.floor(s % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

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
                    lyrics: song.lyrics,
                    fileBlob: blob
                };
                await (db as any).myLibrary.add(newSong);

                // 3. Load
                await onLoadSong(newSong);
                setCurrentSong(newSong);
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
            setCurrentSong(song);
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
                        // Activate Selected Track
                        // If default volume is silent/zero, boost to 100% so it can be heard
                        const originalVol = defaultVolumes[t.id] ?? t.vol;
                        const useVol = originalVol < 0.05 ? 1.0 : originalVol;
                        return { ...t, solo: true, mute: false, vol: useVol };
                    }
                    if (isBacking) {
                        // Activate Backing Track (Original Volume, Check Mute)
                        return { ...t, solo: true, mute: !isBackingEnabled, vol: defaultVolumes[t.id] ?? t.vol };
                    }
                    // Mute/Deactivate Others
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

    // --- LYRICS HOOKS (must be at top level to avoid hook order violation) ---
    const parsedLyrics = React.useMemo(() => {
        // Priority: 1. importedLyrics from App.tsx (from LRC file in ZIP)
        //           2. currentSong.lyrics (from Supabase)
        //           3. Demo fallback
        if (importedLyrics && importedLyrics.length > 0) {
            return importedLyrics;
        }

        if (currentSong?.lyrics) {
            try {
                return parseLRC(currentSong.lyrics);
            } catch (e) {
                console.error("LRC Parse Error", e);
            }
        }

        // Demo fallback
        const demoLyrics = `[00:00.00] No hay letra disponible
[00:03.00] Puedes agregar un archivo .lrc
[00:06.00] al proyecto para ver la letra sincronizada`;
        try {
            return parseLRC(demoLyrics);
        } catch (e) {
            return [];
        }
    }, [currentSong, importedLyrics]);

    const hasSyncedLyrics = parsedLyrics.length > 0;

    const currentLineIndex = parsedLyrics.findIndex((line, i) => {
        const nextLine = parsedLyrics[i + 1];
        return currentTime >= line.time && (!nextLine || currentTime < nextLine.time);
    });

    const activeLineRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Early return - do nothing if manual mode
        if (!autoScroll) {
            console.log("Manual mode - no scroll");
            return;
        }

        if (view === 'LYRICS' && activeLineRef.current) {
            console.log("Auto-scrolling to line:", currentLineIndex);
            activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentLineIndex, view, autoScroll]);

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

    // --- LYRICS VIEW ---
    if (view === 'LYRICS') {
        return (
            <div className="flex flex-col h-screen bg-black text-white p-6 animate-in slide-in-from-bottom duration-500 z-50">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 flex-none">
                    <button
                        onClick={() => changeView('PLAYER')}
                        className="p-3 bg-slate-900 rounded-full hover:bg-slate-800 text-slate-300 transition-all border border-slate-800"
                    >
                        <ArrowLeft size={24} />
                    </button>
                    <div className="text-center flex-1 px-4">
                        <h2 className="text-lg font-bold text-white truncate">{currentSong?.title || "Sin Título"}</h2>
                        <p className="text-slate-500 text-xs truncate">{currentSong?.artist}</p>
                    </div>
                    {/* Auto/Manual Toggle */}
                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`px-3 py-2 rounded-full text-xs font-bold uppercase tracking-wide border transition-all flex items-center gap-1.5
                            ${autoScroll
                                ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-500'}`}
                    >
                        {autoScroll ? (
                            <>
                                <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse"></span>
                                Auto
                            </>
                        ) : (
                            <>
                                <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                                Manual
                            </>
                        )}
                    </button>
                </div>


                {/* Lyrics Container */}
                <div className="flex-1 overflow-y-auto min-h-0 text-center px-4 scrollbar-hide">
                    {hasSyncedLyrics ? (
                        <div className={`space-y-4 md:space-y-5 ${autoScroll ? 'py-[40vh]' : 'py-8'}`}>
                            {parsedLyrics.map((line, i) => {
                                const isActive = i === currentLineIndex;
                                const isPast = i < currentLineIndex;
                                const isNext = i === currentLineIndex + 1;

                                // MANUAL MODE: All lines same size, no animations, static
                                if (!autoScroll) {
                                    return (
                                        <div
                                            key={i}
                                            className="text-xl md:text-2xl font-medium text-slate-300 leading-relaxed cursor-pointer hover:text-white"
                                            onClick={() => onSeek(line.time)}
                                        >
                                            <p>{line.text}</p>
                                        </div>
                                    );
                                }

                                // AUTO MODE: Animated, highlighted active line
                                return (
                                    <div
                                        key={i}
                                        ref={isActive ? activeLineRef : null}
                                        className={`transition-all duration-500 ease-out select-none cursor-pointer
                                            ${isActive
                                                ? 'text-3xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-white to-sky-300 scale-105'
                                                : isNext
                                                    ? 'text-xl md:text-3xl font-semibold text-slate-300 opacity-80 hover:opacity-100'
                                                    : isPast
                                                        ? 'text-lg md:text-xl font-medium text-slate-600 opacity-50 hover:opacity-70'
                                                        : 'text-lg md:text-2xl font-medium text-slate-400 opacity-70 hover:opacity-90'}
                                        `}
                                        onClick={() => onSeek(line.time)}
                                    >
                                        <p className="leading-relaxed">{line.text}</p>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="whitespace-pre-wrap text-lg md:text-2xl text-slate-300 leading-loose max-w-2xl mx-auto py-10">
                            {currentSong?.lyrics || "No hay letra disponible para esta canción."}
                        </div>
                    )}
                </div>

                {/* Mini Controls Footer */}
                <div className="flex-none pt-6 pb-2 border-t border-white/5 flex items-center justify-center gap-8">
                    <span className="font-mono text-slate-500">{formatTime(currentTime)}</span>
                    <button
                        onClick={onTogglePlay}
                        className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)]"
                    >
                        {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" className="ml-1" />}
                    </button>
                    <span className="font-mono text-slate-500">{formatTime(duration)}</span>
                </div>
            </div>
        );
    }
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

    // Calculate progress
    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;


    return (
        <div className="flex flex-col h-screen bg-black text-white overflow-hidden">

            {/* TOP BAR */}
            <div className="flex-none flex items-center justify-between p-4 md:p-6 bg-gradient-to-b from-black to-transparent z-10">
                <div className="flex items-center gap-2">
                    <button onClick={() => changeView('SELECT')} className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors">
                        <ArrowLeft size={20} />
                        <span className="hidden md:inline font-bold text-sm uppercase tracking-widest">Biblioteca</span>
                    </button>

                    {/* Compact View Toggle */}
                    <button
                        onClick={() => setCompactView(!compactView)}
                        className={`p-2 rounded-full border transition-all ${compactView
                            ? 'bg-sky-500/20 border-sky-500 text-sky-400'
                            : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-white hover:border-slate-500'}`}
                        title={compactView ? 'Vista Normal' : 'Ver Todas las Pistas'}
                    >
                        {compactView ? <List size={18} /> : <LayoutGrid size={18} />}
                    </button>
                </div>

                {/* Song Title - Center */}
                <div className="text-center flex-1 px-4">
                    <h2 className="text-lg md:text-xl font-bold text-white truncate">{currentSong?.title || "Sin Título"}</h2>
                    <p className="text-xs text-slate-500 truncate">{currentSong?.artist}</p>
                </div>

                {/* Letra Button - Top Right */}
                <button
                    onClick={() => changeView('LYRICS')}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 border border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-sky-500 transition-all"
                >
                    <BookOpen size={16} />
                    <span className="text-sm font-bold">Letra</span>
                </button>
            </div>

            {/* MAIN TRACKS AREA */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 md:px-6 lg:px-20 py-4 scrollbar-hide">

                {/* Control Buttons - Compact Row */}
                <div className="flex items-center justify-center gap-3 mb-6">
                    {backingTrackId && (
                        <button
                            onClick={() => {
                                const newState = !isBackingEnabled;
                                setIsBackingEnabled(newState);
                                setTracks(prev => prev.map(t =>
                                    t.id === backingTrackId ? { ...t, mute: !newState } : t
                                ));
                            }}
                            className={`px-4 py-2.5 rounded-full font-bold text-xs tracking-wider uppercase border transition-all flex items-center gap-2
                            ${isBackingEnabled
                                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                    : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'}`}
                        >
                            <Music size={14} />
                            {isBackingEnabled ? 'Música ON' : 'Música OFF'}
                        </button>
                    )}

                    <button
                        onClick={() => setShowAllTracks(!showAllTracks)}
                        className={`px-4 py-2.5 rounded-full font-bold text-xs tracking-wider uppercase border transition-all flex items-center gap-2
                        ${showAllTracks
                                ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400'
                                : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500'}`}
                    >
                        {showAllTracks ? <EyeOff size={14} /> : <Eye size={14} />}
                        {showAllTracks ? 'Ocultar' : 'Más Voces'}
                    </button>
                </div>


                {/* COMPACT VIEW - All tracks visible at once */}
                {compactView ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-2 md:gap-3 pb-8 max-w-6xl mx-auto">
                        {visibleTracks.map(track => {
                            const isSolo = track.solo;
                            const anySolo = tracks.some(t => t.solo);
                            const isAudible = !track.mute && (anySolo ? isSolo : true);

                            return (
                                <button
                                    key={track.id}
                                    onClick={() => handleTrackToggle(track.id)}
                                    className={`group relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 p-2 transition-all
                                    ${isSolo
                                            ? 'bg-sky-500/20 shadow-[0_0_20px_rgba(2,132,199,0.4)] border border-sky-500'
                                            : 'bg-slate-900/70 border border-slate-800 hover:bg-slate-800 hover:border-slate-600'}
                                    `}
                                >
                                    <div className={`w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center transition-all shrink-0
                                        ${isSolo ? 'bg-white text-sky-600' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700'}
                                    `}>
                                        <Mic2 size={16} className="md:w-5 md:h-5" />
                                    </div>
                                    <span className={`text-[10px] md:text-xs font-bold text-center leading-tight line-clamp-2 ${isSolo ? 'text-white' : 'text-slate-400 group-hover:text-white'}`}>
                                        {track.name}
                                    </span>

                                    {/* Signal LED - illuminates entire card */}
                                    <SignalLED
                                        analyser={trackAnalysers ? trackAnalysers[track.id] : undefined}
                                        isPlaying={isPlaying}
                                        isSolo={!!isSolo}
                                        isActive={isAudible}
                                    />
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    /* NORMAL VIEW */
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
                                    className={`group relative w-full aspect-auto md:aspect-square py-6 md:py-0 rounded-3xl flex md:flex-col items-center justify-start md:justify-center gap-6 md:gap-4 px-6 md:px-0 transition-all duration-300
                                    ${isSolo
                                            ? 'bg-transparent shadow-[0_0_40px_rgba(2,132,199,0.4)] scale-[1.02] md:scale-105 border-transparent'
                                            : 'bg-slate-900/50 border border-slate-800 hover:bg-slate-800 hover:border-slate-600'}
                                    `}
                                >
                                    <div className={`relative z-10 w-14 h-14 md:w-16 md:h-16 rounded-full flex items-center justify-center transition-all duration-500 shrink-0
                                        ${isSolo ? 'bg-white text-sky-600 scale-110' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'}
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
                                        isActive={!track.mute && (anySolo ? isSolo : true)}
                                    />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* BOTTOM PLAYBACK CONTROLS - Compact */}
            <div className="flex-none bg-[#050510] border-t border-white/5 px-4 py-3 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20">
                {/* Progress Bar */}
                <div
                    className="w-full h-6 flex items-center relative cursor-pointer group mb-2"
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
                    <div className="w-full h-1.5 bg-slate-800 rounded-full relative overflow-hidden">
                        <div className="absolute top-0 left-0 h-full bg-sky-500" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>

                <div className="flex items-center justify-between max-w-md mx-auto">
                    <span className="text-slate-500 font-mono text-xs w-12 text-left">{formatTime(currentTime)}</span>

                    <button
                        onClick={onTogglePlay}
                        className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-[0_0_20px_rgba(255,255,255,0.15)]"
                    >
                        {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
                    </button>

                    <span className="text-slate-500 font-mono text-xs w-12 text-right">{formatTime(duration)}</span>
                </div>
            </div>

        </div >
    );
};
