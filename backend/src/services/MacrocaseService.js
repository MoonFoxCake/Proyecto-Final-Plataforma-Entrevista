const crypto = require('crypto');
const { NotFoundError, ValidationError } = require('../utils/errors');
const {
  MACROCASE_SCHEMA_VERSION, toSectionedMacrocase, orderedSections, macrocaseAudioPaths,
} = require('../utils/macrocase');

const MAX_QUESTION_TEXT = 500;
const MAX_SECTION_TITLE = 120;
// About 8–9 minutes of speech: within what Azure synthesizes in one request.
const MAX_NARRATIVE_TEXT = 8000;
const MAX_INSTRUCTIONS_TEXT = 2000;

// Audio fields are managed by the server (generated voice or uploaded
// file); whatever the client sends for them is ignored.
const AUDIO_FIELDS = ['audioUrl', 'audioPath', 'audioName', 'audioSource', 'ttsText', 'ttsVoice', 'visemes', 'ttsError'];

function pickAudio(item = {}) {
  const audio = Object.fromEntries(AUDIO_FIELDS.filter((field) => item[field] !== undefined).map((field) => [field, item[field]]));
  // Files uploaded before generated voices existed have no `audioSource`:
  // they are uploads, so writing their text must not replace them.
  if (audio.audioUrl && !audio.audioSource) audio.audioSource = 'upload';
  return audio;
}

function withoutAudio(item) {
  return Object.fromEntries(Object.entries(item).filter(([field]) => !AUDIO_FIELDS.includes(field)));
}

const hasAudio = (audio) => Object.keys(audio || {}).length > 0;

/** Narratives keep their voice in `narrativeAudio`; voice sync works on `{ text, ...audio }`. */
const narrativeItem = (section) => ({ text: section.narrative, ...(section.narrativeAudio || {}) });

function withNarrativeAudio(section, item) {
  const { narrativeAudio, ...rest } = section;
  const audio = pickAudio(item);
  return hasAudio(audio) ? { ...rest, narrativeAudio: audio } : rest;
}

const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;

function checkLength(value, max, label) {
  if (value.length > max) throw new ValidationError(`${label} supera los ${max} caracteres.`);
}

class MacrocaseService {
  /**
   * @param {object} macrocaseRepo
   * @param {{ speechService?: { isConfigured(): boolean, voice: string, synthesize(text: string): Promise<object> },
   *   audioStorage?: { upload(file: object): Promise<{ path: string, publicUrl: string }>, remove(path: string): Promise<unknown> } }} [deps]
   *   Without `speechService` (or unconfigured) narratives and questions get
   *   no generated voice and the candidate's browser reads them instead.
   */
  constructor(macrocaseRepo, { speechService, audioStorage, eventRepo, random = Math.random } = {}) {
    this.macrocaseRepo = macrocaseRepo;
    this.speechService = speechService;
    this.audioStorage = audioStorage;
    this.eventRepo = eventRepo;
    this.random = random;
  }

  /**
   * The bank: every active macrocase with at least one complete section
   * (narrative and questions) can be used. Picks one at random for an
   * event's Module B and returns a copy (texts, audio and visemes), so
   * editing the bank later does not change a running process. All
   * candidates of the event get this same macrocase.
   */
  async pickSnapshotForModuleB() {
    const macrocases = (await this.macrocaseRepo.findAll()).map(toSectionedMacrocase);
    const usable = macrocases
      .filter((macrocase) => macrocase.active === true)
      .map((macrocase) => ({ macrocase, sections: this.snapshotSections(macrocase) }))
      .filter(({ sections }) => sections.length > 0);
    if (!usable.length) {
      throw new ValidationError('No hay macrocasos activos con secciones completas (texto y preguntas) en el Banco de Macrocasos. Activa al menos uno.');
    }
    const { macrocase: active, sections } = usable[Math.floor(this.random() * usable.length) % usable.length];
    return {
      id: active.id,
      schemaVersion: MACROCASE_SCHEMA_VERSION,
      name: active.name,
      description: active.description || '',
      instructions: active.instructions || '',
      maxCharacters: active.maxCharacters,
      defaultTimeLimit: active.defaultTimeLimit,
      sections,
    };
  }

