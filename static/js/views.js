// javascript:debugger

App.Views.ReadMessages = Backbone.View.extend({
	el: ".main-content",

	events: {
		"click .pager #newer a": "decreasePage",
		"click .pager #older a": "increasePage"
	},

	initialize: function () {
		this.page = 0;
		this.lastPage = Math.ceil(this.collection.total/this.options.resultsPerPage)-1;

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
				success: function () {
					_this.render();
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
				success: function () {
					_this.render();
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

App.Views.MessageList = Backbone.View.extend({
	el: "#messages-list",

	initialize: function () {
		this.listenTo(this.collection, 'add remove', this.render);

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

App.Views.NewMsg = Backbone.View.extend({
	// Deals with popping up new messages
	el: ".main-content",

	initialize: function () {
		this.listenTo(this.collection, 'add', this.displayMsg);
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
		
	}
});

App.Views.NewMessage = Backbone.View.extend({
	tagName: "li",

	events: {
		"click .close": "closeMessage"
	},

	initialize: function () {
		this.listenTo(this.model, 'change', this.render);
	},

	template: function () {
		return _.template(window.App.Templates.message);
	},

	closeMessage: function () {
		this.$el.fadeOut('slow');
		App.User.markMessageRead(this.model);
	},

	render: function () {
		var tplt = this.template()(this.model.attributes);

		var popup = $(tplt)
			.prepend('<button type="button" class="close">&times;</button>');

		if (!!this.$el) {
			// Element exists, so just update the html
			this.$el.html(popup.html());
		} else {
			// Element not yet created, so create it
			this.$el = popup;
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
		console.log("Initializing PostMessageView");

		$.getJSON('/locations/all', function (resp) {
			console.log("Response from all locations:", resp);
			var container = $(document.createDocumentFragment()); 
			for (var i=0, loc; loc=resp[i]; i++) {
				container.append($("<option>").attr("value", loc).text(loc));
			}
			$("#compose-message #loc").append(container);
		});
	},

	events: {
		"submit": "submitMessage",
		"click #clearform": "clearForm"
	},

	submitMessage: function (e) {
		var _this = this;
		e.preventDefault();
		console.log($("form").serialize(), this);
		$.post('/messages/create', $("form").serialize(), function (resp) {
			console.log("resp:", resp);
			if (resp.status == "error") alert(resp.msg);
			_this.$("input#send-to").select();
		});
	},

	clearForm: function () {
		this.$("input:text, textarea").val("");
		this.$("input#send-to").focus();
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
		$.post('/login', this.$el.serialize(), function (resp) {
			console.log(resp);

			if (resp.status == "ok" && resp.user) {
				window.App.User = App.allUsers.getOrCreate(resp.user);
				App.User.set("validated", true); // No need to do another check of the username
				App.EventDispatcher.trigger('login_success');
				App.router.navigate("", { trigger: true });
			} else {
				alert(resp.msg);
			}
		});
	}
});

App.Views.UserView = Backbone.View.extend({
	el: "#user-info",

	initialize: function () {
		console.log("Initializing userView");

		this.listenTo(this.model, 'change', this.render);
		this.render();
	},

	render: function () {
		this.$el.css('visibility', 'visible');
		this.$("#username").text(this.model.get('username'));
		var loc = this.model.get('location') || "Searching..."
		this.$("#currloc").text(loc);

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

		this.render();
	},

	addUser: function (e) {
		e.preventDefault();
		var uname = this.$("#add-user input#username").val();
		console.log("Trying to add user:", uname);
		var newUser = App.allUsers.getOrCreate({username: uname});
		console.log("newUser:", newUser);
		this.collection.add(newUser);
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
	el: "#project-browser",

	initialize: function () {
		this.listenTo(this.model, 'change', this.render);
		this.render();
	},

	render: function () {
		this.$el.html(this.model.get('location'));
		var url = "screen/" + this.model.get('location') + "/groups";
		$.getJSON(url, function (resp) {
			console.log("resp:", resp);
		});
	}
});
