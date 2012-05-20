// TODO TEMP CACHING TEST
test_caching_stats_c1 = function() {};

// Allows interaction with the server to track install rate
// and log messages.
STATS = (function() {
  var stats_url = "http://chromeadblock.com/api/stats2.php";

  //Get some information about the version and os
  var version = (function() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", chrome.extension.getURL('manifest.json'), false);
    xhr.send();
    var manifest = JSON.parse(xhr.responseText);
    return manifest.version;
  })();
  var osMatch = navigator.appVersion.match(/(CrOS|Windows|Mac|Linux)/i);
  var os = osMatch ? osMatch[1] : "Unknown";

  var firstRun = (function() {
    // All of these have represented the user existing at one point or
    // another.  Lest we accidentally show the install page to a user
    // just because he took forever in updating, let's not remove any
    // of these.
    if (storage_get("userid") || storage_get("user_id") || storage_get("installed_at"))
      return false;
    return true;
  })();

  // Give the user a userid if they don't have one yet.
  var userId = (function() {
    var time_suffix = (+new Date()) % 1e8; // 8 digits from end of timestamp

    // TODO temp: convert user_id to userid, as user_id was not
    // random enough.  6/14/2011, affected < 100k users.
    if (storage_get("user_id")) { // oops, this value was broken; replace it.
      var user_id = storage_get("user_id").substring(0, 8) + time_suffix;
      storage_set("userid", user_id);
      delete localStorage.user_id; // delete the old
    }
    // TODO end temp

    if (!storage_get("userid")) {
      var alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
      var result = [];
      for (var i = 0; i < 8; i++) {
        var choice = Math.floor(Math.random() * alphabet.length);
        result.push(alphabet[choice]);
      }
      var theId = result.join('') + time_suffix;

      storage_set("userid", theId);
    }

    return storage_get("userid");
  })();

  // Tell the server we exist.
  var pingNow = function() {
    var data = {
      cmd: "ping",
      u: userId,
      v: version,
      f: SAFARI ? "S": "E",
      o: os
    };
    // TODO temp
    var installed_at = storage_get("installed_at");
    if (installed_at)
      data.installed_at = installed_at;
    // end temp

    $.post(stats_url, data, function(response) {
      // TODO temp until most installed_at users have done this.  Installed
      // 6/2011.  Delete the other installed_at-related TODO temps in here
      // when you delete this.
      delete localStorage.installed_at;
    });
  };

  // Called just after we ping the server, to schedule our next ping.
  var scheduleNextPing = function() {
    var total_pings = storage_get("total_pings") || 0;
    total_pings += 1;
    storage_set("total_pings", total_pings);

    var delay_hours;
    if (total_pings == 1)      // Ping one hour after install
      delay_hours = 1;
    else if (total_pings < 9)  // Then every day for a week
      delay_hours = 24;
    else                       // Then weekly forever
      delay_hours = 24 * 7;

    var millis = 1000 * 60 * 60 * delay_hours;
    storage_set("next_ping_time", +new Date() + millis);
  };

  // Return the number of milliseconds until the next scheduled ping.
  var millisTillNextPing = function() {
    var next_ping_time = storage_get("next_ping_time");
    if (!next_ping_time)
      return 0;
    else
      return Math.max(0, next_ping_time - new Date());
  };

  return {
    // True if AdBlock was just installed.
    firstRun: firstRun,

    userId: userId,

    // Ping the server when necessary.
    startPinging: function() {
      function sleepThenPing() {
        var delay = millisTillNextPing();
        window.setTimeout(function() { 
          pingNow();
          scheduleNextPing();
          sleepThenPing();
        }, delay );
      };
      // Try to detect corrupt storage and thus avoid ping floods.
      if (millisTillNextPing() == 0) {
        storage_set("next_ping_time", 1);
        if (storage_get("next_ping_time") != 1)
          return;
      }
      // This will sleep, then ping, then schedule a new ping, then
      // call itself to start the process over again.
      sleepThenPing();
    },

    // Record some data.
    msg: function(message) {
      var data = {
        cmd: "msg",
        u: userId,
        m: message,
        v: version
      };
      $.post(stats_url, data);
    }
  };

})();