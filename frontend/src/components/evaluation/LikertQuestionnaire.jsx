import { useState } from 'react';
import { submitEvaluation } from '../../services/invitationService.js';
import { CompletedPanel, ConfirmPanel, QuestionProgress } from './EvaluationPanels.jsx';

const QUESTIONS = [
  { id: 'demo-a-1', text: 'Cuando trabajo con otras personas, comunico mis ideas de forma clara y respetuosa.' },
  { id: 'demo-a-2', text: 'Ante un cambio inesperado, busco alternativas antes de detener mi trabajo.' },
  { id: 'demo-a-3', text: 'Cuando cometo un error, lo reconozco y tomo acciones para corregirlo.' },
  { id: 'demo-a-4', text: 'Organizo mis tareas para cumplir los compromisos en el tiempo acordado.' },
];

const OPTIONS = [
  'Totalmente en desacuerdo',
  'En desacuerdo',
  'Neutral',
  'De acuerdo',
  'Totalmente de acuerdo',
];

export function LikertQuestionnaire({ token }) {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [phase, setPhase] = useState('questions');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedAt, setSubmittedAt] = useState(null);
  const question = QUESTIONS[questionIndex];

  const continueForward = () => {
    if (selected === null) return;
    const nextAnswers = [...answers, { questionId: question.id, value: selected + 1 }];
    setAnswers(nextAnswers);
    if (questionIndex === QUESTIONS.length - 1) {
      setPhase('confirm');
      return;
    }
    setQuestionIndex((current) => current + 1);
    setSelected(null);
  };

  const sendAnswers = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const result = await submitEvaluation(token, answers);
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
  if (phase === 'confirm') {
    return <ConfirmPanel submitting={submitting} error={submitError} onSubmit={sendAnswers} />;
  }

  return (
    <main className='mx-auto max-w-3xl px-5 py-10 sm:py-16'>
      <QuestionProgress moduleLabel='Módulo A · Cuestionario' current={questionIndex + 1} total={QUESTIONS.length} />

      <section className='rounded-2xl border border-[#D9E2EA] bg-white p-6 shadow-sm sm:p-8'>
        <span className='inline-flex rounded-full bg-[#E8F7F6] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[#0A8F8A]'>Contenido demostrativo</span>
        <h1 className='mt-5 text-lg font-semibold leading-8 text-[#10233A]'>{question.text}</h1>
        <p className='mt-2 text-sm text-[#7C8AA0]'>Selecciona qué tan de acuerdo estás con esta afirmación.</p>

        <div className='mt-9' role='radiogroup' aria-label='Escala Likert de cinco opciones'>
          <div className='relative mx-3 h-10'>
            <div className='absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#DDE5EC]' />
            <div className='absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[#18A9A4] transition-all' style={{ width: selected === null ? '0%' : `${selected * 25}%` }} />
            {OPTIONS.map((label, index) => {
              const active = selected === index;
              const passed = selected !== null && index <= selected;
              return (
                <button
                  key={label}
                  type='button'
                  role='radio'
                  aria-checked={active}
                  aria-label={label}
                  onClick={() => setSelected(index)}
                  className={`absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow transition focus:outline-none focus:ring-2 focus:ring-[#18A9A4] focus:ring-offset-2 ${passed ? 'bg-[#18A9A4]' : 'bg-[#AEBCCA]'} ${active ? 'scale-125' : 'hover:scale-110'}`}
                  style={{ left: `${index * 25}%` }}
                />
              );
            })}
          </div>

          <div className='mt-2 grid grid-cols-5 text-center text-xs font-semibold text-[#7C8AA0]'>
            {OPTIONS.map((label, index) => <span key={label} className={selected === index ? 'text-[#0A8F8A]' : ''}>{index + 1}</span>)}
          </div>
          <div className='mt-3 flex justify-between text-xs text-[#8A98A9]'><span>Muy en desacuerdo</span><span>Muy de acuerdo</span></div>
          <p className='mt-6 min-h-6 text-center text-sm font-semibold text-[#0A8F8A]' aria-live='polite'>{selected === null ? 'Selecciona una opción para continuar' : OPTIONS[selected]}</p>
        </div>
      </section>

      <div className='mt-6 flex justify-end'>
        <button type='button' onClick={continueForward} disabled={selected === null} className='rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#0F8F8B] disabled:cursor-not-allowed disabled:bg-[#BCC7D1]'>{questionIndex === QUESTIONS.length - 1 ? 'Finalizar cuestionario →' : 'Continuar →'}</button>
      </div>
      <p className='mt-8 text-center text-xs text-[#7C8AA0]'>Contenido demostrativo · Las respuestas no generan una puntuación</p>
    </main>
  );
}
