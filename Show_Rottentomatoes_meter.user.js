// ==UserScript==
// @name        Show Rottentomatoes meter
// @description Show Rotten Tomatoes score on imdb.com, metacritic.com, letterboxd.com, BoxOfficeMojo, serienjunkies.de, Amazon, tv.com, Google Play, allmovie.com, Wikipedia, themoviedb.org, movies.com, tvmaze.com, tvguide.com, followshows.com, thetvdb.com, tvnfo.com
// @namespace   cuzi
// @updateURL   https://openuserjs.org/meta/cuzi/Show_Rottentomatoes_meter.meta.js
// @grant       GM_xmlhttpRequest
// @grant       GM_setValue
// @grant       GM_getValue
// @grant       unsafeWindow
// @grant       GM.xmlHttpRequest
// @grant       GM.setValue
// @grant       GM.getValue
// @require     http://ajax.googleapis.com/ajax/libs/jquery/3.4.1/jquery.min.js
// @require     https://greasemonkey.github.io/gm4-polyfill/gm4-polyfill.js
// @license     GPL-3.0-or-later; http://www.gnu.org/licenses/gpl-3.0.txt
// @version     19
// @connect     www.rottentomatoes.com
// @include     https://www.save.tv/*
// ==/UserScript==


var baseURL = "https://www.rottentomatoes.com"
var baseURL_search = baseURL + "/api/private/v2.0/search/?limit=100&q={query}&t={type}";
var baseURL_openTab = baseURL + "/search/?search={query}";
const cacheExpireAfterHours = 4;
const emoji_tomato = 0x1F345;
const emoji_green_apple = 0x1F34F;
const emoji_strawberry = 0x1F353;

function minutesSince(time) {
  let seconds = ((new Date()).getTime() - time.getTime()) / 1000;
  return seconds>60?parseInt(seconds/60)+" min ago":"now";
}

var parseLDJSON_cache = {}
function parseLDJSON(keys, condition) {
  if(document.querySelector('script[type="application/ld+json"]')) {
    var data = [];
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for(let i = 0; i < scripts.length; i++) {
      var jsonld;
      if (scripts[i].innerText in parseLDJSON_cache) {
        jsonld = parseLDJSON_cache[scripts[i].innerText]
      } else {
        try {
          jsonld = JSON.parse(scripts[i].innerText);
          parseLDJSON_cache[scripts[i].innerText] = jsonld
        } catch(e) {
          parseLDJSON_cache[scripts[i].innerText] = null
          continue;
        }
      }
      if(jsonld) {
        if(Array.isArray(jsonld)) {
          data.push(...jsonld)
        } else {
          data.push(jsonld);
        }
      }
    }
    for(let i = 0; i < data.length; i++) {
      try {
        if(data[i] && data[i] && (typeof condition != 'function' || condition(data[i]))) {
          if(Array.isArray(keys)) {
            let r = [];
            for(let j = 0; j < keys.length; j++) {
              r.push(data[i][keys[j]]);
            }
            return r;
          } else if(keys) {
            return data[i][keys];
          } else if(typeof condition === 'function') {
            return data[i]; // Return whole object
          }
        }
      } catch(e) {
        continue;
      }
    }
    return data;
  }
  return null;
}

function meterBar(data) {
  // Create the "progress" bar with the meter score
  let barColor = "grey";
  let bgColor = "#ECE4B5";
  let color = "black";
  let width = 0;
  let textInside = "";
  let textAfter = "";

  if (data.meterClass == "certified_fresh") {
    barColor = "#C91B22";
    color = "yellow";
    textInside = String.fromCodePoint(emoji_strawberry) + " " + data.meterScore + "%"
    width = data.meterScore;
  } else if (data.meterClass == "fresh") {
    barColor = "#C91B22";
    color = "white";
    textInside = String.fromCodePoint(emoji_tomato) + " " + data.meterScore + "%"
    width = data.meterScore;
  } else if(data.meterClass == "rotten") {
    color = "gray";
    barColor = "#94B13C";
    if(data.meterScore > 30) {
      textAfter = data.meterScore + "% ";
      textInside = '<span style="font-size:13px">' + String.fromCodePoint(emoji_green_apple) + "</span>";
    } else {
      textAfter = data.meterScore + '% <span style="font-size:13px">' + String.fromCodePoint(emoji_green_apple) + "</span>";
    }
    width = data.meterScore;
  } else {
    bgColor = barColor = "#787878";
    color = "silver";
    textInside = "N/A";
    width = 100
  }

  return '<div style="width:100px; overflow: hidden;height: 20px;background-color: '+bgColor+';color: ' + color + ';text-align:center; border-radius: 4px;box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);">' +
    '<div style="width:'+ data.meterScore +'%; background-color: ' + barColor + '; color: ' + color + '; font-size:14px; font-weight:bold; text-align:center; float:left; height: 100%;line-height: 20px;box-shadow: inset 0 -1px 0 rgba(0,0,0,0.15);transition: width 0.6s ease;">' + textInside + '</div>' + textAfter +'</div>';
}

