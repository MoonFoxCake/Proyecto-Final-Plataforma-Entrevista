import { splitForSpeech } from './speechSynthesis.js';

test('splits long narratives into short chunks at sentence ends, keeping every word', () => {
  const paragraph = 'Había una vez una niña. '.repeat(20).trim();
  const text = `${paragraph}\n\n—¿Vive muy lejos?, le dijo el lobo.\n\nFin`;

  const chunks = splitForSpeech(text);

  expect(chunks.length).toBeGreaterThan(3);
  expect(chunks.every((chunk) => chunk.length <= 220)).toBe(true);
  expect(chunks.every((chunk) => !chunk.startsWith(' ') && chunk.length > 0)).toBe(true);
  expect(chunks.slice(-2)).toEqual(['—¿Vive muy lejos?, le dijo el lobo.', 'Fin']);
  expect(chunks.join(' ').replace(/\s+/g, ' ')).toBe(text.replace(/\s+/g, ' '));
});

test('short texts stay in one chunk', () => {
  expect(splitForSpeech('¿Qué haría usted en el lugar del lobo?')).toEqual(['¿Qué haría usted en el lugar del lobo?']);
  expect(splitForSpeech('   ')).toEqual([]);
});
