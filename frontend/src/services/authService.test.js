import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { auth } from '../config/firebase.js';
import { changePassword, login } from './authService.js';
vi.mock('../config/firebase.js', () => ({ auth: { currentUser: null } }));
vi.mock('./api', () => ({ default: {} }));
vi.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: vi.fn(() => 'credential') }, reauthenticateWithCredential: vi.fn(), updatePassword: vi.fn(),
  confirmPasswordReset: vi.fn(), onAuthStateChanged: vi.fn(), sendPasswordResetEmail: vi.fn(), sendEmailVerification: vi.fn(), signInWithEmailAndPassword: vi.fn(), signOut: vi.fn(), verifyPasswordResetCode: vi.fn(),
}));
beforeEach(() => { vi.clearAllMocks(); auth.currentUser = null; signInWithEmailAndPassword.mockResolvedValue({ user: { uid: 'test-user' } }); });
test('uses the reserved internal alias for usernames and keeps email login available', async () => {
  await login(' Owner ', 'test-password');
  expect(signInWithEmailAndPassword).toHaveBeenLastCalledWith(auth, 'owner@admin.nexoperfil.invalid', 'test-password');
  await login(' PERSON@EXAMPLE.TEST ', 'test-password');
  expect(signInWithEmailAndPassword).toHaveBeenLastCalledWith(auth, 'person@example.test', 'test-password');
});
test('reauthenticates an internal username account before changing its password', async () => {
  auth.currentUser = { email: 'owner@admin.nexoperfil.invalid', getIdToken: vi.fn() };
  await changePassword('previous-password', 'new-password-long');
  expect(EmailAuthProvider.credential).toHaveBeenCalledWith('owner@admin.nexoperfil.invalid', 'previous-password');
  expect(reauthenticateWithCredential).toHaveBeenCalledWith(auth.currentUser, 'credential');
  expect(updatePassword).toHaveBeenCalledWith(auth.currentUser, 'new-password-long');
  expect(auth.currentUser.getIdToken).toHaveBeenCalledWith(true);
});
test('never changes credentials if reauthentication fails', async () => {
  auth.currentUser = { email: 'owner@admin.nexoperfil.invalid' };
  reauthenticateWithCredential.mockRejectedValueOnce(new Error('Wrong password'));
  await expect(changePassword('wrong-password', 'new-password-long')).rejects.toThrow('Wrong password');
  expect(updatePassword).not.toHaveBeenCalled();
});
