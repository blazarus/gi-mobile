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
app.use(express.static(path.join(__dirname, '')));

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

// app.get('/checkuser', function (req, res) {
// 	var uname = req.param('username').toLowerCase().trim();
// 	clog("checking username:", uname);
// 	if (uname) {
// 		validateUsername(uname, function (theUser) {
// 			res.json({ status: 'ok', username: theUser.username });
// 		}, function () {
// 			res.json({ status: 'error', 'msg': 'Could not validate username'});
// 		});
// 	} else {
// 		res.json({ status: 'error', 'msg': 'No username provided'});
// 	}

// });

app.get('/user', function (req, res) {
	clog("Fetching user:", req.param('_id'), req.param('username'));
	if (req.param('_id')) {
		clog("Getting user with _id:", req.param('_id'));
		User.findOne({ _id: req.param('_id').trim() }, function (err, user) {
			if (err) {
				clog("Error retrieving user:", err);
				res.send(500, err);
			}
			clog("Retrieved user:", user);
			res.json({ status: 'ok', user: user });
		});
	}
	else if (req.param('username')) {
		clog("Getting user with username:", req.param('username'));
		var username = req.param('username').trim();
		validateUsername(username, function (user) {
			res.json({ status: 'ok', user: user });
		}, function () {
			res.send(500, 'Could not validate username');
		});
	}
	else return res.send(500, 'Need to provide _id or username');

	
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
					return res.send(500, 'Something went wrong:'+err);
				}
				clog("Successfully inserted msg into DB:", savedMsg);
				eventEmitter.emit("newMsg", savedMsg);
				res.json({ status: "ok" });
			});
		}, function () {
			// validating users failed, send error response
			res.send(500, 'Could not validate username');
		});
	});
	
});

app.get('/locations/all', function (req, res) {
	Location.find().exec( function (err, locs) {
		if (err) {
			clog("Error getting locations:", err);
			return res.send(500, "Something went wrong: " + err);
		}
		clog("Locations:", locs);
		res.json({status: 'ok', locs: locs });
	});
});

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
				return res.send(500, "Something went wrong: " + err);
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
				return res.send(500, "Something went wrong: " + err);
			}
			// msgs = filterMessagesUnread(msgs, req);
			res.json({status: 'ok', 'messages': msgs });
		});
});

app.post('/messages/read/:id', function (req, res) {
	clog("Message being marked as read:", req.params.id, req.session.user.username, req.session.user.readMessages.length);
	User.findOne({ username: req.session.user.username }, function (err, user) {
		if (err) {
			clog("Error retrieving logged in User from DB:", err);
			return res.send(500, "Something went wrong: " + err);
		}
		Message.findOne({ _id: req.params.id }, function (err, msg) {
			if (err) {
				clog("Error finding message", msg);
				return res.send(500, "Error finding message: " + err);
			}
			user.readMessages.push({
				message: msg,
				readAt: new Date()
			});

			user.save(function (err) {
				if (err) {
					clog("Error saving user:", err);
					return res.send(500, "Something went wrong: " + err);
				}
				req.session.user = user;
				clog("Successfully updated read messages:", req.session.user.readMessages.length);
				res.json({ status: 'ok' });
			});
		});
	});
});

app.get('/locations/:screenid', function (req, res) {
	var screenid = req.params.screenid.trim();
	clog("Checking groups for screenid:", screenid);
	Location.findOne({ screenid: screenid }).populate('groups').exec(function (err, location) {
		if (err) {
			clog("Error getting location:", err);
			return res.send(500, "Something went wrong: " + err);
		} else if (!location) {
			clog("Location couldn't be found");
			return res.send(500, "Couldn't find location");
		}

		var success = function () {
			res.json({ status: 'ok', loc: location });
		};

		clog("Location found in DB:", location);
		if (location.groups && location.groups.length != 0) {
			// Have the groups cached in DB, return those
			success();
			// update the cache after sending the response
			updateGroupsForLoc(location, function () {});
		} else {
			// Need to look up the groups
			updateGroupsForLoc(location, success);
		}
	});
});

