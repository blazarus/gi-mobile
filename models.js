var mongoose = require('mongoose'),
	request  = require('request'),
	_        = require('underscore'),
	utils    = require('./utils');
mongoose.connect('mongodb://localhost/gi_companion');

// alias console.log
var clog = utils.clog;

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
	clog("Connected to DB");
	// User.find(function (err, users) {
	// 	for (var i=0,user; user=users[i]; i++) {
	// 		user.deleteAllRecs();	
	// 	}
	// });
	Location.fetchAll();
	Location.createSpecial();
	User.fetchAll(function () {}, function () {});
	// User.fetchAllSponsors(function () {}, function () {});
	User.createSpecial(function () {}, function () {});

	// newUser = new User({username: 'blazarus'})
	// newUser.save();
	// newUser = new User({username: 'havasi'});
	// newUser.save();
	// Location.find(function (err, locs) {
	// 	for (var i=0,loc; loc=locs[i]; i++) {
	// 		loc.remove();
	// 	}
	// 	Location.find(function (err, lcs) {
	// 		clog("hello", lcs);
	// 		addLocations();
	// 	});
	// });
	// Group.find(function (err, groups) {
	// 	for (var i=0,group; group=groups[i]; i++) {
	// 		group.remove();
	// 	}
	// 	Group.find(function (err, gps) {
	// 		clog("hello", gps);
	// 	});
	// });
	// User.findOne({username: 'blazarus'}, function (err, user) {
	// 	user.readMessages = [];
	// 	user.save(function (err) {
	// 		clog('ok deleted the read messages', user);
	// 	})
	// })
});

var Schema = mongoose.Schema;

var LocationSchema = new Schema({
	screenid: { type: String, unique: true, required: true, trim: true },
	name: { type: String, required: true },
	groups: [{ type: Schema.Types.ObjectId, ref: 'Group' }]
});

var GroupSchema = new Schema({
	groupid: { type: Number, required: true, unique: true },
	name: { type: String, required: true, trim: true },
	location: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
	projects: [{ type: Schema.Types.ObjectId, ref: 'Project' }]
});

var ProjectSchema = new Schema({
	pid: { type: Number, required: true, unique: true },
	name: { type: String, required: true, trim: true },
	description: { type: String, trim: true },
	location: { type: Schema.Types.ObjectId, ref: 'Location', required: true }
});

// Number of milliseconds since last being seen 
// to be considered a stale location
var STALE = 3*60*60*1000; // 3 hours

var UserSchema = new Schema({
	username: { type: String, unique: true, required: true, trim: true },
	firstname: { type: String, trim: true },
	lastname: { type: String, trim: true },
	pictureUrl: { type: String, trim: true },
	currloc: { type: Schema.Types.ObjectId, ref: 'Location' },
	lastseen: { type: Date },
	readMessages: [{
		readAt: { type: Date, default: Date.now},
		message: { type: Schema.Types.ObjectId, ref: 'Message', required: true }
	}],
	// Cache of the person's charms
	charms: [{ type: Schema.Types.ObjectId, ref: 'Project', required: true }]
});

var CharmActivitySchema = new Schema({
	project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
	actionAt: { type: Date, default: Date.now },
	action: { type: String, required: true, enum: ['add', 'delete'] }
});

var MessageSchema = new Schema({
	createdAt: {type: Date, default: Date.now},
	subject: { type: String, required: true, trim: true },
	body: { type: String, required: true, trim: true },
	sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
	to: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
	triggerLocs: [{ type: Schema.Types.ObjectId, ref: 'Location', required: true }],
});

var RecommendationSchema = new Schema({
	createdAt: {type: Date, default: Date.now},
	user: { type: Schema.Types.ObjectId, ref: 'User' },
	message: { type: Schema.Types.ObjectId, ref: 'Message' },
	project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
	weight: { type: Number, required: true },
	type: { type: String, required: true, enum: ['project', 'people']}
	// fulfilled: { type: Boolean, default: false },
	// fulfilledAt: { type: Date }
});

