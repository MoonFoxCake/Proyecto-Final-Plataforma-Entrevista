import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CompanySidebar } from '../components/company/CompanySidebar.jsx';
import { Button, FormField, Input } from '../components/ui';
import { BriefcaseIcon, SpinnerIcon } from '../components/auth/icons.jsx';
import * as eventService from '../services/eventService.js';

const EMPTY_FORM = {
  nombre: '',
  puesto: '',
  fechaHoraHabilitacion: '',
  descripcion: '',
};

export function NewEventPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await eventService.createEvent({
        nombre: form.nombre.trim(),
        puesto: form.puesto.trim(),
        descripcion: form.descripcion.trim() || undefined,
        fechaHoraHabilitacion: new Date(form.fechaHoraHabilitacion).toISOString(),
      });
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
          <p className='mt-1 text-sm text-[#64748B]'>Configura el concurso y la hora común a partir de la cual se habilitará la evaluación.</p>

          <form onSubmit={submit} className='mt-6 space-y-5 rounded-2xl border border-[#DDE5EC] bg-white p-6 shadow-sm sm:p-7' noValidate>
            <FormField label='Nombre del concurso' htmlFor='nombre'>
              <Input id='nombre' value={form.nombre} onChange={update('nombre')} placeholder='Ej: Concurso Analista Financiero 2026' icon={<span className='text-sm'>▣</span>} required />
            </FormField>

            <FormField label='Puesto' htmlFor='puesto'>
              <Input id='puesto' value={form.puesto} onChange={update('puesto')} placeholder='Ej: Analista financiero' icon={<BriefcaseIcon className='h-4 w-4' />} required />
            </FormField>

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

            <div>
              <p className='mb-2 text-sm font-medium text-[#364153]'>Plan de evaluación</p>
              <div className='rounded-xl border-2 border-[#0AADA8] bg-[#F0FFFE] p-4'>
                <div className='flex items-center justify-between gap-3'><div><p className='text-sm font-semibold text-[#101828]'>Plan A</p><p className='mt-1 text-xs text-[#64748B]'>Único plan disponible para esta demo.</p></div><span className='rounded-full bg-[#0AADA8] px-2.5 py-1 text-xs font-semibold text-white'>Seleccionado</span></div>
              </div>
            </div>

            {error && <p className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600'>{error}</p>}

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
