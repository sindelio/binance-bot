const binance_api = require('./binance_api');
const indicators = require('./indicators')
const { test_logger } = require('./logger')

const precise = (x) => parseFloat(x.toFixed(4));

const calculate_profit = (high_prices, low_prices, buying_price, take_profit_multiplier, profit_multiplier, stop_loss_multipler) => {

	let lower_price_limit = buying_price * stop_loss_multipler;
	let higher_price_limit = buying_price * profit_multiplier;

	const size = Math.min(high_prices.length, low_prices.length);

	let profit = 0;

	for(let i = 0; i < size; ++i) {
		const isProfit = high_prices[i] >= higher_price_limit;
		const isLoss = low_prices[i] <= lower_price_limit;

		if(isProfit && isLoss) {
			profit = precise((((lower_price_limit + higher_price_limit) * 0.5) / buying_price) - 1);
			break;
		} else if(isProfit) {
			if(higher_price_limit >= buying_price * take_profit_multiplier) {
				profit = precise(take_profit_multiplier - 1);
				break;
			} else {
				lower_price_limit = higher_price_limit * stop_loss_multipler;
				higher_price_limit = higher_price_limit * ((1 + profit_multiplier) * 0.5);
				profit = precise((((lower_price_limit + higher_price_limit) * 0.5) / buying_price) - 1);
			}
		} else if(isLoss) {
			profit = precise((lower_price_limit / buying_price) - 1);
			break;
		}
	}
		
	return profit;
}

const search_signal = async (symbol, prev_open_prices, prev_close_prices, start_time, indicator, onSignal) => {

	const candles = await binance_api.fetch_candles(symbol, "1m", { startTime : start_time });

	if(candles.close_prices.length < 15) return;

	for(let i = 0; i < 15; ++i) {
		const open_price = candles.open_prices[i];
		const close_price = candles.close_prices[i];

		const open_prices = prev_open_prices.concat(open_price).slice(1);
		const close_prices = prev_close_prices.concat(close_price).slice(1);

		const signal = indicator(open_prices, close_prices);


		if(signal) {
			const buying_price = close_price;
			const buying_time = candles.close_times[i];

			onSignal(candles.high_prices.slice(i + 1), candles.low_prices.slice(i + 1), buying_price, buying_time);
			break;
		}
	}
}

const backtest = async (symbol, interval, take_profit_multiplier, profit_multiplier, stop_loss_multipler) => {
	const logger = test_logger(symbol);
	const indicator = (open_prices, close_prices) => indicators.sma_scalper_6_12(close_prices, 4) || indicators.ema_scalper_13_21(open_prices, close_prices, 4);

	binance_api.fetch_candles(symbol, interval, {limit : 600}).then(
		async (candles) => {
			let signal_count = win = loss = total_profit = 0;

			for(let i = 100; i < candles.open_prices.length - 1; ++i) {

				const prev_open_prices = candles.open_prices.slice(0, i);
				const prev_close_prices = candles.close_prices.slice(0, i);
				
				await search_signal(symbol, prev_open_prices, prev_close_prices, candles.open_times[i], indicator, 
					(high_prices, low_prices, buying_price, buying_time) => {
						// onSignal
						signal_count += 1;
						
						const profit = calculate_profit(high_prices, low_prices, buying_price, take_profit_multiplier, profit_multiplier, stop_loss_multipler);

						if(profit > 0) win += 1;
						if(profit < 0) loss += 1;

						total_profit += profit;

						logger.info("Buying price : %f and profit : % %f at %s", buying_price, 100 * profit, new Date(buying_time).toLocaleString());
				});
			}

			logger.info("Win : %d , Loss : %d, Profit : % %d", win, loss, precise(100 * total_profit));
		},
		(error) => {
			logger.error(error);
	}).catch((error) => {
		logger.error(error);
	});
	
}

exports.backtest = backtest