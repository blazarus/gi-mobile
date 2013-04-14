var express = require('express'),
	_ = require('underscore'),
	request = require('request'),
	path = require('path'),
	fs = require('fs'),
	EventEmitter = require('events').EventEmitter,
	app = express(),
	http = require('http'),
	server = http.createServer(app),
	models = require('./models'),
	io = require('socket.io').listen(server);

// var mongoose = require('mongoose');
// mongoose.connect('mongodb://localhost/gi_companion');

// alias console.log
var clog = console.log;

var Location = models.Location,
	Group    = models.Group,
	Project  = models.Project,
	User     = models.User,
	Message  = models.Message;

var eventEmitter = new EventEmitter();

app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.cookieParser('\n\x0c\x86~E\\\xfe\xe1\xc5m\xd1#\x90\xfaQD\x1d\xc6]=\xf5\rd\xa1'));
app.use(express.session());
app.use('/templates', express.static(path.join(__dirname, 'templates')));
app.use(express.static(path.join(__dirname, 'static')));

app.post('/login', function (req, res) {
	clog("The request form:", req.body);
	if (req.body.webcode) {
		request.get("http://data.media.mit.edu/spm/contacts/json?web_code=" + req.body.webcode, function (err, response, body) {
			var jsono;
			if (!err && (jsono = JSON.parse(body)) && jsono.username && !jsono.error) {
				// Either get this username from the DB, or add to DB, then set the session
				User.findOneAndUpdate({ username: jsono.username }, { username: jsono.username }, { upsert: true }, function (err, theUser) {
					if (err) {
						clog("Error creating or getting from DB user:", jsono.username);
						return res.json({ status: "error", msg:"Something went wrong"});
					}

					clog("Got user from DB:", theUser);
					req.session.user = theUser;
					res.json({ status: 'ok', user: req.session.user });
				});
			} else {
				res.json({ status: 'error', 'msg': 'Could not validate webcode'});
			}
		});
	} else if (req.body.username) {
		validateUsername(req.body.username, function (theUser) {
			req.session.user = theUser;
			res.json({ status: 'ok', user: req.session.user });
		}, function () {
			res.json({ status: 'error', 'msg': 'Could not validate username'});
		});
	} else {
		res.json({ status: 'error', msg: 'Need to submit either a webcode or username'});
	}

});


app.get('/logout', function (req, res) {
	req.session.destroy();
	clog("logging out user");
	res.redirect('/login');
});

app.get('/checkuser', function (req, res) {
	var uname = req.param('username').toLowerCase().trim();
	clog("checking username:", uname);
	if (uname) {
		validateUsername(uname, function (theUser) {
			res.json({ status: 'ok', username: theUser.username });
		}, function () {
			res.json({ status: 'error', 'msg': 'Could not validate username'});
		});
	} else {
		res.json({ status: 'error', 'msg': 'No username provided'});
	}

});

app.get('/user/:id', function (req, res) {
	clog("Getting user with id:", req.params.id);
	User.findOne({ _id: req.params.id }, function (err, user) {
		if (err) {
			clog("Error retrieving user:", err);
			return res.json({status: 'error', msg: err });
		}
		clog("Retrieved user:", user);
		res.json({ status: 'ok', user: user });
	});
});

var validateUsername = function (uname, success, failure) {
	// Check with ML if username is valid
	// Also cache in DB
	// Calls success with the User object from the DB
	uname = uname.toLowerCase().trim();
	clog("Validating username:", uname);
	User.findOne({ username: uname }, function (err, user) {
		if (!user) {
			// Not in DB, so check data.media.mit.edu
			clog("User not in DB, so checking data.media.mit.edu for", uname);
			request.get('http://data.media.mit.edu/spm/contacts/json?username='+uname, function (err, response, body) {
				var jsono;
				if (!err && (jsono = JSON.parse(body)) && jsono.profile && !jsono.error) {
					// Valid user, so cache in DB
					var newUser = new User({ username: uname });
					newUser.save(function (err, savedUser) {
						if (err) {
							clog("Error saving ", uname, "in DB:", err);
							failure();
						}
						else clog("Saved user in DB:", newUser);

						success(savedUser);
					});
				} else {
					failure();
				}
			});
		} else {
			// User already in DB, no need to check data.media.mit.edu
			clog("Found user in DB:", user);
			success(user);
		}
	});
	
};

