// javascript:debugger

App.Models.Message = Backbone.Model.extend({
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
		response.sender = App.allUsers.getOrCreate({ _id: response.sender });
		response.to = _.map(response.to, function (id) {
			return App.allUsers.getOrCreate({ _id: id });
		});
		response.triggerLocs = _.map(response.triggerLocs, function (id) {
			return new App.Models.Location({ _id: id });
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
	defaults: {
		username: "",
		location: null,
		tstamp: null
	},

	url: function () {
		var params = {
			_id: this.get('_id'),
			username: this.get('username')
		};
		params = $.param(params);
		return '/user?' + params;
	},

	initialize: function () {
		this.on('destroy', function (e) {
			// Make sure to clean up the interval timer
			clearInterval(this.intervalId);
		});

		var loc = new App.Models.Location({screenid: "NONE"});
		this.set('location', loc);
		var _this = this;
		this.on('change:location', function (e) {
			var f = function () {
				var loc = App.locations.get(_this.get('location'));

			};
			// Do if fetched already or wait until fetched
			if (App.locations.fetched) {
				f();
			} else {
				_this.listenToOnce(App.locations, 'fetched', f);
			}
		});

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

	checkUsername: function (success, failure) {
		// Validate that this is a legit media lab user
		var _this = this;
		$.getJSON('/checkuser', {username: this.get("username")}, function (resp) {
			console.log("Response from checking username:", resp);
			if (resp.status === "ok") {
				success();
			} else {
				// _this.destroy();
				console.log("This is not a valid username:", this.get('username'));
				// alert("This is not a valid username.");
				failure();
			}
		});
	},

	checkLocation: function () {
		var _this = this;
		if (!App.options.DUMMY_LOC) {
			$.getJSON('http://gi-ego.media.mit.edu/' + _this.get("username") + '/events/1', function (resp) {

				if (resp && resp.events.length > 0 && resp.events[0].readerid && resp.events[0].tstamp) {
					var screenid = resp.events[0].readerid;
					var loc = App.locations.getOrCreate({ screenid: screenid });
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
					var loc = App.locations.getOrCreate(resp.loc);
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

	toString: function () {
		return this.get("username");
	}

});

App.Collections.Pool = Backbone.Collection.extend({
	model: Backbone.Model,

	findKey: "_id",

	getOrCreate: function (attrs, options) {
		/*
		 * Factory method for creating users
		 * options:
		 * 		forceFetch -> fetch/populate model even if already in Pool
		 * 		suppressFetch -> don't fetch/populate even if not in Pool
		 * 		findKey -> override default. key for which to search for the Model
		 */

		options = options || {};
		
		var key = options.findKey || this.findKey;
		
		var doFetch = function () {
			model.fetch({
				success: function (model, response, options) {
					console.log("Successfully fetched model:", model);
				}, 
				error: function (model, response, options) {
					console.log("Error fetching model:", response.responseText, model);
					model.destroy();
				}
			});
		};

		var findFilter = {};
		if (key in attrs) {
			findFilter[key] = attrs[key];
		} else if ('_id' in attrs) {
			findFilter['_id'] = attrs['_id'];
		}
		var existingModel = this.findWhere(findFilter);
		if (existingModel) {
			if (options.forceFetch) doFetch();
			return existingModel;
		}
		var model = new this.model(attrs);
		this.add(model);
		if (!options.suppressFetch) {
			doFetch();
		}
		return model;		
	}
});

App.Collections.Users = App.Collections.Pool.extend({
	// Keep track of all the users we know of on the front end
	model: App.Models.User,

	findKey: 'username',

	initialize: function () {

	}

});

App.Collections.FollowingList = Backbone.Collection.extend({
	model: App.Models.User,

	initialize: function () {
		console.log("Initializing followingList");

	}
});


App.Models.Location = Backbone.Model.extend({
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

App.Collections.Locations = App.Collections.Pool.extend({
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




