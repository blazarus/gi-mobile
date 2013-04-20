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
		"projectInfo": null,
		"projectRecommendation": null
	},
	User: null, // The logged in user (null when not logged in)
	options: {
		DUMMY_LOC: false // Use fake location for testing
	},
	init: function(){
		$("loader").show();
		App.EventDispatcher = _.clone(Backbone.Events);
		App.EventDispatcher.on('login_success', App.onLoginSuccess);

		App.locations = new App.Collections.Locations();
		var locsDeffered = App.locations.fetch();
		App.allUsers = new App.Collections.Users();
		$.when(App.loadTemplates(), locsDeffered).then( function () {
			console.log("Loaded both templates and locations");
			App.router = new App.Routers.main();
			Backbone.history.start({pushState: true});
		});

		
	},
	loadTemplates: function () {
		console.log("Attempting to load templates");
		var startTime = new Date();
		var ajaxList = [];
		for (tmpl in App.Templates) {
			var jqXHR = $.get('/templates/' + tmpl + '.html');
			ajaxList.push(jqXHR);
		}
		// return the deffered object
		return $.when.apply($, ajaxList).then( function () {

			for (var i=0,key; key=Object.keys(App.Templates)[i]; i++) {
				App.Templates[key] = arguments[i][0];
			}
			var endTime = new Date();
			console.log("Loading templates took:", (endTime-startTime)+"ms");
		});
	},

	onLoginSuccess: function () {
		console.log("Login successful. Event triggered, in onLogin");
		// Called once user has been logged in
		$("#loader").show();
		console.log("App.User:", App.User);
		App.userInfoView = new App.Views.UserView({ model: App.User });

		App.followingUsers = new App.Collections.FollowingList();
		App.unreadMsgs = new App.Collections.UnreadMessages();
		App.charms = new App.Collections.Charms({ user: App.User });

		var defferedMsgs = App.unreadMsgs.fetch({
			success: function (collection, response, options) {
				console.log("Unread messages:", App.unreadMsgs);
				App.newMsgAlertView = new App.Views.NewMessageAlert({
					collection: App.unreadMsgs,
					user: App.User
				}).render();
			}
		});

		var defferedCharms = App.charms.fetch({
			success: function (collection, response, options) {
				console.log("Charms fetched:", App.charms);
			}
		});

		// Set up socket.io
		var socketUrl = window.location.hostname === "gimobile.media.mit.edu" ? "http://ochre.media.mit.edu:8080" : "/";
		App.socket = io.connect(socketUrl);

		App.socket.on('ask_username', function (data) {
			console.log("Socket.io asking for logged in username:", App.User.get('username'));
			App.socket.emit('response_username', { username: App.User.get("username")});

		});

		App.socket.on('msg', function (data) {
			console.log("Got a new message:", data);
			App.socket.emit('ack', { status: 'received' });
			App.unreadMsgs.unshift(new App.Models.Message(data.msg, { parse: true }));
		});

		return $.when(defferedMsgs, defferedCharms).then(
			function () {
				console.log("Fetched collections");
			}, function () {
				console.log("Error fetching collections");
				$("#loader").hide();
				alert("Sorry, something went wrong.");
			});
		
	}
};