  /** Sections with a narrative and at least one question with text, in order. */
  snapshotSections(macrocase) {
    return orderedSections(macrocase)
      .map((section) => ({
        ...section,
        questions: section.questions.filter((question) => question.text),
      }))
      .filter((section) => section.narrative?.trim() && section.questions.length)
      .map((section, sectionIndex) => ({
        id: section.id,
        order: sectionIndex + 1,
        title: section.title || '',
        narrative: section.narrative,
        ...(section.narrativeAudio?.audioUrl ? {
          narrativeAudio: {
            audioUrl: section.narrativeAudio.audioUrl,
            audioPath: section.narrativeAudio.audioPath || '',
            visemes: section.narrativeAudio.visemes || [],
          },
        } : {}),
        questions: section.questions.map(({ id, text, audioUrl, audioPath, visemes }, index) => ({
          id, order: index + 1, text, audioUrl: audioUrl || '', audioPath: audioPath || '', visemes: visemes || [],
        })),
      }));
  }

  async listMacroCases() {
    return (await this.macrocaseRepo.findAll()).map(toSectionedMacrocase);
  }

  async getMacroCase(macrocaseId) {
    const macrocase = await this.macrocaseRepo.findById(macrocaseId);

    if (!macrocase) {
      throw new NotFoundError('Macrocaso no encontrado.');
    }

    return toSectionedMacrocase(macrocase);
  }

  async createMacroCase(data) {
    // Clients that still send `introduction` + `questions` get one section.
    const input = data.sections ? data : toSectionedMacrocase(data);
    const sections = this.normalizeSections(input.sections);
    const instructions = (data.instructions || '').trim();
    checkLength(instructions, MAX_INSTRUCTIONS_TEXT, 'Las instrucciones');
    const created = await this.macrocaseRepo.create({
      schemaVersion: MACROCASE_SCHEMA_VERSION,
      name: data.name.trim(),
      description: data.description?.trim() || '',
      instructions,
      maxCharacters: Number(data.maxCharacters),
      defaultTimeLimit: Number(data.defaultTimeLimit),
      active: Boolean(data.active),
      sections,
    });

    // The audio path needs the macrocase id, so voices go in a second write.
    const voiced = await this.syncVoices(created.id, sections);
    if (voiced === sections) return toSectionedMacrocase(created);
    return toSectionedMacrocase(await this.macrocaseRepo.update(created.id, { sections: voiced }));
  }

  async updateMacroCase(macrocaseId, data) {
    const existing = await this.getMacroCase(macrocaseId);
    const { introduction, questions, schemaVersion, ...payload } = data;

    if (payload.name !== undefined) {
      payload.name = payload.name.trim();
    }

    if (payload.description !== undefined) {
      payload.description = payload.description?.trim() || '';
    }

    if (payload.instructions !== undefined) {
      payload.instructions = payload.instructions?.trim() || '';
      checkLength(payload.instructions, MAX_INSTRUCTIONS_TEXT, 'Las instrucciones');
    }

    if (payload.maxCharacters !== undefined) {
      payload.maxCharacters = Number(payload.maxCharacters);
    }

    if (payload.defaultTimeLimit !== undefined) {
      payload.defaultTimeLimit = Number(payload.defaultTimeLimit);
    }

    if (payload.sections !== undefined) {
      const sections = this.normalizeSections(payload.sections, existing.sections);
      payload.sections = await this.syncVoices(macrocaseId, sections);
      // A document saved before sections existed is rewritten as v2.
      payload.schemaVersion = MACROCASE_SCHEMA_VERSION;
      payload.introduction = null;
      payload.questions = null;
    }

    const updated = await this.macrocaseRepo.update(macrocaseId, {
      ...payload,
      active: payload.active ?? existing.active,
    });

    if (payload.sections !== undefined) {
      await this.removeUnusedAudio(existing, { sections: payload.sections });
    }

    return toSectionedMacrocase(updated);
  }

