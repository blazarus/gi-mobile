// javascript:debugger

App.Models.Message = Backbone.Model.extend({
	idAttribute: "_id",

	initialize: function () {
		// If the users' properties change, fire a change event
		for (var i=0, user; user=this.get('to')[i]; i++) {
			this.listenTo(user, 'change', function () {
				this.trigger('change');
			});
		}
		this.listenTo(this.get('sender'), 'change', function () {
			this.trigger('change');
		});
	},

	parse: function (response) {
		response.sender = App.allUsers.getOrCreate(response.sender);
		response.to = _.map(response.to, function (user) {
			return App.allUsers.getOrCreate(user);
		});
		response.triggerLocs = _.map(response.triggerLocs, function (loc) {
			var loc = App.locations.get(loc.screenid);
			if (!loc) {
				throw new Error("Couldn't find loc: "+id);
			}
			return loc;
		});
		response.createdAt = new Date(response.createdAt);
		return response;
	}
});

App.Collections.UnreadMessages = Backbone.Collection.extend({
	model: App.Models.Message,

	url: '/messages/unread',

	initialize: function () {

	},

	parse: function (response) {
		console.log("Fetch returning:", response);
		return response.messages;
	}
});

App.Collections.ReadMessages = Backbone.Collection.extend({
	model: App.Models.Message,

	url: function () {
		var url = '/messages/read';
		if (this.start !== undefined && this.end !== undefined) {
			url += '/' + this.start + '/' + (this.start-this.end);
		}
		return url;
	},


	initialize: function (msgs, options) {
		this.start = options.start;
		this.end = options.end;
	},

	parse: function (response) {
		console.log("Fetch read messages returning:", response);
		this.total = response.total;
		return response.messages;
	}
});

App.Models.User = Backbone.Model.extend({
	idAttribute: "username",

	defaults: {
		username: "",
		location: null,
		tstamp: null,
		// Number of milliseconds since last being seen 
		// to be considered a stale location
		stale: 3*60*60*1000 // 3 hours
	},

	url: function () {
		return '/user/' + this.id;
	},

	initialize: function () {
		this.setup();
	},

	setup: function () {
		this.on('destroy', function (e) {
			// Make sure to clean up the interval timer
			clearInterval(this.intervalId);
		});

		var loc = new App.Models.Location({screenid: "NONE"});
		this.set('location', loc);
		var _this = this;
		_this.checkLocation(_this);
		// Check location every 500 ms
		this.intervalId = setInterval(function () {
			_this.checkLocation.call(_this);
		}, 500);
		console.log("intervalId:", this.intervalId);
	},

	parse: function (resp) {
		if (resp.status == 'ok' && 'user' in resp) {
			return resp.user;
		} else {
			console.log("Something went wrong!");
		}
	},

	checkLocation: function () {
		var _this = this;
		if (!App.options.DUMMY_LOC) {
			$.getJSON('http://gi-ego.media.mit.edu/' + _this.get("username") + '/events/1', function (resp) {

				if (resp && resp.events.length > 0 && resp.events[0].readerid && resp.events[0].tstamp) {
					var screenid = resp.events[0].readerid;
					var loc = App.locations.get(screenid);
					var tstmp = resp.events[0].tstamp;
					tstmp = new Date(tstmp);
					// Only update the model if there is a change
					if (_this.get('location') != loc || _this.get('tstamp') - tstmp != 0) {
						console.log("Updating location/tstamp", _this.get('username'), loc, _this.get('location'), tstmp, _this.get('tstamp'));
						_this.set({
							location: loc,
							tstamp: tstmp
						});

					}
				} else if (resp && resp.events.length === 0) {
					var loc = null;
					var tstmp = null;
					// Only update the model if there is a change
					if (_this.get('location') != loc || _this.get('tstamp') != tstmp) {
						console.log("Updating location/tstamp", _this.get('username'), loc, _this.get('location'), tstmp, _this.get('tstamp'));
						_this.set({
							location: loc,
							tstamp: tstmp
						});

					}
				}
			});
			
		} else {
			$.getJSON('/dummyloc/getloc', function (resp) {
				// console.log("response from /lastloc (w/ dummy locaction):", resp);
				if (resp.status == "ok" && resp.loc) {
					var loc = App.locations.get(resp.loc.screenid);
					if (_this.get('location') != loc) {
						console.log("Updating location for", _this.get('username'), loc);
						_this.set({
							location: loc,
							tstamp: new Date()
						});
					}
				} 
			});
		}
	},

	isStale: function () {
		if (this.get('location') && this.get('tstamp') 
			&& this.get('location').get('screenid') !== "NONE") {
			var now = new Date();
			var last = this.get('tstamp');
			var diff = now.getTime() - last.getTime();
			if (diff < this.get('stale')) return false;
		}
		return true;
	},

	

	toString: function () {
		return this.get("username");
	}

});

