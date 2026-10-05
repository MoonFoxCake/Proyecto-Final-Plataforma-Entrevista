const { NotFoundError } = require('../utils/errors');

class MacrocaseService {
  constructor(macrocaseRepo) {
    this.macrocaseRepo = macrocaseRepo;
  }

  async listMacroCases() {
    return this.macrocaseRepo.findAll();
  }

  async getMacroCase(macrocaseId) {
    const macrocase = await this.macrocaseRepo.findById(macrocaseId);

    if (!macrocase) {
      throw new NotFoundError('Macrocaso no encontrado.');
    }

    return macrocase;
  }

  async createMacroCase(data) {
    const existing = await this.macrocaseRepo.findAll();

    const hasActiveMacrocase = existing.some(
      (macrocase) => macrocase.active === true
    );

    return this.macrocaseRepo.create({
      name: data.name.trim(),
      description: data.description?.trim() || '',
      introduction: data.introduction.trim(),
      maxCharacters: Number(data.maxCharacters),
      defaultTimeLimit: Number(data.defaultTimeLimit),
      active: hasActiveMacrocase ? false : Boolean(data.active),
      questions: data.questions || [],
    });
  }

  async updateMacroCase(macrocaseId, data) {
    const existing = await this.getMacroCase(macrocaseId);

    const payload = {
      ...data,
    };

    if (payload.name !== undefined) {
      payload.name = payload.name.trim();
    }

    if (payload.description !== undefined) {
      payload.description = payload.description?.trim() || '';
    }

    if (payload.introduction !== undefined) {
      payload.introduction = payload.introduction.trim();
    }

    if (payload.maxCharacters !== undefined) {
      payload.maxCharacters = Number(payload.maxCharacters);
    }

    if (payload.defaultTimeLimit !== undefined) {
      payload.defaultTimeLimit = Number(payload.defaultTimeLimit);
    }

    if (payload.questions !== undefined) {
      payload.questions = payload.questions;
    }

    if (payload.active === true) {
      await this.deactivateOtherMacroCases(macrocaseId);
    }

    return this.macrocaseRepo.update(macrocaseId, {
      ...payload,
      active: payload.active ?? existing.active,
    });
  }

  async activateMacroCase(macrocaseId) {
    await this.getMacroCase(macrocaseId);

    await this.deactivateOtherMacroCases(macrocaseId);

    return this.macrocaseRepo.update(macrocaseId, {
      active: true,
    });
  }

  async deactivateMacroCase(macrocaseId) {
    await this.getMacroCase(macrocaseId);

    return this.macrocaseRepo.update(macrocaseId, {
      active: false,
    });
  }

  async deleteMacroCase(macrocaseId) {
    await this.getMacroCase(macrocaseId);

    return this.macrocaseRepo.delete(macrocaseId);
  }

  async deactivateOtherMacroCases(exceptId) {
    const macrocases = await this.macrocaseRepo.findAll();

    const activeMacroCases = macrocases.filter(
      (macrocase) =>
        macrocase.active === true && macrocase.id !== exceptId
    );

    for (const macrocase of activeMacroCases) {
      await this.macrocaseRepo.update(macrocase.id, {
        active: false,
      });
    }
  }
}

module.exports = MacrocaseService;