var global_cached_subscriptions;

// Update the list with all subscriptions. If new lists are added, refresh
// the full list.
function updateSubscriptionList() {
  BGcall('get_subscriptions_minus_text', function(subs) {
    global_cached_subscriptions = subs;

    for (var id in subs) {
      var sub = subs[id];
      var checkbox = $('.subscription[name="' + id + '"] input');
      //if (checkbox.length === 1) {
      //  alert(id);
        // The subscription already exists. Just update it
      //  checkbox[0].checked = sub.subscribed;
      //} else {
        // new subscription, or the list didn't exist yet. (Re)build it.
        //$("#filter_subscriptions").empty();
        $('#add_blocking_list').empty();
        $('#other_filters').empty();
        $('#custom_filters').empty();
        reset_language_select();

        setSubscriptionList(subs);
        break;
      //}
    }

    // In case they subscribed to an invalid list, it will be deleted
    // automatically in the background. However, allow them to copy the url
    // so they can modify it, before it's permanently removed.
    var removedSubs = $('.subscription[name]').filter(function() {
      return !subs[$(this).attr("name")];
    });
    if (removedSubs.length > 0) {
      $(".subscription_info", removedSubs[0]).text(translate("invalidListUrl"));
      $("input", removedSubs[0]).attr("disabled", "disabled");
    }
    
    $('#language_select').on('change', function(){
      //START INVESTIGATING HERE
      var selected_option = $('#language_select option').filter(':selected');
      if(selected_option.val() !== ''){
        subscribe(selected_option.attr('id'));
        //var selected_element = {
        //  id: selected_option.attr('id'),
        //  val: selected_option.val()
        //};
        //add_language_to_adblock_subsribed(selected_element);
        
        //$(this).find('option:first').attr('selected','selected');
        selected_option.remove();
      }
      $(this).val('');
    });
    updateSubscriptionInfoAll();
  });
}

