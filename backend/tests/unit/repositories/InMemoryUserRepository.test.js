const InMemoryUserRepository = require('../../../src/repositories/in-memory/InMemoryUserRepository');

describe('InMemoryUserRepository', () => {
  let repo;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  test('debe crear y encontrar un usuario por id', async () => {
    const created = await repo.create({ email: 'ana@example.com', displayName: 'Ana' });

    const found = await repo.findById(created.id);

    expect(found).not.toBeNull();
    expect(found.email).toBe('ana@example.com');
  });

  test('debe encontrar un usuario por email', async () => {
    await repo.create({ email: 'ana@example.com', displayName: 'Ana' });

    const found = await repo.findByEmail('ana@example.com');

    expect(found).not.toBeNull();
    expect(found.displayName).toBe('Ana');
  });

  test('debe filtrar usuarios por organización', async () => {
    await repo.create({ email: 'a@example.com', orgId: 'org-1' });
    await repo.create({ email: 'b@example.com', orgId: 'org-2' });
    await repo.create({ email: 'c@example.com', orgId: 'org-1' });

    const orgOneUsers = await repo.findByOrganization('org-1');

    expect(orgOneUsers).toHaveLength(2);
    expect(orgOneUsers.map((u) => u.email).sort()).toEqual(['a@example.com', 'c@example.com']);
  });
});