UserSchema.virtual('type').get(function () {
	return this.username.indexOf('@') >= 0 ? "sponsor" : "member";
});

UserSchema.virtual('fullname').get(function () {
	return this.firstname + " " + this.lastname;
});

UserSchema.methods.isMember = function () {
	return this.type == "member";
};

UserSchema.methods.isSponsor = function () {
	return this.type == "sponsor";
};

UserSchema.methods.isStale = function () {
	clog("checking if user is stale");
	if (this.currloc && this.lastseen) {
		var now = new Date;
		var last = this.lastseen;
		var diff = now.getTime() - last.getTime();
		if (diff < STALE) return false;
	}
	clog("isStale returning true");
	return true;
};

/**
 * Checks the location of the user, 
 * emits event if new location OR new timestamp
 * @param  {EventEmitter} eventEmitter
 * @param  {function} success callback 
 * @param  {function} failure callback - takes an error string
 */
UserSchema.methods.checkLocation = function (eventEmitter, success, failure) {
	var thisUser = this;
	var url = 'http://gi-ego.media.mit.edu/' + this.username + '/events/1';
	request.get({url: url, timeout: 5000}, function (err, response, body) {
		if (err) {
			clog("Got error getting location:", err, thisUser);
			return failure(err);
		} else if (response.statusCode != "200") {
			clog("Bad response code:", response.statusCode, thisUser);
			return failure("Bad response code: "+response.statusCode)
		}
		try {
			body = JSON.parse(body);
		} catch (exception) {
			clog("Error parsing response body:", exception, thisUser);
			return failure(exception);
		}
		if (!(body && body.events.length > 0 && body.events[0].readerid && body.events[0].tstamp)) {
			clog("Error getting location:", body, thisUser);
			return failure("Error getting location: " + body);
		}

		var screenid = body.events[0].readerid;
		var lastseen = new Date(body.events[0].tstamp);

		Location.findOne({ screenid: screenid }, function (err, location) {
			if (err || !location) {
				clog("Error getting location from DB:", err, location);
				return failure("Error getting location from DB: " + err);
			}

			clog(location.id, thisUser.currloc, thisUser.currloc != location.id, lastseen, thisUser.lastseen, thisUser.lastseen - lastseen != 0);

			if (thisUser.currloc != location.id || thisUser.lastseen - lastseen != 0) {
				// New location or timestamp, so emit event
				thisUser.currloc = location;
				thisUser.lastseen = lastseen;
				thisUser.save(function (err) {
					if (err) {
						clog("Error saving user:", err, thisUser);
						return failure('Error saving user: ' + err);
					}
					clog("Updated user location info in DB:", thisUser);
					clog("Emitting event for updated location");
					eventEmitter.emit('location_updated', thisUser);
					return success(thisUser);
				});
			}
		});

	});
};

UserSchema.methods.getUnreadMessages = function (success, failure) {
	var _this = this;
	var readMsgIds = _.pluck(this.readMessages, 'message');
	clog("readMsgIds:", readMsgIds);
	Location.getNoneLoc( function (err, noneLoc) {
		User.findOne({ username: "all" }, function (err, allUser) {
			Message.find({
				$and: [ //and the two or's
					{ $or: [ { to: _this._id }, { to: allUser._id } ]},
					{ $or: [ 
						{ triggerLocs: _this.isStale() ? null : _this.currloc }, 
						{ triggerLocs: noneLoc } 
					]}
				] })
				.where('_id').nin(readMsgIds)
				.sort('-createdAt')
				.populate('triggerLocs', 'screenid')
				.populate('to', 'username')
				.populate('sender', 'username')
				.exec(function (err, msgs) {
					if (err) {
						clog("Error while retrieving unread messages:", err);
						return failure(err);
					}
					clog("New messages ready to be delivered:", msgs);
					success(msgs);
				});
		});
	});
};

