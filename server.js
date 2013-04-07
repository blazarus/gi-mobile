var express = require('express'),
	_ = require('underscore'),
	request = require('request'),
	path = require('path'),
	fs = require('fs'),
	EventEmitter = require('events').EventEmitter,
	app = express(),
	http = require('http'),
	server = http.createServer(app),
	io = require('socket.io').listen(server);

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/gi_companion');

// alias console.log
var clog = console.log;

var eventEmitter = new EventEmitter();

app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.cookieParser('\n\x0c\x86~E\\\xfe\xe1\xc5m\xd1#\x90\xfaQD\x1d\xc6]=\xf5\rd\xa1'));
app.use(express.session());
app.use('/templates', express.static(path.join(__dirname, 'templates')));
app.use(express.static(path.join(__dirname, 'static')));

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function callback () {
	clog("Connected to DB");
	// Message.find().populate('sender to triggerLocs').exec( function (err, msgs) {
	// 	_.each(msgs, function (msg, idx) {

	// 		clog("Message:", msg);
	// 	});
	// });
});

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
						res.json({ status: "error", msg:"Something went wrong"});
					} else {
						clog("Got user from DB:", theUser);
						req.session.user = theUser;
						res.json({ status: 'ok', username: req.session.user.username });
					}
				});
			} else {
				res.json({ status: 'error', 'msg': 'Could not validate webcode'});
			}
		});
	} else if (req.body.username) {
		validateUsername(req.body.username, function (theUser) {
			req.session.user = theUser;
			res.json({ status: 'ok', username: req.session.user.username });
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
	var uname = req.param('username');
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

var validateUsername = function (uname, success, failure) {
	// Check with ML if username is valid
	// Also cache in DB
	// Calls success with the User object from the DB
	clog("Validating username:", uname);
	User.findOne({ username: uname }, function (err, user) {
		if (!user) {
			// Not in DB, so check data.media.mit.edu
			clog("User not in DB, so checking data.media.mit.edu");
			request.get('http://data.media.mit.edu/spm/contacts/json?username='+uname, function (err, response, body) {
				var jsono;
				if (!err && (jsono = JSON.parse(body)) && jsono.profile && !jsono.error) {
					// Valid user, so cache in DB
					var newUser = new User({ username: uname });
					newUser.save(function (err, savedUser) {
						if (err) clog("Error saving ", uname, "in DB:", err);
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
		res.json({status: 'ok', username: req.session.user.username });
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
					res.json({ status: "error", msg: "Something went wrong" });
				} else {
					clog("Successfully inserted msg into DB:", savedMsg);
					eventEmitter.emit("newMsg", savedMsg);
					res.json({ status: "ok" });
				}
			});
		}, function () {
			// validating users failed, send error response
			res.json({status: "error", msg: "Not valid user"});
		});
	});
	
});

app.get('/locations/all', function (req, res) {
	Location.find( function (err, locs) {
		if (err) clog("Error getting locations:", err);
		clog("Locations:", locs);
		locs = _.map(locs, function (loc, idx) {
			return loc.name; // front end only needs the names
		})
		res.json(locs);
	});
});

app.get('/messages', function (req, res) {
	clog("Getting messages for user");
	Message
		.find({to: req.session.user._id })
		.populate('sender to triggerLocs')
		.exec(function (err, msgs) {
			if (err) clog("Error while retrieving messages:", err);
			clog("Got messages for", req.session.user.username, msgs);
			res.json({status: 'ok', 'messages': msgs });
		});
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
	var clients = io.sockets.clients();
	clog("Currently connected sockets:", _.pluck(clients, 'id'));
	for (var i=0, socket; socket = clients[i]; i++) {
		(function (socket) {
			clog("Event emitted for recently posted message:", msg, socket.id);
			socket.get('username', function (err, uname) {
				if (err) clog("Error getting username from socket:", err);

				Message.findOne(msg).populate('sender to triggerLocs').exec(function (err, theMsg) {
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

var Schema = mongoose.Schema;

var LocationSchema = new Schema({
	name: { type: String, unique: true, required: true, trim: true }
});

var UserSchema = new Schema({
	username: { type: String, unique: true, required: true, trim: true }
});

var MessageSchema = new Schema({
	createdAt: {type: Date, default: Date.now},
	subject: { type: String, required: true },
	body: { type: String, required: true },
	sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
	to: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
	triggerLocs: [{ type: Schema.Types.ObjectId, ref: 'Location', required: true }],
});

var Location = mongoose.model('Location', LocationSchema);
var User = mongoose.model('User', UserSchema);
var Message = mongoose.model('Message', MessageSchema);

var addLocations = function () {
	var locNames = [
		"e14-474-1",
		"e15-468-1A",
		"e14-274-1",
		"NONE"
	];

	for (var i=0, name; name=locNames[i]; i++) {
		(function (name) {
			var loc = new Location({ name: name });
			loc.save(function (err, loc) {
				if (err) clog("Error saving ", name, ":", err);
				else clog("Saved location:", name);
			});
		})(name);
	}
};

var addUsers = function () {
	var users = [
		"blazarus",
		"havasi",
		"jon"
	];
	for (var i=0, name; name=users[i]; i++) {
		(function (name) {
			var user = new User({ username: name });
			user.save(function (err, user) {
				if (err) clog("Error saving ", name, ":", err);
				else clog("Saved user:", name);
			});
		})(name);
	}
};

var testMessages = function () {

	var blazarus = User.findOne({username: 'blazarus'}, function (err, users) {

		clog("users:", users);
	});
};



server.listen(8080);

console.log("Server listening on 8080");