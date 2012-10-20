var BG = chrome.extension.getBackgroundPage();

// Set menu entries appropriately for the selected tab.
function customize_for_this_tab() {
  $(".menu-entry, .separator").hide();

  BG.getCurrentTabInfo(function(info) {
    var shown = {};
    function show(L) { L.forEach(function(x) { shown[x] = true;  }); }
    function hide(L) { L.forEach(function(x) { shown[x] = false; }); }

    show(["div_options", "separator2"]);
    var paused = BG.adblock_is_paused();
    if (paused) {
      show(["div_status_paused", "separator0", "div_options"]);
    } else if (info.disabled_site) {
      show(["div_status_disabled", "separator0", "div_options", 
            "div_help_hide_start"]);
    } else if (info.whitelisted) {
      show(["div_status_whitelisted", 
            "separator0", "div_pause_adblock", "separator1", 
            "div_options", "div_help_hide_start"]);
    } else {
      show(["div_pause_adblock", "div_blacklist", "div_whitelist", 
            "div_report_an_ad", "separator1", "div_options", 
            "div_help_hide_start", "separator3"]);
    }
    
    var eligible_for_undo = !paused && (info.disabled_site || !info.whitelisted);
    var url_to_check_for_undo = info.disabled_site ? undefined : info.tab.url;
    if (eligible_for_undo && BG.has_last_custom_filter(url_to_check_for_undo))
      show(["div_undo", "separator0"]);
    
    if (!BG.get_settings().show_advanced_options)
      hide(["separator3", "div_report_an_ad"]);

    for (var div in shown)
      if (shown[div]) 
        $('#' + div).show();
  });
  if (chrome.extension.getBackgroundPage().olderOpera) {
    $("#div_pause_adblock, #div_whitelist, #div_report_an_ad").css("color", "grey").unbind("click").attr("title", translate("opera_enabledin", "Opera 12.10"));
  }
}


// Click handlers
$(function() {

  $("#titletext span").click(function() {
    var url = "https://code.google.com/p/adblockforchrome/";
    BG.openTab(url);
  });

  $("#div_status_whitelisted a").click(function() {
    BG.getCurrentTabInfo(function(info) {
      if (BG.try_to_unwhitelist(info.tab.url)) {
        chrome.tabs.reload();
        window.close();
      } else {
        $("#div_status_whitelisted").
        replaceWith(translate("disabled_by_filter_lists"));
      }
    });
  });

  $("#div_status_paused a").click(function() {
    BG.adblock_is_paused(false);
    BG._myfilters.rebuild();
    window.close();
  });
  
  $("#div_undo").click(function() {
    BG.getCurrentTabInfo(function(info) {
      BG.remove_last_custom_filter();
      if (!info.disabled_site)
        chrome.tabs.reload();
      window.close();
    });
  });

  $("#div_pause_adblock").click(function() {
    BG.adblock_is_paused(true);
    BG.handlerBehaviorChanged();
    window.close();
  });

  $("#div_blacklist").click(function() {
    BG.getCurrentTabInfo(function(info) {
      BG.emit_page_broadcast(
        {fn:'top_open_blacklist_ui', options: { nothing_clicked: true }},
        { tab: info.tab } // fake sender to determine target page
      );
      window.close();
    });
  });

  $("#div_whitelist").click(function() {
    BG.getCurrentTabInfo(function(info) {
      BG.emit_page_broadcast(
        {fn:'top_open_whitelist_ui', options:{}},
        { tab: info.tab } // fake sender to determine target page
      );
      window.close();
    });
  });


  $("#div_report_an_ad").click(function() {
    BG.getCurrentTabInfo(function(info) {
      var url = "pages/adreport.html?url=" + escape(info.tab.url);
      BG.openTab(url);
    });
  });


  $("#div_options").click(function() {
    BG.openTab("options.html");
  });


  $("#div_help_hide").click(function() {
    alert(translate("opera_reenable_button"));
    BG.set_setting("show_toolbar_button", false);
    BG.updateButtonUIAndContextMenus();
  });
});

function resizePopup() {
  BG.button.popup.height = document.documentElement.offsetHeight;
}

$(function() {
  customize_for_this_tab();
  localizePage();
  resizePopup();
});
