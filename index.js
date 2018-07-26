// Google API setup ----------------------------------------------------
const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const dialogflow = require('dialogflow');

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
const path = require('path');
const app = express();
const bodyParser = require('body-parser');

app.use(bodyParser.urlencoded({ extended: false}));
app.use(bodyParser.json());


// DialogFlow Setup ----------------------------------------------------------------
const Storage = require('@google-cloud/storage');

// Instantiates a client. If you don't specify credentials when constructing
// the client, the client library will look for credentials in the
// environment.
const storage = new Storage();

// Other Setup --------------------------------------------------------------------------
const axios = require('axios');

//---------------------------------------- End of all Setup ----------------------------
// Global variables
let EVENTTOCREATE = {};
let CONFIRMED = false;
let LISTEVENTSFROM = new Date();
let EVENTSLIST = [];
let AVAILABLETIMES = [];
let ERROR = false;
let FURTHERACTION = false;
let SLACKBOTCHANNEL = '';
let INVITEEIDS = [];

// ------------------------------------ Slack Bot Functionality ----------------------------------
rtm.start()

let answer;
rtm.on('message', (message) => {
  CONFIRMED = false;
  if ( (message.subtype && message.subtype === 'bot_message') ||
     (!message.subtype && message.user === rtm.activeUserId) ) {
       return;
     }

     console.log('channel', message.channel)

     if (!CONFIRMED) {

       // Send Confirmation Response to request
         userRequest(message.text)
           .then(answer => {
             SLACKBOTCHANNEL = message.channel;
             let postMessage = {
                  channel: message.channel,
                  text: `${answer.eventSend.confirmation}, Please confirm!`,
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
              }

              // Add option to invite confirm with slack members if not a reminder
              if (answer.eventSend.confirmation.indexOf('remind') === -1) {
                postMessage.attachments[0].actions.push({
                    "name": "response",
                    "text": "Ask Invitees for Confirmation",
                    "type": "button",
                    "value": "ask",
                });
              }

              // Edit message no invitees where listed in a meeting
              if(answer.eventSend.confirmation.indexOf('invite anyone else') !==-1){
                postMessage.text = answer.eventSend.confirmation;
                postMessage.attachments = [];
              }

              web.chat.postMessage(postMessage);

             EVENTTOCREATE = answer.confirmedMessage;
             CONFIRMED = true;
           })
           .then(() => console.log('Message sent to channel'))
           .catch(console.error)
     }
})

//--------------------------------------------------------------  Google Calendar API Functions ----------------------------------------------------------------

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
    access_type: 'offline', // Change to Online for auth without token,
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
    timeMin: LISTEVENTSFROM,
    maxResults: 10,
    singleEvents: true,
    orderBy: "startTime",
  }, (err, res) => {
    if (err) {
      ERROR = true;
      return console.log("The API returned an error: " + err);
    }
    const events = res.data.items;
    if (events.length) {
      events.map((event) => {
        const start = event.start.dateTime || event.start.date;
        EVENTSLIST.push(event);
      });
      console.log('Got Events List');
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

  calendar.events.insert({
    'calendarId': 'primary',
    resource: EVENTTOCREATE}, (err, event) => {
    if (err) {
      ERROR = true;
      return console.log("The API returned an error: " + err);
    }
    else console.log('Event Created:', event.data);
  });
}


// List Available Times for the next 7 days
function listAvailable(auth) {
  AVAILABLETIMES = [];
  const startDate = TIMEFOREVENT;
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + 7);
  const calendar = google.calendar({version: 'v3', auth});

  let times = [];

  calendar.freebusy.query({
    auth: auth,
    resource: {
      "timeMin": startDate.toISOString(),
      "timeMax": endDate.toISOString(),
      "items": [{"id": "primary"}]
    }
  }, function(err, res) {
    if (err) {
      ERROR = true;
      return console.log("The API returned an error: " + err);
    }
    const events = res.data.calendars.primary.busy;

    // Make sure only three per day
    let counter = 0;
    let date = startDate;
    if (events.length) {
      events.map((event) => AVAILABLETIMES.push(event.end));
      AVAILABLETIMES.sort((a,b) => (new Date(a)) - (new Date(b)));
    } else {
      console.log("No upcoming events found.");
    }
  });
}


