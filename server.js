const express = require('express');
const axios = require('axios');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// 토스증권 API 설정
// ============================================
const TOSS_CONFIG = {
  API_KEY: process.env.TOSS_API_KEY || 'your_toss_api_key_here',
  BASE_URL: 'https://api.tosspayments.com/v1',
};

// 반도체 종목
const SEMICONDUCTOR_STOCKS = [
  { code: '005930', name: '삼성전자' },
  { code: '000660', name: 'SK하이닉스' },
  { code: '009540', name: '한미반도체' },
  { code: '078020', name: '이퓨전' },
  { code: '058970', name: '에이프로' },
];

// ============================================
// 토스증권 시세 조회
// ============================================

/**
 * 주식 시세 조회 (토스 API)
 */
async function getStockQuote(stockCode) {
  try {
    console.log(`🔍 종목 조회: ${stockCode}`);

    const response = await axios.get(
      `${TOSS_CONFIG.BASE_URL}/stock/quote`,
      {
        params: {
          code: stockCode,
        },
        headers: {
          'Authorization': `Bearer ${TOSS_CONFIG.API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`   ✓ 현재가: ${response.data.currentPrice}원`);

    return {
      code: stockCode,
      price: response.data.currentPrice,
      change: response.data.change || 0,
      changePercent: response.data.changePercent || 0,
      high: response.data.high || response.data.currentPrice,
      low: response.data.low || response.data.currentPrice,
      volume: response.data.volume || 0,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`   ❌ ${stockCode} 조회 실패:`, error.message);
    
    // 실패 시 테스트 데이터 반환
    const testPrices = {
      '005930': 65000,
      '000660': 125000,
      '009540': 155000,
      '078020': 45000,
      '058970': 8000,
    };

    return {
      code: stockCode,
      price: testPrices[stockCode] || 50000,
      change: 0,
      changePercent: 0,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================
// 포트폴리오 관리
// ============================================

/**
 * 포트폴리오 엑셀 파일 읽기
 */
function readPortfolioExcel() {
  try {
    const portfolioPath = path.join(
      process.env.USERPROFILE || process.env.HOME,
      'Desktop',
      'portfolio',
      'portfolio.xlsx'
    );

    if (!fs.existsSync(portfolioPath)) {
      console.warn('⚠️  포트폴리오 파일 없음');
      return [];
    }

    const workbook = XLSX.readFile(portfolioPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map(row => ({
      종목명: row['종목명'] || '',
      종목코드: String(row['종목코드']).padStart(6, '0'),
      보유수량: parseInt(row['보유수량']) || 0,
      매입가: parseInt(row['매입가']) || 0,
    }));
  } catch (error) {
    console.error('❌ 포트폴리오 파일 읽기 실패:', error.message);
    return [];
  }
}

// ============================================
// API 엔드포인트
// ============================================

/**
 * 모든 반도체 종목 조회
 */
app.get('/api/semiconductors', async (req, res) => {
  try {
    const promises = SEMICONDUCTOR_STOCKS.map((stock) =>
      getStockQuote(stock.code)
        .then((quote) => ({
          ...stock,
          ...quote,
        }))
    );

    const results = await Promise.all(promises);
    res.json({
      success: true,
      data: results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 특정 종목 조회
 */
app.get('/api/semiconductors/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const stock = SEMICONDUCTOR_STOCKS.find((s) => s.code === code);

    if (!stock) {
      return res.status(404).json({
        success: false,
        error: '종목을 찾을 수 없습니다',
      });
    }

    const quote = await getStockQuote(code);
    res.json({
      success: true,
      data: {
        ...stock,
        ...quote,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 포트폴리오 조회
 */
app.get('/api/portfolio', async (req, res) => {
  try {
    const portfolio = readPortfolioExcel();

    if (!portfolio.length) {
      return res.json({
        success: true,
        data: [],
        summary: {
          totalEvaluationAmount: 0,
          totalInvestmentAmount: 0,
          totalProfitLoss: 0,
          totalProfitLossPercent: 0,
          holdingCount: 0,
        },
        timestamp: new Date().toISOString(),
      });
    }

    const portfolioWithPrices = await Promise.all(
      portfolio.map(async (item) => {
        const quote = await getStockQuote(item.종목코드);

        const currentPrice = quote.price || 0;
        const quantity = item.보유수량;
        const purchasePrice = item.매입가;

        const evaluationAmount = currentPrice * quantity;
        const investmentAmount = purchasePrice * quantity;
        const profitLoss = evaluationAmount - investmentAmount;
        const profitLossPercent =
          investmentAmount > 0
            ? ((profitLoss / investmentAmount) * 100).toFixed(2)
            : 0;

        return {
          ...item,
          currentPrice,
          evaluationAmount,
          investmentAmount,
          profitLoss,
          profitLossPercent: parseFloat(profitLossPercent),
        };
      })
    );

    const totalEvaluationAmount = portfolioWithPrices.reduce(
      (sum, item) => sum + item.evaluationAmount,
      0
    );
    const totalInvestmentAmount = portfolioWithPrices.reduce(
      (sum, item) => sum + item.investmentAmount,
      0
    );
    const totalProfitLoss = totalEvaluationAmount - totalInvestmentAmount;
    const totalProfitLossPercent =
      totalInvestmentAmount > 0
        ? ((totalProfitLoss / totalInvestmentAmount) * 100).toFixed(2)
        : 0;

    res.json({
      success: true,
      data: portfolioWithPrices,
      summary: {
        totalEvaluationAmount,
        totalInvestmentAmount,
        totalProfitLoss,
        totalProfitLossPercent: parseFloat(totalProfitLossPercent),
        holdingCount: portfolioWithPrices.length,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ 포트폴리오 조회 실패:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * 상태 체크
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'Server is running (Toss API)',
    provider: 'Toss Securities',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// 서버 시작
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   SK Square 포트폴리오 서버 시작      ║
║   🏦 토스증권 API 연동                ║
║   http://localhost:${PORT}                ║
╚════════════════════════════════════════╝
  `);
  console.log('\n📊 지원 종목:', SEMICONDUCTOR_STOCKS.map((s) => s.name).join(', '));
  console.log('\n🔌 API 설정:');
  console.log(`   Provider: 토스증권`);
  console.log(`   API Key: ${TOSS_CONFIG.API_KEY === 'your_toss_api_key_here' ? '❌ 설정 안 됨' : '✅ 설정됨'}`);
});

module.exports = app;
