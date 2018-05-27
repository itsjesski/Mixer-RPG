// Requirements
// These are required node modules.
const WebSocket = require('ws');
const JsonDB = require('node-json-db');
const request = require('request');
const auth = require('mixer-shortcode-oauth');
const mixer = require('beam-interactive-node2');
const mixerClient = require('beam-client-node');
const Roll = require('roll'),
	dice = new Roll();


// Database Setup (name / save after each push / human readable format).
// This makes sure these database files exist.
let dbAuth = new JsonDB("db/auth", true, true);
let dbSettings = new JsonDB("db/settings", true, true);
let dbItems = new JsonDB("db/items", true, true);
let dbPlayers = new JsonDB("db/players", true, true);
let dbMonsters = new JsonDB("db/monsters", true, true);
let dbGame = new JsonDB("db/game", true, true);
let dbMissions = new JsonDB("db/missions", true, true);

let socket;

// General Settings
// Basic app variables used with game.
rpgApp = {
	chanID: dbAuth.getData("/channelID"),
	rpgCommands: "!coins, !rpg-inventory, !rpg-daily, !rpg-adventure (cost: "+ dbSettings.getData('/adventure/cost') +"), !rpg-training (cost: 2000) !rpg-arena (bet), !rpg-duel (bet), !rpg-shop, !rpg-shop-refresh (cost: 750)",
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

// Authenticate with Mixer using oauth
// Will print a shortcode out to the terminal
mixer.setWebSocket(require('ws'));
if (typeof dbAuth.getData('/clientId') !== 'string') {
    throw new Error('clientId was not a string');
}
const authInfo = {
    client_id: dbAuth.getData('/clientId'),
    scopes: [
		"chat:bypass_slowchat",
		"chat:bypass_links",    
		"chat:bypass_filter",
		"chat:bypass_catbot",
		"chat:chat",
		"chat:connect",
		"chat:remove_message",
		"chat:whisper"
    ],
};
const store = new auth.LocalTokenStore(__dirname + '/db/authTokensDoNotShow.json');
const authClient = new auth.ShortcodeAuthClient(authInfo, store);
authClient.on('code', code => {
    console.log(`Go to https://mixer.com/go?code=${code} and enter code ${code}...`);
});

authClient.on('authorized', (token) => {
    console.log('Got token!', token);
    const _instance = new MinimalMixerChatClient({
        authToken: token.access_token
    });
});

authClient.on('expired', () => {
    console.error('Auth request expired');
    process.exit(1);
});

authClient.on('declined', () => {
    console.error('Auth request declined');
    process.exit(1);
});

authClient.on('error', (e) => {
    console.error('Auth error:', e);
    process.exit(1);
});

authClient.doAuth();

//////////////////
// CONNECT TO CHAT

function createChatSocket (userId, channelId, endpoints, authkey) {
	console.log('STARTING createChatSocket');
    socket = new mixerClient.Socket(WebSocket, endpoints).boot();

    // You don't need to wait for the socket to connect before calling
    // methods. We spool them and run them when connected automatically.
    socket.auth(channelId, userId, authkey)
    .then(() => {
        console.log('You are now authenticated!');
        // Send a chat message
    })
    .catch(error => {
        console.error('Oh no! An error occurred.');
        console.error(error);
    });

    // Listen for chat messages. Note you will also receive your own!
    socket.on('ChatMessage', data => {
		onChatMessage(data);
    });

    // Listen for socket errors. You will need to handle these here.
    socket.on('error', error => {
        console.error('Socket error');
        console.error(error);
    });
}

// Auto and Login 
class MinimalMixerChatClient {
    constructor(authJson) {
		let authToken = authJson.authToken
		let userInfo;
		const client = new mixerClient.Client(new mixerClient.DefaultRequestRunner());

		// With OAuth we don't need to log in. The OAuth Provider will attach
		// the required information to all of our requests after this call.
		client.use(new mixerClient.OAuthProvider(client, {
			tokens: {
				access: authToken,
				expires: Date.now() + (365 * 24 * 60 * 60 * 1000)
			},
		}));

		// Gets the user that the Access Token we provided above belongs to.
		client.request('GET', 'users/current')
		.then(response => {
			// Store the logged in user's details for later reference
			userInfo = response.body;

			// Returns a promise that resolves with our chat connection details.
			return new mixerClient.ChatService(client).join(response.body.channel.id);
		})
		.then(response => {
			const body = response.body;
			return createChatSocket(userInfo.id, userInfo.channel.id, body.endpoints, body.authkey);
		})
		.catch(error => {
			console.error('Something went wrong.');
			console.error(error);
		})
		.then(response => {
			mixerClientOpened();
		});
	}

    mixerClientOpened() {
        console.log('Mixer client opened');

			// Debug, do something every 15 seconds.
			// buyMonster("Firebottle", 53078);
			// rpgAdventure("Firebottle", 53078);

		// CONNECTION OPENED
    }

    MixerChatClientError(error) {
        console.error('interactive error: ', error);
    }
}




///////////////////////////////
// Command Center  
///////////////////////////////

function getRawChatMessage(chatEvent){
	let rawMessage = "";
	chatEvent.message.message.forEach(m => {
		rawMessage += m.text;
	});
	return rawMessage;
}

// Parses a message for commands.
function checkForCommand(chatEvent) {

	// Get raw chat message.
	let normalizedRawMessage = getRawChatMessage(chatEvent).toLowerCase();
  
	let allCommands = [
		"!rpg",
		"!rpg-equip",
		"!rpg-inventory",
		"!rpg-daily",
		"!rpg-raid",
		"!rpg-arena",
		"!rpg-duel",
		"!rpg-shop",
		"!rpg-shop-refresh",
		"!rpg-training",
		"!rpg-adventure"
	];
  
	for (let command of allCommands) {
		// regex checks if the character after the command is either whitespace or end of string
		// this prevents the "!rpg" command from always returning for all commands
		let regex = new RegExp("^"+command+"(?:\\s|$)");
		if (regex.test(normalizedRawMessage)) {
			console.log('--------------------COMMAND USED-------------------');
			return command;
		}
	}
  
	return null;
  }

// This accepts all scotty responses and determines what to do with them.
function onChatMessage(data){
	var command = checkForCommand(data);

	if(command == null){
		return;
	}

	var cmdtype = data.event;

	let username = data['user_name'];
	let userid = data["user_id"];
	let whisper = data.message.meta.whisper;

	let userRoles = data['user_roles'];
	let isStreamer = userRoles.includes("Owner") ? true : false;
	let isMod = userRoles.includes("Mod") || isStreamer ? true : false;
	var rawcommand = getRawChatMessage(data);

	console.log("MixerRPG: " + username + " used command \"" + command + "\".");

	if( dbSettings.getData("/requireWhispers") === true && whisper === true){
		rpgCommands(username, userid, command, rawcommand, isMod);
	} else if ( dbSettings.getData("/requireWhispers") === false ) {
		rpgCommands(username, userid, command, rawcommand, isMod);
	} else {
		sendWhisper(username, "Please /whisper "+dbSettings.getData('/botName')+" to run commands.");
	}
}


function rpgCommands(username, userid, command, rawcommand, isMod){
	// Commands outside of cooldown.
	if (command == "!rpg") {
		sendWhisper(username, "Want to play? Try these commands: " + rpgApp.rpgCommands + ".");
	} else if (command == "!rpg-equip") {
		dbPlayerKeeper(userid, username);
		dbLastSeen(userid);
	} else if (command == "!rpg-inventory") {
		rpgInventory(username, userid);
		dbLastSeen(userid);
	} else if (command == "!rpg-daily") {
		rpgDailyQuest(username, userid);
		dbLastSeen(userid);
	} else if (command == "!rpg-raid") {
		rpgRaidEvent(username, userid, rawcommand, isMod);
		dbLastSeen(userid);
	} else if (command == "!rpg-arena"){
		rpgCompanionDuel(username, userid, rawcommand);
		dbLastSeen(userid);
	} else if (command == "!rpg-duel"){
		rpgPlayerDuel(username, userid, rawcommand);
		dbLastSeen(userid);
	} else if (command == "!rpg-shop"){
		rpgShopPurchase(username, userid, rawcommand);
		dbLastSeen(userid);
	} else if (command == "!rpg-shop-refresh"){
		rpgShopLoop();
		sendBroadcast('A new travelling salesman has come to town! Type !rpg-shop to see his supply.');
	} else if (command == "!rpg-training"){
		rpgTraining(username, userid);
	} else if (command == "!rpg-adventure") {
		rpgAdventure(username, userid);
		dbLastSeen(userid);
	}
}

//////////////////////
// Helper Functions
//////////////////////

// Whisper
function sendWhisper(username, message) { 
	socket.call('whisper', [username, message]);
}

// Chat Broadcast
function sendBroadcast(message){
	socket.call('msg', [message]);
}

// Add Points
function addPoints(userid, coins){
	let currentCoins;
	try{
		currentCoins = dbPlayers.getData('/'+userid+'/coins');
	} catch (err){
		currentCoins = 0;
	}
	dbPlayers.push('/'+userid+'/coins', currentCoins + coins);
}

// Get Points
function getPoints(userid){
	let currentCoins;
	try{
		currentCoins = dbPlayers.getData('/'+userid+'/coins');
	} catch (err){
		currentCoins = 0;
	}
	return currentCoins
}

// Delete Coins
function deletePoints(userid, coins){
	let currentCoins,
		newCoins;
	try{
		currentCoins = dbPlayers.getData('/'+userid+'/coins');
		dbPlayers.push('/'+userid+'/coins', currentCoins - coins);
	} catch (err){
		currentCoins = 0;
	}
}

// Giveall Coins
function giveallPoints(coins){
	let users = dbPlayers.getData('/');

	for (let i in users) {
		if(!users.hasOwnProperty(i)) continue;
		let user = users[i];

		addPoints(i, coins);
	}

	sendBroadcast('MixerRPG: Everyone receives '+coins+' coins!');
}

/////////////////////////
// Database Manipulation  
////////////////////////

// Database Handler - Players Item Holding
// This handles adding an item to the players holding area.
function dbPlayerHolder(userid, dbLocation, itemType, itemName, strength, guile, magic) {
	dbPlayers.push("/" + userid + "/" + dbLocation + "/name", itemName);
	dbPlayers.push("/" + userid + "/" + dbLocation + "/type", itemType);
	dbPlayers.push("/" + userid + "/" + dbLocation + "/strength", strength);
	dbPlayers.push("/" + userid + "/" + dbLocation + "/guile", guile);
	dbPlayers.push("/" + userid + "/" + dbLocation + "/magic", magic);
}

// Database Handler - Last Seen 
// This puts a last seen date in player profile when an rpg command is run for use in DB cleanup.
function dbLastSeen(userid) {
	var dateString = new Date();
	var date = dateString.getTime();
	dbPlayers.push("/" + userid + "/lastSeen/lastActive", date);
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
			if (!players.hasOwnProperty(i)) continue;
			var person = players[i];
		    if (person.lastSeen != null && date - person.lastSeen.lastActive >= inactiveTimer ){
		    	dbPlayers.delete("/"+i);
		    	console.log('Cleanup removed '+person.name+' due to inactivity.');
		    }
		}

		console.log('Cleanup finished.');
	}
}
dbCleanup();

