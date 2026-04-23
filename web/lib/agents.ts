export type AgentStatus = "idle" | "active" | "done" | "waiting";

export type AgentDef = {
  id: string;
  name: string;
  title: string;
  color: string;
  glow: string;
  image: string;
  idleMessages: string[];
};

export const AGENTS: AgentDef[] = [
  {
    id: "wiki",
    name: "위키",
    title: "대리",
    color: "#C4B5FD",
    glow: "rgba(196,181,253,0.5)",
    image: "/characters/wiki/default.png",
    idleMessages: [
      "색인 정리 중...",
      "기록 업데이트.",
      "...",
      "출처 확인 중.",
      "조용히 분류 중.",
      "이전 리서치 연결.",
    ],
  },
  {
    id: "pocke",
    name: "포케",
    title: "대리",
    color: "#86EFAC",
    glow: "rgba(134,239,172,0.5)",
    image: "/characters/pocke/default.png",
    idleMessages: [
      "어디다 뒀더라...",
      "슉.",
      "볼따구 정리 중.",
      "음...",
      "...",
      "아 여기있었네.",
    ],
  },
  {
    id: "ka",
    name: "카",
    title: "과장",
    color: "#A78BFA",
    glow: "rgba(167,139,250,0.5)",
    image: "/characters/ka/default.png",
    idleMessages: [
      "17.3%...",
      "데이터 더 봐야해.",
      "커피 한 잔만 더.",
      "흠.",
      "...",
      "패턴이 보일듯 말듯.",
    ],
  },
  {
    id: "over",
    name: "오버",
    title: "사원",
    color: "#F9A8D4",
    glow: "rgba(249,168,212,0.5)",
    image: "/characters/over/default.png",
    idleMessages: [
      "오늘 날씨가 왜이리 감성적이지...",
      "흑...",
      "이 문장... 완벽해.",
      "...",
      "눈물이 날 것 같아.",
      "감동이다 혼자.",
    ],
  },
  {
    id: "fact",
    name: "팩트",
    title: "부장",
    color: "#CBD5E1",
    glow: "rgba(203,213,225,0.5)",
    image: "/characters/fact/default.png",
    idleMessages: [
      ".",
      "대기 중.",
      "...",
      ".",
      "준비됨.",
      ".",
    ],
  },
  {
    id: "ping",
    name: "핑",
    title: "인턴",
    color: "#6EE7B7",
    glow: "rgba(110,231,183,0.5)",
    image: "/characters/ping/default.png",
    idleMessages: [
      "오 이거 어떠냐!",
      "번뜩! 아 아닌가.",
      "...",
      "저거랑 이거 합치면?",
      "안테나 반짝✨",
      "뭔가 올 것 같은데!",
    ],
  },
];

export const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
