// Requirements
// These are required node modules.
var WebSocket = require('ws');
var WebSocketServer = require('ws').Server,
	wss = new WebSocketServer({
		port: 8080
	});
var JsonDB = require('node-json-db');
var request = require('request');
var Roll = require('roll'),
	dice = new Roll();


// Database Setup (name / save after each push / human readable format).
// This makes sure these database files exist.
var dbSettings = new JsonDB("db/settings", true, true);
var dbItems = new JsonDB("db/items", true, true);
var dbPlayers = new JsonDB("db/players", true, true);
var dbMonsters = new JsonDB("db/monsters", true, true);
var dbGame = new JsonDB("db/game", true, true);

// General Settings
// Basic app variables used with game.
rpgApp = {
	scottyauth: dbSettings.getData("/scottyauth"),
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
};

// Websocket Client Setup (Scottybot Connection)
// This connects to scottybot websocket.
var ws = new WebSocket('wss://api.scottybot.net/websocket/control');
ws.on('open', function open() {
	ws.send('{"event":"auth", "msgid": "UUID", "data": "' + rpgApp.scottyauth + '"}');
	ws.send('{"event": "subscribe","msgid": "UUID","data": "commands"}');
	ws.send('{"event": "subscribe","msgid": "UUID","data": "points"}');
	// Heartbeat
	setInterval(function() {
		ws.send('{"heartbeat": "Still alive!"}');

		// Debug, do something every 15 seconds.
		// buyCoins("Firebottle", 53078);
		// rpgAdventure("Firebottle", 53078);

	}, 15000);
});

// Websocket Server
// This allows for the wss.broadcast call to send out data via websocket.
wss.broadcast = function broadcast(data) {
	wss.clients.forEach(function each(client) {
		client.send(data);
	});
};

/////////////////////////
// Scotty Command Center  
////////////////////////
// This accepts all scotty responses and determines what to do with them.
ws.on('message', function(response) {
	var data = JSON.parse(response);
	var cmdtype = data.event;

	// Debug, log all scotty messages.
	//console.log(response);

	if (cmdtype == "logon") {
		console.log('BeamRPG: Logged in to Scottybot.');
	} else if (cmdtype == "cmdran") {
		var username = data.data["username"];
		var command = data.data["command"];
		var userid = data.data["userid"];
		var rawcommand = data.data["rawcommand"];
		console.log("BeamRPG: " + username + " used command \"" + command + "\".");

		// Commands outside of cooldown.
		if (command == "rpg") {
			var rpgCommands = "!coins, !rpg-inventory, !rpg-daily, !rpg-adventure (200)";
			ws.send('{"event": "bethebot", "msgid":"UUID", "data": "Want to play? Try these commands: ' + rpgCommands + '."}');
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
			rpgRaidEvent(username, rawcommand);
			dbLastSeen(username);
		}

		// Commands inside of cooldown.
		// Make sure cmdCooldownActive check is in place and that the commond cooldown function is run.
		if (command == "rpg-adventure" && rpgApp.cmdCooldownActive === false) {
			rpgAdventure(username, userid);
			dbLastSeen(username);
			commandCooldown();
		}
	}
});

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

		ws.send('{"event": "bethebot", "msgid":"UUID", "data": "' + username + ' equipped an item."}');
		ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "You equipped: ' + itemName + '."}');
	} catch (error) {
		ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "You have nothing to equip!"}');
	}

}

////////////////////
// General / Helper
///////////////////

// Command Cooldown
// This manages the global command cooldown.
function commandCooldown() {
	var cooldownTimer = dbSettings.getData("/cmdCooldownTime");
	rpgApp.cmdCooldownActive = true;

	setTimeout(function() {
		rpgApp.cmdCooldownActive = false;
		ws.send('{"event": "bethebot", "msgid":"UUID", "data": "(∩｀-´)⊃━☆ RPG is ready for adventure!"}');
	}, cooldownTimer);
}

