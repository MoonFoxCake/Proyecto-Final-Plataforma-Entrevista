const MacrocaseService = require('../../../src/services/MacrocaseService');
const InMemoryMacrocaseRepository = require('../../../src/repositories/in-memory/InMemoryMacrocaseRepository');
const { ValidationError } = require('../../../src/utils/errors');

const BASE = {
  name: 'Caperucita Roja',
  description: 'Charles Perrault',
  introduction: 'Había una vez…',
  maxCharacters: 600,
  defaultTimeLimit: 30,
};

function setup({ configured = true, failOn = null } = {}) {
  const repo = new InMemoryMacrocaseRepository();
  const speechService = {
    voice: 'es-GT-MartaNeural',
    isConfigured: () => configured,
    synthesize: jest.fn(async (text) => {
      if (text === failOn) throw new Error('Azure caído');
      return { audio: Buffer.from(text), contentType: 'audio/mpeg', voice: 'es-GT-MartaNeural', visemes: [{ offsetMs: 0, visemeId: 0 }] };
    }),
  };
  let uploads = 0;
  const audioStorage = {
    upload: jest.fn(async ({ filePath }) => { uploads += 1; return { path: `${filePath}#${uploads}`, publicUrl: `https://cdn/${filePath}#${uploads}` }; }),
    remove: jest.fn(async () => true),
  };
  return { repo, speechService, audioStorage, service: new MacrocaseService(repo, { speechService, audioStorage }) };
}

