import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CompanySidebar } from '../components/company/CompanySidebar.jsx';
import { EMPTY_SESSION, SessionFields, sessionProblem, toCitationPayload } from '../components/company/SessionFields.jsx';
import { Button, FormField, Input } from '../components/ui';
import { BriefcaseIcon, SpinnerIcon } from '../components/auth/icons.jsx';
import * as eventService from '../services/eventService.js';

const EMPTY_FORM = {
  nombre: '',
  puesto: '',
  modalidad: 'virtual',
  fechaHoraHabilitacion: '',
  presencial: EMPTY_SESSION,
  incluirModuloB: true,
  descripcion: '',
};

const MODALITIES = [
  ['virtual', 'Virtual', 'Cada candidato recibe por correo un enlace personal y realiza la evaluación desde su dispositivo.'],
  ['presencial', 'Presencial', 'Los candidatos reciben una citación a una sede. El acceso se entrega allí, el día de la evaluación.'],
];

function OptionCard({ selected, title, description, onSelect, name, value }) {
  return (
    <label className={`flex cursor-pointer gap-3 rounded-xl border-2 p-4 transition ${selected ? 'border-[#0AADA8] bg-[#F0FFFE]' : 'border-[#E5E7EB] bg-white hover:border-[#9ED9D5]'}`}>
      <input type='radio' name={name} value={value} checked={selected} onChange={onSelect} className='mt-1 h-4 w-4 accent-[#0AADA8]' />
      <span><span className='block text-sm font-semibold text-[#101828]'>{title}</span><span className='mt-1 block text-xs leading-5 text-[#64748B]'>{description}</span></span>
    </label>
  );
}

