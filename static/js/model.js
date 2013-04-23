// javascript:debugger

App.Models.Message = Backbone.Model.extend({
	idAttribute: "_id",

	url: '/message',

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

	isForAllUsers: function () {
		var allUName = App.Models.User.prototype.specialUsernames.ALL;
		return !!this.get('to').get(allUName);
	},

	isForAllLocs: function () {
		return this.get('triggerLocs').hasNoneLoc();
	},

	validate: function (attrs, options) {
		if (!attrs.sender) return "Must have a sender";
		if (!attrs.to.length) return "Must have at least one recipient";
		if (!attrs.subject.trim()) return "Must have subject";
		if (!attrs.body.trim()) return "Must have a message body";
	},

	parse: function (response) {
		if ('message' in response) response = response.message;
		else if ('msg' in response) response = response.msg;

		response.sender = App.allUsers.getOrCreate(response.sender);
		var toCollection = new App.Collections.Users();
		_.each(response.to, function (elem) {
			elem = App.allUsers.getOrCreate(elem);
			toCollection.add(elem);
		});
		response.to = toCollection;

		var locsCollection = new App.Collections.Locations();
		_.each(response.triggerLocs, function (elem) {
			var loc = App.locations.get((elem.screenid || elem.id));
			if (!loc) {
				throw new Error("Couldn't find loc: "+loc);
			}
			locsCollection.add(loc);
		});
		response.triggerLocs = locsCollection;
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
			url += '/' + this.start + '/' + (this.end-this.start);
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

	specialUsernames: {
		RECOMMENDER: "recommender",
		ALL: "all"
	},

	isSpecialUser: function () {
		for (prop in this.specialUsernames) {
			if (this.id === this.specialUsernames[prop]) return true;
		}
		return false;
	},

	url: function () {
		return '/user/' + this.id;
	},

	initialize: function (attrs, options) {
		this.setup(attrs, options);
	},

	setup: function (attrs, options) {
		options = options || {};
		this.on('destroy', function (e) {
			// Make sure to clean up the interval timer
			clearInterval(this.intervalId);
		});

		this.updateVirtuals();

		this.on('change:firstname change:lastname', this.updateVirtuals);

		var loc = App.locations.getNoneLoc();
		this.set('location', loc);
		if (!this.isSpecialUser() && options.fetch !== false) {
			// Recommender is a fake user in our system so won't have a location
			var _this = this;
			_this.checkLocation(_this);
			// Check location every 500 ms
			this.intervalId = setInterval(function () {
				_this.checkLocation.call(_this);
			}, 500);
			console.log("intervalId:", this.intervalId);
			
		}
	},

	updateVirtuals: function () {
		if (this.get('firstname') && this.get('lastname')) {
			this.set('fullname', this.get('firstname')+ " " + this.get('lastname'));
		} else {
			this.set('fullname', this.id);
		}
		var displayName = this.id === this.get('fullname') ? this.id : this.get('fullname') + " (" + this.id + ")";
		this.set('displayName', displayName);
	},

	parse: function (resp) {
		if (resp.status == 'ok' && 'user' in resp) {
			return resp.user;
		} else {
			console.log("Something went wrong!");
		}
	},

	isRecommender: function () {
		// Checks if this user is the special recommender user
		return this.get('username').toLowerCase() === this.specialUsernames.RECOMMENDER;
	},

	isAllUser: function () {
		return this.get('username').toLowerCase() === this.specialUsernames.ALL;
	},

	checkLocation: function () {
		var _this = this;
		if (!App.options.DUMMY_LOC) {
			$.getJSON('http://gi-ego.media.mit.edu/' + _this.get("username") + '/events/1', function (resp) {

				// If there are no events, there never have been,
				// (should never go from having a location to never having been seen)
				// so we don't need to do anything in that case
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
			&& !this.get('location').isNoneLoc()) {
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
		var loc = this.get('location').id, tstamp = this.get('tstamp');
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

		var model = this.create(attrs, {
			success: function (model, xhr, options) {
				console.log("Successfully added model");
			},
			error: function (model, xhr, options) {
				model.destroy();
				alert("Could not validate this username");
			}
		});

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

	noneLocId: "none",

	url: function () {
		return '/locations/' + this.id;
	},

	initialize: function () {
		var regex = new RegExp("^"+this.get('name').toLowerCase());
		var displayName = this.id.match(regex) ? this.get('name') : this.get('name') + " (" + this.id + ")";
		this.set('displayName', displayName);
	},

	toString: function () {
		return this.get("screenid");
	},

	isNoneLoc: function () {
		return this.id == this.noneLocId;
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

	initialize: function () {

	},

	comparator: function (location) {
		return location.id;
	},

	parse: function (response) {
		return response.locs;
	},

	getNoneLoc: function () {
		return this.get(this.model.prototype.noneLocId);
	},

	hasNoneLoc: function () {
		return !!this.get(this.model.prototype.noneLocId);
	}


});

App.Models.Group = Backbone.Model.extend({
	idAttribute: "groupid",

	url: function () {
		return '/groups/' + this.id;
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
	idAttribute: "pid",

	url: function () {
		return '/projects/' + this.id;
	},
	parse: function (response) {
		if ('project' in response) response = response.project;
		return response;
	}
});

App.Models.Charm = App.Models.Project.extend({
	url: function () {
		return '/api/charms/' + this.id;
	}
});

App.Collections.Charms = Backbone.Collection.extend({
	model: App.Models.Charm,

	url: '/api/charms',

	initialize: function () {
		this.user = App.User;
	},

	parse: function (response) {
		if ('charms' in response) response = response.charms;
		return response;
	}
});	




