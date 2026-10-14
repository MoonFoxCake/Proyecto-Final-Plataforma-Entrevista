import { nextAction, summarize } from './eventState.js';

const onsite = { modality: 'onsite', modules: ['A', 'B'] };
const published = { ...onsite, status: 'PUBLISHED', evaluationsPublishedAt: '2026-11-10' };

test('suggests one next step for each moment of the event', () => {
  expect(nextAction(summarize(onsite, [])).to).toBe('candidatos?nuevo=1');
  expect(nextAction(summarize(onsite, [{ status: 'INVITED_PENDING' }]))).toMatchObject({ title: 'Envía las citaciones (1)', to: 'candidatos' });
  expect(nextAction(summarize({ modality: 'online' }, [{ status: 'INVITED_PENDING' }])).title).toBe('Publica las invitaciones (1)');

  const cited = summarize(onsite, [{ status: 'CITED', citation: { status: 'SENT' } }]);
  expect(nextAction(cited, { pendingAccesses: 1 }).to).toBe('presencial?etapa=preparar');
  expect(nextAction(cited, { onsiteToday: true }).to).toBe('presencial?etapa=aplicar');
  expect(nextAction(cited)).toMatchObject({ title: 'Evaluación en curso' });
  expect(nextAction(cited).to).toBeUndefined();

  expect(nextAction(summarize(onsite, [{ status: 'EVALUATION_COMPLETED' }])).title).toBe('En revisión');
  expect(nextAction(summarize(published, [{ status: 'EVALUATION_COMPLETED', profileAvailable: true }]))).toMatchObject({ title: 'Elige quiénes continúan al Módulo B', to: 'resultados' });
  expect(nextAction(summarize({ ...published, modules: ['A'] }, [{ status: 'EVALUATION_COMPLETED', profileAvailable: true }]))).toMatchObject({ title: 'Resultados publicados' });
});
