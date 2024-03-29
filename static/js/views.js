// javascript:debugger

App.Views.Header = Backbone.View.extend({
	el: "header",

	template: function (attrs) {
		return _.template(App.Templates.header)(attrs);
	},

	render: function () {
		this.$el.html(this.template());
		return this;
	}
});

App.Views.ReadMessages = Backbone.View.extend({
	el: ".main-content",

	events: {
		"click .pager #newer a": "decreasePage",
		"click .pager #older a": "increasePage"
	},

	initialize: function () {
		this.page = 0;
		this.lastPage = Math.max(Math.ceil(this.collection.total/this.options.resultsPerPage - 1), 0);

		// Initial rendering
		var tplt = this.template();
		this.$el.empty().html(tplt);

		this.msgListView = new App.Views.MessageList({
			collection: this.collection,
			messageView: App.Views.Message
		});
	},

	template: function () {
		return _.template(window.App.Templates.readMessages);
	},

	increasePage: function () {
		if (this.page < this.lastPage) {
			this.page++;
			this.collection.start += this.options.resultsPerPage;
			this.collection.end += this.options.resultsPerPage;
			var _this = this;
			this.collection.fetch({
				// pass silent and manually call render, so only done once
				// instead of for each model added
				silent: true,
				success: function (collection, response, options) {
					_this.render();
				},
				error: function (collection, response, options) {
					console.log("Error in fetch:", collection, response);
				}
			});
		}
	},

	decreasePage: function () {
		if (this.page > 0) {
			this.page--;
			this.collection.start -= this.options.resultsPerPage;
			this.collection.end -= this.options.resultsPerPage;
			var _this = this;
			this.collection.fetch({
				silent: true,
				success: function (collection, response, options) {
					_this.render();
				},
				error: function (collection, response, options) {
					console.log("Error in fetch:", collection, response);
				}
			});
		}
	},

	render: function () {
		this.$(".pager li").removeClass("disabled");
		if (this.page == 0) {
			this.$(".pager #newer").addClass("disabled");
		} 
		if (this.page == this.lastPage) {
			this.$(".pager #older").addClass("disabled");
		}
		this.$(".pageNumber").text("Page " + (this.page+1) + " of " + (this.lastPage+1));
		
		this.msgListView.render();
	}
});

App.Views.UnreadMessages = Backbone.View.extend({
	el: ".main-content",

	initialize: function () {

	}
});

App.Views.MessageList = Backbone.View.extend({
	el: ".message-list",

	initialize: function () {
		this.listenTo(this.collection, 'add', this.render);

		this.messageView = this.options.messageView || App.Views.Message;
	},

	render: function () {
		console.log("Message List being rendered");
		this.$el.html("");
		var that = this;
		var container = $(document.createDocumentFragment()); 
		// render each subview, appending to our root element
		this.collection.each( function (elem, idx) {
			var li = new that.messageView({ model: elem });
			li.render().$el.appendTo(container);
		});
		that.$el.append(container);

		return this;
	}
});

App.Views.NewMessageAlert = Backbone.View.extend({
	// Deals with popping up new messages
	el: ".main-content",

	initialize: function (options) {
		this.user = this.options.user;
		this.listenTo(this.collection, 'add', this.newMessage);
		this.listenTo(this.collection, 'add remove', this.render);

		$(".modal .btn-primary").on('click',function (e) {
			$(".modal").modal('hide');
			App.router.navigate('/messages/view/unread', { trigger: true });
		});
	},

	newMessage: function (msg) {
		if (App.phonegap) {
			// Vibrate twice for a second with 200 ms in between
			navigator.notification.vibrate(1000);
			setTimeout(function () { 
				navigator.notification.vibrate(1000); 
			}, 1200);
		}
		$(".modal").modal();
	},

	render: function () {
		// Update badge in nav
		var l = this.collection.length;
		// bootstrap makes it disappear when no text
		$(".nav .badge").text(l > 0 ? l : "");
		return this;
	}
});