UserSchema.methods.fetchProjectRecommendations = function (success, failure) {
	// Get recommendations from tagnet
	var thisUser = this;
	var limit = 15;
	var memberOrSponsor = this.isMember() ? "person" : "sponsor";
	var url = "http://gi.media.mit.edu/luminoso2/match/projects?" + memberOrSponsor + "=" + this.username + "&limit=" + limit;
	request.get({url: url, timeout: 5000}, function (err, response, body) {
		if (err) {
			clog("Got error getting recommendations:", err);
			return failure(err);
		} else if (response.statusCode != "200") {
			clog("Bad response code:", response.statusCode);
			return failure("Bad response code: "+response.statusCode)
		}

		body = JSON.parse(body);
		if (body.error) {
			clog("Got error from luminoso:", body.error);
			return failure("Got error from luminoso: "+ body.error)
		}
		clog("Recommendations:", body);

		var count = 0, target = body.matches.length;

		var successCallback = function () {
			if (++count >= target) {
				clog("Got success for all matches");
				success();
			}
		};

		var numRecsShowImmediately = 5;
		var thresh = _.chain(body.matches)
			.sortBy('weight')
			.reverse()
			.pluck('weight')
			.value()[numRecsShowImmediately];

		User.getOrCreateRecommender(function (recUser) {
			for (var i=0,match; match=body.matches[i]; i++) {
				(function (match) {
					var pid = match.project;
					clog("Looking for project in DB with pid:", pid);
					Project.findOne({ pid: pid }, function (err, project) {
						if (err) {
							clog("Error finding project:", err);
							return failure("Error finding project: "+err);
						}
						if (!project) {
							// Need to create project
							clog("Project was null, so add it..");
							project = new Project({ pid: pid });
							project.fetch(function () {
								Recommendation.create(thisUser, project, match.weight, "project", recUser, thresh, successCallback, failure);
							}, function (err) {
								// Not for a valid project 
								// (probably no screen associated with it's location)
								return count++;
							});
						} else {
							clog("Project already in DB:", project);
							Recommendation.create(thisUser, project, match.weight, "project", recUser, thresh, successCallback, failure);
						}

					});
				})(match);
			}
		}, failure);
		

	});
};

UserSchema.statics.getOrCreateRecommender = function (success, failure) {
	// Creates the special 'recommendation' user 
	// to be used as sender in recommendation message
	var REC_USERNAME = "recommender";
	User.findOne({ username: REC_USERNAME }, function (err, user) {
		if (err) {
			clog("Error getting user from DB:", err);
			return failure("Error getting user from DB: " + err);
		}
		if (!user) {
			// Need to create user
			clog("RECOMMENDER user was null, so add it..");
			user = new User({
				username: REC_USERNAME
			});
			user.save(function (err) {
				if (err) {
					clog("Error saving RECOMMENDER user:", err);
					return failure("Error saving RECOMMENDER user: "+ err);
				}
				return success(user);
			});
		} else {
			return success(user);
		}
	});
	
};

UserSchema.statics.fetchAll = function (success, failure) {
	// Get all media lab users with active status
	var url = "http://data.media.mit.edu/people/json/?filter=(medialabstatus=TRUE)";
	request.get(url, function (err, response, body) {
		if (err || response.statusCode != "200") {
			clog("Got error getting recommendations:", response.statusCode, err);
			return failure(err);
		}

		try {
			body = JSON.parse(body);
		} catch (exception) {
			clog("Error parsing response body:", exception);
			return failure(exception);
		}
		
		if (body.error) {
			clog("Got error from data.media.mit.edu:", body.error);
			return failure(body.error);
		}

		var count = 0, target = body.length;

		var saved = function () {
			if (++count >= target) {
				clog("Saved all users");
				return success();
			}
		}

		for (var i=0, result; result=body[i]; i++) {
			(function (result) {
				var username = result.user_name;
				var fname = result.first_name;
				var lname = result.last_name;
				var picUrl = result.picture_url;
				User.findOne({ username: username }, function (err, user) {
					if (err) {
						clog("Error getting user from DB:", err);
						return failure(err);
					}
					if (!user) {
						// user is null so create it
						user = new User({
							username: username,
							
						});
					}
					user.firstname = fname;
					user.lastname = lname;
					user.pictureUrl = picUrl;
					user.save(function (err) {
						if (err) {
							clog("Error saving user:", err);
							return failure(err);
						}
						clog("Successfully saved user");
						saved();
					});
				});
			})(result);
		}

	});
};

