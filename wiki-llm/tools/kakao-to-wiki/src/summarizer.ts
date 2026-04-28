import fs from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { Message } from './parser';

const client = new Anthropic();
const MODEL = 'claude-haiku-4-5-20251001';
const CHUNK_SIZE = 200;

export interface SummaryResult {
  summary: string;
  tags: string[];
  messageCount: number;
}

function formatChunk(messages: Message[]): string {
  return messages.map((m) => `[${m.user}] ${m.message}`).join('\n');
}

async function summarizeChunk(chunk: Message[], index: number, total: number): Promise<string> {
  process.stdout.write(`  청크 요약 중... (${index + 1}/${total})\r`);

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [
      {
        role: 'user',
        content: `다음은 AI/개발 정보 공유 카카오톡 채팅방의 대화 일부입니다.
AI, 머신러닝, 개발 도구, 프레임워크, 논문, 서비스, 트렌드에 관한 정보만 한국어로 3~5줄 요약해주세요.
일상 대화, 인사, 감탄사, 관련 없는 잡담은 완전히 무시하세요. 관련 내용이 없으면 "없음"이라고만 답하세요.\n\n${formatChunk(chunk)}`,
      },
    ],
  });

  return (res.content[0] as { text: string }).text;
}

export async function summarize(messages: Message[]): Promise<SummaryResult> {
  const chunks: Message[][] = [];
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    chunks.push(messages.slice(i, i + CHUNK_SIZE));
  }

  console.log(`\n[요약] ${messages.length}개 메시지 → ${chunks.length}개 청크`);

  const chunkSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    chunkSummaries.push(await summarizeChunk(chunks[i], i, chunks.length));
  }
  console.log('');

  console.log('  최종 요약 생성 중...');
  const combined = chunkSummaries.join('\n\n---\n\n');

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: `다음은 AI/개발 정보 공유 카카오톡 채팅방의 청크별 요약입니다.
AI, 개발 관련 내용만 추려서 최종 마크다운 요약을 생성해주세요. "없음"으로 표시된 청크는 무시하세요.

아래 섹션을 반드시 포함하세요:

## 주요 주제
(다룬 AI/개발 주제 bullet)

## 핵심 인사이트
(언급된 도구·모델·논문·서비스·팁 등 실질적 정보 bullet)

## 리소스
(언급된 링크·논문·GitHub·영상 등. 없으면 "없음")

## Tags
(wiki frontmatter에 쓸 태그. 소문자 영어, 콤마 구분. 예: llm, rag, fine-tuning, open-source)

---

${combined}`,
      },
    ],
  });

  const finalSummary = (res.content[0] as { text: string }).text;

  const tagsMatch = finalSummary.match(/## Tags\s*\n([^\n#]+)/);
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map((t) => t.trim()).filter(Boolean)
    : ['chat'];

  return { summary: finalSummary, tags, messageCount: messages.length };
}

const CHAR_CHUNK = 6000; // ~1500 토큰

async function summarizeTextChunk(text: string, index: number, total: number): Promise<string> {
  process.stdout.write(`  청크 요약 중... (${index + 1}/${total})\r`);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `다음 텍스트의 핵심 내용을 한국어로 3~7줄로 요약해주세요. 중요한 정보, 논지, 개념만 추출하세요.\n\n${text}`,
      },
    ],
  });
  return (res.content[0] as { text: string }).text;
}

export async function summarizeFile(filePath: string): Promise<SummaryResult> {
  const content = fs.readFileSync(filePath, 'utf-8');

  if (content.length <= CHAR_CHUNK) {
    console.log('\n[요약] 단일 청크');
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildFinalPrompt(content) }],
    });
    return parseFinalSummary(res, 1);
  }

  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += CHAR_CHUNK) {
    chunks.push(content.slice(i, i + CHAR_CHUNK));
  }

  console.log(`\n[요약] ${chunks.length}개 청크로 분할`);
  const chunkSummaries: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    chunkSummaries.push(await summarizeTextChunk(chunks[i], i, chunks.length));
  }
  console.log('');

  console.log('  최종 요약 생성 중...');
  const combined = chunkSummaries.join('\n\n---\n\n');
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    messages: [{ role: 'user', content: buildFinalPrompt(combined) }],
  });
  return parseFinalSummary(res, chunks.length);
}

function buildFinalPrompt(content: string): string {
  return `다음 내용을 바탕으로 최종 마크다운 요약을 생성해주세요.

아래 섹션을 반드시 포함하세요:

## 주요 주제
(다룬 주요 주제 bullet)

## 핵심 인사이트
(중요한 정보, 개념, 인사이트 bullet)

## 리소스
(언급된 링크·도구·책·영상 등. 없으면 "없음")

## Tags
(wiki frontmatter에 쓸 태그. 소문자 영어, 콤마 구분. 예: llm, productivity, career)

---

${content}`;
}

function parseFinalSummary(res: Anthropic.Message, chunkCount: number): SummaryResult {
  const finalSummary = (res.content[0] as { text: string }).text;
  const tagsMatch = finalSummary.match(/## Tags\s*\n([^\n#]+)/);
  const tags = tagsMatch
    ? tagsMatch[1].split(',').map((t) => t.trim()).filter(Boolean)
    : ['document'];
  return { summary: finalSummary, tags, messageCount: chunkCount };
}
