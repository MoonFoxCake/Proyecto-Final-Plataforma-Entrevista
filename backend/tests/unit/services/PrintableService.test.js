const PDFDocument = require('pdfkit');
const { PrintableService, sheetLayout, PAPER_SIZES, FOLD_TOLERANCE } = require('../../../src/services/PrintableService');

const appointment = {
  venue: 'Campus Central', room: 'Edificio T2, aula 204', startsAt: new Date('2026-11-05T14:00:00.000Z'), endsAt: new Date('2026-11-05T16:00:00.000Z'),
};
const card = (nombreCompleto, code, module = 'A') => ({
  nombreCompleto, module, code, expiresAt: new Date('2026-11-06T05:59:59.999Z'), appointment,
});
const pageCount = (pdf) => (pdf.toString('latin1').match(/\/Type \/Page\b/g) || []).length;

/** Captures every text drawn on the PDF, with its position, font, size and page. */
function captureText() {
  const original = PDFDocument.prototype.text;
  const originalAddPage = PDFDocument.prototype.addPage;
  const drawn = [];
  const pages = jest.spyOn(PDFDocument.prototype, 'addPage').mockImplementation(function count(...args) {
    this.capturedPages = (this.capturedPages || 0) + 1;
    return originalAddPage.apply(this, args);
  });
  const spy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function capture(text, x, y, options) {
    if (typeof text === 'string') {
      drawn.push({ text, x, y, options, page: this.capturedPages, font: this._font?.name, size: this._fontSize });
    }
    return original.call(this, text, x, y, options);
  });
  return { drawn, restore: () => { spy.mockRestore(); pages.mockRestore(); } };
}

const render = async (items, paper = 'CARTA') => {
  const capture = captureText();
  const pdf = await new PrintableService().accessCards({ eventName: 'Concurso Presencial', items, paper });
  capture.restore();
  return { pdf, drawn: capture.drawn };
};

