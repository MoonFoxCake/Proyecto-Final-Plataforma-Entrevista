/**
 * Dark gradient + soft glow backdrop shared by the auth screens' left-hand
 * marketing panel. `className` controls sizing/visibility (width, shrink,
 * hidden/lg:block) so each screen can size its own panel while keeping the
 * same visual language.
 */
export function AuthBackdrop({ className = '', children }) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: 'linear-gradient(150deg, #0A1929 7.74%, #0F2544 45.77%, #0E3059 92.26%)',
      }}
    >
      {/* Radial glow overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background:
            'radial-gradient(85.88% 61.5% at 50% 50%, rgba(10, 173, 168, 0.4) 0.2%, rgba(0, 0, 0, 0) 0.2%)',
        }}
      />
      {/* Decorative blurred blobs */}
      <div
        className="absolute h-96 w-96 rounded-full bg-[#0AADA8] opacity-10 blur-[64px]"
        style={{ left: '184px', top: '343px' }}
      />
      <div
        className="absolute h-64 w-64 rounded-full bg-[#6366F1] opacity-[0.08] blur-[64px]"
        style={{ left: '297px', top: '517px' }}
      />

      <div className="relative flex h-full flex-col p-14">{children}</div>
    </div>
  );
}
