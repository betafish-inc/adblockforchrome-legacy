// ==UserScript==
// @include http://*
// @include https://*
// ==/UserScript==

// Chrome to Opera port
// Author: Famlam (fam.lam [at] live.nl)
// License: http://creativecommons.org/licenses/by-nd/3.0/
//
// Porting library to make Chrome extensions work in Opera.
// To use: Add as the first script loaded in your Options page,
// your background page and any other page.
//
// Then you can use chrome.* APIs as usual. The opera.* APIs will
// still be available in Opera.

"use strict";

var isOnGlobalPage = (!opera.extension.bgProcess && window.location.protocol === "widget:");

var listenFor = function(messageName, handler) {
  var listener = function(messageEvent) {
    if (JSON.parse(messageEvent.data).messageName === messageName) {
      handler(messageEvent);
    }
  };
  opera.extension.addEventListener("message", listener, false);
  return listener;
};

var chrome = {
  extension: {
    getBackgroundPage: function() {
      if (opera.extension.bgProcess) {
        return opera.extension.bgProcess; // options page or button
      }
      return window; // BG page
    },

    getURL: function(path) {
      if (opera.extension.bgProcess) {
        return "widget://" + opera.extension.bgProcess.location.host + "/" + path; // We're in the button or options page
      }
      if (isOnGlobalPage) {
        return "widget://" + location.host + "/" + path; // we're on the BG page
      }
    },

    sendRequest: function(data, callback) {
      // Dispatches a request to a list of recipients. Calls the callback
      // only once, using the first response received from any recipient.
      var callbackToken = "callback" + Math.random();

      // Dispatch to each recipient.
      var message = JSON.stringify({ data: data, callbackToken: callbackToken, messageName: 'request' });
      if (opera.extension.postMessage) {
        // options, content scripts, button
        opera.extension.postMessage(message);
      } else if (opera.extension.broadcastMessage) {
        // BG page
        opera.extension.broadcastMessage(message);
      }

      // Listen for a response.  When we get it, call the callback and stop
      // listening.
      var listener = listenFor("response", function(messageEvent) {
        if (JSON.parse(messageEvent.data).callbackToken !== callbackToken) {
          return;
        }
        opera.extension.removeEventListener("message", listener, false);
        if (callback) {
          callback(JSON.parse(messageEvent.data).data);
        }
      });
    },

    onRequest: {
      addListener: function(handler) {
        listenFor("request", function(messageEvent) {
          var request = JSON.parse(messageEvent.data).data;

          var sender = {}; // Empty in onRequest in non-global contexts.
          if (isOnGlobalPage) { // But filled with sender data otherwise.
            sender.tab = { url: messageEvent.origin };
          }

          var sendResponse = function(dataToSend) {
            var responseMessage = JSON.stringify({ callbackToken: JSON.parse(messageEvent.data).callbackToken, data: dataToSend, messageName: "response"});
            if (opera.extension.postMessage) {
              opera.extension.postMessage(responseMessage);
            } else {
              opera.extension.broadcastMessage(responseMessage);
            }
          };
          handler(request, sender, sendResponse);
        });
      }
    }

  },

  browserAction: {
    // This assumes the variable 'button', being the button, already exists
    // In Chrome that would be done in the manifest.
    // Opera automatically picks the 36px icon if necessary (if available).
    setIcon: function(properties, callback) {
      button.icon = properties.path['18'];
      if (callback) {callback();}
    }
  },

  tabs: {
    create: function(properties, callback) {
      var tab = opera.extension.tabs.create({url: properties.url, focused: true});
      if (callback) {callback(tab);}
    },
    onActivated: {
      addListener: function(callback) {
        var callbackfunction = function() {
          var current = opera.extension.tabs.getSelected();
          if (!current || current.url !== undefined) {
            callback();
          } else {
            window.setTimeout(callbackfunction, 25);
          }
        };
        opera.extension.tabs.addEventListener("focus", callbackfunction, false);
      }
    },
    reload: function() {
      var hasCallback = typeof arguments[arguments.length-1] === "function";
      if (!arguments.length || (arguments.length === 1 && hasCallback)) {
        var current = chrome.extension.getBackgroundPage().opera.extension.tabs.getSelected();
        if (current && current.url) {
          current.update({url: current.url});
        }
      }
      if (hasCallback) {
        arguments.pop()();
      }
    }
  },

  windows: {
    getLastFocused: function() {
      var callback = arguments[arguments.length-1];
      callback(opera.extension.windows.getLastFocused());
    }
  },
  
  contextMenus: {
    removeAll: function(callback) {
      if (opera.contexts.menu.length) {
        opera.contexts.menu.removeItem(0);
      }
      if (callback) {
        callback();
      }
    },
    create: function(properties, callback) {
      var menu = opera.contexts.menu, folder;
      if (!menu.length) {
        folder = menu.createItem({
          title: widget.name,
          type: "folder",
          contexts: ["all"],
          documentURLPatterns: ["https://*", "http://*"],
          icon: 'img/icon16.png'
        });
        menu.addItem(folder);
      } else {
        folder = menu.item(0);
      }
      
      var newitem = menu.createItem({
        title: properties.title,
        type: "entry",
        contexts: properties.contexts,
        disabled: properties.disabled !== undefined ? properties.disabled : false,
        onclick: function(e) {
          var current = opera.extension.tabs.getSelected(), isFrame = false;
          if (current && current.url) {isFrame = current.url !== e.documentURL;}
          properties.onclick({
            menuItemId: e.target.id,
            parentMenuItemId: e.target.parent.id,
            linkUrl: e.linkURL,
            srcUrl: e.srcURL,
            pageUrl: current && current.url ? current.url : e.pageURL, // Opera bug? e.pageURL should be correct
            frameUrl: isFrame ? e.documentURL : undefined,
            selectionText: e.selectionText,
            editable: e.isEditable            
          }, opera.extension.tabs.getSelected());
        }
      });
      folder.addItem(newitem);
      
      if (callback) {
        callback();
      }
    }
  },

  i18n: {
    getMessage: function(messageID, args) {
      var locales = [], i, key, pkey, msg;
      if (!chrome.i18n._strings) {
        // Keep all strings on the global page only. Don't waste time/memory on parsing it every time
        if (!isOnGlobalPage) {
          return opera.extension.bgProcess.chrome.i18n.getMessage(messageID, args);
        }

        // The locales to search for
        locales.push(window.navigator.language.replace('-', '_')); // example: zh_CN
        if (window.navigator.language.length > 2) {
          locales.push(window.navigator.language.substring(0, 2)); // zh
        }
        if (locales.indexOf("en") === -1) {
          locales.push("en");
        }

        chrome.i18n._strings = {};

        // Download the locales
        var onReadyStateChange = function() {
          if(this.readyState === 4 && this.responseText !== "") {
            var parsed = JSON.parse(this.responseText);
            for (key in parsed) {
              // set the key
              chrome.i18n._strings[key] = chrome.i18n._strings[key] || {};
              chrome.i18n._strings[key].message = parsed[key].message.replace(/\$\$/g, "@@@@@@@");
              if (parsed[key].placeholders) {
                // set the placeholders, if any
                chrome.i18n._strings[key].placeholders = chrome.i18n._strings[key].placeholders || {};
                for (pkey in parsed[key].placeholders) {
                  chrome.i18n._strings[key].placeholders[pkey] = chrome.i18n._strings[key].placeholders[pkey] || {};
                  chrome.i18n._strings[key].placeholders[pkey].content = parsed[key].placeholders[pkey].content.replace(/\$\$/g, "@@@@@@@");
                }
              }
            }
          }
        };
        for (i=locales.length-1; i>= 0; i--) {
          var xhr = new XMLHttpRequest();
          xhr.open("GET", chrome.extension.getURL("_locales/" + locales[i] + "/messages.json"), false);
          xhr.addEventListener("readystatechange", onReadyStateChange, false);
          try {
            xhr.send();
          } catch (e) {} // Translation didn't exist
        }

        // Substitute the named placeholders
        for (key in chrome.i18n._strings) {
          if (chrome.i18n._strings[key].placeholders) {
            for (pkey in chrome.i18n._strings[key].placeholders) {
              chrome.i18n._strings[key].message = chrome.i18n._strings[key].message.replace(new RegExp("\\$" + pkey + "\\$", "g"), chrome.i18n._strings[key].placeholders[pkey].content);
            }
            delete chrome.i18n._strings[key].placeholders;
          }
        }
      }

      if (typeof args === "string") {
        args = [args];
      } else if (!args) {
        args = [];
      }

      if (chrome.i18n._strings[messageID] === undefined) {
        return "";
      }
      msg = chrome.i18n._strings[messageID].message;
      // We just have to replace the numbered variables by the arguments
      for (i=0; i<args.length; i++) {
        msg = msg.replace(new RegExp("\\$" + (i+1), "g"), args[i]);
      }

      // And remove our placeholder
      return msg.replace(/\@\@\@\@\@\@\@/g, '$');
    },
    _strings: undefined
  },

  webNavigation: {
    onCreatedNavigationTarget: {
      addListener: function(handler) {
        opera.extension.tabs.addEventListener("create", function(e) {
          handler({
            url: e.tab.url,
            tabId: e.tab.id,
            timestamp: e.timestamp
          });
        }, false);
      }
    }
  }
};

