const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const dialogflow = require('dialogflow');
const express = require('express');
const path = require('path');
const app = express();

app.use(express.static(path.join(__dirname, 'build')));


// If modifying these scopes, delete credentials.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar',
'https://www.googleapis.com/auth/calendar.readonly',
'https://www.googleapis.com/auth/plus.login'];
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Google Calendar API.
  authorize(JSON.parse(content), listEvents);
});

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
    access_type: 'offline',
    scope: SCOPES,
  });
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
  const calendar = google.calendar({version: 'v3', auth});
  calendar.events.list({
    calendarId: 'primary',
    timeMin: (new Date()).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  }, (err, res) => {
    if (err) return console.log('The API returned an error: ' + err);
    const events = res.data.items;
    if (events.length) {
      console.log('Upcoming 10 events:');
      events.map((event, i) => {
        const start = event.start.dateTime || event.start.date;
        console.log(`${start} - ${event.summary}`);
      });
    } else {
      console.log('No upcoming events found.');
    }
  });
}

///// NLP start ///////////

/// Google Auth
// Imports the Google Cloud client library.
const Storage = require('@google-cloud/storage');

// Instantiates a client. If you don't specify credentials when constructing
// the client, the client library will look for credentials in the
// environment.
const storage = new Storage();

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

      // start and end dates for same day events
      var startDate = new Date(result.parameters.fields.date.stringValue)
      var endDate = new Date(startDate.setDate(startDate.getDate() + 1))


      if (result.intent) {
        console.log(`  Intent: ${result.intent.displayName}`);
        return resultObject = {
          /////// to be sent to check in with user
          eventSend: {confirmation: result.fulfillmentText},
          /////// info for the calendar
          confirmedMessage: {
            start:{
              date: result.parameters.fields.date.stringValue
            },
            end: {
              date:endDate,
            },
            description: result.parameters.fields.subject.stringValue,
            calendarId: "primary"
          }
        }

      } else {
        console.log(`  No intent matched.`);
      }
    })
    .catch(err => {
      console.error('ERROR:', err);
    });
}

const slack = require('@slack/client')
const RTMClient = slack.RTMClient
const WebClient = slack.WebClient
const token = 'xoxb-402681346384-403536981733-kqaM0ezYN5OdLCXv1T8h6wlU'
const web = new WebClient(token)
const rtm = new RTMClient(token)
rtm.start()

let answer;
rtm.on('message', (message) => {
  if ( (message.subtype && message.subtype === 'bot_message') ||
     (!message.subtype && message.user === rtm.activeUserId) ) {
       return;
     }

  userRequest(message.text)
    .then(answer => { web.chat.postMessage({
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
    })})
    .then(() => console.log('Message sent to channel'))
    .catch(console.error)
})
// app.post('/oauth', (req, res) => {
//   if (req.payload.actions[0].value === true){
//     console.log('heyyyy it worked!')
//     // T runs the google calendar stuff here
//     res.send({message: 'scheduled!'})
//   } else {
//     res.send({message: 'canceled scheuling'})
//   }
// })


userRequest("schedule a meeting with nick at 3pm tomorrow to talk about coding")
