/** Seconds the candidate has to answer each question (macrocase `defaultTimeLimit`); 0 = no limit. */
export function timeLimitOf(macrocase) {
  const seconds = Number(macrocase?.defaultTimeLimit);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
}

/** 0:45, 2:05 … for the countdown. */
export function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

/** "45 segundos", "2 minutos", "1 minuto y 30 segundos" for explanations. */
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const minutesText = minutes ? `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}` : '';
  const secondsText = rest ? `${rest} ${rest === 1 ? 'segundo' : 'segundos'}` : '';
  return [minutesText, secondsText].filter(Boolean).join(' y ');
}
