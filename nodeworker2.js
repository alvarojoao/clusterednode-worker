require('pmx').init({
                        http:          true, // HTTP routes logging (default: true)
                        errors:        true, // Exceptions loggin (default: true)
                        custom_probes: true, // Auto expose JS Loop Latency and HTTP req/s as custom metrics
                        network:       true, // Network monitoring at the application level
                        ports:         false // Shows which ports your app is listening on (default: false)
                    });
var http2        = require('http2'),
    onHeaders    = require('on-headers'),
    fs           = require('fs'),
    tls          = require('tls'),
    Redis        = require('ioredis'),
    hashSize     = process.env.REDIS_HASHSIZE,
    redisCluster = [
        {port: 6379, host: "127.0.0.1"},
        {port: 6378, host: "127.0.0.1"},
        {port: 6377, host: "127.0.0.1"},
        {port: 6376, host: "127.0.0.1"},
        {port: 6375, host: "127.0.0.1"},
        {port: 6374, host: "127.0.0.1"}
    ],
    hostname     = require('os').hostname(),
    pid          = process.pid,
    redisReady   = false;
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
            connectionName:         '[H' + hostname + 'P' + pid + ']',
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
    console.log("redis.io cluster connection opened and ready to serve");
});
cluster.on("end", function() {
    redisReady = false;
    console.log("redis.io cluster connection closed");
});
cluster.on("error", function(err) {
    console.log("redis.io Error: " + err);
});
cluster.on("node error", function(err) {
    console.log("redis.io Node Error: " + err);
});
//
// Create diff hrtime header
//
var createDiffHrtimeHeader = function(header, start, response) {
    var diffR = process.hrtime(start),
        timeR = diffR[0] * 1e3 + diffR[1] * 1e-6;
    response.setHeader(header, timeR.toFixed(3));
};
//
// Message handlers
//
var messageHandler = function(msg, resp, act, obj) {
    msg.redisAction = act;
    msg.redisObject = obj;
    resp.end(JSON.stringify(msg));
};
//
// Encapsulates HMSET call
//
var redisSet = function(msg, respon) {
    var key      = parseInt(Math.random() * hashSize),
        ts       = Date.now(),
        obj      = {hostname: hostname, pid: pid, ts: ts},
        startAtR = process.hrtime();
    cluster.hmset(key, obj).then(function(res) {
        createDiffHrtimeHeader('X-Redis-Time', startAtR, respon);
        messageHandler(msg, respon, (res === 'OK') ? 'SET' : 'ERR', {});
    }, function(err) {
        createDiffHrtimeHeader('X-Redis-Time', startAtR, respon);
        console.log(err);
        messageHandler(msg, respon, 'ERR', {});
    });
};
//
// Encapsulates HGETALL call
//
var redisGet = function(msg, respon) {
    var key      = parseInt(Math.random() * hashSize),
        startAtR = process.hrtime();
    cluster.hgetall(key).then(function(res) {
        createDiffHrtimeHeader('X-Redis-Time', startAtR, respon);
        messageHandler(msg, respon, 'GET', (res === '') ? {} : res);
    }, function(err) {
        createDiffHrtimeHeader('X-Redis-Time', startAtR, respon);
        console.log(err);
        messageHandler(msg, respon, 'ERR', {});
    });
};
//
// Encapsulates PIPELINE call
//
var redisPipeline = function(msg, respon) {
    var key      = parseInt(Math.random() * hashSize),
        ts       = Date.now(),
        obj      = {hostname: hostname, pid: pid, ts: ts},
        startAtR = process.hrtime(),
        promise  = cluster.pipeline().hgetall(key).hmset(key, obj).exec();
    promise.then(function(res) {
        createDiffHrtimeHeader('X-Redis-Time', startAtR, respon);
        messageHandler(msg, respon, 'PPL', (res.length === 0) ? {} : res[0][1]);
    }, function(err) {
        createDiffHrtimeHeader('X-Redis-Time', startAtR, respon);
        console.log(err);
        messageHandler(msg, respon, 'ERR', {});
    });
};
//
// Encapsulates TRANSACTION call
//
var redisTransaction = function(msg, respon) {
    var key      = parseInt(Math.random() * hashSize),
        ts       = Date.now(),
        obj      = {hostname: hostname, pid: pid, ts: ts},
        startAtR = process.hrtime(),
        promise  = cluster.multi().hgetall(key).hmset(key, obj).exec();
    promise.then(function(res) {
        createDiffHrtimeHeader('X-Redis-Time', startAtR, respon);
        messageHandler(msg, respon, 'TRN', (res.length === 0) ? {} : res[0][1]);
    }, function(err) {
        createDiffHrtimeHeader('X-Redis-Time', startAtR, respon);
        console.log(err);
        messageHandler(msg, respon, 'ERR', {});
    });
};
//
// Prepare execution function stack
//
var executionMatrix = [redisGet,
                       redisGet,
                       redisGet,
                       redisGet,
                       redisGet,
                       redisGet,
                       redisSet,
                       redisSet,
                       redisPipeline,
                       redisTransaction];
//
// Main HTTP/2 server handler
//
var server = http2.createServer(ssl, function(req, res) {
    //
    // Starting HTTP/2 time
    //
    var startAtN = process.hrtime();
    //
    // Prepare message
    //
    var msg = {
        hostname: hostname,
        pid:      pid
    };
    //
    // Include AngularJS timer when it's ready to send back the results
    //
    onHeaders(res, function onHeaders() {
        createDiffHrtimeHeader('X-Node-Time', startAtN, res);
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
        // Call message handler and redis commands
        //
        executionMatrix[parseInt(Math.random() * 10)](msg, res);
    }
    else {
        //
        // redis is not ready - return error message without crashing
        //
        res.setHeader("X-Redis-Time", 0);
        messageHandler(msg, res, 'ERR', {});
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
