/**
 * When a virtual phase's link opens and closes. The company chooses both;
 * the link only works in between.
 */
export const EMPTY_WINDOW = { apertura: '', cierre: '' };

const INPUT = 'mt-1.5 w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-sm text-[#101828] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/30';

export function windowProblem(value, now = new Date()) {
  if (!value.apertura) return 'Indica la fecha y hora de apertura del enlace.';
  if (!value.cierre) return 'Indica la fecha y hora de cierre del enlace.';
  if (new Date(value.cierre) <= new Date(value.apertura)) return 'El cierre debe ser posterior a la apertura.';
  if (new Date(value.cierre) <= now) return 'El cierre debe ser una fecha futura.';
  return '';
}

export const toWindowPayload = (value) => ({
  fechaHoraApertura: new Date(value.apertura).toISOString(),
  fechaHoraCierre: new Date(value.cierre).toISOString(),
});

export function AccessWindowFields({ value, onChange, idPrefix }) {
  const set = (field) => (event) => onChange({ ...value, [field]: event.target.value });
  return (
    <div className='grid gap-4 sm:grid-cols-2'>
      <label htmlFor={`${idPrefix}-apertura`} className='block text-sm font-medium text-[#364153]'>
        Apertura del enlace
        <input id={`${idPrefix}-apertura`} type='datetime-local' value={value.apertura} onChange={set('apertura')} className={INPUT} />
      </label>
      <label htmlFor={`${idPrefix}-cierre`} className='block text-sm font-medium text-[#364153]'>
        Cierre del enlace
        <input id={`${idPrefix}-cierre`} type='datetime-local' value={value.cierre} min={value.apertura || undefined} onChange={set('cierre')} className={INPUT} />
      </label>
      <p className='text-xs leading-5 text-[#64748B] sm:col-span-2'>Cada candidato recibe su enlace por correo. Solo funciona entre la apertura y el cierre.</p>
    </div>
  );
}
