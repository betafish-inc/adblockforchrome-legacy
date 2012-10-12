// A single filter rule.
var Filter = function() {
  this.id = ++Filter._lastId;
};
Filter._lastId = 0;

// Maps filter text to Filter instances.  This is important, as it allows
// us to throw away and rebuild the FilterSet at will.
// Will be cleared after a fixed time interval
Filter._cache = {};

// Return a Filter instance for the given filter text.
// Throw an exception if the filter is invalid.
Filter.fromText = function(text) {
  var cache = Filter._cache;
  if (!(text in cache)) {

    if (Filter.isSelectorFilter(text))
      cache[text] = new SelectorFilter(text);
    else
      cache[text] = PatternFilter.fromText(text);
  }
  return cache[text];
}

Filter.isSelectorFilter = function(text) {
  // This returns true for both hiding rules as hiding whitelist rules
  // This means that you'll first have to check if something is an excluded rule
  // before checking this, if the difference matters.
  return /\#\@?\#./.test(text);
}

Filter.isSelectorExcludeFilter = function(text) {
  return /\#\@\#./.test(text);
}

Filter.isWhitelistFilter = function(text) {
  return /^\@\@/.test(text);
}

Filter.isComment = function(text) {
  return text.length === 0 ||
         text[0] === '!' ||
         (text[0] === '[' && /^\[adblock/i.test(text)) ||
         (text[0] === '(' && /^\(adblock/i.test(text));
}

// Given a comma-separated list of domain includes and excludes, return
// { applied_on:array, not_applied_on:array }.  An empty applied_on array
// means "on all domains except those in the not_applied_on array."  An
// empty not_applied_on array means "defer to the applied_on array."
//
// If a rule runs on *all* domains:
//   { applied_on: [], not_applied_on: [] }
// If a rule runs on *some* domains:
//   { applied_on: [d1, d2,...], not_applied_on: [] }
// If a rule is not run on *some* domains:
//   { applied_on: [], not_applied_on: [ d1, d2, d3... ] }
// If a rule runs on *some* domains but not on *other* domains:
//   { applied_on: [ d1, d2,...], not_applied_on: [ d1, d2,...] }
Filter._domainInfo = function(domainText, divider) {
  var domains = domainText.split(divider);

  var result = {
    applied_on: [],
    not_applied_on: []
  };

  if (domains == '')
    return result;

  for (var i = 0; i < domains.length; i++) {
    var domain = domains[i];
    if (domain[0] == '~') {
      result.not_applied_on.push(domain.substring(1));
    } else {
      result.applied_on.push(domain);
    }
  }

  return result;
}

// Filters that block by CSS selector.
var SelectorFilter = function(text) {
  Filter.call(this); // call base constructor

  var parts = text.match(/(^.*?)\#\@?\#(.+$)/);
  this._domains = Filter._domainInfo(parts[1], ',');
  this.selector = parts[2];
  // Preserve _text for resourceblock. Don't do so in Safari, where
  // resources aren't recorded
  if (document.location.pathname === '/pages/resourceblock.html')
    this._text = text;
};
SelectorFilter.prototype = {
  // Inherit from Filter.
  __proto__: Filter.prototype,
}

// Filters that block by URL regex or substring.
var PatternFilter = function() {
  Filter.call(this); // call base constructor
};
// Data is [rule text, allowed element types, options].
PatternFilter.fromData = function(data) {
  var result = new PatternFilter();
  result._rule = new RegExp(data[0]);
  result._allowedElementTypes = data[1];
  result._options = data[2];
  result._domains = { applied_on: [], not_applied_on: [] };
  return result;
}
// Text is the original filter text of a blocking or whitelist filter.
// Throws an exception if the rule is invalid.
PatternFilter.fromText = function(text) {
  var data = PatternFilter._parseRule(text);

  var result = new PatternFilter();
  result._domains = Filter._domainInfo(data.domainText, '|');
  result._allowedElementTypes = data.allowedElementTypes;
  result._options = data.options;
  result._rule = data.rule;
  result._key = data.key;
  // Preserve _text for resourceblock. Don't do so in Safari, where
  // resources aren't recorded
  if (document.location.pathname === '/pages/resourceblock.html')
    result._text = text;
  return result;
}

PatternFilter._parseRuleOptions = function(text) {
  var result = {
    domainText: '',
    options: FilterOptions.NONE
  };

  var optionsRegex = /\$~?[\w\-]+(?:=[^,\s]+)?(?:,~?[\w\-]+(?:=[^,\s]+)?)*$/;
  var optionsText = text.match(optionsRegex);
  var allowedElementTypes;
  if (!optionsText) {
    var rule = text;
    var options = [];
  } else {
    var options = optionsText[0].substring(1).toLowerCase().split(',');
    var rule = text.replace(optionsText[0], '');
  }

  for (var i = 0; i < options.length; i++) {
    var option = options[i];

    if (/^domain\=/.test(option)) {
      result.domainText = option.substring(7);
      continue;
    }

    var inverted = (option[0] == '~');
    if (inverted)
      option = option.substring(1);

    option = option.replace(/\-/, '_');

    if (option in ElementTypes) { // this option is a known element type
      if (inverted) {
        if (allowedElementTypes === undefined)
          allowedElementTypes = ElementTypes.DEFAULTTYPES;
        allowedElementTypes &= ~ElementTypes[option];
      } else {
        if (allowedElementTypes === undefined)
          allowedElementTypes = ElementTypes.NONE;
        allowedElementTypes |= ElementTypes[option];
      }
    }
    else if (option === 'third_party') {
      result.options |=
          (inverted ? FilterOptions.FIRSTPARTY : FilterOptions.THIRDPARTY);
    }
    else if (option === 'match_case') {
      //doesn't have an inverted function
      result.options |= FilterOptions.MATCHCASE;
    }
    else if (option === 'collapse') {
      // We currently do not support this option. However I've never seen any
      // reports where this was causing issues. So for now, simply skip this
      // option, without returning that the filter was invalid.
    }
    else {
      throw "Unknown option in filter " + option;
    }
  }
  // If no element types are mentioned, the default set is implied.
  // Otherwise, the element types are used, which can be ElementTypes.NONE
  if (allowedElementTypes === undefined)
    result.allowedElementTypes = ElementTypes.DEFAULTTYPES;
  else
    result.allowedElementTypes = allowedElementTypes;

  result.rule = rule;
  return result;
};

// combines two identical rules with different options
// inputs the two rule objects returned by createOperaRule
// returns the options for the best rule
PatternFilter.scheduleRule = function(rule, ruleOptions, isWhitelist) {
  var rule2Options = PatternFilter.ruleBuilderCache[rule];
  var newRuleOptions = {};
  if (!rule2Options) {
    PatternFilter.ruleBuilderCache[rule] = ruleOptions;
    return;
  }

  var thirdPartyDiffers = (ruleOptions.thirdParty !== rule2Options.thirdParty);
  var resourcesDiffer = (ruleOptions.resources !== rule2Options.resources);
  var domainsDiffer = false, i;
  if (((ruleOptions.includeDomains === rule2Options.includeDomains) ||
      (ruleOptions.includeDomains && rule2Options.includeDomains &&
      ruleOptions.includeDomains.length === rule2Options.includeDomains.length)) &&
      ruleOptions.excludeDomains.length === rule2Options.excludeDomains.length) {
    for (i=0; i<ruleOptions.excludeDomains.length; i++) {
      if (rule2Options.excludeDomains.indexOf(ruleOptions.excludeDomains[i])===-1) {
        domainsDiffer = true;
        break;
      }
    }
    if (!domainsDiffer && ruleOptions.includeDomains) {
      for (i=0; i<ruleOptions.includeDomains.length; i++) {
        if (rule2Options.includeDomains.indexOf(ruleOptions.includeDomains[i])===-1) {
          domainsDiffer = true;
          break;
        }
      }
    }
  } else {
    domainsDiffer = true;
  }

  // Resource types: OR for whitelists, AND for blocking
  // In case thirdparty and the domains are identical, use OR too
  if (isWhitelist || (!domainsDiffer && !thirdPartyDiffers)) {
    newRuleOptions.resources = (ruleOptions.resources | rule2Options.resources);
  } else {
    newRuleOptions.resources = (ruleOptions.resources & rule2Options.resources);
    if (newRuleOptions.resources === 0) {
      // In cases like the one below, let the one without $domain win
      // ||ab.cd^$object-subrequest,domain=ef.gh
      // ||ab.cd^$~object-subrequest
      if (rule2Options.includeDomains) {
        PatternFilter.ruleBuilderCache[rule] = ruleOptions;
      }
      return;
    }
  }

  // combine included and excluded domains. Leave included undefined if any of
  // the rules is (almost) global so it matches everywhere
  if (ruleOptions.includeDomains && rule2Options.includeDomains) {
    newRuleOptions.includeDomains = ruleOptions.includeDomains.concat(rule2Options.includeDomains);
  }
  newRuleOptions.excludeDomains = ruleOptions.excludeDomains.concat(rule2Options.excludeDomains);

  // In case third-party differs, use the most specific one (true instead of null)
  // for blocking rules. In case of conflicts, use the third-party rule only.
  // Whitelisting rules and rules that only differ in thirdParty become null by default.
  var shouldDefaultNull = (isWhitelist || (!domainsDiffer && !resourcesDiffer));
  if (ruleOptions.thirdParty === rule2Options.thirdParty) {
    newRuleOptions.thirdParty = rule2Options.thirdParty;
  } else if (ruleOptions.thirdParty === null) {
    newRuleOptions.thirdParty = (shouldDefaultNull ? null : rule2Options.thirdParty);
  } else if (rule2Options.thirdParty === null) {
    newRuleOptions.thirdParty = (shouldDefaultNull ? null : ruleOptions.thirdParty);
  } else if (shouldDefaultNull) {
    newRuleOptions.thirdParty = null;
  } else {
    if (ruleOptions.thirdParty) {
      // In case we have both third and first party specific rules, use the
      // third party one. It's more likely to match on multiple sites...
      PatternFilter.ruleBuilderCache[rule] = ruleOptions;
    }
    return;
  }

  PatternFilter.ruleBuilderCache[rule] = newRuleOptions;
};

// stores {'*/ads/*': {thirdParty: true, excludeDomains: []}}
PatternFilter.ruleBuilderCache = {};

// convert the rule so that it works in Opera
PatternFilter.createOperaRule = function(line, isWhitelist) {
  var parsedOptions = this._parseRuleOptions(line);
  var elementTypes = 0, type, MATCHEVERYTHING = "*:*";
  for (type in ElementTypes) {
    if (parsedOptions.allowedElementTypes & ElementTypes[type]) {
      elementTypes |= ElementTypes.convertToOperaType(type);
    }
  }
  var parsedDomains = Filter._domainInfo(parsedOptions.domainText, '|');

  var rule = parsedOptions.rule;
  if (isWhitelist) {
    rule = rule.substring(2);
  }
  if (/^\/[^\\\.\*\{\}\+\?\^\$\[\]\(\)\|\<\>\#]+\/$/.test(rule)) {
    // Simple regexes. Just convert them to the rule
    rule = rule.substr(1, rule.length-2);
  }

  // Add starting and trailing wildcards, except for ||x, |x and x|
  if (rule[0] !== "|") {rule = "*" + rule;}
  if (rule[rule.length-1] !== "|") {rule += "*";}
  // ***** -> *
  rule = rule.replace(/\*\*+/g, '*');
  // Starting with | means it should be at the beginning of the URL.
  if (rule[0] === '|' && rule[1] !== '|') {rule = rule.substr(1);}
  // Rules ending in | means the URL should end there
  if (rule[rule.length-1] === '|') {rule = rule.substr(0, rule.length-1);}
  // Opera doesn't allow * as filter. We however sometimes need it!
  if (/^[\|\*\^]*$/.test(rule)) {rule = MATCHEVERYTHING;}

  // Add any normal blocking rule, like ads$image
  if (elementTypes !== 0) {
    var ruleOptions = {
      resources: elementTypes,
      thirdParty: (parsedOptions.options & FilterOptions.THIRDPARTY ? true : (parsedOptions.options & FilterOptions.FIRSTPARTY ? false : null)),
      excludeDomains: parsedDomains.not_applied_on.length ? parsedDomains.not_applied_on : []
    };
    if (parsedDomains.applied_on.length) {
      ruleOptions.includeDomains = parsedDomains.applied_on;
    }

    PatternFilter.scheduleRule(rule, ruleOptions, isWhitelist);
  }

  // Add $document rules that can be parsed, thus rules without path
  // Thus: @@*$document , @@$document,domain=foo , @@||foo^$document , @@||foo^$document,domain=foo
  if (isWhitelist && (parsedOptions.allowedElementTypes & ElementTypes.document)) {
    var ruleOptions = {
      thirdParty: (parsedOptions.options & FilterOptions.THIRDPARTY ? true : (parsedOptions.options & FilterOptions.FIRSTPARTY ? false : null)),
      excludeDomains: parsedDomains.not_applied_on.length ? parsedDomains.not_applied_on : []
    };
    if (rule === MATCHEVERYTHING) {
      if (parsedDomains.applied_on.length) {
        ruleOptions.includeDomains = parsedDomains.applied_on;
      }
    } else if (/^\|\|[^\/\^\:\@\*\|]+(?:\^|\/)\*$/.test(rule)) {
      var match = rule.match(/^\|\|([^\/\^\:\@\*\|]+)(?:\^|\/)\*$/)[1];
      if (parsedDomains.applied_on.length === 0) {
        parsedDomains.applied_on.push(match);
      } else if (parsedDomains.applied_on.indexOf(match) === -1) {
        return false; // Help... @@||foo$document,domain=bar ???
      }
      ruleOptions.includeDomains = parsedDomains.applied_on
    } else {
      return false; // Sorry, we can't parse @@||foo.com/bar$document
    }
    PatternFilter.scheduleRule(MATCHEVERYTHING, ruleOptions, isWhitelist);
  }

  if (parsedOptions.allowedElementTypes & ~ElementTypes.DEFAULTTYPES) {
    return false; // We'll have to parse it for $popup and exclusion rules too
  }
  return true; // We're done
};

// Same as above, but now for older versions of Opera (12.02 and before)
PatternFilter._addOperaRuleOlderOpera = function(line, isWhitelist) {
  var parsedOptions = this._parseRuleOptions(line);
  var type, MATCHEVERYTHING = "*:*";
  for (type in ElementTypes) {
    if (!(parsedOptions.allowedElementTypes & ElementTypes[type]) && (ElementTypes[type] & ElementTypes.DEFAULTTYPES)) {
      return false;
    }
  }
  var parsedDomains = Filter._domainInfo(parsedOptions.domainText, '|');

  var rule = parsedOptions.rule;
  if (isWhitelist) {
    rule = rule.substring(2);
  }
  if (/^\/[^\\\.\*\{\}\+\?\^\$\[\]\(\)\|\<\>\#]+\/$/.test(rule)) {
    // Simple regexes. Just convert them to the rule
    rule = rule.substr(1, rule.length-2);
  }

  // Add starting and trailing wildcards, except for ||x, |x and x|
  if (rule[0] !== "|") {rule = "*" + rule;}
  if (rule[rule.length-1] !== "|") {rule += "*";}
  // ***** -> *
  rule = rule.replace(/\*\*+/g, '*');
  // Starting with | means it should be at the beginning of the URL.
  if (rule[0] === '|' && rule[1] !== '|') {rule = rule.substr(1);}
  // Rules ending in | means the URL should end there
  if (rule[rule.length-1] === '|') {rule = rule.substr(0, rule.length-1);}
  // Opera doesn't allow * as filter. We however sometimes need it!
  if (/^[\|\*\^]*$/.test(rule)) {rule = MATCHEVERYTHING;}

  if (parsedDomains.not_applied_on.length || parsedDomains.applied_on.length) {
    return false;
  }
  var startsWithDomain = false;
  // Replace ||
  if (/^\|\|/.test(rule)) {
    startsWithDomain = true;
    rule = rule.substr(2);
  }
  rule = rule.replace(/\^/g, "/");

  if (isWhitelist) {
    if (startsWithDomain) {
      urlFilterAPI.block.remove("*://" + rule);
      urlFilterAPI.block.remove("*." + rule);
    } else {
      urlFilterAPI.block.remove(rule);
    }
  } else {
    if (startsWithDomain) {
      urlFilterAPI.block.add("*://" + rule);
      urlFilterAPI.block.add("*." + rule);
      urlFilterBlocked.push("*://" + rule);
      urlFilterBlocked.push("*." + rule);
    } else {
      urlFilterAPI.block.add(rule);
      urlFilterBlocked.push(rule);
    }
  }

  if (parsedOptions.allowedElementTypes & ~ElementTypes.DEFAULTTYPES) {
    return false; // We'll have to parse it for $popup and exclusion rules too
  }
  return true; // We're done
};

// Return a { rule, domainText, allowedElementTypes } object
// for the given filter text.  Throws an exception if the rule is invalid.
PatternFilter._parseRule = function(text) {

  var result = this._parseRuleOptions(text);
  var rule = result.rule; // Temporary assign this unparsed rule

  // We parse whitelist rules too, in which case we already know it's a
  // whitelist rule so can ignore the @@s.
  if (Filter.isWhitelistFilter(rule))
    rule = rule.substring(2);

  // Convert regexy stuff.

  // First, check if the rule itself is in regex form.  If so, we're done.
  var matchcase = (result.options & FilterOptions.MATCHCASE) ? "" : "i";
  if (/^\/.+\/$/.test(rule)) {
    result.rule = rule.substr(1, rule.length - 2); // remove slashes
    result.rule = new RegExp(result.rule, matchcase);
    return result;
  }

  var key = rule.match(/\w{5,}/);
  if (key)
    result.key = new RegExp(key, matchcase);

  // ***** -> *
  rule = rule.replace(/\*\*+/g, '*');

  // Some chars in regexes mean something special; escape it always.
  // Escaped characters are also faster.
  // - Do not escape a-z A-Z 0-9 and _ because they can't be escaped
  // - Do not escape | ^ and * because they are handled below.
  rule = rule.replace(/([^a-zA-Z0-9_\|\^\*])/g, '\\$1');
  //^ is a separator char in ABP
  rule = rule.replace(/\^/g, '[^\\-\\.\\%a-zA-Z0-9_]');
  //If a rule contains *, replace that by .*
  rule = rule.replace(/\*/g, '.*');
  // Starting with || means it should start at a domain or subdomain name, so
  // match ://<the rule> or ://some.domains.here.and.then.<the rule>
  rule = rule.replace(/^\|\|/, '^[^\\/]+\\:\\/\\/([^\\/]+\\.)?');
  // Starting with | means it should be at the beginning of the URL.
  rule = rule.replace(/^\|/, '^');
  // Rules ending in | means the URL should end there
  rule = rule.replace(/\|$/, '$');
  // Any other '|' within a string should really be a pipe.
  rule = rule.replace(/\|/g, '\\|');
  // If it starts or ends with *, strip that -- it's a no-op.
  rule = rule.replace(/^\.\*/, '');
  rule = rule.replace(/\.\*$/, '');

  result.rule = new RegExp(rule, matchcase);
  return result;
}

// Blocking and whitelist rules both become PatternFilters.
PatternFilter.prototype = {
  // Inherit from Filter.
  __proto__: Filter.prototype,

  // Returns true if an element of the given type loaded from the given URL
  // would be matched by this filter.
  //   url:string the url the element is loading.
  //   elementType:ElementTypes the type of DOM element.
  //   isThirdParty: true if the request for url was from a page of a
  //       different origin
  matches: function(url, elementType, isThirdParty) {
    if (!(elementType & this._allowedElementTypes))
      return false;

    // If the resource is being loaded from the same origin as the document,
    // and your rule applies to third-party loads only, we don't care what
    // regex your rule contains, even if it's for someotherserver.com.
    if ((this._options & FilterOptions.THIRDPARTY) && !isThirdParty)
      return false;

    if ((this._options & FilterOptions.FIRSTPARTY) && isThirdParty)
      return false;

    if (this._key && !this._key.test(url))
      return false;

    return this._rule.test(url);
  }
}
