// Handles telling Safari about SelectorFilters.
function StyleSheetRegistrar() {
  this._paused = false;
  this._clear();
  this._initializeEvents();
}

// Applied to frames on $document or $elemhide pages to disable hiding
StyleSheetRegistrar.avoidHidingClass = 'x' + Math.floor(Math.random() * 1E6);

StyleSheetRegistrar.prototype = {
  // Tell Safari to forget about all registered filters.
  _clear: function() {
    this._unfinished = {
      // Map of domain -> set of id for all unfinished filters for that domain
      forDomain: {},
      // Set of ids for all unfinished filters that were applied globally
      // but should have blacklisted some domains
      overbroad: {}
    };
    // Pointer to stylesheet that globally applies _unfinished.overbroad's
    this._overbroadSheet = null;

    safari.extension.removeContentStyleSheets();
    log("Removed all style sheets.");
  },

  // Add event handlers so that we register domain-specific rules whenever
  // the user switches tabs.  These are never un-registered, which would be
  // a memory leak if StyleSheetRegistrar were ever destroyed and recreated.
  _initializeEvents: function() {
    var that = this;
    safari.application.addEventListener("activate", function(event) {
      if (event.target && event.target.page)
        event.target.page.dispatchMessage("send-domain");
    }, true);
    safari.application.addEventListener("message", function(event) {
      if (event.name === "send-domain-response") {
        var domain = event.message;
        that.prepareFor(domain);
      }
    }, true);
    // TODO: instead of get_content_script_data calling prepareFor, use
    // navigation events in addition to 'activate' events to request the data.
    // then prepareFor can become private.
  },

  // Pause or unpause Safari's application of filters to pages.  |paused| is
  // a boolean saying whether to pause.
  pause: function(paused) {
    if (paused == this._paused)
      return;
    this._paused = paused;
    if (paused)
      this._clear();
    else
      this.register(this._filters);
  },

  // Make sure that all filters to be run on |domain| are applied.
  prepareFor: function(domain) {
    logGroup("Preparing for", domain);
    var anyOverbroad = false;
    for (var nextDomain in DomainSet.domainAndParents(domain)) {
      if (this._unfinished.forDomain[nextDomain])
        if (this._finish(nextDomain))
          anyOverbroad = true;
    }
    if (anyOverbroad) {
      logGroup("Replacing overbroad sheet.");
      safari.extension.removeContentStyleSheet(this._overbroadSheet);
      this._overbroadSheet = this._applyGlobally(this._unfinished.overbroad);
      logGroupEnd();
    }
    logGroupEnd();
  },

  // Tell Safari to use the given SelectorFilters.  Any prevously registered
  // filters will be unregistered.
  // Inputs: filters: map of id -> SelectorFilter.
  register: function(filters) {
    this._filters = filters;
    if (this._paused)
      return;

    this._clear();

    var globalFilterIds = {}, unfinished = this._unfinished;
    for (var id in this._filters) {
      var filter = this._filters[id];
      if (filter._domains.full()) {
        globalFilterIds[id] = true;
      } else { // Record all the domains this filter refers to
        for (var domain in filter._domains._has)
          if (domain !== DomainSet.ALL)
            this._setDefault(unfinished.forDomain, domain, {})[id] = true;
        if (filter._domains._has[DomainSet.ALL]) // excludes some domains
          unfinished.overbroad[id] = true;
      }
    }
    this._applyGlobally(globalFilterIds);
    logGroup("Creating overbroad sheet.");
    this._overbroadSheet = this._applyGlobally(this._unfinished.overbroad);
    logGroupEnd();
    
    // Prep for current tab.  Other tabs prepped for when activated
    var t = ((safari.application.activeBrowserWindow || {}).activeTab || {});
    if (t) t.page.dispatchMessage("send-domain");
  },

  // Apply the given filters' selectors to all domains.
  // Input: filterIds:set of int:ids of filters whose selectors to apply.
  // Returns: A handle to the created stylesheet.
  _applyGlobally: function(filterIds) {
    var selectors = [];
    for (var id in filterIds) {
      selectors.push(this._filters[id].selector);
    }
    if (selectors.length === 0)
      return null;
    log("Adding global sheet (", selectors.length, "filters)");
    if (selectors.length < 10) log(sheet);
    var sheet = this._sheetFor(selectors);
    var blacklist = [safari.extension.baseURI + "*"];
    return safari.extension.addContentStyleSheet(sheet, undefined, blacklist);
  },

  // Apply this._unfinished.forDomain[domain]'s filters correctly, then
  // remove them from this._unfinished.
  // Returns true if any were previously applied overbroadly.
  _finish: function(domain) {
    var anyOverbroad = false;
    var idsByDomain = this._unfinished.forDomain;
    var selectorsByDomains = {};

    for (var id in idsByDomain[domain]) {
      var filter = this._filters[id];

      if (this._unfinished.overbroad[id]) {
        delete this._unfinished.overbroad[id]; // Being corrected now
        anyOverbroad = true; // Must rebuild overbroadSheet
      }

      var list = { white: [], black: [] };
      for (var mentionedDomain in filter._domains._has) {
        if (mentionedDomain !== DomainSet.ALL) {
          var isWhite = filter._domains._has[mentionedDomain];
          list[isWhite ? 'white' : 'black'].push(mentionedDomain);
          // Delete the filter from any other domain that mentions it.
          if (idsByDomain[mentionedDomain] && domain !== mentionedDomain)
            delete idsByDomain[mentionedDomain][id];
        }
      }
      var key = ['^', list.white.sort().join(" ^"), " ",
                 "~", list.black.sort().join(" ~")].join('');
      this._setDefault(selectorsByDomains, key, []).push(filter.selector);
    }
    delete idsByDomain[domain];

    // Apply all of this domain's filters correctly.
    for (var domainString in selectorsByDomains) {
      var list = { white: [], black: [] };
      for (var entry in domainString.split(" ")) {
        if (entry.length <= 1) continue;
        var domain = entry.substring(1);
        var target = list[entry[0] === '~' ? 'black' : 'white'];
        target.push(['http://*.', domain, '/*'].join(''));
        target.push(['https://*.', domain, '/*'].join(''));
      }
      list.black.push(safari.extension.baseURI + "*");

      var selectors = selectorsByDomains[domainString];
      log("Adding filter sheet:", selectors.join(", "), " on ", domainString);
      // TODO: wrong behavior for { ALL: true, a: false, sub.a: true }?
      var sheet = this._sheetFor(selectors);
      safari.extension.addContentStyleSheet(sheet, list.white, list.black);
    }

    return anyOverbroad;
  },

  // Returns the hiding stylesheet for the given array of selectors.
  _sheetFor: function(selectors) {
    var prefix = 'html:not(.' + StyleSheetRegistrar.avoidHidingClass + ') ';
    var suffix = ' { display: none; orphans: 4321; }';
    return prefix + selectors.join(", " + prefix) + suffix;
  },

  // Return obj[value], first setting it to |defaultValue| if it is undefined.
  _setDefault: function(obj, value, defaultValue) {
    if (obj[value] === undefined)
      obj[value] = defaultValue;
    return obj[value];
  }
};
