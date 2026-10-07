const AzureSpeechService = require('../../../src/services/AzureSpeechService');
const { ExternalServiceError } = require('../../../src/utils/errors');

function fakeSdk({ reason = 'done', visemes = [] } = {}) {
  const config = {};
  const synthesizer = {
    close: jest.fn(),
    speakSsmlAsync: jest.fn(function speak(ssml, resolve) {
      visemes.forEach(([audioOffset, visemeId]) => this.visemeReceived(this, { audioOffset, visemeId }));
      resolve({ reason, audioData: new Uint8Array([1, 2, 3]).buffer, errorDetails: 'clave inválida' });
    }),
  };
  return {
    config,
    synthesizer,
    sdk: {
      SpeechConfig: { fromSubscription: jest.fn(() => config) },
      SpeechSynthesisOutputFormat: { Audio24Khz48KBitRateMonoMp3: 'mp3' },
      ResultReason: { SynthesizingAudioCompleted: 'done' },
      SpeechSynthesizer: jest.fn(() => synthesizer),
    },
  };
}

describe('AzureSpeechService', () => {
  test('is disabled without key or region', async () => {
    const service = new AzureSpeechService({ key: 'k' });
    expect(service.isConfigured()).toBe(false);
    await expect(service.synthesize('Hola')).rejects.toBeInstanceOf(ExternalServiceError);
  });

  test('returns MP3 audio and visemes in milliseconds, with escaped SSML', async () => {
    const { sdk, config, synthesizer } = fakeSdk({ visemes: [[0, 0], [1_250_000, 21]] });
    const service = new AzureSpeechService({ key: 'k', region: 'eastus', sdk });

    const result = await service.synthesize('¿Qué haría <usted> & "por qué"?');

    expect(config).toMatchObject({ speechSynthesisVoiceName: 'es-GT-MartaNeural', speechSynthesisOutputFormat: 'mp3' });
    expect(sdk.SpeechSynthesizer).toHaveBeenCalledWith(config, null);
    expect(synthesizer.speakSsmlAsync.mock.calls[0][0]).toContain('xml:lang="es-GT"');
    expect(synthesizer.speakSsmlAsync.mock.calls[0][0]).toContain('¿Qué haría &lt;usted&gt; &amp; &quot;por qué&quot;?');
    expect(result).toEqual({
      audio: Buffer.from([1, 2, 3]), contentType: 'audio/mpeg', voice: 'es-GT-MartaNeural',
      visemes: [{ offsetMs: 0, visemeId: 0 }, { offsetMs: 125, visemeId: 21 }],
    });
    expect(synthesizer.close).toHaveBeenCalled();
  });

  test('turns a cancelled synthesis into an ExternalServiceError', async () => {
    const { sdk, synthesizer } = fakeSdk({ reason: 'cancelled' });
    const service = new AzureSpeechService({ key: 'k', region: 'eastus', voice: 'es-MX-DaliaNeural', sdk });

    await expect(service.synthesize('Hola')).rejects.toThrow('clave inválida');
    expect(synthesizer.close).toHaveBeenCalled();
  });
});
