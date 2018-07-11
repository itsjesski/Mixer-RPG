'use strict';

// Native modules
const EventEmitter = require('events').EventEmitter;

// Dep modules
const JsonDB = require('node-json-db');
const WebSocket = require('ws');
const auth = require('mixer-shortcode-oauth');
const mixerClient = require('beam-client-node');

const dbAuth = new JsonDB("db/auth", true, true);

/** @desc Simple mixer-chat client
  * @class
  * @public
  */
class SimpleMixerChatClient extends EventEmitter {

    /** @desc Creates a new client instance
      * @public
      * @constructor
      * @param {String} [clientId] OAuth client id

      */
    constructor(clientId) {
        super();

        // Client id not specified
        if (clientId == null) {

            // Attempt to retrieve client id from database
            clientId = dbAuth.getData('/clientId');

            // Invalid client id
            if (typeof clientId !== 'string') {
                throw new Error('Auth Error: clientId was not a string');
            }
        }

        // Store client id
        this.clientId = clientId;

        // Store state
        this.state = SimpleMixerChatClient.states.INITIALIZED;

        // Create socket variable to be filled in later
        this.socket = null;
    }

    /** @desc Starts the authorization and connection process
      * @function
      * @public
      * @returns {Promise<SimpleMixerChatClient>}
      */
    connect() {

        // Store reference to instance
        const self = this;

        // Create new mixer shortcode oath client instance
        let authClient = new auth.ShortcodeAuthClient(
            {
                "client_id": self.clientId,
                "scopes": [
                    "chat:bypass_slowchat",
                    "chat:bypass_links",
                    "chat:bypass_filter",
                    "chat:bypass_catbot",
                    "chat:chat",
                    "chat:connect",
                    "chat:remove_message",
                    "chat:whisper"
                ]
            },
            new auth.LocalTokenStore(__dirname + '/db/authTokensDoNotShow.json')
        );

        return new Promise((resolve, reject) => {

            // Hook event to log code
            authClient.on('code', code => {
                console.log(`Go to https://mixer.com/go?code=${code} and enter code ${code}...`);
            });

            // Hook authorized event
            authClient.on('authorized', (token) => {
                resolve(token);
            });

            // Hook failure events so the promise is rejected on failure
            authClient.on('expired', () => {
                reject(new Error('auth_expired'));
            });
            authClient.on('declined', () => {
                reject(new Error('auth_declined'));
            });
            authClient.on('error', (e) => {
                reject(e);
            });

            // update state
            self.state = SimpleMixerChatClient.states.AUTHENTICATING;

            // begin authorization process
            return authClient.doAuth();

        // Mixer authorization done
        //   Prepare mixer request client and make request to get current user
        }).then(token => {

            // Create a mixer api client
            self.client = new mixerClient.Client(new mixerClient.DefaultRequestRunner());

            // Add oauth provider for the client to use
            self.client.use(new mixerClient.OAuthProvider(self.client, {
                tokens: {
                    access: token,
                    expres: Date.now() + (365 * 24 * 60 * 60 * 1000)
                }
            }));

            // update state
            self.state = SimpleMixerChatClient.States.CHATLOOKUP;

            // Start request process to get info on the currently authorized user
            return self.client.request('GET', 'users/current');

        // Currently authorized user info recieved
        }).then(user => {

            // store user info
            self.userInfo = user.body;

            // Get authkey for the currently authed user's channel chat
            return new mixerClient.ChatService(self.client).join(self.userInfo.channel.id);

        // Auth key retrieved
        }).then(chatInfo => {

            // Done with mixer request client, so delete it
            delete self.client;

            // Extract the chat info from the body property
            chatInfo = chatInfo.body;

            // Create a new mixer-chat websocket instance
            self.socket = new mixerClient.Socket(WebSocket, chatInfo.endpoints).boot();

            // Wire up mixer-chat instance
            self.socket.on('ChatMessage', data => {

                // Emit chat message
                self.emit('ChatMessage', data);
            });

            // Listen for errors
            self.socket.on('error', err => {

                // Free resources
                self.socket = null;
                self.userInfo = null;
                authClient = null;

                // Update state
                self.state = SimpleMixerChatClient.states.ERROR;

                // Emit error
                self.emit('error', err);
            });

            // Update state
            self.state = SimpleMixerChatClient.states.CONNECTING;

            // Start connection attempt
            return self.socket.auth(self.userInfo.channel.id, self.userInfo.id, chatInfo.authkey);

        // Connected successfully
        }).then(() => {

            // Update state
            self.state = SimpleMixerChatClient.states.CONNECTED;

            // resolve promise with the SimpleMixerChatClient instance
            return Promise.resolve(self);

        // Handle errors;
        }).catch(err => {

            // free resources
            self.client = null;
            self.socket = null;
            self.userInfo = null;
            authClient = null;

            // Update state
            self.state = SimpleMixerChatClient.states.ERROR;

            // Reject promise
            return Promise.reject(err);
        });
    }

    /** @desc Sends a whisper if the chat client is connected
      * @public
      * @param {String} user User to send the whisper
      * @param {String} msg Message to send to the user
      * @throws {Error} Thrown if the chat client is not in a connected state
      */
    whisper(user, msg) {

        // Check if client is connected
        if (this.state !== SimpleMixerChatClient.states.CONNECTED) {
            throw new Error('Not Connected');
        }

        // send whisper
        this.socket.call('whisper', [user, msg]);
    }

    /** @desc Sends a message to the channel
      * @public
      * @param {String} msg Message to send to the channel
      * @throws {Error} Thrown if the chat client is not in a connected state
      */
    broadcast(msg) {

        // Check if client is connected
        if (this.state !== SimpleMixerChatClient.states.CONNECTED) {
            throw new Error('Not Connected');
        }

        // send message
        this.socket.call('msg', [msg]);
    }
}

/** @desc enumerate of chat-connection states
  * @public
  * @static
  * @readonly
  * @enum {Number}
  */
SimpleMixerChatClient.states = Object.create(null, {
    ERROR: {
        enumerable: true,
        value: -1
    },
    INITIALIZED: {
        enumerable: true,
        value: 1
    },
    AUTHENTICATING: {
        enumerable: true,
        value: 2
    },
    CHATLOOKUP: {
        enumerable: true,
        value: 3
    },
    CONNECTING: {
        enumerable: true,
        value: 4
    },
    CONNECTED: {
        enumerable: true,
        value: 5
    }
});

// Export client
module.exports = SimpleMixerChatClient;
