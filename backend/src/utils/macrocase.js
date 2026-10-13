const { ValidationError } = require('./errors');

/**
 * Macrocase content model (v2) and Module B stage machine.
 *
 * A macrocase is a list of ordered sections; each one has a narrative text
 * and one or more open questions:
 *
 *   { schemaVersion: 2, name, description, instructions, maxCharacters,
 *     defaultTimeLimit, sections: [{ id, order, title, narrative,
 *     narrativeAudio?, questions: [{ id, order, text, audioUrl, visemes … }] }] }
 *
 * Documents saved before sections existed (`introduction` + flat
 * `questions`) are read as a single section, so neither the bank nor the
 * copies already stored in events need a migration.
 */

const MACROCASE_SCHEMA_VERSION = 2;

// The browser reports the timeout a moment after the countdown hits zero
// (and the server clock may differ slightly), so allow some slack.
const TIMER_GRACE_MS = 5000;

const STEPS = Object.freeze({
  INTRO: 'intro',
  NARRATIVE: 'narrative',
  QUESTION: 'question',
  REVIEW: 'review',
});

const ACTIONS = Object.freeze({
  START: 'START',
  FINISH_NARRATIVE: 'FINISH_NARRATIVE',
  START_TIMER: 'START_TIMER',
  SAVE_DRAFT: 'SAVE_DRAFT',
  ANSWER: 'ANSWER',
});

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);

/** Reads any stored macrocase (v1 or v2) as a sectioned one. */
function toSectionedMacrocase(macrocase) {
  if (!macrocase) return macrocase;
  const { introduction, questions, ...rest } = macrocase;
  if (Array.isArray(macrocase.sections)) {
    return { ...rest, instructions: rest.instructions || '', schemaVersion: MACROCASE_SCHEMA_VERSION };
  }
  return {
    ...rest,
    schemaVersion: MACROCASE_SCHEMA_VERSION,
    instructions: rest.instructions || '',
    sections: [{
      id: 'section-1',
      order: 1,
      title: '',
      narrative: introduction || '',
      questions: questions || [],
    }],
  };
}

function orderedSections(macrocase) {
  return [...(macrocase.sections || [])].sort(byOrder).map((section) => ({
    ...section,
    questions: [...(section.questions || [])].sort(byOrder),
  }));
}

/** Every question of the macrocase, in order, tagged with its section. */
function allQuestions(macrocase) {
  return orderedSections(macrocase).flatMap((section) => section.questions.map((question) => ({
    ...question, sectionId: section.id, sectionTitle: section.title || '',
  })));
}

/** Storage paths of every audio file (narratives and questions) of a macrocase. */
function macrocaseAudioPaths(macrocase) {
  if (!macrocase) return new Set();
  const sectioned = toSectionedMacrocase(macrocase);
  const paths = [];
  for (const section of sectioned.sections || []) {
    if (section.narrativeAudio?.audioPath) paths.push(section.narrativeAudio.audioPath);
    for (const question of section.questions || []) {
      if (question.audioPath) paths.push(question.audioPath);
    }
  }
  return new Set(paths);
}

function timeLimitOf(macrocase) {
  const seconds = Number(macrocase.defaultTimeLimit);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
}

function characterLimitOf(macrocase) {
  const limit = Number(macrocase.maxCharacters);
  return limit > 0 ? limit : Infinity;
}

/** What the candidate may know before starting: no narrative and no question text. */
function publicOverview(macrocase) {
  const sections = orderedSections(macrocase);
  return {
    name: macrocase.name,
    description: macrocase.description || '',
    instructions: macrocase.instructions || '',
    maxCharacters: Number(macrocase.maxCharacters) > 0 ? Number(macrocase.maxCharacters) : 0,
    defaultTimeLimit: timeLimitOf(macrocase),
    totalSections: sections.length,
    totalQuestions: sections.reduce((total, section) => total + section.questions.length, 0),
  };
}

const publicAudio = (audio = {}) => ({ audioUrl: audio.audioUrl || '', visemes: audio.visemes || [] });

