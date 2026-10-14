const PDFDocument = require('pdfkit');

/**
 * Printable documents for onsite evaluations, rendered in memory and never
 * stored: access cards (with codes, only at the moment they are issued) and
 * the attendance list (no codes).
 *
 * Standard PDF fonts are used (Helvetica / Courier): they cover Spanish
 * accents and need no font files.
 */

const POINTS_PER_INCH = 72;
// Sizes in points. "Carta" (US Letter) is the usual paper in Guatemala.
const PAPER_SIZES = Object.freeze({
  CARTA: [8.5 * POINTS_PER_INCH, 11 * POINTS_PER_INCH],
  A4: [595.28, 841.89],
});
const PAGE_MARGIN = 36; // 0.5 in
const CARD_COLUMNS = 2;
const CARD_ROWS = 4;
const CARD_PADDING = 14;

const TIME_ZONE = 'America/Guatemala';
const formatDate = (value) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'full', timeZone: TIME_ZONE }).format(new Date(value));
const formatShortDate = (value) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: TIME_ZONE }).format(new Date(value));
const formatTime = (value) => new Intl.DateTimeFormat('es-GT', { timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(value));

const MODULE_LABELS = { A: 'Módulo A · Cuestionario', B: 'Módulo B · Macrocaso' };

const COLORS = { ink: '#10233A', muted: '#56677B', accent: '#0A8F8A', line: '#94A3B8', soft: '#F4F8FB' };

const paperSize = (paper) => PAPER_SIZES[paper] || PAPER_SIZES.CARTA;

/**
 * Card grid: a fixed number of cards per page, each fully inside the
 * printable area, so no card is ever split across pages.
 *
 * @returns {{ perPage: number, pages: number, width: number, height: number,
 *   positions: Array<{ page: number, x: number, y: number }> }}
 */
function cardLayout(paper, count) {
  const [pageWidth, pageHeight] = paperSize(paper);
  const width = (pageWidth - 2 * PAGE_MARGIN) / CARD_COLUMNS;
  const height = (pageHeight - 2 * PAGE_MARGIN) / CARD_ROWS;
  const perPage = CARD_COLUMNS * CARD_ROWS;
  const positions = Array.from({ length: count }, (_, index) => {
    const slot = index % perPage;
    return {
      page: Math.floor(index / perPage),
      x: PAGE_MARGIN + (slot % CARD_COLUMNS) * width,
      y: PAGE_MARGIN + Math.floor(slot / CARD_COLUMNS) * height,
    };
  });
  return { perPage, pages: Math.ceil(count / perPage), width, height, positions, pageWidth, pageHeight };
}

/** Renders a PDFKit document into a Buffer. */
function render(options, draw) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ autoFirstPage: false, ...options });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      draw(doc);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

class PrintableService {
  /** @param {{ compress?: boolean }} [options] `compress: false` keeps the PDF text readable (tests). */
  constructor({ compress = true } = {}) {
    this.compress = compress;
  }

  /**
   * One card per issued credential, in the given order (alphabetical), with
   * dashed cutting guides. Holds the candidate's name, the event, the code,
   * the appointment and brief instructions — no ID number or other personal
   * data.
   *
   * @param {{ eventName: string, items: Array<{ nombreCompleto: string, module: 'A'|'B', code: string,
   *   expiresAt: Date, appointment?: { venue?: string, room?: string, startsAt?: Date, endsAt?: Date } }>,
   *   paper?: 'CARTA'|'A4' }} params
   * @returns {Promise<Buffer>}
   */
  async accessCards({ eventName, items, paper = 'CARTA' }) {
    const layout = cardLayout(paper, items.length);
    return render({ size: paperSize(paper), margin: 0, compress: this.compress, info: { Title: `Tarjetas de acceso · ${eventName}` } }, (doc) => {
      for (let page = 0; page < layout.pages; page += 1) {
        doc.addPage();
        layout.positions.forEach((position, index) => {
          if (position.page !== page) return;
          this.cuttingGuide(doc, position, layout);
          this.card(doc, items[index], eventName, position, layout);
        });
      }
    });
  }

  /** Dashed outline to cut the card along (shared edges overlap exactly). */
  cuttingGuide(doc, { x, y }, { width, height }) {
    doc.save().lineWidth(0.6).dash(4, { space: 3 }).strokeColor(COLORS.line).rect(x, y, width, height).stroke().undash().restore();
  }

