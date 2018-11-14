const Binance = require('binance-api-node').default;
const { StochasticRSI } = require('technicalindicators');

// Creates the API caller/requester as an authenticated client, which can make signed calls
const client = Binance({
  apiKey: 'YOUR_API_KEY',
  apiSecret: 'YOUR_API_SECRET',
});

// VARIABLES - Binance API
let buyOrderInfo = null;
let sellOrderInfo = null;
// const INDEX_XRP = 67;
const INDEX_USDT = 14;
// const INDEX_BTC = 0;
const PRICE_UPDATE_PERIOD = 5000; // Price update times varies a lot
const ORDER_UPDATE_PERIOD = 3000;

// VARIABLES - Stochastic Relative Strenght Index indicator
let inputStochRSI = {
	values : [],
	rsiPeriod : 14,
	stochasticPeriod : 9,
	kPeriod : 3,
	dPeriod : 3,
};
const STOCHRSI_CALCULATION_PERIOD = 26; // rsiPeriod + stochasticPeriod + kPeriod
const BUY_LIMIT = 5; 
// const SELL_LIMIT = 95; 

// VARIABLES - Ehlers Filter (Super Smoother Filter)
let filter = [0 , 0 , 0];
const a = Math.exp(-Math.PI * Math.sqrt(2) / 10);
const c2 = 2 * a * Math.cos(Math.sqrt(2) * Math.PI / 10);
const c3 = -a * a;
const c1 = (1 - c2 - c3) / 2;
// console.log('a: ', a);
// console.log('c1: ', c1);
// console.log('c2: ', c2);
// console.log('c3: ', c3);

// FUNCTIONS

// Pauses execution for a specified amount of time
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Synchronizes with the Binance API server
const sync = async () => {
	console.log('SYNCING ...');
	let serverTime = await client.time();
	console.log('serverTime: ', serverTime);
	let timeDifference = serverTime % 60000;
	console.log('timeDifference: ', timeDifference);
	await wait(timeDifference + 1000); // Waits 1s more to make sure the prices were updated
	console.log('SYNCED WITH BINANCE SERVER! \n');
}

// Initializes the input with minutly prices for the stochastic RSI calculation
const initializeInputStochRSI = async () => {
	console.log('INITIALIZING STOCH RSI');
	let candles = await client.candles({
		symbol: 'XRPUSDT',
		interval: '1m'
	});
	for(let i = 0, currentClosePrice = null; i <= STOCHRSI_CALCULATION_PERIOD + 3; i++){
		currentClosePrice = candles[(candles.length - 1) - (STOCHRSI_CALCULATION_PERIOD + 3) + i ].close;
		inputStochRSI.values[ i ] = Number(currentClosePrice);
	}
	console.log('inputStochasticRSI: ', inputStochRSI);
	console.log('inputStochasticRSI.value.lenght: ', inputStochRSI.values.length, '\n');
}

// Updates the input for the stochastic RSi calculation. It adds the newedt price and removes the oldest one.
const updateInputStochRSI = async () => {
	console.log('UPDATING STOCH RSI');
	inputStochRSI.values.shift();
	let candles = await client.candles({
		symbol: 'XRPUSDT',
		interval: '1m'
	});
	let lastClosePrice = candles[candles.length - 1 ].close;
	inputStochRSI.values.push(Number(lastClosePrice));
	console.log('lastClosePrice: ', lastClosePrice);
	console.log('inputStochRSI: ', inputStochRSI, '\n');
}

// Calculates stochastic RSI based on the prices input
const calculateStochRSI = async () => {
	console.log('CALCULATING STOCH RSI');
	let calculatedStochRSI = StochasticRSI.calculate(inputStochRSI);
	console.log('calculatedStochRSI: ', calculatedStochRSI, '\n');
	return calculatedStochRSI;
}

// Initializes the Ehlers filter (super smoother)
const initializeSmoother = async (SRSI) => {
	console.log('INITIALIZING SUPER SMOOTHER');
	filter[0] = c1 * (SRSI[1].stochRSI + SRSI[0].stochRSI);
	filter[1] = c1 * (SRSI[2].stochRSI + SRSI[1].stochRSI) + c2 * filter[0];
	filter[2] = c1 * (SRSI[3].stochRSI + SRSI[2].stochRSI) + c2 * filter[1] + c3 * filter[0];
	console.log('smoothedStochRSI: ', filter[2], '\n');
}

// Calculates next value for the Ehlers filter
const calculateSmoother = async (SRSI) => {
	console.log('CALCULATING SUPER SMOOTHER');
	let newValue = c1 * (SRSI[3].stochRSI + SRSI[2].stochRSI) + c2 * filter[2] + c3 * filter[1];
	filter.push(newValue);
	filter.shift();
	console.log('smoothedStochRSI: ', filter, '\n');
}

