// javascript:debugger;

App.Routers.main = Backbone.Router.extend({

	routes: {
		"": "index",
		"messages/view": "listMessages",
		"login": "showLogin",
		"messages/post": "postMessage",
		"locate": "locate"
	},

	urlFor: {
		// Built by this.buildReverseLookup()
	},

	requiresLogin: ["listMessages", "postMessage", "locate"],

	initialize: function () {
		this.buildReverseLookup();
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

	buildReverseLookup: function () {
		// Build a reverse lookup table to get url from function
		for (var frag in this.routes) {
			var func = this.routes[frag];
			if (_.contains(this.requiresLogin, func)) {
				if (!(func in this.urlFor)) {
					this.urlFor[func] = [];	
				} 
				this.urlFor[func].push(frag);
			}
		}
	},

	wrapRoutes: function () {
		// Update routes that require login
		// Do this by wrapping the route function with checkLogin
		// Now wrap the functions and update the router with the wrapped fns
		for (var i = 0; i < this.requiresLogin.length; i++) {
			var fname = this.requiresLogin[i];
			this[fname] = this.checkLogin(this[fname]);

			// Need to manually update the function called for that route
			// Each function could be mapped to by multiple url fragments
			for (var j = 0; j < this.urlFor[fname].length; j++) {
				var frag = this.urlFor[fname][j];
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
					javascript:debugger;
					if (resp.status == "ok" && resp.user) {
						window.App.User = App.allUsers.getOrCreate(resp.user);
						App.User.set("validated", true); // No need to do another check of the username
						console.log("User logged in, continue. The user:", App.User);

						App.EventDispatcher.trigger('login_success');

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

		$(".main-content").html($(window.App.Templates.messageList));
		$("nav li").removeClass("active");
		$("nav li#viewMessages").addClass("active");

		App.msgListView = new App.Views.MessageListView({
			collection: App.msgs
		});

	},

	postMessage: function () {
		console.log("navigating to post message", window.App.Templates['postMessage']);

		$(".main-content").html($(window.App.Templates.postMessage));
		App.postMsgView = new App.Views.PostMessageView();

		$("nav li").removeClass("active");
		$("nav li#postMessages").addClass("active");

	},

	locate: function () {
		console.log("navigating to locate user", window.App.Templates.locate);
		$(".main-content").html($(window.App.Templates.locate));
		App.locateView = new App.Views.LocateUserView({ collection: App.followingUsers });

		$("nav li").removeClass("active");
		$("nav li#locate").addClass("active");

	},

	showLogin: function() {
		console.log("navigating to login", window.App.Templates.login);
		var tmpl = _.template(window.App.Templates.login)();
		$(".main-content").html(tmpl);
		App.loginView = new App.Views.LoginView();
	}

});