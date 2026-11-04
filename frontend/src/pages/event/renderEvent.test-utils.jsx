import { render } from '@testing-library/react';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { EventLayout } from './EventLayout.jsx';
import { EventSummaryTab } from './EventSummaryTab.jsx';
import { EventCandidatesTab } from './EventCandidatesTab.jsx';
import { EventOnsiteTab } from './EventOnsiteTab.jsx';
import { EventResultsTab } from './EventResultsTab.jsx';

export const SESSION = {
  venue: 'Campus Central', room: 'Aula 204', startsAt: '2026-11-05T14:00:00.000Z', endsAt: '2026-11-05T16:00:00.000Z', instructions: 'Llegar 15 minutos antes.',
};

export const ONSITE_EVENT = {
  id: 'event-1', name: 'Concurso Presencial', position: 'Analista', status: 'ACTIVE', modality: 'onsite', modules: ['A', 'B'], onsite: SESSION,
};

/** Shows the current location, to assert navigation. */
function LocationProbe() {
  const location = useLocation();
  return <output data-testid='location'>{location.pathname}{location.search}</output>;
}

/** Renders the event detail routes exactly as the app router declares them. */
export function renderEvent(path = '/company/events/event-1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path='/company/events/:eventId' element={<EventLayout />}>
          <Route index element={<EventSummaryTab />} />
          <Route path='candidatos' element={<EventCandidatesTab />} />
          <Route path='presencial' element={<EventOnsiteTab />} />
          <Route path='resultados' element={<EventResultsTab />} />
          <Route path='onsite' element={<Navigate to='../presencial?etapa=aplicar' replace />} />
        </Route>
        <Route path='/company/events/:eventId/candidates/:candidateId/result' element={<p>Perfil del candidato</p>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}
