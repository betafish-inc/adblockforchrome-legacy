function load_options() {
  // Check or uncheck each option.
  BGcall("get_settings", function(settings) {
    optionalSettings = settings;
    
    if (location.search) {
      // Background page can't alert
      if (location.search.substr(1) === "storage_quota_exceeded") {
        var msg = translate("storage_quota_exceeded");
        if (settings.show_advanced_options) {
          msg += "\n\n" + translate("opera_can_also_change_setting", "opera:config#PersistentStorage|DomainQuotaForWidgetPreferences");
        }
        alert(msg);
      }
    }

    $("#tabpages").
      tabs({ 
        spinner: "",
        cache: true,
        load: function(event, ui) {
          //translation
          localizePage();

          $(".advanced").toggle(optionalSettings.show_advanced_options);

          // Must load tab .js here: CSP won't let injected html inject <script>
          // see index.html:data-scripts
          ui.tab.dataset.scripts.split(' ').forEach(function(scriptToLoad) {
            // CSP blocks eval, which $().append(scriptTag) uses
            var s = document.createElement("script");
            s.src = scriptToLoad;
            document.body.appendChild(s);
          });
        },
      }).
      show();
  });
}

function displayVersionNumber() {
  $("#version_number").text(translate("optionsversion", widget.version));
}

if (navigator.language.substring(0, 2) != "en")
  $("#translation_credits").text(translate("translator_credit"));

var optionalSettings = {};
load_options();
displayVersionNumber();
localizePage();

$("#donatelink").click(function() {
  window.open("https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=TXJBMGT8PKVSQ&lc=GB" +
              "&item_name=Adblock%20for%20Opera%20extension&currency_code=EUR&bn=PP%2dDonationsB" +
              "F%3abtn_donate_LG%2egif%3aNonHosted");
});

if (chrome.extension.getBackgroundPage().olderOpera) {
  $("#opera120").show();
}