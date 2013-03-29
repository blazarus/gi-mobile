// javascript:debugger
App.Models.Message = Backbone.Model.extend({
	initialize: function () {
		
	},
	toString: function () {
		return "Listing:" + this.title;
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
		tstamp: ""
	},

	initialize: function () {
		var _this = this;
		_this.checkLocation(_this);
		setInterval(function () {
			_this.checkLocation(_this);
		}, 500);
	},

	checkLocation: function (_this) {

		if (!App.options.DUMMY_LOC) {
			$.getJSON('http://gi-ego.media.mit.edu/' + _this.get("username") + '/events/1', function (resp) {

				if (resp && resp.events.length > 0 && resp.events[0].readerid && resp.events[0].tstamp) {
					var loc = resp.events[0].readerid;
					var tstmp = resp.events[0].tstamp;
					// Only update the model if there is a change
					if (_this.get('location') != loc || _this.get('tstamp') != tstmp) {
						console.log("Updating location/tstamp", loc, _this.get('location'), tstmp, _this.get('tstamp'));
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
				if (resp.status == "ok" && resp.loc) {
					if (_this.get('location') != resp.loc) {
						console.log("Updating location", resp.loc);
						_this.set({
							location: resp.loc
						});

					}
				}
			});
		}
	}

});



