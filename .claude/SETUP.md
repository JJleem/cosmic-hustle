# 새 기기에서 Claude Code 세션 이어받기

## 자동 (권장)
Claude Code는 프로젝트 루트의 `CLAUDE.md`를 자동으로 읽습니다.
그냥 `claude` 실행하면 컨텍스트 바로 이어받습니다.

## 메모리 파일 이전 (선택)
이전 기기의 메모리를 그대로 쓰려면:

```bash
# Mac 기준
DEST=~/.claude/projects/$(pwd | sed 's|/|-|g')/memory
mkdir -p "$DEST"
cp .claude/memory/* "$DEST/"
```

## 개발 서버 시작

```bash
cd web
npm install      # 첫 실행 시
npm run dev      # localhost:3000
```
