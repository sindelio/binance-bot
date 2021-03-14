# Trading currency
currency=USDT

# Coins to be traded
# Place or remove coin between parantheses
coin_list=(\
BAND \
HOT \
LTC \
LUNA \
MATIC \
YFII \
REEF \
COCOS \
)

# The .txt files' directory for test results
output_directory=./outputs/${1}
mkdir -p ${output_directory}

for coin in ${coin_list[@]};
do
    pair=${coin}${currency}
	ttab "node bot.js ${pair} > ${output_directory}/${pair}.txt"
done