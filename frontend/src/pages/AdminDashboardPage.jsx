import { useEffect, useState } from 'react';
import { Button, FormField, Input } from '../components/ui';
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CheckIcon,
  MailIcon,
  PhoneIcon,
  SpinnerIcon,
  UserIcon,
} from '../components/auth/icons.jsx';
import * as authService from '../services/authService';
import { DashboardHeader } from '../components/ui/DashboardHeader.jsx';

const INITIAL_FORM = {
  companyName: '',
  nombre: '',
  apellido: '',
  email: '',
  phone: '',
  password: '',
  password2: '',
};

export function AdminDashboardPage() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

  const loadCompanies = async () => {
    try {
      setCompanies(await authService.getCompanies());
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudieron cargar las empresas.');
    } finally {
      setLoadingCompanies(false);
    }
  };

  useEffect(() => {
    loadCompanies();
  }, []);

  const update = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.');
    if (form.password !== form.password2) return setError('Las contraseñas no coinciden.');

    setLoading(true);
    setError('');
    try {
      await authService.createCompanyUser({
        companyName: form.companyName.trim(),
        displayName: `${form.nombre} ${form.apellido}`.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      });
      await loadCompanies();
      setCreated({ email: form.email.trim(), password: form.password, companyName: form.companyName.trim() });
      setForm(INITIAL_FORM);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo crear el usuario de empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-5 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <DashboardHeader
            title="Usuarios de empresa"
            subtitle="Crea el acceso inicial de cada empresa para que pueda gestionar sus procesos y candidatos."
          />
          <div className="rounded-2xl border border-[#DDE8F2] bg-white px-5 py-4 shadow-sm">
            <p className="text-xs text-[#6A7282]">Altas en esta sesión</p>
            <p className="mt-1 font-display text-2xl font-bold text-[#101828]">{companies.length}</p>
          </div>
        </div>

        {created && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-[#A7E4DE] bg-[#F0FFFE] p-4 text-sm text-[#087D79]">
            <CheckIcon className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Usuario creado para {created.companyName}</p>
              <p className="mt-1">Comparte estas credenciales de acceso de forma segura: {created.email} / {created.password}</p>
            </div>
            <button type="button" className="ml-auto text-xs font-semibold underline" onClick={() => setCreated(null)}>Cerrar</button>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className="rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E0F7F6] text-[#0AADA8]"><BriefcaseIcon className="h-5 w-5" /></div>
              <div><h2 className="font-display text-lg font-bold text-[#101828]">Nueva cuenta</h2><p className="text-xs text-[#6A7282]">El usuario recibirá rol de empresa.</p></div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <FormField label="Empresa" htmlFor="companyName"><Input id="companyName" value={form.companyName} onChange={update('companyName')} placeholder="TechCorp S.A." icon={<BriefcaseIcon className="h-4 w-4" />} required /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Nombre" htmlFor="nombre"><Input id="nombre" value={form.nombre} onChange={update('nombre')} placeholder="María" icon={<UserIcon className="h-4 w-4" />} required /></FormField>
                <FormField label="Apellido" htmlFor="apellido"><Input id="apellido" value={form.apellido} onChange={update('apellido')} placeholder="González" icon={<UserIcon className="h-4 w-4" />} required /></FormField>
              </div>
              <FormField label="Correo corporativo" htmlFor="email"><Input id="email" type="email" value={form.email} onChange={update('email')} placeholder="contacto@empresa.com" icon={<MailIcon className="h-4 w-4" />} required /></FormField>
              <FormField label="Teléfono (opcional)" htmlFor="phone"><Input id="phone" type="tel" value={form.phone} onChange={update('phone')} placeholder="+57 300 000 0000" icon={<PhoneIcon className="h-4 w-4" />} /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Contraseña temporal" htmlFor="password"><Input id="password" type="password" value={form.password} onChange={update('password')} placeholder="Mínimo 8 caracteres" required /></FormField>
                <FormField label="Confirmar" htmlFor="password2"><Input id="password2" type="password" value={form.password2} onChange={update('password2')} placeholder="Repite la contraseña" required /></FormField>
              </div>
              {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
              <Button type="submit" variant="accent" className="h-12 w-full" disabled={loading}>
                {loading ? <><SpinnerIcon className="h-4 w-4 animate-spin" /> Creando cuenta...</> : <>Crear usuario de empresa <ArrowRightIcon className="h-4 w-4" /></>}
              </Button>
            </form>
          </section>

          <section className="rounded-2xl border border-[#E5EAF0] bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center justify-between"><div><h2 className="font-display text-lg font-bold text-[#101828]">Empresas registradas</h2><p className="mt-1 text-xs text-[#6A7282]">Usuarios agrupados por empresa.</p></div><span className="rounded-full bg-[#E0F7F6] px-3 py-1 text-xs font-semibold text-[#087D79]">{companies.length}</span></div>
            {loadingCompanies ? <div className="flex min-h-56 items-center justify-center text-sm text-[#6A7282]">Cargando empresas...</div> : companies.length === 0 ? <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-[#DDE8F2] text-center text-sm text-[#99A1AF]">Las empresas aparecerán aquí.</div> : <div className="space-y-4">{companies.map((company) => <div key={company.id} className="rounded-xl border border-[#EDF1F5] p-4"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#101828]">{company.companyName || company.name}</p><p className="text-xs text-[#6A7282]">{company.users.length} usuario(s)</p></div><BriefcaseIcon className="h-5 w-5 shrink-0 text-[#0AADA8]" /></div><div className="mt-3 space-y-2">{company.users.map((user) => <div key={user.id} className="flex items-center gap-3 border-t border-[#F1F3F5] pt-2"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#091426] text-xs font-bold text-white">{user.displayName?.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div><div className="min-w-0"><p className="truncate text-xs font-semibold text-[#101828]">{user.displayName}</p><p className="truncate text-xs text-[#6A7282]">{user.email}</p></div></div>)}</div></div>)}</div>}
          </section>
        </div>
      </div>
    </div>
  );
}
