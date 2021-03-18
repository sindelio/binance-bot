const { EMA } = require('technicalindicators');

// Calculate ema1 and ema2
const ema_scalper = (open_prices, close_prices, price_digit=4, logger) => {
	const precise = (x) => parseFloat(x.toFixed(price_digit));

	// Earlier scalper
	const [prev_ema6, curr_ema6] = EMA.calculate({period: 6, values: close_prices}).slice(-2).map(precise);
	const [prev_ema12, curr_ema12] = EMA.calculate({period: 12, values: close_prices}).slice(-2).map(precise);

	// Later scalper
	const [prev_ema13, curr_ema13] = EMA.calculate({period: 13, values: close_prices}).slice(-2).map(precise);
	const [prev_ema21, curr_ema21] = EMA.calculate({period: 21, values: open_prices}).slice(-2).map(precise);

	const signal = (curr_ema6 > curr_ema12) && (prev_ema6 <= prev_ema12) && (prev_ema13 <= prev_ema21) ||
					(curr_ema13 > curr_ema21) && (prev_ema13 <= prev_ema21) && (prev_ema6 >= prev_ema12);
					
	if(signal) {
		logger.info("current ema21 : %f and current ema13 : %f", curr_ema21, curr_ema13);
		logger.info("previous ema21 : %f and previous ema13 : %f", prev_ema21, prev_ema13);
		
		logger.info("current ema12 : %f and current ema6 : %f", curr_ema12, curr_ema6);
		logger.info("previous ema12 : %f and previous ema6 : %f", prev_ema12, prev_ema6);
	}
	
	return signal;
}

exports.ema_scalper = ema_scalper;

