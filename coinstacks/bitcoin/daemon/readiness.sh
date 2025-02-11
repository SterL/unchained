#!/bin/bash

TOLERANCE=1

BLOCKHEIGHT_LOCAL=$(curl -s -H 'content-type: application/json' -u user:password  -d '{ "jsonrpc": "1.0", "id": "getinfo", "method": "getblockchaininfo", "params": [] }' http://localhost:8332 | jq .result.blocks)

BLOCKHEIGHT_REMOTE_SOURCE_1=$(curl -s https://sochain.com/api/v2/get_info/btc | jq .data.blocks)
BLOCKHEIGHT_REMOTE_SOURCE_2=$(curl -s https://api.blockcypher.com/v1/btc/main | jq .height)

ARRAY=($BLOCKHEIGHT_REMOTE_SOURCE_1 $BLOCKHEIGHT_REMOTE_SOURCE_2)
BLOCKHEIGHT_BEST=${ARRAY[0]}
for n in "${ARRAY[@]}" ; do
  ((n > BLOCKHEIGHT_BEST)) && BLOCKHEIGHT_BEST=$n
done

BLOCKHEIGHT_NOMINAL=$(( $BLOCKHEIGHT_LOCAL + $TOLERANCE ))
if [[ $BLOCKHEIGHT_BEST -gt $BLOCKHEIGHT_NOMINAL ]]
then
  echo "NODE BEHIND! ${BLOCKHEIGHT_BEST} > ${BLOCKHEIGHT_NOMINAL}"
  exit 1
fi

echo "Node healthy ${BLOCKHEIGHT_BEST} <= ${BLOCKHEIGHT_NOMINAL}"
exit 0
