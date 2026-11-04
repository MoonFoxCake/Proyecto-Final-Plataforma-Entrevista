import { useCallback, useEffect, useState } from 'react';
import { Navigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { OnsitePrepareStage } from '../../components/onsite/OnsitePrepareStage.jsx';
import { OnsiteOrganizeStage } from '../../components/onsite/OnsiteOrganizeStage.jsx';
import { OnsiteApplyStage } from '../../components/onsite/OnsiteApplyStage.jsx';
import * as credentialService from '../../services/credentialService.js';

const STAGES = [
  ['preparar', 'Preparar accesos', 'Genera e imprime los accesos temporales para los candidatos seleccionados.'],
  ['organizar', 'Organizar', 'Revisa qué está listo y descarga la lista de asistencia.'],
  ['aplicar', 'Aplicar', 'Sigue el ingreso el día de la evaluación: los accesos se activan solos a la hora de inicio.'],
];

const errorMessage = (error, fallback) => error.response?.data?.error?.message || fallback;

/**
 * "Aplicación presencial": module A/B and three stages (prepare, organize,
 * apply). Not a wizard: any stage can be opened at any time. The module and
 * the stage live in the URL (`?modulo=B&etapa=aplicar`).
 */
export function EventOnsiteTab() {
  const { eventId, event, candidates, notify, state } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const modules = state.hasModuleB ? ['A', 'B'] : ['A'];
  const module = modules.includes(searchParams.get('modulo')) ? searchParams.get('modulo') : 'A';
  const stage = STAGES.some(([id]) => id === searchParams.get('etapa')) ? searchParams.get('etapa') : 'preparar';
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    try {
      setError('');
      setSummary(await credentialService.getCredentials(eventId));
    } catch (requestError) {
      setError(errorMessage(requestError, 'No se pudo cargar el estado de los accesos.'));
    }
  }, [eventId]);

  // Reload when the candidates change (new ones, Module B citations).
  const candidatesVersion = candidates.map((candidate) => `${candidate.id}:${candidate.status}:${candidate.moduleB?.status ?? ''}`).join('|');
  useEffect(() => { if (state.onsite) loadSummary(); }, [loadSummary, candidatesVersion, state.onsite]);

  // Online events have no onsite application (only once the event is known).
  if (event && !state.onsite) return <Navigate to='..' replace />;

  const go = (changes) => setSearchParams({ modulo: module, etapa: stage, ...changes });
  const moduleSummary = summary?.modules.find((item) => item.module === module);

  return (
    <div className='space-y-6'>
      <div className='flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between'>
        <nav aria-label='Etapas de la aplicación presencial'>
          <ol className='flex flex-wrap gap-2'>
            {STAGES.map(([id, label], index) => (
              <li key={id}>
                <button
                  type='button'
                  onClick={() => go({ etapa: id })}
                  aria-current={stage === id ? 'step' : undefined}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 ${stage === id ? 'border-[#0AADA8] bg-[#F0FFFE] text-[#087D79]' : 'border-[#DDE5EC] bg-white text-[#475569] hover:border-[#9ED9D5]'}`}
                >
                  <span aria-hidden='true' className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${stage === id ? 'bg-[#0AADA8] text-white' : 'bg-[#F1F5F9] text-[#64748B]'}`}>{index + 1}</span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        {modules.length > 1 && (
          <div className='flex items-center gap-2'>
            <span id='module-label' className='text-xs font-medium text-[#64748B]'>Módulo</span>
            <div role='group' aria-labelledby='module-label' className='inline-flex rounded-xl border border-[#DDE5EC] bg-white p-1'>
              {modules.map((item) => (
                <button
                  key={item}
                  type='button'
                  aria-pressed={module === item}
                  onClick={() => go({ modulo: item })}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0AADA8]/40 ${module === item ? 'bg-[#10233A] text-white' : 'text-[#475569] hover:bg-[#F6F9FC]'}`}
                >
                  {item === 'A' ? 'A · Cuestionario' : 'B · Macrocaso'}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className='text-sm text-[#56677B]'>{STAGES.find(([id]) => id === stage)[2]}</p>

      {error && <p role='alert' className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'>{error}</p>}

      {stage === 'preparar' && <OnsitePrepareStage event={event} module={module} summary={moduleSummary} loaded={Boolean(summary)} reload={loadSummary} notify={notify} />}
      {stage === 'organizar' && <OnsiteOrganizeStage eventId={eventId} module={module} summary={moduleSummary} loaded={Boolean(summary)} onPrepare={() => go({ etapa: 'preparar' })} notify={notify} />}
      {stage === 'aplicar' && <OnsiteApplyStage event={event} module={module} notify={notify} onCredentialsChanged={loadSummary} />}
    </div>
  );
}
