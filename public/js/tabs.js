// Tab switching functionality
document.addEventListener('DOMContentLoaded', function() {
  // Get all tab buttons and content sections
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  // Add click event listeners to each tab button
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      // Get the target tab ID from data-tab attribute
      const tabId = this.getAttribute('data-tab');
      
      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to current button and content
      this.classList.add('active');
      document.getElementById(tabId).classList.add('active');
      
      // Store the active tab in localStorage
      localStorage.setItem('activeTab', tabId);
      
      console.log('Tab switched to:', tabId); // Debug logging
    });
  });
  
  // Restore active tab from localStorage (if available)
  const savedTab = localStorage.getItem('activeTab');
  if (savedTab) {
    const tabToActivate = document.getElementById(savedTab);
    const buttonToActivate = document.querySelector(`[data-tab="${savedTab}"]`);
    
    if (tabToActivate && buttonToActivate) {
      // Remove active class from all tabs first
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Activate the saved tab
      tabToActivate.classList.add('active');
      buttonToActivate.classList.add('active');
    }
  }
});