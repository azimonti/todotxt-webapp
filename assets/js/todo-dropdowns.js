'use strict';

export function updateDropdowns(items, projectSelect, contextSelect) {
  let allProjects = new Set();
  let allContexts = new Set();

  items.forEach(item => {
    item.projects().forEach(p => allProjects.add(p));
    item.contexts().forEach(c => allContexts.add(c));
  });

  // Populate Projects
  projectSelect.find('option:gt(0)').remove();
  [...allProjects].sort().forEach(p => {
    projectSelect.append($('<option></option>').val(p).text(`+${p}`));
  });

  // Populate Contexts
  contextSelect.find('option:gt(0)').remove();
  [...allContexts].sort().forEach(c => {
    contextSelect.append($('<option></option>').val(c).text(`@${c}`));
  });
}
