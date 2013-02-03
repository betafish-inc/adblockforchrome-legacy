// Opera somehow says this isn't the same...
jQuery = $ = window.jQuery;
// We don't use this in Opera
load_jquery_ui = function(callback) {callback()};
// If we're on the subframe of an subframe, it's never going to be defined
if (typeof rightclicked_item === "undefined") {
  rightclicked_item = null;
}