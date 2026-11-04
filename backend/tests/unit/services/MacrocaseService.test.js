const MacrocaseService = require('../../../src/services/MacrocaseService');
const InMemoryMacrocaseRepository = require('../../../src/repositories/in-memory/InMemoryMacrocaseRepository');
const { ValidationError } = require('../../../src/utils/errors');

const BASE = {
  name: 'Caperucita Roja',
  description: 'Charles Perrault',
  instructions: 'Lee cada parte con atención.',
  maxCharacters: 600,
  defaultTimeLimit: 30,
};

/** One section per entry: [narrative, [question texts]] with stable ids. */
function sections(...parts) {
  return parts.map(([narrative, questions], sectionIndex) => ({
    id: `s${sectionIndex + 1}`,
    title: `Parte ${sectionIndex + 1}`,
    narrative,
    questions: questions.map((text, questionIndex) => ({ id: `s${sectionIndex + 1}q${questionIndex + 1}`, text })),
  }));
}

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

describe('MacrocaseService content model', () => {
  test('stores ordered sections, each with a narrative and its questions', async () => {
    const { service } = setup({ configured: false });
    const created = await service.createMacroCase({
      ...BASE,
      sections: sections([' Había una vez… ', ['¿Qué haría usted?', '¿Por qué?']], ['El lobo llegó.', ['¿Y ahora?']]),
    });

    expect(created).toMatchObject({ schemaVersion: 2, instructions: 'Lee cada parte con atención.' });
    expect(created.sections.map((section) => [section.id, section.order, section.title, section.narrative])).toEqual([
      ['s1', 1, 'Parte 1', 'Había una vez…'],
      ['s2', 2, 'Parte 2', 'El lobo llegó.'],
    ]);
    expect(created.sections[0].questions.map((question) => [question.id, question.order, question.text])).toEqual([
      ['s1q1', 1, '¿Qué haría usted?'], ['s1q2', 2, '¿Por qué?'],
    ]);
  });

  test('reads a macrocase saved before sections existed as a single section', async () => {
    const { repo, service } = setup();
    const legacy = await repo.create({
      ...BASE, active: true, introduction: 'Había una vez…', questions: [{ id: 'q1', order: 1, text: 'Uno' }],
    });

    const read = await service.getMacroCase(legacy.id);
    expect(read).toMatchObject({ schemaVersion: 2, sections: [{ id: 'section-1', narrative: 'Había una vez…', questions: [{ id: 'q1', text: 'Uno' }] }] });
    expect(read).not.toHaveProperty('introduction');
    expect(read).not.toHaveProperty('questions');
  });

  test('rewrites a legacy macrocase as v2 when its sections are saved', async () => {
    const { repo, service } = setup({ configured: false });
    const legacy = await repo.create({ ...BASE, introduction: 'Había una vez…', questions: [{ id: 'q1', order: 1, text: 'Uno' }] });

    await service.updateMacroCase(legacy.id, { sections: sections(['Había una vez…', ['Uno']]) });

    const stored = await repo.findById(legacy.id);
    expect(stored).toMatchObject({ schemaVersion: 2, introduction: null, questions: null });
    expect(stored.sections[0].questions[0].text).toBe('Uno');
  });

  test('creating with the old introduction + questions shape gives one section', async () => {
    const { service } = setup({ configured: false });
    const created = await service.createMacroCase({ ...BASE, introduction: 'Había una vez…', questions: [{ id: 'q1', text: 'Uno' }] });
    expect(created.sections).toEqual([expect.objectContaining({ narrative: 'Había una vez…', questions: [{ id: 'q1', order: 1, text: 'Uno' }] })]);
  });

  test('generates ids for new sections and questions and rejects repeated ones', async () => {
    const { service } = setup({ configured: false });
    const created = await service.createMacroCase({ ...BASE, sections: [{ narrative: 'Texto', questions: [{ text: 'Uno' }, { text: 'Dos' }] }] });
    const ids = [created.sections[0].id, ...created.sections[0].questions.map((question) => question.id)];
    expect(new Set(ids).size).toBe(3);

    await expect(service.createMacroCase({
      ...BASE, sections: [{ id: 's1', narrative: 'A', questions: [{ id: 'q', text: 'Uno' }] }, { id: 's2', narrative: 'B', questions: [{ id: 'q', text: 'Dos' }] }],
    })).rejects.toThrow('repetidos');
  });

  test('rejects texts that are too long', async () => {
    const { service } = setup();
    await expect(service.createMacroCase({ ...BASE, sections: sections(['Texto', ['a'.repeat(501)]]) }))
      .rejects.toBeInstanceOf(ValidationError);
    await expect(service.createMacroCase({ ...BASE, sections: sections(['a'.repeat(8001), ['Uno']]) }))
      .rejects.toThrow('El texto de la sección 1');
  });
});

