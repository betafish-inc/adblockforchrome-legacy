infinite_loop_workaround("adblock_start");

// Add style rules hiding the given list of selectors.
// If title is specified, apply this title to the style element for later
// identification.
function block_list_via_css(selectors, title) {
  var d = document.documentElement;
  // Setting this small chokes Chrome -- don't do it!  I set it back to
  // 10000 from 100 on 1/10/2010 -- at some point you should just get rid
  // of the while loop if you never use chunking again.
  var chunksize = 10000;
  while (selectors.length > 0) {
    var css_chunk = document.createElement("style");
    if (title)
      css_chunk.title = title;
    css_chunk.type = "text/css";
    css_chunk.innerText += selectors.splice(0, chunksize).join(',') +
                               " { visibility:hidden !important; " +
                               "   display:none !important; }";
    d.insertBefore(css_chunk, null);
  }
}

function early_blacklist(user_filters) {
  var blacklisted = [];
  for (var i = 0; i < user_filters.length; i++) {
    var filter = user_filters[i];
    if (new RegExp(filter.domain_regex).test(document.domain))
      blacklisted.push(filter.css_regex);
  }
  if (blacklisted.length > 0) {
    log("Blacklist adding " + blacklisted.length + " CSS rules.");
    block_list_via_css(blacklisted);
  }
}

// If we're on GMail, do a speed hack and return true.
function gmail_hack() {
  // TODO: move this into a more general place.
  var isGmail = (document.domain == "mail.google.com");
  if (isGmail)
    block_list_via_css([".oM,.rh > #ra"]);

  return isGmail;
}

function facebook_hack() {
  // TODO: Put this somewhere general.  Or, maybe we could incorporate
  // this approach into handling 'no-collapse' options, and then this 
  // just becomes a filter rule with no-collapse.
  if (document.domain.indexOf("facebook.com") != -1) {
    var css_chunk = document.createElement("style");
    css_chunk.innerText = '.profile_sidebar_ads * { visibility:hidden ' +
       '!important; }';
    var d = document.documentElement;
    d.insertBefore(css_chunk, d.firstChild);
  }
}



var opts = { domain: document.domain };
// The top frame should tell the background what domain it's on.  The
// subframes will be told what domain the top is on.
if (window == window.top)
  opts.is_top_frame = true;
    
// returns everyintg _v3 did, plus _optional_features and selectors.
extension_call('get_features_and_filters', opts, function(data) {
  var start = new Date();

  if (data.features.debug_logging.is_enabled) {
    DEBUG = true;
    log = function(text) { console.log(text); };
  }
  if (data.features.debug_time_logging.is_enabled)
    time_log = function(text) { console.log(text); };

  if (page_is_whitelisted(data.whitelist, data.top_frame_domain))
    return;

  if (gmail_hack())
    return;

  facebook_hack();

  early_blacklist(data.user_filters);

  block_list_via_css(data.selectors);

  // In case adblock.js already ran, let the cache know we're done so
  // it can delete itself.
  _done_with_cache("adblock_start");

  var end = new Date();
  time_log("adblock_start run time: " + (end - start) + " || " +
           document.location.href);
});