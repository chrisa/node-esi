var http = require('http');
var sys  = require('sys');

function server_cb(request, response) {
    var path = request.url.replace('/_esi/', "");

    var timeout = 100;
    setTimeout(function () {
	sys.puts("server2 responding");
	response.writeHead(200, { 'content-type': 'text/html' });
	response.write("<p>server2 response, after " + timeout + "ms</p>\n", 'ascii');
	response.end();
    }, timeout);
}

http.createServer(server_cb).listen(8082);
