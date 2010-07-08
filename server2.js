var http = require('http');
var sys  = require('sys');

function server_cb(request, response) {
    var path = request.url.replace('/_esi/', "");

    setTimeout(function () {
	sys.puts("server2 responding");
	response.writeHead(200, { 'content-type': 'text/html' });
	response.write("<p>server2 response</p>\n", 'ascii');
	response.end();
    }, 1000);
}

http.createServer(server_cb).listen(8082);
