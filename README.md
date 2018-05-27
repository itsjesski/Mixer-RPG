# MixerRPG
This is a stand alone chat based RPG for mixer.com that runs using node.js. It allows users in chat to go on adventures, quests, raids, and many other things and saves character data to a json db.

## Can I use this on my Mixerchannel?
Yes, but I can't provide support in getting it started or fixing errors.

## Getting Started: <br>
1. Install node from https://nodejs.org/en/ <br>
2. Download this RPG. I'd recommend putting it somewhere easy to get to.<br>
3. Go into the folder you downloaded and go to /db/settings.json <br>
4. Fill out game settings with your own information.<br>
5. Go to /db/auth.json <br>
6. Put in your channel id. You can find this using the lookup tool at crowbartools.com.<br>
7. Go into the downloaded folder and Shift+right click in an empty space. Select open command window here.<br>
8. Type npm install and wait.<br>
9. After that is done type npm start.

Commands: <br>
  - !rpg
  - !rpg-adventure
  - !rpg-arena
  - !rpg-daily
  - !rpg-duel
  - !rpg-equip
  - !rpg-inventory
  - !rpg-raid
  - !rpg-shop
  - !rpg-shop-refresh
  - !rpg-training

Command Details:
- Arena : Allows two users to duel each other using only their companion, similar to pokemon battles. Useful for new players to duel high level players.
- Dueling : Allows two players to duel each other with full equipment and stats.
- Training : Allows a player to go on a training mission and increase a permanent stat called prowess. Useful for point dumps when equipment is maxed.
- Shop : Allows users to purchase a randomly generated item from a shop keeper. They can also pay to refresh the shop with new items.
- Adventure : Allows the user to go on adventure to get new equipment at random.
- Raid: Allows a mod to kick off a raid against another streamer. Gives people a chance to get a trophy named after the raid target before posting a link to their channel.

Combat System: <br>
Combat works in three rounds. Each round a random stat is picked, strength, guile, or magic and both players fight using that stat. A die is rolled and added on to each state before determining the winner.
  
FAQ:
- This is in the early alpha stage. I can't do much in the way of support for this currently.
