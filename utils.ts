
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

  let d = 0; while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }
  let T0 = maxpos;

  return { pitch: sampleRate / T0, volume: rms };
};

export const analyzeAudioBlocks = (audioBuffer: AudioBuffer): NoteBlock[] => {
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const chunkSize = 2048; // Window size
  const blocks: NoteBlock[] = [];

  let currentBlock: Partial<NoteBlock> | null = null;
  let framesInBlock = 0;
  let freqSum = 0;

  // Process in chunks
  for (let i = 0; i < channelData.length; i += chunkSize) {
    const chunk = channelData.slice(i, i + chunkSize);
    if (chunk.length < chunkSize) break; // Skip last partial chunk

    const { pitch, volume } = autoCorrelate(chunk, sampleRate);
    const time = i / sampleRate;

    const hasSignal = pitch !== -1 && volume > 0.01;

    if (hasSignal) {
      // If we have a current block, check if pitch is consistent (within a semitone approx)
      if (currentBlock) {
        // approx 6% difference is a semitone
        const freqDiff = Math.abs(currentBlock.frequency! - pitch) / currentBlock.frequency!;

        if (freqDiff < 0.06) {
          // Continue block
          currentBlock.end = time + (chunkSize / sampleRate);
          freqSum += pitch;
          framesInBlock++;
          // Update average frequency on the fly
          currentBlock.frequency = freqSum / framesInBlock;
        } else {
          // Pitch changed significantly, finalize block and start new
          const midi = Math.round(69 + 12 * Math.log2(currentBlock.frequency! / 440));
          if (currentBlock.end! - currentBlock.start! > 0.1) { // Min duration 100ms
            blocks.push({
              id: crypto.randomUUID(),
              start: currentBlock.start!,
              end: currentBlock.end!,
              duration: currentBlock.end! - currentBlock.start!,
              frequency: currentBlock.frequency!,
              originalMidi: midi,
              currentMidi: midi,
              shiftCents: 0
            });
          }

          // Start new
          currentBlock = { start: time, end: time, frequency: pitch };
          freqSum = pitch;
          framesInBlock = 1;
        }
      } else {
        // Start new block
        currentBlock = { start: time, end: time, frequency: pitch };
        freqSum = pitch;
        framesInBlock = 1;
      }
    } else {
      // Silence
      if (currentBlock) {
        const midi = Math.round(69 + 12 * Math.log2(currentBlock.frequency! / 440));
        if (currentBlock.end! - currentBlock.start! > 0.1) {
          blocks.push({
            id: crypto.randomUUID(),
            start: currentBlock.start!,
            end: currentBlock.end!,
            duration: currentBlock.end! - currentBlock.start!,
            frequency: currentBlock.frequency!,
            originalMidi: midi,
            currentMidi: midi,
            shiftCents: 0
          });
        }
        currentBlock = null;
        framesInBlock = 0;
        freqSum = 0;
      }
    }
  }

  return blocks;
};

export const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const loadJSZip = (): Promise<any> => {
  return new Promise((resolve, reject) => {
    // @ts-ignore
    if (window.JSZip) return resolve(window.JSZip);
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
    // @ts-ignore
    script.onload = () => resolve(window.JSZip);
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

export const parseLRC = (lrcContent: string): LyricLine[] => {
  const lines = lrcContent.split('\n');
  const result: LyricLine[] = [];

  // Regex to match [mm:ss.xx] or [mm:ss.xxx]
  const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  // Regex to match [offset: +/-ms]
  const offsetRegex = /\[offset:\s*([+-]?\d+)\]/i;

  let globalOffset = 0;

  // First pass: find offset if exists
  for (const line of lines) {
    const offsetMatch = line.match(offsetRegex);
    if (offsetMatch) {
      // Offset is in milliseconds. 
      // User Logic: "Negative value" moves timestamps earlier (to fix lagging lyrics). 
      // Implementation: Time + (Offset / 1000). 
      // If Offset = -1000, Timestamp reduces by 1s.
      globalOffset = parseInt(offsetMatch[1], 10) / 1000;
    }
  }

  for (const line of lines) {
    const match = line.match(timeRegex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const msStr = match[3];
      // Normalize ms to fraction of second. If 2 digits, it's 10ms units. If 3, it's 1ms.
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
