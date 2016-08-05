require('pmx').init({
                        http:          true, // HTTP routes logging (default: true)
                        errors:        true, // Exceptions loggin (default: true)
                        custom_probes: true, // Auto expose JS Loop Latency and HTTP req/s as custom metrics
                        network:       true, // Network monitoring at the application level
                        ports:         false // Shows which ports your app is listening on (default: false)
                    });
const http2 = require('http2'),
    onHeaders = require('on-headers'),
    fs = require('fs'),
    url = require('url'),
    os = require('os'),
    Redis = require('ioredis'),
    hostname    = os.hostname(),
    net           = os.networkInterfaces(),
    netIf         = (net.eth1 === undefined) ? '127.0.0.1' : net.eth1[0].address,
    pid           = process.pid,
    rmOK          = 'OK',
    rmERROR       = 'ERR',
    raSET         = 'SET',
    raGET         = 'GET',
    raTRANSACTION = 'TRN',
    raPIPELINE    = 'PPL',
    hdREDIS       = 'x-redis-time',
    hdNODE        = 'x-node-time';
let redisReady    = false;
// Defines certificates for enabling TLSv1.2
//
const sslCerts = {
    key:  fs.readFileSync('./nginx-selfsigned.key'),
    cert: fs.readFileSync('./nginx-selfsigned.crt')
};
//
// Create redis cluster client
//
const cluster = new Redis.Cluster(
    [
        {port: 6379, host: "127.0.0.1"},
        {port: 6378, host: "127.0.0.1"},
        {port: 6377, host: "127.0.0.1"},
        {port: 6376, host: "127.0.0.1"},
        {port: 6375, host: "127.0.0.1"},
        {port: 6374, host: "127.0.0.1"}
    ],
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
cluster.on("ready", () => {
    redisReady = true;
    console.log("redis.io cluster connections opened - ready to serve");
});
cluster.on("end", () => {
    redisReady = false;
    console.log("redis.io cluster connections closed");
});
cluster.on("error", err => {
    console.log("redis.io Error: " + err);
});
cluster.on("node error", err => {
    console.log("redis.io node Error: " + err);
});
//
// Create diff hrtime header
//
function createDiffHrtimeHeader(headerLabel, startHRTime, httpResponse) {
    const diffR = process.hrtime(startHRTime),
        timeR = diffR[0] * 1e3 + diffR[1] * 1e-6;
    httpResponse.setHeader(headerLabel, timeR.toFixed(3));
}
//
// Message handlers
//
function messageHandler(jsonMsg, httpResponse, redisAction, redisValue) {
    jsonMsg.a = redisAction;
    jsonMsg.o = redisValue;
    httpResponse.end(JSON.stringify(jsonMsg));
}
//
// Send default ERR response due to a Redis error
//
function sendRedisError(jsonMsg, redisError, httpResponse, startHRTime) {
    createDiffHrtimeHeader(hdREDIS, startHRTime, httpResponse);
    messageHandler(jsonMsg, httpResponse, rmERROR, {});
    //console.log(redisError);
}
//
// Send composite message based on Redis results
//
function sendRedisResults(jsonMsg, httpResponse, redisAction, redisValue, startHRTime) {
    createDiffHrtimeHeader(hdREDIS, startHRTime, httpResponse);
    messageHandler(jsonMsg, httpResponse, redisAction, redisValue);
}
//
// Create jsonObject
//
function jsonObject() {
    return {
        h: hostname,
        p: pid,
        t: Date.now()
    };
}
//
// Generic call wrapper
//
function genericCallWrapper(jM, hR, p, prCb, okCb) {
    const src = process.hrtime();
    prCb(p).then(
        okCb(jM, hR, src),
        rE => sendRedisError(jM, rE, hR, src)
    );
}
//
// Prepare multicommand pipeline (for PIPELINE and TRANSACTION)
//
function prepareCommands(p) {
    return [
        ['hgetall',
         p],
        ['hmset',
         p,
         jsonObject()]
    ];
}
//
// Prepare execution function stack
//
const executionMatrix = [
    //
    // HGETALL call
    //
    [
        p => { return cluster.hgetall(p); },
        (jM, hR, src) => {
            return rM => sendRedisResults(jM, hR, raGET, (rM === '') ? {} : rM, src);
        }
    ],
    //
    // HMSET call
    //
    [
        p => { return cluster.hmset(p, jsonObject()); },
        (jM, hR, src) => {
            return rM => sendRedisResults(jM, hR, (rM === rmOK) ? raSET : rmERROR, {}, src);
        }
    ],
    //
    // PIPELINE call
    //
    [
        p => { return cluster.pipeline(prepareCommands(p)).exec(); },
        (jM, hR, src) => {
            return rM => sendRedisResults(jM, hR, raPIPELINE, (rM.length === 0) ? {} : rM[0][1], src);
        }
    ],
    //
    // TRANSACTION call
    //
    [
        p => { return cluster.multi(prepareCommands(p)).exec(); },
        (jM, hR, src) => {
            return rM => sendRedisResults(jM, hR, raTRANSACTION, (rM.length === 0) ? {} : rM[0][1], src);
        }
    ]
];
//
// Set HTTP headers
//
function setAllHeaders(hRq, hR) {
    hR.setHeader("Access-Control-Allow-Origin", "*");
    hR.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Pragma, Cache-Control, If-Modified-Since, x-reqid");
    hR.setHeader("Content-Type", "application/json");
}
//
// Main HTTPS server handler
//
const server = http2.createServer(sslCerts, (hRq, hR) => {
    const startNodeCall = process.hrtime(),
        params        = url.parse(hRq.url, true).query,
        o             = params.o || 0,
        p             = params.p || 0;
    let jM            = {
            h: hostname,
            p: pid
        };
    onHeaders(hR, function onHeaders () {
        createDiffHrtimeHeader(hdNODE, startNodeCall, hR);
    });
    setAllHeaders(hRq, hR);
    if (redisReady) {
        genericCallWrapper(jM, hR, p, executionMatrix[o][0], executionMatrix[o][1]);
    }
    else {
        hR.setHeader(hdREDIS, 0);
        messageHandler(jM, hR, rmERROR, {});
    }
}).listen(process.env.NODEPORT, netIf);
//
// Enables graceful stop/reload - nicely closes connections to redis and closes HTTPS server
// enabling last transactions, both on redis and HTTPS server to be completed before exiting
//
process.on('SIGINT', () => {
    //
    // finishes all redis transactions and closes connection with redis
    //
    cluster.quit();
    //
    // finishes all HTTP/2 responses and close server
    //
    server.close();
    //
    // nicely exit node after 0.3 seconds
    //
    setTimeout(() => process.exit(0), 300);
});
