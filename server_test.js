const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 정적 파일 서빙
app.use(express.static(path.join(__dirname, 'public')));

// 반도체 관련 종목 정의
const SEMICONDUCTOR_STOCKS = [
  { code: '005930', name: '삼성전자', market: 'KOSPI' },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  { code: '009540', name: '한미반도체', market: 'KOSPI' },
  { code: '078020', name: '이퓨전', market: 'KOSPI' },
  { code: '058970', name: '에이프로', market: 'KOSDAQ' },
];

// 테스트 데이터
const TEST_DATA = {
  '005930': { price: 65000, name: '삼성전자', change: 500, changePercent: 0.77 },
  '000660': { price: 125000, name: 'SK하이닉스', change: -1500, changePercent: -1.19 },
  '009540': { price: 155000, name: '한미반도체', change: 2500, changePercent: 1.64 },
  '078020': { price: 45000, name: '이퓨전', change: 1000, changePercent: 2.27 },
  '058970': { price: 8000, name: '에이프로', change: 100, changePercent: 1.27 },
};

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
      console.warn('⚠️  포트폴리오 파일을 찾을 수 없습니다:', portfolioPath);
      return [];
    }

    const workbook = XLSX.readFile(portfolioPath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data.map(row => ({
      종목명: row['종목명'] || row['종목이름'] || '',
      종목코드: String(row['종목코드']).padStart(6, '0'),
      보유수량: parseInt(row['보유수량']) || 0,
      매입가: parseInt(row['매입가']) || 0,
    }));
  } catch (error) {
    console.error('❌ 포트폴리오 파일 읽기 실패:', error.message);
    return [];
  }
}

/**
 * 테스트 데이터 기반 시세 조회
 */
async function getStockQuote(stockCode) {
  try {
    const testPrice = TEST_DATA[stockCode];
    if (!testPrice) {
      return {
        code: stockCode,
        error: '종목을 찾을 수 없습니다',
        timestamp: new Date().toISOString(),
      };
    }

    // 약간의 변동성 추가
    const variation = (Math.random() - 0.5) * 1000;
    const currentPrice = Math.floor(testPrice.price + variation);

    return {
      code: stockCode,
      price: currentPrice,
      change: testPrice.change,
      changePercent: testPrice.changePercent,
      volume: Math.floor(Math.random() * 20000000),
      amount: Math.floor(Math.random() * 1500000000000),
      high: currentPrice + 1000,
      low: currentPrice - 1000,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`❌ ${stockCode} 조회 실패:`, error.message);
    return {
      code: stockCode,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

// ============================================
// API 엔드포인트
// ============================================

/**
 * 모든 반도체 종목 데이터 조회
 */
app.get('/api/semiconductors', async (req, res) => {
  try {
    const promises = SEMICONDUCTOR_STOCKS.map((stock) =>
      getStockQuote(stock.code)
        .then((quote) => ({
          ...stock,
          ...quote,
        }))
        .catch((error) => ({
          ...stock,
          error: error.message,
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
 * 포트폴리오 데이터 조회
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

    // 각 종목별 현재가 조회
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
          priceChange: quote.change || 0,
          priceChangePercent: quote.changePercent || 0,
        };
      })
    );

    // 요약 통계
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
 * 특정 종목 데이터 조회
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
 * 지원하는 종목 목록
 */
app.get('/api/stocks-list', (req, res) => {
  res.json({
    success: true,
    data: SEMICONDUCTOR_STOCKS,
  });
});

/**
 * 상태 체크
 */
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'Server is running (TEST MODE)',
    timestamp: new Date().toISOString(),
  });
});

// ============================================
// 서버 시작
// ============================================

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   반도체 대시보드 서버 시작             ║
║   🧪 테스트 모드 (샘플 데이터)         ║
║   http://localhost:${PORT}                ║
╚════════════════════════════════════════╝
  `);
  console.log('📊 지원 종목:', SEMICONDUCTOR_STOCKS.map((s) => s.name).join(', '));
  console.log('\n⚠️  테스트 모드:');
  console.log('   - 샘플 데이터로 실행 중');
  console.log('   - 포트폴리오 기능 테스트 가능');
  console.log('   - 실제 API는 평일 09:00~15:30에 사용');
});

module.exports = app;
