# Pairs to be traded
# Place or remove pair between parantheses
pair_list=(\
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

for pair in ${pair_list[@]};
do
	ttab "node bot.js ${pair} > ${output_directory}/${pair}.txt"
done