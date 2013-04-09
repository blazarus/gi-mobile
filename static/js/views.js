// javascript:debugger

App.Views.NewMsgView = Backbone.View.extend({
	// Deals with popping up new messages
	el: ".main-content",

	initialize: function () {

	}
});

App.Views.MessageView = Backbone.View.extend({
	tagName:  "li",

	initialize: function () {
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

App.Views.MessageListView = Backbone.View.extend({
	el: "#messages-list",

	initialize: function () {
		this.listenTo(this.collection, 'change add remove', this.render);
		this.render();
	},

	render: function () {
		console.log("Message List being rendered");

		this.$el.html("");
		var that = this;
		var container = $(document.createDocumentFragment()); 
		// render each subview, appending to our root element
		this.collection.each( function (elem, idx) {
			var li = new App.Views.MessageView({ model: elem });
			li.render().$el.appendTo(container);
		});
		that.$el.append(container);

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
		// this.listenTo(this.model, 'change', this.render);
	},

	submitLogin: function (e) {
		e.preventDefault();
		$.post('/login', this.$el.serialize(), function (resp) {
			console.log(resp);

			if (resp.status == "ok" && resp.user) {
				javascript:debugger;
				window.App.User = App.allUsers.getOrCreate(resp.user);
				App.User.set("validated", true); // No need to do another check of the username
				App.EventDispatcher.trigger('login_success');
				window.App.router.navigate("", { trigger: true });
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

