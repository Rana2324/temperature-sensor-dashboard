// SensorDashboard.js - Handles the temperature sensor dashboard functionality

/**
 * Temperature Sensor Dashboard JavaScript
 * Handles dashboard functionality including table expansion/collapse
 */

document.addEventListener('DOMContentLoaded', function() {
    // Initialize all collapsible tables to be collapsed by default
    const allTableWrappers = document.querySelectorAll('.table-wrapper.alert-table, .table-wrapper.settings-table, .table-wrapper.personality-table');
    allTableWrappers.forEach(wrapper => {
        if (!wrapper.classList.contains('collapsed') && !wrapper.classList.contains('expanded')) {
            wrapper.classList.add('collapsed');
        }
        
        // Check if table has more content than visible
        checkTableOverflow(wrapper);
    });

    // Add click event listeners to all expand buttons
    const expandButtons = document.querySelectorAll('.expand-btn');
    expandButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            // Prevent default if it's an anchor tag or has onclick
            if (button.tagName === 'A' || button.hasAttribute('onclick')) {
                e.preventDefault();
            }
            
            // Get target from data-target attribute or extract from onclick
            let targetId = button.getAttribute('data-target');
            if (!targetId && button.hasAttribute('onclick')) {
                const onclickValue = button.getAttribute('onclick');
                const match = onclickValue.match(/toggleTableExpand\(['"]([^'"]+)['"]\)/);
                if (match && match[1]) {
                    targetId = match[1];
                }
            }
            
            if (targetId) {
                toggleTableExpand(targetId);
            }
        });
    });

    // Also initialize the tables that might be added dynamically later
    initializeHistoryTables();
});

/**
 * Initialize any history tables that might be added dynamically
 */
function initializeHistoryTables() {
    // Make sure all tables have the proper initial state
    document.querySelectorAll('.table-wrapper').forEach(wrapper => {
        if (!wrapper.classList.contains('collapsed') && !wrapper.classList.contains('expanded')) {
            wrapper.classList.add('collapsed');
        }
        
        // Update button text to match current state
        const wrapperId = wrapper.id;
        if (wrapperId) {
            const button = document.querySelector(`.expand-btn[data-target="#${wrapperId}"], .expand-btn[onclick*="${wrapperId}"]`);
            if (button) {
                const isExpanded = wrapper.classList.contains('expanded');
                button.innerHTML = isExpanded ? '折りたたむ &#x2C4;' : '展開 &#x2C5;';
                button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
            }
        }
        
        // Check if overflow indicators are needed
        checkTableOverflow(wrapper);
    });
}

/**
 * Check if table has more content than its visible area
 * @param {HTMLElement} wrapper - Table wrapper element
 */
function checkTableOverflow(wrapper) {
    if (wrapper.scrollHeight > wrapper.clientHeight + 10) { // Adding a small buffer
        wrapper.classList.add('has-more-content');
    } else {
        wrapper.classList.remove('has-more-content');
    }
}

/**
 * Toggle expansion state of history tables
 * @param {string} wrapperId - ID of the table wrapper to toggle
 */
function toggleTableExpand(wrapperId) {
    // Support both with and without # prefix
    const id = wrapperId.startsWith('#') ? wrapperId.substring(1) : wrapperId;
    const wrapper = document.getElementById(id);
    if (!wrapper) return;
    
    const isCollapsed = wrapper.classList.contains('collapsed');
    // Look for button with either data-target attribute or onclick attribute
    const button = document.querySelector(`.expand-btn[data-target="#${id}"], .expand-btn[onclick*="${id}"]`);
    
    if (isCollapsed) {
        wrapper.classList.remove('collapsed');
        wrapper.classList.add('expanded');
        if (button) {
            button.innerHTML = '折りたたむ &#x2C4;';  // "Collapse" in Japanese
            button.setAttribute('aria-expanded', 'true');
        }
    } else {
        wrapper.classList.remove('expanded');
        wrapper.classList.add('collapsed');
        if (button) {
            button.innerHTML = '展開 &#x2C5;';  // "Expand" in Japanese
            button.setAttribute('aria-expanded', 'false');
        }
        
        // Scroll back to top of table when collapsing
        if (wrapper) {
            wrapper.scrollTop = 0;
        }
    }
    
    // Check overflow after expansion/collapse
    setTimeout(() => checkTableOverflow(wrapper), 300);
}

/**
 * Refresh sensor data 
 * @param {string} sensorId - ID of the sensor to refresh
 */
function refreshData(sensorId) {
    const refreshButton = document.querySelector(`button[onclick="refreshData('${sensorId}')"]`);
    if (refreshButton) {
        refreshButton.classList.add('rotating');
    }
    
    // Simulate data refresh
    fetch(`/api/sensors/${sensorId}/data`)
        .then(response => response.json())
        .then(data => {
            // Update the table with new data (implementation would depend on your API response)
            console.log(`Refreshed data for sensor ${sensorId}`);
            
            // Stop rotation animation
            if (refreshButton) {
                setTimeout(() => {
                    refreshButton.classList.remove('rotating');
                }, 1000);
            }
        })
        .catch(error => {
            console.error('Error refreshing data:', error);
            if (refreshButton) {
                refreshButton.classList.remove('rotating');
            }
        });
}