var http = require('http');
var sys  = require('sys');

function server_cb(request, response) {
    var path = request.url.replace('/_esi/', "");

    sys.puts("server3 responding");
    response.writeHead(200, { 'content-type': 'text/html' });
    response.write("<p>server3 response, after 0ms</p>\n", 'ascii');
    response.end();

}

http.createServer(server_cb).listen(8083);
