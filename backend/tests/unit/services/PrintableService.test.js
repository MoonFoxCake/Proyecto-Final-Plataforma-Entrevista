const PDFDocument = require('pdfkit');
const { PrintableService, cardLayout, PAPER_SIZES } = require('../../../src/services/PrintableService');

const appointment = {
  venue: 'Campus Central', room: 'Edificio T2, aula 204', startsAt: new Date('2026-11-05T14:00:00.000Z'), endsAt: new Date('2026-11-05T16:00:00.000Z'),
};
const card = (nombreCompleto, code) => ({
  nombreCompleto, module: 'A', code, expiresAt: new Date('2026-11-06T05:59:59.999Z'), appointment,
});
const pageCount = (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;

/** Captures every text drawn on the PDF, with its position and page. */
function captureText() {
  const original = PDFDocument.prototype.text;
  const drawn = [];
  const spy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function capture(text, x, y, options) {
    if (typeof text === 'string') drawn.push({ text, x, y, options, page: this._pageBuffer?.length ?? 0 });
    return original.call(this, text, x, y, options);
  });
  return { drawn, restore: () => spy.mockRestore() };
}

describe('access cards', () => {
  test.each(Object.keys(PAPER_SIZES))('%s: 8 cards per page, every card fully inside its page', (paper) => {
    const layout = cardLayout(paper, 20);
    const [pageWidth, pageHeight] = PAPER_SIZES[paper];
    expect(layout).toMatchObject({ perPage: 8, pages: 3 });
    for (const { x, y } of layout.positions) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + layout.width).toBeLessThanOrEqual(pageWidth + 0.01);
      expect(y + layout.height).toBeLessThanOrEqual(pageHeight + 0.01);
    }
    // No two cards overlap on the same page.
    const keys = layout.positions.map(({ page, x, y }) => `${page}:${x}:${y}`);
    expect(new Set(keys).size).toBe(20);
  });

  test('renders one card per code in the given order, with name, event, code and instructions', async () => {
    const capture = captureText();
    const items = [card('Ana López', 'K7M2P-9QX4R'), card('Bruno Díaz', 'HT3NW-8BZ6E')];
    const pdf = await new PrintableService().accessCards({ eventName: 'Concurso Presencial', items });
    capture.restore();

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
    const texts = capture.drawn.map((item) => item.text);
    expect(texts.indexOf('Ana López')).toBeLessThan(texts.indexOf('Bruno Díaz'));
    expect(texts).toEqual(expect.arrayContaining(['K7M2P-9QX4R', 'HT3NW-8BZ6E', 'Concurso Presencial', 'Módulo A · Cuestionario', 'Campus Central · Edificio T2, aula 204']));
    expect(texts.some((text) => text.startsWith('1. Entrega esta tarjeta'))).toBe(true);
    // The code is printed in a clear monospaced type, large.
    expect(capture.drawn.find((item) => item.text === 'K7M2P-9QX4R').options).toMatchObject({ align: 'center' });
  });

  test('a long name is kept whole on two lines, and no text can overflow the card', async () => {
    const capture = captureText();
    const longName = 'María José Rodríguez Velásquez de Castañeda Hernández';
    await new PrintableService().accessCards({ eventName: 'Concurso Presencial', items: [card(longName, 'AAAAA-BBBBB')], paper: 'A4' });
    capture.restore();

    const name = capture.drawn.find((item) => item.text === longName);
    expect(name.options.lineBreak).not.toBe(false);
    expect(name.options.height).toBeGreaterThan(20);
    // Every other line is a single, clipped line.
    for (const item of capture.drawn.filter((entry) => entry.text !== longName)) {
      expect(item.options).toMatchObject({ lineBreak: false, ellipsis: true });
    }
  });

  test('20 candidates make 3 pages', async () => {
    const items = Array.from({ length: 20 }, (_, index) => card(`Candidato ${String(index).padStart(2, '0')}`, 'AAAAA-BBBBB'));
    expect(pageCount(await new PrintableService().accessCards({ eventName: 'Evento', items }))).toBe(3);
  });
});

describe('attendance list', () => {
  const rows = (count) => Array.from({ length: count }, (_, index) => ({
    nombreCompleto: `Candidato ${String(index + 1).padStart(2, '0')}`, cedula: `10000000${index + 1}`, appointmentAt: appointment.startsAt,
  }));

  test('lists name, cédula and appointment time with blank cells to mark attendance, and never codes', async () => {
    const capture = captureText();
    const pdf = await new PrintableService().attendanceList({ eventName: 'Concurso Presencial', module: 'A', session: appointment, rows: rows(3) });
    capture.restore();

    expect(pageCount(pdf)).toBe(1);
    const texts = capture.drawn.map((item) => item.text);
    expect(texts).toEqual(expect.arrayContaining(['Lista de asistencia', 'Nombre', 'Cédula', 'Hora de cita', 'Asistencia', 'Firma', 'Candidato 01', '100000001', '8:00 a. m.']));
    expect(texts.join(' ')).not.toMatch(/[A-Z2-9]{5}-[A-Z2-9]{5}/);
  });

  test('continues on new pages with the header repeated and page numbers', async () => {
    const capture = captureText();
    const pdf = await new PrintableService().attendanceList({ eventName: 'Evento', module: 'A', session: appointment, rows: rows(60) });
    capture.restore();

    expect(pageCount(pdf)).toBeGreaterThan(1);
    const pages = pageCount(pdf);
    expect(capture.drawn.filter((item) => item.text === 'Lista de asistencia')).toHaveLength(pages);
    expect(capture.drawn.some((item) => item.text.includes(`Página ${pages} de ${pages}`))).toBe(true);
  });

  test('shows the day too when candidates were cited to different days', async () => {
    const capture = captureText();
    await new PrintableService().attendanceList({
      eventName: 'Evento', module: 'B', rows: [
        { nombreCompleto: 'Ana', cedula: '1', appointmentAt: new Date('2026-11-20T15:00:00.000Z') },
        { nombreCompleto: 'Bruno', cedula: '2', appointmentAt: new Date('2026-11-21T15:00:00.000Z') },
      ],
    });
    capture.restore();
    expect(capture.drawn.map((item) => item.text)).toEqual(expect.arrayContaining(['20/11 9:00 a. m.', '21/11 9:00 a. m.']));
  });
});
