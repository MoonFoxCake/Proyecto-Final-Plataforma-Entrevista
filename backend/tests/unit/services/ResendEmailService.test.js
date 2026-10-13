const ResendEmailService = require('../../../src/services/ResendEmailService');

const candidate = { nombreCompleto: 'María <Demo>', correo: 'maria@example.com' };
const event = { name: 'Concurso Presencial', position: 'Analista' };
const appointment = {
  venue: 'Campus Central',
  room: 'Edificio T2, aula 204',
  startsAt: new Date('2026-11-05T14:00:00.000Z'), // 8:00 a. m. in Guatemala
  endsAt: new Date('2026-11-05T16:00:00.000Z'),
  instructions: 'Llegar 15 minutos antes.',
};

describe('ResendEmailService', () => {
  let fetchMock;
  const service = new ResendEmailService({ apiKey: 're_test', from: 'NexoPerfil <test@example.com>' });

  beforeEach(() => {
    fetchMock = jest.fn(async () => ({ ok: true, json: async () => ({ id: 'email-1', last_event: 'delivered' }) }));
    global.fetch = fetchMock;
  });

  afterEach(() => { delete global.fetch; });

  test('an onsite citation has the appointment details and no link, password or code', async () => {
    await expect(service.sendCitation({ candidate, event, organization: { name: 'TechCorp' }, appointment })).resolves.toEqual({ id: 'email-1' });

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({ to: ['maria@example.com'], subject: 'Citación presencial · Concurso Presencial' });
    expect(body.html).toContain('María &lt;Demo&gt;');
    expect(body.html).toContain('Campus Central');
    expect(body.html).toContain('Edificio T2, aula 204');
    expect(body.html).toContain('Llegar 15 minutos antes.');
    expect(body.html).toMatch(/>8:00\sa\.\s?m\. a 10:00\sa\.\s?m\./);
    expect(body.html).not.toMatch(/href=|https?:\/\//i);
    expect(body.html).not.toMatch(/token|contraseña:|código:/i);
  });

  test('a Module B citation says it is the second stage', async () => {
    await service.sendCitation({ candidate, event, appointment, module: 'B' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.subject).toBe('Citación presencial · Segunda etapa · Concurso Presencial');
    expect(body.html).toContain('segunda etapa presencial');
  });

  test('reads the latest delivery event of a sent e-mail', async () => {
    await expect(service.getEmailStatus('email-1')).resolves.toEqual({ lastEvent: 'delivered' });
    expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails/email-1', { headers: { Authorization: 'Bearer re_test' } });
  });

  test('fails clearly without an API key', async () => {
    await expect(new ResendEmailService({}).sendCitation({ candidate, event, appointment })).rejects.toThrow('RESEND_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
