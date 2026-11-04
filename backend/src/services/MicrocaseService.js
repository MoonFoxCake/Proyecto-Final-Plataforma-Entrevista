const crypto = require('crypto');
const { NotFoundError, ValidationError } = require('../utils/errors');
const DEFAULT_SECTIONS = ['Habilidades éticas 1', 'Habilidades éticas 2', 'Habilidades éticas 3', 'Habilidades éticas 4'];
const id = () => crypto.randomUUID();
class MicrocaseService {
  constructor(repo) { this.repo = repo; }
  async list() { return (await this.repo.findAll()).sort((a,b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)); }
  async get(microcaseId) { const item = await this.repo.findById(microcaseId); if (!item) throw new NotFoundError('Microcaso no encontrado.'); return item; }
  normalize(data, existing = {}) {
    const name = String(data.name ?? existing.name ?? '').trim();
    const story = String(data.story ?? existing.story ?? '').trim();
    if (!name) throw new ValidationError('El nombre del microcaso es obligatorio.');
    if (!story) throw new ValidationError('La historia del microcaso es obligatoria.');
    const rawSections = data.sections ?? existing.sections ?? DEFAULT_SECTIONS.map((title) => ({ title, questions: [] }));
    if (!Array.isArray(rawSections) || !rawSections.length) throw new ValidationError('Debe existir al menos una sección.');
    const sections = rawSections.map((section, index) => {
      const title = String(section.title || '').trim();
      if (!title) throw new ValidationError(`La sección ${index + 1} necesita un nombre.`);
      const questions = (Array.isArray(section.questions) ? section.questions : []).map((q) => ({ id: q.id || id(), text: String(q.text || '').trim() })).filter((q) => q.text);
      return { id: section.id || id(), order: index + 1, title, questions };
    });
    const timeLimitMinutes = Number(data.timeLimitMinutes ?? existing.timeLimitMinutes ?? 15);
    if (!Number.isInteger(timeLimitMinutes) || timeLimitMinutes < 1 || timeLimitMinutes > 240) throw new ValidationError('El tiempo límite debe ser un número entero entre 1 y 240 minutos.');
    return { name, description: String(data.description ?? existing.description ?? '').trim(), story, sections, timeLimitMinutes, active: data.active ?? existing.active ?? false };
  }
  async create(data) { return this.repo.create(this.normalize(data)); }
  async update(microcaseId, data) { const old = await this.get(microcaseId); return this.repo.update(microcaseId, this.normalize(data, old)); }
  async setActive(microcaseId, active) {
    const item = await this.get(microcaseId);
    if (active) {
      if (!item.story?.trim() || !item.sections?.length || item.sections.some((section) => !section.title?.trim() || !section.questions?.some((question) => question.text?.trim()))) {
        throw new ValidationError('Para activar el microcaso, todas las secciones deben tener nombre y al menos una pregunta, además de una historia.');
      }
    }
    return this.repo.update(microcaseId, { active: Boolean(active) });
  }
  async delete(microcaseId) { const item = await this.repo.delete(microcaseId); if (!item) throw new NotFoundError('Microcaso no encontrado.'); return item; }
  async preview(microcaseId, sectionIds = []) {
    const item = await this.get(microcaseId);
    const selected = sectionIds.length ? item.sections.filter((s) => sectionIds.includes(s.id)) : item.sections;
    if (!selected.length) throw new ValidationError('Selecciona al menos una habilidad.');
    return { id: item.id, name: item.name, story: item.story, sections: selected.map((s) => ({ ...s, selectedQuestion: s.questions.length ? s.questions[Math.floor(Math.random() * s.questions.length)] : null })) };
  }
}
MicrocaseService.DEFAULT_SECTIONS = DEFAULT_SECTIONS;
module.exports = MicrocaseService;
