import { auth } from '../config/firebase';

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

async function getHeaders() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('No hay un usuario autenticado.');
  }

  const token = await user.getIdToken();

  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

async function request(url, options = {}) {
  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers: {
      ...(await getHeaders()),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
  console.error('ERROR DEL BACKEND:', data);

  const message =
    typeof data?.message === 'string'
      ? data.message
      : typeof data?.error === 'string'
        ? data.error
        : JSON.stringify(data);

  throw new Error(message);
}
  return data;
}

export async function getMacroCases() {
  return request('/macrocasos');
}

export async function createMacroCase(data) {
  return request('/macrocasos', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateMacroCase(id, data) {
  return request(`/macrocasos/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function activateMacroCase(id) {
  return request(`/macrocasos/${id}/activate`, {
    method: 'POST',
  });
}

export async function deactivateMacroCase(id) {
  return request(`/macrocasos/${id}/deactivate`, {
    method: 'POST',
  });
}

export async function deleteMacroCase(id) {
  return request(`/macrocasos/${id}`, {
    method: 'DELETE',
  });
}

export async function uploadMacroCaseAudio(
  macrocaseId,
  questionId,
  file
) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('No hay un usuario autenticado.');
  }

  const token = await user.getIdToken();

  const formData = new FormData();

  formData.append('questionId', questionId);
  formData.append('audio', file);

  const response = await fetch(
    `${API_URL}/macrocasos/${macrocaseId}/audio`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
  console.error('ERROR AL SUBIR AUDIO:', data);

  const message =
    typeof data?.message === 'string'
      ? data.message
      : typeof data?.error === 'string'
        ? data.error
        : JSON.stringify(data);

  throw new Error(message);
}

  return data;
}