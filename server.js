const express = require('express');
const axios = require('axios');
const https = require('https');
const path = require('path');
const XLSX = require('xlsx');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

const KIS_CONFIG = {
  APP_KEY: process.env.KIS_APP_KEY || 'your_app_key_here',
  APP_SECRET: process.env.KIS_APP_SECRET || 'your_app_secret_here',
  BASE_URL: 'https://openapi.koreainvestment.com:9443',
};

const SEMICONDUCTOR_STOCKS = [
  { code: '005930', name: '삼성전자', market: 'KOSPI' },
  { code: '000660', name: 'SK하이닉스', market: 'KOSPI' },
  { code: '009540', name: '한미반도체', market: 'KOSPI' },
  { code: '078020', name: '이퓨전', market: 'KOSPI' },
  { code: '058970', name: '에이프로', market: 'KOSDAQ' },
];

const TOKEN_FILE = path.join(__dirname, 'token.json');

function loadTokenFromFile() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) {
      console.log('📄 토큰 파일 없음');
      return null;
    }

    const data = fs.readFileSync(TOKEN_FILE, 'utf-8');
    const tokenData = JSON.parse(data);

    if (tokenData.token && tokenData.expireTime && Date.now() < tokenData.expireTime) {
      console.log('✓ 저장된 토큰 로드됨');
      return tokenData.token;
    }

    console.log('⏰ 토큰 만료됨');
    return null;
  } catch (error) {
    console.error('❌ 토큰 파일 읽기 실패:', error.message);
    return null;
  }
}

function saveTokenToFile(token, expiresIn) {
  try {
    const expireTime = Date.now() + (expiresIn - 300) * 1000;
    const tokenData = {
      token,
      expireTime,
      issuedAt: new Date().toLocaleString('ko-KR'),
      expiresAt: new Date(expireTime).toLocaleString('ko-KR'),
    };

    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokenData, null, 2), 'utf-8');
    console.log('💾 토큰 파일 저장됨');
  } catch (error) {
    console.error('❌ 토큰 파일 저장 실패:', error.message);
  }
}

async function getAccessToken() {
  try {
    const savedToken = loadTokenFromFile();
    if (savedToken) {
      return savedToken;
    }

    console.log('\n📤 새로운 토큰 발급 요청 중...');
    console.log('   API KEY:', KIS_CONFIG.APP_KEY.substring(0, 10) + '...');

    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    const response = await axios.post(
      `${KIS_CONFIG.BASE_URL}/oauth2/tokenP`,
      {
        grant_type: 'client_credentials',
        appkey: KIS_CONFIG.APP_KEY,
        appsecret: KIS_CONFIG.APP_SECRET,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        httpsAgent: httpsAgent,
      }
    );

    console.log('   응답 상태:', response.status);
    console.log('   토큰 발급됨:', response.data.access_token.substring(0, 20) + '...');

    const newToken = response.data.access_token;
    const expiresIn = response.data.expires_in;

    saveTokenToFile(newToken, expiresIn);

    console.log('✓ 토큰 신규 발급 성공');
    return newToken;
  } catch (error) {
    console.error('❌ 토큰 발급 실패:');
    console.error('   에러:', error.message);
    if (error.response) {
      console.error('   상태 코드:', error.response.status);
      console.error('   응답:', error.response.data);
    }
    throw error;
  }
}

async function getStockQuote(stockCode) {
  try {
    console.log(`\n🔍 종목 조회: ${stockCode}`);
    
    const token = await getAccessToken();

    const httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });

    console.log(`   요청 URL: ${KIS_CONFIG.BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`);
    console.log(`   종목코드: ${stockCode.padStart(6, '0')}`);

    const response = await axios.get(
      `${KIS_CONFIG.BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price`,
      {
        params: {
          fid_cond_mrkt_div_code: 'J',
          fid_input_iscd: stockCode.padStart(6, '0'),
        },
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${token}`,
          'appkey': KIS_CONFIG.APP_KEY,
          'appsecret': KIS_CONFIG.APP_SECRET,
          'tr-id': 'FHKST01010100',
        },
        httpsAgent: httpsAgent,
      }
    );

    console.log(`   응답 상태: ${response.status}`);
    console.log(`   응답 코드: ${response.data.rt_cd}`);
    console.log(`   응답 메시지: ${response.data.msg1}`);

    if (response.data.rt_cd !== '0') {
      console.error(`   ❌ API 에러: ${response.data.msg1}`);
      throw new Error(response.data.msg1 || '조회 실패');
    }

    const data = response.data.output;
    console.log(`   현재가: ${data.stck_prpr}`);
    console.log(`   ✓ 조회 성공`);

    const currentPrice = parseInt(data.stck_prpr) || parseInt(data.stck_clpr);
    
    return {
      code: stockCode,
      price: currentPrice,
      change: parseInt(data.prdy_ctrt),
      changePercent: parseFloat(data.prdy_clpr),
      volume: parseInt(data.acml_vol),
      amount: parseInt(data.acml_tr_pbmn),
      high: parseInt(data.stck_hgpr),
      low: parseInt(data.stck_lwpr),
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`   ❌ ${stockCode} 조회 실패:`);
    console.error(`   에러: ${error.message}`);
    if (error.response) {
      console.error(`   상태 코드: ${error.response.status}`);
      console.error(`   응답: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return {
      code: stockCode,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

function readPortfolioExcel() {
  try {
    const portfolioPath = path.join(
      process.env.USERPROFILE || process.env.HOME,
      'Desktop',
      'portfolio',
      'portfolio.xlsx'
    );

    if (!fs.existsSync(portfolioPath)) {
      console.warn('⚠️  포트폴리오 파일 없음:', portfolioPath);
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
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get('/api/stocks-list', (req, res) => {
  res.json({
    success: true,
    data: SEMICONDUCTOR_STOCKS,
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'Server is running (DEBUG MODE)',
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   반도체 대시보드 서버 시작             ║
║   🔍 디버그 모드                       ║
║   http://localhost:${PORT}                ║
╚════════════════════════════════════════╝
  `);
  console.log('\n📊 API 키 상태:');
  console.log(`   APP_KEY: ${KIS_CONFIG.APP_KEY === 'your_app_key_here' ? '❌ 설정 안 됨' : '✅ 설정됨'}`);
  console.log(`   APP_SECRET: ${KIS_CONFIG.APP_SECRET === 'your_app_secret_here' ? '❌ 설정 안 됨' : '✅ 설정됨'}`);
  console.log('\n🔗 BASE_URL:', KIS_CONFIG.BASE_URL);
});

module.exports = app;
