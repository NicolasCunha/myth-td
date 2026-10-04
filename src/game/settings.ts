// Configurações do jogador (tela "Configurações" do menu). Persistidas
// separadas do progresso — novas opções entram aqui com um valor padrão.

export interface Settings {
  musicVolume: number; // 0..1
  sfxVolume: number; // 0..1
  muted: boolean;
  tutorialDone: boolean;
}

export const SETTINGS_KEY = "myth-td-settings-v1";

const DEFAULT_SETTINGS: Settings = {
  musicVolume: 0.8,
  sfxVolume: 0.8,
  muted: false,
  tutorialDone: false,
};

function clamp01(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback;
}

export function loadSettings(): Settings {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      musicVolume: clamp01(parsed.musicVolume, DEFAULT_SETTINGS.musicVolume),
      sfxVolume: clamp01(parsed.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      muted: parsed.muted === true,
      tutorialDone: parsed.tutorialDone === true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
