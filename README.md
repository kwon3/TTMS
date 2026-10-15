# 장애 접수·조치 관리 시스템 (TTMS)

고객이 장애를 접수하면 담당자에게 실시간 알림이 가고, 담당자가 원인분석·조치내역을 등록하면 고객에게 알림이 갑니다.
고객과 담당자가 **둘 다 '처리완료'** 를 누르면 접수 내용·조치 내역·대화 내용을 정리해 장애 이력으로 저장하고
PDF 보고서를 자동 생성합니다(다운로드 버튼으로 받을 수 있습니다).

## 구성

| 역할 | 사용 서비스 |
|---|---|
| 웹사이트 실행·배포 | **Vercel** (GitHub에 push하면 자동 배포, 서버 지역: 서울 `icn1`) |
| 데이터베이스 | **Supabase Database** (PostgreSQL) |
| 로그인 | **Supabase Auth** (이메일 + 비밀번호) |
| 첨부파일 | **Supabase Storage** (`attachments` 비공개 버킷) |
| 실시간 알림 | **Supabase Realtime** (`notifications` 테이블 구독) |
| 소스 관리 | **GitHub** `kwon3/TTMS` |

## 처음 설정 (한 번만)

### 1. Supabase

1. Supabase 대시보드 → **SQL Editor → New query** 에 [`supabase/schema.sql`](supabase/schema.sql) 전체를 붙여 넣고 **Run**
   (테이블, 보안 규칙, 첨부파일 버킷, 실시간 알림 설정이 한 번에 만들어집니다. 다시 실행해도 안전합니다.)
2. **Authentication → Sign In / Providers → Email** 에서 **Allow new users to sign up 을 끔**
   (계정은 관리자만 발급하므로 외부 가입을 막습니다.)
3. **Project Settings → API Keys** 에서 Project URL, `anon` 키, `service_role` 키 확인
   (`service_role`은 Legacy API Keys 탭에 있을 수 있습니다.)

### 2. 내 PC에서 실행

`.env.local` 파일 (git에 올라가지 않음):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=anon 키
SUPABASE_SERVICE_ROLE_KEY=service_role 키
```

```bash
npm install
npm run dev
```

PowerShell에서 `npm` 실행이 막히면 `npm.cmd run dev` 로 실행하세요.

### 3. Vercel 배포

1. Vercel → **Add New → Project** → GitHub `kwon3/TTMS` Import
2. **Settings → Environment Variables** 에 위 3개 값을 똑같이 추가 (Production·Preview·Development 모두 체크)
3. **Deployments → Redeploy** (환경변수는 다시 배포해야 적용됩니다)
4. 이후로는 GitHub에 push할 때마다 자동으로 배포됩니다.

### 4. 최초 관리자 만들기

배포된 주소(또는 http://localhost:3000)에 처음 접속하면 **최초 설정** 화면이 나옵니다.
관리자 이메일·비밀번호를 입력하면 관리자 계정이 만들어지고, 이 화면은 다시 나타나지 않습니다.
(관리자가 없으면 누구나 이 화면에 들어올 수 있으므로 배포 직후 바로 만들어 주세요.)

## 사용 흐름

1. **관리자**: `고객사·담당자`에서 고객사를 등록하고 담당자를 지정 → `계정 관리`에서 고객·담당자 계정 발급(이메일)
2. **고객**: `장애 접수` (긴급도, 장애 유형, 대상 시스템, 발생일시, 내용, 첨부파일) → 담당자에게 실시간 알림
3. **담당자**: `접수 확인` → 원인 분석 → `원인·조치내역 등록` → 고객에게 실시간 알림
4. 고객과 담당자는 장애 건별 **댓글**로 문의·답변 (상대방에게 알림)
5. **고객과 담당자 모두 `처리완료`** → 종결, 장애 이력 저장, 보고서 자동 생성
6. `장애 이력·보고서` 또는 상세 화면에서 **PDF 다운로드**

> 조치내역을 수정하면 이미 누른 처리완료 확인은 초기화되어 다시 확인을 받습니다.

## 보고서 구성 (PDF)

장애 개요 · 처리 요약(자동 작성 문장) · 장애 내용 · 원인 분석 · 조치 내역 · 처리 경과(타임라인) ·
고객·담당자 대화 내용 · 첨부파일 목록 · 처리완료 확인(고객/담당자 확인 일시)

- 보고서는 처리완료 시점의 기록으로 확정 저장(`reports` 테이블)되어, 이후 정보가 바뀌어도 내용이 변하지 않습니다.
- 모든 시각은 한국 시간(KST)으로 표시됩니다.
- 한글 글꼴은 프로젝트에 포함된 나눔고딕(`fonts/`, SIL OFL 라이선스)을 사용합니다.

## 구조

```
supabase/schema.sql        Supabase에 실행할 테이블·보안·버킷 설정
fonts/                     보고서 PDF용 나눔고딕
src/
  proxy.ts                 요청마다 로그인 세션 갱신
  app/
    login/  setup/         로그인, 최초 관리자 설정
    (main)/                로그인 후 화면 (공통 헤더·알림 종)
      page.tsx             대시보드
      incidents/new        장애 접수 (고객)
      incidents/[id]       장애 상세: 조치 등록, 댓글, 처리완료, 경과, 보고서
      history              장애 이력·보고서 다운로드
      admin/companies      고객사·담당자 지정 (관리자)
      admin/users          계정 관리 (관리자)
      profile              내 정보·비밀번호 변경
    api/
      notifications        알림 목록·읽음 처리
      files/[id]           첨부파일 다운로드 (권한 확인 후 임시 주소로 이동)
      incidents/[id]/report  PDF 보고서
  lib/
    supabase/              서버·브라우저용 Supabase 연결
    auth.ts                현재 사용자·권한 확인
    incidents.ts           조회·권한 범위
    notify.ts              알림 저장 (Realtime으로 즉시 전달)
    uploads.ts             첨부파일 검증·등록
    report.ts              보고서 정리(템플릿) + PDF 생성
    actions/               서버 액션 (접수·조치·댓글·처리완료·관리)
```

## 권한·보안

- **고객**: 소속 고객사의 장애만 조회, 접수·댓글·처리완료
- **담당자**: 본인에게 배정된 장애만 조회, 접수 확인·조치 등록·댓글·처리완료
- **관리자**: 전체 조회, 고객사/계정 관리, 장애별 담당자 재배정
- 데이터 읽기·쓰기는 모두 서버에서 권한을 확인한 뒤 수행합니다. 브라우저(anon 키)는 RLS에 의해 **자기 알림만** 읽을 수 있습니다.
- `service_role` 키는 서버에서만 사용합니다. GitHub·채팅 등에 절대 올리지 마세요.
