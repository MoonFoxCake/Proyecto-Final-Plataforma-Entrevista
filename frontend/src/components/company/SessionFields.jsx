import { FormField, Input } from '../ui';

export const EMPTY_SESSION = { sede: '', ubicacion: '', fecha: '', horaInicio: '', horaFin: '', indicaciones: '' };

const inputClass = 'w-full rounded-xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#101828] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/30';

/** First problem with an onsite session, or '' if it is complete. */
export function sessionProblem(session) {
  if (!session.sede.trim()) return 'Indica la sede.';
  if (!session.ubicacion.trim()) return 'Indica la ubicación dentro de la sede (aula, sala, piso…).';
  if (!session.fecha || !session.horaInicio || !session.horaFin) return 'Indica la fecha y el horario de la evaluación.';
  if (session.horaFin <= session.horaInicio) return 'La hora de finalización debe ser posterior a la de inicio.';
  return '';
}

/** Request body for the backend (`citationSchema`); times are the browser's local time. */
export function toCitationPayload(session) {
  return {
    sede: session.sede.trim(),
    ubicacion: session.ubicacion.trim(),
    fechaHoraInicio: new Date(`${session.fecha}T${session.horaInicio}`).toISOString(),
    fechaHoraFin: new Date(`${session.fecha}T${session.horaFin}`).toISOString(),
    indicaciones: session.indicaciones.trim() || undefined,
  };
}

/** Venue, location, date, time window and instructions of an onsite session. */
export function SessionFields({ value, onChange, idPrefix = 'session' }) {
  const update = (field) => (event) => onChange({ ...value, [field]: event.target.value });
  const id = (field) => `${idPrefix}-${field}`;
  return (
    <div className='grid gap-5 sm:grid-cols-2'>
      <FormField label='Sede' htmlFor={id('sede')}>
        <Input id={id('sede')} value={value.sede} onChange={update('sede')} placeholder='Ej: Campus Central' icon={<span className='text-sm'>⌂</span>} required />
      </FormField>
      <FormField label='Ubicación específica' htmlFor={id('ubicacion')}>
        <Input id={id('ubicacion')} value={value.ubicacion} onChange={update('ubicacion')} placeholder='Ej: Edificio T2, aula 204' icon={<span className='text-sm'>⌖</span>} required />
      </FormField>
      <FormField label='Fecha' htmlFor={id('fecha')}>
        <input id={id('fecha')} type='date' value={value.fecha} onChange={update('fecha')} className={inputClass} required />
      </FormField>
      <div className='grid grid-cols-2 gap-3'>
        <FormField label='Hora de inicio' htmlFor={id('horaInicio')}>
          <input id={id('horaInicio')} type='time' value={value.horaInicio} onChange={update('horaInicio')} className={inputClass} required />
        </FormField>
        <FormField label='Hora de fin' htmlFor={id('horaFin')}>
          <input id={id('horaFin')} type='time' value={value.horaFin} onChange={update('horaFin')} className={inputClass} required />
        </FormField>
      </div>
      <div className='sm:col-span-2'>
        <FormField label='Indicaciones para los candidatos (opcional)' htmlFor={id('indicaciones')}>
          <textarea
            id={id('indicaciones')}
            value={value.indicaciones}
            onChange={update('indicaciones')}
            rows='3'
            maxLength='1000'
            placeholder='Ej: Presentarse 15 minutos antes en la recepción del edificio T2.'
            className={`${inputClass} resize-none placeholder:text-[#99A1AF]`}
          />
        </FormField>
        <p className='mt-2 text-xs text-[#64748B]'>Se incluyen en el correo de citación. La citación no lleva enlaces ni códigos: el acceso se entrega en la sede.</p>
      </div>
    </div>
  );
}
