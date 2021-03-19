const binance_api = require('./binance_api');
const indicators = require('./indicators')
const { test_logger } = require('./log_util')

const precise = (x) => parseFloat(x.toFixed(4));

const calculate_profit = (symbol, buying_time, profit_multiplier, stop_loss_multipler) => {
	return new Promise((resolve, reject) => {
		binance_api.fetch_candles(symbol, "1m", { startTime : buying_time }).then(
			(candles) => {
				const buying_price = candles.close_prices[0];

				let i = 0;
				const size = Math.min(candles.high_prices.length, candles.low_prices.length);
				while(++i < size) {			
					const isProfit = candles.high_prices[i] >= buying_price * profit_multiplier;
					const isLoss = candles.low_prices[i] <= buying_price * stop_loss_multipler;

					if(isProfit && isLoss) {
						const profit = precise((profit_multiplier + stop_loss_multipler) * 0.5 - 1);
						return resolve(profit);
					} else if(isProfit) {
						const profit = precise((profit_multiplier - 1));
						return resolve(profit);
					} else if(isLoss) {
						const profit = precise((stop_loss_multipler - 1));
						return resolve(profit);
					}
				}
				
				return resolve(0);
			},
			(error) => {
				return reject(error);
			}
		).catch((error) => {
			return reject(error)
		});
	});
}

const backtest = (symbol, interval, profit_multiplier, stop_loss_multipler) => {
	const logger = test_logger(symbol);
	
	binance_api.fetch_exchange_info().then(
		(filters) => {
			binance_api.fetch_candles(symbol, interval, {limit : 700}).then(
				async (candles) => {
					let signal_count = 0;
					let first_candle_increase = 0;
					let next_candle_increase = 0;
					let first_and_next_candle_increase = 0;
					let total_profit = 0;

					for(let i = 200; i < candles.open_prices.length - 1; ++i) {
						const open_prices = candles.open_prices.slice(0, i + 1);
						const close_prices = candles.close_prices.slice(0, i + 1);
						
						const signal = indicators.ema_scalper(open_prices, close_prices, filters[symbol].price_digit, () => {});

						if(signal) {					
							const buying_time = candles.open_times[i];

							signal_count += 1;
							
							const profit = await calculate_profit(symbol, buying_time, profit_multiplier, stop_loss_multipler);

							logger.info("Profit : % %f at %s", 100 * profit, new Date(buying_time).toLocaleString());
							total_profit += profit;

							const current_close_price = candles.close_prices[i];
							const current_open_price = candles.open_prices[i];

							const next_open_price = candles.open_prices[i + 1];
							const next_close_price = candles.close_prices[i + 1];

							if(current_close_price > current_open_price) first_candle_increase += 1;
							if(next_close_price > next_open_price) next_candle_increase += 1;
							if(current_close_price > current_open_price && next_close_price > next_open_price) first_and_next_candle_increase += 1;
						}
					}

					logger.info("Only current candle is green : % %d", 100 * (first_candle_increase / signal_count));
					logger.info("Only next candle is green : % %d", 100 * (next_candle_increase / signal_count));
					logger.info("Both current and next candle is green : % %d", 100 * (first_and_next_candle_increase / signal_count));
					logger.info("Total profit : % %d at %d buy signal", precise(100 * total_profit), signal_count);
				},
				(error) => {
					logger.error(error);
			}).catch((error) => {
				logger.error(error);
			});
		},
		(error) => {
			logger.error(error);
		}
	).catch((error) => {
		logger.error(error);
	});
	
}

exports.backtest = backtest