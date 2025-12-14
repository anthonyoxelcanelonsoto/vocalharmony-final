import React, { useState, useEffect, useRef } from 'react';
import { Mic, Play, Pause, SkipBack, SkipForward, Settings, Archive, Loader2, Info, Plus, Menu, Music, Activity, ChevronDown, ChevronUp, Zap, Sliders, Power, Disc, Square, X, SlidersHorizontal, Mic2, Download, FileAudio, Wand2, RotateCcw, AlertTriangle, Check, ArrowRight, Minus, Music2, ShoppingBag, BookOpen, LayoutGrid, Cloud, Folder, Upload, Headphones, Trash2, Share2 } from 'lucide-react';
import { supabase } from './src/supabaseClient';
import Store from './src/Store';
import Library from './src/Library';
import { db } from './src/db';
import * as Tone from 'tone';
import { Track, LyricLine, NoteBlock, AppMode, NoteData } from './types';
import { getNoteFromPitch, autoCorrelate, parseLRC, loadJSZip, audioBufferToMp3, audioBufferToWav, analyzeAudioBlocks } from './utils';
import { Knob, VuMeter, MiniFader, SignalLight } from './components/Controls';
import { PitchVisualizer } from './components/Visualizer';
import { Timeline } from './components/Timeline';
import { LyricsOverlay } from './components/LyricsOverlay';

// --- HAPTIC HELPER ---
const vibrate = (ms: number = 10) => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(ms);
    }
};

const getInitialTracks = (): Track[] => [
    { id: 99, name: "VOX REC", color: "#ef4444", vol: 1.0, pan: 0.5, mute: false, solo: false, hasFile: false, isArmed: true, isTuning: false, duration: 0, pitchShift: 0 },
];

