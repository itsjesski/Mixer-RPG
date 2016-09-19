# Beam-RPG-Scotty
This is a chat based RPG for beam.pro that runs using scottybot and node.js. It allows users in chat to go on adventures, quests, raids, and many other things and saves character data to a json db.

Getting Started: <br>
1. Install node from https://nodejs.org/en/ <br>
2. Download this RPG onto your desktop.<br>
3. Go into beam-rpg/db/settings.json <br>
4. Fill out game settings with your own information.<br>
5. Go to beam-rpg/db/auth.json <br>
6. Edit this with your own scottbot auth key generated from the GUI.<br>
7. Time to create the scottybot commands we'll need! Look below for the commands you'll need create in the Scottybot GUI.<br>
8. Go into the beam-rpg and Shift+right click in an empty space. Select open command window here.<br>
9. Type npm install and wait.<br>
10. After that is done type npm start.

Scotty Commands: <br>
  - !rpg : (_null_)
  - !rpg-adventure : (_null_) : Recommend to set a cost.
  - !rpg-arena : (_null_)(_bpcd_)
  - !rpg-daily : (_null_)(_bpcd_) : Set reward in settings file.
  - !rpg-duel : (_null_)(_bpcd_)
  - !rpg-equip : (_null_)(_bpcd_)
  - !rpg-inventory : (_null_)(_bpcd_)
  - !rpg-raid : (_null_)(_bpcd_)
  - !rpg-shop : (_null_)(_bpcd_)
  - !rpg-shop-refresh :  (_null_)(_bpcd_) : Recommend to set cost.
  - !rpg-training :  (_null_)(_bpcd_) : Recommend to set high cost.
  - rpg-trivia :  (_null_)(_bpcd_)
  - Optional repeating command that tells people to try the !rpg command. <br>

Command Details:
- Arena : Allows two users to duel each other using only their companion, similar to pokemon battles. Useful for new players to duel high level players.
- Dueling : Allows two players to duel each other with full equipment and stats.
- Training : Allows a player to go on a training mission and increase a permanent state called prowess. Useful for point dumbs when equipment is maxed.
- Shop : Allows users to purchase a randomly generated item from a shop keeper. They can also pay to refresh the shop with new items.
- Adventure : Allows the user to go on adventure to get new equipment at random.
- Trivia : Allows two users to duel with a battle of wits. First to answer the trivia correctly gets coins. (IN TESTING)
- Raid: Allows a mod to kick off a raid against another streamer. Gives people a chance to get a trophy named after the raid target before posting a link to their channel.

Combat System:
Combat works in three rounds. Each round a random stat is picked, strength, guile, or magic and both players fight using that stat. A dice is rolled and added on to each state before determining the winner.
  
FAQ:
- If someone runs an !rpg command and it does not show as in the node window that means the command was not created in the scotty gui.
- This is in the early alpha stage. I can't do much in the way of support for this currently.
