import { useState } from 'react';
import { Button, FormField, Input } from '../ui';
import { MailIcon, SpinnerIcon, UserIcon } from '../auth/icons.jsx';
import * as eventService from '../../services/eventService.js';

const EMPTY_FORM = {
  nombreCompleto: '',
  cedula: '',
  correo: '',
};

export function CandidateForm({ eventId, onCreated, onCancel }) {
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
      const candidate = await eventService.createEventCandidate(eventId, {
        nombreCompleto: form.nombreCompleto.trim(),
        cedula: form.cedula.trim(),
        correo: form.correo.trim(),
      });
      setForm(EMPTY_FORM);
      onCreated(candidate);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo registrar el candidato.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className='rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm sm:p-6'>
      <h2 className='font-display text-base font-bold text-[#101828]'>Agregar candidato</h2>
      <p className='mt-1 text-xs text-[#64748B]'>Quedará asociado a este evento y utilizará su fecha común de habilitación.</p>
      <form onSubmit={submit} className='mt-5 grid gap-4 lg:grid-cols-3' noValidate>
        <FormField label='Nombre completo' htmlFor='nombreCompleto'>
          <Input
            id='nombreCompleto'
            value={form.nombreCompleto}
            onChange={update('nombreCompleto')}
            placeholder='María Demo'
            icon={<UserIcon className='h-4 w-4' />}
            required
          />
        </FormField>
        <FormField label='Cédula' htmlFor='cedula'>
          <Input
            id='cedula'
            value={form.cedula}
            onChange={update('cedula')}
            placeholder='123456789'
            icon={<span className='text-xs font-bold'>ID</span>}
            required
          />
        </FormField>
        <FormField label='Correo electrónico' htmlFor='correo'>
          <Input
            id='correo'
            type='email'
            value={form.correo}
            onChange={update('correo')}
            placeholder='maria@email.com'
            icon={<MailIcon className='h-4 w-4' />}
            required
          />
        </FormField>
        {error && <p className='rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 lg:col-span-3'>{error}</p>}
        <div className='flex justify-end gap-3 lg:col-span-3'>
          <Button type='button' variant='outline' className='h-10 px-5' onClick={onCancel} disabled={saving}>Cancelar</Button>
          <Button type='submit' variant='accent' className='h-10 px-5' disabled={saving}>
            {saving ? <><SpinnerIcon className='h-4 w-4 animate-spin' /> Registrando...</> : 'Registrar candidato'}
          </Button>
        </div>
      </form>
    </section>
  );
}
