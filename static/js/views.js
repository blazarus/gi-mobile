// javascript:debugger

App.Views.ReadMessages = Backbone.View.extend({
	el: ".main-content",

	events: {
		"click .pager #newer a": "decreasePage",
		"click .pager #older a": "increasePage"
	},

	initialize: function () {
		this.page = 0;
		this.lastPage = Math.floor(this.collection.total/this.options.resultsPerPage);

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
		} else if (this.page == this.lastPage) {
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
	el: "#messages-list",

	initialize: function () {
		// this.listenTo(this.collection, 'add remove', this.render);

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
	},

	newMessage: function (msg) {
		// javascript:debugger;
		// Open a modal dialog saying You have a new message (or recommendation)
		// and have two buttons - one saying go to message, which takes you to New messages tab
		// the other saying Read later in New Messages tab
		$(".modal").modal();
	},

	displayMsg: function (msg) {
		var readMsgIds = _.pluck(App.User.get('readMessages'),'message');
		if (!_.contains(readMsgIds, msg.get('_id'))) {
			// This is a new message, display it then mark it read
			// TODO check the location

			var tplt = _.template(App.Templates.message)(msg.attributes);
			var popup = $("<div>").addClass("alert newMsgPopup")
				.append('<button type="button" class="close" data-dismiss="alert">&times;</button>')
				.append($(tplt));
			$("body").prepend(popup);
			App.User.markMessageRead(msg);
		}
		
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
		this.$el.fadeOut('slow');
		App.User.markMessageRead(this.model);
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

App.Views.PostMessageView = Backbone.View.extend({
	el: '#compose-message',

	initialize: function () {
		console.log("Initializing PostMessageView. collection:", this.collection);

		// Render once collection has been fetched
		this.listenToOnce(this.collection, 'fetched', this.render);
		if (this.collection.fetched) this.render();
		// $.getJSON('/locations/all', function (resp) {
		// 	console.log("Response from all locations:", resp);
		// 	var container = $(document.createDocumentFragment()); 
		// 	for (var i=0, loc; loc=resp[i]; i++) {
		// 		container.append($("<option>").attr("value", loc).text(loc));
		// 	}
		// 	$("#compose-message #loc").append(container);
		// });
		var names = App.allUsers.pluck('username');
		this.$("#send-to").typeahead({ source: names });
	},

	events: {
		"submit": "submitMessage",
		"click #clearform": "clearForm"
	},

	submitMessage: function (e) {
		var _this = this;
		e.preventDefault();
		console.log("Submitting new message. Serialized form:", $("form").serialize(), this);
		$.post('/messages/create', $("form").serialize(), function (resp) {
			console.log("resp:", resp);
			if (resp.status == "error") alert(resp.msg);
			_this.$("input#send-to").select();
		});
	},

	clearForm: function () {
		this.$("input:text, textarea").val("");
		this.$("input#send-to").focus();
	},

	render: function () {
		var container = $(document.createDocumentFragment()); 
		for (var i=0, loc; loc=this.collection.models[i]; i++) {
			container.append($("<option>").attr("value", loc.get('screenid')).text(loc.get('screenid')));
		}
		$("#compose-message #loc").append(container);
		return this;
	}
});

App.Views.LoginView = Backbone.View.extend({
	el: "#login-form",

	events: {
		"submit": "submitLogin"
	},

	initialize: function () {

	},

	submitLogin: function (e) {
		e.preventDefault();
		$("#loader").show();
		$.post('/login', this.$el.serialize(), function (resp) {
			console.log(resp);

			if (resp.status == "ok" && resp.user) {
				App.User = new App.Models.LoggedInUser(resp.user);
				App.allUsers.add(App.User);
				App.EventDispatcher.trigger('login_success');
				App.router.navigate("", { trigger: true });
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
		var locText = loc ? loc.get('screenid') : "Searching...";
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

	events: {
		"click .remove": "removeUser"
	},

	initialize: function () {
		console.log("Initializing LocateListElemView");

		this.listenTo(this.model, 'change', this.render);
		this.render();
	},

	removeUser: function (e) {
		this.model.destroy();
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
		"submit #add-user": "addUser"
	},

	subviews: [],

	initialize: function () {
		console.log("Initializing LocateUserView");

		this.listenTo(this.collection, 'add remove', this.render);
	},

	addUser: function (e) {
		e.preventDefault();
		var uname = this.$("#add-user input#username").val();
		console.log("Trying to add user:", uname);
		var user = App.allUsers.getOrCreate({username: uname});
		console.log("user:", user);
		this.collection.add(user);
		console.log("followingUsers:", App.followingUsers);
		this.$("#add-user input#username").val("").focus();
		return this;
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

		if (users.length == 0) {
			this.$("#userlist").html("No users added yet");
		} else {
			// Improve performance by not doing append for each list elem,
			// which causes a page reflow each time
			var container = $(document.createDocumentFragment()); 
			// render each subview, appending to our root element
			users.each( function (user) {

				var subview = new App.Views.LocateListElemView({model:user});
				var el = subview.render().$el;
				container.append(el);
			});
			this.$("#userlist").append(container);
		}
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
		"click .remove-charm": "removeCharm"
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
		// this.listenTo(this.user, 'change:location', this.updateLoc);
	},

	updateLoc: function () {
		this.node = this.user.get('location');
		if (this.node.get('screenid') == "NONE") {
			this.state = this.states.NOLOC;
		} else {
			this.state = this.states.LOC;
		}
		this.router.navigate('/project-browser/'+this.node.get('screenid'));
		this.render();
	},

	showLoc: function (location) {
		this.node = location;
		this.state = this.states.LOC;
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
		for (var i=0,subview; subview=this.subViews[i]; i++) {
			subview.remove();
		}
		this.subViews = [];

		this.$el.html(this.user.get('location').get('screenid'));

		switch (this.state) {
			case this.states.NOLOC:
				this.renderLoc();
				break;
			case this.states.LOC:
				this.renderLoc();
				break;
			case this.states.GROUP:
				this.renderGroup();
				break;
			case this.states.PROJ:
				this.renderProject();
				break;
		}
		
		// Make sure events are bound
		this.delegateEvents(this.events);

		return this;
	},

	renderLoc: function () {
		var _this = this;
		var container = $(document.createDocumentFragment()); 
		var numGroups = this.node.get('groups').length;
		for (var i=0; i < numGroups; i++) {
			var group = this.node.get('groups')[i];
			(function (group) {
				console.log("group", i, group);
				var button = new App.Views.ProjectBrowser.Button({ model: group });
				_this.subViews.push(button);
				_this.listenTo(button, 'click', function (e) {
					console.log("clicked group", i, group);
					this.router.navigate('/project-browser/group/' + group.get('groupid'), {trigger: true});
				});
				container.append(button.render().$el);
			})(group);
			
		}
		_this.$el.append(container);
	},

	renderGroup: function () {
		var _this = this;
		var container = $(document.createDocumentFragment()); 
		var numProjects = this.node.get('projects').length;
		for (var i=0; i < numProjects; i++) {
			var project = this.node.get('projects')[i];
			(function (project) {
				var button = new App.Views.ProjectBrowser.Button({ model: project });
				_this.subViews.push(button);
				_this.listenTo(button, 'click', function (e) {
					console.log(button);
					this.router.navigate('/project-browser/project/' + project.get('pid'), {trigger: true});
				});
				container.append(button.render().$el);
			})(project);
			
		}
		_this.$el.append(container);
	},

	renderProject: function () {
		var isCharmed = !!App.charms.get(this.node);
		
		console.log("Is this project charmed?", isCharmed);

		var tplt = _.template(App.Templates.projectInfo)({
			name: this.node.get('name'),
			description: this.node.get('description'),
			isCharmed: isCharmed
		});
		this.$el.append($(tplt));

	}
});

App.Views.ProjectBrowser.Button = Backbone.View.extend({
	tagName: "button",

	className: "btn",

	events: {
		"click": "click"
	},

	initialize: function () {
		// this.model is a Group
	},

	click: function (e) {
		this.trigger('click');
	},

	render: function () {
		this.$el.text(this.model.get('name'));
		return this;
	}
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



