var express      = require('express'),
	_            = require('underscore'),
	request      = require('request'),
	path         = require('path'),
	fs           = require('fs'),
	EventEmitter = require('events').EventEmitter,
	app          = express(),
	http         = require('http'),
	server       = http.createServer(app),
	utils        = require('./utils'),
	models       = require('./models'),
	io           = require('socket.io').listen(server);

var clog = utils.clog;

var Location      = models.Location,
	Group         = models.Group,
	Project       = models.Project,
	User          = models.User,
	CharmActivity = models.CharmActivity,
	Message       = models.Message;

var eventEmitter = new EventEmitter();

app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.cookieParser('\n\x0c\x86~E\\\xfe\xe1\xc5m\xd1#\x90\xfaQD\x1d\xc6]=\xf5\rd\xa1'));
app.use(express.session());
app.use('/templates', express.static(path.join(__dirname, 'templates')));
app.use(express.static(path.join(__dirname, 'static')));

app.post('/login', function (req, res) {
	clog("The request form:", req.body);

	var success = function (user) {
		req.session.user = user;
		user.fetchProjectRecommendations(function () {
			clog("Successfully got recommendations");
			eventEmitter.emit("newMsg");
		}, function (err) {
			clog("Error getting recommendations:", err);
		});
		res.json({ status: 'ok', user: req.session.user });
	};

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
					success(theUser);
				});
			} else {
				res.json({ status: 'error', 'msg': 'Could not validate webcode'});
			}
		});
	} else if (req.body.username) {
		validateUsername(req.body.username, success, 
		function () {
			res.json({ status: 'error', 'msg': 'Could not validate username'});
		});
	} else {
		res.json({ status: 'error', msg: 'Need to submit either a webcode or username'});
	}

});


app.post('/logout', function (req, res) {
	req.session.destroy();
	clog("logging out user");
	res.json({status: 'ok'});
});

app.get('/user/:username', function (req, res) {
	clog("Fetching user:", req.params.username);
	validateUsername(req.params.username, function (user) {
		res.json({ status: 'ok', user: user });
	}, function () {
		res.send(500, 'Could not validate username');
	});
});

app.put('/user/:username', function (req, res) {
	clog("Fetching user:", req.params.username);
	validateUsername(req.params.username, function (user) {
		res.json({ status: 'ok', user: user });
	}, function () {
		clog("Error validating user");
		res.send(500, 'Could not validate username');
	});
});

app.get('/typeahead/users', function (req, res) {
	clog("in typeahead", req.param('query'));
	regexList = _.map(req.param('query').trim().split(" "), function (elem) {
		return new RegExp(elem, "i");
	});

	User.find()
		.or([{
			username: { $in : regexList }
		},{
			firstname: { $in : regexList }
		},{
			lastname: { $in : regexList }
		}])
		.exec( function (err, users) {
		clog("typeahead users", users);
		res.json({ options: users });
	});
});

app.post('/user/location/update', function (req, res) {
	if (!req.session.user) {
		clog("Must be logged in");
		return res.json({status: 'error', msg: 'Must be logged'});
	}
	var screenid = req.param('screenid'),
		lastseen = req.param('tstamp');
	if (!screenid || !lastseen) {
		clog("Not valid request:", req.body);
		return res.json({status: 'error', msg: 'Not a valid request'});
	}

	lastseen = new Date(lastseen);
	clog("Updating user's location:", screenid, lastseen);
	Location.findOne({ screenid: screenid }, function (err, loc) {
		if (err || !loc) {
			clog("Error getting loc from DB:", err, loc);
			return res.json({ status: 'error', msg: 'Error getting location from DB' });
		}
		User.findOne({ username: req.session.user.username }, function (err, user) {
			if (err || !user) {
				clog("Error getting user from DB:", err, user);
				return res.json({ status: 'error', msg: 'Error getting user from DB' });
			}
			user.currloc = loc._id;
			user.lastseen = lastseen;
			user.save(function (err) {
				if (err) {
					clog("Error saving user:", err, user);
					return res.json({ status: 'error', msg: 'Error saving user' });
				}
				// update session user obj
				req.session.user = user;
				clog("Updated user location info in DB:", req.session.user);
				eventEmitter.emit('location_updated', user);
				return res.json({ status: 'ok' });
			});
		})
		
	});

});

