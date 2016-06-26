'use strict';
require('pmx').init({
                        http:          true, // HTTP routes logging (default: true)
                        errors:        true, // Exceptions loggin (default: true)
                        custom_probes: true, // Auto expose JS Loop Latency and HTTP req/s as custom metrics
                        network:       true, // Network monitoring at the application level
                        ports:         false // Shows which ports your app is listening on (default: false)
                    });
var http2         = require('http2'),
    onHeaders     = require('on-headers'),
    fs            = require('fs'),
    tls           = require('tls'),
    Redis         = require('ioredis'),
    redisHashSize = process.env.REDIS_HASHSIZE,
    redisCluster  = [
        {port: 6379, host: "127.0.0.1"},
        {port: 6378, host: "127.0.0.1"},
        {port: 6377, host: "127.0.0.1"},
        {port: 6376, host: "127.0.0.1"},
        {port: 6375, host: "127.0.0.1"},
        {port: 6374, host: "127.0.0.1"}
    ],
    hostname      = require('os').hostname(),
    pid           = process.pid,
    redisReady    = false,
    rmOK          = 'OK',
    rmERROR       = 'ERR',
    raSET         = 'SET',
    raGET         = 'GET',
    raTRANSACTION = 'TRN',
    raPIPELINE    = 'PPL',
    hdREDIS       = 'X-Redis-Time',
    hdNODE        = 'X-Node-Time';
//
// Defines certificates for enabling TLSv1.2
//
var sslCerts = {
    key:  fs.readFileSync('./nginx-selfsigned.key'),
    cert: fs.readFileSync('./nginx-selfsigned.crt')
};
//
// Connect to Socket.IO proxy to send node execution notifications
//
var socket = require('socket.io-client')('https://192.168.69.246:32401');
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
            connectionName:         'H' + hostname + 'P' + pid,
            parser:                 'hiredis',
            dropBufferSupport:      true,
            prefix:                 'cn:',
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
var createDiffHrtimeHeader = function(headerLabel, startHRTime, httpResponse) {
    var diffR = process.hrtime(startHRTime),
        timeR = diffR[0] * 1e3 + diffR[1] * 1e-6;
    httpResponse.setHeader(headerLabel, timeR.toFixed(3));
};
//
// Message handlers
//
var messageHandler = function(jsonMsg, httpResponse, redisAction, redisValue) {
    jsonMsg.redisAction = redisAction;
    jsonMsg.redisObject = redisValue;
    httpResponse.end(JSON.stringify(jsonMsg));
    socket.emit('exec', {
        pi:  hostname,
        pid: pid
    });
};
//
// Key generator
//
var redisKeyGenerator = function() {
    return (Math.random() * redisHashSize) | 0;
};
//
// Send default ERR response due to a Redis error
//
var sendRedisError = function(jsonMsg, redisError, httpResponse, startHRTime) {
    createDiffHrtimeHeader(hdREDIS, startHRTime, httpResponse);
    messageHandler(jsonMsg, httpResponse, rmERROR, {});
    console.log(redisError);
};
//
// Send composite message based on Redis results
//
var sendRedisResults = function(jsonMsg, httpResponse, redisAction, redisValue, startHRTime) {
    createDiffHrtimeHeader(hdREDIS, startHRTime, httpResponse);
    messageHandler(jsonMsg, httpResponse, redisAction, redisValue);
};
//
// Encapsulates HMSET call
//
var redisSetCall = function(jsonMsg, httpResponse) {
    var redisValue     = {hostname: hostname, pid: pid, ts: Date.now()},
        startRedisCall = process.hrtime(),
        promise        = cluster.hmset(redisKeyGenerator(), redisValue);
    promise.then(function(redisMessage) {
        sendRedisResults(jsonMsg, httpResponse, (redisMessage === rmOK) ? raSET : rmERROR, {}, startRedisCall);
    }, function(redisError) {
        sendRedisError(jsonMsg, redisError, httpResponse, startRedisCall);
    });
};
//
// Encapsulates HGETALL call
//
var redisGetCall = function(jsonMsg, httpResponse) {
    var startRedisCall = process.hrtime(),
        promise        = cluster.hgetall(redisKeyGenerator());
    promise.then(function(redisMessage) {
        sendRedisResults(jsonMsg, httpResponse, raGET, (redisMessage === '') ? {} : redisMessage, startRedisCall);
    }, function(redisError) {
        sendRedisError(jsonMsg, redisError, httpResponse, startRedisCall);
    });
};
//
// Encapsulates PIPELINE call
//
var redisPipelineCall = function(jsonMsg, httpResponse) {
    var redisKey       = redisKeyGenerator(),
        redisValue     = {hostname: hostname, pid: pid, ts: Date.now()},
        startRedisCall = process.hrtime(),
        promise        = cluster.pipeline().hgetall(redisKey).hmset(redisKey, redisValue).exec();
    promise.then(function(redisMessage) {
        sendRedisResults(jsonMsg, httpResponse, raPIPELINE, (redisMessage.length === 0) ? {} : redisMessage[0][1], startRedisCall);
    }, function(redisError) {
        sendRedisError(jsonMsg, redisError, httpResponse, startRedisCall);
    });
};
//
// Encapsulates TRANSACTION call
//
var redisTransactionCall = function(jsonMsg, httpResponse) {
    var redisKey       = redisKeyGenerator(),
        redisValue     = {hostname: hostname, pid: pid, ts: Date.now()},
        startRedisCall = process.hrtime(),
        promise        = cluster.multi().hgetall(redisKey).hmset(redisKey, redisValue).exec();
    promise.then(function(redisMessage) {
        sendRedisResults(jsonMsg, httpResponse, raTRANSACTION, (redisMessage.length === 0) ? {} : redisMessage[0][1], startRedisCall);
    }, function(redisError) {
        sendRedisError(jsonMsg, redisError, httpResponse, startRedisCall);
    });
};
//
// Prepare execution function stack
//
var executionMatrix = [redisGetCall,
                       redisGetCall,
                       redisGetCall,
                       redisGetCall,
                       redisGetCall,
                       redisGetCall,
                       redisSetCall,
                       redisSetCall,
                       redisPipelineCall,
                       redisTransactionCall];
