'use strict';
$(document).ready(function() {
  // Initialize the date picker
  $('.date-picker').each(function(){
    $(this).datepicker({
      templates: {
        leftArrow: '<i class="fa-solid fa-angle-left"></i>',
        rightArrow: '<i class="fa-solid fa-angle-right"></i>'
      },
        orientation: "bottom left"
    }).on('show', function() {
      $('.datepicker').addClass('open');

      // Check the ID of the current datepicker
      if ($(this).attr('id') === 'createdDate') {
        $('.datepicker').addClass('datepicker-left');
      } else {
        $('.datepicker').addClass('datepicker-right');
      }

      const datepicker_color = $(this).data('datepicker-color');
      if (datepicker_color && datepicker_color.length !== 0) {
        $('.datepicker').addClass('datepicker-' + datepicker_color);
      }
    }).on('hide', function() {
      $('.datepicker').removeClass('open');
      $('.datepicker').removeClass('datepicker-left');
      $('.datepicker').removeClass('datepicker-right');
    });
  });
});