App.Views.NewMessage = Backbone.View.extend({
	tagName: "li",

	className: "message",

	events: {
		"click .closebtn": "closeMessage"
	},

	initialize: function () {
		this.listenTo(this.model, 'change', this.render);
	},

	template: function (attrs) {
		if (this.model.get('sender').isRecommender()) {
			return _.template(App.Templates.projectRecommendation)(attrs);
		}
		return _.template(App.Templates.message)(attrs);
	},

	closeMessage: function () {
		var thisView = this;
		thisView.$el.fadeTo(
			'slow', 0,
			function () {
				thisView.$el.slideUp({
					duration:'slow',
					complete: function () {
						App.User.markMessageRead(thisView.model);
					}
				});
				
			}
		);
	},

	render: function () {
		var tplt = this.template(this.model.attributes);

		var closeBtn = $("<button type='button'>")
				.addClass('btn btn-primary pull-right closebtn')
				.text("Ok, got it! Mark as read.");

		this.$el.html(tplt).prepend(closeBtn);

		if (this.model.get('sender').isRecommender()) {
			this.$el.css({
				// background: 'red'
			});
		}

		return this;
	}
});

App.Views.Message = Backbone.View.extend({
	tagName:  "li",

	className: "message",

	initialize: function () {
		this.listenTo(this.model, 'change', this.render);
	},

	template: function () {
		return _.template(window.App.Templates.message);
	},
	

	render: function () {
		var tplt = this.template()(this.model.attributes);
		
		if (!!this.$el) {
			// Element exists, so just update the html
			this.$el.html(tplt);
		} else {
			// Element not yet created, so create it
			this.$el = $(tplt);
		}
		return this;
	}
});

