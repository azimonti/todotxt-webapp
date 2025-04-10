'use strict';
$(document).ready(function() {
  // Initialize the date picker
  $('.date-picker').each(function(){
    $(this).datepicker({
      templates: {
        leftArrow: '<i class="fa-solid fa-angle-left"></i>',
        rightArrow: '<i class="fa-solid fa-angle-right"></i>'
      }
    }).on('show', function() {
      $('.datepicker').addClass('open');

      const datepicker_color = $(this).data('datepicker-color');
      if (datepicker_color && datepicker_color.length !== 0) {
        $('.datepicker').addClass('datepicker-' + datepicker_color);
      }
    }).on('hide', function() {
      $('.datepicker').removeClass('open');
    });
  });
});