function initialProgress() {
  return {
    step: STEPS.INTRO,
    sectionIndex: 0,
    questionIndex: 0,
    answers: [],
    draft: null,
    timerStartedAt: null,
  };
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value?.toDate?.() ?? value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The single stage the candidate is on, with only the content that stage
 * needs: the narrative only while reading it, the question only while
 * answering it. Earlier sections are never sent again.
 */
function stageView(macrocase, progress, now = new Date()) {
  const sections = orderedSections(macrocase);
  const current = progress || initialProgress();
  const section = sections[current.sectionIndex];
  const view = {
    step: current.step,
    macrocase: publicOverview(macrocase),
    progress: {
      sectionIndex: current.sectionIndex,
      totalSections: sections.length,
      questionIndex: current.questionIndex,
      sectionQuestions: section?.questions.length ?? 0,
      answered: current.answers.length,
      totalQuestions: sections.reduce((total, item) => total + item.questions.length, 0),
    },
    serverNow: now,
  };

  if (current.step === STEPS.NARRATIVE) {
    view.section = {
      id: section.id,
      order: current.sectionIndex + 1,
      title: section.title || '',
      narrative: section.narrative || '',
      narrativeAudio: publicAudio(section.narrativeAudio),
    };
  }
  if (current.step === STEPS.QUESTION) {
    const question = section.questions[current.questionIndex];
    view.section = { id: section.id, order: current.sectionIndex + 1, title: section.title || '' };
    view.question = {
      id: question.id,
      order: current.questionIndex + 1,
      text: question.text,
      ...publicAudio(question),
    };
    view.draft = current.draft?.questionId === question.id ? current.draft.text : '';
    view.timer = { limitSeconds: timeLimitOf(macrocase), startedAt: toDate(current.timerStartedAt) };
  }
  if (current.step === STEPS.REVIEW) {
    const answered = new Map(current.answers.map((answer) => [answer.questionId, answer]));
    view.summary = sections.map((item, index) => ({
      sectionId: item.id,
      order: index + 1,
      title: item.title || '',
      total: item.questions.length,
      answered: item.questions.filter((question) => answered.has(question.id)).length,
      timedOut: item.questions.filter((question) => answered.get(question.id)?.timedOut).length,
    }));
  }
  return view;
}

/** Position after the question that was just answered. */
function nextPosition(sections, { sectionIndex, questionIndex }) {
  if (questionIndex + 1 < sections[sectionIndex].questions.length) {
    return { step: STEPS.QUESTION, sectionIndex, questionIndex: questionIndex + 1 };
  }
  if (sectionIndex + 1 < sections.length) {
    return { step: STEPS.NARRATIVE, sectionIndex: sectionIndex + 1, questionIndex: 0 };
  }
  return { step: STEPS.REVIEW, sectionIndex, questionIndex };
}

/**
 * Applies a candidate action to the stored progress and returns the new
 * progress. Forward-only: an action aimed at a stage the candidate already
 * left (a double click, a second tab, a retried request) changes nothing,
 * so an answer can never be rewritten and no stage can be skipped.
 *
 * @throws {ValidationError} only for invalid content (empty or too long answer)
 */
function applyAction(macrocase, progress, action, now = new Date()) {
  const sections = orderedSections(macrocase);
  if (!sections.length || sections.some((section) => !section.questions.length)) {
    throw new ValidationError('El macrocaso de este proceso no tiene preguntas.');
  }
  const current = progress || initialProgress();
  const section = sections[current.sectionIndex];
  const question = current.step === STEPS.QUESTION ? section.questions[current.questionIndex] : null;
  const limit = timeLimitOf(macrocase);

  switch (action.type) {
    case ACTIONS.START:
      if (current.step !== STEPS.INTRO) return current;
      return { ...current, step: STEPS.NARRATIVE, sectionIndex: 0, questionIndex: 0 };

    case ACTIONS.FINISH_NARRATIVE:
      if (current.step !== STEPS.NARRATIVE || action.sectionId !== section.id) return current;
      return { ...current, step: STEPS.QUESTION, questionIndex: 0, draft: null, timerStartedAt: null };

    case ACTIONS.START_TIMER:
      if (!question || action.questionId !== question.id || !limit || current.timerStartedAt) return current;
      return { ...current, timerStartedAt: now };

    case ACTIONS.SAVE_DRAFT: {
      if (!question || action.questionId !== question.id) return current;
      const text = String(action.text ?? '');
      if (text.trim().length > characterLimitOf(macrocase)) {
        throw new ValidationError(`La respuesta supera los ${characterLimitOf(macrocase)} caracteres.`);
      }
      return { ...current, draft: { questionId: question.id, text } };
    }

    case ACTIONS.ANSWER: {
      if (!question || action.questionId !== question.id) return current;
      const text = String(action.text ?? '').trim();
      if (text.length > characterLimitOf(macrocase)) {
        throw new ValidationError(`La respuesta supera los ${characterLimitOf(macrocase)} caracteres.`);
      }
      const startedAt = toDate(current.timerStartedAt);
      const elapsed = startedAt ? now.getTime() - startedAt.getTime() : 0;
      const timeIsUp = Boolean(limit && startedAt && elapsed >= limit * 1000 - TIMER_GRACE_MS);
      const lateAnswer = Boolean(limit && startedAt && elapsed > limit * 1000 + TIMER_GRACE_MS);
      const timedOut = (action.timedOut === true && timeIsUp) || lateAnswer;
      if (!text && !timedOut) {
        throw new ValidationError('Escribe una respuesta para continuar.');
      }
      const answer = {
        sectionId: section.id,
        questionId: question.id,
        text,
        answeredAt: now,
        ...(timedOut ? { timedOut: true } : {}),
      };
      return {
        ...current,
        ...nextPosition(sections, current),
        answers: [...current.answers, answer],
        draft: null,
        timerStartedAt: null,
      };
    }

    default:
      throw new ValidationError('Acción no reconocida.');
  }
}

/**
 * Answers to store with the final submission, in macrocase order and with
 * the section and question texts the candidate saw.
 *
 * @throws {ValidationError} if the candidate has not answered everything
 */
function finalAnswers(macrocase, progress) {
  const questions = allQuestions(macrocase);
  const byId = new Map((progress?.answers || []).map((answer) => [answer.questionId, answer]));
  if (progress?.step !== STEPS.REVIEW || questions.some((question) => !byId.has(question.id))) {
    throw new ValidationError('Debes responder todas las preguntas del macrocaso antes de enviarlo.');
  }
  return questions.map((question) => {
    const { text, timedOut } = byId.get(question.id);
    return {
      sectionId: question.sectionId,
      sectionTitle: question.sectionTitle,
      questionId: question.id,
      question: question.text,
      text,
      ...(timedOut ? { timedOut: true } : {}),
    };
  });
}

module.exports = {
  MACROCASE_SCHEMA_VERSION,
  TIMER_GRACE_MS,
  STEPS,
  ACTIONS,
  toSectionedMacrocase,
  orderedSections,
  allQuestions,
  macrocaseAudioPaths,
  publicOverview,
  initialProgress,
  stageView,
  applyAction,
  finalAnswers,
};