var updateGroupsForLoc = function (location, successCallback) {
	if (location.screenid == "NONE") {
		return updateAllGroups(location, successCallback);
	}
	location.groups = [];

	var url = "http://tagnet.media.mit.edu/groups?screenid="+location.screenid;
	clog("Checking tagnet for groups,", url);
	request.get(url, function (err, response, body) {
		if (err)  return clog("Got error checking groups:", err);
		if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);

		body = JSON.parse(body);
		if (body.error) return clog("Got error from tagnet:", body.error);
		var count = 0, target = body.groups.length;

		var updateLoc = function (grp) {
			location.groups.push(grp);
			if (++count >= target) {
				// Only save once all of the groups have been added
				location.save(function (err) {
					if (err) return clog("Error saving Location:", err);
					clog("Successfully updated location to include group", location);
					successCallback();
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

var updateAllGroups = function (location, successCallback) {
	// Location should be the special NONE
	location.groups = [];
	var url = "http://tagnet.media.mit.edu/get_all_groups";
	clog("Checking tagnet for all groups,", url);
	request.get(url, function (err, response, body) {
		if (err)  return clog("Got error checking groups:", err);
		if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);

		body = JSON.parse(body);
		if (body.res.length == 0 && body.error) return clog("Got error from tagnet:", body.error);
		var count = 0, target = body.res.length;

		var updateLoc = function (grp) {
			location.groups.push(grp);
			if (++count >= target) {
				// Only save once all of the groups have been added
				location.save(function (err) {
					if (err) return clog("Error saving Location:", err);
					clog("Successfully updated location to include group", location);
					successCallback();
				});
			}
		}

		for (var i=0,group; group=body.res[i]; i++) {
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
}

app.get('/groups/:groupid', function (req, res) {
	var groupid = req.params.groupid.trim();
	clog("fetching group with groupid:", groupid);
	Group.findOne({groupid: groupid}).populate('projects').exec(function (err, group) {
		if (err) {
			clog("Error finding group:", groupid, err);
			return res.send(500, "Something went wrong: " + err);
		} else if (!group) {
			clog("Couldn't find group with groupid", groupid);
			return res.send(500, "Something went wrong");
		}
		clog("Found group in DB:", group);

		var success = function () {
			res.json({ status: 'ok', group: group });
		};

		if (group.projects && group.projects.length != 0) {
			// Have the projects cached in DB, return those
			success();
			// update the cache after sending the response
			updateProjectsForGroup(group, function () {});
		} else {
			// Need to look up the projects
			updateProjectsForGroup(group, success);
		}
	});
});
	
var updateProjectsForGroup = function (group, successCallback) {
	group.projects = [];

	var url = "http://tagnet.media.mit.edu/get_projects_by_group?groupid="+group.groupid;
	clog("Checking tagnet for projects,", url);
	request.get(url, function (err, response, body) {
		if (err)  return clog("Got error checking projects:", err);
		if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);

		body = JSON.parse(body);
		if (body.res.length == 0 && body.error) return clog("Got error from tagnet:", body.error);
		var count = 0, target = body.res.length;

		var updateGroup = function (proj) {
			group.projects.push(proj);
			if (++count >= target) {
				// Only save once all of the groups have been added
				group.save(function (err) {
					if (err) return clog("Error saving Group:", err);
					clog("Successfully updated group to include project", group);
					successCallback();
				});
			}
		};

		for (var i=0,project; project=body.res[i]; i++) {
			(function (project) {
				clog("Project:", project.id, project.projectname);
				Project.findOne({ pid: project.id, name: project.projectname }, function (err, proj) {
					if (err) return clog("Error trying to find project in DB:", err);
					if (!proj) {
						// Need to create project
						clog("Project was null, so create it..");
						proj = new Project({
							pid: project.id,
							name: project.projectname
						});
						proj.save(function (err) {
							if (err) return clog("Error trying to save project in DB:", err);
							clog(proj);
							updateGroup(proj);
						});
					} else {
						// Project saved, but need to add it to location
						clog("Found project in DB:", proj);
						updateGroup(proj);
					}
					
				});
			})(project); // Seal in value for project
		}
	});
};

app.get('/projects/:pid', function (req, res) {
	var pid = req.params.pid.trim();
	clog("fetching project with pid:", pid);
	Project.findOne({pid: pid}).exec(function (err, project) {
		if (err) {
			clog("Error finding project:", pid, err);
			return res.send(500, "Something went wrong: " + err);
		} else if (!project) {
			clog("Couldn't find project with pid", pid);
			return res.send(500, "Something went wrong");
		}
		clog("Found project in DB:", project);

		var success = function () {
			res.json({ status: 'ok', project: project });
		};

		if (project.description) {
			// Have the projects cached in DB, return those
			success();
			// update the cache after sending the response
			updateProjectInfo(project, function () {});
		} else {
			// Need to look up the projects
			updateProjectInfo(project, success);
		}
	});
});

var updateProjectInfo = function (project, successCallback) {
	var url = "http://tagnet.media.mit.edu/get_project_info?projectid=" + project.pid;
	clog("Checking tagnet for projects info,", url);
	request.get(url, function (err, response, body) {
		if (err)  return clog("Got error checking projects:", err);
		if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);

		body = JSON.parse(body);
		// if (body.res.length == 0 && body.error) return clog("Got error from tagnet:", body.error);

		project.description = body.longdescription;

		project.save( function (err) {
			if (err) return clog("Error saving Project:", err);
			clog("Successfully updated project info", project);
			successCallback(project);
		});

	});
};

app.get('/user/:username/charms', function (req, res) {
	var username = req.params.username.trim();
	clog("fetching charms for user with username:", username);
	User.findOne({username: username}).populate('charms.project').exec(function (err, user) {
		if (err) {
			clog("Error finding user:", username, err);
			return res.send(500, "Something went wrong: " + err);
		} else if (!user) {
			clog("Couldn't find user with username", username);
			return res.send(500, "Something went wrong");
		}
		clog("Found user in DB:", user);

		var success = function () {
			clog("user:", user);
			res.json({ status: 'ok', charms: user.charms });
		};

		if (user.charms && user.charms.length > 0) {
			// Have the projects cached in DB, return those
			success();
			// update the cache after sending the response
			updateCharmsForUser(user, function () {});
		} else {
			// Need to look up the projects
			updateCharmsForUser(user, success);
		}
	});
});

var updateCharmsForUser = function (user, successCallback) {
	var url = "http://tagnet.media.mit.edu/charms?user_name=" + user.username;
	request.get(url, function (err, response, body) {
		if (err)  return clog("Got error checking charms:", err);
		if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);
		body = JSON.parse(body);
		if (body.charms.length == 0 && body.error) return clog("Got error from tagnet:", body.error);
		var count = 0, target = body.charms.length;

		var seenCharms = {};

		for (var i=0; i < user.charms.length; i++) {
			var charm = user.charms[i].project;
			seenCharms[charm] = true;
		}

		clog("seenCharms:", seenCharms);

		var updateUser = function (proj) {

			if (proj._id in seenCharms) {
				clog("Project already in charms, so skip it");
			} else {
				clog("Project not already in charms, so add it");
				var charm = {
					project: proj,
					addedWithMobile: false
				};
				user.charms.push(charm);
				seenCharms[proj._id] = true;
				clog("seenCharms:", seenCharms);
			}
			if (++count >= target) {
				// Only save once all of the groups have been added
				user.save(function (err) {
					if (err) return clog("Error saving User:", err);
					clog("Successfully updated user to include charms", user);
					successCallback();
				});
			}
		};

		for (var i=0,project; project=body.charms[i]; i++) {
			if ('id' in project && 'projectname' in project) {
				(function (project) {
					clog("Project:", project.id, project.projectname);
					Project.findOne({ pid: project.id, name: project.projectname }, function (err, proj) {
						if (err) return clog("Error trying to find project in DB:", err);
						if (!proj) {
							// Need to create project
							clog("Project was null, so create it..");
							proj = new Project({
								pid: project.id,
								name: project.projectname
							});
							proj.save(function (err) {
								if (err) return clog("Error trying to save project in DB:", err);
								clog(proj);
								updateUser(proj);
							});
						} else {
							// Project saved, but need to add it to location
							clog("Found project in DB:", proj);
							updateUser(proj);
						}
						
					});
				})(project); // Seal in value for project
			} else {
				// skip this one, but make sure to increase the count
				count++;
				continue;
			}
		}

	});
}


app.get('/dummyloc', function (req, res) {
	res.sendfile(__dirname + '/templates/dummy_location.html');
});

app.post('/dummyloc/update', function (req, res) {
	if ('session' in req) {
		var screenid = req.param('loc');
		Location.findOne({ screenid: screenid }, function (err, loc) {
			if (err) {
				clog("Error finding location in DB:", err);
				return res.json({status: 'error'});
			}
			clog("Found loc in DB:", loc);
			req.session.dummyLoc = loc;
			res.json({status: 'ok'});
		});
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

