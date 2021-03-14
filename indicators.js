const { EMA } = require('technicalindicators');

const precise = (x) => parseFloat(x.toFixed(4));

// Calculate ema1 and ema2
exports.ema_scalper = (open_prices, close_prices) => {
	const [prev_ema1, curr_ema1] = EMA.calculate({period: 13, values: close_prices}).slice(-2).map(precise);
	const [prev_ema2, curr_ema2] = EMA.calculate({period: 21, values: open_prices}).slice(-2).map(precise);
	
	const signal = (prev_ema2 > prev_ema1) && (curr_ema2 <= curr_ema1);
	
	return signal;
}

