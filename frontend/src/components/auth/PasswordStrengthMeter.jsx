const COLORS = ['#EF4444', '#F97316', '#EAB308', '#0AADA8'];

/**
 * Four-bar password strength indicator. Renders nothing until the user has
 * typed something. Strength is a rough length-based heuristic — good enough
 * as a visual nudge, not a real policy check.
 *
 * @param {{ password: string }} props
 */
export function PasswordStrengthMeter({ password }) {
  if (!password) return null;

  const strength = Math.min(4, Math.max(1, Math.floor(password.length / 3)));

  return (
    <div className="mt-2 flex gap-1">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-1 flex-1 rounded-full transition-colors duration-300"
          style={{ background: i <= strength ? COLORS[strength - 1] : '#E5E7EB' }}
        />
      ))}
    </div>
  );
}
