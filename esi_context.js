var esi_context = exports;

var http = require('http');
var sys  = require('sys');
var fs   = require('fs');
var url  = require('url');

esi_context.newEsiContext = function(response, proxy_response) {
    return new EsiContext(response, proxy_response);
}

// ---- EsiContext

function EsiContext (response, proxy_response) {
    this.subreqs = [];
    this.response = response;
    this.proxy_response = proxy_response;
    this.all_subreqs_started = false;
    this.subreqs_outstanding = 0;
    this.main_req = "";
    this.response_sent = false;
}

EsiContext.prototype.chunk = function (chunk) {
    this.main_req += chunk;
};

EsiContext.prototype.end = function () {
    // main request is done - parse and start esi processing
    var stripped_req = "";

    // strip out <!--esi --> comments
    var start = 0;
    var pos;
    var str;
    while (pos = this.main_req.indexOf('<!--esi', start)) {
	if (pos < 0)
	    break;
	
	stripped_req += this.main_req.substr(start, (pos - start));

	var end = this.main_req.indexOf('-->', pos);
	stripped_req += this.main_req.substr(pos + 8, end - (pos + 8));

	start = end + 4;
    }
    str = this.main_req.substr(start);
    stripped_req += str;
    this.main_req = stripped_req;

    start = 0;
    while (pos = stripped_req.indexOf('<esi:', start)) {
	if (pos < 0)
	    break;
	
	var tag = this.parse_tag_at(pos);
	start = tag.end;

	if (tag.tag == 'esi:include') {
	    var handler = new EsiInclude( this, tag.start, tag.end, tag.attribs['src'] );
	}
	// else if (tag == ...
	
	this.subreqs.push(handler.subrequest());
	this.subreqs_outstanding++;
    }
    this.all_subreqs_started = true;
    
    // hack - handle "no subrequests" case
    this.subreq_completed();
};

EsiContext.prototype.parse_tag_at = function (pos) {
    // node-htmlparser's regexps
    var attrib_regex = /([^=<>\"\'\s]+)\s*=\s*"([^"]*)"|([^=<>\"\'\s]+)\s*=\s*'([^']*)'|([^=<>\"\'\s]+)\s*=\s*([^'"\s]+)|([^=<>\"\'\s\/]+)/g;
    var tag_regex = /^\s*(\/?)\s*([^\s\/]+)/;

    var end = this.main_req.indexOf('>', pos);
    
    var element = this.main_req.substr(pos + 1, (end - (pos + 1)));
    var match = tag_regex.exec(element);
    if (match) {
	var tag = match[0];
    }
    var attrib_raw = this.main_req.substr((pos + tag.length + 1), (end - (pos + tag.length)));
    
    var attribs = {};
    var match;
    
    attrib_regex.lastIndex = 0;
    while (match = attrib_regex.exec(attrib_raw)) {
	if (typeof match[1] == "string" && match[1].length) {
	    attribs[match[1]] = match[2];
	} else if (typeof match[3] == "string" && match[3].length) {
	    attribs[match[3].toString()] = match[4].toString();
	} else if (typeof match[5] == "string" && match[5].length) {
	    attribs[match[5]] = match[6];
	} else if (typeof match[7] == "string" && match[7].length) {
	    attribs[match[7]] = match[7];
	}
    }
    
    var data = {
	tag: tag,
	start: pos + 1,
	end: end,
	attribs: attribs
    };

    return data;
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

    // if the response has already been sent, do nothing
    if (this.response_sent == true) {
	return;
    }

    // all subreqs are in, we should have the replacement docs and
    // their offsets in the main docs ready to go

    // compute new content-length
    var new_length = this.main_req.length;
    for (i in this.subreqs) {
	// add replacement length
	new_length += this.subreqs[i].replacement.length;

	// subtract old tag length
	new_length -= ((this.subreqs[i].end - this.subreqs[i].start) + 2);
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

    this.response_sent = true;
};

// --- EsiSubrequest 

function EsiSubrequest (context, start, end, url) {
    this.context = context;
    this.start = start;
    this.end = end;
    this.replacement = "";
    this.url = url;
}

EsiSubrequest.prototype.addChunk = function (chunk) {
    this.replacement += chunk;
};

EsiSubrequest.prototype.complete = function () {
    this.context.subreqs_outstanding--;
    this.context.subreq_completed();
}

// --- EsiInclude

function EsiInclude (context, start, end, src) {
    var srcurl = url.parse(src);
    var client = http.createClient(srcurl.port, srcurl.hostname);
    var request = client.request('GET', srcurl.pathname,
				 {'host': srcurl.hostname});
    request.end();

    this.subreq = new EsiSubrequest(context, start, end, src);
    this.setup_response(request, this.subreq);
}

EsiInclude.prototype.subrequest = function () {
    return this.subreq;
};

EsiInclude.prototype.setup_response = function (request, subreq) {

    // set up a timeout for this subrequest
    var timeout = 500;
    setTimeout(function () {
	subreq.addChunk('<div class="subreq" id="' + subreq.url + 
			    "\"><p>failed to load after " + timeout + 
			    "ms, trying again...<img src=\"/_esi/spinner.gif\"></p></div>\n"
			   );
	subreq.complete();
	request.removeAllListeners('response');
	request.removeAllListeners('data');
	request.removeAllListeners('end');
    }, 500);

    request.addListener('response', function (response) {
	if (response.statusCode >= 400) {

	    // client-side try-again 
	    subreq.addChunk('<div class="subreq" id="' + subreq.url + 
				"\"><p>failed to load after error, trying again...</p></div>\n"
			       );
	    subreq.complete();
	}
	else {

	    // worked, inline this response
	    response.addListener('data', function (chunk) {
		subreq.addChunk(chunk);
	    });
	    response.addListener('end', function () {
		subreq.complete();
	    });
	}
    });
};
