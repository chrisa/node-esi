var esi_context = exports;

var sys  = require('sys');
var url  = require('url');
var http = require('http');

var htmlparser = require("./node-htmlparser");

esi_context.createContext = function (response, proxy_response) {
    return new EsiContext(response, proxy_response);
}

function EsiContext (response, proxy_response) {
    this.subreqs = [];
    this.response = response;
    this.proxy_response = proxy_response;
    this.all_subreqs_started = false;
    this.subreqs_outstanding = 0;
    this.main_req = "";
    
    // make these available to the Handler callback
    var subreqs = this.subreqs;
    var context = this;

    var handler = new htmlparser.DefaultHandler(function(err, dom) {
	if (err) {
	    sys.debug("Error: " + err);
	}
	else {
	    // on getting here, we've received the entire main
	    // document, and should fire off the esi sub-requests
	    
	    var includes = htmlparser.DomUtils.getElements({ tag_name: "esi:include" }, dom)
	    for (i in includes) {
		var include = includes[i];

		// compose a request from the esi:include tag
		sys.debug("ESI subrequest: " + include.attribs['src']);

		var src = url.parse(include.attribs['src']);
		var client = http.createClient(src.port, src.hostname);
		var request = client.request('GET', src.pathname,
					     {'host': src.hostname});

		// init the string we'll receive this subrequest response into
		var subreq = new EsiSubrequest( include.start, include.end, include.attribs['src'] );
		subreqs.push(subreq);

		request.end();

		context.setup_response(request, subreq);
		context.subreqs_outstanding++;
 	    }
	    context.all_subreqs_started = true;

	    // hack - handle "no subrequests" case
	    context.subreq_completed();

	}
    }, { enforceEmptyTags: true });

    this.parser = new htmlparser.Parser(handler);
}

// this is here to let the listeners close over the right subreq.
EsiContext.prototype.setup_response = function (request, subreq) {
    var our_subreq = subreq;
    var context = this;

    // set up a timeout for this subrequest
    setTimeout(function () {
	our_subreq.addChunk('<div class="subreq" id="' + our_subreq.url + "\"><p>failed to load, trying again...</p></div>\n");
	context.subreqs_outstanding--;
	context.subreq_completed();
	request.removeAllListeners('response');
	request.removeAllListeners('data');
	request.removeAllListeners('end');
    }, 2500); // XXX 2.5s per subreq

    request.addListener('response', function (response) {
	// choose between inlining this response, or inlining our
	// "try-again" client-side js.
	if (response.statusCode >= 400) {

	    // client-side try-again 
	    our_subreq.addChunk('<div class="subreq" id="' + our_subreq.url + "\"><p>failed to load, trying again...</p></div>\n");
	    context.subreqs_outstanding--;
	    context.subreq_completed();
	}
	else {

	    // worked, inline this response
	    response.addListener('data', function (chunk) {
		our_subreq.addChunk(chunk);
	    });
	    response.addListener('end', function () {
		context.subreqs_outstanding--;
		context.subreq_completed();
	    });
	}
    });
};

EsiContext.prototype.chunk = function (chunk) {
    // received a chunk of main request data - pass to parser
    this.parser.parseChunk(chunk);
    this.main_req += chunk;
};

EsiContext.prototype.end = function () {
    // main request is done - parse and start esi processing
    this.parser.done();
};

EsiContext.prototype.subreq_completed = function () {

    // if we're still starting subreqs at the point one completes, wait
    if (this.all_subreqs_started == false) {
	return;
    }
    
    // if we still have subrequests outstanding, wait
    if (this.subreqs_outstanding > 0) {
	return;
    }

    // all subreqs are in, we should have the replacement docs and
    // their offsets in the main docs ready to go
    
    // compute new content-length
    var new_length = this.main_req.length;
    for (i in this.subreqs) {
	new_length += this.subreqs[i].replacement.length;
    }
    this.proxy_response.headers['content-length'] = new_length;
    this.proxy_response.headers['connection'] = 'close';
    this.response.writeHead(this.proxy_response.statusCode, this.proxy_response.headers);

    // output the main request interleaved with subrequests
    var sorted_subreqs = this.subreqs.sort(function(a, b) { a.start - b.start });

    var prev = 0;
    for (i in sorted_subreqs) {
	var subreq = sorted_subreqs[i];
	this.response.write(this.main_req.substring(prev, subreq.start - 1), 'binary');
	this.response.write(subreq.replacement, 'binary');
	prev = subreq.end + 1;
    }

    this.response.write(this.main_req.substring(prev), 'binary');
    this.response.end();
};

// --- EsiSubrequest 

function EsiSubrequest (start, end, url) {
    this.start = start;
    this.end = end;
    this.replacement = "";
    this.url = url;
}

EsiSubrequest.prototype.addChunk = function (chunk) {
    this.replacement += chunk;
};