combined = async(auth) => {
  // Get all event start times for the chosen day
  const calendar = google.calendar({version: "v3", auth});
  LISTEVENTSFROM = EVENTTOCREATE.start.dateTime;

  // Get Available times into AVAILABLETIMES global variable
  AVAILABLETIMES = [];
  const startDate = new Date(LISTEVENTSFROM);
  const endDate = new Date();
  endDate.setDate(startDate.getDate() + 7);

  await calendar.freebusy.query({
    auth: auth,
    resource: {
      "timeMin": startDate.toISOString(),
      "timeMax": endDate.toISOString(),
      "items": [{"id": "primary"}]
    }
  }, function(err, res) {
    if (err) {
      ERROR = true;
      return console.log("The API returned an error: " + err);
    }
    const events = res.data.calendars.primary.busy;

    // Make sure only three per day
    let counter = 0;
    let date = startDate;

    if (events.length) {
      events.map((event) => {
        AVAILABLETIMES.push(event.end)
        EVENTSLIST.push({
          start: event.start,
          end: event.end,
        });
      });
      AVAILABLETIMES.sort((a,b) => (new Date(a)) - (new Date(b)));
      EVENTSLIST.sort((item, item2) => (new Date(item.start)) - (new Date(item2.start)));

      // Check if the selected time has a conflict
      let conflictCheck = EVENTSLIST.map((event) => {
        return (new Date(event.start).valueOf() >= (startDate).valueOf() &&
        new Date(event.end).valueOf() >= (startDate).valueOf());
      }).reduce((a,b) => a && b);

      if (conflictCheck) {

        FURTHERACTION = true;

        web.chat.postMessage({
            channel: SLACKBOTCHANNEL,
            text: 'Sorry you have another event at that time. Would you like to pick from these times when you are free?',
            response_type: 'in_channel',
            attachments: [
                {
                    "text": "Pick a Time",
                    "fallback": "If you could read this message, you'd be choosing something fun to do right now?",
                    "color": "#3AA3E3",
                    "attachment_type": "default",
                    "callback_id": "time_selection",
                    "actions": [
                        {
                            "name": "available_times",
                            "text": "Pick a time...",
                            "type": "select",
                            "options": (AVAILABLETIMES.slice(0, 10)).map((time, i) => {
                              return {
                                  "text": (new Date(time)).toLocaleString(),
                                  "value": i
                              }
                            })
                        }
                    ]
                }
            ]
        })
      } else {

        createEvent(auth);
      }

    } else {
      console.log("No upcoming events found.");
    }
  });
}

// ----------------------------------------DialogFlow Functions -----------------------------------

// Makes an authenticated API request.
storage
  .getBuckets()
  .then((results) => {
    const buckets = results[0];

    console.log('Buckets:');
    buckets.forEach((bucket) => {
      console.log(bucket.name);
    });
  })
  .catch((err) => {
    console.error('ERROR:', err);
  });

/// NLP Start!!
// Define session path

 userRequest = async(inputQuery) => {
  console.log('inputQuery---->', inputQuery)
  const projectId = process.env.DIALOGFLOW_PROJECT_ID; //https://dialogflow.com/docs/agents#settings
  const sessionId = 'quickstart-session-id';
  const query = inputQuery;
  const languageCode = 'en-US';

  // Instantiate a DialogFlow client.
  const sessionClient = new dialogflow.SessionsClient();
  const sessionPath = sessionClient.sessionPath(projectId, sessionId);

  // The text query request.
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: query,
        languageCode: languageCode,
      },
    },
  };
  console.log("request test ============", request)

let _result;
  // Send request and log result
