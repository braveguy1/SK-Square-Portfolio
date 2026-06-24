# 반도체 모니터링 대시보드

SK Square 포트폴리오의 반도체 종목(삼성전자, SK하이닉스 등)을 실시간으로 모니터링하는 대시보드입니다.

## 🚀 빠른 시작

### 1. 사전 준비

**필수 요구사항:**
- Node.js 16.x 이상
- npm 또는 yarn

**한국투자증권 API 설정:**
1. [KIS Developers](https://apiportal.koreainvestment.com) 접속
2. 회원가입 및 로그인
3. "개발자센터" > "앱 등록" 
4. 발급받은 **App Key**와 **App Secret** 복사

### 2. 프로젝트 설정

```bash
# 의존성 설치
npm install

# .env 파일 생성
cp .env.example .env

# .env 파일 수정 (API 키 입력)
# KIS_APP_KEY=발급받은_앱_키
# KIS_APP_SECRET=발급받은_앱_시크릿
```

### 3. 실행

```bash
# 개발 모드 (자동 재시작)
npm run dev

# 또는 일반 실행
npm start
```

브라우저에서 **http://localhost:3000** 열기

---

## 📊 기능

### 대시보드 기능
- ✅ **실시간 주가 모니터링** - 5개 반도체 종목의 현재가 추적
- ✅ **변동률 비교** - 종목별 상승/하락률 시각화
- ✅ **시가총액 순위** - 거래대금 기준 순위 표시
- ✅ **상세 정보 테이블** - 현재가, 변동액, 거래량 등 종목별 정보
- ✅ **요약 통계** - 평균 변동률, 상승 종목 수 등
- ✅ **자동 새로고침** - 5초 단위 자동 갱신 (선택 가능)
- ✅ **CSV 내보내기** - 데이터 내보내기 기능

### 모니터링 종목
```
- 삼성전자 (005930)
- SK하이닉스 (000660)
- 한미반도체 (009540)
- 이퓨전 (078020)
- 에이프로 (058970)
```

---

## 🔧 API 엔드포인트

### `GET /api/semiconductors`
모든 반도체 종목의 현재 시세 조회

**응답 예시:**
```json
{
  "success": true,
  "data": [
    {
      "code": "005930",
      "name": "삼성전자",
      "market": "KOSPI",
      "price": 65000,
      "change": 500,
      "changePercent": 0.77,
      "volume": 15000000,
      "amount": 975000000000,
      "timestamp": "2024-06-23T10:30:00.000Z"
    }
  ],
  "timestamp": "2024-06-23T10:30:00.000Z"
}
```

### `GET /api/semiconductors/:code`
특정 종목의 시세 조회

**예:** `/api/semiconductors/005930`

### `GET /api/stocks-list`
지원하는 종목 목록 조회

### `GET /api/health`
서버 상태 확인

---

## 📁 프로젝트 구조

```
semiconductor-dashboard/
├── server.js              # Express 백엔드 서버
├── package.json           # 의존성 정의
├── .env.example           # 환경변수 예시
├── .env                   # 환경변수 (로컬, .gitignore)
└── public/
    └── index.html         # 프론트엔드 대시보드
```

---

## ⚙️ 커스터마이징

### 종목 추가/변경

`server.js` 파일의 `SEMICONDUCTOR_STOCKS` 배열 수정:

```javascript
const SEMICONDUCTOR_STOCKS = [
  { code: '005930', name: '삼성전자', market: 'KOSPI' },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  // 새로운 종목 추가
  { code: '036930', name: '주성엔지니어링', market: 'KOSPI' },
];
```

### 포트 변경

`.env` 파일에서:
```
PORT=8080
```

### 자동 갱신 주기 변경

`public/index.html` 파일에서:
```javascript
// 기본 5초
autoRefreshInterval = setInterval(fetchStockData, 10000); // 10초로 변경
```

---

## 🔐 보안 주의사항

⚠️ **중요:** 다음을 주의하세요:

1. **API 키 노출 금지**
   - `.env` 파일을 `.gitignore`에 추가
   - API 키를 코드에 직접 입력하지 말 것
   - 프로덕션 배포 시 환경 변수 서버에 설정

2. **HTTPS 사용**
   - 프로덕션에서는 반드시 HTTPS 사용

3. **Rate Limiting**
   - 한국투자증권 API는 요청 제한이 있을 수 있음
   - 과도한 요청 빈도 피할 것

---

## 🐛 문제 해결

### 문제: "Cannot find module 'express'"
```bash
npm install
```

### 문제: API 토큰 발급 실패
- KIS_APP_KEY, KIS_APP_SECRET 확인
- 한국투자증권 개발자센터에서 앱 등록 확인

### 문제: CORS 에러
- 백엔드가 정상 작동하는지 확인
- `http://localhost:3000` 접속 확인

### 문제: 데이터가 나타나지 않음
1. 브라우저 개발자 도구 > Network 탭 확인
2. `/api/semiconductors` 응답 확인
3. 서버 콘솔에서 에러 메시지 확인

---

## 📈 프로덕션 배포

### Heroku 배포 예시

```bash
# Heroku 설정
heroku create your-app-name
heroku config:set KIS_APP_KEY=your_key
heroku config:set KIS_APP_SECRET=your_secret

# 배포
git push heroku main
```

### AWS/Google Cloud 배포
- Node.js 런타임 지원하는 서버 선택
- 환경 변수 설정
- 포트 설정 (기본 3000)

---

## 📝 라이선스 및 출처

- 한국투자증권 Open API: https://apiportal.koreainvestment.com
- 한국거래소 데이터: https://data.krx.co.kr

---

## 💡 추가 개선 사항

향후 추가 가능한 기능:

- [ ] 데이터베이스 연동 (MongoDB/PostgreSQL)
- [ ] 실시간 알림 기능 (Telegram, Slack)
- [ ] 차트 종목별 상세 분석
- [ ] 포트폴리오 성과 추적
- [ ] 머신러닝 기반 추세 분석
- [ ] 모바일 앱 (React Native)

---

## 📞 문의

질문이나 버그 리포트: [이슈 등록]

---

**마지막 업데이트:** 2024-06-23