// Database Handler - Keep Decision
// This takes whatever item is in holder area of database and equips it to the character.
function dbPlayerKeeper(userid, username) {
	try {
		var item = dbPlayers.getData("/" + userid + "/holding");
		var itemName = item.name;
		var itemType = item.type;
		var strength = item.strength;
		var guile = item.guile;
		var magic = item.magic;

		dbPlayers.push("/" + userid + "/" + itemType + "/name", itemName);
		dbPlayers.push("/" + userid + "/" + itemType + "/strength", strength);
		dbPlayers.push("/" + userid + "/" + itemType + "/guile", guile);
		dbPlayers.push("/" + userid + "/" + itemType + "/magic", magic);

		// Rebalance Stats
		characterStats(userid);

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
		var userid = key;
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

			dbPlayers.push("/" + userid + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + userid + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + userid + "/" + itemType + "/magic", magic);

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

			dbPlayers.push("/" + userid + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + userid + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + userid + "/" + itemType + "/magic", magic);
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

			dbPlayers.push("/" + userid + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + userid + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + userid + "/" + itemType + "/magic", magic);
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

			dbPlayers.push("/" + userid + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + userid + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + userid + "/" + itemType + "/magic", magic);
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

			dbPlayers.push("/" + userid + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + userid + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + userid + "/" + itemType + "/magic", magic);
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

			dbPlayers.push("/" + userid + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + userid + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + userid + "/" + itemType + "/magic", magic);
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

			dbPlayers.push("/" + userid + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + userid + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + userid + "/" + itemType + "/magic", magic);

		}
		if (userItems.trophy !== undefined) {
			var itemType = "trophy";
			var itemName = (userItems.trophy.name).split(" ");
			var nameOne = itemName[1];

			var itemStatsOne = search(nameOne, rpgApp.trophyList);

			var strength = itemStatsOne.strength;
			var guile = itemStatsOne.guile;
			var magic = itemStatsOne.magic;

			dbPlayers.push("/" + userid + "/" + itemType + "/strength", strength);
			dbPlayers.push("/" + userid + "/" + itemType + "/guile", guile);
			dbPlayers.push("/" + userid + "/" + itemType + "/magic", magic);
		}


		characterStats(userid);
		console.log(userid + " items have been balanced.");
	}
}

