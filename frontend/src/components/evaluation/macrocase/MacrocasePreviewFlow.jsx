import { useState } from 'react';
import { CompletedPanel, ConfirmPanel } from '../EvaluationPanels.jsx';
import { MacrocaseModule } from './MacrocaseModule.jsx';

/**
 * Runs Module B end to end without sending anything (answers are only
 * logged to the console). Used by the admin preview of a macrocase.
 */
export function MacrocasePreviewFlow({ macrocase }) {
  const [phase, setPhase] = useState('module');
  const [answers, setAnswers] = useState([]);
  const [submittedAt, setSubmittedAt] = useState(null);

  const handleComplete = (moduleAnswers) => {
    setAnswers(moduleAnswers);
    setPhase('confirm');
    window.scrollTo?.({ top: 0 });
  };

  const submit = () => {
    console.info('Respuestas del Módulo B (vista previa, no se envían):', answers);
    setSubmittedAt(new Date().toISOString());
    setPhase('completed');
  };

  if (phase === 'confirm') return <ConfirmPanel submitting={false} error='' onSubmit={submit} />;
  if (phase === 'completed') return <CompletedPanel submittedAt={submittedAt} footnote='Vista previa · Las respuestas no se envían' />;
  return <MacrocaseModule macrocase={macrocase} onComplete={handleComplete} />;
}
