/*
*
* Copyright (C) 2011, The Locker Project
* All rights reserved.
*
* Please see the LICENSE file for more information.
*
*/

/*
*
* Handles all sync logic of data from Google Reader
* 
*/

var request = require('request'),
	https = require('https'),
	http = require('http'),
    fs = require('fs'),
    locker = require('../../Common/node/locker.js'),
    lfs = require('../../Common/node/lfs.js'),
    EventEmitter = require('events').EventEmitter,
    dataStore = require('../../Common/node/connector/dataStore');
    
var auth, token;

var allKnownIDs;

var streamPaths = {
	'shared' : '/reader/api/0/stream/contents/user/-/state/com.google/broadcast',
	'starred' : '/reader/api/0/stream/contents/user/-/state/com.google/starred',
	'notes' : '/reader/api/0/stream/contents/user/-/state/com.google/created'
};

var listPaths = {
	'tags' : '/reader/api/0/tag/list',
	'subscriptions' : '/reader/api/0/subscription/list'
};

exports.eventEmitter = new EventEmitter();

// Initialize the state
exports.init = function(theAuth, mongoCollections) {
    auth = theAuth;
    try {
        allKnownIDs = JSON.parse(fs.readFileSync('allKnownIDs.json'));
    }
    catch (err) {
        allKnownIDs = {notes:{}, shared:{}, subscriptions:{}, starred:{}, tags:{}};
    }
    dataStore.init('id', mongoCollections);
};

exports.syncAll = function(callback) {
	exports.syncShared(callback);
	exports.syncStarred(callback);
	exports.syncNotes(callback);
	exports.syncSubscriptions(callback);
	exports.syncTags(callback);
};

exports.syncShared = function(callback) {
	syncStream('shared', callback);
};

exports.syncStarred = function(callback) {
	syncStream('starred', callback);
};

exports.syncNotes = function(callback) {
	syncStream('notes', callback);
};

exports.syncSubscriptions = function(callback) {
	syncList('subscriptions', callback);
};

exports.syncTags = function(callback) {
	syncList('tags', callback);
};

function syncList(type, cursor, callback) {
	var path = listPaths[type] + '?ck=' + now() + '&client=settings&output=json';
	
	if (arguments.length == 2) {
		callback = cursor;
		cursor = {};
	}
	else if (cursor) {
		path = path + '&c=' + cursor.continuation;
	}
	
	//console.log('GET ' + path);
	httpGET(path, type + '_cache.json', JSON.parse, function(err, result) {
		if (err) {
			callback(err);
		}
		else {
			var dataStoreErr;
			var list = result[type];
			var knownIDs = allKnownIDs[type];
			var newItems = [];
			
			for (var i = 0; i < list.length; ++i) {
				var item = list[i];
				if (!knownIDs[item.id]) {
					newItems.push(item);
					knownIDs[item.id] = 1;
				}
			}
			
			if (newItems.length > 0) {
				newItems.forEach(function(item){
					dataStore.addObject(type, item, function(err) {
						dataStoreErr = err;
						if (!err) {
							/*var eventObj = {
								source:type, 
								type:'new', 
			                    data:{url:stream.items[i].alternate[0].href, sourceObject:stream.items[i]}
							};

			                exports.eventEmitter.emit('link/googlereader', eventObj);*/
						}
					});
				});
			}

			if (dataStoreErr) {
				callback(dataStoreErr);
				return;
			}
			
			fs.writeFile('allKnownIDs.json', JSON.stringify(allKnownIDs));
			
			// More items to fetch?  I don't know for sure if the lists used in the settings page support continuation.
			if (list.continuation) {
				if (!cursor.count) {
					cursor.count = newItems.length;
				}
				else {
					cursor.count += newItems.length;
				}
				cursor.continuation = list.continuation;
				
				syncList(type, cursor, callback);
			}
			else {
				if (!cursor.count) {
					cursor.count = newItems.length;
				}
				else {
					cursor.count += newItems.length;
				}
				cursor.continuation = null;
				
				callback(null, type, 1200, "synced " + cursor.count + " " + type);
			}
		}
	});
}

