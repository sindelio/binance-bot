const Binance = require('binance-api-node').default;
const { EMA } = require('technicalindicators');

// Creates the API caller/requester as an authenticated client, which can make signed calls
const client = Binance({
  apiKey: 'YOUR_API_KEY',
  apiSecret: 'YOUR_API_SECRET',
});

const COIN_PAIR = 'BANDUSDT';
const CANDLE_INTERVAL = '5m';

// VARIABLES - Binance API
let buyOrderInfo = null;
let sellOrderInfo = null;

const INDEX_USDT = 14;
const PRICE_UPDATE_PERIOD = 5000; // Price update times varies a lot
const ORDER_UPDATE_PERIOD = 3000;

// VARIABLES - EMA
let lowerEMAInput = {
	period: 13,
    values: [],
};

let higherEMAInput = {
	period: 21,
    values: [],
};

const BUY_LIMIT = 5; 

// FUNCTIONS

// Pauses execution for a specified amount of time
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Synchronizes with the Binance API server
const sync = async () => {
	console.log('SYNCING ...');
	const serverTime = await client.time();
	console.log('serverTime: ', serverTime);
	const timeDifference = serverTime % 60000;
	console.log('timeDifference: ', timeDifference);
	await wait(timeDifference + 1000); // Waits 1s more to make sure the prices were updated
	console.log('SYNCED WITH BINANCE SERVER! \n');
}


// Updates the input for the EMA calculation. It adds the newest price and removes the oldest one.
const updateInputEMA = async () => {
	console.log('UPDATING PRICES...');

	const candles = await client.candles({
		symbol: COIN_PAIR,
		interval: CANDLE_INTERVAL,
	});

	for(let i = 0; i < candles.length; ++i){
		lowerEMAInput.values[i] = Number(candles[i].close);
		higherEMAInput.values[i] = Number(candles[i].open)
	}
}

const calculateEMA = async () => {
	console.log('CALCULATING EMA');

	const ema1 = EMA.calculate(lowerEMAInput).last();
	const ema2 = EMA.calculate(higherEMAInput).last();

	console.log('EMA-', lowerEMAInput.period , ' :', ema1, '\nEMA-', higherEMAInput.period ,':', ema2);

	return {
		ema1,
		ema2
	}
}

// Calculates how much of the asset(coin) the program can buy. The quantity is floored to an integer
const calculateBuyQuantity = async () => {
	console.log('CALCULATING BUY QUANTITY');
	let accountInfo = await client.accountInfo();
	let USDTBalance = accountInfo.balances[INDEX_USDT].free;

	// Maximum 15 USD is used for buying
	if(USDTBalance > 15){
		USDTBalance = 15;
	}

	console.log('USDT balance: ', USDTBalance);

	const prices = await client.prices({ symbol: COIN_PAIR });
	const currentPrice = prices.XRPUSDT;

	console.log(COIN_PAIR, ' Price: ', currentPrice);

	const buyQuantity = Math.floor(0.99 * (USDTBalance / currentPrice));

	console.log('BuyQuantity: ', buyQuantity, '\n');

	return { 
		buyQuantity,
		currentPrice
	};
}

// Creates a buy order in the Binance API
const makeBuyOrder = async (buyQuantity, currentPrice) => {
	console.log('MAKING BUY ORDER');
	buyOrderInfo = await client.order({
		symbol: COIN_PAIR,
		side: 'BUY',
		quantity: buyQuantity,
		price: currentPrice,
	});

	console.log('buyOrderInfo: ', buyOrderInfo, '\n');
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

// Main function, entrance point for the program
(async function main(){
	while(true){
		try {
			await updateInputEMA();
		} catch (e) {
			console.error('ERROR IN updateInputEMA(): ', e);
			process.exit(-1);
		}

		try {
			calculatedEMAs = await calculateEMA();
		} catch (e) {
			console.error('ERROR IN calculateEMA(): ', e);
			process.exit(-1);
		}
		
		// if ema1 starts to pass ema2 value (look for old ema values)
		// %1 altına stop-loss koy
		// %1 üstüne satış koy yarısı için
		// %1 üstüne diğer yarısı için "trailing-stop-loss" işlemi başlat

		if(smoothedEMA < BUY_LIMIT){ // Buy condition
			try {
				buySuccess = await buy();	
			} catch (e) {
				console.error('ERROR IN buy(): ', e);
				console.log('RESUMING OPERATIONS\n');
				continue;
			}
			if(buySuccess === 'failure') continue;
			try {
				await sell();		
			} catch (e) {
				console.error('ERROR IN sell(): ', e);
				process.exit(-1);
			}			
		}
		await sync();
	}
})();


if (!Array.prototype.last){
    Array.prototype.last = function(){
        return this[this.length - 1];
    };
};