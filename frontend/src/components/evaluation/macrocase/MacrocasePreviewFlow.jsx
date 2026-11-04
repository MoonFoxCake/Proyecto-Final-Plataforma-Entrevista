import { useMemo } from 'react';
import { MacrocaseEvaluation } from './MacrocaseEvaluation.jsx';
import { createLocalMacrocaseSource } from './macrocaseSources.js';

/**
 * Runs Module B end to end without sending anything (answers are only
 * logged to the console). Used by the admin preview of a macrocase.
 */
export function MacrocasePreviewFlow({ macrocase }) {
  const source = useMemo(() => createLocalMacrocaseSource(macrocase), [macrocase]);
  return <MacrocaseEvaluation source={source} completedFootnote='Vista previa · Las respuestas no se envían' />;
}
