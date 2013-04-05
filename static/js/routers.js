// javascript:debugger;

App.Routers.main = Backbone.Router.extend({

	routes: {
		"": "index",
		"messages/view": "listMessages",
		"login": "showLogin",
		"messages/post": "postMessage",
		"locate": "locate"
	},

	requiresLogin: ["listMessages", "postMessage", "locate"],

	initialize: function () {

		this.wrapRoutes();


		var _this = this;
		// router doesn't automatically catch normal links
		$(document).on("click", "a[href^='/']", function (e) {
			var href = $(e.currentTarget).attr('href');
			href = href.slice(1);

			// don't screw with it if user opening a new tab or something
			// or if it's not one of our routes
			// For example, we want the page to reload for logout
			if (href in _this.routes && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
				e.preventDefault();

				_this.navigate(href, { trigger: true });
			}

		});
	},


	wrapRoutes: function () {
		// Update routes that require login
		// Do this by wrapping the route function with checkLogin

		// Build a reverse lookup table for routes
		var reverseRoutes = {};
		for (var frag in this.routes) {
			var func = this.routes[frag];
			if (_.contains(this.requiresLogin, func)) {
				if (!(func in reverseRoutes)) {
					reverseRoutes[func] = [];	
				} 
				reverseRoutes[func].push(frag);
			}
		}

		// Now wrap the functions and update the router with the wrapped fns
		for (var i = 0; i < this.requiresLogin.length; i++) {
			var fname = this.requiresLogin[i];
			this[fname] = this.checkLogin(this[fname]);

			// Need to manually update the function called for that route
			// Each function could be mapped to by multiple url fragments
			for (var j = 0; j < reverseRoutes[fname].length; j++) {
				var frag = reverseRoutes[fname][j];
				this.route(frag, fname);
			}
		}
	},

	checkLogin: function (func) {
		return function () {

			console.log("Checking login status");
			var _this = this;
			if (!window.App.User) {
				// User not known, check with server to see if already logged in
				$.getJSON('/checklogin', function (resp) {

					console.log("Response from checklogin:", resp);

					if (resp.status == "ok" && resp.username) {
						window.App.User = new window.App.Models.User({
							username: resp.username
						});
						console.log("User logged in, continue");
						return func();
					} else {
						// User not logged in, redirect to login page
						console.log("User not logged in, redirect to login page")
						return _this.navigate("login", { trigger: true });
					}
				});

			} else {
				console.log("User logged in, continue");
				return func();
			}
		}
	},

	index: function () {
		this.navigate("messages/view", { trigger: true });
	},

	listMessages: function () {
		console.log("navigating to list messages", window.App.Templates['messageList']);

		$(".container").html($(window.App.Templates.messageList));

		console.log("App.User:", App.User);
		App.userInfoView = new App.Views.UserView({ model: App.User });

		App.msgs = new App.Collections.Messages();

		App.msgListView = new App.Views.MessageListView({
			collection: App.msgs
		});

		App.msgs.fetch({
			success: function () {
				console.log("Messages:", App.msgs);
				App.msgListView.render();

			}
		});

	},

	postMessage: function () {
		console.log("navigating to post message", window.App.Templates['postMessage']);

		$(".container").html($(window.App.Templates.postMessage));

		console.log("App.User:", App.User);
		App.userInfoView = new App.Views.UserView({ model: App.User });

		App.postMsgView = new App.Views.PostMessageView();

		// TODO: This should probably be done with models and views
		$.getJSON('/locations/all', function (resp) {
			console.log("Response from all locations:", resp);
			var container = $(document.createDocumentFragment()); 
			for (var i=0, loc; loc=resp[i]; i++) {
				container.append($("<option>").attr("value", loc).text(loc));
			}
			$("#compose-message #loc").append(container);
		});
	},

	locate: function () {
		console.log("navigating to locate user", window.App.Templates.locate);
		$(".container").html($(window.App.Templates.locate));

		console.log("App.User:", App.User);
		App.userInfoView = new App.Views.UserView({ model: App.User });

		App.followingUsers = new App.Collections.FollowingList();
		App.locateView = new App.Views.LocateUserView({ collection: App.followingUsers });

	},

	showLogin: function() {
		console.log("navigating to login", window.App.Templates.login);
		var tmpl = _.template(window.App.Templates.login)();
		$(".container").html(tmpl);
		App.loginView = new App.Views.LoginView();
	}

});