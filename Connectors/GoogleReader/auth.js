/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fs = require("fs");

var uri,
    url = require('url'),
    completedCallback = null;

exports.auth = {};

// Check if exports.auth contains the required properties (consumerKey, consumerSecret, and token)
// if not, read it from disk and try again
function isAuthed() {
    try {
        if(!exports.hasOwnProperty("auth"))
            exports.auth = {};
        
        // Already have the stuff read
        if(exports.auth.hasOwnProperty("username") && exports.auth.hasOwnProperty("password")) {
            return true;
        }

        // Try and read it in
        var authData = JSON.parse(fs.readFileSync("auth.json"));
        if(authData.hasOwnProperty("username") && 
           authData.hasOwnProperty("password")) {
            exports.auth = authData;
            return true;
        }
    } catch (E) {
        // TODO:  Could actually check the error type here
		console.error(E);
    }
    return false;
}

exports.isAuthed = isAuthed;

// The required exported function
// Checks if there is a valid auth, callback immediately (and synchronously) if there is
// If there isn't, adds /auth and /saveAuth endpoint to the app
exports.authAndRun = function(app, externalUrl, onCompletedCallback) {
    if (isAuthed()) {
        onCompletedCallback();
        return;
    }
    
    // not auth'd yet, save the app's uri and the function to call back to later
    uri = externalUrl;
    completedCallback = onCompletedCallback;
    app.get("/auth", handleAuth);
    app.get("/saveAuth", saveAuth);
}

function handleAuth(req, res) {
    if(!exports.auth)
        exports.auth = {};
        
    if(!(exports.auth.hasOwnProperty("username") && 
         exports.auth.hasOwnProperty("password"))) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end("<html>Enter your Google account info that will be used to sync your data" +
                "<form method='get' action='saveAuth'>" +
                    "Username: <input name='username'><br>" +
                    "Password: <input name='password' type='password'><br>" +
                    "<input type='submit' value='Save'>" +
                "</form></html>");
    } else {
        completedCallback();
    }
}

// Save the username and password
function saveAuth(req, res) {
    if(!req.param('username') || !req.param('password')) {
        res.writeHead(400);
        res.end("missing field(s)?");
    } else {
        // res.writeHead(200, {'Content-Type': 'text/html'});
        exports.auth.username = req.param('username');
        exports.auth.password = req.param('password');
        fs.writeFileSync('auth.json', JSON.stringify(exports.auth));
		res.redirect(uri + 'auth');
        // res.end("<html>thanks, now we need to <a href='./auth'>auth that app to your account</a>.</html>");
    }
}
