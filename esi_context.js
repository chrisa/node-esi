var esi_context = exports;

var htmlparser = require("node-htmlparser/node-htmlparser");
var sys = require('sys');
var url  = require('url');
var http = require('http');

esi_context.createContext = function (response) {
    return new EsiContext(response);
}

function EsiContext (response) {
    this.subreqs = [];
    this.response = response;
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

		// init the string we'll receive this subrequest response into
		var subreq = new EsiSubrequest( include.start, include.end );
		subreqs.push(subreq);
		
		// compose a request from the esi:include tag
		sys.debug("requesting: " + include.attribs['src']);
		var src = url.parse(include.attribs['src']);
		var client = http.createClient(80, src.host);
		var request = client.request('GET', src.pathname,
					     {'host': src.host});
		request.end();
		
		request.addListener('response', function (response) {
		    response.setEncoding('utf8');
		    response.addListener('data', function (chunk) {
			subreq.addChunk(chunk);
		    });
		    response.addListener('end', function () {
			context.subreqs_outstanding--;
			context.subreq_completed();
		    });
		});
		context.subreqs_outstanding++;
 	    }
	    context.all_subreqs_started = true;

	    // hack - handle "no subrequests" case
	    context.subreq_completed();

	}
    }, { enforceEmptyTags: true });

    this.parser = new htmlparser.Parser(handler);
}

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
	sys.debug("still starting subrequests");
	return;
    }
    
    // if we still have subrequests outstanding, wait
    if (this.subreqs_outstanding > 0) {
	sys.debug("still " + this.subreqs_outstanding + " subrequests outstanding");
	return;
    }

    sys.debug("completing ESI request");

    // all subreqs are in, we should have the replacement docs and
    // their offsets in the main docs ready to go

    var sorted_subreqs = this.subreqs.sort(function(a, b) { a.start - b.start });
    var prev = 0;
    for (i in sorted_subreqs) {
	var subreq = sorted_subreqs[i];
	
	this.response.write(this.main_req.substring(prev, subreq.start - 1));
	this.response.write(subreq.replacement);
	
	prev = subreq.end + 1;
    }

    this.response.write(this.main_req.substring(prev));
    this.response.end();
};

// --- EsiSubrequest 

function EsiSubrequest (start, end) {
    this.start = start;
    this.end = end;
    this.replacement = "";
}

EsiSubrequest.prototype.addChunk = function (chunk) {
    this.replacement += chunk;
};
