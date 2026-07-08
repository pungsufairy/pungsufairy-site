# 풍수요정 명리서재 — 통합 배포 가이드

pungsufairy.com 하나의 도메인 밑에서 허브 페이지와 달빛사주를 같이 서비스하도록 합친 구조입니다.

## 폴더 구조 (그대로 GitHub에 올리세요)
```
index.html              ← pungsufairy.com/         (허브 페이지, 링크인바이오)
pungsu-fairy.png        ← 캐릭터 이미지
saju/
  index.html            ← pungsufairy.com/saju     (달빛사주 주문 페이지)
api/
  send-confirmation.js  ← pungsufairy.com/api/send-confirmation (서버 함수, 항상 루트에 있어야 함)
package.json
vercel.json             ← 깔끔한 주소(.html 생략)를 위한 설정
```

나중에 관상·손금·풍수를 추가할 때도 같은 패턴으로 폴더만 늘리면 됩니다:
```
gwansang/index.html  → pungsufairy.com/gwansang
sonkeum/index.html   → pungsufairy.com/sonkeum
```

## 배포 단계
1. **Resend 가입 + API 키 발급** (resend.com → API Keys → Create API Key)
2. **GitHub에 이 폴더 전체 업로드** (새 저장소 생성, 위 구조 그대로 Add file → Upload files)
3. **Vercel에서 Import**
   - vercel.com → GitHub 로그인 → Add New → Project → 방금 만든 저장소 선택
   - Environment Variables에 추가:
     - `RESEND_API_KEY`: 1번에서 발급받은 키
     - `ADMIN_EMAIL`: 주문 알림 받을 이메일 (예: pungsufairy@gmail.com)
   - Deploy
4. **도메인 연결**: Vercel 프로젝트 → Settings → Domains → `pungsufairy.com` 입력 →
   안내되는 DNS 레코드를 도메인 등록업체(가비아 등) 설정에 그대로 입력
5. **SNS 프로필에 링크 걸기** (각 플랫폼마다 `?src=` 값만 다르게):
   - 유튜브: `https://pungsufairy.com/?src=youtube`
   - 인스타그램: `https://pungsufairy.com/?src=instagram`
   - 틱톡: `https://pungsufairy.com/?src=tiktok`
   - 카카오톡 채널 링크는 허브 페이지(`index.html`) 안에서 직접 교체하세요

## 확인 사항
- `index.html`(허브)의 "내 사주 정밀 풀이 받기"를 누르면 `/saju/?src=유입채널`로 이동하고,
  그 출처가 최종 관리자 알림 메일까지 그대로 전달됩니다.
- 로컬에서 그냥 파일을 더블클릭해서 열면 `/api/...` 경로가 동작하지 않아 메일 발송이 실패합니다(정상).
  반드시 Vercel에 배포한 주소에서 테스트하세요.
- `RESEND_API_KEY`는 절대 코드에 직접 적지 말고 Vercel 환경변수에만 저장하세요.

## PDF 리포트 파이프라인
`saju-report-pipeline` 폴더(별도)에 있습니다. 이 사이트와는 별개로 로컬에서 실행하는
백오피스 도구예요 — 관리자 알림 메일에 온 정보로 `node send-report.mjs ...`를 실행하면
PDF가 만들어지고 고객에게 자동 발송됩니다. 자세한 건 그 폴더의 README-report.md 참고하세요.
