$(function() {
  localizePage();
  
  // Sort the languages list
  var languageOptions = $("#step_language_lang option");
  languageOptions.sort(function(a,b) {
    if (!a.text) return -1; if (!b.text) return 1; // First one is empty
    if (!a.value) return 1; if (!b.value) return -1; // 'Other' at the end
    if (a.getAttribute("i18n") == "lang_english") return -1; // English second
    if (b.getAttribute("i18n") == "lang_english") return 1;
    return (a.text > b.text) ? 1 : -1;
  });
  $("#step_language_lang").empty().append(languageOptions);
  $("#step_language_lang option[selected='selected']")[0].selected = true; // Opera fails in doing this
});

//fetching the options...
var options = parseUri.parseSearch(document.location.search);

//get the list of subscribed filters and
//all unsubscribed default filters
var unsubscribed_default_filters = [];
var subscribed_filter_names = [];
BGcall("get_subscriptions_minus_text", function(subs) {
  for (var id in subs)
    if (!subs[id].subscribed && !subs[id].user_submitted)
      unsubscribed_default_filters[id] = subs[id];
    else if (subs[id].subscribed)
      subscribed_filter_names.push(id);
});

var enabled_settings = [];
BGcall("get_settings", function(settings) {
  for (setting in settings)
    if (settings[setting])
      enabled_settings.push(setting);
});

//generate the URL to the issue tracker
function generateReportURL() {
  var result = "https://code.google.com/p/adblockforchrome/issues/entry" +
               "?template=Ad%20report%20from%20user&summary=";

  var domain = "<enter URL of webpage here>";
  if (options.url)
    domain = parseUri(options.url).hostname;
  result = result + encodeURIComponent("Ad report: " + domain);

  var body = [];
  var count = 1;
  body.push("Last step -- point me to the ad so I can fix the bug! " +
      "Don't leave anything out or I'll probably " +
      "have to ignore your report. Thanks!");
  body.push("");
  if (!options.url) {
    body.push(count + ". Paste the URL of the webpage showing an ad: ");
    body.push("");
    body.push("");
    count++;
  }
  body.push(count + ". Exactly where on that page is the ad? What does it " +
      "look like? Attach a screenshot, with the ad clearly marked, " +
      "if you can.");
  body.push("");
  body.push("");
  count++;
  body.push(count + ". Paste a working filter, if you have one: ");
  body.push("");
  body.push("");
  count++;
  body.push(count + ". Any other information that would be helpful, besides " +
      "what is listed below: ");
  body.push("");
  body.push("");
  body.push("-------- Please don't touch below this line. ---------");
  if (options.url) {
    body.push("=== URL with ad ===");
    body.push(options.url);
    body.push("");
  }
  body.push("=== Subscribed filters ===");
  body.push(subscribed_filter_names.join('\n'));
  body.push("");
  body.push("=== Browser & AdBlock: ===");
  body.push("Opera " + opera.version());
  body.push("AdBlock " + widget.version);
  body.push("");
  body.push("=== Enabled settings ===");
  body.push(enabled_settings.join('\n'));

  result = result + "&comment=" + encodeURIComponent(body.join('\n'));

  return result;
}



// STEP 1: update filters

//Updating the users filters
$("#UpdateFilters").click(function() {
  $(this).attr("disabled", "disabled");
  BGcall("update_subscriptions_now", function() {
    $(".afterFilterUpdate input").removeAttr('disabled');
    $(".afterFilterUpdate").removeClass('afterFilterUpdate');
  });
});
//if the user clicks a radio button
$("#step_update_filters_no").click(function() {
  $("#step_update_filters").html("<span class='answer'>" + translate("no") + "</span>");
  $("#whattodo").text(translate("adalreadyblocked"));
});
$("#step_update_filters_yes").click(function() {
  $("#step_update_filters").html("<span class='answer'>" + translate("yes") + "</span>");
  $("#step_language_DIV").css("display", "block");
});



// STEP 2: language

//if the user clicks an item
var contact = "";
$("#step_language_lang").change(function() {
  var selected = $("#step_language_lang option:selected");
  $("#step_language").html("<span class='answer'>"+ selected.text() +"</span>");
  if (selected.text() == translate("other")) {
    $("#whattodo").html(translate("nodefaultfilter1",
                                  ["<a href='https://adblockplus.org/en/subscriptions'>", "</a>"]));
    return;
  } else {
    var required_lists = selected.attr('value').split(';');
    for (var i=0; i < required_lists.length - 1; i++) {
      if (unsubscribed_default_filters[required_lists[i]]) {
        $("#whattodo").text(translate("retryaftersubscribe", [translate("filter" + required_lists[i])]));
        return;
      }
    }
  }
  contact = required_lists[required_lists.length-1];
  if (sessionStorage.getItem("errorOccurred")) {
    // Skip the malware step if an error has occurred. We don't want to scare
    // users if we have a bug in our code
    $("#step_firefox_DIV").css("display", "block");
  } else {
    $("#step_malware_DIV").css("display", "block");
  }

  var hideChromeInChrome = ['',''];
  $("#checkinfirefox1").html(translate("checkinfirefox_1", hideChromeInChrome));
  $("#checkinfirefox2").html(translate("checkinfirefox_2", hideChromeInChrome));
  $("#checkinfirefox").html(translate("checkinfirefoxtitle", hideChromeInChrome));
});


// STEP 3: malware
//if the user clicks a radio button
$("#step_malware_no, #step_malware_wontcheck").click(function() {
  $("#step_malware").html("<span class='answer'>" + $(this).next("label").text() + "</span>");
  $("#step_firefox_DIV").css("display", "block");
});
$("#step_malware_yes").click(function() {
  $("#step_malware").html("<span class='answer'>" + translate("yes") + "</span>");
  $("#whattodo").text(translate("maybemalware"));
});


// STEP 4: also in Firefox

//If the user clicks a radio button
$("#step_firefox_yes").click(function() {
  $("#step_firefox").html("<span class='answer'>" + translate("yes") + "</span>");
  if (/^mailto\:/.test(contact))
    contact = contact.replace(" at ", "@");
  var reportLink = "<a href='" + contact + "'>" + contact.replace(/^mailto\:/, '') + "</a>";
  $("#whattodo").html(translate("reportfilterlistproblem", [reportLink]));
  $("#privacy").show();
});
$("#step_firefox_no").click(function() {
  if (/^https\:/.test(options.url)) {
    // They can disable adblock for secure sites
    $("#step_https_DIV").css("display", "block");
  } else {
    $("#whattodo").html(translate("reporttous2"));
    $("a", "#whattodo").attr("href", generateReportURL());
    $("#privacy").show();
  }
  $("#step_firefox").html("<span class='answer'>" + translate("no") + "</span>");
});
$("#step_firefox_wontcheck").click(function() {
  $("#whattodo").text(translate("fixityourself"));
  $("#step_firefox").html("<span class='answer'>" + translate("refusetocheck") + "</span>");
});



// STEP 5: disabled on https (Opera-only)

//If the user clicks a radio button
$("#step_https_yes").click(function() {
  $("#step_https").html("<span class='answer'>" + translate("no") + "</span>");
  $("#whattodo").html(translate("reporttous2"));
  $("a", "#whattodo").attr("href", generateReportURL());
  $("#privacy").show();
});
$("#step_https_no").click(function() {
  $("#step_https").html("<span class='answer'>" + translate("yes") + "</span>");
  $("#whattodo").html(translate("opera_allow_secure"));
});