// Creates the full list with subscriptions.
// Inputs: subscriptions: the list with all subscriptions and their properties
function setSubscriptionList(subscriptions) {
  //sorting the list
  //1, 2: AB custom and easylist
  //3: additional easylist filters
  //4: other default filters
  //5: EasyPrivacy
  //6: custom filter lists
  //var sorted_list = [];
  var adblock_list = [];
  var others_list = [];
  var custom_list = [];
  var language_list = [];
  
  for (var id in subscriptions) {
    var entry = subscriptions[id];
    if (id === 'adblock_custom') {
      entry.order = "1adblock_custom";
      adblock_list.push(entry);
    } else if (id === 'easylist') {
      entry.order = "2easylist";
      adblock_list.push(entry);
    } else if (id === 'easyprivacy') {
      entry.order = "5easyprivacy";
      others_list.push(entry);
    } else if (entry.user_submitted) {
      entry.order = "6" +
          (translate("filter" + id) || entry.url).toLowerCase();
      custom_list.push(entry);
    } else if (entry.requiresList) {
      entry.order = "3" +
          (translate("filter" + id) || entry.url).toLowerCase();
      entry.subscribed ? adblock_list.push(entry):language_list.push(entry);
    } else {
      entry.order = "4" +
          (translate("filter" + id) || entry.url).toLowerCase();
      entry.subscribed ? adblock_list.push(entry):language_list.push(entry);
    }
    entry.id = id;
    //sorted_list.push(entry);
  }
  //sorted_list.sort(function(a,b) {
  //  return a.order > b.order ? 1 : (a.order === b.order ? 0 : -1);
  //});
  
  sort_array(adblock_list);
  sort_array(others_list);
  sort_array(custom_list);
  sort_array(language_list);
  
  add_options_for_language_select(language_list);
  organize_div(adblock_list, $('#add_blocking_list'));
  organize_div(others_list, $('#other_filters'));
  organize_div(custom_list, $('#custom_filters'));
  
  //console.log(adblock_list);
  //console.log(others_list);
  //console.log(custom_list);
  //console.log(language_list);
  
  // Build subscription checkboxes.
  //for (var i = 0; i < sorted_list.length; i++) {
  //  var entry = sorted_list[i];
  //  var div = $("<div></div>").
  //    addClass("subscription").
  //    attr("name", entry.id);

  //  var checkbox = $('<input />').
  //    attr("type", "checkbox").
  //    attr("id", "checkbox_" + i).
  //    attr("checked", entry.subscribed ? 'checked' : null).
  //    change(function() {
        // Subscribe or unsubscribe from a list
  //      var parent = $(this).parent();
  //      var checked = $(this).is(":checked");
  //      $(".remove_filter", parent).
  //        css("display", checked ? "none" : "inline");
  //      var id = parent.attr("name");
  //      if (checked) {
  //        $(".subscription_info", parent).text(translate("fetchinglabel"));
  //        subscribe(id);
  //      } else {
  //        unsubscribe(id, false);
  //        $(".subscription_info", parent).
  //          text(translate("unsubscribedlabel"));
  //      }
  //    });

  //  var name = $("<label>").
  //    text(translate("filter" + entry.id) || entry.url).
  //    attr("title", entry.url).
  //    attr("for", "checkbox_" + i);

  //  var link_to_list = $("<a>").
  //    text(translate('labelshow')).
  //    css("margin-left", "6px").
  //    css("font-size", "10px").
  //    css("display", $("#btnShowLinks").prop("disabled") ? "inline" : "none").
  //    attr("target", "_blank").
  //    attr("class", "linkToList").
  //    attr("href", entry.url);

  //  var infospan = $("<span></span>").
  //    addClass("subscription_info");

  //  if (entry.user_submitted) {
  //    var remove_filter_label = $("<a>").
  //      css("font-size", "10px").
  //      css("display", entry.subscribed ? "none" : "inline").
  //      attr("href", "#").
  //      text(translate("removefromlist")).
  //      addClass("remove_filter").
  //      click(function(event) {
          // Remove this filter list from the page.
  //        event.preventDefault();
  //        var parent = $(this).parent();
  //        var id = parent.attr("name");
  //        unsubscribe(id, true);
  //        parent.remove();
  //      });
  //  } else
  //    var remove_filter_label = null;

  //  div.
  //    append(checkbox).
  //    append(name).
  //    append(link_to_list).
  //    append(infospan).
  //    append(remove_filter_label);

  //  $("#filter_subscriptions").
  //    append(div);
  //}
  
  show_custom_div();
}

//Sort arrays according to the items order
function sort_array(arr){
  arr.sort(function(a,b) {
    return a.order > b.order ? 1 : (a.order === b.order ? 0 : -1);
  });
}

//add array contents to passed in div
function organize_div(arr, container){
  for (var i = 0; i < arr.length; i++) {
    var entry = arr[i];
    var div = $("<div></div>").
      addClass("subscription").
      attr("name", entry.id);

    var checkbox = $('<input />').
      attr("type", "checkbox").
      attr("id", "checkbox_" + i).
      attr("checked", entry.subscribed ? 'checked' : null).
      change(function() {
        // Subscribe or unsubscribe from a list
        var parent = $(this).parent();
        var checked = $(this).is(":checked");
        $(".remove_filter", parent).
          css("display", checked ? "none" : "inline");
        var id = parent.attr("name");
        if (checked) {
          $(".subscription_info", parent).text(translate("fetchinglabel"));
          subscribe(id);
        } else {
          unsubscribe(id, false);
          $(".subscription_info", parent).
            text(translate("unsubscribedlabel"));
        }
        $(this).attr('disabled','disabled');
      });

    var name = $("<label>").
      text(translate("filter" + entry.id) || entry.url).
      attr("title", entry.url).
      attr("for", "checkbox_" + i);

    var link_to_list = $("<a>").
      text(translate('labelshow')).
      css("margin-left", "6px").
      css("font-size", "10px").
      css("display", $("#btnShowLinks").prop("disabled") ? "inline" : "none").
      attr("target", "_blank").
      attr("class", "linkToList").
      attr("href", entry.url);

    var infospan = $("<span></span>").
      addClass("subscription_info");
    
    if (entry.user_submitted) {
      var remove_filter_label = $("<a>").
        css("font-size", "10px").
        css("display", entry.subscribed ? "none" : "inline").
        attr("href", "#").
        text(translate("removefromlist")).
        addClass("remove_filter").
        click(function(event) {
        // Remove this filter list from the page.
          event.preventDefault();
          var parent = $(this).parent();
          var id = parent.attr("name");
          unsubscribe(id, true);
          parent.remove();
        });
    } else
      var remove_filter_label = null;
  
    div.
      append(checkbox).
      append(name).
      append(link_to_list).
      append(infospan).
      append(remove_filter_label);

    container.
      append(div);
  }
}

