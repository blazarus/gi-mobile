/*
 * Set up the globally accessible App object
 */

window.App = {
	EventDispatcher: {},
	Models: {},
	Collections: {},
	Routers: {},
	Views: {},
	Templates: {
		"login": null,
		"messageList": null,
		"message": null,
		"postMessage": null,
		"locate": null,
		"locateListElem": null
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

		App.msgs = new App.Collections.Messages();

		App.msgs.fetch({
			success: function () {
				console.log("Messages:", App.msgs);
				App.msgListView.render();

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

			App.msgs.add(new App.Models.Message(data.msg, { parse: true }));
		});
	}
};