var current = {
  type : null,
  query : null,
  year : null
};


async function loadMeter(query, type, year) {
  // Load data from rotten tomatoes search API or from cache

  current.type = type;
  current.query = query;
  current.year = year;

  let rottenType = type==="movie"?"movie":"tvSeries"

  let url = baseURL_search.replace("{query}", encodeURIComponent(query)).replace("{type}", encodeURIComponent(rottenType));

  let cache = JSON.parse(await GM.getValue("cache","{}"));

  // Delete cached values, that are expired
  for(var prop in cache) {
    if((new Date()).getTime() - (new Date(cache[prop].time)).getTime() > cacheExpireAfterHours*60*60*1000) {
      delete cache[prop];
    }
  }

  // Check cache or request new content
  if(url in cache) {
    // Use cached response
    handleResponse(cache[url]);
  } else {
    GM.xmlHttpRequest({
      method: "GET",
      url: url,
      onload: function(response) {
        // Save to chache

        response.time = (new Date()).toJSON();

        // Chrome fix: Otherwise JSON.stringify(cache) omits responseText
        var newobj = {};
        for(var key in response) {
          newobj[key] = response[key];
        }
        newobj.responseText = response.responseText;


        cache[url] = newobj;


        GM.setValue("cache",JSON.stringify(cache));

        handleResponse(response);
      },
      onerror: function(response) {
        console.log("Rottentomatoes GM.xmlHttpRequest Error: "+response.status+"\nURL: "+requestURL+"\nResponse:\n"+response.responseText);
      },
    });
  }
}

function handleResponse(response) {
  // Handle GM.xmlHttpRequest response

  let data = JSON.parse(response.responseText);

  // Adapt type name from original metacritic type to rotten tomatoes type
  let prop;
  if(current.type == "movie") {
    prop = "movies";
  } else {
    prop = "tvSeries";
    // Align series info with movie info
    for(let i = 0; i < data[prop].length; i++) {
      data[prop][i]["name"] = data[prop][i]["title"];
      data[prop][i]["year"] = data[prop][i]["startYear"];
    }
  }

  if(data[prop] && data[prop].length) {
    // Sort results by closest match
    function matchQuality(title, year) {
      if(title == current.query && year == current.year) {
        return 102 + year;
      }
      if(title == current.query && current.year) {
        return 101 - Math.abs(year - current.year);
      }
      if(title.replace(/\(.+\)/, "").trim() == current.query && current.year) {
        return 100 - Math.abs(year - current.year);
      }
      if(title == current.query) {
        return 7;
      }
      if(title.replace(/\(.+\)/, "").trim() == current.query) {
        return 6;
      }
      if(title.startsWith(current.query)) {
        return 5;
      }
      if(current.query.indexOf(title) != -1) {
        return 4;
      }
      if(title.indexOf(current.query) != -1) {
        return 3;
      }
      if(current.query.toLowerCase().indexOf(title.toLowerCase()) != -1) {
        return 2;
      }
      if(title.toLowerCase().indexOf(current.query.toLowerCase()) != -1) {
        return 1;
      }
      return 0;
    }

    data[prop].sort(function(a,b) {
      if(!a.hasOwnProperty('matchQuality')) {
        a.matchQuality = matchQuality(a.name, a.year);
      }
      if(!b.hasOwnProperty('matchQuality')) {
        b.matchQuality = matchQuality(b.name, b.year);
      }

      return b.matchQuality - a.matchQuality;
    });

    showMeter(data[prop], new Date(response.time));
  } else {
    console.log("Rottentomatoes: No results for "+current.query);
  }
}





