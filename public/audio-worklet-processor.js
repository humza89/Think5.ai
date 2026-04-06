/**
 * AudioWorklet processor for capturing PCM audio from the microphone.
 * Replaces the deprecated ScriptProcessorNode with a thread-safe,
 * high-performance audio processing pipeline.
 *
 * Receives Float32 audio frames in process(), converts to Int16 PCM,
 * and posts base64-encoded chunks to the main thread via MessagePort.
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(4096);
    this._bufferIndex = 0;
    this._enabled = true;

    this.port.onmessage = (event) => {
      if (event.data.type === "setEnabled") {
        this._enabled = event.data.value;
      }
    };
  }

  process(inputs) {
    if (!this._enabled) return true;

    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this._buffer[this._bufferIndex++] = channelData[i];

      if (this._bufferIndex >= this._buffer.length) {
        // Convert Float32 to Int16 PCM and calculate RMS for silence detection
        const pcm16 = new Int16Array(this._buffer.length);
        let sumSquares = 0;
        for (let j = 0; j < this._buffer.length; j++) {
          const s = Math.max(-1, Math.min(1, this._buffer[j]));
          pcm16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
          sumSquares += s * s;
        }
        const rms = Math.sqrt(sumSquares / this._buffer.length);

        // Post the PCM buffer with RMS metadata to the main thread
        this.port.postMessage(
          { type: "pcm", buffer: pcm16.buffer, rms: rms, isSilent: rms < 0.01 },
          [pcm16.buffer]
        );

        this._buffer = new Float32Array(4096);
        this._bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-capture-processor", PCMCaptureProcessor);
