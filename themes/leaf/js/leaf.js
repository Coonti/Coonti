head.ready(document, function() {
	if($('body#coontiFront').length > 0) {
		$('body').animate({ opacity: 1 }, 1500);
		$('#frontPageBackground-1').animate({ opacity: 1 }, 1500);
	}

	if($('#scrollInstructions').length > 0) {
		var instrShowing = false;
		var scrollTimer = window.setTimeout(function() {
			instrShowing = true;
			$('#scrollInstructions').animate({ opacity: 1 }, 1500);
		}, 7500);

		$(window).on('scroll', function() {
			window.clearTimeout(scrollTimer);
			if(instrShowing) {
				$('#scrollInstructions').stop(true).animate({ opacity: 0 }, 1000);
				instrShowing = false;
			}
		});
	}

	$('.c-hamburger').on('click', function() {
		$(this).parent().children().toggleClass('is-active');
	});

	var currentFrontMenuItem = 0;
	$('.frontMenuItem').on('mouseover', function() {
		var item = $(this).attr('data-menuItem');
		if(item == currentFrontMenuItem) {
			return;
		}
		currentFrontMenuItem = item;
		$('#frontPageBackgrounds div').stop(true).animate({ opacity: 0 }, 500);
		$('#frontPageBackground-' + item).stop(true).animate({ opacity: 1 }, 500);
	});

	$('.frontMenuItem').on('click', function() {
		var link = $(this).children('a:first').attr('href');
		if(link) {
			window.location = link;
		}
		return false;
	});
});
