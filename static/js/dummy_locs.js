$( function () {
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