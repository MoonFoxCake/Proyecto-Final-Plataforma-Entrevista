import { useAuth } from '../hooks/useAuth.js';
import { can } from '../utils/adminPermissions.js';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AdminSidebar, refreshPendingResults } from '../components/admin/AdminSidebar.jsx';
import * as adminReviewService from '../services/adminReviewService.js';
import * as resultsApi from '../services/resultDeliveryService.js';
import { PHASE_REPORT_LABELS } from './adminProcesses.js';

const PARTICIPANT_LABELS = { NO_RESPONSE: 'Sin respuesta', PENDING_REVIEW: 'Respondido', REVIEWED: 'Revisado', WITHDRAWN: 'Retirado' };
const STAGE_LABELS = { INVITATION_SENT: 'Enviado', CITED: 'Citado', COMPLETED: 'Respondido', WITHDRAWN: 'Retirado', INVITATION_FAILED: 'Error de envío' };
const PHASES = { A: 'Fase A · Cuestionario', B: 'Fase B · Macrocaso', C: 'Fase C · Microcaso' };
const STATE_STYLES = {
  DELIVERED: 'bg-emerald-50 text-emerald-800',
  PENDING: 'bg-amber-50 text-amber-800',
  IN_PROGRESS: 'bg-[#E0F7F6] text-[#087D79]',
  NOT_STARTED: 'bg-slate-100 text-slate-600',
};

function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value._seconds != null ? value._seconds * 1000 : value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('es-GT', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(date);
}