describe('access sheets', () => {
  describe.each(Object.keys(PAPER_SIZES))('%s', (paper) => {
    const layout = sheetLayout(paper);
    const [pageWidth, pageHeight] = PAPER_SIZES[paper];

    test('one fold at two thirds: the bottom third covers exactly the middle one', () => {
      expect(layout.foldY).toBeCloseTo((pageHeight * 2) / 3);
      expect(layout.coverTop).toBeCloseTo(pageHeight / 3);
      expect(layout.code.bottom).toBeLessThanOrEqual(pageHeight);
    });

    test.each([-1, -0.5, 0, 0.5, 1])('folded %s × tolerance off the marks, the name shows and the code stays inside', (offset) => {
      const fold = layout.foldY + offset * FOLD_TOLERANCE;
      const visibleBottom = 2 * fold - pageHeight; // the flap edge
      // The whole name band is above the flap edge...
      expect(layout.name.bottom).toBeLessThanOrEqual(visibleBottom);
      // ...and the whole code zone is on the flap, so it ends up face down on the middle third.
      expect(layout.code.top).toBeGreaterThan(fold);
      const landsFrom = 2 * fold - layout.code.bottom;
      const landsTo = 2 * fold - layout.code.top;
      expect(landsFrom).toBeGreaterThan(layout.name.bottom);
      expect(landsTo).toBeLessThan(fold);
    });

    test('names in the top band, codes below the fold, nothing in the middle but the fold marks', async () => {
      const items = [card('Ana López', 'K7M2P-9QX4R'), card('María José Rodríguez Velásquez de Castañeda Hernández', 'HT3NW-8BZ6E')];
      const { pdf, drawn } = await render(items, paper);

      expect(pageCount(pdf)).toBe(2);
      for (const [index, item] of items.entries()) {
        const page = drawn.filter((entry) => entry.page === index + 1);
        const name = page.find((entry) => entry.text === item.nombreCompleto);
        expect(name.y).toBe(layout.name.top);
        expect(name.y + name.options.height).toBeLessThanOrEqual(layout.name.bottom);
        const code = page.find((entry) => entry.text === item.code);
        expect(code.y).toBeGreaterThanOrEqual(layout.code.top);
        expect(code).toMatchObject({ font: 'Courier-Bold', size: 38 });
        // The code is printed only once, and only on the flap.
        expect(drawn.filter((entry) => entry.text.includes(item.code))).toHaveLength(1);
        for (const entry of page.filter((other) => other.y > layout.name.bottom && other.y < layout.foldY)) {
          expect(entry.text).toBe('doblar');
          expect(entry.x < SHEET_SIDE || entry.x + entry.options.width > pageWidth - SHEET_SIDE).toBe(true);
        }
      }
    });
  });

  // Side margin of the sheet: the fold marks stay inside it.
  const SHEET_SIDE = 54;

  test('one page per participant, in the given order, with the steps and the expiry', async () => {
    const items = Array.from({ length: 20 }, (_, index) => card(`Candidato ${String(index + 1).padStart(2, '0')}`, `AAAAA-${String(index).padStart(5, '2')}`));
    const { pdf, drawn } = await render(items);

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(20);
    const names = drawn.filter((entry) => entry.text.startsWith('Candidato '));
    expect(names.map((entry) => [entry.text, entry.page])).toEqual(items.map((item, index) => [item.nombreCompleto, index + 1]));
    const texts = drawn.filter((entry) => entry.page === 1).map((entry) => entry.text);
    expect(texts).toEqual(expect.arrayContaining([
      'NexoPerfil — Acceso a evaluación presencial',
      'Código de acceso',
      '1. Abre esta hoja cuando el aplicador te indique.',
      '2. Introduce el código en la computadora asignada.',
      '3. Este código es personal y de un solo uso.',
    ]));
    expect(texts.some((text) => text.startsWith('Vence el '))).toBe(true);
  });

  test('never shows the module, the event session or personal data', async () => {
    const { drawn: moduleA } = await render([card('Ana López', 'K7M2P-9QX4R', 'A')]);
    const { drawn: moduleB } = await render([card('Ana López', 'K7M2P-9QX4R', 'B')]);

    // Same sheet whichever module the code opens.
    expect(moduleB.map((entry) => entry.text)).toEqual(moduleA.map((entry) => entry.text));
    const all = moduleA.map((entry) => entry.text).join(' ');
    expect(all).not.toMatch(/m[oó]dulo|cuestionario|macrocaso/i);
    expect(all).not.toMatch(/Campus Central|aula 204/);
  });

  test('the PDF metadata does not name the module', async () => {
    const pdf = await new PrintableService({ compress: false }).accessCards({ eventName: 'Concurso Presencial', items: [card('Ana López', 'K7M2P-9QX4R', 'B')] });
    expect(pdf.toString('latin1')).not.toMatch(/M.?[oó].?d.?u.?l.?o|Macrocaso|Cuestionario/i);
  });

  test('a short name is large; a long one is smaller, whole and inside its band', async () => {
    const longName = 'María Fernanda de los Ángeles Rodríguez Velásquez de Castañeda Hernández y Ordóñez';
    const { drawn } = await render([card('Ana López', 'AAAAA-BBBBB'), card(longName, 'CCCCC-DDDDD')], 'A4');
    const layout = sheetLayout('A4');

    const short = drawn.find((entry) => entry.text === 'Ana López');
    const long = drawn.find((entry) => entry.text === longName);
    expect(short.size).toBe(32);
    expect(long.size).toBeLessThanOrEqual(32);
    expect(long.options.lineBreak).not.toBe(false);
    expect(long.y + long.options.height).toBeLessThanOrEqual(layout.name.bottom);
    // Every other text is a single, clipped line.
    for (const entry of drawn.filter((item) => ![longName, 'Ana López'].includes(item.text))) {
      expect(entry.options).toMatchObject({ lineBreak: false });
    }
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
