import {
  Search,
  BarChart2,
  Feather,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type AgentStatus = "idle" | "active" | "done" | "waiting";

export type Department = {
  id: string;
  name: string;
  label: string;
  color: string;
  icon: LucideIcon;
};

export type AgentDef = {
  id: string;
  name: string;
  title: string;   // 직급 (대리, 과장, 부장...)
  role: string;    // 직군 (리서처, 사서, 분석가...)
  color: string;
  glow: string;
  image: string;
  departmentId: string;
  responsibilities: string[];
  idleMessages: string[];
};

export const DEPARTMENTS: Department[] = [
  {
    id: "research",
    name: "RESEARCH",
    label: "리서치부",
    color: "#86EFAC",
    icon: Search,
  },
  {
    id: "analysis",
    name: "ANALYSIS",
    label: "분석부",
    color: "#A78BFA",
    icon: BarChart2,
  },
  {
    id: "creative",
    name: "CREATIVE",
    label: "크리에이티브부",
    color: "#F9A8D4",
    icon: Feather,
  },
  {
    id: "review",
    name: "REVIEW",
    label: "검토부",
    color: "#CBD5E1",
    icon: ShieldCheck,
  },
];

export const DEPT_MAP = Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d]));

export const AGENTS: AgentDef[] = [
  {
    id: "wiki",
    name: "위키",
    title: "대리",
    role: "사서",
    color: "#C4B5FD",
    glow: "rgba(196,181,253,0.5)",
    image: "/characters/wiki/default.png",
    departmentId: "research",
    responsibilities: ["지식 누적 (Wiki)", "이전 리서치 연결", "컨텍스트 제공"],
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
    role: "리서처",
    color: "#86EFAC",
    glow: "rgba(134,239,172,0.5)",
    image: "/characters/pocke/default.png",
    departmentId: "research",
    responsibilities: ["웹 검색", "정보 수집", "소스 정리"],
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
    role: "분석가",
    color: "#A78BFA",
    glow: "rgba(167,139,250,0.5)",
    image: "/characters/ka/default.png",
    departmentId: "analysis",
    responsibilities: ["데이터 가공", "패턴 발견", "인사이트 도출"],
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
    role: "작가",
    color: "#F9A8D4",
    glow: "rgba(249,168,212,0.5)",
    image: "/characters/over/default.png",
    departmentId: "creative",
    responsibilities: ["리포트 초안 작성", "내러티브 구성", "마크다운 포맷"],
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
    id: "ping",
    name: "핑",
    title: "인턴",
    role: "아이디어 수집가",
    color: "#6EE7B7",
    glow: "rgba(110,231,183,0.5)",
    image: "/characters/ping/default.png",
    departmentId: "creative",
    responsibilities: ["아이디어 캡처", "개념 연결", "\"이거랑 저거 합치면?\" 제안"],
    idleMessages: [
      "오 이거 어떠냐!",
      "번뜩! 아 아닌가.",
      "...",
      "저거랑 이거 합치면?",
      "안테나 반짝✨",
      "뭔가 올 것 같은데!",
    ],
  },
  {
    id: "fact",
    name: "팩트",
    title: "부장",
    role: "검토자",
    color: "#CBD5E1",
    glow: "rgba(203,213,225,0.5)",
    image: "/characters/fact/default.png",
    departmentId: "review",
    responsibilities: ["팩트체크", "논리 오류 탐지", "품질 검수"],
    idleMessages: [
      ".",
      "대기 중.",
      "...",
      ".",
      "준비됨.",
      ".",
    ],
  },
];

export const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a]));
