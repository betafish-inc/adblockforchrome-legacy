// ==UserScript==
// @include http://*
// @include https://*
// ==/UserScript==

// Return the ElementType element type of the given element.
function typeForElement(el) {
  // TODO: handle background images that aren't just the BODY.
  switch (el.nodeName.toUpperCase()) {
    case 'INPUT': 
    case 'IMG': return ElementTypes.image;
    case 'SCRIPT': return ElementTypes.script;
    case 'OBJECT': 
    case 'EMBED': return ElementTypes.object;
    case 'VIDEO': 
    case 'AUDIO': 
    case 'SOURCE': return ElementTypes.media;
    case 'FRAME': 
    case 'IFRAME': return ElementTypes.subdocument;
    case 'LINK': 
      // favicons are reported as 'other' by onBeforeRequest.
      // if this is changed, we should update this too.
      if (/(^|\s)icon($|\s)/i.test(el.rel))
        return ElementTypes.other;
      return ElementTypes.stylesheet;
    default: return ElementTypes.NONE;
  }
}

// If url is relative, convert to absolute.
function relativeToAbsoluteUrl(url) {
  // Author: Tom Joseph of AdThwart

  if (!url)
    return url;

  // If URL is already absolute, don't mess with it
  if (/^[a-zA-Z\-]+\:/.test(url))
    return url;

  if (url[0] == '/') {
    // Leading // means only the protocol is missing
    if (url[1] && url[1] == "/")
      return document.location.protocol + url;

    // Leading / means absolute path
    return document.location.protocol + "//" + document.location.host + url;
  }

  // Remove filename and add relative URL to it
  var base = document.baseURI.match(/.+\//);
  if (!base) 
    return document.baseURI + "/" + url;
  return base[0] + url;
}

//Do not make the frame display a white area
//Not calling .remove(); as this causes some sites to reload continuesly
function removeFrame(el) {
  var parentEl = el.parentNode;
  var cols = ((parentEl.getAttribute('cols') || "").indexOf(',') > 0);
  if (!cols && (parentEl.getAttribute('rows') || "").indexOf(',') <= 0)
    return;
  // Figure out which column or row to hide
  var index = 0;
  while (el.previousElementSibling) {
    index++;
    el = el.previousElementSibling;
  }
  // Convert e.g. '40,20,10,10,10,10' into '40,20,10,0,10,10'
  var attr = (cols ? 'cols' : 'rows');
  var sizes = parentEl.getAttribute(attr).split(',');
  sizes[index] = "0";
  parentEl.setAttribute(attr, sizes.join(','));
}

// Remove an element from the page.
function destroyElement(el, elType) {
  if (el.nodeName === "FRAME") {
    removeFrame(el);
  } else {
    // There probably won't be many sites that modify all of these.
    // However, if we get issues, we might have to set the location and size
    // via the css properties position, left, top, width and height
    el.style.setProperty("display", "none", "important");
    el.style.setProperty("visibility", "hidden", "important");
    el.style.setProperty("opacity", "0", "important");
    var w = (el.width === undefined ? -1 : el.width);
    var h = (el.height === undefined ? -1 : el.height);
    el.style.setProperty("background-position", w + "px " + h + "px");
    el.setAttribute("width", 0);
    el.setAttribute("height", 0);
  }
}

// Add style rules hiding the given list of selectors.
function block_list_via_css(selectors) {
  if (!selectors.length)
    return;
  var css_chunk = document.createElement("style");
  css_chunk.setAttribute('type', "text/css");
  (document.head || document.documentElement).appendChild(css_chunk); // Documents may not have a head
  css_chunk.sheet.insertRule(selectors.join(",") + " { display:none !important; }", 0);
}

function debug_print_selector_matches(selectors) {
  selectors.
    filter(function(selector) { return document.querySelector(selector); }).
    forEach(function(selector) {
      var matches = "";
      var elems = document.querySelectorAll(selector);
      for (var i=0; i<elems.length; i++) {
        var el = elems[i];
        matches += "        " + el.nodeName + "#" + el.id + "." + el.className + "\n";
      }
      // When we support resourceblock in opera, implement this differently
      log("Debug: CSS '" + selector + "' hid:");
      log(matches);
    });
}

function handleABPLinkClicks() {
  // Subscribe to the list when you click an abp: link
  var elems = document.querySelectorAll('[href^="abp:"], [href^="ABP:"]');
  var abplinkhandler = function(event) {
    event.preventDefault();
    var searchquery = this.href.replace(/^.+?\?/, '?');
    if (searchquery) {
      var queryparts = parseUri.parseSearch(searchquery);
      var loc = queryparts.location;
      var reqLoc = queryparts.requiresLocation;
      var reqList = (reqLoc ? "url:" + reqLoc : undefined);
      BGcall("subscribe", {id: "url:" + loc, requires: reqList, fromABPlink: true});
    }
  };
  for (var i=0; i<elems.length; i++) {
    elems[i].addEventListener("click", abplinkhandler, false);
  }
}

// Called at document load.
// inputs:
//   startPurger: function to start watching for elements to remove.
//   stopPurger: function to stop watch for elemenst to remove, called in case
//               AdBlock should not be running.
//   success?: function called at the end if AdBlock should run on the page.
function adblock_begin(inputs) {
  try {
    document.documentElement.appendChild
    //document.body.appendChild
  } catch(ex) {
    window.setTimeout(function() {adblock_begin(inputs)}, 0);
    return;
  }

  inputs.startPurger();

  var opts = { domain: document.location.hostname };
  
  // Popup blocker information
  try {
    if (window.opener) {
      opts.opener = window.opener.location.href;
    }
  } catch (ex) {
    // Some security error things if you for example have a https frame on a http page
  }
  
  BGcall('get_content_script_data', opts, function(data) {
    if (data.page_is_whitelisted || data.adblock_is_paused || data.disabled_site) {
      inputs.stopPurger();
      return;
    }
    
    if (data.closePopup) {
      window.close();
      return;
    }

    if (data.settings.debug_logging)
      log = function() { 
        if (VERBOSE_DEBUG || arguments[0] !== '[DEBUG]')
          console.log.apply(console, arguments); 
      };

    block_list_via_css(data.selectors);

    onReady(function() {
      if (data.settings.debug_logging)
        debug_print_selector_matches(data.selectors);
      // bandaids.js isn't loaded unless the site needs a bandaid.
      if (typeof run_bandaids === "function")
        run_bandaids("new");
      handleABPLinkClicks();
    });

    if (inputs.success) inputs.success();
  });
}
