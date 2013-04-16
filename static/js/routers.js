// javascript:debugger;

App.Routers.main = Backbone.Router.extend({

	routes: {
		"login": "showLogin",
		"": "index",
		"messages/view/unread": "unreadMessages",
		"messages/view/read": "readMessages",
		"messages/post": "postMessage",
		"locate": "locate",
		"project-browser": "browseProjects",
		"project-browser/*path": "browseProjects",
		"charms": "viewCharms"
	},

	urlFor: {
		// Built by this.buildReverseLookup()
	},

	requiresLogin: ["browseProjects", "unreadMessages", "readMessages", "postMessage", "locate", "viewCharms"],

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
					if (resp.status == "ok" && resp.user) {
						window.App.User = App.allUsers.getOrCreate(resp.user, { fetch: false });
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
		this.navigate("messages/view/read", { trigger: true });
	},

	browseProjects: function () {
		if (!App.projectBrowserRouter) {
			App.projectBrowserRouter = new App.Routers.ProjectBrowser();
			Backbone.history.stop();
			Backbone.history.start();
		}

		$("nav li").removeClass("active");
		$("nav li#projectBrowser").addClass("active");
	},

	unreadMessages: function () {
		console.log("Navigating to unread/new messages");

		$(".main-content").html($(window.App.Templates.unreadMessages));
		$("nav li").removeClass("active");
		$("nav li#unreadMessages").addClass("active");

		// If unreadMsgs already loaded, create view immediately,
		// otherwise wait for them to be loaded
		if (App.unreadMsgs.loaded) {
			App.newMsgListView = new App.Views.MessageList({
				collection: App.unreadMsgs,
				messageView: App.Views.NewMessage
			}).render();
		} else {
			App.EventDispatcher.on('newMsgsLoaded', function () {
				App.newMsgListView = new App.Views.MessageList({
					collection: App.unreadMsgs,
					messageView: App.Views.NewMessage
				}).render();
			});
		}
		
	},

	readMessages: function () {
		console.log("navigating to old/read messages");

		$("nav li").removeClass("active");
		$("nav li#readMessages").addClass("active");

		var resultsPerPage = 10;

		App.readMsgs = new App.Collections.ReadMessages([], {
			start: 0,
			end: resultsPerPage
		});

		App.readMsgs.fetch({
			success: function (collection, response, options) {
				console.log("Read messages:", App.readMsgs);
				App.readMsgsView = new App.Views.ReadMessages({
					collection: App.readMsgs,
					resultsPerPage: resultsPerPage
				})
				.render();
			},
			error: function (collection, response, options) {
				console.log("Error in fetch:", collection, response);
			}
		});
	},

	postMessage: function () {
		console.log("navigating to post message", window.App.Templates['postMessage']);

		$(".main-content").html($(window.App.Templates.postMessage));
		App.postMsgView = new App.Views.PostMessageView({ collection: App.locations });

		$("nav li").removeClass("active");
		$("nav li#postMessages").addClass("active");

	},

	locate: function () {
		console.log("navigating to locate user");
		$(".main-content").html($(window.App.Templates.locate));
		App.locateView = new App.Views.LocateUserView({ collection: App.followingUsers });

		$("nav li").removeClass("active");
		$("nav li#locate").addClass("active");

	},

	viewCharms: function () {
		console.log("navigating to locate user");
		$(".main-content").html($(window.App.Templates.viewCharms));
		App.charms = new App.Collections.Charms();
		App.charms.fetch({
			success: function (collection, response, options) {
				App.charmsView = new App.Views.Charms({ collection: collection });
				App.charmsView.render();
			},
			error: function (collection, response, options) {
				console.log("Error in fetch:", collection, response);
			}
		});

		$("nav li").removeClass("active");
		$("nav li#charms").addClass("active");

	},

	showLogin: function() {
		console.log("navigating to login");
		var tmpl = _.template(window.App.Templates.login)();
		$(".main-content").html(tmpl);
		App.loginView = new App.Views.LoginView();
	}

});

App.Routers.ProjectBrowser = Backbone.Router.extend({
	routes: {
		"project-browser": "showDefault",
		"project-browser/location/:screenid": "showLocation",
		"project-browser/:screenid": "showLocation",
		"project-browser/group/:groupid": "showGroup",
		"project-browser/project/:pid": "showProject"
	},

	initialize: function () {
		App.projectBrowserView = new App.Views.ProjectBrowser({ 
			user: App.User,
			locations: App.locations,
			router: this
		});
	},

	showDefault: function () {
		var screenid = App.User.get('location').get('screenid');
		this.showLocation(screenid);
		this.navigate('/project-browser/'+screenid);
	},

	showLocation: function (screenid) {
		var location = new App.Models.Location({ screenid: screenid });
		location.fetch({
			success: function (model, response, options) {
				$(".main-content").html(App.projectBrowserView.$el);
				App.projectBrowserView.showLoc(model);
			}
		});
	},

	showGroup: function (groupid) {
		var group = new App.Models.Group({ groupid: groupid });
		group.fetch({
			success: function (model, response, options) {
				$(".main-content").html(App.projectBrowserView.$el);
				App.projectBrowserView.showGroup(model);
			}
		});
	},

	showProject: function (pid) {
		var project = new App.Models.Project({ pid: pid });
		project.fetch({
			success: function (model, response, options) {
				$(".main-content").html(App.projectBrowserView.$el);
				App.projectBrowserView.showProject(model);
			}
		});
	}

})