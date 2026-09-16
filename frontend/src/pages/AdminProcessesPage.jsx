import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SpinnerIcon } from '../components/auth/icons.jsx';
import * as adminReviewService from '../services/adminReviewService.js';

const STATUS_LABELS = {
  ACTIVE: 'Activo', IN_REVIEW: 'En revisión', READY_TO_PUBLISH: 'Listo para publicar', PUBLISHED: 'Publicado', FINALIZED: 'Finalizado',
};

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium' }).format(date);
}

export function AdminProcessesView() {
  const navigate = useNavigate();
  const [processes, setProcesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminReviewService.getProcesses().then(setProcesses)
      .catch((requestError) => setError(requestError.response?.data?.error?.message || 'No se pudieron cargar los procesos.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className='p-5 sm:p-8'>
      <div className='mx-auto max-w-6xl'>
        <p className='text-xs font-semibold uppercase tracking-[0.14em] text-[#0AADA8]'>Administración</p>
        <h1 className='mt-2 font-display text-2xl font-bold text-[#101828]'>Procesos</h1>
        <p className='mt-1 text-sm text-[#64748B]'>Revisa las respuestas anónimas y publica los perfiles cuando el proceso esté completo.</p>
        {error && <p className='mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>{error}</p>}
        {loading ? <div className='flex min-h-64 items-center justify-center text-sm text-[#64748B]'><SpinnerIcon className='mr-2 h-5 w-5 animate-spin' /> Cargando procesos...</div> : processes.length === 0 ? (
          <div className='mt-8 rounded-2xl border border-dashed border-[#CBD5E1] bg-white p-12 text-center text-sm text-[#94A3B8]'>Las empresas aún no han creado procesos.</div>
        ) : <div className='mt-8 grid gap-5'>
          {processes.map((process) => {
            const summary = process.summary;
            const progress = summary.totalParticipants ? (summary.reviewed / summary.totalParticipants) * 100 : 0;
            return <article key={process.id} className='rounded-2xl border border-[#DDE5EC] bg-white p-5 shadow-sm sm:p-6'>
              <div className='flex flex-col justify-between gap-5 lg:flex-row lg:items-start'>
                <div className='min-w-0'>
                  <div className='flex flex-wrap items-center gap-3'><h2 className='font-display text-lg font-bold text-[#101828]'>{process.name}</h2><span className='rounded-full bg-[#E8F8F5] px-3 py-1 text-xs font-semibold text-[#087D79]'>{STATUS_LABELS[process.status] || process.status}</span></div>
                  <p className='mt-2 text-sm font-medium text-[#475569]'>{process.company} · {process.position || 'Puesto sin especificar'}</p>
                  <p className='mt-1 text-xs text-[#7C8AA0]'>Inicio: {formatDate(process.availableFrom)} · Fin: {formatDate(process.endDate)}</p>
                </div>
                <button type='button' onClick={() => navigate(`/admin/processes/${process.id}`)} className='shrink-0 rounded-xl bg-[#0AADA8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#089490]'>Ver proceso</button>
              </div>
              <div className='mt-5 grid gap-3 border-t border-[#EEF2F6] pt-5 sm:grid-cols-3'>
                <div><p className='text-xs text-[#7C8AA0]'>Participantes</p><p className='mt-1 text-lg font-bold text-[#10233A]'>{summary.totalParticipants}</p></div>
                <div><p className='text-xs text-[#7C8AA0]'>Respuestas recibidas</p><p className='mt-1 text-lg font-bold text-[#10233A]'>{summary.responsesReceived}</p></div>
                <div><p className='text-xs text-[#7C8AA0]'>Revisados</p><p className='mt-1 text-lg font-bold text-[#10233A]'>{summary.reviewed}</p></div>
              </div>
              <div className='mt-4 flex items-center gap-4'><div className='h-2 flex-1 overflow-hidden rounded-full bg-[#E6EDF3]'><div className='h-full rounded-full bg-[#0AADA8]' style={{ width: `${progress}%` }} /></div><span className='text-xs font-semibold text-[#475569]'>{summary.reviewed} / {summary.totalParticipants}</span></div>
            </article>;
          })}
        </div>}
      </div>
    </div>
  );
}