function showMeter(arr, time) {
  // Show a small box in the right lower corner
  $("#mcdiv321rotten").remove();
  let main,div;
  div = main = $('<div id="mcdiv321rotten"></div>').appendTo(document.body);
  div.css({
    position:"fixed",
    bottom :0,
    right: 0,
    minWidth: 100,
    maxWidth: 400,
    maxHeight: "95%",
    overflow: "auto",
    backgroundColor: "#fff",
    border: "2px solid #bbb",
    borderRadius:" 6px",
    boxShadow: "0 0 3px 3px rgba(100, 100, 100, 0.2)",
    color: "#000",
    padding:" 3px",
    zIndex: "5010001",
    fontFamily : "Helvetica,Arial,sans-serif"
  });


  // First result
  $('<div class="firstResult"><a style="font-size:small; color:#136CB2; " href="' + baseURL + arr[0].url + '">' + arr[0].name + " (" + arr[0].year + ")</a>" + meterBar(arr[0]) +  '</div>').appendTo(main);

  // Shall the following results be collapsed by default?
  if((arr.length > 1 && arr[0].matchQuality > 10) || arr.length > 10) {
    let a = $('<span style="color:gray;font-size: x-small">More results...</span>').appendTo(main).click(function() { more.css("display", "block"); this.parentNode.removeChild(this); });
    let more = div = $("<div style=\"display:none\"></div>").appendTo(main);
  }

  // More results
  for(let i = 1; i < arr.length; i++) {
    $('<div><a style="font-size:small; color:#136CB2; " href="' + baseURL + arr[i].url + '">' +arr[i].name + " (" + arr[i].year + ")</a>" + meterBar(arr[i]) +  '</div>').appendTo(div);
  }

  // Footer
  let sub = $("<div></div>").appendTo(main);
  $('<time style="color:#b6b6b6; font-size: 11px;" datetime="'+time+'" title="'+time.toLocaleTimeString()+" "+time.toLocaleDateString()+'">'+minutesSince(time)+'</time>').appendTo(sub);
  $('<a style="color:#b6b6b6; font-size: 11px;" target="_blank" href="' + baseURL_openTab.replace("{query}", encodeURIComponent(current.query)) + '" title="Open Rotten Tomatoes">@rottentomatoes.com</a>').appendTo(sub);
  $('<span title="Hide me" style="cursor:pointer; float:right; color:#b6b6b6; font-size: 11px; padding-left:5px;padding-top:3px">&#10062;</span>').appendTo(sub).click(function() {
    document.body.removeChild(this.parentNode.parentNode);
  });

}





var Always = () => true;
var sites = {
  'save.tv' : {
    host : ['save.tv'],
    condition : () => document.location.pathname.startsWith("/STV/M/obj/archive/"),
    products : [
    {
      condition : () => document.location.pathname.startsWith("/STV/M/obj/archive/"),
      type : 'movie',
      data : () => document.querySelector("span[data-bind='text:OrigTitle']").textContent
    }]
  },
};


function main() {
  var dataFound = false;

  for(var name in sites) {
    var site = sites[name];
    if(site.host.some(function(e) {return ~this.indexOf(e)}, document.location.hostname) && site.condition()) {
      for(var i = 0; i < site.products.length; i++) {
        if(site.products[i].condition()) {
          // Try to retrieve item name from page
          var data;
          try {
            data = site.products[i].data();
          } catch(e) {
            data = false;
            console.log("Rottentomatoes Error:")
            console.log(e);
          }
          if(data) {
            if(Array.isArray(data) && data[1]) {
              loadMeter(data[0].trim(), site.products[i].type, parseInt(data[1]));
            } else {
              loadMeter(data.trim(), site.products[i].type);
            }
            dataFound = true
          }
          break;
        }
      }
      break;
    }
  }
  return dataFound;
}



(function() {

  const firstRunResult = main();
  var lastLoc = document.location.href;
  var lastContent = document.body.innerText;
  var lastCounter = 0;
  function newpage() {
    if(lastContent == document.body.innerText && lastCounter < 15) {
      window.setTimeout(newpage, 500);
      lastCounter++;
    } else {
      lastCounter = 0;
      let re = main();
      if(!re) { // No page matched or no data found
        window.setTimeout(newpage, 1000);
      }
    }
  }
  window.setInterval(function() {
    if(document.location.href != lastLoc) {
      lastLoc = document.location.href;
      $("#mcdiv321rotten").remove();

      window.setTimeout(newpage,1000);
    }
  },500);

  if (!firstRunResult) {
    // Initial run had no match, let's try again there may be new content
    window.setTimeout(main, 2000);
  }
})();
