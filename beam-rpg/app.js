// Requirements
// These are required node modules.
var WebSocket = require('ws');
var JsonDB = require('node-json-db');
var request = require('request');
var Roll = require('roll'),
	dice = new Roll();


// Database Setup (name / save after each push / human readable format).
// This makes sure these database files exist.
var dbAuth = new JsonDB("db/auth", true, true);
var dbSettings = new JsonDB("db/settings", true, true);
var dbItems = new JsonDB("db/items", true, true);
var dbPlayers = new JsonDB("db/players", true, true);
var dbMonsters = new JsonDB("db/monsters", true, true);
var dbGame = new JsonDB("db/game", true, true);
var dbMissions = new JsonDB("db/missions", true, true);

// General Settings
// Basic app variables used with game.
rpgApp = {
	scottyauth: dbAuth.getData("/scottyauth"),
	rpgCommands: "!coins, !rpg-inventory, !rpg-daily, !rpg-adventure (cost: 500), !rpg-training (cost: 2000) !rpg-arena (bet), !rpg-duel (bet), !rpg-trivia (bet), !rpg-shop, !rpg-shop-refresh (cost: 750)",
	raidTimer: dbSettings.getData("/raid/timer"),
	cmdCooldownActive: false,
	raidActive: false,
	raiderList: [],
	weaponListOne: dbItems.getData("/weaponTypeOne"),
	weaponListTwo: dbItems.getData("/weaponTypeTwo"),
	meleeList: dbItems.getData("/meleeWeapon"),
	rangedList: dbItems.getData("/rangedWeapon"),
	magicTypeList: dbItems.getData("/magicType"),
	magicElementsList: dbItems.getData("/elements"),
	magicSpellList: dbItems.getData("/magicSpell"),
	resourceTypeList: dbItems.getData("/resourceType"),
	armorList: dbItems.getData("/armor"),
	creatureAttributeList: dbItems.getData("/creatureAttribute"),
	creatureNameList: dbItems.getData("/creatureName"),
	titleTypeList: dbItems.getData("/titleType"),
	titleList: dbItems.getData("/title"),
	companionList: dbItems.getData("/companion"),
	currencyList: dbItems.getData("/currency"),
	trophyList: dbItems.getData("/trophy"),
	training: dbMissions.getData("/training")
};

// Websocket Client Setup (Scottybot Connection)
// This connects to scottybot websocket.
function wsconnect(){
	ws = new WebSocket('wss://api.scottybot.net/websocket/control');
	ws.on('open', function open() {
		ws.send('{"event":"auth", "msgid": "UUID", "data": "' + rpgApp.scottyauth + '"}');
		ws.send('{"event": "subscribe","msgid": "UUID","data": "commands"}');
		ws.send('{"event": "subscribe","msgid": "UUID","data": "points"}');
		// Heartbeat
		setInterval(function() {
			ws.send('{"heartbeat": "Still alive!"}');

			// Debug, do something every 15 seconds.
			// buyMonster("Firebottle", 53078);
			// rpgAdventure("Firebottle", 53078);

		}, 15000);
	});
	ws.on('close', function close(){
		console.log('Socket closed! UH OH.');
	})
	ws.on('error', function error(){
		console.error('Socket encountered error.');
		ws.close()
	})
}
wsconnect();

/////////////////////////
// Scotty Command Center  
////////////////////////
// This accepts all scotty responses and determines what to do with them.
ws.on('message', function(response) {
	var data = JSON.parse(response);
	var cmdtype = data.event;

	// Debug, log all scotty messages.
	// console.log(response);

	if (cmdtype == "logon") {
		console.log('BeamRPG: Logged in to Scottybot.');
	}

	if (cmdtype == "cmdran") {
		var username = data.data["username"];
		var command = data.data["command"];
		var userid = data.data["userid"];
		var rawcommand = data.data["rawcommand"];
		var whisper = data.data["whisper"];
		var isMod = data.data["isMod"];
		var isStreamer = data.data["isStreamer"];

		console.log("BeamRPG: " + username + " used command \"" + command + "\".");

		if( dbSettings.getData("/requireWhispers") === true && whisper === true){
			scottyCommands(username, userid, command, rawcommand, isMod);
		} else if ( dbSettings.getData("/requireWhispers") === false ) {
			scottyCommands(username, userid, command, rawcommand, isMod);
		} else {
			sendWhisper(username, "Please /whisper "+dbSettings.getData('/botName')+" to run commands.");
		}

	}
});
function scottyCommands(username, userid, command, rawcommand, isMod){
	// Commands outside of cooldown.
	if (command == "rpg") {
		sendWhisper(username, "Want to play? Try these commands: " + rpgApp.rpgCommands + ".");
	} else if (command == "rpg-equip") {
		dbPlayerKeeper(username);
		dbLastSeen(username);
	} else if (command == "rpg-inventory") {
		rpgInventory(username);
		dbLastSeen(username);
	} else if (command == "rpg-daily") {
		rpgDailyQuest(username, userid);
		dbLastSeen(username);
	} else if (command == "rpg-raid") {
		rpgRaidEvent(username, rawcommand, isMod);
		dbLastSeen(username);
	} else if (command == "rpg-arena"){
		rpgCompanionDuel(username, userid, rawcommand);
		dbLastSeen(username);
	} else if (command == "rpg-duel"){
		rpgPlayerDuel(username, userid,rawcommand);
		dbLastSeen(username);
	} else if (command == "rpg-shop"){
		rpgShopPurchase(username, userid, rawcommand);
		dbLastSeen(username);
	} else if (command == "rpg-shop-refresh"){
		rpgShopLoop();
		sendBroadcast('A new travelling salesman has come to town! Type !rpg-shop to see his supply.');
	} else if (command == "rpg-training"){
		rpgTraining(username, userid);
	} else if (command == "rpg-adventure") {
		rpgAdventure(username, userid);
		dbLastSeen(username);
	} else if (command == "rpg-trivia"){
		rpgTriviaDuel(username, userid, rawcommand);
		dbLastSeen(username);
	}
}

//////////////////////
// Scotty WS Functions
//////////////////////

// Scottybot Whisper
function sendWhisper(username,message) { 
	ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "'+username+'", "data": "'+message+'"}'); 
}

// Scottybot Chat Broadcast
function sendBroadcast(message){
	ws.send('{"event": "bethebot", "msgid":"UUID", "data": "'+message+'"}');
}

// Scottybot Add Points
function addPoints(userid, points){
	ws.send('{"event": "addpoints", "msgid": "UUID", "data": {"userid": '+userid+', "points":'+points+'}}');
}

// Scottbot Delete Points
function deletePoints(userid, points){
	ws.send('{"event": "delpoints", "msgid": "UUID", "data": {"userid": '+userid+', "points": '+points+'}}');
}

// Scottbot Giveall Points
function giveallPoints(points){
	ws.send('{"event": "giveallpoints","msgid": "UUID","data": ' + points + '}');
}


/////////////////////////
// Database Manipulation  
////////////////////////

// Database Handler - Players Item Holding
// This handles adding an item to the players holding area.
function dbPlayerHolder(username, dbLocation, itemType, itemName, strength, guile, magic) {
	dbPlayers.push("/" + username + "/" + dbLocation + "/name", itemName);
	dbPlayers.push("/" + username + "/" + dbLocation + "/type", itemType);
	dbPlayers.push("/" + username + "/" + dbLocation + "/strength", strength);
	dbPlayers.push("/" + username + "/" + dbLocation + "/guile", guile);
	dbPlayers.push("/" + username + "/" + dbLocation + "/magic", magic);
}

// Database Handler - Last Seen 
// This puts a last seen date in player profile when an rpg command is run for use in DB cleanup.
function dbLastSeen(username) {
	var dateString = new Date();
	var date = dateString.getTime();
	dbPlayers.push("/" + username + "/lastSeen/lastActive", date);
}

// Database Handler - Cleanup
// This removes players from the database who have no stats, or have a last seen date greater than X days.
// Set timer in settings. If timer is 0 then people will not be deleted.
function dbCleanup(){
	var inactiveTimer = dbSettings.getData("/inactive/timer");
	if ( inactiveTimer !== 0){
		var players = dbPlayers.getData("/");
		var dateString = new Date();
		var date = dateString.getTime();

		console.log('Cleanup started.');

		for (var i in players){
		    var person = players[i];
		    var personName = i;
		    if (  date - person.lastSeen.lastActive >= inactiveTimer){
		    	dbPlayers.delete("/"+i);
		    	console.log('Cleanup removed '+i+' due to inactivity.');
		    }
		}

		console.log('Cleanup finished.');
	}
}
dbCleanup();

