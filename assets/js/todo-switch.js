'use strict';

import { loadTodos } from './todo-load.js';

// Define localStorage keys
const SHOW_COMPLETED_KEY = 'todoWebAppShowCompleted';
const SHOW_FUTURE_THRESHOLD_KEY = 'todoWebAppShowFutureThreshold';

$(document).ready(function() {
  // Initialize specific switches on page load
  const switch1 = $("#switch1");
  const switch2 = $("#switch2");

  // Function to update switch label
  function updateSwitchLabel(switchElement) {
    const label = $(`label[for="${switchElement.attr("id")}"]`);
    const checkedLabel = switchElement.data("checked") || "ON";
    const uncheckedLabel = switchElement.data("unchecked") || "OFF";
    label.text(switchElement.is(":checked") ? checkedLabel : uncheckedLabel);
  }

  // --- Switch 1: Show Completed ---
  if (switch1.length) {
    // Load initial state from localStorage, default to true (checked)
    const showCompleted = localStorage.getItem(SHOW_COMPLETED_KEY) === null ? true : localStorage.getItem(SHOW_COMPLETED_KEY) === 'true';
    switch1.prop('checked', showCompleted);
    updateSwitchLabel(switch1); // Update label based on loaded state

    // Add event listener to save state and refresh list on change
    switch1.change(function() {
      const isChecked = $(this).is(":checked");
      localStorage.setItem(SHOW_COMPLETED_KEY, isChecked);
      updateSwitchLabel($(this)); // Update label immediately
      // Call the imported loadTodos function, selecting the list element
      const todoListElement = $('#todo-list');
      if (todoListElement.length) {
        loadTodos(todoListElement);
      } else {
        console.error("Could not find #todo-list element to refresh.");
      }
    });
  }

  // --- Switch 2: Threshold > Today ---
  if (switch2.length) {
    // Load initial state from localStorage, default to true (checked)
    const showFutureThreshold = localStorage.getItem(SHOW_FUTURE_THRESHOLD_KEY) === null ? true : localStorage.getItem(SHOW_FUTURE_THRESHOLD_KEY) === 'true';
    switch2.prop('checked', showFutureThreshold);
    updateSwitchLabel(switch2); // Update label based on loaded state

    // Add event listener to save state and refresh list on change
    switch2.change(function() {
      const isChecked = $(this).is(":checked");
      localStorage.setItem(SHOW_FUTURE_THRESHOLD_KEY, isChecked);
      updateSwitchLabel($(this)); // Update label immediately
      // Call the imported loadTodos function, selecting the list element
      const todoListElement = $('#todo-list');
      if (todoListElement.length) {
        loadTodos(todoListElement);
      } else {
        console.error("Could not find #todo-list element to refresh.");
      }
    });
  }

  // Handle other generic switches if needed (original logic)
  $(".form-check-input").not("#switch1, #switch2").each(function() {
    const switchElement = $(this);
    updateSwitchLabel(switchElement); // Set initial label
    // Add event listener to toggle label on change
    switchElement.change(function() {
      updateSwitchLabel($(this));
    });
  });
});
