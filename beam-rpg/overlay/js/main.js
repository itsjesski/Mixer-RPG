// General Settings
var openTime = 8000;
queue = [];
timesClicked = 0;

// Check queue every few seconds.
setInterval(function(){ 
	profileBuilder();
}, 10000);

// CHAT
// Connect to Beam Websocket
function beamSocketConnect(){
	if ("WebSocket" in window){
		// Let us open a web socket
		ws = new ReconnectingWebSocket("ws://localhost:8080");
		ws.onopen = function(){
			console.log("Connection is opened...");
		};

		ws.onmessage = function (evt){
			var obj = JSON.parse(evt.data);
			if (obj.event == "mouseclick"){
				mouseclick(obj);
			} else if (obj.event == "bossFight"){
				canvasSetup();
				var bossName = obj.name;
				bossGenerator(bossName);
				bossRender();
				bossStart();
			} else {
				queue.push(evt);
			}
		};

		ws.onclose = function(){
		  // websocket is closed.
		  console.log("Connection is closed...");
		};

	} else {
		// The browser doesn't support WebSocket
		console.error("Woah, something broke. Abandon ship!");
	}
}
beamSocketConnect();

// Profile Builder
function profileBuilder(){
	// If queue has something in it...
	if( $.isEmptyObject(queue) !== true){
		var obj = JSON.parse(queue[0].data);
		var username = obj.uname;
		var event = obj.event;
		var eventText = obj.eventText;
		var data = obj.data;
		var stats = obj.stats;

		// Fill out the rest of the text.
		if (event == "mimic"){
			var result = obj.result;
			
			$('.loot-img.mimic').show();
			$('.loot-img.regular, .loot-img.raidtarget').hide();
			$('.clear').empty();
			$('.loot-name').text(username);
			$('.loot-reward').text('fought a '+data);
			$('.loot-reward-name').text('and '+result+'.');
			// Trigger Sound
			$('.monster-sound').trigger("play");

		} else if (event == "coin"){
			$('.loot-img.mimic, .loot-img.raidtarget').hide();
			$('.loot-img.regular').show();
			$('.clear').empty();
			$('.loot-name').text(username);
			$('.loot-reward').text('found');
			$('.loot-reward-name').text(data+" coins.");
			// Trigger Sound
			$('.coin-sound').trigger("play");

		} else if(event == "raid"){
			var raidTarget = obj.raidTarget;
			var raidTargetAvatar = obj.raidTargetAvatar;

			$('.loot-img.raidtarget img').attr('src', raidTargetAvatar);

			$('.loot-img.raidtarget').show();
			$('.loot-img.regular, .loot-img.mimic').hide();
			$('.clear').empty();
			$('.loot-name').text('Raid!');
			$('.loot-reward').text('Chat vs '+raidTarget);
			$('.loot-reward-name').text("!rpg-raid");
			// Trigger Sound
			$('.monster-sound').trigger("play");
		} else if (event == "boss"){
			var bossName = obj.bossName;
			var bossGame = obj.bossGame;
			
			$('.loot-img.mimic').show();
			$('.loot-img.regular, .loot-img.raidtarget').hide();
			$('.clear').empty();
			$('.loot-name').text(username);
			$('.loot-reward').text('fought '+bossName);
			$('.loot-reward-name').text('and won '+bossGame+'.');
			// Trigger Sound
			$('.monster-sound').trigger("play");
		} else {
			$('.loot-img.mimic, .loot-img.raidtarget').hide();
			$('.loot-img.regular').show();
			$('.clear').empty();
			$('.loot-name').text(username);
			$('.loot-reward').text('found a '+eventText+".");
			$('.loot-reward-name').text(data);
			$('.loot-reward-stats').text(stats);
			// Trigger Sound
			$('.chest-sound').trigger("play");
		}

		// Animate in...
		$('.looter').fadeIn('fast').delay(openTime).fadeOut('fast');

		// Remove from queue after build.
		queue.splice(0,1);
	}
}

///////////////////////
// Interactive Game
//////////////////////

// Mouse Clicks for Interactive
function mouseclick(obj){
	var mousex = Math.round(obj.mousex);
	var mousey = Math.round(obj.mousey);
	var clicks = obj.clicks;
	gameClicker(mousex, mousey, clicks);
}

// Set up canvas.
function canvasSetup(){
		elem = document.getElementById('game');
		elemLeft = elem.offsetLeft;
		elemTop = elem.offsetTop;
		context = elem.getContext('2d');
}


// Collision Checker
function gameClicker(mousex, mousey, clicks){
    var x = mousex,
        y = mousey;
    elements.forEach(function(element) {
        if (y > element.y - element.height && y < element.y + element.height && x > element.x - element.width && x < element.x + element.width) {
            // Element was clicked!
			
			timesClicked = timesClicked + clicks;
			
        }
    });
}

// Add element.
function bossGenerator(name){
	elements = [];
	var screenWidth = 1920;
	var screenHeight = 1080;
	
	elements.push({
		image: './images/monsters/'+name+'.png',
		width: 350,
		height: 350,
		y: 500,
		x: 1500,
		isVisible: true
	});
}
function bossRender(){
	// Render elements.
	elements.forEach(function(element) {
		if(element.isVisible === true){
			var imageObj = new Image();
			imageObj.onload = function(){
				context.drawImage(imageObj, element.x, element.y);
			}
			imageObj.src = element.image;
		}
	});
}
function bossStart(){
	$('.horn-sound').trigger("play");
	setTimeout(function(){ 
		ws.send(JSON.stringify({
			"event": "bossFightEnd",
			"data": timesClicked
		}));
		timesClicked = 0;
		context.clearRect(0, 0, 1920, 1080);
	}, 11000);
}

// Volume Control
$( document ).ready(function() {
    var chestAudio = document.getElementById("chestAudio");
    var coinAudio = document.getElementById("coinAudio");
    var monsterAudio = document.getElementById("monsterAudio");
    chestAudio.volume = 0.6;
    coinAudio.volume = 0.6;
    monsterAudio.volume = 0.6;
});

// Error Handling & Keep Alive
function errorHandle(ws){
  var wsState = ws.readyState;
  if (wsState !== 1){
    // Connection not open.
    console.log('Ready State is '+wsState);
  } else {
    // Connection open, send keep alive.
    ws.send(2);
  }
}