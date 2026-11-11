import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useContext } from 'react';
import { AuthContext, AuthProvider } from './AuthContext.jsx';
import { getProfile, onAuthStateChanged } from '../services/authService.js';
vi.mock('../services/authService.js', () => ({ getProfile: vi.fn(), onAuthStateChanged: vi.fn() }));
let listener;
const owner = { id: 'owner', role: 'admin', adminAccess: 'owner' };
function Status() {
  const { user, profile, loading } = useContext(AuthContext);
  return <p>{loading ? 'loading' : `${user?.uid || 'anonymous'}:${profile?.adminAccess || 'none'}`}</p>;
}
beforeEach(() => {
  vi.resetAllMocks();
  onAuthStateChanged.mockImplementation((callback) => { listener = callback; return vi.fn(); });
});
afterEach(cleanup);
test('ignores an earlier profile response after logout', async () => {
  let resolve;
  getProfile.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  render(<AuthProvider><Status /></AuthProvider>);
  let pending;
  act(() => { pending = listener({ uid: 'owner' }); });
  await act(async () => { await listener(null); });
  expect(screen.getByText('anonymous:none')).toBeTruthy();
  await act(async () => { resolve(owner); await pending; });
  expect(screen.getByText('anonymous:none')).toBeTruthy();
});
test('refreshes permissions on focus and clears the profile if the server blocks the account', async () => {
  getProfile.mockResolvedValueOnce(owner).mockResolvedValueOnce({ ...owner, adminAccess: 'restricted', permissions: [] });
  render(<AuthProvider><Status /></AuthProvider>);
  await act(async () => { await listener({ uid: 'owner' }); });
  expect(screen.getByText('owner:owner')).toBeTruthy();
  act(() => { window.dispatchEvent(new Event('focus')); });
  await screen.findByText('owner:restricted');
  getProfile.mockRejectedValueOnce({ response: { status: 403 } });
  act(() => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(screen.getByText('anonymous:none')).toBeTruthy());
});
