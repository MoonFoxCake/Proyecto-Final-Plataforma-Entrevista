/**
 * Platform settings as shipped. The administrator can override any of them
 * from "Configuración"; whatever was never changed keeps these values. They
 * live in JSON inside `backend` so the frontend can import the same file.
 */
const DEFAULT_SETTINGS = require('./default-settings.json');

module.exports = { DEFAULT_SETTINGS };
