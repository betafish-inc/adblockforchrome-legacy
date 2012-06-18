var elementPurger = {
  onPurgeRequest: function(request, sender, sendResponse) {
    if (request.command === 'purge-elements' &&
        request.frameUrl === document.location.href.replace(/#.*$/, ""))
      elementPurger._purgeElements(request.elType, request.url);

    sendResponse({});
  },

  // Remove elements on the page of |elType| that request |url|.
  // Will try again if none are found unless |lastTry|.
  _purgeElements: function(elType, url, lastTry) {
    log("[DEBUG]", "Purging:", lastTry, elType, url);

    var tags = {};
    tags[ElementTypes.image] = { IMG:1 };
    tags[ElementTypes.subdocument] = { IFRAME:1, FRAME: 1 };
    tags[ElementTypes.object] = { "OBJECT":1, EMBED:1 };

    var srcdata = this._srcsFor(url);
    for (var i=0; i < srcdata.length; i++) {
      for (var tag in tags[elType]) {
        var src = srcdata[i];
        var attr = (tag === "OBJECT" ? "data" : "src");
        var selector = tag + '[' + attr + src.op + '"' + src.text + '"]';

        var results = document.querySelectorAll(selector);
        for (var j=0; j < results.length; j++) {
          destroyElement(results[j], elType);
        }
        log("[DEBUG]", "  ", results.length, "results for selector:", selector);
        if (results.length)
          return; // I doubt the same URL was loaded via 2 different src attrs.
      }
    }

    // No match; try later.  We may still miss it (race condition) in which
    // case we give up, rather than polling every second or waiting 10 secs
    // and causing a jarring page re-layout.
    if (!lastTry) {
      var that = this;
      setTimeout(function() { that._purgeElements(elType, url, true); }, 2000);
    }
  },

  // Return a list of { op, text }, where op is a CSS selector operator and
  // text is the text to select in a src attr, in order to match an element on
  // this page that could request the given absolute |url|.
  _srcsFor: function(url) {
    // NB: <img src="a#b"> causes a request for "a", not "a#b".  I'm
    // intentionally ignoring IMG tags that uselessly specify a fragment.
    // AdBlock will fail to hide them after blocking the image.
    var url_parts = parseUri(url), page_parts = this._page_location;
    var results = [];
    // Case 1: absolute (of the form "abc://de.f/ghi" or "//de.f/ghi")
    results.push({ op:"$=", text: url.match(':(//.*)$')[1] });
    if (url_parts.hostname === page_parts.hostname) {
      var url_search_and_hash = url_parts.search + url_parts.hash;
      // Case 2: The kind that starts with '/'
      results.push({ op:"=", text: url_parts.pathname + url_search_and_hash });
      // Case 3: Relative URL
      var page_dirs = page_parts.pathname.split('/');
      var url_dirs = url_parts.pathname.split('/');
      var i = 0;
      while (page_dirs[i] === url_dirs[i] 
             && i < page_dirs.length - 1 
             && i < url_dirs.length - 1) {
        i++; // i is set to first differing position
      }
      var dir = new Array(page_dirs.length - i).join("/..").substring(1);
      var path = url_dirs.slice(i).join("/") + url_search_and_hash;
      var src = dir + (dir ? "/" : "") + path;
      results.push({ op:"=", text: src });
    }

    return results;
  },

  // To enable testing
  _page_location: document.location
};

function adblock_begin_new_style() {
  chrome.extension.onRequest.addListener(elementPurger.onPurgeRequest);

  var opts = { 
    domain: document.location.hostname,
    style: "new"
  };
  BGcall('get_content_script_data', opts, function(data) {
    if (data.abort || data.page_is_whitelisted || data.adblock_is_paused) {
      // Our services aren't needed.  Stop all content script activity.
      chrome.extension.onRequest.removeListener(elementPurger.onPurgeRequest);
      return;
    }

    if (data.settings.debug_logging)
      log = function() { 
        if (VERBOSE_DEBUG || arguments[0] != '[DEBUG]')
          console.log.apply(console, arguments); 
      };

    if (data.selectors.length != 0)
      block_list_via_css(data.selectors);

    if (data.settings.debug_logging) {
      onReady(function() { debug_print_selector_matches(data.selectors, "new"); });
    }

    // Run site-specific code to fix some errors, but only if the site has them
    if (typeof run_bandaids == "function")
      onReady(function() { run_bandaids("new"); });
  });
}


// Safari loads adblock on about:blank pages, which is a waste of RAM and cycles.
// If document.documentElement instanceof HTMLElement is false, we're not on an HTML page
// if document.documentElement doesn't exist, we're in Chrome 18
if (document.location != 'about:blank' && (!document.documentElement || document.documentElement instanceof HTMLElement)) {
  adblock_begin_new_style();
}