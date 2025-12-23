import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Check, Loader2, AlertTriangle, RotateCcw, Search, Music2, Cloud, Plus, Edit2, Trash2, Play } from 'lucide-react';
import Diagnostics from './Diagnostics';
import AdminSongForm from './AdminSongForm';

const Store = ({ isAdminMode, onLoadSong }) => {
    const [songs, setSongs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [downloadingId, setDownloadingId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // Admin State
    const [showForm, setShowForm] = useState(false);
    const [editingSong, setEditingSong] = useState(null);

    // Consultar canciones locales
    const localSongs = useLiveQuery(() => db.myLibrary.toArray(), []);
    const localIds = localSongs ? localSongs.map(s => s.id) : [];

    useEffect(() => {
        console.log("Store View Loaded - Version: Mobile Scale Test " + new Date().toISOString());
        fetchSongs();
    }, []);

    const fetchSongs = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error } = await supabase.from('songs').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            setSongs(data || []);
        } catch (error) {
            console.error('Error fetching songs:', error);
            setError(error.message || 'Error de conexión');
        } finally {
            setLoading(false);
        }
    };

    const downloadSong = async (song) => {
        try {
            setDownloadingId(song.id);
            const response = await fetch(song.zip_url);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            await db.myLibrary.add({
                id: song.id,
                title: song.title,
                artist: song.artist,
                genre: song.genre,
                cover_url: song.cover_url,
                fileBlob: blob
            });
        } catch (error) {
            alert('Error al descargar: ' + error.message);
        } finally {
            setDownloadingId(null);
        }
    };

    // --- ADMIN ACTIONS ---
    const handleAddClick = () => {
        setEditingSong(null);
        setShowForm(true);
    };

    const handleEditClick = (song) => {
        setEditingSong(song);
        setShowForm(true);
    };

    const handleDeleteClick = async (id) => {
        if (!window.confirm("¿Seguro que quieres borrar esta canción permanentemente?")) return;
        try {
            const { error } = await supabase.from('songs').delete().eq('id', id);
            if (error) throw error;
            fetchSongs(); // Refresh
        } catch (err) {
            alert("Error al borrar: " + err.message);
        }
    };

    const handleFormSave = () => {
        fetchSongs(); // Refresh list after add/edit
    };

    const filteredSongs = songs.filter(song =>
        (song.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (song.artist || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return (
        <div className="flex h-full items-center justify-center text-white flex-col gap-4">
            <Loader2 className="animate-spin text-blue-500" size={48} />
            <p className="text-slate-400 animate-pulse font-medium tracking-widest text-xs uppercase">Conectando a la Nube...</p>
        </div>
    );

    if (error) return (
        <div className="flex h-full items-center justify-center text-white flex-col gap-6 p-8 overflow-y-auto">
            <div className="bg-red-500/10 p-6 rounded-2xl border border-red-500/20 flex flex-col items-center gap-4 max-w-md text-center">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center text-red-500 mb-2">
                    <Cloud size={24} />
                </div>
                <h3 className="text-xl font-bold text-white">No se pudo conectar</h3>
                <p className="text-slate-400 text-sm">Hubo un problema al cargar el catálogo de canciones.</p>
                <div className="bg-slate-950 p-3 rounded text-xs font-mono text-slate-500 w-full overflow-x-auto">
                    {error}
                </div>
                <button
                    onClick={fetchSongs}
                    className="w-full py-3 bg-white text-black rounded-lg font-bold hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                >
                    <RotateCcw size={16} /> Reintentar Conexión
                </button>
            </div>
            <div className="w-full max-w-2xl opacity-50 hover:opacity-100 transition-opacity">
                <Diagnostics />
            </div>
        </div>
    );

    return (
        <div className="h-full flex flex-col bg-slate-950 relative">
            {/* Header / Search */}
            <div className={`shrink-0 p-6 border-b z-20 transition-colors duration-300
                ${isAdminMode ? 'bg-slate-900 border-red-900/30' : 'bg-slate-950/50 backdrop-blur-md border-slate-900'}
            `}>
                <div className="max-w-7xl mx-auto flex flex-col sm:flex-row gap-4 items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black tracking-tighter text-white flex items-center gap-2">
                            <Cloud className={isAdminMode ? "text-red-500" : "text-blue-500"} />
                            STORE {isAdminMode && <span className="bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded ml-2 align-middle">ADMIN MODE</span>}
                        </h2>
                        <p className="text-slate-500 text-xs font-bold tracking-widest uppercase">
                            {isAdminMode ? 'Gestión de Catálogo' : 'Catálogo Premium'}
                        </p>
                    </div>

                    <div className="relative w-full sm:w-72 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-blue-500 transition-colors" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar canciones..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-full py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all"
                        />
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
                <div className="max-w-7xl mx-auto">
                    {filteredSongs.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="w-16 h-16 rounded-full bg-slate-900 mx-auto flex items-center justify-center text-slate-600 mb-4">
                                <Search size={24} />
                            </div>
                            <p className="text-slate-500 font-medium">No se encontraron canciones</p>
                            <p className="text-slate-600 text-sm mt-1">Intenta con otro término de búsqueda</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pb-20">
                            {filteredSongs.map((song) => {
                                const localSong = localSongs?.find(s => s.id === song.id);
                                const isDownloaded = !!localSong;
                                const isDownloading = downloadingId === song.id;

                                return (
                                    <div key={song.id} className={`group bg-slate-900 hover:bg-slate-800 border rounded-xl p-3 transition-all hover:shadow-xl hover:shadow-black/50 hover:-translate-y-1 relative overflow-hidden
                                        ${isAdminMode ? 'border-dashed border-slate-700 hover:border-red-500/50' : 'border-slate-800 hover:border-slate-700'}
                                    `}>
                                        {/* Cover */}
                                        <div className="aspect-square rounded-lg overflow-hidden bg-slate-950 relative mb-3 shadow-md">
                                            <img
                                                src={song.cover_url || 'https://via.placeholder.com/300x300?text=Music'}
                                                alt={song.title}
                                                className={`w-full h-full object-cover transition-transform duration-500 ${isDownloaded ? 'opacity-50' : 'group-hover:scale-110'}`}
                                            />

                                            {/* ADMIN ACTIONS OVERLAY */}
                                            {isAdminMode ? (
                                                <div className="absolute top-2 right-2 flex flex-col gap-2 z-10">
                                                    <button
                                                        onClick={() => handleEditClick(song)}
                                                        className="w-8 h-8 rounded-full bg-slate-900/90 text-blue-400 flex items-center justify-center hover:bg-white hover:scale-110 transition shadow-lg border border-white/10"
                                                    >
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteClick(song.id)}
                                                        className="w-8 h-8 rounded-full bg-slate-900/90 text-red-500 flex items-center justify-center hover:bg-red-600 hover:text-white hover:scale-110 transition shadow-lg border border-white/10"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                /* NORMAL ACTIONS */
                                                <div className={`absolute inset-0 flex items-center justify-center transition-all duration-300
                                                    ${isDownloaded
                                                        ? 'bg-black/20 opacity-100'
                                                        : 'bg-black/40 opacity-0 group-hover:opacity-100 backdrop-blur-[1px]'}
                                                `}>
                                                    {isDownloading ? (
                                                        <Loader2 className="animate-spin text-white" size={24} />
                                                    ) : isDownloaded ? (
                                                        <button
                                                            onClick={() => onLoadSong(localSong)}
                                                            className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/40 hover:scale-110 hover:bg-green-400 transition-all text-black"
                                                            title="Reproducir"
                                                        >
                                                            <Play size={18} fill="currentColor" />
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => downloadSong(song)}
                                                            className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-110 transition-transform shadow-lg hover:bg-blue-50"
                                                            title="Descargar"
                                                        >
                                                            <Download size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {/* Genre Tag */}
                                            {song.genre && !isAdminMode && (
                                                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/60 backdrop-blur-md text-[9px] font-bold text-white uppercase tracking-wider border border-white/10">
                                                    {song.genre}
                                                </div>
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex flex-col gap-0.5">
                                            <h3 className={`font-bold text-sm leading-tight truncate ${isDownloaded && !isAdminMode ? 'text-slate-400' : 'text-white'}`} title={song.title}>
                                                {song.title}
                                            </h3>
                                            <p className="text-xs text-slate-500 truncate">{song.artist}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* ADMIN FAB (Floating Action Button) */}
            {isAdminMode && (
                <button
                    onClick={handleAddClick}
                    className="absolute bottom-8 right-8 w-14 h-14 bg-green-500 text-black rounded-full shadow-[0_0_30px_rgba(34,197,94,0.4)] flex items-center justify-center hover:scale-110 hover:bg-white transition-all z-30 animate-in zoom-in duration-300"
                >
                    <Plus size={28} strokeWidth={2.5} />
                </button>
            )}

            {/* ADMIN FORM MODAL */}
            {showForm && (
                <AdminSongForm
                    songToEdit={editingSong}
                    onClose={() => setShowForm(false)}
                    onSave={handleFormSave}
                />
            )}
        </div>
    );
};

export default Store;
