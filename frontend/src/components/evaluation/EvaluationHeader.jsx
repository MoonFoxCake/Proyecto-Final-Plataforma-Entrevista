/** Top bar shown on every screen of the candidate's evaluation flow. */
export function EvaluationHeader() {
  return (
    <header className='border-b border-[#DDE5EC] bg-white'>
      <div className='mx-auto flex h-[70px] max-w-6xl items-center justify-between px-5'>
        <div className='flex items-center gap-3'><span className='flex h-9 w-9 items-center justify-center rounded-xl bg-[#20AAA5] font-bold text-white'>N</span><span className='font-display font-bold text-[#10233A]'>Nexo<span className='text-[#18A9A4]'>Perfil</span></span></div>
        <span className='text-sm text-[#64748B]'>Evaluación</span>
      </div>
    </header>
  );
}
