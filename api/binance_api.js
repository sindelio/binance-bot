// ************* Functions for Binance API ******************* 
const Binance = require('node-binance-api');

let binance_client = new Binance().options({
	APIKEY: "test",
	APISECRET: "test"
});

exports.authenticate = (test=true) => {
	if(!test) {
		const BINANCE_API_KEY = require("./binance_secrets.json");

		binance_client = new Binance().options({
			APIKEY: BINANCE_API_KEY.api_key,
			APISECRET: BINANCE_API_KEY.api_secret
		});
	}
}

exports.fetch_exchange_info = async () => {
	// This function is based on https://github.com/jsappme/node-binance-trader/blob/master/src/trader.js

	return new Promise((resolve, reject) => {
		binance_client.exchangeInfo((error, response) => {
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
		open_prices : [],
		close_prices : [],
		times : []
	}
	
	for(let i = 0; i < candles.length - 1; ++i) {
		new_candles.open_prices[i] = Number(candles[i].open);
		new_candles.close_prices[i] = Number(candles[i].close);
		new_candles.times[i] = candles[i].closeTime;
	}

	return new_candles;
}

exports.ws_candles = (symbol, interval, onUpdate) => {
	binance_client.websockets.candlesticks(symbol, interval, onUpdate);
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
	const coin_price = parseFloat(prices[symbol]);
	
	const quantity = buying_balance / coin_price; 

	return {
		calculated_price : coin_price,
		calculated_quantity : quantity,
	};
}

// Spot market buy
exports.spot_market_buy = (symbol, price, quantity, test=true, onSuccess, onError) => {
	if(test) {
		onSuccess(price, quantity);
	} else {
		binance_client.marketBuy(symbol, quantity, (error, response) => {
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

// Spot market sell
exports.spot_market_sell = (symbol, price, quantity, test=true, onSuccess, onError) => {
	if(test) {
		onSuccess(price, quantity);
	} else {
		binance_client.marketSell(symbol, quantity, (error, response) => {
			if(error) {
				onError(error);
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

				onSuccess(price, quantity);
			}
		});
	}
} 