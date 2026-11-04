const { ExternalServiceError } = require('../utils/errors');

const DEFAULT_VOICE = 'es-GT-MartaNeural';
const TICKS_PER_MS = 10_000; // Azure reports offsets in 100 ns ticks

const escapeXml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

/**
 * Text-to-speech with Azure Speech. Returns the audio as MP3 plus the
 * viseme events (mouth positions) synchronised with it, which the
 * candidate's avatar uses for lip-sync.
 *
 * Disabled (isConfigured() === false) when AZURE_SPEECH_KEY or
 * AZURE_SPEECH_REGION are missing; callers then skip voice generation.
 */
class AzureSpeechService {
  /**
   * @param {{ key?: string, region?: string, voice?: string, sdk?: object }} options
   *   `sdk` defaults to `microsoft-cognitiveservices-speech-sdk` (injectable for tests).
   */
  constructor({ key, region, voice, sdk } = {}) {
    this.key = key;
    this.region = region;
    this.voice = voice || DEFAULT_VOICE;
    this.sdk = sdk;
  }

  isConfigured() {
    return Boolean(this.key && this.region);
  }

  buildSsml(text) {
    const lang = this.voice.split('-').slice(0, 2).join('-');
    return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${lang}">`
      + `<voice name="${escapeXml(this.voice)}">${escapeXml(text)}</voice></speak>`;
  }

  /**
   * @param {string} text
   * @returns {Promise<{ audio: Buffer, contentType: string, voice: string,
   *   visemes: Array<{ offsetMs: number, visemeId: number }> }>}
   */
  async synthesize(text) {
    if (!this.isConfigured()) {
      throw new ExternalServiceError('AZURE_SPEECH_KEY y AZURE_SPEECH_REGION no están configuradas en el backend.');
    }

    // Loaded lazily so the backend starts (and tests run) without the SDK in memory.
    // eslint-disable-next-line global-require
    const sdk = this.sdk || require('microsoft-cognitiveservices-speech-sdk');
    const speechConfig = sdk.SpeechConfig.fromSubscription(this.key, this.region);
    speechConfig.speechSynthesisVoiceName = this.voice;
    speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;

    // `null` audio config: keep the audio in memory instead of playing it.
    const synthesizer = new sdk.SpeechSynthesizer(speechConfig, null);
    const visemes = [];
    synthesizer.visemeReceived = (_sender, event) => {
      visemes.push({ offsetMs: Math.round(event.audioOffset / TICKS_PER_MS), visemeId: event.visemeId });
    };

    try {
      const result = await new Promise((resolve, reject) => {
        synthesizer.speakSsmlAsync(this.buildSsml(text), resolve, reject);
      });
      if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
        const details = result.errorDetails || 'sin detalles';
        throw new ExternalServiceError(`Azure Speech no pudo generar la voz: ${details}`);
      }
      return {
        audio: Buffer.from(result.audioData),
        contentType: 'audio/mpeg',
        voice: this.voice,
        visemes,
      };
    } catch (error) {
      if (error instanceof ExternalServiceError) throw error;
      throw new ExternalServiceError(`Azure Speech no pudo generar la voz: ${error?.message || error}`);
    } finally {
      synthesizer.close();
    }
  }
}

module.exports = AzureSpeechService;
