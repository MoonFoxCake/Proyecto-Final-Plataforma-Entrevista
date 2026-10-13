/**
 * "Sección 2 de 3 · Pregunta 1 de 2" and a bar with the share of questions
 * already answered across the whole macrocase.
 */
export function MacrocaseProgress({ step, progress }) {
  const percent = progress.totalQuestions ? (progress.answered / progress.totalQuestions) * 100 : 0;
  return (
    <>
      <div className='mb-5 flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-[#64748B]'>
        <span>Módulo B · Macrocaso</span>
        <span>
          Sección <strong className='text-[#0A8F8A]'>{progress.sectionIndex + 1}</strong> de {progress.totalSections}
          {' · '}
          {step === 'narrative'
            ? 'Lectura'
            : <>Pregunta <strong className='text-[#0A8F8A]'>{progress.questionIndex + 1}</strong> de {progress.sectionQuestions}</>}
        </span>
      </div>
      <div
        className='mb-8 h-1.5 overflow-hidden rounded-full bg-[#E5EBF0]'
        role='progressbar'
        aria-label='Progreso del macrocaso'
        aria-valuemin={0}
        aria-valuemax={progress.totalQuestions}
        aria-valuenow={progress.answered}
        aria-valuetext={`${progress.answered} de ${progress.totalQuestions} preguntas respondidas`}
      >
        <div className='h-full rounded-full bg-[#17AAA5] transition-all' style={{ width: `${percent}%` }} />
      </div>
    </>
  );
}
