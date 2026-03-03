/**
 * TaskSync Calendar - Dark Dashboard Frontend Logic
 * Handles form submission, validation, and API communication
 */

// ============================================
// DOM Elements
// ============================================
const taskForm = document.getElementById('taskForm');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');
const syncStatus = document.getElementById('syncStatus');
const notConnectedStatus = document.getElementById('notConnectedStatus');
const calendarCard = document.getElementById('calendarCard');
const calendarCheck = document.getElementById('calendarCheck');
const defaultEmailOption = document.getElementById('defaultEmailOption');
const customEmailOption = document.getElementById('customEmailOption');
const defaultAccountLabel = document.getElementById('defaultAccountLabel');
const customEmailContainer = document.getElementById('customEmailContainer');
const customEmailInput = document.getElementById('customEmail');
const submitBtn = document.getElementById('submitBtn');
const autoSyncIcon = document.getElementById('autoSyncIcon');
const autoSyncText = document.getElementById('autoSyncText');
const recentHistory = document.getElementById('recentHistory');
const taskCount = document.getElementById('taskCount');
const quotaBar = document.getElementById('quotaBar');
const smartSuggestions = document.getElementById('smartSuggestions');

// ============================================
// State
// ============================================
let isAuthenticated = false;
let defaultEmail = null;
let taskHistory = [];

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

/**
 * Initialize the application
 */
async function initializeApp() {
    // Set default start time to tomorrow at 9 AM, end time to 10 AM
    const startDateTimeInput = document.getElementById('startDateTime');
    const endDateTimeInput = document.getElementById('endDateTime');
    if (startDateTimeInput && endDateTimeInput) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        startDateTimeInput.value = formatDateTimeLocal(tomorrow);

        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setHours(10, 0, 0, 0);
        endDateTimeInput.value = formatDateTimeLocal(tomorrowEnd);
    }

    // Check authentication status
    await checkAuthStatus();

    // Load task history from localStorage
    loadTaskHistory();

    // Setup event listeners
    setupEventListeners();

    // Check for pending form data (returned from OAuth)
    restorePendingFormData();
}

/**
 * Format date for datetime-local input
 */
function formatDateTimeLocal(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
    // Form submission
    taskForm.addEventListener('submit', handleFormSubmit);

    // Email option toggle
    defaultEmailOption.addEventListener('change', toggleEmailOption);
    customEmailOption.addEventListener('change', toggleEmailOption);
}

/**
 * Check authentication status from server
 */
async function checkAuthStatus() {
    try {
        const response = await fetch('/auth/status');
        const data = await response.json();

        isAuthenticated = data.authenticated;
        defaultEmail = data.defaultEmail;

        updateAuthUI();
    } catch (error) {
        console.error('Failed to check auth status:', error);
        showNotification('error', 'Connection Error', 'Failed to check authentication status');
    }
}

/**
 * Update UI based on authentication status
 */
