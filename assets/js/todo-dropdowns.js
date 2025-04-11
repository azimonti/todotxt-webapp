'use strict';

export function updateDropdowns(items) {
  let allProjects = new Set();
  let allContexts = new Set();

  items.forEach(item => {
    item.projects().forEach(p => allProjects.add(p));
    item.contexts().forEach(c => allContexts.add(c));
  });

  const projectDropdownMenu = document.getElementById('projectDropdownMenu');
  const contextDropdownMenu = document.getElementById('contextDropdownMenu');

  projectDropdownMenu.innerHTML = ''; // Clear existing items
  contextDropdownMenu.innerHTML = ''; // Clear existing items

  // Add a "Clear" option for Projects
  const clearProjectLi = document.createElement('li');
  const clearProjectA = document.createElement('a');
  clearProjectA.className = 'dropdown-item';
  clearProjectA.href = '#';
  clearProjectA.dataset.value = ''; // Empty value signifies clearing
  clearProjectA.textContent = 'Project'; // Or "Clear Project"
  clearProjectLi.appendChild(clearProjectA);
  projectDropdownMenu.appendChild(clearProjectLi);

  // Add a separator
  const projectSeparator = document.createElement('li');
  projectSeparator.innerHTML = '<hr class="dropdown-divider">';
  projectDropdownMenu.appendChild(projectSeparator);


  // Add a "Clear" option for Contexts
  const clearContextLi = document.createElement('li');
  const clearContextA = document.createElement('a');
  clearContextA.className = 'dropdown-item';
  clearContextA.href = '#';
  clearContextA.dataset.value = ''; // Empty value signifies clearing
  clearContextA.textContent = 'Context'; // Or "Clear Context"
  clearContextLi.appendChild(clearContextA);
  contextDropdownMenu.appendChild(clearContextLi);

  // Add a separator
  const contextSeparator = document.createElement('li');
  contextSeparator.innerHTML = '<hr class="dropdown-divider">';
  contextDropdownMenu.appendChild(contextSeparator);


  const sortedProjects = Array.from(allProjects).sort();
  const sortedContexts = Array.from(allContexts).sort();

  sortedProjects.forEach(project => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'dropdown-item';
    a.href = '#';
    a.dataset.value = project;
    a.textContent = "+" + project;
    li.appendChild(a);
    projectDropdownMenu.appendChild(li);
  });

  sortedContexts.forEach(context => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'dropdown-item';
    a.href = '#';
    a.dataset.value = context;
    a.textContent = "@" + context;
    li.appendChild(a);
    contextDropdownMenu.appendChild(li);
  });
}

export function setupDropdownHandlers() {
  // Use event delegation on static parent elements
  $(document).ready(function() {
    // Delegate from the static menu UL element for priority
    $('#priorityDropdownMenu').on('click', 'a.dropdown-item', function(e) {
      e.preventDefault(); // Prevent default anchor behavior
      var value = $(this).data('value'); // Get data-value
      $('#priorityDropdownButton').text($(this).text()); // Update button text
      $('#prioritySelect').val(value); // Update hidden input value
    });

    // Delegate from the static menu UL element for projects
    $('#projectDropdownMenu').on('click', 'a.dropdown-item', function(e) {
      e.preventDefault();
      var value = $(this).data('value');
      $('#projectDropdownButton').text($(this).text());
      $('#projectSelect').val(value);
    });

    // Delegate from the static menu UL element for contexts
    $('#contextDropdownMenu').on('click', 'a.dropdown-item', function(e) {
      e.preventDefault();
      var value = $(this).data('value');
      $('#contextDropdownButton').text($(this).text());
      $('#contextSelect').val(value);
    });
  });
}
