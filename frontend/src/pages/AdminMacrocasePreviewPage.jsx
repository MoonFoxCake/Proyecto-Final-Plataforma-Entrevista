import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EvaluationHeader } from '../components/evaluation/EvaluationHeader.jsx';
import { MacrocasePreviewFlow } from '../components/evaluation/macrocase/MacrocasePreviewFlow.jsx';
import { usableSections } from '../components/evaluation/macrocase/macrocaseSources.js';
import { getMacroCase } from '../services/macrocaseApi.js';

/**
 * Lets an admin go through a saved macrocase exactly as a candidate would,
 * with its generated voices and lip-sync. Nothing is submitted.
 */
export function AdminMacrocasePreviewPage() {
  const { macrocaseId } = useParams();
  const [macrocase, setMacrocase] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    getMacroCase(macrocaseId)
      .then((data) => active && setMacrocase(data))
      .catch((requestError) => active && setError(requestError.message || 'No se pudo cargar el macrocaso.'));
    return () => { active = false; };
  }, [macrocaseId]);

  // The candidate only gets sections with a narrative and questions with text.
  const noQuestions = macrocase && usableSections(macrocase).length === 0;

  return (
    <div className='min-h-screen bg-[#F6F9FC]'>
      <EvaluationHeader />
      <div className='border-b border-amber-200 bg-amber-50'>
        <div className='mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-2.5 text-xs text-amber-800'>
          <span><strong>Vista previa del candidato</strong> · Las respuestas no se guardan.</span>
          <Link to='/admin-dashboard?section=macrocasos' className='font-semibold hover:underline'>← Volver al banco de macrocasos</Link>
        </div>
      </div>

      {!macrocase && !error && <div className='flex min-h-[60vh] items-center justify-center text-sm text-[#64748B]'>Cargando macrocaso...</div>}
      {error && <p className='mx-auto mt-16 max-w-xl rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700'>{error}</p>}
      {noQuestions && <p className='mx-auto mt-16 max-w-xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800'>Este macrocaso no tiene secciones completas. Edítalo y agrega a cada sección su texto y al menos una pregunta.</p>}
      {macrocase && !noQuestions && <MacrocasePreviewFlow macrocase={macrocase} />}
    </div>
  );
}
