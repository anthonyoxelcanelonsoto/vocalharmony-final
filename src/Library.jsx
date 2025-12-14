import React from 'react';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trash2, Play, Music, Share2 } from 'lucide-react';

const Library = ({ onLoadSong }) => {
    const songs = useLiveQuery(() => db.myLibrary.toArray());

    const handlePlay = (song) => {
        console.log("Cargando:", song.title);
        if (onLoadSong) {
            onLoadSong(song);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('¿Eliminar esta canción?')) {
            await db.myLibrary.delete(id);
        }
    };

    if (!songs) return <div className="p-8 text-center text-white">Cargando biblioteca...</div>;

    if (songs.length === 0) return (
        <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-4 mt-20">
            <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center">
                <Music size={40} className="text-gray-600" />
            </div>
            <p className="text-lg font-medium">Tu biblioteca está vacía</p>
            <p className="text-sm">Ve a la Tienda para descargar canciones</p>
        </div>
    );

    return (
        <div className="p-6 bg-slate-950 min-h-full">
            <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
                <Music className="text-orange-500" /> TU BIBLIOTECA
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 pb-20">
                {songs.map((song) => (
                    <div key={song.id} className="group bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl p-3 transition-all hover:shadow-xl hover:shadow-black/50 hover:-translate-y-1 relative overflow-hidden">

                        <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(song.id); }}
                            className="absolute top-2 right-2 p-2 bg-black/50 hover:bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                            title="Borrar canción"
                        >
                            <Trash2 size={14} />
                        </button>

                        <button
                            onClick={async (e) => {
                                e.stopPropagation();
                                if (navigator.share) {
                                    try {
                                        const file = new File([song.fileBlob], `${song.title}.zip`, { type: 'application/zip' });
                                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                                            try {
                                                await navigator.share({
                                                    files: [file],
                                                    title: song.title,
                                                    text: `Check out my song "${song.title}" created with VocalHarmony Pro!`
                                                });
                                            } catch (shareErr) {
                                                if (shareErr.name !== 'AbortError') {
                                                    alert("Error al compartir: " + shareErr + ". Iniciando descarga...");
                                                    // Fallback
                                                    const url = URL.createObjectURL(song.fileBlob);
                                                    const a = document.createElement('a');
                                                    a.href = url;
                                                    a.download = `${song.title}.zip`;
                                                    document.body.appendChild(a);
                                                    a.click();
                                                    document.body.removeChild(a);
                                                }
                                            }
                                        } else {
                                            alert("Tu dispositivo no admite compartir este archivo. Descargando...");
                                            // Fallback
                                            const url = URL.createObjectURL(song.fileBlob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = `${song.title}.zip`;
                                            document.body.appendChild(a);
                                            a.click();
                                            document.body.removeChild(a);
                                        }
                                    } catch (err) {
                                        console.error("Share failed:", err);
                                        alert("Error al preparar archivo para compartir: " + err);
                                    }
                                } else {
                                    alert("Tu navegador no soporta la función Compartir. Descargando...");
                                    // Fallback
                                    const url = URL.createObjectURL(song.fileBlob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = `${song.title}.zip`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                }
                            }}
                            className="absolute top-2 left-2 p-2 bg-black/50 hover:bg-blue-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                            title="Compartir Proyecto (ZIP)"
                        >
                            <Share2 size={14} />
                        </button>

                        <div className="relative aspect-square mb-3 shadow-md rounded-lg overflow-hidden bg-slate-950">
                            <img
                                src={song.cover_url || 'https://via.placeholder.com/300x300?text=No+Cover'}
                                alt={song.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                            {/* Overlay de Play al hacer hover en la imagen */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-[1px]">
                                <button
                                    onClick={() => handlePlay(song)}
                                    className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center text-black shadow-xl hover:scale-110 transition-transform"
                                >
                                    <Play size={24} fill="currentColor" className="ml-1" />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-0.5">
                            <h3 className="text-white font-bold text-sm truncate leading-tight">{song.title}</h3>
                            <p className="text-slate-500 text-xs truncate">{song.artist}</p>
                            {song.genre && (
                                <span className="self-start text-[9px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded border border-slate-700 mt-1">
                                    {song.genre}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Library;
