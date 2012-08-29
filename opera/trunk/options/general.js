// Check or uncheck each loaded DOM option checkbox according to the 
// user's saved settings.
$(function() {
  for (var name in optionalSettings) {
    $("#enable_" + name).
      attr("checked", optionalSettings[name]);
  }
  $("input.feature:checkbox").change(function() {
    var is_enabled = $(this).is(':checked');
    var name = this.id.substring(7); // TODO: hack
    BGcall("set_setting", name, is_enabled);
  });
});


$("#enable_show_advanced_options").change(function() {
  // Reload the page to show or hide the advanced options on the
  // options page -- after a moment so we have time to save the option.
  // Also, disable all advanced options, so that non-advanced users will
  // not end up with debug/beta/test options enabled.
  if (!this.checked)
    $(".advanced :checkbox:checked").each(function() {
      BGcall("set_setting", this.id.substr(7), false);
    });
  window.setTimeout(function() {
    window.location.reload();
  }, 50);
});


if (chrome.extension.getBackgroundPage().olderOpera) {
  $("#enable_show_context_menu_items, label[for='enable_show_context_menu_items']").css("color", "grey").prop("disabled", true).prop("checked", false).unbind().attr("title", translate("opera_enabledin", "Opera 12.50"));
}