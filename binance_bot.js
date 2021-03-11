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
const calculateBuyQuantity = async () => {
	console.log('CALCULATING BUY QUANTITY');

	const accountInfo = await binanceServer.accountInfo();
	const prices = await binanceServer.prices();

	const USDTBalance = accountInfo.balances[INDEX_USDT].free;
	const currentPrice = prices.BANDUSDT;

	const buyQuantity = USDTBalance / currentPrice;

	console.log('BuyQuantity: ', buyQuantity, '\n');

	return { 
		buyQuantity,
		currentPrice
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
		}

		if(tick.isFinal) {
			add_candle(candles, tick);
			prev_ema_diff = calculateEMADiff(candles.opening.values, candles.closing.values);
		}
	});

	while(false){
		const candles = await fetchCandles(400);

		for(let i = candles.opening.values.length - 1; i > 30; --i) {
			try {
				const curOpeningPrices = candles.opening.values.slice(0, i + 1);
				const curClosingPrices = candles.closing.values.slice(0, i + 1);
				const currEmaDifference = await calculateEMADiff(curOpeningPrices, curClosingPrices);

				const prevOpeningPrices = candles.opening.values.slice(0, i);
				const prevClosingPrices = candles.closing.values.slice(0, i);
				const prevEmaDifference = await calculateEMADiff(prevOpeningPrices, prevClosingPrices);


				// previously ema2 > ema1 and currently ema2 < ema1
				if(prevEmaDifference > 0 && currEmaDifference <= 0) {					
					console.log("PREV : ", prevEmaDifference, "CURRENT : ", currEmaDifference);

					const time = new Date(candles.opening.times[i]);
					console.log("ALIM FIRSATI : ", time.toString());
					// %1 altına stop-loss koy
					// %1 üstüne satış koy yarısı için
					// %1 üstüne diğer yarısı için "trailing-stop-loss" işlemi başlat
				}
			} catch (e) {
				console.error('ERROR IN calculateEMA(): ', e);
				process.exit(-1);
			}
		}
	}
};

start(COIN_PAIR, CANDLE_INTERVAL);