var connect = require('./connect');
var http = require('http');
var sys  = require('sys');
var fs   = require('fs');

var main = connect.createServer(
    connect.staticProvider(__dirname + '/public')
);

function server1_cb(request, response) {
    var path = request.url.replace('/_esi/', "");

    setTimeout(function () {
	sys.puts("server1 responding");
	response.writeHead(200, { 'content-type': 'text/html' });
	response.write("<p>server1 response, after 5000ms</p>\n", 'ascii');
	response.end();
    }, 5000);
}

function server2_cb(request, response) {
    var path = request.url.replace('/_esi/', "");

    var timeout = 100;
    setTimeout(function () {
	sys.puts("server2 responding");
	response.writeHead(200, { 'content-type': 'text/html' });
	response.write("<p>server2 response, after " + timeout + "ms</p>\n", 'ascii');
	response.end();
    }, timeout);
}

function server3_cb(request, response) {
    var path = request.url.replace('/_esi/', "");

    sys.puts("server3 responding");
    response.writeHead(200, { 'content-type': 'text/html' });
    response.write("<p>server3 response, after 0ms</p>\n", 'ascii');
    response.end();

}

main.listen(8080);
http.createServer(server1_cb).listen(8081);
http.createServer(server2_cb).listen(8082);
http.createServer(server3_cb).listen(8083);
