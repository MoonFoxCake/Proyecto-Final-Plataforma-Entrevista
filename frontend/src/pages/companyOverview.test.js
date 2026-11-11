import {
  nextStep, overviewFigures, pendingTasks, phaseFunnel, recentResults, upcomingDates,
} from './companyOverview.js';

const NOW = new Date('2026-11-11T12:00:00Z');
const hours = (value) => new Date(NOW.getTime() + value * 3600e3).toISOString();

// Virtual process: A delivered, B sent to two (one answered), closing tomorrow.
const virtual = {
  event: { id: 'v1', name: 'Virtual', modality: 'online', modules: ['A', 'B'], availableFrom: hours(-48), availableUntil: hours(-1), moduleResults: { A: { deliveredAt: hours(-5) } } },
  candidates: [
    { id: 'c1', status: 'EVALUATION_COMPLETED', submittedAt: hours(-30), moduleB: { status: 'COMPLETED' } },
    { id: 'c2', status: 'EVALUATION_COMPLETED', submittedAt: hours(-30), moduleB: { status: 'INVITATION_SENT', accessWindow: { opensAt: hours(-2), closesAt: hours(20) } } },
    { id: 'c3', status: 'EVALUATION_COMPLETED', submittedAt: hours(-30) },
    { id: 'c4', status: 'WITHDRAWN' },
  ],
};
// A new process: A delivered, B not sent yet.
const ready = {
  event: { id: 'r1', name: 'Listo', modality: 'online', modules: ['A', 'B'], availableUntil: hours(-1), moduleResults: { A: { deliveredAt: hours(-1) } } },
  candidates: [{ id: 'd1', status: 'EVALUATION_COMPLETED', submittedAt: hours(-10) }],
};
// Registered candidates who were never invited.
const draft = { event: { id: 'n1', name: 'Nuevo', modality: 'online', modules: ['A'], availableUntil: hours(72) }, candidates: [{ id: 'e1', status: 'INVITED_PENDING' }] };
// Onsite with an upcoming session.
const onsite = { event: { id: 'o1', name: 'Presencial', modality: 'onsite', modules: ['A'], onsite: { startsAt: hours(30), endsAt: hours(32) } }, candidates: [{ id: 'f1', status: 'CITED' }] };
const groups = [virtual, ready, draft, onsite];

test('pending tasks: closing links first, then reports to act on, invitations and open phases', () => {
  const titles = pendingTasks(groups, NOW).map((task) => task.title);
  expect(titles).toEqual([
    'Virtual: el enlace de la Fase B cierra pronto',
    'Listo: recibiste el PDF de la Fase A',
    'Nuevo: 1 candidato sin convocar',
    'Virtual: Fase B con 1 sin responder',
  ]);
  expect(pendingTasks(groups, NOW)[1].to).toBe('/company/events/r1/resultados');
});

test('the next step of each process', () => {
  expect(nextStep(virtual.event, virtual.candidates).label).toBe('Fase B en curso · 1 de 2 respondieron');
  expect(nextStep(ready.event, ready.candidates).label).toBe('Elige quién continúa a la Fase B');
  expect(nextStep(draft.event, draft.candidates).label).toBe('Envía las invitaciones de la Fase A');
  expect(nextStep(onsite.event, []).label).toBe('Agrega a los candidatos');
  const complete = { ...virtual.event, moduleResults: { A: { deliveredAt: hours(-5) }, B: { deliveredAt: hours(-1) } } };
  expect(nextStep(complete, virtual.candidates).label).toBe('Proceso completo: todos los resultados entregados');
  // A finished process no longer counts as active.
  expect(overviewFigures([{ event: complete, candidates: virtual.candidates }], NOW).activeProcesses).toBe(0);
  expect(nextStep({ ...virtual.event }, virtual.candidates.slice(0, 1)).label).toBe('Fase B terminada · esperando su PDF de resultados');
});

test('headline figures count evaluated candidates, received reports and links open right now', () => {
  expect(overviewFigures(groups, NOW)).toEqual({
    activeProcesses: 4, totalProcesses: 4, evaluated: 4, totalCandidates: 7, reports: 2, openLinks: 1,
  });
});

test('the funnel tells how many continued from the previous phase', () => {
  expect(phaseFunnel(groups)).toEqual([
    { module: 'A', completed: 4, invited: 6, passRate: null },
    { module: 'B', completed: 1, invited: 2, passRate: 67 },
  ]);
});

test('recent results and upcoming dates, soonest first', () => {
  expect(recentResults(groups).map((item) => item.key)).toEqual(['r1-A', 'v1-A']);
  const dates = upcomingDates(groups, NOW);
  expect(dates.map((item) => [item.name, item.kind])).toEqual([['Virtual', 'closing'], ['Presencial', 'session']]);
  expect(dates[0].pending).toBe(1);
});
