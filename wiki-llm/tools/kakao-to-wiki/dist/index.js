"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// 스크립트 위치 기준으로 .env 로드
dotenv_1.default.config({ path: path_1.default.join(__dirname, '../.env') });
const parser_1 = require("./parser");
const summarizer_1 = require("./summarizer");
const ingest_1 = require("./ingest");
const USAGE = `
사용법:
  node dist/index.js kakao  <csv파일>   카카오톡 CSV → wiki ingest
  node dist/index.js ingest <파일>      일반 파일(md/txt 등) → wiki ingest

예시:
  node dist/index.js kakao  ./raw/chat.csv
  node dist/index.js ingest ./raw/article.md

환경변수 (.env):
  ANTHROPIC_API_KEY  (필수)
  WIKI_DIR           molt-wiki 루트 경로 (기본값: 현재 디렉토리)
`.trim();
async function cmdKakao(csvPath) {
    const resolved = path_1.default.resolve(csvPath);
    console.log(`\n[파싱] ${resolved}`);
    const messages = (0, parser_1.parseCSV)(resolved);
    if (messages.length === 0) {
        console.error('유효한 메시지가 없습니다 (노이즈 필터 후 0개).');
        process.exit(1);
    }
    console.log(`  ${messages.length}개 메시지 파싱 완료`);
    const result = await (0, summarizer_1.summarize)(messages);
    await (0, ingest_1.ingest)(resolved, result);
}
async function cmdIngest(filePath) {
    const resolved = path_1.default.resolve(filePath);
    console.log(`\n[읽기] ${resolved}`);
    const result = await (0, summarizer_1.summarizeFile)(resolved);
    await (0, ingest_1.ingest)(resolved, result);
}
async function main() {
    const [, , cmd, target] = process.argv;
    if (!cmd || !target) {
        console.log(USAGE);
        process.exit(1);
    }
    switch (cmd) {
        case 'kakao':
            await cmdKakao(target);
            break;
        case 'ingest':
            await cmdIngest(target);
            break;
        default:
            console.error(`알 수 없는 커맨드: ${cmd}\n`);
            console.log(USAGE);
            process.exit(1);
    }
    console.log('\n완료.\n');
}
main().catch((err) => {
    console.error('\n오류:', err.message);
    process.exit(1);
});
