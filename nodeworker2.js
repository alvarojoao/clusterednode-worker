require('pmx').init({
                        http:          true, // HTTP routes logging (default: true)
                        errors:        true, // Exceptions loggin (default: true)
                        custom_probes: true, // Auto expose JS Loop Latency and HTTP req/s as custom metrics
                        network:       true, // Network monitoring at the application level
                        ports:         false // Shows which ports your app is listening on (default: false)
                    });
var http2     = require('http2'),
    onHeaders = require('on-headers'),
    fs        = require('fs'),
    offset    = parseFloat(process.env.TIMEOFFSET),
    msg       = '{"hostname":"' + require('os').hostname() + '","pid":' + process.pid + '}';
var server = http2.createServer({
                                    key:  fs.readFileSync('./nginx-selfsigned.key'),
                                    cert: fs.readFileSync('./nginx-selfsigned.crt')
                                }, function(req, res) {
    var startAt = process.hrtime();
    onHeaders(res, function onHeaders() {
        var diff = process.hrtime(startAt),
            time = diff[0] * 1e3 + diff[1] * 1e-6 + offset;
        res.setHeader('X-Node-Time', time.toFixed(3));
    });
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', 'Mon, 26 Jul 1997 05:00:00 GMT');
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, Pragma, Cache-Control, If-Modified-Since, X-ReqId");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-ReqId", req.headers['x-reqid'] || "-1");
    res.end(msg);
}).listen(8010);
process.on('SIGINT', function() {
    server.close();
    setTimeout(function() { process.exit(0); }, 300);
});