describe('MacrocaseService voice generation', () => {
  test('create generates the voice and visemes of every narrative and question', async () => {
    const { service, speechService } = setup();
    const created = await service.createMacroCase({
      ...BASE,
      sections: sections(['Había una vez…', [' ¿Qué haría usted? ', '¿Y el lobo?']]),
    });

    expect(speechService.synthesize).toHaveBeenCalledTimes(3);
    expect(created.sections[0].narrativeAudio).toMatchObject({ audioSource: 'tts', ttsText: 'Había una vez…' });
    expect(created.sections[0].narrativeAudio.audioUrl).toContain(`${created.id}/s1-narracion-voz-`);
    expect(created.sections[0].questions[0]).toMatchObject({
      id: 's1q1', order: 1, text: '¿Qué haría usted?', audioSource: 'tts',
      ttsText: '¿Qué haría usted?', ttsVoice: 'es-GT-MartaNeural', visemes: [{ offsetMs: 0, visemeId: 0 }],
    });
    expect(created.sections[0].questions[0].audioUrl).toContain(`${created.id}/s1q1-voz-`);
  });

  test('update only regenerates texts that changed and deletes the old file', async () => {
    const { service, speechService, audioStorage } = setup();
    const created = await service.createMacroCase({ ...BASE, sections: sections(['Narrativa', ['Uno', 'Dos']]) });
    const oldPath = created.sections[0].questions[1].audioPath;
    speechService.synthesize.mockClear();

    // The client sends only ids and texts (audio fields are ignored).
    const edited = sections(['Narrativa', ['Uno', 'Dos, editada']]);
    edited[0].questions[0].audioUrl = 'https://evil';
    const updated = await service.updateMacroCase(created.id, { sections: edited });

    expect(speechService.synthesize).toHaveBeenCalledTimes(1);
    expect(speechService.synthesize).toHaveBeenCalledWith('Dos, editada');
    expect(updated.sections[0].narrativeAudio.audioUrl).toBe(created.sections[0].narrativeAudio.audioUrl);
    expect(updated.sections[0].questions[0].audioUrl).toBe(created.sections[0].questions[0].audioUrl);
    expect(updated.sections[0].questions[1].ttsText).toBe('Dos, editada');
    expect(audioStorage.remove).toHaveBeenCalledWith(oldPath);
  });

  test('uploaded audio (question or narrative) is kept until the admin resets it', async () => {
    const { service, speechService } = setup();
    const created = await service.createMacroCase({ ...BASE, sections: sections(['Narrativa', ['Uno']]) });
    const file = { originalname: 'mi voz.mp3', buffer: Buffer.from('x'), mimetype: 'audio/mpeg' };
    await service.uploadAudio(created.id, { questionId: 's1q1' }, file);
    await service.uploadAudio(created.id, { sectionId: 's1' }, { ...file, originalname: 'narracion.mp3' });
    speechService.synthesize.mockClear();

    const changed = sections(['Narrativa cambiada', ['Uno cambiado']]);
    const kept = await service.updateMacroCase(created.id, { sections: changed });
    expect(speechService.synthesize).not.toHaveBeenCalled();
    expect(kept.sections[0].questions[0]).toMatchObject({ audioSource: 'upload', audioName: 'mi voz.mp3' });
    expect(kept.sections[0].questions[0].visemes).toBeUndefined();
    expect(kept.sections[0].narrativeAudio).toMatchObject({ audioSource: 'upload', audioName: 'narracion.mp3' });

    changed[0].resetNarrativeAudio = true;
    changed[0].questions[0].resetAudio = true;
    const reset = await service.updateMacroCase(created.id, { sections: changed });
    expect(reset.sections[0].questions[0]).toMatchObject({ audioSource: 'tts', ttsText: 'Uno cambiado' });
    expect(reset.sections[0].narrativeAudio).toMatchObject({ audioSource: 'tts', ttsText: 'Narrativa cambiada' });
  });

  test('keeps audio uploaded before generated voices existed when its text is written', async () => {
    const { repo, service, speechService, audioStorage } = setup();
    const legacy = await repo.create({
      ...BASE, active: true, introduction: 'Había una vez…',
      questions: [{ id: 'q1', order: 1, audioName: 'pregunta.ogg', audioUrl: 'https://cdn/pregunta.ogg', audioPath: 'm/pregunta.ogg' }],
    });
    speechService.synthesize.mockClear();

    const updated = await service.updateMacroCase(legacy.id, {
      sections: [{ id: 'section-1', narrative: 'Había una vez…', questions: [{ id: 'q1', text: '¿Qué haría usted?' }] }],
    });

    expect(speechService.synthesize).toHaveBeenCalledTimes(1); // only the narrative
    expect(audioStorage.remove).not.toHaveBeenCalled();
    expect(updated.sections[0].questions[0]).toMatchObject({
      text: '¿Qué haría usted?', audioSource: 'upload', audioUrl: 'https://cdn/pregunta.ogg', audioName: 'pregunta.ogg',
    });
    expect((await service.pickSnapshotForModuleB()).sections[0].questions[0].audioUrl).toBe('https://cdn/pregunta.ogg');
  });

  test('a failure saves the macrocase anyway and records the error', async () => {
    const { service } = setup({ failOn: 'Dos' });
    const created = await service.createMacroCase({ ...BASE, sections: sections(['Narrativa', ['Uno', 'Dos']]) });

    expect(created.sections[0].questions[0].audioSource).toBe('tts');
    expect(created.sections[0].questions[1]).toMatchObject({ text: 'Dos', ttsError: 'Azure caído' });
    expect(created.sections[0].questions[1].audioUrl).toBeUndefined();
  });

  test('without Azure configured nothing is generated and stale voices are dropped', async () => {
    const { repo, speechService } = setup();
    const service = new MacrocaseService(repo, { speechService: { ...speechService, isConfigured: () => false }, audioStorage: setup().audioStorage });
    const created = await service.createMacroCase({ ...BASE, sections: sections(['Narrativa', ['Uno']]) });
    expect(created.sections[0].questions[0].audioUrl).toBeUndefined();
    expect(created.sections[0].narrativeAudio).toBeUndefined();

    const stale = created.sections.map((section) => ({
      ...section,
      questions: [{ ...section.questions[0], audioSource: 'tts', audioUrl: 'u', audioPath: 'p', ttsText: 'Uno' }],
    }));
    await repo.update(created.id, { sections: stale });
    const updated = await service.updateMacroCase(created.id, { sections: sections(['Narrativa', ['Otro']]) });
    expect(updated.sections[0].questions[0]).toEqual({ id: 's1q1', order: 1, text: 'Otro' });
  });
});

