/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

var fs = require('fs'),
    url = require('url'),
    querystring = require('querystring'),
    sys = require('sys'),
    request = require('request'),
    lfs = require('../../Common/node/lfs.js'),
    locker = require('../../Common/node/locker.js'),
    sync = require('./sync');

var app, auth;

// Add the basic / head ups (or forward to /auth if needed)
module.exports = function(theApp) {
    app = theApp;
    
    app.get('/', function (req, res) {
        if(!(auth && auth.username && auth.password)) {
            res.redirect(app.meData.uri + 'auth');
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end("<html>great! now you can:<br><li><a href='sync/shared'>sync shared items</a></li>" + 
                                                 "<li><a href='sync/starred'>sync starred items</a></li>" + 
                                                 "<li><a href='sync/notes'>sync notes</a></li>" +
												 "<li><a href='sync/tags'>sync tags</a></li>" + 
												 "<li><a href='sync/subscriptions'>sync subscriptions</a></li>");
        }
    });
    this.authComplete = authComplete;
    return this;
}

// Adds all of the sync API endpoints once the auth process is completed
function authComplete(theAuth, mongoCollections) {
    auth = theAuth;
    sync.init(auth, mongoCollections);

    // Sync the person's friend data
    app.get('/sync/:type', function(req, res) {
        var type = req.params.type.toLowerCase();
        if (type === 'shared') {
            shared(type, res);
		}
        else if (type === 'starred') {
            starred(type, res);                
        }
		else if (type === 'notes') {
			notes(type, res);
		}
		else if (type === 'tags') {
			tags(type, res);
		}
		else if (type === 'subscriptions') {
			subscriptions(type, res);
		}
    });

	function syncCallback(err, res, type, repeatAfter, diaryEntry) {
        if (err) {
            console.error(err);
			res.writeHead(500, {'content-type':'application/json'});
			res.end(JSON.stringify({error:'error fetching ' + type + ': ' + err}));
        } else {
            locker.diary(diaryEntry);
            locker.at('/sync/' + type, repeatAfter);
			res.writeHead(200, {'content-type':'application/json'});
            res.end(JSON.stringify({success:"done fetching " + type}));
        }
    };

    // Sync the shared items
    function shared(type, res) {
        sync.syncShared(function(err, type, repeatAfter, diaryEntry) {
			syncCallback(err, res, type, repeatAfter, diaryEntry);
		});
    }

	// Sync the shared items
    function starred(type, res) {
        sync.syncStarred(function(err, type, repeatAfter, diaryEntry) {
			syncCallback(err, res, type, repeatAfter, diaryEntry);
		});
    }

	// Sync notes
	function notes(type, res) {
        sync.syncNotes(function(err, type, repeatAfter, diaryEntry) {
			syncCallback(err, res, type, repeatAfter, diaryEntry);
		});
    }

	// Sync tags
	function tags(type, res) {
        sync.syncTags(function(err, type, repeatAfter, diaryEntry) {
			syncCallback(err, res, type, repeatAfter, diaryEntry);
		});
    }
	
	// Sync subscriptions
	function subscriptions(type, res) {
        sync.syncSubscriptions(function(err, type, repeatAfter, diaryEntry) {
			syncCallback(err, res, type, repeatAfter, diaryEntry);
		});
    }
    
    sync.eventEmitter.on('link/googlereader', function(eventObj) {
        locker.event('link/googlereader', eventObj);
    });

	sync.eventEmitter.on('tag/googlereader', function(eventObj) {
        locker.event('tag/googlereader', eventObj);
    });
}