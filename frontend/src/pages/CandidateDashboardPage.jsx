import { useEffect, useState } from 'react';
import { DashboardSkeleton } from '../components/ui/DashboardSkeleton.jsx';

export function CandidateDashboardPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F8FAFC] p-8">
        <DashboardSkeleton label="Cargando panel del candidato" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-8">
      <h1 className="font-display text-2xl font-bold text-[#101828]">Panel del candidato</h1>
      <p className="mt-2 text-sm text-[#6A7282]">Pagina para los candidatos.</p>
    </div>
  );
}
