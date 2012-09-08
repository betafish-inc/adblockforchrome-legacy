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
    // Replace images by their data:* variant
    if (css) {
      css = css.
        replace(/url\([\'\"]?(.*?)[\'\"]?\)/g, function() {
          switch (arguments[1]) {
            case '../../img/icon24.png':
              return 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABgAAAAYCAYAAADgdz34AAAAGXRFWHRTb2Z0d2FyZQBBZG9iZSBJbWFnZVJlYWR5ccllPAAAA2ZpVFh0WE1MOmNvbS5hZG9iZS54bXAAAAAAADw/eHBhY2tldCBiZWdpbj0i77u/IiBpZD0iVzVNME1wQ2VoaUh6cmVTek5UY3prYzlkIj8+IDx4OnhtcG1ldGEgeG1sbnM6eD0iYWRvYmU6bnM6bWV0YS8iIHg6eG1wdGs9IkFkb2JlIFhNUCBDb3JlIDUuMC1jMDYwIDYxLjEzNDc3NywgMjAxMC8wMi8xMi0xNzozMjowMCAgICAgICAgIj4gPHJkZjpSREYgeG1sbnM6cmRmPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5LzAyLzIyLXJkZi1zeW50YXgtbnMjIj4gPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9IiIgeG1sbnM6eG1wTU09Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC9tbS8iIHhtbG5zOnN0UmVmPSJodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvc1R5cGUvUmVzb3VyY2VSZWYjIiB4bWxuczp4bXA9Imh0dHA6Ly9ucy5hZG9iZS5jb20veGFwLzEuMC8iIHhtcE1NOk9yaWdpbmFsRG9jdW1lbnRJRD0ieG1wLmRpZDpGNzdGMTE3NDA3MjA2ODExOERCQkY1MUI2M0I4QUUzMiIgeG1wTU06RG9jdW1lbnRJRD0ieG1wLmRpZDpDNTg1OTdBOTc0QUQxMURGODRERThGMzBDMjVDQTQxNCIgeG1wTU06SW5zdGFuY2VJRD0ieG1wLmlpZDpDNTg1OTdBODc0QUQxMURGODRERThGMzBDMjVDQTQxNCIgeG1wOkNyZWF0b3JUb29sPSJBZG9iZSBQaG90b3Nob3AgQ1M1IE1hY2ludG9zaCI+IDx4bXBNTTpEZXJpdmVkRnJvbSBzdFJlZjppbnN0YW5jZUlEPSJ4bXAuaWlkOkY5N0YxMTc0MDcyMDY4MTFBQjA4Q0Q1OUU1NTE1NjRBIiBzdFJlZjpkb2N1bWVudElEPSJ4bXAuZGlkOkY3N0YxMTc0MDcyMDY4MTE4REJCRjUxQjYzQjhBRTMyIi8+IDwvcmRmOkRlc2NyaXB0aW9uPiA8L3JkZjpSREY+IDwveDp4bXBtZXRhPiA8P3hwYWNrZXQgZW5kPSJyIj8+KcSk8QAABStJREFUeNqEVltMFFcY/mZ2Bpbd5RJY7irLzUuC0YJg+sCLNrzYNDXBcrHFarSNJZHESwEJvHiBRm0ECgnEpKndYkh88MXoA9FWW0QNhgYUW61SdLkssALCstc5/c/AUnYB/ZM/O3Nmzvf9l+/8swKWGGMMgSYIgoh3GO1RVlqnfSqetNpGeiGXfpLwHuNAZJ0E9gLviWTRyXKbmpqabVbrjOL1stXM6/GwN+PjU0VFRZW0JyUAY+UMeOSNjY1FewsLD9pu3ZL/rq5G8MwMmCxDDA+Ha2oKrulpKIoCZ1QUUi5eDGtpbq7W6XQy7TUHZiIFgjc0NBSWFBcfHL95U3aePIm0oCBIa9dC2LQJT4aHYdywAWFzc3C+fInZV68wWFAAxWwO+f7cuUq73e4mjPalJNJS8AsXLnz25d69h8Zu3JCdVVWIIfCg7dthcTrR//gxZjZuxN2BAaylLLakp0MfGQljdzcGi4sBs1lLmdT4MiFIv0xyW1paWicnJlz/mM3sSVISG09PZ1N5eax/zx72w65d7LfWVvaiq4vduXKF3a6vZ8cjIti/hYWsPzyc9RoM7LZez55fu8YmbTb70aNHT3OB8B5wCUharfaL0eHhxomODr3j+HE1cjk5Gc+1WnQ/ewbj7t34cN8+zL15gynqx9adO/Hdtm3Ii42FoacHjNYUUcQEgSW2t0O/detITGxsBRH8xDWujY+Pj5AVRT9WU6OCi9RAFhamgpOcEBoX55Oan+pEApWJRKZmayVJ3Tt46hQEUQyhV2T+HicQSBFBLpdLVQsH93q9KsHg6ChM2dnQEwCHZgH6n7bb0Z+Tg+H8fMjUj2CNBhIpzOl0Cn4EPBpaBGleBefOZaj4Il7hhHProvW0Awfw8M4dyNHR0BCBSMQcawF7XkU+Au9C9Nw1vEzK/BQwZWbCSFL1UDmiKGpuURkZ2H/pEiatVvVepBJxAuF/AiwjUJYQ+DLg18a0NPVeExKCEHKPx4OcoiL1+Qtqsp7EIJB0AzLAOzNQFjLg17Ozs8sGYVpuLqbHx/GgrAyfZ2VBef0aAhHw93g/lxHwqFRwul8koGu32w0HPVMU/6EZRIrpOHMGm0nOvug9891XsXwm+hQh06xxGAwqmEpEtQ6lctjo5HJwGgOL7nA44CL/6/p1bEpKgkB9YIThpkDdERGQJMmP4K3FYrHLwcGzMefPY4QidhGgZ2wMmamp6GxpgYGI1eFGZeRuNBrxyGxGBjVdR3NJoRI6CXw0MRFRVDLB7Z4hXJePgFfi7onKyl/Ct2xx686ehZUymKNh9kFKCoSHD/F7fT0S6LCZTCbV+65exa+1tchevx6KxTIPnpAADUlWTE6e+bq09GfCbFOrs6QXWR/t2LHvfF1dgaezM/ItDbtE2iRRA7uePsXjkREYacDZKbNUyoiDx1CZ7H19sK5ZA5EG3mRqquWbI0fa/uztrSO8Kf7JEAJGd1ZBfv5XVZWVn7IHDyKnKyoQRyQGmqIK1XaSTnqoTodQKiMbGoKDoretWwe5pAQ2k2motKys7VFPTy0H51rxDTvVRqgkccnJKsn+kpLSb48d+0QeGAh/e/8+JGqgepBIOeDqIgKaN3BTBnoaJdbo6KFj5eXtf9y7d3ox8pW+ybTgoQfdP16+3ORxu5XyEyc+jsjIWPWjT3RsbGho7tDhw229fX2LZfH7iK30r4JIOPFm8l3kOnLNKhxc8MMLDfUD92UgrPa3ZYGEj93gwECWGD99Du7LIl8g+E+AAQBMkwBzOBss6wAAAABJRU5ErkJggg==)';
            case 'images/ui-bg_inset-hard_100_fcfdfd_1x100.png':
              return 'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAABkCAYAAABHLFpgAAAAH0lEQVQYlWP48/fvfyYGBgaGEUcw4pRlZBwM7qMZAQB3GQS/3cDasAAAAABJRU5ErkJggg==)';
            case 'images/ui-icons_056b93_256x240.png':
              return 'url(data:image/png;base64,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)';
            case 'images/ui-icons_d8e7f3_256x240.png':
              return 'url(data:image/png;base64,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)';
            default:
              return arguments[0];
          }
        });
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
        "jquery/css/custom-theme/jquery-ui.custom.css",
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
        "jquery/css/custom-theme/jquery-ui.custom.css",
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