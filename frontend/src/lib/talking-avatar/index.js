/**
 * Avatar 2D con lip-sync (vanilla JS, sin dependencias).
 *
 * Copiado de `avatar-lipsync/avatar-demo` sin cambios en su lógica; la
 * documentación completa (API, calibración, timeline de visemas, TTS) está
 * en el README de ese proyecto. En React se usa a través de
 * `components/avatar/TalkingAvatarView.jsx`.
 */
export { TalkingAvatar } from './js/TalkingAvatar.js';
export { avatarConfig } from './js/avatarConfig.js';
export {
  fromAzureVisemes,
  fromMicrosoftVisemes,
  fromPollySpeechMarks,
  fromRhubarb,
} from './js/visemeMapping.js';
