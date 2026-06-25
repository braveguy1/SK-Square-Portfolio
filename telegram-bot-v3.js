const { Telegraf } = require('telegraf');
const axios = require('axios');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// 텔레그램 봇 토큰
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TELEGRAM_BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN이 설정되지 않았습니다. .env 파일을 확인하세요.');
  process.exit(1);
}

const bot = new Telegraf(TELEGRAM_BOT_TOKEN);

// ============================================
// 포트폴리오 관리 함수
// ============================================

/**
 * 포트폴리오 조회 (로컬 API 호출)
 */
async function getPortfolio() {
  try {
    const response = await axios.get('http://localhost:3000/api/portfolio');
    if (response.data.success) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.error('❌ 포트폴리오 조회 실패:', error.message);
    return null;
  }
}

/**
 * 현재가 조회 (로컬 API 호출)
 */
async function getStockPrice(stockCode) {
  try {
    const response = await axios.get(`http://localhost:3000/api/semiconductors/${stockCode}`);
    if (response.data.success) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error(`❌ ${stockCode} 가격 조회 실패:`, error.message);
    return null;
  }
}

/**
 * 포트폴리오를 텍스트로 포맷
 */
function formatPortfolioText(portfolioData) {
  if (!portfolioData || !portfolioData.data.length) {
    return '📭 보유 종목이 없습니다.';
  }

  const data = portfolioData.data;
  const summary = portfolioData.summary;

  let text = `📊 포트폴리오 현황\n\n`;

  // 요약 정보
  text += `💰 평가액: ${summary.totalEvaluationAmount.toLocaleString('ko-KR')}원\n`;
  text += `💵 매입금액: ${summary.totalInvestmentAmount.toLocaleString('ko-KR')}원\n`;

  const profitClass = summary.totalProfitLoss > 0 ? '📈' : '📉';
  text += `${profitClass} 손익: ${summary.totalProfitLoss > 0 ? '+' : ''}${summary.totalProfitLoss.toLocaleString('ko-KR')}원\n`;
  text += `% 수익률: ${summary.totalProfitLossPercent > 0 ? '+' : ''}${summary.totalProfitLossPercent}%\n`;
  text += `📦 보유 종목: ${summary.holdingCount}개\n\n`;

  // 종목별 정보
  text += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
  data.forEach((item, idx) => {
    const profitSymbol = item.profitLoss > 0 ? '▲' : '▼';
    text += `\n${idx + 1}. ${item.종목명} (${item.종목코드})\n`;
    text += `   현재가: ${item.currentPrice.toLocaleString('ko-KR')}원\n`;
    text += `   보유수량: ${item.보유수량.toLocaleString('ko-KR')}주\n`;
    text += `   평가액: ${item.evaluationAmount.toLocaleString('ko-KR')}원\n`;
    text += `   손익: ${profitSymbol} ${item.profitLoss.toLocaleString('ko-KR')}원 (${item.profitLossPercent}%)\n`;
  });

  text += `\n━━━━━━━━━━━━━━━━━━━━━━━`;

  return text;
}

// ============================================
// 텔레그램 봇 명령어
// ============================================

/**
 * /start 명령
 */
bot.command('start', (ctx) => {
  const text = `
👋 SK Square 포트폴리오 관리 봇입니다!

사용 가능한 명령어:

/portfolio - 전체 포트폴리오 조회
/price [종목코드] - 특정 종목 현재가 조회
/refresh - 포트폴리오 새로고침
/status - 봇 상태 확인
/help - 도움말

예시:
/price 005930 - 삼성전자 현재가 조회

웹 대시보드: http://localhost:3000/portfolio.html
`;

  ctx.reply(text);
});

/**
 * /help 명령
 */
bot.command('help', (ctx) => {
  const text = `
📚 도움말

포트폴리오 관련:
/portfolio - 전체 포트폴리오 현황
/refresh - 최신 데이터로 새로고침

종목 조회:
/price [종목코드] - 특정 종목 현재가
예시: /price 005930

시스템:
/status - 봇 및 서버 상태
/help - 이 도움말

팁:
- 마켓 폐장 시간에는 현재가 조회 불가
- 평가액 = 현재가 × 보유수량
- 손익 = 평가액 - 매입금액
`;

  ctx.reply(text);
});

