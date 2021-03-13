const BinanceServer = require('binance-api-node').default;
const BinanceTrader = require('node-binance-api');

const { EMA } = require('technicalindicators');

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
	APISECRET: BINANCE_API_KEY.api_secret,
});

const binanceTrader = new BinanceTrader().options({
	APIKEY: BINANCE_API_KEY.api_key,
	apiKey: BINANCE_API_KEY.api_secret
});

const COIN_PAIR = process.argv[2]?.toString() || "BANDUSDT";
const CANDLE_INTERVAL = process.argv[3]?.toString() || "15m";
const TRADING_CURRENCY = 'USDT';
const PROFIT_MULTIPLIER = 1.01;
const STOP_LOSS_MULTIPLIER = 0.99;

// PROTOTYPE FUNCTIONS
if (!Array.prototype.last){
    Array.prototype.last = function(){
        return this[this.length - 1];
    };
};

if (!Array.prototype.subtract){
    Array.prototype.subtract = function(other_array){
        const result = [];

		for(let i = 0; i < this.length; ++i){
			result[i] = this[i] - other_array[i];
		};

		return result;
		
    };
};

// FUNCTIONS

// Pauses execution for a specified amount of time
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Synchronizes with the Binance API server
const sync = async () => {
	console.log('WAITING FOR', CANDLE_INTERVAL, '...');
	await wait(WAITING_TIME_MS); // Waits 1s more to make sure the prices were updated
	console.log('WAITING IS FINISHED !');
}

// Adjust the input for the EMA calculation
const fetch_initial_candles = async (symbol, interval) => {	
	let candles = [];
	try {
		candles = await binanceServer.candles({
			symbol: symbol,
			interval: interval,
		});
	} catch (e) {
		console.error('Error fetching the initial candles : ', e);
		return null;
	}

	const newCandles = {
		opening : {
			values: [],
			times: [],
		},
		closing : {
			values: [],
			times: [],
		},
	}

	// const start = candles.length > limit ? candles.length - limit : 0;
	const start = 0;

	for(let i = start; i < candles.length; ++i) {
		newCandles.opening.values[i - start] = Number(candles[i].open);
		newCandles.opening.times[i - start] = candles[i].openTime;

		newCandles.closing.values[i - start] = Number(candles[i].close);
		newCandles.closing.times[i - start] = candles[i].closeTime;
	}

	return newCandles;
}

// Calculate ema1 and ema2
const calculateEMAs = (openingPrices, closingPrices) => {
	const ema1 = EMA.calculate({period: 13, values: closingPrices});
	const ema2 = EMA.calculate({period: 21, values: openingPrices});

	return {
		ema1 : ema1.last(),
		ema2 : ema2.last()
	}
}

// Calculates how much of the asset(coin) the program can buy.
async function calculate_buy_quantity(symbol, trading_currency="USDT", test=true) {
	console.log('CALCULATING BUY QUANTITY...');

	let buying_balance = 20;
	if(!test) {
		const accountInfo = await binanceServer.accountInfo();
		const free_balance = parseFloat(accountInfo.balances.find(b => b.asset === trading_currency).free);
		buying_balance = free_balance > buying_balance ? buying_balance : free_balance;
	}
	
	const prices = await binanceServer.prices();
	const coin_price = parseFloat(prices[symbol]);
	
	const quantity = buying_balance / coin_price; 

	return { 
		expected_quantity: quantity.toFixed(2),
		expected_price : coin_price.toFixed(6)
	};
}

// Add latest candle to the list
const add_candle = (candles, latest_candle) => {
	candles.opening.values.shift();
	candles.opening.times.shift();
	candles.closing.values.shift();
	candles.closing.times.shift();
	
	candles.opening.values.push(Number(latest_candle.open));
	candles.opening.times.push(latest_candle.startTime);
	candles.closing.values.push(Number(latest_candle.close));
	candles.closing.times.push(latest_candle.closeTime);
}

// Spot market buy
async function spot_market_buy(symbol, trading_currency="USDT", test=true) {
	const { expected_quantity, expected_price } = await calculate_buy_quantity(symbol, trading_currency, test);

	let buy_info = {
		quantity: expected_quantity,
		price: expected_price
	};

	if(!test) {
		binanceTrader.marketBuy(symbol, expected_quantity, async (error, response) => {
			if(error) {
				console.log("Error occured during Market Buy", error.body);
				buy_info = null;
			} else if(response) {
				// Sample response
				// {
				// 	symbol: 'OCEANUSDT',
				// 	orderId: 812125125941,
				// 	orderListId: -1,
				// 	clientOrderId: 'ag8ashgkashash88128IKHJS',
				// 	transactTime: 82196816816,
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
				// 		tradeId: 86138128
				// 	  }
				// 	]
				// }

				const { 
					price: buying_price,
					qty: buying_quantity,
				} = response.fills[0];

				const actual_buying_price = buying_price || expected_price ;
				const actual_quantity = buying_quantity || expected_quantity ;

				buy_info = {
					quantity: actual_quantity,
					price: actual_buying_price
				};
			}
		});
	}

	return buy_info;
}