export function NewEventPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const onsite = form.modalidad === 'presencial';

  const set = (changes) => {
    setForm((current) => ({ ...current, ...changes }));
    setError('');
  };
  const update = (field) => (event) => set({ [field]: event.target.value });

  const problem = () => {
    if (form.nombre.trim().length < 3) return 'Indica el nombre del concurso (al menos 3 caracteres).';
    if (form.puesto.trim().length < 2) return 'Indica el puesto.';
    if (onsite) return sessionProblem(form.presencial);
    if (!form.fechaHoraHabilitacion) return 'Indica la fecha y hora de habilitación.';
    return '';
  };

  const submit = async (event) => {
    event.preventDefault();
    const invalid = problem();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const base = {
        nombre: form.nombre.trim(),
        puesto: form.puesto.trim(),
        descripcion: form.descripcion.trim() || undefined,
        incluirModuloB: form.incluirModuloB,
      };
      const created = await eventService.createEvent(onsite
        ? { ...base, modalidad: 'presencial', presencial: toCitationPayload(form.presencial) }
        : { ...base, modalidad: 'virtual', fechaHoraHabilitacion: new Date(form.fechaHoraHabilitacion).toISOString() });
      navigate(`/company/events/${created.id}`, { replace: true });
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo crear el evento.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
      <CompanySidebar activeSection='events' onSelect={() => navigate('/company-dashboard')} />
      <main className='min-w-0 flex-1 p-5 sm:p-8'>
        <div className='mx-auto max-w-3xl'>
          <button type='button' onClick={() => navigate('/company-dashboard')} className='text-sm text-[#64748B] hover:text-[#087D79]'>← Volver a Eventos</button>
          <h1 className='mt-5 font-display text-2xl font-bold text-[#101828]'>Nuevo evento</h1>
          <p className='mt-1 text-sm text-[#64748B]'>Configura el concurso, cómo se aplicará la evaluación y cuándo.</p>

          <form onSubmit={submit} className='mt-6 space-y-6 rounded-2xl border border-[#DDE5EC] bg-white p-6 shadow-sm sm:p-7' noValidate>
            <FormField label='Nombre del concurso' htmlFor='nombre'>
              <Input id='nombre' value={form.nombre} onChange={update('nombre')} placeholder='Ej: Concurso Analista Financiero 2026' icon={<span className='text-sm'>▣</span>} required />
            </FormField>

            <FormField label='Puesto' htmlFor='puesto'>
              <Input id='puesto' value={form.puesto} onChange={update('puesto')} placeholder='Ej: Analista financiero' icon={<BriefcaseIcon className='h-4 w-4' />} required />
            </FormField>

            <fieldset>
              <legend className='mb-2 text-sm font-medium text-[#364153]'>Modalidad de la evaluación</legend>
              <div className='grid gap-3 sm:grid-cols-2'>
                {MODALITIES.map(([value, title, description]) => (
                  <OptionCard key={value} name='modalidad' value={value} title={title} description={description} selected={form.modalidad === value} onSelect={() => set({ modalidad: value })} />
                ))}
              </div>
            </fieldset>

            {onsite ? (
              <section className='rounded-xl border border-[#DDE5EC] bg-[#FAFBFC] p-5'>
                <h2 className='mb-4 text-sm font-semibold text-[#101828]'>Sede y horario</h2>
                <SessionFields value={form.presencial} onChange={(presencial) => set({ presencial })} idPrefix='presencial' />
              </section>
            ) : (
              <FormField label='Fecha y hora de habilitación' htmlFor='fechaHoraHabilitacion'>
                <input
                  id='fechaHoraHabilitacion'
                  type='datetime-local'
                  value={form.fechaHoraHabilitacion}
                  onChange={update('fechaHoraHabilitacion')}
                  className='w-full rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm text-[#101828] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/30'
                  required
                />
                <p className='mt-2 text-xs text-[#64748B]'>Esta cita aplica a todos los candidatos. La prueba estará disponible a partir de este momento.</p>
              </FormField>
            )}

            <FormField label='Descripción (opcional)' htmlFor='descripcion'>
              <textarea
                id='descripcion'
                value={form.descripcion}
                onChange={update('descripcion')}
                rows='4'
                maxLength='600'
                placeholder='Describe brevemente el propósito del evento.'
                className='w-full resize-none rounded-xl border border-[#E5E7EB] px-4 py-3 text-sm text-[#101828] placeholder:text-[#99A1AF] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/30'
              />
            </FormField>

            <fieldset>
              <legend className='mb-2 text-sm font-medium text-[#364153]'>Módulos de evaluación</legend>
              <div className='space-y-3'>
                <label className='flex gap-3 rounded-xl border border-[#E5E7EB] bg-[#FAFBFC] p-4'>
                  <input type='checkbox' checked disabled className='mt-1 h-4 w-4 accent-[#0AADA8]' />
                  <span><span className='block text-sm font-semibold text-[#101828]'>Módulo A · Cuestionario</span><span className='mt-1 block text-xs text-[#64748B]'>Se aplica a todos los candidatos del evento.</span></span>
                </label>
                <label className='flex cursor-pointer gap-3 rounded-xl border border-[#E5E7EB] p-4 hover:border-[#9ED9D5]'>
                  <input type='checkbox' checked={form.incluirModuloB} onChange={(event) => set({ incluirModuloB: event.target.checked })} className='mt-1 h-4 w-4 accent-[#0AADA8]' />
                  <span>
                    <span className='block text-sm font-semibold text-[#101828]'>Módulo B · Macrocaso</span>
                    <span className='mt-1 block text-xs leading-5 text-[#64748B]'>
                      Segunda etapa para los candidatos que elijas después de revisar su perfil del Módulo A.
                      {onsite ? ' En eventos presenciales se cita a una sesión propia, porque requiere los resultados del Módulo A publicados.' : ''}
                    </span>
                  </span>
                </label>
              </div>
              <p className='mt-2 text-xs text-[#94A3B8]'>Plan A · único plan disponible para esta demo.</p>
            </fieldset>

            {error && <p role='alert' className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600'>{error}</p>}

            <div className='flex justify-end gap-3 border-t border-[#EEF2F6] pt-5'>
              <Button type='button' variant='outline' className='h-11 px-5' onClick={() => navigate('/company-dashboard')} disabled={saving}>Cancelar</Button>
              <Button type='submit' variant='accent' className='h-11 px-6' disabled={saving}>
                {saving ? <><SpinnerIcon className='h-4 w-4 animate-spin' /> Creando...</> : 'Crear evento'}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