  card(doc, item, eventName, { x, y }, { width, height }) {
    const left = x + CARD_PADDING;
    const inner = width - 2 * CARD_PADDING;
    const line = (text, top, { font = 'Helvetica', size = 8, color = COLORS.muted, align = 'left' } = {}) => {
      // One line, clipped with an ellipsis: nothing can overflow the card.
      doc.font(font).fontSize(size).fillColor(color)
        .text(text, left, top, { width: inner, height: size * 1.3, lineBreak: false, ellipsis: true, align });
    };

    line('NexoPerfil · Acceso a evaluación presencial', y + 12, { font: 'Helvetica-Bold', size: 7, color: COLORS.accent });
    line(eventName, y + 23, { font: 'Helvetica-Bold', size: 9, color: COLORS.ink });
    line(MODULE_LABELS[item.module] || `Módulo ${item.module}`, y + 35, { size: 7.5 });
    // The full name matters (the applicator checks it against an ID): a long
    // one goes on two smaller lines instead of being cut.
    doc.font('Helvetica-Bold').fontSize(12);
    const twoLines = doc.widthOfString(item.nombreCompleto) > inner;
    if (twoLines) {
      doc.fontSize(10).fillColor(COLORS.ink)
        .text(item.nombreCompleto, left, y + 48, { width: inner, height: 25, ellipsis: true });
    } else {
      line(item.nombreCompleto, y + 50, { font: 'Helvetica-Bold', size: 12, color: COLORS.ink });
    }

    const boxTop = y + (twoLines ? 80 : 70);
    doc.save().roundedRect(left, boxTop, inner, 38, 6).fill(COLORS.soft).restore();
    line('Código de acceso', boxTop + 5, { size: 6.5, align: 'center' });
    line(item.code, boxTop + 15, { font: 'Courier-Bold', size: 19, color: COLORS.ink, align: 'center' });

    const appointment = item.appointment || {};
    const place = [appointment.venue, appointment.room].filter(Boolean).join(' · ');
    const when = appointment.startsAt
      ? `${formatShortDate(appointment.startsAt)} · ${formatTime(appointment.startsAt)}${appointment.endsAt ? ` – ${formatTime(appointment.endsAt)}` : ''}`
      : '';
    line(when, boxTop + 44, { size: 7, color: COLORS.ink });
    line(place, boxTop + 53, { size: 7, color: COLORS.ink });
    line('1. Entrega esta tarjeta al aplicador para verificar tu identidad.', boxTop + 65, { size: 6.5 });
    line('2. Cuando te habiliten, escribe el código en la pantalla de acceso.', boxTop + 74, { size: 6.5 });
    line(`3. Es personal y de un solo uso. Vence el ${formatShortDate(item.expiresAt)} a las ${formatTime(item.expiresAt)}`, boxTop + 83, { size: 6.5 });
    if (boxTop + 83 + 9 > y + height) throw new Error('La tarjeta no cabe en su espacio.');
  }