export default function App() {
    // --- STATE ---
    const [user, setUser] = useState<any>(null); // Auth User
    const [tracks, setTracks] = useState<Track[]>(getInitialTracks());
    const [selectedTrackId, setSelectedTrackId] = useState(99);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
    const [micAnalyser, setMicAnalyser] = useState<AnalyserNode | null>(null);
    const [viewMode, setViewMode] = useState<'piano' | 'staff'>('staff');
    const [showControls, setShowControls] = useState(true);

    // New AppMode state: SIMPLE | PRO | ULTRA
    const [appMode, setAppMode] = useState<AppMode>('SIMPLE');
    const [pendingMode, setPendingMode] = useState<AppMode | null>(null); // For mode switch confirmation
    const [mainView, setMainView] = useState<'studio' | 'store' | 'library'>('studio');

    const [importedLyrics, setImportedLyrics] = useState<LyricLine[]>([]);
    const [importedChords, setImportedChords] = useState<LyricLine[]>([]);

    // Ultra Mode State
    const [noteBlocks, setNoteBlocks] = useState<NoteBlock[]>([]);
    const [pitchEditTrackId, setPitchEditTrackId] = useState<number | null>(null);
    const [tempPitch, setTempPitch] = useState(0);
    const [isProcessingPitch, setIsProcessingPitch] = useState(false);

    // Settings State
    const [showSettings, setShowSettings] = useState(false);
    const [isAdminMode, setIsAdminMode] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false); // Modal state for reset
    const [loadingAuth, setLoadingAuth] = useState(false);
    const [deleteTrackId, setDeleteTrackId] = useState<number | null>(null); // State for track deletion confirmation

    // Derived state for selected track (safe access)
    const selectedTrack = tracks.find(t => t.id === selectedTrackId);
    const activeTrackName = selectedTrack ? selectedTrack.name : "No Tracks";
    const activeTrackColor = selectedTrack ? selectedTrack.color : "#475569";

    const confirmDeleteTrack = () => {
        if (deleteTrackId !== null) {
            vibrate(20);
            setTracks(prev => prev.filter(t => t.id !== deleteTrackId));
            // Cleanup buffers
            delete audioBuffersRef.current[deleteTrackId];
            delete processedBuffersRef.current[deleteTrackId];
            delete activeSourcesRef.current[deleteTrackId];

            // If deleting the selected track, select another or none
            if (selectedTrackId === deleteTrackId) {
                setSelectedTrackId(99);
            }
            setDeleteTrackId(null);
        }
    };

    // --- AUTH LISTENER ---
    useEffect(() => {
        const targetEmail = 'anthonyoxelcanelonsoto@gmail.com';

        const checkUser = (currentSession: any) => {
            const currentUser = currentSession?.user ?? null;
            setUser(currentUser);

            // Normalize email check
            const userEmail = currentUser?.email?.trim().toLowerCase();
            if (userEmail === targetEmail) {
                setIsAdminMode(true); // AUTO-ENABLE
            } else {
                setIsAdminMode(false); // Force off if mismatch
            }
        };

        // Check active session
        supabase.auth.getSession().then(({ data: { session } }) => checkUser(session));

        // Listen for changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => checkUser(session));

        return () => subscription.unsubscribe();
    }, []);

    const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
    const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedInputId, setSelectedInputId] = useState<string>('');
    const [selectedOutputId, setSelectedOutputId] = useState<string>('');
    const [exportFormat, setExportFormat] = useState<'wav' | 'mp3'>('wav');

    // Audio Playback State
    const [currentTime, setCurrentTime] = useState(0);
    const [maxDuration, setMaxDuration] = useState(0);
    const [loopStart, setLoopStart] = useState<number | null>(null);
    const [loopEnd, setLoopEnd] = useState<number | null>(null);

    // Key Signature State
    const [keySignature, setKeySignature] = useState<string | null>(null);

    // --- REFS ---
    const audioBuffersRef = useRef<{ [id: number]: AudioBuffer }>({});
    const processedBuffersRef = useRef<{ [id: number]: AudioBuffer }>({}); // Cache for pitch-shifted buffers
    const activeSourcesRef = useRef<{ [id: number]: AudioBufferSourceNode }>({});
    const trackGainNodesRef = useRef<{ [id: number]: GainNode }>({});
    const trackPanNodesRef = useRef<{ [id: number]: StereoPannerNode }>({});
    const trackAnalysersRef = useRef<{ [id: number]: AnalyserNode }>({});
    const masterGainRef = useRef<GainNode | null>(null);
    const startTimeRef = useRef<number>(0);
    const pauseOffsetRef = useRef<number>(0);
    const animationFrameRef = useRef<number | undefined>(undefined);

    const isPlayingRef = useRef(false);
    const isRecordingRef = useRef(false);
    const noteBlocksRef = useRef<NoteBlock[]>([]);

    const recorderNodeRef = useRef<ScriptProcessorNode | null>(null);
    const recordingBuffersRef = useRef<Float32Array[]>([]);
    const micStreamRef = useRef<MediaStream | null>(null);

    const loopStartRef = useRef<number | null>(null);
    const loopEndRef = useRef<number | null>(null);

    const REC_BUFFER_SIZE = 4096;

    // SAVE PROJECT STATE
    const [showSaveModal, setShowSaveModal] = useState(false);
    const [saveTitle, setSaveTitle] = useState("");
    const [saveArtist, setSaveArtist] = useState("");
    const [saveGenre, setSaveGenre] = useState("");
    const [saveImage, setSaveImage] = useState<File | null>(null);
    const [saveImagePreview, setSaveImagePreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // SHARE STATE
    const [showShareModal, setShowShareModal] = useState(false);
    const [isSharing, setIsSharing] = useState(false);

    useEffect(() => {
        noteBlocksRef.current = noteBlocks;
    }, [noteBlocks]);

    const loadDevices = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(t => t.stop());

            const devices = await navigator.mediaDevices.enumerateDevices();
            const inputs = devices.filter(d => d.kind === 'audioinput');
            const outputs = devices.filter(d => d.kind === 'audiooutput');

            setInputDevices(inputs);
            setOutputDevices(outputs);

            if (!selectedInputId && inputs.length > 0) setSelectedInputId(inputs[0].deviceId);
            if (!selectedOutputId && outputs.length > 0) setSelectedOutputId(outputs[0].deviceId);
        } catch (e) {
            console.warn("Could not enumerate devices", e);
        }
    };

    useEffect(() => {
        if (showSettings) {
            loadDevices();
        }
    }, [showSettings]);

    const handleOutputChange = async (deviceId: string) => {
        setSelectedOutputId(deviceId);
        if (audioContext && (audioContext as any).setSinkId) {
            try {
                await (audioContext as any).setSinkId(deviceId);
            } catch (e) {
                console.error("Failed to set output device", e);
            }
        }
    };

    const initAudioContext = async () => {
        let ctx = audioContext;
        if (!ctx) {
            const Ctx = window.AudioContext || (window as any).webkitAudioContext;
            ctx = new Ctx({ latencyHint: 'interactive', sampleRate: 48000 });
            setAudioContext(ctx);

            const masterGain = ctx.createGain();
            masterGain.connect(ctx.destination);
            masterGainRef.current = masterGain;

            if (selectedOutputId && (ctx as any).setSinkId) {
                try { await (ctx as any).setSinkId(selectedOutputId); } catch (e) { }
            }
        }
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        return ctx;
    };

    const setupMicrophone = async (ctx: AudioContext) => {
        try {
            if (micStreamRef.current) {
                micStreamRef.current.getTracks().forEach(t => t.stop());
            }

            const constraints: MediaStreamConstraints = {
                audio: {
                    deviceId: selectedInputId ? { exact: selectedInputId } : undefined,
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                    channelCount: 1
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            micStreamRef.current = stream;

            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            setMicAnalyser(analyser);
            return { source, stream };
        } catch (e) {
            console.error("Mic setup failed", e);
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false } });
                micStreamRef.current = stream;
                const source = ctx.createMediaStreamSource(stream);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 2048;
                source.connect(analyser);
                setMicAnalyser(analyser);
                return { source, stream };
            } catch (err) {
                alert("Could not access microphone. Please check permissions.");
                return null;
            }
        }
    };

    const stopAudio = () => {
        isPlayingRef.current = false;

        // Stop Sources
        Object.values(activeSourcesRef.current).forEach((source: AudioBufferSourceNode) => {
            try {
                source.stop();
                source.disconnect();
            } catch (e) { }
        });
        activeSourcesRef.current = {};

        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        setIsPlaying(false);
    };

    // --- OFFLINE PITCH SHIFT ENGINE ---
    const processPitchShift = async (originalBuffer: AudioBuffer, semitones: number): Promise<AudioBuffer> => {
        if (semitones === 0) return originalBuffer;

        // Use Tone.Offline with optimized GrainPlayer
        // Using GrainPlayer provides better quality than PitchShift (which uses delay lines)
        // We optimize performance by increasing grainSize (fewer grains to schedule)
        const result = await Tone.Offline(({ transport }) => {
            const player = new Tone.GrainPlayer(originalBuffer).toDestination();
            player.detune = semitones * 100;

            // Performance Optimization:
            // grainSize 0.2s = 200ms. Standard is 0.05-0.1.
            // Larger grains mean 4x fewer scheduling events, drastically speeding up offline render.
            // It also sounds less "robotic" and smoother for full mixes/vocals, though may have slight "slap" on transients.
            player.grainSize = 0.2;
            player.overlap = 0.1;

            player.start(0);
        }, originalBuffer.duration, 2, 44100); // Render at 44.1k to save resources if system is 48k/96k

        // Tone.Offline returns a ToneAudioBuffer wrapper, we need the native AudioBuffer
        // @ts-ignore
        if (result && typeof result.get === 'function') {
            // @ts-ignore
            return result.get();
        }

        return result as unknown as AudioBuffer;
    };

    const playAudio = async (offset: number) => {
        const ctx = await initAudioContext();
        if (!ctx) return;

        if (Tone.getContext().rawContext !== ctx) {
            Tone.setContext(ctx);
        }
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }

        stopAudio();

        const startTime = ctx.currentTime;
        startTimeRef.current = startTime - offset;

        const anySolo = tracks.some(t => t.solo);

        const currentLoopStart = loopStartRef.current;
        const currentLoopEnd = loopEndRef.current;

        tracks.forEach(track => {
            // Decide which buffer to use: Processed (if shifted) or Original
            let buffer = audioBuffersRef.current[track.id];

            // Check if we have a processed buffer for this track
            if (track.pitchShift !== 0 && processedBuffersRef.current[track.id]) {
                buffer = processedBuffersRef.current[track.id];
            }

            if (buffer) {
                const source = ctx.createBufferSource();
                source.buffer = buffer;

                const gainNode = ctx.createGain();
                const panNode = ctx.createStereoPanner();
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 2048;

                source.connect(gainNode);

                // NoteBlock fine-tuning (NewTone) - runs on top of the base buffer
                if (appMode === 'ULTRA' && track.id === selectedTrackId && noteBlocksRef.current.length > 0) {
                    noteBlocksRef.current.forEach(block => {
                        if (block.shiftCents !== 0) {
                            const s = Math.max(0, block.start);
                            const e = Math.min(buffer.duration, block.end);
                            const cents = block.shiftCents;

                            try {
                                const absStart = startTime - offset + s;
                                const absEnd = startTime - offset + e;

                                if (absStart >= ctx.currentTime) {
                                    source.detune.setValueAtTime(0, absStart);
                                    source.detune.linearRampToValueAtTime(cents, absStart + 0.05);
                                    source.detune.setValueAtTime(cents, absEnd - 0.05);
                                    source.detune.linearRampToValueAtTime(0, absEnd);
                                }
                            } catch (err) { console.warn("Auto-tune scheduling error", err); }
                        }
                    });
                } else {
                    source.detune.value = 0;
                }

                if (currentLoopStart !== null && currentLoopEnd !== null) {
                    source.loop = true;
                    source.loopStart = currentLoopStart;
                    source.loopEnd = currentLoopEnd;
                    let startPos = offset;
                    if (offset < currentLoopStart || offset > currentLoopEnd) {
                        startPos = currentLoopStart;
                        startTimeRef.current = startTime - currentLoopStart;
                    }
                    try { source.start(startTime, startPos); } catch (e) { }
                } else {
                    source.loop = false;
                    try { source.start(startTime, offset); } catch (e) { }
                }

                gainNode.connect(panNode);
                panNode.connect(analyser);
                if (masterGainRef.current) analyser.connect(masterGainRef.current);

                const shouldPlay = !track.mute && (!anySolo || track.solo);
                gainNode.gain.value = shouldPlay ? track.vol : 0;
                panNode.pan.value = (track.pan * 2) - 1;

                activeSourcesRef.current[track.id] = source;
                trackGainNodesRef.current[track.id] = gainNode;
                trackPanNodesRef.current[track.id] = panNode;
                trackAnalysersRef.current[track.id] = analyser;
            }
        });

        setIsPlaying(true);
        isPlayingRef.current = true;

        const loop = () => {
            if (!isPlayingRef.current) return;
            const now = ctx.currentTime;
            let trackedTime = now - startTimeRef.current;
            const lStart = loopStartRef.current;
            const lEnd = loopEndRef.current;

            if (lStart !== null && lEnd !== null && trackedTime >= lEnd) {
                const loopDur = lEnd - lStart;
                startTimeRef.current += loopDur;
                trackedTime = lStart + (trackedTime - lEnd);
            }

            setCurrentTime(trackedTime);
            if (lStart === null && maxDuration > 0 && trackedTime > maxDuration + 0.1 && !isRecordingRef.current) {
                stopAudio();
                setCurrentTime(0);
                pauseOffsetRef.current = 0;
                setIsPlaying(false);
                return;
            }
            animationFrameRef.current = requestAnimationFrame(loop);
        };
        animationFrameRef.current = requestAnimationFrame(loop);
    };

    const convertBufferToMp3 = (buffer: AudioBuffer): Blob => {
        // @ts-ignore
        if (!window.lamejs) {
            throw new Error("LameJS not loaded");
        }
        // @ts-ignore
        const mp3encoder = new window.lamejs.Mp3Encoder(buffer.numberOfChannels, buffer.sampleRate, 128);
        const mp3Data = [];
        const blockSize = 1152;

        const leftData = buffer.getChannelData(0);
        const rightData = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : null;

        for (let i = 0; i < buffer.length; i += blockSize) {
            const leftChunk = leftData.subarray(i, i + blockSize);
            const rightChunk = rightData ? rightData.subarray(i, i + blockSize) : null;
            const leftInt16 = new Int16Array(leftChunk.length);
            const rightInt16 = rightChunk ? new Int16Array(rightChunk.length) : null;
            for (let j = 0; j < leftChunk.length; j++) {
                let val = Math.max(-1, Math.min(1, leftChunk[j]));
                leftInt16[j] = val < 0 ? val * 0x8000 : val * 0x7FFF;
                if (rightInt16 && rightChunk) {
                    let valR = Math.max(-1, Math.min(1, rightChunk[j]));
                    rightInt16[j] = valR < 0 ? valR * 0x8000 : valR * 0x7FFF;
                }
            }
            const mp3buf = rightInt16
                ? mp3encoder.encodeBuffer(leftInt16, rightInt16)
                : mp3encoder.encodeBuffer(leftInt16);
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
        }
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) mp3Data.push(mp3buf);
        return new Blob(mp3Data, { type: 'audio/mp3' });
    };

    const generateMixdownBlob = async (format: 'wav' | 'mp3'): Promise<Blob> => {
        if (!audioContext) {
            throw new Error("El sistema de audio no está activo. Por favor, pulsa 'Play' o toca la pantalla para iniciarlo.");
        }

        // 1. OFFLINE RENDER
        const offlineCtx = new OfflineAudioContext(
            2,
            Math.ceil(maxDuration * audioContext.sampleRate),
            audioContext.sampleRate
        );

        // Recreate tracks in Offline Context
        const activeTracks = tracks.filter(t => !t.mute && (audioBuffersRef.current[t.id] || processedBuffersRef.current[t.id]));

        if (activeTracks.length === 0) {
            throw new Error("No hay pistas activas (con audio y sin silencio) para exportar.");
        }

        for (const track of activeTracks) {
            const buffer = processedBuffersRef.current[track.id] || audioBuffersRef.current[track.id];
            if (buffer) {
                const source = offlineCtx.createBufferSource();
                source.buffer = buffer;

                const panner = offlineCtx.createStereoPanner();
                panner.pan.value = track.pan;

                const gain = offlineCtx.createGain();
                gain.gain.value = track.vol;

                source.connect(panner);
                panner.connect(gain);
                gain.connect(offlineCtx.destination);

                source.start(0);
            }
        }

        const renderedBuffer = await offlineCtx.startRendering();

        // 2. CONVERT TO FORMAT
        if (format === 'mp3') {
            return await audioBufferToMp3(renderedBuffer);
        } else {
            return await audioBufferToWav(renderedBuffer);
        }
    };

    const generateProjectZipBlob = async (): Promise<Blob> => {
        const tracksToExport = tracks.filter(t => (audioBuffersRef.current[t.id] || processedBuffersRef.current[t.id]));

        if (tracksToExport.length === 0) {
            throw new Error(`No se encontraron pistas de audio para exportar. Pistas totales: ${tracks.length}`);
        }

        const JSZip = await loadJSZip();
        const zip = new JSZip();

        try {
            // 1. ADD AUDIO TRACKS
            for (const track of tracksToExport) {
                const buffer = processedBuffersRef.current[track.id] || audioBuffersRef.current[track.id];
                if (buffer) {
                    const mp3Blob = await audioBufferToMp3(buffer);
                    zip.file(`${track.id}_${track.name}.mp3`, mp3Blob);
                }
            }
            // 2. ADD PROJECT METADATA
            const metadata = {
                title: saveTitle || "Untitled Project",
                created: new Date().toISOString(),
                tracks: tracks.map(t => ({ id: t.id, name: t.name, vol: t.vol, pan: t.pan, mute: t.mute, solo: t.solo }))
            };
            zip.file("project.json", JSON.stringify(metadata, null, 2));

            // 3. ADD COVER IMAGE IF EXISTS
            if (saveImage) {
                zip.file(`cover.${saveImage.name.split('.').pop()}`, saveImage);
            }

            return await zip.generateAsync({ type: "blob" });
        } catch (err) {
            console.error("Zip Gen Error: ", err);
            throw new Error("Error interno generando ZIP: " + err);
        }
    };

    const handleShare = async (type: 'mix' | 'project') => {
        setIsSharing(true);
        vibrate(20);

        // Debug: Check support
        if (!navigator.share) {
            alert("Aviso: Tu navegador no soporta la función nativa 'Compartir'. Se usará descarga directa.");
        }

        try {
            let blob: Blob | null = null;
            let filename = "";

            if (type === 'mix') {
                blob = await generateMixdownBlob(exportFormat);
                filename = `VocalHarmony_Mix_${new Date().toISOString().slice(0, 10)}.${exportFormat}`;
            } else {
                blob = await generateProjectZipBlob();
                filename = `VocalHarmony_Project_${new Date().toISOString().slice(0, 10)}.zip`;
            }

            // At this point blob MUST exist or function threw error
            const file = new File([blob], filename, { type: type === 'mix' ? 'audio/mpeg' : 'application/zip' });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: saveTitle || "VocalHarmony Project",
                        text: `Check out my music created with VocalHarmony Pro!`
                    });
                } catch (shareError) {
                    if (shareError.name !== 'AbortError') {
                        // Fallback silently if share fails but wasn't aborted
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    }
                }
            } else {
                // Fallback to Download
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }

        } catch (err) {
            console.error("Share Failed", err);
            alert(err.message || err);
        }
        setIsSharing(false);
        setShowShareModal(false);
    };

    const handleExport = async () => {
        if (maxDuration <= 0) {
            alert("Nothing to export! Record or import audio first.");
            return;
        }
        setIsExporting(true);
        try {
            const blob = await generateMixdownBlob(exportFormat);
            if (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                a.download = `HarmonyPro_Mix_${timestamp}.${exportFormat}`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error("Export failed", err);
            alert("Error exporting audio. See console.");
        } finally {
            setIsExporting(false);
        }
    };

    const startRecording = async () => {
        const armedTrack = tracks.find(t => t.isArmed);
        if (!armedTrack) {
            alert("Select a track to record on first!");
            return;
        }
        stopAudio();
        const ctx = await initAudioContext();
        if (!ctx) return;
        const micSetup = await setupMicrophone(ctx);
        if (!micSetup) return;
        const { source } = micSetup;
        recordingBuffersRef.current = [];
        isRecordingRef.current = true;
        setIsRecording(true);
        setSelectedTrackId(armedTrack.id);
        const bufferSize = REC_BUFFER_SIZE;
        const recorder = ctx.createScriptProcessor(bufferSize, 1, 1);
        recorder.onaudioprocess = (e) => {
            if (!isRecordingRef.current) return;
            const input = e.inputBuffer.getChannelData(0);
            recordingBuffersRef.current.push(new Float32Array(input));
        };
        const zeroGain = ctx.createGain();
        zeroGain.gain.value = 0;
        source.connect(recorder);
        recorder.connect(zeroGain);
        zeroGain.connect(ctx.destination);
        recorderNodeRef.current = recorder;
        if (currentTime >= maxDuration && maxDuration > 0) {
            pauseOffsetRef.current = 0;
        }
        playAudio(pauseOffsetRef.current);
    };

    const stopRecording = () => {
        isRecordingRef.current = false;
        setIsRecording(false);

        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(track => track.stop());
            micStreamRef.current = null;
        }
        setMicAnalyser(null);

        if (recorderNodeRef.current) {
            recorderNodeRef.current.disconnect();
            recorderNodeRef.current = null;
        }

        stopAudio();

        const ctx = audioContext;
        const buffers = recordingBuffersRef.current;
        const armedTrack = tracks.find(t => t.isArmed);

        if (!ctx || buffers.length === 0 || !armedTrack) return;

        const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
        const outputBuffer = ctx.createBuffer(1, totalLength, ctx.sampleRate);
        const channelData = outputBuffer.getChannelData(0);

        let offset = 0;
        for (const buf of buffers) {
            channelData.set(buf, offset);
            offset += buf.length;
        }

        // @ts-ignore
        const outputLatency = ctx.outputLatency || 0.0;
        const bufferDuration = REC_BUFFER_SIZE / ctx.sampleRate;
        const estimatedInputLatency = 0.02;
        const totalCompensationSeconds = bufferDuration + outputLatency + estimatedInputLatency;
        const latencySamples = Math.floor(totalCompensationSeconds * ctx.sampleRate);
        let finalBuffer = outputBuffer;
        if (totalLength > latencySamples) {
            const compensatedBuffer = ctx.createBuffer(1, totalLength - latencySamples, ctx.sampleRate);
            const originalData = outputBuffer.getChannelData(0);
            const compensatedData = compensatedBuffer.getChannelData(0);
            for (let i = 0; i < compensatedBuffer.length; i++) {
                compensatedData[i] = originalData[i + latencySamples];
            }
            finalBuffer = compensatedBuffer;
        }

        const newTracks = tracks.map(t => {
            if (t.id === armedTrack.id) {
                return { ...t, hasFile: true, duration: finalBuffer.duration };
            }
            return t;
        });

        audioBuffersRef.current[armedTrack.id] = finalBuffer;
        // Invalidate processed buffer if new recording
        delete processedBuffersRef.current[armedTrack.id];

        if (finalBuffer.duration > maxDuration) {
            setMaxDuration(finalBuffer.duration);
        }
        setTracks(newTracks);
        recordingBuffersRef.current = [];

        if (appMode === 'ULTRA') {
            const blocks = analyzeAudioBlocks(finalBuffer);
            setNoteBlocks(blocks);
        }
    };

    const handleToggleRecord = (e: React.MouseEvent) => {
        e.stopPropagation();
        vibrate(20);
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    };

    const handleTogglePlay = () => {
        vibrate(20);
        if (isPlaying) {
            if (isRecording) {
                stopRecording();
            } else {
                stopAudio();
                if (audioContext) pauseOffsetRef.current = currentTime;
            }
        } else {
            if (pauseOffsetRef.current >= maxDuration) pauseOffsetRef.current = 0;
            playAudio(pauseOffsetRef.current);
        }
    };

    const handleTrackModeClick = (trackId: number, e: React.MouseEvent) => {
        e.stopPropagation();
        vibrate(15);

        const track = tracks.find(t => t.id === trackId);
        if (!track) return;

        let nextArmed = false;
        let nextTuning = false;

        // Cycle Logic: Normal -> Armed -> (Tuning) -> Normal
        if (track.isArmed) {
            // If already armed, check if we can go to Tuning
            if (appMode === 'ULTRA' && track.hasFile) {
                nextTuning = true;
            } else {
                // Go back to normal
                nextTuning = false;
            }
            nextArmed = false;
        } else if (track.isTuning) {
            // If Tuning, go back to Normal
            nextArmed = false;
            nextTuning = false;
        } else {
            // If Normal, go to Armed
            nextArmed = true;
            nextTuning = false;
        }

        setTracks(tracks.map(t => ({
            ...t,
            isArmed: t.id === trackId ? nextArmed : false,
            isTuning: t.id === trackId ? nextTuning : false
        })));
    };

    const handleSeek = (time: number) => {
        if (isRecording) return;
        const targetTime = Math.max(0, Math.min(time, maxDuration));
        pauseOffsetRef.current = targetTime;
        setCurrentTime(targetTime);
        if (isPlaying) playAudio(targetTime);
    };

    const handleSetLoop = (start: number | null, end: number | null) => {
        vibrate(10);
        setLoopStart(start);
        setLoopEnd(end);
        loopStartRef.current = start;
        loopEndRef.current = end;
        if (isPlaying && !isRecording) playAudio(currentTime);
    };

    const toggleLoopPoint = (type: 'A' | 'B') => {
        vibrate(10);
        const currentStart = loopStartRef.current;
        const currentEnd = loopEndRef.current;

        if (type === 'A') {
            if (currentStart !== null) {
                handleSetLoop(null, currentEnd === null ? null : currentEnd);
            } else {
                let newEnd = currentEnd;
                if (newEnd !== null && currentTime >= newEnd) newEnd = null;
                handleSetLoop(currentTime, newEnd);
            }
        } else {
            if (currentEnd !== null) {
                handleSetLoop(currentStart, null);
            } else {
                let newStart = currentStart;
                if (newStart === null || currentTime <= newStart) newStart = 0;
                handleSetLoop(newStart, currentTime);
            }
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        vibrate(15);
        setIsLoading(true);

        const ctx = await initAudioContext();
        if (!ctx) return;

        const newTracks = tracks.map(t => ({ ...t }));
        let maxDur = maxDuration;
        const colors = ["#f97316", "#84cc16", "#eab308", "#10b981", "#06b6d4", "#ec4899"];

        const processBuffer = (buffer: AudioBuffer, fileName: string) => {
            // Sanitize name: remove path, remove extension, limit to 20 chars
            const cleanName = (fileName.split('/').pop() || fileName).replace(/\.[^/.]+$/, "").substring(0, 20);

            let track = newTracks.find(t => !t.hasFile && t.id !== 99);
            if (!track) {
                const id = Math.max(...newTracks.map(t => t.id), 0) + 1;
                track = {
                    id,
                    name: cleanName,
                    color: colors[id % colors.length],
                    vol: 0.7, pan: 0.5, mute: false, solo: false, hasFile: true, isArmed: false, isTuning: false, duration: buffer.duration, pitchShift: 0
                };
                newTracks.push(track);
            } else {
                track.name = cleanName;
                track.hasFile = true;
                track.duration = buffer.duration;
                track.pitchShift = 0; // Reset pitch on new file
                track.isTuning = false;
                // Clear old processed buffer
                delete processedBuffersRef.current[track.id];
            }
            audioBuffersRef.current[track.id] = buffer;
            if (buffer.duration > maxDur) maxDur = buffer.duration;
        };

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.name.endsWith('.zip')) {
                try {
                    const JSZip = await loadJSZip();
                    const zip = new JSZip();
                    const content = await zip.loadAsync(file);
                    for (const filename of Object.keys(content.files)) {
                        if (filename.match(/\.(mp3|wav|ogg|m4a)$/i)) {
                            const u8 = await content.files[filename].async('uint8array');
                            const buffer = await ctx.decodeAudioData(u8.buffer);
                            processBuffer(buffer, filename);
                        }
                    }
                } catch (err) { console.error(err); }
            } else {
                try {
                    if (file.name.match(/\.(mp3|wav|ogg|m4a)$/i)) {
                        const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
                        processBuffer(buffer, file.name);
                    }
                } catch (err) { console.error(err); }
            }
        }

        // Helper to find the newly imported tracks and mark them as having files
        const updatedTracksWithFiles = newTracks.map(t => {
            // If the track was just created/imported and has a buffer in ref, mark hasFile=true
            // We can approximate this by checking if it's a new track ID (not in initial) or by name
            if (audioBuffersRef.current[t.id]) {
                return { ...t, hasFile: true };
            }
            return t;
        });

        setTracks(updatedTracksWithFiles);
        setMaxDuration(maxDur);
        setIsLoading(false);
    };



    const handleExportMultitrack = async () => {
        const tracksToExport = tracks.filter(t => t.hasFile && (audioBuffersRef.current[t.id] || processedBuffersRef.current[t.id]));
        if (tracksToExport.length === 0) {
            alert("No audio tracks to export.");
            return;
        }

        vibrate(20);
        setIsLoading(true);
        try {
            const blob = await generateProjectZipBlob();
            if (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Project_Multitrack_${new Date().toISOString().slice(0, 10)}.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }
        } catch (err) {
            console.error("Export Failed", err);
            alert("Export Failed: " + err);
        }
        setIsLoading(false);
    };



    const handleSaveProject = async () => {
        if (!saveTitle.trim()) {
            alert("Please enter a title for your project.");
            return;
        }

        setIsSaving(true);
        vibrate(20);

        try {
            const JSZip = await loadJSZip();
            const zip = new JSZip();

            // 1. SAVE AUDIO TRACKS
            const activeTracks = tracks.filter(t => audioBuffersRef.current[t.id] || processedBuffersRef.current[t.id]);

            for (const track of activeTracks) {
                const buffer = processedBuffersRef.current[track.id] || audioBuffersRef.current[track.id];
                if (buffer) {
                    const mp3Blob = await audioBufferToMp3(buffer);
                    zip.file(`${track.id}_${track.name}.mp3`, mp3Blob);
                }
            }

            // 2. SAVE PROJECT METADATA (project.json)
            const projectData = {
                version: "1.0",
                title: saveTitle,
                artist: saveArtist || "Unknown Artist",
                genre: saveGenre,
                created: new Date().toISOString(),
                trackState: tracks.map(t => ({
                    id: t.id,
                    name: t.name,
                    color: t.color,
                    vol: t.vol,
                    pan: t.pan,
                    mute: t.mute,
                    solo: t.solo,
                    isArmed: t.isArmed, // Store armed state preference
                    pitchShift: t.pitchShift,
                })),
                global: {
                    keySignature,
                    maxDuration,
                    loopStart: loopStartRef.current,
                    loopEnd: loopEndRef.current
                }
            };

            zip.file("project.json", JSON.stringify(projectData, null, 2));

            // 3. GENERATE COVER IMAGE
            let coverUrl = "";

            if (saveImage) {
                // USE UPLOADED IMAGE
                const arrayBuffer = await saveImage.arrayBuffer();
                const blob = new Blob([arrayBuffer], { type: saveImage.type });

                // Add to ZIP
                zip.file(`cover.${saveImage.name.split('.').pop()}`, blob);

                // Create Data URL for DB
                coverUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(blob);
                });
            } else {
                // GENERATE CANVAS IMAGE
                const canvas = document.createElement('canvas');
                canvas.width = 300;
                canvas.height = 300;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    const gradient = ctx.createLinearGradient(0, 0, 300, 300);
                    gradient.addColorStop(0, "#1e293b");
                    gradient.addColorStop(1, "#0f172a");
                    ctx.fillStyle = gradient;
                    ctx.fillRect(0, 0, 300, 300);

                    ctx.fillStyle = "#ffffff";
                    ctx.font = "bold 24px sans-serif";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(saveTitle.substring(0, 20), 150, 130);

                    ctx.fillStyle = "#94a3b8";
                    ctx.font = "16px sans-serif";
                    ctx.fillText(saveArtist.substring(0, 20) || "Me", 150, 160);

                    ctx.fillStyle = "#64748b";
                    ctx.font = "12px sans-serif";
                    ctx.fillText("VocalHarmony Pro", 150, 260);

                    ctx.beginPath();
                    ctx.arc(150, 80, 20, 0, 2 * Math.PI);
                    ctx.fillStyle = "#f97316";
                    ctx.fill();
                }
                coverUrl = canvas.toDataURL('image/jpeg', 0.7);
            }

            const zipContent = await zip.generateAsync({ type: "blob" });

            // 5. SAVE TO DEXIE DB
            await db.myLibrary.add({
                title: saveTitle,
                artist: saveArtist || "Me",
                genre: saveGenre || "User Project",
                cover_url: coverUrl,
                fileBlob: zipContent,
                createdAt: new Date()
            });

            alert("Project Saved Successfully!");
            setShowSaveModal(false);

        } catch (err) {
            console.error("Save Failed", err);
            alert("Failed to save project: " + err);
        }
        setIsSaving(false);
    };

    const handleResetClick = () => {
        vibrate(20);
        setShowResetConfirm(true);
    };

    const performReset = () => {
        vibrate(20);
        stopAudio();
        stopRecording();
        audioBuffersRef.current = {};
        processedBuffersRef.current = {};
        activeSourcesRef.current = {};

        setTracks(getInitialTracks());
        setMaxDuration(0);
        setCurrentTime(0);
        pauseOffsetRef.current = 0;
        setLoopStart(null);
        setLoopEnd(null);
        setNoteBlocks([]);
        setImportedLyrics([]);
        setImportedChords([]);
        setKeySignature(null);
        setSelectedTrackId(99);
        setShowResetConfirm(false);
    };

    const openPitchModal = (trackId: number, currentPitch: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setPitchEditTrackId(trackId);
        setTempPitch(currentPitch);
    };

    const confirmPitchChange = async () => {
        if (pitchEditTrackId !== null) {
            setIsProcessingPitch(true);

            const originalBuffer = audioBuffersRef.current[pitchEditTrackId];
            if (originalBuffer) {
                if (tempPitch !== 0) {
                    const processed = await processPitchShift(originalBuffer, tempPitch);
                    processedBuffersRef.current[pitchEditTrackId] = processed;
                } else {
                    // If 0, remove cached processed buffer to revert to original
                    delete processedBuffersRef.current[pitchEditTrackId];
                }
            }

            setTracks(prev => prev.map(t => t.id === pitchEditTrackId ? { ...t, pitchShift: tempPitch } : t));

            setIsProcessingPitch(false);
            // Stop/Start audio to apply changes if playing
            if (isPlaying) {
                stopAudio();
                playAudio(currentTime);
            }
            setPitchEditTrackId(null);
        }
    };

    useEffect(() => {
        if (!audioContext) return;
        const anySolo = tracks.some(t => t.solo);
        tracks.forEach(track => {
            const volNode = trackGainNodesRef.current[track.id];
            if (volNode) {
                const shouldPlay = !track.mute && (!anySolo || track.solo);
                volNode.gain.setTargetAtTime(shouldPlay ? track.vol : 0, audioContext.currentTime, 0.05);
            }
            const panNode = trackPanNodesRef.current[track.id];
            if (panNode) {
                panNode.pan.setTargetAtTime((track.pan * 2) - 1, audioContext.currentTime, 0.05);
            }
        });
    }, [tracks, audioContext]);

    const handleModeToggle = () => {
        vibrate(10);
        let nextMode: AppMode = 'SIMPLE';
        if (appMode === 'SIMPLE') nextMode = 'PRO';
        else if (appMode === 'PRO') nextMode = 'ULTRA';

        setPendingMode(nextMode);
    };

    const confirmModeSwitch = () => {
        if (pendingMode) {
            vibrate(20);
            setAppMode(pendingMode);
            setPendingMode(null);
        }
    };

    useEffect(() => {
        if (appMode === 'ULTRA' && noteBlocks.length === 0) {
            const buf = audioBuffersRef.current[selectedTrackId];
            if (buf) {
                const blocks = analyzeAudioBlocks(buf);
                setNoteBlocks(blocks);
            }
        }
    }, [appMode, selectedTrackId, noteBlocks.length]);

    const activeAnalyser = isRecording
        ? micAnalyser
        : (tracks.find(t => t.id === selectedTrackId)?.hasFile && isPlaying ? trackAnalysersRef.current[selectedTrackId] : null);



    const handleLoadFromLibrary = async (song: any) => {
        if (!song.fileBlob) {
            alert("Error: Archivo de audio no encontrado en la biblioteca.");
            return;
        }

        vibrate(20);
        setIsLoading(true);
        setMainView('studio');

        // --- RESET SESSION FOR NEW SONG ---
        stopAudio();
        stopRecording();
        audioBuffersRef.current = {};
        processedBuffersRef.current = {};
        activeSourcesRef.current = {};
        setCurrentTime(0);
        pauseOffsetRef.current = 0;
        setLoopStart(null);
        setLoopEnd(null);
        setNoteBlocks([]);
        setImportedLyrics([]);
        setImportedChords([]);
        setKeySignature(null);
        // ----------------------------------

        const ctx = await initAudioContext();
        if (!ctx) return;

        let newTracks = getInitialTracks();
        let maxDur = 0;
        const colors = ["#f97316", "#84cc16", "#eab308", "#10b981", "#06b6d4", "#ec4899"];

        try {
            const JSZip = await loadJSZip();
            const zip = new JSZip();
            const content = await zip.loadAsync(song.fileBlob);

            // CHECK FOR PROJECT.JSON FIRST
            let projectData: any = null;
            if (content.files["project.json"]) {
                const text = await content.files["project.json"].async('string');
                projectData = JSON.parse(text);
                console.log("Project Data Loaded:", projectData);

                // Restore Global Settings
                if (projectData.global) {
                    if (projectData.global.keySignature) setKeySignature(projectData.global.keySignature);
                    if (projectData.global.loopStart) setLoopStart(projectData.global.loopStart);
                    if (projectData.global.loopEnd) setLoopEnd(projectData.global.loopEnd);
                }

                // Prepare tracks from metadata
                if (projectData.trackState && Array.isArray(projectData.trackState)) {
                    // Start with empty tracks based on saved state, but map over them
                    // We will reconstruct the track objects, ensuring they have all required fields
                    newTracks = projectData.trackState.map((savedTrack: any) => ({
                        ...savedTrack,
                        hasFile: false, // Will set to true if file found
                        duration: 0,
                        isTuning: false,
                        isArmed: savedTrack.isArmed || false // Maintain armed preference if possible
                    }));
                }
            }

            for (const filename of Object.keys(content.files)) {
                if (filename.match(/\.(mp3|wav|ogg|m4a)$/i)) {
                    const u8 = await content.files[filename].async('uint8array');
                    const buffer = await ctx.decodeAudioData(u8.buffer);

                    if (projectData) {
                        // Match file to track by ID prefix "ID_Name.mp3"
                        const match = filename.match(/^(\d+)_/);
                        if (match) {
                            const trackId = parseInt(match[1]);
                            const track = newTracks.find(t => t.id === trackId);
                            if (track) {
                                track.hasFile = true;
                                track.duration = buffer.duration;
                                audioBuffersRef.current[trackId] = buffer;
                                if (buffer.duration > maxDur) maxDur = buffer.duration;
                            }
                        } else {
                            // Fallback if naming convention fails but project.json exists
                            // Try to find by name match
                            const cleanName = filename.replace(/\.[^/.]+$/, "");
                            const track = newTracks.find(t => t.name === cleanName);
                            if (track) {
                                track.hasFile = true;
                                track.duration = buffer.duration;
                                audioBuffersRef.current[track.id] = buffer;
                                if (buffer.duration > maxDur) maxDur = buffer.duration;
                            }
                        }
                    } else {
                        // LEGACY IMPORT (No project.json)
                        // Sanitize name
                        const cleanName = (filename.split('/').pop() || filename).replace(/\.[^/.]+$/, "").substring(0, 20);

                        let track = newTracks.find(t => !t.hasFile && t.id !== 99);
                        if (!track) {
                            const id = Math.max(...newTracks.map(t => t.id), 0) + 1;
                            track = {
                                id,
                                name: cleanName,
                                color: colors[id % colors.length],
                                vol: 0.7, pan: 0.5, mute: false, solo: false, hasFile: true, isArmed: false, isTuning: false, duration: buffer.duration, pitchShift: 0
                            };
                            newTracks.push(track);
                        } else {
                            track.name = cleanName;
                            track.hasFile = true;
                            track.duration = buffer.duration;
                            track.pitchShift = 0;
                            track.isTuning = false;
                            delete processedBuffersRef.current[track.id];
                        }
                        audioBuffersRef.current[track.id] = buffer;
                        if (buffer.duration > maxDur) maxDur = buffer.duration;
                    }
                }

                // Keep LRC/Chord logic
                if (filename.match(/\.lrc$/i)) {
                    const lrcText = await content.files[filename].async('string');
                    const parsedLyrics = parseLRC(lrcText);
                    if (filename.match(/chord|acorde|harmony/i)) {
                        if (parsedLyrics.length > 0) setImportedChords(parsedLyrics);
                    } else {
                        if (parsedLyrics.length > 0) setImportedLyrics(parsedLyrics);
                    }
                }
                if (filename.match(/(tonalidad|tonality|key)\.txt$/i)) {
                    const text = await content.files[filename].async('string');
                    if (text) {
                        setKeySignature(text.trim().substring(0, 3));
                    }
                }
            }
        } catch (err: any) {
            console.error("Error loading song from library:", err);
            alert("Error al cargar la canción: " + err.message);
        }

        setTracks(newTracks);
        setMaxDuration(maxDur);
        setIsLoading(false);
    };

    return (
        <div className={`flex flex-col h-safe-screen text-white font-sans overflow-hidden transition-colors duration-500
        ${appMode === 'ULTRA' ? 'bg-black' : (appMode === 'SIMPLE' ? 'bg-slate-900' : 'bg-slate-950')}
    `}>

            {/* 1. HEADER */}
            <header className={`relative shrink-0 flex items-center justify-between px-4 pt-safe pb-2 border-b z-30 transition-all duration-300 
            ${!showControls ? '-mt-20 opacity-0' : 'opacity-100'}
            ${appMode === 'ULTRA' ? 'bg-black border-orange-900/50' : (appMode === 'SIMPLE' ? 'bg-slate-900 border-lime-500/30' : 'bg-slate-950 border-orange-900/30')}
      `}>
                {/* LOGO AREA - LEFT */}
                <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-black shadow-lg shadow-orange-900/50 
                ${appMode === 'ULTRA' ? 'bg-orange-500' : 'bg-orange-600'}
            `}>
                        <Mic size={20} strokeWidth={3} />
                    </div>

                    {/* ICON NAVIGATION (STUDIO | STORE | LIBRARY) */}
                    <div className="flex items-center p-1 bg-slate-800/80 rounded-lg border border-slate-700">
                        <button
                            onClick={() => { vibrate(10); setMainView('studio'); }}
                            className={`p-2 rounded-md transition-all active:scale-95 relative
                   ${mainView === 'studio' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}
               `}
                        >
                            <LayoutGrid size={18} />
                            {mainView === 'studio' && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-orange-500"></div>}
                        </button>
                        <button
                            onClick={() => { vibrate(10); setMainView('store'); }}
                            className={`p-2 rounded-md transition-all active:scale-95 relative
                   ${mainView === 'store' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}
               `}
                        >
                            <Cloud size={18} />
                            {mainView === 'store' && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500"></div>}
                        </button>
                        <button
                            onClick={() => { vibrate(10); setMainView('library'); }}
                            className={`p-2 rounded-md transition-all active:scale-95 relative
                   ${mainView === 'library' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}
               `}
                        >
                            <Folder size={18} />
                            {mainView === 'library' && <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-green-500"></div>}
                        </button>
                    </div>
                </div>

                {/* CENTER AREA - KEY (Absolute) */}
                <div className="absolute left-1/2 -translate-x-1/2 top-[60%] -translate-y-1/2 pointer-events-none">
                    {keySignature && (
                        <div className="animate-pulse flex items-center justify-center">
                            <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-lime-300 to-lime-500 drop-shadow-[0_0_10px_rgba(132,204,22,0.8)] select-none">
                                {keySignature}
                            </h1>
                        </div>
                    )}
                </div>


                {/* RIGHT ACTIONS */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleResetClick}
                        className="p-2 rounded-full hover:bg-slate-800 transition-colors active:scale-95 text-slate-400"
                        title="Reset Session"
                    >
                        <RotateCcw size={20} />
                    </button>

                    <button
                        onClick={() => { vibrate(10); setShowSettings(true); }}
                        className="p-2 rounded-full hover:bg-slate-800 transition-colors active:scale-95 text-slate-400"
                    >
                        <Settings size={20} />
                    </button>



                    <button
                        onClick={() => { vibrate(10); setSaveTitle(`Project ${new Date().toLocaleDateString()}`); setSaveArtist("Me"); setShowSaveModal(true); }}
                        className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-full text-xs font-bold flex items-center gap-2 border border-slate-700 transition-all active:scale-95"
                    >
                        <Archive size={14} className="text-orange-500" /> Save
                    </button>

                    <button
                        onClick={() => { vibrate(10); setShowShareModal(true); }}
                        className="p-2 rounded-full hover:bg-slate-800 transition-colors active:scale-95 text-slate-400"
                        title="Share Project"
                    >
                        <Share2 size={20} />
                    </button>

                    <button
                        onClick={() => { vibrate(10); document.querySelector('input[type="file"]')?.dispatchEvent(new MouseEvent('click')); }}
                        className="p-2 rounded-full hover:bg-slate-800 transition-colors active:scale-95 text-slate-400"
                        title="Import Audio/Zip"
                    >
                        <Upload size={20} />
                    </button>
                </div>
            </header>

            {mainView === 'studio' && (<>
                {/* 2. VISUALIZER */}
                <div className={`flex-1 min-h-0 relative transition-all duration-300 ${!showControls ? 'pt-safe' : ''}
         ${appMode === 'SIMPLE' ? 'bg-slate-800/50' : 'bg-slate-900/50'}
      `}>
                    <div className={`absolute top-2 left-0 right-0 z-10 flex justify-center pointer-events-none transition-opacity ${!showControls ? 'opacity-0' : 'opacity-100'}`}>
                        <div className={`px-3 py-1 rounded-full border flex items-center gap-2 shadow-lg backdrop-blur
                ${appMode === 'ULTRA'
                                ? 'bg-orange-950/80 border-orange-500/50'
                                : (appMode === 'SIMPLE' ? 'bg-slate-800/90 border-lime-400/30' : 'bg-slate-950/80 border-orange-900/50')}
            `}>
                            <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : (appMode === 'ULTRA' ? 'bg-orange-500' : 'bg-lime-400')}`}></div>
                            <span className={`text-[10px] font-bold tracking-wider uppercase ${appMode === 'ULTRA' ? 'text-orange-100' : 'text-orange-100'}`}>
                                {isRecording ? "Recording Input" : (appMode === 'ULTRA' ? `EDIT: ${activeTrackName}` : activeTrackName)}
                            </span>
                        </div>
                    </div>

                    {isRecording && (
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none flex flex-col items-center animate-pulse">
                            <div className="w-20 h-20 rounded-full bg-red-600/20 flex items-center justify-center">
                                <div className="w-16 h-16 rounded-full bg-red-600/40 flex items-center justify-center">
                                    <Disc size={32} className="text-red-500" fill="currentColor" />
                                </div>
                            </div>
                            <span className="mt-2 text-red-500 font-bold tracking-widest text-xs bg-black/50 px-2 py-1 rounded">RECORDING</span>
                        </div>
                    )}

                    {audioContext && (
                        <div className={`absolute top-2 right-2 z-30 flex gap-2 transition-transform duration-300 ${!showControls ? 'translate-y-safe' : ''}`}>
                            {appMode !== 'SIMPLE' && (
                                <button
                                    onClick={() => setViewMode(prev => prev === 'piano' ? 'staff' : 'piano')}
                                    className="flex items-center gap-2 bg-slate-900/80 border border-slate-700 p-1 rounded-full text-slate-400 shadow-lg h-9"
                                >
                                    <div className={`p-1 rounded-full transition-all ${viewMode === 'staff' ? 'bg-orange-500 text-black' : 'hover:text-white'}`}>
                                        <Music size={14} />
                                    </div>
                                    <div className={`p-1 rounded-full transition-all ${viewMode === 'piano' ? 'bg-lime-400 text-black' : 'hover:text-white'}`}>
                                        <Activity size={14} />
                                    </div>
                                </button>
                            )}
                            {appMode === 'SIMPLE' && (
                                <button
                                    onClick={() => setViewMode(prev => prev === 'piano' ? 'staff' : 'piano')}
                                    className="p-2 rounded-full bg-slate-800/80 border border-slate-600 text-slate-300 shadow-lg"
                                >
                                    {viewMode === 'staff' ? <Music size={18} /> : <Activity size={18} />}
                                </button>
                            )}
                        </div>
                    )}

                    {audioContext && (
                        <button
                            onClick={() => { vibrate(10); setShowControls(!showControls); }}
                            className={`absolute bottom-4 right-4 z-40 p-3 rounded-full shadow-xl border transition-all ${showControls ? 'bg-slate-900/80 border-slate-700 text-slate-400' : 'bg-orange-600 border-orange-400 text-black animate-pulse-fast'}`}
                        >
                            {showControls ? <ChevronDown size={24} /> : <ChevronUp size={24} />}
                        </button>
                    )}

                    {audioContext ? (
                        <>
                            <PitchVisualizer
                                ctx={audioContext}
                                analyser={activeAnalyser || null}
                                isActive={true}
                                color={isRecording ? '#f43f5e' : (appMode === 'ULTRA' ? '#f97316' : activeTrackColor)}
                                viewMode={viewMode}
                                isFullscreen={!showControls}
                                isUltraMode={appMode === 'ULTRA'}
                                appMode={appMode}
                                noteBlocks={noteBlocks}
                                currentTime={currentTime}
                                pitchShift={selectedTrack ? selectedTrack.pitchShift : 0}
                                onBlockChange={(id, shift) => {
                                    setNoteBlocks(prev => prev.map(b => b.id === id ? { ...b, shiftCents: shift } : b));
                                }}
                            />
                            <LyricsOverlay
                                isVisible={!showControls}
                                currentTime={currentTime}
                                isPlaying={isPlaying}
                                importedLyrics={importedLyrics}
                                importedChords={importedChords}
                            />
                        </>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 gap-4">
                            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 animate-pulse-fast">
                                <Mic size={30} className="text-orange-500" />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-lg font-bold text-white">Start Session</h3>
                                <p className="text-xs text-slate-500">Tap to initialize audio engine</p>
                            </div>
                            <button
                                onClick={() => { vibrate(30); initAudioContext(); }}
                                className="bg-orange-600 active:bg-orange-500 text-black px-10 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(249,115,22,0.4)] transition-all active:scale-95 mt-4"
                            >
                                ACTIVATE
                            </button>
                        </div>
                    )}
                </div>

                {/* COLLAPSIBLE CONTROLS */}
                <div className={`shrink-0 border-t border-orange-900/30 flex flex-col transition-all duration-300 ease-in-out overflow-hidden 
          ${showControls ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'}
          ${appMode === 'ULTRA' ? 'bg-black' : (appMode === 'SIMPLE' ? 'bg-slate-900' : 'bg-slate-950')}
      `}>

                    <div className="shrink-0 flex flex-col pb-1 relative z-20 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
                        <div className="h-10 flex items-center w-full px-3 gap-2">
                            <Timeline
                                currentTime={currentTime}
                                duration={maxDuration}
                                loopStart={loopStart}
                                loopEnd={loopEnd}
                                onSeek={(t) => { vibrate(5); handleSeek(t); }}
                            />
                        </div>

                        <div className="flex items-center justify-between px-4 pb-2 h-20 w-full">
                            {/* LEFT GROUP: LOOP A/B */}
                            <div className="flex-1 flex justify-start">
                                <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-2xl border border-slate-800">
                                    <button
                                        onClick={() => toggleLoopPoint('A')}
                                        className={`w-11 h-11 rounded-xl font-black text-xl flex items-center justify-center transition-all active:scale-95
                                    ${loopStart !== null ? 'bg-orange-500 text-black shadow-[0_0_10px_rgba(249,115,22,0.4)]' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        A
                                    </button>
                                    <button
                                        onClick={() => toggleLoopPoint('B')}
                                        className={`w-11 h-11 rounded-xl font-black text-xl flex items-center justify-center transition-all active:scale-95
                                    ${loopEnd !== null ? 'bg-orange-500 text-black shadow-[0_0_10px_rgba(249,115,22,0.4)]' : 'text-slate-500 hover:text-slate-300'}`}
                                    >
                                        B
                                    </button>
                                </div>
                            </div>

                            {/* CENTER GROUP: TRANSPORT */}
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    onClick={() => { vibrate(10); handleSeek(Math.max(0, currentTime - 5)); }}
                                    className="p-3 rounded-full text-slate-500 active:text-lime-400 active:bg-slate-900 transition-all"
                                >
                                    <SkipBack size={24} fill="currentColor" />
                                </button>

                                <button
                                    onClick={handleTogglePlay}
                                    className={`
                                w-16 h-16 rounded-3xl flex items-center justify-center transition-all shadow-xl active:scale-95
                                ${isPlaying
                                            ? 'bg-slate-900 border-2 border-orange-500 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.2)]'
                                            : 'bg-gradient-to-br from-orange-500 to-orange-600 text-black shadow-[0_0_25px_rgba(249,115,22,0.5)] border border-orange-400'
                                        }
                            `}
                                >
                                    {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" className="ml-1" />}
                                </button>

                                <button
                                    onClick={() => { vibrate(10); handleSeek(Math.min(maxDuration, currentTime + 5)); }}
                                    className="p-3 rounded-full text-slate-500 active:text-lime-400 active:bg-slate-900 transition-all"
                                >
                                    <SkipForward size={24} fill="currentColor" />
                                </button>
                            </div>

                            {/* RIGHT GROUP: MODE */}
                            <div className="flex-1 flex justify-end">
                                <button
                                    onClick={handleModeToggle}
                                    className={`w-12 h-12 rounded-2xl border flex flex-col items-center justify-center transition-all shadow-xl active:scale-95 gap-0.5
                                ${appMode === 'SIMPLE'
                                            ? 'bg-lime-400 text-black border-lime-500 shadow-[0_0_15px_rgba(132,204,22,0.4)]'
                                            : (appMode === 'ULTRA'
                                                ? 'bg-black text-orange-500 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.4)]'
                                                : 'bg-slate-900 text-slate-500 border-slate-800'
                                            )
                                        }`}
                                >
                                    {appMode === 'SIMPLE' && <Zap size={20} fill="currentColor" />}
                                    {appMode === 'PRO' && <Sliders size={20} />}
                                    {appMode === 'ULTRA' && <Wand2 size={20} />}
                                    <span className="text-[7px] font-bold uppercase">
                                        {appMode === 'SIMPLE' ? 'LITE' : appMode}
                                    </span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className={`h-[220px] shrink-0 backdrop-blur-xl border-t border-orange-900/30 pb-safe pb-6 relative
              ${appMode === 'ULTRA' ? 'bg-black/90' : (appMode === 'SIMPLE' ? 'bg-slate-900/90' : 'bg-slate-900/90')}
          `}>
                        <div className="h-full overflow-x-auto no-scrollbar snap-x-mandatory flex items-center px-4 gap-3 touch-pan-x">
                            {tracks
                                .map(track => (
                                    <div
                                        key={track.id}
                                        onClick={() => { vibrate(5); setSelectedTrackId(track.id); }}
                                        className={`
                            snap-center shrink-0 w-[110px] h-[96%] rounded-2xl p-2 flex flex-col justify-between transition-all border relative overflow-hidden group
                            ${selectedTrackId === track.id
                                                ? (appMode === 'ULTRA'
                                                    ? 'bg-zinc-900/80 border-orange-500/50 shadow-[0_0_15px_rgba(249,115,22,0.15)] ring-1 ring-orange-500/20'
                                                    : (appMode === 'SIMPLE' ? 'bg-slate-700 border-lime-400 shadow-[0_0_10px_rgba(132,204,22,0.2)]' : 'bg-slate-800/80 border-lime-400/50 shadow-[0_0_15px_rgba(132,204,22,0.15)] ring-1 ring-lime-400/20')
                                                )
                                                : (appMode === 'SIMPLE' ? 'bg-slate-800 border-slate-600' : 'bg-slate-950/40 border-slate-800')
                                            }
                        `}
                                    >
                                        <div className="flex flex-col gap-1 mb-1 w-full">
                                            <div className="flex items-center gap-1.5 px-1">
                                                <div className={`shrink-0 w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] ${track.hasFile ? 'bg-lime-500 text-lime-500' : (appMode === 'SIMPLE' ? 'bg-slate-600 text-slate-600' : 'bg-slate-700 text-slate-700')}`}></div>
                                                <div className="text-[10px] font-bold text-slate-300 truncate tracking-tight flex-1">{track.name}</div>
                                            </div>

                                            {!isRecording && (
                                                <div className="flex items-center justify-end gap-1 px-1">
                                                    {/* MODE/MIC BUTTON */}
                                                    <button
                                                        onClick={(e) => handleTrackModeClick(track.id, e)}
                                                        className={`h-6 flex-1 rounded-md flex items-center justify-center border transition-all active:scale-95
                                                            ${track.isArmed
                                                                ? 'bg-red-500/20 border-red-500 text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
                                                                : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200 hover:border-slate-500'
                                                            }
                                                        `}
                                                        title="Arm for Recording"
                                                    >
                                                        <Mic2 size={12} fill={track.isArmed ? "currentColor" : "none"} />
                                                    </button>

                                                    {/* TUNING BUTTON - ULTRA MODE ONLY */}
                                                    {appMode === 'ULTRA' && (
                                                        <button
                                                            onClick={(e) => {
                                                                if (track.hasFile) openPitchModal(track.id, track.pitchShift || 0, e);
                                                            }}
                                                            disabled={!track.hasFile}
                                                            className={`h-6 flex-1 rounded-md flex items-center justify-center border transition-all active:scale-95
                                                                ${track.hasFile
                                                                    ? (track.isTuning
                                                                        ? 'bg-orange-500/20 border-orange-500 text-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.2)]'
                                                                        : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700 hover:text-slate-200 hover:border-slate-500')
                                                                    : 'bg-slate-900 border-slate-800 text-slate-700 cursor-not-allowed opacity-50'
                                                                }
                                                            `}
                                                            title={track.hasFile ? "Pitch Tuning" : "Record audio to enable Tuning"}
                                                        >
                                                            <Wand2 size={12} />
                                                        </button>
                                                    )}

                                                    {/* DELETE BUTTON - ALL MODES */}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            vibrate(10);
                                                            setDeleteTrackId(track.id);
                                                        }}
                                                        className="h-6 w-6 shrink-0 rounded-md flex items-center justify-center border border-slate-700 bg-slate-800 text-slate-500 hover:bg-red-500/20 hover:border-red-500 hover:text-red-500 transition-all active:scale-95"
                                                        title="Delete Track"
                                                    >
                                                        <Trash2 size={12} />
                                                    </button>
                                                </div>
                                            )}
                                        </div>

                                        {track.isArmed ? (
                                            <div className="flex-1 flex flex-col items-center justify-center gap-2">
                                                <button
                                                    onClick={handleToggleRecord}
                                                    className={`
                                        w-14 h-14 rounded-full flex items-center justify-center border-4 transition-all shadow-xl active:scale-95
                                        ${isRecording
                                                            ? 'bg-red-500 border-red-400 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.5)]'
                                                            : 'bg-slate-800 border-slate-700 text-red-500 hover:bg-slate-700'
                                                        }
                                    `}
                                                >
                                                    {isRecording ? <Square size={24} fill="white" className="text-white" /> : <Disc size={32} fill="currentColor" />}
                                                </button>
                                                <span className="text-[9px] font-bold text-red-500 tracking-widest uppercase">
                                                    {isRecording ? "REC ON" : "READY"}
                                                </span>
                                            </div>
                                        ) : track.isTuning ? (
                                            <div className="flex-1 flex flex-col items-center justify-center gap-2 animate-in zoom-in duration-200">
                                                <button
                                                    onClick={(e) => openPitchModal(track.id, track.pitchShift, e)}
                                                    className="w-14 h-14 rounded-full flex items-center justify-center border-4 transition-all shadow-xl active:scale-95 bg-orange-600 border-orange-400 text-black shadow-[0_0_15px_rgba(249,115,22,0.4)]"
                                                >
                                                    <Music2 size={24} fill="currentColor" />
                                                </button>
                                                <span className="text-[9px] font-bold text-orange-500 tracking-widest uppercase">
                                                    TUNING
                                                </span>
                                            </div>
                                        ) : (
                                            appMode === 'SIMPLE' ? (
                                                <div className="flex-1 flex flex-col items-center justify-center gap-2">
                                                    <SignalLight
                                                        analyser={trackAnalysersRef.current[track.id]}
                                                        isPlaying={isPlaying}
                                                        color={track.color}
                                                    />
                                                    <div className="flex flex-col w-12 h-24 rounded-2xl overflow-hidden border border-slate-700 shadow-lg">
                                                        {/* TOP: MUTE BUTTON */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                e.stopPropagation();
                                                                vibrate(20);
                                                                setSelectedTrackId(track.id);
                                                                setTracks(tracks.map(t => t.id === track.id ? { ...t, mute: !t.mute } : t));
                                                            }}
                                                            className={`
                                                flex-1 w-full flex items-center justify-center transition-all active:bg-slate-600
                                                ${!track.mute
                                                                    ? 'bg-slate-700 text-white'
                                                                    : 'bg-slate-800 text-slate-500'
                                                                }
                                            `}
                                                            style={!track.mute ? {
                                                                color: track.color
                                                            } : {}}
                                                        >
                                                            <Power size={18} strokeWidth={3} />
                                                        </button>

                                                        {/* DIVIDER */}
                                                        <div className="h-[1px] bg-slate-900 w-full" />

                                                        {/* BOTTOM: EXCLUSIVE SOLO BUTTON */}
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                vibrate(20);
                                                                setSelectedTrackId(track.id);
                                                                // Exclusive Solo Logic
                                                                setTracks(tracks.map(t => {
                                                                    if (t.id === track.id) {
                                                                        return { ...t, solo: !t.solo };
                                                                    } else {
                                                                        return track.solo ? t : { ...t, solo: false };
                                                                    }
                                                                }));
                                                            }}
                                                            className={`
                                                flex-1 w-full flex items-center justify-center transition-all active:bg-slate-600
                                                ${track.solo
                                                                    ? 'bg-lime-400 text-black'
                                                                    : 'bg-slate-800 text-slate-500 hover:text-slate-300'
                                                                }
                                            `}
                                                        >
                                                            <Headphones size={18} strokeWidth={3} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex-1 flex flex-col gap-1">
                                                    <div className="flex gap-1 relative z-10">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                vibrate(5);
                                                                setSelectedTrackId(track.id);
                                                                setTracks(tracks.map(t => t.id === track.id ? { ...t, mute: !t.mute } : t));
                                                            }}
                                                            className={`flex-1 h-6 rounded text-[8px] font-black tracking-tighter transition-all flex items-center justify-center
                                                ${track.mute ? 'bg-orange-500 text-black' : 'bg-slate-900 border border-slate-700 text-slate-500'}
                                            `}
                                                        >M</button>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                vibrate(5);
                                                                setSelectedTrackId(track.id);
                                                                setTracks(tracks.map(t => t.id === track.id ? { ...t, solo: !t.solo } : t));
                                                            }}
                                                            className={`flex-1 h-6 rounded text-[8px] font-black tracking-tighter transition-all flex items-center justify-center
                                                ${track.solo ? 'bg-lime-400 text-black' : 'bg-slate-900 border border-slate-700 text-slate-500'}
                                            `}
                                                        >S</button>
                                                    </div>

                                                    <div className="flex-1 flex items-end justify-between px-1 pb-1 relative z-10">
                                                        <div className="h-full flex items-center justify-center pb-1">
                                                            <MiniFader
                                                                value={track.vol}
                                                                color={track.color}
                                                                onChange={(val) => {
                                                                    const newTracks = [...tracks];
                                                                    const t = newTracks.find(x => x.id === track.id);
                                                                    if (t) t.vol = val;
                                                                    setTracks(newTracks);
                                                                    setSelectedTrackId(track.id);
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="flex flex-col items-center justify-end gap-2 h-full">
                                                            <Knob
                                                                value={track.pan}
                                                                color={track.color}
                                                                size="sm"
                                                                label="PAN"
                                                                onChange={(val) => {
                                                                    const newTracks = [...tracks];
                                                                    const t = newTracks.find(x => x.id === track.id);
                                                                    if (t) t.pan = val;
                                                                    setTracks(newTracks);
                                                                    setSelectedTrackId(track.id);
                                                                }}
                                                            />
                                                            <VuMeter isPlaying={isPlaying} analyser={trackAnalysersRef.current[track.id]} />
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </div>
                                ))}

                            <div
                                onClick={() => {
                                    vibrate(10);
                                    // ADD NEW VOX REC TRACK
                                    const newId = Math.max(...tracks.map(t => t.id), 0) + 1;
                                    const colors = ["#f97316", "#84cc16", "#eab308", "#10b981", "#06b6d4", "#ec4899"];

                                    const newTrack: Track = {
                                        id: newId,
                                        name: `Track ${newId}`,
                                        color: colors[newId % colors.length],
                                        vol: 1.0,
                                        pan: 0.5,
                                        mute: false,
                                        solo: false,
                                        hasFile: false,
                                        isArmed: true, // Auto-arm
                                        isTuning: false,
                                        duration: 0,
                                        pitchShift: 0
                                    };

                                    // Disarm others and add new track
                                    setTracks([...tracks.map(t => ({ ...t, isArmed: false })), newTrack]);
                                }}
                                className={`snap-center shrink-0 w-[80px] h-[90%] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 active:bg-slate-800 transition-colors
                         ${appMode === 'SIMPLE' ? 'border-slate-600' : 'border-slate-800'}
                    `}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border shadow-lg
                        ${appMode === 'SIMPLE' ? 'bg-slate-800 border-slate-600' : 'bg-slate-900 border-slate-700'}
                    `}>
                                    <Plus size={20} className="text-orange-500" />
                                </div>
                                <span className="text-[9px] text-slate-500 font-bold tracking-widest">ADD</span>
                            </div>
                            <div className="w-4 shrink-0"></div>
                        </div>
                    </div>
                </div>

            </>)}

            {/* MAIN CONTENT AREA */}
            {mainView !== 'studio' && (
                <main className="flex-1 relative overflow-hidden bg-slate-950">
                    {mainView === 'library' && (
                        <div className="absolute inset-0 z-20 animate-in fade-in duration-300">
                            <Library onLoadSong={handleLoadFromLibrary} />
                        </div>
                    )}

                    {mainView === 'store' && (
                        <div className="absolute inset-0 z-20 animate-in fade-in duration-300">
                            <Store isAdminMode={isAdminMode} />
                        </div>
                    )}
                </main>
            )}

            {/* PITCH EDIT MODAL (ULTRA MODE) */}
            {pitchEditTrackId !== null && (
                <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in zoom-in duration-200">
                    <div className="w-full max-w-sm bg-zinc-950 rounded-2xl border border-orange-500/30 shadow-[0_0_50px_rgba(249,115,22,0.1)] p-6 flex flex-col items-center">
                        <div className="w-16 h-16 rounded-full bg-orange-950/30 border border-orange-500/50 flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(249,115,22,0.2)]">
                            {isProcessingPitch ? <Loader2 size={32} className="text-orange-500 animate-spin" /> : <Music2 size={32} className="text-orange-500" />}
                        </div>

                        <h3 className="text-xl font-black text-white uppercase tracking-tighter">Track Tuning</h3>
                        <p className="text-xs text-orange-500/80 font-bold tracking-widest mb-6">OFFLINE PITCH ENGINE</p>

                        <div className="flex items-center gap-6 mb-8">
                            <button
                                onClick={() => setTempPitch(p => Math.max(p - 1, -12))}
                                disabled={isProcessingPitch}
                                className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 flex items-center justify-center active:scale-95 active:bg-zinc-800 transition-all disabled:opacity-50"
                            >
                                <Minus size={24} />
                            </button>

                            <div className="flex flex-col items-center w-16">
                                <span className={`text-4xl font-black ${tempPitch === 0 ? 'text-zinc-500' : (tempPitch > 0 ? 'text-green-500' : 'text-red-500')}`}>
                                    {tempPitch > 0 ? `+${tempPitch}` : tempPitch}
                                </span>
                                <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest">SEMITONES</span>
                            </div>

                            <button
                                onClick={() => setTempPitch(p => Math.min(p + 1, 12))}
                                disabled={isProcessingPitch}
                                className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-700 text-zinc-400 flex items-center justify-center active:scale-95 active:bg-zinc-800 transition-all disabled:opacity-50"
                            >
                                <Plus size={24} />
                            </button>
                        </div>

                        <div className="flex w-full gap-3">
                            <button
                                onClick={() => !isProcessingPitch && setPitchEditTrackId(null)}
                                disabled={isProcessingPitch}
                                className="flex-1 py-3 rounded-xl bg-zinc-900 text-zinc-400 font-bold border border-zinc-800 active:scale-95 transition-transform disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmPitchChange}
                                disabled={isProcessingPitch}
                                className="flex-1 py-3 rounded-xl bg-orange-600 text-black font-bold active:scale-95 transition-transform shadow-[0_0_20px_rgba(234,88,12,0.4)] disabled:bg-orange-600/50 flex items-center justify-center gap-2"
                            >
                                {isProcessingPitch ? 'Rendering...' : 'Apply'}
                            </button>
                        </div>

                        <p className="mt-4 text-[10px] text-zinc-600 text-center max-w-[200px]">
                            {tempPitch === 0
                                ? "Bypass Active: 0% CPU Usage. Original Audio."
                                : "High-Quality Granular Processing. Takes a moment to render."}
                        </p>
                    </div>
                </div>
            )}

            {/* SETTINGS MODAL */}
            {showSettings && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
                            <h2 className="font-bold text-lg text-white flex items-center gap-2">
                                <Settings size={20} className="text-orange-500" />
                                Audio Config
                            </h2>
                            <button onClick={() => setShowSettings(false)} className="p-1 rounded-full hover:bg-slate-800 text-slate-400">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-6 overflow-y-auto no-scrollbar">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Input Device (Microphone)</label>
                                <div className="relative">
                                    <select
                                        value={selectedInputId}
                                        onChange={(e) => setSelectedInputId(e.target.value)}
                                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg p-3 appearance-none focus:border-orange-500 focus:outline-none"
                                    >
                                        {inputDevices.map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Microphone ${device.deviceId.slice(0, 5)}...`}
                                            </option>
                                        ))}
                                        {inputDevices.length === 0 && <option>Default Microphone</option>}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-3.5 text-slate-500 pointer-events-none" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Output Device (Speakers)</label>
                                <div className="relative">
                                    <select
                                        value={selectedOutputId}
                                        onChange={(e) => handleOutputChange(e.target.value)}
                                        disabled={!audioContext || !(audioContext as any).setSinkId}
                                        className="w-full bg-slate-950 border border-slate-700 text-white text-sm rounded-lg p-3 appearance-none focus:border-orange-500 focus:outline-none disabled:opacity-50"
                                    >
                                        {outputDevices.map(device => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Speaker ${device.deviceId.slice(0, 5)}...`}
                                            </option>
                                        ))}
                                        {outputDevices.length === 0 && <option>Default Output</option>}
                                    </select>
                                    <ChevronDown size={16} className="absolute right-3 top-3.5 text-slate-500 pointer-events-none" />
                                </div>
                                {audioContext && !(audioContext as any).setSinkId && (
                                    <p className="text-[10px] text-red-400/80 mt-1">
                                        * Output selection not supported in this browser.
                                    </p>
                                )}
                            </div>

                            <div className="h-[1px] bg-slate-800 my-4" />

                            <div className="space-y-3">
                                <label className="text-xs font-bold text-lime-400 uppercase tracking-widest flex items-center gap-2">
                                    <FileAudio size={14} /> Export Mixdown
                                </label>

                                <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 space-y-3">
                                    <div className="relative">
                                        <select
                                            value={exportFormat}
                                            onChange={(e) => setExportFormat(e.target.value as 'wav' | 'mp3')}
                                            className="w-full bg-slate-900 border border-slate-700 text-white text-xs rounded p-2 appearance-none focus:border-lime-500 focus:outline-none"
                                        >
                                            <option value="wav">WAV (High Quality / Lossless)</option>
                                            <option value="mp3">MP3 (Compressed / Universal)</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-2 top-2.5 text-slate-500 pointer-events-none" />
                                    </div>

                                    <button
                                        onClick={handleExport}
                                        disabled={isExporting || maxDuration <= 0}
                                        className="w-full bg-lime-500 hover:bg-lime-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-2 rounded flex items-center justify-center gap-2 transition-all active:scale-95"
                                    >
                                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                        {isExporting ? "Rendering..." : "Export Audio"}
                                    </button>

                                    <p className="text-[10px] text-slate-500 text-center">
                                        Exports active tracks (Volume, Pan & Mute settings applied).
                                    </p>
                                </div>
                            </div>

                            <div className="h-[1px] bg-slate-800 my-4" />

                            <div className="space-y-3">
                                <label className="text-xs font-bold text-orange-400 uppercase tracking-widest flex items-center gap-2">
                                    <Folder size={14} /> Export Multitrack
                                </label>

                                <div className="bg-slate-950 rounded-lg p-3 border border-slate-800 space-y-3">
                                    <button
                                        onClick={handleExportMultitrack}
                                        disabled={isLoading}
                                        className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2 rounded flex items-center justify-center gap-2 transition-all active:scale-95"
                                    >
                                        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                        {isLoading ? "Zipping..." : "Download MP3 Stems (.zip)"}
                                    </button>

                                    <p className="text-[10px] text-slate-500 text-center">
                                        Creates a ZIP file containing each track as a separate high-quality MP3 file.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 bg-slate-950/50 border-t border-slate-800 space-y-4">
                            {/* AUTH SECTION */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest block">Account</label>
                                {!user ? (
                                    <div className="flex gap-2">
                                        <input
                                            type="email"
                                            placeholder="your-email@example.com"
                                            id="login-email"
                                            className="flex-1 bg-slate-900 border border-slate-700 rounded p-2 text-sm text-white focus:border-orange-500 focus:outline-none"
                                        />
                                        <button
                                            onClick={async () => {
                                                const email = (document.getElementById('login-email') as HTMLInputElement).value;
                                                if (!email) return alert("Please enter email");
                                                setLoadingAuth(true);
                                                const { error } = await supabase.auth.signInWithOtp({ email });
                                                setLoadingAuth(false);
                                                if (error) alert(error.message);
                                                else alert("Check your email for the login link!");
                                            }}
                                            disabled={loadingAuth}
                                            className="bg-orange-600 hover:bg-orange-500 text-white px-3 py-2 rounded text-xs font-bold transition whitespace-nowrap"
                                        >
                                            {loadingAuth ? <Loader2 className="animate-spin" size={14} /> : 'Login'}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="bg-slate-900 p-2 rounded border border-slate-700 flex justify-between items-center">
                                        <span className="text-xs text-slate-300 truncate max-w-[150px]" title={user.email}>{user.email}</span>
                                        <button
                                            onClick={() => supabase.auth.signOut()}
                                            className="text-[10px] bg-red-900/30 text-red-500 px-2 py-1 rounded hover:bg-red-900/50 transition"
                                        >
                                            Logout
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                                {/* ADMIN TOGGLE - RESTRICTED */}
                                {user?.email?.trim().toLowerCase() === 'anthonyoxelcanelonsoto@gmail.com' ? (
                                    <button
                                        onClick={() => {
                                            setIsAdminMode(prev => !prev);
                                            setMainView('store');
                                            setShowSettings(false);
                                        }}
                                        className={`text-xs font-bold uppercase tracking-widest px-4 py-3 rounded-lg border transition-all flex items-center gap-2
                                            ${isAdminMode
                                                ? 'bg-green-500/10 border-green-500 text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]'
                                                : 'bg-slate-900 border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'}
                                            `}
                                    >
                                        <div className={`w-2 h-2 rounded-full ${isAdminMode ? 'bg-green-500 animate-pulse' : 'bg-slate-600'}`}></div>
                                        {isAdminMode ? 'ADMIN ACTIVE' : 'ENABLE ADMIN MODE'}
                                    </button>
                                ) : (
                                    <div className="text-[10px] text-slate-700 select-none">
                                        Admin: {user ? 'Restricted' : 'Login Req'}
                                    </div>
                                )}

                                <button
                                    onClick={() => setShowSettings(false)}
                                    className="bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* SHARE MODAL */}
            {showShareModal && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <Share2 size={24} className="text-orange-500" /> Share Project
                            </h2>
                            <button
                                onClick={() => setShowShareModal(false)}
                                className="p-2 rounded-full hover:bg-slate-800 text-slate-400"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <p className="text-sm text-slate-400">
                            Choose how you want to share your creation.
                        </p>

                        <div className="space-y-3">
                            <button
                                onClick={() => handleShare('mix')}
                                disabled={isSharing}
                                className="w-full bg-gradient-to-r from-lime-500 to-lime-600 hover:from-lime-400 hover:to-lime-500 text-black font-bold py-4 rounded-xl flex items-center justify-between px-6 transition-all active:scale-95 disabled:opacity-50"
                            >
                                <div className="flex items-center gap-3">
                                    <FileAudio size={24} className="text-black/70" />
                                    <div className="text-left">
                                        <div className="text-sm font-black uppercase tracking-wider">Share Full Mix</div>
                                        <div className="text-[10px] font-medium opacity-70">MP3 Audio File (Whatsapp/Socials)</div>
                                    </div>
                                </div>
                                {isSharing ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
                            </button>

                            <button
                                onClick={() => handleShare('project')}
                                disabled={isSharing}
                                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-4 rounded-xl flex items-center justify-between px-6 transition-all active:scale-95 disabled:opacity-50 border border-slate-700"
                            >
                                <div className="flex items-center gap-3">
                                    <Folder size={24} className="text-orange-500" />
                                    <div className="text-left">
                                        <div className="text-sm font-bold">Share Project Files</div>
                                        <div className="text-[10px] text-slate-400">Multitrack ZIP (For Collaboration)</div>
                                    </div>
                                </div>
                                {isSharing ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {/* SAVE PROJECT MODAL */}
            {showSaveModal && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-6 space-y-4 animate-in fade-in zoom-in duration-200">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Archive size={24} className="text-orange-500" /> Save Project
                        </h2>

                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 font-bold uppercase">Project Title</label>
                            <input
                                type="text"
                                value={saveTitle}
                                onChange={(e) => setSaveTitle(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white focus:border-orange-500 outline-none"
                                placeholder="Enter song title..."
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 font-bold uppercase">Artist Name</label>
                            <input
                                type="text"
                                value={saveArtist}
                                onChange={(e) => setSaveArtist(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white focus:border-orange-500 outline-none"
                                placeholder="Enter artist name..."
                            />
                        </div>



                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 font-bold uppercase">Cover Image (Optional)</label>
                            <div
                                onClick={() => document.getElementById('cover-upload')?.click()}
                                className="w-full h-32 bg-slate-950 border border-slate-800 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:bg-slate-900 overflow-hidden relative group"
                            >
                                {saveImagePreview ? (
                                    <>
                                        <img src={saveImagePreview} alt="Cover Preview" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="text-xs font-bold text-white">Change Image</span>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-slate-500">
                                        <Upload size={24} />
                                        <span className="text-xs">Click to Upload Cover</span>
                                    </div>
                                )}
                            </div>
                            <input
                                type="file"
                                id="cover-upload"
                                className="hidden"
                                accept="image/*"
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        const file = e.target.files[0];
                                        setSaveImage(file);
                                        const reader = new FileReader();
                                        reader.onloadend = () => setSaveImagePreview(reader.result as string);
                                        reader.readAsDataURL(file);
                                    }
                                }}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 font-bold uppercase">Genre / Tag</label>
                            <select
                                value={saveGenre}
                                onChange={(e) => setSaveGenre(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white focus:border-orange-500 outline-none"
                            >
                                <option value="">Select Genre...</option>
                                <option value="Pop">Pop</option>
                                <option value="Rock">Rock</option>
                                <option value="Hip Hop">Hip Hop</option>
                                <option value="Electronic">Electronic</option>
                                <option value="Acoustic">Acoustic</option>
                                <option value="Vocal">Vocal</option>
                                <option value="Demo">Demo</option>
                            </select>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => setShowSaveModal(false)}
                                className="flex-1 py-3 rounded-lg bg-slate-800 text-slate-300 font-bold hover:bg-slate-700 active:scale-95 transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveProject}
                                disabled={isSaving || !saveTitle.trim()}
                                className="flex-1 py-3 rounded-lg bg-orange-600 text-white font-bold hover:bg-orange-500 disabled:opacity-50 flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-orange-900/20"
                            >
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                                {isSaving ? "Saving..." : "Save to Library"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* RESET CONFIRMATION MODAL */}
            {showResetConfirm && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-6 flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in duration-200">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <AlertTriangle size={32} className="text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-white">Reset Session?</h3>
                            <p className="text-slate-400 text-sm">
                                Are you sure you want to start over? <br />
                                <span className="text-red-400 font-bold">This will delete all recordings and tracks.</span>
                            </p>
                        </div>
                        <div className="flex w-full gap-3 mt-2">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold active:scale-95 transition-transform hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={performReset}
                                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold active:scale-95 transition-transform shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-500"
                            >
                                Reset All
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* DELETE TRACK CONFIRMATION MODAL */}
            {deleteTrackId !== null && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="w-full max-w-sm bg-slate-900 rounded-2xl border border-slate-800 shadow-2xl p-6 flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in duration-200">
                        <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                            <AlertTriangle size={32} className="text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold text-white">Delete Track?</h3>
                            <p className="text-slate-400 text-sm">
                                Are you sure you want to delete <br />
                                <span className="text-white font-bold">"{tracks.find(t => t.id === deleteTrackId)?.name}"</span>?
                            </p>
                        </div>
                        <div className="flex w-full gap-3 mt-2">
                            <button
                                onClick={() => setDeleteTrackId(null)}
                                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold active:scale-95 transition-transform hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmDeleteTrack}
                                className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold active:scale-95 transition-transform shadow-[0_0_20px_rgba(220,38,38,0.4)] hover:bg-red-500"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODE SWITCH CONFIRMATION MODAL */}
            {pendingMode && (
                <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
                    <div className={`w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col
                  ${pendingMode === 'SIMPLE' ? 'bg-slate-900 border-slate-700' : ''}
                  ${pendingMode === 'PRO' ? 'bg-lime-900/10 border-lime-500/20' : ''}
                  ${pendingMode === 'ULTRA' ? 'bg-black border-orange-500/50' : ''}
              `}>
                        {/* Modal Header */}
                        <div className={`p-6 flex flex-col items-center text-center gap-4 border-b
                      ${pendingMode === 'SIMPLE' ? 'bg-slate-800/50 border-slate-700' : ''}
                      ${pendingMode === 'PRO' ? 'bg-lime-900/10 border-lime-500/20' : ''}
                      ${pendingMode === 'ULTRA' ? 'bg-orange-950/20 border-orange-500/20' : ''}
                  `}>
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg
                          ${pendingMode === 'SIMPLE' ? 'bg-slate-800 text-slate-400' : ''}
                          ${pendingMode === 'PRO' ? 'bg-lime-400 text-black' : ''}
                          ${pendingMode === 'ULTRA' ? 'bg-orange-500 text-black shadow-orange-500/50' : ''}
                      `}>
                                {pendingMode === 'SIMPLE' && <Zap size={32} fill="currentColor" />}
                                {pendingMode === 'PRO' && <Sliders size={32} />}
                                {pendingMode === 'ULTRA' && <Wand2 size={32} />}
                            </div>

                            <div>
                                <h2 className={`text-2xl font-black tracking-tighter
                              ${pendingMode === 'SIMPLE' ? 'text-slate-300' : ''}
                              ${pendingMode === 'PRO' ? 'text-lime-400' : ''}
                              ${pendingMode === 'ULTRA' ? 'text-orange-500' : ''}
                          `}>
                                    SWITCH TO {pendingMode === 'SIMPLE' ? 'LITE' : pendingMode}
                                </h2>
                                <p className="text-slate-500 text-xs font-bold tracking-widest uppercase mt-1">Mode Selection</p>
                            </div>
                        </div>

                        {/* Features List */}
                        <div className="p-6 space-y-4">
                            {pendingMode === 'SIMPLE' && (
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={16} className="text-slate-500" /> Simplified Interface</li>
                                    <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={16} className="text-slate-500" /> Karaoke Focus</li>
                                    <li className="flex items-center gap-3 text-slate-300 text-sm"><Check size={16} className="text-slate-500" /> Performance Optimized</li>
                                </ul>
                            )}
                            {pendingMode === 'PRO' && (
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-white text-sm"><Check size={16} className="text-lime-400" /> Multi-track Mixer Controls</li>
                                    <li className="flex items-center gap-3 text-white text-sm"><Check size={16} className="text-lime-400" /> Volume, Pan, Mute & Solo</li>
                                    <li className="flex items-center gap-3 text-white text-sm"><Check size={16} className="text-lime-400" /> Track Recording & Analysis</li>
                                </ul>
                            )}
                            {pendingMode === 'ULTRA' && (
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-white text-sm"><Check size={16} className="text-orange-500" /> NewTone Pitch Correction</li>
                                    <li className="flex items-center gap-3 text-white text-sm"><Check size={16} className="text-orange-500" /> Interactive Note Editing</li>
                                    <li className="flex items-center gap-3 text-white text-sm"><Check size={16} className="text-orange-500" /> Advanced Particle Visuals</li>
                                </ul>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="p-4 bg-black/20 flex gap-3">
                            <button
                                onClick={() => setPendingMode(null)}
                                className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-400 font-bold active:scale-95 transition-transform hover:bg-slate-700"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmModeSwitch}
                                className={`flex-1 py-3 rounded-xl font-bold text-black active:scale-95 transition-transform flex items-center justify-center gap-2 shadow-lg
                              ${pendingMode === 'SIMPLE' ? 'bg-slate-400 hover:bg-slate-300' : ''}
                              ${pendingMode === 'PRO' ? 'bg-lime-400 hover:bg-lime-300 shadow-lime-400/20' : ''}
                              ${pendingMode === 'ULTRA' ? 'bg-orange-500 hover:bg-orange-400 shadow-orange-500/20' : ''}
                          `}
                            >
                                Switch Mode <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                </div>
            )}



            {/* HIDDEN FILE INPUT */}
            <input
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.zip,.lrc,.txt"
                onChange={handleFileSelect}
                className="hidden"
                style={{ display: 'none' }}
            />

        </div>
    );
}
