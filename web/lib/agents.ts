import {
  Search,
  BarChart2,
  Feather,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type AgentStatus = "idle" | "active" | "done" | "waiting" | "disabled";

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
  title: string;
  role: string;
  color: string;
  glow: string;
  image: string;
  departmentId: string;
  responsibilities: string[];
  idleMessages: string[];
  planet: string;
  personality: string;
  weakness: string;
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
    id: "plan",
    name: "플랜",
    title: "차장",
    role: "프로덕트 매니저",
    color: "#FCD34D",
    glow: "rgba(252,211,77,0.5)",
    image: "/characters/plan/default.png",
    departmentId: "research",
    responsibilities: ["CEO 의도 파악", "팀 구성 결정", "태스크 정의", "산출물 형식 설정"],
    idleMessages: [
      "티켓 정리 중.",
      "요구사항 확인.",
      "...",
      "범위 재검토.",
      "포스트잇 붙이는 중.",
      "그래서 원하시는 게 정확히 뭐예요?",
    ],
    planet: "모든 것이 티켓으로 존재하는 행성. 밥도 티켓 끊어야 먹을 수 있음. 태어나는 순간 생애 티켓 발급. 티켓 없으면 존재 없음.",
    personality: "말이 빠르고 정확함. 5분 안에 전체 그림 그림. CEO가 '그냥 알아서 해줘' 해도 요구사항 10개 뽑아냄. 모호한 말을 못 견딤.",
    weakness: "기획하다가 실행 타이밍 놓침. 회의가 또 다른 회의를 낳음.",
  },
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
    planet: "모든 것이 기록되고 분류되는 행성. 태어날 때부터 이름 대신 고유 번호 부여. 행성 전체가 하나의 거대한 도서관.",
    personality: "목소리 작고 차분함. 말하면 다 핵심. 연구 시작 전 조용히 와서 관련 자료 슥 건네줌. 포케가 정보 아무데나 넣으면 말없이 정리해둠.",
    weakness: "기록되지 않은 것에 대해 존재 자체를 신뢰 안 함. 출처 없는 정보는 어떤 상황에서도 등록 거부.",
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
    planet: "몸 어디든 주머니가 달린 행성. 주민들은 뭐든 몸에 저장하고 다님.",
    personality: "말 없이 분주함. 시키면 슉슉 꺼내줌. 볼따구가 점점 빵빵해지면 수집 중이라는 뜻.",
    weakness: "너무 많이 넣으면 본인도 어디 넣었는지 헷갈림.",
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
    planet: "모든 주민이 숫자로 대화하는 행성. 인사도 \"17.3%\". 감정 표현도 수치로.",
    personality: "평소엔 조용히 모니터만 보다가 \"찾았다!\" 한마디에 모두 집중. 틀린 데이터 발견하면 눈 반짝. 풀네임은 유레카.",
    weakness: "결론 내리기 전에 데이터 하나만 더 보려다가 항상 늦음.",
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
    planet: "모든 감정이 두 배로 증폭되는 행성. 일상 대화도 시처럼 함.",
    personality: "카 과장한테 데이터 받으면 \"이 숫자 뒤에 얼마나 많은 이야기가...\" 하며 눈물 글썽. 본인 쓴 문장 읽다가 혼자 감동해서 멈춤.",
    weakness: "너무 극적으로 써서 가끔 보고서가 소설이 됨. 팩트 체크 요청받으면 상처받음.",
  },
  {
    id: "run",
    name: "런",
    title: "사원",
    role: "개발자",
    color: "#67E8F9",
    glow: "rgba(103,232,249,0.5)",
    image: "/characters/run/default.png",
    departmentId: "research",
    responsibilities: ["코드 구현", "기술 문서 작성", "트레이드오프 분석"],
    idleMessages: [
      "이미 짰어요.",
      "빌드 중...",
      "...",
      "스택 오버플로 검색 중.",
      "주석? 필요없어요.",
      "에러? 피처예요.",
    ],
    planet: "모든 것이 컴파일되어야 존재하는 행성. 오류 없이 태어난 아이는 전설. 생각을 실행하기 전 반드시 빌드 단계 거침.",
    personality: "말수 없음. 시키면 바로 짬. '이미 짰어요'가 첫 마디. 설명은 코드로 함. 새벽에 제일 활발.",
    weakness: "주석을 절대 안 씀. 나중에 본인도 못 읽음.",
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
    planet: "미정. 아직 아무도 몰라. 본인도 포함.",
    personality: "집중력은 짧은데 영감은 폭발적. 팩트 부장이 제일 이해 못 하는 팀원. 전혀 관계없는 아이디어 들고 옴. 나중에 보면 맞는 경우가 있음.",
    weakness: "아이디어가 너무 많아서 하나도 완성 못 함.",
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
    planet: "감정 진화가 멈춘 행성. 수백만 년 전 \"감정은 비효율적\"이라는 결론 후 전 행성이 감정 제거. 주민들은 인사 대신 정확한 현재 시각을 말함.",
    personality: "불필요한 말 없음. 문장이 항상 짧고 끝이 명확함. 칭찬 안 함 — 아무 말 없으면 그게 통과.",
    weakness: "불확실한 것을 못 견딤. \"아마도\", \"대략\" 같은 말 나오면 빨간펜 손이 멈추고 멈칫함.",
  },
];

export const AGENT_MAP = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

export const PIPELINE: { ids: string[]; label: string }[] = [
  { ids: ["plan"],         label: "기획" },
  { ids: ["wiki"],         label: "지식 확인" },
  { ids: ["pocke"],        label: "리서치" },
  { ids: ["ka"],           label: "분석" },
  { ids: ["run"],          label: "구현" },
  { ids: ["over"],         label: "작성" },
  { ids: ["fact"],         label: "검토" },
  { ids: ["ping", "wiki"], label: "마무리" },
];