// Calculates how much of the asset (XRP) the program can buy. The quantity is floored to an integer
const calculateBuyQuantity = async () => {
	console.log('CALCULATING BUY QUANTITY');
	let accountInfo = await client.accountInfo();
	let USDTBalance = accountInfo.balances[INDEX_USDT].free;
	if(USDTBalance > 15){
		USDTBalance = 15;
	}
	console.log('USDT balance: ', USDTBalance);
	let prices = await client.prices({ symbol: 'XRPUSDT' });
	let currentPrice = prices.XRPUSDT;
	console.log('XRP Price: ', currentPrice);     
	let buyQuantity = Math.floor(0.99 * (USDTBalance / currentPrice));
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
		symbol: 'XRPUSDT',
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
			symbol: 'XRPUSDT',
  		orderId: buyOrderInfo.orderId,
		});
		// console.log('buyOrderInfo: ', buyOrderInfo);
		if(buyOrderInfo.status === 'FILLED'){
			console.log('PURCHASE COMPLETE! \n');
			return 'success';
		}
		await wait(ORDER_UPDATE_PERIOD);
	}
	if(buyOrderInfo.status === 'PARTIALLY_FILLED'){
		console.log('PURCHASE PARTIALLY FILLED, CONTINUING');
		while(true){
			buyOrderInfo = await client.getOrder({
				symbol: 'XRPUSDT',
				orderId: buyOrderInfo.orderId,
			});
			if(buyOrderInfo.status === 'FILLED'){
				console.log('PURCHASE COMPLETE! \n');
				return 'success';
			}
			await wait(ORDER_UPDATE_PERIOD);
		}
	}
	console.log('PURCHASE TIMED OUT, CANCELLING \n');
	await client.cancelOrder({
		symbol: 'XRPUSDT',
  	orderId: buyOrderInfo.orderId,
	});
	return 'failure';
}

// Purchasing mechanism, invokes the 3 functions above as needed
const buy = async () => {
	console.log('BUYING');     
	let { buyQuantity, currentPrice } = await calculateBuyQuantity();
	await makeBuyOrder(buyQuantity, currentPrice);
	let buySuccess = await waitBuyOrderCompletion();
	return buySuccess;
}

// Calculates how much profit a sale would incur
const calculateProfit = async () => {
	console.log('CALCULATING PROFIT');
	let buyingPrice = buyOrderInfo.price;
	let prices = await client.prices({ symbol: 'XRPUSDT' });
	let currentPrice = prices.XRPUSDT;
	let profit = ((currentPrice/buyingPrice) - 1) * 100;
	// console.log('currentPrice [XRP]: ', currentPrice);
	// console.log('buyingPrice: ', buyingPrice);
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
		symbol: 'XRPUSDT',
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
			symbol: 'XRPUSDT',
			orderId: sellOrderInfo.orderId,
		});
		// console.log('sellOrderInfo: ', sellOrderInfo);
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
				symbol: 'XRPUSDT',
				orderId: sellOrderInfo.orderId,
			});
			// console.log('sellOrderInfo: ', sellOrderInfo);
			if(sellOrderInfo.status === 'FILLED'){
				console.log('SALE COMPLETE! \n');
				return 'success';
			}
			await wait(ORDER_UPDATE_PERIOD);
		}
	}
	console.log('SALE TIMED OUT, CANCELLING \n');
	await client.cancelOrder({
		symbol: 'XRPUSDT',
  	orderId: sellOrderInfo.orderId,
	});
	return 'failure';
}

// Selling mechanism, invokes the 3 functions above as needed
const sell = async () => {
	console.log('SELLING');
	let sellSuccess;
	while(true){
		let { profit, currentPrice } = await calculateProfit();
		if(profit >= 0.175){
			await makeSellOrder(currentPrice);
			sellSuccess = await waitSellOrderCompletion();
			if(sellSuccess === 'failure') continue;
			return;
		}
		// if(profit < -0.2){
			// TODO: Implement stop logic
		// }
		await wait(PRICE_UPDATE_PERIOD);
	}
}

// Main function, entrance point for the program
(async function main(){
	let calculatedStochRSI = null, smoothedStochRSI = null, buySuccess = null;
	try {
		await initializeInputStochRSI();
		calculatedStochRSI = await calculateStochRSI();
		smoothedStochRSI = await initializeSmoother(calculatedStochRSI);
		await sync();
	} catch (e) {
		console.error('ERROR DURING INITIALIZATION: ', e);
		process.exit(-1);
	}
	while(true){
		try {
			await updateInputStochRSI();
		} catch (e) {
			console.error('ERROR IN updateStochRSI(): ', e);
			process.exit(-1);
		}
		try {
			calculatedStochRSI = await calculateStochRSI();
		} catch (e) {
			console.error('ERROR IN calculateStochRSI(): ', e);
			process.exit(-1);
		}
		try {
			smoothedStochRSI = await calculateSmoother(calculatedStochRSI);	
		} catch (e) {
			console.error('ERROR IN calculateSmoother(): ', e);
			process.exit(-1);
		}
		if(smoothedStochRSI < BUY_LIMIT){ // Buy condition
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

/* TODO
	-> Implement sale stop logic
	-> Study more about technical indicators (particularly StochRSI and Ehlers filters)
		-> Consider using more data points
*/