app.get('/user/:username/location/update', function (req, res) {
	validateUsername(req.param('username'), function (user) {
		user.checkLocation(eventEmitter, function () {
			User.findOne({ username: user.username}).populate('currloc').exec(function (err, user) {
				if (err) {
					clog("Error getting saved user to return:", err);
					return es.send(500, "Error checking user's location");
				}
				res.json({ status: 'ok', user: user }); 

			});
		}, function () {
			res.send(500, "Error checking user's location");
		});
	},
	function (err) {
		res.send(500, 'Could not validate username');
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
					var newUser = new User({ 
						username: uname,
						firstname: jsono.profile.first_name,
						lastname: jsono.profile.last_name,
						pictureUrl: jsono.profile.picture_url
					});
					newUser.save(function (err, savedUser) {
						if (err) {
							clog("Error saving ", uname, "in DB:", err);
							failure("Error saving "+ uname+" in DB: " + err);
						}
						else clog("Saved user in DB:", newUser);

						success(savedUser);
					});
				} else {
					failure("Bad response from data.media.mit.edu");
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
		clog("Invalid user with username:", username);
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

app.post('/message', function (req, res) {
	clog("Creating new message:", req.body);

	var screenids = _.pluck(req.body.triggerLocs, 'screenid');
	Location.find()
		.where('screenid').in(screenids)
		.exec(function (err, locs) {
		
		if (err || !locs) {
			clog("Error finding this location");
			return res.send(500, 'Something went wrong')
		}
		var sender = req.session.user;
		
		var to = req.body.to;
		if (to.length === 0) {
			clog("Error: No recipients");
			return res.send(500, "No must have at least one recipient");
		}
		var usersToCheck = _.pluck(to, 'username');

		validateUserList(usersToCheck, function (toList) {
			// Users validated, now create the message
			clog("List of validated user objects:", toList);
			clog("triggerLocs:", locs);
			Message.create(
				{
					subject: req.body.subject,
					body: req.body.body,
					to: toList,
					sender: sender._id,
					triggerLocs: locs
				}, 
				function (err, msg) {
				if (err) {
					clog("Error inserting message into DB:", err);
					return res.send(500, 'Something went wrong:'+err);
				}
				clog("Successfully inserted msg into DB:", msg);
				Message.findOne(msg)
				.populate('triggerLocs', 'screenid')
				.populate('to', 'username')
				.populate('sender', 'username')
				.exec(function (err, msg) {
					eventEmitter.emit("newMsg", msg);
					res.json({ status: "ok", message: msg });				
				});
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
	var user = new User(req.session.user);
	var readMsgIds = _.pluck(req.session.user.readMessages, 'message');
	clog("readMsgIds:", req.session.user._id, req.params.skip, req.params.limit, readMsgIds);
	User.findOne({ username: "all" }, function (err, allUser) {
		Message.find()
			.or([
				{to: req.session.user._id },
				{ to: allUser._id }
			])
			.where('_id').in(readMsgIds)
			.sort('-createdAt')
			.skip(req.params.skip ? req.params.skip : 0)
			.limit(req.params.limit ? req.params.limit : "")
			.populate('to', 'username')
			.populate('sender', 'username')
			.populate('triggerLocs', 'screenid')
			.exec(function (err, msgs) {
				if (err) {
					clog("Error while retrieving read messages:", err);
					return res.send(500, "Something went wrong: " + err);
				}
				clog("Read messages:", msgs);

				res.json({status: 'ok', messages: msgs, total: req.session.user.readMessages.length });
			});	
	});
});

app.get('/messages/unread/:skip?/:limit?', function (req, res) {
	clog("Getting new/unread messages for user");
	var user = new User(req.session.user);
	clog("user:", user);
	user.getUnreadMessages(function (msgs) {
		res.json({status: 'ok', 'messages': msgs });
	},
	function (err) {
		res.send(500, "Something went wrong: " + err);
	});
	var readMsgIds = _.pluck(req.session.user.readMessages, 'message');
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
			clog("Found message in DB:", msg);
			user.readMessages.push({
				message: msg._id,
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
		var failure = function (err) {
			res.send(500, err);
		};

		clog("Location found in DB:", location);
		if (location.groups && location.groups.length != 0) {
			// Have the groups cached in DB, return those
			success();
			// update the cache after sending the response
			updateGroupsForLoc(location, function () {}, function () {});
		} else {
			// Need to look up the groups
			updateGroupsForLoc(location, success, failure);
		}
	});
});

var updateGroupsForLoc = function (location, successCallback, failureCallback) {
	var url = "http://tagnet.media.mit.edu/groups?screenid="+location.screenid;
	var resultPropertyName = "groups";
	if (location.screenid.toLowerCase() == "none") {
		var url = "http://tagnet.media.mit.edu/get_all_groups";
		resultPropertyName = "res";
		// clog("Checking tagnet for all groups,", url);
		// return updateAllGroups(location, successCallback);
	}
	location.groups = [];

	clog("Checking tagnet for groups,", url);
	request.get({url: url, timeout: 5000}, function (err, response, body) {
		if (err)  {
			clog("Got error checking groups:", err);
			return failureCallback("Got error checking groups:"+ err);
		}
		if (response.statusCode != "200") {
			clog("Bad response code:", response.statusCode);
			return failureCallback("Couldn't retrieve groups from tagnet");
		}

		body = JSON.parse(body);
		if (body.error) {
			clog("Got error from tagnet:", body.error);
			return failureCallback(body.error);
		}
		var count = 0, target = body[resultPropertyName].length;

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

		for (var i=0,group; group=body[resultPropertyName][i]; i++) {
			(function (group) {
				clog("Group:", group.id, group.name);
				Group.findOne({ groupid: group.id, name: group.name }, function (err, grp) {
					if (err) {
						clog("Error trying to find group in DB:", err);
						return failureCallback("Error finding Group in database");
					}
					if (!grp) {
						// Need to create group
						clog("Group was null, so create it..");
						grp = new Group({
							groupid: group.id,
							name: group.name,
							location: location
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

// var updateAllGroups = function (location, successCallback) {
// 	// Location should be the special NONE
// 	location.groups = [];
// 	var url = "http://tagnet.media.mit.edu/get_all_groups";
// 	clog("Checking tagnet for all groups,", url);
// 	request.get(url, function (err, response, body) {
// 		if (err)  return clog("Got error checking groups:", err);
// 		if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);

// 		body = JSON.parse(body);
// 		if (body.res.length == 0 && body.error) return clog("Got error from tagnet:", body.error);
// 		var count = 0, target = body.res.length;

// 		var updateLoc = function (grp) {
// 			location.groups.push(grp);
// 			if (++count >= target) {
// 				// Only save once all of the groups have been added
// 				location.save(function (err) {
// 					if (err) return clog("Error saving Location:", err);
// 					clog("Successfully updated location to include group", location);
// 					successCallback();
// 				});
// 			}
// 		}

// 		for (var i=0,group; group=body.res[i]; i++) {
// 			(function (group) {
// 				clog("Group:", group.id, group.name);
// 				Group.findOne({ groupid: group.id, name: group.name }, function (err, grp) {
// 					if (err) return clog("Error trying to find group in DB:", err);
// 					if (!grp) {
// 						// Need to create group
// 						clog("Group was null, so create it..");
// 						grp = new Group({
// 							groupid: group.id,
// 							name: group.name,
// 							location: location
// 						});
// 						grp.save(function (err) {
// 							clog(grp);
// 							updateLoc(grp);
// 						});
// 					} else {
// 						// Group saved, but need to add it to location
// 						clog("Found group in DB:", grp);
// 						updateLoc(grp);
// 					}
					
// 				});
// 			})(group); // Seal in value for group
// 		}
// 	});
// }

app.get('/groups/:groupid', function (req, res) {
	var groupid = req.params.groupid.trim();
	clog("fetching group with groupid:", groupid);
	Group.findOne({groupid: groupid}).populate('projects location').exec(function (err, group) {
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
	request.get({url: url, timeout: 5000}, function (err, response, body) {
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
							name: project.projectname,
							location: group.location
						});
					} else {
						// Project saved, but need to add it to location
						clog("Found project in DB:", proj);
						// Override a possible bad project location created at some other point
						proj.location = group.location;
					}
					proj.save(function (err) {
						if (err) return clog("Error trying to save project in DB:", err);
						clog(proj);
						updateGroup(proj);
					});
					
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
		var failure = function (err) {
			return res.send(500, "Something went wrong: " + err);
		};

		if (project.description) {
			// Have the projects cached in DB, return those
			success();
			// update the cache after sending the response
			project.fetch(function () {}, failure);
		} else {
			// Need to look up the projects
			project.fetch(success, failure);
		}
	});
});

app.delete('/api/charms/:pid', function (req, res) {
	doCharmActivity(req, res, "delete");
});

app.put('/api/charms/:pid', function (req, res) {
	doCharmActivity(req, res, "add");
});

app.post('/api/charms/:pid', function (req, res) {
	doCharmActivity(req, res, "add");
});

var doCharmActivity = function (req, res, action) {
	if ('user' in req.session) {
		var pid = req.params.pid;
		var username = req.session.user.username;
		var url = "http://gi-ego.media.mit.edu/" + username + "/charms";
		var params = "id="+ pid +"&type=project&action=" + action + "&client=gimobile";
		var method = action == "delete" ? 'DELETE' : 'POST';
		clog("sending request to add/remove charm");
		request({
			method: method,
			headers: {'content-type' : 'application/x-www-form-urlencoded'},
			url:     url,
			body:    params
		}, function (err, response, body) {
			if (err) {
				clog("Error posting charm to gi-ego:", err);
				return res.send(500, "Error posting charm to gi-ego: " + err);
			} else if (response.statusCode != "200") {
				clog("Bad response code:", response.statusCode, body);
				return res.send(500, "Bad response code: " + response.statusCode);
			}
			clog("Response from adding/deleting charm:", body);
			try {
				body = JSON.parse(body);
			} catch (exception){
				clog("Exception parsing response:", err);
				return res.send(500, "Exception parsing response: " + err);				
			}

			if (body.error) {
				clog("Got error from gi-ego:", body.error);
				return res.send(500, "got error from gi-ego: " + body.error);
			}

			//Errors have been handled, now add charm activity
			Project.findOne({ pid: pid }, function (err, project) {
				if (err || !project) {
					clog("Error finding project in DB:", err);
					return res.send(500, "Error finding project in DB: " + err);
				}
				var activity = new CharmActivity({
					project: project,
					action: action
				});
				activity.save(function (err) {
					if (err) {
						clog("Error saving CharmActivity:", err);
						return res.send(500, "Error saving CharmActivity: " + err);
					}
					res.json({ status: 'ok' });
				});
				
			});

		});
	}
};

app.get('/api/charms', function (req, res) {
	var username = req.session.user.username.trim();
	clog("fetching charms for user with username:", username);
	User.findOne({username: username}).populate('charms').exec(function (err, user) {
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

		updateCharmsForUser(user, success);
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

		user.charms = [];
		clog("Cleared user charms:", user.charms);
		var updateUser = function (proj) {
			user.charms.push(proj);
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
				clog("Project not already in charms, so add it");
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

							Location.findOne()
								.or([{ name: project.location }, { screenid: project.location }])
								.exec( function (err, location) {
									if (err || !location) {
										clog("Error finding a location with name or screenid:", project.location, err);
										// Skip this one if it doesn't have a valid location
										return count++;
									}
									proj.location = location;
									proj.save(function (err) {
										if (err) return clog("Error trying to save project in DB:", err);
										clog(proj);									
										updateUser(proj);
									});
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

app.get('/test', function (req, res) {
	fs.readFile(__dirname + '/templates/indexbody.html', 'utf8', function (err, data) {
		if (err) {
			return console.log("Error reading index.html", err);
		}
		var t = _.template(data)();
		clog("Sending rendered template");
		res.send(t);
	});
});

app.get('/*', function(req, res){
	fs.readFile(__dirname + '/templates/index.html', 'utf8', function (err, data) {
		if (err) {
			return console.log("Error reading index.html", err);
		}
		var t = _.template(data)();
		clog("Sending rendered template");
		res.send(t);
	});
});

eventEmitter.on('location_updated', function (user) {
	// get correct socket
	var clients = io.sockets.clients();
	for (var i=0,socket; socket=clients[i]; i++) {
		(function (socket) {
			socket.get('username', function (err, username) {
				if (err) return clog("Error getting username from socket.");
				if (username == user.username) {
					checkForMessage(socket, user);
					pushLocationUpdate(socket, user);
				}
			});
		})(socket);
	}
});

var pushLocationUpdate = function (socket, user) {
	User.findOne({ username: user.username }).populate('currloc').exec(function (err, user) {
		if (err) return clog("Error finding user in DB", user);
		socket.emit('location_updated', { user: user });
	});
};

var checkForMessage = function (socket, user) {
	// user.isStale();
	user.getUnreadMessages(function (msgs) {
		for (var i=0,msg; msg=msgs[i]; i++) {
			socket.emit('msg', { msg: msg });			
		}
	},
	function (err) { });// do nothing
}

eventEmitter.on("newMsg", function () {
	// Loop through all of the connected clients to see if the new message
	// is relevant for them, and if so send it over socket.io
	var clients = io.sockets.clients();
	clog("Currently connected sockets:", _.pluck(clients, 'id'));
	for (var i=0, socket; socket = clients[i]; i++) {
		(function (socket) {
			clog("Event emitted for recently posted message", socket.id);
			socket.get('username', function (err, uname) {
				if (err) clog("Error getting username from socket:", err);
				else {
					User.findOne({username: uname}, function (err, user) {
						if (err) clog("Error finding user in DB:", err);
						else if (!user) clog("User was null from DB");
						else {
							checkForMessage(socket, user);
						}
					});
				}
				
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

