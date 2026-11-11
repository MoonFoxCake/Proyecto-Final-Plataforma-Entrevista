import { advanceTimed, finalizeEvaluation, getTimedState } from '../../services/invitationService.js';

/** The real evaluation: the server keeps the clock and the answers. */
export function createRemoteTimedSource(token) {
  return {
    state: () => getTimedState(token),
    action: (action) => advanceTimed(token, action),
    finish: () => finalizeEvaluation(token),
  };
}

/** Preview for administrators: same screens, nothing is stored. */
export function createLocalTimedSource(microcase) {
  const limitSeconds = Math.max(1, Number(microcase?.timeLimitMinutes || 15)) * 60;
  const questions = microcase?.questions || [];
  let progress = { step: 'intro', answers: [], startedAt: null };
  const view = () => ({
    state: 'VALID',
    step: progress.step,
    answers: progress.answers,
    questionIndex: progress.answers.length,
    totalQuestions: questions.length,
    limitSeconds,
    remainingSeconds: progress.startedAt ? Math.max(0, Math.ceil(limitSeconds - (Date.now() - progress.startedAt) / 1000)) : limitSeconds,
  });
  return {
    state: async () => view(),
    action: async (action) => {
      if (action.type === 'START') progress = { ...progress, step: microcase.story ? 'story' : 'questions', startedAt: Date.now() };
      if (action.type === 'STORY_DONE') progress = { ...progress, step: 'questions' };
      if (action.type === 'ANSWER') {
        const answers = [...progress.answers, { questionId: action.questionId, value: action.value }];
        progress = { ...progress, answers, step: answers.length === questions.length ? 'review' : 'questions' };
      }
      return view();
    },
    finish: async () => ({ state: 'COMPLETED', submittedAt: new Date().toISOString() }),
  };
}

/** A Module A question group with a time limit, in the shape the timed screens expect. */
export function instrumentAsTimedEvaluation(questionnaire) {
  return {
    name: 'Cuestionario',
    story: '',
    timeLimitMinutes: questionnaire.timeLimitMinutes,
    questions: questionnaire.questions.map((question) => ({
      questionId: question.id,
      sectionTitle: 'Cuestionario',
      question: question.text,
    })),
  };
}
