import { Link, useNavigate, useSearchParams } from 'react-router-dom';

const plans = [
  { id: 'fase-a', name: 'Fase A', price: '₡XXX', features: ['Cuestionario Likert', 'Perfil inicial', 'Comparación con perfil ideal', 'Reporte descargable'] },
  { id: 'fase-a-b', name: 'Fase A + B', price: '₡XXX', features: ['Todo lo incluido en Fase A', 'Macrocaso profesional', 'Evaluación por criterios', 'Resultados por fase'] },
  { id: 'completo', name: 'Plan completo', price: '₡XXX', features: ['Todo lo incluido en A + B', 'Microcasos (Fase C)', 'Perfil final integral', 'Comparación multidimensional'] },
];
export function PlanSelectionPage() {
  const [params] = useSearchParams(); const navigate = useNavigate();
  const selected = plans.find(p => p.id === params.get('plan'));
  return <main className="min-h-screen bg-[#F7F9FC] px-5 py-12 text-[#101828]"><div className="mx-auto max-w-5xl"><Link to="/" className="text-sm font-semibold text-teal-700">← Volver a NexoPerfil</Link><div className="mt-7 text-center"><p className="text-sm font-bold uppercase tracking-widest text-teal-700">Planes empresariales</p><h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Selecciona tu plan</h1><p className="mt-3 text-slate-600">Elige las fases que mejor se adapten a tu proceso de selección.</p></div><div className="mt-10 grid gap-5 md:grid-cols-3">{plans.map(p=><article key={p.id} className={`rounded-2xl border bg-white p-6 ${selected?.id===p.id?'border-teal-500 ring-2 ring-teal-500/20':'border-slate-200'}`}><h2 className="text-xl font-bold">{p.name}</h2><p className="mt-3 text-2xl font-black">{p.price}</p><ul className="my-6 space-y-3 text-sm text-slate-600">{p.features.map(f=><li key={f}>✓ {f}</li>)}</ul><button onClick={()=>navigate(`/register?plan=${p.id}`)} className="w-full rounded-xl bg-[#0B1F33] px-4 py-3 font-bold text-white hover:bg-teal-800">Continuar con este plan</button></article>)}</div><p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">La contratación de esta versión es una simulación para validar el flujo. No ingreses datos de tarjetas ni se realizará ningún cobro real. El precio definitivo debe configurarse antes de producción.</p></div></main>;
}
