$(document).ready(function() {
	$('#letsStart').on('click', function() {
		$('#letsStart').css('visibility', 'hidden');
		$('#installStarter').fadeOut(1000);
		$('#installWrapper').fadeIn(1000);
		$('#backgroundBlurred').fadeIn(1000, function() {
			
		});
		return false;
	});
});

$(window).load(function() {
	if($('#coontiSite').length) {
		$.get('drop');
	}
});
