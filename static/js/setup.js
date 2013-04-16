/*
 * Set up the globally accessible App object
 */

 // javascript:debugger;

window.App = {
	serverURL: "http://0.0.0.0:8080",
	EventDispatcher: {},
	Models: {},
	Collections: {},
	Routers: {},
	Views: {},
	Templates: {
		"login": null,
		"readMessages": null,
		"unreadMessages": null,
		"message": null,
		"postMessage": null,
		"locate": null,
		"locateListElem": null,
		"viewCharms": null,
		"charmListElem": null
	},
	User: null, // The logged in user (null when not logged in)
	options: {
		DUMMY_LOC: false // Use fake location for testing
	},
	init: function(){
		App.EventDispatcher = _.clone(Backbone.Events);
		App.EventDispatcher.on('login_success', App.onLoginSuccess);
		App.EventDispatcher.on('templates_loaded', App.onTemplatesLoaded);

		App.allUsers = new App.Collections.Users();
		App.loadTemplates();
	},
	loadTemplates: function () {
		console.log("Attempting to load templates");
		var count = 0;
		var target = Object.keys(App.Templates).length;

		for (tmpl in window.App.Templates) {
			(function (tmpl) {
				// Expects templates to be accessible from /templates/<tmpl>
				$.get('/templates/' + tmpl + '.html', function (data) {
					window.App.Templates[tmpl] = data;
					if (++count >= target) {
						// All templates have been loaded, fire event
						App.EventDispatcher.trigger('templates_loaded');
					}
					console.log("How many templates have been loaded?", count, "out of", target);
				});
			})(tmpl); // Pass tmpl in here to seal in value when callback is run
		}
	},
	onTemplatesLoaded: function () {
		console.log("All templates have been loaded successfully");
		App.router = new App.Routers.main();
		Backbone.history.start({pushState: true});
	},
	onLoginSuccess: function () {
		console.log("Login successful. Event triggered, in onLogin");
		// Called once user has been logged in

		console.log("App.User:", App.User);
		App.userInfoView = new App.Views.UserView({ model: App.User });

		
		App.followingUsers = new App.Collections.FollowingList();

		App.unreadMsgs = new App.Collections.UnreadMessages();
		// App.newMsgView = new App.Views.NewMsg({ collection: App.unreadMsgs });

		App.unreadMsgs.fetch({
			success: function (collection, response, options) {
				console.log("Unread messages:", App.unreadMsgs);
				App.EventDispatcher.trigger('newMsgsLoaded');
				App.unreadMsgs.loaded = true;
			},
			error: function (collection, response, options) {
				console.log("Error in fetch:", collection, response);
			}
		});

		App.locations = new App.Collections.Locations();

		App.locations.fetch({
			success: function (collection, response, options) {
				console.log("Fetched locations:", collection, response);

				App.locations.fetched = true;
				App.locations.trigger('fetched');
			},
			error: function (collection, response, options) {
				console.log("Error in fetch:", collection, response);
			}
		});

		// Set up socket.io
		App.socket = io.connect('http://localhost');

		App.socket.on('ask_username', function (data) {
			console.log("Socket.io asking for logged in username:", App.User.get('username'));
			App.socket.emit('response_username', { username: App.User.get("username")});

		});

		App.socket.on('msg', function (data) {
			console.log("Got a new message:", data);
			App.socket.emit('ack', { status: 'received' });

			App.unreadMsgs.unshift(new App.Models.Message(data.msg, { parse: true }));
		});
	}
};