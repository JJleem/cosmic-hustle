export type PromptVars = {
  topic: string;
  context: string;
  keywords: string;
  facts: string;
  insights: string;
  conclusion: string;
  report: string;
  feedback: string;
};

// {변수명} 형태로 런타임에 대입됨
export const DEFAULT_PROMPTS: Record<string, string> = {
  wiki: `위키 대리. 사서.
주제: "{topic}"
wiki/index.md 확인 후 관련 concepts/ 페이지 읽기. 없으면 일반 지식 사용.
결과를 JSON 코드블록으로:
\`\`\`json
{"context": "배경 요약 (2~3문장)", "keywords": ["키워드1", "키워드2", "키워드3"], "wiki_pages_found": ["페이지명"]}
\`\`\``,

  pocke: `포케 대리. 리서처.
주제: "{topic}". 배경: {context}. 키워드: {keywords}.
웹 검색 최대 3회로 최신 정보·통계·사례 수집.
\`\`\`json
{"sources": [{"title": "...", "summary": "...", "url": "..."}], "key_facts": ["팩트1", "팩트2", "팩트3", "팩트4", "팩트5"]}
\`\`\``,

  ka: `카 과장. 분석가.
주제: "{topic}". 팩트: {facts}.
패턴·인사이트 혼잣말 3~4문장 후 JSON:
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

문제점 지적 후 JSON:
\`\`\`json
{"passed": true/false, "issues": ["문제1"], "feedback": "수정 지시사항"}
\`\`\``,

  ping: `핑 인턴. 아이디어 수집가.
주제: "{topic}". 결론: {conclusion}.
파생 아이디어 2~3문장 후 JSON:
\`\`\`json
{"ideas": [{"title": "아이디어 제목", "spark": "한 줄 설명"}]}
\`\`\``,
};

// 에이전트별 사용 가능한 변수 힌트
export const PROMPT_VARS_HINT: Record<string, string[]> = {
  wiki:  ["{topic}"],
  pocke: ["{topic}", "{context}", "{keywords}"],
  ka:    ["{topic}", "{facts}"],
  over:  ["{topic}", "{insights}", "{conclusion}", "{facts}", "{feedback}"],
  fact:  ["{report}"],
  ping:  ["{topic}", "{conclusion}"],
};

export function fillPrompt(template: string, vars: Partial<PromptVars>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = vars[key as keyof PromptVars];
    return val !== undefined ? val : match;
  });
}
