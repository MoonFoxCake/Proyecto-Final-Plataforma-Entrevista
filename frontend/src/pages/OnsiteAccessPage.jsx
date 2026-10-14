import { useEffect, useMemo, useState } from 'react';
import { EvaluationHeader } from '../components/evaluation/EvaluationHeader.jsx';
import { LikertQuestionnaire } from '../components/evaluation/LikertQuestionnaire.jsx';
import { MacrocaseEvaluation } from '../components/evaluation/macrocase/MacrocaseEvaluation.jsx';
import { createRemoteMacrocaseSource } from '../components/evaluation/macrocase/macrocaseSources.js';
import { validateInvitationAccess } from '../services/invitationService.js';
import { clearSession, loginWithCode, saveSession, savedSession } from '../services/onsiteAccessService.js';

// After the final submission, the computer goes back to the code screen.
const RESET_AFTER_SECONDS = 10;
const CODE_LENGTH = 10;

const MESSAGES = {
  INVALID: 'El código no es correcto. Revisa tu hoja de acceso e inténtalo de nuevo.',
  NOT_ENABLED: 'Tu acceso aún no ha sido habilitado. Acércate al aplicador para verificar tu identidad.',
  USED: 'Este código ya se utilizó. Si necesitas continuar tu evaluación, avisa al aplicador.',
  REVOKED: 'Este código fue anulado. Solicita uno nuevo al aplicador.',
  EXPIRED: 'Este código ya venció. Avisa al aplicador.',
  COMPLETED: 'Esta evaluación ya fue completada.',
  OTHER_COMPUTER: 'Debes continuar la evaluación en la misma computadora donde la comenzaste. Avisa al aplicador.',
  ERROR: 'No se pudo conectar con el servidor. Comprueba la conexión e inténtalo de nuevo.',
};

/** "k7m2p9qx4r" → "K7M2P-9QX4R" while typing. */
function formatCode(input) {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
  return raw.length > 5 ? `${raw.slice(0, 5)}-${raw.slice(5)}` : raw;
}

function tooManyMessage(seconds) {
  const minutes = Math.ceil(seconds / 60);
  return `Demasiados intentos fallidos desde esta computadora. Espera ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} o avisa al aplicador.`;
}

function CodeScreen({ onAccess }) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const complete = code.replace('-', '').length === CODE_LENGTH;

  const submit = async (event) => {
    event.preventDefault();
    if (!complete || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await loginWithCode(code);
      if (result.state === 'VALID') {
        onAccess(result);
        return;
      }
      setMessage(result.state === 'TOO_MANY_ATTEMPTS' ? tooManyMessage(result.retryAfterSeconds) : MESSAGES[result.state] || MESSAGES.INVALID);
      if (result.state === 'INVALID') setCode('');
    } catch {
      setMessage(MESSAGES.ERROR);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className='mx-auto max-w-md px-5 py-16'>
      <form onSubmit={submit} className='rounded-2xl border border-[#D9E2EA] bg-white p-8 shadow-sm' noValidate>
        <span className='inline-flex rounded-md bg-[#FFF7E8] px-2.5 py-1 text-xs font-semibold text-[#9A651E]'>Evaluación presencial</span>
        <h1 className='mt-4 font-display text-2xl font-bold text-[#10233A]'>Ingresa tu código de acceso</h1>
        <p className='mt-2 text-sm leading-6 text-[#56677B]'>Escribe el código impreso en tu hoja de acceso. El aplicador debe haberlo habilitado después de verificar tu identidad.</p>

        <label htmlFor='access-code' className='mt-6 block text-sm font-medium text-[#364153]'>Código de acceso</label>
        <input
          id='access-code'
          value={code}
          onChange={(event) => setCode(formatCode(event.target.value))}
          autoComplete='off'
          autoCapitalize='characters'
          spellCheck='false'
          inputMode='text'
          placeholder='XXXXX-XXXXX'
          aria-describedby='access-code-message'
          className='mt-2 w-full rounded-xl border border-[#D9E2EA] px-4 py-3.5 text-center font-mono text-2xl font-bold tracking-[0.2em] text-[#10233A] placeholder:text-[#C2CCD6] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20'
        />
        <p id='access-code-message' role={message ? 'alert' : undefined} className={`mt-3 min-h-[1.25rem] text-sm ${message ? 'text-red-700' : ''}`}>{message}</p>

        <button type='submit' disabled={!complete || busy} className='mt-4 w-full rounded-xl bg-[#168D89] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#117A76] disabled:cursor-not-allowed disabled:bg-[#AAB7C4]'>
          {busy ? 'Verificando...' : 'Ingresar'}
        </button>
        <p className='mt-5 text-center text-xs text-[#7C8AA0]'>No necesitas correo, contraseña ni teléfono.</p>
      </form>
    </main>
  );
}

