  // OPTIONAL SETTINGS
var urlFilterAPI = opera.extension.urlfilter;
olderOpera = (Number(opera.version()) < 12.5); // Global

if (urlFilterAPI.clear === undefined) {
  // We really need this API.....
  urlFilterAPI.clear = function() {
    var i;
    for (i=0; i<urlFilterBlocked.length; i++) {
      urlFilterAPI.block.remove(urlFilterBlocked[i]);
    }
    if (!olderOpera) {
      for (i=0; i<urlFilterAllowed.length; i++) {
        urlFilterAPI.allow.remove(urlFilterAllowed[i]);
      }
    }
    urlFilterBlocked = [];
    urlFilterAllowed = [];
  }
}
var urlFilterBlocked = [];
var urlFilterAllowed = [];

var button = opera.contexts.toolbar.createItem({
  icon: "img/icon18.png",
  popup: {href: "button/popup.html", height: 220, width: 270},
  title: "AdBlock"
});

  function Settings() {
    var defaults = {
      debug_logging: false,
      show_context_menu_items: true,
      show_advanced_options: false,
      show_toolbar_button: true
    },
    settings = storage_get('settings') || {};
    this._data = {};
    for (var key in defaults) {
      this._data[key] = (settings[key] !== undefined ? settings[key] : defaults[key]);
    }
  };
  Settings.prototype = {
    set: function(name, is_enabled) {
      this._data[name] = is_enabled;
      // Don't store defaults that the user hasn't modified
      var stored_data = storage_get("settings") || {};
      stored_data[name] = is_enabled;
      storage_set('settings', stored_data);
    },
    get_all: function() {
      return this._data;
    }
  };
  _settings = new Settings();

  // Open a new tab with a given URL.
  // Inputs:
  //   url: string - url for the tab
  function openTab(url) {
    chrome.tabs.create({url: url});
  };
  
  
  
  
  // UNWHITELISTING

  // Look for a custom filter that would whitelist options.url,
  // and if any exist, remove the first one.
  // Inputs: url:string - a URL that may be whitelisted by a custom filter
  // Returns: true if a filter was found and removed; false otherwise.
  try_to_unwhitelist = function(url) {
    url = url.replace(/#.*$/, ''); // Whitelist ignores anchors
    var custom_filters = get_custom_filters_text().split('\n');
    for (var i = 0; i < custom_filters.length; i++) {
      var text = custom_filters[i];
      if (!Filter.isWhitelistFilter(text))
        continue;
      var filter = PatternFilter.fromText(text);
      if (!filter.matches(url, ElementTypes.document, false))
        continue;

      custom_filters.splice(i, 1); // Remove this whitelist filter text
      var new_text = custom_filters.join('\n');
      set_custom_filters_text(new_text);
      return true;
    }
    return false;
  }

  // Popup blocking
  // Returns true if the popup should be closed, false otherwise
  popup_blocker = function(opener, url) {
    if (page_is_whitelisted(opener) || adblock_is_paused()) {
      return false;
    }
    url = url.replace(/\#.*$/, '');
    var match = _myfilters.blocking.matches(url, ElementTypes.popup, parseUri(opener).hostname);
    if (!match) {
      return false;
    }
    log("Closing popup", url);
    var currentTab = opera.extension.tabs.getSelected();
    if (currentTab && currentTab.url === url) {
      currentTab.close(); // shortcut: don't reply to the content scripts. Kill the popup immediately
    }
    return true;
  };
  
  // Called when the blocking rules have been changed.
  handlerBehaviorChanged = function() {
    if (typeof _myfilters !== "undefined") {
      updateButtonUIAndContextMenus();
    }
    
    if (adblock_is_paused()) {
      urlFilterAPI.clear();
    }
  }

  // CUSTOM FILTERS

  // Get the custom filters text as a \n-separated text string.
  get_custom_filters_text = function() {
    return storage_get('custom_filters') || '';
  }

  // Set the custom filters to the given \n-separated text string, and
  // rebuild the filterset.
  // Inputs: filters:string the new filters.
  set_custom_filters_text = function(filters) {
    storage_set('custom_filters', filters);
    chrome.extension.sendRequest({command: "filters_updated"});
    _myfilters.rebuild();
  }

  // Removes a custom filter entry.
  // Inputs: filter:string line of text to remove from custom filters.
  remove_custom_filter = function(filter) {
    // Make sure every filter is preceded and followed by at least one \n,
    // then find and remove the filter.
    var text = "\n" + get_custom_filters_text() + "\n";
    text = text.replace("\n" + filter + "\n", "\n");
    set_custom_filters_text(text.trim());
  }

  // Returns true if there's a recently created custom selector filter.  If
  // |url| is truthy, the filter must have been created on |url|'s domain.
  has_last_custom_filter = function(url) {
    var filter = sessionStorage.getItem('last_custom_filter');
    if (!filter)
      return false;
    if (!url)
      return true;
    return filter.split("##")[0] === parseUri(url).hostname;
  }

  remove_last_custom_filter = function() {
    if (sessionStorage.getItem('last_custom_filter')) {
      remove_custom_filter(sessionStorage.getItem('last_custom_filter'));
      sessionStorage.removeItem('last_custom_filter');
    }
  }

  get_settings = function() {
    return _settings.get_all();
  }

  set_setting = function(name, is_enabled) {
    _settings.set(name, is_enabled);

    if (name == "debug_logging") {
      if (is_enabled)
        log = function() {
          if (VERBOSE_DEBUG || arguments[0] != '[DEBUG]')
            console.log.apply(console, arguments);
        };
      else
        log = function() { };
    }
  }

  // MYFILTERS PASSTHROUGHS

  // Rebuild the filterset based on the current settings and subscriptions.
  update_filters = function() {
    _myfilters.rebuild();
  }

  // Fetch the latest version of all subscribed lists now.
  update_subscriptions_now = function() {
    _myfilters.checkFilterUpdates(true);
  }

  // Returns map from id to subscription object.  See filters.js for
  // description of subscription object.
  get_subscriptions_minus_text = function() {
    var result = {};
    for (var id in _myfilters._subscriptions) {
      result[id] = {};
      for (var attr in _myfilters._subscriptions[id]) {
        if (attr == "text") continue;
        result[id][attr] = _myfilters._subscriptions[id][attr];
      }
    }
    return result;
  }

  // Subscribes to a filter subscription.
  // Inputs: id: id to which to subscribe.  Either a well-known
  //             id, or "url:xyz" pointing to a user-specified list.
  //         requires: the id of a list if it is a supplementary list,
  //                   or null if nothing required
  // Returns: null, upon completion
  subscribe = function(options) {
    _myfilters.changeSubscription(options.id, {
      subscribed: true,
      requiresList: options.requires
    });
    if (options.fromABPlink) {
      var tab = opera.extension.tabs.create({url: "pages/subscribe.html?" + options.id.substr(4), focused: true});
      opera.extension.windows.create([tab], {focused: true, height: 250, width: 450});
    }
  }

  // Unsubscribes from a filter subscription.
  // Inputs: id: id from which to unsubscribe.
  //         del: (bool) if the filter should be removed or not
  // Returns: null, upon completion.
  unsubscribe = function(options) {
    _myfilters.changeSubscription(options.id, {
      subscribed: false,
      deleteMe: (options.del ? true : undefined)
    });
  }

  // Returns true if the url cannot be blocked
  page_is_unblockable = function(url) {
    if (!url) {
      return true;
    } else {
      var scheme = parseUri(url).protocol;
      return (scheme !== 'http:' && scheme !== 'https:' && scheme !== 'feed:');
    }
  }
  
  // Get or set if AdBlock is paused
  // Inputs: newValue (optional boolean): if true, AdBlock will be paused, if
  //                  false, AdBlock will not be paused.
  // Returns: undefined if newValue was specified, otherwise it returns true
  //          if paused, false otherwise.
  adblock_is_paused = function(newValue) {
    if (newValue === undefined) {
      return sessionStorage.getItem('adblock_is_paused') === "true";
    }
    sessionStorage.setItem('adblock_is_paused', newValue);
  }

  // INFO ABOUT CURRENT PAGE

  // Get interesting information about the current tab.
  // Inputs:
  //   callback: function(info).
  //   info object passed to callback: {
  //     tab: Tab object
  //     whitelisted: bool - whether the current tab's URL is whitelisted.
  //     domain: string
  //     disabled_site: bool - true if the url is e.g. about:blank or the
  //                           Extension Gallery, where extensions don't run.
  //   }
  // Returns: null (asynchronous)
  getCurrentTabInfo = function(callback) {
    var tab = opera.extension.tabs.getSelected();
    if (!tab) return;
    var disabled_site = page_is_unblockable(tab.url);

    var result = {
      tab: tab,
      disabled_site: disabled_site
    };
    if (!disabled_site)
      result.whitelisted = page_is_whitelisted(tab.url);

    callback(result);
  }

  // Returns true if anything in whitelist matches the_domain.
  //   url: the url of the page
  //   type: one out of ElementTypes, default ElementTypes.document,
  //         to check what the page is whitelisted for: hiding rules or everything
  page_is_whitelisted = function(url, type) {
    if (!url) {
      return true;
    }
    url = url.replace(/\#.*$/, ''); // Remove anchors
    if (!type)
      type = ElementTypes.document;
    var whitelist = _myfilters.blocking.whitelist;
    return whitelist.matches(url, type, parseUri(url).hostname, false);
  }

  // Set the button image according to the URL of the current tab.
  updateButtonUIAndContextMenus = function() {
    
    function setContextMenus(info) {
      if (olderOpera || !opera.contexts.menu) {
        return;
      }
      chrome.contextMenus.removeAll();
      if (!get_settings().show_context_menu_items)
        return;

      if (adblock_is_paused() || info.whitelisted || info.disabled_site)
        return;

      function addMenu(title, callback) {
        chrome.contextMenus.create({
          title: title,
          contexts: ["all"],
          onclick: function(clickdata, tab) { callback(tab, clickdata); }
        });
      }

      addMenu(translate("block_this_ad"), function(tab, clickdata) {
        emit_page_broadcast(
          {fn:'top_open_blacklist_ui', options:{info: clickdata}},
          {tab: tab}
        );
      });

      addMenu(translate("block_an_ad_on_this_page"), function(tab) {
        emit_page_broadcast(
          {fn:'top_open_blacklist_ui', options:{nothing_clicked: true}},
          {tab: tab}
        );
      });

      if (has_last_custom_filter(info.tab.url)) {
        addMenu(translate("undo_last_block"), function(tab) {
          remove_last_custom_filter();
          chrome.tabs.reload();
        });
      }

    }
    
    function setBrowserButton(info) {
      if (get_settings().show_toolbar_button) {
        opera.contexts.toolbar.addItem(button);
      } else {
        opera.contexts.toolbar.removeItem(button);
        return;
      }
      if (adblock_is_paused()) {
        chrome.browserAction.setIcon({path:"img/icon18-grayscale.png"});
      } else if (info.disabled_site) {
        chrome.browserAction.setIcon({path:"img/icon18-grayscale.png"});
      } else if (info.whitelisted) {
        chrome.browserAction.setIcon({path:"img/icon18-whitelisted.png"});
      } else {
        chrome.browserAction.setIcon({path:"img/icon18.png"});
      }
    }

    getCurrentTabInfo(function(info) {
      setContextMenus(info);
      setBrowserButton(info);
    });
  }
  


  // These functions are usually only called by content scripts.

  // Add a new custom filter entry.
  // Inputs: filter:string line of text to add to custom filters.
  // Returns: null if succesfull, otherwise an exception
  add_custom_filter = function(filter) {
    var custom_filters = get_custom_filters_text();
    try {
      if (FilterNormalizer.normalizeLine(filter)) {
        if (Filter.isSelectorFilter(filter)) {
          sessionStorage.setItem('last_custom_filter', filter);
          updateButtonUIAndContextMenus();
        }
        custom_filters = custom_filters + '\n' + filter;
        set_custom_filters_text(custom_filters);
        return null;
      }
      return "This filter is unsupported";
    } catch(ex) {
      return ex;
    }
  };

  // Return the contents of a local file.
  // Inputs: file:string - the file relative address, eg "js/foo.js".
  // Returns: the content of the file.
  readfiles = function(files) {
    var js = [], css="", xhr;
    for (var i=0; i<files.length; i++) {
      xhr = ajax(files[i], {
        async: false,
        allowCaching: true
      });
      if (/.css$/.test(files[i])) {
        css += "/* " + files[i] + " */\n" + xhr.responseText + "\n\n";
      } else if (/.js$/.test(files[i])) {
        js.push("/* " + files[i] + " */\n" + xhr.responseText);
      }
    }
    return {css: css, js: js};
  };

  // Creates a custom filter entry that whitelists a given page
  // Inputs: url:string url of the page
  // Returns: null if successful, otherwise an exception
  create_page_whitelist_filter = function(url) {
    var url = url.replace(/#.*$/, '');  // Remove anchors
    var parts = url.match(/^([^\?]+)(\??)/); // Detect querystring
    var has_querystring = parts[2];
    var filter = '@@|' + parts[1] + (has_querystring ? '?' : '|') + '$document';
    return add_custom_filter(filter);
  }

  // TODO: make better.
  // Inputs: options object containing:
  //           domain:string the domain of the calling frame.
  get_content_script_data = function(options, sender) {
    var disabled = page_is_unblockable(sender.tab.url);
    var settings = get_settings();
    var result = {
      disabled_site: disabled,
      adblock_is_paused: adblock_is_paused(),
      settings: settings,
      selectors: []
    };
    if (!disabled) {
      result.page_is_whitelisted = page_is_whitelisted(sender.tab.url);
    }
    
    // Popup blocking
    if (options.opener) {
      if (popup_blocker(options.opener, sender.tab.url)) {
        return {closePopup: true};
      }
    }
    
    // Update the button, until they have an event that tells me when some page updates
    updateButtonUIAndContextMenus()
    
    if (disabled || result.adblock_is_paused || result.page_is_whitelisted)
      return result;

    // Not whitelisted, and running on adblock_start. We have to send the
    // CSS-hiding rules.
    if (!page_is_whitelisted(sender.tab.url, ElementTypes.elemhide)) {
      result.selectors = _myfilters.hiding.
        filtersFor(options.domain);
    }

    return result;
  };

  // Bounce messages back to content scripts.
  emit_page_broadcast = function(options) {
    var injectMap;
    switch(options.fn) {
      case "top_open_whitelist_ui":
      injectMap = readfiles([
        "jquery/jquery.min.js",
        "uiscripts/opera_hooks.js",
        "jquery/jquery-ui.custom.min.js",
        "uiscripts/top_open_whitelist_ui.js",
        "jquery/css/custom-theme/jquery-ui-1.8.custom.css",
        "jquery/css/override-page.css"
      ]);
      injectMap.allFrames = false;
      injectMap.i18ndata = chrome.i18n._strings;
      break;
      case "top_open_blacklist_ui":
      injectMap = readfiles([
        "jquery/jquery.min.js",
        "uiscripts/opera_hooks.js",
        "jquery/jquery-ui.custom.min.js",
        "uiscripts/blacklisting/overlay.js",
        "uiscripts/blacklisting/clickwatcher.js",
        "uiscripts/blacklisting/elementchain.js",
        "uiscripts/blacklisting/blacklistui.js",
        "uiscripts/top_open_blacklist_ui.js",
        "jquery/css/custom-theme/jquery-ui-1.8.custom.css",
        "jquery/css/override-page.css"
      ]);
      injectMap.allFrames = false;
      injectMap.i18ndata = chrome.i18n._strings;
      break;
      case "send_content_to_back":
      injectMap = readfiles([
        "uiscripts/send_content_to_back.js"
      ]);
      injectMap.allFrames = true;
      break;
    }
    injectMap.url = opera.extension.tabs.getSelected().url;
    injectMap.js.push(options.fn + "(" + JSON.stringify(options.options) + ");");
    chrome.extension.sendRequest({command: "injectUI", data: injectMap});
  };
  
  // Open the resource blocker when requested from the popup or blacklister.
  launch_resourceblocker = function(search) {
    openTab("pages/resourceblock.html" + search, true);
  };
  
  resourceblock_get_filter_text = function() {
    var filterTextsFromFilterSet = function(filterset) {
      // We don't store the filter texts (yet), so don't try to find them.
      return [];
      
      //var c = [];
      //for (var a in filterset.items) {
      //  for (var b=0; b<filterset.items[a].length; b++) {
      //   c.push(filterset.items[a][b]._text);
      //  }
      //}
      //return c;
    }

    return {
      blocking: filterTextsFromFilterSet(_myfilters.blocking.pattern),
      whitelist: filterTextsFromFilterSet(_myfilters.blocking.whitelist)
    };
  };

  // BGcall listener
    chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
      if (request.command != "call")
        return; // not for us
      var fn = window[request.fn];
      request.args.push(sender);
      var result = fn.apply(window, request.args);
      sendResponse(result);
    });

  // Brand new users don't see badge (or popup's info div).
  if (widget.preferences.length === 0) {
    openTab("pages/install/index.html");
  }

  if (get_settings().debug_logging)
    log = function() {
      if (VERBOSE_DEBUG || arguments[0] != '[DEBUG]') // comment out for verbosity
        console.log.apply(console, arguments);
    };

  _myfilters = new MyFilters();
  
  chrome.tabs.onActivated.addListener(updateButtonUIAndContextMenus);
  updateButtonUIAndContextMenus();

  log("\n===FINISHED LOADING===\n\n");