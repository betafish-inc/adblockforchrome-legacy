// Slide cards upon nav link click
$(".nav a").click(function() {
  var pad = 100; // Make darn sure elements slide offscreen
  $("body").css("overflow", "hidden"); // No scrollbars while sliding things around

  // Control whether things slide to the left or downward
  var edge = $(this).hasClass("down") ? "top" : "left";
  var diameterFn = $(this).hasClass("down") ? "height" : "width";

  // Where new content slides to
  var marker = $("#wrapper").position();

  // Put target card in place offscreen.
  var target = $("#" + this.name);
  // Give the payment card more room.
  target.css(marker);
  target.css(edge, $(document)[diameterFn]() + pad);
  target.show();


  // Slide my card off screen
  var myCard = $(this).closest(".card");
  myCard.css("z-index", 1);
  var how = {};
  how[edge] = (myCard[diameterFn]() + pad) * -1;
  myCard.animate(how, function() { myCard.hide(); });

  // Slide target card onscreen
  target.css("z-index", 2);
  var that = this;
  target.animate(marker, function() {
    $("body").css("overflow", "auto");
  });

  return false;
});

$("#cleaner-warning a").click(function() {
  alert(translate("filecleanerwarning"));
});


var start = Date.now();
(function() {
  // Show a loading progress indicator for a few seconds while we're downloading
  // the required filter lists in the background.

  var runLength = 2500; // Should take this many ms
  var pctTime = (Date.now() - start) / runLength; // Goes from 0 to 1

  // Start slow, then speed up.
  var pctDone = Math.pow(pctTime, 4);

  var bar = $("#chrome-loading-progress");
  bar[0].value = pctDone;

  if (pctDone < 1) {
    window.setTimeout(arguments.callee, 20);
    return;
  }

  window.setTimeout(function() {
    // Loaded
    $("#loading-wrapper").
      find("#done").fadeIn().end().
      delay(1800).
      fadeOut(function() {
        $("#header").fadeIn();
        // skip #start-chrome, only have that when we do have a one-question setup.
        // Immediately go to #howto
        $("#howto").css($("#wrapper").position()).fadeIn();
      });
  }, 200);
})();

localizePage();


// Check if they are using a version of opera that supports the new urlfilter API
if (chrome.extension.getBackgroundPage().olderOpera) {
  $("#opera120").show();
}