return  sessionClient
    .detectIntent(request)
    .then((responses) => {
      // console log check in to see if request received and being processed
      console.log('Detected intent');
      const result = responses[0].queryResult;
      console.log(`  Query: ${result.queryText}`);
      console.log(`  Response: ${result.fulfillmentText}`);
      console.log(`     DATE: ${(result.parameters.fields.date.stringValue)}`);
      console.log(`     SUBJECT: ${(result.parameters.fields.subject.stringValue)}`);
      // console.log(`     INVITEES: ${(result.parameters.fields.invitees.listValue.values)}`);

      TIMEFOREVENT = result.parameters.fields.date.stringValue;


      if (result.intent) {
        console.log(`  Intent: ${result.intent.displayName}`);

        if (result.intent.displayName === 'reminder') {

          // start and end dates for same day events (Formatting to date only)
          var startDate = new Date(result.parameters.fields.date.stringValue)
          var endDate = new Date();
          endDate.setDate(startDate.getDate() + 1);

          return resultObject = {
            /////// to be sent to check in with user
            eventSend: {confirmation: result.fulfillmentText},
            /////// info for the calendar
            confirmedMessage: {
              start:{
                date: startDate.toLocaleDateString(),
              },
              end : {
                date: endDate.toLocaleDateString(),
              },
              summary: result.parameters.fields.subject.stringValue,
            }
          }
        } else if(result.intent.displayName === 'meeting:add') {

          // start and end times for meetings
          const startTime = new Date(result.parameters.fields.time.listValue.values[0].stringValue);
          var endTime = new Date(result.parameters.fields.time.listValue.values[0].stringValue);
          endTime.setMinutes(startTime.getMinutes() + 30);

          // Getting attendee names from slackbot
          let attNames = result.parameters.fields.invitees.listValue.values.map(item => item.stringValue);

          // Getting list of users in the slack team
          return axios('https://slack.com/api/users.list', {
            'headers' :{
              'Content-type': 'application/json',
              'Authorization': 'Bearer '+process.env.SLACKBOT_TOKEN
            }
          })
          .then(response => {

            // Gets people who's name matches the given names
            let attPeople = attNames.map(
              name => response.data.members.filter(
                item => (item.real_name.indexOf(name) !== -1) ||
                 (item.profile.display_name.indexOf(name) !== -1)));

            // Separates email and display name
            let attendees = attPeople.map(item => {
              return {'email': item[0].profile.email, 'displayName': item[0].profile.display_name}});

            // Collecting IDs incase confirmation is needed
            INVITEEIDS = attPeople.map(item => item[0].id)

            return {
              /////// to be sent to check in with user
              eventSend: {confirmation: result.fulfillmentText},
              /////// info for the calendar
              confirmedMessage: {
                start:{
                  dateTime: result.parameters.fields.time.listValue.values[0].stringValue,
                },
                end : {
                  dateTime: endTime,
                },
                summary: result.parameters.fields.subject.stringValue,
                'attendees': attendees,
                'sendNotifications': true,
              }
            }
          })
          .catch(err => console.log('The Get Request returned and err -', err));

        }

      } else {
        console.log(`  No intent matched.`);
      }
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
}

// ---------------------------- Routes for communcation --------------------------------------------
app.post('/oauth', (req, res) => {
  const payload = JSON.parse(req.body.payload);

  // If User Says to confirm event request
  if (payload.actions[0].name === 'response' && payload.actions[0].value === "true") {

    // Sending Data to Google Calendar -------------------------------------

    fs.readFile("credentials.json", (err, content) => {  // Load client secrets from a local file.
      if (err) return console.log("Error loading client secret file:", err);
      // Authorize a client with credentials, then call the Google Calendar API.
      if (EVENTTOCREATE.start.dateTime) authorize(JSON.parse(content), combined); // If a meeting
      else if (EVENTTOCREATE.start.date) authorize(JSON.parse(content), createEvent); // If a reminder

    });

    // End of sending data to google calendar -------------------------------

    if (ERROR) res.send('Sorry I could not schedule that, please try again in a moment');
    else if (!FURTHERACTION) res.send('Scheduled!')

  // For When Confirming with invitees
  } else if (payload.actions[0].name === 'response' && payload.actions[0].value === "ask") {

    // Getting the channel id of invitees
    axios('https://slack.com/api/im.list', {
        'headers' :{
        'Content-type': 'application/json',
        'Authorization': 'Bearer '+process.env.SLACKBOT_TOKEN
      }
    })
    .then(response => {
      let imIDs = INVITEEIDS.map(item => response.data.ims.filter(im => im.user === item));

      // Send Message to each person
      imIDs.forEach(item => {
        web.chat.postMessage({
           channel: message.channel,
           text: `You have been invited to a meeting at ${EVENTTOCREATE.start.dateTime}, Are you available?`,
           attachments: [
               {
                   "fallback": "You are unable to confirm",
                   "callback_id": "wopr_game",
                   "color": "#3AA3E3",
                   "attachment_type": "default",
                   "actions": [
                       {
                           "name": "invite_response",
                           "text": "Yes",
                           "type": "button",
                           "value": "true",
                           "style": "primary",
                       },
                       {
                           "name": "invite_response",
                           "text": "No",
                           "type": "button",
                           "value": "false",
                           "style": "danger",
                       }
                   ]
               }
           ]
       });
     });

    });

  // When a confirmation gets a no response
  } else if (payload.actions[0].name === 'invite_response' && payload.actions[0].value  === "false") {

    console.log(payload.user);
  // For time conflicts
  } else if (payload.actions[0].name === 'available_times' && payload.actions[0].selected_options[0].value) {

    // Set Event to new start and end time
    EVENTTOCREATE.start.dateTime = AVAILABLETIMES[parseInt(payload.actions[0].selected_options[0].value)]
    let endTime = new Date(AVAILABLETIMES[parseInt(payload.actions[0].selected_options[0].value)]);
    endTime.setMinutes(endTime.getMinutes() + 30);
    EVENTTOCREATE.end.dateTime = endTime;

    fs.readFile("credentials.json", (err, content) => {  // Load client secrets from a local file.
      if (err) return console.log("Error loading client secret file:", err);

      // Authorize a client with credentials, then call the Google Calendar API.
      authorize(JSON.parse(content), createEvent);

    });

    if (ERROR) res.send('Sorry I could not set that meeting up, please try again');
    else res.send('Meeting Scheduled');

  }  else {
    res.send('Canceled')
  }
})

app.listen(1337);
// userRequest("schedule a meeting with nick at 3pm tomorrow to talk about coding");
