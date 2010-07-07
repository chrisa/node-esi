var http = require('http');
var sys  = require('sys');
var fs   = require('fs');

var esi_context = require('./esi_context');

function server_cb(request, response) {
    var upstream = "heals.local";
    sys.debug("requesting: http://" + upstream + request.url);

    var proxy = http.createClient(80, upstream)
    var proxy_request = proxy.request("GET", request.url, request.headers);
    
    proxy_request.addListener('response', function(proxy_response) {
	if (proxy_response.headers['content-type'] && proxy_response.headers['content-type'].indexOf('text/html') == 0) {

	    // text/html - doing ESI processing
	    var context = esi_context.createContext(response, proxy_response);
	    
	    proxy_response.addListener('data', function(chunk) {
		context.chunk(chunk);
	    });
	    proxy_response.addListener('end', function() {
		context.end();
	    });
	}
	else {
	    // other - passthrough
	    proxy_response.addListener('data', function(chunk) {
		response.write(chunk, 'binary');
	    });
	    proxy_response.addListener('end', function() {
		response.end();
	    });
	    response.writeHead(proxy_response.statusCode, proxy_response.headers);
	}
    });

    // pass POSTdata through to upstream
    request.addListener('data', function(chunk) {
	proxy_request.write(chunk, 'binary');
    });
    request.addListener('end', function() {
	proxy_request.end();
    });
}

http.createServer(server_cb).listen(8080);

