import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateInvitationAccess } from '../services/invitationService.js';
import { LikertQuestionnaire } from '../components/evaluation/LikertQuestionnaire.jsx';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-GT', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Guatemala',
  }).format(date);
}

const STATE_COPY = {
  INVALID: ['Este enlace no es válido.', 'Verifica que hayas abierto el enlace completo recibido en tu correo.'],
  EXPIRED: ['Este acceso ha expirado.', 'Solicita a la empresa una nueva invitación para continuar.'],
  COMPLETED: ['Esta evaluación ya fue completada.', 'Tus respuestas ya fueron registradas. No es necesario realizar otra acción.'],
  CANCELLED: ['Este acceso ya no está disponible.', 'La invitación fue cancelada. Contacta a la empresa si necesitas ayuda.'],
  ERROR: ['No pudimos validar el acceso.', 'Comprueba tu conexión e intenta abrir nuevamente el enlace.'],
};

function BrandHeader() {
  return (
    <header className='border-b border-[#DDE5EC] bg-white'>
      <div className='mx-auto flex h-[70px] max-w-6xl items-center justify-between px-5'>
        <div className='flex items-center gap-3'><span className='flex h-9 w-9 items-center justify-center rounded-xl bg-[#20AAA5] font-bold text-white'>N</span><span className='font-display font-bold text-[#10233A]'>Nexo<span className='text-[#18A9A4]'>Perfil</span></span></div>
        <span className='text-sm text-[#64748B]'>Evaluación</span>
      </div>
    </header>
  );
}

function ClosedState({ state, submittedAt }) {
  const [title, description] = STATE_COPY[state] || STATE_COPY.INVALID;
  const formattedSubmission = submittedAt ? formatDate(submittedAt) : '';
  return (
    <div className='mx-auto mt-24 max-w-lg rounded-2xl border border-[#D9E2EA] bg-white p-9 text-center shadow-sm'>
      <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F7F6] text-xl text-[#0A8F8A]'>✓</span>
      <h1 className='mt-6 font-display text-2xl font-bold text-[#10233A]'>{title}</h1>
      <p className='mt-3 text-sm leading-6 text-[#56677B]'>{description}</p>
      {state === 'COMPLETED' && formattedSubmission && <p className='mt-4 text-sm font-medium text-[#334E68]'>Tus respuestas fueron enviadas el {formattedSubmission}.</p>}
      <div className='mt-7 border-t border-[#DDE5EC] pt-6 text-sm text-[#7C8AA0]'>Puedes cerrar esta ventana.</div>
    </div>
  );
}

export function EvaluationAccessPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [access, setAccess] = useState(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    let active = true;
    validateInvitationAccess(token)
      .then((result) => active && setAccess(result))
      .catch(() => active && setAccess({ state: 'ERROR' }));
    return () => { active = false; };
  }, [token]);

  if (!access) {
    return <div className='min-h-screen bg-[#F6F9FC]'><BrandHeader /><div className='flex min-h-[60vh] items-center justify-center text-sm text-[#64748B]'>Validando acceso...</div></div>;
  }
  if (STATE_COPY[access.state]) {
    return <div className='min-h-screen bg-[#F6F9FC]'><BrandHeader /><ClosedState state={access.state} submittedAt={access.submittedAt} /></div>;
  }
  if (started) {
    return (
      <div className='min-h-screen bg-[#F6F9FC]'><BrandHeader /><LikertQuestionnaire token={token} /></div>
    );
  }

  const waiting = access.state === 'NOT_YET_AVAILABLE';
  return (
    <div className='min-h-screen bg-[#F6F9FC]'>
      <BrandHeader />
      <main className='mx-auto max-w-xl px-5 py-12'>
        <section className='rounded-2xl border border-[#D9E2EA] bg-white p-7 shadow-sm sm:p-8'>
          <span className='inline-flex rounded-md bg-[#E8F7F6] px-2.5 py-1 text-xs font-semibold text-[#087D79]'>{waiting ? 'Evaluación programada' : 'Evaluación disponible'}</span>
          <h1 className='mt-4 font-display text-2xl font-bold text-[#10233A]'>Hola, {access.candidate.nombreCompleto}.</h1>
          <p className='mt-2 text-sm text-[#56677B]'>{access.organization.nombre} te ha invitado a completar una evaluación.</p>

          <div className='mt-6 rounded-xl bg-[#F6F9FC] p-5'>
            <p className='text-xs text-[#64748B]'>Evento</p><p className='mt-1 font-semibold text-[#10233A]'>{access.event.nombre}</p>
            {access.event.puesto && <p className='mt-1 text-sm text-[#64748B]'>{access.event.puesto}</p>}
            <div className='mt-5 grid gap-4 sm:grid-cols-2'><div><p className='text-xs text-[#64748B]'>Fecha y hora</p><p className='mt-1 text-sm font-medium text-[#10233A]'>{formatDate(access.event.availableFrom)} · UTC−6</p></div><div><p className='text-xs text-[#64748B]'>Duración aproximada</p><p className='mt-1 text-sm font-medium text-[#10233A]'>3–5 minutos · Demo</p></div></div>
          </div>

          <h2 className='mt-6 font-semibold text-[#10233A]'>Antes de comenzar</h2>
          <ul className='mt-4 space-y-3 text-sm text-[#56677B]'><li>◷ &nbsp;Realiza la evaluación en una sola sesión.</li><li>→ &nbsp;Solo podrás avanzar; no podrás regresar a preguntas anteriores.</li><li>▣ &nbsp;Al finalizar, confirma el envío de tu evaluación.</li><li>♙ &nbsp;El enlace es personal. No lo compartas.</li></ul>

          {waiting && <p className='mt-6 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800'>Podrás comenzar a partir del {formatDate(access.event.availableFrom)}.</p>}
          <button type='button' disabled={waiting} onClick={() => setStarted(true)} className='mt-6 w-full rounded-xl bg-[#168D89] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#117A76] disabled:cursor-not-allowed disabled:bg-[#AAB7C4]'>{waiting ? 'Aún no disponible' : 'Comenzar evaluación →'}</button>
        </section>
        <p className='mt-6 text-center text-xs text-[#7C8AA0]'>Contenido demostrativo · NexoPerfil</p>
      </main>
    </div>
  );
}
