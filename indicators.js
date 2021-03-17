const { EMA } = require('technicalindicators');

// Calculate ema1 and ema2
exports.ema_scalper = (open_prices, close_prices, price_digit=4) => {
	const precise = (x) => parseFloat(x.toFixed(price_digit));

	// Earlier scalper
	const [prev_ema6, curr_ema6] = EMA.calculate({period: 6, values: close_prices}).slice(-2).map(precise);
	const [prev_ema12, curr_ema12] = EMA.calculate({period: 12, values: close_prices}).slice(-2).map(precise);

	// Later scalper
	const [prev_ema13, curr_ema13] = EMA.calculate({period: 13, values: close_prices}).slice(-2).map(precise);
	const [prev_ema21, curr_ema21] = EMA.calculate({period: 21, values: open_prices}).slice(-2).map(precise);

	const signal = (curr_ema6 > curr_ema12) && (prev_ema6 <= prev_ema12) && (prev_ema21 > prev_ema13) ||
					(curr_ema13 > curr_ema21) && (prev_ema13 <= prev_ema21) && (prev_ema6 > prev_ema12) ;

	if(signal) {
		console.log("current ema21 :", curr_ema21, "current ema13 :", curr_ema13);
		console.log("previous ema21 :", prev_ema21, "previous ema13 :", prev_ema13);
		
		console.log("current ema12 :", curr_ema12, "current ema6 :", curr_ema6);
		console.log("previous ema12 :", prev_ema12, "previous ema6 :", prev_ema6);
	}
	
	return signal;
}

