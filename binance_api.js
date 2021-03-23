// ************* Functions for Binance API ******************* 
const Binance = require('node-binance-api');

let binance_client = new Binance();

const authenticate_user = () => {
	const BINANCE_API_KEY = require("./binance_secrets.json");

	binance_client.setOptions({
		APIKEY: BINANCE_API_KEY.api_key,
		APISECRET: BINANCE_API_KEY.api_secret
	});
}

const fetch_exchange_info = () => {
	return new Promise((resolve, reject) => {
		binance_client.exchangeInfo((error, response) => {
			if (error) {
				return reject("Error occured fetching exchange info " + error);
			} else {
				let minimums = {};

				for (let obj of response.symbols) {
					let filters = { status: obj.status }
					for (let filter of obj.filters) {
						if (filter.filterType == "MIN_NOTIONAL") {
							filters.min_notional = Number(filter.minNotional);
						} else if (filter.filterType == "PRICE_FILTER") {
							filters.min_price = Number(filter.minPrice);
							filters.max_price = Number(filter.maxPrice);
							filters.price_digit = -Math.log10(Number(filter.tickSize));
						} else if (filter.filterType == "LOT_SIZE") {
							filters.quantity_digit = -Math.log10(Number(filter.stepSize));
							filters.min_quantity = Number(filter.minQty);
							filters.max_quantity = Number(filter.maxQty);
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
const fetch_candles = (symbol, interval, options={}) => {
	return new Promise((resolve, reject) => {
		binance_client.candlesticks(symbol, interval, (error, candles, symbol) => {
			if (error) {
				return reject("Error occured fetching candles " + error);
			} else {
				const new_candles = {
					open_prices : [],
					close_prices : [],
					low_prices : [],
					high_prices : [],
					open_times : [],
					close_times : [],
				}
				
				const current_time = Date.now();
				const latest_close_time = candles[candles.length - 1][6];
			
				// See if latest candle is closed already or not
				const size = (current_time < latest_close_time) ? candles.length - 1 : candles.length;
			
				for(let i = 0; i < size; ++i) {
					const [open_time, open, high, low, close, volume, close_time, asset_volume, trades, buy_base_volume, buy_asset_volume, ignored] = candles[i];
					
					new_candles.open_prices[i] = Number(open);
					new_candles.close_prices[i] = Number(close);
					new_candles.low_prices[i] = Number(low);
					new_candles.high_prices[i] = Number(high);
					new_candles.open_times[i] = open_time;
					new_candles.close_times[i] = close_time;
				}

				return resolve(new_candles);
			}
		}, options);
	});
}

const listen_candles_stream = (symbol, interval, onUpdate=()=>{}, onOpen=()=>{}) => {
	binance_client.websockets.candlesticks(symbol, interval, (tick) => {
		const { 
			E: event_time,
			k: { 
				o: open, 
				c: close, 
				x: isFinal 
			}
		} = tick;

		onUpdate(open, close, event_time, isFinal);
	}, onOpen);
}

const listen_mini_ticker = (symbol, onUpdate=()=>{}) => {
	binance_client.websockets.miniTicker(markets => {
		const pair_update = markets[symbol];
		if(pair_update) onUpdate(pair_update.close);
	});
}

const get_price = (symbol) => {
	return new Promise((resolve, reject) => {
		binance_client.prices(symbol, (error, prices) => {
			if (error) {
				return reject(error.body);
			} else {
				const result = parseFloat(prices[symbol]);
				return resolve(result);
			}
		});
	});
}

const get_available_balance = (currency="USDT") => {
	return new Promise((resolve, reject) => {
		binance_client.balance((error, balances) => {
			if (error) {
				return reject(error.body);
			} else {
				const result = parseFloat(balances[currency].available);
				return resolve(result);
			}
		});
	});
}

// Calculates how much of the asset(coin) the user's balance can buy within the balance limit.
const calculate_buy_quantity = (symbol, trading_currency="USDT", balance_limit=15, filters={}, test=true) => {
	// ****** FILTERS *******
	// 	status: 'TRADING',
	// 	min_price: 0.01,
	// 	max_price: 1000000,
	// 	price_digit: 2,
	// 	quantity_digit: 6,
	// 	min_quantity: 0.000001,
	// 	max_quantity: 9000,
	// 	min_notional: 10,
	// 	orderTypes: [
	// 	  'LIMIT',
	// 	  'LIMIT_MAKER',
	// 	  'MARKET',
	// 	  'STOP_LOSS_LIMIT',
	// 	  'TAKE_PROFIT_LIMIT'
	// 	],
	// 	icebergAllowed: true
	// }

	const clamp = (number, min, max) => {
		const tmp_min = min ? min : number;
		const tmp_max = max ? max : number;
		return Math.max(tmp_min, Math.min(number, tmp_max));
	}

	return new Promise((resolve, reject) => {
		let buying_balance = balance_limit;

		if(!test) {
			get_available_balance(trading_currency).then(
				(value) => {
					buying_balance = clamp(value, 0, balance_limit);
				},
				(error) => {
					return reject("Error occured fetching the available balance " + error);
				}
			).catch((error) => {
				return reject("Error occured fetching the available balance " + error);
			});
		}
		
		const min_balance = filters?.min_notional ? filters.min_notional : 0;
		if(buying_balance >= min_balance) {
			get_price(symbol).then(
				(value) => {
					const coin_price = clamp(value, filters.min_price, filters.max_price);
		
					let quantity = buying_balance / coin_price;
					quantity = clamp(quantity, filters.min_quantity, filters.max_quantity);
					
					const price_digit = filters?.price_digit ? filters.price_digit : 4 ;
					const quantity_digit = filters?.quantity_digit ? filters.quantity_digit : 4 ;

					return resolve({
						price : parseFloat(coin_price.toFixed(price_digit)),
						quantity : parseFloat(quantity.toFixed(quantity_digit))
					});
				}, 
				(error) => {
					return reject("Error occured fetching the price of" + symbol + " : " + error);
				}
			).catch((error) => {
				return reject("Error occured fetching the price of" + symbol + " : " + error);
			});
		} else {
			return reject(buying_balance + " " + trading_currency + " " + "is below to minimum balance to purchase");
		}
	});	
}

// Spot market buy
const spot_market_buy = (symbol, price, quantity, test=true, onSuccess, onError) => {
	if(test) {
		onSuccess(price, quantity);
	} else {
		binance_client.marketBuy(symbol, quantity, (error, response) => {
			if(error) {
				onError(error.body);
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
const spot_market_sell = (symbol, price, quantity, test=true, onSuccess, onError) => {
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

exports.authenticate_user = authenticate_user;
exports.fetch_exchange_info = fetch_exchange_info;
exports.fetch_candles = fetch_candles;
exports.listen_candles_stream = listen_candles_stream;
exports.listen_mini_ticker = listen_mini_ticker;
exports.calculate_buy_quantity = calculate_buy_quantity;
exports.spot_market_buy = spot_market_buy;
exports.spot_market_sell = spot_market_sell;