export type TaskType = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
  defaultAgents: string[];
  promptVariants: Record<string, string>; // agentId → prompt key in DEFAULT_PROMPTS
};

export const TASK_TYPES: TaskType[] = [
  {
    id: "research",
    name: "리서치",
    emoji: "🔬",
    description: "주제 심층 조사 및 인사이트 리포트",
    color: "#93c5fd",
    defaultAgents: ["wiki", "pocke", "ka", "over", "fact", "ping"],
    promptVariants: {},
  },
  {
    id: "marketing",
    name: "마케팅 분석",
    emoji: "📊",
    description: "시장 조사, 경쟁사 분석, 마케팅 전략 도출",
    color: "#f9a8d4",
    defaultAgents: ["wiki", "pocke", "ka", "over", "fact", "ping"],
    promptVariants: { pocke: "pocke_marketing", ka: "ka_marketing", over: "over_marketing" },
  },
  {
    id: "tech",
    name: "기술 리서치",
    emoji: "⚙️",
    description: "기술 스택 분석, 아키텍처 검토, 도입 가이드",
    color: "#86efac",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "over", "fact", "ping"],
    promptVariants: { pocke: "pocke_tech", ka: "ka_tech", over: "over_tech" },
  },
  {
    id: "dev",
    name: "개발",
    emoji: "💻",
    description: "기술 구현, 코드 작성, 아키텍처 설계",
    color: "#67E8F9",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "run", "fact", "ping"],
    promptVariants: { pocke: "pocke_tech", ka: "ka_tech", fact: "fact_dev" },
  },
];

export const TASK_TYPE_MAP = Object.fromEntries(TASK_TYPES.map((t) => [t.id, t]));

export const DEFAULT_TASK_TYPE = TASK_TYPES[0];