//Show custom_filters div if not empty
function show_custom_div(){
  var custom_filters = $('#custom_filters');
  var custom_filters_header = custom_filters.prev('h3');
  custom_filters.find('div').size() > 0?custom_filters_header.show():custom_filters_header.hide();
}

function reset_language_select(){
  $('#language_select').children()
    .remove()
    .end()
    .append($('<option>', { 
      value: '',
      text : ' -- Select Language -- ',
      id: 'sampling'
    }));
    
    //$("#language_select option:first").attr('selected','selected');
}

function add_options_for_language_select(arr){
  $.each(arr, function (i, item) {
    $('#language_select').append($('<option>', { 
        value: item.url,
        text : translate("filter" + item.id),
        id: item.id
    })).val('');
});
}
// Update the infolabel from all subscriptions (last update time etcetera)
function updateSubscriptionInfoAll() {
  for (var id in global_cached_subscriptions) {
    var div = $("[name='" + id + "']");
    var subscription = global_cached_subscriptions[id];
    var infoLabel = $(".subscription_info", div);
    var text = "";
    if (!$("input", div).is(":checked")) {
      if (infoLabel.text() === translate("unsubscribedlabel"))
        continue;
      text = "";
    } else if (!subscription.last_update_failed_at && !subscription.last_update) {
      text = translate("fetchinglabel");
    } else if (subscription.last_update_failed_at && !subscription.last_update) {
      text = translate("failedtofetchfilter");
    } else {
      var how_long_ago = Date.now() - subscription.last_update;
      var seconds = Math.round(how_long_ago / 1000);
      var minutes = Math.round(seconds / 60);
      var hours = Math.round(minutes / 60);
      var days = Math.round(hours / 24);
      if (subscription.last_update_failed_at)
        text = translate("last_update_failed");
      if (seconds < 10)
        text += translate("updatedrightnow");
      else if (seconds < 60)
        text += translate("updatedsecondsago", [seconds]);
      else if (minutes === 1)
        text += translate("updatedminuteago");
      else if (minutes < 60)
        text += translate("updatedminutesago", [minutes]);
      else if (hours === 1)
        text += translate("updatedhourago");
      else if (hours < 24)
        text += translate("updatedhoursago", [hours]);
      else if (days === 1)
        text += translate("updateddayago");
      else
        text += translate("updateddaysago", [days]);
    }
    infoLabel.text(text);
  }
}

// Unsubscribe from the given filterlist id.
// 'del' determines if it should be deleted too
function unsubscribe(id, del, multiple_subscriptions) {
  BGcall("unsubscribe", {id:id, del:del, multiple_subscriptions:multiple_subscriptions});
}

// Subscribe to the given filterlist id, and a required list if it is known.
// Inputs: id: either a well-known id, or "url:xyz", where xyz is the URL of
// a user-specified filter list.
function subscribe(id, multiple_subscriptions) {
  // Avoid over-subscription
  if (!validateOverSubscription()) {
    window.location.reload();
    return;
  }
  
  var parameters = {id: id};
  if(multiple_subscriptions){
    parameters.multiple_subscriptions = true;
  }
  
  if (global_cached_subscriptions[id] && global_cached_subscriptions[id].requiresList){
    parameters.requires = global_cached_subscriptions[id].requiresList;
  }

  BGcall("subscribe", parameters);
}

