import { useState } from 'react';
import { submitMacrocaseAnswers } from '../../../services/invitationService.js';
import { CompletedPanel, ConfirmPanel } from '../EvaluationPanels.jsx';
import { MacrocaseModule } from './MacrocaseModule.jsx';

/**
 * Module B for a real invitation: runs the macrocase, asks for confirmation
 * and sends the written answers once.
 */
export function MacrocaseEvaluation({ token, macrocase }) {
  const [phase, setPhase] = useState('module');
  const [answers, setAnswers] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedAt, setSubmittedAt] = useState(null);

  const handleComplete = (moduleAnswers) => {
    setAnswers(moduleAnswers);
    setPhase('confirm');
    window.scrollTo?.({ top: 0 });
  };

  const send = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await submitMacrocaseAnswers(token, answers);
      if (result?.state !== 'COMPLETED') {
        setSubmitError('Este acceso ya no permite enviar la evaluación.');
        return;
      }
      setSubmittedAt(result.submittedAt || new Date().toISOString());
      setPhase('completed');
    } catch (requestError) {
      setSubmitError(requestError.response?.data?.error?.message || 'No se pudo enviar la evaluación. Intenta nuevamente.');
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === 'completed') return <CompletedPanel submittedAt={submittedAt} />;
  if (phase === 'confirm') return <ConfirmPanel submitting={submitting} error={submitError} onSubmit={send} />;
  return <MacrocaseModule macrocase={macrocase} onComplete={handleComplete} />;
}