function WelcomeScreen({ access, onStart }) {
  return (
    <main className='mx-auto max-w-xl px-5 py-12'>
      <section className='rounded-2xl border border-[#D9E2EA] bg-white p-7 shadow-sm sm:p-8'>
        <span className='inline-flex rounded-md bg-[#E8F7F6] px-2.5 py-1 text-xs font-semibold text-[#087D79]'>Evaluación presencial</span>
        <h1 className='mt-4 font-display text-2xl font-bold text-[#10233A]'>Hola, {access.candidate.nombreCompleto}.</h1>
        <p className='mt-2 text-sm text-[#56677B]'>{access.organization.nombre} · {access.event.nombre}{access.event.puesto ? ` · ${access.event.puesto}` : ''}</p>
        <ul className='mt-6 space-y-3 text-sm text-[#56677B]'>
          <li>◷ &nbsp;Realiza la evaluación en esta computadora, sin interrupciones.</li>
          <li>→ &nbsp;Solo podrás avanzar; no podrás regresar a preguntas anteriores.</li>
          <li>▣ &nbsp;Al finalizar, confirma el envío. Después la pantalla volverá al inicio.</li>
          <li>! &nbsp;Si tienes algún problema, avisa al aplicador.</li>
        </ul>
        <p className='mt-6 text-xs text-[#7C8AA0]'>¿No eres {access.candidate.nombreCompleto}? No continúes y avisa al aplicador.</p>
        <button type='button' onClick={onStart} className='mt-4 w-full rounded-xl bg-[#168D89] px-5 py-3.5 text-sm font-semibold text-white hover:bg-[#117A76]'>Comenzar evaluación →</button>
      </section>
    </main>
  );
}

const END_COPY = {
  finished: ['Evaluación enviada', 'Gracias. Tus respuestas quedaron registradas y la sesión se cerró.', '✓'],
  closed: ['La sesión se cerró', 'Tus respuestas guardadas se conservan. Si necesitas continuar, avisa al aplicador.', '!'],
};

/**
 * Shown after the final submission, or when a supervisor closed the
 * session. Says nothing about who was using the computer.
 */
function EndScreen({ variant = 'finished', onReset }) {
  const [title, text, icon] = END_COPY[variant];
  const [seconds, setSeconds] = useState(RESET_AFTER_SECONDS);
  useEffect(() => {
    if (seconds <= 0) {
      onReset();
      return undefined;
    }
    const timeout = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timeout);
  }, [seconds, onReset]);

  return (
    <main className='mx-auto max-w-md px-5 py-16'>
      <section className='rounded-2xl border border-[#D9E2EA] bg-white p-9 text-center shadow-sm'>
        <span className='mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#E8F7F6] text-xl text-[#0A8F8A]'>{icon}</span>
        <h1 className='mt-6 font-display text-2xl font-bold text-[#10233A]'>{title}</h1>
        <p className='mt-3 text-sm leading-6 text-[#56677B]'>{text}</p>
        <p className='mt-6 text-xs text-[#7C8AA0]' aria-live='polite'>Esta computadora volverá a la pantalla de inicio en {seconds} s.</p>
        <button type='button' onClick={onReset} className='mt-4 rounded-xl border border-[#D9E2EA] px-5 py-2.5 text-sm font-semibold text-[#334E68] hover:bg-[#F6F9FC]'>Volver al inicio ahora</button>
      </section>
    </main>
  );
}

/**
 * `/presencial`: candidate access at the venue with the code printed on
 * their card. The session token lives only in this tab (never in the URL);
 * after the final submission it is discarded and the computer returns to a
 * neutral code screen with nothing about the previous participant.
 */
export function OnsiteAccessPage() {
  const [phase, setPhase] = useState('loading');
  const [access, setAccess] = useState(null);
  const token = access?.token;
  const macrocaseSource = useMemo(() => (token ? createRemoteMacrocaseSource(token) : null), [token]);

  // A reload in the middle of an evaluation resumes the same session.
  useEffect(() => {
    const saved = savedSession();
    if (!saved) {
      setPhase('code');
      return;
    }
    validateInvitationAccess(saved)
      .then((result) => {
        if (result.state === 'VALID') {
          setAccess({ ...result, token: saved });
          setPhase('welcome');
        } else {
          clearSession();
          setPhase('code');
        }
      })
      .catch(() => setPhase('code'));
  }, []);

  const handleAccess = (result) => {
    saveSession(result.token);
    setAccess(result);
    setPhase('welcome');
  };

  const handleCompleted = () => {
    clearSession();
    setAccess(null);
    setPhase('finished');
  };

  // A supervisor revoked or replaced the code (or it expired) midway.
  const handleClosed = () => {
    clearSession();
    setAccess(null);
    setPhase('closed');
  };

  const reset = () => {
    clearSession();
    setAccess(null);
    setPhase('code');
  };

  return (
    <div className='min-h-screen bg-[#F6F9FC]'>
      <EvaluationHeader />
      {phase === 'loading' && <div className='flex min-h-[60vh] items-center justify-center text-sm text-[#64748B]'>Cargando...</div>}
      {phase === 'code' && <CodeScreen onAccess={handleAccess} />}
      {phase === 'welcome' && access && <WelcomeScreen access={access} onStart={() => setPhase('evaluation')} />}
      {phase === 'evaluation' && access && (access.module === 'B'
        ? <MacrocaseEvaluation source={macrocaseSource} onCompleted={handleCompleted} onClosed={handleClosed} />
        : <LikertQuestionnaire token={token} onCompleted={handleCompleted} onClosed={handleClosed} />)}
      {(phase === 'finished' || phase === 'closed') && <EndScreen key={phase} variant={phase} onReset={reset} />}
    </div>
  );
}
