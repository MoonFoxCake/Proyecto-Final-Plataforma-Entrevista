const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
export const newQuestion = () => ({ id: makeId(), text: '' });
export const newSection = (title = 'Nueva habilidad') => ({ id: makeId(), title, questions: [newQuestion()] });
export const blankMicrocase = () => ({ name: '', description: '', story: '', timeLimitMinutes: 15, active: false, sections: [newSection('Habilidades éticas 1')] });
export const normalizeSearch = (text) => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
export const sectionsOf = (item) => [...(item.sections || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
export const questionsOf = (section) => (section.questions || []).filter((question) => question.text?.trim());
export const questionCount = (item) => sectionsOf(item).reduce((total, section) => total + questionsOf(section).length, 0);
export const usableSection = (section) => Boolean(section.title?.trim() && questionsOf(section).length);
export const isReady = (item) => Boolean(item.name?.trim() && item.story?.trim() && item.sections?.length && item.sections.every(usableSection));
export const editForm = (item) => ({
  name: item.name || '', description: item.description || '', story: item.story || '',
  timeLimitMinutes: item.timeLimitMinutes ?? 15, active: Boolean(item.active),
  sections: sectionsOf(item).map((section) => ({ ...section, questions: (section.questions || []).map((question) => ({ ...question })) })),
});
export const moveItem = (items, index, direction) => {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const result = [...items];
  [result[index], result[target]] = [result[target], result[index]];
  return result;
};
export function validateMicrocase(form) {
  if (!form.name.trim()) return { step: 0, field: 'microcase-name', message: 'Escribe el nombre del microcaso.' };
  if (!Number.isInteger(Number(form.timeLimitMinutes)) || Number(form.timeLimitMinutes) < 1 || Number(form.timeLimitMinutes) > 240) return { step: 0, field: 'microcase-time', message: 'El tiempo debe ser un número entero entre 1 y 240 minutos.' };
  if (!form.story.trim()) return { step: 1, field: 'microcase-story', message: 'Escribe la historia que leerá el participante.' };
  if (!form.sections.length) return { step: 2, message: 'Agrega al menos una habilidad.' };
  const missing = form.sections.findIndex((section) => !section.title.trim());
  if (missing >= 0) return { step: 2, field: `skill-${form.sections[missing].id}`, message: `La habilidad ${missing + 1} necesita un nombre.` };
  if (form.active && !isReady(form)) return { step: 2, message: 'Para mantenerlo activo, agrega al menos una pregunta por habilidad o desmarca «Mantener activo» para guardarlo como inactivo.' };
  return null;
}
export function microcasePayload(form) {
  return {
    name: form.name.trim(), description: form.description.trim(), story: form.story.trim(),
    timeLimitMinutes: Number(form.timeLimitMinutes), active: form.active,
    sections: form.sections.map((section, index) => ({
      id: section.id, title: section.title.trim(), order: index + 1,
      questions: questionsOf(section).map((question) => ({ id: question.id, text: question.text.trim() })),
    })),
  };
}
