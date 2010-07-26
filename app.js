var connect = require('./connect');

var esi_static = connect.createServer(
    connect.staticProvider(__dirname + '/esi_public')
);
var esi_tryagain = require('./esi_tryagain');
var esi_processor = require('./esi_processor');

var server = connect.createServer();
server.use('/_esi_static', esi_static);
server.use('/_esi', esi_tryagain);
server.use('/', esi_processor);

server.listen(3000);
console.log('Connect server listening on port 3000');
