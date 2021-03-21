const { backtest } = require('./backtest');
const binance_api = require('./binance_api');
const indicators = require('./indicators')
const { global_logger, add_logger, get_logger } = require('./logger')

const bot_state = {
	SEARCHING : "searching",
	TRADING : "trading"
}

const trade_type = {
	SPOT: "spot",
	FUTURE: "future",
}

const session_type = {
	BACKTEST: "backtest",
	LIVETEST: "livetest",
	TRADE: "trade",
}

const SESSION_TYPE = session_type.BACKTEST;
const TRADE_TYPE = trade_type.SPOT;

const LOG_DIR = "logs/1.015_1.04_trailing_loss";

const BALANCE_LIMIT = (SESSION_TYPE == session_type.LIVETEST) ? 1000 : 15;
const TRADING_CURRENCY = "USDT";

const COIN_PAIR = process.argv[2] || "BANDUSDT";
const TICK_ROUND = 30;
const CANDLE_INTERVAL = "15m";

const TAKE_PROFIT_MULTIPLIER = 1.025;
const PROFIT_MULTIPLIER = 1.025;
const STOP_LOSS_MULTIPLIER = 0.99;

// Add latest candle to the list
function add_candle(candles, latest_candle) {
	candles.open_prices.shift();
	candles.close_prices.shift();
	candles.low_prices.shift();
	candles.high_prices.shift();
	candles.open_times.shift();
	candles.close_times.shift();
	
	candles.open_prices.push(Number(latest_candle.open));
	candles.close_prices.push(Number(latest_candle.close));
	candles.low_prices.push(Number(latest_candle.low));
	candles.high_prices.push(Number(latest_candle.high));
	candles.open_times.push(candles.close_times[candles.close_times.length - 1] + 1);
	candles.close_times.push(latest_candle.event_time);
}

// Start spot trading
function start_spot_trade(symbol, interval, tick_round, filters={}, logger, test=true) {
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
						
						const signal = indicators.sma_scalper_6_12(open_prices, close_prices, filters.price_digit, logger.info)
									|| indicators.ema_scalper_13_21(open_prices, close_prices, filters.price_digit, logger.info);
						
						if(signal) {
							// Buy from market
							binance_api.calculate_buy_quantity(symbol, TRADING_CURRENCY, BALANCE_LIMIT, filters, test).then(
								({price, quantity}) => {
									binance_api.spot_market_buy(symbol, price, quantity, test, 
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

						if(current_price >= higher_price_limit && current_price < buy_info.price * TAKE_PROFIT_MULTIPLIER) {
							track_info = {
								lower_price_limit : higher_price_limit * ((1 + STOP_LOSS_MULTIPLIER) * 0.5),
								higher_price_limit : higher_price_limit * ((1 + PROFIT_MULTIPLIER) * 0.5),
							};

							logger.info("Lower limit increased to : %f", track_info.lower_price_limit);
							logger.info("Higher limit increased to : %f", track_info.higher_price_limit);
						}
						else if(current_price <= lower_price_limit || current_price >= buy_info.price * TAKE_PROFIT_MULTIPLIER) {
							binance_api.spot_market_sell(symbol, current_price, quantity, test,
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
function start_future_trade(symbol, interval, tick_round, filters={}, logger, test=true) {
	logger.warn("Future trading is not implemented");
};

function run(test=true) {
	if(!test) {
		global_logger.info("Authenticating to Binance...");
		binance_api.authenticate_user();
	}
	
	global_logger.info("Fetching exchange info from Binance...");
	binance_api.fetch_exchange_info().then(
		(filters) => {
			global_logger.info("Starting the bot for %s", COIN_PAIR);
	
			const pair_logger = add_logger(COIN_PAIR, LOG_DIR);
	
			if(TRADE_TYPE == trade_type.SPOT) {
				start_spot_trade(COIN_PAIR, CANDLE_INTERVAL, TICK_ROUND, filters[COIN_PAIR], pair_logger, test);
			} else if(TRADE_TYPE == trade_type.FUTURE) {
				start_future_trade(COIN_PAIR, CANDLE_INTERVAL, TICK_ROUND, filters[COIN_PAIR], pair_logger, test);
			}
		},
		(error) => {
			global_logger.error(error);
		}
	).catch((error) => {
		global_logger.error(error);
	});
}

if(SESSION_TYPE == session_type.BACKTEST) backtest(COIN_PAIR, CANDLE_INTERVAL, TAKE_PROFIT_MULTIPLIER, PROFIT_MULTIPLIER, STOP_LOSS_MULTIPLIER);
else if(SESSION_TYPE == session_type.LIVETEST) run(true);
else if(SESSION_TYPE == session_type.TRADE) run(false);