/**
 * /portfolio 명령
 */
bot.command('portfolio', async (ctx) => {
  await ctx.reply('⏳ 포트폴리오 조회 중...');

  try {
    const portfolioData = await getPortfolio();
    if (!portfolioData) {
      ctx.reply('❌ 포트폴리오 조회에 실패했습니다.');
      return;
    }

    const text = formatPortfolioText(portfolioData);
    ctx.reply(text);
  } catch (error) {
    ctx.reply(`❌ 오류: ${error.message}`);
  }
});

/**
 * /refresh 명령
 */
bot.command('refresh', async (ctx) => {
  await ctx.reply('🔄 포트폴리오 새로고침 중...');

  try {
    const portfolioData = await getPortfolio();
    if (!portfolioData) {
      ctx.reply('❌ 포트폴리오 새로고침 실패');
      return;
    }

    const text = formatPortfolioText(portfolioData);
    ctx.reply(`✅ 포트폴리오 새로고침 완료!\n\n${text}`);
  } catch (error) {
    ctx.reply(`❌ 오류: ${error.message}`);
  }
});

/**
 * /price 명령
 */
bot.command('price', async (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    ctx.reply('사용법: /price [종목코드]\n예시: /price 005930');
    return;
  }

  const stockCode = args[1].padStart(6, '0');
  await ctx.reply(`⏳ ${stockCode} 조회 중...`);

  try {
    const stock = await getStockPrice(stockCode);
    if (!stock || stock.error) {
      ctx.reply(`❌ 종목을 찾을 수 없습니다: ${stockCode}`);
      return;
    }

    const priceSymbol = stock.change > 0 ? '▲' : '▼';
    const text = `
📈 ${stock.name} (${stock.code})

현재가: ${stock.price.toLocaleString('ko-KR')}원
변동액: ${priceSymbol} ${Math.abs(stock.change).toLocaleString('ko-KR')}원
변동률: ${priceSymbol} ${Math.abs(stock.changePercent).toFixed(2)}%

거래량: ${(stock.volume / 1000000).toFixed(1)}M주
거래대금: ${(stock.amount / 100000000).toFixed(0)}억원

고가: ${stock.high.toLocaleString('ko-KR')}원
저가: ${stock.low.toLocaleString('ko-KR')}원
`;

    ctx.reply(text);
  } catch (error) {
    ctx.reply(`❌ 오류: ${error.message}`);
  }
});

/**
 * /status 명령
 */
bot.command('status', async (ctx) => {
  try {
    const response = await axios.get('http://localhost:3000/api/health');
    if (response.data.success) {
      const text = `
✅ 봇 상태 정상

🖥️ 서버: 실행 중
📊 포트폴리오: 연동됨
🔐 토큰: 준비됨

마지막 업데이트: ${new Date().toLocaleString('ko-KR')}
`;
      ctx.reply(text);
    }
  } catch (error) {
    ctx.reply('⚠️ 서버 연결 안됨: 백엔드 서버가 실행 중인지 확인하세요.\nhttp://localhost:3000');
  }
});

/**
 * 기타 메시지 처리
 */
bot.on('message', (ctx) => {
  ctx.reply('🤖 명령어를 입력해주세요.\n/help 를 입력하면 도움말을 볼 수 있습니다.');
});

// ============================================
// 봇 시작
// ============================================

bot.launch({
  polling: {
    interval: 300,
    timeout: 20,
  },
});

console.log(`
╔════════════════════════════════════════╗
║   포트폴리오 관리 텔레그램 봇 시작     ║
╚════════════════════════════════════════╝
`);
console.log('🤖 봇이 실행 중입니다...');
console.log('💬 Telegram에서 봇을 검색하여 메시지를 보내세요.');
console.log('\n⚠️  주의: 백엔드 서버(http://localhost:3000)도 함께 실행되어야 합니다!');
console.log('   명령어: npm start');

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
