/**
 * Panels shared by the evaluation modules: the "module x · question n of m"
 * progress bar, the send confirmation and the completed state.
 */

export function QuestionProgress({ moduleLabel, current, total }) {
  const progress = (current / total) * 100;
  return (
    <>
      <div className='mb-5 flex items-center justify-between text-xs font-medium text-[#64748B]'>
        <span>{moduleLabel}</span>
        <span>Pregunta <strong className='text-[#0A8F8A]'>{current}</strong> de {total}</span>
      </div>
      <div className='mb-8 h-1.5 overflow-hidden rounded-full bg-[#E5EBF0]'>
        <div className='h-full rounded-full bg-[#17AAA5] transition-all' style={{ width: `${progress}%` }} />
      </div>
    </>
  );
}

export function CompletedPanel({ submittedAt, footnote = 'Contenido demostrativo · Sin calificación' }) {
  const formatted = submittedAt ? new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala',
  }).format(new Date(submittedAt)) : '';
  return (
    <main className='mx-auto max-w-xl px-5 py-16'>
      <section className='rounded-2xl border border-[#D9E2EA] bg-white p-9 text-center shadow-sm'>
        <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F7F6] text-xl text-[#0A8F8A]'>✓</span>
        <h1 className='mt-6 font-display text-2xl font-bold text-[#10233A]'>Evaluación completada</h1>
        <p className='mt-3 text-sm leading-6 text-[#56677B]'>Tus respuestas fueron registradas correctamente.</p>
        {formatted && <p className='mt-4 text-sm font-medium text-[#334E68]'>Enviada el {formatted}</p>}
        <div className='mt-7 border-t border-[#DDE5EC] pt-6 text-sm text-[#7C8AA0]'>No tienes evaluaciones pendientes. Puedes cerrar esta ventana.</div>
      </section>
      <p className='mt-6 text-center text-xs text-[#7C8AA0]'>{footnote}</p>
    </main>
  );
}

export function ConfirmPanel({ submitting, error, onSubmit }) {
  return (
    <main className='mx-auto max-w-xl px-5 py-16'>
      <section className='rounded-2xl border border-[#D9E2EA] bg-white p-8 text-center shadow-sm'>
        <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-xl text-amber-700'>!</span>
        <h1 className='mt-6 font-display text-2xl font-bold text-[#10233A]'>Finalizar evaluación</h1>
        <p className='mt-3 text-sm leading-6 text-[#56677B]'>Confirma que deseas enviar tu evaluación.</p>
        {error && <p className='mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700'>{error}</p>}
        <button type='button' onClick={onSubmit} disabled={submitting} className='mt-7 rounded-xl bg-[#13A9A4] px-6 py-3 text-sm font-semibold text-white hover:bg-[#0F8F8B] disabled:opacity-60'>{submitting ? 'Enviando...' : 'Enviar evaluación'}</button>
      </section>
    </main>
  );
}
