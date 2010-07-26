var connect = require('./connect');
var http = require('http');
var sys  = require('sys');
var fs   = require('fs');
var url  = require('url');

var esi_context = require('./esi_context');

var upstream_host = "localhost";
var upstream_port = 8080;

var server = module.exports = connect.createServer();

server.use('', function(req, res){
    var proxy = http.createClient(upstream_port, upstream_host)
    var proxy_req = proxy.request("GET", req.url, req.headers);
    
    proxy_req.addListener('response', function(proxy_res) {
	if (proxy_res.headers['content-type'] && proxy_res.headers['content-type'].indexOf('text/html') == 0) {

	    // text/html - doing ESI processing
	    var context = esi_context.newEsiContext(res, proxy_res);
	    
	    proxy_res.addListener('data', function(chunk) {
		context.chunk(chunk);
	    });
	    proxy_res.addListener('end', function() {
		context.end();
	    });
	}
	else {
	    // other - passthrough
	    proxy_res.addListener('data', function(chunk) {
		res.write(chunk, 'binary');
	    });
	    proxy_res.addListener('end', function() {
		res.end();
	    });
	    res.writeHead(proxy_res.statusCode, proxy_res.headers);
	}
    });

    // pass POSTdata through to upstream
    req.addListener('data', function(chunk) {
	proxy_req.write(chunk, 'binary');
    });
    req.addListener('end', function() {
	proxy_req.end();
    });
});