UserSchema.statics.fetchAllSponsors = function (success, failure) {
	var url = "http://data.media.mit.edu/spm/attendee-list/json/MEDIALABSPRING13";
	request.get(url, function (err, response, body) {
		if (err || response.statusCode != "200") {
			clog("Got error getting recommendations:", response.statusCode, err);
			return failure(err);
		}

		try {
			body = JSON.parse(body);
		} catch (exception) {
			clog("Error parsing response body:", exception);
			return failure(exception);
		}
		
		if (body.error) {
			clog("Got error from data.media.mit.edu:", body.error);
			return failure(body.error);
		}

		var count = 0, target = body.length;

		var saved = function () {
			if (++count >= target) {
				clog("Saved all sponsors");
				return success();
			}
		}

		for (var i=0, result; result=body[i]; i++) {
			(function (result) {
				var username = result.user_name;
				var fname = result.first_name;
				var lname = result.last_name;
				User.findOne({ username: username }, function (err, user) {
					if (err) {
						clog("Error getting user from DB:", err);
						return failure(err);
					}
					if (!user) {
						// user is null so create it
						user = new User({
							username: username,
						});
					}
					if (!user.firstname || !user.lastname || user.pictureUrl) {
						// Missing info, so consult data.media.mit.edu
						request.get('http://data.media.mit.edu/spm/contacts/json?username='+username, function (err, response, body) {
							if (err || response.statusCode != "200") {
								return clog("Got error getting recommendations:", response.statusCode, err);
							}

							try {
								body = JSON.parse(body);
							} catch (exception) {
								return clog("Error parsing response body:", exception);
							}
							
							if (body.error || !body.profile) {
								return clog("Got error from data.media.mit.edu:", username, body.error, body.profile);
							}

							// Valid user, so cache in DB
							user.firstname = fname;
							user.lastname = lname;
							user.pictureUrl = body.profile.picture_url;
							user.save(function (err) {
								if (err) {
									clog("Error saving user:", err);
									return failure(err);
								}
								clog("Successfully saved user");
								saved();
							});
						});
					} else {
						clog("No web call necessary, already have the sponsor's info");
					}
					
				});
			})(result);
		}

	});
};

UserSchema.statics.createSpecial = function (success, failure) {
	clog("creating special users");
	User.create({
		username: "recommender"
	},
	{
		username: "all"
	}, function (err, recUser, allUser) {
		if (err) {
			clog("Error creating users:", err);
			return failure(err);
		}
		clog("Successfully created special users:", recUser, allUser);
		success([recUser, allUser]);
	});
};

RecommendationSchema.methods.createMessage = function (recUser, project, success, failure) {
	var _this = this;
	Location.getNoneLoc(function (err, loc) {
		Project.findOne({_id: project._id}).populate('location').exec(function (err, project) {
			clog("project passed to createMessage:", project);
			var subject = "Project recommendation!";
			var body = "Based on your interests, you should check out <a href='/project-browser/project/" + project.pid + "'>" + project.name + "</a> at <a href='/project-browser/location/" + project.location.screenid + "'>" + project.location.displayName + "</a>.";
			if (!this.message) {
				Message.create({
					sender: recUser,
					to: [_this.user],
					subject: subject,
					body: body,
					triggerLocs: loc
				}, function (err, message) {
					if (err) {
						clog("Error saving recommendation message:", err);
						return failure("Error saving recommendation message: "+ err);
					}
					clog("The recommendation message successfully saved:", message);
					_this.message = message;
					success(message);
				});
			}
		});
	});	
};

