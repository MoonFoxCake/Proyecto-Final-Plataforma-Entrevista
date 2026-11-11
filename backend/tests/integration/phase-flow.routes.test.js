const request = require('supertest');

// Firebase and Supabase are replaced; everything else is the real app with
// in-memory repositories. The Bearer token is the uid.
jest.mock('../../src/config/firebase', () => ({
  admin: {},
  db: {},
  auth: { verifyIdToken: jest.fn(async (token) => ({ uid: token })) },
}));
jest.mock('../../src/config/supabase', () => ({
  supabase: {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.test/result.pdf' }, error: null }),
      }),
    },
  },
}));

const createApp = require('../../src/app');
const { createContainer } = require('../../src/container');

const API = '/api/v1';

describe('evaluation phases, through the HTTP API', () => {
  let app;
  let container;
  let emails;
  let company;

  const as = (uid) => ({ Authorization: `Bearer ${uid}` });
  const asCompany = (method, path, body) => request(app)[method](`${API}${path}`).set(as(company)).send(body);
  const asAdmin = (method, path, body) => request(app)[method](`${API}${path}`).set(as('admin-1')).send(body);
  const tokenFor = (to) => [...emails].reverse().find((email) => email.to[0] === to && /token=/.test(email.html)).html.match(/token=([A-Za-z0-9_-]{43})/)[1];
  const deliver = (eventId, module) => request(app).post(`${API}/admin/results/${eventId}/${module}`).set(as('admin-1')).attach('pdf', Buffer.from('%PDF-1.4'), { filename: 'r.pdf', contentType: 'application/pdf' });
  const session = (minutes = 120) => {
    const start = new Date();
    return { sede: 'Campus', ubicacion: 'Aula', fechaHoraInicio: start.toISOString(), fechaHoraFin: new Date(start.getTime() + 180 * 60000).toISOString(), ventanaInicioMinutos: minutes };
  };
  const virtualEvent = (extra = {}) => asCompany('post', '/events', { nombre: 'Proceso', puesto: 'Analista', modalidad: 'virtual', fechaHoraHabilitacion: new Date(Date.now() - 60000).toISOString(), fechaHoraCierre: new Date(Date.now() + 7 * 864e5).toISOString(), incluirModuloB: true, incluirModuloC: true, ...extra });
  const addCandidate = async (eventId, name) => (await asCompany('post', `/events/${eventId}/candidates`, { nombreCompleto: name, cedula: name, correo: `${name}@example.test` })).body.data;

  const answerModuleA = async (token) => {
    const access = (await request(app).get(`${API}/invitations/access`).query({ token })).body.data;
    return request(app).post(`${API}/invitations/access/submit`).send({ token, answers: access.questionnaire.questions.map((question) => ({ questionId: question.id, value: 4 })) });
  };
  const runMacrocase = async (token) => {
    for (let step = 0; step < 20; step += 1) {
      const stage = (await request(app).post(`${API}/invitations/access/macrocase/stage`).send({ token })).body.data;
      if (stage.step === 'review') return request(app).post(`${API}/invitations/access/submit`).send({ token, finalize: true });
      const action = stage.step === 'intro' ? { type: 'START' }
        : stage.step === 'narrative' ? { type: 'FINISH_NARRATIVE', sectionId: stage.section.id }
          : { type: 'ANSWER', questionId: stage.question.id, value: stage.question.options[0].id };
      await request(app).post(`${API}/invitations/access/macrocase/advance`).send({ token, action });
    }
    throw new Error('El macrocaso no terminó.');
  };
  const timed = (token, action) => request(app).post(`${API}/invitations/access/timed/advance`).send({ token, action }).then((res) => res.body.data);
  const runMicrocase = async (token, questions) => {
    await timed(token, { type: 'START' });
    await timed(token, { type: 'STORY_DONE' });
    for (const question of questions) await timed(token, { type: 'ANSWER', questionId: question.questionId, value: 3 });
    return request(app).post(`${API}/invitations/access/submit`).send({ token, finalize: true });
  };
  const publishA = async (eventId) => {
    const report = await deliver(eventId, 'A');
    expect(report.status).toBe(200);
  };

  beforeEach(async () => {
    process.env.ACCESS_CODE_PEPPER = 'pepper-de-prueba-con-32-caracteres!!';
    process.env.RESEND_API_KEY = 're_test';
    process.env.FRONTEND_URL = 'https://app.test';
    emails = [];
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') emails.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ id: `email-${emails.length}` }) };
    });
    container = createContainer('memory');
    container.onsiteAccessService.sleep = async () => {};
    const { repos } = container;
    const org = await repos.organizationRepo.create({ companyName: 'TechCorp', email: 'rrhh@example.test', subscription: { planId: 'completo' } });
    company = 'company-1';
    await repos.userRepo.create({ uid: company, role: 'company', orgId: org.id });
    await repos.userRepo.create({ uid: 'admin-1', role: 'admin', orgId: null, adminAccess: 'owner', status: 'active' });
    await container.macrocaseService.createMacroCase({ name: 'Macro', defaultTimeLimit: 0, active: true, sections: [{ title: 'S1', narrative: 'Texto', questions: [{ text: 'P1', options: ['A', 'B', 'C', 'D'].map((text) => ({ text })) }] }] });
    const micro = await container.microcaseService.create({ name: 'Micro', story: 'Historia', timeLimitMinutes: 5, sections: [{ title: 'Habilidad 1', questions: [{ text: 'a1' }, { text: 'a2' }, { text: 'a3' }] }, { title: 'Habilidad 2', questions: [{ text: 'b1' }] }] });
    await container.microcaseService.setActive(micro.id, true);
    app = createApp(container);
  });

  afterEach(() => {
    delete global.fetch;
    delete process.env.ACCESS_CODE_PEPPER;
    delete process.env.RESEND_API_KEY;
    delete process.env.FRONTEND_URL;
  });

  test('the cases are drawn when the process is created, among the active ones', async () => {
    const event = (await virtualEvent()).body.data;
    expect(event.moduleB.macrocase.name).toBe('Macro');
    expect(event.moduleC.microcase.name).toBe('Micro');
    expect(event.moduleC.questions).toBeUndefined();
  });

  test('without an active case the process cannot be created', async () => {
    const [macrocase] = await container.macrocaseService.listMacroCases();
    await container.macrocaseService.deactivateMacroCase(macrocase.id);
    const response = await virtualEvent();
    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/macrocasos activos/);
  });

  test('virtual A, B and C: each phase opens only with the PDF of the previous one', async () => {
    const event = (await virtualEvent()).body.data;
    const [ana, beto] = [await addCandidate(event.id, 'ana'), await addCandidate(event.id, 'beto')];
    const ids = [ana.id, beto.id];
    await asCompany('post', `/events/${event.id}/invitations/publish`);
    for (const candidate of [ana, beto]) expect((await answerModuleA(tokenFor(candidate.correo))).body.data.state).toBe('COMPLETED');

    // Finished: the phase is waiting for its PDF, and the next one is closed.
    expect((await asAdmin('get', '/admin/results/pending')).body.data).toEqual([expect.objectContaining({ eventId: event.id, module: 'A', completed: 2 })]);
    expect((await asCompany('post', `/events/${event.id}/module-b/invitations`, { candidateIds: ids, ventana: { fechaHoraApertura: new Date(Date.now() - 60000).toISOString(), fechaHoraCierre: new Date(Date.now() + 3 * 864e5).toISOString() } })).status).toBe(400);

    await publishA(event.id);
    expect((await asCompany('get', `/events/${event.id}/results/A/download`)).body.data.url).toBe('https://storage.test/result.pdf');
    expect(emails.at(-1)).toMatchObject({ to: ['rrhh@example.test'], subject: expect.stringContaining('Resultado de Fase A') });

    expect((await asCompany('post', `/events/${event.id}/module-b/invitations`, { candidateIds: ids, ventana: { fechaHoraApertura: new Date(Date.now() - 60000).toISOString(), fechaHoraCierre: new Date(Date.now() + 3 * 864e5).toISOString() } })).body.data.sent).toBe(2);
    for (const candidate of [ana, beto]) expect((await runMacrocase(tokenFor(candidate.correo))).body.data.state).toBe('COMPLETED');

    const sections = event.moduleC.microcase.sections.map((section) => section.id);
    expect((await asCompany('put', `/events/${event.id}/module-c/configure`, { sectionIds: [sections[0]] })).status).toBe(200);
    expect((await asCompany('post', `/events/${event.id}/module-c/invitations`, { candidateIds: ids, ventana: { fechaHoraApertura: new Date(Date.now() - 60000).toISOString(), fechaHoraCierre: new Date(Date.now() + 3 * 864e5).toISOString() } })).status).toBe(400);
    expect((await deliver(event.id, 'B')).status).toBe(200);

    // Only the skills the company chose, and the same question for everyone.
    expect((await asCompany('post', `/events/${event.id}/module-c/invitations`, { candidateIds: ids, ventana: { fechaHoraApertura: new Date(Date.now() - 60000).toISOString(), fechaHoraCierre: new Date(Date.now() + 3 * 864e5).toISOString() } })).body.data.sent).toBe(2);
    const accesses = [];
    for (const candidate of [ana, beto]) accesses.push((await request(app).get(`${API}/invitations/access`).query({ token: tokenFor(candidate.correo) })).body.data);
    expect(accesses[0].microcase.questions).toHaveLength(1);
    expect(accesses[0].microcase.questions).toEqual(accesses[1].microcase.questions);

    // After the first send the skills are frozen.
    expect((await asCompany('put', `/events/${event.id}/module-c/configure`, { sectionIds: sections })).status).toBe(400);

    for (const [index, candidate] of [ana, beto].entries()) {
      expect((await runMicrocase(tokenFor(candidate.correo), accesses[index].microcase.questions)).body.data.state).toBe('COMPLETED');
    }
    const process = (await asAdmin('get', `/admin/processes/${event.id}`)).body.data;
    expect(process.participants[0].moduleCStatus).toBe('COMPLETED');
    const detail = (await asAdmin('get', `/admin/processes/${event.id}/participants/${process.participants[0].anonymousId}`)).body.data;
    expect(detail.moduleC.answers).toEqual([expect.objectContaining({ value: 3, label: 'Neutral' })]);

    expect((await deliver(event.id, 'C')).status).toBe(200);
    expect((await asAdmin('get', `/admin/processes/${event.id}`)).body.data.deliveredModules).toEqual(['A', 'B', 'C']);
  });

  test('onsite A, B and C with access codes', async () => {
    const event = (await asCompany('post', '/events', { nombre: 'Presencial', puesto: 'Analista', modalidad: 'presencial', incluirModuloB: true, incluirModuloC: true, presencial: session() })).body.data;
    const carla = await addCandidate(event.id, 'carla');
    const client = { 'X-Onsite-Client': 'lab-pc-0001' };
    const codeFor = async (modulo) => (await asCompany('post', `/events/${event.id}/credentials`, { modulo, candidateIds: [carla.id] })).body.data.issued[0].code;
    const login = async (codigo) => (await request(app).post(`${API}/onsite/access`).set(client).send({ codigo })).body.data;

    await asCompany('post', `/events/${event.id}/invitations/publish`);
    const accessA = await login(await codeFor('A'));
    await request(app).post(`${API}/invitations/access/submit`).send({ token: accessA.token, answers: accessA.questionnaire.questions.map((question) => ({ questionId: question.id, value: 2 })) });
    await publishA(event.id);

    expect((await asCompany('post', `/events/${event.id}/module-b/invitations`, { candidateIds: [carla.id], citacion: session() })).body.data.sent).toBe(1);
    const accessB = await login(await codeFor('B'));
    expect((await runMacrocase(accessB.token)).body.data.state).toBe('COMPLETED');
    expect((await deliver(event.id, 'B')).status).toBe(200);

    const sections = event.moduleC.microcase.sections.map((section) => section.id);
    await asCompany('put', `/events/${event.id}/module-c/configure`, { sectionIds: sections });
    expect((await asCompany('post', `/events/${event.id}/module-c/invitations`, { candidateIds: [carla.id], citacion: session() })).body.data.sent).toBe(1);
    expect((await asCompany('get', `/events/${event.id}/onsite?modulo=C`)).status).toBe(200);
    expect((await asCompany('get', `/events/${event.id}/credentials/attendance.pdf?modulo=C`)).status).toBe(200);

    const accessC = await login(await codeFor('C'));
    expect(accessC).toMatchObject({ state: 'VALID', module: 'C', microcase: { name: 'Micro' } });
    expect((await runMicrocase(accessC.token, accessC.microcase.questions)).body.data.state).toBe('COMPLETED');
    expect((await deliver(event.id, 'C')).status).toBe(200);
  });

  test('an absent candidate does not hold the phase back', async () => {
    const event = (await virtualEvent()).body.data;
    const [dani, eva] = [await addCandidate(event.id, 'dani'), await addCandidate(event.id, 'eva')];
    await asCompany('post', `/events/${event.id}/invitations/publish`);
    await answerModuleA(tokenFor(dani.correo));

    expect((await asAdmin('get', '/admin/results/pending')).body.data).toEqual([]);
    expect((await asCompany('post', `/events/${event.id}/candidates/${eva.id}/resend`)).body.data.sent).toBe(1);
    const closed = await asCompany('post', `/events/${event.id}/phases/A/close`);
    expect(closed.body.data).toMatchObject({ closed: 1, complete: true, withdrawn: 1 });

    // Their link stopped working, and the phase can be delivered.
    expect((await request(app).get(`${API}/invitations/access`).query({ token: tokenFor(eva.correo) })).body.data.state).toBe('CANCELLED');
    expect((await asAdmin('get', '/admin/results/pending')).body.data).toEqual([expect.objectContaining({ module: 'A', completed: 1, withdrawn: 1 })]);
    await publishA(event.id);
    const candidates = (await asCompany('get', `/events/${event.id}/candidates`)).body.data;
    expect(candidates.find((candidate) => candidate.id === dani.id).profileAvailable).toBe(true);
    expect(candidates.find((candidate) => candidate.id === eva.id).profileAvailable).toBe(false);
  });

  test('a phase nobody answered cannot be closed as finished', async () => {
    const event = (await virtualEvent()).body.data;
    await addCandidate(event.id, 'nadie');
    await asCompany('post', `/events/${event.id}/invitations/publish`);
    expect((await asCompany('post', `/events/${event.id}/phases/A/close`)).status).toBe(400);
  });

  describe('time limit', () => {
    const preparedForModuleC = async () => {
      const event = (await virtualEvent()).body.data;
      const ana = await addCandidate(event.id, 'ana');
      await asCompany('post', `/events/${event.id}/invitations/publish`);
      await answerModuleA(tokenFor(ana.correo));
      await publishA(event.id);
      await asCompany('post', `/events/${event.id}/module-b/invitations`, { candidateIds: [ana.id], ventana: { fechaHoraApertura: new Date(Date.now() - 60000).toISOString(), fechaHoraCierre: new Date(Date.now() + 3 * 864e5).toISOString() } });
      await runMacrocase(tokenFor(ana.correo));
      await deliver(event.id, 'B');
      const sections = event.moduleC.microcase.sections.map((section) => section.id);
      await asCompany('put', `/events/${event.id}/module-c/configure`, { sectionIds: sections });
      await asCompany('post', `/events/${event.id}/module-c/invitations`, { candidateIds: [ana.id], ventana: { fechaHoraApertura: new Date(Date.now() - 60000).toISOString(), fechaHoraCierre: new Date(Date.now() + 3 * 864e5).toISOString() } });
      const token = tokenFor(ana.correo);
      return { event, ana, token };
    };
    const elapse = (minutes) => {
      const later = new Date(Date.now() + minutes * 60000);
      container.invitationService.now = () => later;
    };

    test('reloading resumes with the time that was left', async () => {
      const { token } = await preparedForModuleC();
      await timed(token, { type: 'START' });
      elapse(2);
      const state = (await request(app).post(`${API}/invitations/access/timed/state`).send({ token })).body.data;
      expect(state.step).toBe('story');
      expect(state.remainingSeconds).toBeLessThanOrEqual(180);
      expect(state.remainingSeconds).toBeGreaterThan(170);
    });

    test('when the time runs out, what was answered is submitted', async () => {
      const { event, ana, token } = await preparedForModuleC();
      const { microcase } = (await request(app).get(`${API}/invitations/access`).query({ token })).body.data;
      await timed(token, { type: 'START' });
      await timed(token, { type: 'STORY_DONE' });
      await timed(token, { type: 'ANSWER', questionId: microcase.questions[0].questionId, value: 5 });
      // Not over yet: it cannot be closed with questions pending.
      expect((await request(app).post(`${API}/invitations/access/submit`).send({ token, finalize: true })).status).toBe(400);

      elapse(6);
      expect((await request(app).get(`${API}/invitations/access`).query({ token })).body.data.state).toBe('COMPLETED');
      expect((await container.repos.candidateRepo.findById(ana.id)).moduleC.status).toBe('COMPLETED');
      const submission = await container.repos.invitationRepo.findSubmissionByCandidate(ana.id, event.id, 'C');
      expect(submission.answers.map((answer) => answer.value)).toEqual([5, null]);
    });

    test('an answer after the deadline changes nothing', async () => {
      const { token } = await preparedForModuleC();
      const { microcase } = (await request(app).get(`${API}/invitations/access`).query({ token })).body.data;
      await timed(token, { type: 'START' });
      await timed(token, { type: 'STORY_DONE' });
      elapse(6);
      const result = await timed(token, { type: 'ANSWER', questionId: microcase.questions[0].questionId, value: 5 });
      expect(result.state).toBe('COMPLETED');
    });

    test('Module A with a time limit uses the same clock', async () => {
      const [group] = await container.questionBankService.list();
      await container.questionBankService.update(group.id, { name: group.name, description: group.description, baseVersion: group.version, questions: group.questions, timeLimitMinutes: 1 });
      const event = (await virtualEvent()).body.data;
      const ana = await addCandidate(event.id, 'ana');
      await asCompany('post', `/events/${event.id}/invitations/publish`);
      const token = tokenFor(ana.correo);
      const access = (await request(app).get(`${API}/invitations/access`).query({ token })).body.data;
      expect(access.questionnaire.timeLimitMinutes).toBe(1);
      // Answers cannot skip the clock.
      expect((await request(app).post(`${API}/invitations/access/submit`).send({ token, answers: access.questionnaire.questions.map((question) => ({ questionId: question.id, value: 4 })) })).status).toBe(400);
      await timed(token, { type: 'START' });
      await timed(token, { type: 'ANSWER', questionId: access.questionnaire.questions[0].id, value: 4 });
      elapse(2);
      expect((await request(app).post(`${API}/invitations/access/timed/state`).send({ token })).body.data.state).toBe('COMPLETED');
      const submission = await container.repos.invitationRepo.findSubmissionByCandidate(ana.id, event.id, 'A');
      expect(submission.answers.filter((answer) => answer.value === 4)).toHaveLength(1);
    });
  });

  test('settings: public content, protected editing and e-mail templates', async () => {
    const current = (await asAdmin('get', '/admin/settings')).body.data;
    expect((await asCompany('get', '/admin/settings')).status).toBe(403);
    const saved = await asAdmin('put', '/admin/settings', {
      ...current,
      landing: { ...current.landing, heroTitle: 'Título propio' },
      plans: { ...current.plans, completo: { ...current.plans.completo, price: '₡50.000' } },
      evaluation: { ...current.evaluation, defaultEntryWindowMinutes: 45 },
      emails: { ...current.emails, invitationSubject: 'Hola de {empresa} · {evento}' },
      notifications: { adminEmail: 'admin@example.test' },
    });
    expect(saved.status).toBe(200);
    // The opening and closing of the links are no longer an admin setting.
    expect(current.evaluation).toEqual({ defaultEntryWindowMinutes: 30 });
    expect((await asAdmin('put', '/admin/settings', { ...current, evaluation: { ...current.evaluation, moduleAValidityHours: 48 } })).status).toBe(400);

    const open = (await request(app).get(`${API}/public/settings`)).body.data;
    expect(open.landing.heroTitle).toBe('Título propio');
    expect(open.plans.completo.price).toBe('₡50.000');
    expect(open).not.toHaveProperty('emails');
    expect(open).not.toHaveProperty('notifications');

    const event = (await virtualEvent()).body.data;
    const ana = await addCandidate(event.id, 'ana');
    await asCompany('post', `/events/${event.id}/invitations/publish`);
    expect(emails.at(-1).subject).toBe('Hola de TechCorp · Proceso');

    // Finishing a phase tells the administrators, once.
    await answerModuleA(tokenFor(ana.correo));
    expect(emails.at(-1)).toMatchObject({ to: ['admin@example.test'], subject: 'Fase A lista para entrega · Proceso' });
  });

  test('the company sets when each virtual phase opens and closes', async () => {
    // Module A: the process needs its closing, after its opening.
    const missingClose = await asCompany('post', '/events', { nombre: 'P', puesto: 'Analista', modalidad: 'virtual', fechaHoraHabilitacion: new Date().toISOString() });
    expect(missingClose.status).toBe(400);
    const backwards = await asCompany('post', '/events', { nombre: 'P', puesto: 'Analista', modalidad: 'virtual', fechaHoraHabilitacion: new Date(Date.now() + 864e5).toISOString(), fechaHoraCierre: new Date().toISOString() });
    expect(backwards.status).toBe(400);

    const event = (await virtualEvent()).body.data;
    expect(new Date(event.availableUntil).getTime()).toBeGreaterThan(Date.now());
    const ana = await addCandidate(event.id, 'ana');
    await asCompany('post', `/events/${event.id}/invitations/publish`);
    const invitationA = container.repos.invitationRepo.data.find((item) => item.candidateId === ana.id);
    expect(new Date(invitationA.expiresAt).getTime()).toBe(new Date(event.availableUntil).getTime());
    await answerModuleA(tokenFor(ana.correo));
    await publishA(event.id);

    // Module B: its own opening and closing, required and checked.
    const url = `/events/${event.id}/module-b/invitations`;
    expect((await asCompany('post', url, { candidateIds: [ana.id] })).body.error.message).toMatch(/apertura y de cierre/);
    const closed = { fechaHoraApertura: new Date(Date.now() - 2 * 864e5).toISOString(), fechaHoraCierre: new Date(Date.now() - 864e5).toISOString() };
    expect((await asCompany('post', url, { candidateIds: [ana.id], ventana: closed })).body.error.message).toMatch(/fecha futura/);
    const opensAt = new Date(Date.now() + 2 * 3600e3);
    const closesAt = new Date(Date.now() + 5 * 3600e3);
    const ventana = { fechaHoraApertura: opensAt.toISOString(), fechaHoraCierre: closesAt.toISOString() };
    expect((await asCompany('post', url, { candidateIds: [ana.id], ventana })).body.data.sent).toBe(1);
    expect(emails.at(-1).html).toContain('Disponible desde');
    // Before its opening the link only says when it opens.
    const access = (await request(app).get(`${API}/invitations/access`).query({ token: tokenFor(ana.correo) })).body.data;
    expect(access.state).toBe('NOT_YET_AVAILABLE');
    expect(new Date(access.expiresAt).getTime()).toBe(closesAt.getTime());
  });

  test('a macrocase with invalid data is rejected', async () => {
    expect((await asAdmin('post', '/macrocasos', {})).status).toBe(400);
    expect((await asAdmin('post', '/macrocasos', { name: 'x', defaultTimeLimit: 'abc', sections: [] })).status).toBe(400);
  });

  test('public statistics include the processes', async () => {
    await virtualEvent();
    expect((await request(app).get(`${API}/public/stats`)).body.data.processes).toBe(1);
  });
});