// Millisecond to Human Converter
// Convers millisconds into a timestamp people can read.
function msToTime(ms) {
	var d, h, m, s;
	s = Math.floor(ms / 1000);
	m = Math.floor(s / 60);
	s = s % 60;
	h = Math.floor(m / 60);
	m = m % 60;
	d = Math.floor(h / 24);
	h = h % 24;
	return h + ":" + m + ":" + s;
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

	var diceRoll = Math.floor((Math.random() * 10) + 1);
	if (diceRoll >= 1 && diceRoll <= 5) {
		var result = "won";
		ws.send('{"event": "addpoints","msgid": "UUID","data": {"userid": ' + userid + ',"points":250}}');
	} else {
		var result = "lost";
	}

	// Push info to queue
	console.log('BeamRPG: ' + username + ' fought a ' + monster + '.');
	wss.broadcast('{"uname": "' + username + '", "event": "mimic",  "eventText": "fight", "data": "' + monster + '", "result": "' + result + '"}');
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
	wss.broadcast('{"uname": "' + username + '", "event": "melee", "eventText": "weapon", "data": "' + itemName + '", "stats": "Str:' + strengthStat + ' Guile:' + guileStat + ' Int:' + magicStat + '"}');

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
	wss.broadcast('{"uname": "' + username + '", "event": "ranged", "eventText": "weapon", "data": "' + itemName + '", "stats": "Str:' + strengthStat + ' Dex:' + guileStat + ' Int:' + magicStat + '"}');

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
	wss.broadcast('{"uname": "' + username + '", "event": "magic", "eventText": "spell", "data": "' + itemName + '", "stats": "Str:' + strengthStat + ' Dex:' + guileStat + ' Int:' + magicStat + '"}');

	// Push to DB
	dbPlayerHolder(username, "holding", "magic", itemName, strengthStat, guileStat, magicStat);
};

