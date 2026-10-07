import { forwardRef, useImperativeHandle } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MacrocaseModule } from './MacrocaseModule.jsx';
import { DEMO_MACROCASE } from './macrocaseFixture.js';

const speak = vi.fn();
const stop = vi.fn();
const whenReady = () => Promise.resolve();

vi.mock('../../avatar/TalkingAvatarView.jsx', () => ({
  TalkingAvatarView: forwardRef(function MockAvatar(_props, ref) {
    useImperativeHandle(ref, () => ({ speak, stop, whenReady }));
    return <div data-testid='avatar' />;
  }),
  preloadAvatar: vi.fn(),
  AUTOPLAY_BLOCKED: 'autoplay-blocked',
}));

describe('MacrocaseModule', () => {
  beforeEach(() => { window.scrollTo = vi.fn(); });

  test('reads the case, asks every question aloud and returns the written answers', async () => {
    const onComplete = vi.fn();
    render(<MacrocaseModule macrocase={DEMO_MACROCASE} onComplete={onComplete} />);

    fireEvent.click(screen.getByRole('button', { name: 'Leer el caso →' }));
    expect(screen.getByRole('heading', { name: 'Caperucita Roja' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar preguntas →' }));

    // The case can only be read before the questions.
    expect(screen.queryByText(/Había una vez/)).toBeNull();
    expect(screen.queryByText(/Consultar el caso/)).toBeNull();

    for (const [index, question] of DEMO_MACROCASE.questions.entries()) {
      expect(screen.getByRole('heading', { name: question.text })).toBeTruthy();
      await waitFor(() => expect(speak).toHaveBeenLastCalledWith({ text: question.text, audioUrl: question.audioUrl, visemes: null }), { timeout: 2000 });

      const isLast = index === DEMO_MACROCASE.questions.length - 1;
      const next = screen.getByRole('button', { name: isLast ? 'Finalizar macrocaso →' : 'Continuar →' });
      expect(next.disabled).toBe(true);
      fireEvent.change(screen.getByLabelText('Tu respuesta'), { target: { value: `  Respuesta ${index + 1}  ` } });
      fireEvent.click(next);
    }

    expect(screen.queryByText(/Anterior/i)).toBeNull();
    expect(onComplete).toHaveBeenCalledWith(
      DEMO_MACROCASE.questions.map((question, index) => ({ questionId: question.id, text: `Respuesta ${index + 1}` })),
    );
  });

  test('passes the generated voice and its Azure visemes to the avatar', async () => {
    speak.mockClear();
    const macrocase = {
      ...DEMO_MACROCASE,
      questions: [{
        id: 'q1', text: '¿Qué haría usted?', audioUrl: 'https://cdn/q1.mp3',
        visemes: [{ offsetMs: 0, visemeId: 0 }, { offsetMs: 120, visemeId: 21 }, { offsetMs: 300, visemeId: 2 }],
      }],
    };
    render(<MacrocaseModule macrocase={macrocase} onComplete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Leer el caso →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar preguntas →' }));

    await waitFor(() => expect(speak).toHaveBeenCalledWith({
      text: '¿Qué haría usted?',
      audioUrl: 'https://cdn/q1.mp3',
      visemes: [{ time: 0, viseme: 'REST' }, { time: 0.12, viseme: 'MBP' }, { time: 0.3, viseme: 'AI' }],
    }), { timeout: 2000 });
  });

  test('when the time runs out it keeps what was written and moves to the next question', async () => {
    const onComplete = vi.fn();
    const macrocase = {
      ...DEMO_MACROCASE,
      defaultTimeLimit: 1,
      questions: [
        { id: 'q1', text: '¿Qué haría usted en el lugar del lobo?', audioUrl: '' },
        { id: 'q2', text: '¿Y en el lugar de la abuela?', audioUrl: '' },
      ],
    };
    render(<MacrocaseModule macrocase={macrocase} onComplete={onComplete} />);
    expect(screen.getByText(/para responder cada pregunta/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Leer el caso →' }));
    fireEvent.click(screen.getByRole('button', { name: 'Comenzar preguntas →' }));

    // The countdown starts once the question has been read.
    await waitFor(() => expect(screen.getByRole('timer').getAttribute('aria-label')).toMatch(/Tiempo restante/), { timeout: 2000 });
    fireEvent.change(screen.getByLabelText('Tu respuesta'), { target: { value: 'Buscaría otra comida' } });

    expect(await screen.findByRole('heading', { name: '¿Y en el lugar de la abuela?' }, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByLabelText('Tu respuesta').value).toBe('');
    await waitFor(() => expect(onComplete).toHaveBeenCalledWith([
      { questionId: 'q1', text: 'Buscaría otra comida', timedOut: true },
      { questionId: 'q2', text: '', timedOut: true },
    ]), { timeout: 4000 });
  }, 10000);
});
