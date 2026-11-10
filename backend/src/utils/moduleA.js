const LEGACY_QUESTIONS = Object.freeze([
  { id: 'demo-a-1', dimension: 'HBE', text: 'Cuando trabajo con otras personas, comunico mis ideas de forma clara y respetuosa.' },
  { id: 'demo-a-2', dimension: 'VPE', text: 'Ante un cambio inesperado, busco alternativas antes de detener mi trabajo.' },
  { id: 'demo-a-3', dimension: 'IM', text: 'Cuando cometo un error, lo reconozco y tomo acciones para corregirlo.' },
  { id: 'demo-a-4', dimension: 'InM', text: 'Organizo mis tareas para cumplir los compromisos en el tiempo acordado.' },
]);
const legacyInstrument = () => ({ groupId: 'initial-a', name: 'Instrumento inicial del Módulo A', version: 1, instrumentVersion: 'DEMO_A_V1', questions: LEGACY_QUESTIONS.map((question) => ({ ...question })) });
const instrumentOf = (event) => event.moduleA?.instrument || legacyInstrument();
module.exports = { LEGACY_QUESTIONS, legacyInstrument, instrumentOf };
