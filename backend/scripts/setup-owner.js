/* Run on the server with its Firebase credentials. There is no public bootstrap endpoint. */
const readline = require('readline');
const { Writable } = require('stream');
const path = require('path');
const { adminEmail } = require('../src/utils/adminPermissions');

async function readPassword(prompt) {
  if (!process.stdin.isTTY) throw new Error('Se requiere una terminal interactiva para introducir la contraseña.');
  let muted = false;
  const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });
  const pending = new Promise((resolve) => rl.question(prompt, resolve));
  muted = true;
  const password = await pending;
  muted = false; rl.close(); process.stdout.write('\n');
  return password;
}

async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const value = args[args.indexOf(name) + 1];
    if (!value || value.startsWith('--')) throw new Error(`Falta el valor de ${name}.`);
    return value;
  };
  const username = args.includes('--username') ? option('--username').trim().toLowerCase() : '';
  const displayName = args.includes('--name') ? option('--name').trim() : 'Propietario';
  if (!/^[a-z][a-z0-9._-]{2,39}$/.test(username)) throw new Error('Indica --username con 3 a 40 caracteres válidos.');
  if (displayName.length < 2 || displayName.length > 120) throw new Error('El nombre debe tener entre 2 y 120 caracteres.');
  // Standalone commands do not pass through src/index.js, which loads dotenv
  // for the API. Resolve the backend file independently of the caller's cwd.
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  const { auth } = require('../src/config/firebase');
  const UserRepository = require('../src/repositories/firestore/FirestoreUserRepository');
  const repo = new UserRepository();
  const ownerId = await repo.getOwnerId();
  const reset = args.includes('--reset-password');
  if (ownerId && !reset) throw new Error('Ya existe un propietario. Para recuperar su contraseña usa --reset-password.');
  if (!ownerId && reset) throw new Error('Aún no existe una cuenta propietaria.');
  let account;
  try { account = await auth.getUserByEmail(adminEmail(username)); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  if (reset && account?.uid !== ownerId) throw new Error('El nombre de usuario no corresponde al propietario configurado.');
  const password = await readPassword('Contraseña (mínimo 12 caracteres): ');
  if (password.length < 12 || password.length > 128) throw new Error('Usa una contraseña de 12 a 128 caracteres.');
  if (await readPassword('Repite la contraseña: ') !== password) throw new Error('Las contraseñas no coinciden.');
  if (reset) {
    await auth.updateUser(ownerId, { password, disabled: false });
    await auth.revokeRefreshTokens(ownerId);
    console.log(`Contraseña del propietario ${username} restablecida. No se modificaron sus permisos.`);
    return;
  }
  let created = false;
  try {
    if (!account) { account = await auth.createUser({ email: adminEmail(username), displayName, password }); created = true; }
    else if ((await repo.findById(account.uid))?.role !== 'admin') throw new Error('Esta identidad ya existe y no es administrativa.');
    await auth.setCustomUserClaims(account.uid, { role: 'admin', orgId: null });
    await repo.initializeOwner(account.uid, { username, email: adminEmail(username), displayName });
    if (!created) await auth.updateUser(account.uid, { password, disabled: false });
    console.log(`Propietario ${username} configurado. Inicia sesión con su nombre de usuario y contraseña.`);
  } catch (error) { if (created) await auth.deleteUser(account.uid).catch(() => {}); throw error; }
}
if (require.main === module) {
  main().catch((error) => {
    if (error.name === 'ZodError') {
      const fields = [...new Set(error.issues.map((issue) => issue.path.join('.')))];
      console.error(`Revisa estas variables en backend/.env o en el entorno del servidor: ${fields.join(', ')}.`);
    } else console.error(error.message || 'No se pudo configurar el propietario.');
    process.exitCode = 1;
  });
}
module.exports = { main };
