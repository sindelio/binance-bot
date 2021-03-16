# Pairs to be traded
# Place or remove pair between parantheses
pair_list=(\
BANDUSDT \
LTCUSDT \
MATICUSDT \
CAKEUSDT \
)

tick_round_list=(\
15 \
20 \
30 \
)

interval=15m

for pair in ${pair_list[@]};
do
	for tick_round in ${tick_round_list[@]};
	do
		output_directory=./outputs/result_${tick_round}
		mkdir -p ${output_directory}
		ttab "node bot.js ${pair} ${interval} ${tick_round} > ${output_directory}/${pair}.txt"
	done
done