var validateUserList = function (usernames, success, failure) {
	// Return success only if all usernames are validated
	// usernames -> array of Strings
	// calls success callback with array of User objects from DB as param
	clog("Checking user list:", usernames);
	var users = [];
	var successCallback = function () {
		clog("All users valid");
		success(users);
		eventEmitter.removeListener('users validated', successCallback);
	};
	var failureCallback = function (username) {
		// username: the invalid username
		clog("Invalide user with username:", username);
		failure();
		eventEmitter.removeListener('users not valid', failureCallback);
	};
	eventEmitter.on('users validated', successCallback);
	eventEmitter.on('user not valid', failureCallback);

	var count = 0
	for (var i=0, uname; uname = usernames[i]; i++) {
		(function (uname) {
			validateUsername(uname, function (userObj) {
				users.push(userObj);
				if (++count >= usernames.length) {
					clog("Enough users valid, emit event");
					eventEmitter.emit('users validated');
				}
			}, function () {
				eventEmitter.emit('user not valid', uname);
			});
		})(uname); // seal in value for uname
	}
}

app.get('/checklogin', function (req, res) {
	clog("checking login");
	if (req.session.user) {
		clog("User already logged in");
		res.json({status: 'ok', user: req.session.user });
	} else {
		clog("User not logged in");
		res.json({status: 'no_login'});
	}
});

app.post('/messages/create', function (req, res) {
	clog("got here", req.body);
	
	Location.findOne({ name: req.body.loc }, function (err, theLoc) {
		var sender = req.session.user;
		
		var to = req.body['send-to'];
		var usersToCheck = [to];

		validateUserList(usersToCheck, function (toList) {
			// Users validated, now create the message
			clog("List of validated user objects:", toList);
			clog("Sender:", sender, new User({ username: 'blazarus' }));
			var msg = new Message({
				subject: req.body.subject,
				body: req.body.body,
				to: toList,
				sender: sender._id,
				triggerLocs: theLoc
			});
			msg.save(function (err, savedMsg) {
				if (err) {
					clog("Error inserting message into DB:", err);
					return res.json({ status: "error", msg: "Something went wrong" });
				}
				clog("Successfully inserted msg into DB:", savedMsg);
				eventEmitter.emit("newMsg", savedMsg);
				res.json({ status: "ok" });
			});
		}, function () {
			// validating users failed, send error response
			res.json({status: "error", msg: "Not valid user"});
		});
	});
	
});

app.get('/locations/all', function (req, res) {
	Location.find().exec( function (err, locs) {
		if (err) {
			clog("Error getting locations:", err);
			return res.json({ status: 'error', msg: err });
		}
		clog("Locations:", locs);
		res.json({status: 'ok', locs: locs });
	});
});

// var filterMessagesRead = function (msgs, req) {
// 	return filterMessages(false, msgs, req);
// };
// var filterMessagesUnread = function (msgs, req) {
// 	return filterMessages(true, msgs, req);
// };
// var filterMessages = function (unread, msgs, req) {
// 	// unread -> a boolean. If true, filter for unread, if false get read msgs
// 	clog("Filtering messages. Creatign read message id hash for:", req.session.user.username);
// 	var readMsgHash = {}; //hash of the id's of read msgs
// 	for (var i=0, readmsg; readmsg=req.session.user.readMessages[i]; i++) {
// 		var id = readmsg.message; // pull out the actual message
// 		clog("id:", id);
// 		readMsgHash[id] = true;
// 	}
// 	clog("readMsgHash:", readMsgHash);
// 	var filtered = _.filter(msgs, function (elem) {
// 		if (unread) {
// 			// Keep the messages that ARE NOT read
// 			return !(elem._id in readMsgHash);
// 		} else {
// 			// Keep the messages that ARE read
// 			return elem._id in readMsgHash;
// 		}
// 	});
// 	clog("Got messages for", req.session.user.username, filtered.length);
// 	return filtered;
// };

