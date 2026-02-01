# Microsoft Authentication (MSAL) Implementation Guide

This guide documents how to implement Microsoft Authentication Library (MSAL) in a Vue.js frontend application, based on the implementation in the RMS Frontend project.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Package Installation](#package-installation)
3. [Azure AD App Registration](#azure-ad-app-registration)
4. [MSAL Configuration](#msal-configuration)
5. [Authentication Bootstrap](#authentication-bootstrap)
6. [Login Component](#login-component)
7. [Authentication State Management](#authentication-state-management)
8. [API Calls with Bearer Tokens](#api-calls-with-bearer-tokens)
9. [Logout Implementation](#logout-implementation)
10. [Router Guards](#router-guards)
11. [Error Handling](#error-handling)
12. [Testing with Auth Bypass](#testing-with-auth-bypass)
13. [Security Considerations](#security-considerations)

---

## Prerequisites

- Vue 3 application (with Vite recommended)
- Azure Active Directory tenant access
- Backend API with `/microsoft-login` and `/validate-token` endpoints

---

## Package Installation

```bash
npm install @azure/msal-browser
```

**Recommended version:** `^4.13.2` or later

---

## Azure AD App Registration

Before implementing MSAL, you need to register your application in Azure AD:

1. Go to [Azure Portal](https://portal.azure.com) > Azure Active Directory > App Registrations
2. Click "New Registration"
3. Configure:
   - **Name:** Your application name
   - **Supported account types:** Single tenant (for internal org apps)
   - **Redirect URI:** `http://localhost:5173` (dev) and your production URL
4. Note down:
   - **Application (client) ID** - Used as `clientId`
   - **Directory (tenant) ID** - Used in `authority` URL

### Required API Permissions

Add the following permissions in Azure Portal:
- `User.Read` (Microsoft Graph) - Delegated permission

---

## MSAL Configuration

Create a dedicated MSAL configuration file:

**`src/msal.js`**

```javascript
import { PublicClientApplication, LogLevel } from "@azure/msal-browser";

// MSAL configuration object
export const msalConfig = {
  auth: {
    // Replace with your Azure AD Application (client) ID
    clientId: "YOUR_CLIENT_ID_HERE",

    // Replace with your Azure AD Tenant ID
    // Format: https://login.microsoftonline.com/{TENANT_ID}
    authority: "https://login.microsoftonline.com/YOUR_TENANT_ID_HERE",

    // Redirect URI - uses current origin for flexibility
    redirectUri: window.location.origin,

    // Don't navigate to the original URL after login
    navigateToLoginRequestUrl: false,
  },
  cache: {
    // Use localStorage for persistent sessions across tabs
    cacheLocation: "localStorage",

    // Enable cookies for better cross-browser compatibility
    storeAuthStateInCookie: true,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) return; // Don't log PII

        switch (level) {
          case LogLevel.Error:
            console.error(message);
            break;
          case LogLevel.Warning:
            console.warn(message);
            break;
          case LogLevel.Info:
            console.info(message);
            break;
          case LogLevel.Verbose:
            console.debug(message);
            break;
        }
      },
      logLevel: LogLevel.Warning,
    },
  },
};

// Create and configure the MSAL instance
export const msalInstance = new PublicClientApplication({
  ...msalConfig,
  auth: {
    ...msalConfig.auth,
    // iOS/Safari compatibility - increase redirect timeout
    redirectNavigationTimeout: 10_000,
  },
  cache: {
    ...msalConfig.cache,
    // Enable secure cookies (MSAL >= 3.7)
    secureCookies: true,
  },
});

// Enable cross-tab account synchronization
msalInstance.enableAccountStorageEvents();

// Login request configuration
export const loginRequest = {
  // Scopes to request - User.Read for basic profile
  scopes: ["User.Read"],

  // Always show account picker (useful for multi-account users)
  prompt: "select_account",
};
```

### Configuration Values to Update

| Property | Description | Where to Find |
|----------|-------------|---------------|
| `clientId` | Azure AD Application ID | Azure Portal > App Registration > Overview |
| `authority` | Tenant-specific login URL | Azure Portal > Azure AD > Overview > Tenant ID |

---

## Authentication Bootstrap

Handle the Microsoft redirect callback and token exchange in your main entry file:

**`src/main.js`**

```javascript
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";

import { msalInstance } from "./msal";
import { API_BASE_URL } from "./config/url";

/**
 * Store authentication tokens and user info
 */
const storeAuthArtifacts = (payload, reason) => {
  localStorage.setItem("access_token", payload.access_token);
  localStorage.setItem("user_info", JSON.stringify(payload.user));

  // Dispatch event for other components to react to
  window.dispatchEvent(
    new CustomEvent("auth-success", {
      detail: { reason },
    })
  );
};

/**
 * Clean up OAuth hash fragments from URL
 */
const clearMsalHashFragment = () => {
  if (window.location.hash.includes("code=")) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
};

/**
 * Handle the redirect callback from Microsoft authentication
 */
const handleMicrosoftRedirect = async () => {
  // Initialize MSAL instance
  await msalInstance.initialize();

  // Handle the redirect response (if any)
  const response = await msalInstance.handleRedirectPromise();

  // If no response or no account, user hasn't logged in yet
  if (!response?.account) return;

  try {
    // Step 1: Acquire Microsoft access token silently
    const tokenResponse = await msalInstance.acquireTokenSilent({
      account: response.account,
      scopes: ["User.Read"],
    });

    // Step 2: Exchange Microsoft token for your backend token
    const apiResponse = await fetch(`${API_BASE_URL}microsoft-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ microsoft_token: tokenResponse.accessToken }),
    });

    if (!apiResponse.ok) {
      throw new Error(`Microsoft login failed (${apiResponse.status})`);
    }

    const data = await apiResponse.json();
    if (!data.success) {
      throw new Error(data.detail ?? "Microsoft login was rejected");
    }

    // Step 3: Store backend tokens
    storeAuthArtifacts(data, "Microsoft login successful");

  } finally {
    // Always clean up hash fragments
    clearMsalHashFragment();
  }
};

// Bootstrap the application
(async () => {
  try {
    await handleMicrosoftRedirect();
  } catch (err) {
    console.error("Authentication bootstrap failed:", err);
    alert(`Login failed: ${err.message ?? err}`);
  }

  // Mount Vue app after auth processing
  const app = createApp(App);
  app.use(router);
  app.mount("#app");
})();
```

---

## Login Component

Create a login component that triggers the Microsoft authentication flow:

**`src/components/Login.vue`**

```vue
<template>
  <div class="login-container">
    <div class="login-card">
      <h1>Welcome</h1>
      <p>Sign in with your organization account</p>

      <button
        class="microsoft-login-btn"
        @click="handleMicrosoftLogin"
        :disabled="isLoading"
      >
        <img
          src="/microsoft-logo.svg"
          alt="Microsoft"
          class="microsoft-logo"
        />
        {{ isLoading ? 'Signing in...' : 'Sign in with Microsoft' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { msalInstance, loginRequest } from '../msal';

const isLoading = ref(false);

const handleMicrosoftLogin = async () => {
  try {
    isLoading.value = true;

    // Ensure MSAL is initialized
    await msalInstance.initialize();

    console.log('Starting Microsoft OAuth login with redirect...');

    // Trigger redirect to Microsoft login page
    await msalInstance.loginRedirect(loginRequest);

  } catch (error) {
    console.error('Microsoft OAuth error:', error);
    alert(`Microsoft login failed: ${error.message || 'Unknown error'}`);
  } finally {
    isLoading.value = false;
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.login-card {
  background: white;
  padding: 2rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  text-align: center;
  max-width: 400px;
  width: 100%;
}

.microsoft-login-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  padding: 12px 24px;
  border: 1px solid #8c8c8c;
  background: white;
  border-radius: 4px;
  font-size: 15px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.microsoft-login-btn:hover:not(:disabled) {
  background-color: #f5f5f5;
}

.microsoft-login-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.microsoft-logo {
  width: 21px;
  height: 21px;
}
</style>
```

---

## Authentication State Management

Manage authentication state in your root App component:

**`src/App.vue`**

```vue
<template>
  <!-- Loading state -->
  <div v-if="isLoading" class="loading-container">
    <div class="spinner"></div>
    <p>Loading...</p>
  </div>

  <!-- Not logged in - show login -->
  <Login v-else-if="!isLoggedIn" />

  <!-- Logged in - show app content -->
  <template v-else>
    <SideBar />
    <RouterView />
  </template>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import Login from './components/Login.vue';
import SideBar from './components/SideBar.vue';
import { API_BASE_URL } from './config/url';

const isLoading = ref(true);
const isLoggedIn = ref(false);

/**
 * Validate the stored access token with the backend
 */
const validateToken = async () => {
  try {
    const token = localStorage.getItem('access_token');

    if (!token) {
      isLoggedIn.value = false;
      return false;
    }

    const response = await fetch(`${API_BASE_URL}validate-token`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      // Token is invalid - clear it
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_info');
      isLoggedIn.value = false;
      return false;
    }

    return true;

  } catch (error) {
    console.error('Token validation error:', error);
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_info');
    isLoggedIn.value = false;
    return false;
  }
};

/**
 * Check if user is logged in
 */
const checkLoginStatus = async () => {
  try {
    const isValid = await validateToken();
    isLoggedIn.value = isValid;
  } finally {
    isLoading.value = false;
  }
};

// Listen for auth-success event from bootstrap
window.addEventListener('auth-success', async () => {
  await checkLoginStatus();
});

onMounted(() => {
  checkLoginStatus();
});
</script>
```

---

## API Calls with Bearer Tokens

Create a utility for making authenticated API calls:

**`src/utils/apiUtils.js`**

```javascript
import { API_BASE_URL } from '../config/url';

/**
 * Get the stored authentication token
 * @throws {Error} If user is not authenticated
 */
const getAuthToken = () => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    throw new Error('User not authenticated');
  }
  return token;
};

/**
 * Make an authenticated API request
 * @param {string} endpoint - API endpoint (relative to base URL)
 * @param {Object} options - Fetch options
 * @returns {Promise<any>} Response data
 */
export const fetchApi = async (endpoint, options = {}) => {
  const token = getAuthToken();
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // Handle 401 Unauthorized
  if (response.status === 401) {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_info');
    window.location.reload();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errorMessage = await response.text();
    throw new Error(`API Error: ${errorMessage}`);
  }

  return response.json();
};

/**
 * GET request helper
 */
export const getData = async (endpoint, options = {}) => {
  return fetchApi(endpoint, { ...options, method: 'GET' });
};

/**
 * POST request helper
 */
export const postData = async (endpoint, data, options = {}) => {
  return fetchApi(endpoint, {
    ...options,
    method: 'POST',
    body: data
  });
};

/**
 * PUT request helper
 */
export const putData = async (endpoint, data, options = {}) => {
  return fetchApi(endpoint, {
    ...options,
    method: 'PUT',
    body: data
  });
};

/**
 * DELETE request helper
 */
export const deleteData = async (endpoint, options = {}) => {
  return fetchApi(endpoint, { ...options, method: 'DELETE' });
};
```

### Usage in Components

```vue
<script setup>
import { ref, onMounted } from 'vue';
import { getData, postData } from '../utils/apiUtils';

const users = ref([]);

onMounted(async () => {
  try {
    users.value = await getData('users');
  } catch (error) {
    console.error('Failed to fetch users:', error);
  }
});

const createUser = async (userData) => {
  try {
    const newUser = await postData('users', userData);
    users.value.push(newUser);
  } catch (error) {
    console.error('Failed to create user:', error);
  }
};
</script>
```

---

## Logout Implementation

Implement logout in your sidebar or header component:

**`src/components/SideBar.vue`** (relevant section)

```vue
<template>
  <!-- ... other sidebar content ... -->

  <button @click="logout" class="logout-btn">
    Logout
  </button>
</template>

<script setup>
const logout = () => {
  // Clear stored tokens
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_info');

  // Optional: Show confirmation
  alert('You have been logged out.');

  // Reload to reset app state
  window.location.reload();
};
</script>
```

### Complete MSAL Logout (Optional)

If you want to also sign out from Microsoft:

```javascript
import { msalInstance } from '../msal';

const logout = async () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_info');

  // Sign out from Microsoft as well
  await msalInstance.logoutRedirect({
    postLogoutRedirectUri: window.location.origin
  });
};
```

---

## Router Guards

Clean up OAuth hash fragments in router:

**`src/router/index.js`**

```javascript
import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  // ... your routes
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// Global navigation guard
router.beforeEach((to, from, next) => {
  // Clear OAuth hash fragments from URL
  if (window.location.hash.includes('code=') ||
      window.location.hash.includes('state=')) {
    window.history.replaceState(
      {},
      document.title,
      window.location.pathname + window.location.search
    );
  }

  next();
});

export default router;
```

---

## Error Handling

### Common Error Scenarios

1. **Token Expired (401)**
```javascript
if (response.status === 401) {
  localStorage.removeItem('access_token');
  localStorage.removeItem('user_info');
  isLoggedIn.value = false;
  window.location.reload();
}
```

2. **MSAL Initialization Error**
```javascript
try {
  await msalInstance.initialize();
} catch (error) {
  console.error('MSAL initialization failed:', error);
  alert('Authentication service unavailable. Please try again.');
}
```

3. **Network Errors**
```javascript
try {
  await msalInstance.loginRedirect(loginRequest);
} catch (error) {
  if (error.errorCode === 'network_error') {
    alert('Network error. Please check your connection.');
  } else {
    alert(`Login failed: ${error.message}`);
  }
}
```

---

## Testing with Auth Bypass

For development/testing, implement an auth bypass mode:

**`src/config/auth.js`**

```javascript
const normalizeBoolean = (value, defaultValue = "false") => {
  const normalized = (value ?? defaultValue).toString().trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
};

export const AUTH_BYPASS_ENABLED = normalizeBoolean(
  import.meta.env.VITE_AUTH_BYPASS
);

export const AUTH_BYPASS_USERNAME =
  import.meta.env.VITE_AUTH_BYPASS_USERNAME || "test.user";

export const AUTH_BYPASS_REASON =
  import.meta.env.VITE_AUTH_BYPASS_REASON || "Login bypassed for testing";
```

**`.env.development`**

```env
VITE_AUTH_BYPASS=true
VITE_AUTH_BYPASS_USERNAME=test.user@company.com
VITE_AUTH_BYPASS_REASON=Development bypass
```

**Updated `src/main.js`** (add bypass handling)

```javascript
import { AUTH_BYPASS_ENABLED, AUTH_BYPASS_REASON } from "./config/auth";

const ensureBypassSession = async () => {
  if (localStorage.getItem("access_token")) {
    return; // Already have a token
  }

  const response = await fetch(`${API_BASE_URL}microsoft-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}), // Backend handles bypass mode
  });

  if (!response.ok) {
    throw new Error(`Bypass login failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.detail ?? "Bypass login was rejected");
  }

  storeAuthArtifacts(data, AUTH_BYPASS_REASON);
};

// Bootstrap
(async () => {
  try {
    if (AUTH_BYPASS_ENABLED) {
      await ensureBypassSession();
    } else {
      await handleMicrosoftRedirect();
    }
  } catch (err) {
    console.error("Authentication bootstrap failed:", err);
    alert(`Login failed: ${err.message ?? err}`);
  }

  const app = createApp(App);
  app.use(router);
  app.mount("#app");
})();
```

---

## Security Considerations

### 1. Token Storage

**Current approach:** localStorage
- Vulnerable to XSS attacks
- Persistent across browser sessions

**Recommended improvements:**
- Use HttpOnly cookies for token storage (requires backend changes)
- Implement Content Security Policy (CSP)
- Sanitize all user inputs to prevent XSS

### 2. Token Validation

- Validate tokens on app startup
- Handle 401 responses consistently across all API calls
- Implement token refresh before expiration

### 3. HTTPS Only

- Always use HTTPS in production
- Configure `secureCookies: true` in MSAL config

### 4. Environment Variables

Never commit sensitive values to version control:
```env
# .env.local (git-ignored)
VITE_API_BASE_URL=https://api.yourcompany.com/
```

### 5. Logout Completeness

For maximum security, implement full logout:
- Clear localStorage tokens
- Call backend logout endpoint (invalidate server session)
- Optionally sign out from Microsoft

---

## Backend API Requirements

Your backend needs these endpoints:

### POST `/microsoft-login`

**Request:**
```json
{
  "microsoft_token": "eyJ0eXAiOiJKV1QiLCJhbGci..."
}
```

**Response:**
```json
{
  "success": true,
  "access_token": "your-backend-jwt-token",
  "user": {
    "id": "user-id",
    "email": "user@company.com",
    "name": "User Name"
  }
}
```

### GET `/validate-token`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Response (200 OK):**
```json
{
  "valid": true,
  "user": { ... }
}
```

**Response (401 Unauthorized):**
```json
{
  "error": "Token expired or invalid"
}
```

---

## File Structure Summary

```
src/
├── msal.js                    # MSAL configuration & instance
├── main.js                    # App bootstrap with auth handling
├── App.vue                    # Root component with auth state
├── config/
│   ├── url.js                 # API base URLs
│   └── auth.js                # Auth bypass configuration
├── components/
│   ├── Login.vue              # Login UI component
│   └── SideBar.vue            # Contains logout
├── router/
│   └── index.js               # Router with guards
└── utils/
    └── apiUtils.js            # Authenticated API helpers
```

---

## Quick Start Checklist

- [ ] Install `@azure/msal-browser`
- [ ] Register app in Azure AD
- [ ] Create `src/msal.js` with your clientId and tenantId
- [ ] Update `src/main.js` with auth bootstrap
- [ ] Create Login component
- [ ] Update App.vue with auth state management
- [ ] Create API utilities with Bearer token injection
- [ ] Implement logout functionality
- [ ] Add router guards for URL cleanup
- [ ] Configure environment variables
- [ ] Test the complete flow

---

## Troubleshooting

### "AADSTS50011: The reply URL does not match"
- Ensure your redirect URI in Azure AD matches exactly (including trailing slashes)

### Token not persisting
- Check browser privacy settings (localStorage may be blocked)
- Verify `cacheLocation: "localStorage"` in config

### Infinite redirect loop
- Check `handleRedirectPromise()` is called before mounting the app
- Ensure `navigateToLoginRequestUrl: false` is set

### iOS/Safari issues
- Increase `redirectNavigationTimeout` (10000ms recommended)
- Enable `storeAuthStateInCookie: true`

---

*Generated from RMS Frontend implementation - January 2026*