//
// Main HTTP/2 server handler
//
var server = http2.createServer(sslCerts, function(httpRequest, httpResponse) {
    //
    // Starting HTTP/2 time
    //
    var startNodeCall = process.hrtime(),
        jsonMsg       = {
            hostname: hostname,
            pid:      pid
        };
    //
    // Include AngularJS timer when it's ready to send back the results
    //
    onHeaders(httpResponse, function onHeaders () {
        createDiffHrtimeHeader(hdNODE, startNodeCall, httpResponse);
    });
    //
    // Set headers
    //
    httpResponse.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    httpResponse.setHeader('Pragma', 'no-cache');
    httpResponse.setHeader('Expires', 'Mon, 26 Jul 1997 05:00:00 GMT');
    httpResponse.setHeader("Access-Control-Allow-Origin", "*");
    httpResponse.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Pragma, Cache-Control, If-Modified-Since, X-ReqId");
    httpResponse.setHeader("Content-Type", "application/json");
    httpResponse.setHeader("X-ReqId", httpRequest.headers['x-reqid'] || "-1");
    //
    // Check if redis is available to start sending commands
    //
    if (redisReady) {
        //
        // Call message handler and redis commands
        //
        executionMatrix[(Math.random() * 10) | 0](jsonMsg, httpResponse);
    }
    else {
        //
        // redis is not ready - return error message without crashing
        //
        httpResponse.setHeader(hdREDIS, 0);
        messageHandler(jsonMsg, httpResponse, rmERROR, {});
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
    // close socket connection
    //
    socket.close();
    //
    // nicely exit node after 0.5 seconds
    //
    setTimeout(function() { process.exit(0); }, 500);
});