  /**
   * Attendance sheet: who was cited, alphabetical, with an internal id, the
   * appointment time and blank columns to mark attendance and sign. No
   * access codes.
   *
   * @param {{ eventName: string, module: 'A'|'B', session?: object, rows: Array<{ nombreCompleto: string,
   *   internalId: string, appointmentAt?: Date }>, paper?: 'CARTA'|'A4', generatedAt?: Date }} params
   * @returns {Promise<Buffer>}
   */
  async attendanceList({ eventName, module, session, rows, paper = 'CARTA', generatedAt = new Date() }) {
    const [pageWidth, pageHeight] = paperSize(paper);
    const tableWidth = pageWidth - 2 * PAGE_MARGIN;
    const columns = [
      ['N.º', 26], ['Nombre', 0], ['Identificador interno', 118], ['Hora de cita', 74], ['Asistencia', 56], ['Firma', 94],
    ];
    // Module B candidates may be cited to different days: then show the day too.
    const multipleDays = new Set(rows.filter((row) => row.appointmentAt).map((row) => formatShortDate(row.appointmentAt))).size > 1;
    const appointmentLabel = (value) => {
      if (!value) return '';
      if (!multipleDays) return formatTime(value);
      const day = new Intl.DateTimeFormat('es-GT', { day: '2-digit', month: '2-digit', timeZone: TIME_ZONE }).format(new Date(value));
      return `${day} ${formatTime(value)}`;
    };
    const fixed = columns.reduce((total, [, width]) => total + width, 0);
    columns[1][1] = tableWidth - fixed;
    const rowHeight = 24;
    const headerHeight = 20;

    return render({ size: [pageWidth, pageHeight], margin: 0, compress: this.compress, bufferPages: true, info: { Title: `Lista de asistencia · ${eventName}` } }, (doc) => {
      let y;
      const header = () => {
        doc.addPage();
        y = PAGE_MARGIN;
        doc.font('Helvetica-Bold').fontSize(14).fillColor(COLORS.ink).text('Lista de asistencia', PAGE_MARGIN, y, { width: tableWidth, lineBreak: false });
        y += 20;
        doc.font('Helvetica-Bold').fontSize(10).text(eventName, PAGE_MARGIN, y, { width: tableWidth, lineBreak: false, ellipsis: true });
        y += 14;
        const details = [
          MODULE_LABELS[module] || `Módulo ${module}`,
          session?.startsAt ? `${formatDate(session.startsAt)}${session.endsAt ? `, ${formatTime(session.startsAt)} – ${formatTime(session.endsAt)}` : ''}` : '',
          [session?.venue, session?.room].filter(Boolean).join(' · '),
        ].filter(Boolean).join('  ·  ');
        doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.muted).text(details, PAGE_MARGIN, y, { width: tableWidth, lineBreak: false, ellipsis: true });
        y += 20;
        let x = PAGE_MARGIN;
        doc.save().rect(PAGE_MARGIN, y, tableWidth, headerHeight).fill(COLORS.soft).restore();
        for (const [title, width] of columns) {
          doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLORS.ink).text(title, x + 4, y + 6, { width: width - 8, lineBreak: false, ellipsis: true });
          x += width;
        }
        y += headerHeight;
      };

      header();
      if (!rows.length) {
        doc.font('Helvetica').fontSize(9).fillColor(COLORS.muted).text('No hay candidatos citados.', PAGE_MARGIN, y + 10);
      }
      rows.forEach((row, index) => {
        if (y + rowHeight > pageHeight - PAGE_MARGIN - 14) header();
        const cells = [
          String(index + 1),
          row.nombreCompleto,
          row.internalId,
          appointmentLabel(row.appointmentAt),
        ];
        let x = PAGE_MARGIN;
        columns.forEach(([, width], column) => {
          const cellWidth = width - 8;
          const fitsOneLine = doc.font('Helvetica').fontSize(9).widthOfString(cells[column] ?? '') <= cellWidth;
          if (column === 1 && !fitsOneLine) {
            // A long name: two smaller lines inside the row, never over the next one.
            doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.ink)
              .text(cells[column], x + 4, y + 3, { width: cellWidth, height: rowHeight - 4, ellipsis: true });
          } else if (column < cells.length) {
            const size = column === 2 ? 7.5 : 9;
            doc.font(column === 2 ? 'Courier' : 'Helvetica').fontSize(size).fillColor(COLORS.ink)
              .text(cells[column], x + 4, y + 8, { width: cellWidth, height: size * 1.3, lineBreak: false, ellipsis: true });
          } else if (column === 4) {
            doc.save().lineWidth(0.8).strokeColor(COLORS.ink).rect(x + width / 2 - 5, y + 7, 10, 10).stroke().restore();
          }
          x += width;
        });
        doc.save().lineWidth(0.5).strokeColor(COLORS.line).moveTo(PAGE_MARGIN, y + rowHeight).lineTo(PAGE_MARGIN + tableWidth, y + rowHeight).stroke().restore();
        y += rowHeight;
      });

      const range = doc.bufferedPageRange();
      for (let page = range.start; page < range.start + range.count; page += 1) {
        doc.switchToPage(page);
        doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted).text(
          `Generada el ${formatShortDate(generatedAt)} a las ${formatTime(generatedAt)} · Página ${page - range.start + 1} de ${range.count} · ${rows.length} candidato(s)`,
          PAGE_MARGIN,
          pageHeight - PAGE_MARGIN,
          { width: tableWidth, align: 'center', lineBreak: false },
        );
      }
    });
  }
}

module.exports = { PrintableService, cardLayout, PAPER_SIZES };