// If the user is about to subscribe to too many filters, make
// them agree that they know what they're doing.
// Returns true if validated.
function validateOverSubscription() {
  if ($(":checked", "#filter_subscriptions").length <= 6)
    return true;
  if (optionalSettings.show_advanced_options) {
    // In case of an advanced user, only warn once every 30 minutes, even
    // if the options page wasn't open all the time. 30 minutes = 1/48 day
    if ($.cookie('noOversubscriptionWarning'))
      return true;
    else
      $.cookie('noOversubscriptionWarning', 'true', {expires: (1/48)});
  }
  return confirm(translate("you_know_thats_a_bad_idea_right"));
}

$(function() {
  // Build the subscription list
  updateSubscriptionList();

  // Every second, redisplay "last update" times on subscriptions.
  window.setInterval(function() {
    updateSubscriptionInfoAll();
  }, 1000);

  // If the user presses the update now button, update all subscriptions
  $("#btnUpdateNow").click(function() {
    $(this).attr("disabled", "disabled");
    BGcall("update_subscriptions_now");
    setTimeout(function() {
      $("#btnUpdateNow").removeAttr("disabled");
    }, 300000); //re-enable after 5 minutes
  });

  // Add a new subscription URL
  $("#btnNewSubscriptionUrl").click(function() {
    var url = $("#txtNewSubscriptionUrl").val();
    var abp_regex = /^abp.*\Wlocation=([^\&]+)/i;
    if (abp_regex.test(url)) {
      url = url.match(abp_regex)[1]; // the part after 'location='
      url = unescape(url);
    }
    url = url.trim();
    if (/^https?\:\/\/[^\<]+$/.test(url)) {
      subscribe("url:" + url);
      $("#txtNewSubscriptionUrl").val("");
    } else
      alert(translate("failedtofetchfilter"));
  });

  // Pressing enter will add the list too
  $('#txtNewSubscriptionUrl').keypress(function(event) {
    if (event.keyCode === 13) {
      event.preventDefault();
      $("#btnNewSubscriptionUrl").click();
    }
  });

  // In case a subscription changed (updated or subscribed via subscribe.html)
  // then update the subscription list.
  chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
    if (request.command !== "filters_updated")
      return;
    updateSubscriptionList();
    sendResponse({});
  });

  $("#subscribeAll").on("click", function(e) {
    var inputs = $("input:not(:checked)", ".subscription");
    for (var i=0; i<inputs.length; i++) {
      //window.setTimeout((function() { // Catch i in closure
        var input = $(inputs[i]);
        input.attr('disabled', 'disabled');
        //return (function() { //input.click().change(); });
          var parent = input.parent();
          var id = parent.attr("name");
          $(".subscription_info", parent).text(translate("fetchinglabel"));
          subscribe(id, true);
        //});
      //})(), 1000 * i);
    }
    
    var language_select_options = $('#language_select').find('option');
    language_select_options.attr('disabled', 'disabled');
    language_select_options.each(function(ind){
      var selected_option = $(language_select_options[ind]);
      if(selected_option.val() !== ''){
        subscribe(selected_option.attr('id'), true);
        //var selected_element = {
        //  id: selected_option.attr('id'),
        //  val: selected_option.val()
        //};
        //add_language_to_adblock_subsribed(selected_element);
        
        //$(this).find('option:first').attr('selected','selected');
      }
    });
    updateSubscriptionList(); 
    e.preventDefault();
  });
  
  
  $("#unsubscribeAll").on("click", function(e) {
    $("input", ".subscription").each(function(i, el) {
      if (el.checked){
        var option = $(el);
        option.attr('disabled', 'disabled');
        var parent = option.parent();
        var id = parent.attr("name");
        unsubscribe(id, false, true);
        $(".subscription_info", parent).
          text(translate("unsubscribedlabel"));
      }
      //  $(el).click().change();
    });
    updateSubscriptionList();
    e.preventDefault();
  });

  $("#btnShowLinks").click(function() {
    $(".linkToList").css("display", "inline");
    $("#btnShowLinks").attr("disabled", "disabled");
  });
});
