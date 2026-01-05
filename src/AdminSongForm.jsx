import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Save, Loader2, Music, Link, Image as ImageIcon, FileArchive, AlertTriangle, X } from 'lucide-react';

const AdminSongForm = ({ songToEdit, onClose, onSave }) => {
    const [formData, setFormData] = useState({
        title: '',
        artist: '',
        genre: '',
        zip_url: '',
        cover_url: '',
        mix_rules: []
    });

    // Track State (was mix_rules)
    const [newTrack, setNewTrack] = useState({ name: '', url: '', vol: 75, pan: 0, mute: false });

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (songToEdit) {
            setFormData({
                title: songToEdit.title,
                artist: songToEdit.artist,
                genre: songToEdit.genre || '',
                zip_url: songToEdit.zip_url || '',
                cover_url: songToEdit.cover_url || '',
                mix_rules: songToEdit.mix_rules || []
            });
        }
    }, [songToEdit]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const addTrack = () => {
        if (!newTrack.name) return;
        setFormData(prev => ({
            ...prev,
            mix_rules: [...prev.mix_rules, { ...newTrack, id: Date.now() }]
        }));
        setNewTrack({ name: '', url: '', vol: 75, pan: 0, mute: false });
    };

    const removeRule = (id) => {
        setFormData(prev => ({
            ...prev,
            mix_rules: prev.mix_rules.filter(r => r.id !== id)
        }));
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

                        {/* MIX RULES SECTION */}
                        {/* TRACK MIX CONFIGURATION */}
                        {/* INDIVIDUAL TRACKS / STEMS */}
                        <div className="border-t border-slate-800 pt-4 mt-4">
                            <label className="block text-xs font-bold text-green-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Link size={14} /> Pistas Individuales (Stems)
                            </label>

                            <div className="bg-slate-950/50 rounded-lg border border-slate-800 overflow-hidden">
                                {/* Table Header */}
                                <div className="grid grid-cols-12 gap-2 p-2 bg-slate-900 border-b border-slate-800 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                    <div className="col-span-3">Nombre Pista</div>
                                    <div className="col-span-3">Link Audio (MP3/WAV)</div>
                                    <div className="col-span-2 text-center">Vol %</div>
                                    <div className="col-span-2 text-center">Pan</div>
                                    <div className="col-span-2 text-right">Acción</div>
                                </div>

                                {/* Input Row */}
                                <div className="grid grid-cols-12 gap-2 p-2 bg-slate-800/30 items-center border-b border-slate-800/50">
                                    <div className="col-span-3">
                                        <input
                                            value={newTrack.name}
                                            onChange={e => setNewTrack({ ...newTrack, name: e.target.value })}
                                            placeholder="ej. Bateria"
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-white"
                                        />
                                    </div>
                                    <div className="col-span-3">
                                        <input
                                            value={newTrack.url}
                                            onChange={e => setNewTrack({ ...newTrack, url: e.target.value })}
                                            placeholder="https://..."
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-blue-200"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <input
                                            type="number"
                                            min="0" max="100"
                                            value={newTrack.vol}
                                            onChange={e => setNewTrack({ ...newTrack, vol: parseInt(e.target.value) })}
                                            className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-white text-center"
                                        />
                                    </div>
                                    <div className="col-span-2 flex gap-1">
                                        <input
                                            type="number"
                                            min="-100" max="100"
                                            value={newTrack.pan}
                                            onChange={e => setNewTrack({ ...newTrack, pan: parseInt(e.target.value) })}
                                            className="w-12 bg-slate-900 border border-slate-700 rounded px-1 py-1 text-xs text-white text-center"
                                            placeholder="0"
                                        />
                                        <label className="flex items-center justify-center bg-slate-900 px-1 rounded border border-slate-700 cursor-pointer flex-1">
                                            <input
                                                type="checkbox"
                                                checked={newTrack.mute}
                                                onChange={e => setNewTrack({ ...newTrack, mute: e.target.checked })}
                                                className="hidden"
                                            />
                                            <span className={`text-[9px] font-bold ${newTrack.mute ? 'text-red-400' : 'text-slate-500'}`}>
                                                {newTrack.mute ? 'M' : 'ON'}
                                            </span>
                                        </label>
                                    </div>

                                    <div className="col-span-2 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={addTrack}
                                            className="bg-green-600 hover:bg-green-500 text-white p-1.5 rounded shadow-lg shadow-green-900/20 w-full flex justify-center"
                                        >
                                            <Save size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* List of Tracks */}
                                <div className="max-h-40 overflow-y-auto">
                                    {formData.mix_rules?.map((track, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 p-2 border-b border-white/5 items-center hover:bg-slate-800/50 transition-colors">
                                            <div className="col-span-3 text-xs text-white font-medium truncate" title={track.name}>{track.name}</div>
                                            <div className="col-span-3 text-[10px] text-blue-300 truncate font-mono" title={track.url}>{track.url || '(En ZIP)'}</div>
                                            <div className="col-span-2 text-xs text-slate-300 text-center">{track.vol}%</div>
                                            <div className="col-span-2 text-xs text-slate-300 text-center flex justify-center gap-1">
                                                <span>P:{track.pan || 0}</span>
                                                {track.mute && <span className="text-red-400 font-bold text-[9px]">M</span>}
                                            </div>
                                            <div className="col-span-2 flex justify-end">
                                                <button type="button" onClick={() => removeRule(track.id)} className="text-slate-500 hover:text-red-400 p-1">
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {(!formData.mix_rules || formData.mix_rules.length === 0) && (
                                        <div className="p-4 text-center">
                                            <p className="text-[10px] text-slate-600 italic">No hay pistas agregadas</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2">
                                * Si dejas el Link vacío, el sistema buscará un archivo coincidente dentro del ZIP principal.
                            </p>
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
