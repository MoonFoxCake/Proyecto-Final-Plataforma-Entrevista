import { formatDuration, timeLimitOf } from './timeLimit.js';

const STEPS = [
  ['Lee el caso con atención', 'Tómate el tiempo que necesites: el caso solo se muestra en este paso.'],
  ['Escucha cada pregunta', 'Un asistente virtual te hará las preguntas en voz alta, una a la vez.'],
  ['Responde por escrito', 'Escribe tu respuesta con tus propias palabras y continúa a la siguiente.'],
];

/** First screen of Module B: explains the three steps before showing the case. */
export function MacrocaseIntro({ macrocase, onStart }) {
  const total = macrocase.questions.length;
  const timeLimit = timeLimitOf(macrocase);
  return (
    <main className='mx-auto max-w-xl px-5 py-12'>
      <section className='rounded-2xl border border-[#D9E2EA] bg-white p-7 shadow-sm sm:p-8'>
        <span className='inline-flex rounded-md bg-[#E8F7F6] px-2.5 py-1 text-xs font-semibold text-[#087D79]'>Módulo B · Macrocaso</span>
        <h1 className='mt-4 font-display text-2xl font-bold text-[#10233A]'>Análisis de un caso</h1>
        <p className='mt-2 text-sm leading-6 text-[#56677B]'>Leerás una situación y luego responderás {total} {total === 1 ? 'pregunta' : 'preguntas'} sobre ella. No hay respuestas correctas o incorrectas: nos interesa cómo piensas.</p>

        <ol className='mt-6 space-y-4'>
          {STEPS.map(([title, description], index) => (
            <li key={title} className='flex gap-4'>
              <span className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E8F7F6] text-sm font-bold text-[#0A8F8A]'>{index + 1}</span>
              <div><p className='text-sm font-semibold text-[#10233A]'>{title}</p><p className='mt-0.5 text-sm text-[#64748B]'>{description}</p></div>
            </li>
          ))}
        </ol>

        <div className='mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800' role='note'>
          <p className='font-semibold'>Importante</p>
          <p className='mt-1'>Una vez que pases a las preguntas, <strong>no podrás volver a ver el caso</strong>. Responderás con lo que recuerdes de tu lectura.</p>
        </div>

        <div className='mt-4 rounded-xl bg-[#F6F9FC] p-4 text-sm text-[#56677B]'>
          <p>🔊 &nbsp;Activa el sonido de tu dispositivo para escuchar al asistente.</p>
          <p className='mt-2'>→ &nbsp;Solo podrás avanzar; no podrás regresar a preguntas anteriores.</p>
          {macrocase.maxCharacters > 0 && <p className='mt-2'>✎ &nbsp;Cada respuesta admite hasta {macrocase.maxCharacters} caracteres.</p>}
          {timeLimit > 0 && <p className='mt-2'>⏱ &nbsp;Tendrás <strong>{formatDuration(timeLimit)}</strong> para responder cada pregunta. El tiempo empieza cuando el asistente termina de leerla; al agotarse, se guarda lo que hayas escrito y pasas a la siguiente.</p>}
        </div>

        <button type='button' onClick={onStart} className='mt-6 w-full rounded-xl bg-[#168D89] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#117A76]'>Leer el caso →</button>
      </section>
    </main>
  );
}
