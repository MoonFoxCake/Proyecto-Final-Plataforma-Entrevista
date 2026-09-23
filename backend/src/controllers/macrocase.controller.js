const {
  uploadMacrocaseAudio,
  deleteMacrocaseAudio,
} = require('../services/storageService');

class MacrocaseController {
  constructor(macrocaseService) {
    this.macrocaseService = macrocaseService;
  }

  list = async (req, res, next) => {
    try {
      res.json(await this.macrocaseService.listMacroCases());
    } catch (error) {
      next(error);
    }
  };

  get = async (req, res, next) => {
    try {
      res.json(
        await this.macrocaseService.getMacroCase(req.params.macrocaseId)
      );
    } catch (error) {
      next(error);
    }
  };

  create = async (req, res, next) => {
    try {
      res.status(201).json(
        await this.macrocaseService.createMacroCase(req.body)
      );
    } catch (error) {
      next(error);
    }
  };

  update = async (req, res, next) => {
    try {
      res.json(
        await this.macrocaseService.updateMacroCase(
          req.params.macrocaseId,
          req.body
        )
      );
    } catch (error) {
      next(error);
    }
  };

  activate = async (req, res, next) => {
    try {
      res.json(
        await this.macrocaseService.activateMacroCase(
          req.params.macrocaseId
        )
      );
    } catch (error) {
      next(error);
    }
  };

  deactivate = async (req, res, next) => {
    try {
      res.json(
        await this.macrocaseService.deactivateMacroCase(
          req.params.macrocaseId
        )
      );
    } catch (error) {
      next(error);
    }
  };

  delete = async (req, res, next) => {
    try {
      res.json(
        await this.macrocaseService.deleteMacroCase(
          req.params.macrocaseId
        )
      );
    } catch (error) {
      next(error);
    }
  };

  uploadAudio = async (req, res, next) => {
    try {
      const { macrocaseId } = req.params;
      const { questionId } = req.body;

      if (!req.file) {
        return res.status(400).json({
          message: 'Debes enviar un archivo de audio.',
        });
      }

      if (!questionId) {
        return res.status(400).json({
          message: 'Debes indicar la pregunta.',
        });
      }

      const macrocase =
        await this.macrocaseService.getMacroCase(macrocaseId);

      const question = macrocase.questions.find(
        (item) => item.id === questionId
      );

      if (!question) {
        return res.status(404).json({
          message: 'Pregunta no encontrada.',
        });
      }

      const safeName = req.file.originalname
        .replace(/[^a-zA-Z0-9._-]/g, '_');

      const filePath =
        `${macrocaseId}/${questionId}-${Date.now()}-${safeName}`;

      const uploaded = await uploadMacrocaseAudio({
        fileBuffer: req.file.buffer,
        filePath,
        contentType: req.file.mimetype,
      });

      if (question.audioPath) {
        try {
          await deleteMacrocaseAudio(question.audioPath);
        } catch (error) {
          console.warn(
            'No se pudo eliminar el audio anterior:',
            error.message
          );
        }
      }

      const questions = macrocase.questions.map((item) =>
        item.id === questionId
          ? {
              ...item,
              audioName: req.file.originalname,
              audioPath: uploaded.path,
              audioUrl: uploaded.publicUrl,
            }
          : item
      );

      const updated =
        await this.macrocaseService.updateMacroCase(
          macrocaseId,
          { questions }
        );

      res.json(updated);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = MacrocaseController;