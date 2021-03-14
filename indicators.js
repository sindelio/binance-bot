const { EMA } = require('technicalindicators');

const precise = (x) => parseFloat(x.toFixed(4));

// PROTOTYPE FUNCTIONS
Array.prototype.lastTwo = () => this.slice(-2);

// Calculate ema1 and ema2
exports.ema_scalper = (candles) => {
	const [prev_ema1, curr_ema1] = EMA.calculate({period: 13, values: candles.closing.values}).slice(-2).map(precise);
	const [prev_ema2, curr_ema2] = EMA.calculate({period: 21, values: candles.opening.values}).slice(-2).map(precise);
	
	const signal = (prev_ema2 > prev_ema1) && (curr_ema2 <= curr_ema1);
	
	return signal;
}

