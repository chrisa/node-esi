var connect = require('./connect');
var http = require('http');
var sys  = require('sys');
var fs   = require('fs');
var url  = require('url');

var server = module.exports = connect.createServer();

server.use('', function(req, res){
    var query = url.parse(req.url, true).query;
    if (query) {
	var esi = query['url'];
	
	if (esi) {
	    var esi_url = url.parse(esi);
	    req.headers['host'] = esi_url.hostname;
	    var proxy = http.createClient(esi_url.port, esi_url.hostname)
	    proxy.addListener('error', function () {
		res.writeHead(400);
		res.end('error');
	    });

	    var proxy_req = proxy.request("GET", esi_url.pathname, req.headers);

	    proxy_req.addListener('error', function () {
		res.writeHead(400);
		res.end("error");
	    });
		
	    proxy_req.addListener('response', function(proxy_res) {
		proxy_res.addListener('data', function(chunk) {
		    res.write(chunk, 'binary');
		});
		proxy_res.addListener('end', function() {
		    res.end();
		});
		proxy_res.addListener('error', function() {
		    res.writeHead(400);
		    res.end("error");
		});
		res.writeHead(proxy_res.statusCode, proxy_res.headers);
	    });
		
	    proxy_req.end();
	}
    }
});
