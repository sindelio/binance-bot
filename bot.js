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

const LOG_DIR = "logs/new_or_old_scalper_combined";

const BALANCE_LIMIT = (SESSION_TYPE == session_type.TEST) ? 1000 : 15;
const TRADING_CURRENCY = "USDT";

const COIN_PAIR = process.argv[2] || "BANDUSDT";
const TICK_ROUND = parseInt(process.argv[3]) || 30;
const CANDLE_INTERVAL = "15m";

const PROFIT_MULTIPLIER = 1.015;
const STOP_LOSS_MULTIPLIER = 0.99;

// Add latest candle to the list
function add_candle(candles, latest_candle) {
	candles.open_prices.shift();
	candles.close_prices.shift();
	candles.open_times.shift();
	
	candles.open_prices.push(Number(latest_candle.open));
	candles.close_prices.push(Number(latest_candle.close));
	candles.open_times.push(latest_candle.event_time);
}

// Start spot trading
function start_spot_trade(symbol, interval, tick_round, filters={}, logger) {
	logger.info("Fetching candles for interval %s", interval);
	
	binance_api.fetch_candles(symbol, interval).then(
		(candles) => {
			let current_state = bot_state.SEARCHING;

			let buy_info = track_info = null;	
			let total_profit = tick_sum = tick_count = 0;
		
			logger.info("Subscribing to candles websocket for %s", symbol);

			binance_api.ws_candles(symbol, interval, 
				(open, close, event_time, isFinal) => {
					const current_price = Number.parseFloat(close);
		
					tick_count += 1;
					tick_sum += current_price;

					if(current_state == bot_state.SEARCHING && tick_count >= tick_round) {
						// Search for opportunity when average is calculated
						const tick_average = tick_sum / tick_count;
		
						const open_prices = candles.open_prices.concat(open).slice(1);
						const close_prices = candles.close_prices.concat(tick_average).slice(1);					
						
						
						const signal = indicators.ema_scalper(open_prices, close_prices, filters.price_digit, logger.info);
						
						if(signal) {
							// Buy from market
							binance_api.calculate_buy_quantity(symbol, TRADING_CURRENCY, BALANCE_LIMIT, filters, SESSION_TYPE == session_type.TEST).then(
								({price, quantity}) => {
									binance_api.spot_market_buy(symbol, price, quantity, SESSION_TYPE == session_type.TEST, 
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
								},
								(error) => {
									logger.error(error);
								}).catch((error) => {
									logger.error(error);
								});
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
		},
		(error) => {
			logger.error(error);
	}).catch((error) => {
		logger.error(error);
	});
};

// Start future trading
function start_future_trade(symbol, interval, tick_round, filters={}, logger) {
	logger.warn("Future trading is not implemented");
};

function run() {
	if(SESSION_TYPE == session_type.TRADE) {
		log_util.global_logger.info("Authenticating to Binance...");
		binance_api.authenticate_user();
	}
	
	log_util.global_logger.info("Fetching exchange info from Binance...");
	binance_api.fetch_exchange_info().then(
		(filters) => {
			log_util.global_logger.info("Starting the bot for %s", COIN_PAIR);
	
			const pair_logger = log_util.add_logger(COIN_PAIR, LOG_DIR);
	
			if(TRADE_TYPE == trade_type.SPOT) {
				start_spot_trade(COIN_PAIR, CANDLE_INTERVAL, TICK_ROUND, filters[COIN_PAIR], pair_logger);
			} else if(TRADE_TYPE == trade_type.FUTURE) {
				start_future_trade(COIN_PAIR, CANDLE_INTERVAL, TICK_ROUND, filters[COIN_PAIR], pair_logger);
			}
		},
		(error) => {
			log_util.global_logger.error(error);
		}
	).catch((error) => {
		log_util.global_logger.error(error);
	});
}

function test(){
	const test_logger = log_util.test_logger(COIN_PAIR);
	
	binance_api.fetch_exchange_info().then(
		(filters) => {
			binance_api.fetch_candles(COIN_PAIR, CANDLE_INTERVAL, {limit : 700}).then(
				(candles) => {
					let signal_count = 0;
					let first_candle_increase = 0;
					let next_candle_increase = 0;
					let first_and_next_candle_increase = 0;

					for(let i = 200; i < candles.open_prices.length - 1; ++i) {
						const open_prices = candles.open_prices.slice(0, i + 1);
						const close_prices = candles.close_prices.slice(0, i + 1);

						const signal = indicators.ema_scalper(open_prices, close_prices, filters[COIN_PAIR].price_digit, () => {});

						if(signal) {
							signal_count += 1;

							const current_time = new Date(candles.open_times[i]);
							test_logger.info("Signal : %s", current_time.toLocaleString());

							const current_close_price = candles.close_prices[i];
							const current_open_price = candles.open_prices[i];

							const next_open_price = candles.open_prices[i + 1];
							const next_close_price = candles.close_prices[i + 1];

							if(current_close_price > current_open_price) first_candle_increase += 1;
							if(next_close_price > next_open_price) next_candle_increase += 1;
							if(current_close_price > current_open_price && next_close_price > next_open_price) first_and_next_candle_increase += 1;
						}
					}

					test_logger.info("Only current candle is green : % %d", 100 * (first_candle_increase / signal_count));
					test_logger.info("Only next candle is green : % %d", 100 * (next_candle_increase / signal_count));
					test_logger.info("Both current and next candle is green : % %d", 100 * (first_and_next_candle_increase / signal_count));
				},
				(error) => {
					log_util.global_logger.error(error);
			}).catch((error) => {
				log_util.global_logger.error(error);
			});
		},
		(error) => {
			log_util.global_logger.error(error);
		}
	).catch((error) => {
		log_util.global_logger.error(error);
	});
	
}

//run();
test();