import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, FormField, Input, Select } from '../../components/ui';
import { Logo } from '../../components/auth/Logo.jsx';
import { REGISTER_STEPS, RegisterBrandPanel } from '../../components/auth/RegisterBrandPanel.jsx';
import { RegisterSuccess } from '../../components/auth/RegisterSuccess.jsx';
import { PasswordStrengthMeter } from '../../components/auth/PasswordStrengthMeter.jsx';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  EyeIcon,
  EyeOffIcon,
  GraduationCapIcon,
  LockIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  SpinnerIcon,
  UserIcon,
} from '../../components/auth/icons.jsx';
import { ACADEMIC_LEVELS, PROFESSIONAL_AREAS } from '../../utils/candidateOptions.js';

const INITIAL_FORM = {
  nombre: '',
  apellido: '',
  email: '',
  telefono: '',
  ciudad: '',
  pais: '',
  nivel: '',
  area: '',
  password: '',
  password2: '',
  terminos: false,
};

/**
 * Three-step candidate registration wizard: personal data, academic
 * background, then credentials. Submission not wired up yet.
 */
export function RegisterPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [errors, setErrors] = useState({});
  const [form, setForm] = useState(INITIAL_FORM);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateStep = () => {
    const nextErrors = {};
    if (step === 0) {
      if (!form.nombre.trim()) nextErrors.nombre = 'Ingresa tu nombre';
      if (!form.apellido.trim()) nextErrors.apellido = 'Ingresa tu apellido';
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        nextErrors.email = 'Correo inválido';
      }
      if (!form.telefono.trim()) nextErrors.telefono = 'Ingresa tu teléfono';
      if (!form.ciudad.trim()) nextErrors.ciudad = 'Ingresa tu ciudad';
      if (!form.pais.trim()) nextErrors.pais = 'Ingresa tu país';
    }
    if (step === 1) {
      if (!form.nivel) nextErrors.nivel = 'Selecciona tu nivel de estudios';
      if (!form.area) nextErrors.area = 'Selecciona tu área de interés';
    }
    if (step === 2) {
      if (form.password.length < 8) nextErrors.password = 'Mínimo 8 caracteres';
      if (form.password !== form.password2) nextErrors.password2 = 'Las contraseñas no coinciden';
      if (!form.terminos) nextErrors.terminos = 'Debes aceptar los términos';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const goNext = () => {
    if (validateStep()) setStep((s) => s + 1);
  };
  const goBack = () => setStep((s) => s - 1);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep()) return;
    setLoading(true);
    try {
      // TODO: call authService.register(form) once the backend accepts the
      // full candidate profile (currently only { email, password, displayName }).
      await new Promise((resolve) => setTimeout(resolve, 1100));
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return <RegisterSuccess email={form.email} onContinue={() => navigate('/login')} />;
  }

  return (
    <div className="flex min-h-screen w-full bg-white">
      <RegisterBrandPanel currentStep={step} />

      <div className="flex flex-1 items-center justify-center overflow-y-auto bg-white p-8">
        <div className="w-full max-w-[460px] py-8">
          <div className="mb-6 lg:hidden">
            <Logo dark />
          </div>

          <div className="mb-6 lg:hidden">
            <div className="mb-2 flex justify-between text-xs text-[#99A1AF]">
              <span>
                Paso {step + 1} de {REGISTER_STEPS.length}
              </span>
              <span>{REGISTER_STEPS[step]}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#F3F4F6]">
              <div
                className="h-full rounded-full bg-[#0AADA8] transition-all duration-500"
                style={{ width: `${((step + 1) / REGISTER_STEPS.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="mb-7">
            <h2 className="font-display text-3xl font-bold leading-9 text-[#101828]">
              {step === 0 && 'Datos personales'}
              {step === 1 && 'Formación académica'}
              {step === 2 && 'Crea tu contraseña'}
            </h2>
            <p className="mt-1.5 text-sm text-[#6A7282]">
              {step === 0 && 'Cuéntanos un poco sobre ti para personalizar tu perfil.'}
              {step === 1 && 'Indica tu nivel educativo y el área donde quieres desarrollarte.'}
              {step === 2 && 'Elige una contraseña segura para proteger tu cuenta.'}
            </p>
          </div>

          <form
            onSubmit={
              step < 2
                ? (e) => {
                    e.preventDefault();
                    goNext();
                  }
                : handleSubmit
            }
            className="space-y-4"
            noValidate
          >
            {step === 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Nombre(s)" htmlFor="nombre" error={errors.nombre}>
                    <Input
                      id="nombre"
                      type="text"
                      placeholder="Valentina"
                      value={form.nombre}
                      onChange={set('nombre')}
                      icon={<UserIcon className="h-4 w-4" />}
                    />
                  </FormField>
                  <FormField label="Apellido(s)" htmlFor="apellido" error={errors.apellido}>
                    <Input
                      id="apellido"
                      type="text"
                      placeholder="Torres"
                      value={form.apellido}
                      onChange={set('apellido')}
                      icon={<UserIcon className="h-4 w-4" />}
                    />
                  </FormField>
                </div>

                <FormField label="Correo electrónico" htmlFor="email" error={errors.email}>
                  <Input
                    id="email"
                    type="email"
                    placeholder="valentina@correo.com"
                    value={form.email}
                    onChange={set('email')}
                    icon={<MailIcon className="h-4 w-4" />}
                  />
                </FormField>

                <FormField label="Teléfono" htmlFor="telefono" error={errors.telefono}>
                  <Input
                    id="telefono"
                    type="tel"
                    placeholder="+57 300 000 0000"
                    value={form.telefono}
                    onChange={set('telefono')}
                    icon={<PhoneIcon className="h-4 w-4" />}
                  />
                </FormField>

                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Ciudad" htmlFor="ciudad" error={errors.ciudad}>
                    <Input
                      id="ciudad"
                      type="text"
                      placeholder="Bogotá"
                      value={form.ciudad}
                      onChange={set('ciudad')}
                      icon={<MapPinIcon className="h-4 w-4" />}
                    />
                  </FormField>
                  <FormField label="País" htmlFor="pais" error={errors.pais}>
                    <Input
                      id="pais"
                      type="text"
                      placeholder="Colombia"
                      value={form.pais}
                      onChange={set('pais')}
                      icon={<MapPinIcon className="h-4 w-4" />}
                    />
                  </FormField>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <FormField label="Nivel de estudios" htmlFor="nivel" error={errors.nivel}>
                  <Select
                    id="nivel"
                    value={form.nivel}
                    onChange={set('nivel')}
                    placeholder="Selecciona tu nivel"
                    icon={<GraduationCapIcon className="h-4 w-4" />}
                  >
                    {ACADEMIC_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <FormField label="Área de interés profesional" htmlFor="area" error={errors.area}>
                  <Select
                    id="area"
                    value={form.area}
                    onChange={set('area')}
                    placeholder="Selecciona un área"
                    icon={<BriefcaseIcon className="h-4 w-4" />}
                  >
                    {PROFESSIONAL_AREAS.map((area) => (
                      <option key={area} value={area}>
                        {area}
                      </option>
                    ))}
                  </Select>
                </FormField>

                <div className="mt-2 rounded-xl border border-[#0AADA8]/20 bg-[#F0FFFE] p-4">
                  <p className="text-xs leading-relaxed text-[#087D79]">
                    <strong>¿Por qué pedimos esto?</strong> Tu nivel académico y área de interés nos
                    permiten conectarte con procesos de selección relevantes y mejorar tu visibilidad
                    ante las empresas.
                  </p>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div>
                  <FormField label="Contraseña" htmlFor="password" error={errors.password}>
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Mínimo 8 caracteres"
                      value={form.password}
                      onChange={set('password')}
                      icon={<LockIcon className="h-4 w-4" />}
                      rightElement={
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="text-[#99A1AF] hover:text-[#6A7282]"
                          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        >
                          {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                        </button>
                      }
                    />
                  </FormField>
                  <PasswordStrengthMeter password={form.password} />
                </div>

                <FormField label="Confirmar contraseña" htmlFor="password2" error={errors.password2}>
                  <Input
                    id="password2"
                    type={showPassword2 ? 'text' : 'password'}
                    placeholder="Repite tu contraseña"
                    value={form.password2}
                    onChange={set('password2')}
                    icon={<LockIcon className="h-4 w-4" />}
                    rightElement={
                      <button
                        type="button"
                        onClick={() => setShowPassword2((v) => !v)}
                        className="text-[#99A1AF] hover:text-[#6A7282]"
                        aria-label={showPassword2 ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                      >
                        {showPassword2 ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                      </button>
                    }
                  />
                </FormField>

                <div className="flex items-start gap-3 pt-1">
                  <input
                    id="terminos"
                    type="checkbox"
                    checked={form.terminos}
                    onChange={set('terminos')}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-[#0AADA8]"
                  />
                  <label htmlFor="terminos" className="cursor-pointer text-sm leading-relaxed text-[#6A7282]">
                    Acepto los{' '}
                    <span className="font-medium text-[#0AADA8] underline underline-offset-2">
                      Términos de uso
                    </span>{' '}
                    y la{' '}
                    <span className="font-medium text-[#0AADA8] underline underline-offset-2">
                      Política de privacidad
                    </span>{' '}
                    de Nexo Perfil.
                  </label>
                </div>
                {errors.terminos && <p className="-mt-2 text-xs text-red-500">{errors.terminos}</p>}
              </>
            )}

            <div className={`flex gap-3 pt-2 ${step > 0 ? 'flex-row' : 'flex-col'}`}>
              {step > 0 && (
                <Button type="button" variant="outline" className="h-12 flex-1" onClick={goBack}>
                  <ArrowLeftIcon className="h-4 w-4" />
                  Atrás
                </Button>
              )}

              <Button type="submit" variant="accent" className="h-12 flex-1" disabled={loading}>
                {loading ? (
                  <>
                    <SpinnerIcon className="h-4 w-4 animate-spin" />
                    Creando tu cuenta...
                  </>
                ) : step < 2 ? (
                  <>
                    Continuar
                    <ArrowRightIcon className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Crear mi cuenta
                    <ArrowRightIcon className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {step === 0 && (
              <p className="text-center text-sm text-[#6A7282]">
                ¿Ya tienes cuenta?{' '}
                <Link to="/login" className="font-medium text-[#0AADA8] hover:text-[#087D79]">
                  Iniciar sesión
                </Link>
              </p>
            )}
          </form>

          <p className="mt-8 text-center text-xs text-[#D1D5DC]">
            © 2025 Nexo Perfil · Todos los derechos reservados
          </p>
        </div>
      </div>
    </div>
  );
}