/* Known list of existing opera functions.
 * Keep it here, as not everything can be found easily in Opera's documentation
opera.contexts.menu.createItem()
opera.contexts.menu.addItem()
opera.contexts.menu.item()
opera.contexts.menu.removeItem()
opera.contexts.menu.onclick
opera.contexts.speeddial.title
opera.contexts.speeddial.url
opera.contexts.toolbar.addItem()
opera.contexts.toolbar.createItem()
opera.contexts.toolbar.removeItem()
opera.defineMagicFunction()
opera.defineMagicVariable()
opera.extension.addEventListener()
opera.extension.removeEventListener()
opera.extension.bgProcess
opera.extension.broadcastMessage()
opera.extension.onconnect
opera.extension.ondisconnect
opera.extension.onmessage
opera.extension.postMessage()
opera.extension.urlfilter.allow.add()
opera.extension.urlfilter.allow.remove()
opera.extension.urlfilter.block.add()
opera.extension.urlfilter.block.remove()
opera.extension.urlfilter.oncontentblocked
opera.extension.urlfilter.oncontentunblocked
opera.extension.tabGroups.create()
opera.extension.tabGroups.getAll()
opera.extension.tabGroups.onclose
opera.extension.tabGroups.oncreate
opera.extension.tabGroups.onmove
opera.extension.tabGroups.onupdate
opera.extension.tabs.create()
opera.extension.tabs.getAll()
opera.extension.tabs.getSelected()
opera.extension.tabs.onblur
opera.extension.tabs.onclose
opera.extension.tabs.oncreate
opera.extension.tabs.onfocus
opera.extension.tabs.onmove
opera.extension.tabs.onupdate
opera.extension.windows.create()
opera.extension.windows.getAll()
opera.extension.windows.getLastFocused()
opera.extension.windows.onblur
opera.extension.windows.onclose
opera.extension.windows.oncreate
opera.extension.windows.onfocus
opera.extension.windows.onupdate
*/