const BinanceServer = require('binance-api-node').default;
const BinanceTrader = require('node-binance-api');

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


let BINANCE_API_KEY = {
    api_key: "test",
    api_secret: "test"
}

if(SESSION_TYPE == session_type.TRADE) {
	BINANCE_API_KEY = require("./binance_secrets.json");
} 

// Creates the API caller/requester as an authenticated client, which can make signed calls

const binanceServer = BinanceServer({ 
	apiKey: BINANCE_API_KEY.api_key,
	apiSecret: BINANCE_API_KEY.api_secret,
});

const binanceTrader = new BinanceTrader().options({
	APIKEY: BINANCE_API_KEY.api_key,
	APISECRET: BINANCE_API_KEY.api_secret
});

const COIN_PAIR = process.argv[2]?.toString() || "BANDUSDT";
const CANDLE_INTERVAL = process.argv[3]?.toString() || "15m";
const BALANCE_LIMIT = 15;
const TRADING_CURRENCY = 'USDT';
const PROFIT_MULTIPLIER = 1.01;
const STOP_LOSS_MULTIPLIER = 0.99;

// Pauses execution for a specified amount of time
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

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

// Track price for spot trading
function track_spot_price(symbol, quantity, current_price, lower_selling_price, higher_selling_price, test=true){
	let track_info = {
		lower_selling_price : lower_selling_price ,
		higher_selling_price : higher_selling_price
	};

	if(current_price >= higher_selling_price) {
		console.log("Price exceeded the higher limit\n");

		track_info = {
			lower_selling_price : current_price * STOP_LOSS_MULTIPLIER ,
			higher_selling_price : current_price * PROFIT_MULTIPLIER ,
		};
		
		console.log("Increasing lower limit from", lower_selling_price, "to :", track_info.lower_selling_price, "\n");
		console.log("Increasing higher limit from", higher_selling_price, "to :", track_info.higher_selling_price, "\n");
	} else if(current_price <= lower_selling_price) {
		if(test) {
			track_info = { 
				sell_price : current_price,
				sell_quantity : quantity 
			};
		} else {
			binanceTrader.marketSell(symbol, quantity, (error, response) => {
				if(error) {
					console.log("Error occured during Market Sell", error.body, "\n");
				} else if(response) {
					// Sample response ( It is not updated! Try it)
					// {
					// 	symbol: 'OCEANUSDT',
					// 	orderId: 1,
					// 	orderListId: -1,
					// 	clientOrderId: 'as521agags',
					// 	transactTime: 1,
					// 	price: '0.00000000',
					// 	origQty: '8.00000000',
					// 	executedQty: '8.00000000',
					// 	cummulativeQuoteQty: '10.69200000',
					// 	status: 'FILLED',
					// 	timeInForce: 'GTC',
					// 	type: 'MARKET',
					// 	side: 'BUY',
					// 	fills: [
					// 	  {
					// 		price: '1.33650000',
					// 		qty: '8.00000000',
					// 		commission: '0.00800000',
					// 		commissionAsset: 'OCEAN',
					// 		tradeId: 1
					// 	  }
					// 	]
					// }

					// const { 
					// 	price: selling_price,
					// 	qty: selling_quantity,
					// } = response.fills[0];

					track_info = { 
						sell_price : current_price,
						sell_quantity : quantity 
					};
				}
			});
		}
	}

	return track_info;
} 

// Start spot trading
async function start_spot_trade(symbol, interval, minimums={}) {
	console.log("Fetching initial candles for symbol", symbol, "and interval", interval, "\n");

	const candles = await binance_api.fetch_candles(symbol, interval);

	let current_state = bot_state.SEARCHING;
	let total_profit = 0;
	let buy_info = null;
	let track_info = null;
	
	binanceServer.ws.candles(symbol, interval, async (tick) => {
		if(current_state == bot_state.SEARCHING && tick.isFinal) {
			// Update candles and search for opportunity when candle is finished
			add_candle(candles, tick);
			
			const signal = indicators.ema_scalper(candles);

			if(signal) {	
				const time = new Date(tick.eventTime);
				console.log("Start trading for", symbol, "at", time.toLocaleTimeString(), "\n");
				
				// Buy from market
				console.log("Calculating buying quantity for", symbol);
				const { calculated_price, calculated_quantity } = await binance_api.calculate_buy_quantity(symbol, TRADING_CURRENCY, BALANCE_LIMIT, SESSION_TYPE == session_type.TEST)

				binance_api.spot_market_buy(COIN_PAIR, calculated_price, calculated_quantity, SESSION_TYPE == session_type.TEST, (price, quantity) => {
					buy_info = {
						price: price ,
						quantity: quantity
					};

					current_state = bot_state.TRADING;
					console.log("Bought", symbol, "-> price :", buy_info.price, ", quantity :", buy_info.quantity, "\n");

				}, (error) => {
					console.log("Error occured during market buy", error.body);
				});
			}
		} else if(buy_info && buy_info.price && buy_info.quantity && current_state == bot_state.TRADING) {
			const current_price = tick.close;
			console.log("Price of the", symbol, ":", current_price, "\n");

			// Track for the price
			const lower_selling_price = (track_info && track_info.lower_selling_price) || (buy_info && buy_info.price * STOP_LOSS_MULTIPLIER); 
			const higher_selling_price = (track_info && track_info.higher_selling_price) || (buy_info && buy_info.price * PROFIT_MULTIPLIER);
			const quantity = (buy_info && buy_info.quantity) || 0 ;

			track_info = track_spot_price(COIN_PAIR, quantity, current_price, lower_selling_price, higher_selling_price, true);
			
			if(track_info && track_info.sell_price && track_info.sell_quantity) {
				console.log("Sold", symbol, ", quantity :", track_info.sell_quantity, ", price :", track_info.sell_price, "\n");
				
				const profit = track_info.sell_price * track_info.sell_quantity - buy_info.price * buy_info.quantity;
				console.log("Profit is :", profit, "\n");

				total_profit += profit;
				console.log("Total profit is :", total_profit, "\n");
			} 
				
			if(!track_info || (track_info.sell_price && track_info.sell_quantity)) {
				// If sold or tracking is failed, reset to searching state
				buy_info = null;
				track_info = null;
				current_state = bot_state.SEARCHING;
			}
		}
	});
};

// Start future trading
async function start_future_trade(symbol, interval, minimums={}) {
	if(test) {
		console.log("Future testing is not implemented!\n");
	} else {
		console.log("Future trading is not implemented!\n");
	}
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