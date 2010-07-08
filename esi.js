var http = require('http');
var sys  = require('sys');
var fs   = require('fs');
var url  = require('url');

var esi_context = require('./esi_context');

function server_cb(request, response) {
    
    // XXX config
    var upstream = "localhost";

    var query = url.parse(request.url, true).query;
    if (query) {
	var esi = query['url'];
    }

    if (request.url.indexOf('/_esi') == 0 && esi) {
	sys.debug("try again request for: " + esi);

	// try-again esi proxy request
	var esi_url = url.parse(esi);
	request.headers['host'] = esi_url.hostname;
	var proxy = http.createClient(esi_url.port, esi_url.hostname)
	var proxy_request = proxy.request("GET", esi_url.pathname, request.headers);
	
	proxy_request.addListener('response', function(proxy_response) {
	    proxy_response.addListener('data', function(chunk) {
		    response.write(chunk, 'binary');
	    });
	    proxy_response.addListener('end', function() {
		response.end();
	    });
	    response.writeHead(proxy_response.statusCode, proxy_response.headers);
	});
	proxy_request.end();
    }
    else if (request.url.indexOf('/_esi/') == 0) {

	// esi-reloading request for static file
	var path = request.url.replace('/_esi/', "");
	response.writeHead(200, {});
	
	var file = fs.createReadStream(path);
	file.addListener('data', function (data) {
	    response.write(data, 'binary');
	});
	file.addListener('end', function () {
	    response.end();
	});
    }
    else {
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
}

http.createServer(server_cb).listen(8080);