App.Models.LoggedInUser = App.Models.User.extend({
	initialize: function () {
		console.log("Initializing logged in user");
		this.on('change:location change:tstamp', this.postUpdateLocation );
		this.setup();
	},

	markMessageRead: function (msg) {
		// Mark msg read and persist in backend
		var id = msg.get('_id');

		$.post('/messages/read/'+id, function (resp) {
			console.log("Response from markign message as read:", resp);
		});

		//remove from unread and add to read messages
		App.unreadMsgs.remove(msg);
		if (App.readMsgs) App.readMsgs.unshift(msg);
	},

	postUpdateLocation: function () {
		var loc = this.get('location').get('screenid'), tstamp = this.get('tstamp');
		$.post('/user/location/update', 
			{screenid: loc, tstamp: tstamp }, 
			function (resp) {
				if (resp.status && resp.status == "error") {
					console.log("Response from updating user location:", resp);				
				}
		});
	},

	logout: function () {
		$.post('/logout', function (resp) {
		});
		// Don't even wait for response
		// Destroy this user and redirect to login
		App.User = null;
		App.router.navigate('login', {trigger: true});
	},
});

App.Collections.Users = Backbone.Collection.extend({
	// Keep track of all the users we know of on the front end
	model: App.Models.User,

	initialize: function () {

	},

	getOrCreate: function (attrs) {
		/*
		 * Factory method for creating users
		 */

		var key = this.model.prototype.idAttribute;

		var existingModel = this.get(attrs[key]);
		if (existingModel) {
			return existingModel;
		}
		var model = new this.model(attrs);
		this.add(model);

		return model;		
	}

});

App.Collections.FollowingList = Backbone.Collection.extend({
	model: App.Models.User,

	initialize: function () {
		console.log("Initializing followingList");

	}
});


App.Models.Location = Backbone.Model.extend({
	idAttribute: "screenid",

	url: function () {
		return '/locations/' + this.get('screenid');
	},

	initialize: function () {

	},

	toString: function () {
		return this.get("screenid");
	},
	parse: function (response) {
		if ('loc' in response) response = response.loc;
		for (var i=0, group; group=response.groups[i]; i++) {
			response.groups[i] = new App.Models.Group(group);
		}

		return response
	}
});

App.Collections.Locations = Backbone.Collection.extend({
	url: '/locations/all',

	model: App.Models.Location,

	findKey: 'screenid',

	initialize: function () {

	},

	parse: function (response) {
		return response.locs;
	}


});

App.Models.Group = Backbone.Model.extend({
	idAttribute: "_id",

	url: function () {
		return '/groups/' + this.get('groupid');
	},

	initialize: function () {

	},

	parse: function (response) {
		if ('group' in response) response = response.group;
		for (var i=0, project; project=response.projects[i]; i++) {
			response.projects[i] = new App.Models.Project(project);
		}
		return response;
	}
});

App.Models.Project = Backbone.Model.extend({
	idAttribute: "_id",

	url: function () {
		return '/projects/' + this.get('pid');
	},
	parse: function (response) {
		if ('project' in response) return response.project;
	}
});

App.Collections.Charms = Backbone.Collection.extend({
	url: function () {
		return '/user/'+ this.user.get('username') + '/charms';
	},

	initialize: function () {
		this.user = App.User;
	},

	parse: function (response) {
		if ('charms' in response) response = response.charms;
		for (var i=0; i < response.length; i++) {
			response[i].project = new App.Models.Project(response[i].project);
		}
		return response;
	}
});	




