/**
 * Turns a login/register failure into a short, user-facing Spanish
 * message. Handles two shapes: a raw Firebase Auth error (from
 * `signInWithEmailAndPassword` et al., identified by `error.code`) and an
 * axios error from our own backend (`{ error: { message } }`, whose
 * message is already meant to be shown as-is).
 *
 * @param {unknown} error
 * @returns {string}
 */
export function getAuthErrorMessage(error) {
  const backendMessage = error?.response?.data?.error?.message;
  if (backendMessage) return backendMessage;

  switch (error?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Correo o contraseña incorrectos.';
    case 'auth/invalid-email':
      return 'Correo electrónico inválido.';
    case 'auth/user-disabled':
      return 'Esta cuenta ha sido deshabilitada.';
    case 'auth/too-many-requests':
      return 'Demasiados intentos fallidos. Intenta de nuevo más tarde.';
    case 'auth/network-request-failed':
      return 'Error de red. Verifica tu conexión e intenta de nuevo.';
    case 'auth/email-already-in-use':
    case 'auth/email-already-exists':
      return 'Ese correo ya está registrado.';
    case 'auth/weak-password':
      return 'La contraseña es demasiado débil.';
    default:
      return 'Ocurrió un error. Intenta de nuevo.';
  }
}
