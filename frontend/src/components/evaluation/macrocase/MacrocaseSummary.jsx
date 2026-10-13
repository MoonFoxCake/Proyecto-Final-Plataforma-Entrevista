/**
 * Review step: what was answered in each section, and the final
 * confirmation. Answers are already locked, so there is nothing to edit
 * here — only to send.
 */
export function MacrocaseSummary({ stage, submitting, error, onSubmit }) {
  const { summary, progress } = stage;
  const timedOut = summary.reduce((total, section) => total + section.timedOut, 0);
  return (
    <main className='mx-auto max-w-xl px-5 py-16'>
      <section className='rounded-2xl border border-[#D9E2EA] bg-white p-8 shadow-sm'>
        <span className='inline-flex rounded-md bg-[#E8F7F6] px-2.5 py-1 text-xs font-semibold text-[#087D79]'>Módulo B · Resumen</span>
        <h1 className='mt-4 font-display text-2xl font-bold text-[#10233A]'>Finalizar evaluación</h1>
        <p className='mt-2 text-sm leading-6 text-[#56677B]'>Respondiste {progress.answered} de {progress.totalQuestions} preguntas. Revisa el resumen y confirma el envío.</p>

        <ul className='mt-6 divide-y divide-[#E8EDF2] rounded-xl border border-[#E8EDF2]'>
          {summary.map((section) => (
            <li key={section.sectionId} className='flex items-center justify-between gap-4 px-4 py-3 text-sm'>
              <span className='min-w-0 text-[#10233A]'>
                <span className='font-semibold'>Sección {section.order}</span>
                {section.title && <span className='text-[#64748B]'> · {section.title}</span>}
              </span>
              <span className='shrink-0 text-xs text-[#64748B]'>
                {section.answered} de {section.total} {section.total === 1 ? 'respondida' : 'respondidas'}
                {section.timedOut > 0 && <span className='ml-2 rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700'>{section.timedOut} por tiempo</span>}
              </span>
            </li>
          ))}
        </ul>
        {timedOut > 0 && <p className='mt-3 text-xs text-[#7C8AA0]'>Las respuestas marcadas “por tiempo” se registraron al agotarse el tiempo de la pregunta.</p>}

        <p className='mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-800' role='note'>Una vez enviada, la evaluación queda cerrada y no podrás volver a ingresar.</p>
        {error && <p className='mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700'>{error}</p>}
        <button type='button' onClick={onSubmit} disabled={submitting} className='mt-6 w-full rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0F8F8B] disabled:opacity-60'>{submitting ? 'Enviando...' : 'Enviar evaluación'}</button>
      </section>
    </main>
  );
}
