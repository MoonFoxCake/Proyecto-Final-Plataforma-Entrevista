import { useEffect, useState } from 'react';
import { Button, FormField, Input } from '../components/ui';
import { ArrowRightIcon, BriefcaseIcon, MailIcon, PhoneIcon, SpinnerIcon, UserIcon } from '../components/auth/icons.jsx';
import { DashboardHeader } from '../components/ui/DashboardHeader.jsx';
import * as authService from '../services/authService';

const INITIAL_FORM = {
  displayName: '',
  email: '',
  password: '',
  phone: '',
  city: '',
  country: '',
  academicLevel: '',
  professionalArea: '',
};

export function CompanyDashboardPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadCandidates = async () => {
    try {
      setCandidates(await authService.getCandidates());
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudieron cargar los candidatos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCandidates();
  }, []);

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setError('');
    setSuccess('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await authService.createCandidateUser({
        ...form,
        displayName: form.displayName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        city: form.city.trim() || undefined,
        country: form.country.trim() || undefined,
        academicLevel: form.academicLevel.trim() || undefined,
        professionalArea: form.professionalArea.trim() || undefined,
      });
      await loadCandidates();
      setForm(INITIAL_FORM);
      setSuccess('Candidato creado correctamente.');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo crear el candidato.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <DashboardHeader title="Candidatos" subtitle="Registra y consulta los candidatos asociados a tu empresa." />
          <div className="rounded-2xl border border-[#DDE8F2] bg-white px-5 py-4 shadow-sm">
            <p className="text-xs text-[#6A7282]">Candidatos registrados</p>
            <p className="mt-1 font-display text-2xl font-bold text-[#101828]">{candidates.length}</p>
          </div>
        </div>

        {success && <p className="mb-6 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] px-4 py-3 text-sm text-[#087D79]">{success}</p>}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className="rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E0F7F6] text-[#0AADA8]"><UserIcon className="h-5 w-5" /></div>
              <div><h2 className="font-display text-lg font-bold text-[#101828]">Nuevo candidato</h2><p className="text-xs text-[#6A7282]">Su acceso quedará asociado a tu empresa.</p></div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <FormField label="Nombre completo" htmlFor="displayName"><Input id="displayName" value={form.displayName} onChange={update('displayName')} placeholder="Nombre y apellido" icon={<UserIcon className="h-4 w-4" />} required /></FormField>
              <FormField label="Correo electrónico" htmlFor="email"><Input id="email" type="email" value={form.email} onChange={update('email')} placeholder="candidato@correo.com" icon={<MailIcon className="h-4 w-4" />} required /></FormField>
              <FormField label="Contraseña temporal" htmlFor="password"><Input id="password" type="password" value={form.password} onChange={update('password')} placeholder="Mínimo 8 caracteres" required /></FormField>
              <FormField label="Teléfono (opcional)" htmlFor="phone"><Input id="phone" type="tel" value={form.phone} onChange={update('phone')} placeholder="+57 300 000 0000" icon={<PhoneIcon className="h-4 w-4" />} /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Ciudad" htmlFor="city"><Input id="city" value={form.city} onChange={update('city')} placeholder="Bogotá" /></FormField>
                <FormField label="País" htmlFor="country"><Input id="country" value={form.country} onChange={update('country')} placeholder="Colombia" /></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Nivel académico" htmlFor="academicLevel"><Input id="academicLevel" value={form.academicLevel} onChange={update('academicLevel')} placeholder="Universitario" /></FormField>
                <FormField label="Área profesional" htmlFor="professionalArea"><Input id="professionalArea" value={form.professionalArea} onChange={update('professionalArea')} placeholder="Tecnología" /></FormField>
              </div>
              {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <Button type="submit" variant="accent" className="h-12 w-full" disabled={saving}>
                {saving ? <><SpinnerIcon className="h-4 w-4 animate-spin" /> Creando candidato...</> : <>Crear candidato <ArrowRightIcon className="h-4 w-4" /></>}
              </Button>
            </form>
          </section>

          <section className="rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-lg font-bold text-[#101828]">Tus candidatos</h2><p className="mt-1 text-xs text-[#6A7282]">Solo aparecen candidatos de tu organización.</p></div><BriefcaseIcon className="h-5 w-5 text-[#0AADA8]" /></div>
            {loading ? <div className="flex min-h-56 items-center justify-center text-sm text-[#6A7282]">Cargando candidatos...</div> : candidates.length === 0 ? <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-[#DDE8F2] text-center text-sm text-[#99A1AF]">Los candidatos aparecerán aquí.</div> : <div className="space-y-3">{candidates.map((candidate) => <div key={candidate.id} className="flex items-center gap-3 rounded-xl border border-[#EDF1F5] p-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#091426] text-sm font-bold text-white">{candidate.displayName?.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#101828]">{candidate.displayName}</p><p className="truncate text-xs text-[#6A7282]">{candidate.email}{candidate.professionalArea ? ` · ${candidate.professionalArea}` : ''}</p></div><span className="ml-auto shrink-0 rounded-full bg-[#ECFDF5] px-2.5 py-1 text-xs font-medium text-[#087D79]">Candidato</span></div>)}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
