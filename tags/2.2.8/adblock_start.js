// If url is relative, convert to absolute.
function relativeToAbsoluteUrl(url) {
    // Author: Tom Joseph of AdThwart
    
    if(!url)
        return url;
    // If URL is already absolute, don't mess with it
    if(/^http/.test(url))
        return url;
    // Leading / means absolute path
    if(url[0] == '/')
        return document.location.protocol + "//" + document.location.host + url;

    // Remove filename and add relative URL to it
    var base = document.baseURI.match(/.+\//);
    if(!base) return document.baseURI + "/" + url;
    return base[0] + url;
}

// Return the ElementType element type of the given element.
function typeForElement(el) {
  // TODO: handle background images that aren't just the BODY.
  switch (el.nodeName) {
    case 'IMG': return ElementTypes.image;
    case 'SCRIPT': return ElementTypes.script;
    case 'OBJECT': 
    case 'EMBED': return ElementTypes.object;
    case 'IFRAME': return ElementTypes.subdocument;
    case 'LINK': return ElementTypes.stylesheet;
    case 'BODY': return ElementTypes.background;
    default: return ElementTypes.NONE;
  }
}

// Browser-agnostic canLoad function.
// Returns false if data.url, data.elType, and data.pageDomain together
// should not be blocked.
function browser_canLoad(event, data) {
  if (SAFARI) {
    return safari.self.tab.canLoad(event, data);
  } else {
    // If we haven't yet asynchronously loaded our filters, store for later.
    if (typeof _limited_to_domain == "undefined") {
      if (!(data.elType & ElementTypes.script)) {
        event.mustBePurged = true;
        LOADED_TOO_FAST.push({data:event});
      }
      return true;
    }

    // every time browser_canLoad is called on this page, the pageDomain will
    // be the same -- so we can just check _limited_to_domain which we
    // calculated once.  This takes less memory than storing local_filterset
    // on the page.
    var isMatched = data.url && _limited_to_domain.matches(data.url, data.elType);
    if (isMatched && event.mustBePurged)
      log("Purging if possible " + data.url);
    else if (isMatched)
      log("CHROME TRUE BLOCK " + data.url);
    return !isMatched;
  }
}

beforeLoadHandler = function(event) {
  var el = event.target;
  // Cancel the load if canLoad is false.
  var elType = typeForElement(el);
  var data = { 
    url: relativeToAbsoluteUrl(event.url),
    elType: elType,
    pageDomain: document.domain, 
    isTopFrame: (window == window.top) 
  };
  if (false == browser_canLoad(event, data)) {
    event.preventDefault();
    if (elType & ElementTypes.background)
      $(el).css("background-image", "none !important");
    else if (!(elType & (ElementTypes.script | ElementTypes.stylesheet)))
      $(el).remove();
  }
}

// Add style rules hiding the given list of selectors.
function block_list_via_css(selectors) {
  var d = document.documentElement;
  // Setting this small chokes Chrome -- don't do it!  I set it back to
  // 10000 from 100 on 1/10/2010 -- at some point you should just get rid
  // of the while loop if you never use chunking again.
  var chunksize = 10000;
  while (selectors.length > 0) {
    var css_chunk = document.createElement("style");
    css_chunk.type = "text/css";
    css_chunk.innerText += selectors.splice(0, chunksize).join(',') +
                               " { visibility:hidden !important; " +
                               "   display:none !important; }";
    d.insertBefore(css_chunk, null);
  }
}

function adblock_begin() {
  if (!SAFARI)
    LOADED_TOO_FAST = [];

  document.addEventListener("beforeload", beforeLoadHandler, true);

  var opts = { domain: document.domain, include_filters: !SAFARI };
  // The top frame should tell the background what domain it's on.  The
  // subframes will be told what domain the top is on.
  if (window == window.top)
    opts.is_top_frame = true;

  extension_call('get_content_script_data', opts, function(data) {
    var start = new Date();

    if (data.features.debug_logging.is_enabled) {
      DEBUG = true;
      log = function(text) { console.log(text); };
    }
    if (data.features.debug_time_logging.is_enabled)
      time_log = function(text) { console.log(text); };

    if (data.page_is_whitelisted || data.adblock_is_paused) {
      document.removeEventListener("beforeload", beforeLoadHandler, true);
      delete LOADED_TOO_FAST;
      return;
    }

    //Chrome can't block resources immediately. Therefore all resources
    //are cached first. Once the filters are loaded, simply remove them
    if (!SAFARI) {
      var local_filterset = FilterSet.fromText(data.filtertext);
      _limited_to_domain = local_filterset.limitedToDomain(document.domain);

      // We don't need these locally, so delete them to save memory.
      delete _limited_to_domain._selectorFilters;
      delete _limited_to_domain._domainLimitedCache;

      for (var i=0; i < LOADED_TOO_FAST.length; i++)
        beforeLoadHandler(LOADED_TOO_FAST[i].data);
      delete LOADED_TOO_FAST;
    }

    block_list_via_css(data.selectors);

    var end = new Date();
    time_log("adblock_start run time: " + (end - start) + " ms || " +
             document.location.href);
  });

}

// Safari loads adblock on about:blank pages, which is a waste of RAM and cycles.
if (document.location != 'about:blank')
  adblock_begin();