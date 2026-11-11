import { useEffect, useState } from 'react';
import { SpinnerIcon } from '../components/auth/icons.jsx';
import * as settingsService from '../services/settingsService.js';

const FIELD = 'mt-1.5 w-full rounded-xl border border-[#D9E2EA] bg-white px-3.5 py-2.5 text-sm text-[#10233A] focus:border-[#0AADA8] focus:outline-none focus:ring-2 focus:ring-[#0AADA8]/20';
const PLAN_IDS = ['fase-a', 'fase-a-b', 'completo'];
const WINDOWS = [10, 15, 20, 30, 45, 60, 90, 120];
const TABS = [['landing', 'Página de inicio'], ['plans', 'Planes'], ['evaluation', 'Sesiones presenciales'], ['emails', 'Correos']];

const LANDING_FIELDS = [
  ['badge', 'Etiqueta superior'], ['heroTitle', 'Título principal'], ['heroHighlight', 'Parte resaltada del título'], ['heroText', 'Texto principal', true],
  ['aboutTitle', 'Título de “Quiénes somos”'], ['aboutText', 'Texto de “Quiénes somos”', true], ['benefitsTitle', 'Título de beneficios'],
  ['plansTitle', 'Título de planes'], ['plansText', 'Texto de planes', true], ['contactTitle', 'Título de contacto'], ['contactText', 'Texto de contacto', true],
];
const EMAIL_FIELDS = [
  ['invitationSubject', 'Asunto · Invitación Módulo A'], ['invitationIntro', 'Introducción · Invitación Módulo A', true],
  ['moduleBSubject', 'Asunto · Módulo B'], ['moduleBIntro', 'Introducción · Módulo B', true], ['moduleBNote', 'Nota · Módulo B', true],
  ['moduleCSubject', 'Asunto · Módulo C'], ['moduleCIntro', 'Introducción · Módulo C', true], ['moduleCNote', 'Nota · Módulo C', true],
  ['citationClosing', 'Cierre de las citaciones presenciales', true], ['resultSubject', 'Asunto · Resultado entregado'], ['resultBody', 'Mensaje · Resultado entregado', true],
];

function TextField({ label, value, onChange, multiline }) {
  return <label className="block text-sm font-medium text-[#334E68]">{label}{multiline ? <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} className={`${FIELD} resize-y`} /> : <input value={value} onChange={(event) => onChange(event.target.value)} className={FIELD} />}</label>;
}

