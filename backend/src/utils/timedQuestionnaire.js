const { ValidationError } = require('./errors');

/**
 * Stage machine of the Likert evaluations with a total time limit (Module C,
 * and Module A when its question group sets one). The server owns the clock:
 * reloading or reopening the page never restarts it, and each answer is
 * stored as it is given, so whatever was answered survives the deadline.
 *
 * A definition is `{ limitSeconds, hasStory, questions: [{ id }] }`.
 */

const STEPS = Object.freeze({
  INTRO: 'intro',
  STORY: 'story',
  QUESTIONS: 'questions',
  REVIEW: 'review',
});

// The browser reports the end a moment after its countdown hits zero (and
// the clocks may differ slightly), so allow some slack around the deadline.
const GRACE_MS = 5000;

const validLikert = (value) => Number.isInteger(value) && value >= 1 && value <= 5;

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value?.toDate?.() ?? value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function initialProgress() {
  return { step: STEPS.INTRO, answers: [], startedAt: null };
}

/** Whether the time ran out, `graceMs` after (or, if negative, before) the deadline. */
function isExpired(definition, progress, now, graceMs = 0) {
  const startedAt = toDate(progress?.startedAt);
  if (!definition.limitSeconds || !startedAt) return false;
  return now.getTime() - startedAt.getTime() >= definition.limitSeconds * 1000 + graceMs;
}

/**
 * Applies one candidate action. Forward-only: an action aimed at a stage the
 * candidate already left changes nothing, and nothing changes after the
 * deadline.
 *
 * @throws {ValidationError} for invalid Likert selections
 */
function applyAction(definition, progress, action, now = new Date()) {
  const current = progress || initialProgress();
  if (isExpired(definition, current, now, GRACE_MS)) return current;

  switch (action.type) {
    case 'START':
      if (current.step !== STEPS.INTRO) return current;
      return { ...current, step: definition.hasStory ? STEPS.STORY : STEPS.QUESTIONS, startedAt: now };

    case 'STORY_DONE':
      if (current.step !== STEPS.STORY) return current;
      return { ...current, step: STEPS.QUESTIONS };

    case 'ANSWER': {
      if (current.step !== STEPS.QUESTIONS) return current;
      const question = definition.questions[current.answers.length];
      if (!question || question.id !== action.questionId) return current;
      if (!validLikert(action.value)) throw new ValidationError('Selecciona una opción de la escala Likert (1 a 5).');
      const answers = [...current.answers, { questionId: question.id, value: action.value, answeredAt: now }];
      return { ...current, answers, step: answers.length === definition.questions.length ? STEPS.REVIEW : STEPS.QUESTIONS };
    }

    default:
      throw new ValidationError('Acción no reconocida.');
  }
}

/** What the candidate's browser needs to resume exactly where it was. */
function stateView(definition, progress, now = new Date()) {
  const current = progress || initialProgress();
  const startedAt = toDate(current.startedAt);
  const elapsedSeconds = startedAt ? (now.getTime() - startedAt.getTime()) / 1000 : 0;
  return {
    state: 'VALID',
    step: current.step,
    answers: current.answers.map(({ questionId, value }) => ({ questionId, value })),
    questionIndex: current.answers.length,
    totalQuestions: definition.questions.length,
    limitSeconds: definition.limitSeconds,
    remainingSeconds: definition.limitSeconds
      ? Math.max(0, Math.ceil(definition.limitSeconds - elapsedSeconds))
      : null,
  };
}

/** The evaluation can be closed: everything was answered, or the time is over. */
function canFinish(definition, progress, now = new Date()) {
  return progress?.step === STEPS.REVIEW || isExpired(definition, progress, now, -GRACE_MS);
}

module.exports = { STEPS, GRACE_MS, initialProgress, isExpired, applyAction, stateView, canFinish };