// Character Stats
// This takes into account all character items and builds out the total character stats.
function characterStats(userid) {
	var totalStrength = 0;
	var totalGuile = 0;
	var totalMagic = 0;

	try {
		var strength = dbPlayers.getData("/" + userid + "/title/strength");
		var guile = dbPlayers.getData("/" + userid + "/title/guile");
		var magic = dbPlayers.getData("/" + userid + "/title/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + userid + "/melee/strength");
		var guile = dbPlayers.getData("/" + userid + "/melee/guile");
		var magic = dbPlayers.getData("/" + userid + "/melee/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + userid + "/ranged/strength");
		var guile = dbPlayers.getData("/" + userid + "/ranged/guile");
		var magic = dbPlayers.getData("/" + userid + "/ranged/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + userid + "/magic/strength");
		var guile = dbPlayers.getData("/" + userid + "/magic/guile");
		var magic = dbPlayers.getData("/" + userid + "/magic/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + userid + "/armor/strength");
		var guile = dbPlayers.getData("/" + userid + "/armor/guile");
		var magic = dbPlayers.getData("/" + userid + "/armor/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + userid + "/mount/strength");
		var guile = dbPlayers.getData("/" + userid + "/mount/guile");
		var magic = dbPlayers.getData("/" + userid + "/mount/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + userid + "/companion/strength");
		var guile = dbPlayers.getData("/" + userid + "/companion/guile");
		var magic = dbPlayers.getData("/" + userid + "/companion/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	try {
		var strength = dbPlayers.getData("/" + userid + "/trophy/strength");
		var guile = dbPlayers.getData("/" + userid + "/trophy/guile");
		var magic = dbPlayers.getData("/" + userid + "/trophy/magic");
	} catch (error) {
		var strength = 0;
		var guile = 0;
		var magic = 0;
	}
	
	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;
	
	try {
		var strength = dbPlayers.getData("/" + userid + "/prowess/strength");
	} catch (error) {
		var strength = 0;
	}
	try {
		var guile = dbPlayers.getData("/" + userid + "/prowess/guile");
	} catch (error) {
		var guile = 0;
	}
	try {
		var magic = dbPlayers.getData("/" + userid + "/prowess/magic");
	} catch (error) {
		var magic = 0;
	}

	var totalStrength = totalStrength + strength;
	var totalGuile = totalGuile + guile;
	var totalMagic = totalMagic + magic;

	dbPlayers.push("/" + userid + "/stats/strength", totalStrength);
	dbPlayers.push("/" + userid + "/stats/guile", totalGuile);
	dbPlayers.push("/" + userid + "/stats/magic", totalMagic);
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
		var playerStrength = dbPlayers.getData("/" + userid + "/stats/strength");
		var playerGuile = dbPlayers.getData("/" + userid + "/stats/guile");
		var playerMagic = dbPlayers.getData("/" + userid + "/stats/magic");
	} catch (error){
		var playerStrength = 0;
		var playerGuile = 0;
		var playerMagic = 0;
	}
	
	var player = '{"name": "'+username+'", "strength": ' + playerStrength + ', "guile": ' + playerGuile + ', "magic": ' + playerMagic + '}';
	var monster = '{"name":"' + monsterName + '", "strength": ' + monsterStrength + ', "guile": ' + monsterGuile + ', "magic": ' + monsterMagic + '}';

	var combatResults = rpgCombat(player, monster, 1);
	if( combatResults == username ){
		// Add points to user
		var coins = 250;
		addPoints(userid, coins);
		sendWhisper(username, "You defeated a "+monsterName+". Reward: 50 coins.");
	} else {
		// Player lost. Points for the points god!
		sendWhisper(username, "You were defeated by the "+monsterName+"! Try again!");
	}
};

// Melee Item Generation
function buyMelee(username, userid) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.weaponListTwo[Math.floor(Math.random() * rpgApp.weaponListTwo.length)];
	var randomThree = rpgApp.meleeList[Math.floor(Math.random() * rpgApp.meleeList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('MixerRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username, "You found a weapon: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(userid, "holding", "melee", itemName, strengthStat, guileStat, magicStat);
};

// Ranged Item Generation
function buyRanged(username, userid) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.weaponListTwo[Math.floor(Math.random() * rpgApp.weaponListTwo.length)];
	var randomThree = rpgApp.rangedList[Math.floor(Math.random() * rpgApp.rangedList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('MixerRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You found a ranged weapon: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(userid, "holding", "ranged", itemName, strengthStat, guileStat, magicStat);
};

// Magic Item Generation
function buyMagic(username, userid) {
	var randomOne = rpgApp.magicTypeList[Math.floor(Math.random() * rpgApp.magicTypeList.length)];
	var randomTwo = rpgApp.magicElementsList[Math.floor(Math.random() * rpgApp.magicElementsList.length)];
	var randomThree = rpgApp.magicSpellList[Math.floor(Math.random() * rpgApp.magicSpellList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('MixerRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You learned a spell: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(userid, "holding", "magic", itemName, strengthStat, guileStat, magicStat);
};

// armor Item Generation
function buyArmor(username, userid) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.resourceTypeList[Math.floor(Math.random() * rpgApp.resourceTypeList.length)];
	var randomThree = rpgApp.armorList[Math.floor(Math.random() * rpgApp.armorList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('MixerRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username, "You found armor: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(userid, "holding", "armor", itemName, strengthStat, guileStat, magicStat);
};

// Mount Item Generation
function buyMount(username, userid) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.creatureAttributeList[Math.floor(Math.random() * rpgApp.creatureAttributeList.length)];
	var randomThree = rpgApp.creatureNameList[Math.floor(Math.random() * rpgApp.creatureNameList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('MixerRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You found a mount: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(userid, "holding", "mount", itemName, strengthStat, guileStat, magicStat);
};

// Title Generation
function buyTitle(username, userid) {
	var randomOne = rpgApp.titleTypeList[Math.floor(Math.random() * rpgApp.titleTypeList.length)];
	var randomTwo = rpgApp.titleList[Math.floor(Math.random() * rpgApp.titleList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength;
	var guileStat = randomOne.guile + randomTwo.guile;
	var magicStat = randomOne.magic + randomTwo.magic;
	var itemName = randomOne.name + " " + randomTwo.name;

	// Push info to queue
	console.log('MixerRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You won a title: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(userid, "holding", "title", itemName, strengthStat, guileStat, magicStat);
};

// Companion Generation
function buyCompanion(username, userid) {
	var randomOne = rpgApp.weaponListOne[Math.floor(Math.random() * rpgApp.weaponListOne.length)];
	var randomTwo = rpgApp.creatureAttributeList[Math.floor(Math.random() * rpgApp.creatureAttributeList.length)];
	var randomThree = rpgApp.companionList[Math.floor(Math.random() * rpgApp.companionList.length)];

	var strengthStat = randomOne.strength + randomTwo.strength + randomThree.strength;
	var guileStat = randomOne.guile + randomTwo.guile + randomThree.guile;
	var magicStat = randomOne.magic + randomTwo.magic + randomThree.magic;
	var itemName = randomOne.name + " " + randomTwo.name + " " + randomThree.name;

	// Push info to queue
	console.log('MixerRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username, "You found a companion: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(userid, "holding", "companion", itemName, strengthStat, guileStat, magicStat);
};

// Coin Generation
function buyCoins(username, userid) {
	var currency = dbItems.getData("/currency");
	var coins = currency[Math.floor(Math.random() * currency.length)];

	// Push info to queue
	console.log('MixerRPG: ' + username + ' got ' + coins + ' coins.');
	sendWhisper(username,"You found "+coins+" coins!");

	// Add points to user in scottybot
	addPoints(userid, coins);
};

// Trophy Generation
function buyTrophy(username, streamerName, userid) {
	var randomOne = streamerName;
	var randomTwo = rpgApp.trophyList[Math.floor(Math.random() * rpgApp.trophyList.length)];

	var strengthStat = randomTwo.strength;
	var guileStat = randomTwo.guile;
	var magicStat = randomTwo.magic;
	var itemName = streamerName + "'s " + randomTwo.name;

	// Push info to queue
	console.log('MixerRPG: ' + username + ' got a ' + itemName + ' (' + strengthStat + '/' + guileStat + '/' + magicStat + ').');
	sendWhisper(username,"You found a trophy: " + itemName + " (" + strengthStat + "/" + guileStat + "/" + magicStat + "). Type !rpg-equip to use it.");

	// Push to DB
	dbPlayerHolder(userid, "holding", "trophy", itemName, strengthStat, guileStat, magicStat);
};

// RPG Inventory
// Prints out a players inventory.
function rpgInventory(username, userid) {
	// Recalc total.
	characterStats(userid);

	try {
		var title = dbPlayers.getData("/" + userid + "/title/name");
		var strength = dbPlayers.getData("/" + userid + "/title/strength");
		var guile = dbPlayers.getData("/" + userid + "/title/guile");
		var magic = dbPlayers.getData("/" + userid + "/title/magic");
		var titleStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var title = "Commoner"
		var titleStats = "(0/0/0)";
	}

	try {
		var melee = dbPlayers.getData("/" + userid + "/melee/name");
		var strength = dbPlayers.getData("/" + userid + "/melee/strength");
		var guile = dbPlayers.getData("/" + userid + "/melee/guile");
		var magic = dbPlayers.getData("/" + userid + "/melee/magic");
		var meleeStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var melee = "Fists"
		var meleeStats = "(0/0/0)";
	}

	try {
		var ranged = dbPlayers.getData("/" + userid + "/ranged/name");
		var strength = dbPlayers.getData("/" + userid + "/ranged/strength");
		var guile = dbPlayers.getData("/" + userid + "/ranged/guile");
		var magic = dbPlayers.getData("/" + userid + "/ranged/magic");
		var rangedStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var ranged = "Nothing";
		var rangedStats = "(0/0/0)";
	}

	try {
		var magicName = dbPlayers.getData("/" + userid + "/magic/name");
		var strength = dbPlayers.getData("/" + userid + "/magic/strength");
		var guile = dbPlayers.getData("/" + userid + "/magic/guile");
		var magic = dbPlayers.getData("/" + userid + "/magic/magic");
		var magicStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var magicName = "Nothing";
		var magicStats = "(0/0/0)";
	}

	try {
		var armor = dbPlayers.getData("/" + userid + "/armor/name");
		var strength = dbPlayers.getData("/" + userid + "/armor/strength");
		var guile = dbPlayers.getData("/" + userid + "/armor/guile");
		var magic = dbPlayers.getData("/" + userid + "/armor/magic");
		var armorStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var armor = "Naked";
		var armorStats = "(0/0/0)";
	}

	try {
		var mount = dbPlayers.getData("/" + userid + "/mount/name");
		var strength = dbPlayers.getData("/" + userid + "/mount/strength");
		var guile = dbPlayers.getData("/" + userid + "/mount/guile");
		var magic = dbPlayers.getData("/" + userid + "/mount/magic");
		var mountStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var mount = "Nothing";
		var mountStats = "(0/0/0)";
	}

	try {
		var companion = dbPlayers.getData("/" + userid + "/companion/name");
		var strength = dbPlayers.getData("/" + userid + "/companion/strength");
		var guile = dbPlayers.getData("/" + userid + "/companion/guile");
		var magic = dbPlayers.getData("/" + userid + "/companion/magic");
		var companionStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var companion = "None";
		var companionStats = "(0/0/0)";
	}

	try {
		var trophy = dbPlayers.getData("/" + userid + "/trophy/name");
		var strength = dbPlayers.getData("/" + userid + "/trophy/strength");
		var guile = dbPlayers.getData("/" + userid + "/trophy/guile");
		var magic = dbPlayers.getData("/" + userid + "/trophy/magic");
		var trophyStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var trophy = "None";
		var trophyStats = "(0/0/0)";
	}
	
	try {
		var prowessStrength = dbPlayers.getData("/" + userid + "/prowess/strength");
	} catch (error) {
		var prowessStrength = 0;
	}
	try {
		var prowessGuile = dbPlayers.getData("/" + userid + "/prowess/guile");
	} catch (error) {
		var prowessGuile = 0;
	}
	try {
		var prowessMagic = dbPlayers.getData("/" + userid + "/prowess/magic");
	} catch (error) {
		var prowessMagic = 0;
	}
	var prowessStats = "("+prowessStrength+"/"+prowessGuile+"/"+prowessMagic+")";

	try {
		var strength = dbPlayers.getData("/" + userid + "/stats/strength");
		var guile = dbPlayers.getData("/" + userid + "/stats/guile");
		var magic = dbPlayers.getData("/" + userid + "/stats/magic");
		var charStats = "(" + strength + "/" + guile + "/" + magic + ")";
	} catch (error) {
		var charStats = "Error";
	}

	try{
		var coins = dbPlayers.getData("/" + userid + "/coins");
	} catch (err) {
		var coins = "0";
	}

	var sayInventory1 = username + " the " + title + " " + titleStats + " || Coins: "+ coins +" || Melee: " + melee + " " + meleeStats + " || Ranged: " + ranged + " " + rangedStats + " || Magic: " + magicName + " " + magicStats + " || Armor: " + armor + " " + armorStats;
	var sayInventory2 = "Mount: " + mount + " " + mountStats + " || Companion: " + companion + " " + companionStats + " || Trophy: " + trophy + " " + trophyStats + " || Prowess: "+prowessStats+" || Total: " + charStats;
	sendWhisper(username, sayInventory1);
	sendWhisper(username, sayInventory2);
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
	let settings = dbSettings.getData('/adventure');
	let currentCoins = getPoints(userid);

	if(settings.active === true && currentCoins >= settings.cost){
		let diceRoll = Math.floor((Math.random() * 20) + 1);

		if (diceRoll === 1 || diceRoll === 20) {
			// Mimic!
			buyMonster(username, userid);
		} else if (diceRoll >= 2 && diceRoll <= 4) {
			// Melee
			buyMelee(username, userid);
		} else if (diceRoll >= 5 && diceRoll <= 7) {
			// Ranged
			buyRanged(username, userid);
		} else if (diceRoll >= 8 && diceRoll <= 11) {
			// Magic Spell
			buyMagic(username, userid);
		} else if (diceRoll >= 12 && diceRoll <= 13) {
			// armor
			buyArmor(username, userid);
		} else if (diceRoll >= 14 && diceRoll <= 15) {
			// Mount
			buyMount(username, userid);
		} else if (diceRoll === 16) {
			//Title
			buyTitle(username, userid);
		} else if (diceRoll === 17) {
			//Companion
			buyCompanion(username, userid);
		} else {
			//Coins
			buyCoins(username, userid);
		}

		deletePoints(userid, settings.cost);
	} else {
		sendWhisper(username, 'You do not have enough coins for this, or adventure is deactivated.');
	}
}

// RPG Daily Quest
// This is a simply daily that people can trigger once every 24 hours to get a coin boost.
function rpgDailyQuest(username, userid) {
	var dailyReward = dbSettings.getData("/dailyReward");
	try {
		var lastDaily = dbPlayers.getData("/" + userid + "/lastSeen/dailyQuest");
	} catch (error) {
		var lastDaily = 1;
	}
	var date = new Date().getTime();
	var timeSinceLastDaily = date - lastDaily;
	var timeUntilNext = 86400000 - timeSinceLastDaily;
	var humanTime = msToTime(timeUntilNext);

	if (timeSinceLastDaily >= 86400000) {
		dbPlayers.push("/" + userid + "/lastSeen/dailyQuest", date);
		addPoints(userid, dailyReward);
		sendWhisper(username, "Daily completed! Reward: " + dailyReward + " || Cooldown: 24hr");
	} else {
		sendWhisper(username, "You already completed your daily! Try again in " + humanTime + ".");
	}
}

// RPG Raid Event
// This will start a raid and use the target streamer as a boss. Meant to be used once at the end of a stream. 
function rpgRaidEvent(username, userid, rawcommand, isMod) {
	var raidCommandArray = (rawcommand).split(" ");
	var raidTarget = raidCommandArray[1];

	if (isMod === true && rpgApp.raidActive === false && raidTarget !== undefined) {

		// Get target info and start up the raid.
		request('https://mixer.com/api/v1/channels/' + raidTarget, function(error, response, body) {
			if (!error && response.statusCode == 200) {
				// Great, valid raid target. Get target info, set raid to active, send broadcast to overlay with info.
				var data = JSON.parse(body);
				var streamUrl = "https://mixer.com/" + raidTarget;
				sendBroadcast(username+" has started a raid! Type !rpg-raid to join!");
				rpgApp.raidActive = true;

				// Start timer for raid event based on setting in settings db.
				setTimeout(function() {
					
					var diceRoller = (dice.roll({
						quantity: 1,
						sides: 20,
						transformations: ['sum']
					})).result;
					
					if (diceRoller <= 8){
						var luckyPerson = rpgApp.raiderList[Math.floor(Math.random() * rpgApp.raiderList.length)];
						var luckyPersonName = luckyPerson.name;
						buyTrophy(luckyPersonName, raidTarget, userid);
						var raidWinCoin = dbSettings.getData("/raid/winReward");
						giveallPoints(raidWinCoin);
						sendBroadcast("The raid has ended. The horde has overcome "+ raidTarget+ " and " + luckyPersonName + " took a trophy. Everyone also gets " + raidWinCoin + " coins!")
						sendWhisper(luckyPersonName, "You got a trophy! Type !rpg-equip to use it!");
					} else {
						var raidLoseCoin = dbSettings.getData("/raid/loseReward");
						giveallPoints(raidLoseCoin);
						sendBroadcast("The raid has ended. " + raidTarget + " has fought off the horde. Everyone gets " + raidLoseCoin + " coins for your repair bill.");
					}

					// Get raid message and send that to chat when everything is over.
					var raidMessage = dbSettings.getData("/raid/raidMessage");
					sendBroadcast(raidMessage + " || https://mixer.com/" + raidTarget);

					// Reset lists and flags
					rpgApp.raidActive = false;
					rpgApp.raiderList = []

				}, rpgApp.raidTimer);

			} else {
				sendWhisper(username, "Error: " + raidTarget + " is not a valid raid target!");
			}
		})

	} else if (rpgApp.raidActive === true) {
		// Raid is active. Add user to raid participant list if they're not already there.
		var raiderName = search(username, rpgApp.raiderList);
		if (raiderName === undefined) {
			rpgApp.raiderList.push({
				"name": username,
				"userid": userid
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
		if ( isNaN(pointsBet) === false || inProgress === true){
			var pointsBet = parseInt(pointsBet);
			let currentPoints = getPoints(userid)

			// Make sure the user has points to bet.
			if(currentPoints >= pointsBet){
				// Great, this person exists!
				var pointsTotal = dbPlayers.getData('/'+userid+'/coins');
				var minimumBet = dbSettings.getData("/companionDuel/minBet");
				var inProgress = dbGame.getData("/companionDuel/settings/inProgress");
				var expire = dbGame.getData("/companionDuel/settings/expireTime");
				try {
					var companion = dbPlayers.getData("/"+userid+'/companion');
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
							console.log('Arena Winner: '+playerOne.name+' || Amount:'+winnings);
							addPoints(playerOne.userid, winnings);
							sendBroadcast(playerOne.name + '\'s '+playerOne.companionName+' has won an arena battle against '+ playerTwo.name +'\'s '+playerTwo.companionName+'! They win '+winnings+' coins.');
						} else {
							console.log('Arena Winner: '+playerTwo.name+' || Amount:'+winnings);
							addPoints(playerTwo.userid, winnings);
							sendBroadcast(playerTwo.name + '\'s '+playerTwo.companionName+' has won an arena battle against '+ playerOne.name +'\'s '+playerOne.companionName+'! They win '+winnings+' coins.');
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
					sendWhisper(username, "You either do not have equipment for this fight, or you don't have enough money!");
				}
			};
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
		if ( isNaN(pointsBet) === false || inProgress === true){
			var pointsBet = parseInt(pointsBet);
			let currentPoints = getPoints(userid)

			// Make sure the user has points to bet.
			if(currentPoints >= pointsBet){
				// Great, this person exists!
				var pointsTotal = dbPlayers.getData('/'+userid+'/coins');
				var minimumBet = dbSettings.getData("/playerDuel/minBet");
				var inProgress = dbGame.getData("/playerDuel/settings/inProgress");
				var expire = dbGame.getData("/playerDuel/settings/expireTime");
				try {
					var player = dbPlayers.getData("/"+userid+"/stats");
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
							console.log('Arena Winner: '+playerOne.name+' || Amount:'+winnings);
							addPoints(playerOne.userid, winnings);
							sendBroadcast(playerOne.name + ' has won a bloody duel against '+ playerTwo.name +'! They win '+winnings+' coins.');
						} else {
							console.log('Arena Winner: '+playerTwo.name+' || Amount:'+winnings);
							addPoints(playerTwo.userid, winnings);
							sendBroadcast(playerTwo.name + ' has won a bloody duel against '+ playerOne.name +'! They win '+winnings+' coins.');
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
					sendWhisper(username, "You either do not have equipment for this fight, or you don't have enough money!");
				}
			};
		} else {
			// Someone typed in a command with some gibberish on the end.
			sendWhisper(username, "Invalid command. Try !rpg-arena (number)");
		}
	} else {
		sendWhisper(username, "This command is currently deactivated.");
	}
}

// Shop Item Generation
// This generates items in the shop.
function rpgShopLoop(){
	
	request('https://mixer.com/api/v1/chats/'+rpgApp.chanID+'/users', function(error, response, body) {
			if (!error && response.statusCode == 200) {
				var data = JSON.parse(body);
				var user = data[Math.floor(Math.random() * data.length)];
				var trophyName = user.userName;
				
				for (i = 1; i < 4; i++) { 
					let item = rpgShopGeneration(trophyName); 
					dbGame.push("/shop/item"+i+"/itemName", item.name);
					dbGame.push("/shop/item"+i+"/strength", item.strength);
					dbGame.push("/shop/item"+i+"/guile", item.guile);
					dbGame.push("/shop/item"+i+"/magic", item.magic);
					dbGame.push("/shop/item"+i+"/price", item.price);
					dbGame.push("/shop/item"+i+"/slot", item.itemslot);
				}
			} else {
				console.log('Could not access mixer api for store item generation.')
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
				// Great, this person exists!
				var pointsTotal = getPoints(userid);
				
				if (pointsTotal >= item.price && isNaN(item.price) === false){
					// Item Bought
					console.log(username+ ' has '+pointsTotal+' and is spending '+item.price+'.');
					sendWhisper(username, "You bought "+item.itemName+" for "+item.price+" coins. Type !rpg-equip to use it.");
					deletePoints(userid, item.price);
					dbGame.push("/shop/item"+command+"/price", "sold");
					
					// Push to player holding slot
					dbPlayerHolder(userid, "holding", item.slot, item.itemName, item.strength, item.guile, item.magic);
				} else {
					// Not enough points.
					sendWhisper(username, "You do not have enough coins for that item!");
				}
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
		var strength = dbPlayers.getData("/" + userid + "/prowess/strength");
	} catch (error) {
		var strength = 0;
	}
	try {
		var guile = dbPlayers.getData("/" + userid + "/prowess/guile");
	} catch (error) {
		var guile = 0;
	}
	try {
		var magic = dbPlayers.getData("/" + userid + "/prowess/magic");
	} catch (error) {
		var magic = 0;
	}
	
	// If mission gives stats...
	if (missionStrength > 0 || missionGuile > 0 || missionMagic > 0){
		var newStrength = strength + missionStrength;
		var newGuile = guile + missionGuile;
		var newMagic = magic + missionMagic;
		dbPlayers.push("/" + userid + "/prowess/strength", newStrength);
		dbPlayers.push("/" + userid + "/prowess/guile", newGuile);
		dbPlayers.push("/" + userid + "/prowess/magic", newMagic);
		characterStats(userid);
	}
	
	// If mission gives coins...
	if (missionCoin > 0){
		addPoints(userid, missionCoin);
	}

	// Send a whisper about what happened.
	var missionText = missionText+" || Prowess:("+missionStrength+"/"+missionGuile+"/"+missionMagic+") || "+missionCoin+" coins.";
	sendWhisper(username, missionText);
}