RecommendationSchema.methods.createLocationMessage = function (recUser, project, success, failure) {
	var _this = this;
	clog("Creating a recommendation message for specific location:", project.location);
	Project.findOne({_id: project._id}).populate('location').exec(function (err, project) {
		clog("project passed to createMessage:", project);
		var subject = "Project recommendation!";
		var body = "You have been detected near a project you'd be interested in. Check out <a href='/project-browser/project/" + project.pid + "'>" + project.name + "</a> at <a href='/project-browser/location/" + project.location.screenid + "'>" + project.location.displayName + "</a>.";
		if (!this.message) {
			Message.create({
				sender: recUser,
				to: [_this.user],
				subject: subject,
				body: body,
				triggerLocs: project.location
			}, function (err, message) {
				if (err) {
					clog("Error saving recommendation message:", err);
					return failure("Error saving recommendation message: "+ err);
				}
				clog("The recommendation message successfully saved:", message);
				_this.message = message;
				success(message);
			});
		}
	});
};

RecommendationSchema.statics.create = function (user, project, weight, type, recUser, thresh, success, failure) {
	Recommendation.findOne({ user: user._id, project: project._id}, function (err, rec) {
		if (err) {
			clog("Error finding recommendation in DB:", err);
			return failure("Error finding recommendation in DB: " + err);
		}
		if (!rec) {
			// Need to create recommendation
			clog("Recommendation was null, so add it..");
			rec = new Recommendation({ 
				user: user,
			 	project: project,
			 	weight: weight,
			 	type: type
			});
			var successCB = function (message) {
				rec.save( function (err) {
					if (err) {
						clog("Error saving new recommendation:", err);
						return failure("Error saving new recommendation: " + err);
					}
					success(rec);
				});
			}
			if (weight > thresh) {
				// Create message that will be shown immediately
				rec.createMessage(recUser, project, successCB, failure);
			} else {
				// Create message that will be shown at location of project
				rec.createLocationMessage(recUser, project, successCB, failure);
			}
		}
		success(rec);
	});
};

UserSchema.methods.deleteAllRecs = function () {
	Recommendation.find({ user: this._id }, function (err, recs) {
		for (var i=0,rec; rec=recs[i]; i++) {
			Message.findOne({ _id: rec.message }, function (err, msg) {
				msg.remove();
			});
			rec.remove();
		}

	});
}

ProjectSchema.methods.fetch = function (success, failure) {
	var _this = this;
	clog("this project:", this);
	var url = "http://tagnet.media.mit.edu/get_project_info?projectid=" + _this.pid;
	clog("Checking tagnet for projects info,", url);
	request.get({url: url, timeout: 5000}, function (err, response, body) {
		if (err) {
			clog("Got error checking projects:", err);
			return failure("Got error checking projects:", err)
		}
		if (response.statusCode != "200") {
			clog("Bad response code:", response.statusCode);
			return failure("Bad response code: " + response.statusCode);
		}

		body = JSON.parse(body);

		if (body.error && !body.error.match(/\*\*\*/)) {
			clog("Tagnet returned an error:", body.error);
			return failure("Tagnet returned an error: " + body.error);
		}

		_this.description = body.longdescription;
		_this.name = body.projectname;
		// Have to hard code this in - an inconsistency issue in PLDB/location data
		body.location = (body.location.toLowerCase() != "pond") ? body.location : "e15-383-1";
		body.location = (body.location.toLowerCase() != "e15-421") ? body.location : "e15-443-1";


		Location.findOne()
			.or([{ name: body.location },
				{ name: body.location.toLowerCase() },
			 	{ screenid: body.location.toLowerCase() }])
			.exec( function (err, location) {
				if (err || !location) {
					clog("Error finding a location with name or screenid:", body.location, err);
					return failure("Error finding a location with name or screenid:" + err);
				}
				_this.location = location;
				_this.save(function (err) {
					if (err) {
						clog("Error saving Project:", err, _this);
						return failure("Error saving Project: " + err);
					}
					clog("Successfully updated project info", _this);
					success(_this);
				});
			});
	});
};

UserSchema.pre('save', function (next) {
	var seenMessages = {};

	for (var i=0, elem; elem=this.readMessages[i]; i++) {
		elem = elem.message;
		if (elem in seenMessages) {
			var err = new Error('This message has aleady been marked read: ' + elem);
			next(err);
		} else {
			seenMessages[elem]=true;
		}
	}
	next();
});