/** One phase: how it is going and its PDF (upload it when finished, open it once delivered). */
function PhaseResult({ process, module, canDeliver, onDelivered }) {
  const state = process.reports?.[module] || 'NOT_STARTED';
  const stats = process.summary.phases?.[module] || { total: 0, completed: 0, withdrawn: 0 };
  const result = process.results?.[module];
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const deliver = async () => {
    if (!file) { setError('Selecciona el PDF antes de entregarlo.'); return; }
    if (file.type !== 'application/pdf') { setError('El archivo debe ser PDF.'); return; }
    setBusy(true); setError('');
    try { await resultsApi.uploadResult(process.id, module, file); setFile(null); await onDelivered(module); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  };

  const open = async () => {
    setError('');
    // Opened right away so the browser does not block it, then pointed at the signed link.
    const tab = window.open('', '_blank');
    try {
      const { url } = await resultsApi.getResultUrl(process.id, module);
      if (tab) tab.location.href = url; else window.location.assign(url);
    } catch (requestError) {
      tab?.close();
      setError(requestError.message);
    }
  };

  const caseName = module === 'B' ? process.macrocaseName : module === 'C' ? process.microcaseName : process.questionnaire?.name;
  return <article aria-label={PHASES[module]} className='rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm'>
    <div className='flex flex-wrap items-start justify-between gap-3'>
      <div className='min-w-0'>
        <h3 className='font-display font-bold text-[#101828]'>{PHASES[module]}</h3>
        {caseName && <p className='mt-1 break-words text-xs text-[#64748B]'>{module === 'A' ? 'Cuestionario' : module === 'B' ? 'Macrocaso' : 'Microcaso'}: {caseName}</p>}
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATE_STYLES[state]}`}>{PHASE_REPORT_LABELS[state]}</span>
    </div>
    <p className='mt-3 text-sm text-[#475569]'>
      <strong className='tabular-nums'>{stats.completed}</strong> de <strong className='tabular-nums'>{stats.total - (stats.withdrawn || 0)}</strong> respondieron{stats.withdrawn ? ` · ${stats.withdrawn} ${stats.withdrawn === 1 ? 'retirado' : 'retirados'}` : ''}
    </p>

    {state === 'DELIVERED' && <div className='mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F6FAFC] p-3'>
      <p className='min-w-0 break-words text-xs text-[#475569]'><span className='font-semibold text-[#10233A]'>{result?.fileName || 'Resultado'}</span> · entregado el {formatDate(result?.deliveredAt, true)}</p>
      <button type='button' onClick={open} className='shrink-0 rounded-lg border border-[#D9E2EA] bg-white px-3.5 py-2 text-xs font-semibold text-[#087D79] hover:border-[#0AADA8]'>Ver PDF</button>
    </div>}

    {state === 'PENDING' && (canDeliver ? <div className='mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4'>
      <p className='text-xs text-amber-900'>La fase terminó. Revisa las respuestas de los participantes y sube el PDF: la empresa lo recibirá por correo y podrá continuar.</p>
      <div className='mt-3 flex flex-wrap items-center gap-3'>
        <input type='file' accept='application/pdf,.pdf' aria-label={`PDF de la ${PHASES[module]}`} onChange={(event) => { setFile(event.target.files?.[0] || null); setError(''); }} className='max-w-full text-sm' />
        <button type='button' onClick={deliver} disabled={busy} className='rounded-lg bg-[#087D79] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50'>{busy ? 'Subiendo…' : 'Subir PDF y entregar'}</button>
      </div>
    </div> : <p className='mt-4 text-xs text-[#64748B]'>La fase terminó y espera su PDF. Tu cuenta no tiene permiso para entregarlo.</p>)}

    {state === 'IN_PROGRESS' && <p className='mt-4 text-xs leading-5 text-[#64748B]'>El PDF se habilita cuando todos los convocados respondan o cuando la empresa cierre la fase con quienes ya respondieron.</p>}
    {state === 'NOT_STARTED' && <p className='mt-4 text-xs text-[#94A3B8]'>La empresa todavía no ha convocado a nadie a esta fase.</p>}
    {error && <p role='alert' className='mt-3 text-sm text-red-700'>{error}</p>}
  </article>;
}

export function AdminProcessDetailPage() {
  const { eventId } = useParams();
  const { profile } = useAuth();
  const canDeliver = can(profile, 'results.deliver');
  const navigate = useNavigate();
  const [process, setProcess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => adminReviewService.getProcess(eventId).then(setProcess).catch((requestError) => setError(requestError.response?.data?.error?.message || 'No se pudo cargar el proceso.')).finally(() => setLoading(false)), [eventId]);
  useEffect(() => { load(); }, [load]);

  const delivered = async (module) => {
    setNotice(`PDF de la Fase ${module} entregado. La empresa ya puede descargarlo.`);
    refreshPendingResults();
    await load();
  };

  return <div className='min-h-screen bg-[#F7F9FC] lg:flex'>
    <AdminSidebar activeSection='results' onSelect={(section) => navigate(`/admin-dashboard?section=${encodeURIComponent(section)}`)} />
    <main className='min-w-0 flex-1 p-5 sm:p-8'><div className='mx-auto max-w-6xl'>
      <button type='button' onClick={() => navigate('/admin-dashboard?section=results')} className='text-sm text-[#64748B] hover:text-[#087D79]'>← Volver a resultados</button>
      {loading ? <div className='flex min-h-80 items-center justify-center text-sm text-[#64748B]'>Cargando proceso...</div> : error && !process ? <p className='mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>{error}</p> : process && <>
        <header className='mt-5 border-b border-[#DCE3EA] pb-6'>
          <h1 className='font-display text-2xl font-bold text-[#101828]'>{process.name}</h1>
          <p className='mt-2 text-sm text-[#475569]'>{process.company} · {process.position || 'Puesto sin especificar'} · {process.modality === 'onsite' ? 'Presencial' : 'Virtual'}</p>
          <p className='mt-2 text-xs text-[#7C8AA0]'>Creado: {formatDate(process.createdAt)} · Inicio: {formatDate(process.availableFrom)}</p>
        </header>
        {notice && <p role='status' className='mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800'>{notice}</p>}

        <section aria-labelledby='phase-results' className='mt-6'>
          <h2 id='phase-results' className='font-display text-lg font-bold text-[#10233A]'>Resultados por fase</h2>
          <div className='mt-4 grid gap-4 lg:grid-cols-3'>
            {['A', 'B', 'C'].filter((module) => process.modules.includes(module)).map((module) => <PhaseResult key={module} process={process} module={module} canDeliver={canDeliver} onDelivered={delivered} />)}
          </div>
        </section>

        <section className='mt-8 overflow-hidden rounded-2xl border border-[#DDE5EC] bg-white shadow-sm'><div className='border-b border-[#E8EDF2] px-5 py-5'><h2 className='font-display font-bold text-[#101828]'>Participantes anónimos</h2><p className='mt-1 text-xs text-[#64748B]'>Revisión a ciegas: la identidad de los candidatos no está disponible en esta vista. Abre cada participante para ver sus respuestas de todas las fases.</p></div><div className='overflow-x-auto'><table className='w-full min-w-[680px] text-left'><thead className='bg-[#FAFBFC] text-[11px] uppercase tracking-wide text-[#718096]'><tr><th className='px-5 py-3'>Participante</th><th className='px-5 py-3'>Fase A</th><th className='px-5 py-3'>Fase B</th><th className='px-5 py-3'>Fase C</th><th className='px-5 py-3 text-right'>Respuestas</th></tr></thead><tbody className='divide-y divide-[#E8EDF2]'>{process.participants.map((participant) => <tr key={participant.anonymousId}><td className='px-5 py-4 font-semibold text-[#10233A]'>{participant.anonymousId}</td><td className='px-5 py-4'><span className='rounded-full bg-[#F1F5F9] px-3 py-1 text-xs font-medium text-[#475569]'>{PARTICIPANT_LABELS[participant.status]}</span>{participant.submittedAt && <span className='ml-2 text-xs text-[#94A3B8]'>{formatDate(participant.submittedAt, true)}</span>}</td><td className='px-5 py-4 text-sm text-[#56677B]'>{STAGE_LABELS[participant.moduleBStatus] || '—'}</td><td className='px-5 py-4 text-sm text-[#56677B]'>{STAGE_LABELS[participant.moduleCStatus] || '—'}</td><td className='px-5 py-4 text-right'>{['NO_RESPONSE', 'WITHDRAWN'].includes(participant.status) ? <span className='text-xs text-[#A0AEC0]'>—</span> : <button type='button' onClick={() => navigate(`/admin/processes/${eventId}/participants/${participant.anonymousId}`)} className='rounded-lg border border-[#D9E2EA] px-3.5 py-2 text-xs font-semibold text-[#334E68] hover:border-[#0AADA8] hover:text-[#087D79]'>Ver respuestas</button>}</td></tr>)}
          {process.participants.length === 0 && <tr><td colSpan='5' className='px-5 py-8 text-center text-sm text-[#94A3B8]'>Este proceso aún no tiene participantes.</td></tr>}</tbody></table></div></section>
      </>}
    </div></main>
  </div>;
}
