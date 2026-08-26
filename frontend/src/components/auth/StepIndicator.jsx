const STATE_STYLES = {
  done: { background: '#0AADA8', border: '1.5px solid transparent', color: '#FFFFFF' },
  active: { background: 'rgba(10, 173, 168, 0.2)', border: '1.5px solid #0AADA8', color: '#0AADA8' },
  pending: { background: 'rgba(255, 255, 255, 0.07)', border: '1.5px solid transparent', color: 'rgba(255, 255, 255, 0.35)' },
};

/**
 * Vertical step tracker for the register wizard's brand panel: a numbered
 * (or checked) circle plus label per step, highlighting done/active/pending.
 *
 * @param {{ steps: string[], currentStep: number }} props
 */
export function StepIndicator({ steps, currentStep }) {
  return (
    <div className="mt-10 space-y-4">
      {steps.map((label, i) => {
        const state = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending';
        const circleStyle = STATE_STYLES[state];
        return (
          <div key={label} className="flex items-center gap-3">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors"
              style={circleStyle}
            >
              {state === 'done' ? '✓' : i + 1}
            </div>
            <span
              className="text-sm transition-colors"
              style={{
                color: state === 'pending' ? 'rgba(255, 255, 255, 0.35)' : state === 'done' ? '#0AADA8' : '#FFFFFF',
                fontWeight: state === 'active' ? 600 : 400,
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
