const binance_api = require('./binance_api');
const indicators = require('./indicators')
const log_util = require('./log_util')

const bot_state = {
	SEARCHING : "searching",
	TRADING : "trading"
}

const trade_type = {
	SPOT: "spot",
	FUTURE: "future",
}

const session_type = {
	TEST: "test",
	TRADE: "trade",
}

const SESSION_TYPE = session_type.TEST;
const TRADE_TYPE = trade_type.SPOT;

const BALANCE_LIMIT = (SESSION_TYPE == session_type.TEST) ? 1000 : 15;
const TRADING_CURRENCY = "USDT";

const COIN_PAIR = "BANDUSDT";
const CANDLE_INTERVAL = "15m";
const TICK_ROUND = parseInt(process.argv[2]) || 30;

const PROFIT_MULTIPLIER = 1.01;
const STOP_LOSS_MULTIPLIER = 0.99;

// Add latest candle to the list
function add_candle(candles, latest_candle) {
	candles.open_prices.shift();
	candles.close_prices.shift();
	candles.times.shift();
	
	candles.open_prices.push(Number(latest_candle.open));
	candles.close_prices.push(Number(latest_candle.close));
	candles.times.push(latest_candle.event_time);
}

// Start spot trading
async function start_spot_trade(symbol, interval, tick_round, filters={}, logger) {
	logger.info("Fetching candles for interval %s", interval);
	
	const candles = await binance_api.fetch_candles(symbol, interval);

	let current_state = bot_state.SEARCHING;

	let buy_info = track_info = null;	
	let total_profit = tick_sum = tick_count = 0;

	logger.info("Subscribing to candles websocket for pair %s", symbol);
	binance_api.ws_candles(symbol, interval, async (open, close, event_time, isFinal) => {
			const current_price = Number.parseFloat(close);

			tick_count += 1;
			tick_sum += current_price;

			if(current_state == bot_state.SEARCHING && tick_count >= tick_round) {
				// Search for opportunity when average is calculated
				const tick_average = tick_sum / tick_count;

				const open_prices = candles.open_prices.concat(open).slice(1);
				const close_prices = candles.close_prices.concat(tick_average).slice(1);
				
				const signal = indicators.ema_scalper(open_prices, close_prices, filters.price_digit, logger);

				if(signal) {			
					// Buy from market
					const calculation_result = await binance_api.calculate_buy_quantity(symbol, TRADING_CURRENCY, BALANCE_LIMIT, filters, SESSION_TYPE == session_type.TEST)
					
					if(calculation_result?.price && calculation_result?.quantity) {
						binance_api.spot_market_buy(symbol, calculation_result.price, calculation_result.quantity, SESSION_TYPE == session_type.TEST, 
							(price, quantity) => {
								// onSuccess
								buy_info = {
									price: price ,
									quantity: quantity
								};

								logger.info("Market buy from price : %f and quantity : %f", buy_info.price, buy_info.quantity);

								// Reset variables before state transition
								track_info = null;
								current_state = bot_state.TRADING;
							}, 
							(error) => {
								// onError
								logger.error("Error occured during market buy : %s", error);
							}
						);
					}		
				}
			} else if(current_state == bot_state.TRADING && buy_info?.price && buy_info?.quantity) {
				// Track for the price
				const lower_price_limit = track_info?.lower_price_limit || (buy_info?.price || current_price) * STOP_LOSS_MULTIPLIER; 
				const higher_price_limit = track_info?.higher_price_limit || (buy_info?.price || current_price) * PROFIT_MULTIPLIER;
				const quantity = buy_info?.quantity || 0 ;
				
				if(current_price >= higher_price_limit) {
					track_info = { 
						lower_price_limit : higher_price_limit * (1 - (1 - STOP_LOSS_MULTIPLIER) * 0.5),
						higher_price_limit : higher_price_limit * (1 + ((PROFIT_MULTIPLIER - 1) * 0.5))
					};

					logger.info("Changed lower limit to %f", track_info.lower_price_limit);
					logger.info("Changed higher limit to %f", track_info.higher_price_limit);
				}
				else if(current_price <= lower_price_limit) {
					binance_api.spot_market_sell(symbol, current_price, quantity, SESSION_TYPE == session_type.TEST,
						(price, quantity) => {
							// onSuccess
							track_info = { 
								sell_price : price,
								sell_quantity : quantity 
							};
							
							logger.info("Market sell from price : %f and quantity : %f", track_info.sell_price, track_info.sell_quantity);
							
							const profit = track_info.sell_price * track_info.sell_quantity - buy_info.price * buy_info.quantity;
							logger.info("Profit : %f", profit);
	
							total_profit += profit;
							logger.info("Total profit : %f", total_profit);
							
							// Reset variables before state transition
							buy_info = null;
							track_info = null;
							current_state = bot_state.SEARCHING;
						},
						(error) => {
							// onError
							logger.error("Error occured during market sell : %s", error);
						}
					);
				}
			}

			if(isFinal) add_candle(candles, {open, close, event_time});
			if(isFinal || tick_count >= tick_round) tick_sum = tick_count = 0;
		}
	);
};

// Start future trading
async function start_future_trade(symbol, interval, tick_round, filters={}, logger) {
	logger.warn("Future trading is not implemented");
};

async function main() {
	const coin_pairs = ["BANDUSDT", "CAKEUSDT", "MATICUSDT", "LTCUSDT"];

	log_util.global_logger.info("Authenticating to server...");
	binance_api.authenticate(SESSION_TYPE == session_type.TEST);

	log_util.global_logger.info("Fetching exchange info...");
	const minimums = await binance_api.fetch_exchange_info();

	for (pair of coin_pairs) {
		log_util.global_logger.info("Starting the bot for %s", pair);

		const pair_logger = log_util.add_logger(pair);

		if(TRADE_TYPE == trade_type.SPOT) {
			start_spot_trade(pair, CANDLE_INTERVAL, TICK_ROUND, minimums[pair], pair_logger);
		} else if(TRADE_TYPE == trade_type.FUTURE) {
			start_future_trade(pair, CANDLE_INTERVAL, TICK_ROUND, minimums[pair], pair_logger);
		}
	}
}

main();