/** "Configuración": what the administrator can change without touching the code. */
export function AdminSettingsPage() {
  const [settings, setSettings] = useState(null);
  const [tab, setTab] = useState('landing');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    settingsService.getSettings().then(setSettings).catch((requestError) => setError(requestError.response?.data?.error?.message || 'No se pudo cargar la configuración.'));
  }, []);

  const patch = (section, field, value) => { setNotice(''); setSettings((current) => ({ ...current, [section]: { ...current[section], [field]: value } })); };
  const patchPlan = (planId, field, value) => patch('plans', planId, { ...settings.plans[planId], [field]: value });
  const patchBenefit = (index, field, value) => patch('landing', 'benefits', settings.landing.benefits.map((benefit, position) => (position === index ? { ...benefit, [field]: value } : benefit)));

  const save = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { landing, plans, evaluation, emails, notifications } = settings;
      setSettings(await settingsService.updateSettings({ landing, plans, evaluation, emails, notifications }));
      setNotice('Configuración guardada.');
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message || 'No se pudo guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="p-5 sm:p-8"><div className="mx-auto max-w-4xl">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]">Administración</p><h1 className="mt-2 font-display text-2xl font-bold text-[#101828]">Configuración</h1><p className="mt-2 text-sm leading-6 text-[#64748B]">Personaliza los textos públicos, los planes y los correos.</p></div>
      <button type="button" onClick={save} disabled={saving || !settings} className="inline-flex items-center gap-2 rounded-xl bg-[#0AADA8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#089490] disabled:opacity-50">{saving && <SpinnerIcon className="h-4 w-4 animate-spin" />}{saving ? 'Guardando…' : 'Guardar cambios'}</button>
    </header>
    {notice && <p role="status" className="mt-5 rounded-xl border border-[#A7E4DE] bg-[#F0FFFE] p-3 text-sm text-[#087D79]">{notice}</p>}
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {!settings ? !error && <div role="status" className="mt-8 rounded-2xl bg-white p-10 text-center text-sm text-[#64748B]">Cargando configuración…</div> : <>
      <div role="tablist" aria-label="Secciones de configuración" className="mt-6 flex flex-wrap gap-1 rounded-xl border border-[#DDE5EC] bg-white p-1">
        {TABS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-[#0AADA8] text-white' : 'text-[#475569] hover:bg-[#F6F9FC]'}`}>{label}</button>)}
      </div>
      <section className="mt-5 space-y-5 rounded-2xl border border-[#DDE5EC] bg-white p-5 sm:p-6">
        {tab === 'landing' && <>
          {LANDING_FIELDS.map(([field, label, multiline]) => <TextField key={field} label={label} multiline={multiline} value={settings.landing[field]} onChange={(value) => patch('landing', field, value)} />)}
          {settings.landing.benefits.map((benefit, index) => <div key={index} className="rounded-xl bg-[#F7F9FC] p-4"><p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#087D79]">Beneficio {index + 1}</p><div className="space-y-3"><TextField label="Título" value={benefit.title} onChange={(value) => patchBenefit(index, 'title', value)} /><TextField label="Descripción" multiline value={benefit.body} onChange={(value) => patchBenefit(index, 'body', value)} /></div></div>)}
        </>}
        {tab === 'plans' && PLAN_IDS.map((planId) => {
          const plan = settings.plans[planId];
          return <div key={planId} className="rounded-xl bg-[#F7F9FC] p-4"><div className="grid gap-3 sm:grid-cols-2"><TextField label="Nombre del plan" value={plan.name} onChange={(value) => patchPlan(planId, 'name', value)} /><TextField label="Precio" value={plan.price} onChange={(value) => patchPlan(planId, 'price', value)} /></div><div className="mt-3 space-y-3"><TextField label="Descripción" multiline value={plan.description} onChange={(value) => patchPlan(planId, 'description', value)} /><label className="block text-sm font-medium text-[#334E68]">Características (una por línea)<textarea rows={4} value={plan.features.join('\n')} onChange={(event) => patchPlan(planId, 'features', event.target.value.split('\n'))} onBlur={(event) => patchPlan(planId, 'features', event.target.value.split('\n').map((line) => line.trim()).filter(Boolean))} className={`${FIELD} resize-y`} /></label></div></div>;
        })}
        {tab === 'evaluation' && <>
          <label className="block text-sm font-medium text-[#334E68]">Ventana de inicio por defecto en sesiones presenciales<select value={settings.evaluation.defaultEntryWindowMinutes} onChange={(event) => patch('evaluation', 'defaultEntryWindowMinutes', Number(event.target.value))} className={FIELD}>{WINDOWS.map((minutes) => <option key={minutes} value={minutes}>{minutes} minutos</option>)}</select><span className="mt-1 block text-xs font-normal text-[#64748B]">Es solo el valor que aparece sugerido: la empresa puede cambiarlo en cada sesión.</span></label>
          <p className="rounded-xl bg-[#F7F9FC] p-3 text-xs leading-5 text-[#64748B]">La empresa decide cuándo se abre y se cierra el enlace de cada fase virtual. El tiempo límite del Módulo A se define en cada grupo del Banco de Preguntas; el de los Módulos B y C, en cada caso.</p>
        </>}
        {tab === 'emails' && <>
          <label className="block text-sm font-medium text-[#334E68]">Correo que recibe los avisos de fases terminadas<input type="email" value={settings.notifications.adminEmail} onChange={(event) => patch('notifications', 'adminEmail', event.target.value)} className={FIELD} placeholder="administracion@empresa.com" /><span className="mt-1 block text-xs font-normal text-[#64748B]">Si lo dejas vacío, las fases terminadas solo aparecen en Resultados.</span></label>
          <p className="rounded-xl bg-[#F7F9FC] p-3 text-xs leading-5 text-[#64748B]">Puedes usar las variables <code>{'{empresa}'}</code>, <code>{'{evento}'}</code> y, en los resultados, <code>{'{fase}'}</code>.</p>
          {EMAIL_FIELDS.map(([field, label, multiline]) => <TextField key={field} label={label} multiline={multiline} value={settings.emails[field]} onChange={(value) => patch('emails', field, value)} />)}
        </>}
      </section>
    </>}
  </div></div>;
}
