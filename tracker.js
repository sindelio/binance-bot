const binance_api = require('./binance_api');

class Tracker {
    constructor(pair, stop_loss_multiplier, profit_multiplier, take_profit_multiplier, logger, test=true){
        this.pair = pair;

        this.stop_loss_multiplier = stop_loss_multiplier;
        this.profit_multiplier = profit_multiplier;
        this.take_profit_multiplier = take_profit_multiplier;

        this.logger = logger;
        this.test = test;
        
        this.track_list = [];

        this.total_profit = 0;
    }

    start() {
        binance_api.mini_ticker(this.pair, (current_price) => {
            for (let i = this.track_list.length - 1; i >= 0; --i) {
                const track = this.track_list[i];
                
                if(current_price >= track.higher_price_limit && current_price < track.buying_price * this.take_profit_multiplier) {

                    track.lower_price_limit = track.higher_price_limit * ((1 + this.stop_loss_multiplier) * 0.5),
                    track.higher_price_limit = track.higher_price_limit * ((1 + this.profit_multiplier) * 0.5),

                    this.logger.info("Lower limit increased to : %f for quantity : %f", track.lower_price_limit, track.buying_quantity);
                    this.logger.info("Higher limit increased to : %f for quantity : %f", track.higher_price_limit, track.buying_quantity);

                } else if(current_price <= track.lower_price_limit || current_price >= track.buying_price * this.take_profit_multiplier) {
                    binance_api.spot_market_sell(this.pair, current_price, track.buying_quantity, this.test,
                        (price, quantity) => {
                            // onSuccess
                            
                            this.track_list.splice(i, 1);
                            
                            this.logger.info("Market Sell - price : %f , quantity : %f", price, quantity);
                             
                            const profit = price * quantity - track.buying_price * track.buying_quantity;
                            this.logger.info("Profit : %f", profit);

                            this.total_profit += profit;
                            this.logger.info("Total profit : %f", this.total_profit);
                        },
                        (error) => {
                            // onError
                            this.logger.error("Error occured during market sell : %s", error);
                        }
                    );
                }
            }
        });
    } 

    add(price, quantity) {
        this.track_list.push({
            buying_price : price, 
            buying_quantity : quantity,
            lower_price_limit : price * this.stop_loss_multiplier,
            higher_price_limit : price * this.profit_multiplier
        });
    }
}

exports.Tracker = Tracker;