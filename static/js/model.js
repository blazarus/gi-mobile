// javascript:debugger

App.Models.Location = Backbone.Model.extend({
	toString: function () {
		return this.get("name");
	}
});

App.Models.Message = Backbone.Model.extend({
	initialize: function () {
		
	},

	parse: function (response) {
		response.sender = App.allUsers.getOrCreate(response.sender);
		response.to = _.map(response.to, function (elem) {
			return App.allUsers.getOrCreate(elem);
		});
		response.triggerLocs = _.map(response.triggerLocs, function (elem) {
			return new App.Models.Location(elem);
		});
		return response;
	}
});

App.Collections.Messages = Backbone.Collection.extend({
	model: App.Models.Message,

	url: '/messages',

	initialize: function () {
		
	},

	parse: function (response) {
		console.log("Fetch returning:", response);
		return response.messages;
	}
});

App.Models.User = Backbone.Model.extend({
	defaults: {
		username: "",
		location: "",
		tstamp: "",
		validated: false
	},

	initialize: function () {
		this.on('destroy', function (e) {
			// Make sure to clean up the interval timer
			clearInterval(this.intervalId);
		});

		if (!this.get("validated")) {
			this.checkUsername();
		}
		var _this = this;
		_this.checkLocation(_this);
		// Check location every 500 ms
		this.intervalId = setInterval(function () {
			_this.checkLocation(_this);
		}, 500);
		console.log("intervalId:", this.intervalId);
	},

	checkUsername: function () {
		// Validate that this is a legit media lab user
		var _this = this;
		$.getJSON('/checkuser', {username: this.get("username")}, function (resp) {
			console.log("Response from checking username:", resp);
			if (resp.status === "ok") {

			} else {
				_this.destroy();
				alert("This is not a valid username.");
			}
		});
	},

	checkLocation: function (_this) {

		if (!App.options.DUMMY_LOC) {
			$.getJSON('http://gi-ego.media.mit.edu/' + _this.get("username") + '/events/1', function (resp) {

				if (resp && resp.events.length > 0 && resp.events[0].readerid && resp.events[0].tstamp) {
					var loc = resp.events[0].readerid;
					var tstmp = resp.events[0].tstamp;
					// Only update the model if there is a change
					if (_this.get('location') != loc || _this.get('tstamp') != tstmp) {
						console.log("Updating location/tstamp", _this.get('username'), loc, _this.get('location'), tstmp, _this.get('tstamp'));
						_this.set({
							location: loc,
							tstamp: tstmp
						});

					}
				} else if (resp && resp.events.length === 0) {
					var loc = "Has not been seen";
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
			$.getJSON('/lastloc', { dummy_loc: true }, function (resp) {
				// console.log("response from /lastloc (w/ dummy locaction):", resp);
				if (resp.status == "ok" && resp.loc && _this.get('location') != resp.loc) {
					console.log("Updating location", resp.loc);
					_this.set({
						location: resp.loc
					});
				}
			});
		}
	},

	toString: function () {
		return this.get("username");
	}

});

App.Collections.Users = Backbone.Collection.extend({
	// Keep track of all the users we know of on the front end
	model: App.Models.User,

	getOrCreate: function (attrs) {
		// Factory method for creating users
		var existingUser = this.findWhere({ username: attrs.username });
		if (existingUser) {
			return existingUser;
		}
		var user = new App.Models.User(attrs);
		this.add(user);
		return user;
	}
});

App.Collections.FollowingList = Backbone.Collection.extend({
	model: App.Models.User,

	initialize: function () {
		console.log("Initializing followingList");

	}
});

