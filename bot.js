const binance_api = require('./api/binance_api');
const indicators = require('./indicators')

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

const TRADING_CURRENCY = "USDT";
const COIN_PAIR = process.argv[2]?.toString() || "BANDUSDT";
const CANDLE_INTERVAL = process.argv[3]?.toString() || "15m";

const BALANCE_LIMIT = 15;
const PROFIT_MULTIPLIER = 1.01;
const STOP_LOSS_MULTIPLIER = 0.99;

// Add latest candle to the list
function add_candle(candles, latest_candle) {
	candles.opening.values.shift();
	candles.opening.times.shift();
	candles.closing.values.shift();
	candles.closing.times.shift();
	
	candles.opening.values.push(Number(latest_candle.open));
	candles.opening.times.push(latest_candle.startTime);
	candles.closing.values.push(Number(latest_candle.close));
	candles.closing.times.push(latest_candle.closeTime);
}

// Start spot trading
async function start_spot_trade(symbol, interval, minimums={}) {
	console.log("Fetching candles for symbol", symbol, "and interval", interval, "\n");

	const candles = await binance_api.fetch_candles(symbol, interval);

	let current_state = bot_state.SEARCHING;
	let total_profit = 0;
	let buy_info = null;
	let track_info = null;
	
	binance_api.ws_candles(symbol, interval,
		async (tick) => {
			const current_price = Number(tick.close) || 0;

			if(current_state == bot_state.SEARCHING && tick.isFinal) {
				// Update candles and search for opportunity when candle is finished
				add_candle(candles, tick);
				
				const signal = indicators.ema_scalper(candles.opening.values, candles.closing.values);

				if(signal) {			
					// Buy from market
					const { calculated_price, calculated_quantity } = await binance_api.calculate_buy_quantity(symbol, TRADING_CURRENCY, BALANCE_LIMIT, SESSION_TYPE == session_type.TEST)
					
					const time = new Date(tick.eventTime);
					console.log("Time :", time.toLocaleTimeString());

					binance_api.spot_market_buy(COIN_PAIR, calculated_price, calculated_quantity, SESSION_TYPE == session_type.TEST, 
						(price, quantity) => {
							// onSuccess
							buy_info = {
								price: price ,
								quantity: quantity
							};

							console.log("Bought", symbol, "-> price :", buy_info.price, "and quantity :", buy_info.quantity, "\n");

							// Reset variables before state transition
							track_info = null;
							current_state = bot_state.TRADING;
						}, 
						(error) => {
							// onError
							console.log("Error occured during market buy :", error.body);
						}
					);
				}
			} else if(current_state == bot_state.TRADING && buy_info?.price && buy_info?.quantity) {
				// Track for the price
				const lower_price_limit = track_info?.lower_price_limit || (buy_info?.price || current_price) * STOP_LOSS_MULTIPLIER; 
				const higher_price_limit = track_info?.higher_price_limit || (buy_info?.price || current_price) * PROFIT_MULTIPLIER;
				const quantity = buy_info?.quantity || 0 ;
				
				if(current_price >= higher_price_limit) {
					track_info = {
						lower_price_limit : current_price * STOP_LOSS_MULTIPLIER ,
						higher_price_limit : current_price * PROFIT_MULTIPLIER ,
					};

					const time = new Date(tick.eventTime);
					console.log("Time :", time.toLocaleTimeString());

					console.log("Changing lower limit to :", track_info.lower_price_limit, "\n");
					console.log("Changing higher limit to :", track_info.higher_price_limit, "\n");
				} else if(current_price <= lower_price_limit) {
					const time = new Date(tick.eventTime);
					console.log("Time :", time.toLocaleTimeString());

					binance_api.spot_market_sell(COIN_PAIR, current_price, quantity, SESSION_TYPE == session_type.TEST,
						(price, quantity) => {
							// onSuccess
							track_info = { 
								sell_price : price,
								sell_quantity : quantity 
							};
	
							console.log("Sold", symbol, "-> price :", track_info.sell_price, "and quantity :", track_info.sell_quantity, "\n");
							
							const profit = track_info.sell_price * track_info.sell_quantity - buy_info.price * buy_info.quantity;
							console.log("Profit is :", profit, "\n");
	
							total_profit += profit;
							console.log("Total profit is :", total_profit, "\n");
							
							// Reset variables before state transition
							buy_info = null;
							track_info = null;
							current_state = bot_state.SEARCHING;
						},
						(error) => {
							// onError
							console.log("Error occured during market sell :", error.body);
						}
					);
				}
			}
		}
	);
};

// Start future trading
async function start_future_trade(symbol, interval, minimums={}) {
	console.log("Future trading is not implemented!\n");
};

async function main() {
	binance_api.authenticate(SESSION_TYPE == session_type.TEST);
	const minimums = await binance_api.fetch_exchange_info();

	if(TRADE_TYPE == trade_type.SPOT) {
		start_spot_trade(COIN_PAIR, CANDLE_INTERVAL, minimums);
	} else if(TRADE_TYPE == trade_type.FUTURE) {
		start_future_trade(COIN_PAIR, CANDLE_INTERVAL, minimums);
	}	
}

main();