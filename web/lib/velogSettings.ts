const ACCESS_KEY = "cosmic-hustle-velog-access";
const REFRESH_KEY = "cosmic-hustle-velog-refresh";

export type VelogTokens = { access: string; refresh: string };

export function loadVelogTokens(): VelogTokens {
  if (typeof window === "undefined") return { access: "", refresh: "" };
  return {
    access: localStorage.getItem(ACCESS_KEY) ?? "",
    refresh: localStorage.getItem(REFRESH_KEY) ?? "",
  };
}

export function saveVelogTokens(tokens: VelogTokens): void {
  tokens.access.trim()
    ? localStorage.setItem(ACCESS_KEY, tokens.access.trim())
    : localStorage.removeItem(ACCESS_KEY);
  tokens.refresh.trim()
    ? localStorage.setItem(REFRESH_KEY, tokens.refresh.trim())
    : localStorage.removeItem(REFRESH_KEY);
}

// 하위 호환 — 단일 토큰 로드 (access_token만)
export function loadVelogToken(): string {
  return loadVelogTokens().access;
}
