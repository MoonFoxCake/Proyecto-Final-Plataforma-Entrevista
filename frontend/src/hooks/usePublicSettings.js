import { useEffect, useState } from 'react';
import defaults from '../../../backend/src/config/default-settings.json';
import { getPublicSettings } from '../services/settingsService.js';

/**
 * Public content editable from "Configuración". Starts from the shipped
 * values, so pages render at once and still work if the request fails.
 */
export function usePublicSettings() {
  const [settings, setSettings] = useState(defaults);

  useEffect(() => {
    let active = true;
    getPublicSettings()
      .then((loaded) => { if (active && loaded) setSettings((current) => ({ ...current, ...loaded })); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  return settings;
}
