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
		"charms": "viewCharms",
		"logout": "logout"
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
			// $("#loader").show();
			var href = $(e.currentTarget).attr('href');
			href = href.slice(1);

			// don't screw with it if user opening a new tab or something
			// or if it's not one of our routes
			// For example, we want the page to reload for logout
			if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
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
			$("#loader").show();
			var _this = this;
			if (!window.App.User) {
				// User not known, check with server to see if already logged in
				$.getJSON('/checklogin', function (resp) {

					console.log("Response from checklogin:", resp);
					if (resp.status == "ok" && resp.user) {
						App.User = new App.Models.LoggedInUser(resp.user);
						App.allUsers.add(App.User);						
						console.log("User logged in, continue. The user:", App.User);

						return $.when(App.onLoginSuccess()).then(func);
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

	logout: function () {
		if (App.User) App.User.logout();
	},

	index: function () {
		this.navigate("messages/view/unread", { trigger: true });
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
		$("#loader").show();

		$(".main-content").html($(window.App.Templates.unreadMessages));
		$("nav li").removeClass("active");
		$("nav li#unreadMessages").addClass("active");

		App.newMsgListView = new App.Views.MessageList({
			collection: App.unreadMsgs,
			messageView: App.Views.NewMessage
		}).render();
		$("#loader").hide();		
	},

	readMessages: function () {
		console.log("navigating to old/read messages");
		$("#loader").show();

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
				$("#loader").hide();
			},
			error: function (collection, response, options) {
				console.log("Error in fetch:", collection, response);
			}
		});
	},

	postMessage: function () {
		console.log("navigating to post message");
		$("#loader").show();
		App.postMsgView = new App.Views.PostMessage({ collection: App.locations });
		App.postMsgView.render();
		$("#loader").hide();

		$("nav li").removeClass("active");
		$("nav li#postMessages").addClass("active");

	},

	locate: function () {
		console.log("navigating to locate user");
		$(".main-content").html($(window.App.Templates.locate));
		App.locateView = new App.Views.LocateUserView({ collection: App.followingUsers });
		App.locateView.render();
		$("#loader").hide();

		$("nav li").removeClass("active");
		$("nav li#locate").addClass("active");

	},

	viewCharms: function () {
		console.log("navigating to view charms");
		$(".main-content").html($(window.App.Templates.viewCharms));

		App.charmsView = new App.Views.Charms({ collection: App.charms });
		App.charmsView.render();
		$("#loader").hide();

		$("nav li").removeClass("active");
		$("nav li#charms").addClass("active");

	},

	showLogin: function() {
		$("#loader").hide();
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

		this.on('route', this.updateNav);
	},

	updateNav: function (e) {
		$("nav li").removeClass("active");
		$("nav li#projectBrowser").addClass("active");
	},

	showDefault: function () {
		$("#loader").show();
		var screenid = App.Models.Location.prototype.noneLocId;
		if (!App.User.isStale()) {
			screenid = App.User.get('location').get('screenid');
		} 
		this.showLocation(screenid);
		this.navigate('/project-browser/'+screenid);
	},

	showLocation: function (screenid) {
		var loader = $("#loader").show();
		var location = App.locations.get(screenid);
		location.fetch({
			success: function (model, response, options) {
				$(".main-content").html(App.projectBrowserView.$el);
				App.projectBrowserView.showLoc(model);
				loader.hide();
			},
			error: function (model, response, options) {
				loader.hide();
				alert("Error loading groups for this location.");
			}
		});
	},

	showGroup: function (groupid) {
		var loader = $("#loader").show();
		var group = new App.Models.Group({ groupid: groupid });
		group.fetch({
			success: function (model, response, options) {
				$(".main-content").html(App.projectBrowserView.$el);
				App.projectBrowserView.showGroup(model);
				loader.hide();
			},
			error: function (model, response, options) {
				loader.hide();
				alert("Error loading projects for this group.");
			} 
		});
	},

	showProject: function (pid) {
		var loader = $("#loader").show();
		var project = new App.Models.Project({ pid: pid });
		project.fetch({
			success: function (model, response, options) {
				$(".main-content").html(App.projectBrowserView.$el);
				App.projectBrowserView.showProject(model);
				loader.hide();
			},
			error: function (model, response, options) {
				loader.hide();
				alert("Error loading project info.");
			}
		});
	}

})