var mongoose = require('mongoose'),
	request  = require('request'),
	utils    = require('./utils');
mongoose.connect('mongodb://localhost/gi_companion');

// alias console.log
var clog = utils.clog;

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
	clog("Connected to DB");
	getAllLocs();
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

// var addLocations = function () {
// 	var locids = [
// 		"e14-474-1",
// 		"e15-468-1A",
// 		"e14-274-1",
// 		"e15-468-1",
// 		"e14-514-1",
// 		"charm-6",
// 		"NONE"
// 	];

// 	for (var i=0, id; id=locids[i]; i++) {
// 		(function (id) {
// 			clog("saving loc with id:", id);
// 			var loc = new Location({ screenid: id });
// 			loc.save(function (err, loc) {
// 				if (err) clog("Error saving ", id, ":", err);
// 				else clog("Saved location:", id);
// 			});
// 		})(id);
// 	}
// };

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

exports.Location = Location;
exports.Group = Group;
exports.Project = Project;
exports.User = User;
exports.Message = Message;





