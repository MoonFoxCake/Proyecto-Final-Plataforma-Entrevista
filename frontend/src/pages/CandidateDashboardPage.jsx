import { useEffect, useState } from 'react';
import { DashboardSkeleton } from '../components/ui/DashboardSkeleton.jsx';
import { DashboardHeader } from '../components/ui/DashboardHeader.jsx';

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
      <DashboardHeader title="Panel del candidato" subtitle="Gestiona tu perfil y revisa tus procesos de evaluación." />
    </div>
  );
}
