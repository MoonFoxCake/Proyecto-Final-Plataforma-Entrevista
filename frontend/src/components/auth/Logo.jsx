/**
 * NexoPerfil logo mark: gradient "N" tile + wordmark. `dark` switches the
 * wordmark for use on light backgrounds (e.g. the register success screen).
 */
export function Logo({ dark = false }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0AADA8] to-[#087D79] shadow-lg">
        <span className="font-display text-xl font-bold tracking-[-1px] text-white">N</span>
      </div>
      <span
        className={`font-display text-xl font-semibold tracking-[-0.5px] ${dark ? 'text-[#101828]' : 'text-white'}`}
      >
        Nexo<span className="text-[#0AADA8]">Perfil</span>
      </span>
    </div>
  );
}
