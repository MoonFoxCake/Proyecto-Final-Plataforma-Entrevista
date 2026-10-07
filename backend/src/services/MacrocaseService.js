const { NotFoundError, ValidationError } = require('../utils/errors');

const MAX_QUESTION_TEXT = 500;

// Audio fields are managed by the server (generated voice or uploaded
// file); whatever the client sends for them is ignored.
const AUDIO_FIELDS = ['audioUrl', 'audioPath', 'audioName', 'audioSource', 'ttsText', 'ttsVoice', 'visemes', 'ttsError'];

function pickAudio(question = {}) {
  const audio = Object.fromEntries(AUDIO_FIELDS.filter((field) => question[field] !== undefined).map((field) => [field, question[field]]));
  // Files uploaded before generated voices existed have no `audioSource`:
  // they are uploads, so writing their text must not replace them.
  if (audio.audioUrl && !audio.audioSource) audio.audioSource = 'upload';
  return audio;
}

function withoutAudio(question) {
  return Object.fromEntries(Object.entries(question).filter(([field]) => !AUDIO_FIELDS.includes(field)));
}

function audioPaths(questions = []) {
  return new Set(questions.map((question) => question.audioPath).filter(Boolean));
}

class MacrocaseService {
  /**
   * @param {object} macrocaseRepo
   * @param {{ speechService?: { isConfigured(): boolean, voice: string, synthesize(text: string): Promise<object> },
   *   audioStorage?: { upload(file: object): Promise<{ path: string, publicUrl: string }>, remove(path: string): Promise<unknown> } }} [deps]
   *   Without `speechService` (or unconfigured) questions get no generated
   *   voice and the candidate's browser reads them instead.
   */
  constructor(macrocaseRepo, { speechService, audioStorage, eventRepo, random = Math.random } = {}) {
    this.macrocaseRepo = macrocaseRepo;
    this.speechService = speechService;
    this.audioStorage = audioStorage;
    this.eventRepo = eventRepo;
    this.random = random;
  }

  /**
   * The bank: every active macrocase with at least one question can be used.
   * Picks one at random for an event's Module B and returns a copy (texts,
   * audio and visemes), so editing the bank later does not change a running
   * process. All candidates of the event get this same macrocase.
   */
  async pickSnapshotForModuleB() {
    const macrocases = await this.macrocaseRepo.findAll();
    const usable = macrocases
      .filter((macrocase) => macrocase.active === true)
      .map((macrocase) => ({ macrocase, questions: this.snapshotQuestions(macrocase) }))
      .filter(({ questions }) => questions.length > 0);
    if (!usable.length) {
      throw new ValidationError('No hay macrocasos activos con preguntas en el Banco de Macrocasos. Activa al menos uno.');
    }
    const { macrocase: active, questions } = usable[Math.floor(this.random() * usable.length) % usable.length];
    return {
      id: active.id,
      name: active.name,
      description: active.description || '',
      introduction: active.introduction,
      maxCharacters: active.maxCharacters,
      defaultTimeLimit: active.defaultTimeLimit,
      questions,
    };
  }

  snapshotQuestions(macrocase) {
    return [...(macrocase.questions || [])]
      .filter((question) => question.text)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(({ id, order, text, audioUrl, audioPath, visemes }, index) => ({
        id, order: order ?? index + 1, text, audioUrl: audioUrl || '', audioPath: audioPath || '', visemes: visemes || [],
      }));
  }

  async listMacroCases() {
    return this.macrocaseRepo.findAll();
  }

  async getMacroCase(macrocaseId) {
    const macrocase = await this.macrocaseRepo.findById(macrocaseId);

    if (!macrocase) {
      throw new NotFoundError('Macrocaso no encontrado.');
    }

    return macrocase;
  }

  async createMacroCase(data) {
    const questions = this.normalizeQuestions(data.questions || []);
    const created = await this.macrocaseRepo.create({
      name: data.name.trim(),
      description: data.description?.trim() || '',
      introduction: data.introduction.trim(),
      maxCharacters: Number(data.maxCharacters),
      defaultTimeLimit: Number(data.defaultTimeLimit),
      active: Boolean(data.active),
      questions,
    });

    // The audio path needs the macrocase id, so voices go in a second write.
    const voiced = await this.syncVoices(created.id, questions);
    if (voiced === questions) return created;
    return this.macrocaseRepo.update(created.id, { questions: voiced });
  }

  async updateMacroCase(macrocaseId, data) {
    const existing = await this.getMacroCase(macrocaseId);

    const payload = {
      ...data,
    };

    if (payload.name !== undefined) {
      payload.name = payload.name.trim();
    }

    if (payload.description !== undefined) {
      payload.description = payload.description?.trim() || '';
    }

    if (payload.introduction !== undefined) {
      payload.introduction = payload.introduction.trim();
    }

    if (payload.maxCharacters !== undefined) {
      payload.maxCharacters = Number(payload.maxCharacters);
    }

    if (payload.defaultTimeLimit !== undefined) {
      payload.defaultTimeLimit = Number(payload.defaultTimeLimit);
    }

    if (payload.questions !== undefined) {
      const questions = this.normalizeQuestions(payload.questions, existing.questions);
      payload.questions = await this.syncVoices(macrocaseId, questions);
    }

    const updated = await this.macrocaseRepo.update(macrocaseId, {
      ...payload,
      active: payload.active ?? existing.active,
    });

    if (payload.questions !== undefined) {
      await this.removeUnusedAudio(existing.questions, payload.questions);
    }

    return updated;
  }

