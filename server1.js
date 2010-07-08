var http = require('http');
var sys  = require('sys');

function server_cb(request, response) {
    var path = request.url.replace('/_esi/', "");

    setTimeout(function () {
	sys.puts("server1 responding");
	response.writeHead(200, { 'content-type': 'text/html' });
	response.write("<p>server1 response, after 5000ms</p>\n", 'ascii');
	response.end();
    }, 5000);
}

http.createServer(server_cb).listen(8081);