// Track price for spot trading
function track_spot_price(symbol, quantity, current_price, lower_selling_price, higher_selling_price, test=true){
	let track_info = {
		lower_selling_price : lower_selling_price ,
		higher_selling_price : higher_selling_price
	};

	if(current_price >= higher_selling_price) {
		console.log("Price exceeded the higher limit");

		track_info = {
			lower_selling_price : higher_selling_price ,
			higher_selling_price : current_price * PROFIT_MULTIPLIER ,
		};
		
		console.log("Increasing lower limit from", lower_selling_price, "to :", track_info.lower_selling_price);
		console.log("Increasing higher limit from", higher_selling_price, "to :", track_info.higher_selling_price);
	} else if(current_price <= lower_selling_price) {
		if(test) {
			track_info = { 
				sell_price : current_price,
				sell_quantity : quantity 
			};
		} else {
			binanceTrader.marketSell(symbol, quantity, (error, response) => {
				if(error) {
					console.log("Error occured during Market Sell", error.body);
				} else if(response) {
					// Sample response ( It is not updated! Try it)
					// {
					// 	symbol: 'OCEANUSDT',
					// 	orderId: 812125125941,
					// 	orderListId: -1,
					// 	clientOrderId: 'ag8ashgkashash88128IKHJS',
					// 	transactTime: 82196816816,
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
					// 		tradeId: 86138128
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

// Future market buy
async function future_market_buy(symbol, trading_currency="USDT", test=true) {
	if(test) {
		console.log("Future testing is not implemented");
	} else {
		console.log("Future trading is not implemented!");
	}
}

// Track price for future trading
function track_future_price(symbol, quantity, current_price, lower_selling_price, higher_selling_price, test=true) {
	if(test) {
		console.log("Future testing is not implemented");
	} else {
		console.log("Future trading is not implemented!");
	}
}

// Main function, entrance point for the program
async function start(symbol, interval) {
	console.log("Fetching initial candles for", symbol);
	const candles = await fetch_initial_candles(symbol, interval);

	let current_state = bot_state.SEARCHING;
	let total_profit = 0;

	// trading variables
	let buy_info = null;
	let track_info = null;
	
	// searching variables
	let prev_emas = {ema1: 0, ema2: 0};
	let curr_emas = {ema1: 0, ema2: 0};
	
	prev_emas = calculateEMAs(candles.opening.values, candles.closing.values);

	binanceServer.ws.candles(symbol, interval, async (tick) => {
		if(current_state == bot_state.SEARCHING) {
			// Search for opportunity
			const openingPrices = candles.opening.values.concat(tick.open);
			const closingPrices = candles.closing.values.concat(tick.close);
			openingPrices.shift();
			closingPrices.shift();
	
			curr_emas = calculateEMAs(openingPrices, closingPrices);
			// console.log("ema1: ", curr_emas.ema1, ", ema2:", curr_emas.ema2);
	
			if(prev_emas.ema2 > prev_emas.ema1 && curr_emas.ema2 <= curr_emas.ema1) {
				const time = new Date(tick.eventTime);
				console.log("Start trading for", symbol, "at", time.toLocaleTimeString());
				
				// Buy from market
				if(TRADE_TYPE == trade_type.SPOT) {
					buy_info = await spot_market_buy(COIN_PAIR, TRADING_CURRENCY, true);	
				} else if(TRADE_TYPE == trade_type.FUTURE) {
					buy_info = await future_market_buy(COIN_PAIR, TRADING_CURRENCY, true);
				}

				if(buy_info && buy_info.price) {
					current_state = bot_state.TRADING;
					console.log("Bought", symbol, "at price:", buy_info.price);	
				}
			}
	
			if(tick.isFinal) {
				add_candle(candles, tick);
				prev_emas = curr_emas;
			}
			
		} else if(buy_info && buy_info.price && buy_info.quantity && current_state == bot_state.TRADING) {
			const current_price = tick.close;
			console.log("Price of the", symbol, ":", current_price);

			// Track for the price
			if(TRADE_TYPE == trade_type.SPOT) {
				const lower_selling_price = (track_info && track_info.lower_selling_price) || (buy_info && buy_info.price * STOP_LOSS_MULTIPLIER); 
				const higher_selling_price = (track_info && track_info.higher_selling_price) || (buy_info && buy_info.price * PROFIT_MULTIPLIER);
				const quantity = (buy_info && buy_info.quantity) || 0 ;

				track_info = track_spot_price(COIN_PAIR, quantity, current_price, lower_selling_price, higher_selling_price, true);
				
				if(track_info && track_info.sell_price && track_info.sell_quantity) {
					console.log("Sold", symbol, ", quantity :", track_info.sell_quantity, ", price :", track_info.sell_price);
					
					const profit = track_info.sell_price * track_info.sell_quantity - buy_info.price * buy_info.quantity;
					console.log("Profit is :", profit);

					total_profit += profit;
					console.log("Total profit is :", total_profit);
				} 
					
				if(!track_info || (track_info.sell_price && track_info.sell_quantity)) {
					// If sold or tracking is failed, reset to searching
					buy_info = null;
					track_info = null;
					current_state = bot_state.SEARCHING;
				}
				
			} else if(TRADE_TYPE == trade_type.FUTURE) {
				track_future_price(COIN_PAIR, buy_info.quantity, current_price, lower_selling_price, higher_selling_price, true);
			}
		}
	});
};

start(COIN_PAIR, CANDLE_INTERVAL);