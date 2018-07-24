// Google API setup ----------------------------------------------------
const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

// If modifying these scopes, delete credentials.json.
const SCOPES = ["https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/plus.login"];
const TOKEN_PATH = "token.json";

// SlackBot Setup --------------------------------------------------------
const slack = require('@slack/client')
const RTMClient = slack.RTMClient
const WebClient = slack.WebClient
const token = 'xoxb-402681346384-403536981733-kqaM0ezYN5OdLCXv1T8h6wlU'
const web = new WebClient(token)
const rtm = new RTMClient(token)

// Express Setup --------------------------------------------------------
const express = require('express');
const app = express();

// Global variables
let EVENTTOCREATE = {};


rtm.start()

let request;

rtm.on('message', (message) => {
  console.log(message);
  if ( (message.subtype && message.subtype === 'bot_message') ||
     (!message.subtype && message.user === rtm.activeUserId) ) {
       return;
     }
  request = userRequest(message.text)
    web.chat.postMessage({
    channel: message.channel,
    text: `${request.eventSend.confirmation}, Please confirm!`,
    attachments: [
        {
            "fallback": "You are unable to confirm",
            "callback_id": "wopr_game",
            "color": "#3AA3E3",
            "attachment_type": "default",
            "actions": [
                {
                    "name": "response",
                    "text": "Yes",
                    "type": "button",
                    "value": "true",
                    "style": "primary",
                },
                {
                    "name": "response",
                    "text": "No",
                    "type": "button",
                    "value": "false",
                    "style": "danger",
                }
            ]
        }
    ]
})
    .then((msg) => console.log('Message sent to channel'))
    .catch(console.error)
})


app.post('/oauth', (req, res) => {
  if (req.payload.actions[0].value === true){
    // T runs the google calendar stuff here


    // Sending Data to Google Calendar -------------------------------------

    fs.readFile("credentials.json", (err, content) => {  // Load client secrets from a local file.
      if (err) return console.log("Error loading client secret file:", err);
      // Authorize a client with credentials, then call the Google Calendar API.
      authorize(JSON.parse(content), createEvent);
    });

    // End of sending data to google calendar -------------------------------

    res.send({message: 'scheduled!'})
  } else {
    res.send({message: 'canceled scheuling'})
  }
})

//------------------------------------------------------------------------------------------------------------------------------------------------

// Load client secrets from a local file.
// fs.readFile("credentials.json", (err, content) => {
//   if (err) return console.log("Error loading client secret file:", err);
//   // Authorize a client with credentials, then call the Google Calendar API.
//   authorize(JSON.parse(content), listEvents);
// });

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, callback) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client, callback) {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline' // Change to Online for auth without token,
    scope: SCOPES,
  });

  // Currently Authenticating thorugh console
  // ADD: Send this url back to slackbot
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return callback(err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listEvents(auth) {
  const eventList = []
  const calendar = google.calendar({version: "v3", auth});
  calendar.events.list({
    calendarId: "primary",
    timeMin: (new Date()).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  }, (err, res) => {
    if (err) return console.log("The API returned an error: " + err);
    const events = res.data.items;
    if (events.length) {
      events.map((event) => {
        const start = event.start.dateTime || event.start.date;
        eventList.push(event);
      });
      console.log("Upcoming 10 events:", eventList);
    } else {
      console.log("No upcoming events found.");
    }
  });
}

// Create an Event
// Event must contain keys => calendarId, start, end
// Start and end must be days for all day event
function createEvent(auth) {
  const calendar = google.calendar({version: 'v3', auth});

  // eventSend.confirmedMessage should be formatted
  calendar.events.insert(eventSend.confirmedMessage, (err, event) => {
    if (err) return console.log('The API returned an error: ' + err)
    else console.log('Event Created:', event.summary);
  });
}

// List Available Times for the next 7 days
function listAvailable(auth) {
  const startDate = new Date();
  const endDate = new Date();
  const times = [];
  const asyncDone = false;
  const calendar = google.calendar({version: 'v3', auth});


  // Running through 7 days
  for (let i = 0; i < 8; i++) {
    calendar.events.list({
      calendarId: "primary",
      timeMin: startDate.toISOString(),
      timeMax:  endDate.toISOString(),
      maxResults: 3, // Max 3 Time Slots per day
      singleEvents: true,
      orderBy: "startTime",
    }, (err, res) => {
      if (err) return console.log("The API returned an error: " + err);
      const events = res.data.items;
      if (events.length) {
        console.log('Available Times')
        events.map((event) => {
          const end = event.end.dateTime || event.end.date;
          times.push(end);
        });
        times.sort((a,b) => (new Date(a)) - (new Date(b)));

        if(i === 7) { // Return the list of times when after the last asycn call
          console.log(times);
          return times.slice(0, 10); // Slice for the first 10
        }
      } else {
        console.log("No upcoming events found.");
      }
    });
    startDate.setDate(startDate.getDate() + 1)
    endDate.setDate(startDate.getDate() + 1);
  }
}
