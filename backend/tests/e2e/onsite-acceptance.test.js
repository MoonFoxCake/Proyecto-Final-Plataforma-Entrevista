/**
 * Phase 9 acceptance scenario (task.md §9), through the HTTP API exactly as
 * the frontend uses it: the real Express app, routes, validation and
 * permissions, with in-memory repositories. Firebase Auth is replaced (the
 * Bearer token is the uid) and the Resend API is intercepted (no e-mail is
 * sent). Steps share state and run in order.
 */
const request = require('supertest');

jest.mock('../../src/config/firebase', () => ({
  admin: {},
  db: {},
  auth: { verifyIdToken: jest.fn(async (token) => ({ uid: token })) },
}));

const createApp = require('../../src/app');
const { createContainer } = require('../../src/container');

jest.setTimeout(60_000);

const API = '/api/v1';
const LAB_IP = '203.0.113.10'; // the whole room behind one public IP
const LIKERT = (seed) => [1, 2, 3, 4].map((number) => ({ questionId: `demo-a-${number}`, value: ((seed + number) % 5) + 1 }));
const CODE_PATTERN = /[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}/;

const binary = (res, done) => {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};
const pdfPages = (buffer) => (buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length;

describe('Phase 9 · onsite evaluation, end to end', () => {
  const sentEmails = [];
  const state = {};
  let container;
  let app;

  const as = (uid) => ({ Authorization: `Bearer ${uid}` });
  const company = (method, path, body) => request(app)[method](`${API}${path}`).set(as('company-1')).send(body);
  const candidatePc = (index) => ({ 'X-Onsite-Client': `lab-pc-${String(index).padStart(2, '0')}`, 'X-Forwarded-For': LAB_IP });
  const login = (codigo, headers) => request(app).post(`${API}/onsite/access`).set(headers).send({ codigo });
  // Whether any code actually issued in this scenario appears in `text`.
  const containsIssuedCode = (text) => [...Object.values(state.codes || {}), ...(state.extraCodes || [])]
    .some((code) => text.includes(code) || text.includes(code.replace('-', '')));

  beforeAll(async () => {
    process.env.ACCESS_CODE_PEPPER = 'acceptance-test-pepper-0123456789abcdef';
    process.env.RESEND_API_KEY = 're_acceptance';
    process.env.FRONTEND_URL = 'https://nexo.example.test';
    // Resend API: record what would be sent; report every e-mail delivered.
    global.fetch = jest.fn(async (url, options = {}) => {
      if (options.method === 'POST') {
        const email = JSON.parse(options.body);
        sentEmails.push(email);
        return { ok: true, json: async () => ({ id: `email-${sentEmails.length}` }) };
      }
      return { ok: true, json: async () => ({ last_event: 'delivered' }) };
    });

    container = createContainer('memory');
    container.onsiteAccessService.sleep = async () => {};
    container.invitationService.sleep = async () => {};
    const { repos } = container;
    const org1 = await repos.organizationRepo.create({ companyName: 'TechCorp', name: 'TechCorp' });
    const org2 = await repos.organizationRepo.create({ companyName: 'OtraEmpresa', name: 'OtraEmpresa' });
    await repos.userRepo.create({ uid: 'company-1', role: 'company', orgId: org1.id });
    await repos.userRepo.create({ uid: 'applicator-1', role: 'company', orgId: org1.id });
    await repos.userRepo.create({ uid: 'company-2', role: 'company', orgId: org2.id });
    await repos.userRepo.create({ uid: 'admin-1', role: 'admin', orgId: null });
    app = createApp(container);
  });

  afterAll(() => {
    delete global.fetch;
    delete process.env.ACCESS_CODE_PEPPER;
    delete process.env.RESEND_API_KEY;
    delete process.env.FRONTEND_URL;
  });

  test('1. creates an onsite event with venue, schedule and modules', async () => {
    const startsAt = new Date();
    const response = await company('post', '/events', {
      nombre: 'Concurso Analista 2026',
      puesto: 'Analista financiero',
      modalidad: 'presencial',
      incluirModuloB: true,
      presencial: {
        sede: 'Campus Central',
        ubicacion: 'Edificio T2, aula 204',
        fechaHoraInicio: startsAt.toISOString(),
        fechaHoraFin: new Date(startsAt.getTime() + 3 * 3600000).toISOString(),
        indicaciones: 'Presentarse 15 minutos antes con documento de identidad.',
      },
    });
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ modality: 'onsite', modules: ['A', 'B'], onsite: { venue: 'Campus Central', room: 'Edificio T2, aula 204' } });
    state.eventId = response.body.data.id;

    // Missing data is rejected.
    const invalid = await company('post', '/events', { nombre: 'Sin sede', puesto: 'X', modalidad: 'presencial', presencial: { sede: '', ubicacion: '', fechaHoraInicio: startsAt.toISOString(), fechaHoraFin: startsAt.toISOString() } });
    expect(invalid.status).toBe(400);
  });

  test('2. registers 20 test candidates', async () => {
    state.candidates = [];
    for (let index = 1; index <= 20; index += 1) {
      const response = await company('post', `/events/${state.eventId}/candidates`, {
        nombreCompleto: `Candidato ${String(index).padStart(2, '0')} Prueba`,
        cedula: `CED-${1000 + index}`,
        correo: `candidato${index}@example.test`,
      });
      expect(response.status).toBe(201);
      state.candidates.push(response.body.data);
    }
    expect((await company('get', `/events/${state.eventId}/candidates`)).body.data).toHaveLength(20);
  });

  test('6. sends citations that carry no credentials, links or codes', async () => {
    const response = await company('post', `/events/${state.eventId}/invitations/publish`);
    expect(response.body.data).toMatchObject({ total: 20, sent: 20, failed: 0 });
    expect(sentEmails).toHaveLength(20);
    for (const email of sentEmails) {
      expect(email.subject).toBe('Citación presencial · Concurso Analista 2026');
      expect(email.html).toContain('Campus Central');
      expect(email.html).toContain('Edificio T2, aula 204');
      expect(email.html).not.toMatch(/href=|https?:\/\/|token/i);
      expect(email.html).not.toMatch(CODE_PATTERN);
    }
    // No access exists yet: citations create no invitation.
    expect(container.repos.invitationRepo.data).toEqual([]);

    const status = await company('post', `/events/${state.eventId}/citations/status`);
    expect(status.body.data).toEqual({ checked: 20, failed: 0 });
    const candidates = (await company('get', `/events/${state.eventId}/candidates`)).body.data;
    expect(candidates.every((candidate) => candidate.status === 'CITED' && candidate.citation.delivery.status === 'delivered')).toBe(true);
  });

  test('3 & 4. issues the 20 credentials in batch, with the cards PDF only in that response', async () => {
    const ids = state.candidates.map((candidate) => candidate.id);
    const response = await company('post', `/events/${state.eventId}/credentials`, { modulo: 'A', candidateIds: ids, papel: 'CARTA' });
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const { issued, cardsPdf } = response.body.data;
    expect(issued).toHaveLength(20);
    expect(new Set(issued.map((item) => item.code)).size).toBe(20);
    expect(issued.map((item) => item.nombreCompleto)).toEqual([...issued.map((item) => item.nombreCompleto)].sort((a, b) => a.localeCompare(b, 'es')));
    state.codes = Object.fromEntries(issued.map((item) => [item.candidateId, item.code]));

    const pdf = Buffer.from(cardsPdf.base64, 'base64');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfPages(pdf)).toBe(3); // 8 cards per page

    // Codes are never stored or shown again.
    const stored = JSON.stringify(container.repos.accessCredentialRepo.data);
    for (const code of Object.values(state.codes)) expect(stored).not.toContain(code);
    const summary = await company('get', `/events/${state.eventId}/credentials`);
    expect(summary.body.data.modules[0].counts).toMatchObject({ total: 20, prepared: 20, pending: 0 });
    expect(containsIssuedCode(JSON.stringify(summary.body))).toBe(false);

    // Repeating the batch regenerates nothing.
    const again = await company('post', `/events/${state.eventId}/credentials`, { modulo: 'A', candidateIds: ids });
    expect(again.body.data).toMatchObject({ issued: [], rejected: [] });
    expect(again.body.data.skipped).toHaveLength(20);
  });

  test('5. downloads the attendance list (no codes)', async () => {
    const response = await request(app).get(`${API}/events/${state.eventId}/credentials/attendance.pdf?modulo=A`).set(as('company-1')).buffer(true).parse(binary);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdfPages(response.body)).toBeGreaterThanOrEqual(1);
  });

  test('7. a generated code that was not enabled does not let anyone in', async () => {
    const response = await login(state.codes[state.candidates[0].id], candidatePc(1));
    expect(response.body.data).toEqual({ state: 'NOT_ENABLED' });
  });

  test('8. the applicator verifies identity, marks attendance and enables one by one', async () => {
    const roster = await request(app).get(`${API}/events/${state.eventId}/onsite?modulo=A`).set(as('applicator-1'));
    expect(roster.body.data.rows).toHaveLength(20);
    expect(roster.body.data.rows[0]).toMatchObject({ cedula: 'CED-1001', credential: { status: 'GENERATED' } });

    const first = state.candidates[0];
    const marked = await request(app).post(`${API}/events/${state.eventId}/onsite/attendance`).set(as('applicator-1')).send({ modulo: 'A', candidateId: first.id, presente: true });
    expect(marked.body.data).toMatchObject({ status: 'PRESENT', markedBy: 'applicator-1' });
    const enabled = await request(app).post(`${API}/events/${state.eventId}/onsite/enable`).set(as('applicator-1')).send({ modulo: 'A', candidateIds: [first.id] });
    expect(enabled.body.data.enabled).toHaveLength(1);
  });

  test('9. enables several verified candidates at once, never the absent ones', async () => {
    // 18 more arrive; candidate 20 is absent.
    for (const candidate of state.candidates.slice(1, 19)) {
      await request(app).post(`${API}/events/${state.eventId}/onsite/attendance`).set(as('applicator-1')).send({ modulo: 'A', candidateId: candidate.id, presente: true });
    }
    const response = await request(app).post(`${API}/events/${state.eventId}/onsite/enable`).set(as('applicator-1')).send({ modulo: 'A', candidateIds: state.candidates.map((candidate) => candidate.id) });
    expect(response.body.data.enabled).toHaveLength(18);
    expect(response.body.data.skipped.map((item) => item.reason).sort()).toEqual(['no está marcado como presente', 'su acceso ya está habilitado']);
    const absent = state.candidates[19];
    const roster = await request(app).get(`${API}/events/${state.eventId}/onsite?modulo=A`).set(as('company-1'));
    expect(roster.body.data.rows.find((row) => row.candidateId === absent.id).credential.status).toBe('GENERATED');
    expect(roster.body.data.counts).toMatchObject({ present: 19, enabled: 19 });
  });

  test('10 & 15. 18 candidates start at the same time on different computers; answers stay isolated', async () => {
    const group = state.candidates.slice(0, 18);
    const sessions = await Promise.all(group.map((candidate, index) => login(state.codes[candidate.id], candidatePc(index + 1))));
    expect(sessions.map((response) => response.body.data.state)).toEqual(Array(18).fill('VALID'));
    sessions.forEach((response, index) => expect(response.body.data.candidate.nombreCompleto).toBe(group[index].nombreCompleto));
    state.tokens = Object.fromEntries(group.map((candidate, index) => [candidate.id, sessions[index].body.data.token]));

    const submissions = await Promise.all(group.map((candidate, index) => request(app).post(`${API}/invitations/access/submit`).send({ token: state.tokens[candidate.id], answers: LIKERT(index) })));
    expect(submissions.map((response) => response.body.data.state)).toEqual(Array(18).fill('COMPLETED'));

    const stored = container.repos.invitationRepo.submissions;
    expect(stored).toHaveLength(18);
    group.forEach((candidate, index) => {
      expect(stored.find((submission) => submission.candidateId === candidate.id).answers).toEqual(LIKERT(index));
    });
    // A session cannot be used to send someone else's evaluation again.
    const replay = await request(app).post(`${API}/invitations/access/submit`).send({ token: state.tokens[group[0].id], answers: LIKERT(99) });
    expect(replay.body.data.state).toBe('COMPLETED');
    expect(container.repos.invitationRepo.submissions).toHaveLength(18);
  });

  test('11. a consumed code cannot be reused', async () => {
    const response = await login(state.codes[state.candidates[0].id], candidatePc(30));
    expect(response.body.data).toEqual({ state: 'USED' });
  });

  test('12. wrong codes and repeated failed attempts are limited', async () => {
    const attacker = { 'X-Onsite-Client': 'unknown-browser-1', 'X-Forwarded-For': '198.51.100.66' };
    for (const wrong of ['AAAAA-AAAAA', 'hola', '', 'ZZZZZ-ZZZZZ', 'K7M2P-9QX4R']) {
      expect((await login(wrong, attacker)).body.data).toEqual({ state: 'INVALID' });
    }
    const blocked = await login(state.codes[state.candidates[18].id], attacker);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // The room's IP is not affected by someone else's mistakes.
    expect((await login('AAAAA-AAAAA', candidatePc(40))).status).toBe(200);
  });

  test('13. revokes and reissues a lost card', async () => {
    const candidate = state.candidates[18];
    const roster = await request(app).get(`${API}/events/${state.eventId}/onsite?modulo=A`).set(as('company-1'));
    const credentialId = roster.body.data.rows.find((row) => row.candidateId === candidate.id).credential.id;

    const reissued = await company('post', `/events/${state.eventId}/credentials/${credentialId}/reissue`, { motivo: 'Tarjeta extraviada' });
    expect(reissued.status).toBe(201);
    const newCode = reissued.body.data.issued[0].code;
    state.extraCodes = [newCode];
    expect(reissued.body.data.cardsPdf).toBeTruthy();
    expect((await login(state.codes[candidate.id], candidatePc(19))).body.data).toEqual({ state: 'REVOKED' });

    await request(app).post(`${API}/events/${state.eventId}/onsite/enable`).set(as('applicator-1')).send({ modulo: 'A', candidateIds: [candidate.id] });
    const session = await login(newCode, candidatePc(19));
    expect(session.body.data.state).toBe('VALID');
    await request(app).post(`${API}/invitations/access/submit`).send({ token: session.body.data.token, answers: LIKERT(18) });

    const actions = (await container.repos.auditLogRepo.findByEvent(state.eventId)).map((entry) => entry.action);
    expect(actions).toEqual(expect.arrayContaining(['CREDENTIAL_ISSUED', 'CREDENTIAL_REVOKED', 'CREDENTIAL_REISSUED', 'CREDENTIAL_ENABLED', 'ATTENDANCE_MARKED', 'ONSITE_SESSION_STARTED']));
    expect(containsIssuedCode(JSON.stringify(container.repos.auditLogRepo.data))).toBe(false);
  });

  test('16. another organization shares no credentials or data', async () => {
    const own = await request(app).post(`${API}/events`).set(as('company-2')).send({
      nombre: 'Evento de otra empresa', puesto: 'Contador', modalidad: 'presencial',
      presencial: { sede: 'Sede 2', ubicacion: 'Sala 1', fechaHoraInicio: new Date().toISOString(), fechaHoraFin: new Date(Date.now() + 3600000).toISOString() },
    });
    const otherEventId = own.body.data.id;
    const asOther = (method, path, body) => request(app)[method](`${API}${path}`).set(as('company-2')).send(body);

    expect((await asOther('get', `/events/${state.eventId}`)).status).toBe(404);
    expect((await asOther('get', `/events/${state.eventId}/candidates`)).status).toBe(404);
    expect((await asOther('get', `/events/${state.eventId}/credentials`)).status).toBe(404);
    expect((await asOther('get', `/events/${state.eventId}/onsite?modulo=A`)).status).toBe(404);
    expect((await asOther('post', `/events/${state.eventId}/onsite/enable`, { modulo: 'A', candidateIds: [state.candidates[19].id] })).status).toBe(404);
    // Its own event cannot reach our candidates either.
    expect((await asOther('post', `/events/${otherEventId}/credentials`, { modulo: 'A', candidateIds: [state.candidates[19].id] })).status).toBe(400);
    expect((await asOther('get', `/events/${otherEventId}/credentials`)).body.data.modules[0].rows).toEqual([]);
    expect((await asOther('get', '/events')).body.data.map((event) => event.id)).toEqual([otherEventId]);
  });

  test('17. administrative evaluators see no personal data of the candidates', async () => {
    const process = await request(app).get(`${API}/admin/processes/${state.eventId}`).set(as('admin-1'));
    expect(process.status).toBe(200);
    state.anonymousIds = process.body.data.participants.map((participant) => participant.anonymousId);
    expect(state.anonymousIds[0]).toMatch(/^P-\d{3}$/);

    const participant = await request(app).get(`${API}/admin/processes/${state.eventId}/participants/${state.anonymousIds[0]}`).set(as('admin-1'));
    const outputs = JSON.stringify([process.body, participant.body]);
    expect(outputs).not.toMatch(/Candidato \d\d Prueba|CED-10\d\d|@example\.test|attendance|citation|applicator-1|lab-pc/);
    // Companies cannot use the admin review.
    expect((await request(app).get(`${API}/admin/processes/${state.eventId}`).set(as('company-1'))).status).toBe(403);
  });

  test('18 & 14. Module B by sections, onsite: narration per section, answers, interruption and resume, final submission', async () => {
    // The admin reviews everyone who answered Module A and publishes; the absent candidate never answered.
    const process = (await request(app).get(`${API}/admin/processes/${state.eventId}`).set(as('admin-1'))).body.data;
    for (const participant of process.participants.filter((item) => item.status !== 'NO_RESPONSE')) {
      await request(app).patch(`${API}/admin/processes/${state.eventId}/participants/${participant.anonymousId}`).set(as('admin-1')).send({ observations: 'Revisado', reviewed: true });
    }
    // Absent candidate 20 is rescheduled out of this process (D10 keeps their code unused).
    await container.repos.candidateRepo.update(state.candidates[19].id, { eventId: 'otro-proceso' });
    expect((await request(app).post(`${API}/admin/processes/${state.eventId}/publish`).set(as('admin-1'))).status).toBe(200);

    // Macrocase bank: three sections.
    const macrocase = await request(app).post(`${API}/macrocasos`).set(as('admin-1')).send({
      name: 'Caperucita', description: 'Demo', instructions: 'Lee cada parte.', maxCharacters: 300, defaultTimeLimit: 0, active: true,
      sections: [
        { title: 'El encargo', narrative: 'Había una vez una niña.', questions: [{ text: '¿Qué le recomendaría?' }, { text: '¿Qué haría la madre?' }] },
        { title: 'El bosque', narrative: 'El lobo apareció.', questions: [{ text: '¿Qué haría usted?' }] },
        { title: 'La casa', narrative: 'La abuela no estaba.', questions: [{ text: '¿Y ahora?' }] },
      ],
    });
    expect(macrocase.status).toBe(201);

    const candidate = state.candidates[0];
    const startsAt = new Date();
    const cited = await company('post', `/events/${state.eventId}/module-b/invitations`, {
      candidateIds: [candidate.id],
      citacion: { sede: 'Campus Norte', ubicacion: 'Sala 3', fechaHoraInicio: startsAt.toISOString(), fechaHoraFin: new Date(startsAt.getTime() + 7200000).toISOString() },
    });
    expect(cited.body.data).toMatchObject({ sent: 1 });
    expect(sentEmails.at(-1).subject).toContain('Segunda etapa');
    expect(sentEmails.at(-1).html).not.toMatch(/href=|https?:\/\/|token/i);

    const issued = await company('post', `/events/${state.eventId}/credentials`, { modulo: 'B', candidateIds: [candidate.id] });
    const codeB = issued.body.data.issued[0].code;
    await request(app).post(`${API}/events/${state.eventId}/onsite/attendance`).set(as('applicator-1')).send({ modulo: 'B', candidateId: candidate.id, presente: true });
    await request(app).post(`${API}/events/${state.eventId}/onsite/enable`).set(as('applicator-1')).send({ modulo: 'B', candidateIds: [candidate.id] });

    const session = await login(codeB, candidatePc(1));
    expect(session.body.data).toMatchObject({ state: 'VALID', module: 'B', macrocase: { totalSections: 3, totalQuestions: 4 } });
    const token = session.body.data.token;
    const advance = (action) => request(app).post(`${API}/invitations/access/macrocase/advance`).send({ token, action }).then((res) => res.body.data);
    const stage = () => request(app).post(`${API}/invitations/access/macrocase/stage`).send({ token }).then((res) => res.body.data);

    let current = await advance({ type: 'START' });
    expect(current).toMatchObject({ step: 'narrative', section: { title: 'El encargo', narrative: 'Había una vez una niña.' } });
    current = await advance({ type: 'FINISH_NARRATIVE', sectionId: current.section.id });
    expect(current.section).not.toHaveProperty('narrative');
    current = await advance({ type: 'ANSWER', questionId: current.question.id, text: 'Ir por el camino principal' });
    await advance({ type: 'SAVE_DRAFT', questionId: current.question.id, text: 'Que la acompañe' });

    // 14. The connection drops; on reconnecting the same stage and draft come back.
    expect(await stage()).toMatchObject({ step: 'question', question: { text: '¿Qué haría la madre?' }, draft: 'Que la acompañe', progress: { answered: 1 } });

    // Then the browser closes: the supervisor recovers the session on the same computer.
    const roster = await request(app).get(`${API}/events/${state.eventId}/onsite?modulo=B`).set(as('applicator-1'));
    const credentialId = roster.body.data.rows[0].credential.id;
    const recovered = await company('post', `/events/${state.eventId}/credentials/${credentialId}/reissue`, { motivo: 'Se cerró el navegador' });
    const recoveryCode = recovered.body.data.issued[0].code;
    expect((await stage()).state).toBe('CANCELLED');
    await request(app).post(`${API}/events/${state.eventId}/onsite/enable`).set(as('applicator-1')).send({ modulo: 'B', candidateIds: [candidate.id] });
    expect((await login(recoveryCode, candidatePc(7))).body.data).toEqual({ state: 'OTHER_COMPUTER' });
    const resumed = await login(recoveryCode, candidatePc(1));
    const resumedToken = resumed.body.data.token;
    const go = (action) => request(app).post(`${API}/invitations/access/macrocase/advance`).send({ token: resumedToken, action }).then((res) => res.body.data);

    current = (await request(app).post(`${API}/invitations/access/macrocase/stage`).send({ token: resumedToken })).body.data;
    expect(current).toMatchObject({ question: { text: '¿Qué haría la madre?' }, draft: 'Que la acompañe' });
    current = await go({ type: 'ANSWER', questionId: current.question.id, text: 'Que la acompañe' });
    for (const answer of ['Buscaría ayuda', 'Llamaría a los leñadores']) {
      expect(current.step).toBe('narrative');
      current = await go({ type: 'FINISH_NARRATIVE', sectionId: current.section.id });
      current = await go({ type: 'ANSWER', questionId: current.question.id, text: answer });
    }
    expect(current).toMatchObject({ step: 'review', progress: { answered: 4 } });

    const final = await request(app).post(`${API}/invitations/access/submit`).send({ token: resumedToken, finalize: true });
    expect(final.body.data).toMatchObject({ state: 'COMPLETED', alreadySubmitted: false });
    const moduleB = container.repos.invitationRepo.submissions.filter((submission) => submission.module === 'B');
    expect(moduleB).toHaveLength(1);
    expect(moduleB[0]).toMatchObject({ instrumentVersion: expect.stringMatching(/^MACROCASE:.+:v2$/) });
    expect(moduleB[0].answers.map((answer) => answer.sectionTitle)).toEqual(['El encargo', 'El encargo', 'El bosque', 'La casa']);

    // The admin reviews the answers grouped by section, still anonymously.
    const anonymousId = (await request(app).get(`${API}/admin/processes/${state.eventId}`).set(as('admin-1'))).body.data.participants
      .find((participant) => participant.moduleBStatus === 'COMPLETED').anonymousId;
    const review = (await request(app).get(`${API}/admin/processes/${state.eventId}/participants/${anonymousId}`).set(as('admin-1'))).body.data;
    expect(review.moduleB.sections.map((section) => [section.title, section.answers.length])).toEqual([['El encargo', 2], ['El bosque', 1], ['La casa', 1]]);
    expect(JSON.stringify(review)).not.toContain(candidate.nombreCompleto);
  });

  test('19. the online (link) flow still works', async () => {
    const event = await company('post', '/events', { nombre: 'Proceso virtual', puesto: 'Analista', fechaHoraHabilitacion: new Date(Date.now() - 60000).toISOString() });
    expect(event.body.data.modality).toBe('online');
    const candidate = (await company('post', `/events/${event.body.data.id}/candidates`, { nombreCompleto: 'Virtual Uno', cedula: 'V-1', correo: 'virtual@example.test' })).body.data;
    expect((await company('post', `/events/${event.body.data.id}/invitations/publish`)).body.data).toMatchObject({ sent: 1 });

    const link = /href='([^']+)'/.exec(sentEmails.at(-1).html)[1];
    const token = new URL(link).searchParams.get('token');
    expect((await request(app).get(`${API}/invitations/access`).query({ token })).body.data).toMatchObject({ state: 'VALID', module: 'A' });
    expect((await request(app).post(`${API}/invitations/access/submit`).send({ token, answers: LIKERT(1) })).body.data.state).toBe('COMPLETED');
    expect((await company('get', `/events/${event.body.data.id}/candidates`)).body.data[0]).toMatchObject({ id: candidate.id, status: 'EVALUATION_COMPLETED' });
    // An onsite code cannot open a virtual evaluation, nor a link an onsite one.
    expect((await login(state.codes[state.candidates[1].id], candidatePc(2))).body.data.state).toBe('USED');
  });
});
