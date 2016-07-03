#!/usr/bin/env bash
echo Minify nodeworker2.js
uglifyjs nodeworker2.js --screw-ie8 -c sequences,dead_code,conditionals,comparisons,unsafe_comps,evaluate,booleans,loops,unused,if_return,join_vars,collapse_vars,cascade,passes=3 -m toplevel,eval -r '$,require,exports' -o nodeworker2.js --source-map nodeworker2.js.map --source-map-include-sources --stats
#echo Minify http2 package
#uglifyjs node_modules/http2/lib/http.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/http2/lib/http.js --stats
#uglifyjs node_modules/http2/lib/index.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/http2/lib/index.js --stats
#uglifyjs node_modules/http2/lib/protocol/compressor.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/http2/lib/protocol/compressor.js --stats
#uglifyjs node_modules/http2/lib/protocol/connection.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/http2/lib/protocol/connection.js --stats
#uglifyjs node_modules/http2/lib/protocol/endpoint.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/http2/lib/protocol/endpoint.js --stats
#uglifyjs node_modules/http2/lib/protocol/flow.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/http2/lib/protocol/flow.js --stats
#uglifyjs node_modules/http2/lib/protocol/framer.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/http2/lib/protocol/framer.js --stats
#uglifyjs node_modules/http2/lib/protocol/stream.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/http2/lib/protocol/stream.js --stats
#uglifyjs node_modules/http2/lib/protocol/index.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/http2/lib/protocol/index.js --stats
#echo Minify ioredis package
#uglifyjs node_modules/ioredis/index.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/index.js --stats
#uglifyjs node_modules/ioredis/lib/cluster/connection_pool.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/cluster/connection_pool.js --stats
#uglifyjs node_modules/ioredis/lib/cluster/delay_queue.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/cluster/delay_queue.js --stats
#uglifyjs node_modules/ioredis/lib/cluster/index.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/cluster/index.js --stats
#uglifyjs node_modules/ioredis/lib/connectors/connector.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/connectors/connector.js --stats
#uglifyjs node_modules/ioredis/lib/connectors/sentinel_connector.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/connectors/sentinel_connector.js --stats
#uglifyjs node_modules/ioredis/lib/redis/event_handler.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/redis/event_handler.js --stats
#uglifyjs node_modules/ioredis/lib/redis/parser.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/redis/parser.js --stats
#uglifyjs node_modules/ioredis/lib/utils/index.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/utils/index.js --stats
#uglifyjs node_modules/ioredis/lib/command.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/command.js --stats
#uglifyjs node_modules/ioredis/lib/commander.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/commander.js --stats
#uglifyjs node_modules/ioredis/lib/pipeline.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/pipeline.js --stats
#uglifyjs node_modules/ioredis/lib/redis.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/redis.js --stats
#uglifyjs node_modules/ioredis/lib/reply_error.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/reply_error.js --stats
#uglifyjs node_modules/ioredis/lib/scan_stream.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/scan_stream.js --stats
#uglifyjs node_modules/ioredis/lib/script.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/script.js --stats
#uglifyjs node_modules/ioredis/lib/subscription_set.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/subscription_set.js --stats
#uglifyjs node_modules/ioredis/lib/transaction.js --screw-ie8 -c -m -r '$,require,exports' -o node_modules/ioredis/lib/transaction.js --stats
echo Finished minifying files
