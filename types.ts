

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
  pitchShift: number; // Semitones for Ultra mode
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