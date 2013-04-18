/*
 * Set up the globally accessible App object
 */

 // javascript:debugger;

window.App = {
	EventDispatcher: {},
	Models: {},
	Collections: {},
	Routers: {},
	Views: {},
	Templates: {
		"login": null,
		"userinfo": null,
		"readMessages": null,
		"unreadMessages": null,
		"message": null,
		"postMessage": null,
		"locate": null,
		"locateListElem": null,
		"viewCharms": null,
		"charmListElem": null,
		"projectInfo": null
	},
	User: null, // The logged in user (null when not logged in)
	options: {
		DUMMY_LOC: false // Use fake location for testing
	},
	init: function(){
		$("loader").show();
		App.EventDispatcher = _.clone(Backbone.Events);
		App.EventDispatcher.on('login_success', App.onLoginSuccess);
		App.EventDispatcher.on('templates_loaded', function () {
			if (App.locations.fetched) {
				App.startRouter();
			} else {
				App.EventDispatcher.listenToOnce(App.locations, 'fetched', App.startRouter);
			}
		});

		App.allUsers = new App.Collections.Users();
		App.loadTemplates();

		App.locations = new App.Collections.Locations();
		App.locations.fetch({
			success: function (collection, response, options) {
				console.log("Fetched locations:", collection, response);
				App.locations.fetched = true;
				App.locations.trigger('fetched');
			},
			error: function (collection, response, options) {
				console.log("Error in fetch:", collection, response);
				throw new Error("Error fetching locations");
			}
		});
	},
	loadTemplates: function () {
		console.log("Attempting to load templates");
		var startTime = new Date();
		var count = 0;
		var target = Object.keys(App.Templates).length;

		for (tmpl in window.App.Templates) {
			(function (tmpl) {
				// Expects templates to be accessible from /templates/<tmpl>
				$.get('/templates/' + tmpl + '.html', function (data) {
					window.App.Templates[tmpl] = data;
					if (++count >= target) {
						// All templates have been loaded, fire event
						var endTime = new Date();
						console.log("Loading templates took:", (endTime-startTime)+"ms");
						App.EventDispatcher.trigger('templates_loaded');
					}
					console.log("How many templates have been loaded?", count, "out of", target);
				});
			})(tmpl); // Pass tmpl in here to seal in value when callback is run
		}
	},
	startRouter: function () {
		console.log("All templates and locations have been loaded successfully");
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
		
		var fetchUnreadMsgs = function () {
			App.unreadMsgs.fetch({
				success: function (collection, response, options) {
					console.log("Unread messages:", App.unreadMsgs);
					App.EventDispatcher.trigger('newMsgsLoaded');
					App.unreadMsgs.loaded = true;
					App.newMsgAlertView = new App.Views.NewMessageAlert({
						collection: App.unreadMsgs,
						user: App.User
					});
				},
				error: function (collection, response, options) {
					console.log("Error in fetch:", collection, response);
				}
			});
		};
		if (App.locations.fetched) {
			fetchUnreadMsgs();
		} else {
			App.EventDispatcher.listenToOnce(App.locations, 'fetched', fetchUnreadMsgs);
		}
		App.charms = new App.Collections.Charms({ user: App.User });
		App.charms.fetch({
			success: function (collection, response, options) {
				console.log("Charms fetched:", App.charms);
				App.charms.trigger('fetched');
				App.charms.fetched = true;
				App.charmsView = new App.Views.Charms({ collection: collection });
				App.charmsView.render();
				$("#loader").hide();
			},
			error: function (collection, response, options) {
				console.log("Error in fetch:", collection, response);
			}
		});

		// Set up socket.io
		App.socket = io.connect('/');

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