// javascript:debugger

App.Views.AppView = Backbone.View.extend({

});

App.Views.MessageView = Backbone.View.extend({
	tagName:  "li",

	initialize: function () {
	},

	template: function () {
		return _.template(window.App.Templates.message);
	},
	

	render: function () {
		console.log("attributes:", this.model.attributes);
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

	render: function () {
		console.log("Message List being rendered");

		var that = this;

		this.collection.each( function (elem, idx) {
			var li = new App.Views.MessageView({ model: elem });

			li.render().$el.appendTo(that.$el);
		});

		return this;
	}
});

App.Views.PostMessageView = Backbone.View.extend({
	el: '#compose-message',

	events: {
		"submit": "submitMessage"
	},

	submitMessage: function (e) {
		e.preventDefault();
		console.log($("form").serialize())
		$.post('/messages/create', $("form").serialize(), function (resp) {
			console.log("resp:", resp);
		});
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

			if (resp.status == "ok" && resp.username) {
				window.App.User = new App.Models.User({ 
					username: resp.username, 
					validated: true // No need to do another check of the username
				});
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
		this.$("#username").text(this.model.get('username'));
		this.$("#currloc").text(this.model.get('location'));

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
	el: "#locate",

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
		var newUser = new App.Models.User({username: uname});
		console.log("newUser:", newUser);
		this.collection.add(newUser);
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