// armor Item Generation
function buyarmor(username) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.resourceTypeList[Math.floor(Math.random() * rpgApp.resourceTypeList.length)];
	var randomThree = rpgApp.armorList[Math.floor(Math.random() * rpgApp.armorList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	wss.broadcast('{"uname": "' + username + '", "event": "armor", "eventText": "armor", "data": "' + itemName + '", "stats": "Str:' + strengthStat + ' Dex:' + guileStat + ' Int:' + magicStat + '"}');

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
	wss.broadcast('{"uname": "' + username + '", "event": "mount", "eventText": "mount", "data": "' + itemName + '", "stats": "Str:' + strengthStat + ' Dex:' + guileStat + ' Int:' + magicStat + '"}');

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
	wss.broadcast('{"uname": "' + username + '", "event": "title", "eventText": "title", "data": "' + itemName + '", "stats": "Str:' + strengthStat + ' Dex:' + guileStat + ' Int:' + magicStat + '"}');

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
	wss.broadcast('{"uname": "' + username + '", "event": "companion", "eventText": "companion", "data": "' + itemName + '", "stats": "Str:' + strengthStat + ' Dex:' + guileStat + ' Int:' + magicStat + '"}');

	// Push to DB
	dbPlayerHolder(username, "holding", "companion", itemName, strengthStat, guileStat, magicStat);
};

// Coin Generation
function buyCoins(username, userid) {
	var currency = dbItems.getData("/currency");
	var coins = currency[Math.floor(Math.random() * currency.length)];

	// Push info to queue
	console.log('BeamRPG: ' + username + ' got ' + coins + ' coins.');
	wss.broadcast('{"uname": "' + username + '", "event": "coin", "data": ' + coins + '}')

	// Add points to user in scottybot
	ws.send('{"event": "addpoints","msgid": "UUID","data": {"userid": ' + userid + ',"points":' + coins + '}}');
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
	wss.broadcast('{"uname": "' + username + '", "event": "trophy", "eventText": "trophy", "data": "' + itemName + '", "stats": "Str:' + strengthStat + ' Dex:' + guileStat + ' Int:' + magicStat + '"}');

	// Push to DB
	dbPlayerHolder(username, "holding", "trophy", itemName, strengthStat, guileStat, magicStat);
};

// RPG Inventory
// Prints out a players inventory.
function rpgInventory(username) {

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
		var magic = dbPlayers.getData("/" + username + "/magic/name");
		var strength = dbPlayers.getData("/" + username + "/magic/strength");
		var guile = dbPlayers.getData("/" + username + "/magic/guile");
		var magic = dbPlayers.getData("/" + username + "/magic/magic");
		var magicStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var magic = "Nothing";
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
		var strength = dbPlayers.getData("/" + username + "/stats/strength");
		var guile = dbPlayers.getData("/" + username + "/stats/guile");
		var magic = dbPlayers.getData("/" + username + "/stats/magic");
		var charStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var charStats = "Error";
	}

	var sayInventory = username + " the " + title + " " + titleStats + " || Melee: " + melee + " " + meleeStats + " || Ranged: " + ranged + " " + rangedStats + " || Magic: " + magic + " " + magicStats + " || Armor: " + armor + " " + armorStats + " || Mount: " + mount + " " + mountStats + " || Companion: " + companion + " " + companionStats + " || Trophy: " + trophy + " " + trophyStats + " || Total: " + charStats;

	ws.send('{"event": "bethebot", "msgid":"UUID", "data": "' + username + ' checked their inventory!"}');
	ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "' + sayInventory + '"}');
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

	console.log('Combat Started: ' + personOne.name + ' (' + personOneStrength + '/' + personOneGuile + '/' + personOneMagic + ') vs ' + personTwo.name + ' (' + personOneStrength + '/' + personOneGuile + '/' + personOneMagic + ')');

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
		buyarmor(username);
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

	ws.send('{"event": "bethebot", "msgid":"UUID", "data": "' + username + ' went on an adventure! I\'ll let you know when the adventure cooldown is over!"}');
	ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "Enjoy your adventure! Type !rpg-equip to equip the item you received."}');

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
		ws.send('{"event": "addpoints","msgid": "UUID","data": {"userid": ' + userid + ',"points":' + dailyReward + '}}');
		ws.send('{"event": "bethebot", "msgid":"UUID", "data": "' + username + ' completed their daily!"}');
		ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "Daily completed! Reward: ' + dailyReward + ' || Cooldown: 24hr"}');
	} else {
		ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "You already completed your daily! Try again in: ' + humanTime + '."}');
	}
}

