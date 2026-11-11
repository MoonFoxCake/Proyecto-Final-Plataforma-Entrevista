class ResultDeliveryController {
  constructor(service) { this.service = service; }
  list = async (req, res, next) => { try { res.json({ data: await this.service.listPending() }); } catch (e) { next(e); } };
  deliver = async (req, res, next) => { try { res.json({ data: await this.service.deliver(req.params.eventId, req.params.module, req.file, req.user.uid) }); } catch (e) { next(e); } };
  download = async (req, res, next) => { try { res.json({ data: await this.service.getAdminDownloadUrl(req.params.eventId, req.params.module) }); } catch (e) { next(e); } };
}
module.exports = ResultDeliveryController;
