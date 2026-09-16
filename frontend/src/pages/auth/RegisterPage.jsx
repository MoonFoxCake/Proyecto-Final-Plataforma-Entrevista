import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, FormField, Input, Select } from '../../components/ui';
import { Logo } from '../../components/auth/Logo.jsx';
import { REGISTER_STEPS, RegisterBrandPanel } from '../../components/auth/RegisterBrandPanel.jsx';
import { RegisterSuccess } from '../../components/auth/RegisterSuccess.jsx';
import { PasswordStrengthMeter } from '../../components/auth/PasswordStrengthMeter.jsx';
import { ArrowLeftIcon, ArrowRightIcon, BriefcaseIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon, MapPinIcon, PhoneIcon, SpinnerIcon, UserIcon } from '../../components/auth/icons.jsx';
import * as authService from '../../services/authService';
import { getAuthErrorMessage } from '../../utils/firebaseErrors.js';

const COMPANY_SIZES = [
  ['1-10', '1 a 10 colaboradores'], ['11-50', '11 a 50 colaboradores'],
  ['51-200', '51 a 200 colaboradores'], ['201-500', '201 a 500 colaboradores'], ['501+', 'Más de 500 colaboradores'],
];

const INITIAL_FORM = {
  companyName: '', industry: '', companySize: '', website: '', companyPhone: '',
  contactName: '', contactRole: '', contactPhone: '', email: '', city: '', country: '',
  password: '', password2: '', terms: false,
};

