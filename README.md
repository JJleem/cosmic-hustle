# molt-wiki

개인 학습 기록과 지식 누적을 위한 LLM Wiki입니다.
Andrej Karpathy의 [LLM Wiki 패턴](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)을 기반으로 구현했습니다.

---

## 이게 뭔가요?

일반적인 RAG는 질문할 때마다 원본 문서에서 다시 검색해 답을 만듭니다.
LLM Wiki는 다릅니다. **소스를 추가할 때 한 번 컴파일해서 wiki에 누적**합니다.

- 새 소스를 넣으면 → LLM이 요약하고 개념 페이지를 생성/보강
- 질문하면 → 이미 정리된 wiki 페이지에서 답변
- 지식이 매번 재발견되는 게 아니라 **쌓입니다**

---

## 폴더 구조

```
molt-wiki/
├── raw/                        # 원본 소스 보관 (CSV, md, txt 등)
├── wiki/
│   ├── concepts/               # 개념 정리 페이지 (개념 1개 = 파일 1개)
│   ├── sources/                # 소스별 요약 페이지 (원본 1개 = 파일 1개)
│   ├── index.md                # 전체 페이지 목록 (진입점)
│   └── log.md                  # 작업 이력
├── tools/
│   └── kakao-to-wiki/          # 자동 ingest 스크립트 (TypeScript)
└── CLAUDE.md                   # Claude 행동 지침 (워크플로우 정의)
```

---

## 사용법

### 방법 1: Node 스크립트 (자동)

소스를 넣으면 요약 → 개념 추출 → wiki 파일 생성까지 자동으로 처리합니다.

#### 설치

```bash
cd tools/kakao-to-wiki
npm install
npm run build
```

#### `.env` 설정

```bash
# tools/kakao-to-wiki/.env
ANTHROPIC_API_KEY=sk-ant-...
WIKI_DIR=/절대경로/molt-wiki   # 생략 시 명령어 실행 위치 기준
```

#### 카카오톡 채팅방 내보내기 (CSV)

```bash
# molt-wiki/ 루트에서 실행
node tools/kakao-to-wiki/dist/index.js kakao raw/채팅파일.csv
```

내부 처리 흐름:
1. CSV 파싱 → 200개 메시지 단위로 청크 분할
2. 청크별 요약 → 최종 통합 요약 생성
3. 핵심 개념 최대 5개 추출
4. `wiki/sources/` 요약 파일 생성
5. `wiki/concepts/` 개념 페이지 생성 (내용 포함)
6. `wiki/index.md`, `wiki/log.md` 업데이트

#### 일반 문서 (md, txt 등)

```bash
node tools/kakao-to-wiki/dist/index.js ingest raw/문서.md
```

---

### 방법 2: Claude Code (대화형)

`raw/`에 파일을 넣고 Claude에게 직접 요청합니다.

```
raw/article.md 넣었어, ingest 해줘
```

Claude가 `CLAUDE.md`의 워크플로우를 따라 소스를 읽고 wiki를 직접 작성합니다.
스크립트 없이도 동작하며, 복잡한 소스나 수동 보강이 필요한 경우에 유용합니다.

---

### Wiki 조회 및 질문

Claude Code에서 바로 질문하면 됩니다.

```
프롬프트 캐싱이 뭐야?
Claude랑 Gemini 중 뭐가 더 나아?
```

Claude가 `wiki/index.md` → 관련 concepts/sources 페이지 순서로 읽고 답변합니다.
재사용 가치가 있으면 개념 페이지에 자동으로 보강합니다.

---

### Lint (품질 점검)

```
lint 해줘
```

- 모순된 설명이 있는 페이지 탐지
- `source_count: 0`이거나 링크가 끊긴 페이지 탐지
- `wiki/index.md`에 등록되지 않은 orphan 페이지 탐지

---

## 모델

스크립트는 `claude-haiku-4-5-20251001`을 사용합니다 (속도/비용 균형).
대화형 방식은 Claude Code에서 실행 중인 모델을 그대로 사용합니다.

---

## 크레딧

LLM Wiki 패턴 아이디어:
[Andrej Karpathy — LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)
