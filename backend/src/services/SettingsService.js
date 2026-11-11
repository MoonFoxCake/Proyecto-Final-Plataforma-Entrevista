const { z } = require('zod');
const { DEFAULT_SETTINGS } = require('../config/defaultSettings');
const { ValidationError } = require('../utils/errors');

const CACHE_MS = 15_000;

const text = (max) => z.string().trim().min(1).max(max);
const planSchema = z.object({
  name: text(60),
  price: text(40),
  description: text(240),
  features: z.array(text(120)).min(1).max(10),
}).strict();

const settingsSchema = z.object({
  landing: z.object({
    badge: text(120),
    heroTitle: text(160),
    heroHighlight: text(120),
    heroText: text(500),
    aboutTitle: text(160),
    aboutText: text(800),
    benefitsTitle: text(160),
    benefits: z.array(z.object({ title: text(80), body: text(240) }).strict()).length(3),
    plansTitle: text(160),
    plansText: text(400),
    contactTitle: text(160),
    contactText: text(400),
  }).strict(),
  plans: z.object({ 'fase-a': planSchema, 'fase-a-b': planSchema, completo: planSchema }).strict(),
  evaluation: z.object({
    moduleAValidityHours: z.number().int().min(1).max(720),
    moduleBCValidityDays: z.number().int().min(1).max(60),
    defaultEntryWindowMinutes: z.number().int().refine((value) => [10, 15, 20, 30, 45, 60, 90, 120].includes(value), 'Ventana no disponible.'),
  }).strict(),
  emails: z.object({
    invitationSubject: text(160),
    invitationIntro: text(400),
    moduleBSubject: text(160),
    moduleBIntro: text(400),
    moduleBNote: text(600),
    moduleCSubject: text(160),
    moduleCIntro: text(400),
    moduleCNote: text(600),
    citationClosing: text(800),
    resultSubject: text(160),
    resultBody: text(600),
  }).strict(),
  notifications: z.object({
    adminEmail: z.union([z.literal(''), z.string().trim().email()]),
  }).strict(),
}).strict();

/** Stored values on top of the defaults, section by section. */
function merge(stored) {
  return Object.fromEntries(Object.entries(DEFAULT_SETTINGS).map(([section, defaults]) => [section, { ...defaults, ...(stored?.[section] || {}) }]));
}

/**
 * Administrator-editable platform settings, in one Firestore document. Read
 * often (every e-mail), written rarely, so reads are briefly cached.
 */
class SettingsService {
  constructor(repo, { now = () => Date.now() } = {}) {
    this.repo = repo;
    this.now = now;
    this.cache = null;
  }

  async get() {
    if (this.cache && this.now() - this.cache.at < CACHE_MS) return this.cache.value;
    const value = merge(await this.repo.get());
    this.cache = { value, at: this.now() };
    return value;
  }

  /** What anyone may read: the public pages' content and the form defaults. */
  async getPublic() {
    const { landing, plans, evaluation } = await this.get();
    return { landing, plans, evaluation: { defaultEntryWindowMinutes: evaluation.defaultEntryWindowMinutes } };
  }

  async update(data, actorUid) {
    const parsed = settingsSchema.safeParse(data);
    if (!parsed.success) throw new ValidationError('Revisa los campos de la configuración.', parsed.error.flatten());
    await this.repo.set({ ...parsed.data, updatedAt: new Date().toISOString(), updatedBy: actorUid });
    this.cache = null;
    return this.get();
  }
}

module.exports = SettingsService;
