const binance_api = require('./binance_api');
const indicators = require('./indicators')
const { test_logger } = require('./logger')

const precise = (x) => parseFloat(x.toFixed(4));

const calculate_profit = (symbol, buying_price, buying_time, take_profit_multiplier, profit_multiplier, stop_loss_multipler) => {
	return new Promise((resolve, reject) => {
		binance_api.fetch_candles(symbol, "1m", { startTime : buying_time }).then(
			(candles) => {
				let i = 0;
				let lower_price_limit = buying_price * stop_loss_multipler;
				let higher_price_limit = buying_price * profit_multiplier;

				const size = Math.min(candles.high_prices.length, candles.low_prices.length);
				
				while(++i < size) {			
					const isProfit = candles.high_prices[i] >= higher_price_limit;
					const isLoss = candles.low_prices[i] <= lower_price_limit;

					if(isProfit && isLoss) {
						const profit = precise((((lower_price_limit + higher_price_limit) * 0.5) / buying_price) - 1);
						return resolve({
								profit : profit,
								selling_time : candles.close_times[i]
							});
					} else if(isProfit) {
						if(higher_price_limit >= buying_price * take_profit_multiplier) {
							const profit = precise((higher_price_limit / buying_price) - 1);
							return resolve({
									profit : profit,
									selling_time : candles.close_times[i]
								});
						} else {
							lower_price_limit = higher_price_limit * ((1 + stop_loss_multipler) * 0.5);
							higher_price_limit = higher_price_limit * ((1 + profit_multiplier) * 0.5);
						}
					} else if(isLoss) {
						const profit = precise((lower_price_limit / buying_price) - 1);
						return resolve({
							profit : profit,
							selling_time : candles.close_times[i]
						});
					}
				}
				
				return resolve({
					profit : 0,
					selling_time : buying_time
				});
			},
			(error) => {
				return reject(error);
			}
		).catch((error) => {
			return reject(error)
		});
	});
}

const search_signal = (symbol, prev_open_prices, prev_close_prices, start_time, close_time, price_digit) => {
	return new Promise((resolve, reject) => {
		binance_api.fetch_candles(symbol, "1m", { startTime : start_time, endTime: close_time }).then(
			(candles) => {
				const size = Math.min(candles.open_prices.length, candles.close_prices.length);

				for(let i = 0; i < size; ++i) {
					const open_price = candles.open_prices[i];
					const close_price = candles.close_prices[i];

					const open_prices = prev_open_prices.concat(open_price).slice(1);
					const close_prices = prev_close_prices.concat(close_price).slice(1);
					const signal = indicators.sma_scalper_6_12(open_prices, close_prices, price_digit) 
								|| indicators.ema_scalper_13_21(open_prices, close_prices, price_digit);

					if(signal) {
						return resolve({
							buying_price : close_price,
							buying_time : candles.close_times[i]
						})
					}
				}

				return resolve(null);
			},
			(error) => {
				return reject(error);
			}
		).catch((error) => {
			return reject(error)
		});
	});
}

const backtest = async (symbol, interval, take_profit_multiplier, profit_multiplier, stop_loss_multipler) => {
	const logger = test_logger(symbol);

	binance_api.fetch_exchange_info().then(
		(filters) => {
			binance_api.fetch_candles(symbol, interval, {limit : 1000}).then(
				async (candles) => {
					let signal_count = 0;
					let win = 0;
					let loss = 0;
					let total_profit = 0;
					let last_selling_time = 0;

					for(let i = 50; i < candles.open_prices.length - 1; ++i) {

						if(candles.open_times[i] > last_selling_time) {
							const prev_open_prices = candles.open_prices.slice(0, i);
							const prev_close_prices = candles.close_prices.slice(0, i);
							
							const signal = await search_signal(symbol, prev_open_prices, prev_close_prices, candles.open_times[i], candles.close_times[i], filters[symbol].price_digit);
	
							if(signal && signal.buying_price && signal.buying_time) {
								signal_count += 1;
									
								const { profit, selling_time } = await calculate_profit(symbol, signal.buying_price, signal.buying_time, take_profit_multiplier, profit_multiplier, stop_loss_multipler);
								
								last_selling_time = selling_time;

								if(profit > 0) win += 1;
								if(profit < 0) loss += 1;
	
								total_profit += profit;
	
								// logger.info("Buying price : %f and profit : % %f at %s", signal.buying_price, 100 * profit, new Date(signal.buying_time).toLocaleString());
							}
						
							// const open_prices = candles.open_prices.slice(0, i + 1);
							// const close_prices = candles.close_prices.slice(0, i + 1);

							// const signal = indicators.sma_scalper(open_prices, close_prices, filters[symbol].price_digit);

							// const buying_price = candles.close_prices[i];
							// const buying_time = candles.close_times[i];

							// if(signal) {
							// 	signal_count += 1;
									
							// 	const { profit, selling_time } = await calculate_profit(symbol, buying_price, buying_time, profit_multiplier, stop_loss_multipler);

							// last_selling_time = selling_time;

							// 	if(profit > 0) win += 1;
							// 	if(profit < 0) loss += 1;

							// 	total_profit += profit;

							// 	logger.info("Buying price : %f and profit : % %f at %s", buying_price, 100 * profit, new Date(buying_time).toLocaleString());
							// }
						}
					}

					logger.info("Win : %d , Loss : %d, Profit : % %d", win, loss, precise(100 * total_profit));
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