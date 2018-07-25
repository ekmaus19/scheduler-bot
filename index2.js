const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');

// If modifying these scopes, delete credentials.json.
const SCOPES = ["https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.readonly",
    "https://www.googleapis.com/auth/plus.login"];
const TOKEN_PATH = "token.json";
let AUTH = '';

// Load client secrets from a local file.
fs.readFile("credentials.json", (err, content) => {
  if (err) return console.log("Error loading client secret file:", err);
  // Authorize a client with credentials, then call the Google Calendar API.
  authorize(JSON.parse(content));
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials) {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client);
    oAuth2Client.setCredentials(JSON.parse(token));
    AUTH = oAuth2Client;
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getAccessToken(oAuth2Client) {
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
      if (err) return console.log(err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      AUTH = oAuth2Client;
    });
  });
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
function listEvents(auth) {
  const events = []
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
        events.push(event);
      });
      console.log("Upcoming 10 events:", events);
    } else {
      console.log("No upcoming events found.");
    }
  });
}

// Create an Event
// Event must contain keys => calendarId, start, end
// Start and end must be days for all day event
function createEvent(auth, event) {
  const calendar = google.calendar({version: 'v3', auth});
  calendar.events.insert(event, (err, event) => {
    if (err) return console.log('The API returned an error: ' + err)
    else console.log('Event Created:', event.summary);
  });
}

// List Available Times for the next 7 days
function listAvailable(auth) {
  const endDate = new Date()
  const times = [];
  const calendar = google.calendar({version: 'v3', auth});
  let additionalDay = 0;
  while (additionalDay < 8 && times.length < 11) { // Max 7 Business days & max 10 times
    calendar.events.list({
      calendarId: "primary",
      timeMin: endDate.setDate(endDate.getDate() + additionalDay).toISOString(),
      timeMax: endDate.setDate(endDate.getDate() + additionalDay).toISOString(),
      maxResults: 3, // Max 3 Time Per Day
      singleEvents: true,
      orderBy: "startTime",
    }, (err, res) => {
      if (err) return console.log("The API returned an error: " + err);
      const events = res.data.items;
      if (events.length) {
        console.log('Available Times')
        events.map((event) => {
          const end = event.end.dateTime || event.end.date;
          times.push(event);
          console.log(`${end}`);
        });
      } else {
        console.log("No upcoming events found.");
      }
    });
  }

}

listEvents(AUTH)
