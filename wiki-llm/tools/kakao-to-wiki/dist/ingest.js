"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ingest = ingest;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const client = new sdk_1.default();
const MODEL = 'claude-haiku-4-5-20251001';
// molt-wiki/ 루트에서 실행한다고 가정. WIKI_DIR 환경변수로 오버라이드 가능.
const WIKI_ROOT = process.env.WIKI_DIR ?? process.cwd();
function wikiPath(...parts) {
    return path_1.default.join(WIKI_ROOT, 'wiki', ...parts);
}
function today() {
    return new Date().toISOString().slice(0, 10);
}
function dateStamp() {
    return today().replace(/-/g, '');
}
async function extractConcepts(summary) {
    const res = await client.messages.create({
        model: MODEL,
        max_tokens: 300,
        messages: [
            {
                role: 'user',
                content: `다음 요약에서 wiki 개념 페이지로 만들 만한 핵심 개념을 최대 5개 추출하세요.
한 줄에 하나씩, 파일명으로 쓸 수 있게 공백 없이 언더스코어로 연결하세요 (한영 혼용 가능).
예: LLM_파인튜닝, 프롬프트_엔지니어링, RAG

요약:
${summary}

개념 목록만 출력하세요 (설명 없이):`,
            },
        ],
    });
    return res.content[0].text
        .split('\n')
        .map((l) => l.replace(/^[-*\d.\s]+/, '').trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
}
function createSourceFile(csvName, result) {
    const slug = path_1.default.basename(csvName, path_1.default.extname(csvName));
    const fileName = `${dateStamp()}_${slug}.md`;
    const outPath = wikiPath('sources', fileName);
    const content = `---
tags: [${result.tags.join(', ')}]
date: ${today()}
source_count: ${result.messageCount}
source_file: ${csvName}
---

${result.summary}`;
    fs_1.default.writeFileSync(outPath, content, 'utf-8');
    console.log(`  생성: wiki/sources/${fileName}`);
    return `sources/${fileName}`;
}
async function generateConceptContent(conceptName, summary) {
    const displayName = conceptName.replace(/_/g, ' ');
    const res = await client.messages.create({
        model: MODEL,
        max_tokens: 800,
        messages: [
            {
                role: 'user',
                content: `다음 요약에서 "${displayName}" 개념에 관련된 핵심 내용을 추출해 위키 페이지 본문을 작성하세요.

규칙:
- 마크다운 형식, 한국어 작성
- ## 섹션으로 구조화
- 소스에서 확인된 내용만 작성 (추측 금지)
- 태그 목록도 콤마 구분으로 마지막 줄에 출력: TAGS: tag1, tag2

요약:
${summary}

본문만 출력하세요 (frontmatter, 제목 H1 제외):`,
            },
        ],
    });
    const raw = res.content[0].text;
    const tagsMatch = raw.match(/^TAGS:\s*(.+)$/m);
    const tags = tagsMatch ? tagsMatch[1].split(',').map((t) => t.trim()) : [];
    const body = raw.replace(/^TAGS:.*$/m, '').trim();
    return { body, tags };
}
async function upsertConceptFile(conceptName, sourceRef, summary) {
    const fileName = `${conceptName}.md`;
    const filePath = wikiPath('concepts', fileName);
    if (fs_1.default.existsSync(filePath)) {
        const existing = fs_1.default.readFileSync(filePath, 'utf-8');
        if (!existing.includes(sourceRef)) {
            const updated = existing.includes('## Sources')
                ? existing.replace(/## Sources/, `## Sources\n- [[${sourceRef}]]`)
                : existing + `\n\n## Sources\n\n- [[${sourceRef}]]\n`;
            fs_1.default.writeFileSync(filePath, updated, 'utf-8');
            console.log(`  업데이트: wiki/concepts/${fileName}`);
        }
    }
    else {
        const displayName = conceptName.replace(/_/g, ' ');
        const { body, tags } = await generateConceptContent(conceptName, summary);
        const content = `---
tags: [${tags.join(', ')}]
date: ${today()}
source_count: 1
---

# ${displayName}

${body}

## Sources

- [[${sourceRef}]]
`;
        fs_1.default.writeFileSync(filePath, content, 'utf-8');
        console.log(`  생성: wiki/concepts/${fileName}`);
    }
}
function updateIndex(slug, sourceRef, tags) {
    const indexPath = wikiPath('index.md');
    const existing = fs_1.default.readFileSync(indexPath, 'utf-8');
    const tagStr = tags.slice(0, 3).join(', ');
    const entry = `- [${today()} — ${slug}](${sourceRef}) \`${tagStr}\``;
    const section = '## Chat Logs';
    let updated;
    if (existing.includes(section)) {
        updated = existing.replace(section, `${section}\n\n${entry}`);
    }
    else {
        updated = existing.trimEnd() + `\n\n${section}\n\n${entry}\n`;
    }
    fs_1.default.writeFileSync(indexPath, updated, 'utf-8');
    console.log('  업데이트: wiki/index.md');
}
function updateLog(csvName, messageCount) {
    const logPath = wikiPath('log.md');
    const existing = fs_1.default.readFileSync(logPath, 'utf-8');
    const entry = `## [${today()}] ingest | ${csvName} (${messageCount}개 메시지)\n`;
    // --- 구분자 바로 다음에 삽입
    const updated = existing.includes('\n---\n')
        ? existing.replace('\n---\n', `\n---\n\n${entry}`)
        : existing + `\n${entry}`;
    fs_1.default.writeFileSync(logPath, updated, 'utf-8');
    console.log('  업데이트: wiki/log.md');
}
async function ingest(csvPath, result) {
    const csvName = path_1.default.basename(csvPath);
    const slug = path_1.default.basename(csvPath, path_1.default.extname(csvPath));
    console.log('\n[Ingest]');
    const sourceRef = createSourceFile(csvName, result);
    console.log('  개념 추출 중...');
    const concepts = await extractConcepts(result.summary);
    for (const concept of concepts) {
        await upsertConceptFile(concept, sourceRef, result.summary);
    }
    updateIndex(slug, sourceRef, result.tags);
    updateLog(csvName, result.messageCount);
}