// Database Handler - Keep Decision
// This takes whatever item is in holder area of database and equips it to the character.
function dbPlayerKeeper(username) {
	try {
		var item = dbPlayers.getData("/" + username + "/holding");
		var itemName = item.name;
		var itemType = item.type;
		var strength = item.strength;
		var guile = item.guile;
		var magic = item.magic;

		dbPlayers.push("/" + username + "/" + itemType + "/name", itemName);
		dbPlayers.push("/" + username + "/" + itemType + "/strength", strength);
		dbPlayers.push("/" + username + "/" + itemType + "/guile", guile);
		dbPlayers.push("/" + username + "/" + itemType + "/magic", magic);

		// Rebalance Stats
		characterStats(username);

		sendWhisper(username, "You equipped: "+itemName+".");
	} catch (error) {
		sendWhisper(username, "You have nothing to equip!");
	}
}

////////////////////
// General / Helper
///////////////////

// Array Shuffler
// Shuffles an array.
function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

// Parse Trivia HTML Nonsense
// Parses trival stuff.
function parseHtml(safe) {
    return safe.replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "'")
        .replace(/&#039;/g, '"');
}

// Millisecond to Human Converter
// Convers millisconds into a timestamp people can read.
function msToTime(duration) {
    var milliseconds = parseInt((duration%1000)/100)
        , seconds = parseInt((duration/1000)%60)
        , minutes = parseInt((duration/(1000*60))%60)
        , hours = parseInt((duration/(1000*60*60))%24);

    hours = (hours < 10) ? "0" + hours : hours;
    minutes = (minutes < 10) ? "0" + minutes : minutes;
    seconds = (seconds < 10) ? "0" + seconds : seconds;

    return hours + " hours and " + minutes + " minutes.";
};

// Array Searcher
// Used in conjunction with item balancer.
function search(nameKey, myArray) {
	for (var i = 0; i < myArray.length; i++) {
		if (myArray[i].name === nameKey) {
			return myArray[i];
		}
	}
}

// Item Balancer
// Run this function to rebalance all items in the player database with new item values and character stats.
function itemRebalancer() {
	var playerList = dbPlayers.getData("/");

	for (var key in playerList) {
		var username = key;
		var userItems = playerList[key];

		if (userItems.melee !== undefined) {
			var itemType = "melee"
			var itemName = (userItems.melee.name).split(" ");
			var nameOne = itemName[0];
			var nameTwo = itemName[1];
			var nameThree = itemName[2];

			var itemStatsOne = search(nameOne, rpgApp.weaponListOne);
			var itemStatsTwo = search(nameTwo, rpgApp.weaponListTwo);
			var itemStatsThree = search(nameThree, rpgApp.meleeList);

			var strength = itemStatsOne.strength + itemStatsTwo.strength + itemStatsThree.strength;
			var guile = itemStatsOne.guile + itemStatsTwo.guile + itemStatsThree.guile;
			var magic = itemStatsOne.magic + itemStatsTwo.magic + itemStatsThree.magic;

			dbPlayers.push("/" + username + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + username + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + username + "/" + itemType + "/magic", magic);

		}
		if (userItems.ranged !== undefined) {
			var itemType = "ranged";
			var itemName = (userItems.ranged.name).split(" ");
			var nameOne = itemName[0];
			var nameTwo = itemName[1];
			var nameThree = itemName[2];

			var itemStatsOne = search(nameOne, rpgApp.weaponListOne);
			var itemStatsTwo = search(nameTwo, rpgApp.weaponListTwo);
			var itemStatsThree = search(nameThree, rpgApp.rangedList);

			var strength = itemStatsOne.strength + itemStatsTwo.strength + itemStatsThree.strength;
			var guile = itemStatsOne.guile + itemStatsTwo.guile + itemStatsThree.guile;
			var magic = itemStatsOne.magic + itemStatsTwo.magic + itemStatsThree.magic;

			dbPlayers.push("/" + username + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + username + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + username + "/" + itemType + "/magic", magic);
		}
		if (userItems.title !== undefined) {
			var itemType = "title";
			var itemName = (userItems.title.name).split(" ");
			var nameOne = itemName[0];
			var nameTwo = itemName[1];

			var itemStatsOne = search(nameOne, rpgApp.titleTypeList);
			var itemStatsTwo = search(nameTwo, rpgApp.titleList);

			var strength = itemStatsOne.strength + itemStatsTwo.strength;
			var guile = itemStatsOne.guile + itemStatsTwo.guile;
			var magic = itemStatsOne.magic + itemStatsTwo.magic;

			dbPlayers.push("/" + username + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + username + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + username + "/" + itemType + "/magic", magic);
		}
		if (userItems.magic !== undefined) {
			var itemType = "magic";
			var itemName = (userItems.magic.name).split(" ");
			var nameOne = itemName[0];
			var nameTwo = itemName[1];
			var nameThree = itemName[2];

			var itemStatsOne = search(nameOne, rpgApp.magicTypeList);
			var itemStatsTwo = search(nameTwo, rpgApp.magicElementsList);
			var itemStatsThree = search(nameThree, rpgApp.magicSpellList);

			var strength = itemStatsOne.strength + itemStatsTwo.strength + itemStatsThree.strength;
			var guile = itemStatsOne.guile + itemStatsTwo.guile + itemStatsThree.guile;
			var magic = itemStatsOne.magic + itemStatsTwo.magic + itemStatsThree.magic;

			dbPlayers.push("/" + username + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + username + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + username + "/" + itemType + "/magic", magic);
		}
		if (userItems.mount !== undefined) {
			var itemType = "mount";
			var itemName = (userItems.mount.name).split(" ");
			var nameOne = itemName[0];
			var nameTwo = itemName[1];
			var nameThree = itemName[2];

			var itemStatsOne = search(nameOne, rpgApp.weaponListOne);
			var itemStatsTwo = search(nameTwo, rpgApp.creatureAttributeList);
			var itemStatsThree = search(nameThree, rpgApp.creatureNameList);

			var strength = itemStatsOne.strength + itemStatsTwo.strength + itemStatsThree.strength;
			var guile = itemStatsOne.guile + itemStatsTwo.guile + itemStatsThree.guile;
			var magic = itemStatsOne.magic + itemStatsTwo.magic + itemStatsThree.magic;

			dbPlayers.push("/" + username + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + username + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + username + "/" + itemType + "/magic", magic);
		}
		if (userItems.armor !== undefined) {
			var itemType = "armor";
			var itemName = (userItems.armor.name).split(" ");
			var nameOne = itemName[0];
			var nameTwo = itemName[1];
			var nameThree = itemName[2];

			var itemStatsOne = search(nameOne, rpgApp.weaponListOne);
			var itemStatsTwo = search(nameTwo, rpgApp.resourceTypeList);
			var itemStatsThree = search(nameThree, rpgApp.armorList);

			var strength = itemStatsOne.strength + itemStatsTwo.strength + itemStatsThree.strength;
			var guile = itemStatsOne.guile + itemStatsTwo.guile + itemStatsThree.guile;
			var magic = itemStatsOne.magic + itemStatsTwo.magic + itemStatsThree.magic;

			dbPlayers.push("/" + username + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + username + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + username + "/" + itemType + "/magic", magic);
		}
		if (userItems.companion !== undefined) {
			var itemType = "companion";
			var itemName = (userItems.companion.name).split(" ");
			var nameOne = itemName[0];
			var nameTwo = itemName[1];
			var nameThree = itemName[2];

			var itemStatsOne = search(nameOne, rpgApp.weaponListOne);
			var itemStatsTwo = search(nameTwo, rpgApp.creatureAttributeList);
			var itemStatsThree = search(nameThree, rpgApp.companionList);

			var strength = itemStatsOne.strength + itemStatsTwo.strength + itemStatsThree.strength;
			var guile = itemStatsOne.guile + itemStatsTwo.guile + itemStatsThree.guile;
			var magic = itemStatsOne.magic + itemStatsTwo.magic + itemStatsThree.magic;

			dbPlayers.push("/" + username + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + username + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + username + "/" + itemType + "/magic", magic);

		}
		if (userItems.trophy !== undefined) {
			var itemType = "trophy";
			var itemName = (userItems.trophy.name).split(" ");
			var nameOne = itemName[1];

			var itemStatsOne = search(nameOne, rpgApp.trophyList);

			var strength = itemStatsOne.strength;
			var guile = itemStatsOne.guile;
			var magic = itemStatsOne.magic;

			dbPlayers.push("/" + username + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + username + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + username + "/" + itemType + "/magic", magic);
		}


		characterStats(username);
		console.log(username + " items have been balanced.");
	}
}