function updateAuthUI() {
    if (isAuthenticated && defaultEmail) {
        // User is authenticated
        userAvatar.textContent = getInitials(defaultEmail);
        userName.textContent = getDisplayName(defaultEmail);
        userEmail.textContent = defaultEmail;

        signInBtn.classList.add('hidden');
        signOutBtn.classList.remove('hidden');

        syncStatus.classList.remove('hidden');
        syncStatus.classList.add('flex');
        notConnectedStatus.classList.add('hidden');
        notConnectedStatus.classList.remove('flex');

        calendarCard.classList.remove('opacity-50');
        calendarCheck.classList.remove('hidden');

        defaultAccountLabel.textContent = 'Default Account';
        defaultEmailOption.disabled = false;

        autoSyncIcon.textContent = 'cloud_done';
        autoSyncIcon.classList.remove('text-red-400');
        autoSyncIcon.classList.add('text-emerald-400');
        autoSyncText.textContent = 'Auto-sync enabled';

        // Update smart suggestions
        smartSuggestions.innerHTML = `
            <div class="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <span class="material-symbols-outlined text-7xl">lightbulb</span>
            </div>
            <h3 class="font-semibold text-[var(--accent-purple)] mb-2 flex items-center gap-2">
                <span class="material-symbols-outlined text-sm">auto_awesome</span>
                Connected
            </h3>
            <p class="text-sm text-[var(--text-muted)] leading-relaxed">
                Your Google Calendar is connected. Tasks will sync automatically to <span class="text-[var(--accent-cyan)] font-medium">${escapeHtml(defaultEmail)}</span>.
            </p>
        `;
    } else {
        // User is not authenticated
        userAvatar.textContent = 'G';
        userName.textContent = 'Guest User';
        userEmail.textContent = 'Not logged in';

        signInBtn.classList.remove('hidden');
        signOutBtn.classList.add('hidden');

        syncStatus.classList.add('hidden');
        syncStatus.classList.remove('flex');
        notConnectedStatus.classList.remove('hidden');
        notConnectedStatus.classList.add('flex');

        calendarCard.classList.add('opacity-50');
        calendarCheck.classList.add('hidden');

        defaultAccountLabel.textContent = 'Default (Sign in required)';
        defaultEmailOption.disabled = true;
        customEmailOption.checked = true;
        customEmailContainer.classList.remove('hidden');

        autoSyncIcon.textContent = 'cloud_off';
        autoSyncIcon.classList.add('text-red-400');
        autoSyncIcon.classList.remove('text-emerald-400');
        autoSyncText.textContent = 'Auto-sync disabled - Sign in required';
    }
}

/**
 * Toggle between default and custom email options
 */
function toggleEmailOption() {
    if (customEmailOption.checked) {
        customEmailContainer.classList.remove('hidden');
        setTimeout(() => customEmailInput.focus(), 100);
    } else {
        customEmailContainer.classList.add('hidden');
    }
}

/**
 * Handle form submission
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    // Get form data
    const formData = new FormData(taskForm);
    const data = Object.fromEntries(formData.entries());

    // Process datetime-local inputs into date, start time and end time
    if (data.startDateTime && data.endDateTime) {
        const startDate = new Date(data.startDateTime);
        const endDate = new Date(data.endDateTime);

        // Use the start date as the event date
        data.date = startDate.toISOString().split('T')[0];

        // Extract start time
        const startHours = String(startDate.getHours()).padStart(2, '0');
        const startMinutes = String(startDate.getMinutes()).padStart(2, '0');
        data.startTime = `${startHours}:${startMinutes}`;

        // Extract end time
        const endHours = String(endDate.getHours()).padStart(2, '0');
        const endMinutes = String(endDate.getMinutes()).padStart(2, '0');
        data.endTime = `${endHours}:${endMinutes}`;
    }

    // Validate form
    const validationError = validateForm(data);
    if (validationError) {
        showNotification('error', 'Validation Error', validationError);
        return;
    }

    // Show loading state
    setLoading(true);

    try {
        const response = await fetch('/create-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            // Success
            showNotification('success', 'Task Synced!', `"${data.title}" added to your calendar`);

            // Add to history
            addToHistory(data.title, result.email || defaultEmail, result.eventLink);

            // Reset form
            resetForm();

        } else if (result.requiresAuth) {
            // Need authentication for custom email
            showNotification('warning', 'Authorization Required', `Please sign in with ${result.email || data.customEmail}`);

            // Store form data and redirect to auth
            sessionStorage.setItem('pendingFormData', JSON.stringify(data));
            window.location.href = '/auth/google';

        } else {
            // Other error
            showNotification('error', 'Sync Failed', result.error || 'Failed to create calendar event');
        }

    } catch (error) {
        console.error('Form submission error:', error);
        showNotification('error', 'Network Error', 'Please check your connection and try again');
    } finally {
        setLoading(false);
    }
}

/**
 * Validate form data
 */
