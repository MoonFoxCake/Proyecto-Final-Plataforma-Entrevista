import { advanceMacrocase, finalizeMacrocase, getMacrocaseStage } from '../../../services/invitationService.js';

/**
 * A "source" drives Module B one stage at a time:
 *   getStage() → current stage · advance(action) → next stage · finalize() → submission result
 *
 * Stages have the shape the backend returns (`backend/src/utils/macrocase.js`
 * → `stageView`): `{ state, step: 'intro'|'narrative'|'question'|'review',
 * macrocase, progress, section?, question?, draft?, timer?, summary?, serverNow }`.
 */

/** Real invitation: the backend keeps the progress and enforces the rules. */
export function createRemoteMacrocaseSource(token) {
  return {
    getStage: () => getMacrocaseStage(token),
    advance: (action) => advanceMacrocase(token, action),
    finalize: () => finalizeMacrocase(token),
  };
}

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
const publicAudio = (audio = {}) => ({ audioUrl: audio.audioUrl || '', visemes: audio.visemes || [] });

const OPTIONS_PER_QUESTION = 4;
const completeQuestion = (question) => question.text?.trim()
  && (question.options || []).filter((option) => option.text?.trim()).length === OPTIONS_PER_QUESTION;

/** Sections a candidate would get: with narrative and at least one complete question (text and four options). */
export function usableSections(macrocase) {
  return [...(macrocase.sections || [])].sort(byOrder)
    .map((section) => ({ ...section, questions: [...(section.questions || [])].sort(byOrder).filter(completeQuestion) }))
    .filter((section) => section.narrative?.trim() && section.questions.length);
}

/** A random order of the options, like each candidate gets. */
function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * Admin preview: the same stages as a real invitation, kept in memory.
 * Nothing is saved or sent.
 */
export function createLocalMacrocaseSource(macrocase) {
  const sections = usableSections(macrocase);
  const timeLimit = Number(macrocase.defaultTimeLimit) > 0 ? Math.round(Number(macrocase.defaultTimeLimit)) : 0;
  const totalQuestions = sections.reduce((total, section) => total + section.questions.length, 0);
  let progress = { step: 'intro', sectionIndex: 0, questionIndex: 0, answers: [], draft: null, timerStartedAt: null };
  const optionOrder = new Map(sections.flatMap((section) => section.questions).map((question) => [question.id, shuffle(question.options)]));

  const view = () => {
    const section = sections[progress.sectionIndex];
    const stage = {
      state: 'VALID',
      step: progress.step,
      macrocase: {
        name: macrocase.name,
        description: macrocase.description || '',
        instructions: macrocase.instructions || '',
        responseType: 'choice',
        defaultTimeLimit: timeLimit,
        totalSections: sections.length,
        totalQuestions,
      },
      progress: {
        sectionIndex: progress.sectionIndex,
        totalSections: sections.length,
        questionIndex: progress.questionIndex,
        sectionQuestions: section?.questions.length ?? 0,
        answered: progress.answers.length,
        totalQuestions,
      },
      serverNow: new Date().toISOString(),
    };
    if (progress.step === 'narrative') {
      stage.section = {
        id: section.id, order: progress.sectionIndex + 1, title: section.title || '', narrative: section.narrative, narrativeAudio: publicAudio(section.narrativeAudio),
      };
    }
    if (progress.step === 'question') {
      const question = section.questions[progress.questionIndex];
      stage.section = { id: section.id, order: progress.sectionIndex + 1, title: section.title || '' };
      stage.question = {
        id: question.id,
        order: progress.questionIndex + 1,
        text: question.text,
        ...publicAudio(question),
        options: optionOrder.get(question.id).map((option) => ({ id: option.id, text: option.text, ...publicAudio(option) })),
      };
      stage.draft = progress.draft;
      stage.timer = { limitSeconds: timeLimit, startedAt: progress.timerStartedAt };
    }
    if (progress.step === 'review') {
      stage.summary = sections.map((item, index) => {
        const answers = progress.answers.filter((answer) => answer.sectionId === item.id);
        return {
          sectionId: item.id, order: index + 1, title: item.title || '', total: item.questions.length, answered: answers.length, timedOut: answers.filter((answer) => answer.timedOut).length,
        };
      });
    }
    return stage;
  };

  const advance = (action) => {
    const section = sections[progress.sectionIndex];
    const question = progress.step === 'question' ? section.questions[progress.questionIndex] : null;
    if (action.type === 'START' && progress.step === 'intro') {
      progress = { ...progress, step: 'narrative' };
    } else if (action.type === 'FINISH_NARRATIVE' && progress.step === 'narrative' && action.sectionId === section.id) {
      progress = { ...progress, step: 'question', questionIndex: 0, draft: null, timerStartedAt: null };
    } else if (action.type === 'START_TIMER' && question?.id === action.questionId && timeLimit && !progress.timerStartedAt) {
      progress = { ...progress, timerStartedAt: new Date().toISOString() };
    } else if (action.type === 'SAVE_DRAFT' && question?.id === action.questionId) {
      if (!question.options.some((option) => option.id === action.value)) throw new Error('Selecciona una de las opciones.');
      progress = { ...progress, draft: action.value };
    } else if (action.type === 'ANSWER' && question?.id === action.questionId) {
      const value = action.value;
      const elapsed = progress.timerStartedAt ? Date.now() - new Date(progress.timerStartedAt).getTime() : 0;
      const timedOut = Boolean(timeLimit && progress.timerStartedAt && ((action.timedOut && elapsed >= timeLimit * 1000) || elapsed > timeLimit * 1000 + 5000));
      if (!question.options.some((option) => option.id === value) && !(value === null && timedOut)) throw new Error('Selecciona una opción para continuar.');
      const answers = [...progress.answers, { sectionId: section.id, questionId: question.id, value, ...(timedOut ? { timedOut: true } : {}) }];
      const next = progress.questionIndex + 1 < section.questions.length
        ? { step: 'question', questionIndex: progress.questionIndex + 1 }
        : progress.sectionIndex + 1 < sections.length
          ? { step: 'narrative', sectionIndex: progress.sectionIndex + 1, questionIndex: 0 }
          : { step: 'review' };
      progress = { ...progress, ...next, answers, draft: null, timerStartedAt: null };
    }
    return view();
  };

  return {
    getStage: async () => view(),
    advance: async (action) => advance(action),
    finalize: async () => {
      console.info('Respuestas del Módulo B (vista previa, no se envían):', progress.answers);
      return { state: 'COMPLETED', submittedAt: new Date().toISOString() };
    },
  };
}
