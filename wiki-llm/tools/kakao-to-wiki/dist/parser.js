"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCSV = parseCSV;
const fs_1 = __importDefault(require("fs"));
// 카카오톡 시스템 메시지 패턴
const NOISE_PATTERNS = [
    /^\[사진\]$/,
    /^\[동영상\]$/,
    /^\[이모티콘\]$/,
    /^\[파일\].*$/,
    /^\[연락처\].*$/,
    /^\[지도\].*$/,
    /^\[음성메시지\]$/,
    /^사진$/,
    /^동영상$/,
    /^이모티콘$/,
    // 입퇴장/초대 알림
    /님이 들어왔습니다\.?$/,
    /님이 나갔습니다\.?$/,
    /님이 내보내졌습니다\.?$/,
    /님을 초대했습니다\.?$/,
    /님이 초대되었습니다\.?$/,
    /^채팅방 관리자가/,
];
// ㅋㅋ, ㅎㅎ, ㅠㅠ 등 반응어 전용
const REACTION_ONLY = /^[ㄱ-ㅎㅏ-ㅣ\s!?~.,ㅋㅎㅠㅜㅇㄷ]+$/;
function isNoise(message) {
    const trimmed = message.trim();
    if (trimmed.length <= 2)
        return true;
    if (REACTION_ONLY.test(trimmed))
        return true;
    return NOISE_PATTERNS.some((p) => p.test(trimmed));
}
function detectDelimiter(firstLine) {
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const commaCount = (firstLine.match(/,/g) || []).length;
    return tabCount > commaCount ? '\t' : ',';
}
function parseCSVLine(line, delimiter) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            }
            else {
                inQuotes = !inQuotes;
            }
        }
        else if (char === delimiter && !inQuotes) {
            fields.push(current.trim());
            current = '';
        }
        else {
            current += char;
        }
    }
    fields.push(current.trim());
    return fields;
}
const COLUMN_ALIASES = {
    date: ['date', '날짜', 'datetime', '일시', '시간'],
    user: ['user', '사용자', '보낸사람', '이름', 'name', 'sender'],
    message: ['message', '메시지', '내용', 'content', 'text'],
};
function detectColumns(headers) {
    const normalized = headers.map((h) => h.toLowerCase().trim());
    const find = (key) => {
        const aliases = COLUMN_ALIASES[key];
        const idx = normalized.findIndex((h) => aliases.some((a) => h.includes(a)));
        if (idx === -1)
            throw new Error(`컬럼 인식 실패: '${key}' (헤더: ${headers.join(', ')})`);
        return idx;
    };
    return { date: find('date'), user: find('user'), message: find('message') };
}
function parseCSV(filePath) {
    const raw = fs_1.default.readFileSync(filePath, 'utf-8');
    const content = raw.startsWith('﻿') ? raw.slice(1) : raw; // BOM 제거
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2)
        throw new Error('CSV 파일이 너무 짧습니다 (헤더 + 데이터 1행 이상 필요).');
    const delimiter = detectDelimiter(lines[0]);
    const headers = parseCSVLine(lines[0], delimiter);
    const cols = detectColumns(headers);
    const messages = [];
    for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i], delimiter);
        if (fields.length <= Math.max(cols.date, cols.user, cols.message))
            continue;
        const message = fields[cols.message] ?? '';
        if (isNoise(message))
            continue;
        messages.push({
            date: fields[cols.date] ?? '',
            user: fields[cols.user] ?? '',
            message,
        });
    }
    return messages;
}
