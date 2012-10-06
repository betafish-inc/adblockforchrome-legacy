// ==UserScript==
// @include http://*
// @include https://*
// ==/UserScript==

"use strict";

var elementPurger = function(e) {
  // Opera bug: it sometimes happens that e.element doesn't exist or refers to
  // the #document element in frames (instead of img or script or ...)
  if (!e.element || typeForElement(e.element) === ElementTypes.NONE) {
    // Return a list of { op, text }, where op is a CSS selector operator and
    // text is the text to select in a src attr, in order to match an element on
    // this page that could request the given absolute |url|.
    var _srcsFor = function(url) {
      // NB: <img src="a#b"> causes a request for "a", not "a#b".  I'm
      // intentionally ignoring IMG tags that uselessly specify a fragment.
      // AdBlock will fail to hide them after blocking the image.
      var url_parts = parseUri(url), page_parts = window.location;
      var results = [];
      // Case 1: absolute (of the form "abc://de.f/ghi" or "//de.f/ghi")
      results.push({ op:"$=", text: url.match(/\:(\/\/.*)$/)[1] });
      if (url_parts.hostname === page_parts.hostname) {
        var url_search_and_hash = url_parts.search + url_parts.hash;
        // Case 2: The kind that starts with '/'
        results.push({ op:"=", text: url_parts.pathname + url_search_and_hash });
        // Case 3: Relative URL (of the form "ab.cd", "./ab.cd", "../ab.cd" and
        // "./../ab.cd")
        var page_dirs = page_parts.pathname.split('/');
        var url_dirs = url_parts.pathname.split('/');
        var i = 0;
        while (page_dirs[i] === url_dirs[i] 
               && i < page_dirs.length - 1 
               && i < url_dirs.length - 1) {
          i++; // i is set to first differing position
        }
        var dir = new Array(page_dirs.length - i).join("../");
        var path = url_dirs.slice(i).join("/") + url_search_and_hash;
        if (dir) {
          results.push({ op:"$=", text: dir + path });
        } else {
          results.push({ op:"=", text: path });
          results.push({ op:"=", text: "./" + path });
        }
      }
      return results;
    }

    var srcdata = _srcsFor(e.url), selector = "";
    for (var i=0; i< srcdata.length; i++) {
      selector += ',[src' + srcdata[i].op + '"' + srcdata[i].text + '"], object[data' + srcdata[i].op + '"' + srcdata[i].text + '"]';
    }
    selector = selector.substr(1);
    
    var results = document.querySelectorAll(selector);
    if (results.length) {
      for (var j=0; j < results.length; j++) {
        log("Blocked found " + e.url + " for " + results[j].nodeName + " on " + window.location.hostname);
        destroyElement(results[j], typeForElement(results[j]));
      }
    }
    return;
  }

  // If e.element is available and correct, our life is much easier
  var elType = typeForElement(e.element);
  log("Blocked " + e.url + " for " + e.element.nodeName + " on " + window.location.hostname);
  // Note: this doesn't always trigger for subdocument.
  // Note: for background images, elType is wrong. But we shouldn't purge them anyway, so...
  if (elType & (ElementTypes.image | ElementTypes.subdocument | ElementTypes.object)) {
    destroyElement(e.element, elType);
    log("[DEBUG]", "Purging:", elType, e.url);
  }
};


var load_user_interface = function(request) {
  // We don't want the content scripts for the UI to hang around all the time,
  // as they are only used if the user decides to open it via the button, which
  // will be very uncommon. Therefore inject them only those few times when we
  // need them. Unfortunately, the only way we can execute them in the extension
  // context, is by calling 'eval'. However, better a few 'evals' rather than
  // some scripts slowing you down without reason for 99% of the time.
  if (request.command === 'injectUI') {
    
    if (!request.data.allFrames && window !== window.top) {
      return;
    }
    
    var topFrame = window, i, css;
    while (topFrame.top !== topFrame) {
      topFrame = topFrame.top;
    }
    try {
      if (request.data.url !== topFrame.location.href) {
        return;
      }
    } catch(ex) {
      // Topframe 'reads' may throw 
      //   Uncaught exception: ReferenceError: Security error: attempted to read protected variable
      // Probably has something to do with http: pages and https: iframes
      return;
    }
    
    if (request.data.i18ndata) {
      chrome.i18n._strings = request.data.i18ndata;
    }
    
    for (i=0; i<request.data.js.length; i++) {
      eval(request.data.js[i]);
    }
    
    if (request.data.css) {
      css = document.createElement("style");
      css.type = "text/css";
      css.style.setProperty("display", "none", "");
      css.className = "adblock-ui-stylesheet";
      css.textContent = request.data.css;
      document.body.appendChild(css);
    }
  }
};

var contextmenuclicked = function(e) {
  if (document.body && window === window.top) {
    if (e.srcElement.nodeName === "#text") {
      rightclicked_item = e.srcElement.parentNode;
    } else {
      rightclicked_item = e.srcElement;
    }
    
    var removetrash = function() {
      rightclicked_item = null;
      document.body.removeEventListener("click", removetrash, false);
    };
    document.body.addEventListener("click", removetrash, false);
  }
};

adblock_begin({
  startPurger: function() {
    // Opera 12.0 (in the background olderOpera) throws an error here
    try {
      opera.extension.urlfilter.addEventListener("contentblocked", elementPurger, false);
    } catch(ex) {}
  },
  stopPurger: function() {
    // Opera 12.0 (in the background called olderOpera) throws an error here
    try {
      opera.extension.urlfilter.removeEventListener("contentblocked", elementPurger, false);
    } catch(ex) {};
  },
  success: function() {
    chrome.extension.onRequest.addListener(load_user_interface);
    
    // In Opera 12.0 this won't work yet
    if (opera.contexts && opera.contexts.menu) {
      opera.contexts.menu.addEventListener("click", contextmenuclicked, false);
    }
  }
});
