# Introduction

This project consists of an automated trading program, aka a bot, to be used with the [Binance trading platform](https://www.binance.com/en). 
The bot is fully written in Javascript.

# Features

- Asynchronous, aka non-blocking, coding style.
- Synchronization with the Binance API server.
- [Stochastic Relative Strength Index](https://www.tradingview.com/wiki/Stochastic_RSI_(STOCH_RSI)).
- [Ehlers filter (aka super smoother)](https://www.mesasoftware.com/papers/EhlersFilters.pdf).
- Automated buy/sell order creation based on the StochRSI indicator.
- Error handlers to stop the bot if anything goes wrong.

The bot is set for XRP/USDT trading in Binance. Every minute the bot updates the prices with the latest closing price for candlesticks 1min from Binance, calculates the stochRSI indicator, smoothes the stochRSI with an Ehlers filter and make a buy order if the smoothed indicator shows an oversold situation. Then, the bot awaits to sell with a small profit margin, which can be set in the code (default 0.2%).
It's also simple to change the code for another trading pair.

The bot relies only in the StochRSI + Ehlers filter logic, so it's quite simple.

# Future development

I will continue evolving this bot in the second semester of 2019. 
Here are some points that deserve attention:

- Implement a stop logic if prices drop too low, to cut losses.
- Use more data points for the stochRSI indicator.
- Consider other technical indicators to create a more elaborate logic.

# Dependencies 

- [NodeJS](https://nodejs.org/en/) to run Javascript outside a browser
- [Yarn Dependency Manager](https://yarnpkg.com/en/)

The bot depends on the following Node modules:

- "binance-api-node": "^0.8.10",
- "technicalindicators": "^2.0.5"

# Setup

Clone the repository with HTTPS:

```
$ git clone https://github.com/sindelio/binance_bot.git
```

Or with SSH: 

`
$ git clone git@github.com:sindelio/binance_bot.git
`

Then move into the cloned directory:

`
cd binance_bot
`

Install the module dependencies:

```
$ yarn
```

Make sure the directory path name has no spaces or Yarn will complain!

# Running

Inside the project root directory (/bot_binance):

```
$ node bot_public.js
```

# Contributions

All contributions and comments are welcome!

# License

This code is licensed under [the MIT license](https://github.com/sindelio/binance_bot/blob/master/LICENSE).
