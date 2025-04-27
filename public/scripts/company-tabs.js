document.addEventListener('DOMContentLoaded', function() {
  console.log('Company Tabs Script Loaded');

  const formTabButton = document.getElementById('form-tab');
  const resultsTabButton = document.getElementById('results-tab');
  const formContent = document.getElementById('form-content');
  const resultsContent = document.getElementById('results-content');

  if (!formTabButton || !resultsTabButton || !formContent || !resultsContent) {
    console.error('Required tab elements not found.');
    return;
  }

  function activateTab(tabButton, tabContent) {
    // Deactivate all tabs first
    formTabButton.classList.remove('active', 'text-blue-600', 'border-blue-500');
    formTabButton.classList.add('text-gray-500', 'hover:text-blue-600', 'hover:border-blue-300'); // Add inactive styles

    resultsTabButton.classList.remove('active', 'text-blue-600', 'border-blue-500');
    resultsTabButton.classList.add('text-gray-500', 'hover:text-blue-600', 'hover:border-blue-300'); // Add inactive styles

    formContent.classList.add('hidden');
    formContent.classList.remove('active');
    resultsContent.classList.add('hidden');
    resultsContent.classList.remove('active');

    // Activate the selected tab
    tabButton.classList.remove('text-gray-500', 'hover:text-blue-600', 'hover:border-blue-300'); // Remove inactive styles
    tabButton.classList.add('active', 'text-blue-600', 'border-blue-500'); // Add active styles

    tabContent.classList.remove('hidden');
    tabContent.classList.add('active');
  }

  formTabButton.addEventListener('click', () => {
    console.log('Form tab clicked');
    activateTab(formTabButton, formContent);
  });

  resultsTabButton.addEventListener('click', () => {
    console.log('Results tab clicked');
    activateTab(resultsTabButton, resultsContent);
  });

  // Ensure initial state matches HTML (form tab active)
  // activateTab(formTabButton, formContent); // HTML already sets the initial state
  console.log('Company tabs initialized.');
});
