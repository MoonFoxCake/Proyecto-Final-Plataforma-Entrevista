const PDFDocument = require('pdfkit');

/**
 * Printable documents for onsite evaluations, rendered in memory and never
 * stored: access sheets (with codes, only at the moment they are issued) and
 * the attendance list (no codes).
 *
 * Standard PDF fonts are used (Helvetica / Courier): they cover Spanish
 * accents and need no font files.
 */

const POINTS_PER_INCH = 72;
const POINTS_PER_MM = POINTS_PER_INCH / 25.4;
// Sizes in points. "Carta" (US Letter) is the usual paper in Guatemala.
const PAPER_SIZES = Object.freeze({
  CARTA: [8.5 * POINTS_PER_INCH, 11 * POINTS_PER_INCH],
  A4: [595.28, 841.89],
});
const PAGE_MARGIN = 36; // 0.5 in

const TIME_ZONE = 'America/Guatemala';
const formatDate = (value) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'full', timeZone: TIME_ZONE }).format(new Date(value));
const formatShortDate = (value) => new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeZone: TIME_ZONE }).format(new Date(value));
const formatTime = (value) => new Intl.DateTimeFormat('es-GT', { timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(value));

// Only for the applicator's attendance list: candidate material never names the module.
const MODULE_LABELS = { A: 'Módulo A · Cuestionario', B: 'Módulo B · Macrocaso' };

const COLORS = { ink: '#10233A', muted: '#56677B', accent: '#0A8F8A', line: '#94A3B8', soft: '#F4F8FB' };

const paperSize = (paper) => PAPER_SIZES[paper] || PAPER_SIZES.CARTA;

const SHEET_MARGIN = 54; // 0.75 in
// How far off the marks a hand fold may land and still hide the code and show the name.
const FOLD_TOLERANCE = 6 * POINTS_PER_MM;
const NAME_SIZES = [32, 28, 24, 20, 17, 15];
const NAME_MAX_LINES = 3;

/**
 * Geometry of the access sheet: one horizontal fold at two thirds of the
 * height, the bottom third folded up over the middle one, printed side in.
 *
 * Folding at `foldY` maps a point `d` below the fold to `d` above it, so the
 * flap covers [2·foldY − height, foldY] (`coverTop`..`foldY`) and only the
 * band above `coverTop` stays visible. The code sits below the fold: it ends
 * up face down on the blank middle third, wherever the fold lands. The name
 * ends 2 × FOLD_TOLERANCE above `coverTop`, because folding `e` too high
 * raises the flap edge by 2e.
 *
 * @returns {{ pageWidth: number, pageHeight: number, foldY: number, coverTop: number,
 *   contentWidth: number, name: { top: number, bottom: number }, code: { top: number, bottom: number } }}
 */
function sheetLayout(paper) {
  const [pageWidth, pageHeight] = paperSize(paper);
  const foldY = (pageHeight * 2) / 3;
  const coverTop = 2 * foldY - pageHeight;
  return {
    pageWidth,
    pageHeight,
    foldY,
    coverTop,
    contentWidth: pageWidth - 2 * SHEET_MARGIN,
    name: { top: SHEET_MARGIN + 22, bottom: coverTop - 2 * FOLD_TOLERANCE },
    code: { top: foldY + 36, bottom: pageHeight - SHEET_MARGIN },
  };
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
   * One foldable sheet per issued credential, in the given order
   * (alphabetical): the name on the top third, the middle third blank and the
   * code with brief instructions on the bottom third, which folds up over the
   * middle one. Printed on one side, no cutting. It never shows the module,
   * the ID number or other personal data.
   *
   * @param {{ eventName: string, items: Array<{ nombreCompleto: string, code: string, expiresAt?: Date }>,
   *   paper?: 'CARTA'|'A4' }} params
   * @returns {Promise<Buffer>}
   */
  async accessCards({ eventName, items, paper = 'CARTA' }) {
    const layout = sheetLayout(paper);
    return render({ size: [layout.pageWidth, layout.pageHeight], margin: 0, compress: this.compress, info: { Title: `Credenciales de acceso · ${eventName}` } }, (doc) => {
      for (const item of items) {
        doc.addPage();
        this.foldMarks(doc, layout);
        this.sheetName(doc, item.nombreCompleto, layout);
        this.sheetCode(doc, item, layout);
      }
    });
  }

  /** Short marks on both side margins, never across the name or the code. */
  foldMarks(doc, { pageWidth, foldY }) {
    doc.save().lineWidth(0.8).strokeColor(COLORS.muted);
    doc.moveTo(16, foldY).lineTo(38, foldY).stroke();
    doc.moveTo(pageWidth - 38, foldY).lineTo(pageWidth - 16, foldY).stroke();
    doc.restore();
    doc.font('Helvetica').fontSize(6).fillColor(COLORS.muted);
    doc.text('doblar', 16, foldY - 9, { width: 30, lineBreak: false });
    doc.text('doblar', pageWidth - 46, foldY - 9, { width: 30, align: 'right', lineBreak: false });
  }

  /** The full name, as large as fits the visible band (up to three lines). */
  sheetName(doc, name, { contentWidth, name: box }) {
    const height = box.bottom - box.top;
    const fits = (size) => {
      doc.font('Helvetica-Bold').fontSize(size);
      const maxLines = NAME_MAX_LINES * (doc.currentLineHeight(true) + 2) + 1;
      return doc.heightOfString(name, { width: contentWidth, lineGap: 2 }) <= Math.min(height, maxLines);
    };
    const size = NAME_SIZES.find(fits) ?? NAME_SIZES[NAME_SIZES.length - 1];
    doc.save().rect(SHEET_MARGIN, SHEET_MARGIN, 32, 3).fill(COLORS.accent).restore();
    doc.font('Helvetica-Bold').fontSize(size).fillColor(COLORS.ink)
      .text(name, SHEET_MARGIN, box.top, { width: contentWidth, height, lineGap: 2, ellipsis: true });
  }

  /** The private part: the code, three steps and the expiry. */
  sheetCode(doc, item, { pageHeight, contentWidth, code: box }) {
    const line = (text, top, { font = 'Helvetica', size = 10, color = COLORS.ink, ...options } = {}) => {
      // One line, clipped with an ellipsis: nothing can overflow the sheet.
      doc.font(font).fontSize(size).fillColor(color)
        .text(text, SHEET_MARGIN, top, { width: contentWidth, height: size * 1.3, lineBreak: false, ellipsis: true, ...options });
    };
    let y = box.top;
    line('NexoPerfil — Acceso a evaluación presencial', y, { font: 'Helvetica-Bold', size: 10, color: COLORS.accent });
    y += 28;
    line('Código de acceso', y, { size: 9, color: COLORS.muted });
    y += 14;
    line(item.code, y, { font: 'Courier-Bold', size: 38, characterSpacing: 1.5 });
    y += 54;
    [
      '1. Abre esta hoja cuando el aplicador te indique.',
      '2. Introduce el código en la computadora asignada.',
      '3. Este código es personal y de un solo uso.',
    ].forEach((step) => {
      line(step, y);
      y += 15;
    });
    if (item.expiresAt) {
      y += 6;
      line(`Vence el ${formatShortDate(item.expiresAt)} a las ${formatTime(item.expiresAt)}`, y, { size: 9, color: COLORS.muted });
      y += 12;
    }
    if (y > box.bottom) throw new Error('El código no cabe en la zona privada de la hoja.');
    // For whoever folds it; hidden inside the fold like the rest of this third.
    line('Para entregar: dobla el tercio inferior hacia arriba por las marcas laterales, con el código hacia adentro.', pageHeight - 34, { size: 6.5, color: COLORS.muted });
  }

  /**
   * Attendance sheet: who was cited, alphabetical, with the cédula, the
   * appointment time and blank cells to mark attendance and sign. Fully
   * gridded so it can be filled in by hand. No access codes.
   *
   * @param {{ eventName: string, module: 'A'|'B', session?: object, rows: Array<{ nombreCompleto: string,
   *   cedula: string, appointmentAt?: Date }>, paper?: 'CARTA'|'A4', generatedAt?: Date }} params
   * @returns {Promise<Buffer>}
   */
  async attendanceList({ eventName, module, session, rows, paper = 'CARTA', generatedAt = new Date() }) {
    const [pageWidth, pageHeight] = paperSize(paper);
    const tableWidth = pageWidth - 2 * PAGE_MARGIN;
    const columns = [
      ['N.º', 26], ['Nombre', 0], ['Cédula', 92], ['Hora de cita', 70], ['Asistencia', 66], ['Firma', 112],
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
    // Every cell bordered: outer box plus one vertical line per column edge.
    const grid = (doc, top, height) => {
      doc.save().lineWidth(0.6).strokeColor(COLORS.line);
      doc.rect(PAGE_MARGIN, top, tableWidth, height).stroke();
      let edge = PAGE_MARGIN;
      for (const [, width] of columns.slice(0, -1)) {
        edge += width;
        doc.moveTo(edge, top).lineTo(edge, top + height).stroke();
      }
      doc.restore();
    };

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
        grid(doc, y, headerHeight);
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
          row.cedula,
          appointmentLabel(row.appointmentAt),
        ];
        let x = PAGE_MARGIN;
        columns.forEach(([, width], column) => {
          const cellWidth = width - 8;
          const fitsOneLine = doc.font('Helvetica').fontSize(9).widthOfString(cells[column] ?? '') <= cellWidth;
          if (column === 1 && !fitsOneLine) {
            // A long name: smaller type, in two lines if needed, never over the next row.
            const oneSmallLine = doc.font('Helvetica').fontSize(7.5).widthOfString(cells[column]) <= cellWidth;
            doc.fillColor(COLORS.ink)
              .text(cells[column], x + 4, oneSmallLine ? y + 9 : y + 3, { width: cellWidth, height: rowHeight - 4, ellipsis: true });
          } else if (column < cells.length) {
            doc.font('Helvetica').fontSize(9).fillColor(COLORS.ink)
              .text(cells[column] ?? '', x + 4, y + 8, { width: cellWidth, height: 9 * 1.3, lineBreak: false, ellipsis: true });
          }
          // Asistencia and Firma stay blank: they are filled in by hand.
          x += width;
        });
        grid(doc, y, rowHeight);
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

module.exports = { PrintableService, sheetLayout, PAPER_SIZES, FOLD_TOLERANCE };