App.Views.PostMessage = Backbone.View.extend({
	tagName: 'div',

	id: "post-message",

	events: {
		"submit": "submitMessage",
		"click #resetform": "resetForm",
		"click #recipients-list li": "removeRecipient",
		"click #triggerlocs-list li": "removeLocation",
		"click :checkbox#toggle-allusers": "toggleAllRecipients",
		"click :checkbox#toggle-alllocs": "toggleAllLocations",
		"keyup input#subject": "updateSubject",
		"keyup textarea": "updateBody"
	},

	initialize: function () {
		console.log("Initializing PostMessageView. collection:", this.collection);

		this.message = new App.Models.Message({
			sender: App.User,
			to: new App.Collections.Users(),
			subject: "",
			body: "",
			triggerLocs: new App.Collections.Locations()
		});

		this.setupTypeahead();
	},

	setupTypeahead: function () {
		var _this = this;

		$('#send-to').multisuggest({
			sources: [
				{
					data: "/typeahead/users",
					queryParam: "query",
					type: "url",
					listFormatter: function(item, term) {
						var user = new App.Models.User(item, { fetch: false });
						var compiled = _.template("<img src='<% print(user.get('pictureUrl')) %>'></img><% print(hl(user.get('displayName'))) %>");
						return compiled({
							hl: $.proxy($.fn.multisuggest.highlighter, this, term),
							user: user
						});
					},
					inputFormatter: function(item) {
						// var compiled = _.template("<%= first %> <%= last %>");

						return item.username;
					},
					valueAttribute: function(item) {
						return item.username;
					},
					resultsProcessor: function(data) {
						return data.options;
					},
					header: "Users",
					delay: 200,
					maxEntries: 5
				}
			],
			loadingIconClass: 'msuggest-loading',
			noResultsText: 'No matching users.',
			updater: function (item) {
				console.log("item:", item);
				var newUser = App.allUsers.getOrCreate({username: item});
				_this.message.get('to').add(newUser);
				_this.render();
				return item;
			}
		});

		var collectionListFormatter = function(item, term) {
			// A simple Underscore template for formatting each result
			var compiled = _.template("<% print(hl(item.get('displayName'))) %>");
			return compiled({
				hl : $.proxy($.fn.multisuggest.highlighter, this, term),
				item: item
			});
		};

		var collectionInputFormatter = function(item) { return item.id; }
		var collectionValueAttribute = function(item) { return item.id; }

		var collectionFilter = function(collection, term) {
			var matcher = new RegExp($.fn.multisuggest.escapeRegex(term), "i");
			return collection.filter(function(item) {
				return (matcher.test(item.get('name')) || matcher.test(item.id));
			});
		};

		var locationUpdater = function (item) {
			console.log("item:", item);
			var loc = App.locations.get(item);
			_this.message.get('triggerLocs').add(loc);
			_this.render();
			return item;
		};

		$("#triggerLocs").multisuggest({
			sources: [
				{
					header: 'Locations',
					type: 'backbone.collection',
					data: new App.Collections.Locations(
						App.locations.filter(function (loc) {
							return !loc.isNoneLoc();
						})
					),
					filter: collectionFilter,
					listFormatter: collectionListFormatter,
					inputFormatter: collectionInputFormatter,
					valueAttribute: collectionValueAttribute
				}
			],
			loadingIconClass: 'msuggest-loading',
			noResultsText: 'No matching locations.',
			enableDropdownMode: true,
			delay: 100,
			updater: locationUpdater
		});	
	},

	removeRecipient: function (e) {
		var username = $(e.currentTarget).attr('id');
		this.message.get('to').remove(username);
		this.render();
	},

	removeLocation: function (e) {
		var screenid = $(e.currentTarget).attr('id');
		this.message.get('triggerLocs').remove(screenid);
		this.render();
	},

	toggleAllRecipients: function (e) {
		var allUName = App.Models.User.prototype.specialUsernames.ALL;
		var allUser = new App.Models.User({username: allUName});
		if ($(e.currentTarget).is(":checked")) {
			this.message.get('to').reset([allUser]);
		} else {
			this.message.get('to').reset([]);
		}
		this.render();
	},

	toggleAllLocations: function (e) {
		if ($(e.currentTarget).is(":checked")) {
			this.message.get('triggerLocs').reset([App.locations.getNoneLoc()]);
		} else {
			this.message.get('triggerLocs').reset([]);
		}
		this.render();
	},

	updateSubject: function (e) {
		this.message.set('subject', $(e.currentTarget).val());
	},

	updateBody: function (e) {
		this.message.set('body', $(e.currentTarget).val());
	},

	submitMessage: function (e) {
		var _this = this;
		e.preventDefault();
		console.log("Submitting new message.");
		var deffered = this.message.save();
		if (!deffered) {
			// error occured before sending to server
			var msg = this.message.validationError || "Couldn't post message";
			alert(msg);
		} else {
			$.when(deffered).then(function (response) {
				_this.resetForm();
			}, function (response) {
				alert("There was a problem posting this message");
			});
		}

	},

	resetForm: function (e) {
		if (e) e.preventDefault();
		this.message = new App.Models.Message({
			sender: App.User,
			to: new App.Collections.Users(),
			subject: "",
			body: "",
			triggerLocs: new App.Collections.Locations()
		});
		this.render();
	},

	template: function (attrs) {
		return _.template(App.Templates.postMessage)(attrs);
	},

	render: function () {
		console.log("Rendering post message view");
		var tplt = this.template({
			message: this.message,
			locations: this.collection
		});
		this.$el.html($(tplt));
		this.setupTypeahead();
		return this;
	}
});

App.Views.LoginView = Backbone.View.extend({
	el: "#login-form",

	events: {
		"submit": "submitLogin"
	},

	initialize: function () {
		this.$("input:text").focus();
	},

	submitLogin: function (e) {
		e.preventDefault();
		$("#loader").show();
		$.post('/login', this.$el.serialize(), function (resp) {
			console.log(resp);

			if (resp.status == "ok" && resp.user) {
				App.User = new App.Models.LoggedInUser(resp.user);
				App.allUsers.add(App.User);
				$.when(App.onLoginSuccess()).then( function () {
					App.router.navigate("", { trigger: true });
				});
			} else {
				$("#loader").hide();
				alert(resp.msg);
			}
		});
	}
});

App.Views.UserView = Backbone.View.extend({
	el: "#user-info",

	initialize: function () {
		console.log("Initializing userView");

		this.listenTo(this.model, 'change:location', this.render);
		this.render();
	},

	template: function (params) {
		return _.template(window.App.Templates.userinfo)(params);
	},

	render: function () {
		// this.$el.css('visibility', 'visible');
		var uname = this.model.get('username')
		var loc = this.model.get('location');
		var locText = loc ? loc.get('displayName') : "Searching...";
		var lastseen = this.model.get('tstamp');
		var stale = this.model.isStale();


		var params = {
			username: uname,
			currloc: locText,
			lastseen: lastseen,
			stale: this.model.isStale()
		};

		var t = this.template(params);
		this.$el.html($(t));
		// this.$("#username").text(this.model.get('username'));
		// this.$("#currloc").text(locText);
		// this.$("#lastseen").text(lastseen);

		return this;
	}
});