function validateForm(data) {
    // Title validation
    if (!data.title || data.title.trim() === '') {
        return 'Please enter a task title';
    }

    // Start and end datetime validation
    if (!data.startDateTime || !data.endDateTime) {
        return 'Please select both start and end date/time';
    }

    const startDate = new Date(data.startDateTime);
    const endDate = new Date(data.endDateTime);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return 'Invalid date/time format';
    }

    if (startDate >= endDate) {
        return 'End time must be after start time';
    }

    if (endDate <= new Date()) {
        return 'End time must be in the future';
    }

    // Custom email validation
    if (data.emailOption === 'custom') {
        if (!data.customEmail || data.customEmail.trim() === '') {
            return 'Please enter an email address';
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.customEmail)) {
            return 'Please enter a valid email address';
        }
    } else if (data.emailOption === 'default' && !isAuthenticated) {
        return 'Please sign in with Google first';
    }

    return null;
}

/**
 * Add task to history
 */
function addToHistory(title, email, eventLink) {
    const task = {
        title: title,
        email: email,
        eventLink: eventLink,
        time: new Date().toISOString()
    };

    taskHistory.unshift(task);
    if (taskHistory.length > 5) {
        taskHistory = taskHistory.slice(0, 5);
    }

    localStorage.setItem('taskHistory', JSON.stringify(taskHistory));
    renderHistory();
    updateTaskCount();
}

/**
 * Load task history from localStorage
 */
function loadTaskHistory() {
    const saved = localStorage.getItem('taskHistory');
    if (saved) {
        taskHistory = JSON.parse(saved);
        renderHistory();
        updateTaskCount();
    }
}

/**
 * Render history list
 */
function renderHistory() {
    if (taskHistory.length === 0) {
        recentHistory.innerHTML = '<p class="text-xs text-[var(--text-muted)] text-center py-4">No recent tasks</p>';
        return;
    }

    const colors = ['bg-[var(--accent-purple)]', 'bg-emerald-400', 'bg-orange-400'];

    recentHistory.innerHTML = taskHistory.map((task, index) => {
        const timeAgo = getTimeAgo(task.time);
        const color = colors[index % colors.length];
        const hasLink = task.eventLink && task.eventLink.length > 0;

        if (hasLink) {
            return `
                <a href="${escapeHtml(task.eventLink)}" target="_blank" 
                   class="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/5 hover:bg-white/5 hover:border-white/10 transition-all cursor-pointer group">
                    <div class="w-2 h-2 rounded-full ${color}"></div>
                    <div class="flex-grow min-w-0">
                        <p class="text-xs font-medium truncate group-hover:text-[var(--accent-cyan)] transition-colors">${escapeHtml(task.title)}</p>
                        <p class="text-[10px] text-[var(--text-muted)]">${timeAgo}</p>
                    </div>
                    <span class="material-symbols-outlined text-[var(--text-muted)] group-hover:text-[var(--accent-cyan)] text-xs transition-colors">open_in_new</span>
                </a>
            `;
        } else {
            return `
                <div class="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/5">
                    <div class="w-2 h-2 rounded-full ${color}"></div>
                    <div class="flex-grow min-w-0">
                        <p class="text-xs font-medium truncate">${escapeHtml(task.title)}</p>
                        <p class="text-[10px] text-[var(--text-muted)]">${timeAgo}</p>
                    </div>
                    <span class="material-symbols-outlined text-[var(--text-muted)] text-xs">open_in_new</span>
                </div>
            `;
        }
    }).join('');
}

/**
 * Update task count and quota bar
 */
function updateTaskCount() {
    const count = taskHistory.length;
    taskCount.textContent = count;
    const percentage = Math.min(count * 10, 100);
    quotaBar.style.width = `${percentage}%`;
}

/**
 * Get time ago string
 */
