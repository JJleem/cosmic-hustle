export type AgentPersistentSettings = {
  basePrompt?: string;
  instruction: string;
  maxTurns?: number;
};

export type AllAgentSettings = Record<string, AgentPersistentSettings>;

const STORAGE_KEY = "cosmic-hustle-agent-settings";

export function loadAgentSettings(): AllAgentSettings {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AllAgentSettings) : {};
  } catch {
    return {};
  }
}

export function saveAgentSettings(settings: AllAgentSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
