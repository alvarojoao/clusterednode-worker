require('pmx').init({
                        http:          true, // HTTP routes logging (default: true)
                        errors:        true, // Exceptions loggin (default: true)
                        custom_probes: true, // Auto expose JS Loop Latency and HTTP req/s as custom metrics
                        network:       true, // Network monitoring at the application level
                        ports:         false // Shows which ports your app is listening on (default: false)
                    });
var http2        = require('http2'),
    //promise   = require('bluebird'),
    onHeaders    = require('on-headers'),
    fs           = require('fs'),
    tls          = require('tls'),
    Redis        = require('ioredis'),
    hashSize     = process.env.REDIS_HASHSIZE,
    redisCluster = JSON.parse(process.env.REDIS_SSLTUNNEL),
    offset       = parseFloat(process.env.TIMEOFFSET),
    hostname     = require('os').hostname(),
    pid          = process.pid,
    redisReady   = false,
    msg          = {
        hostname: hostname,
        pid:      pid
    };
//
// Defines certificates for enabling TLSv1.2
//
var ssl = {
    key:  fs.readFileSync('./nginx-selfsigned.key'),
    cert: fs.readFileSync('./nginx-selfsigned.crt')
};
//
// Create redis cluster client
//
var cluster = new Redis.Cluster(
    redisCluster,
    {
        enableReadyCheck:        true,
        maxRedirections:         6,
        retryDelayOnFailover:    1000,
        retryDelayOnClusterDown: 1000,
        scaleReads:              'all',
        redisOptions:            {
            connectionName:         '[H:' + hostname + '|P:' + pid + ']',
            parser:                 'hiredis',
            dropBufferSupport:      true,
            prefix:                 'clusterednode:',
            showFriendlyErrorStack: true
        }
    }
);
//
// Set redis events listeners
//
cluster.on("ready", function() {
    redisReady = true;
});
cluster.on("end", function() {
    redisReady = false;
});
cluster.on("error", function(err) {
    console.log("redis.io Error: " + err);
});
cluster.on("node error", function(err) {
    console.log("redis.io Node Error: " + err);
});
//
// Enable async redis calls
//
//promise.promisifyAll(redis.RedisClient.prototype);
//promise.promisifyAll(redis.Multi.prototype);
//
// Encapsulates HMSET call
//
var setKey = function(cb, respon) {
    var id       = parseInt(Math.random() * hashSize),
        ts       = Date.now(),
        obj      = {hostname: hostname, pid: pid, ts: ts},
        startAtR = process.hrtime();
    cluster.hmset(id, obj).then(function(res) {
        var diffR = process.hrtime(startAtR),
            timeR = diffR[0] * 1e3 + diffR[1] * 1e-6;
        respon.setHeader('X-Redis-Time', timeR.toFixed(3));
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
//
// Encapsulates HGETALL call
//
var getKey = function(cb, respon) {
    var id       = parseInt(Math.random() * hashSize),
        startAtR = process.hrtime();
    cluster.hgetall(id).then(function(res) {
        var diffR = process.hrtime(startAtR),
            timeR = diffR[0] * 1e3 + diffR[1] * 1e-6;
        respon.setHeader('X-Redis-Time', timeR.toFixed(3));
        cb(true, (res === '') ? {} : res);
    }, function(err) {
        cb(false, {});
    });
};
//
// Main HTTP/2 server handler
//
var server = http2.createServer(ssl, function(req, res) {
    //
    // Starting time
    //
    var startAtN = process.hrtime();
    onHeaders(res, function onHeaders() {
        //
        // Ending time
        //
        var diffN = process.hrtime(startAtN),
            timeN = diffN[0] * 1e3 + diffN[1] * 1e-6 + offset;
        //
        // Include duration into Headers
        //
        res.setHeader('X-Node-Time', timeN.toFixed(3));
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
    // Check if redis is available to start sending commands
    //
    if (redisReady) {
        //
        // Select random service (read or write from REDIS)
        //
        if (Math.random() < 0.5) {
            // Set key
            setKey(function(r) {
                if (r) {
                    msg.redisAction = 'SET';
                }
                else {
                    msg.redisAction = 'ERR';
                }
                msg.redisObject = {};
                //
                // Send message
                //
                res.end(JSON.stringify(msg));
            }, res);
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
                //
                // Send message
                //
                res.end(JSON.stringify(msg));
            }, res);
        }
    }
    else {
        //
        // redis is not ready - return error message without crashing
        //
        msg.redisAction = 'ERR';
        msg.redisObject = {};
        res.end(JSON.stringify(msg));
    }
}).listen(process.env.NODEPORT);
//
// Enables graceful stop/reload - nicely closes connections to redis and closes HTTP/2 server
// enabling last transactions, both on redis and HTTP/2 server to be completed before exiting
//
process.on('SIGINT', function() {
    //
    // finishes all redis transactions and closes connection with redis
    //
    cluster.quit();
    //
    // finishes all HTTP/2 responses and close server
    //
    server.close();
    //
    // nicely exit node after 0.5 seconds
    //
    setTimeout(function() { process.exit(0); }, 500);
});
