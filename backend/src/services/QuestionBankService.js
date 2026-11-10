const { z } = require('zod');
const { randomUUID } = require('crypto');
const { ValidationError, NotFoundError } = require('../utils/errors');
const { legacyInstrument } = require('../utils/moduleA');
const question = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]+$/).max(120).optional(),
  text: z.string().trim().min(1).max(1000),
  dimension: z.string().trim().max(80).optional().default(''),
}).strict();
const contentSchema = z.object({
  name: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).optional().default(''),
  questions: z.array(question).min(1).max(100),
}).strict();
function content(data) {
  const result = contentSchema.safeParse(data);
  if (!result.success) throw new ValidationError('Revisa el nombre y las preguntas: entre 1 y 100 preguntas con texto de hasta 1000 caracteres.', result.error.flatten());
  const normalized = { ...result.data, questions: result.data.questions.map((q) => ({ ...q, id: q.id || randomUUID() })) };
  if (new Set(normalized.questions.map((q) => q.id)).size !== normalized.questions.length) throw new ValidationError('Las preguntas deben tener identificadores únicos.');
  return normalized;
}
class QuestionBankService {
  constructor(repo, { random = Math.random } = {}) { this.repo = repo; this.random = random; }
  async ready() {
    const initial = legacyInstrument();
    await this.repo.ensureInitial({ name: initial.name, description: 'Preguntas del instrumento original. Puedes editar el grupo creando nuevas versiones o desactivarlo.', questions: initial.questions, active: true });
  }
  async list() { await this.ready(); return this.repo.findAll(); }
  async get(id) { await this.ready(); const group = await this.repo.findById(id); if (!group) throw new NotFoundError('Grupo no encontrado.'); return group; }
  async history(id) { await this.get(id); return (await this.repo.history(id)).sort((a, b) => b.version - a.version); }
  async create(data) { await this.ready(); return this.repo.create({ ...content(data), active: false }); }
  async update(id, data) {
    const { baseVersion, ...input } = data || {};
    if (!Number.isInteger(baseVersion) || baseVersion < 1) throw new ValidationError('Indica la versión base que estás editando.');
    await this.get(id);
    return this.repo.revise(id, content(input), baseVersion);
  }
  async setActive(id, data) {
    if (typeof data?.active !== 'boolean' || !Number.isInteger(data?.baseVersion) || data.baseVersion < 1) throw new ValidationError('Indica un estado y una versión base válidos.');
    const group = await this.get(id);
    if (data.active) content({ name: group.name, description: group.description, questions: group.questions });
    return this.repo.setActive(id, data.active, data.baseVersion);
  }
  async pickSnapshot() {
    const active = (await this.list()).filter((group) => group.active);
    if (!active.length) throw new ValidationError('Activa al menos un grupo en el Banco de Preguntas del Módulo A antes de crear un proceso.');
    const group = active[Math.floor(this.random() * active.length) % active.length];
    return {
      groupId: group.id, name: group.name, version: group.version,
      instrumentVersion: `QUESTION_GROUP:${group.id}:v${group.version}`,
      questions: group.questions.map((q) => ({ ...q })),
    };
  }
}
module.exports = QuestionBankService;
