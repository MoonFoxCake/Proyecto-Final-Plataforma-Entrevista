import { useEffect, useState } from 'react';

import {
  getMacroCases,
  createMacroCase,
  updateMacroCase,
  activateMacroCase,
  deactivateMacroCase,
  deleteMacroCase,
  uploadMacroCaseAudio,
} from '../services/macrocaseApi';

const EMPTY_FORM = {
  name: '',
  description: '',
  introduction: '',
  maxCharacters: 500,
  defaultTimeLimit: 30,
  questions: [],
};

function StatusBadge({ active }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        active
          ? 'bg-green-100 text-green-700'
          : 'bg-gray-100 text-gray-600'
      }`}
    >
      {active ? 'Activo' : 'Inactivo'}
    </span>
  );
}

export function AdminMacrocasesPage() {
  const [macrocasos, setMacrocasos] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadMacroCases = async () => {
    try {
      setLoading(true);
      const data = await getMacroCases();
      setMacrocasos(data);
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMacroCases();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      questions: [],
    });
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditing(item);

    setForm({
      name: item.name || '',
      description: item.description || '',
      introduction: item.introduction || '',
      maxCharacters: item.maxCharacters || 500,
      defaultTimeLimit: item.defaultTimeLimit || 30,
      questions: (item.questions || []).map((question) => ({
        ...question,
        audioFile: null,
      })),
    });

    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const addQuestion = () => {
    setForm((current) => ({
      ...current,
      questions: [
        ...current.questions,
        {
          id: `question-${Date.now()}-${current.questions.length}`,
          order: current.questions.length + 1,
          audioName: '',
          audioUrl: '',
          audioPath: '',
          audioFile: null,
        },
      ],
    }));
  };

  const removeQuestion = (id) => {
    setForm((current) => ({
      ...current,
      questions: current.questions
        .filter((question) => question.id !== id)
        .map((question, index) => ({
          ...question,
          order: index + 1,
        })),
    }));
  };

  const handleAudioChange = (id, file) => {
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('El audio no puede superar los 10 MB.');
      return;
    }

    const allowed = [
      'audio/mpeg',
      'audio/wav',
      'audio/ogg',
      'audio/webm',
    ];

    if (!allowed.includes(file.type)) {
      alert('Usa un archivo MP3, WAV, OGG o WEBM.');
      return;
    }

    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === id
          ? {
              ...question,
              audioName: file.name,
              audioFile: file,
            }
          : question
      ),
    }));
  };

  const saveMacrocase = async () => {
    if (!form.name.trim()) {
      alert('Debes indicar un nombre.');
      return;
    }

    if (!form.introduction.trim()) {
      alert('Debes agregar el texto introductorio.');
      return;
    }

    if (form.questions.length === 0) {
      alert('Debes agregar al menos una pregunta.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        introduction: form.introduction.trim(),
        maxCharacters: Number(form.maxCharacters),
        defaultTimeLimit: Number(form.defaultTimeLimit),
        questions: form.questions.map((question) => ({
          id: question.id,
          order: question.order,
          audioName: question.audioName || '',
          audioUrl: question.audioUrl || '',
          audioPath: question.audioPath || '',
        })),
      };

      let saved;

      if (editing) {
        saved = await updateMacroCase(editing.id, payload);
      } else {
        saved = await createMacroCase(payload);
      }

      const questionsWithFiles = form.questions.filter(
        (question) => question.audioFile
      );

      for (const question of questionsWithFiles) {
        saved = await uploadMacroCaseAudio(
          saved.id,
          question.id,
          question.audioFile
        );
      }

      await loadMacroCases();
      closeForm();
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item) => {
    try {
      if (item.active) {
        await deactivateMacroCase(item.id);
      } else {
        await activateMacroCase(item.id);
      }

      await loadMacroCases();
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDelete = async (item) => {
    const confirmed = window.confirm(
      `¿Deseas eliminar "${item.name}"?`
    );

    if (!confirmed) return;

    try {
      await deleteMacroCase(item.id);
      await loadMacroCases();
    } catch (error) {
      alert(error.message);
    }
  };

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const updateQuestion = (id, field, value) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.id === id
          ? {
              ...question,
              [field]: value,
            }
          : question
      ),
    }));
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#0AADA8]">
              Administración
            </p>

            <h1 className="mt-1 text-3xl font-bold text-[#101828]">
              Banco de Macrocasos
            </h1>

            <p className="mt-2 text-sm text-[#64748B]">
              Administra los escenarios de evaluación de la Fase 2.
            </p>
          </div>

          <button
            onClick={openCreate}
            className="rounded-xl bg-[#0AADA8] px-5 py-3 text-sm font-semibold text-white hover:bg-[#089995]"
          >
            + Nuevo macrocaso
          </button>
        </div>

        {loading ? (
          <div className="rounded-xl bg-white p-8 text-center">
            Cargando macrocasos...
          </div>
        ) : macrocasos.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white p-12 text-center">
            <h2 className="text-lg font-semibold">
              No hay macrocasos
            </h2>

            <button
              onClick={openCreate}
              className="mt-4 rounded-lg bg-[#0AADA8] px-4 py-2 text-white"
            >
              Crear macrocaso
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {macrocasos.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-bold">
                        {item.name}
                      </h2>

                      <StatusBadge active={item.active} />
                    </div>

                    <p className="mt-2 text-sm text-gray-500">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(item)}
                      className="rounded-lg border px-3 py-2 text-sm"
                    >
                      Editar
                    </button>

                    <button
                      onClick={() => toggleActive(item)}
                      className={`rounded-lg px-3 py-2 text-sm font-semibold ${
                        item.active
                          ? 'border border-red-200 text-red-600'
                          : 'bg-[#0AADA8] text-white'
                      }`}
                    >
                      {item.active ? 'Desactivar' : 'Activar'}
                    </button>

                    <button
                      onClick={() => handleDelete(item)}
                      className="rounded-lg px-3 py-2 text-sm text-red-600"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">
                      Preguntas
                    </p>
                    <p className="font-semibold">
                      {item.questions?.length || 0}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">
                      Caracteres
                    </p>
                    <p className="font-semibold">
                      {item.maxCharacters}
                    </p>
                  </div>

                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-xs text-gray-500">
                      Tiempo
                    </p>
                    <p className="font-semibold">
                      {item.defaultTimeLimit} segundos
                    </p>
                  </div>
                </div>

                {item.questions?.length > 0 && (
                  <div className="mt-5 space-y-3">
                    {item.questions.map((question) => (
                      <div
                        key={question.id}
                        className="rounded-lg border p-4"
                      >
                        <p className="mb-2 text-sm font-semibold">
                          Pregunta {question.order}
                        </p>

                        {question.audioUrl ? (
                          <div>
                            <p className="mb-2 text-xs text-gray-500">
                              {question.audioName}
                            </p>

                            <audio
                              controls
                              src={question.audioUrl}
                              className="w-full"
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">
                            Sin audio
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 p-4">
          <div className="mx-auto max-w-4xl rounded-2xl bg-white shadow-2xl">
            <div className="border-b p-6">
              <h2 className="text-xl font-bold">
                {editing
                  ? 'Editar macrocaso'
                  : 'Nuevo macrocaso'}
              </h2>
            </div>

            <div className="space-y-6 p-6">
              <input
                value={form.name}
                onChange={(e) =>
                  updateField('name', e.target.value)
                }
                placeholder="Nombre del macrocaso"
                className="w-full rounded-lg border p-3"
              />

              <input
                value={form.description}
                onChange={(e) =>
                  updateField('description', e.target.value)
                }
                placeholder="Descripción breve"
                className="w-full rounded-lg border p-3"
              />

              <textarea
                value={form.introduction}
                onChange={(e) =>
                  updateField('introduction', e.target.value)
                }
                placeholder="Texto introductorio"
                rows={8}
                className="w-full rounded-lg border p-3"
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  type="number"
                  min="1"
                  value={form.maxCharacters}
                  onChange={(e) =>
                    updateField(
                      'maxCharacters',
                      Number(e.target.value)
                    )
                  }
                  className="rounded-lg border p-3"
                  placeholder="Máximo de caracteres"
                />

                <input
                  type="number"
                  min="1"
                  value={form.defaultTimeLimit}
                  onChange={(e) =>
                    updateField(
                      'defaultTimeLimit',
                      Number(e.target.value)
                    )
                  }
                  className="rounded-lg border p-3"
                  placeholder="Segundos"
                />
              </div>

              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-bold">Preguntas</h3>

                  <button
                    onClick={addQuestion}
                    className="rounded-lg bg-[#0AADA8] px-4 py-2 text-sm text-white"
                  >
                    + Agregar pregunta
                  </button>
                </div>

                <div className="space-y-4">
                  {form.questions.map((question) => (
                    <div
                      key={question.id}
                      className="rounded-xl border p-4"
                    >
                      <div className="mb-3 flex justify-between">
                        <strong>
                          Pregunta {question.order}
                        </strong>

                        <button
                          onClick={() =>
                            removeQuestion(question.id)
                          }
                          className="text-sm text-red-600"
                        >
                          Eliminar
                        </button>
                      </div>

                      <input
                        type="file"
                        accept=".mp3,.wav,.ogg,.webm,audio/mpeg,audio/wav,audio/ogg,audio/webm"
                        onChange={(e) =>
                          handleAudioChange(
                            question.id,
                            e.target.files?.[0]
                          )
                        }
                        className="w-full rounded-lg border p-2 text-sm"
                      />

                      {question.audioName && (
                        <p className="mt-2 text-sm text-gray-600">
                          🎧 {question.audioName}
                        </p>
                      )}

                      {question.audioUrl && (
                        <audio
                          controls
                          src={question.audioUrl}
                          className="mt-3 w-full"
                        />
                      )}

                      <div className="mt-3 flex gap-2">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">
                          {form.maxCharacters} caracteres
                        </span>

                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">
                          {form.defaultTimeLimit} segundos
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t p-6">
              <button
                onClick={closeForm}
                className="rounded-lg border px-5 py-2"
              >
                Cancelar
              </button>

              <button
                disabled={saving}
                onClick={saveMacrocase}
                className="rounded-lg bg-[#0AADA8] px-5 py-2 font-semibold text-white disabled:opacity-50"
              >
                {saving
                  ? 'Guardando...'
                  : editing
                  ? 'Guardar cambios'
                  : 'Crear macrocaso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}