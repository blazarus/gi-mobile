var express = require('express'),
	_ = require('underscore'),
	request = require('request'),
	path = require('path'),
	fs = require('fs'),
	app = express();

var mongoose = require('mongoose');
mongoose.connect('mongodb://localhost/gi_companion');

// alias console.log
var clog = console.log;

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
});

app.post('/login', function (req, res) {
	clog("The request form:", req.body);
	if (req.body.webcode) {
		request.get("http://data.media.mit.edu/spm/contacts/json?web_code=" + req.body.webcode, function (err, response, body) {
			var jsono;
			if (!err && (jsono = JSON.parse(body)) && jsono.username && !jsono.error) {
				req.session.username = jsono.username;
				res.json({ status: 'ok', username: req.session.username });
			} else {
				res.json({ status: 'error', 'msg': 'Could not validate webcode'});
			}
		});
	} else if (req.body.username) {
		request.get("http://data.media.mit.edu/spm/contacts/json?username=" + req.body.username, function (err, response, body) {
			var jsono;
			if (!err && (jsono = JSON.parse(body)) && jsono.profile && !jsono.error) {
				req.session.username = req.body.username;
				res.json({ status: 'ok', username: req.session.username });
			} else {
				res.json({ status: 'error', 'msg': 'Could not validate username'});
			}
		});
	} else {
		res.json({ status: 'error', msg: 'Need to submit either a webcode or username'});
	}

});

app.post('/logout', function (req, res) {
	req.session.destroy();
	res.redirect('/login');
});

app.get('/checklogin', function (req, res) {
	if (req.session.username) {
		res.json({status: 'ok', username: req.session.username });
	}
	res.json({status: 'no_login'});
});

app.get('/*', function(req, res){
	// Location.find( function (err, locs) {
	// 	if (err) console.log("Error:", err);
	// 	clog(locs);
	// 	res.send(locs[0].toJSON());
	// });
	res.sendfile(__dirname + '/newindex.html');
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

var Schema = mongoose.Schema;

var LocationSchema = new Schema({
	name: { type: String, unique: true, required: true, trim: true }
});

var UserSchema = new Schema({
	username: { type: String, unique: true, required: true, trim: true },
	lastLoc: {type: Schema.Types.ObjectId, ref: 'LocationSchema'},
});

var MessageSchema = new Schema({
	createdAt: {type: Date, default: Date.now},
	subject: { type: String, required: true },
	body: { type: String, required: true },
	sender: { type: Schema.Types.ObjectId, ref: 'UserSchema', required: true },
	to: { type: [Schema.Types.ObjectId], ref: 'UserSchema', required: true },
	triggerLocs: { type: [Schema.Types.ObjectId], ref: 'LocationSchema', required: true },
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



app.listen(8080);

console.log("Server listening on 8080");