App.Views.LocateListElemView = Backbone.View.extend({
	tagName: "li",

	className: "message",

	events: {
		"click .close": "removeUser"
	},

	initialize: function (options) {
		console.log("Initializing LocateListElemView");
		this.parentView = options.parentView;

		this.listenTo(this.model, 'change', this.render);
	},

	removeUser: function (e) {
		var thisView = this;
		thisView.$el.fadeTo(
			'slow', 0,
			function () {
				thisView.$el.slideUp({
					duration:'slow',
					complete: function () {
						if (thisView.parentView) {
							thisView.parentView.removeSubView(thisView);
						}
						thisView.remove();
					}
				});
				
			}
		);
		
	},

	template: function () {
		return _.template(window.App.Templates.locateListElem);
	},
	

	render: function () {
		console.log("rendering locate list elem view with attributes:", this.model.attributes);
		var tplt = this.template()(this.model.attributes);
		
		if (!!this.$el) {
			// Element exists, so just update the html
			this.$el.html(tplt);
		} else {
			// Element not yet created, so create it
			this.$el = $(tplt);
		}
		return this;
	}
});

App.Views.LocateUserView = Backbone.View.extend({
	el: ".main-content #locate",

	events: {
		"submit #add-user": "addUserSubmitted",
	},

	subviews: [],

	initialize: function () {
		console.log("Initializing LocateUserView");

		// this.listenTo(this.collection, 'add remove', this.render);

		var _this = this;
		$('#add-user input:text').multisuggest({
			sources: [
				{
					data: "/typeahead/users",
					queryParam: "query",
					type: "url",
					listFormatter: function(item, term) {
						var user = new App.Models.User(item, { fetch: false });
						var compiled = _.template("<img class='img-small' src='<% print(user.get('pictureUrl')) %>'></img><% print(hl(user.get('displayName'))) %>");
						return compiled({
							hl: $.proxy($.fn.multisuggest.highlighter, this, term),
							user: user
						});
					},
					inputFormatter: function(item) {
						return item.username;
					},
					valueAttribute: function(item) {
						return item.username;
					},
					resultsProcessor: function(data) {
						return data.options;
					},
					header: "Users",
					delay: 200,
					maxEntries: 5
				}
			],
			loadingIconClass: 'msuggest-loading',
			noResultsText: 'No matching users.',
			updater: function (item) {
				console.log("item:", item);
				_this.addUser(item);
				return item;
			}
		});
	},

	addUserSubmitted: function (e) {
		if (e) e.preventDefault();
		var uname = this.$("#add-user input#username").val();
		console.log("Trying to add user:", uname);
		this.addUser(uname);
		
		this.$("#add-user input#username").val("").focus();
		return this;
	},

	addUser: function (username) {
		console.log("Trying to add user:", username);
		$(".typeahead").hide();
		var _this = this;
		var user = App.allUsers.create({username: username}, {
			wait: true,
			success: function (model, xhr, options) {
				console.log("Successfully added model");
				user = model = App.allUsers.get(model.id);

				if (!_.chain(_this.collection.models).pluck('id').contains(model.id).value()) {
					_this.collection.add(user);
					console.log("followingUsers:", App.followingUsers);
					var subview = new App.Views.LocateListElemView({
						model:user,
						parentView: _this
					});
					_this.subviews.push(subview);
					var el = subview.render().$el;
					this.$("#userlist").prepend(el);
				}
				this.$("#add-user input#username").val("").focus();
			},
			error: function (model, xhr, options) {
				model.destroy();
				alert("Could not validate this username");
			}
		});
		console.log("user:", user);
	},

	removeSubView: function (view) {
		this.subviews.pop(view);
		this.collection.remove(view.model);
	},

	render: function () {
		console.log("Rendering locate user view");
		var users = this.collection;
		this.$("#userlist").empty();

		_.each(this.subviews, function (subview) {
			subview.remove();
		});
		// Now clear the subview list
		this.subviews.length = 0;

		var _this = this;

		// Improve performance by not doing append for each list elem,
		// which causes a page reflow each time
		var container = $(document.createDocumentFragment()); 
		// render each subview, appending to our root element
		users.each( function (user) {

			var subview = new App.Views.LocateListElemView({
				model:user,
				parentView: _this
			});
			_this.subviews.push(subview);
			var el = subview.render().$el;
			container.prepend(el);
		});
		this.$("#userlist").append(container);
		return this;
	}

});

