import { useState } from 'react';

/**
 * Where candidates type their code at the venue. The company opens this page
 * on each computer before the evaluation.
 */
export function OnsiteAccessLink() {
  const url = `${window.location.origin}/presencial`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section aria-label='Página de ingreso para candidatos' className='flex flex-col gap-3 rounded-2xl border border-[#CDEBEA] bg-[#F4FBFB] p-5 sm:flex-row sm:items-center sm:justify-between'>
      <div className='min-w-0'>
        <h3 className='font-display text-base font-bold text-[#101828]'>Para que el candidato ingrese, abre esta página en cada computadora</h3>
        <p className='mt-1 text-sm text-[#56677B]'>Allí escribirá el código de su hoja de acceso. No necesita correo ni contraseña.</p>
        <p className='mt-2 break-all font-mono text-xs text-[#087D79]'>{url}</p>
      </div>
      <div className='flex shrink-0 flex-wrap gap-2'>
        <button type='button' onClick={copy} className='h-11 rounded-xl border border-[#D9E2EA] bg-white px-4 text-sm font-semibold text-[#334E68] hover:border-[#13A9A4]'>{copied ? 'Enlace copiado' : 'Copiar enlace'}</button>
        <a href={url} target='_blank' rel='noreferrer' className='inline-flex h-11 items-center rounded-xl bg-[#0AADA8] px-5 text-sm font-semibold text-white hover:bg-[#089490]'>Abrir página</a>
      </div>
    </section>
  );
}
