const BinanceServer = require('binance-api-node').default;
const BinanceTrader = require('node-binance-api');

const { EMA } = require('technicalindicators');

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

const COIN_PAIR = 'BANDUSDT';
const CANDLE_INTERVAL = '15m';
const TRADING_CURRENCY = 'USDT';

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
	console.log('FETCHING INITIAL CANDLES...');
	
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
const calculateBuyQuantity = async (symbol, trading_currency="USDT", test=true) => {
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

// Add lastest candle to the list
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

// Track price for spot trading
const track_spot_price = async (symbol, {stop_loss_order_id, stop_price, quantity, buying_price}, test=true) => {
	const expected_profit_amount = buying_price * 0.1;
	
	let higher_selling_price = buying_price + expected_profit_amount;
	let current_price = buying_price;
	let selling_price = stop_price;

	let sold = false;

	while(!sold) {
		const prices = await binanceServer.prices();
		current_price = parseFloat(prices[symbol]);
		console.log("Price of the : ", symbol, " : ", current_price);
		
		if(current_price >= higher_selling_price) {
			selling_price = higher_selling_price;
			higher_selling_price += expected_profit;

		} else if(current_price <= selling_price) {
			selling_price = current_price;
			
			if(test) {
				console.log("SOLD ", symbol, " QUANTITY : ", quantity, " PRICE : ", selling_price);
				sold = true;
			} else {
				binanceTrader.marketSell(symbol, quantity, (error, response) => {
					if(error) {
						console.log("Error occured during Market Sell", error.body);
					} else if(response) {	
						// SAMPLE RESPONSE ?
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

						console.log("SOLD ", symbol, " QUANTITY : ", quantity, " PRICE : ", selling_price);

						sold = true;
					}
				});
			}
		}
	}

	const profit = selling_price - buying_price;
	console.log("PROFIT is: ", profit);

	return profit;
} 

// Start spot trading
const spot_trade = async (symbol, trading_currency="USDT", test=true) => {
	const { expected_quantity, expected_price} = await calculateBuyQuantity(symbol, trading_currency, test);
	let profit = 0;

	if(test) {
		console.log("BOUGHT ", symbol, "AT PRICE : ", expected_price);

		const stop_price = expected_price * 0.99;
		const trade_info = {
			stop_loss_order_id: 5,
			stop_price: stop_price,
			quantity: expected_quantity,
			buying_price: expected_price
		};

		profit = track_spot_price(symbol, trade_info, test);
	} else {
		// MARKET BUY
		binanceTrader.marketBuy(symbol, expected_quantity, (error, response) => {
			if(error) {
				console.log("Error occured during Market Buy", error.body);
			} else if(response) {
				// SAMPLE RESPONSE
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

				const stop_price = actual_buying_price * 0.99;
				const trade_info = {
					stop_loss_order_id: 5,
					stop_price: stop_price,
					quantity: actual_quantity,
					buying_price: actual_buying_price
				};

				profit = track_spot_price(symbol, trade_info, test);
			}
		});
	}

	return profit;
}

// Start future trading
const future_trade = async (symbol, trading_currency="USDT") => {
	if(SESSION_TYPE == session_type.TEST) {
		console.log("Future testing is not implemented");
	} else {
		console.log("Future trading is not implemented!");
	}
	
}

// Main function, entrance point for the program
const start = async (symbol, interval) => {
	const candles = await fetch_initial_candles(symbol, interval);

	let total_profit = 0;
	let prev_emas = {ema1: 0, ema2: 0};
	let curr_emas = {ema1: 0, ema2: 0};
	
	prev_emas = calculateEMAs(candles.opening.values, candles.closing.values);

	let trade_profit = 0;
	if(TRADE_TYPE == trade_type.SPOT) {
		trade_profit = await spot_trade(COIN_PAIR, TRADING_CURRENCY, true);			
	} else if(TRADE_TYPE == trade_type.FUTURE) {
		trade_profit = await future_trade(COIN_PAIR, TRADING_CURRENCY, true);
	}

	binanceServer.ws.candles(symbol, interval, tick => {
		const openingPrices = candles.opening.values.concat(tick.open);
		const closingPrices = candles.closing.values.concat(tick.close);
		openingPrices.shift();
		closingPrices.shift();

		curr_emas = calculateEMAs(openingPrices, closingPrices);
		console.log("CURRENT EMA1 : ", curr_emas.ema1, "EMA2", curr_emas.ema2);

		if(prev_emas.ema2 > prev_emas.ema1 && curr_emas.ema2 <= curr_emas.ema1) {
			const time = new Date(tick.eventTime);
			console.log("START TRADING FOR ", symbol, " AT ", time.toLocaleTimeString());
			
			// START TRADING
			let trade_profit = 0;
			if(TRADE_TYPE == trade_type.SPOT) {
				trade_profit = await spot_trade(COIN_PAIR, TRADING_CURRENCY, true);			
			} else if(TRADE_TYPE == trade_type.FUTURE) {
				trade_profit = await future_trade(COIN_PAIR, TRADING_CURRENCY, true);
			}
			console.log("PROFIT FROM THE TRADE IS : ", trade_profit);

			total_profit += trade_profit;
			console.log("TOTAL PROFIT IS : ", total_profit);
		}

		if(tick.isFinal) {
			add_candle(candles, tick);
			prev_emas = curr_emas;
		}
	});
};

start(COIN_PAIR, CANDLE_INTERVAL);