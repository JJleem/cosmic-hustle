export type OutputFormat = "report" | "blog_post" | "html" | "document";

export type TaskType = {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
  defaultAgents: string[];
  promptVariants: Record<string, string>; // agentId → prompt key in DEFAULT_PROMPTS
  outputFormat: OutputFormat;
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
    outputFormat: "report",
  },
  {
    id: "marketing",
    name: "마케팅",
    emoji: "📢",
    description: "시장 조사, 경쟁사 분석, 마케팅 전략 수립",
    color: "#FB923C",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "buzz", "fact", "ping"],
    promptVariants: { pocke: "pocke_marketing", ka: "ka_marketing", buzz: "buzz" },
    outputFormat: "report",
  },
  {
    id: "blog",
    name: "블로그 포스팅",
    emoji: "✍️",
    description: "Velog·티스토리 바로 올릴 수 있는 블로그 글",
    color: "#FDE68A",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "over", "fact", "ping"],
    promptVariants: { over: "over_blog" },
    outputFormat: "blog_post",
  },
  {
    id: "tech",
    name: "기술 리서치",
    emoji: "⚙️",
    description: "기술 스택 분석, 아키텍처 검토, 도입 가이드",
    color: "#86efac",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "over", "fact", "ping"],
    promptVariants: { pocke: "pocke_tech", ka: "ka_tech", over: "over_tech" },
    outputFormat: "report",
  },
  {
    id: "design_ux",
    name: "UX 리서치",
    emoji: "🧭",
    description: "사용자 여정 분석, 페인포인트, 개선 방향",
    color: "#F0ABFC",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "pixel", "fact", "ping"],
    promptVariants: { pixel: "pixel_ux" },
    outputFormat: "report",
  },
  {
    id: "design_ui",
    name: "UI 디자인",
    emoji: "🎨",
    description: "HTML/CSS 결과물 생성, 컴포넌트·색상 가이드",
    color: "#FDBA74",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "pixel", "fact", "ping"],
    promptVariants: { pixel: "pixel_ui" },
    outputFormat: "html",
  },
  {
    id: "dev_plan",
    name: "개발 기획서",
    emoji: "📋",
    description: "배경·목표·기술 스택·일정 포함 기획 문서",
    color: "#A5B4FC",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "over", "fact", "ping"],
    promptVariants: { ka: "ka_tech", over: "over_dev_plan" },
    outputFormat: "document",
  },
  {
    id: "dev_spec",
    name: "기능명세서",
    emoji: "📐",
    description: "기능 목록, 입출력, 우선순위 표 형식 명세",
    color: "#C4B5FD",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "over", "fact", "ping"],
    promptVariants: { ka: "ka_tech", over: "over_dev_spec" },
    outputFormat: "document",
  },
  {
    id: "dev",
    name: "개발",
    emoji: "💻",
    description: "기술 구현, 코드 작성, 배포 계획",
    color: "#67E8F9",
    defaultAgents: ["plan", "wiki", "pocke", "ka", "run", "root", "fact", "ping"],
    promptVariants: { pocke: "pocke_tech", ka: "ka_tech", fact: "fact_dev" },
    outputFormat: "report",
  },
];

export const TASK_TYPE_MAP = Object.fromEntries(TASK_TYPES.map((t) => [t.id, t]));

export const DEFAULT_TASK_TYPE = TASK_TYPES[0];
