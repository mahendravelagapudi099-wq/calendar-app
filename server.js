/**
 * TaskSync Calendar - Server
 * Full-stack application to create tasks in Google Calendar
 */

require('dotenv').config();
const express = require('express');
const session = require('express-session');
const { google } = require('googleapis');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true in production with HTTPS
}));

// Google OAuth2 Configuration
const REDIRECT_URI = process.env.REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`;

const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    REDIRECT_URI
);

// Google Calendar API
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Google OAuth2 API for user info
const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });

// ============================================
// ROUTES
// ============================================

/**
 * GET /auth/google
 * Redirect user to Google OAuth consent screen
 */
app.get('/auth/google', (req, res) => {
    const scopes = [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const authorizationUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent',
        include_granted_scopes: true
    });

    res.redirect(authorizationUrl);
});

/**
 * GET /auth/google/callback
 * Handle OAuth callback, exchange code for tokens
 */
app.get('/auth/google/callback', async (req, res) => {
    try {
        const { code } = req.query;

        if (!code) {
            return res.status(400).send('Authorization code not received');
        }

        // Exchange authorization code for tokens
        const { tokens } = await oauth2Client.getToken(code);

        // Set credentials to get user info
        oauth2Client.setCredentials(tokens);

        // Get user email
        const userInfo = await oauth2.userinfo.get();
        const email = userInfo.data.email;

        // Initialize tokens storage in session if not exists
        if (!req.session.tokens) {
            req.session.tokens = {};
        }

        // Store tokens indexed by email
        req.session.tokens[email] = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            expiry_date: tokens.expiry_date,
            scope: tokens.scope,
            token_type: tokens.token_type
        };

        // Set default email
        req.session.defaultEmail = email;

        // Redirect back to home page
        res.redirect('/');

    } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send(`Authentication failed: ${error.message}`);
    }
});

/**
 * GET /auth/status
 * Check authentication status
 */
app.get('/auth/status', (req, res) => {
    const isAuthenticated = !!(req.session.tokens && req.session.defaultEmail);
    res.json({
        authenticated: isAuthenticated,
        defaultEmail: req.session.defaultEmail || null,
        availableEmails: req.session.tokens ? Object.keys(req.session.tokens) : []
    });
});

/**
 * POST /create-event
 * Create a Google Calendar event
 */
app.post('/create-event', async (req, res) => {
    try {
        const {
            title,
            subheading,
            description,
            reason,
            date,
            startTime,
            endTime,
            emailOption,
            customEmail
        } = req.body;

        // ============================================
        // VALIDATION
        // ============================================

        // Validate title
        if (!title || title.trim() === '') {
            return res.status(400).json({
                success: false,
                error: 'Task title is required'
            });
        }

        // Validate date
        if (!date) {
            return res.status(400).json({
                success: false,
                error: 'Event date is required'
            });
        }

        // Validate times
        if (!startTime || !endTime) {
            return res.status(400).json({
                success: false,
                error: 'Start time and end time are required'
            });
        }

        // Combine date and time into ISO format
        const startDateTime = new Date(`${date}T${startTime}`);
        const endDateTime = new Date(`${date}T${endTime}`);

        // Check if dates are valid
        if (isNaN(startDateTime.getTime()) || isNaN(endDateTime.getTime())) {
            return res.status(400).json({
                success: false,
                error: 'Invalid date or time format'
            });
        }

        // Validate end time > start time
        if (endDateTime <= startDateTime) {
            return res.status(400).json({
                success: false,
                error: 'End time must be after start time'
            });
        }

        // ============================================
        // DETERMINE EMAIL AND GET TOKENS
        // ============================================

        let targetEmail;

        if (emailOption === 'default') {
            // Use default email from session
            if (!req.session.defaultEmail) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated. Please login with Google first.',
                    requiresAuth: true
                });
            }
            targetEmail = req.session.defaultEmail;
        } else {
            // Use custom email
            if (!customEmail || customEmail.trim() === '') {
                return res.status(400).json({
                    success: false,
                    error: 'Please enter an email address'
                });
            }
            targetEmail = customEmail.trim();
        }

        // Check if we have tokens for this email
        if (!req.session.tokens || !req.session.tokens[targetEmail]) {
            return res.status(401).json({
                success: false,
                error: `Not authorized for ${targetEmail}. Please login with Google.`,
                requiresAuth: true,
                email: targetEmail
            });
        }

        // ============================================
        // SETUP OAUTH CLIENT WITH TOKENS
        // ============================================

        const userTokens = req.session.tokens[targetEmail];

        // Set credentials
        oauth2Client.setCredentials({
            access_token: userTokens.access_token,
            refresh_token: userTokens.refresh_token,
            expiry_date: userTokens.expiry_date
        });

        // Check if token needs refresh
        if (userTokens.expiry_date && Date.now() >= userTokens.expiry_date) {
            try {
                const { credentials } = await oauth2Client.refreshAccessToken();

                // Update stored tokens
                req.session.tokens[targetEmail] = {
                    access_token: credentials.access_token,
                    refresh_token: credentials.refresh_token || userTokens.refresh_token,
                    expiry_date: credentials.expiry_date,
                    scope: credentials.scope,
                    token_type: credentials.token_type
                };

                oauth2Client.setCredentials(credentials);
            } catch (refreshError) {
                console.error('Token refresh error:', refreshError);
                return res.status(401).json({
                    success: false,
                    error: 'Session expired. Please login again.',
                    requiresAuth: true
                });
            }
        }

        // ============================================
        // CALCULATE DURATION
        // ============================================

        const durationMs = endDateTime - startDateTime;
        const durationHours = (durationMs / (1000 * 60 * 60)).toFixed(1);

        // ============================================
        // CREATE EVENT DESCRIPTION
        // ============================================

        let eventDescription = '';
        if (subheading) {
            eventDescription += `Subheading: ${subheading}\n\n`;
        }
        if (description) {
            eventDescription += `Description: ${description}\n\n`;
        }
        if (reason) {
            eventDescription += `Reason: ${reason}\n\n`;
        }
        eventDescription += `Timeline: ${durationHours} hours`;

        // ============================================
        // CREATE CALENDAR EVENT
        // ============================================

        const event = {
            summary: title,
            description: eventDescription,
            start: {
                dateTime: startDateTime.toISOString(),
                timeZone: 'Asia/Kolkata'
            },
            end: {
                dateTime: endDateTime.toISOString(),
                timeZone: 'Asia/Kolkata'
            }
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            auth: oauth2Client
        });

        // ============================================
        // RETURN SUCCESS
        // ============================================

        res.json({
            success: true,
            message: 'Event created successfully',
            eventId: response.data.id,
            eventLink: response.data.htmlLink,
            email: targetEmail
        });

    } catch (error) {
        console.error('Create event error:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to create calendar event'
        });
    }
});

/**
 * GET /logout
 * Clear session and logout
 */
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// Start server
app.listen(PORT, () => {
    console.log(`============================================`);
    console.log(`  TaskSync Calendar Server`);
    console.log(`============================================`);
    console.log(`Server running on port ${PORT}`);
    console.log(`\nRedirect URI: ${REDIRECT_URI}`);
    console.log(`\nMake sure to:`);
    console.log(`1. Set up your .env file with Google credentials`);
    console.log(`2. Add ${REDIRECT_URI} to your Google Cloud Console redirect URIs`);
    console.log(`============================================`);
});
