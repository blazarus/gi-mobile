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
	User.find(function (err, users) {
		for (var i=0,user; user=users[i]; i++) {
			user.deleteAllRecs();	
		}
	});
	getAllLocs();
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
	groups: [{ type: Schema.Types.ObjectId, ref: 'Group' }]
});

var GroupSchema = new Schema({
	groupid: { type: Number, required: true, unique: true },
	name: { type: String, required: true, trim: true },
	projects: [{ type: Schema.Types.ObjectId, ref: 'Project' }]
});

var ProjectSchema = new Schema({
	pid: { type: Number, required: true, unique: true },
	name: { type: String, required: true, trim: true },
	description: { type: String, trim: true }
});

// Number of milliseconds since last being seen 
// to be considered a stale location
var STALE = 3*60*60*1000 // 3 hours

var UserSchema = new Schema({
	username: { type: String, unique: true, required: true, trim: true },
	currloc: { type: Schema.Types.ObjectId, ref: 'Location' },
	lastseen: { type: Date },
	readMessages: [{
		readAt: { type: Date, default: Date.now},
		message: { type: Schema.Types.ObjectId, ref: 'Message', required: true }
	}],
	charms: [{
		project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
		addedAt: { type: Date, default: Date.now },
		addedWithMobile: { type: Boolean, required: true }
	}]
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
	weight: { type: Number, required: true }
	// fulfilled: { type: Boolean, default: false },
	// fulfilledAt: { type: Date }
});

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

UserSchema.methods.getUnreadMessages = function (success, failure) {
	var _this = this;
	var readMsgIds = _.pluck(this.readMessages, 'message');
	clog("readMsgIds:", readMsgIds);
	Location.findOne({screenid: "NONE"}, function (err, noneLoc) {
		Message
		.find({to: _this._id })
		.or([{
			triggerLocs: _this.isStale() ? null : _this.currloc
		},{
			triggerLocs: noneLoc
		}])
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
};

UserSchema.methods.fetchRecommendations = function (success, failure) {
	// Get recommendations from tagnet
	var thisUser = this;
	var limit = 20;
	var url = "http://gi.media.mit.edu/luminoso2/match/projects?person=" + this.username + "&limit=" + limit;
	request.get(url, function (err, response, body) {
		if (err) {
			clog("Got error getting recommendations:", err);
			return failure(err);
		} else if (response.statusCode != "200") {
			clog("Bad response code:", response.statusCode);
			return failure("Bad response code: "+response.statusCode)
		}

		body = JSON.parse(body);
		if (body.matches.length == 0 && body.error) {
			clog("Got error from tagnet:", body.error);
			return failure("Got error from tagnet: "+ body.error)
		}
		clog("Recommendations:", body);

		var count = 0, target = body.matches.length;

		var successCallback = function () {
			if (++count >= target) {
				clog("Got success for all matches");
				success();
			}
		};

		User.getOrCreateRecommender(function (recUser) {
			for (var i=0,match; match=body.matches[i]; i++) {
				(function (match) {
					var pid = match.project;
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
								Recommendation.create(thisUser, project, match.weight, recUser, successCallback, failure);
							}, failure);
						} else {
							clog("Project already in DB:", project);
							Recommendation.create(thisUser, project, match.weight, recUser, successCallback, failure);
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
	var REC_USERNAME = "RECOMMENDER";
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

RecommendationSchema.methods.createMessage = function (recUser, project, success, failure) {
	var _this = this;
	Location.findOne({ screenid: "NONE" }, function (err, loc) {
		clog("project passed to createMessage:", project);
		var subject = "Project recommendation!";
		var body = "Based on your interests, we think you should check out " + project.name;
		if (!this.message) {
			var message = new Message({
				sender: recUser,
				to: [_this.user],
				subject: subject,
				body: body,
				triggerLocs: loc
			});
			clog("The recommendation message before saving:", message);
			message.save(function (err) {
				if (err) {
					clog("Error saving recommendation message:", err);
					return failure("Error saving recommendation message: "+ err);
				}
				_this.message = message;
				success(_this);
			});
		}
	});	
};

RecommendationSchema.statics.create = function (user, project, weight, recUser, success, failure) {
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
			 	weight: weight
			});
			rec.createMessage(recUser, project, function () {
				rec.save( function (err) {
					if (err) {
						clog("Error saving new recommendation:", err);
						return failure("Error saving new recommendation: " + err);
					}
					success(rec);
				});
			}, failure);
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
	var url = "http://tagnet.media.mit.edu/get_project_info?projectid=" + _this.pid;
	clog("Checking tagnet for projects info,", url);
	request.get(url, function (err, response, body) {
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

		_this.save( function (err) {
			if (err) {
				clog("Error saving Project:", err, _this);
				return failure("Error saving Project: " + err);
			}
			clog("Successfully updated project info", _this);
			success(_this);
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
		elem = elem.project;
		if (elem in seenCharms) {
			var err = new Error('This charm has already been added: ' + elem);
			next(err);
		} else {
			seenCharms[elem]=true;
		}
	}
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

var getAllLocs = function () {
	url = "http://tagnet.media.mit.edu/rfid/api/rfid_info";
	request.get(url, function (err, response, body) {
		if (err)  return clog("Got error checking locations:", err);
		if (response.statusCode != "200") return clog("Bad response code:", response.statusCode);

		body = JSON.parse(body);
		if (body.pollers.length == 0 && body.error) return clog("Got error from tagnet:", body.error);

		for (var i=0,loc; loc=body.pollers[i]; i++) {
			if (loc.name.match(/^e14|e15|charm|considerate/)) {
				(function (loc) {
					clog("Location:", loc.name);
					Location.findOne({ screenid: loc.name }, function (err, location) {
						if (err) return clog("Error trying to find location in DB:", err);
						if (!location) {
							// Need to create location
							clog("Location was null, so add it..");
							location = new Location({ screenid: loc.name });
							location.save(function (err) {
								if (err) return clog("Error trying to save loc in DB:", err);
								clog("Added new location to DB:", location);
							});
						} else {
							// Project saved, but need to add it to location
							clog("Location already in DB:", location);
						}
						
					});
				})(loc); // Seal in value for loc
			}
		}
	});

	// Add a special NONE location
	location = new Location({ screenid: "NONE" });
	location.save(function (err) {
		if (err) return clog("Error trying to save loc in DB:", err);
		clog("Added new location to DB:", location);
	});
};

var Location = mongoose.model('Location', LocationSchema);
var Group = mongoose.model('Group', GroupSchema);
var Project = mongoose.model('Project', ProjectSchema);
var User = mongoose.model('User', UserSchema);
var Message = mongoose.model('Message', MessageSchema);
var Recommendation = mongoose.model('Recommendation', RecommendationSchema);

exports.Location = Location;
exports.Group = Group;
exports.Project = Project;
exports.User = User;
exports.Message = Message;
exports.Recommendation = Recommendation;