function getTimeAgo(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

/**
 * Reset form after successful submission
 */
function resetForm() {
    const startDateTimeInput = document.getElementById('startDateTime');
    const endDateTimeInput = document.getElementById('endDateTime');

    taskForm.reset();

    // Reset start time to tomorrow 9 AM, end time to 10 AM
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    startDateTimeInput.value = formatDateTimeLocal(tomorrow);

    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(10, 0, 0, 0);
    endDateTimeInput.value = formatDateTimeLocal(tomorrowEnd);

    // Reset email option
    if (isAuthenticated) {
        defaultEmailOption.checked = true;
        customEmailContainer.classList.add('hidden');
    } else {
        customEmailOption.checked = true;
        customEmailContainer.classList.remove('hidden');
    }

    // Focus on title
    document.getElementById('title').focus();
}

/**
 * Show notification
 */
function showNotification(type, title, message) {
    const notification = document.getElementById('notification');
    const notifIcon = document.getElementById('notifIcon');
    const notifTitle = document.getElementById('notifTitle');
    const notifMessage = document.getElementById('notifMessage');

    // Set content
    notifTitle.textContent = title;
    notifMessage.textContent = message;

    // Set icon and colors based on type
    switch (type) {
        case 'success':
            notifIcon.textContent = 'check_circle';
            notifIcon.className = 'material-symbols-outlined text-2xl text-emerald-400';
            break;
        case 'error':
            notifIcon.textContent = 'error';
            notifIcon.className = 'material-symbols-outlined text-2xl text-red-400';
            break;
        case 'warning':
            notifIcon.textContent = 'warning';
            notifIcon.className = 'material-symbols-outlined text-2xl text-orange-400';
            break;
        default:
            notifIcon.textContent = 'info';
            notifIcon.className = 'material-symbols-outlined text-2xl text-[var(--accent-cyan)]';
    }

    // Show notification
    notification.classList.remove('hidden');
    setTimeout(() => {
        notification.classList.remove('translate-x-full');
    }, 10);

    // Auto-hide after 5 seconds
    setTimeout(() => {
        hideNotification();
    }, 5000);
}

/**
 * Hide notification
 */
function hideNotification() {
    const notification = document.getElementById('notification');
    notification.classList.add('translate-x-full');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 300);
}

/**
 * Set loading state
 */
function setLoading(loading) {
    if (loading) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `
            <span class="material-symbols-outlined text-lg animate-spin">sync</span>
            <span>Syncing...</span>
        `;
    } else {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
            <span class="material-symbols-outlined text-lg">bolt</span>
            <span>Sync Task</span>
        `;
    }
}

/**
 * Get initials from email
 */
function getInitials(email) {
    if (!email) return 'G';
    return email.charAt(0).toUpperCase();
}

/**
 * Get display name from email
 */
function getDisplayName(email) {
    if (!email) return 'Guest';
    const name = email.split('@')[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Restore pending form data after OAuth redirect
 */
function restorePendingFormData() {
    const pendingData = sessionStorage.getItem('pendingFormData');
    if (pendingData) {
        try {
            const data = JSON.parse(pendingData);

            // Restore form values
            document.getElementById('title').value = data.title || '';
            document.getElementById('reason').value = data.reason || '';
            document.getElementById('subheading').value = data.subheading || '';
            document.getElementById('description').value = data.description || '';

            if (data.startDateTime) {
                document.getElementById('startDateTime').value = data.startDateTime;
            }
            if (data.endDateTime) {
                document.getElementById('endDateTime').value = data.endDateTime;
            }

            // Restore priority
            if (data.priority) {
                document.querySelector(`input[name="priority"][value="${data.priority}"]`).checked = true;
            }

            // Restore email option
            if (data.emailOption === 'custom' && data.customEmail) {
                customEmailOption.checked = true;
                customEmailInput.value = data.customEmail;
                customEmailContainer.classList.remove('hidden');
            }

            // Clear pending data
            sessionStorage.removeItem('pendingFormData');

            // Show success message
            showNotification('success', 'Connected!', 'Your Google account is now linked');

        } catch (error) {
            console.error('Failed to restore form data:', error);
        }
    }
}

// Make functions available globally
window.resetForm = resetForm;
window.hideNotification = hideNotification;

/**
 * Show Help Modal
 */
function showHelp() {
    const modal = document.getElementById('helpModal');
    const content = document.getElementById('helpModalContent');
    modal.classList.remove('hidden');
    setTimeout(() => {
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
}

/**
 * Close Help Modal
 */
function closeHelp() {
    const modal = document.getElementById('helpModal');
    const content = document.getElementById('helpModalContent');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

// Close modal when clicking outside
window.onclick = function (event) {
    const modal = document.getElementById('helpModal');
    if (event.target === modal) {
        closeHelp();
    }
}

window.showHelp = showHelp;
window.closeHelp = closeHelp;
