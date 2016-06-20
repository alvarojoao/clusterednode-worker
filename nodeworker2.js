require('pmx').init({
                        http:          true, // HTTP routes logging (default: true)
                        errors:        true, // Exceptions loggin (default: true)
                        custom_probes: true, // Auto expose JS Loop Latency and HTTP req/s as custom metrics
                        network:       true, // Network monitoring at the application level
                        ports:         false // Shows which ports your app is listening on (default: false)
                    });
var http2     = require('http2'),
    promise   = require('bluebird'),
    onHeaders = require('on-headers'),
    fs        = require('fs'),
    redis     = require('redis'),
    repeat    = 100,
    client    = redis.createClient({host: 'raspberrypi1', prefix: 'clusterednode:'}),
    offset    = parseFloat(process.env.TIMEOFFSET),
    hostname  = require('os').hostname(),
    pid       = process.pid,
    msg       = {
        hostname: hostname,
        pid:      pid
    };
promise.promisifyAll(redis.RedisClient.prototype);
promise.promisifyAll(redis.Multi.prototype);
var setKey = function(cb) {
    var id  = parseInt(Math.random() * repeat),
        ts  = Date.now(),
        obj = {hostname: hostname, pid: pid, ts: ts};
    client.hmsetAsync(id, obj).then(function(res) {
        if (res === 'OK') {
            cb(true);
        }
        else {
            cb(false);
        }
    }, function(err) {
        cb(false);
    });
};
var getKey = function(cb) {
    var id = parseInt(Math.random() * repeat);
    client.hgetallAsync(id).then(function(res) {
        cb(true, res);
    }, function(err) {
        cb(false, {});
    });
};
var server = http2.createServer({
                                    key:  fs.readFileSync('./nginx-selfsigned.key'),
                                    cert: fs.readFileSync('./nginx-selfsigned.crt')
                                }, function(req, res) {
    //
    // Starting time
    //
    var startAt = process.hrtime();
    onHeaders(res, function onHeaders() {
        //
        // Ending time
        //
        var diff = process.hrtime(startAt),
            time = diff[0] * 1e3 + diff[1] * 1e-6 + offset;
        //
        // Include duration into Headers
        //
        res.setHeader('X-Node-Time', time.toFixed(3));
    });
    //
    // Set headers
    //
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', 'Mon, 26 Jul 1997 05:00:00 GMT');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Pragma, Cache-Control, If-Modified-Since, X-ReqId");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-ReqId", req.headers['x-reqid'] || "-1");
    //
    // Select random service (read or write from REDIS)
    //
    if (Math.round(Math.random()) === 0) {
        // Set key
        setKey(function(r) {
            if (r) {
                msg.redisAction = 'SET';
            }
            else {
                msg.redisAction = 'ERR';
            }
            msg.redisObject = {};
            res.end(JSON.stringify(msg));
        });
    }
    else {
        // Get key
        getKey(function(r, obj) {
            if (r) {
                msg.redisAction = 'GET';
            }
            else {
                msg.redisAction = 'ERR';
            }
            msg.redisObject = obj;
            res.end(JSON.stringify(msg));
        });
    }
    //
    // Send message
    //
}).listen(8010);
process.on('SIGINT', function() {
    client.quit();
    server.close();
    setTimeout(function() { process.exit(0); }, 300);
});
