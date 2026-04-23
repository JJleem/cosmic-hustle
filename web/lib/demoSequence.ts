export type DemoStep = {
  agentId: string;
  message: string;
  status: "active" | "done";
  parallel?: boolean; // 이전 스텝과 동시 실행
  delay?: number;     // ms, 기본 1000
};

export const DEMO_SEQUENCE: DemoStep[] = [
  { agentId: "wiki",  message: "관련 자료 조용히 꺼내는 중...", status: "active", delay: 0 },
  { agentId: "wiki",  message: "이전 리서치 3건 발견. 넘길게요.", status: "done", delay: 1400 },

  { agentId: "pocke", message: "볼따구에 정보 쑤셔넣는 중...", status: "active", delay: 600 },
  { agentId: "pocke", message: "출처 14개. 볼따구 터질것같아", status: "active", delay: 1600 },
  { agentId: "pocke", message: "슉. 카 과장한테 넘길게요.", status: "done", delay: 1400 },

  { agentId: "ka",    message: "패턴 분석 시작. 데이터 하나만 더...", status: "active", delay: 500 },
  { agentId: "ka",    message: "찾았다!!! 핵심 인사이트 잡음.", status: "active", delay: 1800 },
  { agentId: "ka",    message: "인사이트 3개. 오버한테 넘길게.", status: "done", delay: 1200 },

  { agentId: "over",  message: "이 숫자 뒤에 얼마나 많은 이야기가...", status: "active", delay: 400 },
  { agentId: "over",  message: "쓰다 보니 눈물이... 😭", status: "active", delay: 2000 },
  { agentId: "over",  message: "리포트 완성. 걸작이에요. 팩트 부장님께.", status: "done", delay: 1400 },

  { agentId: "fact",  message: "...", status: "active", delay: 300 },
  { agentId: "fact",  message: "오류 2건. 수정 후 재검토.", status: "active", delay: 1600 },
  { agentId: "over",  message: "...수정했습니다. (상처받음)", status: "active", parallel: true, delay: 800 },
  { agentId: "fact",  message: "통과.", status: "done", delay: 1200 },
  { agentId: "over",  message: "통과라고 했다... 걸작 맞지.", status: "done", parallel: true, delay: 400 },

  // 병렬 구간
  { agentId: "ping",  message: "이거랑 저거 합치면?! ✨ 안테나 반짝!", status: "active", delay: 0 },
  { agentId: "wiki",  message: "리서치 기록 업데이트 중...", status: "active", parallel: true, delay: 200 },
  { agentId: "ping",  message: "아이디어 5개 캡처 완료!", status: "done", delay: 1600 },
  { agentId: "wiki",  message: "위키 업데이트 완료. 다음에 쓸 수 있어요.", status: "done", parallel: true, delay: 800 },
];
