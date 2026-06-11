"""GSC OAuth 사용자 토큰 1회 발급 — 로컬에서 실행.

GSC 사이트 소유자 본인 계정(leemjaejun@gmail.com)으로 로그인해
webmasters.readonly 토큰을 만든다. 서비스 계정을 GSC에 추가할 수 없을 때 사용
(새 Search Console UI가 SA 이메일을 "찾을 수 없음"으로 거부하는 케이스).

사전작업 (Google Cloud Console, 1회):
  1. APIs & Services → 사용자 인증 정보(Credentials) → 사용자 인증 정보 만들기
     → OAuth 클라이언트 ID → 애플리케이션 유형 "데스크톱 앱" → 만들기
  2. 생성된 클라이언트의 JSON 다운로드 → client_secret.json 로 저장
  3. OAuth 동의 화면(OAuth consent screen): 게시 상태를 "프로덕션"으로 게시할 것.
     (테스트 모드면 refresh token이 7일 만에 만료돼 매주 끊김. 소유자 본인용이므로
      미인증 경고는 무시하고 진행 가능.)

사용법:
    cd backend
    .venv/bin/python scripts/generate_gsc_token.py /path/to/client_secret.json [out.json]

브라우저가 열리면 GSC 소유자 계정으로 로그인 → 동의. 끝나면 out.json(기본 gsc_token.json) 생성.
이 파일을 서버 /home/ubuntu/backend/ 에 올리고 .env에
    GSC_TOKEN_JSON=/home/ubuntu/backend/gsc_token.json
설정 후 백엔드 재시작하면 끝.
"""
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]


def main() -> None:
    if len(sys.argv) < 2:
        print("사용법: python scripts/generate_gsc_token.py <client_secret.json> [out.json]")
        sys.exit(1)
    client_secret = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "gsc_token.json"

    flow = InstalledAppFlow.from_client_secrets_file(client_secret, SCOPES)
    creds = flow.run_local_server(port=0)

    with open(out, "w") as f:
        f.write(creds.to_json())
    print(f"\n토큰 저장 완료: {out}")
    print("→ 이 파일을 서버에 올리고 .env에 GSC_TOKEN_JSON=<경로> 설정 후 백엔드 재시작하세요.")


if __name__ == "__main__":
    main()
