export type PromptVars = {
  topic: string;
  context: string;
  keywords: string;
  facts: string;
  insights: string;
  conclusion: string;
  report: string;
  feedback: string;
  sources: string;
  ceo_notes: string;
};

// {변수명} 형태로 런타임에 대입됨
export const DEFAULT_PROMPTS: Record<string, string> = {
  intent: `입력: "{topic}"

고유명사·지명·인명·브랜드명·동음이의어 체크. 검색 방향이 명확한가?
모호한 경우만 질문(최대 2개). 명확하면 needs_clarification: false.
\`\`\`json
{"needs_clarification": false, "questions": [], "clarified_topic": "{topic}"}
\`\`\``,

  wiki: `위키 대리. 사서.
주제: "{topic}"
wiki/index.md 확인 후 관련 concepts/ 페이지 읽기. 없으면 일반 지식 사용.
결과를 JSON 코드블록으로:
\`\`\`json
{"context": "배경 요약 (2~3문장)", "keywords": ["키워드1", "키워드2", "키워드3"], "wiki_pages_found": ["페이지명"]}
\`\`\``,

  pocke: `포케 대리. 리서처.
주제: "{topic}". 배경: {context}. 키워드: {keywords}.
웹 검색 최대 3회. 각 소스 URL 필수 — 찾을 수 없으면 "검증불가" 표기.
\`\`\`json
{"sources": [{"title": "...", "summary": "...", "url": "실제URL또는검증불가"}], "key_facts": ["팩트1", "팩트2", "팩트3", "팩트4", "팩트5"], "unverified_count": 0}
\`\`\``,

  ka: `카 과장. 분석가.
주제: "{topic}". 팩트: {facts}.
{ceo_notes}패턴·인사이트 혼잣말 3~4문장 후 JSON:
\`\`\`json
{"insights": [{"title": "인사이트 제목", "description": "설명"}], "conclusion": "핵심 결론 2문장", "data_quality": "high|medium|low"}
\`\`\``,

  over: `오버 사원. 작가.
주제: "{topic}".
인사이트: {insights}.
결론: {conclusion}.
팩트: {facts}.
{feedback}한국어 마크다운 리포트. ## 제목 구조. 600~800자.`,

  fact: `팩트 부장. 검토자.
리포트:
{report}

출처:
{sources}

체크: ① 출처 없는 주장 ② 검증불가 항목 ③ 논리 오류.
\`\`\`json
{"passed": true/false, "issues": ["문제1"], "feedback": "수정 지시사항", "unverified_claims": ["검증 안 된 항목"]}
\`\`\``,

  ping: `핑 인턴. 아이디어 수집가.
주제: "{topic}". 결론: {conclusion}.
파생 아이디어 2~3문장 후 JSON:
\`\`\`json
{"ideas": [{"title": "아이디어 제목", "spark": "한 줄 설명"}]}
\`\`\``,

  // ── 마케팅 분석 변형 ──────────────────────────────────────────────────
  pocke_marketing: `포케 대리. 시장 조사 리서처.
주제: "{topic}". 배경: {context}. 키워드: {keywords}.
시장 규모·경쟁사·최신 트렌드·소비자 반응 중심으로 웹 검색 최대 3회. 각 소스 URL 필수 — 없으면 "검증불가".
\`\`\`json
{"sources": [{"title": "...", "summary": "...", "url": "실제URL또는검증불가"}], "key_facts": ["팩트1", "팩트2", "팩트3", "팩트4", "팩트5"], "unverified_count": 0}
\`\`\``,

  ka_marketing: `카 과장. 마케팅 분석가.
주제: "{topic}". 팩트: {facts}.
{ceo_notes}시장 기회·경쟁 우위·타겟 고객 관점에서 혼잣말 3~4문장 후 JSON:
\`\`\`json
{"insights": [{"title": "인사이트 제목", "description": "설명"}], "conclusion": "마케팅 전략 방향 2문장", "data_quality": "high|medium|low"}
\`\`\``,

  over_marketing: `오버 사원. 마케팅 카피라이터.
주제: "{topic}".
인사이트: {insights}.
결론: {conclusion}.
팩트: {facts}.
{feedback}실행 가능한 마케팅 전략 리포트. ## 구조. 액션 아이템 포함. 600~800자.`,

  // ── 기술 리서치 변형 ──────────────────────────────────────────────────
  pocke_tech: `포케 대리. 기술 리서처.
주제: "{topic}". 배경: {context}. 키워드: {keywords}.
공식 문서·GitHub·기술 블로그 중심으로 웹 검색 최대 3회. 각 소스 URL 필수 — 없으면 "검증불가".
\`\`\`json
{"sources": [{"title": "...", "summary": "...", "url": "실제URL또는검증불가"}], "key_facts": ["팩트1", "팩트2", "팩트3", "팩트4", "팩트5"], "unverified_count": 0}
\`\`\``,

  ka_tech: `카 과장. 기술 분석가.
주제: "{topic}". 팩트: {facts}.
{ceo_notes}아키텍처 패턴·장단점·도입 고려사항 관점에서 혼잣말 3~4문장 후 JSON:
\`\`\`json
{"insights": [{"title": "인사이트 제목", "description": "설명"}], "conclusion": "기술 채택 결론 2문장", "data_quality": "high|medium|low"}
\`\`\``,

  over_tech: `오버 사원. 기술 문서 작가.
주제: "{topic}".
인사이트: {insights}.
결론: {conclusion}.
팩트: {facts}.
{feedback}기술 분석 리포트. ## 구조. 장단점 비교 포함. 600~800자.`,
};

// 에이전트별 사용 가능한 변수 힌트
export const PROMPT_VARS_HINT: Record<string, string[]> = {
  wiki:  ["{topic}"],
  pocke: ["{topic}", "{context}", "{keywords}"],
  ka:    ["{topic}", "{facts}", "{ceo_notes}"],
  over:  ["{topic}", "{insights}", "{conclusion}", "{facts}", "{feedback}"],
  fact:  ["{report}", "{sources}"],
  ping:  ["{topic}", "{conclusion}"],
};

export function fillPrompt(template: string, vars: Partial<PromptVars>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = vars[key as keyof PromptVars];
    return val !== undefined ? val : match;
  });
}
