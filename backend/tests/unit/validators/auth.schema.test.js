const { registerSchema } = require('../../../src/validators/auth.schema');

const validCompany = {
  companyName: 'TechCorp S.A.', industry: 'Tecnología', companySize: '51-200',
  website: 'https://techcorp.example', companyPhone: '+502 2200 0000', city: 'Guatemala', country: 'Guatemala',
  displayName: 'María González', contactRole: 'Gerente de RRHH', contactPhone: '+502 5555 0000',
  email: 'rrhh@techcorp.example', password: 'Segura123', acceptTerms: true,
};

test('register accepts the complete company contract', () => {
  expect(registerSchema.safeParse(validCompany).success).toBe(true);
});

test('register rejects the former candidate profile contract', () => {
  const candidate = {
    email: 'candidate@example.com', password: 'Segura123', displayName: 'Candidato Demo',
    academicLevel: 'Universitario', professionalArea: 'Tecnología',
  };
  expect(registerSchema.safeParse(candidate).success).toBe(false);
});
