// javascript:debugger;

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
		
		this.$el = $(tplt);
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
		$.post('/messages/post', $("form").serialize(), function (resp) {
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
				window.App.User = new App.Models.User({ username: resp.username });
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
		this.$("#curr_loc").text(this.model.get('location'));
	}
});