export function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState('');
  const [form, setForm] = useState(INITIAL_FORM);

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => { const next = { ...current }; delete next[key]; return next; });
  };

  const validateStep = () => {
    const next = {};
    if (step === 0) {
      if (!form.companyName.trim()) next.companyName = 'Ingresa la razón social';
      if (!form.industry.trim()) next.industry = 'Ingresa el sector de la empresa';
      if (!form.companySize) next.companySize = 'Selecciona el tamaño de la empresa';
      if (!form.companyPhone.trim()) next.companyPhone = 'Ingresa el teléfono de la empresa';
      if (form.website && !/^https?:\/\/.+/i.test(form.website)) next.website = 'Incluye https:// en el sitio web';
    }
    if (step === 1) {
      if (!form.contactName.trim()) next.contactName = 'Ingresa el nombre del responsable';
      if (!form.contactRole.trim()) next.contactRole = 'Ingresa el cargo del responsable';
      if (!form.contactPhone.trim()) next.contactPhone = 'Ingresa el teléfono de contacto';
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'Correo corporativo inválido';
      if (!form.city.trim()) next.city = 'Ingresa la ciudad';
      if (!form.country.trim()) next.country = 'Ingresa el país';
    }
    if (step === 2) {
      if (form.password.length < 8) next.password = 'Mínimo 8 caracteres';
      if (form.password !== form.password2) next.password2 = 'Las contraseñas no coinciden';
      if (!form.terms) next.terms = 'Debes aceptar los términos';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (step < 2) { if (validateStep()) setStep((current) => current + 1); return; }
    if (!validateStep()) return;
    setLoading(true); setSubmitError('');
    try {
      await authService.register({
        companyName: form.companyName.trim(), industry: form.industry.trim(),
        companySize: form.companySize, website: form.website.trim() || undefined,
        companyPhone: form.companyPhone.trim(), city: form.city.trim(), country: form.country.trim(),
        displayName: form.contactName.trim(), contactRole: form.contactRole.trim(), contactPhone: form.contactPhone.trim(),
        email: form.email.trim(), password: form.password, acceptTerms: form.terms,
      });
      setDone(true);
    } catch (error) { setSubmitError(getAuthErrorMessage(error)); }
    finally { setLoading(false); }
  };

  if (done) return <RegisterSuccess email={form.email} companyName={form.companyName} onContinue={() => navigate('/login')} />;

  return <div className='flex min-h-screen w-full bg-white'>
    <RegisterBrandPanel currentStep={step} />
    <div className='flex flex-1 items-center justify-center overflow-y-auto bg-white p-6 sm:p-8'>
      <div className='w-full max-w-[500px] py-8'>
        <div className='mb-6 lg:hidden'><Logo dark /></div>
        <div className='mb-6 lg:hidden'><div className='mb-2 flex justify-between text-xs text-[#99A1AF]'><span>Paso {step + 1} de {REGISTER_STEPS.length}</span><span>{REGISTER_STEPS[step]}</span></div><div className='h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]'><div className='h-full rounded-full bg-[#0AADA8] transition-all' style={{ width: `${((step + 1) / REGISTER_STEPS.length) * 100}%` }} /></div></div>
        <div className='mb-7'><h2 className='font-display text-3xl font-bold text-[#101828]'>{step === 0 ? 'Datos de la empresa' : step === 1 ? 'Responsable de la cuenta' : 'Configura el acceso'}</h2><p className='mt-2 text-sm text-[#6A7282]'>{step === 0 ? 'Identifica la organización que contratará y administrará el servicio.' : step === 1 ? 'Esta persona será el primer usuario con acceso al portal de empresa.' : 'Crea una contraseña segura y confirma las condiciones del servicio.'}</p></div>
        <form onSubmit={handleSubmit} className='space-y-4' noValidate>
          {step === 0 && <>
            <FormField label='Razón social' htmlFor='companyName' error={errors.companyName}><Input id='companyName' value={form.companyName} onChange={set('companyName')} placeholder='TechCorp S.A.' icon={<BriefcaseIcon className='h-4 w-4' />} /></FormField>
            <FormField label='Tamaño de empresa' htmlFor='companySize' error={errors.companySize}><Select id='companySize' value={form.companySize} onChange={set('companySize')} placeholder='Selecciona una opción' icon={<UserIcon className='h-4 w-4' />}>{COMPANY_SIZES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></FormField>
            <FormField label='Sector o industria' htmlFor='industry' error={errors.industry}><Input id='industry' value={form.industry} onChange={set('industry')} placeholder='Tecnología, servicios financieros…' icon={<BriefcaseIcon className='h-4 w-4' />} /></FormField>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField label='Teléfono empresarial' htmlFor='companyPhone' error={errors.companyPhone}><Input id='companyPhone' type='tel' value={form.companyPhone} onChange={set('companyPhone')} placeholder='+502 2200 0000' icon={<PhoneIcon className='h-4 w-4' />} /></FormField>
              <FormField label='Sitio web (opcional)' htmlFor='website' error={errors.website}><Input id='website' type='url' value={form.website} onChange={set('website')} placeholder='https://empresa.com' icon={<BriefcaseIcon className='h-4 w-4' />} /></FormField>
            </div>
          </>}
          {step === 1 && <>
            <FormField label='Nombre del responsable' htmlFor='contactName' error={errors.contactName}><Input id='contactName' value={form.contactName} onChange={set('contactName')} placeholder='María González' icon={<UserIcon className='h-4 w-4' />} /></FormField>
            <FormField label='Cargo' htmlFor='contactRole' error={errors.contactRole}><Input id='contactRole' value={form.contactRole} onChange={set('contactRole')} placeholder='Gerente de Recursos Humanos' icon={<BriefcaseIcon className='h-4 w-4' />} /></FormField>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField label='Correo corporativo' htmlFor='email' error={errors.email}><Input id='email' type='email' value={form.email} onChange={set('email')} placeholder='rrhh@empresa.com' icon={<MailIcon className='h-4 w-4' />} /></FormField>
              <FormField label='Teléfono de contacto' htmlFor='contactPhone' error={errors.contactPhone}><Input id='contactPhone' type='tel' value={form.contactPhone} onChange={set('contactPhone')} placeholder='+502 5555 0000' icon={<PhoneIcon className='h-4 w-4' />} /></FormField>
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField label='Ciudad' htmlFor='city' error={errors.city}><Input id='city' value={form.city} onChange={set('city')} placeholder='Ciudad de Guatemala' icon={<MapPinIcon className='h-4 w-4' />} /></FormField>
              <FormField label='País' htmlFor='country' error={errors.country}><Input id='country' value={form.country} onChange={set('country')} placeholder='Guatemala' icon={<MapPinIcon className='h-4 w-4' />} /></FormField>
            </div>
            <p className='rounded-xl border border-[#BFE5E2] bg-[#F0FFFE] p-4 text-xs leading-5 text-[#27625F]'>Los candidatos no crean una cuenta en esta pantalla. Reciben un acceso individual cuando la empresa publica sus invitaciones.</p>
          </>}
          {step === 2 && <>
            <div><FormField label='Contraseña' htmlFor='password' error={errors.password}><Input id='password' type={showPassword ? 'text' : 'password'} value={form.password} onChange={set('password')} placeholder='Mínimo 8 caracteres' icon={<LockIcon className='h-4 w-4' />} rightElement={<button type='button' onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} className='text-[#99A1AF]'>{showPassword ? <EyeOffIcon className='h-4 w-4' /> : <EyeIcon className='h-4 w-4' />}</button>} /></FormField><PasswordStrengthMeter password={form.password} /></div>
            <FormField label='Confirmar contraseña' htmlFor='password2' error={errors.password2}><Input id='password2' type={showPassword2 ? 'text' : 'password'} value={form.password2} onChange={set('password2')} placeholder='Repite la contraseña' icon={<LockIcon className='h-4 w-4' />} rightElement={<button type='button' onClick={() => setShowPassword2((value) => !value)} aria-label={showPassword2 ? 'Ocultar contraseña' : 'Mostrar contraseña'} className='text-[#99A1AF]'>{showPassword2 ? <EyeOffIcon className='h-4 w-4' /> : <EyeIcon className='h-4 w-4' />}</button>} /></FormField>
            <div className='flex items-start gap-3 pt-1'><input id='terms' type='checkbox' checked={form.terms} onChange={set('terms')} className='mt-1 h-4 w-4 accent-[#0AADA8]' /><label htmlFor='terms' className='text-sm leading-6 text-[#6A7282]'>Acepto los <span className='font-medium text-[#0AADA8] underline'>Términos de uso</span> y la <span className='font-medium text-[#0AADA8] underline'>Política de privacidad</span> de NexoPerfil.</label></div>
            {errors.terms && <p className='text-xs text-red-500'>{errors.terms}</p>}
          </>}
          {submitError && <div className='rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600'>{submitError}</div>}
          <div className={`flex gap-3 pt-2 ${step > 0 ? 'flex-row' : 'flex-col'}`}>
            {step > 0 && <Button type='button' variant='outline' className='h-12 flex-1' onClick={() => setStep((current) => current - 1)}><ArrowLeftIcon className='h-4 w-4' />Atrás</Button>}
            <Button type='submit' variant='accent' className='h-12 flex-1' disabled={loading}>{loading ? <><SpinnerIcon className='h-4 w-4 animate-spin' />Creando empresa...</> : step < 2 ? <>Continuar<ArrowRightIcon className='h-4 w-4' /></> : <>Crear cuenta empresarial<ArrowRightIcon className='h-4 w-4' /></>}</Button>
          </div>
          {step === 0 && <p className='text-center text-sm text-[#6A7282]'>¿Tu empresa ya tiene cuenta? <Link to='/login' className='font-medium text-[#0AADA8] hover:text-[#087D79]'>Iniciar sesión</Link></p>}
        </form>
        <p className='mt-8 text-center text-xs text-[#D1D5DC]'>© 2026 NexoPerfil · Todos los derechos reservados</p>
      </div>
    </div>
  </div>;
}