describe('MacrocaseService voice generation', () => {
  test('create generates the voice and visemes of every question', async () => {
    const { service, speechService } = setup();
    const created = await service.createMacroCase({
      ...BASE,
      questions: [{ id: 'q1', text: ' ¿Qué haría usted? ' }, { id: 'q2', text: '¿Y el lobo?' }],
    });

    expect(speechService.synthesize).toHaveBeenCalledTimes(2);
    expect(created.questions[0]).toMatchObject({
      id: 'q1', order: 1, text: '¿Qué haría usted?', audioSource: 'tts',
      ttsText: '¿Qué haría usted?', ttsVoice: 'es-GT-MartaNeural', visemes: [{ offsetMs: 0, visemeId: 0 }],
    });
    expect(created.questions[0].audioUrl).toContain(`${created.id}/q1-voz-`);
  });

  test('update only regenerates questions whose text changed and deletes the old file', async () => {
    const { service, speechService, audioStorage } = setup();
    const created = await service.createMacroCase({ ...BASE, questions: [{ id: 'q1', text: 'Uno' }, { id: 'q2', text: 'Dos' }] });
    const oldPath = created.questions[1].audioPath;
    speechService.synthesize.mockClear();

    // The client sends only id/order/text (audio fields are ignored).
    const updated = await service.updateMacroCase(created.id, {
      questions: [{ id: 'q1', text: 'Uno', audioUrl: 'https://evil' }, { id: 'q2', text: 'Dos, editada' }],
    });

    expect(speechService.synthesize).toHaveBeenCalledTimes(1);
    expect(speechService.synthesize).toHaveBeenCalledWith('Dos, editada');
    expect(updated.questions[0].audioUrl).toBe(created.questions[0].audioUrl);
    expect(updated.questions[1].ttsText).toBe('Dos, editada');
    expect(audioStorage.remove).toHaveBeenCalledWith(oldPath);
  });

  test('uploaded audio is kept until the admin resets it', async () => {
    const { service, speechService } = setup();
    const created = await service.createMacroCase({ ...BASE, questions: [{ id: 'q1', text: 'Uno' }] });
    await service.uploadQuestionAudio(created.id, 'q1', { originalname: 'mi voz.mp3', buffer: Buffer.from('x'), mimetype: 'audio/mpeg' });
    speechService.synthesize.mockClear();

    const kept = await service.updateMacroCase(created.id, { questions: [{ id: 'q1', text: 'Uno cambiado' }] });
    expect(speechService.synthesize).not.toHaveBeenCalled();
    expect(kept.questions[0]).toMatchObject({ audioSource: 'upload', audioName: 'mi voz.mp3' });
    expect(kept.questions[0].visemes).toBeUndefined();

    const reset = await service.updateMacroCase(created.id, { questions: [{ id: 'q1', text: 'Uno cambiado', resetAudio: true }] });
    expect(reset.questions[0]).toMatchObject({ audioSource: 'tts', ttsText: 'Uno cambiado' });
  });

  test('keeps audio uploaded before generated voices existed when its text is written', async () => {
    const { repo, service, speechService, audioStorage } = setup();
    const legacy = await repo.create({
      ...BASE, active: true,
      questions: [{ id: 'q1', order: 1, audioName: 'pregunta.ogg', audioUrl: 'https://cdn/pregunta.ogg', audioPath: 'm/pregunta.ogg' }],
    });

    const updated = await service.updateMacroCase(legacy.id, { questions: [{ id: 'q1', text: '¿Qué haría usted?' }] });

    expect(speechService.synthesize).not.toHaveBeenCalled();
    expect(audioStorage.remove).not.toHaveBeenCalled();
    expect(updated.questions[0]).toMatchObject({
      text: '¿Qué haría usted?', audioSource: 'upload', audioUrl: 'https://cdn/pregunta.ogg', audioName: 'pregunta.ogg',
    });
    expect((await service.pickSnapshotForModuleB()).questions[0].audioUrl).toBe('https://cdn/pregunta.ogg');
  });

  test('a failure saves the macrocase anyway and records the error', async () => {
    const { service } = setup({ failOn: 'Dos' });
    const created = await service.createMacroCase({ ...BASE, questions: [{ id: 'q1', text: 'Uno' }, { id: 'q2', text: 'Dos' }] });

    expect(created.questions[0].audioSource).toBe('tts');
    expect(created.questions[1]).toMatchObject({ text: 'Dos', ttsError: 'Azure caído' });
    expect(created.questions[1].audioUrl).toBeUndefined();
  });

  test('without Azure configured nothing is generated and stale voices are dropped', async () => {
    const { repo, speechService } = setup();
    const service = new MacrocaseService(repo, { speechService: { ...speechService, isConfigured: () => false }, audioStorage: setup().audioStorage });
    const created = await service.createMacroCase({ ...BASE, questions: [{ id: 'q1', text: 'Uno' }] });
    expect(created.questions[0].audioUrl).toBeUndefined();

    await repo.update(created.id, { questions: [{ ...created.questions[0], audioSource: 'tts', audioUrl: 'u', audioPath: 'p', ttsText: 'Uno' }] });
    const updated = await service.updateMacroCase(created.id, { questions: [{ id: 'q1', text: 'Otro' }] });
    expect(updated.questions[0]).toEqual({ id: 'q1', order: 1, text: 'Otro' });
  });

  test('several macrocases can be active at once', async () => {
    const { service } = setup();
    const first = await service.createMacroCase({ ...BASE, active: true, questions: [{ id: 'q1', text: 'Uno' }] });
    const second = await service.createMacroCase({ ...BASE, name: 'El náufrago', questions: [{ id: 'q1', text: 'Uno' }] });
    await service.activateMacroCase(second.id);
    await service.updateMacroCase(first.id, { active: true });

    expect((await service.listMacroCases()).map((item) => item.active)).toEqual([true, true]);
  });

  test('picks one of the usable active macrocases at random for Module B', async () => {
    const { repo, speechService, audioStorage } = setup();
    const draw = { value: 0 };
    const service = new MacrocaseService(repo, { speechService, audioStorage, random: () => draw.value });
    await expect(service.pickSnapshotForModuleB()).rejects.toThrow('No hay macrocasos activos');

    await service.createMacroCase({ ...BASE, name: 'Inactivo', questions: [{ id: 'q1', text: 'Uno' }] });
    await service.createMacroCase({ ...BASE, name: 'Activo sin preguntas', active: true, questions: [] });
    await service.createMacroCase({ ...BASE, name: 'Caperucita', active: true, questions: [{ id: 'q1', text: 'Uno' }] });
    await service.createMacroCase({ ...BASE, name: 'El náufrago', active: true, questions: [{ id: 'q1', text: 'Uno' }] });

    expect((await service.pickSnapshotForModuleB()).name).toBe('Caperucita');
    draw.value = 0.99;
    expect((await service.pickSnapshotForModuleB()).name).toBe('El náufrago');
  });

  test('copies the macrocase for Module B, ordered and with only questions that have text', async () => {
    const { service } = setup();
    const created = await service.createMacroCase({
      ...BASE, active: true, questions: [{ id: 'q1', text: 'Uno' }, { id: 'q2', text: 'Dos' }],
    });
    const snapshot = await service.pickSnapshotForModuleB();
    expect(snapshot).toMatchObject({ id: created.id, name: BASE.name, introduction: BASE.introduction, maxCharacters: 600 });
    expect(snapshot.questions.map((question) => [question.id, question.order, question.text])).toEqual([['q1', 1, 'Uno'], ['q2', 2, 'Dos']]);
    expect(snapshot.questions[0].audioUrl).toBe(created.questions[0].audioUrl);
  });

  test('keeps audio files that an event Module B still plays', async () => {
    const { repo, speechService, audioStorage } = setup();
    const events = [];
    const service = new MacrocaseService(repo, { speechService, audioStorage, eventRepo: { findAll: async () => events } });
    const created = await service.createMacroCase({ ...BASE, active: true, questions: [{ id: 'q1', text: 'Uno' }] });
    events.push({ moduleB: { macrocase: await service.pickSnapshotForModuleB() } });

    await service.updateMacroCase(created.id, { questions: [{ id: 'q1', text: 'Uno, editada' }] });
    expect(audioStorage.remove).not.toHaveBeenCalled();
  });

  test('rejects question texts that are too long', async () => {
    const { service } = setup();
    await expect(service.createMacroCase({ ...BASE, questions: [{ id: 'q1', text: 'a'.repeat(501) }] }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});