UserSchema.pre('save', function (next) {
	var seenCharms = {};

	for (var i=0, elem; elem=this.charms[i]; i++) {
		if (elem in seenCharms) {
			var err = new Error('This charm has already been added: ' + elem);
			next(err);
		} else {
			seenCharms[elem]=true;
		}
	}
	next();
});

UserSchema.pre('save', function (next) {
	this.username = this.username.toLowerCase();
	next();
});

LocationSchema.pre('save', function (next) {
	var seen = {};

	for (var i=0, elem; elem=this.groups[i]; i++) {
		elem = elem._id;
		if (elem in seen) {
			var err = new Error('This group has already been added to the location: ' + elem);
			next(err);
		} else {
			seen[elem]=true;
		}
	}
	next();
});

LocationSchema.pre('save', function (next) {
	this.screenid = this.screenid.toLowerCase();
	next();
});

LocationSchema.virtual('displayName').get(function () {
	if (this.name.toLowerCase() === this.screenid) return this.name;
	else return this.name + " (" + this.screenid + ")";
});

LocationSchema.statics.getNoneLoc = function (callback) {
	Location.findOne({ screenid: "none" }, function (err, loc) {
		callback(err, loc);
	});	
};

LocationSchema.statics.fetchAll = function () {
	url = "http://tagnet.media.mit.edu/rfid/api/rfid_info";
	request.get({url: url, timeout: 5000}, function (err, response, body) {
		if (err)  return clog("Got error checking locations:", err);
		if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);

		body = JSON.parse(body);
		if (body.pollers.length == 0 && body.error) return clog("Got error from tagnet:", body.error);

		for (var i=0,loc; loc=body.pollers[i]; i++) {
			if (loc.name.match(/^e14|e15|charm|considerate/)) {
				(function (loc) {
					clog("Location:", loc.name);
					Location.findOne({ screenid: loc.name }, function (err, location) {
						if (err) clog("Error trying to find location in DB:", err);
						if (!location) {
							// Need to create location
							clog("Location was null, so add it..");
							location = new Location({ screenid: loc.name.toLowerCase() });
							location.fetch(function () {}, function () {});
						} else {
							// Project saved, but need to add it to location
							clog("Location already in DB:", location);
						}
						
					});
				})(loc); // Seal in value for loc
			}
		}
	});
};

LocationSchema.methods.fetch = function (success, failure) {
	var url = "http://data.media.mit.edu/pldb/locations/json/?screenID=" + this.screenid;
	var _this = this;
	request.get({url: url, timeout: 5000}, function (err, response, body) {
		if (err)  return clog("Got error checking locations:", err);
		if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);

		try {
			body = JSON.parse(body)[0];
		} catch (exception) {
			return clog("Error parsing json", exception);
		}

		if (body.name) _this.name = body.name;
		else _this.name = _this.screenid;
		_this.save(function (err) {
			if (err) {
				clog("Error saving location", _this.screenid, err);
				return failure("Error saving location: " + err);
			}
			clog("Successfully fetched and saved location");
			return success();
		})
	});

};

LocationSchema.statics.createSpecial = function () {
	clog("Creating special Locations");
	// Add a special NONE location
	Location.create({ screenid: "none", name: "Root" }, function (err, location) {
		if (err) return clog("Error trying to save loc in DB:", err);
		clog("Added new location to DB:", location);
	});
};



var Location = mongoose.model('Location', LocationSchema);
var Group = mongoose.model('Group', GroupSchema);
var Project = mongoose.model('Project', ProjectSchema);
var User = mongoose.model('User', UserSchema);
var CharmActivity = mongoose.model('CharmActivity', CharmActivitySchema);
var Message = mongoose.model('Message', MessageSchema);
var Recommendation = mongoose.model('Recommendation', RecommendationSchema);

exports.Location = Location;
exports.Group = Group;
exports.Project = Project;
exports.User = User;
exports.CharmActivity = CharmActivity;
exports.Message = Message;
exports.Recommendation = Recommendation;





