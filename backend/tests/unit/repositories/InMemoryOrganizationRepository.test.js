const InMemoryOrganizationRepository = require('../../../src/repositories/in-memory/InMemoryOrganizationRepository');

describe('InMemoryOrganizationRepository', () => {
  test('encuentra una organización existente por companyName sin crear otra', async () => {
    const repo = new InMemoryOrganizationRepository();
    const existing = await repo.create({ companyName: 'teccorp', name: 'teccorp' });

    const found = await repo.findByCompanyName('teccorp');

    expect(found).toEqual(existing);
    expect(await repo.findAll()).toHaveLength(1);
  });

  test('también encuentra organizaciones antiguas guardadas con name', async () => {
    const repo = new InMemoryOrganizationRepository();
    const existing = await repo.create({ name: 'TechCorp' });

    await expect(repo.findByCompanyName('techcorp')).resolves.toEqual(existing);
  });
});