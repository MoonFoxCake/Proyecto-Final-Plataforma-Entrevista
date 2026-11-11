class MicrocaseController {
  constructor(service) { this.service = service; }
  list =async (req,res,next) => { try { res.json(await this.service.list()); } catch(e) { next(e); } };
  get = async (req,res,next) => { try { res.json(await this.service.get(req.params.id)); } catch(e) { next(e); } };
  create = async (req,res,next) => { try { res.status(201).json(await this.service.create(req.body)); } catch(e) { next(e); } };
  update = async (req,res,next) => { try { res.json(await this.service.update(req.params.id, req.body)); } catch(e) { next(e); } };
  activate = async (req,res,next) => { try { res.json(await this.service.setActive(req.params.id, true)); } catch(e) { next(e); } };
  deactivate = async (req,res,next) => { try { res.json(await this.service.setActive(req.params.id, false)); } catch(e) { next(e); } };
  preview = async (req,res,next) => { try { res.json(await this.service.preview(req.params.id, req.body.sectionIds || [])); } catch(e) { next(e); } };
  delete = async (req,res,next) => { try { res.json(await this.service.delete(req.params.id)); } catch(e) { next(e); } };
}
module.exports = MicrocaseController;
