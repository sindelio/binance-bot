const BinanceServer = require('binance-api-node').default;
const BinanceTrader = require('node-binance-api');

const { EMA } = require('technicalindicators');

// Creates the API caller/requester as an authenticated client, which can make signed calls
const BINANCE_API_KEY = require("./binance_secrets.json");

const binanceServer = BinanceServer({
	apiKey: BINANCE_API_KEY.api_key,
	apiSecret: BINANCE_API_KEY.api_secret,
});

const binanceTrader = new BinanceTrader().options({
	APIKEY: BINANCE_API_KEY.api_key,
	APISECRET: BINANCE_API_KEY.api_secret
});

const COIN_PAIR = 'BANDUSDT';
const CANDLE_INTERVAL = '15m';
const TRADING_CURRENCY = 'USDT';
const WAITING_TIME_MS = 1000 * 60 * 15; // 15 minutes

// VARIABLES - Binance API
let buyOrderInfo = null;
let sellOrderInfo = null;

const INDEX_USDT = 11;
const PRICE_UPDATE_PERIOD = 5000; // Price update times varies a lot
const ORDER_UPDATE_PERIOD = 3000;

const BUY_LIMIT = 5; 

// FUNCTIONS

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

// Pauses execution for a specified amount of time
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Synchronizes with the Binance API server
const sync = async () => {
	console.log('WAITING FOR', CANDLE_INTERVAL, '...');
	await wait(WAITING_TIME_MS); // Waits 1s more to make sure the prices were updated
	console.log('WAITING IS FINISHED !');
}

// Adjust the input for the EMA calculation
const fetch_initial_candles = async (symbol, interval, limit = 200) => {
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

	const start = candles.length > limit ? candles.length - limit : 0;

	for(let i = start; i < candles.length; ++i) {
		newCandles.opening.values[i - start] = Number(candles[i].open);
		newCandles.opening.times[i - start] = candles[i].openTime;

		newCandles.closing.values[i - start] = Number(candles[i].close);
		newCandles.closing.times[i - start] = candles[i].closeTime;
	}

	return newCandles;
}

const calculateEMADiff = async (openingPrices, closingPrices) => {
	const ema1 = EMA.calculate({period: 13, values: closingPrices});
	const ema2 = EMA.calculate({period: 21, values: openingPrices});

	const result = ema2.last() - ema1.last();

	return result;
}

// Calculates how much of the asset(coin) the program can buy.
const calculateBuyQuantity = async (symbol, trading_currency="USDT") => {
	console.log('CALCULATING BUY QUANTITY...');

	const accountInfo = await binanceServer.accountInfo();
	const prices = await binanceServer.prices();

	const free_balance = parseFloat(accountInfo.balances.find(b => b.asset === trading_currency).free);
	const buying_balance = free_balance > 20 ? 20 : free_balance;
	
	const coin_price = parseFloat(prices[symbol]) - 0.5;
	
	const quantity = buying_balance / coin_price; 

	return { 
		expected_quantity: quantity.toFixed(2),
		expected_price : coin_price.toFixed(6)
	};
}

// Creates a buy order in the Binance API
const makeBuyOrder = async ({quantity, price} = {}) => {
	console.log('MAKING BUY ORDER');
	
	const buyOrderInfo = await binanceServer.order({
		symbol: COIN_PAIR,
		side: 'BUY',
		quantity: quantity.toString(),
    	price: price.toString()
	});

	return buyOrderInfo;
}

// Waits till a buy order is completely filled or times out empty
const waitBuyOrderCompletion = async () => {
	console.log('WAITING BUY ORDER COMPLETION');

	for(let i = 0; i < 5;	i++){
		buyOrderInfo = await client.getOrder({
			symbol: COIN_PAIR,
  			orderId: buyOrderInfo.orderId,
		});

		if(buyOrderInfo.status === 'FILLED'){
			console.log('PURCHASE COMPLETED! \n');
			return 'success';
		}

		await wait(ORDER_UPDATE_PERIOD);
	}
	
	if(buyOrderInfo.status === 'PARTIALLY_FILLED'){

		console.log('PURCHASE PARTIALLY FILLED, CONTINUING');

		while(true){
			buyOrderInfo = await client.getOrder({
				symbol: COIN_PAIR,
				orderId: buyOrderInfo.orderId,
			});

			if(buyOrderInfo.status === 'FILLED'){

				console.log('PURCHASE COMPLETED! \n');
				return 'success';
			}

			await wait(ORDER_UPDATE_PERIOD);
		}
	}

	console.log('PURCHASE TIMED OUT, CANCELLING \n');

	await client.cancelOrder({
		symbol: COIN_PAIR,
  		orderId: buyOrderInfo.orderId,
	});

	return 'failure';
}

// Purchasing mechanism, invokes the 3 functions above as needed
const buy = async () => {
	console.log('BUYING');

	const { buyQuantity, currentPrice } = await calculateBuyQuantity();
	await makeBuyOrder(buyQuantity, currentPrice);

	const buySuccess = await waitBuyOrderCompletion();
	return buySuccess;
}