function syncStream(type, cursor, callback) {
	var path = streamPaths[type] + '?ck=' + now() + '&client=scroll&n=40';
	
	if (arguments.length == 2) {
		callback = cursor;
		cursor = {};
	}
	else if (cursor) {
		path = path + '&c=' + cursor.continuation;
	}
	
	//console.log('GET ' + path);
	httpGET(path, type + '_cache.json', JSON.parse, function(err, stream) {
		if (err) {
			callback(err);
		}
		else {
			var dataStoreErr;
			var knownIDs = allKnownIDs[type];
			var newItems = [];
			
			stream.items.forEach(function(item) {
				if (!knownIDs[item.id]) {
					newItems.push(item);
					knownIDs[item.id] = 1;
				}
			});
			
			if (newItems.length > 0) {
				newItems.forEach(function(item) {
					dataStore.addObject(type, item, function(err) {
						dataStoreErr = err;
						/*if (!err) {
							var eventObj = {
								source:type, 
								type:'new', 
			                    data:{url:stream.items[i].alternate[0].href, sourceObject:stream.items[i]}
							};

			                exports.eventEmitter.emit('link/googlereader', eventObj);
						}*/
					});
				});
			}

			if (dataStoreErr) {
				callback(dataStoreErr);
				return;
			}
			
			fs.writeFile('allKnownIDs.json', JSON.stringify(allKnownIDs));
			
			// More items to fetch...
			if (stream.continuation) {
				if (!cursor.count) {
					cursor.count = newItems.length;
				}
				else {
					cursor.count += newItems.length;
				}
				cursor.continuation = stream.continuation;
				
				syncStream(type, cursor, callback);
			}
			else {
				if (!cursor.count) {
					cursor.count = newItems.length;
				}
				else {
					cursor.count += newItems.length;
				}
				cursor.continuation = null;
				
				callback(null, type, 1200, "synced " + cursor.count + " items from the " + type + " stream");
			}
		}
	});
}

function now() {
    return new Date().getTime();
}

function httpGET(path, cachefile, transform, callback) {
	if (arguments.length == 3) callback = transform;
	if (!token) {
		getGoogleAuth(function(err, gauth) {
			if (err) {
				callback(err);
			}
			else {
				token = gauth;
				httpGET(path, cachefile, transform, callback);
			}
		});
	}
	else {
		var headers = {
			Host: 'www.google.com',
			Authorization: 'GoogleLogin auth=' + token
		};
		
		var options = {
			host: 'www.google.com',
			port: 80,
		  	path: path,
		  	method: 'GET',
			headers: headers
		};
		
		var ws;
		if (cachefile) {
			// Clear cache
			try {
				fs.unlinkSync(cachefile);
			}
			catch (err) { }

			// Create new appending write stream
			ws = fs.createWriteStream(cachefile, { flags: 'a'});
		}
		
		var data = '';
		var req = http.request(options, function(res) {
			//console.log('STATUS: ' + res.statusCode);
			//console.log('HEADERS: ' + JSON.stringify(res.headers));
			
			if (res.statusCode != 200) {
				callback('server responded with status code ' + res.statusCode);
				return;
			}
			
			res.setEncoding('utf8');
			
			res.on('data', function (chunk) {
				if (ws) {
					ws.write(chunk);
				}
				else {
					data = data + chunk;
				}
			});
			
			res.on('end', function () {
				if (ws) {
					ws.on('close', function() {
						var toCaller = fs.readFileSync(cachefile);
						if (transform) {
							toCaller = transform(toCaller);
						}
						
						callback(null, toCaller);
					});
					
					ws.end();
					ws.destroySoon();
				}
				else {
					var toCaller = data;
					if (transform) {
						toCaller = transform(data);
					}
					
					callback(null, toCaller);
				}
			});
		});
	
		req.end();
	}
}

function getGoogleAuth(callback) {
	var loginPath = "/accounts/ClientLogin?service=reader&Email=" + auth.username + "&Passwd=" + auth.password;
	
	var options = {
		host: 'www.google.com',
		port: 443,
	  	path: loginPath,
	  	method: 'GET'
	};

	var req = https.request(options, function(res) {
		//console.log('STATUS: ' + res.statusCode);
		//console.log('HEADERS: ' + JSON.stringify(res.headers));
		
		if (res.statusCode != 200) {
			callback('unable to get SID, server responded with status code ' + res.statusCode);
			return;
		}
		
		res.setEncoding('utf8');
		res.on('data', function (chunk) {
			var authFound = false;
			tokens = chunk.toString().split('\n');
			if (tokens && tokens.length > 0) {
				for (var i = 0; i < tokens.length; ++i) {
					if (tokens[i].substring(0, 'Auth'.length) === 'Auth') {
						var parts = tokens[i].split('=');
						//console.log("Got Google Auth!!! [" + parts[1] + "]");
						callback(null, parts[1]);
						authFound = true;
						break;
					}
				}
			}
			
			if (!authFound) {
				console.log('unable to find Google Auth in response: ' + chunk);
				callback('unable to find Google Auth in response');
			}
		});
	});
	
	req.end();
}