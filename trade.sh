# Pairs to be traded
# Place or remove coin between parantheses
coin_list=(\
BANDUSDT \
HOTUSDT \
LTCUSDT \
LUNAUSDT \
MATICUSDT \
YFIIUSDT \
REEFUSDT \
COCOSUSDT \
)

# The .txt files' directory for test results
output_directory=./outputs/${1}
mkdir -p ${output_directory}

for coin in ${coin_list[@]};
do
    pair=${coin}${currency}
	ttab "node bot.js ${pair} > ${output_directory}/${pair}.txt"
done