app.get('/messages/read/:skip?/:limit?', function (req, res) {
	clog("Getting read/old messages for user");
	var readMsgIds = _.pluck(req.session.user.readMessages, 'message');
	Message
		.find({to: req.session.user._id })
		.where('_id').in(readMsgIds)
		.sort('-createdAt')
		.skip(req.params.skip ? req.params.skip : 0)
		.limit(req.params.limit ? req.params.limit : "")
		.populate('triggerLocs')
		.exec(function (err, msgs) {
			if (err) {
				clog("Error while retrieving read messages:", err);
				return res.json({ status: 'error', msg: err });
			}
			// msgs = filterMessagesRead(msgs, req);
			res.json({status: 'ok', messages: msgs, total: req.session.user.readMessages.length });
		});
});

app.get('/messages/unread/:skip?/:limit?', function (req, res) {
	clog("Getting new/unread messages for user");
	var readMsgIds = _.pluck(req.session.user.readMessages, 'message');
	Message
		.find({to: req.session.user._id })
		.where('_id').nin(readMsgIds)
		.sort('-createdAt')
		.skip(req.params.skip ? req.params.skip : 0)
		.limit(req.params.limit ? req.params.limit : "")
		.populate('triggerLocs')
		.exec(function (err, msgs) {
			if (err) {
				clog("Error while retrieving unread messages:", err);
				return res.json({ status: 'error', msg: err });
			}
			// msgs = filterMessagesUnread(msgs, req);
			res.json({status: 'ok', 'messages': msgs });
		});
});

app.post('/messages/read/:id', function (req, res) {
	clog("Message being marked as read:", req.params.id, req.session.user.username, req.session.user.readMessages.length);
	User.findOne({ username: req.session.user.username }, function (err, user) {
		if (err) return clog("Error retrieving logged in User from DB:", err);
		Message.findOne({ _id: req.params.id }, function (err, msg) {
			if (err) return clog("Error finding message", msg);
			user.readMessages.push({
				message: msg,
				readAt: new Date()
			});

			user.save(function (err) {
				if (err) {
					clog("Error saving user:", err);
					return res.json({ status: 'error', msg: err });
				}
				req.session.user = user;
				clog("Successfully updated read messages:", req.session.user.readMessages.length);
				res.json({ status: 'ok' });
			});
		});
	});
});

