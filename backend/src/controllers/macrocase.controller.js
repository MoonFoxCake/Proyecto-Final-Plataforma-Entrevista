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
      if (!req.file) {
        return res.status(400).json({
          message: 'Debes enviar un archivo de audio.',
        });
      }

      if (!req.body.questionId) {
        return res.status(400).json({
          message: 'Debes indicar la pregunta.',
        });
      }

      res.json(
        await this.macrocaseService.uploadQuestionAudio(
          req.params.macrocaseId,
          req.body.questionId,
          req.file
        )
      );
    } catch (error) {
      next(error);
    }
  };
}

module.exports = MacrocaseController;
