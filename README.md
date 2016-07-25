# Beam-RPG-Scotty
This is a chat based RPG for beam.pro that runs using scottybot and node.js. It allows users in chat to go on adventures, quests, raids, and many other things and saves character data to a json db.

Getting Started: <br>
1. Install node from https://nodejs.org/en/ <br>
2. Download this RPG onto your desktop.<br>
3. Go into beam-rpg/db/settings.json <br>
4. Fill out game settings with your own information.<br>
5. Time to create the scottybot commands we'll need! Look below for the commands you'll need create in the Scottybot GUI.<br>
6. Run node.js and direct it to wherever you've stored the beam RPG folder. <br>
7. Install required node modules. (below).
8. Type "node beam-rpg" to start up the service.

Required Modules:
- npm install ws 
- npm install node-json-db --save
- npm install request
- npm install roll
- npm i -S beam-client-node beam-interactive-node robotjs

Scotty Commands: <br>
  - !rpg : (_null_)
  - !rpg-adventure : (_null_) : Recommended cost of 200.
  - !rpg-daily : (_null_)(_bpcd_)
  - !rpg-equip : (_null_)(_bpcd_)
  - !rpg-inventory : (_null_)(_bpcd_)
  - !rpg-raid : (_null_)(_bpcd_)
  - Optional repeating command that tells people to try the !rpg command. <br>
  
FAQ:
- If someone runs an !rpg command and it does not show as in the node window that means the command was not create in the scotty gui.

Required Module URLS:
http://websockets.github.io/ws/
https://www.npmjs.com/package/node-json-db
https://github.com/request/request
https://github.com/troygoode/node-roll
https://dev.beam.pro
