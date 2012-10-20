// ==UserScript==
// @include http://*
// @include https://*
// ==/UserScript==

// The options that can be specified on filters.  The first several options
// specify the type of a URL request.

var ElementTypes = {
  NONE: 0,
  script: 1,
  image: 2,
  background: 2,
  stylesheet: 8,
  'object': 16,
  subdocument: 32,
  object_subrequest: 64,
  media: 128,
  other: 256,
  xmlhttprequest: 512,
  'document': 1024,
  elemhide: 2048,
  popup: 4096,
  font: 8192
  // If you add something here, update .DEFAULTTYPES below.
};
// The types that are implied by a filter that doesn't explicitly specify types
ElementTypes.DEFAULTTYPES = 9215;

// Convert a webRequest.onBeforeRequest type to an ElementType.
ElementTypes.convertToOperaType = function(type) {
  switch (type) {
    case "script": return urlFilterAPI.RESOURCE_SCRIPT;
    case "image": return urlFilterAPI.RESOURCE_IMAGE;
    case "stylesheet": return urlFilterAPI.RESOURCE_STYLESHEET;
    case "object": return urlFilterAPI.RESOURCE_OBJECT;
    case "subdocument": return urlFilterAPI.RESOURCE_SUBDOCUMENT;
    case "media": return urlFilterAPI.RESOURCE_MEDIA;
    case "other": return urlFilterAPI.RESOURCE_OTHER;
    case "object_subrequest": return urlFilterAPI.RESOURCE_OBJECT_SUBREQUEST;
    case "xmlhttprequest": return urlFilterAPI.RESOURCE_XMLHTTPREQUEST;
    case "font": return urlFilterAPI.RESOURCE_FONT;
    default: return 0;
  }
}

var FilterOptions = {
  NONE: 0,
  THIRDPARTY: 1,
  MATCHCASE: 2,
  FIRSTPARTY: 4
};
