
import { NOTE_STRINGS, NoteData, LyricLine, NoteBlock } from './types';

export const getNoteFromPitch = (frequency: number): NoteData | null => {
  if (!frequency) return null;
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  const midi = Math.round(noteNum) + 69;
  const noteName = NOTE_STRINGS[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  const deviation = Math.floor((noteNum - Math.round(noteNum)) * 100);

  return {
    note: noteName,
    octave: octave,
    deviation: deviation,
    midi: midi,
    frequency: frequency
  };
};

export const autoCorrelate = (buf: Float32Array, sampleRate: number): { pitch: number, volume: number } => {
  let SIZE = buf.length;
  let rms = 0;

  for (let i = 0; i < SIZE; i++) {
    const val = buf[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / SIZE);

  if (rms < 0.008) return { pitch: -1, volume: rms };

  let r1 = 0, r2 = SIZE - 1, thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) {
    if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  }
  for (let i = 1; i < SIZE / 2; i++) {
    if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  }

  buf = buf.slice(r1, r2);
  SIZE = buf.length;

  let c = new Array(SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE - i; j++) {
      c[i] = c[i] + buf[j] * buf[j + i];
    }
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  let T0 = maxpos;

  let x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
  let a = (x1 + x3 - 2 * x2) / 2;
  let b = (x3 - x1) / 2;
  if (a) T0 = T0 - b / (2 * a);

  return { pitch: sampleRate / T0, volume: rms };
};

export const parseLRC = (lrcString: string): LyricLine[] => {
  const lines = lrcString.split('\n');
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  const offsetRegex = /\[offset:\s*(-?\d+)\]/i;

  let globalOffset = 0;

  // First pass: Find offset
  for (const line of lines) {
    const offsetMatch = line.match(offsetRegex);
    if (offsetMatch) {
      // Offset in LRC is usually in milliseconds. 
      // Positive value means lyrics come SOONER (shift time SUBTRACT).
      // effectively: displayed time = tag time - offset
      // BUT, usually [offset: +ms] means shift lyrics later? 
      // Standard spec: "Positive value implies music is ahead of lyrics" -> Lyrics need to be delayed?
      // Actually, usually: Time = TagTime + Offset.
      // Let's assume standard behavior: we ADD the offset (converted to seconds).
      globalOffset = parseInt(offsetMatch[1], 10) / 1000;
    }
  }

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const minStr = match[1];
      const secStr = match[2];
      const msStr = match[3];

      const minutes = parseInt(minStr, 10);
      const seconds = parseInt(secStr, 10);
      const ms = msStr.length === 3 ? parseInt(msStr, 10) / 1000 : parseInt(msStr, 10) / 100;

      const adjustedTime = Math.max(0, (minutes * 60 + seconds + ms) + globalOffset);
      const text = line.replace(timeRegex, '').trim();

      if (text && !text.match(offsetRegex)) { // Don't add the offset line itself
        result.push({ time: adjustedTime, text });
      }
    }
  }

  return result.sort((a, b) => a.time - b.time);
};

// --- AUDIO EXPORT UTILS ---

export const loadJSZip = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    if (window.JSZip) { resolve(window.JSZip); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    script.onload = () => {
      // @ts-ignore
      resolve(window.JSZip);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export const loadLameJS = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    if (window.lamejs) { resolve(window.lamejs); return; }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
    script.onload = () => {
      // @ts-ignore
      resolve(window.lamejs);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export const audioBufferToMp3 = async (buffer: AudioBuffer): Promise<Blob> => {
  const lamejs = await loadLameJS();
  const channels = buffer.numberOfChannels || 1;
  const sampleRate = buffer.sampleRate || 44100;
  const mp3encoder = new lamejs.Mp3Encoder(channels, sampleRate, 128);
  const samples = buffer.getChannelData(0);
  const sampleBlockSize = 1152;
  const mp3Data = [];

  // Float to Short
  const samples16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    samples16[i] = samples[i] < 0 ? samples[i] * 0x8000 : samples[i] * 0x7FFF;
  }

  let remaining = samples16.length;
  for (let i = 0; remaining >= sampleBlockSize; i += sampleBlockSize) {
    const left = samples16.subarray(i, i + sampleBlockSize);
    // Mono encoding for now to simplify
    const mp3buf = mp3encoder.encodeBuffer(left);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
    remaining -= sampleBlockSize;
  }
  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: 'audio/mp3' });
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

const floatTo16BitPCM = (output: DataView, offset: number, input: Float32Array) => {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
};

export const audioBufferToWav = (buffer: AudioBuffer): Blob => {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  let resultBuffer: Float32Array;

  // Interleave channels
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    resultBuffer = new Float32Array(left.length + right.length);
    for (let i = 0; i < left.length; i++) {
      resultBuffer[i * 2] = left[i];
      resultBuffer[i * 2 + 1] = right[i];
    }
  } else {
    resultBuffer = buffer.getChannelData(0);
  }

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const bufferLength = 44 + resultBuffer.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + resultBuffer.length * bytesPerSample, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, format, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * blockAlign, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // bits per sample
  view.setUint16(34, bitDepth, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, resultBuffer.length * bytesPerSample, true);

  // Write PCM samples
  floatTo16BitPCM(view, 44, resultBuffer);

  return new Blob([view], { type: 'audio/wav' });
};

export const analyzeAudioBlocks = (audioBuffer: AudioBuffer, blockSize: number = 4096): NoteBlock[] => {
  const rawBlocks: NoteBlock[] = [];
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // 1. Initial Analysis
  for (let i = 0; i < channelData.length; i += blockSize) {
    const chunk = channelData.slice(i, i + blockSize);
    const { pitch, volume } = autoCorrelate(chunk, sampleRate);

    if (volume > 0.015 && pitch > 50 && pitch < 3000) {
      const time = i / sampleRate;
      const duration = blockSize / sampleRate;
      const noteData = getNoteFromPitch(pitch);
      if (noteData) {
        rawBlocks.push({
          id: Math.random().toString(36).substr(2, 9),
          start: time,
          end: time + duration,
          duration: duration,
          originalMidi: noteData.midi,
          currentMidi: noteData.midi,
          frequency: pitch,
          shiftCents: 0
        });
      }
    }
  }

  // 2. Merge Blocks & Filter Noise
  const mergedBlocks: NoteBlock[] = [];
  if (rawBlocks.length === 0) return [];

  let currentBlock = { ...rawBlocks[0] };

  for (let i = 1; i < rawBlocks.length; i++) {
    const nextBlock = rawBlocks[i];
    const timeGap = nextBlock.start - currentBlock.end;
    const isSameNote = nextBlock.originalMidi === currentBlock.originalMidi;

    // Merge if same note and close enough (allowing small gaps < 100ms)
    if (isSameNote && timeGap < 0.1) {
      currentBlock.end = nextBlock.end;
      currentBlock.duration = currentBlock.end - currentBlock.start;
      // Weighted average or keep visible pitch? Keep original for now.
    } else {
      // Finish current block
      mergedBlocks.push(currentBlock);
      currentBlock = { ...nextBlock };
    }
  }
  mergedBlocks.push(currentBlock);

  // 3. Filter Short Blocks (< 50ms) to remove "dots"
  return mergedBlocks.filter(b => b.duration > 0.05);
};

export const formatTime = (seconds: number): string => {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};
