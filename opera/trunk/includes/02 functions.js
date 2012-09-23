// ==UserScript==
// @include http://*
// @include https://*
// ==/UserScript==

// Set to true to get noisier console.log statements
VERBOSE_DEBUG = false;

// Run a function on the background page.
// Inputs (positional):
//   first, a string - the name of the function to call
//   then, any arguments to pass to the function (optional)
//   then, a callback:function(return_value:any) (optional)
BGcall = function() {
  var args = [];
  for (var i=0; i < arguments.length; i++)
    args.push(arguments[i]);
  var fn = args.shift();
  var has_callback = (typeof args[args.length - 1] == "function");
  var callback = (has_callback ? args.pop() : function() {});
  chrome.extension.sendRequest({command: "call", fn:fn, args:args}, callback);
}

// These are replaced with console.log in adblock_start_common.js and
// background.html if the user chooses.
log = function() { };

// Behaves very similarly to $.ready() but does not require jQuery.
function onReady(callback) {
  if (document.readyState === "complete")
    window.setTimeout(callback, 0);
  else
    window.addEventListener("load", callback, false);
}

function translate(messageID, args) {
  return chrome.i18n.getMessage(messageID, args);
}

function localizePage() {
  //translate a page into the users language
  $("[i18n]:not(.i18n-replaced)").each(function() {
    $(this).html(translate($(this).attr("i18n")));
  });
  $("[i18n_value]:not(.i18n-replaced)").each(function() {
    $(this).val(translate($(this).attr("i18n_value")));
  });
  $("[i18n_title]:not(.i18n-replaced)").each(function() {
    $(this).attr("title", translate($(this).attr("i18n_title")));
  });
  $("[i18n_placeholder]:not(.i18n-replaced)").each(function() {
    $(this).attr("placeholder", translate($(this).attr("i18n_placeholder")));
  });
  $("[i18n_replacement_el]:not(.i18n-replaced)").each(function() {
    // Replace a dummy <a/> inside of localized text with a real element.
    // Give the real element the same text as the dummy link.
    var dummy_link = $("a", this);
    var text = dummy_link.text();
    var real_el = $("#" + $(this).attr("i18n_replacement_el"));
    real_el.text(text).val(text).replaceAll(dummy_link);
    // If localizePage is run again, don't let the [i18n] code above
    // clobber our work
    $(this).addClass("i18n-replaced");
  });
}

// Parse a URL. Based upon http://blog.stevenlevithan.com/archives/parseuri
// parseUri 1.2.2, (c) Steven Levithan <stevenlevithan.com>, MIT License
// Inputs: url: the URL you want to parse
// Outputs: object containing all parts of |url| as attributes
parseUri = function(url) {
  var matches = /^(([^:]+(?::|$))(?:(?:\w+:)?\/\/)?(?:[^:@\/]*(?::[^:@\/]*)?@)?(([^:\/?#]*)(?::(\d*))?))((?:[^?#\/]*\/)*[^?#]*)(\?[^#]*)?(\#.*)?/.exec(url);
  // The key values are identical to the JS location object values for that key
  var keys = ["href", "origin", "protocol", "host", "hostname", "port",
              "pathname", "search", "hash"];
  var uri = {};
  for (var i=0; i<keys.length; i++)
    uri[keys[i]] = matches[i] || "";
  return uri;
};
// Parses the search part of a URL into an key: value object.
// e.g., ?hello=world&ext=adblock would become {hello:"world", ext:"adblock"}
// Inputs: search: the search query of a URL. Must have &-separated values.
parseUri.parseSearch = function(search) {
  // Fails if a key exists twice (e.g., ?a=foo&a=bar would return {a:"bar"}
  var queryKeys = {};
  search.replace(/(?:^\?|&)([^&=]*)=?([^&]*)/g, function () {
    if (arguments[1]) queryKeys[arguments[1]] = unescape(arguments[2]);
  });
  return queryKeys;
};
// Strip third+ level domain names from the domain and return the result.
// Inputs: domain: the domain that should be parsed
//         keepDot: true if trailing dots should be preserved in the domain
// Returns: the parsed domain
parseUri.secondLevelDomainOnly = function(domain, keepDot) {
  var match = domain.match(/([^\.]+\.(?:co\.)?[^\.]+)\.?$/) || [domain, domain];
  return match[keepDot ? 0 : 1].toLowerCase();
}

// Inputs: key:string.
// Returns value if key exists, else undefined.
storage_get = function(key) {
  var json = widget.preferences.getItem(key);
  if (json == null)
    return undefined;
  try {
    return JSON.parse(json);
  } catch (e) {
    log("Couldn't parse json for " + key);
    return undefined;
  }
}

// Inputs: key:string, value:object.
// Returns undefined.
storage_set = function(key, value) {
  try {
    widget.preferences.setItem(key, JSON.stringify(value));
  } catch (ex) {
    if (ex.message == "QUOTA_EXCEEDED_ERR") {
      openTab("../options.html?storage_quota_exceeded#ui-tabs-2");
    }
  }
}


// Perform an ajax (XHR) call
// Inputs:
//   url [string]: the URL to contact
//   options [optional object]: any further options for the ajax call
//     .headers [key:value object]: containing the headers for the request
//     .method ["POST"|"GET"]: the method to be used (default: 'GET')
//     .async [boolean]: false if the call should be synchronous (default: true)
//     .allowCaching [boolean]: true if a cached version may be used (default: false)
//     .data [key:value object]: (POST only) any data that should be send to the server
//     .onSuccess(xhr) [function]: callback function if the XHR succeeds
//        xhr is the xhr object, which can be used to get the responseText
//     .onError(xhr, ex) [function]: callback function if the XHR fails
//        xhr is the xhr object
//        ex is the exception thrown (if any)
// Returns: the xhr object

ajax = function(url, options) {
  options = options || {};
  options.headers = options.headers || {};
  options.onError = options.onError || function() {};
  options.onSuccess = options.onSuccess || function() {};
  var data = null;

  if (!options.allowCaching && options.method !== "POST") {
    // Use a trick from jQuery: to prevent caching, append a unique querystring
    // parameter, which will not exist in the cache yet.
    url = url + ( /\?/.test(url) ? "&" : "?") + "_=" + Date.now();
  }

  var xhr = new XMLHttpRequest();
  xhr.open(options.method || "GET", url, options.async === undefined ? true : options.async);

  for (header in options.headers) {
    if (options.headers[header] !== undefined)
      xhr.setRequestHeader(header, options.headers[header]);
  }

  if (options.data && options.method === "POST") {
    xhr.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    for (key in options.data)
      data = (data ? data + "&" : "") + key + '=' + options.data[key];
  }

  xhr.onreadystatechange = function () {
    if (xhr.readyState === 4) {
      // http status code 200-299: success
      // http status code 304: file was not modified
      // http status code 0: fetching a local file returns no status code.
      //                     assume success if it does have a responseText
      if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304 ||
          (!xhr.status && xhr.responseText))
        options.onSuccess(xhr);
      else
        options.onError(xhr, new Error('Received status code ' + xhr.status)); 
    }
  }

  try {
    xhr.send(data);
  } catch (ex) {
    options.onError(xhr, ex);
  }
  return xhr;
}