  /**
   * Replaces the voice of a question (`questionId`) or of a section
   * narrative (`sectionId`) with an uploaded audio file. Uploaded audio
   * wins over the generated voice until the admin resets it.
   */
  async uploadAudio(macrocaseId, { questionId, sectionId }, file) {
    const macrocase = await this.getMacroCase(macrocaseId);
    const targetId = questionId || sectionId;
    const section = sectionId
      ? macrocase.sections.find((item) => item.id === sectionId)
      : macrocase.sections.find((item) => (item.questions || []).some((question) => question.id === questionId));

    if (!targetId || !section) {
      throw new NotFoundError(questionId ? 'Pregunta no encontrada.' : 'Sección no encontrada.');
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploaded = await this.audioStorage.upload({
      fileBuffer: file.buffer,
      filePath: `${macrocaseId}/${targetId}-${Date.now()}-${safeName}`,
      contentType: file.mimetype,
    });
    const audio = {
      audioName: file.originalname,
      audioPath: uploaded.path,
      audioUrl: uploaded.publicUrl,
      audioSource: 'upload',
    };

    const sections = macrocase.sections.map((item) => {
      if (item.id !== section.id) return item;
      if (!questionId) return { ...item, narrativeAudio: audio };
      return {
        ...item,
        questions: item.questions.map((question) => (question.id === questionId ? { ...withoutAudio(question), ...audio } : question)),
      };
    });

    const updated = await this.macrocaseRepo.update(macrocaseId, {
      sections, schemaVersion: MACROCASE_SCHEMA_VERSION, introduction: null, questions: null,
    });
    await this.removeUnusedAudio(macrocase, { sections });
    return toSectionedMacrocase(updated);
  }

  async activateMacroCase(macrocaseId) {
    await this.getMacroCase(macrocaseId);

    return toSectionedMacrocase(await this.macrocaseRepo.update(macrocaseId, {
      active: true,
    }));
  }

  async deactivateMacroCase(macrocaseId) {
    await this.getMacroCase(macrocaseId);

    return toSectionedMacrocase(await this.macrocaseRepo.update(macrocaseId, {
      active: false,
    }));
  }

  async deleteMacroCase(macrocaseId) {
    const existing = await this.getMacroCase(macrocaseId);

    const deleted = await this.macrocaseRepo.delete(macrocaseId);
    await this.removeUnusedAudio(existing, null);
    return toSectionedMacrocase(deleted);
  }

  // ------------------------------------------------------------- content

  /**
   * Keeps ids, order and texts from the client and the audio fields from
   * the stored narrative/question with the same id (unless
   * `resetNarrativeAudio` / `resetAudio` is set, which drops an uploaded
   * file so the generated voice is used again).
   */
  normalizeSections(incoming, previous = []) {
    if (!Array.isArray(incoming)) {
      throw new ValidationError('El macrocaso debe tener una lista de secciones.');
    }
    const previousSections = new Map(previous.map((section) => [section.id, section]));
    const previousQuestions = new Map(previous.flatMap((section) => section.questions || []).map((question) => [question.id, question]));
    const seenIds = new Set();
    const uniqueId = (id, prefix) => {
      const value = typeof id === 'string' && id.trim() ? id.trim() : newId(prefix);
      if (seenIds.has(value)) throw new ValidationError('Hay secciones o preguntas con identificadores repetidos.');
      seenIds.add(value);
      return value;
    };

    return incoming.map((section, sectionIndex) => {
      const label = `La sección ${sectionIndex + 1}`;
      const title = (section.title || '').trim();
      const narrative = (section.narrative || '').trim();
      checkLength(title, MAX_SECTION_TITLE, `El título de ${label.toLowerCase()}`);
      checkLength(narrative, MAX_NARRATIVE_TEXT, `El texto de ${label.toLowerCase()}`);
      const id = uniqueId(section.id, 'section');
      const previousNarrative = previousSections.get(section.id)?.narrativeAudio;

      const questions = (Array.isArray(section.questions) ? section.questions : []).map((question, questionIndex) => {
        const text = (question.text || '').trim();
        checkLength(text, MAX_QUESTION_TEXT, `La pregunta ${questionIndex + 1} de ${label.toLowerCase()}`);
        return {
          id: uniqueId(question.id, 'question'),
          order: questionIndex + 1,
          text,
          ...(question.resetAudio ? {} : pickAudio(previousQuestions.get(question.id))),
        };
      });

      const narrativeAudio = section.resetNarrativeAudio ? {} : pickAudio(previousNarrative);
      return {
        id,
        order: sectionIndex + 1,
        title,
        narrative,
        ...(hasAudio(narrativeAudio) ? { narrativeAudio } : {}),
        questions,
      };
    });
  }

  // ---------------------------------------------------------------- voice

  /**
   * Generates the voice of every narrative and question whose text changed
   * (or has none yet). Uploaded audio is left alone. A failure on one item
   * does not block saving: it is recorded in `ttsError` and the candidate's
   * browser reads that text instead.
   *
   * @returns the same array when nothing changed
   */
  async syncVoices(macrocaseId, sections) {
    let changed = false;
    const result = [];

    for (const section of sections) {
      const narrative = await this.syncVoice(macrocaseId, narrativeItem(section), `${section.id}-narracion`);
      changed ||= narrative.changed;

      const questions = [];
      for (const question of section.questions) {
        const voiced = await this.syncVoice(macrocaseId, question, question.id);
        changed ||= voiced.changed;
        questions.push(voiced.item);
      }

      result.push({ ...withNarrativeAudio(section, narrative.item), questions });
    }

    return changed ? result : sections;
  }

  /** @returns {Promise<{ item: object, changed: boolean }>} */
  async syncVoice(macrocaseId, item, fileKey) {
    const canGenerate = Boolean(this.speechService?.isConfigured() && this.audioStorage);

    if (item.audioSource === 'upload' && item.audioUrl) {
      return { item, changed: false };
    }

    const upToDate = item.audioSource === 'tts'
      && item.audioUrl
      && item.ttsText === item.text
      && (!canGenerate || item.ttsVoice === this.speechService.voice);
    if (upToDate) return { item, changed: false };

    const base = withoutAudio(item);
    // Stale generated audio would read an old text: drop it.
    const hadAudio = hasAudio(pickAudio(item));
    if (!item.text || !canGenerate) {
      return { item: base, changed: hadAudio };
    }

    try {
      const speech = await this.speechService.synthesize(item.text);
      const uploaded = await this.audioStorage.upload({
        fileBuffer: speech.audio,
        filePath: `${macrocaseId}/${fileKey}-voz-${Date.now()}.mp3`,
        contentType: speech.contentType,
      });
      return {
        changed: true,
        item: {
          ...base,
          audioName: `Voz generada · ${speech.voice}`,
          audioPath: uploaded.path,
          audioUrl: uploaded.publicUrl,
          audioSource: 'tts',
          ttsText: item.text,
          ttsVoice: speech.voice,
          visemes: speech.visemes,
        },
      };
    } catch (error) {
      console.error(`No se pudo generar la voz de ${fileKey}:`, error.message);
      return { item: { ...base, ttsError: error.message }, changed: true };
    }
  }

  /**
   * Deletes stored audio files that the macrocase no longer references
   * (best effort). Files copied into an event's Module B are kept:
   * candidates of that process still play them.
   */
  async removeUnusedAudio(previousMacrocase, currentMacrocase) {
    if (!this.audioStorage) return;
    const inUse = macrocaseAudioPaths(currentMacrocase);
    for (const event of (await this.eventRepo?.findAll()) || []) {
      for (const path of macrocaseAudioPaths(event.moduleB?.macrocase)) inUse.add(path);
    }
    for (const path of macrocaseAudioPaths(previousMacrocase)) {
      if (inUse.has(path)) continue;
      try {
        await this.audioStorage.remove(path);
      } catch (error) {
        console.warn('No se pudo eliminar el audio anterior:', error.message);
      }
    }
  }
}

module.exports = MacrocaseService;