// Character Stats
// This takes into account all character items and builds out the total character stats.
function characterStats(username) {
	var totalStrength = 0;
	var totalGuile = 0;
	var totalMagic = 0;

	try {
		var strength = dbPlayers.getData("/" + username + "/title/strength");
		var guile = dbPlayers.getData("/" + username + "/title/guile");
		var magic = dbPlayers.getData("/" + username + "/title/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + username + "/melee/strength");
		var guile = dbPlayers.getData("/" + username + "/melee/guile");
		var magic = dbPlayers.getData("/" + username + "/melee/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + username + "/ranged/strength");
		var guile = dbPlayers.getData("/" + username + "/ranged/guile");
		var magic = dbPlayers.getData("/" + username + "/ranged/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + username + "/magic/strength");
		var guile = dbPlayers.getData("/" + username + "/magic/guile");
		var magic = dbPlayers.getData("/" + username + "/magic/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + username + "/armor/strength");
		var guile = dbPlayers.getData("/" + username + "/armor/guile");
		var magic = dbPlayers.getData("/" + username + "/armor/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + username + "/mount/strength");
		var guile = dbPlayers.getData("/" + username + "/mount/guile");
		var magic = dbPlayers.getData("/" + username + "/mount/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + username + "/companion/strength");
		var guile = dbPlayers.getData("/" + username + "/companion/guile");
		var magic = dbPlayers.getData("/" + username + "/companion/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + username + "/trophy/strength");
		var guile = dbPlayers.getData("/" + username + "/trophy/guile");
		var magic = dbPlayers.getData("/" + username + "/trophy/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}
	
	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;
	
	try {
		var strength = dbPlayers.getData("/" + username + "/prowess/strength");
	} catch (error) {
		var strength = 0;
	}
	try {
		var guile = dbPlayers.getData("/" + username + "/prowess/guile");
	} catch (error) {
		var guile = 0;
	}
	try {
		var magic = dbPlayers.getData("/" + username + "/prowess/magic");
	} catch (error) {
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	dbPlayers.push("/" + username + "/stats/strength", totalStrength);
	dbPlayers.push("/" + username + "/stats/guile", totalGuile);
	dbPlayers.push("/" + username + "/stats/magic", totalMagic);
}

///////////////////
// ITEM GENERATION 
//////////////////

// Monster Generation
function buyMonster(username, userid) {
	var typeOne = dbMonsters.getData("/creatureAttribute");
	var typeTwo = dbMonsters.getData("/monster");

	var typeOneRandom = typeOne[Math.floor(Math.random() * typeOne.length)];
	var typeTwoRandom = typeTwo[Math.floor(Math.random() * typeTwo.length)];
	var monster = typeOneRandom + " " + typeTwoRandom;

	var monsterName = monster;
	var diceRoller = (dice.roll({
				quantity: 9,
				sides: 6,
				transformations: ['sum']
			})).result;
	var monsterStrength = diceRoller;
	var diceRoller = (dice.roll({
				quantity: 9,
				sides: 6,
				transformations: ['sum']
			})).result;
	var monsterGuile = diceRoller;
	var diceRoller = (dice.roll({
				quantity: 9,
				sides: 6,
				transformations: ['sum']
			})).result;
	var monsterMagic = diceRoller;

	try {
		var playerStrength = dbPlayers.getData("/" + username + "/stats/strength");
		var playerGuile = dbPlayers.getData("/" + username + "/stats/guile");
		var playerMagic = dbPlayers.getData("/" + username + "/stats/magic");
	} catch (error){
		var playerStrength = 0;
		var playerGuile = 0;
		var playerMagic = 0;
	}
	
	var player = '{"name": "'+username+'", "strength": ' + playerStrength + ', "guile": ' + playerGuile + ', "magic": ' + playerMagic + '}';
	var monster = '{"name":"' + monsterName + '", "strength": ' + monsterStrength + ', "guile": ' + monsterGuile + ', "magic": ' + monsterMagic + '}';

	var combatResults = rpgCombat(player, monster, 1);
	if( combatResults == username ){
		// Add points to user in scottybot
		var coins = 250;
		addPoints(userid, coins);
		sendWhisper(username, "You defeated a "+monsterName+". Reward: 50 coins.");
	} else {
		// Player lost. Points for the points god!
		sendWhisper(username, "You were defeated by the "+monsterName+"! Try again!");
	}
};

// Melee Item Generation
function buyMelee(username) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.weaponListTwo[Math.floor(Math.random() * rpgApp.weaponListTwo.length)];
	var randomThree = rpgApp.meleeList[Math.floor(Math.random() * rpgApp.meleeList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username, "You found a weapon: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(username, "holding", "melee", itemName, strengthStat, guileStat, magicStat);
};

// Ranged Item Generation
function buyRanged(username) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.weaponListTwo[Math.floor(Math.random() * rpgApp.weaponListTwo.length)];
	var randomThree = rpgApp.rangedList[Math.floor(Math.random() * rpgApp.rangedList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You found a ranged weapon: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(username, "holding", "ranged", itemName, strengthStat, guileStat, magicStat);
};

// Magic Item Generation
function buyMagic(username) {
	var randomOne = rpgApp.magicTypeList[Math.floor(Math.random() * rpgApp.magicTypeList.length)];
	var randomTwo = rpgApp.magicElementsList[Math.floor(Math.random() * rpgApp.magicElementsList.length)];
	var randomThree = rpgApp.magicSpellList[Math.floor(Math.random() * rpgApp.magicSpellList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You learned a spell: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(username, "holding", "magic", itemName, strengthStat, guileStat, magicStat);
};

// armor Item Generation
function buyArmor(username) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.resourceTypeList[Math.floor(Math.random() * rpgApp.resourceTypeList.length)];
	var randomThree = rpgApp.armorList[Math.floor(Math.random() * rpgApp.armorList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username, "You found armor: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(username, "holding", "armor", itemName, strengthStat, guileStat, magicStat);
};

// Mount Item Generation
function buyMount(username) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.creatureAttributeList[Math.floor(Math.random() * rpgApp.creatureAttributeList.length)];
	var randomThree = rpgApp.creatureNameList[Math.floor(Math.random() * rpgApp.creatureNameList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You found a mount: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(username, "holding", "mount", itemName, strengthStat, guileStat, magicStat);
};

// Title Generation
function buyTitle(username) {
	var randomOne = rpgApp.titleTypeList[Math.floor(Math.random() * rpgApp.titleTypeList.length)];
	var randomTwo = rpgApp.titleList[Math.floor(Math.random() * rpgApp.titleList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength;
	var guileStat = randomOne.guile + randomTwo.guile;
	var magicStat = randomOne.magic + randomTwo.magic;
	var itemName = randomOne.name + " " + randomTwo.name;

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You won a title: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(username, "holding", "title", itemName, strengthStat, guileStat, magicStat);
};

// Companion Generation
function buyCompanion(username) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.creatureAttributeList[Math.floor(Math.random() * rpgApp.creatureAttributeList.length)];
	var randomThree = rpgApp.companionList[Math.floor(Math.random() * rpgApp.companionList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username, "You found a companion: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(username, "holding", "companion", itemName, strengthStat, guileStat, magicStat);
};

// Coin Generation
function buyCoins(username, userid) {
	var currency = dbItems.getData("/currency");
	var coins = currency[Math.floor(Math.random() * currency.length)];

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got ' + coins + ' coins.');
	sendWhisper(username,"You found "+coins+" coins!");

	// Add points to user in scottybot
	addPoints(userid, coins);
};

// Trophy Generation
function buyTrophy(username, streamerName) {
	var randomOne = streamerName;
	var randomTwo = rpgApp.trophyList[Math.floor(Math.random() * rpgApp.trophyList.length)];

	var strengthStat = randomTwo.strength;
	var guileStat = randomTwo.guile;
	var magicStat = randomTwo.magic;
	var itemName = streamerName + "'s " + randomTwo.name;

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You found a trophy: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(username, "holding", "trophy", itemName, strengthStat, guileStat, magicStat);
};

// RPG Inventory
// Prints out a players inventory.
function rpgInventory(username) {
	// Recalc total.
	characterStats(username);

	try {
		var title = dbPlayers.getData("/" + username + "/title/name");
		var strength = dbPlayers.getData("/" + username + "/title/strength");
		var guile = dbPlayers.getData("/" + username + "/title/guile");
		var magic = dbPlayers.getData("/" + username + "/title/magic");
		var titleStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var title = "Commoner"
		var titleStats = "(0/0/0)";
	}

	try {
		var melee = dbPlayers.getData("/" + username + "/melee/name");
		var strength = dbPlayers.getData("/" + username + "/melee/strength");
		var guile = dbPlayers.getData("/" + username + "/melee/guile");
		var magic = dbPlayers.getData("/" + username + "/melee/magic");
		var meleeStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var melee = "Fists"
		var meleeStats = "(0/0/0)";
	}

	try {
		var ranged = dbPlayers.getData("/" + username + "/ranged/name");
		var strength = dbPlayers.getData("/" + username + "/ranged/strength");
		var guile = dbPlayers.getData("/" + username + "/ranged/guile");
		var magic = dbPlayers.getData("/" + username + "/ranged/magic");
		var rangedStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var ranged = "Nothing";
		var rangedStats = "(0/0/0)";
	}

	try {
		var magicName = dbPlayers.getData("/" + username + "/magic/name");
		var strength = dbPlayers.getData("/" + username + "/magic/strength");
		var guile = dbPlayers.getData("/" + username + "/magic/guile");
		var magic = dbPlayers.getData("/" + username + "/magic/magic");
		var magicStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var magicName = "Nothing";
		var magicStats = "(0/0/0)";
	}

	try {
		var armor = dbPlayers.getData("/" + username + "/armor/name");
		var strength = dbPlayers.getData("/" + username + "/armor/strength");
		var guile = dbPlayers.getData("/" + username + "/armor/guile");
		var magic = dbPlayers.getData("/" + username + "/armor/magic");
		var armorStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var armor = "Naked";
		var armorStats = "(0/0/0)";
	}

	try {
		var mount = dbPlayers.getData("/" + username + "/mount/name");
		var strength = dbPlayers.getData("/" + username + "/mount/strength");
		var guile = dbPlayers.getData("/" + username + "/mount/guile");
		var magic = dbPlayers.getData("/" + username + "/mount/magic");
		var mountStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var mount = "Nothing";
		var mountStats = "(0/0/0)";
	}

	try {
		var companion = dbPlayers.getData("/" + username + "/companion/name");
		var strength = dbPlayers.getData("/" + username + "/companion/strength");
		var guile = dbPlayers.getData("/" + username + "/companion/guile");
		var magic = dbPlayers.getData("/" + username + "/companion/magic");
		var companionStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var companion = "None";
		var companionStats = "(0/0/0)";
	}

	try {
		var trophy = dbPlayers.getData("/" + username + "/trophy/name");
		var strength = dbPlayers.getData("/" + username + "/trophy/strength");
		var guile = dbPlayers.getData("/" + username + "/trophy/guile");
		var magic = dbPlayers.getData("/" + username + "/trophy/magic");
		var trophyStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var trophy = "None";
		var trophyStats = "(0/0/0)";
	}
	
	try {
		var prowessStrength = dbPlayers.getData("/" + username + "/prowess/strength");
	} catch (error) {
		var prowessStrength = 0;
	}
	try {
		var prowessGuile = dbPlayers.getData("/" + username + "/prowess/guile");
	} catch (error) {
		var prowessGuile = 0;
	}
	try {
		var prowessMagic = dbPlayers.getData("/" + username + "/prowess/magic");
	} catch (error) {
		var prowessMagic = 0;
	}
	var prowessStats = "("+prowessStrength+"/"+prowessGuile+"/"+prowessMagic+")";

	try {
		var strength = dbPlayers.getData("/" + username + "/stats/strength");
		var guile = dbPlayers.getData("/" + username + "/stats/guile");
		var magic = dbPlayers.getData("/" + username + "/stats/magic");
		var charStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var charStats = "Error";
	}

	var sayInventory = username + " the " + title + " " + titleStats + " || Melee: " + melee + " " + meleeStats + " || Ranged: " + ranged + " " + rangedStats + " || Magic: " + magicName + " " + magicStats + " || Armor: " + armor + " " + armorStats + " || Mount: " + mount + " " + mountStats + " || Companion: " + companion + " " + companionStats + " || Trophy: " + trophy + " " + trophyStats + " || Prowess: "+prowessStats+" || Total: " + charStats;

	sendWhisper(username, sayInventory);
}

///////////////////////////
// QUESTS, ADVENTURES, ETC
//////////////////////////

// RPG Combat
// This handles combat in the game.
function rpgCombat(userOne, userTwo, diceToRoll) {
	var personOne = JSON.parse(userOne);
	var personTwo = JSON.parse(userTwo);

	// Get Stats
	var personOneName = personOne.name;
	var personOneStrength = personOne.strength;
	var personOneGuile = personOne.guile;
	var personOneMagic = personOne.magic;
	var personTwoName = personTwo.name;
	var personTwoStrength = personTwo.strength;
	var personTwoGuile = personTwo.guile;
	var personTwoMagic = personTwo.magic;

	var round = 0;
	var personOneWin = 0;
	var personTwoWin = 0

	while (round < 3) {
		// Pick stat to face off with.
		var statPicker = (dice.roll('d3')).result;
		if (statPicker === 1) {
			//Strength
			var diceRoller = (dice.roll({
				quantity: diceToRoll,
				sides: 6,
				transformations: ['sum']
			})).result;
			var personOneRoll = personOneStrength + diceRoller;

			var diceRoller = (dice.roll({
				quantity: diceToRoll,
				sides: 6,
				transformations: ['sum']
			})).result;
			var personTwoRoll = personTwoStrength + diceRoller;
			console.log('Strength: ' + personOneRoll + ' vs ' + personTwoRoll);

			if (personOneRoll >= personTwoRoll) {
				var personOneWin = personOneWin + 1;
			} else {
				var personTwoWin = personTwoWin + 1;
			}
		} else if (statPicker === 2) {
			//Guile
			var diceRoller = (dice.roll({
				quantity: diceToRoll,
				sides: 6,
				transformations: ['sum']
			})).result;
			var personOneRoll = personOneGuile + diceRoller;
			var diceRoller = (dice.roll({
				quantity: diceToRoll,
				sides: 6,
				transformations: ['sum']
			})).result;
			var personTwoRoll = personTwoGuile + diceRoller;
			console.log('Guile: ' + personOneRoll + ' vs ' + personTwoRoll);

			if (personOneRoll >= personTwoRoll) {
				var personOneWin = personOneWin + 1;
			} else {
				var personTwoWin = personTwoWin + 1;
			}
		} else {
			//Magic
			var diceRoller = (dice.roll({
				quantity: diceToRoll,
				sides: 6,
				transformations: ['sum']
			})).result;
			var personOneRoll = personOneMagic + diceRoller;
			var diceRoller = (dice.roll({
				quantity: diceToRoll,
				sides: 6,
				transformations: ['sum']
			})).result;
			var personTwoRoll = personTwoMagic + diceRoller;
			console.log('Magic: ' + personOneRoll + ' vs ' + personTwoRoll);

			if (personOneRoll >= personTwoRoll) {
				var personOneWin = personOneWin + 1;
			} else {
				var personTwoWin = personTwoWin + 1;
			}
		}

		// Go to next round.
		var round = round + 1;
	}

	console.log('Combat Results: ' + personOne.name + ': ' + personOneWin + ' vs ' + personTwo.name + ': ' + personTwoWin);

	sendWhisper(personOneName, "Combat Results: " + personOne.name + " (" + personOneStrength + "/" + personOneGuile + "/" + personOneMagic + ") won "+personOneWin+" times. vs " + personTwo.name + " (" + personTwoStrength + "/" + personTwoGuile + "/" + personTwoMagic + ") won "+personTwoWin+" times.");
	
	sendWhisper(personTwoName, "Combat Results: " + personOne.name + " (" + personOneStrength + "/" + personOneGuile + "/" + personOneMagic + ") won "+personOneWin+" times. vs " + personTwo.name + " (" + personTwoStrength + "/" + personTwoGuile + "/" + personTwoMagic + ") won "+personTwoWin+" times.");

	if (personOneWin > personTwoWin) {
		var result = personOneName;
	} else {
		var result = personTwoName;
	}

	return result;
}

// RPG Adventure
// This sends the character on an adventure where they get a random piece of loot.
// Rolls a d20 to determine what happens.
function rpgAdventure(username, userid) {
	var diceRoll = Math.floor((Math.random() * 20) + 1);

	if (diceRoll === 1 || diceRoll === 20) {
		// Mimic!
		buyMonster(username, userid);
	} else if (diceRoll >= 2 && diceRoll <= 4) {
		// Melee
		buyMelee(username);
	} else if (diceRoll >= 5 && diceRoll <= 7) {
		// Ranged
		buyRanged(username);
	} else if (diceRoll >= 8 && diceRoll <= 11) {
		// Magic Spell
		buyMagic(username);
	} else if (diceRoll >= 12 && diceRoll <= 13) {
		// armor
		buyArmor(username);
	} else if (diceRoll >= 14 && diceRoll <= 15) {
		// Mount
		buyMount(username);
	} else if (diceRoll === 16) {
		//Title
		buyTitle(username);
	} else if (diceRoll === 17) {
		//Companion
		buyCompanion(username);
	} else {
		//Coins
		buyCoins(username, userid);
	}
}

// RPG Daily Quest
// This is a simply daily that people can trigger once every 24 hours to get a coin boost.
function rpgDailyQuest(username, userid) {
	var dailyReward = dbSettings.getData("/dailyReward");
	try {
		var lastDaily = dbPlayers.getData("/" + username + "/lastSeen/dailyQuest");
	} catch (error) {
		var lastDaily = 1;
	}
	var date = new Date().getTime();
	var timeSinceLastDaily = date - lastDaily;
	var timeUntilNext = 86400000 - timeSinceLastDaily;
	var humanTime = msToTime(timeUntilNext);

	if (timeSinceLastDaily >= 86400000) {
		dbPlayers.push("/" + username + "/lastSeen/dailyQuest", date);
		addPoints(userid, dailyReward);
		sendWhisper(username, "Daily completed! Reward: " + dailyReward + " || Cooldown: 24hr");
	} else {
		sendWhisper(username, "You already completed your daily! Try again in " + humanTime + ".");
	}
}

// RPG Raid Event
// This will start a raid and use the target streamer as a boss. Meant to be used once at the end of a stream. 
function rpgRaidEvent(username, rawcommand, isMod) {
	var raidCommandArray = (rawcommand).split(" ");
	var raidTarget = raidCommandArray[1];

	if (isMod === true && rpgApp.raidActive === false && raidTarget !== undefined) {

		// Get target info and start up the raid.
		request('https://beam.pro/api/v1/channels/' + raidTarget, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				// Great, valid raid target. Get target info, set raid to active, send broadcast to overlay with info.
				var data = JSON.parse(body);
				var streamUrl = "https://beam.pro/" + raidTarget;
				sendBroadcast(username+" has started a raid! Type !rpg-raid to join!");
				rpgApp.raidActive = true;

				// Start timer for raid event based on setting in settings db.
				setTimeout(function() {
					
					var diceRoller = (dice.roll({
						quantity: 1,
						sides: 20,
						transformations: ['sum']
					})).result;
					
					if (diceRoller <= 3){
						var luckyPerson = rpgApp.raiderList[Math.floor(Math.random() * rpgApp.raiderList.length)];
						var luckyPersonName = luckyPerson.name;
						buyTrophy(luckyPersonName, raidTarget);
						var raidWinCoin = dbSettings.getData("/raid/winReward");
						giveallPoints(raidWinCoin);
						sendBroadcast("The raid has ended. Winner: " + combatResults + ". " + luckyPersonName + " got a trophy. Everyone also gets " + raidWinCoin + " coins!")
						sendWhisper(luckyPersonName, "You got a trophy! Type !rpg-equip to use it!");
					} else {
						var raidLoseCoin = dbSettings.getData("/raid/loseReward");
						giveallPoints(raidLoseCoin);
						sendBroadcast("The raid has ended. Winner: " + combatResults + ". Everyone gets " + raidLoseCoin + " coins for your repair bill.");
					}

					// Get raid message and send that to chat when everything is over.
					var raidMessage = dbSettings.getData("/raid/raidMessage");
					sendBroadcast(raidMessage + " || beam.pro/" + raidTarget);

					// Reset lists and flags
					rpgApp.raidActive = false;
					rpgApp.raiderList = []

				}, rpgApp.raidTimer);

			} else {
				sendWhisper(username, "Error: " + raidTarget + "=] is not a valid raid target!");
			}
		})

	} else if (rpgApp.raidActive === true) {
		// Raid is active. Add user to raid participant list if they're not already there.
		var raiderName = search(username, rpgApp.raiderList);
		if (raiderName === undefined) {
			rpgApp.raiderList.push({
				"name": username,
			});
			sendWhisper(username, "You\'ve joined the raid!");
		} else {
			sendWhisper(username, "You\'ve already joined the raid!");
		}
	} else {
		// No raid is active
		sendWhisper(username, "There is currently not an active raid.");
	}
}

// RPG Companion Duel
// This allows users to battle companions for coins.
function rpgCompanionDuel(username, userid, rawcommand){
	var isAllowed = dbSettings.getData("/companionDuel/active");

	if (isAllowed === true){
		var commandArray = (rawcommand).split(" ");
		var pointsBet = commandArray[1];
		var inProgress = dbGame.getData("/companionDuel/settings/inProgress");

		// If points bet is a number and greater than zero, proceed to check to see if they have enough points.
		if ( isNaN(pointsBet) === false && pointsBet > 0 || inProgress === true){
			var pointsBet = parseInt(pointsBet);
			request('https://api.scottybot.net/api/points?authkey=' + rpgApp.scottyauth +'&userid='+userid, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					// Great, this person exists!
					var jsonparse = JSON.parse(body);
					var pointsTotal = jsonparse.points;
					var minimumBet = dbSettings.getData("/companionDuel/minBet");
					var inProgress = dbGame.getData("/companionDuel/settings/inProgress");
					var expire = dbGame.getData("/companionDuel/settings/expireTime");
					try {
						var companion = dbPlayers.getData("/"+username+'/companion');
						var companionName = companion.name;
						var companionStrength = companion.strength;
						var companionGuile = companion.guile;
						var companionMagic = companion.magic;
					} catch (error) {
						var player = false;
					}
					try {
						var currentBet = dbGame.getData("/companionDuel/settings/amount");
					} catch (error){
						var currentBet = 0;
					}
					try {
						var playerOneName = dbGame.getData("/companionDuel/playerOne/name");
					} catch (error){
						var playerOneName = "none";
					}

					var date = new Date().getTime();
					var expireCheck = date - expire;

					// Check to see if they have equipment.
					if ( player !== false ){
						// Check to see if a duel is in progress and make sure the player doesn't fight themselves and has money to back their bet.
						if (inProgress === true && pointsTotal >= currentBet && expireCheck <= 30000 && playerOneName !== username){
							// Push all of their info to the duel arena.
							dbGame.push("/companionDuel/playerTwo/name", username);
							dbGame.push("/companionDuel/playerTwo/userid", userid);
							dbGame.push("/companionDuel/playerTwo/companionName", companionName);
							dbGame.push("/companionDuel/playerTwo/companionStrength", companionStrength);
							dbGame.push("/companionDuel/playerTwo/companionGuile", companionGuile);
							dbGame.push("/companionDuel/playerTwo/companionMagic", companionMagic);

							// Send info to combat function.
							var playerOne = dbGame.getData("/companionDuel/playerOne");
							var playerTwo = dbGame.getData("/companionDuel/playerTwo");
							var playerOneCombat = '{"name": "'+playerOne.name+'", "strength": ' + playerOne.companionStrength + ', "guile": ' + playerOne.companionGuile + ', "magic": ' + playerOne.companionMagic + '}';
							var playerTwoCombat = '{"name": "'+playerTwo.name+'", "strength": ' + playerTwo.companionStrength + ', "guile": ' + playerTwo.companionGuile + ', "magic": ' + playerTwo.companionMagic + '}';

							// Take number of points that were bet.
							deletePoints(playerOne.userid, currentBet);
							deletePoints(playerTwo.userid, currentBet);

							// Send combat results and calc win.
							var combatResults = rpgCombat(playerOneCombat, playerTwoCombat, 1);
							var winnings = currentBet * 2;

							// Give the pot to whoever won.
							if (playerOne.name == combatResults){
								var winID = playerOne.userid;
								console.log('Arena Winner: '+playerOne.name+'('+winID+') Amount:'+winnings);
								addPoints(winID, winnings);
							} else {
								var winID = playerTwo.userid;
								console.log('Arena Winner: '+playerTwo.name+'('+winID+') Amount:'+winnings);
								addPoints(winID, winnings);
							}
							
							// Reset Game
							dbGame.delete("/companionDuel/playerOne");
							dbGame.delete("/companionDuel/playerTwo");
							dbGame.push("/companionDuel/playerOne/name", "none");
							dbGame.push("/companionDuel/settings/inProgress", false);
							dbGame.push("/companionDuel/settings/expireTime", 0);
							dbGame.push("/companionDuel/settings/amount", 0);

						} else if ( pointsBet <= pointsTotal && pointsBet >= minimumBet && playerOneName !== username && expireCheck >= 30000) {
							// No duel started, so gather up info and push to duel arena.
							dbGame.push("/companionDuel/playerOne/name", username);
							dbGame.push("/companionDuel/playerOne/userid", userid);
							dbGame.push("/companionDuel/playerOne/companionName", companionName);
							dbGame.push("/companionDuel/playerOne/companionStrength", companionStrength);
							dbGame.push("/companionDuel/playerOne/companionGuile", companionGuile);
							dbGame.push("/companionDuel/playerOne/companionMagic", companionMagic);
							dbGame.push("/companionDuel/settings/amount", pointsBet);
							dbGame.push("/companionDuel/settings/expireTime", date);
							dbGame.push("/companionDuel/settings/inProgress", true);
							
							// Broadcast that a duelist is waiting for a challenger.
							sendBroadcast(username+" has bet "+pointsBet+" on their champion: "+companionName+". Type !rpg-arena to accept the challenge. Expires: 30 sec.");

						} else if ( playerOneName == username && expireCheck <= 30000){
							// User is already entered in duel and still waiting on challenger.
							sendWhisper(username, "Stop hitting yourself! You are already entered in the arena.");
						} else if (pointsBet >= pointsTotal || pointsTotal <= currentBet || pointsBet < minimumBet ) {
							// Person doesn't have enough points to participate or bet below the minimum.
							sendWhisper(username, "You do not have enough coins or you bet below the minimum "+minimumBet+" coins.");
						} else if (expireCheck >= 30000 && pointsBet >= minimumBet){
							// Duel time expired. Refund waiting duelist and reset game.
							var playerOne = dbGame.getData("/companionDuel/playerOne");
							var betAmount = dbGame.getData("/companionDuel/settings/amount");
							var playerOneID = playerOne.userid;
							console.log('Arena Expired. Starting new arena.');
							dbGame.delete("/companionDuel/playerOne");
							dbGame.delete("/companionDuel/playerTwo");
							dbGame.push("/companionDuel/playerOne/name", "none");
							rpgCompanionDuel(username, userid, rawcommand);
						} else {
							console.log('Duel error!');
						}
					} else {
						// Player doesn't have a player to fight with...
						sendWhisper(username, "You do not have any equipment to use!");
					}
				} else {
					// Some type of error where I couldn't find points for the user.
					console.log('Could not retrieve scottybot points for '+username, userid);
					sendWhisper(username, "Error! There was an issue with connecting to scottybot.");
				}
			})
		} else {
			// Someone typed in a command with some gibberish on the end.
			sendWhisper(username, "Invalid command. Try !rpg-arena (number)");
		}
	} else {
		sendWhisper(username, "This command is currently deactivated.");
	}
}

// RPG Player Duel
// This allows users to battle each other.
function rpgPlayerDuel(username, userid, rawcommand){
	var isAllowed = dbSettings.getData("/playerDuel/active");

	if (isAllowed === true){
		var commandArray = (rawcommand).split(" ");
		var pointsBet = commandArray[1];
		var inProgress = dbGame.getData("/playerDuel/settings/inProgress");

		// If points bet is a number and greater than zero, proceed to check to see if they have enough points.
		if ( isNaN(pointsBet) === false && pointsBet > 0 || inProgress === true){
			var pointsBet = parseInt(pointsBet);
			request('https://api.scottybot.net/api/points?authkey=' + rpgApp.scottyauth +'&userid='+userid, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					// Great, this person exists!
					var jsonparse = JSON.parse(body);
					var pointsTotal = jsonparse.points;
					var minimumBet = dbSettings.getData("/playerDuel/minBet");
					var inProgress = dbGame.getData("/playerDuel/settings/inProgress");
					var expire = dbGame.getData("/playerDuel/settings/expireTime");
					try {
						var player = dbPlayers.getData("/"+username+"/stats");
						var playerName = username;
						var playerStrength = player.strength;
						var playerGuile = player.guile;
						var playerMagic = player.magic;
					} catch (error) {
						var player = false;
					}
					
					try {
						var currentBet = dbGame.getData("/playerDuel/settings/amount");
					} catch (error){
						var currentBet = 0;
					}
					
					try {
						var playerOneName = dbGame.getData("/playerDuel/playerOne/name");
					} catch (error){
						var playerOneName = "none";
					}

					var date = new Date().getTime();
					var expireCheck = date - expire;

					// Check to see if they have equipment.
					if ( player !== false ){
						// Check to see if a duel is in progress and make sure the player doesn't fight themselves and has money to back their bet.
						if (inProgress === true && pointsTotal >= currentBet && expireCheck <= 30000 && playerOneName !== username){
							// Push all of their info to the duel arena.
							dbGame.push("/playerDuel/playerTwo/name", username);
							dbGame.push("/playerDuel/playerTwo/userid", userid);
							dbGame.push("/playerDuel/playerTwo/playerName", playerName);
							dbGame.push("/playerDuel/playerTwo/playerStrength", playerStrength);
							dbGame.push("/playerDuel/playerTwo/playerGuile", playerGuile);
							dbGame.push("/playerDuel/playerTwo/playerMagic", playerMagic);

							// Get player data.
							var playerOne = dbGame.getData("/playerDuel/playerOne");
							var playerTwo = dbGame.getData("/playerDuel/playerTwo");

							// Take number of points that were bet.
							deletePoints(playerOne.userid, currentBet);
							deletePoints(playerTwo.userid, currentBet);

							// Send info to combat function.
							var playerOneCombat = '{"name": "'+playerOne.name+'", "strength": ' + playerOne.playerStrength + ', "guile": ' + playerOne.playerGuile + ', "magic": ' + playerOne.playerMagic + '}';
							var playerTwoCombat = '{"name": "'+playerTwo.name+'", "strength": ' + playerTwo.playerStrength + ', "guile": ' + playerTwo.playerGuile + ', "magic": ' + playerTwo.playerMagic + '}';

							// Get Results can calulate winnings.
							var combatResults = rpgCombat(playerOneCombat, playerTwoCombat, 1);
							var winnings = currentBet * 2;

							// Give the pot to whoever won.
							if (playerOne.name == combatResults){
								var winID = playerOne.userid;
								console.log('Arena Winner: '+playerOne.name+'('+winID+') Amount:'+winnings);
								addPoints(winID, winnings);
							} else {
								var winID = playerTwo.userid;
								console.log('Arena Winner: '+playerTwo.name+'('+winID+') Amount:'+winnings);
								addPoints(winID, winnings);
							}
							
							// Reset Game
							dbGame.delete("/playerDuel/playerOne");
							dbGame.delete("/playerDuel/playerTwo");
							dbGame.push("/playerDuel/playerOne/name", "none");
							dbGame.push("/playerDuel/settings/inProgress", false);
							dbGame.push("/playerDuel/settings/expireTime", 0);
							dbGame.push("/playerDuel/settings/amount", 0);

						} else if ( pointsBet <= pointsTotal && pointsBet >= minimumBet && playerOneName !== username && expireCheck >= 30000) {
							// No duel started, so gather up info and push to duel arena.
							dbGame.push("/playerDuel/playerOne/name", username);
							dbGame.push("/playerDuel/playerOne/userid", userid);
							dbGame.push("/playerDuel/playerOne/playerName", playerName);
							dbGame.push("/playerDuel/playerOne/playerStrength", playerStrength);
							dbGame.push("/playerDuel/playerOne/playerGuile", playerGuile);
							dbGame.push("/playerDuel/playerOne/playerMagic", playerMagic);
							dbGame.push("/playerDuel/settings/amount", pointsBet);
							dbGame.push("/playerDuel/settings/expireTime", date);
							dbGame.push("/playerDuel/settings/inProgress", true);
							
							// Broadcast that a duelist is waiting for a challenger.
							sendBroadcast(playerName+" has bet "+pointsBet+" coins on a duel. Type !rpg-duel to accept the challenge. Expires: 30 sec.");
						} else if ( playerOneName == username && expireCheck <= 30000){
							// User is already entered in duel and still waiting on challenger.
							sendWhisper(username, "Stop hitting yourself! You are already entered in the arena.");
						} else if (pointsBet >= pointsTotal || pointsTotal <= currentBet || pointsBet < minimumBet) {
							// Person doesn't have enough points to participate or bet below the minimum.
							sendWhisper(username, "You do not have enough coins or you bet below the minimum "+minimumBet+" coins.");
						} else if (expireCheck >= 30000 && pointsBet >= minimumBet ){
							// Duel time expired. Refund waiting duelist and reset game.
							var playerOne = dbGame.getData("/playerDuel/playerOne");
							var betAmount = dbGame.getData("/playerDuel/settings/amount");
							var playerOneID = playerOne.userid;
							console.log('Arena Expired. Starting new arena.');
							dbGame.delete("/playerDuel/playerOne");
							dbGame.delete("/playerDuel/playerTwo");
							dbGame.push("/playerDuel/playerOne/name", "none");
							rpgPlayerDuel(username, userid, rawcommand);
						} else {
							console.log('Duel error!');
						}
					} else {
						// Player doesn't have a player to fight with...
						sendWhisper(username, "You do not have any equipment to use!");
					}
				} else {
					// Some type of error where I couldn't find points for the user.
					console.log('Could not retrieve scottybot points for '+username, userid);
					sendWhisper(username, "Error! There was an issue connecting to scottybot.");
				}
			})
		} else {
			// Someone typed in a command with some gibberish on the end.
			sendWhisper(username, "Invalid command. Try !rpg-arena (number)");
		}
	} else {
		sendWhisper(username, "This command is currently deactivated.");
	}
}

// RPG Trivia Duel
// This allows users to trivia battle for coins.
function rpgTriviaDuel(username, userid, rawcommand){
	var isAllowed = dbSettings.getData("/triviaDuel/active");

	if (isAllowed === true){
		var commandArray = (rawcommand).split(" ");
		var pointsBet = commandArray[1];
		var inProgress = dbGame.getData("/triviaDuel/settings/inProgress");
		var awaitingAnswer = dbGame.getData("/triviaDuel/settings/awaitingAnswer");

		// If points bet is a number and greater than zero, proceed to check to see if they have enough points. If they do, see if question needs and answer or not.
		if ( isNaN(pointsBet) === false && pointsBet > 0 && awaitingAnswer === false|| inProgress === true && awaitingAnswer === false){
			var pointsBet = parseInt(pointsBet);
			request('https://api.scottybot.net/api/points?authkey=' + rpgApp.scottyauth +'&userid='+userid, function(error, response, body) {
				if (!error && response.statusCode == 200) {
					// Great, this person exists!
					var jsonparse = JSON.parse(body);
					var pointsTotal = jsonparse.points;
					var minimumBet = dbSettings.getData("/triviaDuel/minBet");
					var expire = dbGame.getData("/triviaDuel/settings/expireTime");
					var currentBet = dbGame.getData("/triviaDuel/settings/amount");
					var playerOneName = dbGame.getData('/triviaDuel/playerOne/name');

					var date = new Date().getTime();
					var expireCheck = date - expire;

					// Check to see if a duel is in progress and make sure the player doesn't fight themselves and has money to back their bet.
					if (inProgress === true && pointsTotal >= currentBet && expireCheck <= 30000 && playerOneName !== username){
						// Push all of their info to the duel arena.
						dbGame.push("/triviaDuel/playerTwo/name", username);
						dbGame.push("/triviaDuel/playerTwo/userid", userid);

						// Combat stuff goes here because duel was started with two people.
						var triviaCategoryArray = [10, 15, 17, 16, 20, 27];
						var triviaCategory = triviaCategoryArray[Math.floor(Math.random()*triviaCategoryArray.length)];
						request('http://www.opentdb.com/api.php?amount=1&category='+triviaCategory, function(error, response, body) {
							if (!error && response.statusCode == 200) {
								console.log(body);
								var body = JSON.parse(body);
								var result = body.results;
								var trivia = result[0];
								var categoryOrig = trivia.category;
								var category = parseHtml(categoryOrig);
								var questionOrig = trivia.question;
								var question = parseHtml(questionOrig);
								var correctAnswerOrig = trivia.correct_answer;
								var correctAnswer = parseHtml(correctAnswerOrig);

								var incorrectAnswer = trivia.incorrect_answers;
								var answerArray = [];
								
								// Push correct answer to array.
								answerArray.push(correctAnswer);
								// Push incorrect answers into answer array.
								for (var i=0, len=incorrectAnswer.length; i < len; i++) {
									var answerOrig = incorrectAnswer[i];
									var answer = parseHtml(answerOrig);
									answerArray.push(answer);
								}
								
								// Push all answers to DB for comparison
								dbGame.push("/triviaDuel/settings/correct", correctAnswer);
								dbGame.push("/triviaDuel/settings/answers", answerArray);
								
								// Broadcast question.
								var answers = shuffle( dbGame.getData("/triviaDuel/settings/answers") );
								var playerOne = dbGame.getData('/triviaDuel/playerOne/name');
								var playerTwo = dbGame.getData('/triviaDuel/playerTwo/name');
								sendWhisper(playerOne, category+" || "+question+" || Answers: " +answers);
								sendWhisper(playerTwo, category+" || "+question+" || Answers: " +answers);
								
								// Set to awaiting answer.
								dbGame.push("/triviaDuel/settings/awaitingAnswer", true);

								// Take number of points that were bet from both players.
								var playerOneID = dbGame.getData('/triviaDuel/playerOne/userid');
								deletePoints(playerOneID, currentBet);
								deletePoints(userid, currentBet);
							
							} else {
								sendWhisper(playerOne, "There was an error getting a question. You have been refunded.");
								sendWhisper(playerTwo, "There was an error getting a question. You have been refunded.");
								var playerOne = dbGame.getData("/triviaDuel/playerOne");
								var playerOneID = playerOne.userid;
								var playerTwo = dbGame.getData("/triviaDuel/playerTwo");
								var playerTwoID = playerTwo.userid;
								var betAmount = dbGame.getData("/triviaDuel/settings/amount");
								addPoints(playerOneID, betAmount);
								addPoints(playerTwoID, betAmount);
							}							
						});

					} else if ( pointsBet <= pointsTotal && pointsBet >= minimumBet && playerOneName !== username && expireCheck >= 30000) {
						// No duel started, so gather up info and push to duel arena.
						dbGame.push("/triviaDuel/playerOne/name", username);
						dbGame.push("/triviaDuel/playerOne/userid", userid);
						dbGame.push("/triviaDuel/settings/amount", pointsBet);
						dbGame.push("/triviaDuel/settings/expireTime", date);
						dbGame.push("/triviaDuel/settings/inProgress", true);
						dbGame.push("/triviaDuel/settings/awaitingAnswer", false);
						
						// Broadcast that a duelist is waiting for a challenger.
						sendBroadcast(username+" has bet "+pointsBet+" on a wizard duel of minds. Type !rpg-trivia to accept the challenge. Expires: 30 sec.");

					} else if ( playerOneName == username && expireCheck <= 30000){
						// User is already entered in duel and still waiting on challenger.
						sendWhisper(username, "Stop hitting yourself! You are already entered in the arena.");
					} else if (pointsBet >= pointsTotal || pointsTotal <= currentBet || pointsBet < minimumBet ) {
						// Person doesn't have enough points to participate or bet below the minimum.
						sendWhisper(username, "You do not have enough coins or you bet below the minimum "+minimumBet+" coins.");
					} else if (expireCheck >= 30000 && pointsBet >= minimumBet){
						// Duel time expired. Refund waiting duelist and reset game.
						var playerOne = dbGame.getData("/triviaDuel/playerOne");
						var betAmount = dbGame.getData("/triviaDuel/settings/amount");
						var playerOneID = playerOne.userid;
						console.log('Arena Expired. Starting new arena.');
						dbGame.delete("/triviaDuel/playerOne");
						dbGame.delete("/triviaDuel/playerTwo");
						dbGame.push("/triviaDuel/playerOne/name", "none");
						addPoints(playerOneID, betAmount);
						rpgTriviaDuel(username, userid, rawcommand);
					} else {
						console.log('trivia duel error!');
					}
				} else {
					// Some type of error where I couldn't find points for the user.
					console.log('Could not retrieve scottybot points for '+username, userid);
					sendWhisper(username, "Error! There was an issue with connecting to scottybot.");
				}
			})
		} else if (awaitingAnswer === true){
			var playerOneName = dbGame.getData("/triviaDuel/playerOne/name");
			var playerTwoName = dbGame.getData("/triviaDuel/playerTwo/name");
			if (username == playerOneName || username == playerTwoName){
				var commandArray = (rawcommand).split("!rpg-trivia ");
				var playerAnswer = commandArray[1];
				var correctAnswer = dbGame.getData("/triviaDuel/settings/correct");
				var betAmount = dbGame.getData("/triviaDuel/settings/amount");
				var reward = betAmount * 2;
				
				if( playerAnswer.toUpperCase() == correctAnswer.toUpperCase() ){
					sendWhisper(playerOneName, username+" won the battle of wits! Reward: "+reward+" coins.");
					sendWhisper(playerTwoName, username+" won the battle of wits! Reward: "+reward+" coins.");
					addPoints(userid, reward);
					// Reset Game
					dbGame.delete("/triviaDuel/playerOne");
					dbGame.delete("/triviaDuel/playerTwo");
					dbGame.push("/triviaDuel/playerOne/name", "none");
					dbGame.push("/triviaDuel/settings/inProgress", false);
					dbGame.push("/triviaDuel/settings/awaitingAnswer", false);
					dbGame.push("/triviaDuel/settings/expireTime", 0);
					dbGame.push("/triviaDuel/settings/amount", 0);
				} else {
					sendWhisper(username, "Incorrect answer!");
				}
				
			} else {
				sendWhisper(username, "You're not in this duel!");
			}			
		}else {
			// Someone typed in a command with some gibberish on the end.
			sendWhisper(username, "Invalid command. Try !rpg-trivia (number)");
		}
	} else {
		sendWhisper(username, "This command is currently deactivated.");
	}
}



// Shop Item Generation
// This generates items in the shop.
function rpgShopLoop(){
	
	request('https://beam.pro/api/v1/chats/'+rpgApp.chanID+'/users', function(error, response, body) {
			if (!error && response.statusCode == 200) {
				var data = JSON.parse(body);
				var user = data[Math.floor(Math.random() * data.length)]
				if (user.userName == "StreamJar"){
					var trophyName = "Firebottle"
				} else {
					var trophyName = user.userName;
				}
				
				for (i = 1; i < 4; i++) { 
					var item= rpgShopGeneration(trophyName); 
					dbGame.push("/shop/item"+i+"/itemName", item.name);
					dbGame.push("/shop/item"+i+"/strength", item.strength);
					dbGame.push("/shop/item"+i+"/guile", item.guile);
					dbGame.push("/shop/item"+i+"/magic", item.magic);
					dbGame.push("/shop/item"+i+"/price", item.price);
					dbGame.push("/shop/item"+i+"/slot", item.itemslot);
				}
			} else {
				console.log('Could not access beam api for store item generation.')
			}
	});
	
}
function rpgShopGeneration(trophyName){
	var diceRoller = (dice.roll({
				quantity: 1,
				sides: 20,
				transformations: ['sum']
			})).result;
	
	if ( diceRoller >= 1 && diceRoller <= 4){
		// Melee Item 
		var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
		var randomTwo = rpgApp.weaponListTwo[Math.floor(Math.random() * rpgApp.weaponListTwo.length)];
		var randomThree = rpgApp.meleeList[Math.floor(Math.random() * rpgApp.meleeList.length)];

		var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
		var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
		var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
		var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;
		
		var itemSlot = "melee";

		console.log('Shop generated a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
		
	} else if ( diceRoller >= 5 && diceRoller <= 8){
		// Ranged Item
		var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
		var randomTwo = rpgApp.weaponListTwo[Math.floor(Math.random() * rpgApp.weaponListTwo.length)];
		var randomThree = rpgApp.rangedList[Math.floor(Math.random() * rpgApp.rangedList.length)];

		var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
		var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
		var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
		var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;
		
		var itemSlot = "ranged";

		console.log('Shop generated a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
		
	} else if ( diceRoller >= 9 && diceRoller <= 11){
		// Magic Item
		var randomOne = rpgApp.magicTypeList[Math.floor(Math.random() * rpgApp.magicTypeList.length)];
		var randomTwo = rpgApp.magicElementsList[Math.floor(Math.random() * rpgApp.magicElementsList.length)];
		var randomThree = rpgApp.magicSpellList[Math.floor(Math.random() * rpgApp.magicSpellList.length)];

		var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
		var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
		var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
		var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;
		
		var itemSlot = "magic";

		console.log('Shop generated a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
		
	} else if ( diceRoller >= 12 && diceRoller <= 14){
		// Armor Item
		var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
		var randomTwo = rpgApp.resourceTypeList[Math.floor(Math.random() * rpgApp.resourceTypeList.length)];
		var randomThree = rpgApp.armorList[Math.floor(Math.random() * rpgApp.armorList.length)];

		var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
		var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
		var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
		var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;
		
		var itemSlot = "armor";

		console.log('Shop generated a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
		
	} else if ( diceRoller >= 15 && diceRoller <= 17){
		// Mount Item
		var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
		var randomTwo = rpgApp.creatureAttributeList[Math.floor(Math.random() * rpgApp.creatureAttributeList.length)];
		var randomThree = rpgApp.creatureNameList[Math.floor(Math.random() * rpgApp.creatureNameList.length)];

		var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
		var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
		var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
		var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;
		
		var itemSlot = "mount";

		console.log('Shop generated a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
		
	} else if ( diceRoller === 18){
		// Title Item
		var randomOne = rpgApp.titleTypeList[Math.floor(Math.random() * rpgApp.titleTypeList.length)];
		var randomTwo = rpgApp.titleList[Math.floor(Math.random() * rpgApp.titleList.length)];

		var strengthStat = randomOne.strength + randomTwo.strength;
		var guileStat = randomOne.guile + randomTwo.guile;
		var magicStat = randomOne.magic + randomTwo.magic;
		var itemName = randomOne.name + " " + randomTwo.name;
		
		var itemSlot = "title";

		console.log('Shop generated a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	} else if ( diceRoller === 19){
		// Companion Item
		var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
		var randomTwo = rpgApp.creatureAttributeList[Math.floor(Math.random() * rpgApp.creatureAttributeList.length)];
		var randomThree = rpgApp.companionList[Math.floor(Math.random() * rpgApp.companionList.length)];

		var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
		var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
		var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
		var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;
		
		var itemSlot = "companion";

		console.log('Shop generated a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	} else {
		// Trophy Item
		var randomOne = trophyName;
		var randomTwo = rpgApp.trophyList[Math.floor(Math.random() * rpgApp.trophyList.length)];

		var strengthStat = randomTwo.strength;
		var guileStat = randomTwo.guile;
		var magicStat = randomTwo.magic;
		var itemName = randomOne + "'s " + randomTwo.name;
		
		var itemSlot = "trophy";

		// Push info to queue
		console.log('Shop generated a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	}
	
	var itemPrice = Math.floor(Math.random() * 2000) + 750;
	
	// Return Item
	return {"name": itemName, "strength": strengthStat, "guile": guileStat, "magic": magicStat, "price": itemPrice, "itemslot": itemSlot};
}
function rpgShopPurchase(username, userid, rawcommand){
		var commandArray = (rawcommand).split(" ");
		var command = Math.floor(commandArray[1]);
		
		if ( isNaN(command) === false && command <= 3 && command > 0){
			// Player is trying to purchase.
			
			try {
				var item = dbGame.getData("/shop/item"+command);
			} catch (error) {
				
			}
			
			if (item.price !== "sold"){
				request('https://api.scottybot.net/api/points?authkey=' + rpgApp.scottyauth +'&userid='+userid, function(error, response, body) {
					if (!error && response.statusCode == 200) {
						// Great, this person exists!
						var jsonparse = JSON.parse(body);
						var pointsTotal = jsonparse.points;
						
						if (pointsTotal >= item.price && isNaN(item.price) === false){
							// Item Bought
							console.log(username+ ' has '+pointsTotal+' and is spending '+item.price+'.');
							sendWhisper(username, "You bought "+item.itemName+" for "+item.price+" coins. Type !rpg-equip to use it.");
							deletePoints(userid, item.price);
							dbGame.push("/shop/item"+command+"/price", "sold");
							
							// Push to player holding slot
							dbPlayerHolder(username, "holding", item.slot, item.itemName, item.strength, item.guile, item.magic);
						} else {
							// Not enough points.
							sendWhisper(username, "You do not have enough coins for that item!");
						}
					} else {
						// Couldn't find user in scottybot or couldn't connect.
						console.log('Error finding scotty user while purchasing form shop.', username);
						sendWhisper(username, "Error connecting to scottybot.");
					}
				});
			} else {
				sendWhisper(username, "We are out of stock on that item.");
			}
			
		} else {
			// Whisper items in shop.
			var itemOne = dbGame.getData("/shop/item1");
			var itemTwo = dbGame.getData("/shop/item2");
			var itemThree = dbGame.getData("/shop/item3");
			
			sendWhisper(username, "[1 - cost: "+itemOne.price+"] "+itemOne.itemName+"("+itemOne.slot+": "+itemOne.strength+"/"+itemOne.guile+"/"+itemOne.magic+"), [2 - cost: "+itemTwo.price+"] "+itemTwo.itemName+"("+itemTwo.slot+": "+itemTwo.strength+"/"+itemTwo.guile+"/"+itemTwo.magic+"), [3 - cost: "+itemThree.price+"] "+itemThree.itemName+"("+itemThree.slot+": "+itemThree.strength+"/"+itemThree.guile+"/"+itemThree.magic+")");
		}
};

// RPG Training
// This allows the user to spend coins to permanent gain a stat point.
function rpgTraining(username, userid){
	var mission = rpgApp.training[Math.floor(Math.random() * rpgApp.training.length)];
	var missionText = mission.text;
	var missionStrength = mission.strength;
	var missionGuile = mission.guile;
	var missionMagic = mission.magic;
	var missionCoin = mission.coins;
	var missionItem = mission.item;
	
	try {
		var strength = dbPlayers.getData("/" + username + "/prowess/strength");
	} catch (error) {
		var strength = 0;
	}
	try {
		var guile = dbPlayers.getData("/" + username + "/prowess/guile");
	} catch (error) {
		var guile = 0;
	}
	try {
		var magic = dbPlayers.getData("/" + username + "/prowess/magic");
	} catch (error) {
		var magic = 0;
	}
	
	// If mission gives stats...
	if (missionStrength > 0 || missionGuile > 0 || missionMagic > 0){
		var newStrength = strength + missionStrength;
		var newGuile = guile + missionGuile;
		var newMagic = magic + missionMagic;
		dbPlayers.push("/" + username + "/prowess/strength", newStrength);
		dbPlayers.push("/" + username + "/prowess/guile", newGuile);
		dbPlayers.push("/" + username + "/prowess/magic", newMagic);
		characterStats(username);
	}
	
	// If mission gives coins...
	if (missionCoin > 0){
		addPoints(userid, missionCoin);
	}

	// Send a whisper about what happened.
	var missionText = missionText+" || Prowess:("+missionStrength+"/"+missionGuile+"/"+missionMagic+") || "+missionCoin+" coins.";
	sendWhisper(username, missionText);
}

//