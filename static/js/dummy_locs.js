$( function () {
	$.post('/dummyloc/update', { loc: $("#pick-loc").val() } , function (resp) {
		console.log(resp);
	});
	$("#pick-loc").change( function (e) {
		console.log($(this).val());
		$.post('/dummyloc/update', { loc: $(this).val() } , function (resp) {
			console.log(resp);
		});
	});
});