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
    tls       = require('tls'),
    redis     = require('redis'),
    repeat    = 100,
    offset    = parseFloat(process.env.TIMEOFFSET),
    hostname  = require('os').hostname(),
    pid       = process.pid,
    msg       = {
        hostname: hostname,
        pid:      pid
    };
var ssl = {
    key:  fs.readFileSync('./nginx-selfsigned.key'),
    cert: fs.readFileSync('./nginx-selfsigned.crt')
};
var client = redis.createClient({
                                    host:     'raspberrypi1',
                                    prefix:   'clusterednode:',
                                    password: 'N0d3p0c',
                                    db:       0,
                                    tls:      ssl
                                });
client.on("error", function(err) {
    console.log("redis.io Error: " + err);
});
promise.promisifyAll(redis.RedisClient.prototype);
promise.promisifyAll(redis.Multi.prototype);
var setKey = function(cb, respon) {
    var id       = parseInt(Math.random() * repeat),
        ts       = Date.now(),
        obj      = {hostname: hostname, pid: pid, ts: ts},
        startAtR = process.hrtime();
    client.hmsetAsync(id, obj).then(function(res) {
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
var getKey = function(cb, respon) {
    var id       = parseInt(Math.random() * repeat),
        startAtR = process.hrtime();
    client.hgetallAsync(id).then(function(res) {
        var diffR = process.hrtime(startAtR),
            timeR = diffR[0] * 1e3 + diffR[1] * 1e-6;
        respon.setHeader('X-Redis-Time', timeR.toFixed(3));
        cb(true, (res === null) ? {} : res);
    }, function(err) {
        cb(false, {});
    });
};
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
}).listen(process.env.NODEPORT);
process.on('SIGINT', function() {
    client.quit();
    server.close();
    setTimeout(function() { process.exit(0); }, 300);
});
