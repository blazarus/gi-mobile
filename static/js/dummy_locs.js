// javascript:debugger;

$( function () {
	var locs = new Locations();
	locs.fetch({
		success: function (locs) {
			var container = $(document.createDocumentFragment()); 
			for (var i=0, loc; loc=locs.models[i]; i++) {
				container.append($("<option>").attr("value", loc.get('screenid')).text(loc.get('screenid')));
			}
			$("#pick-loc").append(container);

		}
	});
	postFakeLoc()
	$("#pick-loc").change( function (e) {
		console.log($(this).val());
		postFakeLoc();
	});
});

var postFakeLoc = function () {
	$.post('/dummyloc/update', { loc: $("#pick-loc").val() } , function (resp) {
		console.log(resp);
	});
}

var Location = Backbone.Model.extend({
	toString: function () {
		return this.get("screenid");
	}
});

var Locations = Backbone.Collection.extend({
	url: '/locations/all',

	initialize: function () {

	},

	parse: function (response) {
		return response.locs;
	}
});