// Calculates how much profit a sale would incur
const calculateProfit = async () => {
	console.log('CALCULATING PROFIT');
	
	const buyingPrice = buyOrderInfo.price;
	const prices = await client.prices({ symbol: COIN_PAIR });

	const currentPrice = prices.XRPUSDT;
	const profit = ((currentPrice / buyingPrice) - 1) * 100;

	console.log('profit: ', profit, '\n');

	return {
		profit,
		currentPrice
	};
}

// Creates a sell order in the Binance API
const makeSellOrder = async (currentPrice) => {
	console.log('MAKING SELL ORDER');

	sellOrderInfo = await client.order({
		symbol: COIN_PAIR,
		side: 'SELL',
		quantity: buyOrderInfo.executedQty,
		price: currentPrice,
	});

	console.log('sellOrderInfo: ', sellOrderInfo, '\n');
}

// Waits till a sell order is completely filled or times out empty
const waitSellOrderCompletion = async () => {
	console.log('WAITING SELL ORDER COMPLETION');

	for(let i = 0; i < 5; i++){
		sellOrderInfo = await client.getOrder({
			symbol: COIN_PAIR,
			orderId: sellOrderInfo.orderId,
		});

		if(sellOrderInfo.status === 'FILLED'){
			console.log('SALE COMPLETE! \n');
			return 'success';
		}

		await wait(ORDER_UPDATE_PERIOD);
	}

	if(sellOrderInfo.status === 'PARTIALLY_FILLED'){

		console.log('SALE PARTIALLY FILLED, CONTINUING');

		while(true){
			sellOrderInfo = await client.getOrder({
				symbol: COIN_PAIR,
				orderId: sellOrderInfo.orderId,
			});

			if(sellOrderInfo.status === 'FILLED'){
				console.log('SALE COMPLETE! \n');
				return 'success';
			}

			await wait(ORDER_UPDATE_PERIOD);
		}
	}

	console.log('SALE TIMED OUT, CANCELLING \n');

	await client.cancelOrder({
		symbol: COIN_PAIR,
  		orderId: sellOrderInfo.orderId,
	});

	return 'failure';
}

// Selling mechanism, invokes the 3 functions above as needed
const sell = async () => {
	console.log('SELLING');

	while(true){
		const { profit, currentPrice } = await calculateProfit();

		if(profit >= 0.175){
			await makeSellOrder(currentPrice);
			const sellSuccess = await waitSellOrderCompletion();
			if(sellSuccess === 'failure') continue;
			return;
		}

		await wait(PRICE_UPDATE_PERIOD);
	}
}

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

const trade = async (symbol, trading_currency="USDT") => {
	const { expected_quantity, expected_price} = await calculateBuyQuantity(symbol, trading_currency);

	// MARKET BUY
	binanceTrader.marketBuy(symbol, expected_quantity, (error, response) => {
		if(error) {
			console.log("Error occured during Market Buy", error.body);
		} else {
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

			const orderId = response.orderId;
			const { 
				price: buying_price,
				qty: buying_quantity,
			} = response?.fills[0];

			const actual_buying_price = buying_price || expected_price ;
			const actual_quantity = buying_quantity || expected_quantity ;

			const stop_price = actual_buying_price * 0.99;

			// PLACE STOP_LOSS order
			binanceTrader.sell(symbol, actual_quantity, stop_price, {stopPrice: stop_price, type: "STOP_LOSS_LIMIT"}, (error, response) => {
				if (error) {
					console.log("Error occured during stop-loss order", error.body);
				} else {
					// SAMPLE RESPONSE
					// {
					// 	symbol: 'OCEANUSDT',
					// 	orderId: 831212161621,
					// 	orderListId: -1,
					// 	clientOrderId: '43asgsf8s0IwtkQGMsgazM',
					// 	transactTime: 16154252152270
					// }
		
					const orderId = response.orderId;
					console.log("Stop-Loss order response", response);
				}
			});

			// PLACE SELL ORDER AT %1 PROFIT UP FOR HALF QUANTITY
			// TRAIL STOP-LOSS FOR OTHER HALF QUANTITY
		}
	});
}

// Main function, entrance point for the program
const start = async (symbol, interval) => {
	const candles = await fetch_initial_candles(symbol, interval, 400);
	let prev_ema_diff = calculateEMADiff(candles.opening.values, candles.closing.values);

	binanceServer.ws.candles(symbol, interval, tick => {
		const {
			open: open, 
			close: close
		} = tick;

		console.log("FETCHING CURRENT PRICE FOR ", symbol, ": open", tick.open, "close", tick.close);
		const openingPrices = candles.opening.values.concat(open);
		const closingPrices = candles.closing.values.concat(close);
		openingPrices.shift();
		closingPrices.shift();
		const curr_ema_diff = calculateEMADiff(openingPrices, closingPrices);
		
		if(prev_ema_diff > 0 && curr_ema_diff <= 0){
			console.log("PREVIOUS DIFFERENCE : ", prev_ema_diff, "CURRENT DIFFERENCE : ", curr_ema_diff);

			const time = new Date(tick.eventTime);
			console.log("ALIM FIRSATI : ", time.toLocaleTimeString());
			
			// START TRADING THE COIN
			trade(COIN_PAIR, TRADING_CURRENCY);
		}

		if(tick.isFinal) {
			add_candle(candles, tick);
			prev_ema_diff = calculateEMADiff(candles.opening.values, candles.closing.values);
		}
	});
};

// start(COIN_PAIR, CANDLE_INTERVAL);