App.Views.ProjectBrowser = Backbone.View.extend({
	tagName: "div",
	id: "project-browser",

	states: {
		NOLOC: "noloc", // No location yet, show all groups
		LOC: "location",
		GROUP: "group",
		PROJ: "project"
	},

	events: {
		"click .add-charm": "addCharm",
		"click .remove-charm": "removeCharm",
		"click .group": "navToGroup",
		"click .project": "navToProject"
	},

	template: function (attrs) {
		return _.template(App.Templates.projectbrowser)(attrs);
	},

	state: null,

	subViews: [],

	initialize: function (options) {
		console.log("Initializing project browser view");
		this.router = options.router;
		this.user = options.user;
		this.locations = options.locations;
		this.state = this.states.LOC;
		this.node = this.user.get('location');
		this.listenTo(this.user, 'change:location', this.updateLoc);
	},

	updateLoc: function () {
		this.node = this.user.get('location');
		if (this.node.isNoneLoc()) {
			this.state = this.states.NOLOC;
		} else {
			this.state = this.states.LOC;
		}
		this.router.navigate('/project-browser/'+this.node.get('screenid'), {trigger: true});
		// this.render();
	},

	navToGroup: function (e) {
		this.router.navigate('/project-browser/group/' + e.target.getAttribute("id"), {trigger: true});
	},

	navToProject: function (e) {
		this.router.navigate('/project-browser/project/' + e.target.getAttribute("id"), {trigger: true});
	},

	showLoc: function (location) {
		this.node = location;
		this.state = this.states.LOC;
		if (this.node.isNoneLoc()) {
			this.state = this.states.NOLOC;
		}
		return this.render();
	},

	showGroup: function (group) {
		this.node = group;
		this.state = this.states.GROUP;
		return this.render();
	},

	showProject: function (project) {
		this.node = project;
		this.state = this.states.PROJ;
		return this.render();
	},

	addCharm: function () {
		var _this = this;
		App.charms.create(this.node.attributes, {
			success: function (model, xhr, options) {
				_this.render();
			},
			error: function (model, xhr, options) {
				alert("Problem adding charm");
			}	
		});
	},

	removeCharm: function () {
		var _this = this;
		var charm = App.charms.get(this.node);
		charm.destroy({
			success: function (model, xhr, options) {
				_this.render();
			},
			error: function (model, xhr, options) {
				alert("Problem removing charm");
			}
		});
	},

	render: function () {
		console.log("Rendering project browser. state:", this.state);
		this.$el.empty();

		if (this.state == this.states.PROJ) {
			this.node.set('isCharmed', !!App.charms.get(this.node));
		}
		var tplt = this.template({
			states: this.states,
			state: this.state,
			node: this.node
		});
		this.$el.html($(tplt.trim()));
		
		// Make sure events are bound
		this.delegateEvents(this.events);

		return this;
	},
});


App.Views.Charms = Backbone.View.extend({
	el: "#viewcharms",

	initialize: function () {
		this.listenTo(this.collection, 'add remove', this.render);
	},

	render: function () {
		this.$("ul#charms-list").empty();
		var container = $(document.createDocumentFragment());
		_.each(this.collection.models, function (model) {
			var subView = new App.Views.CharmListElem({ model: model });
			container.append(subView.render().$el);
		});

		this.$("ul#charms-list").append(container);
		return this;
	}
});

App.Views.CharmListElem = Backbone.View.extend({
	tagName: "li",

	initialize: function () {
		this.listenTo(this.model, 'change', this.render);
	},

	template: function () {
		return _.template(App.Templates.charmListElem);
	},

	render: function () {
		var tplt = this.template()(this.model.attributes);
		this.$el.html(tplt);

		return this;
	}
});