  /**
   * Replaces a question's voice with an uploaded audio file. Uploaded audio
   * wins over the generated voice until the admin resets it.
   */
  async uploadQuestionAudio(macrocaseId, questionId, file) {
    const macrocase = await this.getMacroCase(macrocaseId);
    const question = (macrocase.questions || []).find((item) => item.id === questionId);

    if (!question) {
      throw new NotFoundError('Pregunta no encontrada.');
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const uploaded = await this.audioStorage.upload({
      fileBuffer: file.buffer,
      filePath: `${macrocaseId}/${questionId}-${Date.now()}-${safeName}`,
      contentType: file.mimetype,
    });

    const questions = macrocase.questions.map((item) => (item.id === questionId
      ? {
          ...withoutAudio(item),
          audioName: file.originalname,
          audioPath: uploaded.path,
          audioUrl: uploaded.publicUrl,
          audioSource: 'upload',
        }
      : item));

    const updated = await this.macrocaseRepo.update(macrocaseId, { questions });
    await this.removeUnusedAudio(macrocase.questions, questions);
    return updated;
  }

  async activateMacroCase(macrocaseId) {
    await this.getMacroCase(macrocaseId);

    return this.macrocaseRepo.update(macrocaseId, {
      active: true,
    });
  }

  async deactivateMacroCase(macrocaseId) {
    await this.getMacroCase(macrocaseId);

    return this.macrocaseRepo.update(macrocaseId, {
      active: false,
    });
  }

  async deleteMacroCase(macrocaseId) {
    const existing = await this.getMacroCase(macrocaseId);

    const deleted = await this.macrocaseRepo.delete(macrocaseId);
    await this.removeUnusedAudio(existing.questions, []);
    return deleted;
  }


  // ---------------------------------------------------------------- voice

  /**
   * Keeps id, order and text from the client and the audio fields from the
   * stored question with the same id (unless `resetAudio` is set, which
   * drops an uploaded file so the generated voice is used again).
   */
  normalizeQuestions(incoming, previous = []) {
    const previousById = new Map((previous || []).map((question) => [question.id, question]));

    return incoming.map((question, index) => {
      const text = (question.text || '').trim();
      if (text.length > MAX_QUESTION_TEXT) {
        throw new ValidationError(`La pregunta ${index + 1} supera los ${MAX_QUESTION_TEXT} caracteres.`);
      }
      return {
        id: question.id || `question-${Date.now()}-${index}`,
        order: index + 1,
        text,
        ...(question.resetAudio ? {} : pickAudio(previousById.get(question.id))),
      };
    });
  }

  /**
   * Generates the voice of every question whose text changed (or has none
   * yet). Uploaded audio is left alone. A failure on one question does not
   * block saving: it is recorded in `ttsError` and the candidate's browser
   * reads that question instead.
   *
   * @returns the same array when nothing changed
   */
  async syncVoices(macrocaseId, questions) {
    const canGenerate = Boolean(this.speechService?.isConfigured() && this.audioStorage);
    let changed = false;
    const result = [];

    for (const question of questions) {
      if (question.audioSource === 'upload' && question.audioUrl) {
        result.push(question);
        continue;
      }

      const upToDate = question.audioSource === 'tts'
        && question.audioUrl
        && question.ttsText === question.text
        && (!canGenerate || question.ttsVoice === this.speechService.voice);
      if (upToDate || !question.text) {
        result.push(upToDate ? question : withoutAudio(question));
        changed ||= !upToDate && Object.keys(pickAudio(question)).length > 0;
        continue;
      }

      const base = withoutAudio(question);
      if (!canGenerate) {
        // Stale generated audio would read an old text: drop it.
        changed ||= Object.keys(pickAudio(question)).length > 0;
        result.push(base);
        continue;
      }

      changed = true;
      try {
        const speech = await this.speechService.synthesize(question.text);
        const uploaded = await this.audioStorage.upload({
          fileBuffer: speech.audio,
          filePath: `${macrocaseId}/${question.id}-voz-${Date.now()}.mp3`,
          contentType: speech.contentType,
        });
        result.push({
          ...base,
          audioName: `Voz generada · ${speech.voice}`,
          audioPath: uploaded.path,
          audioUrl: uploaded.publicUrl,
          audioSource: 'tts',
          ttsText: question.text,
          ttsVoice: speech.voice,
          visemes: speech.visemes,
        });
      } catch (error) {
        console.error(`No se pudo generar la voz de la pregunta ${question.id}:`, error.message);
        result.push({ ...base, ttsError: error.message });
      }
    }

    return changed ? result : questions;
  }

  /**
   * Deletes stored audio files that no question references any more (best
   * effort). Files copied into an event's Module B are kept: candidates of
   * that process still play them.
   */
  async removeUnusedAudio(previousQuestions, currentQuestions) {
    if (!this.audioStorage) return;
    const inUse = audioPaths(currentQuestions);
    for (const event of (await this.eventRepo?.findAll()) || []) {
      for (const path of audioPaths(event.moduleB?.macrocase?.questions)) inUse.add(path);
    }
    for (const path of audioPaths(previousQuestions)) {
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