app.get('/locations/:screenid/groups', function (req, res) {
	var screenid = req.params.screenid.trim();
	clog("Checking groups for screenid:", screenid);
	Location.findOne({ screenid: screenid }).populate('groups').exec(function (err, location) {
		if (err) return clog("Error getting location:", err);

		clog("Location found in DB:", location);
		if (location.groups && location.groups.length != 0) {
			// Have the groups cached in DB, return those
			res.json({ status: 'ok', groups: location.groups });
			// update the cache after sending the response
			updateGroups(location);
		} else {
			// Need to look up the groups
			updateGroups(location);
		}
	});

var updateGroups = function (location) {
	location.groups = [];

	var url = "http://tagnet.media.mit.edu/groups?screenid="+screenid;
	clog("Checking tagnet for groups");
	request.get(url, function (err, response, body) {
		if (err)  return clog("Got error checking groups:", err);
		else if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);

		// clog("Got response:", body);
		body = JSON.parse(body);
		var count = 0, target = body.groups.length;

		var updateLoc = function (grp) {
			location.groups.push(grp);
			if (++count >= target) {
				// Only save once all of the groups have been added
				location.save(function (err) {
					if (err) return clog("Error saving Location:", err);
					clog("Successfully updated location to include group", location);
				});
			}
		}

		for (var i=0,group; group=body.groups[i]; i++) {
			(function (group) {
				clog("Group:", group.id, group.name);
				Group.findOne({ groupid: group.id, name: group.name }, function (err, grp) {
					if (err) return clog("Error trying to find group in DB:", err);
					if (!grp) {
						// Need to create group
						clog("Group was null, so create it..");
						grp = new Group({
							groupid: group.id,
							name: group.name
						});
						grp.save(function (err) {
							clog(grp);
							updateLoc(grp);
						});
					} else {
						// Group saved, but need to add it to location
						clog("Found group in DB:", grp);
						updateLoc(grp);
					}
					
				});
			})(group); // Seal in value for group
		}
	});
};
	
	

	// http://tagnet.media.mit.edu/get_projects_by_group?groupid=2129

	// var url = "http://tagnet.media.mit.edu/get_project_info?projectid="+3489;

	// request.get(url, function(err, response, body) {
	// 	if (err) clog("Got error checking project info:", err);
	// 	else if (response.statusCode != "200") clog("Bad response code:", response.statusCode);
	// 	else {
	// 		clog("Got response from checking project info:", body);
	// 	}
	// });
});

app.get('/dummyloc', function (req, res) {
	res.sendfile(__dirname + '/templates/dummy_location.html');
});

app.post('/dummyloc/update', function (req, res) {
	if ('session' in req) {
		req.session.dummyLoc = req.param('loc');
		res.json({status: 'ok'});
	} else res.json({status: 'error'});
});

app.get('/dummyloc/getloc', function (req, res) {
	if ('session' in req) {
		res.json({status: 'ok', loc: req.session.dummyLoc });
	}
});

app.get('/*', function(req, res){
	res.sendfile(__dirname + '/index.html');
});
// app.get('/templates/:tmpl', function (req, res) {
// 	var tmpl = req.params.tmpl;
// 	clog("Requesting template", tmpl);
// 	// var t = _.template
// 	fs.readFile(__dirname + '/templates/' + tmpl + '.html', 'utf8', function (err,data) {
// 		if (err) {
// 			return console.log(err);
// 		}
// 		// console.log(data);
// 		var t = _.template(data)();
// 		// clog(t);
// 		res.send(t);
// 	});
// });
eventEmitter.on("newMsg", function (msg) {
	// Loop through all of the connected clients to see if the new message
	// is relevant for them, and if so send it over socket.io
	var clients = io.sockets.clients();
	clog("Currently connected sockets:", _.pluck(clients, 'id'));
	for (var i=0, socket; socket = clients[i]; i++) {
		(function (socket) {
			clog("Event emitted for recently posted message:", msg, socket.id);
			socket.get('username', function (err, uname) {
				if (err) return clog("Error getting username from socket:", err);

				Message.findOne(msg).populate('sender to triggerLocs').exec(function (err, theMsg) {
					if (err) return clog("Error finding the message");
					clog("The message that will be delivered to the client:", uname, theMsg);
					clog(theMsg.to);
					if (_.contains(_.pluck(theMsg.to, 'username'), uname)) {
						clog("passed the test");
						socket.emit('msg', { msg: theMsg });				
					} else {
						clog("Message not sent to this client");
					}
				});
			});
		})(socket); // seal in value for 'socket'
	}	
});

io.sockets.on('connection', function (socket) {
	clog("Socket connected:", socket.id);
	socket.emit('ask_username', {});
	socket.on('response_username', function (data) {
		clog("Got response username:", data);
		socket.set('username', data.username, function () {
			
		});
	});

	
	socket.on('disconnect', function () {
		clog("Socket disconnected:", socket.id);
	});
});

server.listen(8080);

console.log("Server listening on 8080");