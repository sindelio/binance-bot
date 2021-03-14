// ************* Functions for Binance API *******************
const BinanceServer = require('binance-api-node').default;
const BinanceTrader = require('node-binance-api');

let binanceServer = BinanceServer({ 
	apiKey: "test",
	apiSecret: "test",
});

let binanceTrader = new BinanceTrader().options({
	APIKEY: "test",
	APISECRET: "test"
});

exports.authenticate = (test=true) => {
	if(!test) {
		const BINANCE_API_KEY = require("./binance_secrets.json");

		binanceServer = BinanceServer({ 
			apiKey: BINANCE_API_KEY.api_key,
			apiSecret: BINANCE_API_KEY.api_secret,
		});
		
		binanceTrader = new BinanceTrader().options({
			APIKEY: BINANCE_API_KEY.api_key,
			APISECRET: BINANCE_API_KEY.api_secret
		});
	}
}

exports.fetch_exchange_info = async () => {
	// This function is based on https://github.com/jsappme/node-binance-trader/blob/master/src/trader.js

	return new Promise((resolve, reject) => {
		binanceTrader.exchangeInfo((error, response) => {
			if (error) {
				console.log(error);
				return reject(error);
			} else {
				let minimums = {};

				for (let obj of response.symbols) {
					let filters = { status: obj.status }
					for (let filter of obj.filters) {
						if (filter.filterType == "MIN_NOTIONAL") {
							filters.minNotional = filter.minNotional
						} else if (filter.filterType == "PRICE_FILTER") {
							filters.minPrice = filter.minPrice
							filters.maxPrice = filter.maxPrice
							filters.tickSize = filter.tickSize
						} else if (filter.filterType == "LOT_SIZE") {
							filters.stepSize = filter.stepSize
							filters.minQty = filter.minQty
							filters.maxQty = filter.maxQty
						}
					}
					
					filters.orderTypes = obj.orderTypes;
					filters.icebergAllowed = obj.icebergAllowed;
					minimums[obj.symbol] = filters;
				}
		
				return resolve(minimums);
			}
			
		})
	});
}

// Adjust the candles format for the indicators
exports.fetch_candles = async (symbol, interval) => {
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

	const new_candles = {
		opening : {
			values: [],
			times: [],
		},
		closing : {
			values: [],
			times: [],
		},
	}
	
	for(let i = 0; i < candles.length - 1; ++i) {
		new_candles.opening.values[i] = Number(candles[i].open);
		new_candles.opening.times[i] = candles[i].openTime;

		new_candles.closing.values[i] = Number(candles[i].close);
		new_candles.closing.times[i] = candles[i].closeTime;
	}

	return new_candles;
}

// Calculates how much of the asset(coin) the user's balance can buy within the balance limit.
exports.calculate_buy_quantity = async (symbol, trading_currency="USDT", balance_limit=15, test=true) => {
	let buying_balance = balance_limit;
	if(!test) {
		const accountInfo = await binanceServer.accountInfo();
		const free_balance = parseFloat(accountInfo.balances.find(b => b.asset === trading_currency).free);
		buying_balance = free_balance > balance_limit ? balance_limit : free_balance;
	}
	
	const prices = await binanceServer.prices();
	const coin_price = parseFloat(prices[symbol]);ß
	
	const quantity = buying_balance / coin_price; 

	return {
		price : coin_price.toFixed(6),
		quantity : quantity.toFixed(2),
	};
}

// Spot market buy
exports.spot_market_buy = (symbol, price, quantity, test=true, onSuccess, onError) => {
	if(test) {
		onSuccess(price, quantity);
	} else {
		binanceTrader.marketBuy(symbol, expected_quantity, (error, response) => {
			if(error) {
				onError(error);
			} else if(response) {
				// Sample response
				// {
				// 	symbol: 'OCEANUSDT',
				// 	orderId: 1,
				// 	orderListId: -1,
				// 	clientOrderId: 'asg7asg9ag9',
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

				const actual_buying_price = response.fills[0]?.price || price ;
				const actual_quantity = response.fills[0]?.qty || quantity ;

				onSuccess(actual_buying_price, actual_quantity);
			}
		});
	}
}