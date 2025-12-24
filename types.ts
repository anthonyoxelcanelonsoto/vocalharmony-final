

export interface NoteData {
  note: string;
  octave: number;
  deviation: number;
  midi: number;
  frequency: number;
}

export interface Track {
  id: number;
  name: string;
  color: string;
  vol: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  hasFile: boolean;
  isArmed: boolean; // Ready to record
  isTuning: boolean; // Ready to tune (Pitch Shift modal)
  duration?: number; // Duration in seconds

  offset?: number; // Start time offset in seconds
  pitchShift: number; // Semitones for Ultra mode
  pitchMethod?: 'live' | 'processed'; // 'live' = Realtime (Fast), 'processed' = Offline (High Quality)
  reverbSend?: number; // Reverb send amount 0-1
  eq?: {
    enabled: boolean;
    low: { gain: number, freq: number };
    lowMid: { gain: number, freq: number, q: number };
    mid: { gain: number, freq: number, q: number };
    highMid: { gain: number, freq: number, q: number };
    high: { gain: number, freq: number };
  };
  isMaster?: boolean; // Identifies the Master track
}

export interface LyricLine {
  text: string;
  time: number; // Seconds
}

export interface AudioState {
  ctx: AudioContext | null;
  masterAnalyser: AnalyserNode | null;
  isPlaying: boolean;
  currentTime: number;
  totalDuration: number;
  loopStart: number | null;
  loopEnd: number | null;
}

export interface NoteBlock {
  id: string;
  start: number; // seconds
  end: number;   // seconds
  duration: number;
  originalMidi: number;
  currentMidi: number; // modified by user
  frequency: number;
  shiftCents: number; // Visual shift
}

export type AppMode = 'SIMPLE' | 'PRO' | 'ULTRA';

export const NOTE_STRINGS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];