// RPG Raid Event
// This will start a raid and use the target streamer as a boss. Meant to be used once at the end of a stream. 
function rpgRaidEvent(username, rawcommand) {
	var raidCommandArray = (rawcommand).split(" ");
	var raidTarget = raidCommandArray[1];

	if (username == "Firebottle" && rpgApp.raidActive === false && raidTarget !== undefined) {

		// Get target info and start up the raid.
		request('https://beam.pro/api/v1/channels/' + raidTarget, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				// Great, valid raid target. Get target info, set raid to active, send broadcast to overlay with info.
				var data = JSON.parse(body);
				var streamUrl = "https://beam.pro/" + raidTarget;
				var avatar = data.user.avatarUrl;
				ws.send('{"event": "bethebot", "msgid":"UUID", "data": "' + username + ' has started a raid! Type !rpg-raid to join!"}');
				wss.broadcast('{"uname": "' + username + '", "event": "raid", "raidTarget": "' + raidTarget + '", "raidTargetAvatar": "' + avatar + '"}');
				rpgApp.raidActive = true;

				// Start timer for raid event based on setting in settings db.
				setTimeout(function() {
					var raidStrength = 0;
					var raidGuile = 0;
					var raidMagic = 0;
					var raiderCount = 0;
					for (var key in rpgApp.raiderList) {
						var player = rpgApp.raiderList[key];
						var strength = player.strength;
						var guile = player.guile;
						var magic = player.magic;
						var raidStrength = raidStrength + strength;
						var raidGuile = raidGuile + guile;
						var raidMagic = raidMagic + magic;
						var raiderCount = raiderCount + 1;
					};

					// Generate random Boss stats based on party size.
					var bossModifier = (Math.floor(Math.random() * raiderCount) + 1);
					var bossStrength = raidStrength + bossModifier;
					var bossGuile = raidGuile + bossModifier;
					var bossMagic = raidMagic + bossModifier;

					var raidParty = '{"name": "Raiders", "strength": ' + raidStrength + ', "guile": ' + raidGuile + ', "magic": ' + raidMagic + '}';
					var bossMonster = '{"name":"' + raidTarget + '", "strength": ' + bossStrength + ', "guile": ' + bossGuile + ', "magic": ' + bossMagic + '}';

					var combatResults = rpgCombat(raidParty, bossMonster, raiderCount);

					// If combat is won, send everyone coins and one random person a trophy. Else, give everyone some coins.
					if (combatResults == "Raiders") {
						var luckyPerson = rpgApp.raiderList[Math.floor(Math.random() * rpgApp.raiderList.length)];
						var luckyPersonName = luckyPerson.name;
						buyTrophy(luckyPersonName, raidTarget);
						var raidWinCoin = dbSettings.getData("/raid/winReward");
						ws.send('{"event": "giveallpoints","msgid": "UUID","data": ' + raidWinCoin + '}');
						ws.send('{"event": "bethebot", "msgid":"UUID", "data": "The raid has ended. Winner: ' + combatResults + '. ' + luckyPersonName + ' got a trophy. Everyone also gets ' + raidWinCoin + ' coins!"}');
						ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + luckyPersonName + '", "data": "You got a trophy! Type !rpg-equip to use it!"}');
					} else {
						var raidLoseCoin = dbSettings.getData("/raid/loseReward");
						ws.send('{"event": "giveallpoints","msgid": "UUID","data": ' + raidLoseCoin + '}');
						ws.send('{"event": "bethebot", "msgid":"UUID", "data": "The raid has ended. Winner: ' + combatResults + '. Everyone gets ' + raidLoseCoin + ' coins for your repair bill."}');
					};

					// Get raid message and send that to chat when everything is over.
					var raidMessage = dbSettings.getData("/raid/raidMessage");
					ws.send('{"event": "bethebot", "msgid":"UUID", "data": "' + raidMessage + '  ||  beam.pro/' + raidTarget + '"}');

					// Reset lists and flags
					rpgApp.raidActive = false;
					rpgApp.raiderList = []

				}, rpgApp.raidTimer);

			} else {
				ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "Error: ' + raidTarget + ' is not a valid raid target!"}');
			}
		})

	} else if (rpgApp.raidActive === true) {
		// Raid is active. Add user to raid participant list if they're not already there.
		var raiderName = search(username, rpgApp.raiderList);
		if (raiderName === undefined) {
			try {
				var strength = dbPlayers.getData("/" + username + "/stats/strength");
				var guile = dbPlayers.getData("/" + username + "/stats/guile");
				var magic = dbPlayers.getData("/" + username + "/stats/magic");
				rpgApp.raiderList.push({
					"name": username,
					"strength": strength,
					"guile": guile,
					"magic": magic
				});
				ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "You\'ve joined the raid!"}');
			} catch (error) {
				ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "You don\'t seem to have a character! Run at least one !rpg-adventure first."}');
			}
		} else {
			ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "You\'ve already joined the raid!"}');
		}
	} else {
		// No raid is active
		ws.send('{"event": "bethebot", "msgid":"UUID", "whisper": "' + username + '", "data": "There is currently not an active raid."}');
	}
}