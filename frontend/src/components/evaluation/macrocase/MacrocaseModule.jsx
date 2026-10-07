import { useEffect, useState } from 'react';
import { preloadAvatar } from '../../avatar/TalkingAvatarView.jsx';
import { prepareSpeech } from '../../../services/speechSynthesis.js';
import { MacrocaseIntro } from './MacrocaseIntro.jsx';
import { MacrocaseReading } from './MacrocaseReading.jsx';
import { MacrocaseQuestions } from './MacrocaseQuestions.jsx';

/**
 * Module B · Macrocase: intro → read the case → avatar asks each question,
 * candidate answers in writing.
 *
 * It does not submit anything: the page that hosts it receives the answers
 * through `onComplete([{ questionId, text }])` and shows the confirmation
 * (`ConfirmPanel`) and sending, same as Module A.
 *
 * @param {{ macrocase: { name: string, description?: string, introduction: string,
 *   maxCharacters?: number, questions: Array<{ id: string, text: string, audioUrl?: string }> },
 *   onComplete: (answers: Array<{ questionId: string, text: string }>) => void }} props
 */
export function MacrocaseModule({ macrocase, onComplete }) {
  const [phase, setPhase] = useState('intro');

  // Download the avatar illustration and find the voice while the candidate reads the case.
  useEffect(() => {
    preloadAvatar();
    prepareSpeech();
  }, []);

  const goTo = (next) => {
    setPhase(next);
    window.scrollTo?.({ top: 0 });
  };

  if (phase === 'intro') return <MacrocaseIntro macrocase={macrocase} onStart={() => goTo('reading')} />;
  if (phase === 'reading') return <MacrocaseReading macrocase={macrocase} onContinue={() => goTo('questions')} />;
  return <MacrocaseQuestions macrocase={macrocase} onComplete={onComplete} />;
}