describe('MacrocaseService bank and Module B', () => {
  test('several macrocases can be active at once', async () => {
    const { service } = setup();
    const first = await service.createMacroCase({ ...BASE, active: true, sections: sections(['N', ['Uno']]) });
    const second = await service.createMacroCase({ ...BASE, name: 'El náufrago', sections: sections(['N', ['Uno']]) });
    await service.activateMacroCase(second.id);
    await service.updateMacroCase(first.id, { active: true });

    expect((await service.listMacroCases()).map((item) => item.active)).toEqual([true, true]);
  });

  test('picks one of the usable active macrocases at random for Module B', async () => {
    const { repo, speechService, audioStorage } = setup();
    const draw = { value: 0 };
    const service = new MacrocaseService(repo, { speechService, audioStorage, random: () => draw.value });
    await expect(service.pickSnapshotForModuleB()).rejects.toThrow('No hay macrocasos activos');

    await service.createMacroCase({ ...BASE, name: 'Inactivo', sections: sections(['N', ['Uno']]) });
    await service.createMacroCase({ ...BASE, name: 'Activo sin preguntas', active: true, sections: sections(['N', []]) });
    await service.createMacroCase({ ...BASE, name: 'Activo sin narrativa', active: true, sections: sections(['', ['Uno']]) });
    await service.createMacroCase({ ...BASE, name: 'Caperucita', active: true, sections: sections(['N', ['Uno']]) });
    await service.createMacroCase({ ...BASE, name: 'El náufrago', active: true, sections: sections(['N', ['Uno']]) });

    expect((await service.pickSnapshotForModuleB()).name).toBe('Caperucita');
    draw.value = 0.99;
    expect((await service.pickSnapshotForModuleB()).name).toBe('El náufrago');
  });

  test('copies the macrocase for Module B with complete sections only, renumbered in order', async () => {
    const { service } = setup();
    const created = await service.createMacroCase({
      ...BASE,
      active: true,
      sections: [
        ...sections(['Primera parte', ['Uno', '']], ['', ['Sin narrativa']], ['Tercera parte', ['Dos']]),
      ],
    });
    const snapshot = await service.pickSnapshotForModuleB();

    expect(snapshot).toMatchObject({ id: created.id, schemaVersion: 2, name: BASE.name, instructions: BASE.instructions, maxCharacters: 600 });
    expect(snapshot.sections.map((section) => [section.id, section.order, section.narrative])).toEqual([
      ['s1', 1, 'Primera parte'], ['s3', 2, 'Tercera parte'],
    ]);
    expect(snapshot.sections[0].questions.map((question) => [question.id, question.order, question.text])).toEqual([['s1q1', 1, 'Uno']]);
    expect(snapshot.sections[0].questions[0].audioUrl).toBe(created.sections[0].questions[0].audioUrl);
    expect(snapshot.sections[0].narrativeAudio.audioUrl).toBe(created.sections[0].narrativeAudio.audioUrl);
    expect(snapshot.sections[0].narrativeAudio).not.toHaveProperty('ttsText');
  });

  test('keeps audio files that an event Module B still plays', async () => {
    const { repo, speechService, audioStorage } = setup();
    const events = [];
    const service = new MacrocaseService(repo, { speechService, audioStorage, eventRepo: { findAll: async () => events } });
    const created = await service.createMacroCase({ ...BASE, active: true, sections: sections(['Narrativa', ['Uno']]) });
    events.push({ moduleB: { macrocase: await service.pickSnapshotForModuleB() } });

    await service.updateMacroCase(created.id, { sections: sections(['Narrativa editada', ['Uno, editada']]) });
    expect(audioStorage.remove).not.toHaveBeenCalled();
  });

  test('keeps audio that a legacy event copy still plays', async () => {
    const { repo, speechService, audioStorage } = setup();
    const events = [{ moduleB: { macrocase: { introduction: 'X', questions: [{ id: 'q1', audioPath: 'm/legacy.mp3' }] } } }];
    const service = new MacrocaseService(repo, { speechService, audioStorage, eventRepo: { findAll: async () => events } });
    const legacy = await repo.create({ ...BASE, introduction: 'X', questions: [{ id: 'q1', order: 1, text: 'Uno', audioUrl: 'u', audioPath: 'm/legacy.mp3', audioSource: 'tts', ttsText: 'Uno' }] });

    await service.updateMacroCase(legacy.id, { sections: [{ id: 'section-1', narrative: 'X', questions: [{ id: 'q1', text: 'Otra', resetAudio: true }] }] });
    expect(audioStorage.remove).not.toHaveBeenCalledWith('m/legacy.mp3');
  });
});
