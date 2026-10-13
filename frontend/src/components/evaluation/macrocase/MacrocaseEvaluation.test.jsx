import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MacrocaseEvaluation } from './MacrocaseEvaluation.jsx';
import { createLocalMacrocaseSource } from './macrocaseSources.js';
import { DEMO_MACROCASE } from './macrocaseFixture.js';

const speak = vi.fn(async () => ({ completed: true }));
const stop = vi.fn();
const whenReady = () => Promise.resolve();

vi.mock('../../avatar/TalkingAvatarView.jsx', () => ({
  TalkingAvatarView: forwardRef(function MockAvatar({ onReady }, ref) {
    useImperativeHandle(ref, () => ({ speak, stop, whenReady }));
    useEffect(() => { onReady?.(); }, [onReady]);
    return <div data-testid='avatar' />;
  }),
  preloadAvatar: vi.fn(),
  AUTOPLAY_BLOCKED: 'autoplay-blocked',
}));

const [SECTION_1, SECTION_2] = DEMO_MACROCASE.sections;

describe('MacrocaseEvaluation', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    speak.mockClear();
    stop.mockClear();
  });

  test('goes section by section: narrative, then its questions, hiding each text once its questions start', async () => {
    const source = createLocalMacrocaseSource({ ...DEMO_MACROCASE, defaultTimeLimit: 0 });
    const finalize = vi.spyOn(source, 'finalize');
    render(<MacrocaseEvaluation source={source} />);

    expect(await screen.findByRole('heading', { name: 'Análisis de un caso' })).toBeTruthy();
    expect(screen.getByText(/2 secciones y 4 preguntas/)).toBeTruthy();
    expect(screen.getByText(DEMO_MACROCASE.instructions)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar →' }));

    for (const [sectionIndex, section] of DEMO_MACROCASE.sections.entries()) {
      // Narrative: shown and narrated by the avatar.
      expect(await screen.findByRole('heading', { name: section.title })).toBeTruthy();
      expect(screen.getByText(`Sección ${sectionIndex + 1} de 2`)).toBeTruthy();
      expect(screen.getByText(/· Lectura/)).toBeTruthy();
      await waitFor(() => expect(speak).toHaveBeenLastCalledWith({ text: section.narrative, audioUrl: '', visemes: null }), { timeout: 2000 });
      fireEvent.click(screen.getByRole('button', { name: 'Continuar a las preguntas →' }));

      // Its questions, one at a time; the narrative is gone.
      for (const [index, question] of section.questions.entries()) {
        expect(await screen.findByRole('heading', { name: question.text })).toBeTruthy();
        expect(screen.queryByText(section.narrative.slice(0, 40), { exact: false })).toBeNull();
        await waitFor(() => expect(speak).toHaveBeenLastCalledWith({ text: question.text, audioUrl: '', visemes: null }), { timeout: 2000 });

        const isLast = sectionIndex === 1 && index === section.questions.length - 1;
        const next = screen.getByRole('button', { name: isLast ? 'Ir al resumen →' : 'Continuar →' });
        expect(next.disabled).toBe(true);
        fireEvent.change(screen.getByLabelText('Tu respuesta'), { target: { value: `  Respuesta ${question.id}  ` } });
        fireEvent.click(next);
      }
    }

    // Moving on cuts whatever the avatar was saying.
    expect(stop).toHaveBeenCalled();
    expect(screen.queryByText(/Anterior/i)).toBeNull();

    expect(await screen.findByRole('heading', { name: 'Finalizar evaluación' })).toBeTruthy();
    expect(screen.getByText(/Respondiste 4 de 4 preguntas/)).toBeTruthy();
    expect(screen.getAllByText(/2 de 2 respondidas/)).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar evaluación' }));

    expect(await screen.findByText('Evaluación completada')).toBeTruthy();
    expect(finalize).toHaveBeenCalledTimes(1);
  }, 15000);

  test('passes the narrative voice and its Azure visemes to the avatar', async () => {
    const macrocase = {
      ...DEMO_MACROCASE,
      sections: [{
        ...SECTION_1,
        narrativeAudio: { audioUrl: 'https://cdn/s1.mp3', visemes: [{ offsetMs: 0, visemeId: 0 }, { offsetMs: 120, visemeId: 21 }] },
      }],
    };
    const source = createLocalMacrocaseSource(macrocase);
    await source.advance({ type: 'START' });
    render(<MacrocaseEvaluation source={source} />);

    await waitFor(() => expect(speak).toHaveBeenCalledWith({
      text: SECTION_1.narrative,
      audioUrl: 'https://cdn/s1.mp3',
      visemes: [{ time: 0, viseme: 'REST' }, { time: 0.12, viseme: 'MBP' }],
    }), { timeout: 2000 });

    // Stop / repeat control.
    expect(await screen.findByRole('button', { name: '↻ Escuchar de nuevo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '↻ Escuchar de nuevo' }));
    await waitFor(() => expect(speak).toHaveBeenCalledTimes(2));
  });

  test('when the time runs out it keeps what was written and moves on', async () => {
    const macrocase = {
      ...DEMO_MACROCASE,
      defaultTimeLimit: 1,
      sections: [{ ...SECTION_2, questions: SECTION_2.questions }],
    };
    render(<MacrocaseEvaluation source={createLocalMacrocaseSource(macrocase)} />);
    expect(await screen.findByText(/para responder cada pregunta/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar →' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continuar a las preguntas →' }));

    // The countdown starts once the question has been read.
    await waitFor(() => expect(screen.getByRole('timer').getAttribute('aria-label')).toMatch(/Tiempo restante/), { timeout: 2000 });
    fireEvent.change(screen.getByLabelText('Tu respuesta'), { target: { value: 'Buscaría ayuda' } });

    expect(await screen.findByRole('heading', { name: SECTION_2.questions[1].text }, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByLabelText('Tu respuesta').value).toBe('');
    expect(await screen.findByRole('heading', { name: 'Finalizar evaluación' }, { timeout: 4000 })).toBeTruthy();
    expect(screen.getByText('2 por tiempo')).toBeTruthy();
  }, 10000);

  test('resumes the saved stage with its draft and saves the draft while typing', async () => {
    const questionStage = {
      state: 'VALID',
      step: 'question',
      macrocase: { name: 'Caso', maxCharacters: 100, defaultTimeLimit: 0, totalSections: 2, totalQuestions: 3 },
      progress: { sectionIndex: 1, totalSections: 2, questionIndex: 0, sectionQuestions: 1, answered: 2, totalQuestions: 3 },
      section: { id: 's2', order: 2, title: 'El bosque' },
      question: { id: 'q3', order: 1, text: '¿Y en el lugar del lobo?', audioUrl: '', visemes: [] },
      draft: 'A medio escribir',
      timer: { limitSeconds: 0, startedAt: null },
      serverNow: new Date().toISOString(),
    };
    const source = {
      getStage: vi.fn(async () => questionStage),
      advance: vi.fn(async () => questionStage),
      finalize: vi.fn(),
    };
    render(<MacrocaseEvaluation source={source} />);

    expect(await screen.findByRole('heading', { name: '¿Y en el lugar del lobo?' })).toBeTruthy();
    expect(screen.getByText('Sección', { exact: false }).textContent).toMatch(/Sección 2 de 2/);
    expect(screen.getByLabelText('Tu respuesta').value).toBe('A medio escribir');

    fireEvent.change(screen.getByLabelText('Tu respuesta'), { target: { value: 'A medio escribir, ya casi' } });
    await waitFor(() => expect(source.advance).toHaveBeenCalledWith({ type: 'SAVE_DRAFT', questionId: 'q3', text: 'A medio escribir, ya casi' }), { timeout: 2500 });
    expect(await screen.findByText('Borrador guardado')).toBeTruthy();
  });

  test('a failed answer keeps the candidate on the question with a message', async () => {
    const source = createLocalMacrocaseSource({ ...DEMO_MACROCASE, defaultTimeLimit: 0 });
    await source.advance({ type: 'START' });
    await source.advance({ type: 'FINISH_NARRATIVE', sectionId: SECTION_1.id });
    const advance = source.advance;
    source.advance = vi.fn(async (action) => {
      if (action.type === 'ANSWER') throw Object.assign(new Error('network'), { response: { data: { error: { message: 'Sin conexión con el servidor.' } } } });
      return advance(action);
    });
    render(<MacrocaseEvaluation source={source} />);

    fireEvent.change(await screen.findByLabelText('Tu respuesta'), { target: { value: 'Avisaría' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar →' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Sin conexión con el servidor.');
    expect(screen.getByRole('heading', { name: SECTION_1.questions[0].text })).toBeTruthy();
    expect(screen.getByLabelText('Tu respuesta').value).toBe('Avisaría');
  });

  test('shows a closed state instead of the macrocase when the access is no longer valid', async () => {
    const source = { getStage: vi.fn(async () => ({ state: 'EXPIRED' })), advance: vi.fn(), finalize: vi.fn() };
    render(<MacrocaseEvaluation source={source} />);
    expect(await screen.findByText('Este acceso ha expirado.')).toBeTruthy();
  });
});
