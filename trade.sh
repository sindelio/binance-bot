# Trading currency
currency=USDT

# Coins to be traded
# Place or remove coin between parantheses
coin_list=(\
BAND \
BNB \
BTC \
HOT \
LTC \
LUNA \
MATIC \
YFII \
)

for coin in ${coin_list[@]};
do
    pair=${coin}${currency}
	ttab node binance_bot.js ${pair} > ${pair}.txt
done;