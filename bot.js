const { backtest } = require('./backtest');
const binance_api = require('./binance_api');
const indicators = require('./indicators')
const { global_logger, add_logger, get_logger } = require('./logger')
const { Tracker } = require('./tracker')

const trade_type = {
	SPOT: "spot",
	FUTURE: "future",
}

const session_type = {
	BACKTEST: "backtest",
	LIVETEST: "livetest",
	TRADE: "trade",
}

const SESSION_TYPE = session_type.LIVETEST;
const TRADE_TYPE = trade_type.SPOT;

const LOG_DIR = "logs/tracker";

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
function start_spot_trade(symbol, interval, tick_round, filters={}, logger, tracker, indicator, test=true) {
	logger.info("Fetching candles for interval %s", interval);
	
	binance_api.fetch_candles(symbol, interval).then(
		(candles) => {
			logger.info("Subscribing to pair : %s", symbol);
			
			let wait_for_next_candle = false;
			let tick_sum = tick_count = 0;

			tracker.start();

			binance_api.listen_candles_stream(symbol, interval, 
				(open, close, event_time, isFinal) => {
					const current_price = Number.parseFloat(close);
		
					tick_count += 1;
					tick_sum += current_price;

					if(!wait_for_next_candle && tick_count >= tick_round) {
						// Search for opportunity when average is calculated
						const tick_average = tick_sum / tick_count;
		
						const open_prices = candles.open_prices.concat(open).slice(1);
						const close_prices = candles.close_prices.concat(tick_average).slice(1);					

						const buy_signal = indicator(open_prices, close_prices, filters.price_digit);
						
						if(buy_signal) {
							// Buy from market
							binance_api.calculate_buy_quantity(symbol, TRADING_CURRENCY, BALANCE_LIMIT, filters, test).then(
								({price, quantity}) => {
									binance_api.spot_market_buy(symbol, price, quantity, test, 
										(price, quantity) => {
											// onSuccess
											logger.info("Market Buy - price : %f , quantity : %f", price, quantity);

											// Add to track list for selling later
											tracker.add(price, quantity);

											// Wait for next candle to start
											wait_for_next_candle = true;
										}, 
										(error) => {
											// onError
											logger.error("Error occured during Market Buy : %s", error);
										}
									);
								},
								(error) => {
									logger.error(error);
							}).catch((error) => {
								logger.error(error);
							});
						}
					}
		
					if(isFinal) {
						add_candle(candles, {open, close, event_time})
						wait_for_next_candle = false;
						tick_sum = tick_count = 0;
					}
					if(tick_count >= tick_round) tick_sum = tick_count = 0;
				},
				() => {
					global_logger.info("Websocket opened/reconnected !");
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
			global_logger.info("Starting the bot for %s...", COIN_PAIR);
	
			const pair_logger = add_logger(COIN_PAIR, LOG_DIR);
			const tracker = new Tracker(COIN_PAIR, STOP_LOSS_MULTIPLIER, PROFIT_MULTIPLIER, TAKE_PROFIT_MULTIPLIER, pair_logger);
			const indicator = (open_prices, close_prices, price_digit) => {
				const sma_indicator = indicators.sma_scalper_6_12(close_prices, price_digit, pair_logger.info);
				const ema_indicator = indicators.ema_scalper_13_21(open_prices, close_prices, price_digit, pair_logger.info);

				return sma_indicator || ema_indicator;
			}
			
			if(TRADE_TYPE == trade_type.SPOT) {
				start_spot_trade(COIN_PAIR, CANDLE_INTERVAL, TICK_ROUND, filters[COIN_PAIR], pair_logger, tracker, indicator, test);
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
