import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Save, Loader2, Music, Link, Image as ImageIcon, FileArchive, AlertTriangle, X } from 'lucide-react';

const AdminSongForm = ({ songToEdit, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        artist: '',
        genre: '',
        zip_url: '',
        cover_url: ''
    });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (songToEdit) {
            setFormData({
                title: songToEdit.title,
                artist: songToEdit.artist,
                genre: songToEdit.genre || '',
                zip_url: songToEdit.zip_url || '',
                cover_url: songToEdit.cover_url || ''
            });
        }
    }, [songToEdit]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError(null);

        try {
            if (songToEdit) {
                // UPDATE
                const { error } = await supabase
                    .from('songs')
                    .update(formData)
                    .eq('id', songToEdit.id);
                if (error) throw error;
            } else {
                // INSERT
                const { error } = await supabase
                    .from('songs')
                    .insert([formData]);
                if (error) throw error;
            }

            onSave(); // Refresh parent
            onClose(); // Close modal
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden relative">
                {/* Header */}
                <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/50">
                    <h3 className="font-bold text-lg text-white">
                        {songToEdit ? 'Editar Canción' : 'Agregar Nueva Canción'}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-slate-800 rounded-full transition text-slate-400 hover:text-white">
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 max-h-[80vh] overflow-y-auto">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Título</label>
                            <div className="relative">
                                <Music size={16} className="absolute left-3 top-3 text-slate-500" />
                                <input
                                    type="text"
                                    name="title"
                                    value={formData.title}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 pl-10 pr-4 text-sm focus:border-blue-500 focus:outline-none text-white"
                                    placeholder="Ej. Amazing Grace"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Artista / Creador</label>
                            <input
                                type="text"
                                name="artist"
                                value={formData.artist}
                                onChange={handleInputChange}
                                required
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-4 text-sm focus:border-blue-500 focus:outline-none text-white"
                                placeholder="Ej. John Doe"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">Género</label>
                            <input
                                type="text"
                                name="genre"
                                value={formData.genre}
                                onChange={handleInputChange}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg py-2.5 px-4 text-sm focus:border-blue-500 focus:outline-none text-white"
                                placeholder="Ej. Pop"
                            />
                        </div>

                        <div className="border-t border-slate-800 pt-4 mt-4">
                            <label className="block text-xs font-bold text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <FileArchive size={14} /> Link del Archivo ZIP
                            </label>
                            <input
                                type="url"
                                name="zip_url"
                                value={formData.zip_url}
                                onChange={handleInputChange}
                                required
                                className="w-full bg-slate-950 border border-blue-500/30 rounded-lg py-2.5 px-4 text-sm focus:border-blue-500 focus:outline-none text-blue-200"
                                placeholder="https://dropbox.com/..."
                            />
                            <p className="text-[10px] text-slate-500 mt-1">Enlace directo al archivo ZIP (Dropbox, Drive, etc)</p>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <ImageIcon size={14} /> Link de la Imagen
                            </label>
                            <input
                                type="url"
                                name="cover_url"
                                value={formData.cover_url}
                                onChange={handleInputChange}
                                className="w-full bg-slate-950 border border-purple-500/30 rounded-lg py-2.5 px-4 text-sm focus:border-purple-500 focus:outline-none text-purple-200"
                                placeholder="https://imgur.com/..."
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 p-3 rounded text-red-400 text-xs flex items-center gap-2">
                                <AlertTriangle size={16} /> {error}
                            </div>
                        )}

                        <div className="pt-4 flex gap-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-lg font-bold hover:bg-slate-700 transition"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition shadow-lg shadow-green-900/20"
                            >
                                {saving ? <Loader2 className="animate-spin" /> : <Save size={18} />}
                                {songToEdit ? 'Guardar Cambios' : 'Añadir Canción'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default AdminSongForm;
